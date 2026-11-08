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
  ["+12 jam", 12 * HOUR],
  ["+1 hari setelah show", DAY],
  ["+3 hari setelah show", 3 * DAY],
  ["+7 hari setelah show", 7 * DAY],
];

const BYPASS_SHOW_PRESETS = [
  ["Sampai show selesai (6j)", 6 * HOUR],
  ["12 jam", 12 * HOUR],
  ["1 hari", DAY],
  ["3 hari", 3 * DAY],
  ["7 hari", 7 * DAY],
];

const toLocalInput = (ts) => {
  const d = new Date(ts - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};

const buildBypassUrl = (b, mode = "short") => {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://harukaze48.my.id";
  if (mode === "direct" && b.show_slug) {
    return `${origin}/live/${b.show_slug}?bypass=${encodeURIComponent(b.code)}`;
  }
  return `${origin}/b/${encodeURIComponent(b.code)}`;
};

async function copyText(text, toast, label = "Link bypass disalin") {
  try {
    await navigator.clipboard.writeText(text);
    toast(label);
  } catch {
    toast("Gagal menyalin otomatis, salin manual dari kotak link.", true);
  }
}

// ── login ─────────────────────────────────────────────────────────────────
function AdminAuth({ onToken }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const root = useRef(null);

  useGSAP(() => {
    gsap.from(".auth > *", { y: 30, opacity: 0, stagger: 0.08 });
  }, { scope: root });

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    const r = await api("/admin/login", { method: "POST", body: { username, password } });
    setBusy(false);
    if (!r.ok) {
      setError(r.message || "Gagal masuk.");
      gsap.fromTo(".auth", { x: -10 }, { x: 0, duration: 0.5, ease: "elastic.out(1, 0.3)" });
      return;
    }
    onToken(r.token);
  };

  return (
    <div className="admin-auth" ref={root}>
      <form className="auth" onSubmit={submit}>
        <Link to="/" className="auth__brand">Harukaze<em>48</em></Link>
        <p className="eyebrow">Ruang kontrol</p>
        <h1 className="display">Selamat datang kembali.</h1>
        <div className="field">
          <label htmlFor="adm-user">Username</label>
          <input id="adm-user" className="input" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="adm-pw">Password</label>
          <input id="adm-pw" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="note-error">{error}</p>}
        <button className="btn btn--red" disabled={busy}>{busy ? <span className="spinner" /> : "Masuk"}</button>
      </form>
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

// ── form tambah akses email ───────────────────────────────────────────────
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

// ── daftar akses email ────────────────────────────────────────────────────
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

// ── form buat link bypass ─────────────────────────────────────────────────
function BypassForm({ token, shows, onCreated, toast }) {
  const [kind, setKind] = useState("show");
  const [slug, setSlug] = useState("");
  const [manualSlug, setManualSlug] = useState("");
  const [after, setAfter] = useState(BYPASS_SHOW_PRESETS[0][1]);
  const [customHours, setCustomHours] = useState("");
  const [useCustomEnd, setUseCustomEnd] = useState(false);
  const [customEnd, setCustomEnd] = useState(() => toLocalInput(Date.now() + 6 * HOUR));
  const [start, setStart] = useState(() => toLocalInput(Date.now()));
  const [dur, setDur] = useState(DAY);
  const [customDays, setCustomDays] = useState("");
  const [devicesPerIp, setDevicesPerIp] = useState(1);
  const [maxIps, setMaxIps] = useState(1);
  const [unlimitedIps, setUnlimitedIps] = useState(false);
  const [customCode, setCustomCode] = useState("");
  const [count, setCount] = useState(1);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [justCreated, setJustCreated] = useState([]);

  useEffect(() => {
    if (!slug && shows.length) setSlug(shows[0].slug);
  }, [shows, slug]);

  const show = shows.find((s) => s.slug === slug);
  const effSlug = slug === "__manual" ? manualSlug.trim() : slug;

  const range = useMemo(() => {
    if (useCustomEnd) {
      const s = kind === "pass" ? (new Date(start).getTime() || Date.now()) : Date.now();
      const e = new Date(customEnd).getTime() || (s + 6 * HOUR);
      return { starts_at: s, expires_at: e };
    }
    if (kind === "show") {
      const base = show?.scheduledAt || Date.now();
      const addMs = customHours ? Number(customHours) * HOUR : after;
      return { starts_at: Date.now(), expires_at: Math.max(base, Date.now()) + addMs };
    }
    const s = new Date(start).getTime() || Date.now();
    const d = customDays ? Number(customDays) * DAY : dur;
    return { starts_at: s, expires_at: s + d };
  }, [kind, show, after, customHours, useCustomEnd, customEnd, start, dur, customDays]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (kind === "show" && !effSlug) {
      return setError("Pilih show tujuan terlebih dahulu.");
    }
    setBusy(true);
    const r = await api("/admin/bypass", {
      method: "POST",
      token,
      body: {
        kind: kind === "show" ? "show" : "pass",
        show_slug: kind === "show" ? effSlug : undefined,
        show_title: kind === "show" ? show?.title || effSlug : undefined,
        ...range,
        max_devices: devicesPerIp,
        max_ips: unlimitedIps ? 0 : maxIps,
        custom_code: customCode.trim() || undefined,
        count: customCode.trim() ? 1 : count,
        note,
      },
    });
    setBusy(false);
    if (!r.ok) return setError(r.message || "Gagal membuat link bypass.");
    setJustCreated(r.data || []);
    setCustomCode("");
    setNote("");
    if (r.data?.length === 1) {
      copyText(buildBypassUrl(r.data[0]), toast, "Link bypass dibuat & disalin ke clipboard!");
    } else {
      toast(`${r.created} link bypass berhasil dibuat`);
    }
    onCreated();
  };

  return (
    <form className="panel grantform" onSubmit={submit}>
      <header className="panel__head">
        <h2 className="display">Buat link bypass</h2>
        <div className="seg" role="radiogroup" aria-label="Jenis link bypass">
          <button type="button" role="radio" aria-checked={kind === "show"} className={kind === "show" ? "is-on" : ""} onClick={() => setKind("show")}>Per show</button>
          <button type="button" role="radio" aria-checked={kind === "pass"} className={kind === "pass" ? "is-on" : ""} onClick={() => setKind("pass")}>Semua show</button>
          <i className="seg__thumb" style={{ transform: `translateX(${kind === "show" ? 0 : 100}%)` }} />
        </div>
      </header>

      {kind === "show" ? (
        <>
          <div className="field">
            <label htmlFor="b-show">Akses ke show mana</label>
            <select id="b-show" className="input" value={slug} onChange={(e) => setSlug(e.target.value)}>
              {shows.map((s) => (
                <option key={s.slug} value={s.slug}>{s.status === "live" ? "● LIVE — " : ""}{s.title}</option>
              ))}
              <option value="__manual">Isi slug show manual…</option>
            </select>
          </div>
          {slug === "__manual" && (
            <div className="field">
              <label htmlFor="b-slug">Slug show</label>
              <input id="b-slug" className="input mono" required value={manualSlug} onChange={(e) => setManualSlug(e.target.value)} placeholder="pajama-drive-2026-11-05-..." />
            </div>
          )}
          <div className="field">
            <label>Masa aktif link</label>
            <div className="chips">
              {BYPASS_SHOW_PRESETS.map(([l, v]) => (
                <button
                  key={l}
                  type="button"
                  className={!useCustomEnd && !customHours && after === v ? "is-on" : ""}
                  onClick={() => { setAfter(v); setCustomHours(""); setUseCustomEnd(false); }}
                >
                  {l}
                </button>
              ))}
              <label className="chips__custom">
                <input
                  type="number"
                  min="1"
                  max="720"
                  placeholder="—"
                  value={customHours}
                  onChange={(e) => { setCustomHours(e.target.value); setUseCustomEnd(false); }}
                  aria-label="Durasi kustom dalam jam"
                />
                jam
              </label>
              <button
                type="button"
                className={useCustomEnd ? "is-on" : ""}
                onClick={() => setUseCustomEnd((v) => !v)}
              >
                Pilih waktu…
              </button>
            </div>
          </div>
          {useCustomEnd && (
            <div className="field">
              <label htmlFor="b-end">Berakhir pada</label>
              <input id="b-end" className="input mono" type="datetime-local" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
            </div>
          )}
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor="b-start">Mulai berlaku</label>
            <input id="b-start" className="input mono" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="field">
            <label>Masa aktif link</label>
            <div className="chips">
              {PASS_PRESETS.map(([l, v]) => (
                <button
                  key={l}
                  type="button"
                  className={!useCustomEnd && !customDays && dur === v ? "is-on" : ""}
                  onClick={() => { setDur(v); setCustomDays(""); setUseCustomEnd(false); }}
                >
                  {l}
                </button>
              ))}
              <label className="chips__custom">
                <input
                  type="number"
                  min="1"
                  max="365"
                  placeholder="—"
                  value={customDays}
                  onChange={(e) => { setCustomDays(e.target.value); setUseCustomEnd(false); }}
                  aria-label="Durasi kustom dalam hari"
                />
                hari
              </label>
              <button
                type="button"
                className={useCustomEnd ? "is-on" : ""}
                onClick={() => setUseCustomEnd((v) => !v)}
              >
                Pilih waktu…
              </button>
            </div>
          </div>
          {useCustomEnd && (
            <div className="field">
              <label htmlFor="b-end-pass">Berakhir pada</label>
              <input id="b-end-pass" className="input mono" type="datetime-local" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
            </div>
          )}
        </>
      )}

      <div className="bypass-limits">
        <div className="field">
          <label>Perangkat per IP</label>
          <div className="stepper">
            <button type="button" onClick={() => setDevicesPerIp((d) => Math.max(1, d - 1))} aria-label="Kurangi perangkat per IP">−</button>
            <span className="mono">{devicesPerIp}</span>
            <button type="button" onClick={() => setDevicesPerIp((d) => Math.min(20, d + 1))} aria-label="Tambah perangkat per IP">+</button>
          </div>
        </div>

        <div className="field">
          <label>Batas jumlah IP</label>
          <div className="bypass-ip-control">
            {!unlimitedIps && (
              <div className="stepper">
                <button type="button" onClick={() => setMaxIps((n) => Math.max(1, n - 1))} aria-label="Kurangi batas IP">−</button>
                <span className="mono">{maxIps}</span>
                <button type="button" onClick={() => setMaxIps((n) => Math.min(100, n + 1))} aria-label="Tambah batas IP">+</button>
              </div>
            )}
            <button
              type="button"
              className={`chip-toggle${unlimitedIps ? " is-on" : ""}`}
              onClick={() => setUnlimitedIps((u) => !u)}
            >
              {unlimitedIps ? "∞ Bebas IP (aktif)" : "Bebas IP"}
            </button>
          </div>
        </div>
      </div>

      <div className="grantform__row">
        <div className="field">
          <label htmlFor="b-count">Jumlah link</label>
          <div className="stepper">
            <button type="button" onClick={() => setCount((c) => Math.max(1, c - 1))} disabled={Boolean(customCode.trim())} aria-label="Kurangi jumlah link">−</button>
            <span className="mono">{customCode.trim() ? 1 : count}</span>
            <button type="button" onClick={() => setCount((c) => Math.min(50, c + 1))} disabled={Boolean(customCode.trim())} aria-label="Tambah jumlah link">+</button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="b-code">Kode kustom (opsional)</label>
          <input
            id="b-code"
            className="input mono"
            value={customCode}
            maxLength={40}
            onChange={(e) => setCustomCode(e.target.value)}
            placeholder="otomatis jika kosong"
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="b-note">Catatan / nama penerima (opsional)</label>
        <input id="b-note" className="input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="mis. Buyer WA Andi / VIP" />
      </div>

      <p className="grantform__sum mono">
        {kind === "show" ? (show?.name || effSlug || "—") : "Semua show"} · {devicesPerIp} perangkat/IP · {unlimitedIps ? "IP bebas" : `maks ${maxIps} IP`} · {fmtDateTime(range.starts_at)} → {fmtDateTime(range.expires_at)}
      </p>
      {error && <p className="note-error">{error}</p>}
      <button className="btn btn--red" disabled={busy || (kind === "show" && !effSlug)}>
        {busy ? <span className="spinner" /> : <>Buat link bypass <span className="arrow">→</span></>}
      </button>

      {justCreated.length > 0 && (
        <div className="bypass-created">
          <div className="bypass-created__head">
            <span className="eyebrow">Link baru dibuat ({justCreated.length})</span>
            {justCreated.length > 1 && (
              <button
                type="button"
                className="link-u mono"
                onClick={() => copyText(justCreated.map((x) => buildBypassUrl(x)).join("\n"), toast, "Semua link disalin")}
              >
                Salin semua
              </button>
            )}
          </div>
          <ul className="bypass-created__list">
            {justCreated.map((item) => {
              const shortUrl = buildBypassUrl(item, "short");
              return (
                <li key={item.id} className="bypass-created__item">
                  <input className="input input--sm mono" readOnly value={shortUrl} onFocus={(e) => e.target.select()} aria-label="URL link bypass" />
                  <button type="button" className="btn btn--sm" onClick={() => copyText(shortUrl, toast)}>Salin</button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </form>
  );
}

// ── daftar link bypass ────────────────────────────────────────────────────
function BypassList({ token, links, loading, q, setQ, status, setStatus, reload, toast }) {
  const root = useRef(null);
  useGSAP(() => {
    if (!loading) gsap.from(".grow", { y: 14, opacity: 0, stagger: 0.025, duration: 0.45 });
  }, { scope: root, dependencies: [loading, links.length, status] });

  const act = async (b, body, msg) => {
    const r = await api(`/admin/bypass/${b.id}`, { method: "PATCH", token, body });
    if (!r.ok) return toast(r.message || "Gagal", true);
    toast(msg);
    reload();
  };
  const del = async (b) => {
    if (!window.confirm(`Hapus link bypass "${b.code}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    const r = await api(`/admin/bypass/${b.id}`, { method: "DELETE", token });
    if (!r.ok) return toast(r.message || "Gagal", true);
    toast("Link bypass dihapus");
    reload();
  };

  const now = Date.now();
  return (
    <section className="panel grantlist" ref={root}>
      <header className="panel__head">
        <h2 className="display">Daftar link bypass</h2>
        <div className="grantlist__tools">
          <input className="input input--sm" placeholder="Cari kode / show / catatan…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari link bypass" />
          <select className="input input--sm" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="active">Aktif</option>
            <option value="expired">Berakhir / dicabut</option>
            <option value="all">Semua</option>
          </select>
        </div>
      </header>
      {loading ? (
        <p className="muted">Memuat…</p>
      ) : links.length === 0 ? (
        <p className="muted">Belum ada link bypass di filter ini.</p>
      ) : (
        <ul className="grows">
          {links.map((b) => {
            const dead = b.revoked || b.expires_at <= now;
            const pending = !dead && b.starts_at > now;
            const shortUrl = buildBypassUrl(b, "short");
            const directUrl = buildBypassUrl(b, "direct");
            return (
              <li key={b.id} className={`grow${dead ? " is-dead" : ""}`}>
                <div className="grow__who">
                  <b className="mono">{b.code}</b>
                  <span className={`tag tag--${b.kind}`}>{b.kind === "pass" ? "semua show" : "show"}</span>
                  {b.revoked ? <span className="tag tag--off">dicabut</span> : dead ? <span className="tag tag--off">berakhir</span> : pending ? <span className="tag">terjadwal</span> : null}
                </div>
                <div className="grow__what">
                  {b.kind === "pass" ? "Semua show" : b.show_title || b.show_slug}
                  {b.note ? <em> · {b.note}</em> : null}
                </div>
                <div className="bypass-url-row">
                  <code className="bypass-url mono">{shortUrl}</code>
                  <button type="button" className="bypass-copy-btn" onClick={() => copyText(shortUrl, toast, "Link pendek disalin")}>Salin link</button>
                  {b.show_slug && (
                    <button type="button" className="bypass-copy-btn" onClick={() => copyText(directUrl, toast, "Link show langsung disalin")}>Salin link show</button>
                  )}
                </div>
                <div className="grow__when mono">
                  {fmtDateTime(b.starts_at)} → {fmtDateTime(b.expires_at)}
                  {!dead && <span> · sisa {humanLeft(b.expires_at)}</span>}
                </div>
                <div className="grow__dev mono">
                  maks {b.max_devices} perangkat/IP · IP {b.ips || 0}/{b.max_ips > 0 ? b.max_ips : "∞"} · total {b.devices || 0} perangkat
                  {b.last_entry ? ` · masuk ${fmtDateTime(b.last_entry)}` : ""}
                </div>
                {b.ip_summary && (
                  <div className="grow__ips mono">IP terdaftar: {b.ip_summary}</div>
                )}
                <div className="grow__acts">
                  <button onClick={() => copyText(shortUrl, toast)}>Salin</button>
                  <button onClick={() => act(b, { action: "extend", ms: HOUR }, "Diperpanjang 1 jam")}>+1 jam</button>
                  <button onClick={() => act(b, { action: "extend", ms: DAY }, "Diperpanjang 1 hari")}>+1 hari</button>
                  <button onClick={() => act(b, { action: "extend", ms: 7 * DAY }, "Diperpanjang 7 hari")}>+7 hari</button>
                  <button
                    onClick={() => act(b, { action: "limits", max_devices: b.max_devices + 1, max_ips: b.max_ips }, `Maks perangkat/IP jadi ${b.max_devices + 1}`)}
                    disabled={b.max_devices >= 20}
                    title="Tambah batas perangkat per IP"
                  >
                    +1 dev/IP
                  </button>
                  {b.max_devices > 1 && (
                    <button
                      onClick={() => act(b, { action: "limits", max_devices: b.max_devices - 1, max_ips: b.max_ips }, `Maks perangkat/IP jadi ${b.max_devices - 1}`)}
                      title="Kurangi batas perangkat per IP"
                    >
                      −1 dev/IP
                    </button>
                  )}
                  <button
                    onClick={() => act(b, { action: "limits", max_devices: b.max_devices, max_ips: b.max_ips + 1 }, `Maks IP jadi ${b.max_ips + 1}`)}
                    disabled={b.max_ips >= 100}
                    title="Tambah batas jumlah IP"
                  >
                    +1 IP
                  </button>
                  <button onClick={() => act(b, { action: "reset_devices" }, "Perangkat & IP direset")} disabled={!b.devices}>
                    Reset IP/perangkat
                  </button>
                  {b.revoked ? (
                    <button onClick={() => act(b, { action: "restore" }, "Link bypass dipulihkan")}>Pulihkan</button>
                  ) : (
                    <button onClick={() => act(b, { action: "revoke" }, "Link bypass dicabut")}>Cabut</button>
                  )}
                  <button className="danger" onClick={() => del(b)}>Hapus</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ── cek koneksi OshiGO ────────────────────────────────────────────────────
const CHECK_HINT = {
  OK: "Terhubung. Tanda tangan diterima.",
  SIGNATURE_REJECTED: "Tanda tangan ditolak dengan IP ini.",
  ORIGIN_NOT_ALLOWED: "Tanda tangan diterima, tapi server/domain pemanggil belum terdaftar di dashboard OshiGO.",
  KEY_NOT_FOUND: "Key id tidak dikenali OshiGO.",
  STALE_REQUEST: "Jam server meleset.",
};

function PartnerCheck({ token }) {
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const r = await api("/admin/partner-check", { token });
    setBusy(false);
    setRes(r);
  };
  return (
    <section className="panel pcheck">
      <header className="panel__head">
        <h2 className="display">Koneksi OshiGO</h2>
        <button type="button" className="btn btn--sm" onClick={run} disabled={busy}>
          {busy ? <span className="spinner" /> : "Cek koneksi"}
        </button>
      </header>
      <p className="muted">Mencoba <code>GET /shows</code> (tidak memakai kuota) dengan setiap kandidat IP penandatangan, lalu menyimpan IP yang berhasil.</p>
      {res && !res.ok && <p className="note-error">{res.message || res.code}</p>}
      {res?.ok && (
        <>
          <p className={`pcheck__verdict${res.working_ip ? " is-ok" : ""}`}>
            {res.working_ip ? <>Terhubung lewat IP <b className="mono">{res.working_ip}</b></> : "Belum ada IP yang diterima OshiGO."}
          </p>
          <ul className="pcheck__list">
            {res.results.map((x) => (
              <li key={x.ip} className={x.ok ? "is-ok" : ""}>
                <span className="mono">{x.ip}</span>
                <span className="tag">{x.code}</span>
                <small>{CHECK_HINT[x.code] || x.message}{x.ok && x.message ? ` · ${x.message}` : ""}</small>
              </li>
            ))}
          </ul>
          <p className="muted pcheck__meta mono">key {res.key_id} · PARTNER_SERVER_IP: {res.configured_ips.length ? res.configured_ips.join(", ") : "(tidak diset)"}</p>
        </>
      )}
    </section>
  );
}

// ── pengaturan ────────────────────────────────────────────────────────────
function Settings({ token, toast }) {
  const [form, setForm] = useState(null);
  const [user, setUser] = useState("");
  const [pw, setPw] = useState("");
  const [cur, setCur] = useState("");
  useEffect(() => {
    api("/admin/settings", { token }).then((r) => {
      if (r.ok) {
        setForm({ contact_url: "", contact_label: "", announcement: "", price_show: "", price_pass: "", ...r.data });
        setUser(r.username || "");
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
    const r = await api("/admin/password", { method: "PUT", token, body: { current: cur, password: pw } });
    toast(r.ok ? "Password diganti" : r.message || "Gagal", !r.ok);
    if (r.ok) { setPw(""); setCur(""); }
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
        <p className="muted">Username: <b className="mono">{user}</b></p>
        <div className="field"><label htmlFor="s-pw0">Password lama</label><input id="s-pw0" className="input" type="password" required value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></div>
        <div className="field"><label htmlFor="s-pw">Password baru (min. 4)</label><input id="s-pw" className="input" type="password" minLength={4} required value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></div>
        <button className="btn">Ganti password</button>
      </form>
      <PartnerCheck token={token} />
    </div>
  );
}

// ── halaman ───────────────────────────────────────────────────────────────
export default function Admin() {
  const [token, setToken] = useState(() => {
    const t = store.get("hrz_admin");
    return t && t.exp > Date.now() ? t.token : null;
  });
  const [tab, setTab] = useState("bypass");
  const [stats, setStats] = useState({});
  const [grants, setGrants] = useState([]);
  const [bypassLinks, setBypassLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bypassLoading, setBypassLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("active");
  const [bq, setBq] = useState("");
  const [bStatus, setBStatus] = useState("active");
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
    const [s, g, b] = await Promise.all([
      api("/admin/stats", { token }),
      api(`/admin/grants?status=${status}&q=${encodeURIComponent(q)}`, { token }),
      api(`/admin/bypass?status=${bStatus}&q=${encodeURIComponent(bq)}`, { token }),
    ]);
    if (s.status === 401 || g.status === 401 || b.status === 401) return logout();
    if (s.ok) setStats(s.data);
    if (g.ok) setGrants(g.data);
    if (b.ok) setBypassLinks(b.data);
    setLoading(false);
    setBypassLoading(false);
  }, [token, status, q, bStatus, bq, logout]);

  useEffect(() => {
    const t = setTimeout(load, q || bq ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q, bq]);

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
        <div className="stats stats--5">
          <Stat label="Akses aktif" value={stats.active} />
          <Stat label="Link bypass aktif" value={stats.bypass_active} />
          <Stat label="Email unik" value={stats.emails} />
          <Stat label="Masuk 24 jam" value={stats.entries_24h} />
          <Stat label="Terjadwal" value={stats.upcoming} />
        </div>

        <div className="admin__tabs tabs">
          <button className={tab === "bypass" ? "is-on" : ""} onClick={() => setTab("bypass")}>Link bypass</button>
          <button className={tab === "access" ? "is-on" : ""} onClick={() => setTab("access")}>Akses email</button>
          <button className={tab === "settings" ? "is-on" : ""} onClick={() => setTab("settings")}>Pengaturan</button>
        </div>

        {tab === "bypass" ? (
          <div className="admin__grid">
            <BypassForm token={token} shows={shows} onCreated={load} toast={toast} />
            <BypassList
              token={token}
              links={bypassLinks}
              loading={bypassLoading}
              q={bq}
              setQ={setBq}
              status={bStatus}
              setStatus={(v) => { setBypassLoading(true); setBStatus(v); }}
              reload={load}
              toast={toast}
            />
          </div>
        ) : tab === "access" ? (
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

