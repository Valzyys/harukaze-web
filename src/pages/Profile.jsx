import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = 'https://v2.jkt48connect.com/api/jkt48connect';
const API_KEY  = 'JKTCONNECT';

// ── Helpers ───────────────────────────────────────────────────────────────────
const formatDate = (s) => {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
};
const formatRelative = (s) => {
  if (!s) return '—';
  const diff = Date.now() - new Date(s).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Baru saja';
  if (mins < 60) return `${mins} menit lalu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} jam lalu`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} hari lalu`;
  return formatDate(s);
};
const getMembershipColor = (type) => {
  if (type === 'monthly') return '#DC1F2E';
  if (type === 'weekly')  return '#F59E0B';
  if (type === 'ramadan') return '#7C3AED';
  return '#6b7280';
};
const getMembershipLabel = (type) => {
  if (type === 'monthly') return 'MONTHLY';
  if (type === 'weekly')  return 'WEEKLY';
  if (type === 'ramadan') return 'RAMADAN';
  return 'FREE';
};
const getOrderStatusColor = (status) => {
  if (status === 'paid')    return '#16a34a';
  if (status === 'pending') return '#d97706';
  if (status === 'failed' || status === 'expired') return '#dc2626';
  return '#6b7280';
};

// ── SVG Icons ─────────────────────────────────────────────────────────────────
const SvgWrap = ({ size = 16, color = 'currentColor', children, viewBox = '0 0 24 24' }) => (
  <svg width={size} height={size} viewBox={viewBox} fill="none"
    stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    style={{ flexShrink: 0, display: 'block' }}>
    {children}
  </svg>
);

const IUser = (p) => <SvgWrap {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></SvgWrap>;
const IMail = (p) => <SvgWrap {...p}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 7L2 7"/></SvgWrap>;
const IPhone = (p) => <SvgWrap {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l.87-1.87a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></SvgWrap>;
const ICalendar = (p) => <SvgWrap {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></SvgWrap>;
const IClock = (p) => <SvgWrap {...p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></SvgWrap>;
const ICheck = (p) => <SvgWrap {...p} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></SvgWrap>;
const IShield = (p) => <SvgWrap {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></SvgWrap>;
const IStar = (p) => <SvgWrap {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></SvgWrap>;
const IBell = (p) => <SvgWrap {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></SvgWrap>;
const IBag = (p) => <SvgWrap {...p}><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></SvgWrap>;
const IRefresh = (p) => <SvgWrap {...p}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></SvgWrap>;
const ILogout = (p) => <SvgWrap {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></SvgWrap>;
const IWarning = (p) => <SvgWrap {...p}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></SvgWrap>;
const IActivity = (p) => <SvgWrap {...p}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></SvgWrap>;
const ISmartphone = (p) => <SvgWrap {...p}><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></SvgWrap>;
const IDownload = (p) => <SvgWrap {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></SvgWrap>;
const IGift = (p) => <SvgWrap {...p}><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></SvgWrap>;

// ── Session ───────────────────────────────────────────────────────────────────
const getSession = () => {
  try {
    const d = JSON.parse(sessionStorage.getItem('userLogin') || 'null');
    if (d && d.isLoggedIn && d.token) return d;
    return null;
  } catch { return null; }
};

// ══════════════════════════════════════════════════════════════════════════════
const ProfilePage = () => {
  const navigate = useNavigate();

  const [session,       setSession]       = useState(null);
  const [profile,       setProfile]       = useState(null);
  const [membership,    setMembership]    = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [orders,        setOrders]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [activeTab,     setActiveTab]     = useState('profile');
  const [toast,         setToast]         = useState({ show: false, message: '', type: '' });

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: '' }), 3500);
  };

  const loadAll = useCallback(async () => {
    const s = getSession();
    if (!s) { navigate('/login'); return; }
    setSession(s);
    const uid   = s.user?.user_id;
    const token = s.token;
    if (!uid || !token) { navigate('/login'); return; }

    try {
      const h = { Authorization: `Bearer ${token}` };
      const [pR, mR, nR, oR] = await Promise.all([
        fetch(`${API_BASE}/profile/${uid}?apikey=${API_KEY}`,                { headers: h }),
        fetch(`${API_BASE}/membership/status/${uid}?apikey=${API_KEY}`,      { headers: h }),
        fetch(`${API_BASE}/notifications/${uid}?limit=10&apikey=${API_KEY}`, { headers: h }),
        fetch(`${API_BASE}/order/list/${uid}?limit=5&apikey=${API_KEY}`,     { headers: h }),
      ]);
      const [pD, mD, nD, oD] = await Promise.all([pR.json(), mR.json(), nR.json(), oR.json()]);

      if (pD.status) {
        setProfile(pD.data);
        // Sync avatar ke session agar Header terupdate
        const currSession = JSON.parse(sessionStorage.getItem('userLogin') || '{}');
        if (currSession.user && pD.data.avatar) {
          currSession.user.avatar = pD.data.avatar;
          sessionStorage.setItem('userLogin', JSON.stringify(currSession));
          window.dispatchEvent(new Event('storage'));
        }
      }
      if (mD.status) setMembership(mD.data);
      if (nD.status) { setNotifications(nD.data?.notifications || []); setUnreadCount(nD.data?.unread_count || 0); }
      if (oD.status) setOrders(oD.data?.orders || []);
    } catch {
      showToast('Gagal memuat data. Periksa koneksi internet.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [navigate]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleLogout = async () => {
    if (!window.confirm('Apakah kamu yakin ingin logout?')) return;
    try {
      const s = getSession();
      if (s?.token)
        await fetch(`${API_BASE}/auth/logout?apikey=${API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: s.token, user_id: s.user?.user_id }),
        });
    } catch {}
    sessionStorage.removeItem('userLogin');
    sessionStorage.removeItem('authToken');
    localStorage.removeItem('successfulRegistration');
    navigate('/');
  };

  const markAllRead = async () => {
    try {
      await fetch(`${API_BASE}/notifications/read?apikey=${API_KEY}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.token}` },
        body: JSON.stringify({ user_id: session?.user?.user_id, mark_all: true }),
      });
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      showToast('Semua notifikasi ditandai dibaca');
    } catch { showToast('Gagal menandai notifikasi', 'error'); }
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="pp-loading">
      <div className="pp-spinner" />
      <p>Memuat profil...</p>
    </div>
  );

  if (!profile) return (
    <div className="pp-error">
      <IWarning size={48} color="#dc2626" />
      <h2>Gagal Memuat Profil</h2>
      <p>Pastikan kamu sudah login dan koneksi internet tersedia.</p>
      <button className="pp-btn pp-btn--primary" onClick={() => navigate('/login')}>
        Kembali ke Login
      </button>
    </div>
  );

  const isPremium   = membership?.is_active && membership?.membership_type !== 'free';
  const memberColor = getMembershipColor(membership?.membership_type || 'free');
  const memberLabel = getMembershipLabel(membership?.membership_type || 'free');
  const initials    = (profile.full_name || profile.username || 'U').slice(0, 2).toUpperCase();

  const TABS = [
    { key: 'profile',       label: 'Profil',     Icon: IUser },
    { key: 'membership',    label: 'Membership', Icon: IStar },
    { key: 'orders',        label: 'Order',      Icon: IBag  },
    { key: 'notifications', label: 'Notifikasi', Icon: IBell },
  ];

  const InfoRow = ({ icon: Icon, label, value, mono = false, valueColor }) => (
    <div className="pp-info-row">
      <div className="pp-info-label">
        <Icon size={14} color="#9ca3af" />
        <span>{label}</span>
      </div>
      <span className={`pp-info-value${mono ? ' pp-info-value--mono' : ''}`}
        style={valueColor ? { color: valueColor } : {}}>
        {value}
      </span>
    </div>
  );

  return (
    <div className="pp-wrapper">

      {/* Toast */}
      {toast.show && (
        <div className={`pp-toast pp-toast--${toast.type}`}>
          {toast.type === 'success' ? <ICheck size={15} color="#166534" /> : <IWarning size={15} color="#991b1b" />}
          <span>{toast.message}</span>
        </div>
      )}

      <div className="pp-container">

        {/* ── HERO ──────────────────────────────────────────────────────── */}
        <div className="pp-hero">
          <div className="pp-hero__top">
            <div className="pp-hero__avatar-wrap">
              {profile.avatar
                ? <img src={profile.avatar} alt="avatar" className="pp-hero__avatar-img" />
                : <div className="pp-hero__avatar-initials">{initials}</div>}
              {profile.is_verified && (
                <div className="pp-hero__verified-dot">
                  <ICheck size={9} color="#fff" />
                </div>
              )}
            </div>

            <div className="pp-hero__info">
              <h1 className="pp-hero__name">{profile.full_name || profile.username}</h1>
              <p className="pp-hero__username">@{profile.username}</p>
              <div className="pp-hero__badges">
                <span className="pp-badge"
                  style={{ color: memberColor, background: `${memberColor}18`, border: `1px solid ${memberColor}40` }}>
                  {isPremium ? memberLabel : 'Free Account'}
                </span>
                {profile.is_verified && (
                  <span className="pp-badge pp-badge--verified">
                    <IShield size={11} color="#166534" /> Verified
                  </span>
                )}
              </div>
            </div>

            <div className="pp-hero__actions">
              <button className="pp-btn pp-btn--outline pp-btn--sm"
                onClick={() => { setRefreshing(true); loadAll(); }} disabled={refreshing}>
                <IRefresh size={13} color="#7b1c1c" />
                {refreshing ? 'Memuat...' : 'Refresh'}
              </button>
              <button className="pp-btn pp-btn--danger pp-btn--sm" onClick={handleLogout}>
                <ILogout size={13} color="#dc2626" /> Logout
              </button>
            </div>
          </div>

          <div className="pp-hero__stats">
            <div className="pp-hero__stat">
              <span className="pp-hero__stat-num">{profile.referral_code || '—'}</span>
              <span className="pp-hero__stat-label">Referral Code</span>
            </div>
            <div className="pp-hero__stat-divider" />
            <div className="pp-hero__stat">
              <span className="pp-hero__stat-num" style={{ color: isPremium ? memberColor : '#9ca3af' }}>
                {isPremium ? `${membership.days_remaining} hari` : '—'}
              </span>
              <span className="pp-hero__stat-label">Sisa Membership</span>
            </div>
            <div className="pp-hero__stat-divider" />
            <div className="pp-hero__stat">
              <span className="pp-hero__stat-num" style={{ color: profile.is_verified ? '#16a34a' : '#9ca3af' }}>
                {profile.is_verified ? 'Verified' : 'Unverified'}
              </span>
              <span className="pp-hero__stat-label">Status Email</span>
            </div>
          </div>
        </div>

        {/* ── TABS ──────────────────────────────────────────────────────── */}
        <div className="pp-tabs">
          {TABS.map(({ key, label, Icon }) => (
            <button key={key}
              className={`pp-tab${activeTab === key ? ' pp-tab--active' : ''}`}
              onClick={() => setActiveTab(key)}>
              <Icon size={14} color={activeTab === key ? '#7b1c1c' : '#9ca3af'} />
              <span>{label}</span>
              {key === 'notifications' && unreadCount > 0 && (
                <span className="pp-tab-badge">{unreadCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* ══ PROFILE ═══════════════════════════════════════════════════ */}
        {activeTab === 'profile' && (
          <div className="pp-grid">
            <div className="pp-col">
              <div className="pp-card">
                <h2 className="pp-card__title">
                  <IUser size={15} color="#7b1c1c" /> Informasi Pribadi
                </h2>
                <div className="pp-info-list">
                  <InfoRow icon={IUser}     label="Username"      value={profile.username} />
                  <InfoRow icon={IUser}     label="Nama Lengkap"  value={profile.full_name || '—'} />
                  <InfoRow icon={IMail}     label="Email"         value={profile.email || '—'} />
                  <InfoRow icon={IPhone}    label="No. HP"        value={profile.phone || 'Belum diisi'} />
                  <InfoRow icon={IGift}     label="Referral"      value={profile.referral_code || '—'} mono />
                  <InfoRow icon={ICalendar} label="Bergabung"     value={formatDate(profile.created_at)} />
                  {profile.last_login && (
                    <InfoRow icon={IClock} label="Login Terakhir" value={formatRelative(profile.last_login)} />
                  )}
                  <InfoRow icon={IActivity} label="Status Akun"
                    value={profile.is_active ? 'Aktif' : 'Nonaktif'}
                    valueColor={profile.is_active ? '#16a34a' : '#dc2626'} />
                </div>
              </div>
            </div>

            <div className="pp-col pp-col--sidebar">
              <div className="pp-card">
                <h3 className="pp-card__subtitle">
                  <IStar size={14} color="#7b1c1c" /> Status Membership
                </h3>
                {isPremium ? (
                  <>
                    <div className="pp-membership-badge"
                      style={{ color: memberColor, background: `${memberColor}12`, borderColor: `${memberColor}40` }}>
                      {memberLabel} · Aktif
                    </div>
                    <div className="pp-info-list" style={{ marginTop: 12 }}>
                      <InfoRow icon={ICalendar} label="Mulai"    value={formatDate(membership.membership_started_at)} />
                      <InfoRow icon={ICalendar} label="Berakhir" value={formatDate(membership.membership_expired_at)} />
                      <InfoRow icon={IClock}    label="Sisa"
                        value={`${membership.days_remaining} hari`} valueColor={memberColor} />
                    </div>
                  </>
                ) : (
                  <div className="pp-app-notice">
                    <ISmartphone size={28} color="#7b1c1c" />
                    <p className="pp-app-notice__text">
                      Pembelian membership hanya tersedia melalui aplikasi <strong>JKT48Connect</strong>.
                    </p>
                    <a className="pp-btn pp-btn--primary pp-btn--sm pp-btn--full"
                      href="https://jkt48connect.com/download" target="_blank" rel="noopener noreferrer">
                      <IDownload size={13} color="#fff" /> Download Aplikasi
                    </a>
                  </div>
                )}
              </div>

              <div className="pp-card">
                <h3 className="pp-card__subtitle">
                  <IShield size={14} color="#7b1c1c" /> User ID
                </h3>
                <p className="pp-user-id">{profile.user_id}</p>
              </div>
            </div>
          </div>
        )}

        {/* ══ MEMBERSHIP ════════════════════════════════════════════════ */}
        {activeTab === 'membership' && (
          <div className="pp-card">
            <h2 className="pp-card__title">
              <IStar size={15} color="#7b1c1c" /> Status Membership
            </h2>
            {isPremium ? (
              <>
                <div className="pp-membership-hero"
                  style={{ borderColor: `${memberColor}44`, background: `${memberColor}09` }}>
                  <div className="pp-membership-hero__type" style={{ color: memberColor }}>
                    <IStar size={13} color={memberColor} /> {memberLabel}
                  </div>
                  <div className="pp-membership-hero__days" style={{ color: memberColor }}>
                    {membership.days_remaining}
                    <span>hari tersisa</span>
                  </div>
                  <div className="pp-membership-progress-wrap">
                    <div className="pp-membership-progress" style={{ background: `${memberColor}22` }}>
                      <div className="pp-membership-progress__fill"
                        style={{ background: memberColor, width: `${Math.min(100, (membership.days_remaining / 30) * 100)}%` }} />
                    </div>
                  </div>
                </div>
                <div className="pp-info-list" style={{ marginTop: 16 }}>
                  <InfoRow icon={ICalendar} label="Mulai"    value={formatDate(membership.membership_started_at)} />
                  <InfoRow icon={ICalendar} label="Berakhir" value={formatDate(membership.membership_expired_at)} />
                  <InfoRow icon={IStar}     label="Tipe"     value={memberLabel} valueColor={memberColor} />
                  <InfoRow icon={ICheck}    label="Status"   value="Aktif"       valueColor="#16a34a" />
                </div>
              </>
            ) : (
              <div className="pp-app-notice pp-app-notice--lg">
                <div className="pp-app-notice__icon-wrap">
                  <ISmartphone size={36} color="#7b1c1c" />
                </div>
                <h3 className="pp-app-notice__title">Belum memiliki membership</h3>
                <p className="pp-app-notice__text">
                  Pembelian membership hanya dapat dilakukan melalui aplikasi{' '}
                  <strong>JKT48Connect</strong>. Download aplikasinya dan beli membership
                  untuk menikmati akses livestream theater &amp; event JKT48 secara eksklusif.
                </p>
                <div className="pp-app-notice__stores">
                  <a className="pp-store-btn"
                    href="https://play.google.com/store/apps/details?id=com.jkt48connect"
                    target="_blank" rel="noopener noreferrer">
                    <IDownload size={15} color="#fff" />
                    <div>
                      <span className="pp-store-btn__sub">Download di</span>
                      <span className="pp-store-btn__name">Google Play</span>
                    </div>
                  </a>
                  <a className="pp-store-btn"
                    href="https://apps.apple.com/app/jkt48connect"
                    target="_blank" rel="noopener noreferrer">
                    <IDownload size={15} color="#fff" />
                    <div>
                      <span className="pp-store-btn__sub">Download di</span>
                      <span className="pp-store-btn__name">App Store</span>
                    </div>
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ ORDERS ════════════════════════════════════════════════════ */}
        {activeTab === 'orders' && (
          <div className="pp-card">
            <h2 className="pp-card__title">
              <IBag size={15} color="#7b1c1c" /> Riwayat Order
            </h2>
            {orders.length === 0 ? (
              <div className="pp-empty">
                <IBag size={36} color="#d1d5db" />
                <p>Belum ada order</p>
              </div>
            ) : (
              <div className="pp-order-list">
                {orders.map((o) => (
                  <div key={o.order_id} className="pp-order-item">
                    <div className="pp-order-item__left">
                      <p className="pp-order-item__plan">{o.plan_name}</p>
                      <p className="pp-order-item__id">#{o.order_id.slice(-10)}</p>
                      <p className="pp-order-item__date">{formatRelative(o.created_at)}</p>
                      {o.membership_expired_at && (
                        <p className="pp-order-item__exp">Berlaku hingga: {formatDate(o.membership_expired_at)}</p>
                      )}
                    </div>
                    <div className="pp-order-item__right">
                      <p className="pp-order-item__amount">
                        Rp{Number(o.final_amount).toLocaleString('id-ID')}
                      </p>
                      <span className="pp-order-item__status"
                        style={{
                          color:      getOrderStatusColor(o.status),
                          background: `${getOrderStatusColor(o.status)}15`,
                          border:     `1px solid ${getOrderStatusColor(o.status)}40`,
                        }}>
                        {o.status.toUpperCase()}
                      </span>
                      {o.paid_at && <p className="pp-order-item__paid">{formatRelative(o.paid_at)}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ NOTIFICATIONS ═════════════════════════════════════════════ */}
        {activeTab === 'notifications' && (
          <div className="pp-card">
            <div className="pp-card__header">
              <h2 className="pp-card__title">
                <IBell size={15} color="#7b1c1c" /> Notifikasi
              </h2>
              {unreadCount > 0 && (
                <button className="pp-btn pp-btn--outline pp-btn--sm" onClick={markAllRead}>
                  <ICheck size={13} color="#DC1F2E" /> Tandai semua dibaca
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <div className="pp-empty">
                <IBell size={36} color="rgba(255,255,255,0.3)" />
                <p>Belum ada notifikasi</p>
              </div>
            ) : (
              <div className="pp-notif-list">
                {notifications.map((n) => (
                  <div key={n.id} className={`pp-notif-item${!n.is_read ? ' pp-notif-item--unread' : ''}`}>
                    <div className="pp-notif-item__dot"
                      style={{ background: n.is_read ? 'rgba(255,255,255,0.1)' : '#DC1F2E' }} />
                    <div className="pp-notif-item__body">
                      <p className="pp-notif-item__title">{n.title}</p>
                      <p className="pp-notif-item__msg">{n.message}</p>
                      <p className="pp-notif-item__time">{formatRelative(n.created_at)}</p>
                    </div>
                    <span className="pp-notif-item__type">{n.category || n.type}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        .pp-wrapper {
          min-height: 100vh;
          background-color: #0a0a0f;
          background-image: radial-gradient(circle at 100% 0%, rgba(220, 31, 46, 0.1) 0%, transparent 50%);
          padding: 24px 16px 64px;
          box-sizing: border-box;
          font-family: 'Inter', sans-serif;
          color: rgba(255,255,255,0.85);
        }
        .pp-container {
          max-width: 1080px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 14px;
          animation: ppFadeUp 0.5s ease-out;
        }
        @keyframes ppFadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Loading / Error */
        .pp-loading, .pp-error {
          min-height: 100vh;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          gap: 14px; background: #0a0a0f;
          color: rgba(255,255,255,0.8); text-align: center; padding: 24px;
        }
        .pp-spinner {
          width: 44px; height: 44px;
          border: 3px solid rgba(220, 31, 46, 0.2);
          border-top-color: #DC1F2E;
          border-radius: 50%;
          animation: ppSpin 0.75s linear infinite;
        }
        @keyframes ppSpin { to { transform: rotate(360deg); } }
        .pp-error h2 { margin: 0; color: white; }
        .pp-error p  { margin: 0; color: rgba(255,255,255,0.5); font-size: 14px; }

        /* Toast */
        .pp-toast {
          position: fixed; top: 20px; right: 20px; z-index: 9999;
          display: flex; align-items: center; gap: 10px;
          padding: 12px 16px; border-radius: 12px;
          font-weight: 600; font-size: 13px;
          max-width: 380px;
          box-shadow: 0 16px 40px rgba(0,0,0,0.5);
          animation: ppSlide 0.35s cubic-bezier(.68,-.55,.265,1.55);
          backdrop-filter: blur(12px);
        }
        @keyframes ppSlide { from { transform: translateX(110%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .pp-toast--success { background: rgba(22, 163, 74, 0.15); border: 1px solid rgba(22, 163, 74, 0.3); color: #4ade80; }
        .pp-toast--error   { background: rgba(220, 31, 46, 0.15); border: 1px solid rgba(220, 31, 46, 0.3); color: #ff4757; }

        /* Card Base (Glassmorphism) */
        .pp-card, .pp-hero, .pp-tabs {
          background: rgba(12, 12, 18, 0.85);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 16px;
          box-shadow: 0 16px 32px rgba(0,0,0,0.3);
        }

        /* Hero */
        .pp-hero { overflow: hidden; }
        .pp-hero__top {
          display: flex; align-items: flex-start;
          gap: 16px; padding: 22px; flex-wrap: wrap;
        }
        .pp-hero__avatar-wrap { position: relative; flex-shrink: 0; }
        .pp-hero__avatar-img {
          width: 70px; height: 70px; border-radius: 50%;
          object-fit: cover; border: 2.5px solid #DC1F2E; display: block;
        }
        .pp-hero__avatar-initials {
          width: 70px; height: 70px; border-radius: 50%;
          background: linear-gradient(135deg, #DC1F2E, #ff4757);
          color: white; font-size: 1.5rem; font-weight: 800;
          display: flex; align-items: center; justify-content: center;
          letter-spacing: 1px;
        }
        .pp-hero__verified-dot {
          position: absolute; bottom: 1px; right: 1px;
          width: 20px; height: 20px; border-radius: 50%;
          background: #16a34a;
          display: flex; align-items: center; justify-content: center;
          border: 2px solid #0a0a0f;
        }
        .pp-hero__info { flex: 1; min-width: 0; }
        .pp-hero__name {
          margin: 0 0 3px; font-size: 1.35rem; font-weight: 800; color: white;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .pp-hero__username { margin: 0 0 8px; color: rgba(255,255,255,0.5); font-size: 13px; }
        .pp-hero__badges { display: flex; gap: 7px; flex-wrap: wrap; }
        .pp-badge {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 4px 10px; border-radius: 20px;
          font-size: 11px; font-weight: 700; letter-spacing: 0.4px;
        }
        .pp-badge--verified { background: rgba(22, 163, 74, 0.15); color: #4ade80; border: 1px solid rgba(22, 163, 74, 0.3); }
        .pp-hero__actions {
          display: flex; gap: 8px; flex-shrink: 0;
          flex-wrap: wrap; align-self: flex-start;
        }
        .pp-hero__stats {
          display: flex; align-items: center;
          background: rgba(255, 255, 255, 0.02); border-top: 1px solid rgba(255,255,255,0.05);
        }
        .pp-hero__stat {
          flex: 1; display: flex; flex-direction: column;
          align-items: center; padding: 13px 8px; gap: 3px;
        }
        .pp-hero__stat-num  { font-size: 13px; font-weight: 800; color: white; font-family: monospace; }
        .pp-hero__stat-label { font-size: 11px; color: rgba(255,255,255,0.4); }
        .pp-hero__stat-divider { width: 1px; height: 32px; background: rgba(255,255,255,0.05); }

        /* Tabs */
        .pp-tabs {
          display: flex; overflow-x: auto; padding: 4px;
        }
        .pp-tab {
          flex: 1; min-width: 80px;
          display: flex; align-items: center; justify-content: center; gap: 6px;
          padding: 12px 10px; border: none; background: transparent; border-radius: 12px;
          font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.5); cursor: pointer;
          white-space: nowrap; transition: all 0.2s; font-family: inherit;
        }
        .pp-tab:hover { color: white; background: rgba(255,255,255,0.05); }
        .pp-tab--active { color: white; background: rgba(255,255,255,0.1); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.05); }
        .pp-tab-badge {
          background: #DC1F2E; color: white; border-radius: 10px;
          padding: 1px 6px; font-size: 10px; font-weight: 900;
          min-width: 18px; text-align: center;
        }

        /* Grid */
        .pp-grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
        @media (min-width: 768px) { .pp-grid { grid-template-columns: 2fr 1fr; } }
        .pp-col, .pp-col--sidebar { display: flex; flex-direction: column; gap: 14px; }

        /* Card Content */
        .pp-card { padding: 24px; }
        .pp-card__title {
          display: flex; align-items: center; gap: 8px;
          font-size: 0.95rem; font-weight: 700; color: white;
          margin: 0 0 16px; padding-bottom: 12px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .pp-card__subtitle {
          display: flex; align-items: center; gap: 7px;
          font-size: 0.875rem; font-weight: 700; color: rgba(255,255,255,0.8);
          margin: 0 0 12px;
        }
        .pp-card__header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 16px; gap: 10px; flex-wrap: wrap;
        }
        .pp-card__header .pp-card__title { margin: 0; padding: 0; border: none; }

        /* Info rows */
        .pp-info-list { display: flex; flex-direction: column; }
        .pp-info-row {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.05); gap: 12px;
        }
        .pp-info-row:last-child { border-bottom: none; }
        .pp-info-label {
          display: flex; align-items: center; gap: 8px;
          font-size: 13px; color: rgba(255,255,255,0.5); flex-shrink: 0;
        }
        .pp-info-value {
          font-size: 13px; font-weight: 600; color: white;
          text-align: right; word-break: break-all;
        }
        .pp-info-value--mono { font-family: monospace; letter-spacing: 0.5px; }

        /* Membership */
        .pp-membership-badge {
          padding: 10px 16px; border-radius: 12px; border: 1px solid;
          font-weight: 800; font-size: 14px;
          text-align: center; letter-spacing: 0.5px;
        }
        .pp-membership-hero {
          border-radius: 14px; border: 1px solid;
          padding: 24px; text-align: center; margin-bottom: 4px;
        }
        .pp-membership-hero__type {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          font-size: 13px; font-weight: 800;
          letter-spacing: 1px; margin-bottom: 10px;
        }
        .pp-membership-hero__days {
          font-size: 3rem; font-weight: 900;
          display: flex; align-items: baseline; justify-content: center; gap: 8px;
          text-shadow: 0 4px 12px rgba(0,0,0,0.5);
        }
        .pp-membership-hero__days span { font-size: 1rem; font-weight: 600; color: rgba(255,255,255,0.5); text-shadow: none; }
        .pp-membership-progress-wrap { margin-top: 16px; }
        .pp-membership-progress { height: 6px; border-radius: 4px; overflow: hidden; background: rgba(0,0,0,0.2); }
        .pp-membership-progress__fill { height: 100%; border-radius: 4px; transition: width 0.6s ease; box-shadow: 0 0 10px currentColor; }

        /* App notice */
        .pp-app-notice {
          display: flex; flex-direction: column;
          align-items: center; gap: 10px;
          padding: 16px 12px; text-align: center;
          background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);
        }
        .pp-app-notice--lg { padding: 32px 20px; gap: 16px; }
        .pp-app-notice__icon-wrap {
          width: 72px; height: 72px; border-radius: 20px;
          background: rgba(220, 31, 46, 0.1); border: 1px solid rgba(220, 31, 46, 0.2);
          display: flex; align-items: center; justify-content: center;
        }
        .pp-app-notice__title { margin: 0; font-size: 1.1rem; font-weight: 700; color: white; }
        .pp-app-notice__text {
          margin: 0; font-size: 13px; color: rgba(255,255,255,0.6);
          line-height: 1.65; max-width: 380px;
        }
        .pp-app-notice__text strong { color: white; }
        .pp-app-notice__stores {
          display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; margin-top: 4px;
        }
        .pp-store-btn {
          display: inline-flex; align-items: center; gap: 10px;
          padding: 10px 20px;
          background: linear-gradient(135deg, #DC1F2E, #ff4757);
          color: white; border-radius: 12px; text-decoration: none;
          font-family: inherit; transition: all 0.2s; border: none; cursor: pointer;
        }
        .pp-store-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(220, 31, 46, 0.3); }
        .pp-store-btn div { display: flex; flex-direction: column; text-align: left; }
        .pp-store-btn__sub  { font-size: 10px; opacity: 0.8; line-height: 1; }
        .pp-store-btn__name { font-size: 13px; font-weight: 700; line-height: 1.4; }

        /* Orders */
        .pp-order-list { display: flex; flex-direction: column; }
        .pp-order-item {
          display: flex; justify-content: space-between; align-items: flex-start;
          padding: 16px 0; border-bottom: 1px solid rgba(255,255,255,0.05); gap: 12px;
        }
        .pp-order-item:last-child { border-bottom: none; }
        .pp-order-item__left { flex: 1; min-width: 0; }
        .pp-order-item__plan  { font-weight: 700; color: white; font-size: 14px; margin: 0 0 4px; }
        .pp-order-item__id    { font-size: 11px; color: rgba(255,255,255,0.4); font-family: monospace; margin: 0 0 3px; }
        .pp-order-item__date  { font-size: 11px; color: rgba(255,255,255,0.5); margin: 0; }
        .pp-order-item__exp   { font-size: 11px; color: rgba(255,255,255,0.4); margin: 4px 0 0; }
        .pp-order-item__right { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex-shrink: 0; }
        .pp-order-item__amount { font-weight: 800; font-size: 14px; color: white; margin: 0; }
        .pp-order-item__status {
          font-size: 10px; font-weight: 800;
          padding: 3px 10px; border-radius: 8px; letter-spacing: 0.5px;
        }
        .pp-order-item__paid { font-size: 10px; color: rgba(255,255,255,0.4); margin: 0; }

        /* Notifications */
        .pp-notif-list { display: flex; flex-direction: column; }
        .pp-notif-item {
          display: flex; align-items: flex-start;
          gap: 12px; padding: 16px 0;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .pp-notif-item:last-child { border-bottom: none; }
        .pp-notif-item--unread {
          background: rgba(255,255,255,0.03); margin: 0 -24px; padding: 16px 24px;
        }
        .pp-notif-item__dot {
          width: 8px; height: 8px; border-radius: 50%;
          margin-top: 4px; flex-shrink: 0; box-shadow: 0 0 8px currentColor;
        }
        .pp-notif-item__body { flex: 1; min-width: 0; }
        .pp-notif-item__title { font-weight: 700; color: white; font-size: 13px; margin: 0 0 4px; }
        .pp-notif-item__msg   { color: rgba(255,255,255,0.6); font-size: 12px; margin: 0 0 6px; line-height: 1.5; }
        .pp-notif-item__time  { color: rgba(255,255,255,0.4); font-size: 11px; margin: 0; }
        .pp-notif-item__type {
          font-size: 10px; color: rgba(255,255,255,0.6); background: rgba(255,255,255,0.05);
          padding: 3px 10px; border-radius: 8px;
          flex-shrink: 0; align-self: flex-start; margin-top: 2px;
        }

        /* User ID */
        .pp-user-id {
          font-family: monospace; font-size: 12px; color: rgba(255,255,255,0.5);
          word-break: break-all; background: rgba(0,0,0,0.2);
          padding: 10px 14px; border-radius: 10px; margin: 0;
          border: 1px solid rgba(255,255,255,0.05);
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
        }

        /* Empty */
        .pp-empty {
          display: flex; flex-direction: column;
          align-items: center; gap: 12px;
          padding: 40px; color: rgba(255,255,255,0.3); font-size: 14px;
        }

        /* Buttons */
        .pp-btn {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          padding: 10px 20px; border-radius: 12px; border: none;
          font-size: 14px; font-weight: 600; cursor: pointer;
          transition: all 0.2s; font-family: inherit;
          text-decoration: none; box-sizing: border-box;
          letter-spacing: 0.3px;
        }
        .pp-btn:hover:not(:disabled) { transform: translateY(-2px); }
        .pp-btn:disabled { opacity: 0.55; cursor: not-allowed; transform: none; }
        .pp-btn--primary {
          background: linear-gradient(135deg, #DC1F2E, #ff4757);
          color: white; box-shadow: 0 4px 16px rgba(220, 31, 46, 0.25);
        }
        .pp-btn--primary:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(220, 31, 46, 0.4); }
        .pp-btn--danger { background: rgba(220, 31, 46, 0.1); color: #ff4757; border: 1px solid rgba(220, 31, 46, 0.3); }
        .pp-btn--danger:hover:not(:disabled) { background: rgba(220, 31, 46, 0.2); }
        .pp-btn--outline { background: rgba(255,255,255,0.05); color: white; border: 1px solid rgba(255,255,255,0.1); }
        .pp-btn--outline:hover:not(:disabled) { background: rgba(255,255,255,0.1); }
        .pp-btn--sm { font-size: 12px; padding: 7px 12px; border-radius: 8px; }
        .pp-btn--full { width: 100%; }

        /* Responsive */
        @media (max-width: 600px) {
          .pp-wrapper { padding: 12px 10px 52px; }
          .pp-hero__top { flex-direction: column; gap: 14px; }
          .pp-hero__actions { width: 100%; }
          .pp-hero__actions .pp-btn { flex: 1; }
          .pp-tab span { display: none; }
          .pp-tab { min-width: 48px; padding: 12px; }
          .pp-membership-hero__days { font-size: 2.5rem; }
          .pp-app-notice__stores { flex-direction: column; align-items: stretch; }
          .pp-store-btn { justify-content: center; }
        }
      `}</style>
    </div>
  );
};

export default ProfilePage;
