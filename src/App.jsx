import { useEffect, useState, useRef, useCallback } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import ProductDetail from "./pages/ProductDetail";
import PurchaseForm from "./pages/PurchaseForm";
import Checkout from "./pages/Checkout";
import Cart from "./pages/Cart";
import Wishlist from "./pages/Wishlist";
import Success from "./pages/Success";
import Order from "./pages/Order";
import MyOrders from "./pages/PesananSaya";
import Register from "./pages/Register";
import Login from "./pages/Login";
import ProfilePage from "./pages/Profile";
import Header from "./components/Header";
import LiveStream from "./pages/live";
import Verify from "./pages/verify";
import Replay from "./pages/replay";
import AdminLive from "./pages/admin";

// ─────────────────────────────────────────────────────────────
//  PESAN BLOKIR
// ─────────────────────────────────────────────────────────────
const BLOCKED_MSG = "lu ngapain kocak ini udah di secure sama JKT48Connect";

// ─────────────────────────────────────────────────────────────
//  DETEKSI DEVICE
//  Minimal 2 dari 3 sinyal agar dianggap mobile
// ─────────────────────────────────────────────────────────────
const isMobileDevice = () => {
  try {
    const ua = navigator.userAgent || "";
    const signals = [
      navigator.maxTouchPoints > 1,
      window.matchMedia?.("(pointer: coarse)").matches ?? false,
      /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile/i.test(ua),
    ];
    return signals.filter(Boolean).length >= 2;
  } catch {
    return false;
  }
};

