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

// ── GiStream token constants ──────────────────────────────────────────────
const TOKEN_API_BASE = "https://v5.jkt48connect.com";
const STREAM_BASE    = "https://v1.jkt48connect.com";
const SIGNING_PATH   = "/api/token/generate?apikey=JKTCONNECT";
const PARTNER_KID    = "jkt48connect-v1";
const PARTNER_SECRET = "gstream@jkt48connect@2108";

// ── HMAC helpers ───────────────────────────────────────────────────────────
async function sha256Hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
async function hmacSHA256Hex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const buf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
async function buildHMACHeaders() {
  const timestamp  = Date.now().toString();
  const nonce      = crypto.randomUUID().replace(/-/g, "");
  const bodyHash   = await sha256Hex("{}");
  const signingStr = `${timestamp}:${nonce}:POST:${SIGNING_PATH}:${bodyHash}`;
  const signature  = await hmacSHA256Hex(PARTNER_SECRET, signingStr);
  return { "x-kid": PARTNER_KID, "x-timestamp": timestamp, "x-nonce": nonce, "x-signature": signature };
}
async function generateStreamToken(slugOrId, isSlug) {
  const hmacHeaders = await buildHMACHeaders();
  const res = await fetch(`${TOKEN_API_BASE}${SIGNING_PATH}`, {
    method: "POST",
    headers: {
      ...hmacHeaders,
      ...(isSlug ? { "x-slug": slugOrId } : { "x-showid": slugOrId }),
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("Token server returned non-JSON response"); }
  if (!data.status) throw new Error("Generate token gagal: " + data.message);
  return data.data.token;
}

// ── M3U8 master playlist parser ─────────────────────────────────────────
function parseM3U8(text) {
  const lines   = text.split("\n").map(l => l.trim()).filter(Boolean);
  const streams = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("#EXT-X-STREAM-INF:")) continue;
    const infLine = lines[i].substring("#EXT-X-STREAM-INF:".length);
    const url     = lines[i + 1] && !lines[i + 1].startsWith("#") ? lines[i + 1] : null;
    if (!url) continue;
    const attrs = {};
    const re    = /([A-Z0-9\-]+)=("([^"]*?)"|([^,]+))/g;
    let m;
    while ((m = re.exec(infLine)) !== null) attrs[m[1]] = m[3] !== undefined ? m[3] : m[4];
    const bw  = parseInt(attrs["BANDWIDTH"] || "0", 10);
    const res = attrs["RESOLUTION"] || "";
    const fps = attrs["FRAME-RATE"] || "";
    const height = res ? res.split("x")[1] : null;
    const name   = height ? `${height}p` : `Stream ${streams.length + 1}`;
    streams.push({
      name, quality: name, bandwidth: bw,
      bandwidth_label: bw >= 1_000_000 ? (bw / 1_000_000).toFixed(1) + " Mbps" : bw > 0 ? Math.round(bw / 1_000) + " Kbps" : "",
      resolution: res, fps, url, manual_url: url, playlist_url: url,
    });
  }
  streams.sort((a, b) => b.bandwidth - a.bandwidth);
  return streams;
}

