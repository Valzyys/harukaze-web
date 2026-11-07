import { lazy, Suspense, useRef } from "react";
import { BrowserRouter, Routes, Route, useLocation, Link } from "react-router-dom";
import { gsap, useGSAP, ScrollTrigger, prefersReducedMotion } from "./lib/gsap";
import Nav from "./components/Nav";
import Footer from "./components/Footer";
import Home from "./pages/Home";
import Schedule from "./pages/Schedule";
import Access from "./pages/Access";
// Halaman berat (hls.js, supabase) dimuat terpisah.
const Room = lazy(() => import("./pages/Room"));
const Admin = lazy(() => import("./pages/Admin"));

function Shell() {
  const location = useLocation();
  const wipe = useRef(null);
  const immersive =
    location.pathname.startsWith("/live/") ||
    location.pathname.startsWith("/b/") ||
    location.pathname.startsWith("/bypass/") ||
    location.pathname.startsWith("/admin");

  // Tirai merah tipis menyapu layar tiap pindah halaman.
  useGSAP(
    () => {
      window.scrollTo(0, 0);
      ScrollTrigger.refresh();
      if (prefersReducedMotion()) return;
      gsap.fromTo(
        wipe.current,
        { scaleY: 1, transformOrigin: "top" },
        { scaleY: 0, duration: 0.7, ease: "expo.inOut", delay: 0.05 }
      );
    },
    { dependencies: [location.pathname] }
  );

  return (
    <>
      <div className="route-wipe" ref={wipe} aria-hidden="true" />
      {!immersive && <Nav />}
      <main>
        <Suspense fallback={<div className="route-loading" />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/jadwal" element={<Schedule />} />
          <Route path="/akses" element={<Access />} />
          <Route path="/live/:slug" element={<Room />} />
          <Route path="/b/:code" element={<Room />} />
          <Route path="/bypass/:code" element={<Room />} />
          <Route path="/admin" element={<Admin />} />
          {/* tautan lama tetap jalan */}
          <Route path="/buyshow" element={<Schedule />} />
          <Route path="/membership" element={<Schedule />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </main>
      {!immersive && <Footer />}
    </>
  );
}

function NotFound() {
  return (
    <section className="wrap notfound">
      <p className="eyebrow">Kursi 404 · Baris tidak ditemukan</p>
      <h1 className="display">Kursi ini kosong.</h1>
      <p>Halaman yang kamu cari tidak ada di denah gedung kami.</p>
      <Link to="/" className="btn">Kembali ke lobi <span className="arrow">→</span></Link>
    </section>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}
