import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { gsap, useGSAP, SplitText, prefersReducedMotion } from "../lib/gsap";
import { useShows, useSiteConfig } from "../lib/hooks";
import { HeroTicket, TicketRow } from "../components/Ticket";
import Marquee from "../components/Marquee";
import "../styles/home.css";

// Garis-garis "angin" yang tergambar pelan di belakang hero.
function WindLines() {
  return (
    <svg className="wind" viewBox="0 0 1200 600" preserveAspectRatio="none" aria-hidden="true">
      <path d="M-20 420 C 220 330, 380 520, 640 400 S 1020 260, 1240 330" />
      <path d="M-20 470 C 260 400, 420 560, 700 450 S 1040 330, 1240 390" />
      <path d="M-20 140 C 180 90, 360 210, 560 150 S 920 60, 1240 120" />
    </svg>
  );
}

const STEPS = [
  {
    k: "01",
    title: "Hubungi admin",
    body: "Pilih show yang mau ditonton, atau paket durasi (mis. 7 atau 30 hari). Selesaikan pembayaran lewat admin.",
  },
  {
    k: "02",
    title: "Email kamu didaftarkan",
    body: "Admin menambahkan email kamu — untuk satu show tertentu atau untuk semua show selama durasi paket.",
  },
  {
    k: "03",
    title: "Masuk pakai email",
    body: "Buka ruang nonton, ketik email yang sama. Tanpa akun, tanpa password, tanpa kode.",
  },
];

