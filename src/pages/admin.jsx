import { useEffect, useState, useCallback, useRef } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const ADMIN_USER = "harukaze48";
const ADMIN_PASS = "21082007";
const API_BASE   = "https://v5.jkt48connect.com/api/harukaze";
const API_KEY    = "JKTCONNECT";

const apiFetch = async (path, opts = {}) => {
  const url = `${API_BASE}${path}${path.includes("?") ? "&" : "?"}apikey=${API_KEY}`;
  const res  = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
  const data = await res.json();
  return data;
};

// ─── Utility ──────────────────────────────────────────────────────────────────
const fmtDate = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

const fmtDateShort = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
  });
};

const isExpired = (expiresAt) => expiresAt && new Date(expiresAt) < new Date();

const remainingUses = (row) => {
  if (row.usage_limit === -1) return "∞";
  return Math.max(0, row.usage_limit - row.usage_count);
};

// ─── Toast ────────────────────────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type = "success") => {
    const id = Date.now();
    setToasts((p) => [...p, { id, msg, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  }, []);
  return { toasts, add };
}

function ToastContainer({ toasts }) {
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
      {toasts.map((t) => (
        <div key={t.id} style={{
          background: t.type === "error" ? "#DC1F2E" : t.type === "warn" ? "#f59e0b" : "#22c55e",
          color: "#fff", padding: "10px 18px", borderRadius: 8,
          fontSize: 13, fontWeight: 600, boxShadow: "0 4px 20px #0008",
          animation: "fadeInUp .25s ease", maxWidth: 320,
        }}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "#000000bb",
      zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
      padding: "16px", backdropFilter: "blur(4px)",
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "var(--bg2)", border: "1px solid var(--line)",
        borderRadius: 16, width: "min(520px, 100%)", maxHeight: "90vh",
        overflow: "auto", animation: "fadeInUp .2s ease",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 24px 16px", borderBottom: "1px solid var(--line)",
          position: "sticky", top: 0, background: "var(--bg2)", zIndex: 1,
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--txt)", margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: "var(--txt3)",
            fontSize: 20, cursor: "pointer", lineHeight: 1, padding: "0 4px",
          }}>×</button>
        </div>
        <div style={{ padding: "20px 24px 24px" }}>{children}</div>
      </div>
    </div>
  );
}

// ─── Field Component ──────────────────────────────────────────────────────────
function Field({ label, children, hint }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--txt3)", letterSpacing: "1.2px", textTransform: "uppercase" }}>
        {label}
      </label>
      {children}
      {hint && <span style={{ fontSize: 11, color: "var(--txt3)" }}>{hint}</span>}
    </div>
  );
}

const inputStyle = {
  background: "var(--bg3)", border: "1px solid var(--line)", borderRadius: 8,
  padding: "9px 12px", color: "var(--txt)", fontSize: 13, fontFamily: "inherit",
  outline: "none", width: "100%", transition: "border-color .2s",
};

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ row }) {
  if (!row.is_active || row.deleted_at) return <span style={{ ...badgeStyle, background: "#55555522", color: "#888", border: "1px solid #55555544" }}>Nonaktif</span>;
  if (isExpired(row.expires_at)) return <span style={{ ...badgeStyle, background: "#DC1F2E22", color: "#DC1F2E", border: "1px solid #DC1F2E44" }}>Expired</span>;
  if (row.usage_limit !== -1 && row.usage_count >= row.usage_limit) return <span style={{ ...badgeStyle, background: "#f59e0b22", color: "#f59e0b", border: "1px solid #f59e0b44" }}>Habis</span>;
  return <span style={{ ...badgeStyle, background: "#22c55e22", color: "#22c55e", border: "1px solid #22c55e44" }}>Aktif</span>;
}

const badgeStyle = { fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20, letterSpacing: "0.5px" };