// Deteksi iOS/Safari spesifik (termasuk iPhone 11, 12, dll)
const isIOS = () => {
  try {
    return (
      /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
  } catch {
    return false;
  }
};

// Deteksi Safari (bukan Chrome/Firefox di iOS)
const isSafari = () => {
  try {
    const ua = navigator.userAgent || "";
    return /Safari/i.test(ua) && !/Chrome|CriOS|FxiOS/i.test(ua);
  } catch {
    return false;
  }
};

// ─────────────────────────────────────────────────────────────
//  KILL MEDIA
// ─────────────────────────────────────────────────────────────
const killAllMedia = () => {
  try {
    document.querySelectorAll("video,audio").forEach((el) => {
      try { el.pause(); el.src = ""; el.load(); } catch {}
    });
  } catch {}
};

// ─────────────────────────────────────────────────────────────
//  DETEKSI DEVTOOLS
//  Setiap method didesain aman — iOS/iPhone TIDAK menggunakan
//  console trick karena Safari selalu trigger getter
// ─────────────────────────────────────────────────────────────

// Method 1 — window size gap (DESKTOP ONLY, skip mobile sama sekali)
const detectBySize = () => {
  if (isMobileDevice()) return false;
  try {
    return (
      window.outerWidth  - window.innerWidth  > 130 ||
      window.outerHeight - window.innerHeight > 130
    );
  } catch {
    return false;
  }
};

// Method 2 — console getter trick
// DINONAKTIFKAN untuk iOS/Safari karena false positive tinggi
let _cd = false;
const _di = (() => {
  try {
    const img = new Image();
    Object.defineProperty(img, "id", { get() { _cd = true; return "x"; } });
    return img;
  } catch {
    return null;
  }
})();

const detectByConsole = () => {
  // iOS Safari selalu trigger ini — skip total untuk iOS
  if (isIOS() || isSafari()) return false;
  // Android juga sering false positive, skip mobile semua
  if (isMobileDevice()) return false;
  try {
    if (!_di) return false;
    _cd = false;
    window.console.log(_di);
    window.console.clear();
    return _cd;
  } catch {
    return false;
  }
};

// Method 3 — toString/valueOf trick
// DINONAKTIFKAN untuk semua mobile karena tidak reliable
const detectByToString = () => {
  if (isMobileDevice()) return false;
  try {
    let hit = false;
    const o = {
      toString() { hit = true; return ""; },
      valueOf()  { hit = true; return 0; },
    };
    window.console.log(o);
    window.console.clear();
    return hit;
  } catch {
    return false;
  }
};

// Method 4 — debugger timing (DESKTOP ONLY)
const detectByDebugger = () => {
  if (isMobileDevice()) return false;
  try {
    const t = performance.now();
    // eslint-disable-next-line no-debugger
    debugger;
    return performance.now() - t > 100;
  } catch {
    return false;
  }
};

// Method 5 — Firebug legacy (desktop only, aman)
const detectFirebug = () => {
  if (isMobileDevice()) return false;
  try {
    return !!(window.Firebug?.chrome?.isInitialized);
  } catch {
    return false;
  }
};

// Method 6 — window size khusus desktop dengan threshold lebih ketat
const detectBySizeStrict = () => {
  if (isMobileDevice()) return false;
  try {
    const widthGap  = window.outerWidth  - window.innerWidth;
    const heightGap = window.outerHeight - window.innerHeight;
    // Threshold 200px agar tidak false positive saat resize biasa
    return widthGap > 200 || heightGap > 200;
  } catch {
    return false;
  }
};

// Aggregate — hanya untuk DESKTOP
const runDesktopDetections = () => {
  if (isMobileDevice()) return false;
  try {
    return (
      detectBySize()      ||
      detectByConsole()   ||
      detectByToString()  ||
      detectFirebug()
    );
  } catch {
    return false;
  }
};

// ─────────────────────────────────────────────────────────────
//  BLOKIR KEYBOARD SHORTCUTS & KLIK KANAN
// ─────────────────────────────────────────────────────────────
const blockContextMenu = (e) => {
  e.preventDefault();
  e.stopPropagation();
  return false;
};

const blockDevKeys = (e) => {
  const k = e.key?.toLowerCase() ?? "";
  if (e.keyCode === 123 || k === "f12") {
    e.preventDefault(); e.stopPropagation(); return false;
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && ["i","j","c","k"].includes(k)) {
    e.preventDefault(); e.stopPropagation(); return false;
  }
  if ((e.ctrlKey || e.metaKey) && ["u","s","p"].includes(k)) {
    e.preventDefault(); e.stopPropagation(); return false;
  }
};

// ─────────────────────────────────────────────────────────────
//  ANTI-SCRAPING
// ─────────────────────────────────────────────────────────────
const applyAntiScraping = () => {
  // 1. Nonaktifkan seleksi teks
  if (!document.getElementById("__as_css__")) {
    const s = document.createElement("style");
    s.id = "__as_css__";
    s.textContent = `
      * { -webkit-user-select:none!important; user-select:none!important; }
      input, textarea { -webkit-user-select:text!important; user-select:text!important; }
      img { pointer-events:none!important; -webkit-user-drag:none!important; }
    `;
    document.head.appendChild(s);
  }

  // 2. Blokir drag-to-copy
  document.addEventListener("dragstart", (e) => e.preventDefault(), { capture: true, passive: false });

  // 3. Blokir copy/cut
  const blockClip = (e) => {
    if (["INPUT","TEXTAREA"].includes(e.target?.tagName)) return;
    e.preventDefault();
    e.stopPropagation();
    try { navigator.clipboard?.writeText?.(BLOCKED_MSG); } catch {}
  };
  document.addEventListener("copy", blockClip, { capture: true });
  document.addEventListener("cut",  blockClip, { capture: true });

  // 4. Blokir print
  window.addEventListener("beforeprint", (e) => e.preventDefault(), { capture: true });
  window.print = () => {};

  // 5. Deteksi bot/headless UA
  const ua = (navigator.userAgent || "").toLowerCase();
  const botUA = [
    "headless","phantomjs","selenium","puppeteer","playwright",
    "webdriver","scrapy","wget","python-requests","python-urllib",
    "axios/","node-fetch","got/","httpie","pycurl","aiohttp","httpx",
    "curl/","libwww","java/1","go-http-client","postmanruntime","insomnia",
    "mechanize","lwp-","zgrab","masscan","nikto","sqlmap",
  ];
  if (botUA.some((p) => ua.includes(p))) {
    document.open(); document.write(BLOCKED_MSG); document.close();
    window.stop?.();
    return;
  }

  // 6. Deteksi navigator.webdriver
  if (navigator.webdriver === true) {
    document.open(); document.write(BLOCKED_MSG); document.close();
    window.stop?.();
    return;
  }

  // 7. Deteksi globals injeksi otomasi
  const autoGlobals = [
    "__webdriver_evaluate","__selenium_evaluate","__webdriver_script_function",
    "__webdriver_script_func","__webdriver_script_fn","__fxdriver_evaluate",
    "__driver_unwrapped","__webdriver_unwrapped","__driver_evaluate",
    "__selenium_unwrapped","__fxdriver_unwrapped","callPhantom","_phantom",
    "__nightmare","domAutomation","domAutomationController",
    "_selenium","__$webdriverAsyncExecutor","__lastWatirAlert",
  ];
  if (autoGlobals.some((g) => g in window)) {
    document.open(); document.write(BLOCKED_MSG); document.close();
    window.stop?.();
    return;
  }

  // 8. Override fetch untuk bot
  const isBot = () =>
    navigator.webdriver === true ||
    botUA.some((p) => (navigator.userAgent || "").toLowerCase().includes(p)) ||
    autoGlobals.some((g) => g in window);

  const _origFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    if (isBot()) {
      return new Response(BLOCKED_MSG, {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    return _origFetch(input, init);
  };

  // 9. Override XMLHttpRequest untuk bot
  const _origOpen = XMLHttpRequest.prototype.open;
  const _origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._botBlocked = isBot();
    if (!this._botBlocked) _origOpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    if (this._botBlocked) {
      Object.defineProperty(this, "readyState",  { get: () => 4,           configurable: true });
      Object.defineProperty(this, "status",       { get: () => 200,         configurable: true });
      Object.defineProperty(this, "responseText", { get: () => BLOCKED_MSG, configurable: true });
      Object.defineProperty(this, "response",     { get: () => BLOCKED_MSG, configurable: true });
      setTimeout(() => {
        try { this.onreadystatechange?.(); } catch {}
        try { this.onload?.(); }             catch {}
      }, 10);
      return;
    }
    _origSend.apply(this, args);
  };

  // 10. Cegah iframe embedding
  if (window.top !== window.self) {
    try {
      window.top.location.href = window.self.location.href;
    } catch {
      document.open(); document.write(BLOCKED_MSG); document.close();
    }
  }

  // 11. Cegah view-source
  if (window.location.protocol === "view-source:") {
    document.open(); document.write(BLOCKED_MSG); document.close();
  }
};

// ─────────────────────────────────────────────────────────────
//  DEVTOOLS BLOCKER UI
// ─────────────────────────────────────────────────────────────
function DevToolsBlocker() {
  useEffect(() => {
    killAllMedia();
    const t = setInterval(killAllMedia, 200);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      onContextMenu={blockContextMenu}
      style={{
        position:         "fixed",
        inset:            0,
        background:       "#000",
        zIndex:           2147483647,
        display:          "flex",
        flexDirection:    "column",
        alignItems:       "center",
        justifyContent:   "center",
        gap:              "20px",
        userSelect:       "none",
        WebkitUserSelect: "none",
        cursor:           "not-allowed",
        fontFamily:       "system-ui, -apple-system, sans-serif",
        padding:          "24px",
        boxSizing:        "border-box",
      }}
    >
      <div style={{ fontSize: "clamp(52px, 14vw, 80px)", lineHeight: 1 }}>🚫</div>
      <p style={{
        color:         "#fff",
        fontSize:      "clamp(1.5rem, 7vw, 3rem)",
        fontWeight:    900,
        margin:        0,
        letterSpacing: "4px",
        textAlign:     "center",
        textTransform: "uppercase",
      }}>
        Mau ngapain?
      </p>
      <p style={{
        color:      "#DC1F2E",
        fontSize:   "clamp(13px, 4vw, 18px)",
        fontWeight: 700,
        margin:     0,
        textAlign:  "center",
        lineHeight: 1.7,
        maxWidth:   "480px",
      }}>
        {BLOCKED_MSG}
      </p>
      <div style={{
        width:        "60px",
        height:       "3px",
        background:   "#DC1F2E",
        borderRadius: "2px",
      }} />
      <p style={{
        color:      "#444",
        fontSize:   "clamp(10px, 2.8vw, 13px)",
        margin:     0,
        textAlign:  "center",
        maxWidth:   "320px",
        lineHeight: 1.7,
      }}>
        Tutup Developer Tools untuk melanjutkan.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  HOOK — useStrictDevToolsDetection
//
//  MOBILE (termasuk iPhone 11, iPhone lama, Android):
//    → Deteksi DINONAKTIFKAN total, tidak ada polling
//    → Hanya anti-scraping (bot UA, webdriver, dll) yang aktif
//
//  DESKTOP:
//    → Semua method aktif, threshold 2 hit berturut
// ─────────────────────────────────────────────────────────────
function useStrictDevToolsDetection() {
  const [detected,    setDetected]  = useState(false);
  const lockedRef                   = useRef(false);
  const consecutiveRef              = useRef(0);
  const fastIntervalRef             = useRef(null);
  const slowIntervalRef             = useRef(null);

  // Mobile: threshold sangat tinggi (praktis tidak pernah trigger)
  // Desktop: 2 hit berturut sudah cukup
  const mobile    = isMobileDevice();
  const THRESHOLD = mobile ? 999 : 2;

  const trigger = useCallback(() => {
    if (lockedRef.current) return;
    consecutiveRef.current += 1;
    if (consecutiveRef.current >= THRESHOLD) {
      lockedRef.current = true;
      killAllMedia();
      setDetected(true);
    }
  }, [THRESHOLD]);

  const resetCount = useCallback(() => {
    if (!lockedRef.current) consecutiveRef.current = 0;
  }, []);

  useEffect(() => {
    // Anti-scraping selalu aktif
    applyAntiScraping();

    // Keyboard blocker selalu aktif
    document.addEventListener("contextmenu", blockContextMenu, { capture: true });
    document.addEventListener("keydown",     blockDevKeys,      { capture: true });
    document.addEventListener("keyup",       blockDevKeys,      { capture: true });

    // ── MOBILE: tidak ada polling devtools sama sekali ──
    if (mobile) {
      // Hanya pasang listener, tidak ada interval devtools
      return () => {
        document.removeEventListener("contextmenu", blockContextMenu, { capture: true });
        document.removeEventListener("keydown",     blockDevKeys,      { capture: true });
        document.removeEventListener("keyup",       blockDevKeys,      { capture: true });
      };
    }

    // ── DESKTOP: polling devtools aktif ──

    // Fast poll — 500ms
    fastIntervalRef.current = setInterval(() => {
      if (lockedRef.current) return;
      runDesktopDetections() ? trigger() : resetCount();
    }, 500);

    // Slow poll — 3 detik, debugger timing
    slowIntervalRef.current = setInterval(() => {
      if (lockedRef.current) return;
      if (detectByDebugger()) trigger();
    }, 3000);

    // Resize listener — desktop only
    const onResize = () => {
      if (lockedRef.current) return;
      detectBySizeStrict() ? trigger() : resetCount();
    };
    window.addEventListener("resize", onResize);

    // Visibility change
    const onVisibility = () => {
      if (lockedRef.current) return;
      if (document.visibilityState === "visible" && runDesktopDetections()) trigger();
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Initial check untuk desktop
    if (runDesktopDetections() || detectByDebugger()) trigger();

    return () => {
      clearInterval(fastIntervalRef.current);
      clearInterval(slowIntervalRef.current);
      document.removeEventListener("contextmenu",      blockContextMenu, { capture: true });
      document.removeEventListener("keydown",          blockDevKeys,      { capture: true });
      document.removeEventListener("keyup",            blockDevKeys,      { capture: true });
      window.removeEventListener("resize",             onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [trigger, resetCount, mobile]);

  return detected;
}

// ─────────────────────────────────────────────────────────────
//  APP
// ─────────────────────────────────────────────────────────────
function App() {
  const devToolsOpen = useStrictDevToolsDetection();

  if (devToolsOpen) return <DevToolsBlocker />;

  return (
    <Router>
      <Header />
      <main>
        <Routes>
          <Route path="/"                   element={<Home />} />
          <Route path="/keranjang"          element={<Cart />} />
          <Route path="/product/:id"        element={<ProductDetail />} />
          <Route path="/purchase/:id"       element={<PurchaseForm />} />
          <Route path="/checkout"           element={<Checkout />} />
          <Route path="/wish"               element={<Wishlist />} />
          <Route path="/success"            element={<Success />} />
          <Route path="/order"              element={<Order />} />
          <Route path="/myorder"            element={<MyOrders />} />
          <Route path="/register"           element={<Register />} />
          <Route path="/login"              element={<Login />} />
          <Route path="/profile"            element={<ProfilePage />} />
          <Route path="/live/:playbackId"   element={<LiveStream />} />
          <Route path="/verify"             element={<Verify />} />
          <Route path="/replay/:playbackId" element={<Replay />} />
          <Route path="/admin" element={<AdminLive />} />
          <Route path="*"                   element={<NotFound />} />
        </Routes>
      </main>
    </Router>
  );
}

// ─────────────────────────────────────────────────────────────
//  404
// ─────────────────────────────────────────────────────────────
function NotFound() {
  return (
    <div style={{
      textAlign:      "center",
      padding:        "50px 20px",
      minHeight:      "60vh",
      display:        "flex",
      flexDirection:  "column",
      justifyContent: "center",
      alignItems:     "center",
    }}>
      <h1 style={{ fontSize: "48px", color: "#e74c3c", marginBottom: "20px" }}>404</h1>
      <h2 style={{ fontSize: "24px", marginBottom: "20px" }}>Halaman Tidak Ditemukan</h2>
      <p style={{ fontSize: "16px", color: "#666", marginBottom: "30px" }}>
        Maaf, halaman yang Anda cari tidak dapat ditemukan.
      </p>
      <a
        href="/"
        style={{
          backgroundColor: "#3498db",
          color:           "white",
          padding:         "12px 24px",
          textDecoration:  "none",
          borderRadius:    "4px",
          fontSize:        "16px",
        }}
      >
        Kembali ke Beranda
      </a>
    </div>
  );
}

export default App;
