import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { gsap, useGSAP, SplitText, prefersReducedMotion } from "../lib/gsap";
import { api, deviceId, store, PARTNER_ORIGIN, fetchShowMembers } from "../lib/api";
import { useShows } from "../lib/hooks";
import { fmtDay, fmtDate, fmtTime, humanLeft } from "../lib/format";
import HlsPlayer from "../components/HlsPlayer";
import Chat from "../components/Chat";
import "../styles/room.css";

const PARTNER_ERRORS = {
  SHOW_NOT_PURCHASED: "Show ini belum tersedia di server stream.",
  VIEW_QUOTA_EXCEEDED: "Kuota penonton sedang penuh. Coba lagi beberapa saat.",
  ORIGIN_NOT_ALLOWED: "Domain ini belum terdaftar di server stream.",
  SESSION_BINDING_MISMATCH: "Sesi ini sedang dipakai di perangkat lain.",
  PARTNER_SUSPENDED: "Layanan stream sedang tidak tersedia sementara.",
  KEY_LOCKED: "Akses stream sedang dibekukan.",
  SIGNER_DOWN: "Server stream tidak merespon.",
};
const partnerMsg = (d, fallback) => PARTNER_ERRORS[d?.code] || d?.message || fallback;

const passKey = (slug) => `hrz_pass:${slug}`;

// Tukar playback_url → playlist (browser langsung ke partner origin agar cookie terpasang).
async function exchange(playbackUrl) {
  const res = await fetch(playbackUrl, { credentials: "include" });
  const data = await res.json();
  if (!data.ok) throw new Error(partnerMsg(data, "Gagal membuka stream."));
  return data;
}

