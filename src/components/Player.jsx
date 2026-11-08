import { useCallback, useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { gsap } from "../lib/gsap";
import { store } from "../lib/api";

const fmtBw = (bw) => (bw > 0 ? (bw >= 1e6 ? (bw / 1e6).toFixed(1) + " Mbps" : Math.round(bw / 1e3) + " Kbps") : "—");
const qLabel = (h) => (h >= 2160 ? "4K" : h >= 1440 ? "1440p" : h ? `${h}p` : "—");
const qTag = (h) => (h >= 2160 ? "UHD" : h >= 1080 ? "HD" : h >= 720 ? "HD" : "");
const isTyping = (el) => el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

const isIOSDevice = () => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
};

const isSafariBrowser = () => {
  if (typeof navigator === "undefined") return false;
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent || "");
};

const canPlayNativeHls = (video) =>
  Boolean(video && (video.canPlayType("application/vnd.apple.mpegurl") || video.canPlayType("application/x-mpegURL")));

// Parse varian resolusi dari master playlist m3u8 untuk mode Native HLS (iPhone/iOS)
function parseMasterM3u8(text, baseUrl, maxRes) {
  const lines = String(text || "").split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("#EXT-X-STREAM-INF:")) continue;
    const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i);
    const bwMatch = line.match(/(?:AVERAGE-)?BANDWIDTH=(\d+)/i);
    const height = resMatch ? parseInt(resMatch[2], 10) : 0;
    const bitrate = bwMatch ? parseInt(bwMatch[1], 10) : 0;
    let uri = "";
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j].trim();
      if (!next) continue;
      if (!next.startsWith("#")) uri = next;
      break;
    }
    if (!uri) continue;
    if (maxRes && height && height > maxRes) continue;
    try {
      const resolvedUrl = new URL(uri, new URL(baseUrl, window.location.origin)).toString();
      out.push({ index: out.length, height, bitrate, url: resolvedUrl });
    } catch { /* abaikan baris rusak */ }
  }
  return out.sort((a, b) => b.height - a.height || b.bitrate - a.bitrate);
}