export default function Home() {
  const { shows, loading } = useShows();
  const config = useSiteConfig();
  const root = useRef(null);
  const navigate = useNavigate();
  const [email, setEmail] = useState("");

  const hero = shows.find((s) => s.status === "live") || shows[0];
  const liveCount = shows.filter((s) => s.status === "live").length;

  useGSAP(
    () => {
      const reduce = prefersReducedMotion();
      const split = SplitText.create(".hero__title", { type: "lines,words", mask: "lines" });
      const tl = gsap.timeline({ delay: 0.35 });
      tl.from(split.words, { yPercent: 110, duration: 1, stagger: 0.04, ease: "expo.out" })
        .from(".hero__eyebrow, .hero__lede, .hero__actions", { y: 18, opacity: 0, stagger: 0.08 }, "-=0.7")
        .from(".hero__kanji", { opacity: 0, x: 30, duration: 1.2 }, "-=1");

      if (!reduce) {
        gsap.utils.toArray(".wind path").forEach((p, i) => {
          const len = p.getTotalLength();
          gsap.set(p, { strokeDasharray: len, strokeDashoffset: len });
          gsap.to(p, { strokeDashoffset: 0, duration: 2.6, delay: 0.4 + i * 0.25, ease: "power2.inOut" });
          gsap.to(p, { y: i % 2 ? 14 : -14, duration: 5 + i, repeat: -1, yoyo: true, ease: "sine.inOut" });
        });
        gsap.to(".hero__kanji", {
          yPercent: 25,
          ease: "none",
          scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
        });
      }

      gsap.utils.toArray(".reveal").forEach((el) => {
        gsap.from(el, { y: 40, opacity: 0, duration: 0.9, scrollTrigger: { trigger: el, start: "top 85%" } });
      });

      gsap.from(".step", {
        y: 60,
        opacity: 0,
        stagger: 0.12,
        scrollTrigger: { trigger: ".steps", start: "top 75%" },
      });
      gsap.from(".step__k", {
        textContent: 0,
        duration: 1.2,
        snap: { textContent: 1 },
        stagger: 0.12,
        scrollTrigger: { trigger: ".steps", start: "top 75%" },
        onUpdate() {
          this.targets().forEach((t) => (t.textContent = String(Math.round(+t.textContent)).padStart(2, "0")));
        },
      });

      return () => split.revert();
    },
    { scope: root }
  );

  // Tiket hero & daftar program masuk setelah data datang.
  useGSAP(
    () => {
      if (loading) return;
      gsap.fromTo(
        ".hticket",
        { y: 80, rotate: 4, opacity: 0 },
        { y: 0, rotate: -2.5, opacity: 1, duration: 1.2, ease: "expo.out", delay: 0.3 }
      );
      gsap.fromTo(".stamp", { scale: 2.6, opacity: 0, rotate: -30 }, { scale: 1, opacity: 1, rotate: -12, duration: 0.5, ease: "back.out(2)", delay: 1.2 });
      gsap.from(".program .trow", {
        x: -40,
        opacity: 0,
        stagger: 0.08,
        scrollTrigger: { trigger: ".program", start: "top 80%" },
      });
    },
    { scope: root, dependencies: [loading] }
  );

  // Tiket mengikuti kursor sedikit (desktop).
  const onTilt = (e) => {
    if (prefersReducedMotion() || window.innerWidth < 900) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    gsap.to(".hticket", { rotateY: x * 10, rotateX: -y * 8, rotate: -2.5 + x * 2, duration: 0.6, ease: "power2.out" });
  };
  const onTiltOut = () => gsap.to(".hticket", { rotateY: 0, rotateX: 0, rotate: -2.5, duration: 0.8 });

  const marqueeItems = shows.length ? shows.map((s) => s.name) : ["Theater JKT48", "Ruang nonton Harukaze48", "Masuk cukup dengan email"];

  return (
    <div ref={root} className="home">
      <section className="hero">
        <WindLines />
        <div className="wrap hero__grid">
          <div className="hero__copy">
            <p className="eyebrow hero__eyebrow">
              {liveCount > 0 ? (
                <><span className="live-dot" /> {liveCount} show sedang tayang</>
              ) : (
                <>Ruang nonton · Theater JKT48</>
              )}
            </p>
            <h1 className="display hero__title">Kursimu di theater, kini sejauh satu email.</h1>
            <p className="hero__lede">
              Tidak perlu daftar akun. Admin mendaftarkan email kamu untuk satu show atau satu periode —
              lalu cukup ketik email itu di pintu masuk.
            </p>
            <div className="hero__actions">
              <Link to="/jadwal" className="btn btn--red">Lihat jadwal & tiket <span className="arrow">→</span></Link>
              <Link to="/akses" className="btn btn--ghost">Cek email saya</Link>
            </div>
          </div>
          <div className="hero__ticket" onMouseMove={onTilt} onMouseLeave={onTiltOut}>
            {loading ? <div className="hticket hticket--ghost stub" /> : <HeroTicket show={hero} />}
          </div>
        </div>
        <div className="hero__kanji" aria-hidden="true">春風</div>
      </section>

      {config.announcement && (
        <div className="wrap">
          <p className="notice reveal"><span className="mono">PENGUMUMAN</span>{config.announcement}</p>
        </div>
      )}

      <Marquee items={marqueeItems} />

      <section className="wrap program">
        <header className="sec-head reveal">
          <p className="eyebrow">Program · {shows.length} show</p>
          <h2 className="display">Yang akan naik panggung</h2>
          <Link to="/jadwal" className="link-u sec-head__more">Semua jadwal →</Link>
        </header>
        {loading ? (
          <div className="trow-skel">{[0, 1, 2].map((i) => <div key={i} />)}</div>
        ) : shows.length === 0 ? (
          <p className="empty">Belum ada show yang dijadwalkan. Mampir lagi nanti.</p>
        ) : (
          <div className="program__list">
            {shows.slice(0, 5).map((s, i) => <TicketRow key={s.slug} show={s} index={i} />)}
          </div>
        )}
      </section>

      <section className="wrap how">
        <header className="sec-head reveal">
          <p className="eyebrow">Cara masuk</p>
          <h2 className="display">Tiga langkah, tanpa akun.</h2>
        </header>
        <ol className="steps">
          {STEPS.map((s) => (
            <li key={s.k} className="step">
              <span className="step__k display">{s.k}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="wrap">
        <form
          className="gate reveal"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(`/akses?email=${encodeURIComponent(email.trim())}`);
          }}
        >
          <div>
            <p className="eyebrow">Sudah bayar?</p>
            <h2 className="display">Cek tiket yang terdaftar di emailmu.</h2>
          </div>
          <div className="gate__row">
            <label className="sr-only" htmlFor="home-email">Email</label>
            <input
              id="home-email"
              className="input"
              type="email"
              required
              placeholder="nama@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="btn btn--red" type="submit">Cek <span className="arrow">→</span></button>
          </div>
        </form>
      </section>
    </div>
  );
}
