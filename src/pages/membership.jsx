import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const API_HARUKAZE  = 'https://v5.jkt48connect.com/api/harukaze';
const POLL_INTERVAL = 5000; // ms

// ── Helpers ───────────────────────────────────────────────────────────────
const fmtRp = (n) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;

const fmtDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};

const fmtCountdown = (msRemaining) => {
  if (msRemaining <= 0) return '00:00';
  const totalSec = Math.floor(msRemaining / 1000);
  const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
  const s = (totalSec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

const daysRemaining = (expiresAt) => {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
};

const parseFeatures = (f) => {
  if (Array.isArray(f)) return f;
  if (typeof f === 'string') {
    try { const p = JSON.parse(f); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
};

const getSession = () => {
  try {
    const d = JSON.parse(sessionStorage.getItem('userLogin') || 'null');
    if (d && d.isLoggedIn && d.token) return d;
    return null;
  } catch { return null; }
};

// ── Icons ─────────────────────────────────────────────────────────────────
const SvgWrap = ({ size = 16, color = 'currentColor', children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    style={{ flexShrink: 0, display: 'block' }}>
    {children}
  </svg>
);
const IClock   = (p) => <SvgWrap {...p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></SvgWrap>;
const ICheck   = (p) => <SvgWrap {...p} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></SvgWrap>;
const IWarning = (p) => <SvgWrap {...p}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></SvgWrap>;
const IX       = (p) => <SvgWrap {...p} strokeWidth="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></SvgWrap>;
const ICopy    = (p) => <SvgWrap {...p}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></SvgWrap>;
const IRefresh = (p) => <SvgWrap {...p}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></SvgWrap>;
const IStar    = (p) => <SvgWrap {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></SvgWrap>;
const ILock    = (p) => <SvgWrap {...p}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></SvgWrap>;

// ══════════════════════════════════════════════════════════════════════════
const BuyMembership = () => {
  const navigate = useNavigate();
  const session  = getSession();

  const [plans,        setPlans]        = useState([]);
  const [activeMembership, setActiveMembership] = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState(false);
  const [buyingCode,   setBuyingCode]   = useState(null);
  const [order,        setOrder]        = useState(null); // { order_id, plan, amount, qr_image, qris_content, expired_at }
  const [payStatus,    setPayStatus]    = useState('pending'); // pending | paid | expired | cancelled | failed
  const [accessCode,   setAccessCode]   = useState(null);
  const [now,          setNow]          = useState(Date.now());
  const [toast,        setToast]        = useState({ show: false, message: '', type: '' });

  const pollRef = useRef(null);
  const tickRef = useRef(null);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: '' }), 3500);
  };

  // ── Load plans (Harukaze) + status membership user ─────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const pRes = await fetch(`${API_HARUKAZE}/membership/plans`);
      const pData = await pRes.json();
      const list = pData.status ? (pData.data || []) : [];
      setPlans([...list].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));

      if (session?.token) {
        try {
          const aRes = await fetch(`${API_HARUKAZE}/access/my`, {
            headers: { Authorization: `Bearer ${session.token}` },
          });
          const aData = await aRes.json();
          if (aData.status) {
            const active = (aData.data || []).find((a) =>
              a.access_type === 'membership' && a.is_active &&
              (!a.expires_at || new Date(a.expires_at) > new Date())
            );
            setActiveMembership(active || null);
          }
        } catch { /* abaikan */ }
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [session?.token]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Tick untuk countdown ─────────────────────────────────────────────────
  useEffect(() => {
    if (!order || payStatus !== 'pending') return;
    tickRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tickRef.current);
  }, [order, payStatus]);

  // ── Poll status pembayaran ────────────────────────────────────────────────
  useEffect(() => {
    if (!order || payStatus !== 'pending') return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_HARUKAZE}/purchase/check/${order.order_id}`, {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        const data = await res.json();
        if (!data.status) return;
        if (data.payment_status === 'paid') {
          setPayStatus('paid');
          setAccessCode(data.data?.access_code || null);
          clearInterval(pollRef.current);
          clearInterval(tickRef.current);
          showToast('Pembayaran berhasil! Membership kamu sudah aktif 🎉', 'success');
          loadData();
        } else if (['expired', 'cancelled', 'failed'].includes(data.payment_status)) {
          setPayStatus(data.payment_status);
          clearInterval(pollRef.current);
          clearInterval(tickRef.current);
        }
      } catch { /* coba lagi di interval berikutnya */ }
    }, POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, [order, payStatus, session?.token, loadData]);

  const closeModal = () => {
    clearInterval(pollRef.current);
    clearInterval(tickRef.current);
    setOrder(null);
    setPayStatus('pending');
    setAccessCode(null);
  };

  const handleBuy = async (plan) => {
    if (!session?.token) {
      showToast('Silakan login terlebih dahulu', 'error');
      navigate('/login');
      return;
    }
    setBuyingCode(plan.plan_code);
    try {
      const res = await fetch(`${API_HARUKAZE}/purchase/membership`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ plan_code: plan.plan_code }),
      });
      const data = await res.json();
      if (data.status) {
        setOrder({
          order_id: data.data.order_id,
          plan: { plan_name: plan.plan_name, duration_days: plan.duration_days },
          amount: data.data.amount,
          formatted_amount: data.data.formatted_amount,
          qr_image: data.data.qr_image,
          qris_content: data.data.qris_content,
          expired_at: data.data.expired_at,
        });
        setPayStatus('pending');
      } else {
        showToast(data.message || 'Gagal membuat order', 'error');
      }
    } catch {
      showToast('Tidak dapat terhubung ke server', 'error');
    } finally {
      setBuyingCode(null);
    }
  };

  const copyQris = () => {
    if (!order?.qris_content) return;
    navigator.clipboard?.writeText(order.qris_content);
    showToast('Kode QRIS disalin');
  };

  const msLeft = order ? Math.max(0, new Date(order.expired_at).getTime() - now) : 0;
  const remainingDays = activeMembership ? daysRemaining(activeMembership.expires_at) : null;

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="bm-loading">
      <div className="bm-spinner" />
      <p>Memuat paket membership...</p>
    </div>
  );

  return (
    <div className="bm-wrapper">
      {toast.show && (
        <div className={`bm-toast bm-toast--${toast.type}`}>
          {toast.type === 'success' ? <ICheck size={15} color="#166534" /> : <IWarning size={15} color="#991b1b" />}
          <span>{toast.message}</span>
        </div>
      )}

      <div className="bm-container">
        <div className="bm-header">
          <div>
            <h1 className="bm-header__title"><IStar size={22} color="#DC1F2E" /> Beli Membership</h1>
            <p className="bm-header__subtitle">Akses semua livestream JKT48 tanpa beli satu-satu</p>
          </div>
          <button className="bm-btn bm-btn--outline bm-btn--sm" onClick={loadData}>
            <IRefresh size={13} color="#7b1c1c" /> Refresh
          </button>
        </div>

        {loadError && (
          <div className="bm-error-banner">
            <IWarning size={16} color="#ff4757" />
            Gagal memuat paket membership. Coba refresh halaman.
          </div>
        )}

        {!session?.token && (
          <div className="bm-login-banner">
            <ILock size={16} color="#f59e0b" />
            <span>Kamu belum login. <a onClick={() => navigate('/login')}>Login</a> untuk bisa membeli membership.</span>
          </div>
        )}

        {activeMembership && (
          <div className="bm-active-banner">
            <div className="bm-active-banner__icon"><IStar size={18} color="#fff" /></div>
            <div className="bm-active-banner__body">
              <p className="bm-active-banner__title">Membership kamu sedang aktif</p>
              <p className="bm-active-banner__meta">
                {activeMembership.label || 'Membership'} · Berakhir {fmtDate(activeMembership.expires_at)} · Sisa {remainingDays} hari
              </p>
            </div>
          </div>
        )}

        {plans.length === 0 && !loadError ? (
          <div className="bm-empty">
            <IStar size={40} color="#d1d5db" />
            <p>Belum ada paket membership tersedia saat ini</p>
          </div>
        ) : (
          <div className="bm-grid">
            {plans.map((p) => {
              const hasDiscount = p.price_sale && p.price_sale < p.price;
              const price = p.price_sale ?? p.price;
              const features = parseFeatures(p.features);

              return (
                <div key={p.plan_code} className={`bm-card ${p.is_popular ? 'bm-card--popular' : ''}`}>
                  {p.is_popular && <span className="bm-card__ribbon"><IStar size={11} color="#fff" /> Populer</span>}

                  <div className="bm-card__body">
                    <h3 className="bm-card__name">{p.plan_name}</h3>
                    <p className="bm-card__duration">{p.duration_days} hari akses penuh</p>

                    <div className="bm-card__price-row">
                      {hasDiscount && <span className="bm-card__price-strike">{fmtRp(p.price)}</span>}
                      <span className="bm-card__price-main">{fmtRp(price)}</span>
                    </div>

                    {p.description && <p className="bm-card__desc">{p.description}</p>}

                    {features.length > 0 && (
                      <ul className="bm-card__features">
                        {features.map((f, i) => (
                          <li key={i}><ICheck size={13} color="#4ade80" /> <span>{f}</span></li>
                        ))}
                      </ul>
                    )}

                    <button
                      className={`bm-btn bm-btn--full ${p.is_popular ? 'bm-btn--primary' : 'bm-btn--outline'}`}
                      disabled={buyingCode === p.plan_code}
                      onClick={() => handleBuy(p)}
                    >
                      {buyingCode === p.plan_code ? 'Memproses...' : activeMembership ? 'Perpanjang' : 'Beli Sekarang'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── MODAL PEMBAYARAN ─────────────────────────────────────────────── */}
      {order && (
        <div className="bm-modal-backdrop" onClick={(e) => e.target === e.currentTarget && payStatus !== 'pending' && closeModal()}>
          <div className="bm-modal">
            <button className="bm-modal__close" onClick={closeModal}><IX size={16} color="rgba(255,255,255,0.6)" /></button>

            {payStatus === 'pending' && (
              <>
                <h2 className="bm-modal__title">Scan untuk Bayar</h2>
                <p className="bm-modal__plan">{order.plan.plan_name} · {order.plan.duration_days} hari</p>
                <div className="bm-modal__qr-wrap">
                  <img src={order.qr_image} alt="QRIS" className="bm-modal__qr" />
                </div>
                <p className="bm-modal__amount">{order.formatted_amount || fmtRp(order.amount)}</p>
                <button className="bm-btn bm-btn--outline bm-btn--sm bm-btn--full" onClick={copyQris}>
                  <ICopy size={13} color="#7b1c1c" /> Salin Kode QRIS
                </button>
                <div className="bm-modal__countdown">
                  <IClock size={13} color="#f59e0b" />
                  Berakhir dalam <strong>{fmtCountdown(msLeft)}</strong>
                </div>
                <p className="bm-modal__hint">Halaman ini otomatis memeriksa status pembayaran setiap beberapa detik...</p>
              </>
            )}

            {payStatus === 'paid' && (
              <div className="bm-modal__result">
                <div className="bm-modal__result-icon bm-modal__result-icon--success"><ICheck size={28} color="#fff" /></div>
                <h2 className="bm-modal__title">Pembayaran Berhasil!</h2>
                <p className="bm-modal__plan">{order.plan.plan_name}</p>
                {accessCode && (
                  <div className="bm-modal__code">
                    <span>Kode Akses</span>
                    <strong>{accessCode}</strong>
                  </div>
                )}
                <button className="bm-btn bm-btn--primary bm-btn--full" onClick={closeModal}>Selesai</button>
              </div>
            )}

            {(payStatus === 'expired' || payStatus === 'cancelled' || payStatus === 'failed') && (
              <div className="bm-modal__result">
                <div className="bm-modal__result-icon bm-modal__result-icon--error"><IX size={28} color="#fff" /></div>
                <h2 className="bm-modal__title">
                  {payStatus === 'expired' ? 'Pembayaran Kedaluwarsa' : payStatus === 'cancelled' ? 'Pembayaran Dibatalkan' : 'Pembayaran Gagal'}
                </h2>
                <p className="bm-modal__hint">Silakan coba beli membership lagi.</p>
                <button className="bm-btn bm-btn--outline bm-btn--full" onClick={closeModal}>Tutup</button>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        .bm-wrapper {
          min-height: 100vh;
          background-color: #0a0a0f;
          background-image: radial-gradient(circle at 100% 0%, rgba(220, 31, 46, 0.1) 0%, transparent 50%);
          padding: 24px 16px 64px;
          box-sizing: border-box;
          font-family: 'Inter', sans-serif;
          color: rgba(255,255,255,0.85);
        }
        .bm-container { max-width: 1200px; margin: 0 auto; }

        /* Loading */
        .bm-loading {
          min-height: 100vh; display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 14px;
          background: #0a0a0f; color: rgba(255,255,255,0.8);
        }
        .bm-spinner {
          width: 44px; height: 44px;
          border: 3px solid rgba(220, 31, 46, 0.2);
          border-top-color: #DC1F2E; border-radius: 50%;
          animation: bmSpin 0.75s linear infinite;
        }
        @keyframes bmSpin { to { transform: rotate(360deg); } }

        /* Header */
        .bm-header {
          display: flex; align-items: flex-start; justify-content: space-between;
          gap: 12px; margin-bottom: 20px; flex-wrap: wrap;
        }
        .bm-header__title {
          display: flex; align-items: center; gap: 10px;
          margin: 0 0 6px; font-size: 1.5rem; font-weight: 800; color: white;
        }
        .bm-header__subtitle { margin: 0; color: rgba(255,255,255,0.5); font-size: 13px; }

        /* Banners */
        .bm-error-banner, .bm-login-banner {
          display: flex; align-items: center; gap: 10px;
          padding: 12px 16px; border-radius: 12px; font-size: 13px;
          margin-bottom: 16px;
        }
        .bm-error-banner {
          background: rgba(220, 31, 46, 0.1); border: 1px solid rgba(220, 31, 46, 0.25); color: #ff4757;
        }
        .bm-login-banner {
          background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.25); color: #fbbf24;
        }
        .bm-login-banner a { color: #fff; text-decoration: underline; cursor: pointer; font-weight: 700; }

        .bm-active-banner {
          display: flex; align-items: center; gap: 12px;
          background: linear-gradient(135deg, rgba(220,31,46,0.14), rgba(255,71,87,0.06));
          border: 1px solid rgba(220,31,46,0.3);
          border-radius: 14px; padding: 14px 18px; margin-bottom: 20px;
        }
        .bm-active-banner__icon {
          width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
          background: linear-gradient(135deg, #DC1F2E, #ff4757);
          display: flex; align-items: center; justify-content: center;
        }
        .bm-active-banner__title { margin: 0; font-size: 13.5px; font-weight: 700; color: white; }
        .bm-active-banner__meta { margin: 2px 0 0; font-size: 12px; color: rgba(255,255,255,0.55); }

        /* Grid & Cards */
        .bm-grid {
          display: grid; gap: 20px;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        }
        .bm-card {
          position: relative;
          background: rgba(12, 12, 18, 0.85);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 18px;
          overflow: hidden;
          display: flex; flex-direction: column;
          transition: transform 0.25s ease, box-shadow 0.25s ease, border-color .25s ease;
        }
        .bm-card:hover { transform: translateY(-3px); box-shadow: 0 16px 32px rgba(0,0,0,0.35); }
        .bm-card--popular {
          border-color: rgba(220, 31, 46, 0.5);
          box-shadow: 0 0 0 1px rgba(220,31,46,0.2), 0 16px 40px rgba(220,31,46,0.12);
        }
        .bm-card__ribbon {
          position: absolute; top: 14px; right: -32px;
          background: linear-gradient(135deg, #DC1F2E, #ff4757);
          color: white; font-size: 10px; font-weight: 800;
          padding: 4px 40px; transform: rotate(40deg);
          display: flex; align-items: center; gap: 4px; justify-content: center;
          letter-spacing: 0.4px; box-shadow: 0 4px 10px rgba(220,31,46,0.4);
        }
        .bm-card__body { padding: 22px 20px; display: flex; flex-direction: column; gap: 10px; flex: 1; }
        .bm-card__name { margin: 0; font-size: 17px; font-weight: 800; color: white; }
        .bm-card__duration { margin: 0; font-size: 12px; color: rgba(255,255,255,0.45); }
        .bm-card__price-row { display: flex; align-items: baseline; gap: 8px; margin: 6px 0 2px; }
        .bm-card__price-strike { font-size: 13px; color: rgba(255,255,255,0.35); text-decoration: line-through; }
        .bm-card__price-main { font-size: 26px; font-weight: 900; color: #DC1F2E; }
        .bm-card__desc { margin: 0; font-size: 12.5px; color: rgba(255,255,255,0.5); line-height: 1.55; }
        .bm-card__features { list-style: none; margin: 4px 0 8px; padding: 0; display: flex; flex-direction: column; gap: 8px; }
        .bm-card__features li { display: flex; align-items: flex-start; gap: 8px; font-size: 12.5px; color: rgba(255,255,255,0.75); line-height: 1.4; }
        .bm-card__features li svg { margin-top: 2px; flex-shrink: 0; }

        /* Empty */
        .bm-empty {
          display: flex; flex-direction: column; align-items: center; gap: 12px;
          padding: 60px 20px; color: rgba(255,255,255,0.3); font-size: 14px;
        }

        /* Toast */
        .bm-toast {
          position: fixed; top: 20px; right: 20px; z-index: 9999;
          display: flex; align-items: center; gap: 10px;
          padding: 12px 16px; border-radius: 12px;
          font-weight: 600; font-size: 13px; max-width: 380px;
          box-shadow: 0 16px 40px rgba(0,0,0,0.5);
          animation: bmSlide 0.35s cubic-bezier(.68,-.55,.265,1.55);
          backdrop-filter: blur(12px);
        }
        @keyframes bmSlide { from { transform: translateX(110%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .bm-toast--success { background: rgba(22, 163, 74, 0.15); border: 1px solid rgba(22, 163, 74, 0.3); color: #4ade80; }
        .bm-toast--error   { background: rgba(220, 31, 46, 0.15); border: 1px solid rgba(220, 31, 46, 0.3); color: #ff4757; }

        /* Buttons */
        .bm-btn {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          padding: 10px 18px; border-radius: 10px; border: none;
          font-size: 13px; font-weight: 700; cursor: pointer;
          transition: all 0.2s; font-family: inherit; letter-spacing: 0.2px;
        }
        .bm-btn:hover:not(:disabled) { transform: translateY(-1px); }
        .bm-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .bm-btn--primary { background: linear-gradient(135deg, #DC1F2E, #ff4757); color: white; box-shadow: 0 4px 14px rgba(220, 31, 46, 0.3); }
        .bm-btn--primary:hover:not(:disabled) { box-shadow: 0 6px 18px rgba(220, 31, 46, 0.45); }
        .bm-btn--outline { background: rgba(255,255,255,0.05); color: white; border: 1px solid rgba(255,255,255,0.12); }
        .bm-btn--outline:hover:not(:disabled) { background: rgba(255,255,255,0.1); }
        .bm-btn--sm { padding: 8px 14px; font-size: 12px; border-radius: 8px; }
        .bm-btn--full { width: 100%; }

        /* Modal */
        .bm-modal-backdrop {
          position: fixed; inset: 0; z-index: 9998;
          background: rgba(0,0,0,0.7); backdrop-filter: blur(6px);
          display: flex; align-items: center; justify-content: center;
          padding: 20px; box-sizing: border-box;
          animation: bmFadeIn 0.2s ease-out;
        }
        @keyframes bmFadeIn { from { opacity: 0; } to { opacity: 1; } }
        .bm-modal {
          position: relative;
          width: 100%; max-width: 380px;
          background: #121218;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          padding: 28px 24px 24px;
          box-shadow: 0 24px 64px rgba(0,0,0,0.5);
          text-align: center;
          animation: bmModalUp 0.3s cubic-bezier(0.16,1,0.3,1);
        }
        @keyframes bmModalUp { from { opacity: 0; transform: translateY(20px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .bm-modal__close {
          position: absolute; top: 14px; right: 14px;
          background: rgba(255,255,255,0.06); border: none; border-radius: 8px;
          width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
          cursor: pointer;
        }
        .bm-modal__close:hover { background: rgba(255,255,255,0.12); }
        .bm-modal__title { margin: 0 0 4px; font-size: 1.15rem; font-weight: 800; color: white; }
        .bm-modal__plan { margin: 0 0 16px; font-size: 12.5px; color: rgba(255,255,255,0.5); }
        .bm-modal__qr-wrap {
          background: white; border-radius: 14px; padding: 14px;
          display: inline-flex; margin-bottom: 14px;
        }
        .bm-modal__qr { width: 200px; height: 200px; display: block; }
        .bm-modal__amount { font-size: 1.5rem; font-weight: 900; color: #DC1F2E; margin: 0 0 14px; }
        .bm-modal__countdown {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          margin-top: 14px; font-size: 12.5px; color: rgba(255,255,255,0.6);
        }
        .bm-modal__countdown strong { color: #f59e0b; font-family: monospace; font-size: 14px; }
        .bm-modal__hint { margin: 12px 0 0; font-size: 11px; color: rgba(255,255,255,0.35); line-height: 1.5; }

        .bm-modal__result { display: flex; flex-direction: column; align-items: center; gap: 4px; }
        .bm-modal__result-icon {
          width: 60px; height: 60px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center; margin-bottom: 10px;
        }
        .bm-modal__result-icon--success { background: linear-gradient(135deg, #16a34a, #22c55e); }
        .bm-modal__result-icon--error   { background: linear-gradient(135deg, #dc2626, #ef4444); }
        .bm-modal__code {
          display: flex; flex-direction: column; gap: 4px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px; padding: 14px 20px; margin: 14px 0 20px; width: 100%; box-sizing: border-box;
        }
        .bm-modal__code span { font-size: 11px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.5px; }
        .bm-modal__code strong { font-size: 1.3rem; font-weight: 900; color: #4ade80; font-family: monospace; letter-spacing: 1px; }

        /* Responsive */
        @media (max-width: 640px) {
          .bm-wrapper { padding: 16px 12px 48px; }
          .bm-grid { grid-template-columns: 1fr; gap: 14px; }
          .bm-card__body { padding: 18px 16px; }
          .bm-card__price-main { font-size: 22px; }
          .bm-header__title { font-size: 1.25rem; }
          .bm-active-banner { flex-direction: row; align-items: flex-start; }
          .bm-modal { padding: 22px 18px 20px; }
          .bm-modal__qr { width: 170px; height: 170px; }
        }
      `}</style>
    </div>
  );
};

export default BuyMembership;
