import { useEffect, useState, useCallback } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const API_BASE = "https://v5.jkt48connect.com/api/harukaze";

// apiFetch — selalu pakai Bearer token dari session admin yang login (bukan apikey statis,
// karena harukaze.js memverifikasi via JWT + requireAdmin, bukan lewat query apikey)
const apiFetch = async (path, opts = {}, token) => {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  let data;
  try { data = await res.json(); } catch { data = { status: false, message: "Respon tidak valid dari server" }; }
  return { ...data, _httpStatus: res.status };
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
  return new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
};
const fmtRp = (n) => `Rp ${Number(n || 0).toLocaleString("id-ID")}`;
const isExpired = (expiresAt) => expiresAt && new Date(expiresAt) < new Date();
const remainingUses = (row) => (row.usage_limit === -1 ? "∞" : Math.max(0, row.usage_limit - row.usage_count));

const orderStatusColor = (status) => {
  if (status === "paid") return "#22c55e";
  if (status === "pending") return "#f59e0b";
  if (["failed", "expired", "cancelled"].includes(status)) return "#DC1F2E";
  return "#7878a8";
};

// ─── Toast ────────────────────────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((p) => [...p, { id, msg, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  }, []);
  return { toasts, add };
}

function ToastContainer({ toasts }) {
  return (
    <div className="hkz-toast-wrap">
      {toasts.map((t) => (
        <div key={t.id} className={`hkz-toast hkz-toast--${t.type}`}>{t.msg}</div>
      ))}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div className="hkz-modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="hkz-modal-card">
        <div className="hkz-modal-head">
          <h3>{title}</h3>
          <button onClick={onClose} className="hkz-modal-close">×</button>
        </div>
        <div className="hkz-modal-body">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <div className="hkz-field">
      <label>{label}</label>
      {children}
      {hint && <span className="hkz-field-hint">{hint}</span>}
    </div>
  );
}

function Spin({ xl }) {
  return <div className={`hkz-spin ${xl ? "hkz-spin--xl" : ""}`} />;
}

function StatusBadge({ row }) {
  if (!row.is_active || row.deleted_at) return <span className="hkz-badge hkz-badge--muted">Nonaktif</span>;
  if (isExpired(row.expires_at)) return <span className="hkz-badge hkz-badge--red">Expired</span>;
  if (row.usage_limit !== -1 && row.usage_count >= row.usage_limit) return <span className="hkz-badge hkz-badge--amber">Habis</span>;
  return <span className="hkz-badge hkz-badge--green">Aktif</span>;
}

function OrderStatusBadge({ status }) {
  const c = orderStatusColor(status);
  return <span className="hkz-badge" style={{ color: c, background: `${c}22`, border: `1px solid ${c}44` }}>{status.toUpperCase()}</span>;
}

// ════════════════════════════════════════════════════════════════════════
// LOGIN
// ════════════════════════════════════════════════════════════════════════
function LoginScreen({ onLoggedIn, toast }) {
  const [form, setForm] = useState({ login: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // 1) Login lewat /auth/login (endpoint umum, bukan endpoint admin khusus)
      const res = await apiFetch("/auth/login", { method: "POST", body: JSON.stringify(form) });
      if (!res.status) { setError(res.message || "Login gagal"); setLoading(false); return; }

      const token = res.data.access_token;
      const refreshToken = res.data.refresh_token;

      // 2) Pastikan akun ini benar admin dengan mencoba 1 endpoint /admin/*
      const check = await apiFetch("/admin/logs/recent?limit=1", {}, token);
      if (check._httpStatus === 403) {
        setError("Akun ini bukan admin. Akses ditolak.");
        setLoading(false);
        return;
      }
      if (check._httpStatus === 401) {
        setError("Token tidak valid, coba login ulang.");
        setLoading(false);
        return;
      }

      sessionStorage.setItem("hkz_token", token);
      sessionStorage.setItem("hkz_refresh", refreshToken);
      sessionStorage.setItem("hkz_user", JSON.stringify(res.data.user));
      toast(`Selamat datang, ${res.data.user.username}!`);
      onLoggedIn(token, res.data.user);
    } catch (err) {
      setError("Gagal terhubung ke server. Periksa koneksi internet.");
    } finally {
      setLoading(false);
    }
  };

  return (
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
        <form onSubmit={handleSubmit} className="hkz-form-col">
          <Field label="Username atau Email">
            <input className="hkz-input" type="text" autoComplete="username" placeholder="Username / email"
              value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} required />
          </Field>
          <Field label="Password">
            <input className="hkz-input" type="password" autoComplete="current-password" placeholder="Password"
              value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </Field>
          {error && <div className="hkz-error-box">{error}</div>}
          <button type="submit" disabled={loading} className="hkz-btn-primary" style={{ marginTop: 4 }}>
            {loading ? <Spin /> : "Masuk →"}
          </button>
        </form>
        <p className="hkz-login-note">Login menggunakan akun user biasa yang sudah punya hak <code>is_admin</code> di database.</p>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// TAB: ORDERS
// ════════════════════════════════════════════════════════════════════════
function OrdersTab({ token, toast }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [orderType, setOrderType] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit, offset });
      if (status) params.set("status", status);
      if (orderType) params.set("order_type", orderType);
      const res = await apiFetch(`/admin/orders?${params}`, {}, token);
      if (res.status) setOrders(res.data || []);
      else toast(res.message || "Gagal ambil order", "error");
    } catch (e) { toast(e.message, "error"); }
    finally { setLoading(false); }
  }, [token, status, orderType, offset]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  return (
    <div className="hkz-card">
      <div className="hkz-filters">
        <select className="hkz-input hkz-input--sm" value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }}>
          <option value="">Semua Status</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="failed">Failed</option>
          <option value="expired">Expired</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select className="hkz-input hkz-input--sm" value={orderType} onChange={(e) => { setOrderType(e.target.value); setOffset(0); }}>
          <option value="">Semua Tipe</option>
          <option value="membership">Membership</option>
          <option value="pershow">Pershow</option>
        </select>
        <button className="hkz-btn-ghost" onClick={fetchOrders}>↻ Refresh</button>
      </div>

      {loading ? (
        <div className="hkz-loading"><Spin xl /><p>Memuat order...</p></div>
      ) : orders.length === 0 ? (
        <div className="hkz-empty">Tidak ada order ditemukan</div>
      ) : (
        <div className="hkz-table-wrap">
          <table className="hkz-table">
            <thead>
              <tr>
                <th>Order ID</th><th>User</th><th>Tipe</th><th>Item</th><th>Jumlah</th><th>Status</th><th>Dibuat</th><th>Dibayar</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.order_id}>
                  <td className="hkz-mono">{o.order_id}</td>
                  <td>
                    <div>{o.username}</div>
                    <div className="hkz-subtext">{o.email}</div>
                  </td>
                  <td>{o.order_type === "membership" ? "Membership" : "Pershow"}</td>
                  <td>{o.plan_name || o.show_title || "—"}</td>
                  <td className="hkz-mono">{fmtRp(o.amount)}</td>
                  <td><OrderStatusBadge status={o.status} /></td>
                  <td className="hkz-subtext">{fmtDate(o.created_at)}</td>
                  <td className="hkz-subtext">{o.paid_at ? fmtDate(o.paid_at) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="hkz-pagination">
        <button className="hkz-btn-page" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - limit))}>← Prev</button>
        <span className="hkz-subtext">Menampilkan {offset + 1}–{offset + orders.length}</span>
        <button className="hkz-btn-page" disabled={orders.length < limit} onClick={() => setOffset((o) => o + limit)}>Next →</button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// TAB: ACCESS
