import { useEffect, useRef, useState } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import { gsap, useGSAP } from "../lib/gsap";

const LINKS = [
  { to: "/", label: "Lobi", end: true },
  { to: "/jadwal", label: "Jadwal & Tiket" },
  { to: "/akses", label: "Cek Akses" },
];

export default function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const root = useRef(null);
  const sheet = useRef(null);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useGSAP(
    () => {
      gsap.from(".nav__brand, .nav__links a, .nav__cta", { y: -16, opacity: 0, stagger: 0.05, duration: 0.6, delay: 0.2 });
    },
    { scope: root }
  );

  useGSAP(
    () => {
      if (!sheet.current) return;
      if (open) {
        gsap.set(sheet.current, { display: "flex" });
        gsap.fromTo(sheet.current, { clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)", duration: 0.55, ease: "expo.out" });
        gsap.fromTo(sheet.current.querySelectorAll("a"), { y: 30, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.06, delay: 0.1 });
      } else {
        gsap.to(sheet.current, { clipPath: "inset(0 0 100% 0)", duration: 0.35, ease: "power2.in", onComplete: () => gsap.set(sheet.current, { display: "none" }) });
      }
    },
    { dependencies: [open] }
  );

  return (
    <header ref={root} className={`nav${scrolled ? " nav--scrolled" : ""}`}>
      <div className="wrap nav__row">
        <Link to="/" className="nav__brand" aria-label="Harukaze48 — beranda">
          <span className="nav__kanji" aria-hidden="true">春風</span>
          <span className="nav__word">Harukaze<em>48</em></span>
        </Link>
        <nav className="nav__links" aria-label="Utama">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end}>{l.label}</NavLink>
          ))}
        </nav>
        <Link to="/akses" className="btn btn--sm nav__cta">Masuk ruang nonton</Link>
        <button className={`nav__burger${open ? " is-open" : ""}`} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Menu">
          <span /><span />
        </button>
      </div>
      <div className="nav__sheet" ref={sheet}>
        {LINKS.map((l, i) => (
          <NavLink key={l.to} to={l.to} end={l.end}>
            <small className="mono">0{i + 1}</small>{l.label}
          </NavLink>
        ))}
      </div>
    </header>
  );
}
