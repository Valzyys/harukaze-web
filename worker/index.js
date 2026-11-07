// ════════════════════════════════════════════════════════════════════════
//  Harukaze48 — Cloudflare Worker
//  • Melayani SPA (dist/) lewat binding ASSETS
//  • /api/* → akses berbasis email (D1), panel admin, dan sesi stream partner
//  • Skema D1 dibuat otomatis saat request pertama (tanpa migrasi manual)
// ════════════════════════════════════════════════════════════════════════

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS grants (
     id TEXT PRIMARY KEY, email TEXT NOT NULL,
     kind TEXT NOT NULL CHECK (kind IN ('show','pass')),
     show_slug TEXT, show_title TEXT,
     starts_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
     max_devices INTEGER NOT NULL DEFAULT 1, note TEXT,
     revoked INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_grants_email ON grants (email)`,
  `CREATE INDEX IF NOT EXISTS idx_grants_expires ON grants (expires_at)`,
  `CREATE TABLE IF NOT EXISTS grant_devices (
     grant_id TEXT NOT NULL, device_id TEXT NOT NULL,
     first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL,
     PRIMARY KEY (grant_id, device_id))`,
  `CREATE TABLE IF NOT EXISTS entries (
     id INTEGER PRIMARY KEY AUTOINCREMENT, grant_id TEXT NOT NULL,
     email TEXT NOT NULL, show_slug TEXT NOT NULL, at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_entries_at ON entries (at)`,
  `CREATE TABLE IF NOT EXISTS bypass_links (
     id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE,
     kind TEXT NOT NULL DEFAULT 'show' CHECK (kind IN ('show','pass')),
     show_slug TEXT, show_title TEXT,
     starts_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
     max_devices INTEGER NOT NULL DEFAULT 1, max_ips INTEGER NOT NULL DEFAULT 1,
     note TEXT, revoked INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_bypass_code ON bypass_links (code)`,
  `CREATE INDEX IF NOT EXISTS idx_bypass_expires ON bypass_links (expires_at)`,
  `CREATE TABLE IF NOT EXISTS bypass_devices (
     bypass_id TEXT NOT NULL, ip TEXT NOT NULL, device_id TEXT NOT NULL,
     first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL,
     PRIMARY KEY (bypass_id, ip, device_id))`,
  `CREATE INDEX IF NOT EXISTS idx_bypass_devices_id ON bypass_devices (bypass_id)`,
];

const DEFAULT_PARTNER_ORIGIN = "https://st.oshigo.web.id";
const PARTNER_API = "/api/public/partner/v1";
const SITE_ORIGIN = "https://harukaze48.my.id"; // Origin/Referer yang dikirim ke OshiGO
const PUBLIC_SETTING_KEYS = ["contact_url", "contact_label", "announcement", "price_show", "price_pass"];
const VIEWER_TOKEN_TTL = 6 * 60 * 60 * 1000; // 6 jam
const ADMIN_TOKEN_TTL = 12 * 60 * 60 * 1000;

let schemaReady = null;

// ── helpers ────────────────────────────────────────────────────────────────
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
const fail = (code, message, status = 400) => json({ ok: false, code, message }, status);

const enc = new TextEncoder();
const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlDecode = (s) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const randomId = (n = 16) => b64url(crypto.getRandomValues(new Uint8Array(n)));
const normEmail = (e) => String(e || "").trim().toLowerCase();
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function ensureSchema(db) {
  if (!schemaReady) {
    schemaReady = db.batch(SCHEMA.map((q) => db.prepare(q))).catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

async function getSetting(db, key) {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first();
  return row ? row.value : null;
}
const setSetting = (db, key, value) =>
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(key, String(value)).run();

// Secret untuk tanda tangan token: dari env.APP_SECRET, atau dibuat otomatis lalu disimpan di D1.
async function getSecret(env) {
  if (env.APP_SECRET) return env.APP_SECRET;
  let s = await getSetting(env.DB, "app_secret");
  if (!s) {
    s = randomId(32);
    await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('app_secret', ?)").bind(s).run();
    s = await getSetting(env.DB, "app_secret");
  }
  return s;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function signToken(env, payload) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(await getSecret(env)), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}
async function verifyToken(env, token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(await getSecret(env)), b64urlDecode(sig), enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

async function hashPassword(password, saltB64) {
  const salt = saltB64 ? b64urlDecode(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, key, 256);
  return `${b64url(salt)}:${b64url(bits)}`;
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

const grantCovers = (g, slug, now) =>
  !g.revoked && g.starts_at <= now && g.expires_at > now && (g.kind === "pass" || !slug || g.show_slug === slug);

const publicGrant = (g) => ({
  id: g.id, kind: g.kind, show_slug: g.show_slug, show_title: g.show_title,
  starts_at: g.starts_at, expires_at: g.expires_at, max_devices: g.max_devices,
});

const publicBypass = (b) => ({
  id: b.id, code: b.code, kind: b.kind, show_slug: b.show_slug, show_title: b.show_title,
  starts_at: b.starts_at, expires_at: b.expires_at, max_devices: b.max_devices, max_ips: b.max_ips,
  note: b.note, bypass: true,
});

const clientIp = (request) =>
  (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    (request.headers.get("x-forwarded-for") || "").split(",")[0] ||
    "local"
  ).trim().slice(0, 64) || "local";

// ── viewer routes ─────────────────────────────────────────────────────────
async function publicConfig(env) {
  const rows = await env.DB.prepare(
    `SELECT key, value FROM settings WHERE key IN (${PUBLIC_SETTING_KEYS.map(() => "?").join(",")})`
  ).bind(...PUBLIC_SETTING_KEYS).all();
  const out = {};
  for (const r of rows.results) out[r.key] = r.value;
  return json({ ok: true, data: out });
}

async function accessLookup(request, env) {
  const { email } = await readJson(request);
  const e = normEmail(email);
  if (!isEmail(e)) return fail("BAD_EMAIL", "Format email tidak valid.");
  const now = Date.now();
  const rows = await env.DB.prepare(
    "SELECT * FROM grants WHERE email = ? AND revoked = 0 AND expires_at > ? ORDER BY starts_at ASC"
  ).bind(e, now).all();
  return json({ ok: true, data: rows.results.map(publicGrant) });
}

async function accessEnter(request, env) {
  const { email, slug, device_id } = await readJson(request);
  const e = normEmail(email);
  const s = String(slug || "").trim();
  const dev = String(device_id || "").slice(0, 64);
  if (!isEmail(e)) return fail("BAD_EMAIL", "Format email tidak valid.");
  if (!s) return fail("BAD_SLUG", "Show tidak dikenali.");
  if (!dev) return fail("BAD_DEVICE", "Perangkat tidak dikenali, muat ulang halaman.");

  const now = Date.now();
  const { results } = await env.DB.prepare(
    "SELECT * FROM grants WHERE email = ? AND revoked = 0 AND expires_at > ? ORDER BY kind = 'show' DESC, expires_at DESC"
  ).bind(e, now).all();
  const candidates = results.filter((g) => grantCovers(g, s, now));
  if (!candidates.length) {
    const upcoming = results.find((g) => (g.kind === "pass" || g.show_slug === s) && g.starts_at > now);
    if (upcoming) return fail("NOT_YET", "Akses kamu belum aktif. Mulai berlaku " + new Date(upcoming.starts_at).toISOString(), 403);
    return fail("NO_ACCESS", "Email ini belum punya akses untuk show ini.", 403);
  }

  // Pilih grant yang perangkat ini sudah terdaftar, atau yang masih punya slot.
  let chosen = null;
  for (const g of candidates) {
    const known = await env.DB.prepare("SELECT 1 FROM grant_devices WHERE grant_id = ? AND device_id = ?").bind(g.id, dev).first();
    if (known) { chosen = g; break; }
    const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM grant_devices WHERE grant_id = ?").bind(g.id).first();
    if (n < g.max_devices) { chosen = g; break; }
  }
  if (!chosen) return fail("DEVICE_LIMIT", "Email ini sudah dipakai di perangkat lain. Hubungi admin untuk reset perangkat.", 403);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO grant_devices (grant_id, device_id, first_seen, last_seen) VALUES (?, ?, ?, ?)
       ON CONFLICT(grant_id, device_id) DO UPDATE SET last_seen = excluded.last_seen`
    ).bind(chosen.id, dev, now, now),
    env.DB.prepare("INSERT INTO entries (grant_id, email, show_slug, at) VALUES (?, ?, ?, ?)").bind(chosen.id, e, s, now),
  ]);

  const exp = Math.min(chosen.expires_at, now + VIEWER_TOKEN_TTL);
  const token = await signToken(env, { t: "v", g: chosen.id, e, s, d: dev, exp });
  return json({ ok: true, token, expires_at: exp, grant: publicGrant(chosen) });
}