// ════════════════════════════════════════════════════════════════════════
function AccessEditModal({ access, token, onClose, onSuccess, toast }) {
  const [form, setForm] = useState({ is_active: access.is_active, notes: access.notes || "", extend_hours: "" });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const body = { is_active: form.is_active, notes: form.notes || null };
      if (form.extend_hours !== "") body.extend_hours = Number(form.extend_hours);
      const res = await apiFetch(`/admin/access/${access.id}`, { method: "PATCH", body: JSON.stringify(body) }, token);
      if (res.status) { toast("Akses berhasil diperbarui!"); onSuccess(); onClose(); }
      else toast(res.message || "Gagal update akses", "error");
    } catch (e) { toast(e.message, "error"); }
    finally { setLoading(false); }
  };

  return (
    <Modal title={`Edit Akses — ${access.access_code}`} onClose={onClose}>
      <div className="hkz-form-col">
        <div className="hkz-subtext" style={{ marginBottom: -4 }}>
          User: {access.username} ({access.email}) · Tipe: {access.access_type}
        </div>
        <Field label="Status">
          <select className="hkz-input" value={form.is_active ? "true" : "false"} onChange={(e) => set("is_active", e.target.value === "true")}>
            <option value="true">Aktif</option>
            <option value="false">Nonaktif</option>
          </select>
        </Field>
        <Field label="Perpanjang (jam)" hint="Ditambahkan dari waktu expire saat ini, atau dari sekarang jika sudah expired">
          <input className="hkz-input" type="number" min="1" placeholder="misal: 48"
            value={form.extend_hours} onChange={(e) => set("extend_hours", e.target.value)} />
        </Field>
        <Field label="Catatan Internal">
          <textarea className="hkz-input hkz-textarea" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
        <button onClick={handleSubmit} disabled={loading} className="hkz-btn-primary">
          {loading ? <Spin /> : "Simpan Perubahan"}
        </button>
      </div>
    </Modal>
  );
}