const I = {
  play: <path d="M7 4.5v15l12.5-7.5z" fill="currentColor" />,
  pause: <path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z" fill="currentColor" />,
  vol: <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  mute: <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  gear: <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM19.4 13.5l1.6 1.2-1.8 3.1-1.9-.7a7.6 7.6 0 0 1-2 1.2L15 20.3h-3.6l-.3-2a7.6 7.6 0 0 1-2-1.2l-1.9.7-1.8-3.1 1.6-1.2a7.7 7.7 0 0 1 0-2.4l-1.6-1.2 1.8-3.1 1.9.7a7.6 7.6 0 0 1 2-1.2l.3-2H15l.3 2a7.6 7.6 0 0 1 2 1.2l1.9-.7 1.8 3.1-1.6 1.2a7.7 7.7 0 0 1 0 2.4z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  full: <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  exitFull: <path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  theater: <path d="M3 6.5h18v11H3z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />,
  pip: <path d="M3 5.5h18v13H3zM12.5 11.5h6v5h-6z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
};
const Ico = ({ d, size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">{d}</svg>
);

// Lompati celah kecil (buffer hole) jika playhead tertahan padahal ada segmen di depan
function nudgePastBufferGap(video) {
  if (!video || !video.buffered || video.buffered.length === 0) return false;
  const cur = video.currentTime;
  for (let i = 0; i < video.buffered.length; i++) {
    const start = video.buffered.start(i);
    const end = video.buffered.end(i);
    if (start > cur + 0.05 && start - cur < 4.5 && end > start + 0.2) {
      video.currentTime = start + 0.08;
      return true;
    }
  }
  return false;
}

/**
 * Player HLS dengan kontrol sendiri:
 * - Mendukung hls.js (MSE / ManagedMediaSource) DAN Native HLS untuk iPhone / iOS Safari.
 * - Anti-buffering & stall watchdog (lompat celah mikro otomatis, buffer lega, ABR stabil).
 * - Pembaruan kredensial di latar belakang tanpa me-reload player saat tab ditinggal.
 */
export default function Player({
  src,
  proxySrc,
  headerName,
  headerValue,
  maxRes,
  poster,
  theater,
  onToggleTheater,
  onNeedResume,
  onUnsupported,
  onStats,
}) {
  const box = useRef(null);
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const menuRef = useRef(null);
  const hideTimer = useRef(null);
  const bufferTimer = useRef(null);
  const stallTimer = useRef(null);
  const userPausedRef = useRef(false);
  const nativeModeRef = useRef(false);
  const masterProxyRef = useRef("");
  const lastResumeAtRef = useRef(0);
  const lastMediaRecoverRef = useRef(0);

  const authRef = useRef({ headerName, headerValue });
  authRef.current = { headerName, headerValue };

  const cb = useRef({});
  cb.current = { onNeedResume, onUnsupported, onStats };

  const [levels, setLevels] = useState([]); // [{index, height, bitrate, url?}]
  const [selected, setSelected] = useState(-1); // -1 = auto
  const [current, setCurrent] = useState(null); // level aktif (index)
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [muted, setMuted] = useState(false);
  const [needsUnmute, setNeedsUnmute] = useState(false);
  const [volume, setVolume] = useState(() => store.get("hrz_vol", 1));
  const [behind, setBehind] = useState(0);
  const [bw, setBw] = useState(0);
  const [menu, setMenu] = useState(false);
  const [idle, setIdle] = useState(false);
  const [isFull, setIsFull] = useState(false);
  const [flash, setFlash] = useState(null);

  const computedProxySrc =
    proxySrc ||
    (src && !src.startsWith("/api/stream/hls") && headerName && headerValue
      ? `/api/stream/hls?u=${encodeURIComponent(src)}&hn=${encodeURIComponent(headerName)}&hv=${encodeURIComponent(headerValue)}`
      : src);
  masterProxyRef.current = computedProxySrc;

  // Saat headerValue diperbarui dari resume latar belakang, jangan hancurkan Hls!
  useEffect(() => {
    authRef.current = { headerName, headerValue };
    if (hlsRef.current && headerValue) {
      hlsRef.current.startLoad();
    }
  }, [headerName, headerValue]);

  // ── setup hls / native hls (iPhone & semua browser) ──
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    const isIOS = isIOSDevice();
    const isSafari = isSafariBrowser();
    const nativeSupported = canPlayNativeHls(video);
    const hlsSupported = Hls.isSupported();

    if (!hlsSupported && !nativeSupported) {
      cb.current.onUnsupported?.();
      return;
    }

    let destroyed = false;
    let retryTimer = null;

    const autoplay = () => {
      if (destroyed) return;
      video.play().catch(() => {
        if (destroyed) return;
        // Browser / iOS menolak autoplay bersuara → putar tanpa suara, tampilkan tombol nyalakan suara.
        video.muted = true;
        setMuted(true);
        setNeedsUnmute(true);
        video.play().catch(() => setPlaying(false));
      });
    };

    // Fungsi masuk ke mode Native HLS (utama untuk iPhone atau fallback saat MSE gagal di iOS/Safari)
    const startNativeHls = async (targetMasterUrl) => {
      if (destroyed) return;
      nativeModeRef.current = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      const playUrl = targetMasterUrl || masterProxyRef.current || src;
      video.src = playUrl;
      video.load();
      autoplay();

      // Ambil daftar resolusi dari master m3u8 agar menu kualitas tetap berfungsi di iPhone
      try {
        const res = await fetch(playUrl, { credentials: "include" });
        if (res.ok && !destroyed) {
          const text = await res.text();
          const parsed = parseMasterM3u8(text, playUrl, maxRes);
          if (parsed.length) {
            setLevels(parsed);
            setCurrent(0);
          }
        }
      } catch { /* biarkan Auto bawaan iOS bekerja */ }
    };

    // Pada iPhone (atau jika Hls.isSupported() false tapi Native HLS didukung),
    // gunakan Native HLS hardware Apple lewat proxy agar bebas buffer & 100% jalan di iOS.
    if (!hlsSupported || isIOS) {
      startNativeHls(computedProxySrc);
      return () => {
        destroyed = true;
        clearTimeout(retryTimer);
        video.removeAttribute("src");
        video.load();
      };
    }

    nativeModeRef.current = false;
    let usingProxyInHls = isSafari || src.startsWith("/api/stream/hls");

    const makeConfig = () => {
      const fastTimeout = { maxNumRetry: 4, retryDelayMs: 0, maxRetryDelayMs: 0 };
      const errRetry = { maxNumRetry: 10, retryDelayMs: 400, maxRetryDelayMs: 5000 };
      return {
        enableWorker: true,
        preferManagedMediaSource: true,
        lowLatencyMode: false,
        // Buffer lega supaya tidak gampang buffering/frame drop saat sinyal naik-turun
        maxBufferLength: 45,
        maxMaxBufferLength: 90,
        maxBufferSize: 60 * 1000 * 1000,
        backBufferLength: 15,
        liveBackBufferLength: 15,
        // Toleransi celah timestamp & perbaikan otomatis saat frame macet
        maxBufferHole: 0.5,
        highBufferWatchdogPeriod: 2,
        nudgeOffset: 0.25,
        nudgeMaxRetry: 12,
        nudgeOnVideoHole: true,
        maxFragLookUpTolerance: 0.25,
        // Jaga jarak aman 4 segmen dari ujung live agar stream mulus tanpa putus-putus
        liveSyncDurationCount: 4,
        liveMaxLatencyDurationCount: 14,
        liveDurationInfinity: true,
        startFragPrefetch: true,
        progressive: true,
        fragLoadPolicy: {
          default: {
            maxTimeToFirstByteMs: 8000,
            maxLoadTimeMs: 20000,
            timeoutRetry: fastTimeout,
            errorRetry: errRetry,
          },
        },
        playlistLoadPolicy: {
          default: {
            maxTimeToFirstByteMs: 6000,
            maxLoadTimeMs: 10000,
            timeoutRetry: fastTimeout,
            errorRetry: errRetry,
          },
        },
        manifestLoadPolicy: {
          default: {
            maxTimeToFirstByteMs: 8000,
            maxLoadTimeMs: 15000,
            timeoutRetry: { maxNumRetry: 3, retryDelayMs: 0, maxRetryDelayMs: 0 },
            errorRetry: { maxNumRetry: 6, retryDelayMs: 400, maxRetryDelayMs: 4000 },
          },
        },
        // Estimasi ABR halus agar tidak sering lompat resolusi mendadak
        abrEwmaFastLive: 3.0,
        abrEwmaSlowLive: 9.0,
        abrEwmaDefaultEstimate: 1_500_000,
        abrBandWidthFactor: 0.85,
        abrBandWidthUpFactor: 0.65,
        capLevelToPlayerSize: false,
        capLevelOnFPSDrop: false,
        xhrSetup: (xhr, urlStr) => {
          const isProxyReq = String(urlStr || "").includes("/api/stream/hls");
          xhr.withCredentials = !isProxyReq;
          const { headerName: hn, headerValue: hv } = authRef.current;
          if (!isProxyReq && hn && hv) xhr.setRequestHeader(hn, hv);
        },
        fetchSetup: (context, init) => {
          const isProxyReq = String(context.url || "").includes("/api/stream/hls");
          init.credentials = isProxyReq ? "same-origin" : "include";
          const { headerName: hn, headerValue: hv } = authRef.current;
          if (!isProxyReq && hn && hv) {
            init.headers = { ...init.headers, [hn]: hv };
          }
          return new Request(context.url, init);
        },
      };
    };

    const wire = (hls, sourceUrl) => {
      if (destroyed) return;
      hlsRef.current = hls;
      hls.loadSource(sourceUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_, d) => {
        if (destroyed) return;
        const list = d.levels
          .map((l, index) => ({ index, height: l.height || 0, bitrate: l.bitrate || 0, name: l.name }))
          .filter((l) => !maxRes || !l.height || l.height <= maxRes)
          .sort((a, b) => b.height - a.height || b.bitrate - a.bitrate);
        setLevels(list);
        if (maxRes && list.length) hls.autoLevelCapping = Math.max(...list.map((l) => l.index));
        const pref = store.get("hrz_quality", -1);
        const match = pref > 0 ? list.find((l) => l.height === pref) : null;
        if (match) {
          hls.loadLevel = match.index;
          hls.nextLevel = match.index;
          setSelected(match.index);
        } else if (list.length) {
          const byBitrate = list.slice().sort((a, b) => a.bitrate - b.bitrate);
          const mid = byBitrate.find((l) => l.height >= 360 && l.height <= 720) || byBitrate[0];
          if (mid) hls.startLevel = mid.index;
          setSelected(-1);
        }
        autoplay();
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_, d) => {
        if (!destroyed) setCurrent(d.level);
      });

      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        if (destroyed) return;
        clearTimeout(bufferTimer.current);
        setBuffering(false);
      });

      hls.on(Hls.Events.ERROR, (_, d) => {
        if (destroyed) return;
        const code = d.response?.code;

        // Bila terkena celah buffer non-fatal (BUFFER_STALLED_ERROR), lompati celah mikro otomatis
        if (!d.fatal) {
          if (
            d.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR ||
            d.details === Hls.ErrorDetails.BUFFER_NUDGE_ON_STALL ||
            d.details === Hls.ErrorDetails.BUFFER_SEEK_OVER_HOLE
          ) {
            if (nudgePastBufferGap(video) && !userPausedRef.current) {
              video.play().catch(() => {});
            }
          }
          if (code === 401 || code === 403) {
            const now = Date.now();
            if (now - lastResumeAtRef.current > 8000) {
              lastResumeAtRef.current = now;
              cb.current.onNeedResume?.();
            }
          }
          return;
        }

        // Jika akses langsung ke partner ditolak karena cookie pihak ketiga / CORS, alihkan ke proxy Worker
        if (!usingProxyInHls && masterProxyRef.current && masterProxyRef.current !== sourceUrl) {
          usingProxyInHls = true;
          hls.destroy();
          wire(new Hls(makeConfig()), masterProxyRef.current);
          return;
        }

        if (code === 401 || code === 403) {
          const now = Date.now();
          if (now - lastResumeAtRef.current > 8000) {
            lastResumeAtRef.current = now;
            cb.current.onNeedResume?.();
          }
          hls.startLoad();
          return;
        }

        if (d.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad();
        } else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) {
          const now = Date.now();
          if (now - lastMediaRecoverRef.current < 5000) {
            hls.swapAudioCodec();
          }
          lastMediaRecoverRef.current = now;
          hls.recoverMediaError();
        } else if (nativeSupported) {
          startNativeHls(masterProxyRef.current);
        } else {
          hls.destroy();
          retryTimer = setTimeout(() => {
            if (!destroyed) wire(new Hls(makeConfig()), usingProxyInHls ? masterProxyRef.current : src);
          }, 2000);
        }
      });
    };

    const initialUrl = usingProxyInHls ? computedProxySrc : src;
    wire(new Hls(makeConfig()), initialUrl);

    return () => {
      destroyed = true;
      clearTimeout(retryTimer);
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [src, maxRes]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── ketika tab ditinggal lalu dibuka lagi: lanjutkan mulus tanpa reload ──
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") return;
      const v = videoRef.current;
      const hls = hlsRef.current;
      if (!v) return;

      clearTimeout(bufferTimer.current);
      if (v.readyState >= 2) setBuffering(false);

      if (hls) {
        hls.startLoad(-1);
        const edge = hls.liveSyncPosition;
        // Hanya lompat ke live jika tertinggal sangat jauh (> 30 detik) akibat tab disuspend browser
        if (edge && v.currentTime && edge - v.currentTime > 30) {
          v.currentTime = edge;
        }
      }
      if (!userPausedRef.current && v.paused) {
        v.play().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pageshow", onVis);
    };
  }, []);

  // ── event video + anti-flicker buffering + stall watchdog ──
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
    let lastTime = 0;

    const clearBufferWait = () => {
      clearTimeout(bufferTimer.current);
      clearTimeout(stallTimer.current);
      setBuffering(false);
    };

    const onWaiting = () => {
      clearTimeout(bufferTimer.current);
      // Tunda indikator loading 400ms agar jitter mikro tidak berkedip-kedip
      bufferTimer.current = setTimeout(() => setBuffering(true), 400);

      clearTimeout(stallTimer.current);
      stallTimer.current = setTimeout(() => {
        if (!v || v.paused) return;
        if (!nudgePastBufferGap(v)) {
          hlsRef.current?.startLoad();
        }
        if (!userPausedRef.current) v.play().catch(() => {});
      }, 3200);
    };

    const onTimeUpdate = () => {
      if (v.currentTime !== lastTime) {
        lastTime = v.currentTime;
        clearBufferWait();
      }
    };

    const on = {
      play: () => setPlaying(true),
      pause: () => setPlaying(false),
      waiting: onWaiting,
      stalled: onWaiting,
      playing: () => { clearBufferWait(); setPlaying(true); },
      canplay: clearBufferWait,
      canplaythrough: clearBufferWait,
      timeupdate: onTimeUpdate,
      volumechange: () => setMuted(v.muted || v.volume === 0),
      webkitbeginfullscreen: () => setIsFull(true),
      webkitendfullscreen: () => {
        setIsFull(false);
        // iOS kadang menjeda video saat keluar dari layar penuh bawaan
        if (!userPausedRef.current) setTimeout(() => v.play().catch(() => {}), 120);
      },
    };
    Object.entries(on).forEach(([k, f]) => v.addEventListener(k, f));
    return () => {
      clearTimeout(bufferTimer.current);
      clearTimeout(stallTimer.current);
      Object.entries(on).forEach(([k, f]) => v.removeEventListener(k, f));
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── statistik berkala: hemat re-render agar main-thread tidak drop frame ──
  useEffect(() => {
    const id = setInterval(() => {
      const hls = hlsRef.current;
      const v = videoRef.current;
      if (!v) return;
      if (hls) {
        const edge = hls.liveSyncPosition;
        const nextBehind = edge && v.currentTime ? Math.max(0, Math.round(edge - v.currentTime)) : 0;
        setBehind((prev) => (Math.abs(prev - nextBehind) >= 2 || (prev < 12) !== (nextBehind < 12) ? nextBehind : prev));
        const rawBw = hls.bandwidthEstimate || 0;
        const roundedBw = rawBw > 0 ? Math.round(rawBw / 100_000) * 100_000 : 0;
        setBw((prev) => (prev !== roundedBw ? roundedBw : prev));
      } else if (nativeModeRef.current && v.seekable && v.seekable.length > 0) {
        const edge = v.seekable.end(v.seekable.length - 1);
        const nextBehind = edge && v.currentTime ? Math.max(0, Math.round(edge - v.currentTime)) : 0;
        setBehind((prev) => (Math.abs(prev - nextBehind) >= 2 || (prev < 12) !== (nextBehind < 12) ? nextBehind : prev));
      }
    }, 2000);
    return () => clearInterval(id);
  }, []);

  const currentLevel = levels.find((l) => l.index === current);
  useEffect(() => {
    cb.current.onStats?.({
      height: currentLevel?.height || 0,
      bitrate: currentLevel?.bitrate || 0,
      bandwidth: bw,
      auto: selected === -1,
    });
  }, [currentLevel?.height, currentLevel?.bitrate, bw, selected]);

  // ── aksi ──
  const showFlash = (key) => {
    setFlash({ key, t: Date.now() });
  };
  useEffect(() => {
    if (!flash) return;
    const el = box.current?.querySelector(".pl__flash");
    if (el) gsap.fromTo(el, { scale: 0.6, opacity: 0.9 }, { scale: 1.4, opacity: 0, duration: 0.6, ease: "power2.out" });
  }, [flash]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      userPausedRef.current = false;
      v.play().catch(() => {});
      showFlash("play");
    } else {
      userPausedRef.current = true;
      v.pause();
      showFlash("pause");
    }
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    if (!v.muted && v.volume === 0) v.volume = 0.6;
    setNeedsUnmute(false);
  }, []);

  const changeVolume = (val) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = val;
    v.muted = val === 0;
    setVolume(val);
    setNeedsUnmute(false);
    store.set("hrz_vol", val);
  };

  const goLive = useCallback(() => {
    const hls = hlsRef.current;
    const v = videoRef.current;
    if (!v) return;
    userPausedRef.current = false;
    if (hls?.liveSyncPosition) {
      v.currentTime = hls.liveSyncPosition;
    } else if (v.seekable && v.seekable.length > 0) {
      v.currentTime = v.seekable.end(v.seekable.length - 1);
    }
    v.play().catch(() => {});
  }, []);

  const pickQuality = (index) => {
    const hls = hlsRef.current;
    const v = videoRef.current;
    setSelected(index);
    const lvl = levels.find((l) => l.index === index);
    store.set("hrz_quality", lvl ? lvl.height : -1);
    setMenu(false);

    if (hls) {
      // Gunakan nextLevel saat sedang memutar agar pergantian resolusi halus tanpa membuang buffer
      if (!v?.paused) hls.nextLevel = index;
      else hls.currentLevel = index;
      return;
    }

    // Mode Native HLS (iPhone/iOS): ganti ke URL sub-playlist resolusi atau kembali ke master
    if (nativeModeRef.current && v) {
      const targetUrl = index === -1 ? masterProxyRef.current : lvl?.url || masterProxyRef.current;
      if (targetUrl) {
        const wasPaused = v.paused;
        v.src = targetUrl;
        v.load();
        setCurrent(index === -1 ? 0 : index);
        if (!wasPaused) v.play().catch(() => {});
      }
    }
  };

  const toggleFull = useCallback(() => {
    const v = videoRef.current;
    const el = box.current;
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    } else if (el?.requestFullscreen) {
      el.requestFullscreen().catch(() => v?.webkitEnterFullscreen?.());
    } else if (el?.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    } else if (v?.webkitEnterFullscreen) {
      v.webkitEnterFullscreen(); // iPhone / iOS Safari
    }
  }, []);

  useEffect(() => {
    const f = () => setIsFull(Boolean(document.fullscreenElement || document.webkitFullscreenElement));
    document.addEventListener("fullscreenchange", f);
    document.addEventListener("webkitfullscreenchange", f);
    return () => {
      document.removeEventListener("fullscreenchange", f);
      document.removeEventListener("webkitfullscreenchange", f);
    };
  }, []);

  const togglePip = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (v.requestPictureInPicture) {
        await v.requestPictureInPicture();
      } else if (v.webkitSupportsPresentationMode?.("picture-in-picture")) {
        v.webkitSetPresentationMode(v.webkitPresentationMode === "picture-in-picture" ? "inline" : "picture-in-picture");
      }
    } catch { /* tidak didukung */ }
  };

  // tinggi player → batas tinggi menu resolusi
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => el.style.setProperty("--plh", `${Math.round(e.contentRect.height)}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── kontrol auto-sembunyi ──
  const poke = useCallback(() => {
    setIdle(false);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setIdle(true), 2800);
  }, []);
  useEffect(() => () => clearTimeout(hideTimer.current), []);
  const hidden = idle && playing && !menu;

  const onVideoTap = useCallback(
    (e) => {
      // Pada layar sentuh (iPhone / Android), ketukan pertama saat kontrol tersembunyi hanya menampilkan kontrol
      const isTouch = e.nativeEvent?.pointerType === "touch" || "ontouchstart" in window;
      if (isTouch && hidden) {
        poke();
        return;
      }
      togglePlay();
    },
    [hidden, poke, togglePlay]
  );

  // ── menu kualitas ──
  useEffect(() => {
    if (!menu || !menuRef.current) return;
    gsap.fromTo(menuRef.current, { y: 12, opacity: 0, scale: 0.96, transformOrigin: "bottom right" }, { y: 0, opacity: 1, scale: 1, duration: 0.3, ease: "back.out(1.6)" });
    gsap.fromTo(menuRef.current.querySelectorAll("button"), { x: 10, opacity: 0 }, { x: 0, opacity: 1, stagger: 0.03, duration: 0.25, delay: 0.05 });
    const close = (e) => { if (!menuRef.current?.contains(e.target) && !e.target.closest(".pl__q")) setMenu(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menu]);

  // ── pintasan keyboard ──
  useEffect(() => {
    const onKey = (e) => {
      if (isTyping(document.activeElement) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === " " || k === "k") { e.preventDefault(); togglePlay(); }
      else if (k === "m") toggleMute();
      else if (k === "f") toggleFull();
      else if (k === "t") onToggleTheater?.();
      else if (k === "l") goLive();
      else if (k === "q") setMenu((m) => !m);
      else return;
      poke();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, toggleMute, toggleFull, goLive, onToggleTheater, poke]);

  const atLive = behind < 12;
  const curH = currentLevel?.height;
  const qText = selected === -1 ? `Auto${curH ? ` · ${qLabel(curH)}` : ""}` : qLabel(levels.find((l) => l.index === selected)?.height);
  const signal = bw >= 5e6 ? 4 : bw >= 2.5e6 ? 3 : bw >= 1e6 ? 2 : bw > 0 ? 1 : (playing ? 3 : 0);
  const canPip =
    (typeof document !== "undefined" && document.pictureInPictureEnabled) ||
    Boolean(videoRef.current?.webkitSupportsPresentationMode?.("picture-in-picture"));

  return (
    <div
      ref={box}
      className={`pl${hidden ? " pl--idle" : ""}${isFull ? " pl--full" : ""}`}
      onPointerMove={poke}
      onPointerDown={poke}
    >
      <video
        ref={videoRef}
        className="pl__video"
        playsInline
        webkit-playsinline="true"
        x-webkit-airplay="allow"
        preload="auto"
        poster={poster}
        onClick={onVideoTap}
        onDoubleClick={toggleFull}
      />

      {buffering && (
        <div className="pl__buffer" aria-hidden="true"><i /><i /><i /></div>
      )}
      {!playing && !buffering && (
        <button className="pl__bigplay" onClick={togglePlay} aria-label="Putar">
          <Ico d={I.play} size={34} />
        </button>
      )}
      {flash && (
        <div className="pl__flash" key={flash.t} aria-hidden="true"><Ico d={flash.key === "play" ? I.play : I.pause} size={30} /></div>
      )}
      {needsUnmute && (
        <button className="pl__unmute" onClick={toggleMute}>
          <Ico d={I.mute} size={18} /> Ketuk untuk menyalakan suara
        </button>
      )}

      <div className="pl__top">
        <button className={`pl__live${atLive ? " is-live" : ""}`} onClick={goLive} title="Kembali ke siaran langsung (L)">
          <span className="pl__dot" /> LIVE
          {!atLive && <em className="mono">−{Math.round(behind)}d</em>}
        </button>
        <span className="pl__signal" title={`Koneksi ${fmtBw(bw)}`} aria-label={`Koneksi ${fmtBw(bw)}`}>
          {[1, 2, 3, 4].map((n) => <i key={n} className={n <= signal ? "on" : ""} />)}
        </span>
      </div>

      <div className="pl__bar">
        <button className="pl__btn" onClick={togglePlay} aria-label={playing ? "Jeda (K)" : "Putar (K)"} title={playing ? "Jeda (K)" : "Putar (K)"}>
          <Ico d={playing ? I.pause : I.play} />
        </button>
        <div className="pl__vol">
          <button className="pl__btn" onClick={toggleMute} aria-label="Bisukan (M)" title="Bisukan (M)">
            <Ico d={muted ? I.mute : I.vol} />
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.02"
            value={muted ? 0 : volume}
            onChange={(e) => changeVolume(Number(e.target.value))}
            aria-label="Volume"
            style={{ "--v": `${(muted ? 0 : volume) * 100}%` }}
          />
        </div>
        <span className="pl__spacer" />

        <div className="pl__qwrap">
          <button className={`pl__q${menu ? " is-open" : ""}`} onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu} title="Resolusi (Q)">
            <Ico d={I.gear} size={18} />
            <span>{levels.length ? qText : "Auto"}</span>
            {curH && qTag(curH) && <b>{qTag(curH)}</b>}
          </button>
          {menu && (
            <div className="pl__menu" ref={menuRef} role="menu">
              <p className="pl__menuhead">
                <span>Resolusi</span>
                <span className="mono">{fmtBw(bw)}</span>
              </p>
              <button role="menuitemradio" aria-checked={selected === -1} className={selected === -1 ? "is-on" : ""} onClick={() => pickQuality(-1)}>
                <span className="pl__mk">{selected === -1 && <Ico d={I.check} size={16} />}</span>
                <span className="pl__ml">Auto<small>{curH ? `sekarang ${qLabel(curH)}` : "menyesuaikan"}</small></span>
              </button>
              {levels.map((l) => (
                <button key={l.index} role="menuitemradio" aria-checked={selected === l.index} className={selected === l.index ? "is-on" : ""} onClick={() => pickQuality(l.index)}>
                  <span className="pl__mk">{selected === l.index && <Ico d={I.check} size={16} />}</span>
                  <span className="pl__ml">
                    {qLabel(l.height)}
                    {qTag(l.height) && <b>{qTag(l.height)}</b>}
                    <small className="mono">{fmtBw(l.bitrate)}</small>
                  </span>
                  {current === l.index && <i className="pl__playing" aria-label="sedang diputar" />}
                </button>
              ))}
              {maxRes ? <p className="pl__menufoot">Paket ini maks. {maxRes}p</p> : null}
            </div>
          )}
        </div>

        {canPip && (
          <button className="pl__btn pl__hide-sm" onClick={togglePip} aria-label="Picture-in-picture" title="Picture-in-picture">
            <Ico d={I.pip} />
          </button>
        )}
        {onToggleTheater && (
          <button className={`pl__btn pl__hide-sm${theater ? " is-on" : ""}`} onClick={onToggleTheater} aria-label="Mode teater (T)" title="Mode teater (T)">
            <Ico d={I.theater} />
          </button>
        )}
        <button className="pl__btn" onClick={toggleFull} aria-label="Layar penuh (F)" title="Layar penuh (F)">
          <Ico d={isFull ? I.exitFull : I.full} />
        </button>
      </div>
    </div>
  );
}

