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

const HARUKAZE_API = "https://v5.jkt48connect.com/api/harukaze";
const HARUKAZE_KEY = "JKTCONNECT";

const harukazeFetch = async (path, opts = {}) => {
  const url = `${HARUKAZE_API}${path}${path.includes("?") ? "&" : "?"}apikey=${HARUKAZE_KEY}`;
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
  return res.json();
};

// ── GiStream token constants ──────────────────────────────────────────────────
const TOKEN_API_BASE = "https://v5.jkt48connect.com";
const STREAM_BASE    = "https://v1.jkt48connect.app";
const SIGNING_PATH   = "/api/token/generate?apikey=JKTCONNECT";
const PARTNER_KID    = "jkt48connect-v1";
const PARTNER_SECRET = "gstream@jkt48connect@2108";

// ── HMAC helpers (browser SubtleCrypto) ──────────────────────────────────────
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
  return {
    "x-kid":       PARTNER_KID,
    "x-timestamp": timestamp,
    "x-nonce":     nonce,
    "x-signature": signature,
  };
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

async function getStreamURL(token, slugOrId, isSlug) {
  const param = isSlug ? `slug=${slugOrId}` : `showId=${slugOrId}`;
  const res = await fetch(`${STREAM_BASE}/stream?${param}`, {
    headers: {
      "x-api-token": token,
      ...(isSlug ? { "x-slug": slugOrId } : { "x-showid": slugOrId }),
    },
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`stream non-JSON (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }

  if (!data.success) {
    throw new Error(
      `stream gagal: ${data.message || JSON.stringify(data).slice(0, 300)}`
    );
  }

  const streams = data.streams || [];

  const sorted = streams
    .filter((s) => s && typeof s.url === "string" && s.url.length > 0)
    .sort((a, b) => {
      const bwA = parseInt((a.BANDWIDTH || "0").split(",")[0]);
      const bwB = parseInt((b.BANDWIDTH || "0").split(",")[0]);
      return bwB - bwA;
    });

  if (sorted.length === 0) {
    throw new Error(
      `Streams kosong. streams.length=${streams.length}. Response: ${JSON.stringify(data).slice(0, 400)}`
    );
  }

  const autoUrl = data.stream_url || sorted[0]?.url || "";

  const qualities = sorted.map((s, idx) => {
    const bw = parseInt((s.BANDWIDTH || "0").split(",")[0]);
    return {
      index:           idx,
      name:            s.NAME || `q${idx}`,
      quality:         s.NAME || `q${idx}`,
      bandwidth:       bw,
      bandwidth_label: bw
        ? bw >= 1_000_000
          ? (bw / 1_000_000).toFixed(1) + " Mbps"
          : Math.round(bw / 1_000) + " Kbps"
        : "",
      resolution:   s.RESOLUTION || "",
      fps:          s["FRAME-RATE"] || "",
      manual_url:   s.url || "",
      playlist_url: s.url || "",
    };
  });

  return { url: autoUrl, qualities };
}

// ── FIX: default to slug unless param is clearly a numeric showId ─────────────
const isSlugParam = (param) => {
  if (!param) return false;
  // Pure numeric = showId (e.g. "123456")
  if (/^\d+$/.test(param)) return false;
  // SH-prefixed numeric = showId (e.g. "SH123456")
  if (/^SH\d+$/i.test(param)) return false;
  // Everything else is a slug (date-based, name-based, etc.)
  return true;
};

// ── HLS Player ─────────────────────────────────────────────────────────────────
function HlsPlayer({ src, title, streams, onResolutionChange, token }) {
  const videoRef = useRef(null);
  const hlsRef   = useRef(null);
  const retryRef = useRef(null);
  const [showQualityPanel, setShowQualityPanel] = useState(false);
  const [currentLevelName, setCurrentLevelName] = useState("Auto");
  const [bandwidth, setBandwidth]               = useState("");

  const destroyHls = useCallback(() => {
    if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    destroyHls();

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker:                true,
        lowLatencyMode:              false,
        maxBufferLength:             30,
        maxMaxBufferLength:          60,
        maxBufferSize:               60 * 1000 * 1000,
        backBufferLength:            30,
        liveSyncDurationCount:       3,
        liveMaxLatencyDurationCount: 10,
        liveDurationInfinity:        true,
        fragLoadingTimeOut:          10000,
        fragLoadingMaxRetry:         6,
        fragLoadingRetryDelay:       1000,
        fragLoadingMaxRetryTimeout:  8000,
        manifestLoadingTimeOut:      10000,
        manifestLoadingMaxRetry:     4,
        manifestLoadingRetryDelay:   1000,
        levelLoadingTimeOut:         10000,
        levelLoadingMaxRetry:        4,
        levelLoadingRetryDelay:      1000,
        abrEwmaDefaultEstimate:      500_000,
        abrBandWidthFactor:          0.8,
        abrBandWidthUpFactor:        0.7,
        abrEwmaFastLive:             3.0,
        abrEwmaSlowLive:             9.0,
        nudgeOffset:                 0.3,
        nudgeMaxRetry:               5,
        ...(token && {
          xhrSetup: (xhr) => {
            xhr.setRequestHeader("x-api-token", token);
          },
          fetchSetup: (context, initParams) => {
            initParams.headers = { ...initParams.headers, "x-api-token": token };
            return new Request(context.url, initParams);
          },
        }),
      });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        const lvl = hls.levels[data.level];
        if (lvl) {
          setCurrentLevelName(lvl.name || `${lvl.height}p`);
          const bw = hls.bandwidthEstimate;
          if (bw > 0) setBandwidth(
            bw >= 1_000_000
              ? (bw / 1_000_000).toFixed(1) + " Mbps"
              : Math.round(bw / 1_000) + " Kbps"
          );
        }
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
        } else {
          destroyHls();
          retryRef.current = setTimeout(() => {
            const v = videoRef.current;
            if (!v) return;
            const newHls = new Hls({
              lowLatencyMode:  false,
              maxBufferLength: 30,
              ...(token && {
                xhrSetup: (xhr) => { xhr.setRequestHeader("x-api-token", token); },
                fetchSetup: (context, initParams) => {
                  initParams.headers = { ...initParams.headers, "x-api-token": token };
                  return new Request(context.url, initParams);
                },
              }),
            });
            newHls.loadSource(src);
            newHls.attachMedia(v);
            newHls.on(Hls.Events.MANIFEST_PARSED, () => v.play().catch(() => {}));
            hlsRef.current = newHls;
          }, 2000);
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.addEventListener("loadedmetadata", () => { video.play().catch(() => {}); });
    }

    return destroyHls;
  }, [src, token, destroyHls]);

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
          <button
            onClick={() => setShowQualityPanel(p => !p)}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "6px 12px", borderRadius: "8px",
              background: "rgba(0,0,0,0.8)", color: "#fff",
              fontSize: "11px", fontWeight: 700, cursor: "pointer",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            ⚙ Auto ({currentLevelName})
            {bandwidth && <span style={{ opacity: 0.5, fontSize: "10px" }}>· {bandwidth}</span>}
          </button>
          {showQualityPanel && (
            <div style={{
              position: "absolute", bottom: "calc(100% + 8px)", right: 0,
              background: "rgba(17,17,27,0.97)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "12px", padding: "8px", minWidth: "180px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            }}>
              <p style={{ fontSize: "9px", fontWeight: 700, color: "rgba(255,255,255,0.3)", padding: "0 8px 8px", textTransform: "uppercase", letterSpacing: "1px", margin: 0 }}>Kualitas</p>
              {streams.map((q, i) => (
                <button
                  key={i}
                  onClick={() => { onResolutionChange(q); setShowQualityPanel(false); }}
                  style={{
                    width: "100%", padding: "8px 10px", borderRadius: "8px",
                    border: "none", background: "transparent",
                    color: "rgba(255,255,255,0.7)", fontSize: "12px",
                    cursor: "pointer", textAlign: "left",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}
                >
                  <span>{q.name}</span>
                  <span style={{ fontSize: "10px", opacity: 0.5 }}>{q.bandwidth_label}</span>
                </button>
              ))}
            </div>
          )}
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

  const [hlsUrl,          setHlsUrl]          = useState("");
  const [isSlugMode,      setIsSlugMode]       = useState(false);
  const [availableStreams, setAvailableStreams] = useState([]);
  const [streamToken,     setStreamToken]      = useState("");

  const [idnLiveShow,     setIdnLiveShow]     = useState(null);
  const [fetchingIdnShow, setFetchingIdnShow] = useState(false);

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

  const fetchIdnPlusLiveShowId = useCallback(async () => {
    setFetchingIdnShow(true);
    try {
      const res  = await fetch(`https://v5.jkt48connect.com/api/jkt48/idnplus?apikey=${API_KEY}`);
      const data = await res.json();
      if (!data || data.status !== 200 || !Array.isArray(data.data)) {
        setFetchingIdnShow(false); return null;
      }
      const liveShow = data.data.find((show) => show.status === "live");
      if (!liveShow) { setFetchingIdnShow(false); return null; }
      setIdnLiveShow(liveShow);
      setFetchingIdnShow(false);
      return liveShow.showId || null;
    } catch (e) {
      console.error("fetchIdnPlusLiveShowId error:", e);
      setFetchingIdnShow(false); return null;
    }
  }, []);

  const verifyAccess = async () => {
    if (!verificationData.email) { setVerificationError("Email wajib diisi"); return; }
    setVerifying(true); setVerificationError("");
    try {
      const verifyRes = await harukazeFetch("/verify", {
        method: "POST", body: JSON.stringify({ email: verificationData.email }),
      });
      if (!verifyRes.status || !verifyRes.has_access) {
        setVerificationError(verifyRes.message || "Email tidak memiliki akses valid");
        setVerifying(false); return;
      }
      const useRes = await harukazeFetch("/use", {
        method: "POST", body: JSON.stringify({ email: verificationData.email }),
      });
      if (!useRes.status) {
        setVerificationError(useRes.message || "Gagal menggunakan akses");
        setVerifying(false); return;
      }
      localStorage.setItem("stream_verification", JSON.stringify({
        email: verificationData.email, accessId: useRes.data?.id,
        timestamp: Date.now(), verified: true,
      }));
      setIsVerified(true); setShowVerification(false); setVerifying(false);
    } catch {
      setVerificationError("Terjadi kesalahan saat verifikasi. Silakan coba lagi.");
      setVerifying(false);
    }
  };

  const checkExistingVerification = async () => {
    const stored = localStorage.getItem("stream_verification");
    if (!stored) { setShowVerification(true); return false; }
    try {
      const info = JSON.parse(stored);
      if (!info.verified || !info.timestamp || !info.email) {
        localStorage.removeItem("stream_verification"); setShowVerification(true); return false;
      }
      const hoursDiff = (Date.now() - info.timestamp) / (1000 * 60 * 60);
      if (hoursDiff > 5) {
        localStorage.removeItem("stream_verification"); setShowVerification(true); return false;
      }
      const verifyRes = await harukazeFetch("/verify", {
        method: "POST", body: JSON.stringify({ email: info.email }),
      });
      if (!verifyRes.status || !verifyRes.has_access) {
        localStorage.removeItem("stream_verification"); setShowVerification(true); return false;
      }
      setIsVerified(true); setShowVerification(false);
      setVerificationData({ email: info.email, code: "" });
      return true;
    } catch {
      localStorage.removeItem("stream_verification"); setShowVerification(true); return false;
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

  const fetchShowStream = useCallback(async (showId) => {
    try {
      const token = await generateStreamToken(showId, false);
      setStreamToken(token);
      const { url, qualities } = await getStreamURL(token, showId, false);
      if (qualities.length > 0) setAvailableStreams(qualities);
      if (!url) return null;
      return { url, title: showId, showId, token };
    } catch (e) {
      console.error("fetchShowStream error:", e); return null;
    }
  }, []);

  const loadStreamData = useCallback(async () => {
    try {
      setLoading(true); setError("");
      if (!playbackId) { setError("Playback ID tidak ditemukan"); setLoading(false); return; }

      const slugMode = isSlugParam(playbackId);
      setIsSlugMode(slugMode);

      fetchNearestShow().then((nearestShow) => {
        if (nearestShow) {
          setShowInfo({ title: nearestShow.title, showId: nearestShow.id });
          fetchShowMembers(nearestShow.id);
        }
      }).catch(() => {});

      const isSlug = slugMode;
      const token = await generateStreamToken(playbackId, isSlug);
      setStreamToken(token);

      const { url, qualities } = await getStreamURL(token, playbackId, isSlug);

      if (qualities.length > 0) setAvailableStreams(qualities);
      if (!url) throw new Error("Stream URL kosong setelah fetch berhasil");

      setHlsUrl(url);
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

  const handleResolutionChange = (quality) => {
    if (!quality?.manual_url) return;
    setHlsUrl(quality.manual_url);
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
    setStreamToken(""); setVerificationData({ email: "", code: "" }); setIdnLiveShow(null);
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
            <p>Masukkan email yang sudah didaftarkan untuk mengakses live stream</p>
            <form onSubmit={handleVerificationSubmit}>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email" name="email"
                  value={verificationData.email}
                  onChange={handleInputChange}
                  placeholder="email@example.com"
                  required
                />
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
                <li>Email harus terdaftar dan memiliki akses aktif</li>
                <li>Setiap verifikasi akan menggunakan 1 slot akses</li>
                <li>Akses berlaku selama 5 jam</li>
                <li>Session tetap aktif saat refresh halaman</li>
                <li>
                  Punya membership monthly?{" "}
                  <span style={{ color: "#DC1F2E", cursor: "pointer", fontWeight: 700 }} onClick={() => navigate("/login")}>
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

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-content">
          <div className="spinner-large"></div>
          <h2>Memuat live stream...</h2>
          <p>Mengambil informasi show...</p>
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
          <details style={{ marginTop: "12px", textAlign: "left", maxWidth: "500px", width: "100%" }}>
            <summary style={{ cursor: "pointer", color: "#DC1F2E", fontSize: "12px", fontWeight: 700 }}>
              ▼ Detail Error
            </summary>
            <pre style={{
              fontSize: "11px", color: "rgba(255,255,255,0.5)",
              background: "rgba(255,255,255,0.05)", padding: "10px",
              borderRadius: "8px", marginTop: "8px",
              whiteSpace: "pre-wrap", wordBreak: "break-all",
            }}>
              {error}
            </pre>
          </details>
          <button onClick={() => { setError(""); loadStreamData(); }} className="back-button" style={{ marginBottom: "10px", marginTop: "16px" }}>
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
        {(idnLiveShow || showInfo) && (
          <div className="show-title">
            <span>{idnLiveShow?.title || showInfo?.title}</span>
            {idnLiveShow && (
              <span style={{
                marginLeft: "8px", background: "#DC1F2E", color: "#fff",
                fontSize: "10px", fontWeight: 700, padding: "2px 7px",
                borderRadius: "8px", letterSpacing: "1px", verticalAlign: "middle",
              }}>LIVE</span>
            )}
          </div>
        )}
        {!hasMonthlymember && (
          <button onClick={handleLogout} className="logout-btn">Logout</button>
        )}
        {hasMonthlymember && (
          <div style={{
            display: "flex", alignItems: "center", gap: "6px",
            background: "#DC1F2E18", border: "1px solid #DC1F2E40",
            borderRadius: "20px", padding: "4px 12px",
            fontSize: "12px", fontWeight: 700, color: "#DC1F2E",
          }}>★ MONTHLY</div>
        )}
      </div>

      <div className="stream-layout">
        <div className="main-content">
          <div className="player-container">
            {hlsUrl ? (
              <HlsPlayer
                src={hlsUrl}
                title={idnLiveShow?.title || streamData.title}
                streams={availableStreams}
                onResolutionChange={handleResolutionChange}
                token={streamToken}
              />
            ) : (
              <div style={{
                width: "100%", aspectRatio: "16/9", background: "#0e0e1a",
                borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <div style={{ textAlign: "center", color: "#7878a8" }}>
                  <div className="spinner-large" style={{ margin: "0 auto 12px" }} />
                  <p style={{ fontSize: "13px" }}>Menghubungkan ke stream...</p>
                </div>
              </div>
            )}
          </div>

          {idnLiveShow && (
            <div style={{
              display: "flex", alignItems: "center", gap: "12px",
              padding: "10px 14px", background: "rgba(220,31,46,0.07)",
              borderRadius: "8px", margin: "10px 0",
              border: "1px solid rgba(220,31,46,0.15)",
            }}>
              {idnLiveShow.image_url && (
                <img src={idnLiveShow.image_url} alt={idnLiveShow.title}
                  style={{ width: "54px", height: "54px", borderRadius: "8px", objectFit: "cover", flexShrink: 0 }}
                />
              )}
              <div>
                <div style={{ fontWeight: 700, fontSize: "14px", color: "#fff" }}>{idnLiveShow.title}</div>
                <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.55)", marginTop: "2px" }}>
                  👁 {idnLiveShow.view_count?.toLocaleString() || 0} penonton
                  {idnLiveShow.idnliveplus?.description && (
                    <span style={{ marginLeft: "10px" }}>📝 {idnLiveShow.idnliveplus.description}</span>
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
                <div className="members-loading"><div className="spinner"></div><p>Memuat lineup...</p></div>
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

          <div className="stream-footer"><p>POWERED BY JKT48Connect</p></div>
        </div>

        <div className="chat-sidebar">
          <div className="chat-header">
            <span>Live Chat</span>
            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>{chatMessages.length} Pesan</span>
          </div>
          <div className="chat-messages">
            {chatMessages.map((msg, idx) => (
              <div key={idx} className="chat-message">
                <img
                  src={msg.avatar_url || `https://ui-avatars.com/api/?name=${msg.username}`}
                  alt="avatar" className="chat-avatar"
                />
                <div className="chat-message-content">
                  <div className="chat-username">
                    {msg.role && msg.role !== "member" && (
                      <span className="chat-role-badge">{msg.role}</span>
                    )}
                    {msg.username}
                    {msg.bluetick && (
                      <span className="bluetick-icon" title="Verified" style={{ display: "inline-flex", marginLeft: "4px" }}>
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
                <button type="submit" className="chat-send-btn" disabled={!chatInput.trim()}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                </button>
              </form>
            ) : (
              <div className="chat-disabled-overlay">
                Hanya bisa melihat chat.<br />
                <a href="/login" onClick={(e) => { e.preventDefault(); navigate("/login"); }}>
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
