import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";

// ─── Constants ────────────────────────────────────────────────────────────────
const ADMIN_USER       = "JKT48Connect";
const ADMIN_PASS       = "21082007";
const API_BASE         = "https://v2.jkt48connect.com/api/jkt48";
const API_KEY          = "JKTCONNECT";
const PLAYLIST_POLL_MS = 3_000;

// ─── Server 2 Constants ───────────────────────────────────────────────────────
const STREAM2_API     = `${API_BASE}/live/stream`;
const STREAM2_SHOW_ID = "SH1D7B";

// ─── Proxy Constants ──────────────────────────────────────────────────────────
const STREAM_PROXY_BASE = "https://stream.jkt48connect.com/hls/";

// ─── Proxy Helper ─────────────────────────────────────────────────────────────
function proxyStreamUrl(url) {
  if (!url) return url;
  if (url.startsWith(STREAM_PROXY_BASE)) return url;
  return STREAM_PROXY_BASE + encodeURIComponent(url);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function charmapToString(obj) {
  return Object.keys(obj)
    .filter((k) => !isNaN(k))
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => obj[k])
    .join("");
}

function isCharmap(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  const keys = Object.keys(obj);
  return keys.length > 0 && keys.every((k) => !isNaN(k));
}

function parseM3U8(m3u8) {
  const lines   = m3u8.split("\n").map((l) => l.trim()).filter(Boolean);
  const session = {};
  const streams = [];
  let current   = null;

  for (const line of lines) {
    if (line.startsWith("#EXT-X-SESSION-DATA:")) {
      const id  = (line.match(/DATA-ID="([^"]+)"/)  || [])[1];
      const val = (line.match(/VALUE="([^"]+)"/)    || [])[1];
      if (id && val !== undefined) session[id] = val;
      continue;
    }
    if (line.startsWith("#EXT-X-MEDIA:")) {
      current = {};
      const get = (re) => (line.match(re) || [])[1];
      current.TYPE        = get(/TYPE=([^,\n]+)/);
      current["GROUP-ID"] = get(/GROUP-ID="([^"]+)"/);
      current.NAME        = get(/NAME="([^"]+)"/);
      current.AUTOSELECT  = get(/AUTOSELECT=([^,\n]+)/);
      current.DEFAULT     = get(/DEFAULT=([^,\n]+)/);
      continue;
    }
    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      if (!current) current = {};
      const get = (re) => (line.match(re) || [])[1];
      current.BANDWIDTH     = get(/BANDWIDTH=(\d+)/);
      current.RESOLUTION    = get(/RESOLUTION=([^\s,]+)/);
      current.CODECS        = get(/CODECS="([^"]+)"/);
      current.VIDEO         = get(/VIDEO="([^"]+)"/);
      current["FRAME-RATE"] = get(/FRAME-RATE=([\d.]+)/);
      continue;
    }
    if (!line.startsWith("#") && current && current.BANDWIDTH) {
      current.url = line;
      streams.push(current);
      current = null;
    }
  }

  return { session, streams };
}

function resolveStreamResponse(data) {
  if (data && Array.isArray(data.streams) && data.streams.length)
    return { session: data.session || {}, streams: data.streams, raw: data };

  if (isCharmap(data)) {
    const str = charmapToString(data).trim();
    if (str.startsWith("#EXTM3U")) {
      const parsed = parseM3U8(str);
      return { ...parsed, raw: { success: true, ...parsed } };
    }
    try { return resolveStreamResponse(JSON.parse(str)); }
    catch { return { session: {}, streams: [], raw: { raw_string: str } }; }
  }

  const flatUrl =
    data?.stream_url || data?.data?.stream_url ||
    data?.playback_url || data?.data?.playback_url ||
    data?.url || null;

  if (flatUrl)
    return { session: {}, streams: [{ NAME: "default", BANDWIDTH: "0", url: flatUrl }], raw: data };

  return { session: {}, streams: [], raw: data };
}

// ─── Server 2: Direct fetch dari JKT48Connect stream API ─────────────────────
async function fetchStream2Direct(showId = STREAM2_SHOW_ID) {
  const url = `${STREAM2_API}?apikey=${API_KEY}&showId=${encodeURIComponent(showId)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Stream2 HTTP ${res.status}`);
  const data = await res.json();

  if (!data.success) throw new Error(data.message || "Stream2 API error");

  let streams = [];

  if (Array.isArray(data.streams) && data.streams.length) {
    streams = [...data.streams].sort(
      (a, b) => Number(b.BANDWIDTH || 0) - Number(a.BANDWIDTH || 0)
    );
  } else if (data.stream_url) {
    streams = [{ NAME: "default", BANDWIDTH: "0", url: data.stream_url }];
  }

  if (!streams.length) throw new Error("Server 2: tidak ada stream URL ditemukan");

  return {
    streams,
    session: data.session || {},
    showId: data.showId || showId,
    tokenId: data.tokenId || null,
  };
}

// ─── Date / Time Helpers ──────────────────────────────────────────────────────
function tsToDate(ts) {
  if (!ts) return null;
  const n = Number(ts);
  return new Date(n < 1e12 ? n * 1000 : n);
}

function todayWIB() {
  const now = new Date(Date.now() + 7 * 3600 * 1000);
  return now.toISOString().slice(0, 10);
}

