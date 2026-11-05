import { useEffect, useRef } from "react";
import Hls from "hls.js";

const fmtBw = (bw) => (bw > 0 ? (bw >= 1e6 ? (bw / 1e6).toFixed(1) + " Mbps" : Math.round(bw / 1e3) + " Kbps") : "");

// Player HLS dengan header X-Play-Key + cookie partner, auto minta resume saat 401/403.
export default function HlsPlayer({ src, headerName, headerValue, onLevel, onNeedResume, onUnsupported }) {
  const videoRef = useRef(null);
  const cb = useRef({ onLevel, onNeedResume, onUnsupported });
  cb.current = { onLevel, onNeedResume, onUnsupported };

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    if (!Hls.isSupported()) {
      cb.current.onUnsupported?.();
      return;
    }
    let resumeTries = 0;
    let retryTimer = null;
    const withHeader = headerName && headerValue ? { [headerName]: headerValue } : {};
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
      xhrSetup: (xhr) => {
        xhr.withCredentials = true;
        if (headerName && headerValue) xhr.setRequestHeader(headerName, headerValue);
      },
      fetchSetup: (context, init) => {
        init.credentials = "include";
        init.headers = { ...init.headers, ...withHeader };
        return new Request(context.url, init);
      },
    };

    let hls = new Hls(config);
    const wire = (h) => {
      h.loadSource(src);
      h.attachMedia(video);
      h.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      h.on(Hls.Events.LEVEL_SWITCHED, (_, d) => {
        const lvl = h.levels[d.level];
        if (lvl) cb.current.onLevel?.({ name: lvl.name || `${lvl.height}p`, bandwidth: fmtBw(h.bandwidthEstimate) });
      });
      h.on(Hls.Events.ERROR, (_, d) => {
        const code = d.response?.code;
        if (code === 401 || code === 403) {
          if (resumeTries++ < 3) cb.current.onNeedResume?.();
          return;
        }
        if (!d.fatal) return;
        if (d.type === Hls.ErrorTypes.NETWORK_ERROR) h.startLoad();
        else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) h.recoverMediaError();
        else {
          h.destroy();
          retryTimer = setTimeout(() => {
            hls = new Hls(config);
            wire(hls);
          }, 2000);
        }
      });
    };
    wire(hls);
    return () => {
      clearTimeout(retryTimer);
      hls.destroy();
    };
  }, [src, headerName, headerValue]);

  return <video ref={videoRef} className="player__video" controls autoPlay playsInline />;
}