async function bypassEnter(request, env) {
  const { code, slug, device_id } = await readJson(request);
  const c = String(code || "").trim();
  const reqSlug = String(slug || "").trim();
  const dev = String(device_id || "").slice(0, 64);
  if (!c) return fail("BAD_CODE", "Kode link bypass tidak valid.");
  if (!dev) return fail("BAD_DEVICE", "Perangkat tidak dikenali, muat ulang halaman.");

  const now = Date.now();
  const link = await env.DB.prepare("SELECT * FROM bypass_links WHERE lower(code) = lower(?)").bind(c).first();
  if (!link) return fail("NOT_FOUND", "Link bypass tidak ditemukan atau tidak valid.", 404);
  if (link.revoked) return fail("REVOKED", "Link bypass ini telah dicabut oleh admin.", 403);
  if (link.starts_at > now) {
    return fail("NOT_YET", "Link bypass ini belum aktif. Mulai berlaku " + new Date(link.starts_at).toISOString(), 403);
  }
  if (link.expires_at <= now) {
    return fail("EXPIRED", "Masa aktif link bypass ini sudah berakhir.", 403);
  }

  if (link.kind === "show" && reqSlug && link.show_slug && reqSlug !== link.show_slug) {
    return json(
      {
        ok: false,
        code: "WRONG_SHOW",
        target_slug: link.show_slug,
        message: `Link bypass ini khusus untuk show "${link.show_title || link.show_slug}".`,
      },
      403
    );
  }

  const targetSlug = link.kind === "show" ? String(link.show_slug || reqSlug).trim() : reqSlug || String(link.show_slug || "").trim();
  const ip = clientIp(request);

  const known = await env.DB.prepare(
    "SELECT 1 FROM bypass_devices WHERE bypass_id = ? AND ip = ? AND device_id = ?"
  ).bind(link.id, ip, dev).first();

  if (!known) {
    const { n: devOnIp } = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM bypass_devices WHERE bypass_id = ? AND ip = ?"
    ).bind(link.id, ip).first();

    if (devOnIp === 0 && link.max_ips > 0) {
      const { n: totalIps } = await env.DB.prepare(
        "SELECT COUNT(DISTINCT ip) AS n FROM bypass_devices WHERE bypass_id = ?"
      ).bind(link.id).first();
      if (totalIps >= link.max_ips) {
        return fail(
          "IP_LIMIT",
          `Link bypass ini sudah mencapai batas jaringan/IP (maks ${link.max_ips} IP). Hubungi admin untuk reset.`,
          403
        );
      }
    }

    if (devOnIp >= link.max_devices) {
      return fail(
        "DEVICE_LIMIT",
        `Batas perangkat untuk IP ini sudah penuh (maks ${link.max_devices} perangkat/IP). Hubungi admin untuk reset.`,
        403
      );
    }
  }

  const stmts = [
    env.DB.prepare(
      `INSERT INTO bypass_devices (bypass_id, ip, device_id, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(bypass_id, ip, device_id) DO UPDATE SET last_seen = excluded.last_seen`
    ).bind(link.id, ip, dev, now, now),
  ];
  if (targetSlug) {
    stmts.push(
      env.DB.prepare("INSERT INTO entries (grant_id, email, show_slug, at) VALUES (?, ?, ?, ?)")
        .bind(link.id, `bypass:${link.code}`, targetSlug, now)
    );
  }
  await env.DB.batch(stmts);

  const exp = Math.min(link.expires_at, now + VIEWER_TOKEN_TTL);
  const token = await signToken(env, {
    t: "v",
    b: link.id,
    c: link.code,
    s: targetSlug,
    d: dev,
    ip,
    exp,
  });
  return json({
    ok: true,
    token,
    expires_at: exp,
    show_slug: targetSlug,
    grant: publicBypass(link),
  });
}

