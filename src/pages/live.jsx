import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Hls from "hls.js";
import { createClient } from "@supabase/supabase-js";
import "../styles/live-stream.css";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://mzxfuaoihgzxvokwarao.supabase.co";
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16eGZ1YW9paGd6eHZva3dhcmFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MDg0NjIsImV4cCI6MjA4OTk4NDQ2Mn0.OFYCkBFXCSfLn-wG94OHHKL5CX8T_BLrbDGPiBdPIog";
const supabase = createClient(supabaseUrl, supabaseKey);

const API_BASE = "https://v5.jkt48connect.com/api/jkt48connect";
const API_KEY  = "JKTCONNECT";

// ── Harukaze API (sama seperti ProfilePage) ───────────────────────────────
const HARUKAZE_API = "https://v5.jkt48connect.com/api/harukaze";

const harukazeFetch = async (path, opts = {}) => {
  const res = await fetch(`${HARUKAZE_API}${path}`, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  return res.json();
};

// ── Partner API (jkt48connect Partner) ─────────────────────────────────────
// Signing HMAC dilakukan di Worker terpisah (partner-session-worker.js),
// bukan di sini, supaya secret tidak pernah ada di browser.
const PARTNER_SIGNER_BASE = import.meta.env.VITE_PARTNER_SIGNER_BASE || "https://ap.harukaze48.my.id";
const PARTNER_ORIGIN      = "https://harukaze48.my.id; // dipakai untuk playback_url & resume (browser -> partner langsung)

const ERROR_MESSAGES = {
  BAD_REQUEST: "Permintaan tidak lengkap atau formatnya salah.",
  SHOW_NOT_PURCHASED: "Show ini belum dibeli untuk akun kamu.",
  STALE_REQUEST: "Waktu server tidak sinkron, coba lagi.",
  REPLAY_DETECTED: "Permintaan ganda terdeteksi, coba lagi.",
  KEY_NOT_FOUND: "Kredensial partner tidak dikenali.",
  VIEW_QUOTA_EXCEEDED: "Kuota penonton sudah habis. Coba lagi nanti.",
  SIGNATURE_REJECTED: "Permintaan tidak sah atau kedaluwarsa, coba lagi.",
  ORIGIN_NOT_ALLOWED: "Domain ini belum terdaftar untuk mengakses stream.",
  SESSION_BINDING_MISMATCH: "Sesi ini sedang dipakai di perangkat lain.",
  PLAY_HEADER_REQUIRED: "Header pemutaran tidak terkirim.",
  PLAY_HEADER_INVALID: "Sesi pemutaran kedaluwarsa, menyegarkan ulang...",
  VARIANT_NOT_ALLOWED: "Resolusi ini tidak tersedia untuk paket kamu.",
  KEY_LOCKED: "Akses partner sedang dibekukan.",
  PARTNER_SUSPENDED: "Layanan streaming sedang tidak tersedia sementara.",
};
function errMsg(code, fallback) {
  return ERROR_MESSAGES[code] || fallback || "Terjadi kesalahan saat memuat stream.";
}

// ── Buat sesi penonton lewat Worker signer, lalu tukar playback_url langsung ke partner origin ──
async function createPartnerSession(showSlug, viewerId) {
  const res = await fetch(`${PARTNER_SIGNER_BASE}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ show_slug: showSlug, viewer_id: viewerId, ttl: 120 }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(errMsg(data.code, data.message));
  return data; // { playback_url, session_id, quota, max_resolution, ... }
}

async function exchangePlaybackUrl(playbackUrl) {
  const res = await fetch(playbackUrl, { credentials: "include" });
  const data = await res.json();
  if (!data.ok) throw new Error(errMsg(data.code, data.message));
  return data; // { playlist_url, play_header_name, play_header_value, max_resolution, expires_at }
}

async function resumePartnerSession() {
  const res = await fetch(`${PARTNER_ORIGIN}/api/partner/resume`, { credentials: "include" });
  const data = await res.json();
  return data; // { ok, resumed, counted, playlist_url, play_header_name, play_header_value }
}

// ══════════════════════════════════════════════════════════════════════════
//  HLS PLAYER — kini pakai X-Play-Key + credentials, dengan auto-resume
// ══════════════════════════════════════════════════════════════════════════
function HlsPlayer({ src, playHeaderName, playHeaderValue, title, onLevelInfo, onNeedResume }) {
  const videoRef = useRef(null);
  const hlsRef   = useRef(null);
  const retryRef = useRef(null);
  const resumeTriesRef = useRef(0);

  const destroyHls = useCallback(() => {
    if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    destroyHls();

    const makeConfig = (headerName, headerValue) => ({
      enableWorker: true, lowLatencyMode: false,
      maxBufferLength: 30, maxMaxBufferLength: 60, maxBufferSize: 60 * 1000 * 1000,
      backBufferLength: 30, liveSyncDurationCount: 3, liveMaxLatencyDurationCount: 10,
      liveDurationInfinity: true,
      fragLoadingTimeOut: 10000, fragLoadingMaxRetry: 6, fragLoadingRetryDelay: 1000, fragLoadingMaxRetryTimeout: 8000,
      manifestLoadingTimeOut: 10000, manifestLoadingMaxRetry: 4, manifestLoadingRetryDelay: 1000,
      levelLoadingTimeOut: 10000, levelLoadingMaxRetry: 4, levelLoadingRetryDelay: 1000,
      abrEwmaDefaultEstimate: 500_000, abrBandWidthFactor: 0.8, abrBandWidthUpFactor: 0.7,
      abrEwmaFastLive: 3.0, abrEwmaSlowLive: 9.0, nudgeOffset: 0.3, nudgeMaxRetry: 5,
      xhrSetup: (xhr) => {
        xhr.withCredentials = true;
        if (headerName && headerValue) xhr.setRequestHeader(headerName, headerValue);
      },
      fetchSetup: (context, initParams) => {
        initParams.credentials = "include";
        initParams.headers = { ...initParams.headers, ...(headerName && headerValue ? { [headerName]: headerValue } : {}) };
        return new Request(context.url, initParams);
      },
    });

    if (Hls.isSupported()) {
      const hls = new Hls(makeConfig(playHeaderName, playHeaderValue));
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        const lvl = hls.levels[data.level];
        if (lvl) {
          const bw = hls.bandwidthEstimate;
          onLevelInfo?.({
            name: lvl.name || `${lvl.height}p`,
            bandwidth: bw > 0 ? (bw >= 1_000_000 ? (bw / 1_000_000).toFixed(1) + " Mbps" : Math.round(bw / 1_000) + " Kbps") : "",
          });
        }
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        const status = data.response?.code;
        // Sesi ditolak (PLAY_HEADER_INVALID / expired) → minta resume, bukan retry biasa
        if (status === 401 || status === 403) {
          if (resumeTriesRef.current++ < 3) {
            onNeedResume?.();
          }
          return;
        }
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else {
          destroyHls();
          retryRef.current = setTimeout(() => {
            const v = videoRef.current;
            if (!v) return;
            const newHls = new Hls(makeConfig(playHeaderName, playHeaderValue));
            newHls.loadSource(src);
            newHls.attachMedia(v);
            newHls.on(Hls.Events.MANIFEST_PARSED, () => v.play().catch(() => {}));
            hlsRef.current = newHls;
          }, 2000);
        }
      });
    } else {
      // Native HLS (Safari) tidak didukung karena wajib header X-Play-Key
      onNeedResume?.("unsupported");
    }

    return destroyHls;
  }, [src, playHeaderName, playHeaderValue, destroyHls, onLevelInfo, onNeedResume]);

  return (
    <video
      ref={videoRef}
      controls
      autoPlay
      playsInline
      className="ls-video"
      title={title}
    />
  );
}

const getSession = () => {
  try {
    const d = JSON.parse(sessionStorage.getItem("userLogin") || localStorage.getItem("userLogin") || "null");
    if (d && d.isLoggedIn && d.token) return d;
    return null;
  } catch { return null; }
};

function LiveStream() {
  const { playbackId } = useParams(); // dipakai sebagai show_slug
  const navigate       = useNavigate();

  const [membershipChecked, setMembershipChecked] = useState(false);
  const [hasMonthlymember,  setHasMonthlyMember]  = useState(false);
  const [membershipLoading, setMembershipLoading] = useState(true);

  const [isVerified,        setIsVerified]        = useState(false);
  const [showVerification,  setShowVerification]  = useState(false);
  const [verificationCode,  setVerificationCode]  = useState("");
  const [verificationError, setVerificationError] = useState("");
  const [verifying,         setVerifying]         = useState(false);

  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState("");
  const [streamData,     setStreamData]     = useState(null);
  const [showInfo,       setShowInfo]       = useState(null);
  const [members,        setMembers]        = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const [hlsUrl,          setHlsUrl]          = useState("");
  const [playHeaderName,  setPlayHeaderName]  = useState("X-Play-Key");
  const [playHeaderValue, setPlayHeaderValue] = useState("");
  const [maxResolution,   setMaxResolution]   = useState(null);
  const [levelInfo,       setLevelInfo]       = useState({ name: "Auto", bandwidth: "" });

  const [idnLiveShow, setIdnLiveShow] = useState(null);

  const [chatMessages,    setChatMessages]    = useState([]);
  const [chatInput,       setChatInput]       = useState("");
  const [chatUser,        setChatUser]        = useState(null);
  const [isChatLoggingIn, setIsChatLoggingIn] = useState(true);
  const [chatOpenMobile,  setChatOpenMobile]  = useState(false);
  const chatEndRef  = useRef(null);
  const channelRef  = useRef(null);

  const resumeInFlight = useRef(false);

  // ── Membership check — sekarang lewat /harukaze/profile (Bearer) ─────────
  const checkMembership = useCallback(async () => {
    setMembershipLoading(true);
    const session = getSession();
    if (!session?.token) {
      setHasMonthlyMember(false); setMembershipChecked(true); setMembershipLoading(false);
      return false;
    }
    try {
      const data = await harukazeFetch("/profile", {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (data.status && data.data?.has_active_membership) {
        setHasMonthlyMember(true); setMembershipChecked(true); setMembershipLoading(false);
        return true;
      }
    } catch (e) { console.error("Error checking membership:", e); }
    setHasMonthlyMember(false); setMembershipChecked(true); setMembershipLoading(false);
    return false;
  }, []);

  // ── Access code verify/use — sesuai backend /access/verify & /access/use ─
  const verifyAccess = async () => {
    const code = verificationCode.trim();
    if (!code) { setVerificationError("Kode akses wajib diisi"); return; }
    setVerifying(true); setVerificationError("");
    try {
      const verifyRes = await harukazeFetch("/access/verify", {
        method: "POST",
        body: JSON.stringify({ code, show_code: playbackId }),
      });
      if (!verifyRes.status || !verifyRes.has_access) {
        setVerificationError(verifyRes.message || "Kode tidak memiliki akses valid untuk show ini");
        setVerifying(false); return;
      }
      const useRes = await harukazeFetch("/access/use", {
        method: "POST",
        body: JSON.stringify({ code, show_code: playbackId }),
      });
      if (!useRes.status) {
        setVerificationError(useRes.message || "Gagal menggunakan kode akses");
        setVerifying(false); return;
      }
      localStorage.setItem("stream_access", JSON.stringify({
        code, showCode: playbackId, timestamp: Date.now(), verified: true,
      }));
      setIsVerified(true); setShowVerification(false); setVerifying(false);
    } catch {
      setVerificationError("Terjadi kesalahan saat verifikasi. Silakan coba lagi.");
      setVerifying(false);
    }
  };

  const checkExistingVerification = async () => {
    const stored = localStorage.getItem("stream_access");
    if (!stored) { setShowVerification(true); return false; }
    try {
      const info = JSON.parse(stored);
      if (!info.verified || !info.timestamp || !info.code || info.showCode !== playbackId) {
        localStorage.removeItem("stream_access"); setShowVerification(true); return false;
      }
      const hoursDiff = (Date.now() - info.timestamp) / (1000 * 60 * 60);
      if (hoursDiff > 5) {
        localStorage.removeItem("stream_access"); setShowVerification(true); return false;
      }
      const verifyRes = await harukazeFetch("/access/verify", {
        method: "POST",
        body: JSON.stringify({ code: info.code, show_code: playbackId }),
      });
      if (!verifyRes.status || !verifyRes.has_access) {
        localStorage.removeItem("stream_access"); setShowVerification(true); return false;
      }
      setIsVerified(true); setShowVerification(false);
      setVerificationCode(info.code);
      return true;
    } catch {
      localStorage.removeItem("stream_access"); setShowVerification(true); return false;
    }
  };

  const fetchNearestShow = async () => {
    try {
      const res  = await fetch("https://v5.jkt48connect.com/api/jkt48/theater?apikey=JKTCONNECT");
      const data = await res.json();
      if (data.theater?.length > 0) {
        const now = new Date();
        let nearestShow = null, smallestDiff = Infinity;
        data.theater.forEach((show) => {
          const diff = Math.abs(new Date(show.date) - now);
          if (diff < smallestDiff) { smallestDiff = diff; nearestShow = show; }
        });
        return nearestShow;
      }
      return null;
    } catch { return null; }
  };

  const fetchShowMembers = async (showId) => {
    try {
      setLoadingMembers(true);
      const res  = await fetch(`https://v5.jkt48connect.com/api/jkt48/theater/${showId}?apikey=JKTCONNECT`);
      const data = await res.json();
      if (data.shows?.[0]?.members) setMembers(data.shows[0].members);
    } catch {}
    setLoadingMembers(false);
  };

  // ── Flow baru: Worker signer -> session -> playback_url (browser->partner) -> playlist_url ──
  const loadStreamData = useCallback(async () => {
    try {
      setLoading(true); setError("");
      if (!playbackId) { setError("Show slug tidak ditemukan"); setLoading(false); return; }

      fetchNearestShow().then((nearestShow) => {
        if (nearestShow) {
          setShowInfo({ title: nearestShow.title, showId: nearestShow.id });
          fetchShowMembers(nearestShow.id);
        }
      }).catch(() => {});

      const session = getSession();
      const viewerId = session?.user?.user_id || null;

      const sessionData = await createPartnerSession(playbackId, viewerId);
      const playback = await exchangePlaybackUrl(sessionData.playback_url);

      setHlsUrl(playback.playlist_url);
      setPlayHeaderName(playback.play_header_name || "X-Play-Key");
      setPlayHeaderValue(playback.play_header_value || "");
      setMaxResolution(playback.max_resolution || sessionData.max_resolution || null);

      setStreamData({ playbackId, title: "Live Stream JKT48", sessionId: sessionData.session_id });

      fetch(`https://v5.jkt48connect.com/api/jkt48/idnplus?apikey=${API_KEY}`)
        .then(r => r.json())
        .then(data => {
          if (data?.data && Array.isArray(data.data)) {
            const show = data.data.find(s => s.slug === playbackId || s.status === "live");
            if (show) setIdnLiveShow(show);
          }
        }).catch(() => {});

      setLoading(false);
    } catch (e) {
      console.error("loadStreamData error:", e);
      setError(e?.message || "Terjadi kesalahan saat memuat stream.");
      setLoading(false);
    }
  }, [playbackId]);

  // ── Resume: dipanggil saat player minta sesi baru (401/403) atau saat refresh halaman ──
  const handleResume = useCallback(async () => {
    if (resumeInFlight.current) return;
    resumeInFlight.current = true;
    try {
      const r = await resumePartnerSession();
      if (r.ok) {
        setHlsUrl(r.playlist_url);
        setPlayHeaderName(r.play_header_name || "X-Play-Key");
        setPlayHeaderValue(r.play_header_value || "");
      } else {
        // Sesi benar-benar sudah tidak valid → minta sesi baru dari awal
        await loadStreamData();
      }
    } catch (e) {
      console.error("resume error:", e);
    } finally {
      resumeInFlight.current = false;
    }
  }, [loadStreamData]);

  useEffect(() => {
    const init = async () => {
      const hasMonthly = await checkMembership();
      if (hasMonthly) {
        setIsVerified(true); setShowVerification(false);
        await loadStreamData();
      } else {
        const verified = await checkExistingVerification();
        if (verified) { await loadStreamData(); } else { setLoading(false); }
      }
    };
    init();

    const initChatUser = async () => {
      setIsChatLoggingIn(true);
      let userData = null;
      try {
        const rawData = sessionStorage.getItem("userLogin") || localStorage.getItem("userLogin");
        if (rawData) {
          const parsed = JSON.parse(rawData);
          if (parsed?.isLoggedIn && parsed?.token && parsed?.user?.user_id) {
            try {
              const res = await fetch(
                `${API_BASE}/profile/${parsed.user.user_id}?apikey=${API_KEY}`,
                { headers: { Authorization: `Bearer ${parsed.token}` } }
              );
              const profileData = await res.json();
              userData = profileData.status && profileData.data ? profileData.data : parsed.user;
            } catch { userData = parsed.user; }
          } else { userData = parsed?.user || parsed; }
        }
      } catch (e) { console.error("Error parsing user session", e); }

      if (userData && (userData.username || userData.full_name)) {
        const username   = userData.username || userData.full_name;
        const email      = userData.email || `${username.replace(/\s+/g, "").toLowerCase()}@jkt48connect.local`;
        const avatar_url = userData.avatar
          ? userData.avatar
          : `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=7b1c1c&color=fff`;
        try {
          await fetch(`${API_BASE}/chatstream/register?apikey=${API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: username.toLowerCase(), email, avatar_url }),
          });
          const { data: supabaseUser, error } = await supabase
            .from("dashboard_v2_users")
            .select("id, username, avatar_url, role, bluetick")
            .eq("username", username.toLowerCase())
            .single();
          if (!error && supabaseUser) setChatUser({ ...supabaseUser, avatar_url });
          else setChatUser({ id: userData.user_id || username, username: username.toLowerCase(), avatar_url, role: "member", bluetick: false });
        } catch (e) { console.error("Gagal auto register/login chat", e); }
      }
      setIsChatLoggingIn(false);
    };
    initChatUser();

    const channel = supabase.channel(`chat-${playbackId}`, { config: { broadcast: { ack: true } } });
    channel.on("broadcast", { event: "pesan_baru" }, ({ payload }) => {
      setChatMessages((prev) => {
        const exists = prev.some(m => m.timestamp === payload.timestamp && m.username === payload.username);
        return exists ? prev : [...prev, payload];
      });
    }).subscribe();
    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isVerified && !streamData && membershipChecked) loadStreamData();
  }, [isVerified, membershipChecked]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resume otomatis saat halaman di-refresh (streamData sudah pernah ada dari load sebelumnya di sesi ini)
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible" && streamData) handleResume();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [streamData, handleResume]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const goBack = () => navigate(-1);
  const handleLogout = () => {
    localStorage.removeItem("stream_access");
    setIsVerified(false); setShowVerification(true);
    setStreamData(null); setHlsUrl(""); setPlayHeaderValue(""); setIdnLiveShow(null);
  };
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !chatUser) return;
    const payload = {
      user_id: chatUser.id, username: chatUser.username,
      avatar_url: chatUser.avatar_url || `https://ui-avatars.com/api/?name=${chatUser.username}`,
      bluetick: chatUser.bluetick, role: chatUser.role,
      text_content: chatInput.trim(), timestamp: new Date().toISOString(),
    };
    setChatMessages((prev) => [...prev, payload]);
    setChatInput("");
    await channelRef.current.send({ type: "broadcast", event: "pesan_baru", payload });
  };

  // ── Render ────────────────────────────────────────────────────────────

  if (membershipLoading) {
    return (
      <div className="ls-status-page">
        <div className="ls-status-card">
          <div className="ls-spinner" />
          <h2>Memeriksa akses...</h2>
          <p>Sedang memverifikasi membership kamu</p>
        </div>
      </div>
    );
  }

  if (showVerification && !isVerified) {
    return (
      <div className="ls-status-page">
        <div className="ls-verify-card">
          <div className="ls-verify-badge">🔒 Akses Terbatas</div>
          <h1>Masukkan Kode Akses</h1>
          <p>Masukkan kode akses yang kamu dapatkan setelah pembelian untuk menonton live stream ini.</p>

          <form onSubmit={(e) => { e.preventDefault(); verifyAccess(); }}>
            <div className="ls-form-group">
              <label>Kode Akses</label>
              <input
                type="text"
                value={verificationCode}
                onChange={(e) => { setVerificationCode(e.target.value.toUpperCase()); setVerificationError(""); }}
                placeholder="cth. HRZS-XXXXXXXX"
                autoCapitalize="characters"
                required
              />
            </div>
            {verificationError && <div className="ls-error-msg">⚠ {verificationError}</div>}
            <button type="submit" className="ls-verify-btn" disabled={verifying}>
              {verifying ? (<><span className="ls-spinner ls-spinner--sm" /> Memverifikasi...</>) : "✓ Verifikasi Akses"}
            </button>
          </form>

          <div className="ls-verify-info">
            <p><strong>Informasi</strong></p>
            <ul>
              <li>Kode akses didapat setelah pembelian pershow atau membership</li>
              <li>Setiap kode punya batas penggunaan sesuai paket</li>
              <li>Verifikasi berlaku selama 5 jam di perangkat ini</li>
              <li>Session tetap aktif walau halaman di-refresh</li>
              <li>
                Punya membership aktif?{" "}
                <span className="ls-link" onClick={() => navigate("/login")}>Login di sini</span>
              </li>
            </ul>
          </div>

          <button onClick={goBack} className="ls-back-btn">← Kembali</button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="ls-status-page">
        <div className="ls-status-card">
          <div className="ls-spinner" />
          <h2>Memuat live stream...</h2>
          <p>Mengambil informasi show...</p>
        </div>
      </div>
    );
  }

  if (error && !streamData) {
    return (
      <div className="ls-status-page">
        <div className="ls-status-card ls-status-card--error">
          <div className="ls-error-icon">⚠</div>
          <h2>Terjadi Kesalahan</h2>
          <p>{error}</p>
          <div className="ls-status-actions">
            <button onClick={() => { setError(""); loadStreamData(); }} className="ls-verify-btn">↺ Coba Lagi</button>
            <button onClick={goBack} className="ls-back-btn">← Kembali</button>
          </div>
        </div>
      </div>
    );
  }

  if (!streamData) {
    return (
      <div className="ls-status-page">
        <div className="ls-status-card">
          <div className="ls-spinner" />
          <h2>Menghubungkan ke stream...</h2>
          <p>Mohon tunggu sebentar</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ls-page">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="ls-header">
        <button onClick={goBack} className="ls-icon-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          <span className="ls-hide-xs">Kembali</span>
        </button>

        <div className="ls-header__center">
          {(idnLiveShow || showInfo) && (
            <>
              <span className="ls-header__title">{idnLiveShow?.title || showInfo?.title}</span>
              {idnLiveShow && <span className="ls-live-badge">LIVE</span>}
            </>
          )}
        </div>

        <div className="ls-header__right">
          {hasMonthlymember ? (
            <div className="ls-monthly-chip">★ MONTHLY</div>
          ) : (
            <button onClick={handleLogout} className="ls-icon-btn ls-icon-btn--danger">Logout</button>
          )}
          <button className="ls-icon-btn ls-chat-toggle" onClick={() => setChatOpenMobile((p) => !p)}>
            💬 <span className="ls-hide-xs">Chat</span>
          </button>
        </div>
      </div>

      <div className="ls-layout">
        {/* ── Main content ────────────────────────────────────────────── */}
        <div className="ls-main">
          <div className="ls-player-wrap">
            {hlsUrl ? (
              <HlsPlayer
                src={hlsUrl}
                playHeaderName={playHeaderName}
                playHeaderValue={playHeaderValue}
                title={idnLiveShow?.title || streamData.title}
                onLevelInfo={setLevelInfo}
                onNeedResume={handleResume}
              />
            ) : (
              <div className="ls-player-loading">
                <div className="ls-spinner" />
                <p>Menghubungkan ke stream...</p>
              </div>
            )}
          </div>

          <div className="ls-quality-bar">
            <div className="ls-quality-current">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>
              <span>Kualitas: <strong>Auto ({levelInfo.name})</strong>{maxResolution ? ` · maks ${maxResolution}p` : ""}</span>
              {levelInfo.bandwidth && <span className="ls-quality-bw">{levelInfo.bandwidth}</span>}
            </div>
          </div>

          {idnLiveShow && (
            <div className="ls-show-banner">
              {idnLiveShow.image_url && <img src={idnLiveShow.image_url} alt={idnLiveShow.title} />}
              <div>
                <div className="ls-show-banner__title">{idnLiveShow.title}</div>
                <div className="ls-show-banner__meta">
                  👁 {idnLiveShow.view_count?.toLocaleString() || 0} penonton
                  {idnLiveShow.idnliveplus?.description && <span> · {idnLiveShow.idnliveplus.description}</span>}
                </div>
              </div>
            </div>
          )}

          {members.length > 0 && (
            <div className="ls-members">
              <div className="ls-members__header">
                <h3>Lineup Show</h3>
                <span className="ls-members__count">{members.length} Member</span>
              </div>
              {loadingMembers ? (
                <div className="ls-members__loading"><div className="ls-spinner ls-spinner--sm" /><p>Memuat lineup...</p></div>
              ) : (
                <div className="ls-members__grid">
                  {members.map((member) => (
                    <div key={member.id} className="ls-member-card">
                      <img src={member.img} alt={member.name} />
                      <p>{member.name}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="ls-footer"><p>POWERED BY JKT48CONNECT</p></div>
        </div>

        {/* ── Chat sidebar ────────────────────────────────────────────── */}
        <div className={`ls-chat${chatOpenMobile ? " ls-chat--open" : ""}`}>
          <div className="ls-chat__header">
            <span>Live Chat</span>
            <span className="ls-chat__count">{chatMessages.length} pesan</span>
          </div>
          <div className="ls-chat__messages">
            {chatMessages.map((msg, idx) => (
              <div key={idx} className="ls-chat-msg">
                <img src={msg.avatar_url || `https://ui-avatars.com/api/?name=${msg.username}`} alt="avatar" className="ls-chat-msg__avatar" />
                <div className="ls-chat-msg__body">
                  <div className="ls-chat-msg__username">
                    {msg.role && msg.role !== "member" && <span className="ls-role-badge">{msg.role}</span>}
                    {msg.username}
                    {msg.bluetick && (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="ls-bluetick">
                        <path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.918-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.337 2.25c-.416-.165-.866-.25-1.336-.25-2.21 0-3.918 1.79-3.918 4 0 .495.084.965.238 1.4-1.273.65-2.148 2.02-2.148 3.6 0 1.46.726 2.75 1.83 3.444-.06.315-.09.64-.09.966 0 2.21 1.71 3.998 3.918 3.998.53 0 1.04-.1 1.51-.282.825 1.155 2.15 1.924 3.63 1.924s2.805-.767 3.63-1.924c.47.182.98.282 1.51.282 2.21 0 3.918-1.79 3.918-4 0-.325-.03-.65-.09-.966 1.105-.694 1.83-1.984 1.83-3.444z" fill="#1DA1F2"/>
                        <path d="M10.42 16.273L6.46 12.31l1.41-1.414 2.55 2.548 6.42-6.42 1.414 1.415-7.834 7.834z" fill="white"/>
                      </svg>
                    )}
                  </div>
                  <div className="ls-chat-msg__text">{msg.text_content}</div>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="ls-chat__input-wrap">
            {isChatLoggingIn ? (
              <div className="ls-chat-disabled">Memuat info akun...</div>
            ) : chatUser ? (
              <form onSubmit={handleSendMessage} className="ls-chat-form">
                <input
                  type="text"
                  placeholder={`Kirim sebagai ${chatUser.username}...`}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="ls-chat-input"
                  maxLength={200}
                />
                <button type="submit" className="ls-chat-send" disabled={!chatInput.trim()}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </form>
            ) : (
              <div className="ls-chat-disabled">
                Hanya bisa melihat chat.{" "}
                <a href="/login" onClick={(e) => { e.preventDefault(); navigate("/login"); }}>Login JKT48Connect</a>{" "}
                untuk ikut komen.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default LiveStream;
