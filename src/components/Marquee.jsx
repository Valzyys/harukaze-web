import { useRef } from "react";
import { gsap, useGSAP, ScrollTrigger, prefersReducedMotion } from "../lib/gsap";

// Pita berjalan; kecepatan ikut kecepatan scroll, arah berbalik saat scroll ke atas.
export default function Marquee({ items, tone = "red" }) {
  const root = useRef(null);
  const track = useRef(null);

  useGSAP(
    () => {
      if (!items.length || prefersReducedMotion()) return;
      const loop = gsap.to(track.current, { xPercent: -50, ease: "none", duration: 28, repeat: -1 });
      let dir = 1;
      const st = ScrollTrigger.create({
        onUpdate: (self) => {
          if (self.direction !== dir) dir = self.direction;
          const boost = Math.min(Math.abs(self.getVelocity()) / 400, 4);
          gsap.to(loop, { timeScale: dir * (1 + boost), duration: 0.25, overwrite: true });
          gsap.to(loop, { timeScale: dir, duration: 1.2, delay: 0.25 });
        },
      });
      return () => st.kill();
    },
    { scope: root, dependencies: [items.join("|")] }
  );

  const row = (
    <>
      {items.map((t, i) => (
        <span key={i} className="marquee__item">
          {t}
          <b aria-hidden="true">春</b>
        </span>
      ))}
    </>
  );

  return (
    <div className={`marquee marquee--${tone}`} ref={root} aria-hidden="true">
      <div className="marquee__track" ref={track}>
        <div className="marquee__set">{row}</div>
        <div className="marquee__set">{row}</div>
      </div>
    </div>
  );
}