// Ganti origin playback_url ke partner origin yang dipakai (st.oshigo.web.id)
function toPartnerOrigin(url, origin) {
  try {
    const u = new URL(url);
    if (u.pathname.startsWith("/api/partner")) {
      const o = new URL(origin);
      u.protocol = o.protocol;
      u.host = o.host;
    }
    return u.toString();
  } catch {
    return url;
  }
}

// ── signer partner OshiGO (langsung di Worker, tanpa host terpisah) ─────────
//  subkey    = HMAC_SHA256(SECRET, "YYYY-MM-DD|KEY_ID|SERVER_IP") -> hex (hari UTC)
//  base      = TS:NONCE:METHOD:PATH:SHA256(body)
//  signature = HMAC_SHA256(bytes(subkey), base) -> hex
async function hmacHex(keyBytes, msg) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function partnerFetch(env, method, pathname, bodyObj) {
  const base = (env.PARTNER_ORIGIN || DEFAULT_PARTNER_ORIGIN).replace(/\/$/, "");
  const keyId = env.PARTNER_KEY_ID || "";
  const secret = env.PARTNER_SECRET || "";
  const serverIp = env.PARTNER_SERVER_IP || "";
  const body = bodyObj === undefined ? "" : JSON.stringify(bodyObj); // ditandatangani & dikirim sama persis

  const day = new Date().toISOString().slice(0, 10);
  const subkeyHex = await hmacHex(enc.encode(secret), `${day}|${keyId}|${serverIp}`);
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = randomId(16);
  const bodyHash = await sha256Hex(body);
  const signature = await hmacHex(hexToBytes(subkeyHex), `${ts}:${nonce}:${method}:${pathname}:${bodyHash}`);

  const res = await fetch(base + pathname, {
    method,
    headers: {
      "X-Partner-Key": keyId,
      "X-Timestamp": ts,
      "X-Nonce": nonce,
      "X-Signature": signature,
      "content-type": "application/json",
      origin: SITE_ORIGIN,
      referer: `${SITE_ORIGIN}/`,
    },
    body: method === "GET" ? undefined : body,
  });
  return res.json();
}