// ─── Grant Modal ──────────────────────────────────────────────────────────────
function GrantModal({ onClose, onSuccess, toast }) {
  const [form, setForm] = useState({
    email: "", label: "", access_type: "standard", purpose: "",
    usage_limit: 1, expires_in_hours: 24, notes: "", created_by: "admin",
  });
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    if (!form.email) { toast("Email wajib diisi", "error"); return; }
    setLoading(true);
    try {
      const body = {
        ...form,
        usage_limit: Number(form.usage_limit),
        expires_in_hours: form.expires_in_hours === "" ? null : Number(form.expires_in_hours),
      };
      const res = await apiFetch("/grant", { method: "POST", body: JSON.stringify(body) });
      if (res.status) { toast("Akses berhasil diberikan!"); onSuccess(); onClose(); }
      else toast(res.message || "Gagal", "error");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Grant Akses Baru" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Email *">
          <input style={inputStyle} type="email" placeholder="user@email.com"
            value={form.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Label" hint="Nama/keterangan untuk admin">
          <input style={inputStyle} placeholder="misal: Tiket Theater Jun 2026"
            value={form.label} onChange={(e) => set("label", e.target.value)} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Access Type">
            <select style={inputStyle} value={form.access_type} onChange={(e) => set("access_type", e.target.value)}>
              <option value="standard">Standard</option>
              <option value="premium">Premium</option>
              <option value="vip">VIP</option>
            </select>
          </Field>
          <Field label="Purpose">
            <input style={inputStyle} placeholder="theater_stream, concert, ..."
              value={form.purpose} onChange={(e) => set("purpose", e.target.value)} />
          </Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Jumlah Pakai" hint="-1 = unlimited">
            <input style={inputStyle} type="number" min="-1"
              value={form.usage_limit} onChange={(e) => set("usage_limit", e.target.value)} />
          </Field>
          <Field label="Masa Aktif (jam)" hint="Kosong = tidak expire">
            <input style={inputStyle} type="number" min="1" placeholder="24"
              value={form.expires_in_hours} onChange={(e) => set("expires_in_hours", e.target.value)} />
          </Field>
        </div>
        <Field label="Catatan Internal">
          <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 60 }}
            placeholder="Catatan untuk admin..."
            value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
        <button onClick={handleSubmit} disabled={loading} style={btnPrimaryStyle}>
          {loading ? <Spin /> : "Grant Akses"}
        </button>
      </div>
    </Modal>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
function EditModal({ access, onClose, onSuccess, toast }) {
  const [form, setForm] = useState({
    label: access.label || "",
    access_type: access.access_type || "standard",
    purpose: access.purpose || "",
    usage_limit: access.usage_limit,
    is_active: access.is_active,
    notes: access.notes || "",
    extend_hours: "",
  });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const body = {
        label: form.label || null,
        access_type: form.access_type,
        purpose: form.purpose || null,
        usage_limit: Number(form.usage_limit),
        is_active: form.is_active,
        notes: form.notes || null,
      };
      if (form.extend_hours !== "") body.extend_hours = Number(form.extend_hours);

      const res = await apiFetch(`/${access.id}`, { method: "PATCH", body: JSON.stringify(body) });
      if (res.status) { toast("Akses berhasil diperbarui!"); onSuccess(); onClose(); }
      else toast(res.message || "Gagal", "error");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={`Edit Akses — ${access.email}`} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Label">
          <input style={inputStyle} value={form.label} onChange={(e) => set("label", e.target.value)} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Access Type">
            <select style={inputStyle} value={form.access_type} onChange={(e) => set("access_type", e.target.value)}>
              <option value="standard">Standard</option>
              <option value="premium">Premium</option>
              <option value="vip">VIP</option>
            </select>
          </Field>
          <Field label="Purpose">
            <input style={inputStyle} value={form.purpose} onChange={(e) => set("purpose", e.target.value)} />
          </Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Jumlah Pakai" hint="-1 = unlimited">
            <input style={inputStyle} type="number" min="-1"
              value={form.usage_limit} onChange={(e) => set("usage_limit", e.target.value)} />
          </Field>
          <Field label="Perpanjang (jam)" hint="Tambah dari sekarang/expiry">
            <input style={inputStyle} type="number" min="1" placeholder="misal: 48"
              value={form.extend_hours} onChange={(e) => set("extend_hours", e.target.value)} />
          </Field>
        </div>
        <Field label="Status">
          <select style={inputStyle} value={form.is_active ? "true" : "false"}
            onChange={(e) => set("is_active", e.target.value === "true")}>
            <option value="true">Aktif</option>
            <option value="false">Nonaktif</option>
          </select>
        </Field>
        <Field label="Catatan Internal">
          <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 60 }}
            value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
        <button onClick={handleSubmit} disabled={loading} style={btnPrimaryStyle}>
          {loading ? <Spin /> : "Simpan Perubahan"}
        </button>
      </div>
    </Modal>
  );
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────
function DetailModal({ email, onClose, toast }) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/email/${encodeURIComponent(email)}`)
      .then((r) => { if (r.status) setData(r.data); else toast(r.message, "error"); })
      .catch((e) => toast(e.message, "error"))
      .finally(() => setLoading(false));
  }, [email]);

  return (
    <Modal title={`Detail — ${email}`} onClose={onClose}>
      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}><Spin xl /></div>
      ) : data ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Summary */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
            {[
              { label: "Total Akses", val: data.summary.total_access },
              { label: "Aktif", val: data.summary.active_access },
              { label: "Total Pakai", val: data.summary.total_uses },
            ].map((s) => (
              <div key={s.label} style={{ background: "var(--bg3)", border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: "var(--txt)" }}>{s.val}</div>
                <div style={{ fontSize: 10, color: "var(--txt3)", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.8px" }}>{s.label}</div>
              </div>
            ))}
          </div>

          {data.is_blacklisted && (
            <div style={{ background: "#DC1F2E18", border: "1px solid #DC1F2E44", borderRadius: 8, padding: "10px 14px", color: "#DC1F2E", fontSize: 13, fontWeight: 600 }}>
              ⚠️ Email ini ada di blacklist
            </div>
          )}

          {/* Access list */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--txt3)", letterSpacing: "1.2px", textTransform: "uppercase", marginBottom: 8 }}>Daftar Akses</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.access_list.length === 0 ? (
                <div style={{ color: "var(--txt3)", fontSize: 13 }}>Tidak ada akses</div>
              ) : data.access_list.map((a) => (
                <div key={a.id} style={{ background: "var(--bg3)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px", fontSize: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <StatusBadge row={a} />
                    <span style={{ color: "var(--txt)", fontWeight: 600 }}>{a.label || a.access_type}</span>
                    {a.purpose && <span style={{ color: "var(--txt3)" }}>· {a.purpose}</span>}
                  </div>
                  <div style={{ color: "var(--txt3)", display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <span>Pakai: {a.usage_count}/{a.usage_limit === -1 ? "∞" : a.usage_limit}</span>
                    <span>Expire: {fmtDateShort(a.expires_at)}</span>
                    <span>Dibuat: {fmtDateShort(a.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent logs */}
          {data.recent_logs.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--txt3)", letterSpacing: "1.2px", textTransform: "uppercase", marginBottom: 8 }}>Log Terbaru</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto" }}>
                {data.recent_logs.map((l) => (
                  <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", background: "var(--bg3)", borderRadius: 6, fontSize: 11 }}>
                    <span style={{ color: l.status === "success" ? "#22c55e" : "#DC1F2E", fontWeight: 700, minWidth: 50 }}>{l.action}</span>
                    <span style={{ color: "var(--txt3)", flex: 1 }}>{l.error_message || "—"}</span>
                    <span style={{ color: "var(--txt3)", whiteSpace: "nowrap" }}>{fmtDate(l.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ color: "var(--txt3)", textAlign: "center", padding: 40 }}>Data tidak ditemukan</div>
      )}
    </Modal>
  );
}

// ─── Blacklist Modal ──────────────────────────────────────────────────────────
function BlacklistModal({ onClose, onSuccess, toast }) {
  const [form, setForm] = useState({ email: "", reason: "", expires_in_hours: "", created_by: "admin" });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    if (!form.email) { toast("Email wajib diisi", "error"); return; }
    setLoading(true);
    try {
      const body = {
        ...form,
        expires_in_hours: form.expires_in_hours === "" ? null : Number(form.expires_in_hours),
      };
      const res = await apiFetch("/blacklist", { method: "POST", body: JSON.stringify(body) });
      if (res.status) { toast("Email berhasil di-blacklist!"); onSuccess(); onClose(); }
      else toast(res.message || "Gagal", "error");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Blacklist Email" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ background: "#DC1F2E18", border: "1px solid #DC1F2E33", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#ff8080" }}>
          Email yang di-blacklist akan dicabut semua aksesnya secara otomatis.
        </div>
        <Field label="Email *">
          <input style={inputStyle} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Alasan">
          <input style={inputStyle} value={form.reason} onChange={(e) => set("reason", e.target.value)} />
        </Field>
        <Field label="Durasi Blacklist (jam)" hint="Kosong = permanen">
          <input style={inputStyle} type="number" min="1" placeholder="Kosong = permanen"
            value={form.expires_in_hours} onChange={(e) => set("expires_in_hours", e.target.value)} />
        </Field>
        <button onClick={handleSubmit} disabled={loading}
          style={{ ...btnPrimaryStyle, background: "#DC1F2E", boxShadow: "0 4px 16px #DC1F2E33" }}>
          {loading ? <Spin /> : "Blacklist Email"}
        </button>
      </div>
    </Modal>
  );
}

// ─── Shared button styles ─────────────────────────────────────────────────────
const btnPrimaryStyle = {
  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
  background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8,
  padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
  fontFamily: "inherit", boxShadow: "0 4px 16px var(--accent-glow)", transition: "opacity .2s",
};

function Spin({ xl }) {
  return (
    <div style={{
      width: xl ? 32 : 16, height: xl ? 32 : 16,
      border: `${xl ? 3 : 2}px solid #ffffff22`,
      borderTop: `${xl ? 3 : 2}px solid #fff`,
      borderRadius: "50%", animation: "spin .7s linear infinite",
      display: "inline-block",
    }} />
  );
}