async function getStreamURL(token, slugOrId, isSlug) {
  const param = isSlug ? `slug=${slugOrId}` : `showId=${slugOrId}`;
  const res = await fetch(`${STREAM_BASE}/stream?${param}`, {
    headers: { "x-api-token": token, ...(isSlug ? { "x-slug": slugOrId } : { "x-showid": slugOrId }) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`stream HTTP ${res.status}: ${text.slice(0, 300)}`);

  if (text.trimStart().startsWith("#EXTM3U")) {
    const qualities = parseM3U8(text);
    if (qualities.length === 0) throw new Error(`M3U8 parsed tapi tidak ada stream. Response:\n${text.slice(0, 400)}`);
    return { url: qualities[0].url, qualities };
  }

  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`Response bukan M3U8 maupun JSON (HTTP ${res.status}): ${text.slice(0, 300)}`); }
  if (!data.success) throw new Error(`stream gagal: ${data.message || JSON.stringify(data).slice(0, 300)}`);

  const streams = (data.streams || [])
    .filter((s) => s && typeof s.url === "string" && s.url.length > 0)
    .sort((a, b) => parseInt((b.BANDWIDTH || "0").split(",")[0]) - parseInt((a.BANDWIDTH || "0").split(",")[0]));

  if (streams.length === 0) throw new Error(`Streams kosong. Response: ${JSON.stringify(data).slice(0, 400)}`);

  const autoUrl   = data.stream_url || streams[0]?.url || "";
  const qualities = streams.map((s, idx) => {
    const bw  = parseInt((s.BANDWIDTH || "0").split(",")[0]);
    const res = s.RESOLUTION || "";
    const h   = res ? res.split("x")[1] : null;
    return {
      index: idx, name: h ? `${h}p` : (s.NAME || `q${idx}`), quality: s.NAME || `q${idx}`, bandwidth: bw,
      bandwidth_label: bw >= 1_000_000 ? (bw / 1_000_000).toFixed(1) + " Mbps" : bw > 0 ? Math.round(bw / 1_000) + " Kbps" : "",
      resolution: res, fps: s["FRAME-RATE"] || "", manual_url: s.url || "", playlist_url: s.url || "",
    };
  });
  return { url: autoUrl, qualities };
}

const isSlugParam = (param) => {
  if (!param) return false;
  if (/^\d+$/.test(param)) return false;
  if (/^SH\d+$/i.test(param)) return false;
  return true;
};

