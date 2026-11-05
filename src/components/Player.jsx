import { useCallback, useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { gsap } from "../lib/gsap";
import { store } from "../lib/api";

const fmtBw = (bw) => (bw > 0 ? (bw >= 1e6 ? (bw / 1e6).toFixed(1) + " Mbps" : Math.round(bw / 1e3) + " Kbps") : "—");
const qLabel = (h) => (h >= 2160 ? "4K" : h >= 1440 ? "1440p" : h ? `${h}p` : "—");
const qTag = (h) => (h >= 2160 ? "UHD" : h >= 1080 ? "HD" : h >= 720 ? "HD" : "");
const isTyping = (el) => el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

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

/**
 * Player HLS dengan kontrol sendiri:
 * pemilih resolusi (Auto / per level), volume, kembali ke LIVE, mode teater, PiP, layar penuh,
 * pintasan keyboard, auto-sembunyi kontrol. Header X-Play-Key + cookie partner tetap dikirim.
 */
export default function Player({ src, headerName, headerValue, maxRes, poster, theater, onToggleTheater, onNeedResume, onUnsupported, onStats }) {
  const box = useRef(null);
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const menuRef = useRef(null);
  const hideTimer = useRef(null);
  const cb = useRef({});
  cb.current = { onNeedResume, onUnsupported, onStats };

  const [levels, setLevels] = useState([]); // [{index, height, bitrate}]
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

  // ── setup hls ──
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    if (!Hls.isSupported()) {
      cb.current.onUnsupported?.();
      return;
    }
    let resumeTries = 0;
    let retryTimer = null;
    const extra = headerName && headerValue ? { [headerName]: headerValue } : {};
    const config = {
      enableWorker: true,
      lowLatencyMode: false,
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      backBufferLength: 30,
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 10,
      liveDurationInfinity: true,
      fragLoadingMaxRetry: 6,
      manifestLoadingMaxRetry: 4,
      levelLoadingMaxRetry: 4,
      abrEwmaDefaultEstimate: 500_000,
      capLevelToPlayerSize: false,
      xhrSetup: (xhr) => {
        xhr.withCredentials = true;
        if (headerName && headerValue) xhr.setRequestHeader(headerName, headerValue);
      },
      fetchSetup: (context, init) => {
        init.credentials = "include";
        init.headers = { ...init.headers, ...extra };
        return new Request(context.url, init);
      },
    };

    const autoplay = () =>
      video.play().catch(() => {
        // Browser menolak autoplay bersuara → putar tanpa suara, tampilkan ajakan menyalakan suara.
        video.muted = true;
        setMuted(true);
        setNeedsUnmute(true);
        video.play().catch(() => setPlaying(false));
      });

    const wire = (hls) => {
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_, d) => {
        const list = d.levels
          .map((l, index) => ({ index, height: l.height || 0, bitrate: l.bitrate || 0, name: l.name }))
          .filter((l) => !maxRes || !l.height || l.height <= maxRes)
          .sort((a, b) => b.height - a.height || b.bitrate - a.bitrate);
        setLevels(list);
        if (maxRes && list.length) hls.autoLevelCapping = Math.max(...list.map((l) => l.index));
        const pref = store.get("hrz_quality", -1);
        const match = pref > 0 ? list.find((l) => l.height === pref) : null;
        if (match) {
          hls.currentLevel = match.index;
          setSelected(match.index);
        }
        autoplay();
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_, d) => setCurrent(d.level));
      hls.on(Hls.Events.ERROR, (_, d) => {
        const code = d.response?.code;
        if (code === 401 || code === 403) {
          if (resumeTries++ < 3) cb.current.onNeedResume?.();
          return;
        }
        if (!d.fatal) return;
        if (d.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else {
          hls.destroy();
          retryTimer = setTimeout(() => wire(new Hls(config)), 2000);
        }
      });
    };
    wire(new Hls(config));

    return () => {
      clearTimeout(retryTimer);
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [src, headerName, headerValue, maxRes]);

  // ── event video ──
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
    const on = {
      play: () => setPlaying(true),
      pause: () => setPlaying(false),
      waiting: () => setBuffering(true),
      playing: () => { setBuffering(false); setPlaying(true); },
      canplay: () => setBuffering(false),
      volumechange: () => setMuted(v.muted || v.volume === 0),
    };
    Object.entries(on).forEach(([k, f]) => v.addEventListener(k, f));
    return () => Object.entries(on).forEach(([k, f]) => v.removeEventListener(k, f));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── statistik berkala: jarak dari live & bandwidth ──
  useEffect(() => {
    const id = setInterval(() => {
      const hls = hlsRef.current;
      const v = videoRef.current;
      if (!hls || !v) return;
      const edge = hls.liveSyncPosition;
      setBehind(edge && v.currentTime ? Math.max(0, edge - v.currentTime) : 0);
      setBw(hls.bandwidthEstimate || 0);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const currentLevel = levels.find((l) => l.index === current);
  useEffect(() => {
    cb.current.onStats?.({ height: currentLevel?.height || 0, bitrate: currentLevel?.bitrate || 0, bandwidth: bw, auto: selected === -1 });
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
    if (v.paused) { v.play().catch(() => {}); showFlash("play"); }
    else { v.pause(); showFlash("pause"); }
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
    if (hls?.liveSyncPosition && v) v.currentTime = hls.liveSyncPosition;
    v?.play().catch(() => {});
  }, []);

  const pickQuality = (index) => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.currentLevel = index; // langsung ganti (buffer dibuang), -1 = auto
    setSelected(index);
    const lvl = levels.find((l) => l.index === index);
    store.set("hrz_quality", lvl ? lvl.height : -1);
    setMenu(false);
  };

  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else if (box.current?.requestFullscreen) box.current.requestFullscreen().catch(() => {});
    else videoRef.current?.webkitEnterFullscreen?.(); // iOS
  }, []);
  useEffect(() => {
    const f = () => setIsFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);

  const togglePip = async () => {
    const v = videoRef.current;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v?.requestPictureInPicture();
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
    hideTimer.current = setTimeout(() => setIdle(true), 2600);
  }, []);
  useEffect(() => () => clearTimeout(hideTimer.current), []);
  const hidden = idle && playing && !menu;

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

  const atLive = behind < 8;
  const curH = currentLevel?.height;
  const qText = selected === -1 ? `Auto${curH ? ` · ${qLabel(curH)}` : ""}` : qLabel(levels.find((l) => l.index === selected)?.height);
  const signal = bw >= 5e6 ? 4 : bw >= 2.5e6 ? 3 : bw >= 1e6 ? 2 : bw > 0 ? 1 : 0;

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
        poster={poster}
        onClick={togglePlay}
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

        {document.pictureInPictureEnabled && (
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