const hexToBytes = (hex) => Uint8Array.from(hex.match(/.{2}/g) || [], (h) => parseInt(h, 16));

// Slug situs (slug IDN Plus) → show_slug OshiGO. Cocok persis → fallback → satu-satunya entitled.
let showsCache = { at: 0, data: null };
async function resolvePartnerSlug(env, requested) {
  const want = String(requested || "").trim().toLowerCase();
  try {
    if (!showsCache.data || Date.now() - showsCache.at > 60_000) {
      const s = await partnerFetch(env, "GET", `${PARTNER_API}/shows`);
      if (s?.ok) showsCache = { at: Date.now(), data: s };
    }
    const list = showsCache.data?.shows || [];
    const hit = list.find((x) => [x.show_slug, x.slug].map((v) => String(v || "").toLowerCase()).includes(want));
    if (hit) return hit.show_slug || hit.slug;
    if (env.SHOW_SLUG_FALLBACK) return env.SHOW_SLUG_FALLBACK;
    const entitled = list.filter((x) => x.entitled);
    if (entitled.length === 1) return entitled[0].show_slug || entitled[0].slug;
  } catch { /* pakai slug apa adanya */ }
  return env.SHOW_SLUG_FALLBACK || want;
}

async function streamSession(request, env) {
  const { token, slug: reqSlug } = await readJson(request);
  const p = await verifyToken(env, token);
  if (!p || p.t !== "v") return fail("TOKEN_INVALID", "Sesi akses habis, silakan masuk ulang.", 401);

  const now = Date.now();
  const targetSlug = String(reqSlug || p.s || "").trim();

  if (p.b) {
    const b = await env.DB.prepare("SELECT * FROM bypass_links WHERE id = ?").bind(p.b).first();
    if (!b || !grantCovers(b, targetSlug, now)) {
      return fail("NO_ACCESS", "Link bypass untuk show ini sudah tidak berlaku.", 403);
    }
    const dev = await env.DB.prepare("SELECT 1 FROM bypass_devices WHERE bypass_id = ? AND device_id = ?").bind(b.id, p.d).first();
    if (!dev) return fail("DEVICE_RESET", "Perangkat/IP untuk link ini sudah dilepas oleh admin. Buka ulang link bypass.", 401);
  } else {
    const g = await env.DB.prepare("SELECT * FROM grants WHERE id = ?").bind(p.g).first();
    if (!g || !grantCovers(g, targetSlug, now)) return fail("NO_ACCESS", "Akses untuk show ini sudah tidak berlaku.", 403);
    const dev = await env.DB.prepare("SELECT 1 FROM grant_devices WHERE grant_id = ? AND device_id = ?").bind(g.id, p.d).first();
    if (!dev) return fail("DEVICE_RESET", "Perangkat ini sudah dilepas oleh admin. Masukkan email lagi.", 401);
  }

  if (!env.PARTNER_KEY_ID || !env.PARTNER_SECRET) {
    return fail("SIGNER_NOT_CONFIGURED", "Kredensial partner (PARTNER_KEY_ID/PARTNER_SECRET) belum dipasang.", 500);
  }

  let data;
  try {
    const slug = await resolvePartnerSlug(env, targetSlug);
    const viewerSeed = p.b ? `bypass:${p.b}:${p.d}` : p.e;
    data = await partnerFetch(env, "POST", `${PARTNER_API}/session`, {
      show_slug: slug,
      viewer_id: (await sha256Hex(viewerSeed)).slice(0, 32),
      ttl: 120,
    });
  } catch {
    return fail("SIGNER_DOWN", "Server stream tidak merespon, coba lagi sebentar.", 502);
  }
  if (!data || !data.ok) return json({ ok: false, code: data?.code || "SIGNER_ERROR", message: data?.message }, 502);

  const partnerOrigin = env.PARTNER_ORIGIN || DEFAULT_PARTNER_ORIGIN;
  // playback_url (dan playlist/resume nanti di browser) menunjuk ke oshigo.web.id
  // yang sudah di-takedown → arahkan ke st.oshigo.web.id.
  return json({ ...data, playback_url: toPartnerOrigin(data.playback_url, partnerOrigin) });
}