function slugMatchesToday(slug) {
  if (!slug) return false;
  const today = todayWIB();
  const match = slug.match(/(\d{4}-\d{2}-\d{2})/g);
  if (!match) return false;
  return match.some((d) => d === today);
}

function itemMatchesToday(item) {
  if (slugMatchesToday(item.slug)) return true;
  const candidates = [item.scheduled_at, item.live_at, item.end_at].filter(Boolean);
  const today = todayWIB();
  return candidates.some((ts) => {
    const d = tsToDate(ts);
    if (!d) return false;
    const wib = new Date(d.getTime() + 7 * 3600 * 1000);
    return wib.toISOString().slice(0, 10) === today;
  });
}

// ─── HLS Player ───────────────────────────────────────────────────────────────
function HLSPlayer({ src, title, pollUrl }) {
  const videoRef = useRef(null);
  const hlsRef   = useRef(null);
  const pollRef  = useRef(null);
  const srcRef   = useRef(src);
  const [status, setStatus] = useState("loading");

  const initHls = useCallback(async (url, video, resumeTime = 0) => {
    if (!url || !video) return;
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      if (resumeTime > 0) video.currentTime = resumeTime;
      video.play().then(() => setStatus("playing")).catch(() => setStatus("error"));
      return;
    }

    try {
      const Hls = (await import("hls.js")).default;
      if (!Hls.isSupported()) { setStatus("error"); return; }

      const hls = new Hls({
        enableWorker:          true,
        lowLatencyMode:        true,
        liveSyncDurationCount: 3,
        liveDurationInfinity:  true,
      });
      hlsRef.current = hls;

      hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) setStatus("error"); });
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (resumeTime > 0) video.currentTime = resumeTime;
        video.play().then(() => setStatus("playing")).catch(() => {});
      });

      hls.loadSource(url);
      hls.attachMedia(video);
    } catch { setStatus("error"); }
  }, []);

  useEffect(() => {
    if (!src || !videoRef.current) return;
    srcRef.current = src;
    setStatus("loading");
    initHls(src, videoRef.current, 0);
    return () => {
      clearInterval(pollRef.current);
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    };
  }, [src, initHls]);

  useEffect(() => {
    if (!pollUrl || !src) return;
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const video = videoRef.current;
      const hls   = hlsRef.current;
      if (!video || !hls) return;
      try {
        const newUrl = await pollUrl();
        if (!newUrl) return;
        if (newUrl === srcRef.current) {
          hls.loadSource(newUrl);
        } else {
          const resumeTime = video.currentTime || 0;
          srcRef.current = newUrl;
          await initHls(newUrl, video, resumeTime);
        }
      } catch (_) {}
    }, PLAYLIST_POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [src, pollUrl, initHls]);

  return (
    <div style={{ position: "relative", width: "100%", background: "#000", borderRadius: "12px", overflow: "hidden" }}>
      {status === "loading" && (
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          flexDirection: "column", alignItems: "center", justifyContent: "center",
          background: "#0a0a0a", zIndex: 2, gap: 12,
        }}>
          <div style={{
            width: 44, height: 44, border: "3px solid #DC1F2E33",
            borderTop: "3px solid #DC1F2E", borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }} />
          <span style={{ color: "#888", fontSize: 13 }}>Memuat stream…</span>
        </div>
      )}
      {status === "error" && (
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          flexDirection: "column", alignItems: "center", justifyContent: "center",
          background: "#0a0a0a", zIndex: 2, gap: 8,
        }}>
          <span style={{ fontSize: 36 }}>⚠️</span>
          <span style={{ color: "#DC1F2E", fontWeight: 700 }}>Gagal memuat stream</span>
          <span style={{ color: "#555", fontSize: 12 }}>Coba refresh atau pilih kualitas lain</span>
        </div>
      )}
      <video
        ref={videoRef}
        controls
        style={{ width: "100%", display: "block", maxHeight: "56.25vw", background: "#000" }}
        playsInline
        title={title}
      />
    </div>
  );
}