export default function Room() {
  const { slug } = useParams();
  const { shows } = useShows(30000);
  const show = shows.find((s) => s.slug === slug);

  const saved = store.get(passKey(slug));
  const [pass, setPass] = useState(saved && saved.exp > Date.now() ? saved : null);
  const [email, setEmail] = useState(saved?.email || store.get("hrz_email", ""));
  const [busy, setBusy] = useState(false);
  const [gateError, setGateError] = useState("");

  const [stream, setStream] = useState({ state: "idle" }); // idle | connecting | ready | error
  const [level, setLevel] = useState(null);
  const [members, setMembers] = useState([]);
  const [chatOpen, setChatOpen] = useState(false);

  const root = useRef(null);
  const resuming = useRef(false);

  // ── sesi stream ──
  const startStream = useCallback(
    async (p = pass) => {
      if (!p) return;
      setStream({ state: "connecting" });
      const r = await api("/stream/session", { method: "POST", body: { token: p.token } });
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) {
          store.del(passKey(slug));
          setPass(null);
          setGateError(r.message || "Sesi akses habis, masukkan email lagi.");
          return;
        }
        setStream({ state: "error", message: partnerMsg(r, "Gagal menyiapkan sesi stream.") });
        return;
      }
      try {
        const pb = await exchange(r.playback_url);
        setStream({
          state: "ready",
          src: pb.playlist_url,
          headerName: pb.play_header_name || "X-Play-Key",
          headerValue: pb.play_header_value || "",
          maxRes: pb.max_resolution || r.max_resolution || null,
        });
      } catch (e) {
        setStream({ state: "error", message: e.message || "Gagal membuka stream." });
      }
    },
    [pass, slug]
  );

  const resume = useCallback(async () => {
    if (resuming.current) return;
    resuming.current = true;
    try {
      const res = await fetch(`${PARTNER_ORIGIN}/api/partner/resume`, { credentials: "include" });
      const r = await res.json();
      if (r.ok && r.playlist_url) {
        setStream((s) => ({ ...s, state: "ready", src: r.playlist_url, headerName: r.play_header_name || "X-Play-Key", headerValue: r.play_header_value || "" }));
      } else await startStream();
    } catch {
      await startStream();
    } finally {
      resuming.current = false;
    }
  }, [startStream]);

  useEffect(() => {
    if (pass && stream.state === "idle") startStream(pass);
  }, [pass]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!show?.showId) return;
    fetchShowMembers(show.showId).then(setMembers);
  }, [show?.showId]);

  useEffect(() => {
    const onVis = () => document.visibilityState === "visible" && stream.state === "ready" && resume();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [stream.state, resume]);

  // ── masuk dengan email ──
  const enter = async (e) => {
    e.preventDefault();
    setBusy(true);
    setGateError("");
    const r = await api("/access/enter", { method: "POST", body: { email, slug, device_id: deviceId() } });
    if (!r.ok) {
      setBusy(false);
      setGateError(r.message || "Gagal memeriksa akses.");
      gsap.fromTo(".gatecard", { x: -10 }, { x: 0, duration: 0.5, ease: "elastic.out(1, 0.3)" });
      return;
    }
    const p = { token: r.token, exp: r.expires_at, email: email.trim().toLowerCase(), grant: r.grant };
    store.set(passKey(slug), p);
    store.set("hrz_email", p.email);

    // Sobek tiket → tirai terbuka → ruang nonton.
    const tl = gsap.timeline({ onComplete: () => { setBusy(false); setPass(p); } });
    if (!prefersReducedMotion()) {
      tl.to(".gatecard__stub", { x: 40, rotate: 14, opacity: 0, duration: 0.5, ease: "power2.in" })
        .to(".gatecard", { y: -30, opacity: 0, duration: 0.45, ease: "power2.in" }, "-=0.1")
        .to(".curtain__l, .curtain__r", { xPercent: 0, duration: 0.9, ease: "expo.inOut" }, "-=0.1");
    }
  };

  const leave = () => {
    store.del(passKey(slug));
    setPass(null);
    setStream({ state: "idle" });
  };

  // ── animasi ──
  useGSAP(
    () => {
      if (pass) return;
      const split = SplitText.create(".gatecard h1", { type: "words", mask: "words" });
      // Tirai tertutup → membuka ke sisi, menyisakan pinggiran beludru.
      const rest = window.innerWidth < 700 ? 90 : 74;
      gsap.timeline({ delay: 0.25 })
        .fromTo(".curtain__l", { xPercent: 0 }, { xPercent: -rest, duration: 1.4, ease: "expo.inOut" })
        .fromTo(".curtain__r", { xPercent: 0 }, { xPercent: rest, duration: 1.4, ease: "expo.inOut" }, "<")
        .from(".gatecard", { y: 60, opacity: 0, rotate: 3, duration: 0.9 }, "-=0.6")
        .from(split.words, { yPercent: 100, stagger: 0.05, duration: 0.7 }, "-=0.5");
      return () => split.revert();
    },
    { scope: root, dependencies: [Boolean(pass)] }
  );

  useGSAP(
    () => {
      if (!pass) return;
      gsap.timeline()
        .fromTo(".curtain__l", { xPercent: 0 }, { xPercent: -100, duration: 1.3, ease: "expo.inOut" })
        .fromTo(".curtain__r", { xPercent: 0 }, { xPercent: 100, duration: 1.3, ease: "expo.inOut" }, "<")
        .set(".room .curtain__l, .room .curtain__r", { display: "none" })
        .from(".room__bar", { y: -40, opacity: 0, duration: 0.6 }, "-=0.6")
        .from(".player", { scale: 0.96, opacity: 0, duration: 0.9, ease: "expo.out" }, "-=0.3")
        .from(".room__info > *", { y: 24, opacity: 0, stagger: 0.07 }, "-=0.5")
        .from(".chat", { x: 40, opacity: 0, duration: 0.7 }, "-=0.8");
    },
    { scope: root, dependencies: [Boolean(pass)] }
  );

  useGSAP(
    () => {
      if (members.length) gsap.from(".lineup li", { y: 20, opacity: 0, stagger: 0.03, duration: 0.5 });
    },
    { scope: root, dependencies: [members.length] }
  );

  const title = show?.name || slug.replace(/-\d{4}-\d{2}-\d{2}-\d+$/, "").replace(/-/g, " ");

  // ── gerbang email ──
  if (!pass) {
    return (
      <div ref={root} className="gate-page">
        <div className="curtain__l" aria-hidden="true" />
        <div className="curtain__r" aria-hidden="true" />
        <Link to="/" className="gate-page__home">← Harukaze<em>48</em></Link>
        <form className="gatecard stub" onSubmit={enter}>
          <div className="gatecard__main">
            <p className="eyebrow">Pintu masuk · {show?.status === "live" ? <><span className="live-dot" /> sedang tayang</> : "ruang nonton"}</p>
            <h1 className="display">{title}</h1>
            {show?.scheduledAt && (
              <p className="gatecard__when mono">{fmtDay(show.scheduledAt)}, {fmtDate(show.scheduledAt)} · {fmtTime(show.scheduledAt)} WIB</p>
            )}
            <div className="field">
              <label htmlFor="gate-email">Email yang terdaftar</label>
              <input id="gate-email" className="input" type="email" required autoComplete="email" placeholder="nama@email.com" value={email} onChange={(e) => { setEmail(e.target.value); setGateError(""); }} />
            </div>
            {gateError && <p className="note-error">{gateError}</p>}
            <button className="btn btn--red gatecard__go" disabled={busy}>
              {busy ? <span className="spinner" /> : <>Masuk <span className="arrow">→</span></>}
            </button>
            <p className="gatecard__help">
              Belum punya akses? <Link className="link-u" to="/jadwal">Lihat cara beli</Link>
            </p>
          </div>
          <div className="gatecard__stub" aria-hidden="true">
            <span className="mono">ADMIT</span>
            <span className="gatecard__kanji">入</span>
            <span className="mono">ONE</span>
          </div>
        </form>
      </div>
    );
  }

  // ── ruang nonton ──
  return (
    <div ref={root} className="room">
      <div className="curtain__l" aria-hidden="true" />
      <div className="curtain__r" aria-hidden="true" />
      <header className="room__bar">
        <Link to="/" className="room__brand">Harukaze<em>48</em></Link>
        <div className="room__title">
          {show?.status === "live" && <span className="room__live mono"><span className="live-dot" />LIVE</span>}
          <span>{title}</span>
        </div>
        <div className="room__actions">
          <span className="room__who mono" title={pass.email}>{pass.email}</span>
          <button className="room__btn" onClick={() => setChatOpen((v) => !v)}>Obrolan</button>
          <button className="room__btn room__btn--ghost" onClick={leave}>Keluar</button>
        </div>
      </header>

      <div className="room__grid">
        <section className="room__stage">
          <div className="player">
            {stream.state === "ready" ? (
              <HlsPlayer
                src={stream.src}
                headerName={stream.headerName}
                headerValue={stream.headerValue}
                onLevel={setLevel}
                onNeedResume={resume}
                onUnsupported={() => setStream({ state: "error", message: "Browser ini belum didukung. Gunakan Chrome, Edge, atau Firefox terbaru." })}
              />
            ) : (
              <div className="player__state">
                {stream.state === "error" ? (
                  <>
                    <span className="player__kanji" aria-hidden="true">幕</span>
                    <p className="player__msg">{stream.message}</p>
                    <button className="btn btn--sm btn--red" onClick={() => startStream()}>Coba lagi</button>
                  </>
                ) : (
                  <>
                    <div className="player__bars" aria-hidden="true"><i /><i /><i /><i /><i /></div>
                    <p className="player__msg mono">Menyalakan lampu panggung…</p>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="room__info">
            <div className="room__meta mono">
              <span>Kualitas: {level ? `${level.name}${level.bandwidth ? ` · ${level.bandwidth}` : ""}` : "auto"}</span>
              {stream.maxRes && <span>maks {stream.maxRes}p</span>}
              <span>Akses {pass.grant?.kind === "pass" ? "terusan" : "satuan"} · sisa {humanLeft(pass.grant?.expires_at || pass.exp)}</span>
            </div>
            <h2 className="display">{title}</h2>
            {show?.description && <p className="room__desc">{show.description}</p>}

            {members.length > 0 && (
              <div className="lineup">
                <p className="eyebrow">Lineup · {members.length} member</p>
                <ul>
                  {members.map((m) => (
                    <li key={m.id || m.name}>
                      <img src={m.img} alt="" loading="lazy" />
                      <span>{m.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        <Chat slug={slug} email={pass.email} open={chatOpen} />
      </div>
    </div>
  );
}