// ── admin ─────────────────────────────────────────────────────────────────
// Kredensial default: kaze / haru. Bisa ditimpa lewat env ADMIN_USERNAME / ADMIN_PASSWORD,
// dan password bisa diganti dari panel admin (disimpan sebagai hash di D1).
const DEFAULT_ADMIN_USER = "kaze";
const DEFAULT_ADMIN_PASS = "haru";
const LOGIN_MAX_FAILS = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

const adminUser = (env) => (env.ADMIN_USERNAME || DEFAULT_ADMIN_USER).trim().toLowerCase();

async function checkAdminPassword(env, password) {
  const stored = await getSetting(env.DB, "admin_pass_hash");
  if (stored) {
    const [salt] = stored.split(":");
    return timingSafeEqual(await hashPassword(password, salt), stored);
  }
  return timingSafeEqual(password, env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASS);
}

async function requireAdmin(request, env) {
  const auth = request.headers.get("authorization") || "";
  const p = await verifyToken(env, auth.replace(/^Bearer\s+/i, ""));
  return p && p.t === "a" ? p : null;
}

async function adminLogin(request, env) {
  const { username, password } = await readJson(request);
  const ip = request.headers.get("cf-connecting-ip") || "local";
  const key = `login_fail:${ip}`;
  const now = Date.now();

  // Kunci sementara setelah beberapa kali gagal (password default pendek, jadi wajib).
  const rec = JSON.parse((await getSetting(env.DB, key)) || "null");
  if (rec && rec.n >= LOGIN_MAX_FAILS && now - rec.t < LOGIN_LOCK_MS) {
    const mins = Math.ceil((LOGIN_LOCK_MS - (now - rec.t)) / 60000);
    return fail("LOCKED", `Terlalu banyak percobaan. Coba lagi dalam ${mins} menit.`, 429);
  }

  const userOk = timingSafeEqual(String(username || "").trim().toLowerCase(), adminUser(env));
  const passOk = await checkAdminPassword(env, String(password || ""));
  if (!userOk || !passOk) {
    const fresh = !rec || now - rec.t >= LOGIN_LOCK_MS;
    await setSetting(env.DB, key, JSON.stringify({ n: fresh ? 1 : rec.n + 1, t: fresh ? now : rec.t }));
    return fail("BAD_LOGIN", "Username atau password salah.", 401);
  }
  if (rec) await env.DB.prepare("DELETE FROM settings WHERE key = ?").bind(key).run();
  return json({ ok: true, token: await signToken(env, { t: "a", exp: now + ADMIN_TOKEN_TTL }) });
}

async function adminStats(env) {
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const [active, emails, entries, upcoming, bypassActive] = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS n FROM grants WHERE revoked = 0 AND starts_at <= ? AND expires_at > ?").bind(now, now),
    env.DB.prepare("SELECT COUNT(DISTINCT email) AS n FROM grants WHERE revoked = 0 AND expires_at > ?").bind(now),
    env.DB.prepare("SELECT COUNT(*) AS n FROM entries WHERE at > ?").bind(dayAgo),
    env.DB.prepare("SELECT COUNT(*) AS n FROM grants WHERE revoked = 0 AND starts_at > ?").bind(now),
    env.DB.prepare("SELECT COUNT(*) AS n FROM bypass_links WHERE revoked = 0 AND starts_at <= ? AND expires_at > ?").bind(now, now),
  ]);
  return json({
    ok: true,
    data: {
      active: active.results[0].n,
      emails: emails.results[0].n,
      entries_24h: entries.results[0].n,
      upcoming: upcoming.results[0].n,
      bypass_active: bypassActive.results[0].n,
    },
  });
}

