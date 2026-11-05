import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { gsap, useGSAP } from "../lib/gsap";
import { useShows, useSiteConfig } from "../lib/hooks";
import { contactHref } from "../lib/api";
import { TicketRow } from "../components/Ticket";
import "../styles/home.css";
import "../styles/pages.css";

const TABS = [
  ["all", "Semua"],
  ["live", "Sedang tayang"],
  ["scheduled", "Akan datang"],
];

export default function Schedule() {
  const { shows, loading, error } = useShows();
  const config = useSiteConfig();
  const [tab, setTab] = useState("all");
  const root = useRef(null);

  const list = useMemo(() => (tab === "all" ? shows : shows.filter((s) => s.status === tab)), [shows, tab]);

  useGSAP(
    () => {
      gsap.from(".page-head > *", { y: 30, opacity: 0, stagger: 0.08, delay: 0.3 });
      gsap.from(".pricing > *", { y: 40, opacity: 0, stagger: 0.1, delay: 0.5 });
    },
    { scope: root }
  );
  useGSAP(
    () => {
      if (loading) return;
      gsap.fromTo(".sched__list .trow", { y: 24, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.06, duration: 0.6 });
    },
    { scope: root, dependencies: [loading, tab] }
  );

  const buy = (s) => {
    const href = contactHref(config, `Halo admin, saya mau beli akses show "${s.title}". Email saya: `);
    return href ? (
      <a href={href} target="_blank" rel="noreferrer" className="btn btn--sm">Beli tiket <span className="arrow">→</span></a>
    ) : null;
  };

  return (
    <div ref={root} className="wrap sched">
      <header className="page-head">
        <p className="eyebrow">Jadwal & Tiket</p>
        <h1 className="display">Pilih kursimu.</h1>
        <p className="page-head__lede">
          Akses dibeli lewat admin dan langsung terikat ke email kamu. Ada dua jenis tiket — per show, atau
          per durasi untuk semua show.
        </p>
      </header>

      <section className="pricing">
        <article className="price stub">
          <div className="price__main">
            <p className="eyebrow">Tiket satuan</p>
            <h2 className="display">Per show</h2>
            <p>Satu email, satu show pilihan. Berlaku sampai show selesai ditayangkan.</p>
          </div>
          <div className="price__tag">
            <span className="mono">HARGA</span>
            <b className="display">{config.price_show || "Tanya admin"}</b>
          </div>
        </article>
        <article className="price price--pass stub">
          <div className="price__main">
            <p className="eyebrow">Tiket terusan</p>
            <h2 className="display">Per durasi</h2>
            <p>Semua show selama periode aktif — misalnya 7 atau 30 hari. Cocok untuk yang nonton rutin.</p>
          </div>
          <div className="price__tag">
            <span className="mono">HARGA</span>
            <b className="display">{config.price_pass || "Tanya admin"}</b>
          </div>
        </article>
        <div className="pricing__cta">
          {contactHref(config, "Halo admin, saya mau beli akses Harukaze48. Email saya: ") ? (
            <a className="btn btn--red" target="_blank" rel="noreferrer" href={contactHref(config, "Halo admin, saya mau beli akses Harukaze48. Email saya: ")}>
              {config.contact_label || "Hubungi admin"} <span className="arrow">→</span>
            </a>
          ) : (
            <span className="eyebrow">Kontak admin belum diatur</span>
          )}
          <Link to="/akses" className="link-u">Sudah bayar? Cek email →</Link>
        </div>
      </section>

      <div className="tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "is-on" : ""} onClick={() => setTab(k)}>
            {label}
            <span className="mono">{k === "all" ? shows.length : shows.filter((s) => s.status === k).length}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="trow-skel">{[0, 1, 2, 3].map((i) => <div key={i} />)}</div>
      ) : error ? (
        <p className="empty">{error}</p>
      ) : list.length === 0 ? (
        <p className="empty">Tidak ada show di kategori ini.</p>
      ) : (
        <div className="sched__list">
          {list.map((s, i) => <TicketRow key={s.slug} show={s} index={i} action={buy(s)} />)}
        </div>
      )}
    </div>
  );
}
