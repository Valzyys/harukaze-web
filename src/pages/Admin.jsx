import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { gsap, useGSAP } from "../lib/gsap";
import { api, store } from "../lib/api";
import { useShows } from "../lib/hooks";
import { fmtDateTime, humanLeft } from "../lib/format";
import "../styles/admin.css";

const HOUR = 3600000;
const DAY = 24 * HOUR;
const PASS_PRESETS = [
  ["1 hari", DAY],
  ["3 hari", 3 * DAY],
  ["7 hari", 7 * DAY],
  ["14 hari", 14 * DAY],
  ["30 hari", 30 * DAY],
];
const SHOW_PRESETS = [
  ["Sampai show selesai", 6 * HOUR],
  ["+1 hari setelah show", DAY],
  ["+3 hari setelah show", 3 * DAY],
];

const toLocalInput = (ts) => {
  const d = new Date(ts - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};

// ── login / setup ─────────────────────────────────────────────────────────
function AdminAuth({ onToken }) {
  const [needsSetup, setNeedsSetup] = useState(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const root = useRef(null);

  useEffect(() => {
    api("/admin/status").then((r) => setNeedsSetup(r.ok ? r.needs_setup : false));
  }, []);

  useGSAP(() => {
    if (needsSetup === null) return;
    gsap.from(".auth > *", { y: 30, opacity: 0, stagger: 0.08 });
  }, { scope: root, dependencies: [needsSetup] });

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (needsSetup && password !== confirm) return setError("Konfirmasi password tidak sama.");
    setBusy(true);
    const r = await api(needsSetup ? "/admin/setup" : "/admin/login", { method: "POST", body: { password } });
    setBusy(false);
    if (!r.ok) return setError(r.message || "Gagal masuk.");
    onToken(r.token);
  };

  return (
    <div className="admin-auth" ref={root}>
      {needsSetup !== null && (
        <form className="auth" onSubmit={submit}>
          <Link to="/" className="auth__brand">Harukaze<em>48</em></Link>
          <p className="eyebrow">{needsSetup ? "Pemasangan pertama" : "Ruang kontrol"}</p>
          <h1 className="display">{needsSetup ? "Buat kunci ruang kontrol." : "Selamat datang kembali."}</h1>
          {needsSetup && <p className="auth__lede">Database sudah siap. Tentukan password admin — hanya diminta sekali.</p>}
          <div className="field">
            <label htmlFor="adm-pw">Password admin</label>
            <input id="adm-pw" className="input" type="password" autoComplete={needsSetup ? "new-password" : "current-password"} required minLength={needsSetup ? 8 : 1} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {needsSetup && (
            <div className="field">
              <label htmlFor="adm-pw2">Ulangi password</label>
              <input id="adm-pw2" className="input" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
          )}
          {error && <p className="note-error">{error}</p>}
          <button className="btn btn--red" disabled={busy}>{busy ? <span className="spinner" /> : needsSetup ? "Simpan & masuk" : "Masuk"}</button>
        </form>
      )}
    </div>
  );
}

// ── angka statistik ───────────────────────────────────────────────────────
function Stat({ label, value }) {
  const ref = useRef(null);
  useEffect(() => {
    const obj = { v: 0 };
    const t = gsap.to(obj, { v: value || 0, duration: 1.1, ease: "power2.out", onUpdate: () => ref.current && (ref.current.textContent = Math.round(obj.v)) });
    return () => t.kill();
  }, [value]);
  return (
    <div className="stat">
      <b className="display" ref={ref}>0</b>
      <span className="eyebrow">{label}</span>
    </div>
  );
}

// ── form tambah akses ─────────────────────────────────────────────────────
function GrantForm({ token, shows, onCreated, toast }) {
  const [kind, setKind] = useState("show");
  const [emails, setEmails] = useState("");
  const [slug, setSlug] = useState("");
  const [manualSlug, setManualSlug] = useState("");
  const [after, setAfter] = useState(SHOW_PRESETS[0][1]);
  const [start, setStart] = useState(() => toLocalInput(Date.now()));
  const [dur, setDur] = useState(7 * DAY);
  const [customDays, setCustomDays] = useState("");
  const [devices, setDevices] = useState(1);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug && shows.length) setSlug(shows[0].slug);
  }, [shows, slug]);

  const show = shows.find((s) => s.slug === slug);
  const list = emails.split(/[\s,;]+/).filter(Boolean);
  const effSlug = slug === "__manual" ? manualSlug.trim() : slug;

  const range = useMemo(() => {
    if (kind === "show") {
      const base = show?.scheduledAt || Date.now();
      return { starts_at: Date.now(), expires_at: Math.max(base, Date.now()) + after };
    }
    const s = new Date(start).getTime() || Date.now();
    const d = customDays ? Number(customDays) * DAY : dur;
    return { starts_at: s, expires_at: s + d };
  }, [kind, show, after, start, dur, customDays]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    const r = await api("/admin/grants", {
      method: "POST",
      token,
      body: {
        emails,
        kind: kind === "show" ? "show" : "pass",
        show_slug: kind === "show" ? effSlug : undefined,
        show_title: kind === "show" ? show?.title || effSlug : undefined,
        ...range,
        max_devices: devices,
        note,
      },
    });
    setBusy(false);
    if (!r.ok) return setError(r.message || "Gagal menyimpan.");
    toast(`${r.created} akses ditambahkan`);
    setEmails("");
    setNote("");
    onCreated();
  };

  return (
    <form className="panel grantform" onSubmit={submit}>
      <header className="panel__head">
        <h2 className="display">Tambah akses</h2>
        <div className="seg" role="radiogroup" aria-label="Jenis akses">
          <button type="button" role="radio" aria-checked={kind === "show"} className={kind === "show" ? "is-on" : ""} onClick={() => setKind("show")}>Per show</button>
          <button type="button" role="radio" aria-checked={kind === "pass"} className={kind === "pass" ? "is-on" : ""} onClick={() => setKind("pass")}>Per durasi</button>
          <i className="seg__thumb" style={{ transform: `translateX(${kind === "show" ? 0 : 100}%)` }} />
        </div>
      </header>

      <div className="field">
        <label htmlFor="g-emails">Email · bisa banyak, pisahkan koma / baris baru</label>
        <textarea id="g-emails" className="input" rows={3} required placeholder={"fans1@email.com\nfans2@email.com"} value={emails} onChange={(e) => setEmails(e.target.value)} />
      </div>

      {kind === "show" ? (
        <>
          <div className="field">
            <label htmlFor="g-show">Show</label>
            <select id="g-show" className="input" value={slug} onChange={(e) => setSlug(e.target.value)}>
              {shows.map((s) => (
                <option key={s.slug} value={s.slug}>{s.status === "live" ? "● " : ""}{s.title}</option>
              ))}
              <option value="__manual">Isi slug manual…</option>
            </select>
          </div>
          {slug === "__manual" && (
            <div className="field">
              <label htmlFor="g-slug">Slug show</label>
              <input id="g-slug" className="input mono" required value={manualSlug} onChange={(e) => setManualSlug(e.target.value)} placeholder="pajama-drive-2026-11-05-..." />
            </div>
          )}
          <div className="field">
            <label>Berlaku sampai</label>
            <div className="chips">
              {SHOW_PRESETS.map(([l, v]) => (
                <button key={l} type="button" className={after === v ? "is-on" : ""} onClick={() => setAfter(v)}>{l}</button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor="g-start">Mulai berlaku</label>
            <input id="g-start" className="input mono" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="field">
            <label>Durasi</label>
            <div className="chips">
              {PASS_PRESETS.map(([l, v]) => (
                <button key={l} type="button" className={!customDays && dur === v ? "is-on" : ""} onClick={() => { setDur(v); setCustomDays(""); }}>{l}</button>
              ))}
              <label className="chips__custom">
                <input type="number" min="1" max="365" placeholder="—" value={customDays} onChange={(e) => setCustomDays(e.target.value)} aria-label="Durasi kustom dalam hari" />
                hari
              </label>
            </div>
          </div>
        </>
      )}

      <div className="grantform__row">
        <div className="field">
          <label>Maks perangkat</label>
          <div className="stepper">
            <button type="button" onClick={() => setDevices((d) => Math.max(1, d - 1))} aria-label="Kurangi">−</button>
            <span className="mono">{devices}</span>
            <button type="button" onClick={() => setDevices((d) => Math.min(10, d + 1))} aria-label="Tambah">+</button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="g-note">Catatan (opsional)</label>
          <input id="g-note" className="input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="mis. bayar via QRIS 05/11" />
        </div>
      </div>

      <p className="grantform__sum mono">
        {list.length || 0} email · {kind === "show" ? (show?.name || effSlug || "—") : "semua show"} · {fmtDateTime(range.starts_at)} → {fmtDateTime(range.expires_at)}
      </p>
      {error && <p className="note-error">{error}</p>}
      <button className="btn btn--red" disabled={busy || !list.length}>{busy ? <span className="spinner" /> : <>Daftarkan akses <span className="arrow">→</span></>}</button>
    </form>
  );
}

// ── daftar akses ──────────────────────────────────────────────────────────
function GrantList({ token, grants, loading, q, setQ, status, setStatus, reload, toast }) {
  const root = useRef(null);
  useGSAP(() => {
    if (!loading) gsap.from(".grow", { y: 14, opacity: 0, stagger: 0.025, duration: 0.45 });
  }, { scope: root, dependencies: [loading, grants.length, status] });

  const act = async (g, body, msg) => {
    const r = await api(`/admin/grants/${g.id}`, { method: "PATCH", token, body });
    if (!r.ok) return toast(r.message || "Gagal", true);
    toast(msg);
    reload();
  };
  const del = async (g) => {
    if (!window.confirm(`Hapus akses ${g.email}? Tindakan ini tidak bisa dibatalkan.`)) return;
    const r = await api(`/admin/grants/${g.id}`, { method: "DELETE", token });
    if (!r.ok) return toast(r.message || "Gagal", true);
    toast("Akses dihapus");
    reload();
  };

  const now = Date.now();
  return (
    <section className="panel grantlist" ref={root}>
      <header className="panel__head">
        <h2 className="display">Daftar akses</h2>
        <div className="grantlist__tools">
          <input className="input input--sm" placeholder="Cari email / show…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari" />
          <select className="input input--sm" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="active">Aktif</option>
            <option value="expired">Berakhir / dicabut</option>
            <option value="all">Semua</option>
          </select>
        </div>
      </header>
      {loading ? (
        <p className="muted">Memuat…</p>
      ) : grants.length === 0 ? (
        <p className="muted">Belum ada data di filter ini.</p>
      ) : (
        <ul className="grows">
          {grants.map((g) => {
            const dead = g.revoked || g.expires_at <= now;
            const pending = !dead && g.starts_at > now;
            return (
              <li key={g.id} className={`grow${dead ? " is-dead" : ""}`}>
                <div className="grow__who">
                  <b>{g.email}</b>
                  <span className={`tag tag--${g.kind}`}>{g.kind === "pass" ? "durasi" : "show"}</span>
                  {g.revoked ? <span className="tag tag--off">dicabut</span> : dead ? <span className="tag tag--off">berakhir</span> : pending ? <span className="tag">terjadwal</span> : null}
                </div>
                <div className="grow__what">{g.kind === "pass" ? "Semua show" : g.show_title || g.show_slug}{g.note ? <em> · {g.note}</em> : null}</div>
                <div className="grow__when mono">
                  {fmtDateTime(g.starts_at)} → {fmtDateTime(g.expires_at)}
                  {!dead && <span> · sisa {humanLeft(g.expires_at)}</span>}
                </div>
                <div className="grow__dev mono">perangkat {g.devices}/{g.max_devices}{g.last_entry ? ` · masuk ${fmtDateTime(g.last_entry)}` : ""}</div>
                <div className="grow__acts">
                  <button onClick={() => act(g, { action: "extend", ms: DAY }, "Diperpanjang 1 hari")}>+1 hari</button>
                  <button onClick={() => act(g, { action: "extend", ms: 7 * DAY }, "Diperpanjang 7 hari")}>+7 hari</button>
                  <button onClick={() => act(g, { action: "reset_devices" }, "Perangkat direset")} disabled={!g.devices}>Reset perangkat</button>
                  {g.revoked ? (
                    <button onClick={() => act(g, { action: "restore" }, "Akses dipulihkan")}>Pulihkan</button>
                  ) : (
                    <button onClick={() => act(g, { action: "revoke" }, "Akses dicabut")}>Cabut</button>
                  )}
                  <button className="danger" onClick={() => del(g)}>Hapus</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ── pengaturan ────────────────────────────────────────────────────────────
function Settings({ token, toast }) {
  const [form, setForm] = useState(null);
  const [envPw, setEnvPw] = useState(false);
  const [pw, setPw] = useState("");
  useEffect(() => {
    api("/admin/settings", { token }).then((r) => {
      if (r.ok) {
        setForm({ contact_url: "", contact_label: "", announcement: "", price_show: "", price_pass: "", ...r.data });
        setEnvPw(r.password_managed_by_env);
      }
    });
  }, [token]);
  if (!form) return <p className="muted">Memuat…</p>;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    const r = await api("/admin/settings", { method: "PUT", token, body: form });
    toast(r.ok ? "Pengaturan disimpan" : r.message || "Gagal", !r.ok);
  };
  const changePw = async (e) => {
    e.preventDefault();
    const r = await api("/admin/password", { method: "PUT", token, body: { password: pw } });
    toast(r.ok ? "Password diganti" : r.message || "Gagal", !r.ok);
    if (r.ok) setPw("");
  };
  return (
    <div className="settings">
      <form className="panel" onSubmit={save}>
        <header className="panel__head"><h2 className="display">Halaman publik</h2></header>
        <div className="field"><label htmlFor="s-cu">Link kontak admin (WhatsApp / Telegram / IG)</label><input id="s-cu" className="input" value={form.contact_url} onChange={set("contact_url")} placeholder="https://wa.me/62812xxxx" /></div>
        <div className="field"><label htmlFor="s-cl">Label tombol kontak</label><input id="s-cl" className="input" value={form.contact_label} onChange={set("contact_label")} placeholder="Chat admin di WhatsApp" /></div>
        <div className="grantform__row">
          <div className="field"><label htmlFor="s-ps">Harga per show</label><input id="s-ps" className="input" value={form.price_show} onChange={set("price_show")} placeholder="Rp15.000" /></div>
          <div className="field"><label htmlFor="s-pp">Harga per durasi</label><input id="s-pp" className="input" value={form.price_pass} onChange={set("price_pass")} placeholder="Rp75.000 / 30 hari" /></div>
        </div>
        <div className="field"><label htmlFor="s-an">Pengumuman di beranda</label><textarea id="s-an" className="input" rows={2} value={form.announcement} onChange={set("announcement")} /></div>
        <button className="btn">Simpan</button>
      </form>
      <form className="panel" onSubmit={changePw}>
        <header className="panel__head"><h2 className="display">Password admin</h2></header>
        {envPw ? (
          <p className="muted">Password diatur lewat secret <code>ADMIN_PASSWORD</code> di Cloudflare.</p>
        ) : (
          <>
            <div className="field"><label htmlFor="s-pw">Password baru (min. 8)</label><input id="s-pw" className="input" type="password" minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></div>
            <button className="btn">Ganti password</button>
          </>
        )}
      </form>
    </div>
  );
}

// ── halaman ───────────────────────────────────────────────────────────────
export default function Admin() {
  const [token, setToken] = useState(() => {
    const t = store.get("hrz_admin");
    return t && t.exp > Date.now() ? t.token : null;
  });
  const [tab, setTab] = useState("access");
  const [stats, setStats] = useState({});
  const [grants, setGrants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("active");
  const [toasts, setToasts] = useState([]);
  const { shows } = useShows(60000);
  const root = useRef(null);

  const toast = useCallback((msg, bad = false) => {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg, bad }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  const saveToken = (t) => {
    store.set("hrz_admin", { token: t, exp: Date.now() + 11 * HOUR });
    setToken(t);
  };
  const logout = useCallback(() => {
    store.del("hrz_admin");
    setToken(null);
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    const [s, g] = await Promise.all([
      api("/admin/stats", { token }),
      api(`/admin/grants?status=${status}&q=${encodeURIComponent(q)}`, { token }),
    ]);
    if (s.status === 401 || g.status === 401) return logout();
    if (s.ok) setStats(s.data);
    if (g.ok) setGrants(g.data);
    setLoading(false);
  }, [token, status, q, logout]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  useGSAP(() => {
    if (!token) return;
    gsap.from(".admin__bar, .stats .stat, .admin__tabs", { y: 20, opacity: 0, stagger: 0.06, delay: 0.2 });
  }, { scope: root, dependencies: [token] });

  useEffect(() => {
    const el = document.querySelector(".toasts > :last-child");
    if (el) gsap.fromTo(el, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "back.out(2)" });
  }, [toasts.length]);

  if (!token) return <AdminAuth onToken={saveToken} />;

  return (
    <div className="admin" ref={root}>
      <header className="admin__bar">
        <Link to="/" className="auth__brand">Harukaze<em>48</em></Link>
        <span className="eyebrow">Ruang kontrol</span>
        <button className="btn btn--sm btn--ghost" onClick={logout}>Keluar</button>
      </header>

      <div className="wrap">
        <div className="stats">
          <Stat label="Akses aktif" value={stats.active} />
          <Stat label="Email unik" value={stats.emails} />
          <Stat label="Masuk 24 jam" value={stats.entries_24h} />
          <Stat label="Terjadwal" value={stats.upcoming} />
        </div>

        <div className="admin__tabs tabs">
          <button className={tab === "access" ? "is-on" : ""} onClick={() => setTab("access")}>Akses email</button>
          <button className={tab === "settings" ? "is-on" : ""} onClick={() => setTab("settings")}>Pengaturan</button>
        </div>

        {tab === "access" ? (
          <div className="admin__grid">
            <GrantForm token={token} shows={shows} onCreated={load} toast={toast} />
            <GrantList token={token} grants={grants} loading={loading} q={q} setQ={setQ} status={status} setStatus={(v) => { setLoading(true); setStatus(v); }} reload={load} toast={toast} />
          </div>
        ) : (
          <Settings token={token} toast={toast} />
        )}
      </div>

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.bad ? " is-bad" : ""}`}>{t.msg}</div>
        ))}
      </div>
    </div>
  );
}
