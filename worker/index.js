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
];

const DEFAULT_SIGNER = "https://ap.harukaze48.my.id";
const DEFAULT_PARTNER_ORIGIN = "https://st.oshigo.web.id";
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
  !g.revoked && g.starts_at <= now && g.expires_at > now && (g.kind === "pass" || g.show_slug === slug);

const publicGrant = (g) => ({
  id: g.id, kind: g.kind, show_slug: g.show_slug, show_title: g.show_title,
  starts_at: g.starts_at, expires_at: g.expires_at, max_devices: g.max_devices,
});

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

async function streamSession(request, env) {
  const { token } = await readJson(request);
  const p = await verifyToken(env, token);
  if (!p || p.t !== "v") return fail("TOKEN_INVALID", "Sesi akses habis, masukkan email lagi.", 401);

  const g = await env.DB.prepare("SELECT * FROM grants WHERE id = ?").bind(p.g).first();
  if (!g || !grantCovers(g, p.s, Date.now())) return fail("NO_ACCESS", "Akses untuk show ini sudah tidak berlaku.", 403);
  const dev = await env.DB.prepare("SELECT 1 FROM grant_devices WHERE grant_id = ? AND device_id = ?").bind(g.id, p.d).first();
  if (!dev) return fail("DEVICE_RESET", "Perangkat ini sudah dilepas oleh admin. Masukkan email lagi.", 401);

  const signer = (env.PARTNER_SIGNER_BASE || DEFAULT_SIGNER).replace(/\/$/, "");
  const origin = request.headers.get("origin") || new URL(request.url).origin;
  let data;
  try {
    const res = await fetch(`${signer}/session`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ show_slug: p.s, viewer_id: (await sha256Hex(p.e)).slice(0, 32), ttl: 120 }),
    });
    data = await res.json();
  } catch {
    return fail("SIGNER_DOWN", "Server stream tidak merespon, coba lagi sebentar.", 502);
  }
  if (!data || !data.ok) return json({ ok: false, code: data?.code || "SIGNER_ERROR", message: data?.message }, 502);

  const partnerOrigin = env.PARTNER_ORIGIN || DEFAULT_PARTNER_ORIGIN;
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
  const [active, emails, entries, upcoming] = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS n FROM grants WHERE revoked = 0 AND starts_at <= ? AND expires_at > ?").bind(now, now),
    env.DB.prepare("SELECT COUNT(DISTINCT email) AS n FROM grants WHERE revoked = 0 AND expires_at > ?").bind(now),
    env.DB.prepare("SELECT COUNT(*) AS n FROM entries WHERE at > ?").bind(dayAgo),
    env.DB.prepare("SELECT COUNT(*) AS n FROM grants WHERE revoked = 0 AND starts_at > ?").bind(now),
  ]);
  return json({
    ok: true,
    data: {
      active: active.results[0].n,
      emails: emails.results[0].n,
      entries_24h: entries.results[0].n,
      upcoming: upcoming.results[0].n,
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
