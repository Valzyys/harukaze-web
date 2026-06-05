import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import MuxPlayer from "@mux/mux-player-react";
import Hls from "hls.js";
import { createClient } from "@supabase/supabase-js";
import "../styles/live-stream.css";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://mzxfuaoihgzxvokwarao.supabase.co";
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16eGZ1YW9paGd6eHZva3dhcmFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MDg0NjIsImV4cCI6MjA4OTk4NDQ2Mn0.OFYCkBFXCSfLn-wG94OHHKL5CX8T_BLrbDGPiBdPIog";
const supabase = createClient(supabaseUrl, supabaseKey);

const API_BASE = "https://v2.jkt48connect.com/api/jkt48connect";
const API_KEY  = "JKTCONNECT";

const isSlugParam = (param) => {
  if (!param) return false;
  if (/\d{4}-\d{2}-\d{2}/.test(param)) return true;
  if (/^SH\d+$/i.test(param)) return true;
  return false;
};

// ── Resolution Selector ────────────────────────────────────────────────────────
function ResolutionSelector({ streams, currentUrl, onSelect }) {
  if (!streams || streams.length === 0) return null;

  const formatBandwidth = (bw) => {
    const num = parseInt(bw) || 0;
    if (num >= 1000000) return (num / 1000000).toFixed(1) + " Mbps";
    if (num >= 1000) return Math.round(num / 1000) + " Kbps";
    return num + " bps";
  };

  return (
    <div className="resolution-selector">
      <span className="resolution-label">Resolusi:</span>
      {streams.map((stream) => {
        const isActive = currentUrl === stream.url;
        return (
          <button
            key={stream["GROUP-ID"]}
            className={`resolution-btn${isActive ? " active" : ""}`}
            onClick={() => onSelect(stream)}
            title={`${stream.RESOLUTION} @ ${stream["FRAME-RATE"]}fps — ${formatBandwidth(stream.BANDWIDTH)}`}
          >
            {stream.NAME}
          </button>
        );
      })}
    </div>
  );
}

// ── HLS Player ─────────────────────────────────────────────────────────────────
function HlsPlayer({ src, title, streams, onResolutionChange }) {
  const videoRef = useRef(null);
  const hlsRef   = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    const setupHls = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker:           true,
          lowLatencyMode:         true,
          liveSyncDuration:       3,
          liveMaxLatencyDuration: 10,
        });
        hlsRef.current = hls;
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
              default:
                hls.destroy();
                break;
            }
          }
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = src;
        video.addEventListener("loadedmetadata", () => {
          video.play().catch(() => {});
        });
      }
    };

    setupHls();

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <video
        ref={videoRef}
        controls
        autoPlay
        playsInline
        style={{ width: "100%", height: "100%", background: "#000", borderRadius: "8px" }}
        title={title}
      />
      {streams && streams.length > 0 && (
        <div style={{ position: "absolute", bottom: "48px", right: "12px", zIndex: 10 }}>
          <ResolutionSelector
            streams={streams}
            currentUrl={src}
            onSelect={onResolutionChange}
          />
        </div>
      )}
    </div>
  );
}