async function adminListGrants(url, env) {
  const q = normEmail(url.searchParams.get("q"));
  const status = url.searchParams.get("status") || "all";
  const now = Date.now();
  const where = [];
  const binds = [];
  if (q) { where.push("(g.email LIKE ? OR g.show_title LIKE ? OR g.show_slug LIKE ?)"); binds.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (status === "active") { where.push("g.revoked = 0 AND g.expires_at > ?"); binds.push(now); }
  if (status === "expired") { where.push("(g.revoked = 1 OR g.expires_at <= ?)"); binds.push(now); }
  const sql = `SELECT g.*, (SELECT COUNT(*) FROM grant_devices d WHERE d.grant_id = g.id) AS devices,
                      (SELECT MAX(at) FROM entries e WHERE e.grant_id = g.id) AS last_entry
               FROM grants g ${where.length ? "WHERE " + where.join(" AND ") : ""}
               ORDER BY g.created_at DESC LIMIT 300`;
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return json({ ok: true, data: results });
}

async function adminCreateGrants(request, env) {
  const body = await readJson(request);
  const emails = [...new Set(String(body.emails || "").split(/[\s,;]+/).map(normEmail).filter(Boolean))];
  const bad = emails.filter((e) => !isEmail(e));
  if (!emails.length) return fail("NO_EMAIL", "Masukkan minimal satu email.");
  if (bad.length) return fail("BAD_EMAIL", `Email tidak valid: ${bad.join(", ")}`);
  const kind = body.kind === "pass" ? "pass" : "show";
  const startsAt = Number(body.starts_at) || Date.now();
  const expiresAt = Number(body.expires_at);
  if (!expiresAt || expiresAt <= startsAt) return fail("BAD_RANGE", "Waktu berakhir harus setelah waktu mulai.");
  if (kind === "show" && !body.show_slug) return fail("NO_SHOW", "Pilih show untuk akses per-show.");
  const maxDevices = Math.min(Math.max(parseInt(body.max_devices, 10) || 1, 1), 10);
  const now = Date.now();
  const stmts = emails.map((e) =>
    env.DB.prepare(
      `INSERT INTO grants (id, email, kind, show_slug, show_title, starts_at, expires_at, max_devices, note, revoked, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
    ).bind(randomId(9), e, kind, kind === "show" ? String(body.show_slug) : null,
      kind === "show" ? String(body.show_title || body.show_slug) : null,
      startsAt, expiresAt, maxDevices, body.note ? String(body.note).slice(0, 200) : null, now)
  );
  await env.DB.batch(stmts);
  return json({ ok: true, created: emails.length });
}

async function adminUpdateGrant(id, request, env) {
  const body = await readJson(request);
  const g = await env.DB.prepare("SELECT * FROM grants WHERE id = ?").bind(id).first();
  if (!g) return fail("NOT_FOUND", "Akses tidak ditemukan.", 404);
  if (body.action === "extend") {
    const ms = Number(body.ms) || 0;
    if (ms <= 0) return fail("BAD_DURATION", "Durasi tidak valid.");
    const base = Math.max(g.expires_at, Date.now());
    await env.DB.prepare("UPDATE grants SET expires_at = ?, revoked = 0 WHERE id = ?").bind(base + ms, id).run();
  } else if (body.action === "revoke") {
    await env.DB.prepare("UPDATE grants SET revoked = 1 WHERE id = ?").bind(id).run();
  } else if (body.action === "restore") {
    await env.DB.prepare("UPDATE grants SET revoked = 0 WHERE id = ?").bind(id).run();
  } else if (body.action === "reset_devices") {
    await env.DB.prepare("DELETE FROM grant_devices WHERE grant_id = ?").bind(id).run();
  } else if (body.action === "devices") {
    const n = Math.min(Math.max(parseInt(body.max_devices, 10) || 1, 1), 10);
    await env.DB.prepare("UPDATE grants SET max_devices = ? WHERE id = ?").bind(n, id).run();
  } else return fail("BAD_ACTION", "Aksi tidak dikenal.");
  return json({ ok: true });
}

async function adminDeleteGrant(id, env) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM grant_devices WHERE grant_id = ?").bind(id),
    env.DB.prepare("DELETE FROM grants WHERE id = ?").bind(id),
  ]);
  return json({ ok: true });
}

// ── admin bypass links ────────────────────────────────────────────────────
async function adminListBypass(url, env) {
  const q = String(url.searchParams.get("q") || "").trim().toLowerCase();
  const status = url.searchParams.get("status") || "all";
  const now = Date.now();
  const where = [];
  const binds = [];
  if (q) {
    where.push("(lower(b.code) LIKE ? OR lower(b.note) LIKE ? OR lower(b.show_title) LIKE ? OR lower(b.show_slug) LIKE ?)");
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (status === "active") { where.push("b.revoked = 0 AND b.expires_at > ?"); binds.push(now); }
  if (status === "expired") { where.push("(b.revoked = 1 OR b.expires_at <= ?)"); binds.push(now); }
  const sql = `SELECT b.*,
                      (SELECT COUNT(*) FROM bypass_devices d WHERE d.bypass_id = b.id) AS devices,
                      (SELECT COUNT(DISTINCT ip) FROM bypass_devices d WHERE d.bypass_id = b.id) AS ips,
                      (SELECT group_concat(ip || ' (' || cnt || ')', ', ')
                         FROM (SELECT ip, COUNT(*) AS cnt FROM bypass_devices d WHERE d.bypass_id = b.id GROUP BY ip)) AS ip_summary,
                      (SELECT MAX(at) FROM entries e WHERE e.grant_id = b.id) AS last_entry
               FROM bypass_links b ${where.length ? "WHERE " + where.join(" AND ") : ""}
               ORDER BY b.created_at DESC LIMIT 300`;
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return json({ ok: true, data: results });
}

async function adminCreateBypass(request, env) {
  const body = await readJson(request);
  const kind = body.kind === "pass" ? "pass" : "show";
  const startsAt = Number(body.starts_at) || Date.now();
  const expiresAt = Number(body.expires_at);
  if (!expiresAt || expiresAt <= startsAt) return fail("BAD_RANGE", "Waktu berakhir harus setelah waktu mulai.");
  if (kind === "show" && !body.show_slug) return fail("NO_SHOW", "Pilih show tujuan untuk link bypass ini.");

  const maxDevices = Math.min(Math.max(parseInt(body.max_devices, 10) || 1, 1), 20);
  const rawMaxIps = parseInt(body.max_ips, 10);
  const maxIps = Number.isNaN(rawMaxIps) ? 1 : Math.min(Math.max(rawMaxIps, 0), 100);
  const count = Math.min(Math.max(parseInt(body.count, 10) || 1, 1), 50);
  const customCode = String(body.custom_code || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);

  if (customCode && count > 1) {
    return fail("BAD_CODE", "Kode kustom hanya bisa dipakai saat membuat 1 link.");
  }
  if (customCode) {
    const exists = await env.DB.prepare("SELECT 1 FROM bypass_links WHERE lower(code) = lower(?)").bind(customCode).first();
    if (exists) return fail("CODE_TAKEN", "Kode link sudah dipakai, gunakan kode lain.");
  }

  const now = Date.now();
  const showSlug = kind === "show" ? String(body.show_slug) : (body.show_slug ? String(body.show_slug) : null);
  const showTitle = kind === "show" ? String(body.show_title || body.show_slug) : (body.show_title ? String(body.show_title) : null);
  const note = body.note ? String(body.note).slice(0, 200) : null;

  const created = [];
  const stmts = [];
  for (let i = 0; i < count; i++) {
    const id = randomId(9);
    const code = customCode || randomId(8);
    created.push({
      id,
      code,
      kind,
      show_slug: showSlug,
      show_title: showTitle,
      starts_at: startsAt,
      expires_at: expiresAt,
      max_devices: maxDevices,
      max_ips: maxIps,
      note,
      revoked: 0,
      created_at: now,
    });
    stmts.push(
      env.DB.prepare(
        `INSERT INTO bypass_links (id, code, kind, show_slug, show_title, starts_at, expires_at, max_devices, max_ips, note, revoked, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
      ).bind(id, code, kind, showSlug, showTitle, startsAt, expiresAt, maxDevices, maxIps, note, now)
    );
  }
  await env.DB.batch(stmts);
  return json({ ok: true, created: created.length, data: created });
}

async function adminUpdateBypass(id, request, env) {
  const body = await readJson(request);
  const b = await env.DB.prepare("SELECT * FROM bypass_links WHERE id = ?").bind(id).first();
  if (!b) return fail("NOT_FOUND", "Link bypass tidak ditemukan.", 404);
  if (body.action === "extend") {
    const ms = Number(body.ms) || 0;
    if (ms <= 0) return fail("BAD_DURATION", "Durasi tidak valid.");
    const base = Math.max(b.expires_at, Date.now());
    await env.DB.prepare("UPDATE bypass_links SET expires_at = ?, revoked = 0 WHERE id = ?").bind(base + ms, id).run();
  } else if (body.action === "revoke") {
    await env.DB.prepare("UPDATE bypass_links SET revoked = 1 WHERE id = ?").bind(id).run();
  } else if (body.action === "restore") {
    await env.DB.prepare("UPDATE bypass_links SET revoked = 0 WHERE id = ?").bind(id).run();
  } else if (body.action === "reset_devices") {
    await env.DB.prepare("DELETE FROM bypass_devices WHERE bypass_id = ?").bind(id).run();
  } else if (body.action === "limits") {
    const maxDevices = body.max_devices !== undefined
      ? Math.min(Math.max(parseInt(body.max_devices, 10) || 1, 1), 20)
      : b.max_devices;
    const rawIps = body.max_ips !== undefined ? parseInt(body.max_ips, 10) : b.max_ips;
    const maxIps = Number.isNaN(rawIps) ? b.max_ips : Math.min(Math.max(rawIps, 0), 100);
    await env.DB.prepare("UPDATE bypass_links SET max_devices = ?, max_ips = ? WHERE id = ?").bind(maxDevices, maxIps, id).run();
  } else return fail("BAD_ACTION", "Aksi tidak dikenal.");
  return json({ ok: true });
}

async function adminDeleteBypass(id, env) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM bypass_devices WHERE bypass_id = ?").bind(id),
    env.DB.prepare("DELETE FROM bypass_links WHERE id = ?").bind(id),
  ]);
  return json({ ok: true });
}