// ══════════════════════════════════════════════════════════════════════════
//  HLS PLAYER (tanpa panel kualitas internal — dikontrol dari parent)
// ══════════════════════════════════════════════════════════════════════════
function HlsPlayer({ src, title, token, onLevelInfo }) {
  const videoRef = useRef(null);
  const hlsRef   = useRef(null);
  const retryRef = useRef(null);

  const destroyHls = useCallback(() => {
    if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    destroyHls();

    const makeConfig = () => ({
      enableWorker: true, lowLatencyMode: false,
      maxBufferLength: 30, maxMaxBufferLength: 60, maxBufferSize: 60 * 1000 * 1000,
      backBufferLength: 30, liveSyncDurationCount: 3, liveMaxLatencyDurationCount: 10,
      liveDurationInfinity: true,
      fragLoadingTimeOut: 10000, fragLoadingMaxRetry: 6, fragLoadingRetryDelay: 1000, fragLoadingMaxRetryTimeout: 8000,
      manifestLoadingTimeOut: 10000, manifestLoadingMaxRetry: 4, manifestLoadingRetryDelay: 1000,
      levelLoadingTimeOut: 10000, levelLoadingMaxRetry: 4, levelLoadingRetryDelay: 1000,
      abrEwmaDefaultEstimate: 500_000, abrBandWidthFactor: 0.8, abrBandWidthUpFactor: 0.7,
      abrEwmaFastLive: 3.0, abrEwmaSlowLive: 9.0, nudgeOffset: 0.3, nudgeMaxRetry: 5,
      ...(token && {
        xhrSetup: (xhr) => xhr.setRequestHeader("x-api-token", token),
        fetchSetup: (context, initParams) => {
          initParams.headers = { ...initParams.headers, "x-api-token": token };
          return new Request(context.url, initParams);
        },
      }),
    });

    if (Hls.isSupported()) {
      const hls = new Hls(makeConfig());
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
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else {
          destroyHls();
          retryRef.current = setTimeout(() => {
            const v = videoRef.current;
            if (!v) return;
            const newHls = new Hls(makeConfig());
            newHls.loadSource(src);
            newHls.attachMedia(v);
            newHls.on(Hls.Events.MANIFEST_PARSED, () => v.play().catch(() => {}));
            hlsRef.current = newHls;
          }, 2000);
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.addEventListener("loadedmetadata", () => video.play().catch(() => {}));
    }

    return destroyHls;
  }, [src, token, destroyHls, onLevelInfo]);

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
  const { playbackId } = useParams();
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

  const [hlsUrl,           setHlsUrl]           = useState("");
  const [availableStreams, setAvailableStreams] = useState([]);
  const [streamToken,      setStreamToken]      = useState("");
  const [activeQualityIdx, setActiveQualityIdx] = useState(-1); // -1 = auto
  const [levelInfo,        setLevelInfo]        = useState({ name: "Auto", bandwidth: "" });
  const [showQualityMenu,  setShowQualityMenu]  = useState(false);
  const qualityMenuRef = useRef(null);

  const [idnLiveShow, setIdnLiveShow] = useState(null);

  const [chatMessages,    setChatMessages]    = useState([]);
  const [chatInput,       setChatInput]       = useState("");
  const [chatUser,        setChatUser]        = useState(null);
  const [isChatLoggingIn, setIsChatLoggingIn] = useState(true);
  const [chatOpenMobile,  setChatOpenMobile]  = useState(false);
  const chatEndRef  = useRef(null);
  const channelRef  = useRef(null);

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

  const loadStreamData = useCallback(async () => {
    try {
      setLoading(true); setError("");
      if (!playbackId) { setError("Playback ID tidak ditemukan"); setLoading(false); return; }

      const isSlug = isSlugParam(playbackId);

      fetchNearestShow().then((nearestShow) => {
        if (nearestShow) {
          setShowInfo({ title: nearestShow.title, showId: nearestShow.id });
          fetchShowMembers(nearestShow.id);
        }
      }).catch(() => {});

      const token = await generateStreamToken(playbackId, isSlug);
      setStreamToken(token);

      const { url, qualities } = await getStreamURL(token, playbackId, isSlug);
      if (qualities.length > 0) setAvailableStreams(qualities);
      if (!url) throw new Error("Stream URL kosong setelah fetch berhasil");

      setHlsUrl(url);
      setActiveQualityIdx(-1);
      setStreamData({ playbackId, title: "Live Stream JKT48", viewerId: "viewer-" + Date.now() });

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

  const handleSelectQuality = (idx) => {
    setActiveQualityIdx(idx);
    setShowQualityMenu(false);
    if (idx === -1) { loadStreamData(); return; }
    const q = availableStreams[idx];
    if (q?.manual_url) setHlsUrl(q.manual_url);
  };

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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (qualityMenuRef.current && !qualityMenuRef.current.contains(e.target)) setShowQualityMenu(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const goBack = () => navigate(-1);
  const handleLogout = () => {
    localStorage.removeItem("stream_access");
    setIsVerified(false); setShowVerification(true);
    setStreamData(null); setHlsUrl(""); setAvailableStreams([]);
    setStreamToken(""); setVerificationCode(""); setIdnLiveShow(null);
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
          <details className="ls-error-details">
            <summary>Detail Error</summary>
            <pre>{error}</pre>
          </details>
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
                title={idnLiveShow?.title || streamData.title}
                token={streamToken}
                onLevelInfo={setLevelInfo}
              />
            ) : (
              <div className="ls-player-loading">
                <div className="ls-spinner" />
                <p>Menghubungkan ke stream...</p>
              </div>
            )}
          </div>

          {/* ── Quality bar — layout baru, bukan overlay lagi ──────────── */}
          {availableStreams.length > 0 && (
            <div className="ls-quality-bar" ref={qualityMenuRef}>
              <div className="ls-quality-current">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>
                <span>Kualitas: <strong>{activeQualityIdx === -1 ? `Auto (${levelInfo.name})` : availableStreams[activeQualityIdx]?.name}</strong></span>
                {levelInfo.bandwidth && <span className="ls-quality-bw">{levelInfo.bandwidth}</span>}
              </div>
              <div className="ls-quality-options">
                <button
                  className={`ls-quality-pill${activeQualityIdx === -1 ? " active" : ""}`}
                  onClick={() => handleSelectQuality(-1)}
                >Auto</button>
                {availableStreams.map((q, i) => (
                  <button
                    key={i}
                    className={`ls-quality-pill${activeQualityIdx === i ? " active" : ""}`}
                    onClick={() => handleSelectQuality(i)}
                    title={q.bandwidth_label}
                  >
                    {q.name}
                  </button>
                ))}
              </div>
            </div>
          )}

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