const getSession = () => {
  try {
    const d = JSON.parse(
      sessionStorage.getItem("userLogin") ||
      localStorage.getItem("userLogin") ||
      "null"
    );
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
  const [verificationData,  setVerificationData]  = useState({ email: "", code: "" });
  const [verificationError, setVerificationError] = useState("");
  const [verifying,         setVerifying]         = useState(false);
  const [clientIP,          setClientIP]          = useState("");

  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState("");
  const [streamData,     setStreamData]     = useState(null);
  const [showInfo,       setShowInfo]       = useState(null);
  const [members,        setMembers]        = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const [hlsUrl,           setHlsUrl]           = useState("");
  const [isSlugMode,       setIsSlugMode]        = useState(false);
  const [availableStreams,  setAvailableStreams]  = useState([]);

  // ── State baru untuk IDN Plus live show ──────────────────────────────────
  const [idnLiveShow,      setIdnLiveShow]      = useState(null);
  const [fetchingIdnShow,  setFetchingIdnShow]  = useState(false);

  const [chatMessages,    setChatMessages]    = useState([]);
  const [chatInput,       setChatInput]       = useState("");
  const [chatUser,        setChatUser]        = useState(null);
  const [isChatLoggingIn, setIsChatLoggingIn] = useState(true);
  const chatEndRef  = useRef(null);
  const channelRef  = useRef(null);

  const fetchClientIP = async () => {
    try {
      const res  = await fetch("https://api.ipify.org?format=json");
      const data = await res.json();
      setClientIP(data.ip);
      return data.ip;
    } catch { return "unknown"; }
  };

  const checkMembership = useCallback(async () => {
    setMembershipLoading(true);
    const session = getSession();
    if (!session) {
      setHasMonthlyMember(false); setMembershipChecked(true); setMembershipLoading(false);
      return false;
    }
    const uid   = session.user?.user_id;
    const token = session.token;
    if (!uid || !token) {
      setHasMonthlyMember(false); setMembershipChecked(true); setMembershipLoading(false);
      return false;
    }
    try {
      const res  = await fetch(
        `${API_BASE}/membership/status/${uid}?apikey=${API_KEY}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (data.status && data.data?.is_active && data.data?.membership_type === "monthly") {
        setHasMonthlyMember(true); setMembershipChecked(true); setMembershipLoading(false);
        return true;
      }
    } catch (e) { console.error("Error checking membership:", e); }
    setHasMonthlyMember(false); setMembershipChecked(true); setMembershipLoading(false);
    return false;
  }, []);

  // ── Fetch live showId dari IDN Plus API ──────────────────────────────────
  const fetchIdnPlusLiveShowId = useCallback(async () => {
    setFetchingIdnShow(true);
    try {
      const res  = await fetch(
        `https://v2.jkt48connect.com/api/jkt48/idnplus?apikey=${API_KEY}`
      );
      const data = await res.json();

      console.log("IDN Plus API response:", data);

      if (!data || data.status !== 200 || !Array.isArray(data.data)) {
        console.warn("fetchIdnPlusLiveShowId: response tidak valid", data);
        setFetchingIdnShow(false);
        return null;
      }

      // Cari show dengan status "live"
      const liveShow = data.data.find((show) => show.status === "live");

      if (!liveShow) {
        console.warn("fetchIdnPlusLiveShowId: tidak ada show yang sedang live");
        setFetchingIdnShow(false);
        return null;
      }

      console.log("IDN Plus live show ditemukan:", liveShow);

      // Simpan info show untuk ditampilkan di UI
      setIdnLiveShow(liveShow);
      setFetchingIdnShow(false);

      // Kembalikan showId
      return liveShow.showId || null;
    } catch (e) {
      console.error("fetchIdnPlusLiveShowId error:", e);
      setFetchingIdnShow(false);
      return null;
    }
  }, []);

  const verifyAccess = async () => {
    if (!verificationData.email || !verificationData.code) {
      setVerificationError("Email dan code wajib diisi"); return;
    }
    setVerifying(true); setVerificationError("");
    try {
      const ip = clientIP || (await fetchClientIP());
      const verifyResponse = await fetch("https://v2.jkt48connect.com/api/codes/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: verificationData.email, code: verificationData.code, apikey: "JKTCONNECT" }),
      });
      const verifyData = await verifyResponse.json();
      if (!verifyData.status) {
        setVerificationError(verifyData.message || "Code tidak valid atau sudah kedaluwarsa");
        setVerifying(false); return;
      }
      const codeData = verifyData.data;
      if (!codeData.is_active) {
        setVerificationError("Code ini sudah tidak aktif"); setVerifying(false); return;
      }
      const usageCount        = parseInt(codeData.usage_count) || 0;
      const usageLimit        = parseInt(codeData.usage_limit)  || 1;
      const hasUsageRemaining = usageCount < usageLimit;
      if (codeData.is_used && !hasUsageRemaining) {
        const listResponse = await fetch(
          `https://v2.jkt48connect.com/api/codes/list?email=${verificationData.email}&apikey=JKTCONNECT`
        );
        const listData = await listResponse.json();
        if (listData.status && listData.data.wotatokens) {
          const userCode = listData.data.wotatokens.find((c) => c.code === verificationData.code);
          if (userCode) {
            if (userCode.ip_address && userCode.ip_address !== "" && userCode.ip_address !== ip) {
              setVerificationError("Code ini sudah digunakan dari IP address yang berbeda");
              setVerifying(false); return;
            }
            localStorage.setItem("stream_verification", JSON.stringify({ email: verificationData.email, code: verificationData.code, ip, timestamp: Date.now(), verified: true }));
            setIsVerified(true); setShowVerification(false); setVerifying(false); return;
          }
        }
        setVerificationError("Code sudah tidak dapat digunakan"); setVerifying(false); return;
      }
      const useResponse = await fetch("https://v2.jkt48connect.com/api/codes/use", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: verificationData.email, code: verificationData.code, apikey: "JKTCONNECT" }),
      });
      const useData = await useResponse.json();
      if (useData.status) {
        localStorage.setItem("stream_verification", JSON.stringify({ email: verificationData.email, code: verificationData.code, ip, timestamp: Date.now(), verified: true }));
        setIsVerified(true); setShowVerification(false); setVerifying(false);
      } else {
        setVerificationError(useData.message || "Gagal menggunakan code"); setVerifying(false);
      }
    } catch {
      setVerificationError("Terjadi kesalahan saat verifikasi. Silakan coba lagi."); setVerifying(false);
    }
  };

    const checkExistingVerification = async () => {
    const stored = localStorage.getItem("stream_verification");
    if (!stored) { setShowVerification(true); return false; }
    try {
      const info = JSON.parse(stored);
      if (!info.verified || !info.timestamp) {
        localStorage.removeItem("stream_verification"); setShowVerification(true); return false;
      }
      const hoursDiff = (Date.now() - info.timestamp) / (1000 * 60 * 60);
      if (hoursDiff > 5) {
        localStorage.removeItem("stream_verification"); setShowVerification(true); return false;
      }
      const ip = await fetchClientIP();
      if (info.ip !== ip) { info.ip = ip; localStorage.setItem("stream_verification", JSON.stringify(info)); }
      setIsVerified(true); setShowVerification(false);
      setVerificationData({ email: info.email, code: info.code });
      return true;
    } catch {
      localStorage.removeItem("stream_verification"); setShowVerification(true); return false;
    }
  };

  const fetchNearestShow = async () => {
    try {
      const res  = await fetch("https://v2.jkt48connect.com/api/jkt48/theater?apikey=JKTCONNECT");
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
      const res  = await fetch(`https://v2.jkt48connect.com/api/jkt48/theater/${showId}?apikey=JKTCONNECT`);
      const data = await res.json();
      if (data.shows?.[0]?.members) setMembers(data.shows[0].members);
    } catch {}
    setLoadingMembers(false);
  };

  // ── Fetch stream via /live/stream?showId= ────────────────────────────────
  const fetchShowStream = async (showId) => {
    try {
      const res = await fetch(
        `https://v2.jkt48connect.com/api/jkt48/live/stream?apikey=${API_KEY}&showId=${showId}`
      );

      let data = null;
      try {
        data = await res.json();
      } catch {
        console.warn("fetchShowStream: gagal parse JSON response");
        return null;
      }

      console.log("fetchShowStream raw response:", data);

      if (!data?.success) {
        console.warn("fetchShowStream: API returned success=false", data);
        return null;
      }

      const rawStreams = Array.isArray(data?.streams)
        ? data.streams.filter((s) => s && typeof s.url === "string" && s.url.length > 0)
        : [];

      const sorted = rawStreams.sort(
        (a, b) => parseInt(b.BANDWIDTH || 0) - parseInt(a.BANDWIDTH || 0)
      );

      if (sorted.length > 0) {
        setAvailableStreams(sorted);
      }

      const defaultUrl =
        (typeof data?.stream_url === "string" && data.stream_url.length > 0
          ? data.stream_url
          : null) ||
        sorted[0]?.url ||
        null;

      if (!defaultUrl) {
        console.warn("fetchShowStream: tidak ada URL stream ditemukan", data);
        return null;
      }

      return {
        url:     defaultUrl,
        title:   data?.showId || showId,
        showId:  data?.showId,
        tokenId: data?.tokenId,
      };
    } catch (e) {
      console.error("fetchShowStream error:", e);
      return null;
    }
  };

  // ── Load stream data ──────────────────────────────────────────────────────
  const loadStreamData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      if (!playbackId) {
        setError("Playback ID tidak ditemukan");
        setLoading(false);
        return;
      }

      const slugMode = isSlugParam(playbackId);
      setIsSlugMode(slugMode);

      // Fetch show info — fire-and-forget, tidak blokir stream
      fetchNearestShow().then((nearestShow) => {
        if (nearestShow) {
          setShowInfo({ title: nearestShow.title, showId: nearestShow.id });
          fetchShowMembers(nearestShow.id);
        }
      }).catch(() => {});

      if (slugMode) {
        // ── Ambil showId dari IDN Plus API (status: live) ──────────────────
        let resolvedShowId = null;

        const idnShowId = await fetchIdnPlusLiveShowId();

        if (idnShowId) {
          console.log("Menggunakan showId dari IDN Plus API:", idnShowId);
          resolvedShowId = idnShowId;
        } else {
          // Fallback: gunakan showId hardcode jika tidak ada yang live
          console.warn("Tidak ada IDN Plus show yang live, fallback ke showId hardcode");
          resolvedShowId = "SH3401";
        }

        let result = await fetchShowStream(resolvedShowId);

        // Retry sekali jika gagal
        if (!result || !result.url) {
          console.warn("fetchShowStream: retry setelah 2 detik...");
          await new Promise((r) => setTimeout(r, 2000));
          result = await fetchShowStream(resolvedShowId);
        }

        // Jika masih gagal dan tadi pakai IDN showId, coba fallback hardcode
        if ((!result || !result.url) && idnShowId && resolvedShowId !== "SH3401") {
          console.warn("fetchShowStream: IDN showId gagal, mencoba fallback hardcode SH3401...");
          result = await fetchShowStream("SH3401");
        }

        if (!result || !result.url) {
          setError("Gagal mendapatkan stream URL. Stream mungkin sudah berakhir.");
          setLoading(false);
          return;
        }

        setHlsUrl(result.url);
        setStreamData({
          playbackId,
          title:    idnLiveShow?.title || result.title || "Live Stream JKT48",
          viewerId: "viewer-" + Date.now(),
        });

        // Update show info dari IDN Plus jika ada
        if (idnLiveShow) {
          setShowInfo({
            title:  idnLiveShow.title,
            showId: resolvedShowId,
          });
        }

        // Fetch members dari showId yang berhasil
        if (result.showId) {
          fetchShowMembers(result.showId);
        } else {
          fetchShowMembers(resolvedShowId);
        }

      } else {
        // Mux mode — langsung set streamData
        setStreamData({
          playbackId,
          title:    "Live Stream JKT48",
          viewerId: "viewer-" + Date.now(),
        });
      }

      setLoading(false);
    } catch (e) {
      console.error("loadStreamData error:", e);
      setError("Terjadi kesalahan saat memuat stream. Silakan coba lagi.");
      setLoading(false);
    }
  }, [playbackId, fetchIdnPlusLiveShowId, idnLiveShow]);

  const handleResolutionChange = (stream) => {
    if (!stream?.url) return;
    setHlsUrl(stream.url);
  };

  useEffect(() => {
    const init = async () => {
      await fetchClientIP();
      const hasMonthly = await checkMembership();
      if (hasMonthly) {
        setIsVerified(true); setShowVerification(false);
        await loadStreamData();
      } else {
        const verified = await checkExistingVerification();
        if (verified) {
          await loadStreamData();
        } else {
          setLoading(false);
        }
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
          } else {
            userData = parsed?.user || parsed;
          }
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
          if (!error && supabaseUser) {
            setChatUser({ ...supabaseUser, avatar_url });
          } else {
            setChatUser({ id: userData.user_id || username, username: username.toLowerCase(), avatar_url, role: "member", bluetick: false });
          }
        } catch (e) { console.error("Gagal auto register/login chat", e); }
      }
      setIsChatLoggingIn(false);
    };
    initChatUser();

    const channel = supabase.channel(`chat-${playbackId}`, {
      config: { broadcast: { ack: true } },
    });
    channel
      .on("broadcast", { event: "pesan_baru" }, ({ payload }) => {
        setChatMessages((prev) => {
          const exists = prev.some(m => m.timestamp === payload.timestamp && m.username === payload.username);
          return exists ? prev : [...prev, payload];
        });
      })
      .subscribe();
    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isVerified && !streamData && membershipChecked) loadStreamData();
  }, [isVerified, membershipChecked]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleInputChange        = (e) => {
    const { name, value } = e.target;
    setVerificationData((prev) => ({ ...prev, [name]: value }));
    setVerificationError("");
  };
  const handleVerificationSubmit = (e) => { e.preventDefault(); verifyAccess(); };
  const goBack                   = () => navigate(-1);
  const handleLogout             = () => {
    localStorage.removeItem("stream_verification");
    setIsVerified(false); setShowVerification(true);
    setStreamData(null); setHlsUrl(""); setAvailableStreams([]);
    setVerificationData({ email: "", code: "" });
    setIdnLiveShow(null);
  };
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !chatUser) return;
    const payload = {
      user_id:      chatUser.id,
      username:     chatUser.username,
      avatar_url:   chatUser.avatar_url || `https://ui-avatars.com/api/?name=${chatUser.username}`,
      bluetick:     chatUser.bluetick,
      role:         chatUser.role,
      text_content: chatInput.trim(),
      timestamp:    new Date().toISOString(),
    };
    setChatMessages((prev) => [...prev, payload]);
    setChatInput("");
    await channelRef.current.send({ type: "broadcast", event: "pesan_baru", payload });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (membershipLoading) {
    return (
      <div className="loading-container">
        <div className="loading-content">
          <div className="spinner-large"></div>
          <h2>Memeriksa akses...</h2>
          <p>Sedang memverifikasi membership kamu</p>
        </div>
      </div>
    );
  }

    if (showVerification && !isVerified) {
    return (
      <div className="verification-page">
        <div className="verification-container">
          <div className="verification-card">
            <h1>Verifikasi Akses</h1>
            <p>Masukkan email dan code untuk mengakses live stream</p>
            <form onSubmit={handleVerificationSubmit}>
              <div className="form-group">
                <label>Email</label>
                <input type="email" name="email" value={verificationData.email} onChange={handleInputChange} placeholder="email@example.com" required />
              </div>
              <div className="form-group">
                <label>Verification Code</label>
                <input type="text" name="code" value={verificationData.code} onChange={handleInputChange} placeholder="Masukkan code" required />
              </div>
              {verificationError && <div className="error-message">{verificationError}</div>}
              {verifying
                ? <button type="button" className="verify-button" disabled><span className="spinner"></span> Memverifikasi...</button>
                : <button type="submit" className="verify-button">✓ Verifikasi Akses</button>
              }
            </form>
            <div className="verification-info">
              <p>!<strong>Informasi:</strong></p>
              <ul>
                <li>Code verifikasi hanya dapat digunakan sekali</li>
                <li>IP address akan dicatat untuk keamanan</li>
                <li>Akses berlaku selama 5 jam</li>
                <li>Session tetap aktif saat refresh halaman</li>
                <li>
                  Punya membership monthly?{" "}
                  <span
                    style={{ color: "#DC1F2E", cursor: "pointer", fontWeight: 700 }}
                    onClick={() => navigate("/login")}
                  >
                    Login di sini
                  </span>
                </li>
              </ul>
            </div>
            <button onClick={goBack} className="back-button">← Kembali</button>
          </div>
        </div>
      </div>
    );
  }

  if (loading || fetchingIdnShow) {
    return (
      <div className="loading-container">
        <div className="loading-content">
          <div className="spinner-large"></div>
          <h2>Memuat live stream...</h2>
          <p>
            {fetchingIdnShow
              ? "Mencari show yang sedang live..."
              : "Mengambil informasi show..."}
          </p>
        </div>
      </div>
    );
  }

  if (error && !streamData) {
    return (
      <div className="error-container">
        <div className="error-content">
          <div className="error-icon"></div>
          <h2>Terjadi Kesalahan</h2>
          <p>{error}</p>
          <button
            onClick={() => { setError(""); loadStreamData(); }}
            className="back-button"
            style={{ marginBottom: "10px" }}
          >
            ↺ Coba Lagi
          </button>
          <button onClick={goBack} className="back-button">← Kembali</button>
        </div>
      </div>
    );
  }

  if (!streamData) {
    return (
      <div className="loading-container">
        <div className="loading-content">
          <div className="spinner-large"></div>
          <h2>Menghubungkan ke stream...</h2>
          <p>Mohon tunggu sebentar</p>
        </div>
      </div>
    );
  }

  return (
    <div className="live-stream-page">
      <div className="stream-header">
        <button onClick={goBack} className="back-btn">← Kembali</button>

        {/* Tampilkan info show dari IDN Plus jika ada, fallback ke showInfo */}
        {(idnLiveShow || showInfo) && (
          <div className="show-title">
            <span>{idnLiveShow?.title || showInfo?.title}</span>
            {idnLiveShow && (
              <span
                style={{
                  marginLeft: "8px",
                  background: "#DC1F2E",
                  color: "#fff",
                  fontSize: "10px",
                  fontWeight: 700,
                  padding: "2px 7px",
                  borderRadius: "8px",
                  letterSpacing: "1px",
                  verticalAlign: "middle",
                }}
              >
                LIVE
              </span>
            )}
          </div>
        )}

        {!hasMonthlymember && (
          <button onClick={handleLogout} className="logout-btn">Logout</button>
        )}
        {hasMonthlymember && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "#DC1F2E18",
              border: "1px solid #DC1F2E40",
              borderRadius: "20px",
              padding: "4px 12px",
              fontSize: "12px",
              fontWeight: 700,
              color: "#DC1F2E",
            }}
          >
            ★ MONTHLY
          </div>
        )}
      </div>

      <div className="stream-layout">
        <div className="main-content">
          <div className="player-container">
            {isSlugMode && hlsUrl ? (
              <HlsPlayer
                src={hlsUrl}
                title={idnLiveShow?.title || streamData.title}
                streams={availableStreams}
                onResolutionChange={handleResolutionChange}
              />
            ) : (
              <MuxPlayer
                streamType="live"
                playbackId={streamData.playbackId}
                metadata={{
                  video_title:    streamData.title,
                  viewer_user_id: streamData.viewerId,
                }}
                autoPlay
              />
            )}
          </div>

          {/* Info tambahan dari IDN Plus */}
          {idnLiveShow && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "10px 14px",
                background: "rgba(220,31,46,0.07)",
                borderRadius: "8px",
                margin: "10px 0",
                border: "1px solid rgba(220,31,46,0.15)",
              }}
            >
              {idnLiveShow.image_url && (
                <img
                  src={idnLiveShow.image_url}
                  alt={idnLiveShow.title}
                  style={{
                    width: "54px",
                    height: "54px",
                    borderRadius: "8px",
                    objectFit: "cover",
                    flexShrink: 0,
                  }}
                />
              )}
              <div>
                <div style={{ fontWeight: 700, fontSize: "14px", color: "#fff" }}>
                  {idnLiveShow.title}
                </div>
                <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.55)", marginTop: "2px" }}>
                  👁 {idnLiveShow.view_count?.toLocaleString() || 0} penonton
                  {idnLiveShow.idnliveplus?.description && (
                    <span style={{ marginLeft: "10px" }}>
                      📝 {idnLiveShow.idnliveplus.description}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {members.length > 0 && (
            <div className="members-section">
              <div className="members-header">
                <h3>Lineup Show</h3>
                <span className="member-count">{members.length} Member</span>
              </div>
              {loadingMembers ? (
                <div className="members-loading">
                  <div className="spinner"></div>
                  <p>Memuat lineup...</p>
                </div>
              ) : (
                <div className="members-grid">
                  {members.map((member) => (
                    <div key={member.id} className="member-card">
                      <img src={member.img} alt={member.name} />
                      <p>{member.name}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="stream-footer">
            <p>POWERED BY JKT48Connect</p>
          </div>
        </div>

        <div className="chat-sidebar">
          <div className="chat-header">
            <span>Live Chat</span>
            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>
              {chatMessages.length} Pesan
            </span>
          </div>

          <div className="chat-messages">
            {chatMessages.map((msg, idx) => (
              <div key={idx} className="chat-message">
                <img
                  src={msg.avatar_url || `https://ui-avatars.com/api/?name=${msg.username}`}
                  alt="avatar"
                  className="chat-avatar"
                />
                <div className="chat-message-content">
                  <div className="chat-username">
                    {msg.role && msg.role !== "member" && (
                      <span className="chat-role-badge">{msg.role}</span>
                    )}
                    {msg.username}
                    {msg.bluetick && (
                      <span
                        className="bluetick-icon"
                        title="Verified"
                        style={{ display: "inline-flex", marginLeft: "4px" }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.918-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.337 2.25c-.416-.165-.866-.25-1.336-.25-2.21 0-3.918 1.79-3.918 4 0 .495.084.965.238 1.4-1.273.65-2.148 2.02-2.148 3.6 0 1.46.726 2.75 1.83 3.444-.06.315-.09.64-.09.966 0 2.21 1.71 3.998 3.918 3.998.53 0 1.04-.1 1.51-.282.825 1.155 2.15 1.924 3.63 1.924s2.805-.767 3.63-1.924c.47.182.98.282 1.51.282 2.21 0 3.918-1.79 3.918-4 0-.325-.03-.65-.09-.966 1.105-.694 1.83-1.984 1.83-3.444z" fill="#1DA1F2"/>
                          <path d="M10.42 16.273L6.46 12.31l1.41-1.414 2.55 2.548 6.42-6.42 1.414 1.415-7.834 7.834z" fill="white"/>
                        </svg>
                      </span>
                    )}
                  </div>
                  <div className="chat-text">{msg.text_content}</div>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="chat-input-container">
            {isChatLoggingIn ? (
              <div className="chat-disabled-overlay">Memuat info akun...</div>
            ) : chatUser ? (
              <form onSubmit={handleSendMessage} className="chat-input-form">
                <input
                  type="text"
                  placeholder={`Kirim sebagai ${chatUser.username}...`}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="chat-input"
                  maxLength={200}
                />
                <button
                  type="submit"
                  className="chat-send-btn"
                  disabled={!chatInput.trim()}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                </button>
              </form>
            ) : (
              <div className="chat-disabled-overlay">
                Hanya bisa melihat chat.<br />
                <a
                  href="/login"
                  onClick={(e) => { e.preventDefault(); navigate("/login"); }}
                >
                  Login JKT48Connect
                </a>{" "}
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