async function adminSaveSettings(request, env) {
  const body = await readJson(request);
  const stmts = [];
  for (const k of PUBLIC_SETTING_KEYS) {
    if (k in body) stmts.push(
      env.DB.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .bind(k, String(body[k] ?? "").slice(0, 1000))
    );
  }
  if (stmts.length) await env.DB.batch(stmts);
  return json({ ok: true });
}

async function adminChangePassword(request, env) {
  const { current, password } = await readJson(request);
  if (!(await checkAdminPassword(env, String(current || "")))) return fail("BAD_PASSWORD", "Password lama salah.", 401);
  if (!password || String(password).length < 4) return fail("WEAK_PASSWORD", "Password baru minimal 4 karakter.");
  await setSetting(env.DB, "admin_pass_hash", await hashPassword(String(password)));
  return json({ ok: true });
}

// ── router ────────────────────────────────────────────────────────────────
async function handleApi(request, env, url) {
  if (!env.DB) return fail("NO_DB", "Binding D1 'DB' belum terpasang.", 500);
  await ensureSchema(env.DB);
  const { pathname } = url;
  const m = request.method;

  if (pathname === "/api/config" && m === "GET") return publicConfig(env);
  if (pathname === "/api/access/lookup" && m === "POST") return accessLookup(request, env);
  if (pathname === "/api/access/enter" && m === "POST") return accessEnter(request, env);
  if (pathname === "/api/bypass/enter" && m === "POST") return bypassEnter(request, env);
  if (pathname === "/api/stream/session" && m === "POST") return streamSession(request, env);

  if (pathname === "/api/admin/login" && m === "POST") return adminLogin(request, env);

  if (pathname.startsWith("/api/admin/")) {
    if (!(await requireAdmin(request, env))) return fail("UNAUTHORIZED", "Sesi admin habis, login lagi.", 401);
    if (pathname === "/api/admin/stats" && m === "GET") return adminStats(env);
    if (pathname === "/api/admin/grants" && m === "GET") return adminListGrants(url, env);
    if (pathname === "/api/admin/grants" && m === "POST") return adminCreateGrants(request, env);
    const gm = pathname.match(/^\/api\/admin\/grants\/([\w-]+)$/);
    if (gm && m === "PATCH") return adminUpdateGrant(gm[1], request, env);
    if (gm && m === "DELETE") return adminDeleteGrant(gm[1], env);
    if (pathname === "/api/admin/bypass" && m === "GET") return adminListBypass(url, env);
    if (pathname === "/api/admin/bypass" && m === "POST") return adminCreateBypass(request, env);
    const bm = pathname.match(/^\/api\/admin\/bypass\/([\w-]+)$/);
    if (bm && m === "PATCH") return adminUpdateBypass(bm[1], request, env);
    if (bm && m === "DELETE") return adminDeleteBypass(bm[1], env);
    if (pathname === "/api/admin/settings" && m === "GET") {
      const { results } = await env.DB.prepare("SELECT key, value FROM settings").all();
      const out = {};
      for (const r of results) if (PUBLIC_SETTING_KEYS.includes(r.key)) out[r.key] = r.value;
      return json({ ok: true, data: out, username: adminUser(env) });
    }
    if (pathname === "/api/admin/settings" && m === "PUT") return adminSaveSettings(request, env);
    if (pathname === "/api/admin/password" && m === "PUT") return adminChangePassword(request, env);
  }
  return fail("NOT_FOUND", "Endpoint tidak ditemukan.", 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, url);
      } catch (e) {
        console.error(e);
        return fail("SERVER_ERROR", "Terjadi kesalahan di server.", 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
