#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
//  Harukaze48 — Partner signer (OshiGO Partner Streaming)
//
//  Kenapa terpisah dari Cloudflare Worker?
//  OshiGO mewajibkan request datang dari IP server yang di-whitelist dan IP itu
//  ikut ditandatangani. IP keluar Cloudflare Workers berganti-ganti, jadi signer
//  ini dijalankan di VPS ber-IP tetap. Ia hanya mendengarkan di 127.0.0.1 dan
//  diekspos lewat reverse proxy (nginx / Cloudflare Tunnel) sebagai
//  https://ap.harukaze48.my.id. Worker memanggil endpoint ini dengan SIGNER_TOKEN.
//
//  Tanpa dependency — butuh Node.js 18+ (fetch & crypto bawaan).
// ════════════════════════════════════════════════════════════════════════

import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── konfigurasi (.env di folder ini atau environment) ──────────────────────
loadDotEnv(path.join(path.dirname(fileURLToPath(import.meta.url)), ".env"));

const CFG = {
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 8788),
  partnerBase: (process.env.PARTNER_BASE || "https://st.oshigo.web.id").replace(/\/$/, ""),
  keyId: process.env.PARTNER_KEY_ID || "",
  secret: process.env.PARTNER_SECRET || "",
  serverIp: process.env.PARTNER_SERVER_IP || "",
  siteOrigin: (process.env.SITE_ORIGIN || "https://harukaze48.my.id").replace(/\/$/, ""),
  signerToken: process.env.SIGNER_TOKEN || "",
  fallbackSlug: process.env.SHOW_SLUG_FALLBACK || "",
  defaultTtl: Number(process.env.SESSION_TTL || 120),
};

const API = "/api/public/partner/v1";

function loadDotEnv(file) {
  try {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* .env opsional */ }
}

const log = (...a) => console.log(new Date().toISOString(), ...a);

// ── tanda tangan sesuai dokumentasi OshiGO ─────────────────────────────────
//  subkey    = HMAC_SHA256(SECRET, "YYYY-MM-DD|KEY_ID|SERVER_IP") -> hex   (hari UTC)
//  base      = TS:NONCE:METHOD:PATH:SHA256(body)
//  signature = HMAC_SHA256(bytes(subkey), base) -> hex
export function signedHeaders(method, pathname, body = "", now = Date.now()) {
  const day = new Date(now).toISOString().slice(0, 10);
  const subkeyHex = crypto.createHmac("sha256", CFG.secret).update(`${day}|${CFG.keyId}|${CFG.serverIp}`).digest("hex");
  const ts = String(Math.floor(now / 1000));
  const nonce = crypto.randomBytes(16).toString("hex");
  const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
  const base = `${ts}:${nonce}:${method.toUpperCase()}:${pathname}:${bodyHash}`;
  const signature = crypto.createHmac("sha256", Buffer.from(subkeyHex, "hex")).update(base).digest("hex");
  return {
    "X-Partner-Key": CFG.keyId,
    "X-Timestamp": ts,
    "X-Nonce": nonce,
    "X-Signature": signature,
    "content-type": "application/json",
    // Panggilan selalu tampil berasal dari situs kita (domain terdaftar di dashboard OshiGO).
    origin: CFG.siteOrigin,
    referer: `${CFG.siteOrigin}/`,
    "user-agent": "Harukaze48-Signer/1.0",
  };
}

async function partner(method, pathname, payload) {
  const body = payload === undefined ? "" : JSON.stringify(payload); // ditandatangani & dikirim string yang sama
  const res = await fetch(CFG.partnerBase + pathname, {
    method,
    headers: signedHeaders(method, pathname, body),
    body: method === "GET" ? undefined : body,
    signal: AbortSignal.timeout(12000),
  });
  let data;
  try {
    data = await res.json();
  } catch {
    data = { ok: false, code: "BAD_UPSTREAM", message: `Respon OshiGO bukan JSON (HTTP ${res.status}).` };
  }
  return { status: res.status, data };
}

// ── cache daftar show (untuk memetakan slug) ───────────────────────────────
let showsCache = { at: 0, data: null };
async function getShows(force = false) {
  if (!force && showsCache.data && Date.now() - showsCache.at < 60_000) return showsCache.data;
  const { data } = await partner("GET", `${API}/shows`);
  if (data?.ok) showsCache = { at: Date.now(), data };
  return data;
}

