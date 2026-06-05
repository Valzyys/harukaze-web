import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";

const API_BASE = "https://v2.jkt48connect.com/api/jkt48connect";
const API_KEY = "JKTCONNECT";

function Login() {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ login: "", password: "" });
  const [toast, setToast] = useState({ show: false, message: "", type: "" });
  const [focusedField, setFocusedField] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    try {
      const loginData = JSON.parse(sessionStorage.getItem("userLogin") || "null");
      if (loginData && loginData.isLoggedIn && loginData.token) {
        navigate("/");
        return;
      }
      const registrationData = JSON.parse(sessionStorage.getItem("userRegistration") || "null");
      if (registrationData && registrationData.isRegistered) {
        sessionStorage.removeItem("userRegistration");
        navigate("/");
      }
    } catch (error) {
      console.error("Error checking login status:", error);
    }
  }, [navigate]);

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "" }), 3000);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const validateForm = () => {
    if (!formData.login.trim()) {
      showToast("Username atau email harus diisi", "error");
      return false;
    }
    if (!formData.password) {
      showToast("Password harus diisi", "error");
      return false;
    }
    return true;
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/login?apikey=${API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          login: formData.login.toLowerCase().trim(),
          password: formData.password,
        }),
      });
      const data = await response.json();

      if (data.status === true) {
        const loginData = {
          isLoggedIn: true,
          token: data.data.session?.access_token,
          sessionId: data.data.session?.id,
          expiresAt: data.data.session?.expires_at,
          user: data.data.user,
          loginAt: new Date().toISOString(),
        };
        sessionStorage.setItem("userLogin", JSON.stringify(loginData));
        sessionStorage.setItem("authToken", data.data.session?.access_token);
        showToast("Login berhasil! Mengalihkan ke halaman utama...", "success");
        setTimeout(() => navigate("/"), 1500);
      } else {
        const attemptsMsg =
          data.attempts_remaining !== undefined
            ? ` (${data.attempts_remaining} percobaan tersisa)`
            : "";
        showToast((data.message || "Login gagal. Silakan coba lagi.") + attemptsMsg, "error");
      }
    } catch (error) {
      if (error.name === "TypeError" && error.message.includes("fetch")) {
        showToast("Tidak dapat terhubung ke server. Periksa koneksi internet Anda.", "error");
      } else {
        showToast("Terjadi kesalahan: " + error.message, "error");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => setFormData({ login: "", password: "" });

  return (
    <div className="lp-wrapper">
      {/* Toast */}
      {toast.show && (
        <div className={`lp-toast lp-toast--${toast.type}`}>
          <div className="lp-toast__content">
            <span className="lp-toast__icon">{toast.type === "success" ? "✅" : "❌"}</span>
            <span className="lp-toast__message">{toast.message}</span>
          </div>
        </div>
      )}

      <div className="lp-card">
        {/* Header */}
        <div className="lp-card__header">
          <div className="lp-card__header-icon">
            <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </div>
          <h1 className="lp-card__title">Masuk Akun</h1>
          <p className="lp-card__subtitle">Silakan masuk dengan username atau email untuk melanjutkan</p>
        </div>

        {/* Body */}
        <div className="lp-card__body">
          {/* Form */}
          <form onSubmit={handleLogin} className="lp-form" noValidate>

            {/* Username / Email */}
            <div className={`lp-form__group ${focusedField === "login" ? "lp-form__group--focused" : ""}`}>
              <label className="lp-form__label" htmlFor="login">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                Username atau Email
              </label>
              <input
                type="text"
                id="login"
                name="login"
                value={formData.login}
                onChange={handleInputChange}
                onFocus={() => setFocusedField("login")}
                onBlur={() => setFocusedField(null)}
                placeholder="username / email@kamu.com"
                className="lp-form__input"
                disabled={loading}
                autoComplete="username"
              />
              <small className="lp-form__hint">Masukkan username atau email yang terdaftar</small>
            </div>

            {/* Password */}
            <div className={`lp-form__group ${focusedField === "password" ? "lp-form__group--focused" : ""}`}>
              <label className="lp-form__label" htmlFor="password">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                Password
              </label>
              <div className="lp-form__input-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Masukkan password"
                  className="lp-form__input lp-form__input--with-toggle"
                  disabled={loading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="lp-form__toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
              <small className="lp-form__hint">Password akun Anda</small>
            </div>

            {/* Actions */}
            <div className="lp-form__actions">
              <button type="submit" className="lp-btn lp-btn--primary lp-btn--full" disabled={loading}>
                <span>{loading ? "Memproses..." : "Masuk Sekarang"}</span>
                {!loading && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                  </svg>
                )}
              </button>
              <button type="button" className="lp-btn lp-btn--outline lp-btn--full" onClick={handleReset} disabled={loading}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10"></polyline>
                  <polyline points="23 20 23 14 17 14"></polyline>
                  <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path>
                </svg>
                <span>Reset Form</span>
              </button>
            </div>
          </form>

          {/* Info */}
          <div className="lp-info">
            <div className="lp-info__card">
              <div className="lp-info__header">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
                <h3>Informasi Login</h3>
              </div>
              <ul className="lp-info__list">
                <li>Login menggunakan username atau email terdaftar</li>
                <li>Session berlaku selama 24 jam</li>
                <li>Jaga kerahasiaan password Anda</li>
                <li>Akses cepat ke semua livestream</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .lp-wrapper {
          width: 100%;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          background-color: #0a0a0f;
          background-image: radial-gradient(circle at 50% -20%, rgba(220, 31, 46, 0.15) 0%, transparent 60%);
          padding: 20px;
          box-sizing: border-box;
          font-family: 'Inter', sans-serif;
        }

        .lp-card {
          width: 100%;
          max-width: 1000px;
          background: rgba(12, 12, 18, 0.85);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 20px;
          box-shadow: 0 24px 64px rgba(0,0,0,0.4);
          overflow: hidden;
          animation: lpFadeUp 0.6s cubic-bezier(0.16,1,0.3,1);
        }
        @keyframes lpFadeUp {
          from { opacity: 0; transform: translateY(30px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Header */
        .lp-card__header {
          background: rgba(255, 255, 255, 0.02);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          color: white;
          text-align: center;
          padding: 40px 30px;
          position: relative;
        }
        .lp-card__header-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 64px; height: 64px;
          border-radius: 16px;
          background: linear-gradient(135deg, #DC1F2E, #ff4757);
          box-shadow: 0 8px 24px rgba(220, 31, 46, 0.3);
          margin-bottom: 20px;
        }
        .lp-card__title {
          margin: 0 0 10px;
          font-size: 2rem;
          font-weight: 800;
          letter-spacing: -0.5px;
        }
        .lp-card__subtitle {
          margin: 0;
          font-size: 1rem;
          color: rgba(255,255,255,0.6);
        }

        /* Body */
        .lp-card__body {
          display: grid;
          grid-template-columns: 1.5fr 1fr;
          gap: 40px;
          padding: 40px;
          box-sizing: border-box;
        }

        /* Form */
        .lp-form {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .lp-form__group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .lp-form__label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          color: rgba(255,255,255,0.85);
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.8px;
        }
        .lp-form__input-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }
        .lp-form__input {
          width: 100%;
          padding: 14px 18px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          font-size: 15px;
          font-family: inherit;
          background: rgba(255, 255, 255, 0.03);
          color: white;
          box-sizing: border-box;
          transition: all 0.3s ease;
          outline: none;
        }
        .lp-form__input--with-toggle {
          padding-right: 48px;
        }
        .lp-form__input:focus {
          border-color: #DC1F2E;
          background: rgba(255, 255, 255, 0.06);
          box-shadow: 0 0 0 4px rgba(220, 31, 46, 0.1);
        }
        .lp-form__input:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .lp-form__toggle {
          position: absolute;
          right: 14px;
          background: none;
          border: none;
          cursor: pointer;
          color: rgba(255,255,255,0.4);
          display: flex;
          align-items: center;
          padding: 4px;
          transition: color 0.2s;
        }
        .lp-form__toggle:hover { color: white; }
        .lp-form__hint {
          font-size: 12px;
          color: rgba(255,255,255,0.4);
          font-style: italic;
        }

        /* Actions */
        .lp-form__actions {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 8px;
        }

        /* Buttons */
        .lp-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 14px 24px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 700;
          font-family: inherit;
          letter-spacing: 0.5px;
          cursor: pointer;
          border: none;
          transition: all 0.25s ease;
        }
        .lp-btn--full { width: 100%; }
        .lp-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .lp-btn:not(:disabled):hover { transform: translateY(-2px); }
        .lp-btn--primary {
          background: linear-gradient(135deg, #DC1F2E, #ff4757);
          color: white;
          box-shadow: 0 4px 16px rgba(220, 31, 46, 0.25);
        }
        .lp-btn--primary:not(:disabled):hover {
          box-shadow: 0 6px 20px rgba(220, 31, 46, 0.4);
        }
        .lp-btn--outline {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: rgba(255,255,255,0.8);
        }
        .lp-btn--outline:not(:disabled):hover {
          background: rgba(255,255,255,0.1);
          color: white;
        }

        /* Info panel */
        .lp-info { display: flex; flex-direction: column; }
        .lp-info__card {
          background: rgba(255, 255, 255, 0.02);
          border-radius: 16px;
          padding: 24px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          height: fit-content;
        }
        .lp-info__header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 16px;
          padding-bottom: 14px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          color: #DC1F2E;
        }
        .lp-info__header h3 { margin: 0; color: white; font-size: 1.1rem; font-weight: 700; }
        .lp-info__list {
          list-style: none;
          padding: 0; margin: 0;
          display: flex;
          flex-direction: column;
        }
        .lp-info__list li {
          padding: 12px 0;
          color: rgba(255,255,255,0.6);
          font-size: 13px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .lp-info__list li::before {
          content: "✓";
          color: #DC1F2E;
          font-weight: 900;
        }
        .lp-info__list li:last-child { border-bottom: none; }

        /* Toast */
        .lp-toast {
          position: fixed;
          top: 24px; right: 24px;
          z-index: 9999;
          max-width: 420px;
          border-radius: 14px;
          box-shadow: 0 16px 40px rgba(0,0,0,0.5);
          animation: lpSlideIn 0.4s cubic-bezier(0.68,-0.55,0.265,1.55);
        }
        @keyframes lpSlideIn {
          from { transform: translateX(120%); opacity: 0; }
          to   { transform: translateX(0); opacity: 1; }
        }
        .lp-toast--success {
          background: rgba(22, 163, 74, 0.15);
          border: 1px solid rgba(22, 163, 74, 0.3);
          backdrop-filter: blur(12px);
          color: #4ade80;
        }
        .lp-toast--error {
          background: rgba(220, 31, 46, 0.15);
          border: 1px solid rgba(220, 31, 46, 0.3);
          backdrop-filter: blur(12px);
          color: #ff4757;
        }
        .lp-toast__content {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 18px;
        }
        .lp-toast__icon { font-size: 20px; }
        .lp-toast__message { font-weight: 600; font-size: 13px; line-height: 1.5; color: white; }

        /* Responsive */
        @media (max-width: 768px) {
          .lp-wrapper { padding: 16px; }
          .lp-card__header { padding: 32px 20px; }
          .lp-card__title { font-size: 1.6rem; }
          .lp-card__body {
            grid-template-columns: 1fr;
            gap: 24px;
            padding: 24px 20px;
          }
          .lp-info { order: -1; }
          .lp-toast { left: 16px; right: 16px; max-width: none; }
        }
      `}</style>
    </div>
  );
}

export default Login;