// ─── Server Badge ─────────────────────────────────────────────────────────────
function ServerBadge({ server, onChange }) {
  return (
    <div className="al-server-toggle">
      <span className="al-server-label">Server:</span>
      <div className="al-server-pills">
        <button
          className={`al-server-pill ${server === 1 ? "active" : ""}`}
          onClick={() => onChange(1)}
        >
          <span className="al-server-dot s1" />
          Server 1
          <em>JKTConnect</em>
        </button>
        <button
          className={`al-server-pill ${server === 2 ? "active" : ""}`}
          onClick={() => onChange(2)}
        >
          <span className="al-server-dot s2" />
          Server 2
          <em>IDN Stream</em>
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AdminLive() {
  const navigate = useNavigate();

  const [authed,        setAuthed]        = useState(false);
  const [loginForm,     setLoginForm]     = useState({ username: "", password: "" });
  const [loginError,    setLoginError]    = useState("");
  const [loginLoading,  setLoginLoading]  = useState(false);

  const [shows,         setShows]         = useState([]);
  const [showsLoading,  setShowsLoading]  = useState(false);
  const [showsError,    setShowsError]    = useState("");

  const [selectedSlug,  setSelectedSlug]  = useState(null);
  const [selectedShow,  setSelectedShow]  = useState(null);

  const [activeServer,  setActiveServer]  = useState(1);
  const [streamData,    setStreamData]    = useState(null);
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamError,   setStreamError]   = useState("");
  const [activeStream,  setActiveStream]  = useState(null);

  // Server 2 extra info
  const [stream2Info,   setStream2Info]   = useState(null);

  const activeStreamRef  = useRef(null);
  const selectedSlugRef  = useRef(null);
  const activeServerRef  = useRef(1);

  // ── Restore session ──────────────────────────────────────────────────────
  useEffect(() => {
    const saved = sessionStorage.getItem("adminlive_auth");
    if (saved === "1") setAuthed(true);
  }, []);

  // ── Fetch shows ──────────────────────────────────────────────────────────
  const fetchShows = useCallback(async () => {
    setShowsLoading(true);
    setShowsError("");
    try {
      const res  = await fetch(`${API_BASE}/idnplus?apikey=${API_KEY}`);
      const json = await res.json();
      const list = json.data || [];
      const todayItems = list.filter(itemMatchesToday);
      setShows(todayItems.length ? todayItems : list);
      if (todayItems.length) {
        setSelectedSlug(todayItems[0].slug);
        setSelectedShow(todayItems[0]);
      }
    } catch (e) {
      setShowsError("Gagal mengambil daftar show: " + e.message);
    } finally {
      setShowsLoading(false);
    }
  }, []);

  useEffect(() => { if (authed) fetchShows(); }, [authed, fetchShows]);

  // ── Server 1: Fetch stream dari JKTConnect API ────────────────────────────
  const fetchStreamFromApi = useCallback(async (slug) => {
    const res      = await fetch(`${API_BASE}/live/show?slug=${encodeURIComponent(slug)}&apikey=${API_KEY}`);
    const raw      = await res.json();
    const resolved = resolveStreamResponse(raw);
    if (!resolved.streams.length) return null;

    const proxiedStreams = resolved.streams.map((s) => {
      const decodedUrl = s.stream_url_decoded || s.url;
      return { ...s, url: proxyStreamUrl(decodedUrl) };
    });

    const sorted = [...proxiedStreams].sort(
      (a, b) => Number(b.BANDWIDTH || 0) - Number(a.BANDWIDTH || 0)
    );
    return { streams: proxiedStreams, session: resolved.session, sorted };
  }, []);

  // ── Server 2: Direct fetch ────────────────────────────────────────────────
  const fetchStream2 = useCallback(async () => {
    const result = await fetchStream2Direct(STREAM2_SHOW_ID);
    return {
      streams: result.streams,
      session: result.session,
      sorted:  result.streams,
      showId:  result.showId,
      tokenId: result.tokenId,
    };
  }, []);

  // ── pollUrl Server 1 ──────────────────────────────────────────────────────
  const pollUrlServer1 = useCallback(async () => {
    const slug = selectedSlugRef.current;
    if (!slug) return null;
    const result = await fetchStreamFromApi(slug);
    if (!result) return null;
    const currentName = activeStreamRef.current?.NAME;
    const match  = result.streams.find((s) => s.NAME === currentName);
    const target = match || result.sorted[0];
    setStreamData({ streams: result.streams, session: result.session });
    return target?.url ?? null;
  }, [fetchStreamFromApi]);

  // ── pollUrl Server 2 ──────────────────────────────────────────────────────
  const pollUrlServer2 = useCallback(async () => {
    if (activeServerRef.current !== 2) return null;
    try {
      const result = await fetchStream2Direct(STREAM2_SHOW_ID);
      const currentName = activeStreamRef.current?.NAME;
      const match  = result.streams.find((s) => s.NAME === currentName);
      const target = match || result.streams[0];
      setStreamData({ streams: result.streams, session: result.session });
      return target?.url ?? null;
    } catch {
      return null;
    }
  }, []);

  const pollUrl = activeServer === 2 ? pollUrlServer2 : pollUrlServer1;

  // ── Load stream saat slug atau server berubah ─────────────────────────────
  useEffect(() => {
    if (!selectedSlug && activeServer === 1) return;

    selectedSlugRef.current = selectedSlug;
    activeServerRef.current = activeServer;
    activeStreamRef.current = null;

    let cancelled = false;

    const load = async () => {
      setStreamLoading(true);
      setStreamError("");
      setStreamData(null);
      setActiveStream(null);
      setStream2Info(null);

      try {
        let result;
        if (activeServer === 2) {
          result = await fetchStream2();
          if (!cancelled) {
            setStream2Info({
              showId:  result.showId,
              tokenId: result.tokenId,
            });
          }
        } else {
          if (!selectedSlug) { setStreamLoading(false); return; }
          result = await fetchStreamFromApi(selectedSlug);
        }

        if (cancelled) return;
        if (!result) { setStreamError("Stream URL tidak tersedia."); return; }

        const best = result.sorted[0];
        activeStreamRef.current = best;
        setStreamData({ streams: result.streams, session: result.session });
        setActiveStream(best);

      } catch (e) {
        if (!cancelled) setStreamError(e.message);
      } finally {
        if (!cancelled) setStreamLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSlug, activeServer]);

  // ── Pilih resolusi manual ─────────────────────────────────────────────────
  const handlePickQuality = (stream) => {
    activeStreamRef.current = stream;
    setActiveStream(stream);
  };

  // ── Ganti server ──────────────────────────────────────────────────────────
  const handleServerChange = (serverNum) => {
    if (serverNum === activeServer) return;
    setActiveServer(serverNum);
    activeServerRef.current = serverNum;
    setStreamData(null);
    setActiveStream(null);
    setStreamError("");
    setStream2Info(null);
  };

  // ── Retry ─────────────────────────────────────────────────────────────────
  const handleRetry = () => {
    if (activeServer === 2) {
      setStreamData(null);
      setActiveStream(null);
      setStreamError("");
      setStream2Info(null);
      const sv = activeServer;
      setActiveServer(0);
      setTimeout(() => setActiveServer(sv), 50);
    } else {
      const s = selectedSlug;
      setSelectedSlug(null);
      setTimeout(() => setSelectedSlug(s), 50);
    }
  };

  // ── Login / Logout ────────────────────────────────────────────────────────
  const handleLogin = (e) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    setTimeout(() => {
      if (loginForm.username === ADMIN_USER && loginForm.password === ADMIN_PASS) {
        sessionStorage.setItem("adminlive_auth", "1");
        setAuthed(true);
      } else {
        setLoginError("Username atau password salah.");
      }
      setLoginLoading(false);
    }, 600);
  };

  const handleLogout = () => {
    sessionStorage.removeItem("adminlive_auth");
    setAuthed(false);
    setShows([]);
    setStreamData(null);
    setSelectedSlug(null);
    setStream2Info(null);
    selectedSlugRef.current = null;
    activeStreamRef.current = null;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // LOGIN SCREEN
  // ─────────────────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <>
        <style>{globalStyles}</style>
        <div className="al-login-bg">
          <div className="al-noise" />
          <div className="al-login-card">
            <div className="al-logo">
              <span className="al-logo-icon">⬡</span>
              <span className="al-logo-text">ADMIN<em>LIVE</em></span>
            </div>
            <p className="al-login-sub">JKT48Connect Internal Panel</p>
            <form onSubmit={handleLogin} className="al-form">
              <div className="al-field">
                <label>Username</label>
                <input
                  type="text"
                  autoComplete="username"
                  value={loginForm.username}
                  onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                  placeholder="Enter username"
                  required
                />
              </div>
              <div className="al-field">
                <label>Password</label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  placeholder="Enter password"
                  required
                />
              </div>
              {loginError && <div className="al-error">{loginError}</div>}
              <button type="submit" className="al-btn-primary" disabled={loginLoading}>
                {loginLoading ? <span className="al-spin" /> : "→ MASUK"}
              </button>
            </form>
          </div>
        </div>
      </>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DASHBOARD
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{globalStyles}</style>
      <div className="al-dashboard">
        <div className="al-noise" />

        <header className="al-header">
          <div className="al-header-left">
            <span className="al-logo-icon sm">⬡</span>
            <span className="al-header-title">ADMINLIVE</span>
            <span className="al-badge">ADMIN</span>
          </div>
          <div className="al-header-right">
            <span className="al-today">📅 {todayWIB()} WIB</span>
            <button className="al-btn-ghost" onClick={() => navigate(-1)}>← Back</button>
            <button className="al-btn-danger" onClick={handleLogout}>Logout</button>
          </div>
        </header>

        <div className="al-content">
          <aside className="al-sidebar">
            <div className="al-sidebar-head">
              <h2>Show Hari Ini</h2>
              <button className="al-btn-ghost sm" onClick={fetchShows} disabled={showsLoading} title="Refresh">
                {showsLoading ? <span className="al-spin sm" /> : "↻"}
              </button>
            </div>

            {showsError && <div className="al-error">{showsError}</div>}

            {showsLoading && !shows.length && (
              <div className="al-placeholder">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="al-skeleton" style={{ height: 80, marginBottom: 10 }} />
                ))}
              </div>
            )}

            {!showsLoading && !shows.length && !showsError && (
              <div className="al-empty">Tidak ada show ditemukan untuk hari ini.</div>
            )}

            <div className="al-show-list">
              {shows.map((item) => {
                const isActive  = item.slug === selectedSlug;
                const schedDate = tsToDate(item.scheduled_at || item.live_at);
                const timeStr   = schedDate
                  ? new Date(schedDate.getTime() + 7 * 3600 * 1000)
                      .toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
                  : "—";

                return (
                  <button
                    key={item.slug}
                    className={`al-show-card ${isActive ? "active" : ""}`}
                    onClick={() => { setSelectedSlug(item.slug); setSelectedShow(item); }}
                  >
                    <img
                      src={item.image_url || item.creator?.image_url}
                      alt={item.title}
                      className="al-show-thumb"
                      onError={(e) => { e.target.style.display = "none"; }}
                    />
                    <div className="al-show-info">
                      <span className="al-show-title">{item.title}</span>
                      <span className="al-show-meta">
                        <span className={`al-dot ${item.status}`} />
                        {item.status === "live" ? "LIVE" : item.status === "scheduled" ? `⏰ ${timeStr}` : item.status}
                      </span>
                      <span className="al-show-slug">{item.slug}</span>
                    </div>
                    {isActive && <span className="al-active-indicator">▶</span>}
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="al-main">
            {!selectedSlug && activeServer === 1 ? (
              <div className="al-no-select">
                <span style={{ fontSize: 48 }}>📺</span>
                <p>Pilih show dari daftar untuk mulai streaming</p>
              </div>
            ) : (
              <>
                {/* Meta bar Server 1 */}
                {activeServer === 1 && selectedShow && (
                  <div className="al-meta-bar">
                    <img
                      src={selectedShow.creator?.image_url}
                      alt=""
                      className="al-creator-img"
                      onError={(e) => { e.target.style.display = "none"; }}
                    />
                    <div>
                      <h1 className="al-stream-title">{selectedShow.title}</h1>
                      <span className="al-stream-sub">
                        {selectedShow.creator?.name} &nbsp;·&nbsp;
                        <span className={`al-dot ${selectedShow.status}`} />
                        {selectedShow.status?.toUpperCase()}
                        {selectedShow.view_count > 0 && ` · 👁 ${selectedShow.view_count}`}
                      </span>
                    </div>
                    <div className="al-price-badge">
                      {selectedShow.idnliveplus?.liveroom_price ?? "—"} 🪙
                    </div>
                  </div>
                )}

                {/* Meta bar Server 2 */}
                {activeServer === 2 && (
                  <div className="al-meta-bar">
                    <div className="al-s2-icon">📡</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h1 className="al-stream-title">IDN Live Stream</h1>
                      <span className="al-stream-sub">
                        Show ID:&nbsp;
                        <code style={{ fontFamily: "var(--mono)", color: "var(--accent2)" }}>
                          {stream2Info?.showId || STREAM2_SHOW_ID}
                        </code>
                        &nbsp;·&nbsp;
                        {streamLoading
                          ? "Mengambil stream…"
                          : streamData
                          ? <><span className="al-dot live" /> Stream aktif</>
                          : "Menunggu…"}
                      </span>
                      {/* Token ID info */}
                      {stream2Info?.tokenId && (
                        <span className="al-stream-sub" style={{ fontSize: 10, marginTop: 3, opacity: 0.7 }}>
                          Token:&nbsp;
                          <code style={{ fontFamily: "var(--mono)" }}>
                            {stream2Info.tokenId.slice(0, 8)}…
                          </code>
                        </span>
                      )}
                      {/* Session broadcast info */}
                      {streamData?.session?.["BROADCAST-ID"] && (
                        <span className="al-stream-sub" style={{ fontSize: 10, marginTop: 2, opacity: 0.6 }}>
                          Broadcast: {streamData.session["BROADCAST-ID"]}
                          {streamData.session["CLUSTER"] && ` · ${streamData.session["CLUSTER"]}`}
                          {streamData.session["USER-COUNTRY"] && ` · ${streamData.session["USER-COUNTRY"]}`}
                        </span>
                      )}
                    </div>
                    <div className="al-price-badge" style={{ borderColor: "#3b82f644", color: "#3b82f6", background: "#3b82f611" }}>
                      📡 SERVER 2
                    </div>
                  </div>
                )}

                {/* Server Toggle */}
                <ServerBadge server={activeServer} onChange={handleServerChange} />

                <div className="al-player-wrap">
                  {streamLoading && (
                    <div className="al-stream-loading">
                      <div className="al-spin xl" />
                      <p>Mengambil stream URL…</p>
                      {activeServer === 2 && (
                        <span style={{ color: "#444", fontSize: 12, marginTop: 4 }}>
                          Menghubungi endpoint stream…
                        </span>
                      )}
                    </div>
                  )}

                  {!streamLoading && streamError && (
                    <div className="al-stream-err">
                      <span style={{ fontSize: 36 }}>⚠️</span>
                      <p>{streamError}</p>
                      <button className="al-btn-primary sm" onClick={handleRetry}>
                        Coba Lagi
                      </button>
                    </div>
                  )}

                  {!streamLoading && !streamError && activeStream?.url && (
                    <HLSPlayer
                      key={`${activeServer}-${selectedSlug || STREAM2_SHOW_ID}`}
                      src={activeStream.url}
                      title={
                        activeServer === 2
                          ? `IDN Live – ${stream2Info?.showId || STREAM2_SHOW_ID}`
                          : (selectedShow?.title || selectedSlug)
                      }
                      pollUrl={pollUrl}
                    />
                  )}

                  {!streamLoading && !streamError && streamData && !activeStream?.url && (
                    <div className="al-stream-err">
                      <span style={{ fontSize: 36 }}>📭</span>
                      <p>Stream URL tidak tersedia.</p>
                      <span style={{ color: "#555", fontSize: 12 }}>
                        {activeServer === 2
                          ? "Show ID: " + (stream2Info?.showId || STREAM2_SHOW_ID)
                          : "Status: " + selectedShow?.status}
                      </span>
                    </div>
                  )}
                </div>

                {/* Quality selector */}
                {streamData?.streams?.length > 0 && (
                  <div className="al-quality-row">
                    <span className="al-quality-label">Kualitas:</span>
                    {[...streamData.streams]
                      .sort((a, b) => Number(b.BANDWIDTH || 0) - Number(a.BANDWIDTH || 0))
                      .map((s) => {
                        const isQActive = activeStream?.NAME === s.NAME || activeStream?.url === s.url;
                        return (
                          <button
                            key={s["GROUP-ID"] || s.NAME || s.url}
                            className={`al-quality-chip ${isQActive ? "active" : ""}`}
                            onClick={() => handlePickQuality(s)}
                            title={`${s.RESOLUTION || ""} · ${Math.round(Number(s.BANDWIDTH || 0) / 1000)}kbps`}
                          >
                            {s.NAME || "default"}
                            {s.RESOLUTION && <em> {s.RESOLUTION}</em>}
                          </button>
                        );
                      })}
                  </div>
                )}

                {/* Session info */}
                {streamData?.session && Object.keys(streamData.session).length > 0 && (
                  <div className="al-session-row">
                    {["BROADCAST-ID", "VIDEO-SESSION-ID", "STREAM-TIME", "CLUSTER", "USER-COUNTRY"].map((key) =>
                      streamData.session[key] ? (
                        <span key={key} className="al-session-chip">
                          <em>{key}:</em> {streamData.session[key]}
                        </span>
                      ) : null
                    )}
                  </div>
                )}

                {/* Slug row (server 1 only) */}
                {activeServer === 1 && selectedSlug && (
                  <div className="al-slug-row">
                    <span className="al-slug-label">Slug:</span>
                    <code className="al-slug-code">{selectedSlug}</code>
                    <button
                      className="al-btn-ghost sm"
                      onClick={() => navigator.clipboard?.writeText(selectedSlug)}
                      title="Copy slug"
                    >
                      📋
                    </button>
                  </div>
                )}

                {/* Stream URL row (server 2) */}
                {activeServer === 2 && activeStream?.url && (
                  <div className="al-slug-row">
                    <span className="al-slug-label">Stream URL:</span>
                    <code className="al-slug-code">{activeStream.url}</code>
                    <button
                      className="al-btn-ghost sm"
                      onClick={() => navigator.clipboard?.writeText(activeStream.url)}
                      title="Copy URL"
                    >
                      📋
                    </button>
                  </div>
                )}

                {activeServer === 1 && selectedShow?.idnliveplus?.description && (
                  <div className="al-desc">
                    <h4>Deskripsi</h4>
                    <p>{selectedShow.idnliveplus.description}</p>
                  </div>
                )}
              </>
            )}

            {/* Server 2 tanpa show selected */}
            {activeServer === 2 && !selectedSlug && (
              <>
                <ServerBadge server={activeServer} onChange={handleServerChange} />
                <div className="al-player-wrap">
                  {streamLoading && (
                    <div className="al-stream-loading">
                      <div className="al-spin xl" />
                      <p>Mengambil stream URL…</p>
                    </div>
                  )}
                  {!streamLoading && streamError && (
                    <div className="al-stream-err">
                      <span style={{ fontSize: 36 }}>⚠️</span>
                      <p>{streamError}</p>
                      <button className="al-btn-primary sm" onClick={handleRetry}>Coba Lagi</button>
                    </div>
                  )}
                  {!streamLoading && !streamError && activeStream?.url && (
                    <HLSPlayer
                      key="server2-noshow"
                      src={activeStream.url}
                      title={`IDN Live – ${stream2Info?.showId || STREAM2_SHOW_ID}`}
                      pollUrl={pollUrl}
                    />
                  )}
                </div>
              </>
            )}
          </main>
        </div>
      </div>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const globalStyles = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@700;800&family=Inter:wght@400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --red:     #DC1F2E;
    --red-dim: #DC1F2E22;
    --red-mid: #DC1F2E55;
    --accent2: #3b82f6;
    --a2-dim:  #3b82f611;
    --a2-mid:  #3b82f644;
    --bg:      #080808;
    --bg2:     #111111;
    --bg3:     #181818;
    --bg4:     #222222;
    --line:    #2a2a2a;
    --txt:     #e8e8e8;
    --txt2:    #888;
    --txt3:    #444;
    --mono:    'DM Mono', monospace;
    --sans:    'Inter', sans-serif;
    --display: 'Syne', sans-serif;
  }
  @keyframes spin      { to { transform: rotate(360deg); } }
  @keyframes fadeIn    { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  @keyframes pulse     { 0%,100% { opacity:1 } 50% { opacity:.4 } }
  @keyframes shimmer   { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
  @keyframes bluePulse { 0%,100% { box-shadow: 0 0 0 0 #3b82f633; } 50% { box-shadow: 0 0 0 6px #3b82f600; } }

  .al-noise { pointer-events: none; position: fixed; inset: 0; z-index: 0; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E"); background-size: 200px; opacity: .5; }

  .al-login-bg { min-height: 100vh; background: var(--bg); display: flex; align-items: center; justify-content: center; font-family: var(--sans); position: relative; }
  .al-login-bg::before { content: ''; position: fixed; inset: 0; background: radial-gradient(ellipse 60% 50% at 50% 50%, #DC1F2E0a 0%, transparent 70%); pointer-events: none; }
  .al-login-card { position: relative; z-index: 1; width: min(420px, 92vw); background: var(--bg2); border: 1px solid var(--line); border-radius: 16px; padding: 40px 36px; animation: fadeIn .5s ease; box-shadow: 0 32px 80px #00000088, 0 0 0 1px #ffffff06 inset; }
  .al-logo { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
  .al-logo-icon { font-size: 28px; color: var(--red); filter: drop-shadow(0 0 8px var(--red)); }
  .al-logo-icon.sm { font-size: 18px; }
  .al-logo-text { font-family: var(--display); font-size: 22px; font-weight: 800; color: var(--txt); letter-spacing: 3px; }
  .al-logo-text em { color: var(--red); font-style: normal; }
  .al-login-sub { color: var(--txt3); font-size: 12px; letter-spacing: 1px; margin-bottom: 32px; }
  .al-form { display: flex; flex-direction: column; gap: 16px; }
  .al-field { display: flex; flex-direction: column; gap: 6px; }
  .al-field label { font-size: 11px; font-weight: 600; color: var(--txt2); letter-spacing: 1.5px; text-transform: uppercase; }
  .al-field input { background: var(--bg3); border: 1px solid var(--line); border-radius: 8px; padding: 11px 14px; color: var(--txt); font-size: 14px; font-family: var(--sans); outline: none; transition: border-color .2s, box-shadow .2s; }
  .al-field input:focus { border-color: var(--red-mid); box-shadow: 0 0 0 3px var(--red-dim); }
  .al-error { background: #DC1F2E18; border: 1px solid #DC1F2E44; color: #ff6b6b; font-size: 13px; border-radius: 8px; padding: 10px 14px; }
  .al-btn-primary { display: flex; align-items: center; justify-content: center; gap: 8px; background: var(--red); color: #fff; border: none; border-radius: 8px; padding: 12px 20px; font-size: 13px; font-weight: 700; letter-spacing: 2px; cursor: pointer; font-family: var(--display); transition: opacity .2s, transform .1s; }
  .al-btn-primary:hover { opacity: .88; }
  .al-btn-primary:active { transform: scale(.98); }
  .al-btn-primary:disabled { opacity: .5; cursor: not-allowed; }
  .al-btn-primary.sm { padding: 8px 14px; font-size: 12px; }
  .al-btn-ghost { background: transparent; border: 1px solid var(--line); color: var(--txt2); border-radius: 8px; padding: 8px 14px; font-size: 13px; cursor: pointer; transition: border-color .2s, color .2s; font-family: var(--sans); }
  .al-btn-ghost:hover { border-color: var(--txt3); color: var(--txt); }
  .al-btn-ghost.sm { padding: 5px 10px; font-size: 12px; }
  .al-btn-danger { background: transparent; border: 1px solid #DC1F2E44; color: var(--red); border-radius: 8px; padding: 8px 14px; font-size: 13px; cursor: pointer; transition: background .2s; font-family: var(--sans); }
  .al-btn-danger:hover { background: var(--red-dim); }
  .al-spin { display: inline-block; width: 18px; height: 18px; border: 2px solid #ffffff33; border-top-color: #fff; border-radius: 50%; animation: spin .7s linear infinite; }
  .al-spin.sm { width: 13px; height: 13px; }
  .al-spin.xl { width: 40px; height: 40px; border-width: 3px; border-top-color: var(--red); border-color: var(--red-dim); }

  .al-dashboard { min-height: 100vh; background: var(--bg); font-family: var(--sans); color: var(--txt); position: relative; display: flex; flex-direction: column; }
  .al-header { position: sticky; top: 0; z-index: 100; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; height: 56px; background: var(--bg2); border-bottom: 1px solid var(--line); backdrop-filter: blur(12px); }
  .al-header-left { display: flex; align-items: center; gap: 10px; }
  .al-header-title { font-family: var(--display); font-size: 15px; font-weight: 800; letter-spacing: 3px; color: var(--txt); }
  .al-badge { background: var(--red); color: #fff; font-size: 9px; font-weight: 700; letter-spacing: 1.5px; padding: 2px 7px; border-radius: 4px; }
  .al-header-right { display: flex; align-items: center; gap: 10px; }
  .al-today { color: var(--txt2); font-size: 12px; font-family: var(--mono); }

  .al-content { flex: 1; display: flex; position: relative; z-index: 1; }
  .al-sidebar { width: 320px; min-width: 280px; background: var(--bg2); border-right: 1px solid var(--line); display: flex; flex-direction: column; padding: 20px 16px; overflow-y: auto; max-height: calc(100vh - 56px); position: sticky; top: 56px; gap: 12px; }
  .al-sidebar-head { display: flex; align-items: center; justify-content: space-between; }
  .al-sidebar-head h2 { font-family: var(--display); font-size: 14px; font-weight: 800; letter-spacing: 2px; color: var(--txt2); text-transform: uppercase; }
  .al-show-list { display: flex; flex-direction: column; gap: 8px; }
  .al-show-card { display: flex; align-items: flex-start; gap: 10px; background: var(--bg3); border: 1px solid var(--line); border-radius: 10px; padding: 10px; cursor: pointer; text-align: left; transition: border-color .2s, background .2s; position: relative; width: 100%; }
  .al-show-card:hover { border-color: var(--txt3); background: var(--bg4); }
  .al-show-card.active { border-color: var(--red-mid); background: var(--red-dim); }
  .al-show-thumb { width: 56px; height: 40px; object-fit: cover; border-radius: 6px; flex-shrink: 0; background: var(--bg4); }
  .al-show-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .al-show-title { font-size: 12px; font-weight: 600; color: var(--txt); line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .al-show-meta { display: flex; align-items: center; gap: 5px; font-size: 10px; color: var(--txt2); font-family: var(--mono); }
  .al-show-slug { font-family: var(--mono); font-size: 9px; color: var(--txt3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .al-active-indicator { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); color: var(--red); font-size: 10px; }
  .al-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
  .al-dot.live      { background: #22c55e; animation: pulse 1.5s infinite; }
  .al-dot.scheduled { background: #f59e0b; }
  .al-dot.ended     { background: #555; }
  .al-skeleton { background: linear-gradient(90deg, var(--bg3) 25%, var(--bg4) 50%, var(--bg3) 75%); background-size: 400px 100%; animation: shimmer 1.4s infinite linear; border-radius: 8px; }
  .al-empty { color: var(--txt3); font-size: 13px; text-align: center; padding: 24px 0; }

  .al-main { flex: 1; padding: 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; animation: fadeIn .3s ease; }
  .al-no-select { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: var(--txt3); font-size: 15px; text-align: center; padding: 60px 0; }
  .al-meta-bar { display: flex; align-items: flex-start; gap: 14px; background: var(--bg2); border: 1px solid var(--line); border-radius: 12px; padding: 14px 18px; }
  .al-creator-img { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; flex-shrink: 0; border: 2px solid var(--line); }
  .al-s2-icon { width: 44px; height: 44px; border-radius: 50%; background: var(--a2-dim); border: 2px solid var(--a2-mid); display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0; animation: bluePulse 2s infinite; }
  .al-stream-title { font-family: var(--display); font-size: 16px; font-weight: 800; color: var(--txt); line-height: 1.2; }
  .al-stream-sub { display: flex; align-items: center; gap: 6px; color: var(--txt2); font-size: 12px; font-family: var(--mono); margin-top: 4px; flex-wrap: wrap; }
  .al-price-badge { margin-left: auto; flex-shrink: 0; background: #f59e0b22; border: 1px solid #f59e0b44; color: #f59e0b; font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 20px; font-family: var(--mono); }
  .al-player-wrap { border-radius: 12px; overflow: hidden; background: #000; border: 1px solid var(--line); min-height: 200px; position: relative; }
  .al-stream-loading, .al-stream-err { min-height: 320px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; text-align: center; color: var(--txt2); font-size: 14px; background: var(--bg3); }

  .al-quality-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .al-quality-label { color: var(--txt3); font-size: 11px; letter-spacing: 1px; text-transform: uppercase; }
  .al-quality-chip { background: var(--bg3); border: 1px solid var(--line); color: var(--txt2); font-size: 11px; padding: 3px 10px; border-radius: 20px; font-family: var(--mono); cursor: pointer; transition: border-color .15s, background .15s; }
  .al-quality-chip:hover { border-color: var(--txt3); color: var(--txt); }
  .al-quality-chip.active { background: var(--red-dim); border-color: var(--red-mid); color: var(--txt); }
  .al-quality-chip em { color: var(--txt3); font-style: normal; margin-left: 4px; }
  .al-quality-chip.active em { color: var(--red); }

  .al-session-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .al-session-chip { background: var(--bg3); border: 1px solid var(--line); color: var(--txt2); font-size: 10px; padding: 2px 8px; border-radius: 4px; font-family: var(--mono); }
  .al-session-chip em { color: var(--txt3); font-style: normal; margin-right: 4px; }

  .al-slug-row { display: flex; align-items: center; gap: 8px; background: var(--bg2); border: 1px solid var(--line); border-radius: 8px; padding: 10px 14px; }
  .al-slug-label { color: var(--txt3); font-size: 11px; flex-shrink: 0; }
  .al-slug-code { flex: 1; font-family: var(--mono); font-size: 12px; color: var(--txt2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .al-desc { background: var(--bg2); border: 1px solid var(--line); border-radius: 10px; padding: 16px 18px; }
  .al-desc h4 { font-size: 11px; font-weight: 700; letter-spacing: 1.5px; color: var(--txt3); text-transform: uppercase; margin-bottom: 8px; }
  .al-desc p { font-size: 13px; color: var(--txt2); line-height: 1.7; white-space: pre-line; }

  .al-server-toggle { display: flex; align-items: center; gap: 12px; background: var(--bg2); border: 1px solid var(--line); border-radius: 10px; padding: 10px 16px; }
  .al-server-label { color: var(--txt3); font-size: 11px; letter-spacing: 1px; text-transform: uppercase; font-family: var(--mono); flex-shrink: 0; }
  .al-server-pills { display: flex; gap: 8px; flex-wrap: wrap; }
  .al-server-pill { display: flex; align-items: center; gap: 7px; background: var(--bg3); border: 1px solid var(--line); color: var(--txt2); font-size: 12px; font-weight: 600; padding: 6px 14px; border-radius: 20px; cursor: pointer; transition: all .2s; font-family: var(--sans); }
  .al-server-pill em { font-style: normal; font-size: 10px; color: var(--txt3); font-family: var(--mono); margin-left: 2px; }
  .al-server-pill:hover { border-color: var(--txt3); color: var(--txt); }
  .al-server-pill.active { color: var(--txt); font-weight: 700; }
  .al-server-pill:nth-child(1).active { border-color: var(--red-mid); background: var(--red-dim); }
  .al-server-pill:nth-child(1).active em { color: var(--red); }
  .al-server-pill:nth-child(2).active { border-color: var(--a2-mid); background: var(--a2-dim); }
  .al-server-pill:nth-child(2).active em { color: var(--accent2); }
  .al-server-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .al-server-dot.s1 { background: var(--red); }
  .al-server-dot.s2 { background: var(--accent2); }

  @media (max-width: 768px) {
    .al-content { flex-direction: column; }
    .al-sidebar { width: 100%; position: static; max-height: 280px; border-right: none; border-bottom: 1px solid var(--line); }
    .al-today { display: none; }
    .al-show-list { flex-direction: row; overflow-x: auto; padding-bottom: 4px; }
    .al-show-card { min-width: 200px; }
    .al-server-toggle { flex-wrap: wrap; }
  }
`;
