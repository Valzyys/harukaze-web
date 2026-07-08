import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const API_IDN       = 'https://v5.jkt48connect.com/api/jkt48/idnplus?apikey=JKTCONNECT';
const API_HARUKAZE   = 'https://v5.jkt48connect.com/api/harukaze';
const POLL_INTERVAL  = 5000; // ms

// ── Helpers ───────────────────────────────────────────────────────────────
const fmtRp = (n) => `Rp ${Number(n || 0).toLocaleString('id-ID')}`;

const fmtSchedule = (unixSeconds) => {
  if (!unixSeconds) return '—';
  const d = new Date(unixSeconds * 1000);
  return d.toLocaleString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  }) + ' WIB';
};

const fmtCountdown = (msRemaining) => {
  if (msRemaining <= 0) return '00:00';
  const totalSec = Math.floor(msRemaining / 1000);
  const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
  const s = (totalSec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
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
const IClock    = (p) => <SvgWrap {...p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></SvgWrap>;
const ICheck    = (p) => <SvgWrap {...p} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></SvgWrap>;
const IWarning  = (p) => <SvgWrap {...p}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></SvgWrap>;
const IX        = (p) => <SvgWrap {...p} strokeWidth="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></SvgWrap>;
const ICopy     = (p) => <SvgWrap {...p}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></SvgWrap>;
const IRefresh  = (p) => <SvgWrap {...p}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></SvgWrap>;
const ITicket   = (p) => <SvgWrap {...p}><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/><line x1="13" y1="5" x2="13" y2="19" strokeDasharray="2 3"/></SvgWrap>;
const ILock     = (p) => <SvgWrap {...p}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></SvgWrap>;

// ══════════════════════════════════════════════════════════════════════════
const BuyShowAccess = () => {
  const navigate = useNavigate();
  const session  = getSession();

  const [shows,      setShows]      = useState([]);
  const [myAccess,   setMyAccess]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [loadError,  setLoadError]  = useState(false);
  const [buyingCode, setBuyingCode] = useState(null);
  const [order,      setOrder]      = useState(null); // { order_id, show, amount, qr_image, qris_content, expired_at }
  const [payStatus,  setPayStatus]  = useState('pending'); // pending | paid | expired | cancelled | failed
  const [accessCode, setAccessCode] = useState(null);
  const [now,        setNow]        = useState(Date.now());
  const [toast,      setToast]      = useState({ show: false, message: '', type: '' });

  const pollRef = useRef(null);
  const tickRef = useRef(null);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: '' }), 3500);
  };

  // ── Load shows (IDN Plus) + harukaze catalog + owned access ────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const idnRes = await fetch(API_IDN);
      const idnData = await idnRes.json();
      const idnShows = idnData?.status === 200 ? (idnData.data || []) : [];

      let harukazeShows = [];
      try {
        const hRes = await fetch(`${API_HARUKAZE}/shows`);
        const hData = await hRes.json();
        if (hData.status) harukazeShows = hData.data || [];
      } catch { /* katalog harga opsional */ }

      const merged = idnShows.map((s) => {
        const match = harukazeShows.find((h) => h.show_code === s.showId);
        return { ...s, harukaze: match || null };
      });
      setShows(merged);

      if (session?.token) {
        try {
          const aRes = await fetch(`${API_HARUKAZE}/access/my`, {
            headers: { Authorization: `Bearer ${session.token}` },
          });
          const aData = await aRes.json();
          if (aData.status) setMyAccess(aData.data || []);
        } catch { /* abaikan */ }
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [session?.token]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Tick untuk countdown ────────────────────────────────────────────────
  useEffect(() => {
    if (!order || payStatus !== 'pending') return;
    tickRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tickRef.current);
  }, [order, payStatus]);

  // ── Poll status pembayaran ───────────────────────────────────────────────
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
          showToast('Pembayaran berhasil! Akses show sudah aktif 🎉', 'success');
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

  const hasAccess = (showCode) => myAccess.some((a) => {
    if (!a.is_active) return false;
    if (a.expires_at && new Date(a.expires_at) < new Date()) return false;
    return a.access_type === 'membership' || (a.access_type === 'pershow' && a.show_code === showCode);
  });

  const closeModal = () => {
    clearInterval(pollRef.current);
    clearInterval(tickRef.current);
    setOrder(null);
    setPayStatus('pending');
    setAccessCode(null);
  };

  const handleBuy = async (show) => {
    if (!session?.token) {
      showToast('Silakan login terlebih dahulu', 'error');
      navigate('/login');
      return;
    }
    if (!show.harukaze) {
      showToast('Show ini belum tersedia untuk dibeli', 'error');
      return;
    }
    setBuyingCode(show.showId);
    try {
      const res = await fetch(`${API_HARUKAZE}/purchase/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ show_code: show.showId }),
      });
      const data = await res.json();
      if (data.status) {
        setOrder({
          order_id: data.data.order_id,
          show: { title: show.title, image_url: show.image_url },
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

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="ba-loading">
      <div className="ba-spinner" />
      <p>Memuat daftar show...</p>
    </div>
  );

  return (
    <div className="ba-wrapper">
      {toast.show && (
        <div className={`ba-toast ba-toast--${toast.type}`}>
          {toast.type === 'success' ? <ICheck size={15} color="#166534" /> : <IWarning size={15} color="#991b1b" />}
          <span>{toast.message}</span>
        </div>
      )}

      <div className="ba-container">
        <div className="ba-header">
          <div>
            <h1 className="ba-header__title"><ITicket size={22} color="#DC1F2E" /> Beli Akses Show</h1>
            <p className="ba-header__subtitle">Pilih show JKT48 yang ingin kamu tonton</p>
          </div>
          <button className="ba-btn ba-btn--outline ba-btn--sm" onClick={loadData}>
            <IRefresh size={13} color="#7b1c1c" /> Refresh
          </button>
        </div>

        {loadError && (
          <div className="ba-error-banner">
            <IWarning size={16} color="#ff4757" />
            Gagal memuat daftar show. Coba refresh halaman.
          </div>
        )}

        {!session?.token && (
          <div className="ba-login-banner">
            <ILock size={16} color="#f59e0b" />
            <span>Kamu belum login. <a onClick={() => navigate('/login')}>Login</a> untuk bisa membeli akses show.</span>
          </div>
        )}

        {shows.length === 0 && !loadError ? (
          <div className="ba-empty">
            <ITicket size={40} color="#d1d5db" />
            <p>Belum ada show yang tersedia saat ini</p>
          </div>
        ) : (
          <div className="ba-grid">
            {shows.map((s) => {
              const owned = hasAccess(s.showId);
              const available = Boolean(s.harukaze);
              const price = s.harukaze ? (s.harukaze.price_sale ?? s.harukaze.price) : null;
              const hasDiscount = s.harukaze?.price_sale && s.harukaze.price_sale < s.harukaze.price;

              return (
                <div key={s.slug} className="ba-card">
                  <div className="ba-card__image-wrap">
                    <img src={s.image_url} alt={s.title} className="ba-card__image" loading="lazy" />
                    <span className="ba-card__category">{s.category?.name || 'JKT48'}</span>
                    {owned && (
                      <span className="ba-card__owned"><ICheck size={11} color="#fff" /> Dimiliki</span>
                    )}
                  </div>
                  <div className="ba-card__body">
                    <h3 className="ba-card__title">{s.title}</h3>
                    <div className="ba-card__meta">
                      <IClock size={12} color="rgba(255,255,255,0.4)" />
                      <span>{fmtSchedule(s.scheduled_at)}</span>
                    </div>
                    {s.idnliveplus?.description && (
                      <p className="ba-card__desc">{s.idnliveplus.description}</p>
                    )}
                    <div className="ba-card__footer">
                      <div className="ba-card__price">
                        {available ? (
                          <>
                            {hasDiscount && (
                              <span className="ba-card__price-strike">{fmtRp(s.harukaze.price)}</span>
                            )}
                            <span className="ba-card__price-main">{fmtRp(price)}</span>
                          </>
                        ) : (
                          <span className="ba-card__price-unavailable">Belum tersedia</span>
                        )}
                      </div>
                      <button
                        className={`ba-btn ba-btn--sm ${owned ? 'ba-btn--owned' : 'ba-btn--primary'}`}
                        disabled={!available || owned || buyingCode === s.showId}
                        onClick={() => handleBuy(s)}
                      >
                        {owned ? <><ICheck size={13} color="#4ade80" /> Dimiliki</>
                          : buyingCode === s.showId ? 'Memproses...'
                          : available ? 'Beli Akses' : 'N/A'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── MODAL PEMBAYARAN ─────────────────────────────────────────────── */}
      {order && (
        <div className="ba-modal-backdrop" onClick={(e) => e.target === e.currentTarget && payStatus !== 'pending' && closeModal()}>
          <div className="ba-modal">
            <button className="ba-modal__close" onClick={closeModal}><IX size={16} color="rgba(255,255,255,0.6)" /></button>

            {payStatus === 'pending' && (
              <>
                <h2 className="ba-modal__title">Scan untuk Bayar</h2>
                <p className="ba-modal__show">{order.show.title}</p>
                <div className="ba-modal__qr-wrap">
                  <img src={order.qr_image} alt="QRIS" className="ba-modal__qr" />
                </div>
                <p className="ba-modal__amount">{order.formatted_amount || fmtRp(order.amount)}</p>
                <button className="ba-btn ba-btn--outline ba-btn--sm ba-btn--full" onClick={copyQris}>
                  <ICopy size={13} color="#7b1c1c" /> Salin Kode QRIS
                </button>
                <div className="ba-modal__countdown">
                  <IClock size={13} color="#f59e0b" />
                  Berakhir dalam <strong>{fmtCountdown(msLeft)}</strong>
                </div>
                <p className="ba-modal__hint">Halaman ini otomatis memeriksa status pembayaran setiap beberapa detik...</p>
              </>
            )}

            {payStatus === 'paid' && (
              <div className="ba-modal__result">
                <div className="ba-modal__result-icon ba-modal__result-icon--success"><ICheck size={28} color="#fff" /></div>
                <h2 className="ba-modal__title">Pembayaran Berhasil!</h2>
                <p className="ba-modal__show">{order.show.title}</p>
                {accessCode && (
                  <div className="ba-modal__code">
                    <span>Kode Akses</span>
                    <strong>{accessCode}</strong>
                  </div>
                )}
                <button className="ba-btn ba-btn--primary ba-btn--full" onClick={closeModal}>Selesai</button>
              </div>
            )}

            {(payStatus === 'expired' || payStatus === 'cancelled' || payStatus === 'failed') && (
              <div className="ba-modal__result">
                <div className="ba-modal__result-icon ba-modal__result-icon--error"><IX size={28} color="#fff" /></div>
                <h2 className="ba-modal__title">
                  {payStatus === 'expired' ? 'Pembayaran Kedaluwarsa' : payStatus === 'cancelled' ? 'Pembayaran Dibatalkan' : 'Pembayaran Gagal'}
                </h2>
                <p className="ba-modal__hint">Silakan coba beli akses lagi.</p>
                <button className="ba-btn ba-btn--outline ba-btn--full" onClick={closeModal}>Tutup</button>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        .ba-wrapper {
          min-height: 100vh;
          background-color: #0a0a0f;
          background-image: radial-gradient(circle at 100% 0%, rgba(220, 31, 46, 0.1) 0%, transparent 50%);
          padding: 24px 16px 64px;
          box-sizing: border-box;
          font-family: 'Inter', sans-serif;
          color: rgba(255,255,255,0.85);
        }
        .ba-container { max-width: 1200px; margin: 0 auto; }

        /* Loading */
        .ba-loading {
          min-height: 100vh; display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 14px;
          background: #0a0a0f; color: rgba(255,255,255,0.8);
        }
        .ba-spinner {
          width: 44px; height: 44px;
          border: 3px solid rgba(220, 31, 46, 0.2);
          border-top-color: #DC1F2E; border-radius: 50%;
          animation: baSpin 0.75s linear infinite;
        }
        @keyframes baSpin { to { transform: rotate(360deg); } }

        /* Header */
        .ba-header {
          display: flex; align-items: flex-start; justify-content: space-between;
          gap: 12px; margin-bottom: 20px; flex-wrap: wrap;
        }
        .ba-header__title {
          display: flex; align-items: center; gap: 10px;
          margin: 0 0 6px; font-size: 1.5rem; font-weight: 800; color: white;
        }
        .ba-header__subtitle { margin: 0; color: rgba(255,255,255,0.5); font-size: 13px; }

        /* Banners */
        .ba-error-banner, .ba-login-banner {
          display: flex; align-items: center; gap: 10px;
          padding: 12px 16px; border-radius: 12px; font-size: 13px;
          margin-bottom: 18px;
        }
        .ba-error-banner {
          background: rgba(220, 31, 46, 0.1); border: 1px solid rgba(220, 31, 46, 0.25); color: #ff4757;
        }
        .ba-login-banner {
          background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.25); color: #fbbf24;
        }
        .ba-login-banner a { color: #fff; text-decoration: underline; cursor: pointer; font-weight: 700; }

        /* Grid & Cards */
        .ba-grid {
          display: grid; gap: 18px;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        }
        .ba-card {
          background: rgba(12, 12, 18, 0.85);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 16px;
          overflow: hidden;
          display: flex; flex-direction: column;
          transition: transform 0.25s ease, box-shadow 0.25s ease;
        }
        .ba-card:hover { transform: translateY(-3px); box-shadow: 0 16px 32px rgba(0,0,0,0.35); }
        .ba-card__image-wrap { position: relative; width: 100%; aspect-ratio: 16/9; overflow: hidden; background: #1a1a22; }
        .ba-card__image { width: 100%; height: 100%; object-fit: cover; display: block; }
        .ba-card__category {
          position: absolute; top: 10px; left: 10px;
          background: rgba(0,0,0,0.6); backdrop-filter: blur(6px);
          color: white; font-size: 10px; font-weight: 700;
          padding: 4px 10px; border-radius: 20px; letter-spacing: 0.4px;
        }
        .ba-card__owned {
          position: absolute; top: 10px; right: 10px;
          background: rgba(22, 163, 74, 0.9);
          color: white; font-size: 10px; font-weight: 800;
          padding: 4px 10px; border-radius: 20px;
          display: flex; align-items: center; gap: 4px;
        }
        .ba-card__body { padding: 16px; display: flex; flex-direction: column; gap: 8px; flex: 1; }
        .ba-card__title {
          margin: 0; font-size: 14px; font-weight: 700; color: white; line-height: 1.4;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .ba-card__meta {
          display: flex; align-items: center; gap: 6px;
          font-size: 11.5px; color: rgba(255,255,255,0.45);
        }
        .ba-card__desc {
          margin: 0; font-size: 12px; color: rgba(255,255,255,0.5); line-height: 1.5;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
          white-space: pre-line;
        }
        .ba-card__footer {
          margin-top: auto; padding-top: 10px;
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          border-top: 1px solid rgba(255,255,255,0.05);
        }
        .ba-card__price { display: flex; flex-direction: column; gap: 1px; }
        .ba-card__price-strike { font-size: 10.5px; color: rgba(255,255,255,0.35); text-decoration: line-through; }
        .ba-card__price-main { font-size: 14px; font-weight: 800; color: #DC1F2E; }
        .ba-card__price-unavailable { font-size: 11.5px; color: rgba(255,255,255,0.35); font-style: italic; }

        /* Empty */
        .ba-empty {
          display: flex; flex-direction: column; align-items: center; gap: 12px;
          padding: 60px 20px; color: rgba(255,255,255,0.3); font-size: 14px;
        }

        /* Toast */
        .ba-toast {
          position: fixed; top: 20px; right: 20px; z-index: 9999;
          display: flex; align-items: center; gap: 10px;
          padding: 12px 16px; border-radius: 12px;
          font-weight: 600; font-size: 13px; max-width: 380px;
          box-shadow: 0 16px 40px rgba(0,0,0,0.5);
          animation: baSlide 0.35s cubic-bezier(.68,-.55,.265,1.55);
          backdrop-filter: blur(12px);
        }
        @keyframes baSlide { from { transform: translateX(110%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .ba-toast--success { background: rgba(22, 163, 74, 0.15); border: 1px solid rgba(22, 163, 74, 0.3); color: #4ade80; }
        .ba-toast--error   { background: rgba(220, 31, 46, 0.15); border: 1px solid rgba(220, 31, 46, 0.3); color: #ff4757; }

        /* Buttons */
        .ba-btn {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          padding: 10px 18px; border-radius: 10px; border: none;
          font-size: 13px; font-weight: 700; cursor: pointer;
          transition: all 0.2s; font-family: inherit; letter-spacing: 0.2px;
        }
        .ba-btn:hover:not(:disabled) { transform: translateY(-1px); }
        .ba-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .ba-btn--primary { background: linear-gradient(135deg, #DC1F2E, #ff4757); color: white; box-shadow: 0 4px 14px rgba(220, 31, 46, 0.3); }
        .ba-btn--primary:hover:not(:disabled) { box-shadow: 0 6px 18px rgba(220, 31, 46, 0.45); }
        .ba-btn--outline { background: rgba(255,255,255,0.05); color: white; border: 1px solid rgba(255,255,255,0.12); }
        .ba-btn--outline:hover:not(:disabled) { background: rgba(255,255,255,0.1); }
        .ba-btn--owned { background: rgba(22,163,74,0.12); color: #4ade80; border: 1px solid rgba(22,163,74,0.3); cursor: default; }
        .ba-btn--sm { padding: 8px 14px; font-size: 12px; border-radius: 8px; }
        .ba-btn--full { width: 100%; }

        /* Modal */
        .ba-modal-backdrop {
          position: fixed; inset: 0; z-index: 9998;
          background: rgba(0,0,0,0.7); backdrop-filter: blur(6px);
          display: flex; align-items: center; justify-content: center;
          padding: 20px; box-sizing: border-box;
          animation: baFadeIn 0.2s ease-out;
        }
        @keyframes baFadeIn { from { opacity: 0; } to { opacity: 1; } }
        .ba-modal {
          position: relative;
          width: 100%; max-width: 380px;
          background: #121218;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          padding: 28px 24px 24px;
          box-shadow: 0 24px 64px rgba(0,0,0,0.5);
          text-align: center;
          animation: baModalUp 0.3s cubic-bezier(0.16,1,0.3,1);
        }
        @keyframes baModalUp { from { opacity: 0; transform: translateY(20px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .ba-modal__close {
          position: absolute; top: 14px; right: 14px;
          background: rgba(255,255,255,0.06); border: none; border-radius: 8px;
          width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
          cursor: pointer;
        }
        .ba-modal__close:hover { background: rgba(255,255,255,0.12); }
        .ba-modal__title { margin: 0 0 4px; font-size: 1.15rem; font-weight: 800; color: white; }
        .ba-modal__show { margin: 0 0 16px; font-size: 12.5px; color: rgba(255,255,255,0.5); }
        .ba-modal__qr-wrap {
          background: white; border-radius: 14px; padding: 14px;
          display: inline-flex; margin-bottom: 14px;
        }
        .ba-modal__qr { width: 200px; height: 200px; display: block; }
        .ba-modal__amount { font-size: 1.5rem; font-weight: 900; color: #DC1F2E; margin: 0 0 14px; }
        .ba-modal__countdown {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          margin-top: 14px; font-size: 12.5px; color: rgba(255,255,255,0.6);
        }
        .ba-modal__countdown strong { color: #f59e0b; font-family: monospace; font-size: 14px; }
        .ba-modal__hint { margin: 12px 0 0; font-size: 11px; color: rgba(255,255,255,0.35); line-height: 1.5; }

        .ba-modal__result { display: flex; flex-direction: column; align-items: center; gap: 4px; }
        .ba-modal__result-icon {
          width: 60px; height: 60px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center; margin-bottom: 10px;
        }
        .ba-modal__result-icon--success { background: linear-gradient(135deg, #16a34a, #22c55e); }
        .ba-modal__result-icon--error   { background: linear-gradient(135deg, #dc2626, #ef4444); }
        .ba-modal__code {
          display: flex; flex-direction: column; gap: 4px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px; padding: 14px 20px; margin: 14px 0 20px; width: 100%; box-sizing: border-box;
        }
        .ba-modal__code span { font-size: 11px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.5px; }
        .ba-modal__code strong { font-size: 1.3rem; font-weight: 900; color: #4ade80; font-family: monospace; letter-spacing: 1px; }

        /* Responsive */
        @media (max-width: 640px) {
          .ba-wrapper { padding: 16px 12px 48px; }
          .ba-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
          .ba-card__body { padding: 12px; gap: 6px; }
          .ba-card__title { font-size: 13px; }
          .ba-card__desc { display: none; }
          .ba-card__footer { flex-direction: column; align-items: stretch; gap: 8px; }
          .ba-card__footer .ba-btn { width: 100%; }
          .ba-header__title { font-size: 1.25rem; }
          .ba-modal { padding: 22px 18px 20px; }
          .ba-modal__qr { width: 170px; height: 170px; }
        }
      `}</style>
    </div>
  );
};

export default BuyShowAccess;
