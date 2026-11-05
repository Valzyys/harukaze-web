import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { gsap, useGSAP } from "../lib/gsap";
import { api, store } from "../lib/api";
import { useShows } from "../lib/hooks";
import { fmtDateTime, humanLeft } from "../lib/format";
import "../styles/pages.css";

export default function Access() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get("email") || store.get("hrz_email", ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [grants, setGrants] = useState(null);
  const { shows } = useShows(60000);
  const root = useRef(null);

  const lookup = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError("");
    const r = await api("/access/lookup", { method: "POST", body: { email } });
    setBusy(false);
    if (!r.ok) {
      setGrants(null);
      setError(r.message || "Gagal memeriksa email.");
      return;
    }
    store.set("hrz_email", email.trim().toLowerCase());
    setGrants(r.data);
  };

  useEffect(() => {
    if (params.get("email")) lookup();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useGSAP(
    () => {
      gsap.from(".page-head > *, .lookup", { y: 30, opacity: 0, stagger: 0.08, delay: 0.3 });
    },
    { scope: root }
  );
  useGSAP(
    () => {
      if (!grants) return;
      gsap.fromTo(".pass", { y: 50, opacity: 0, rotate: () => gsap.utils.random(-3, 3) }, { y: 0, opacity: 1, rotate: 0, stagger: 0.1, ease: "back.out(1.4)" });
    },
    { scope: root, dependencies: [grants] }
  );

  const now = Date.now();
  const liveShows = shows.filter((s) => s.status === "live");

  return (
    <div ref={root} className="wrap access">
      <header className="page-head">
        <p className="eyebrow">Cek Akses</p>
        <h1 className="display">Tiketmu ada di email.</h1>
        <p className="page-head__lede">Ketik email yang kamu kirim ke admin saat membeli. Kami tampilkan semua akses yang masih berlaku.</p>
      </header>

      <form className="lookup" onSubmit={lookup}>
        <div className="field">
          <label htmlFor="lk-email">Email terdaftar</label>
          <input id="lk-email" className="input" type="email" required placeholder="nama@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <button className="btn btn--red" disabled={busy}>
          {busy ? <span className="spinner" /> : <>Periksa <span className="arrow">→</span></>}
        </button>
      </form>
      {error && <p className="note-error">{error}</p>}

      {grants && grants.length === 0 && (
        <div className="nopass">
          <h2 className="display">Belum ada tiket untuk email ini.</h2>
          <p>Pastikan ejaan email sama persis dengan yang kamu berikan ke admin, atau <Link className="link-u" to="/jadwal">beli akses di halaman jadwal</Link>.</p>
        </div>
      )}

      {grants && grants.length > 0 && (
        <div className="passes">
          {grants.map((g) => {
            const active = g.starts_at <= now;
            const target = g.kind === "show" ? shows.find((s) => s.slug === g.show_slug) : liveShows[0];
            return (
              <article key={g.id} className={`pass stub${g.kind === "pass" ? " pass--season" : ""}`}>
                <div className="pass__main">
                  <p className="eyebrow">{g.kind === "pass" ? "Tiket terusan · semua show" : "Tiket satuan"}</p>
                  <h3 className="display">{g.kind === "pass" ? "Akses semua show" : g.show_title || g.show_slug}</h3>
                  <dl>
                    <div><dt>Mulai</dt><dd className="mono">{fmtDateTime(g.starts_at)}</dd></div>
                    <div><dt>Berakhir</dt><dd className="mono">{fmtDateTime(g.expires_at)}</dd></div>
                    <div><dt>Perangkat</dt><dd className="mono">maks {g.max_devices}</dd></div>
                  </dl>
                </div>
                <div className="pass__side">
                  <span className={`pass__state mono${active ? " is-on" : ""}`}>{active ? "AKTIF" : "BELUM AKTIF"}</span>
                  <span className="pass__left">{active ? `sisa ${humanLeft(g.expires_at)}` : `mulai ${humanLeft(g.starts_at)} lagi`}</span>
                  {active && target && (
                    <Link className="btn btn--sm" to={`/live/${target.slug}`}>
                      {target.status === "live" ? <><span className="live-dot" /> Masuk</> : "Ke ruang nonton"}
                    </Link>
                  )}
                  {active && !target && <span className="pass__hint">Tombol masuk muncul saat show tayang.</span>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