// Slug dari situs (biasanya slug IDN Plus) belum tentu sama dengan show_slug OshiGO.
// Urutan: cocok persis → SHOW_SLUG_FALLBACK → satu-satunya show yang entitled.
async function resolveSlug(requested) {
  const want = String(requested || "").trim().toLowerCase();
  const shows = await getShows().catch(() => null);
  const list = shows?.ok ? shows.shows || [] : [];
  if (!list.length) return want || CFG.fallbackSlug;
  const exact = list.find((s) => [s.show_slug, s.slug].map((x) => String(x || "").toLowerCase()).includes(want));
  if (exact) return exact.show_slug || exact.slug;
  if (CFG.fallbackSlug) return CFG.fallbackSlug;
  const entitled = list.filter((s) => s.entitled);
  if (entitled.length === 1) return entitled[0].show_slug || entitled[0].slug;
  return want;
}

// ── HTTP server ────────────────────────────────────────────────────────────
const send = (res, status, data) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(data));
};

function authorized(req) {
  if (!CFG.signerToken) return false;
  const got = Buffer.from(String(req.headers["x-signer-token"] || ""));
  const want = Buffer.from(CFG.signerToken);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

async function readBody(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 16_384) throw new Error("too large");
  }
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://signer");
  try {
    if (url.pathname === "/health") {
      return send(res, 200, { ok: true, partner: CFG.partnerBase, server_ip: CFG.serverIp, key: CFG.keyId ? CFG.keyId.slice(0, 6) + "…" : null });
    }
    if (!authorized(req)) return send(res, 401, { ok: false, code: "UNAUTHORIZED", message: "Token signer salah." });

    if (url.pathname === "/session" && req.method === "POST") {
      const b = await readBody(req);
      const show_slug = await resolveSlug(b.show_slug);
      if (!show_slug) return send(res, 400, { ok: false, code: "BAD_REQUEST", field: "show_slug", message: "show_slug wajib." });
      const ttl = Math.min(Math.max(Number(b.ttl) || CFG.defaultTtl, 30), 300);
      const payload = { show_slug, ttl, ...(b.viewer_id ? { viewer_id: String(b.viewer_id).slice(0, 120) } : {}) };
      const { status, data } = await partner("POST", `${API}/session`, payload);
      log("session", b.show_slug, "→", show_slug, status, data?.ok ? "ok" : data?.code);
      return send(res, data?.ok ? 200 : status >= 400 ? status : 502, data);
    }
    if (url.pathname === "/session/revoke" && req.method === "POST") {
      const b = await readBody(req);
      const { status, data } = await partner("POST", `${API}/session/revoke`, b);
      return send(res, status, data);
    }
    if (url.pathname === "/shows" && req.method === "GET") return send(res, 200, await getShows(true));
    if (url.pathname === "/usage" && req.method === "GET") {
      const { status, data } = await partner("GET", `${API}/usage`);
      return send(res, status, data);
    }
    return send(res, 404, { ok: false, code: "NOT_FOUND" });
  } catch (e) {
    log("error", url.pathname, e.message);
    return send(res, 502, { ok: false, code: "SIGNER_ERROR", message: "Signer gagal menghubungi OshiGO." });
  }
});

async function detectIp() {
  try {
    const r = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(5000) });
    return (await r.json()).ip;
  } catch {
    return "";
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const missing = ["PARTNER_KEY_ID", "PARTNER_SECRET", "SIGNER_TOKEN"].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Variabel wajib belum diisi: ${missing.join(", ")} (lihat signer/.env.example)`);
    process.exit(1);
  }
  const egress = await detectIp();
  if (!CFG.serverIp) {
    CFG.serverIp = egress;
    log(`PARTNER_SERVER_IP kosong → pakai IP keluar terdeteksi: ${egress || "(gagal deteksi)"}`);
  } else if (egress && egress !== CFG.serverIp) {
    log(`PERINGATAN: IP keluar ${egress} ≠ PARTNER_SERVER_IP ${CFG.serverIp}. Tanda tangan akan ditolak (SIGNATURE_REJECTED).`);
  }
  server.listen(CFG.port, CFG.host, () => log(`signer di http://${CFG.host}:${CFG.port} → ${CFG.partnerBase} (IP ${CFG.serverIp})`));
}

export { CFG, resolveSlug };