function AccessTab({ token, toast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState("");
  const [accessType, setAccessType] = useState("");
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState(null);
  const limit = 20;

  const fetchAccess = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit, offset });
      if (userId) params.set("user_id", userId);
      if (accessType) params.set("access_type", accessType);
      const res = await apiFetch(`/admin/access/list?${params}`, {}, token);
      if (res.status) setItems(res.data || []);
      else toast(res.message || "Gagal ambil akses", "error");
    } catch (e) { toast(e.message, "error"); }
    finally { setLoading(false); }
  }, [token, userId, accessType, offset]);

  useEffect(() => { fetchAccess(); }, [fetchAccess]);

  const handleRevoke = async (row) => {
    if (!confirm(`Cabut akses ${row.access_code} milik ${row.email}?`)) return;
    try {
      const res = await apiFetch(`/admin/access/${row.id}`, { method: "DELETE" }, token);
      if (res.status) { toast("Akses dicabut"); fetchAccess(); }
      else toast(res.message, "error");
    } catch (e) { toast(e.message, "error"); }
  };

  return (
    <div className="hkz-card">
      <div className="hkz-filters">
        <input className="hkz-input hkz-input--sm" placeholder="Filter user_id (UUID)..."
          value={userId} onChange={(e) => { setUserId(e.target.value); setOffset(0); }} />
        <select className="hkz-input hkz-input--sm" value={accessType} onChange={(e) => { setAccessType(e.target.value); setOffset(0); }}>
          <option value="">Semua Tipe</option>
          <option value="membership">Membership</option>
          <option value="pershow">Pershow</option>
        </select>
        <button className="hkz-btn-ghost" onClick={fetchAccess}>↻ Refresh</button>
      </div>

      {loading ? (
        <div className="hkz-loading"><Spin xl /><p>Memuat akses...</p></div>
      ) : items.length === 0 ? (
        <div className="hkz-empty">Tidak ada akses ditemukan</div>
      ) : (
        <div className="hkz-table-wrap">
          <table className="hkz-table">
            <thead>
              <tr>
                <th>Kode Akses</th><th>User</th><th>Tipe</th><th>Item</th><th>Status</th><th>Pakai</th><th>Expire</th><th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td className="hkz-mono">{row.access_code}</td>
                  <td>
                    <div>{row.username}</div>
                    <div className="hkz-subtext">{row.email}</div>
                  </td>
                  <td>{row.access_type === "membership" ? "Membership" : "Pershow"}</td>
                  <td>{row.show_title || row.label || "—"}</td>
                  <td><StatusBadge row={row} /></td>
                  <td className="hkz-mono">
                    {row.usage_count}/{row.usage_limit === -1 ? "∞" : row.usage_limit}
                    <span className="hkz-subtext"> (sisa {remainingUses(row)})</span>
                  </td>
                  <td className="hkz-subtext">{row.expires_at ? fmtDateShort(row.expires_at) : "Tanpa batas"}</td>
                  <td>
                    <div className="hkz-actions">
                      <button className="hkz-action-btn hkz-action-btn--blue" onClick={() => setEditing(row)}>Edit</button>
                      <button className="hkz-action-btn hkz-action-btn--red" onClick={() => handleRevoke(row)}>Cabut</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="hkz-pagination">
        <button className="hkz-btn-page" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - limit))}>← Prev</button>
        <span className="hkz-subtext">Menampilkan {offset + 1}–{offset + items.length}</span>
        <button className="hkz-btn-page" disabled={items.length < limit} onClick={() => setOffset((o) => o + limit)}>Next →</button>
      </div>

      {editing && (
        <AccessEditModal access={editing} token={token} onClose={() => setEditing(null)} onSuccess={fetchAccess} toast={toast} />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// TAB: PLANS (membership)
// ════════════════════════════════════════════════════════════════════════
function PlanFormModal({ plan, token, onClose, onSuccess, toast }) {
  const isEdit = Boolean(plan);
  const [form, setForm] = useState({
    plan_code: plan?.plan_code || "",
    plan_name: plan?.plan_name || "",
    duration_days: plan?.duration_days || 30,
    price: plan?.price || 0,
    price_sale: plan?.price_sale || "",
    description: plan?.description || "",
    is_popular: plan?.is_popular || false,
    sort_order: plan?.sort_order || 0,
    is_active: plan?.is_active ?? true,
  });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    if (!isEdit && (!form.plan_code || !form.plan_name || !form.duration_days || !form.price)) {
      toast("plan_code, plan_name, duration_days, price wajib diisi", "error"); return;
    }
    setLoading(true);
    try {
      const body = {
        plan_name: form.plan_name,
        duration_days: Number(form.duration_days),
        price: Number(form.price),
        price_sale: form.price_sale === "" ? null : Number(form.price_sale),
        description: form.description || null,
        is_popular: form.is_popular,
        sort_order: Number(form.sort_order),
      };
      let res;
      if (isEdit) {
        body.is_active = form.is_active;
        res = await apiFetch(`/admin/plans/${plan.id}`, { method: "PATCH", body: JSON.stringify(body) }, token);
      } else {
        body.plan_code = form.plan_code;
        res = await apiFetch(`/admin/plans`, { method: "POST", body: JSON.stringify(body) }, token);
      }
      if (res.status) { toast(isEdit ? "Paket diperbarui!" : "Paket dibuat!"); onSuccess(); onClose(); }
      else toast(res.message || "Gagal", "error");
    } catch (e) { toast(e.message, "error"); }
    finally { setLoading(false); }
  };

  return (
    <Modal title={isEdit ? `Edit Paket — ${plan.plan_code}` : "Buat Paket Membership"} onClose={onClose}>
      <div className="hkz-form-col">
        {!isEdit && (
          <Field label="Plan Code *" hint="Unik, tidak bisa diubah setelah dibuat">
            <input className="hkz-input" placeholder="misal: MONTHLY30" value={form.plan_code} onChange={(e) => set("plan_code", e.target.value)} />
          </Field>
        )}
        <Field label="Nama Paket *">
          <input className="hkz-input" value={form.plan_name} onChange={(e) => set("plan_name", e.target.value)} />
        </Field>
        <div className="hkz-form-row">
          <Field label="Durasi (hari) *">
            <input className="hkz-input" type="number" min="1" value={form.duration_days} onChange={(e) => set("duration_days", e.target.value)} />
          </Field>
          <Field label="Sort Order">
            <input className="hkz-input" type="number" value={form.sort_order} onChange={(e) => set("sort_order", e.target.value)} />
          </Field>
        </div>
        <div className="hkz-form-row">
          <Field label="Harga Normal *">
            <input className="hkz-input" type="number" min="0" value={form.price} onChange={(e) => set("price", e.target.value)} />
          </Field>
          <Field label="Harga Promo" hint="Kosongkan jika tidak ada">
            <input className="hkz-input" type="number" min="0" value={form.price_sale} onChange={(e) => set("price_sale", e.target.value)} />
          </Field>
        </div>
        <Field label="Deskripsi">
          <textarea className="hkz-input hkz-textarea" value={form.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <div className="hkz-form-row">
          <Field label="Populer?">
            <select className="hkz-input" value={form.is_popular ? "true" : "false"} onChange={(e) => set("is_popular", e.target.value === "true")}>
              <option value="false">Tidak</option>
              <option value="true">Ya, tandai populer</option>
            </select>
          </Field>
          {isEdit && (
            <Field label="Status">
              <select className="hkz-input" value={form.is_active ? "true" : "false"} onChange={(e) => set("is_active", e.target.value === "true")}>
                <option value="true">Aktif</option>
                <option value="false">Nonaktif</option>
              </select>
            </Field>
          )}
        </div>
        <button onClick={handleSubmit} disabled={loading} className="hkz-btn-primary">
          {loading ? <Spin /> : isEdit ? "Simpan Perubahan" : "Buat Paket"}
        </button>
      </div>
    </Modal>
  );
}

function PlansTab({ token, toast }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      // Katalog publik — hanya menampilkan paket yang is_active=TRUE (tidak ada endpoint list admin khusus)
      const res = await apiFetch(`/membership/plans`, {});
      if (res.status) setPlans(res.data || []);
      else toast(res.message || "Gagal ambil paket", "error");
    } catch (e) { toast(e.message, "error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  return (
    <div className="hkz-card">
      <div className="hkz-filters">
        <span className="hkz-subtext">{plans.length} paket aktif ditampilkan</span>
        <div style={{ flex: 1 }} />
        <button className="hkz-btn-ghost" onClick={fetchPlans}>↻ Refresh</button>
        <button className="hkz-btn-primary hkz-btn-primary--sm" onClick={() => setShowForm(true)}>+ Buat Paket</button>
      </div>
      <div className="hkz-notice">Paket yang dinonaktifkan akan hilang dari daftar ini karena hanya menampilkan katalog publik.</div>

      {loading ? (
        <div className="hkz-loading"><Spin xl /></div>
      ) : plans.length === 0 ? (
        <div className="hkz-empty">Belum ada paket membership aktif</div>
      ) : (
        <div className="hkz-table-wrap">
          <table className="hkz-table">
            <thead>
              <tr><th>Plan Code</th><th>Nama</th><th>Durasi</th><th>Harga</th><th>Populer</th><th>Aksi</th></tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id}>
                  <td className="hkz-mono">{p.plan_code}</td>
                  <td>{p.plan_name}</td>
                  <td>{p.duration_days} hari</td>
                  <td className="hkz-mono">
                    {p.price_sale ? (
                      <>
                        <span style={{ textDecoration: "line-through", color: "var(--txt3)", marginRight: 6 }}>{fmtRp(p.price)}</span>
                        {fmtRp(p.price_sale)}
                      </>
                    ) : fmtRp(p.price)}
                  </td>
                  <td>{p.is_popular ? <span className="hkz-badge hkz-badge--green">Populer</span> : "—"}</td>
                  <td><button className="hkz-action-btn hkz-action-btn--blue" onClick={() => setEditing(p)}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && <PlanFormModal token={token} onClose={() => setShowForm(false)} onSuccess={fetchPlans} toast={toast} />}
      {editing && <PlanFormModal plan={editing} token={token} onClose={() => setEditing(null)} onSuccess={fetchPlans} toast={toast} />}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// TAB: SHOWS
// ════════════════════════════════════════════════════════════════════════
function ShowFormModal({ show, token, onClose, onSuccess, toast }) {
  const isEdit = Boolean(show);
  const [form, setForm] = useState({
    show_code: show?.show_code || "",
    title: show?.title || "",
    description: show?.description || "",
    price: show?.price || 0,
    price_sale: show?.price_sale || "",
    thumbnail_url: show?.thumbnail_url || "",
    is_active: show?.is_active ?? true,
  });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    if (!isEdit && (!form.show_code || !form.title || !form.price)) {
      toast("show_code, title, price wajib diisi", "error"); return;
    }
    setLoading(true);
    try {
      const body = {
        title: form.title,
        description: form.description || null,
        price: Number(form.price),
        price_sale: form.price_sale === "" ? null : Number(form.price_sale),
        thumbnail_url: form.thumbnail_url || null,
      };
      let res;
      if (isEdit) {
        body.is_active = form.is_active;
        res = await apiFetch(`/admin/shows/${show.id}`, { method: "PATCH", body: JSON.stringify(body) }, token);
      } else {
        body.show_code = form.show_code;
        res = await apiFetch(`/admin/shows`, { method: "POST", body: JSON.stringify(body) }, token);
      }
      if (res.status) { toast(isEdit ? "Show diperbarui!" : "Show dibuat!"); onSuccess(); onClose(); }
      else toast(res.message || "Gagal", "error");
    } catch (e) { toast(e.message, "error"); }
    finally { setLoading(false); }
  };

  return (
    <Modal title={isEdit ? `Edit Show — ${show.show_code}` : "Buat Show Baru"} onClose={onClose}>
      <div className="hkz-form-col">
        {!isEdit && (
          <Field label="Show Code *" hint="Unik, tidak bisa diubah setelah dibuat">
            <input className="hkz-input" placeholder="misal: THEATER-JUL08" value={form.show_code} onChange={(e) => set("show_code", e.target.value)} />
          </Field>
        )}
        <Field label="Judul *">
          <input className="hkz-input" value={form.title} onChange={(e) => set("title", e.target.value)} />
        </Field>
        <Field label="Deskripsi">
          <textarea className="hkz-input hkz-textarea" value={form.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <div className="hkz-form-row">
          <Field label="Harga Normal *">
            <input className="hkz-input" type="number" min="0" value={form.price} onChange={(e) => set("price", e.target.value)} />
          </Field>
          <Field label="Harga Promo" hint="Kosongkan jika tidak ada">
            <input className="hkz-input" type="number" min="0" value={form.price_sale} onChange={(e) => set("price_sale", e.target.value)} />
          </Field>
        </div>
        <Field label="Thumbnail URL">
          <input className="hkz-input" placeholder="https://..." value={form.thumbnail_url} onChange={(e) => set("thumbnail_url", e.target.value)} />
        </Field>
        {isEdit && (
          <Field label="Status">
            <select className="hkz-input" value={form.is_active ? "true" : "false"} onChange={(e) => set("is_active", e.target.value === "true")}>
              <option value="true">Aktif</option>
              <option value="false">Nonaktif</option>
            </select>
          </Field>
        )}
        <button onClick={handleSubmit} disabled={loading} className="hkz-btn-primary">
          {loading ? <Spin /> : isEdit ? "Simpan Perubahan" : "Buat Show"}
        </button>
      </div>
    </Modal>
  );
}

function ShowsTab({ token, toast }) {
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const fetchShows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await apiFetch(`/shows${params.toString() ? `?${params}` : ""}`, {});
      if (res.status) setShows(res.data || []);
      else toast(res.message || "Gagal ambil show", "error");
    } catch (e) { toast(e.message, "error"); }
    finally { setLoading(false); }
  }, [search]);

  useEffect(() => { fetchShows(); }, [fetchShows]);

  return (
    <div className="hkz-card">
      <div className="hkz-filters">
        <input className="hkz-input hkz-input--sm" placeholder="Cari judul show..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <div style={{ flex: 1 }} />
        <button className="hkz-btn-ghost" onClick={fetchShows}>↻ Refresh</button>
        <button className="hkz-btn-primary hkz-btn-primary--sm" onClick={() => setShowForm(true)}>+ Buat Show</button>
      </div>
      <div className="hkz-notice">Show yang dinonaktifkan akan hilang dari daftar ini karena hanya menampilkan katalog publik.</div>

      {loading ? (
        <div className="hkz-loading"><Spin xl /></div>
      ) : shows.length === 0 ? (
        <div className="hkz-empty">Belum ada show aktif</div>
      ) : (
        <div className="hkz-show-grid">
          {shows.map((s) => (
            <div key={s.id} className="hkz-show-card">
              {s.thumbnail_url && <img src={s.thumbnail_url} alt={s.title} className="hkz-show-thumb" />}
              <div className="hkz-show-body">
                <div className="hkz-mono hkz-subtext">{s.show_code}</div>
                <div className="hkz-show-title">{s.title}</div>
                <div className="hkz-mono">
                  {s.price_sale ? (
                    <>
                      <span style={{ textDecoration: "line-through", color: "var(--txt3)", marginRight: 6 }}>{fmtRp(s.price)}</span>
                      {fmtRp(s.price_sale)}
                    </>
                  ) : fmtRp(s.price)}
                </div>
                <button className="hkz-action-btn hkz-action-btn--blue" style={{ marginTop: 8 }} onClick={() => setEditing(s)}>Edit</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && <ShowFormModal token={token} onClose={() => setShowForm(false)} onSuccess={fetchShows} toast={toast} />}
      {editing && <ShowFormModal show={editing} token={token} onClose={() => setEditing(null)} onSuccess={fetchShows} toast={toast} />}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// TAB: BLACKLIST  (tidak ada endpoint list di backend — hanya add & remove)
// ════════════════════════════════════════════════════════════════════════
function BlacklistTab({ token, toast }) {
  const [addForm, setAddForm] = useState({ email: "", reason: "", expires_in_hours: "" });
  const [removeEmail, setRemoveEmail] = useState("");
  const [loadingAdd, setLoadingAdd] = useState(false);
  const [loadingRemove, setLoadingRemove] = useState(false);
  const [sessionLog, setSessionLog] = useState([]);

  const handleAdd = async () => {
    if (!addForm.email) { toast("Email wajib diisi", "error"); return; }
    setLoadingAdd(true);
    try {
      const body = {
        email: addForm.email,
        reason: addForm.reason || null,
        expires_in_hours: addForm.expires_in_hours === "" ? null : Number(addForm.expires_in_hours),
        created_by: "admin-panel",
      };
      const res = await apiFetch("/admin/blacklist", { method: "POST", body: JSON.stringify(body) }, token);
      if (res.status) {
        toast("Email berhasil diblacklist!");
        setSessionLog((p) => [{ type: "add", email: addForm.email, at: new Date() }, ...p]);
        setAddForm({ email: "", reason: "", expires_in_hours: "" });
      } else toast(res.message || "Gagal", "error");
    } catch (e) { toast(e.message, "error"); }
    finally { setLoadingAdd(false); }
  };

  const handleRemove = async () => {
    if (!removeEmail) { toast("Email wajib diisi", "error"); return; }
    setLoadingRemove(true);
    try {
      const res = await apiFetch(`/admin/blacklist/${encodeURIComponent(removeEmail)}`, { method: "DELETE" }, token);
      if (res.status) {
        toast("Email dihapus dari blacklist!");
        setSessionLog((p) => [{ type: "remove", email: removeEmail, at: new Date() }, ...p]);
        setRemoveEmail("");
      } else toast(res.message || "Gagal", "error");
    } catch (e) { toast(e.message, "error"); }
    finally { setLoadingRemove(false); }
  };

  return (
    <div className="hkz-blacklist-grid">
      <div className="hkz-card">
        <h3 className="hkz-card-title">Blacklist Email</h3>
        <div className="hkz-notice hkz-notice--danger">Email yang di-blacklist akan dicabut aksesnya dan tidak bisa registrasi ulang dengan email tersebut.</div>
        <div className="hkz-form-col">
          <Field label="Email *">
            <input className="hkz-input" type="email" value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} />
          </Field>
          <Field label="Alasan">
            <input className="hkz-input" value={addForm.reason} onChange={(e) => setAddForm({ ...addForm, reason: e.target.value })} />
          </Field>
          <Field label="Durasi (jam)" hint="Kosong = permanen">
            <input className="hkz-input" type="number" min="1" value={addForm.expires_in_hours} onChange={(e) => setAddForm({ ...addForm, expires_in_hours: e.target.value })} />
          </Field>
          <button onClick={handleAdd} disabled={loadingAdd} className="hkz-btn-primary" style={{ background: "#DC1F2E", boxShadow: "0 4px 16px #DC1F2E33" }}>
            {loadingAdd ? <Spin /> : "Blacklist Email"}
          </button>
        </div>
      </div>

      <div className="hkz-card">
        <h3 className="hkz-card-title">Hapus dari Blacklist</h3>
        <div className="hkz-notice">Backend tidak menyediakan endpoint daftar blacklist, jadi hapus dilakukan langsung lewat email.</div>
        <div className="hkz-form-col">
          <Field label="Email *">
            <input className="hkz-input" type="email" value={removeEmail} onChange={(e) => setRemoveEmail(e.target.value)} />
          </Field>
          <button onClick={handleRemove} disabled={loadingRemove} className="hkz-btn-primary" style={{ background: "#22c55e", boxShadow: "0 4px 16px #22c55e33" }}>
            {loadingRemove ? <Spin /> : "Hapus dari Blacklist"}
          </button>
        </div>

        {sessionLog.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div className="hkz-card-subtitle">Aktivitas Sesi Ini</div>
            <div className="hkz-form-col" style={{ gap: 6 }}>
              {sessionLog.map((l, i) => (
                <div key={i} className="hkz-session-log-item">
                  <span className={l.type === "add" ? "hkz-badge hkz-badge--red" : "hkz-badge hkz-badge--green"}>
                    {l.type === "add" ? "Blacklist" : "Dihapus"}
                  </span>
                  <span className="hkz-mono">{l.email}</span>
                  <span className="hkz-subtext">{fmtDate(l.at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// TAB: LOGS
// ════════════════════════════════════════════════════════════════════════
function LogsTab({ token, toast }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState("");
  const [limit, setLimit] = useState(50);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit });
      if (action) params.set("action", action);
      const res = await apiFetch(`/admin/logs/recent?${params}`, {}, token);
      if (res.status) setLogs(res.data || []);
      else toast(res.message || "Gagal ambil log", "error");
    } catch (e) { toast(e.message, "error"); }
    finally { setLoading(false); }
  }, [token, action, limit]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <div className="hkz-card">
      <div className="hkz-filters">
        <input className="hkz-input hkz-input--sm" placeholder="Filter action (login, purchase_show_created, ...)" value={action} onChange={(e) => setAction(e.target.value)} />
        <select className="hkz-input hkz-input--sm" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
          <option value={20}>20</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
          <option value={200}>200</option>
        </select>
        <button className="hkz-btn-ghost" onClick={fetchLogs}>↻ Refresh</button>
      </div>

      {loading ? (
        <div className="hkz-loading"><Spin xl /></div>
      ) : logs.length === 0 ? (
        <div className="hkz-empty">Tidak ada log</div>
      ) : (
        <div className="hkz-log-list">
          {logs.map((l) => (
            <div key={l.id} className="hkz-log-item">
              <span className={`hkz-badge ${l.status === "success" ? "hkz-badge--green" : "hkz-badge--red"}`}>{l.action}</span>
              <div className="hkz-log-item-body">
                <div className="hkz-mono">{l.code || l.user_id || "—"}</div>
                {l.error_message && <div className="hkz-log-error">{l.error_message}</div>}
                <div className="hkz-subtext">IP: {l.ip || "—"}</div>
              </div>
              <span className="hkz-subtext hkz-nowrap">{fmtDate(l.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════
const TABS = [
  { key: "orders",    label: "Orders" },
  { key: "access",    label: "Akses" },
  { key: "plans",     label: "Plans" },
  { key: "shows",     label: "Shows" },
  { key: "blacklist", label: "Blacklist" },
  { key: "logs",      label: "Log" },
];

export default function AdminHarukaze() {
  const { toasts, add: toast } = useToast();
  const [token, setToken] = useState(null);
  const [adminUser, setAdminUser] = useState(null);
  const [tab, setTab] = useState("orders");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const t = sessionStorage.getItem("hkz_token");
    const u = sessionStorage.getItem("hkz_user");
    if (t && u) {
      setToken(t);
      setAdminUser(JSON.parse(u));
    }
    setChecking(false);
  }, []);

  const handleLogout = async () => {
    if (!confirm("Yakin ingin logout?")) return;
    try { await apiFetch("/auth/logout", { method: "POST" }, token); } catch {}
    sessionStorage.removeItem("hkz_token");
    sessionStorage.removeItem("hkz_refresh");
    sessionStorage.removeItem("hkz_user");
    setToken(null);
    setAdminUser(null);
  };

  if (checking) {
    return (
      <>
        <style>{styles}</style>
        <div className="hkz-loading" style={{ minHeight: "100vh" }}><Spin xl /></div>
      </>
    );
  }

  if (!token) {
    return (
      <>
        <style>{styles}</style>
        <LoginScreen onLoggedIn={(t, u) => { setToken(t); setAdminUser(u); }} toast={toast} />
        <ToastContainer toasts={toasts} />
      </>
    );
  }

  return (
    <>
      <style>{styles}</style>

      <header className="hkz-header">
        <div className="hkz-header-left">
          <div className="hkz-brand-icon sm">風</div>
          <span className="hkz-header-title">Harukaze48</span>
          <span className="hkz-admin-badge">ADMIN</span>
        </div>
        <div className="hkz-header-right">
          <span className="hkz-header-user">{adminUser?.username}</span>
          <button onClick={handleLogout} className="hkz-btn-outline">Logout</button>
        </div>
      </header>

      <div className="hkz-page">
        <div className="hkz-tabs">
          {TABS.map((t) => (
            <button key={t.key} className={`hkz-tab ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "orders"    && <OrdersTab    token={token} toast={toast} />}
        {tab === "access"    && <AccessTab    token={token} toast={toast} />}
        {tab === "plans"     && <PlansTab     token={token} toast={toast} />}
        {tab === "shows"     && <ShowsTab     token={token} toast={toast} />}
        {tab === "blacklist" && <BlacklistTab token={token} toast={toast} />}
        {tab === "logs"      && <LogsTab      token={token} toast={toast} />}
      </div>

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
  @keyframes spin     { to { transform: rotate(360deg); } }
  @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }

  body { background: var(--bg); font-family: var(--sans); color: var(--txt); min-height: 100vh; }

  /* Toast */
  .hkz-toast-wrap { position: fixed; bottom: 24px; right: 24px; z-index: 9999; display: flex; flex-direction: column; gap: 8px; }
  .hkz-toast {
    color: #fff; padding: 10px 18px; border-radius: 8px; font-size: 13px; font-weight: 600;
    box-shadow: 0 4px 20px #0008; animation: fadeInUp .25s ease; max-width: 320px;
  }
  .hkz-toast--success { background: #22c55e; }
  .hkz-toast--error   { background: #DC1F2E; }
  .hkz-toast--warn    { background: #f59e0b; }

  /* Modal */
  .hkz-modal-bg {
    position: fixed; inset: 0; background: #000000bb; z-index: 1000;
    display: flex; align-items: center; justify-content: center; padding: 16px; backdrop-filter: blur(4px);
  }
  .hkz-modal-card {
    background: var(--bg2); border: 1px solid var(--line); border-radius: 16px;
    width: min(520px, 100%); max-height: 90vh; overflow: auto; animation: fadeInUp .2s ease;
  }
  .hkz-modal-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 20px 24px 16px; border-bottom: 1px solid var(--line);
    position: sticky; top: 0; background: var(--bg2); z-index: 1;
  }
  .hkz-modal-head h3 { font-size: 15px; font-weight: 700; color: var(--txt); }
  .hkz-modal-close { background: none; border: none; color: var(--txt3); font-size: 20px; cursor: pointer; line-height: 1; padding: 0 4px; }
  .hkz-modal-body { padding: 20px 24px 24px; }

  /* Fields */
  .hkz-form-col { display: flex; flex-direction: column; gap: 14px; }
  .hkz-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .hkz-field { display: flex; flex-direction: column; gap: 6px; }
  .hkz-field label { font-size: 11px; font-weight: 600; color: var(--txt3); letter-spacing: 1.2px; text-transform: uppercase; }
  .hkz-field-hint { font-size: 11px; color: var(--txt3); }
  .hkz-input {
    background: var(--bg3); border: 1px solid var(--line); border-radius: 8px;
    padding: 9px 12px; color: var(--txt); font-size: 13px; font-family: inherit; outline: none; width: 100%;
    transition: border-color .2s;
  }
  .hkz-input:focus { border-color: var(--accent); }
  .hkz-input--sm { max-width: 200px; }
  .hkz-textarea { resize: vertical; min-height: 60px; }
  .hkz-error-box { background: #DC1F2E18; border: 1px solid #DC1F2E44; color: #ff8080; font-size: 13px; border-radius: 8px; padding: 9px 14px; }

  /* Buttons */
  .hkz-btn-primary {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    background: var(--accent); color: #fff; border: none; border-radius: 8px;
    padding: 10px 18px; font-size: 13px; font-weight: 700; cursor: pointer;
    font-family: inherit; box-shadow: 0 4px 16px var(--accent-glow); transition: opacity .2s;
  }
  .hkz-btn-primary:disabled { opacity: .6; cursor: not-allowed; }
  .hkz-btn-primary--sm { padding: 7px 14px; font-size: 12px; box-shadow: none; }
  .hkz-btn-ghost {
    background: var(--bg3); border: 1px solid var(--line); color: var(--txt2); border-radius: 8px;
    padding: 8px 14px; font-size: 12px; cursor: pointer; font-family: inherit; white-space: nowrap;
  }
  .hkz-btn-outline {
    background: none; border: 1px solid var(--line); color: var(--txt3); border-radius: 8px;
    padding: 7px 14px; font-size: 12px; cursor: pointer; font-family: inherit;
  }
  .hkz-btn-page {
    background: var(--accent-glow); border: 1px solid var(--accent); color: var(--accent);
    font-size: 11px; font-weight: 700; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-family: inherit;
  }
  .hkz-btn-page:disabled { opacity: .35; cursor: not-allowed; }
  .hkz-action-btn {
    font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 6px; cursor: pointer;
    font-family: inherit; white-space: nowrap; border: 1px solid;
  }
  .hkz-action-btn--blue { background: #3b82f618; border-color: #3b82f644; color: #3b82f6; }
  .hkz-action-btn--red  { background: #DC1F2E18; border-color: #DC1F2E44; color: #DC1F2E; }
  .hkz-actions { display: flex; gap: 6px; }

  /* Login */
  .hkz-login-bg { min-height: 100vh; background: var(--bg); display: flex; align-items: center; justify-content: center; padding: 20px; position: relative; overflow: hidden; }
  .hkz-login-glow { position: fixed; inset: 0; pointer-events: none; background: radial-gradient(ellipse 60% 60% at 50% 50%, rgba(167,139,250,0.07) 0%, transparent 70%); }
  .hkz-login-card { position: relative; z-index: 1; width: min(420px, 100%); background: var(--bg2); border: 1px solid var(--line); border-radius: 20px; padding: 36px 32px; box-shadow: 0 32px 80px #00000088; animation: fadeInUp .4s ease; }
  .hkz-login-note { margin-top: 18px; font-size: 11px; color: var(--txt3); line-height: 1.6; }
  .hkz-login-note code { background: var(--bg3); padding: 1px 5px; border-radius: 4px; font-family: var(--mono); }
  .hkz-brand { display: flex; align-items: center; gap: 14px; margin-bottom: 28px; }
  .hkz-brand-icon {
    width: 52px; height: 52px; border-radius: 14px;
    background: linear-gradient(135deg, rgba(167,139,250,0.2), rgba(139,92,246,0.1));
    border: 1px solid rgba(167,139,250,0.3); display: flex; align-items: center; justify-content: center;
    font-size: 22px; font-family: serif; color: var(--accent); flex-shrink: 0;
  }
  .hkz-brand-icon.sm { width: 34px; height: 34px; font-size: 16px; border-radius: 9px; }
  .hkz-brand-name { font-family: var(--display); font-size: 20px; font-weight: 800; color: var(--txt); letter-spacing: -0.3px; }
  .hkz-brand-sub { font-size: 12px; color: var(--txt3); margin-top: 2px; }

  /* Header */
  .hkz-header {
    position: sticky; top: 0; z-index: 200; display: flex; align-items: center; justify-content: space-between;
    padding: 0 24px; min-height: 56px; background: var(--bg2); border-bottom: 1px solid var(--line);
    backdrop-filter: blur(12px); flex-wrap: wrap; gap: 8px;
  }
  .hkz-header-left { display: flex; align-items: center; gap: 10px; }
  .hkz-header-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .hkz-header-title { font-family: var(--display); font-size: 15px; font-weight: 800; letter-spacing: 1px; }
  .hkz-header-user { font-size: 12px; color: var(--txt2); }
  .hkz-admin-badge { background: var(--accent); color: #fff; font-size: 9px; font-weight: 700; letter-spacing: 1.5px; padding: 2px 8px; border-radius: 4px; }

  /* Page */
  .hkz-page { max-width: 1200px; margin: 0 auto; padding: 24px 20px 80px; display: flex; flex-direction: column; gap: 20px; }

  /* Tabs */
  .hkz-tabs { display: flex; gap: 4px; background: var(--bg2); border: 1px solid var(--line); border-radius: 12px; padding: 4px; width: fit-content; overflow-x: auto; max-width: 100%; }
  .hkz-tab { padding: 8px 20px; border-radius: 9px; border: none; background: none; color: var(--txt2); font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--sans); transition: background .2s, color .2s; white-space: nowrap; }
  .hkz-tab.active { background: var(--accent); color: #fff; }
  .hkz-tab:not(.active):hover { color: var(--txt); background: var(--bg3); }

  /* Card */
  .hkz-card { background: var(--bg2); border: 1px solid var(--line); border-radius: 16px; padding: 20px; overflow: hidden; animation: fadeInUp .25s ease; }
  .hkz-card-title { font-size: 14px; font-weight: 700; color: var(--txt); margin-bottom: 12px; }
  .hkz-card-subtitle { font-size: 11px; font-weight: 700; color: var(--txt3); letter-spacing: 1.2px; text-transform: uppercase; margin-bottom: 8px; }

  /* Filters */
  .hkz-filters { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--line); }

  /* Notice */
  .hkz-notice { background: var(--bg3); border: 1px solid var(--line); color: var(--txt2); font-size: 11px; border-radius: 8px; padding: 8px 12px; margin-bottom: 14px; }
  .hkz-notice--danger { background: #DC1F2E18; border-color: #DC1F2E33; color: #ff8080; }

  /* Table */
  .hkz-table-wrap { overflow-x: auto; }
  .hkz-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .hkz-table th {
    text-align: left; padding: 10px 14px; font-size: 10px; font-weight: 700; color: var(--txt3);
    letter-spacing: 1px; text-transform: uppercase; border-bottom: 1px solid var(--line); white-space: nowrap;
  }
  .hkz-table td { padding: 12px 14px; border-bottom: 1px solid var(--line); color: var(--txt); vertical-align: top; }
  .hkz-table tr:hover td { background: var(--bg3); }
  .hkz-mono { font-family: var(--mono); font-size: 12px; }
  .hkz-subtext { color: var(--txt3); font-size: 11px; }
  .hkz-nowrap { white-space: nowrap; }

  /* Badge */
  .hkz-badge { display: inline-flex; align-items: center; font-size: 10px; font-weight: 700; padding: 3px 9px; border-radius: 20px; letter-spacing: .5px; white-space: nowrap; }
  .hkz-badge--green  { background: #22c55e22; color: #22c55e; border: 1px solid #22c55e44; }
  .hkz-badge--red    { background: #DC1F2E22; color: #DC1F2E; border: 1px solid #DC1F2E44; }
  .hkz-badge--amber  { background: #f59e0b22; color: #f59e0b; border: 1px solid #f59e0b44; }
  .hkz-badge--muted  { background: #55555522; color: #888;    border: 1px solid #55555544; }

  /* Loading / Empty */
  .hkz-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 48px 0; color: var(--txt3); }
  .hkz-empty { text-align: center; padding: 48px 0; color: var(--txt3); font-size: 14px; }
  .hkz-spin { width: 16px; height: 16px; border: 2px solid #ffffff22; border-top: 2px solid #fff; border-radius: 50%; animation: spin .7s linear infinite; display: inline-block; }
  .hkz-spin--xl { width: 32px; height: 32px; border-width: 3px; border-top-width: 3px; border-top-color: var(--accent); border-color: var(--bg4); }

  /* Pagination */
  .hkz-pagination { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 16px 0 4px; }

  /* Shows grid */
  .hkz-show-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
  .hkz-show-card { background: var(--bg3); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
  .hkz-show-thumb { width: 100%; height: 120px; object-fit: cover; display: block; }
  .hkz-show-body { padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; }
  .hkz-show-title { font-size: 13px; font-weight: 700; color: var(--txt); }

  /* Blacklist */
  .hkz-blacklist-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .hkz-session-log-item { display: flex; align-items: center; gap: 10px; background: var(--bg3); border-radius: 6px; padding: 6px 10px; font-size: 11px; }

  /* Logs */
  .hkz-log-list { display: flex; flex-direction: column; gap: 6px; max-height: 600px; overflow-y: auto; }
  .hkz-log-item { display: flex; align-items: flex-start; gap: 12px; padding: 10px 14px; background: var(--bg3); border-radius: 8px; font-size: 12px; }
  .hkz-log-item-body { flex: 1; min-width: 0; }
  .hkz-log-error { color: #ff8080; font-size: 11px; }

  /* Responsive */
  @media (max-width: 640px) {
    .hkz-header { padding: 10px 14px; min-height: unset; flex-direction: column; align-items: stretch; gap: 0; }
    .hkz-header-left { padding-bottom: 10px; }
    .hkz-header-right { display: flex; justify-content: space-between; padding-top: 10px; border-top: 1px solid var(--line); width: 100%; }
    .hkz-page { padding: 14px 12px 60px; gap: 14px; }
    .hkz-card { padding: 14px; }
    .hkz-filters { gap: 8px; }
    .hkz-filters input, .hkz-filters select { max-width: 100% !important; font-size: 12px; }
    .hkz-form-row { grid-template-columns: 1fr; }
    .hkz-tabs { width: 100%; }
    .hkz-tab { flex: 1; padding: 8px 10px; font-size: 12px; }
    .hkz-login-card { padding: 24px 20px; }
    .hkz-blacklist-grid { grid-template-columns: 1fr; }
    .hkz-show-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
  }
`;