// ─── Access Table ─────────────────────────────────────────────────────────────
function AccessTable({ items, onEdit, onRevoke, onDetail, loading }) {
  if (loading) return (
    <div style={{ textAlign: "center", padding: "48px 0", color: "var(--txt3)" }}>
      <Spin xl /><p style={{ marginTop: 12, fontSize: 13 }}>Memuat data...</p>
    </div>
  );

  if (!items.length) return (
    <div style={{ textAlign: "center", padding: "48px 0", color: "var(--txt3)", fontSize: 14 }}>
      Tidak ada data ditemukan
    </div>
  );

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {["Email", "Label", "Type", "Status", "Pakai", "Expire", "Aksi"].map((h) => (
              <th key={h} style={{
                textAlign: "left", padding: "10px 14px",
                fontSize: 10, fontWeight: 700, color: "var(--txt3)",
                letterSpacing: "1px", textTransform: "uppercase",
                borderBottom: "1px solid var(--line)", whiteSpace: "nowrap",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id} style={{ borderBottom: "1px solid var(--line)", transition: "background .15s" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg3)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
              <td style={{ padding: "12px 14px", color: "var(--txt)", fontFamily: "var(--mono)", fontSize: 12 }}>
                <button onClick={() => onDetail(row.email)}
                  style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 12, fontFamily: "var(--mono)", textDecoration: "underline", padding: 0 }}>
                  {row.email}
                </button>
              </td>
              <td style={{ padding: "12px 14px", color: "var(--txt2)" }}>{row.label || "—"}</td>
              <td style={{ padding: "12px 14px" }}>
                <span style={{ ...badgeStyle, background: "var(--bg4)", color: "var(--txt2)", border: "1px solid var(--line)" }}>
                  {row.access_type}
                </span>
              </td>
              <td style={{ padding: "12px 14px" }}><StatusBadge row={row} /></td>
              <td style={{ padding: "12px 14px", color: "var(--txt2)", fontFamily: "var(--mono)" }}>
                {row.usage_count}/{row.usage_limit === -1 ? "∞" : row.usage_limit}
                <span style={{ color: "var(--txt3)", marginLeft: 4 }}>
                  (sisa {remainingUses(row)})
                </span>
              </td>
              <td style={{ padding: "12px 14px", color: "var(--txt2)", fontSize: 11, whiteSpace: "nowrap" }}>
                {row.expires_at ? (
                  <span style={{ color: isExpired(row.expires_at) ? "#DC1F2E" : "var(--txt2)" }}>
                    {fmtDateShort(row.expires_at)}
                  </span>
                ) : <span style={{ color: "var(--txt3)" }}>Tidak expire</span>}
              </td>
              <td style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => onEdit(row)} style={actionBtn("#3b82f6")}>Edit</button>
                  <button onClick={() => onRevoke(row)} style={actionBtn("#DC1F2E")}>Cabut</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const actionBtn = (color) => ({
  background: `${color}18`, border: `1px solid ${color}44`,
  color, fontSize: 11, fontWeight: 700, padding: "4px 10px",
  borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
  transition: "background .15s", whiteSpace: "nowrap",
});

// ─── Tabs ─────────────────────────────────────────────────────────────────────
const TABS = ["Akses", "Blacklist", "Log"];

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AdminHarukaze() {
  const { toasts, add: toast } = useToast();

  // ── Auth ────────────────────────────────────────────────────────────────────
  const [authed,       setAuthed]       = useState(false);
  const [loginForm,    setLoginForm]    = useState({ username: "", password: "" });
  const [loginError,   setLoginError]   = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("hkz_auth") === "1") setAuthed(true);
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    setTimeout(() => {
      if (loginForm.username === ADMIN_USER && loginForm.password === ADMIN_PASS) {
        sessionStorage.setItem("hkz_auth", "1");
        setAuthed(true);
      } else {
        setLoginError("Username atau password salah.");
      }
      setLoginLoading(false);
    }, 500);
  };

  // ── Tab & Data ──────────────────────────────────────────────────────────────
  const [tab,          setTab]          = useState(0);
  const [accessList,   setAccessList]   = useState([]);
  const [blacklist,    setBlacklist]    = useState([]);
  const [logs,         setLogs]         = useState([]);
  const [loadingA,     setLoadingA]     = useState(false);
  const [loadingB,     setLoadingB]     = useState(false);
  const [loadingL,     setLoadingL]     = useState(false);

  // Filters
  const [filterEmail,  setFilterEmail]  = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType,   setFilterType]   = useState("");
  const [page,         setPage]         = useState(1);
  const [totalPages,   setTotalPages]   = useState(1);

  // Modals
  const [showGrant,    setShowGrant]    = useState(false);
  const [showBlacklist,setShowBlacklist]= useState(false);
  const [editAccess,   setEditAccess]   = useState(null);
  const [detailEmail,  setDetailEmail]  = useState(null);

  // ── Fetch Access ────────────────────────────────────────────────────────────
  const fetchAccess = useCallback(async () => {
    setLoadingA(true);
    try {
      const params = new URLSearchParams({ page, limit: 20 });
      if (filterEmail)  params.set("email",       filterEmail);
      if (filterStatus) params.set("is_active",   filterStatus);
      if (filterType)   params.set("access_type", filterType);
      const res = await apiFetch(`/list?${params}`);
      if (res.status) {
        setAccessList(res.data || []);
        setTotalPages(res.pagination?.total_pages || 1);
      }
    } catch (e) { toast(e.message, "error"); }
    finally { setLoadingA(false); }
  }, [page, filterEmail, filterStatus, filterType]);

  // ── Fetch Blacklist ─────────────────────────────────────────────────────────
  const fetchBlacklist = useCallback(async () => {
    setLoadingB(true);
    try {
      const res = await apiFetch("/blacklist/list");
      if (res.status) setBlacklist(res.data || []);
    } catch (e) { toast(e.message, "error"); }
    finally { setLoadingB(false); }
  }, []);

  // ── Fetch Logs ──────────────────────────────────────────────────────────────
  const fetchLogs = useCallback(async () => {
    setLoadingL(true);
    try {
      const res = await apiFetch("/logs/recent?limit=100");
      if (res.status) setLogs(res.data || []);
    } catch (e) { toast(e.message, "error"); }
    finally { setLoadingL(false); }
  }, []);

  useEffect(() => { if (authed) { fetchAccess(); fetchBlacklist(); fetchLogs(); } }, [authed]);
  useEffect(() => { if (authed && tab === 0) fetchAccess(); }, [tab, page, filterEmail, filterStatus, filterType]);
  useEffect(() => { if (authed && tab === 1) fetchBlacklist(); }, [tab]);
  useEffect(() => { if (authed && tab === 2) fetchLogs(); }, [tab]);

  // ── Revoke ──────────────────────────────────────────────────────────────────
  const handleRevoke = async (row) => {
    if (!confirm(`Cabut akses ${row.email}?`)) return;
    try {
      const res = await apiFetch(`/${row.id}`, { method: "DELETE" });
      if (res.status) { toast("Akses dicabut"); fetchAccess(); }
      else toast(res.message, "error");
    } catch (e) { toast(e.message, "error"); }
  };

  // ── Remove Blacklist ────────────────────────────────────────────────────────
  const handleRemoveBlacklist = async (email) => {
    if (!confirm(`Hapus ${email} dari blacklist?`)) return;
    try {
      const res = await apiFetch(`/blacklist/${encodeURIComponent(email)}`, { method: "DELETE" });
      if (res.status) { toast("Dihapus dari blacklist"); fetchBlacklist(); }
      else toast(res.message, "error");
    } catch (e) { toast(e.message, "error"); }
  };

  // ── Stats ───────────────────────────────────────────────────────────────────
  const stats = {
    total:    accessList.length,
    active:   accessList.filter((r) => r.is_active && !isExpired(r.expires_at)).length,
    expired:  accessList.filter((r) => isExpired(r.expires_at)).length,
    blacklisted: blacklist.length,
  };

  // ─────────────────────────────────────────────────────────────────────────
  // LOGIN SCREEN
  // ─────────────────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <>
        <style>{styles}</style>
        <div className="hkz-login-bg">
          <div className="hkz-login-glow" />
          <div className="hkz-login-card">
            <div className="hkz-brand">
              <div className="hkz-brand-icon">風</div>
              <div>
                <div className="hkz-brand-name">Harukaze48</div>
                <div className="hkz-brand-sub">Admin Panel</div>
              </div>
            </div>
            <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Field label="Username">
                <input style={inputStyle} type="text" autoComplete="username"
                  value={loginForm.username}
                  onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                  placeholder="Username" required />
              </Field>
              <Field label="Password">
                <input style={inputStyle} type="password" autoComplete="current-password"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  placeholder="Password" required />
              </Field>
              {loginError && (
                <div style={{ background: "#DC1F2E18", border: "1px solid #DC1F2E44", color: "#ff8080", fontSize: 13, borderRadius: 8, padding: "9px 14px" }}>
                  {loginError}
                </div>
              )}
              <button type="submit" disabled={loginLoading} style={{ ...btnPrimaryStyle, marginTop: 4 }}>
                {loginLoading ? <Spin /> : "Masuk →"}
              </button>
            </form>
          </div>
        </div>
        <ToastContainer toasts={toasts} />
      </>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DASHBOARD
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{styles}</style>

      {/* Header */}
    <header className="hkz-header">
  <div className="hkz-header-left">
    <div className="hkz-brand-icon sm">風</div>
    <span className="hkz-header-title">Harukaze48</span>
    <span className="hkz-admin-badge">ADMIN</span>
  </div>
  <div className="hkz-header-right">
    <button onClick={() => setShowGrant(true)} style={{ ...btnPrimaryStyle, padding: "7px 14px", fontSize: 12 }}>
      + Grant Akses
    </button>
    <button onClick={() => setShowBlacklist(true)}
      style={{ background: "#DC1F2E18", border: "1px solid #DC1F2E44", color: "#DC1F2E", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
      Blacklist
    </button>
    <button onClick={() => { sessionStorage.removeItem("hkz_auth"); setAuthed(false); }}
      style={{ background: "none", border: "1px solid var(--line)", color: "var(--txt3)", borderRadius: 8, padding: "7px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
      Logout
    </button>
  </div>
</header>

      <div className="hkz-page">
        {/* Stats */}
        <div className="hkz-stats">
          {[
            { label: "Total Akses", val: stats.total, color: "var(--accent)" },
            { label: "Aktif",       val: stats.active,      color: "#22c55e" },
            { label: "Expired",     val: stats.expired,     color: "#f59e0b" },
            { label: "Blacklist",   val: stats.blacklisted, color: "#DC1F2E" },
          ].map((s) => (
            <div key={s.label} className="hkz-stat-card">
              <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.val}</div>
              <div style={{ fontSize: 11, color: "var(--txt3)", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.8px" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="hkz-tabs">
          {TABS.map((t, i) => (
            <button key={t} className={`hkz-tab ${tab === i ? "active" : ""}`} onClick={() => setTab(i)}>
              {t}
            </button>
          ))}
        </div>

        {/* ── Tab: Akses ── */}
        {tab === 0 && (
          <div className="hkz-card">
            {/* Filters */}
            <div className="hkz-filters">
              <input style={{ ...inputStyle, maxWidth: 220 }}
                placeholder="Cari email..."
                value={filterEmail}
                onChange={(e) => { setFilterEmail(e.target.value); setPage(1); }} />
              <select style={{ ...inputStyle, maxWidth: 140 }}
                value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}>
                <option value="">Semua Status</option>
                <option value="true">Aktif</option>
                <option value="false">Nonaktif</option>
              </select>
              <select style={{ ...inputStyle, maxWidth: 140 }}
                value={filterType}
                onChange={(e) => { setFilterType(e.target.value); setPage(1); }}>
                <option value="">Semua Type</option>
                <option value="standard">Standard</option>
                <option value="premium">Premium</option>
                <option value="vip">VIP</option>
              </select>
              <button onClick={fetchAccess} style={{ background: "var(--bg3)", border: "1px solid var(--line)", color: "var(--txt2)", borderRadius: 8, padding: "8px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                ↻ Refresh
              </button>
            </div>

            <AccessTable
              items={accessList}
              loading={loadingA}
              onEdit={setEditAccess}
              onRevoke={handleRevoke}
              onDetail={setDetailEmail}
            />

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "16px 0 4px" }}>
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                  style={{ ...actionBtn("var(--accent)"), opacity: page === 1 ? 0.4 : 1 }}>← Prev</button>
                <span style={{ color: "var(--txt2)", fontSize: 13 }}>{page} / {totalPages}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  style={{ ...actionBtn("var(--accent)"), opacity: page === totalPages ? 0.4 : 1 }}>Next →</button>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Blacklist ── */}
        {tab === 1 && (
          <div className="hkz-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <span style={{ fontSize: 13, color: "var(--txt2)" }}>{blacklist.length} email di-blacklist</span>
              <button onClick={fetchBlacklist} style={{ background: "var(--bg3)", border: "1px solid var(--line)", color: "var(--txt2)", borderRadius: 8, padding: "7px 12px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                ↻
              </button>
            </div>
            {loadingB ? (
              <div style={{ textAlign: "center", padding: "40px 0" }}><Spin xl /></div>
            ) : blacklist.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "var(--txt3)", fontSize: 14 }}>Tidak ada email di-blacklist</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {blacklist.map((b) => (
                  <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--bg3)", border: "1px solid #DC1F2E22", borderRadius: 10, padding: "12px 16px" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--txt)", marginBottom: 3 }}>{b.email}</div>
                      <div style={{ fontSize: 11, color: "var(--txt3)", display: "flex", gap: 12, flexWrap: "wrap" }}>
                        {b.reason && <span>Alasan: {b.reason}</span>}
                        <span>Expire: {b.expires_at ? fmtDateShort(b.expires_at) : "Permanen"}</span>
                        <span>Oleh: {b.created_by || "—"}</span>
                        <span>Tanggal: {fmtDateShort(b.created_at)}</span>
                      </div>
                    </div>
                    <button onClick={() => handleRemoveBlacklist(b.email)}
                      style={{ ...actionBtn("#22c55e"), flexShrink: 0 }}>Hapus</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Log ── */}
        {tab === 2 && (
          <div className="hkz-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <span style={{ fontSize: 13, color: "var(--txt2)" }}>100 log terbaru</span>
              <button onClick={fetchLogs} style={{ background: "var(--bg3)", border: "1px solid var(--line)", color: "var(--txt2)", borderRadius: 8, padding: "7px 12px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                ↻
              </button>
            </div>
            {loadingL ? (
              <div style={{ textAlign: "center", padding: "40px 0" }}><Spin xl /></div>
            ) : logs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "var(--txt3)", fontSize: 14 }}>Tidak ada log</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 600, overflowY: "auto" }}>
                {logs.map((l) => (
                  <div key={l.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 14px", background: "var(--bg3)", borderRadius: 8, fontSize: 12 }}>
                    <span style={{
                      padding: "2px 8px", borderRadius: 4, fontWeight: 700, fontSize: 10,
                      background: l.status === "success" ? "#22c55e22" : "#DC1F2E22",
                      color: l.status === "success" ? "#22c55e" : "#DC1F2E",
                      border: `1px solid ${l.status === "success" ? "#22c55e44" : "#DC1F2E44"}`,
                      whiteSpace: "nowrap", flexShrink: 0,
                    }}>{l.action}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: "var(--txt)", marginBottom: 2, fontFamily: "var(--mono)", fontSize: 11 }}>{l.email}</div>
                      {l.error_message && <div style={{ color: "#ff8080", fontSize: 11 }}>{l.error_message}</div>}
                      {l.ip_address && <div style={{ color: "var(--txt3)", fontSize: 10 }}>IP: {l.ip_address}</div>}
                    </div>
                    <span style={{ color: "var(--txt3)", fontSize: 10, whiteSpace: "nowrap", flexShrink: 0 }}>
                      {fmtDate(l.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showGrant    && <GrantModal     onClose={() => setShowGrant(false)}     onSuccess={fetchAccess} toast={toast} />}
      {showBlacklist&& <BlacklistModal onClose={() => setShowBlacklist(false)} onSuccess={fetchBlacklist} toast={toast} />}
      {editAccess   && <EditModal      access={editAccess} onClose={() => setEditAccess(null)} onSuccess={fetchAccess} toast={toast} />}
      {detailEmail  && <DetailModal    email={detailEmail} onClose={() => setDetailEmail(null)} toast={toast} />}

      <ToastContainer toasts={toasts} />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@700;800&family=Inter:wght@400;500;600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --accent:      #a78bfa;
    --accent-glow: rgba(167,139,250,0.25);
    --bg:          #080810;
    --bg2:         #0e0e1a;
    --bg3:         #141424;
    --bg4:         #1c1c2e;
    --line:        #1e1e30;
    --txt:         #e8e8f0;
    --txt2:        #7878a8;
    --txt3:        #3a3a5c;
    --mono:        'DM Mono', monospace;
    --sans:        'Inter', sans-serif;
    --display:     'Syne', sans-serif;
  }
  @keyframes spin       { to { transform: rotate(360deg); } }
  @keyframes fadeInUp   { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
  @keyframes shimmer    { 0% { opacity: .4 } 50% { opacity: 1 } 100% { opacity: .4 } }

  body { background: var(--bg); font-family: var(--sans); color: var(--txt); min-height: 100vh; }

  /* ── Login ── */
  .hkz-login-bg {
    min-height: 100vh; background: var(--bg);
    display: flex; align-items: center; justify-content: center;
    padding: 20px; position: relative; overflow: hidden;
  }
  .hkz-login-glow {
    position: fixed; inset: 0; pointer-events: none;
    background: radial-gradient(ellipse 60% 60% at 50% 50%, rgba(167,139,250,0.07) 0%, transparent 70%);
  }
  .hkz-login-card {
    position: relative; z-index: 1;
    width: min(420px, 100%); background: var(--bg2);
    border: 1px solid var(--line); border-radius: 20px;
    padding: 36px 32px; box-shadow: 0 32px 80px #00000088;
    animation: fadeInUp .4s ease;
  }
  .hkz-brand { display: flex; align-items: center; gap: 14px; margin-bottom: 28px; }
  .hkz-brand-icon {
    width: 52px; height: 52px; border-radius: 14px;
    background: linear-gradient(135deg, rgba(167,139,250,0.2), rgba(139,92,246,0.1));
    border: 1px solid rgba(167,139,250,0.3);
    display: flex; align-items: center; justify-content: center;
    font-size: 22px; font-family: serif; color: var(--accent);
    flex-shrink: 0;
  }
  .hkz-brand-icon.sm { width: 34px; height: 34px; font-size: 16px; border-radius: 9px; }
  .hkz-brand-name { font-family: var(--display); font-size: 20px; font-weight: 800; color: var(--txt); letter-spacing: -0.3px; }
  .hkz-brand-sub  { font-size: 12px; color: var(--txt3); margin-top: 2px; }

  /* ── Header ── */
/* ── Header ── */
.hkz-header {
  position: sticky; top: 0; z-index: 200;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 24px; min-height: 56px;           /* min-height, bukan height */
  background: var(--bg2); border-bottom: 1px solid var(--line);
  backdrop-filter: blur(12px);
  flex-wrap: wrap;                              /* izinkan wrap */
  gap: 8px;
}
.hkz-header-left  { display: flex; align-items: center; gap: 10px; }
.hkz-header-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .hkz-header-title { font-family: var(--display); font-size: 15px; font-weight: 800; letter-spacing: 1px; }
  .hkz-admin-badge  {
    background: var(--accent); color: #fff;
    font-size: 9px; font-weight: 700; letter-spacing: 1.5px;
    padding: 2px 8px; border-radius: 4px;
  }

  /* ── Page ── */
  .hkz-page {
    max-width: 1200px; margin: 0 auto;
    padding: 24px 20px 80px;
    display: flex; flex-direction: column; gap: 20px;
  }

  /* ── Stats ── */
  .hkz-stats {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px;
  }
  .hkz-stat-card {
    background: var(--bg2); border: 1px solid var(--line);
    border-radius: 14px; padding: 18px 20px;
    transition: border-color .2s;
  }
  .hkz-stat-card:hover { border-color: rgba(167,139,250,0.2); }

  /* ── Tabs ── */
  .hkz-tabs {
    display: flex; gap: 4; background: var(--bg2);
    border: 1px solid var(--line); border-radius: 12px;
    padding: 4px; width: fit-content;
  }
  .hkz-tab {
    padding: 8px 20px; border-radius: 9px; border: none;
    background: none; color: var(--txt2); font-size: 13px;
    font-weight: 600; cursor: pointer; font-family: var(--sans);
    transition: background .2s, color .2s;
  }
  .hkz-tab.active { background: var(--accent); color: #fff; }
  .hkz-tab:not(.active):hover { color: var(--txt); background: var(--bg3); }

  /* ── Card ── */
  .hkz-card {
    background: var(--bg2); border: 1px solid var(--line);
    border-radius: 16px; padding: 20px; overflow: hidden;
    animation: fadeInUp .25s ease;
  }

  /* ── Filters ── */
  .hkz-filters {
    display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px;
    padding-bottom: 16px; border-bottom: 1px solid var(--line);
  }

/* ganti seluruh blok @media (max-width: 640px) yang ada */
@media (max-width: 640px) {
  .hkz-header {
    padding: 10px 14px;
    min-height: unset;
    height: auto;
    flex-direction: column;
    align-items: stretch;
    gap: 0;
  }
  .hkz-header-left {
    padding-bottom: 10px;
  }
  .hkz-header-right {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;   /* 3 kolom equal */
    gap: 6px;
    padding-top: 10px;
    border-top: 1px solid var(--line);
    width: 100%;
  }
  .hkz-header-right button {
    padding: 8px 6px !important;
    font-size: 11px !important;
    justify-content: center;
    width: 100%;
  }

  /* sisanya tetap sama */
  .hkz-page { padding: 14px 12px 60px; gap: 14px; }
  .hkz-stats { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .hkz-stat-card { padding: 14px 16px; }
  .hkz-card { padding: 14px; }
  .hkz-filters { gap: 8px; }
  .hkz-filters input,
  .hkz-filters select { max-width: 100% !important; font-size: 12px; }
  .hkz-tabs { width: 100%; }
  .hkz-tab { flex: 1; padding: 8px 10px; font-size: 12px; }
  .hkz-login-card { padding: 24px 20px; }
}
`;
