import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/header.css";

// ── Inline SVG Icons ──────────────────────────────────────────
const Icons = {
  // Logo play/stream icon
  Logo: () => (
    <svg viewBox="0 0 24 24" fill="white">
      <path d="M8 5v14l11-7z" />
    </svg>
  ),
  // User icon
  User: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  // Chevron Down
  ChevronDown: () => (
    <svg className="chevron-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  // Menu (hamburger)
  Menu: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  ),
  // Close (X)
  Close: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  // Profile icon
  Profile: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  // Logout icon
  Logout: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
};

// ══════════════════════════════════════════════════════════════
//  HEADER COMPONENT
// ══════════════════════════════════════════════════════════════
const Header = () => {
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // ── Auth check ─────────────────────────────────────────────
  const checkAuthStatus = () => {
    try {
      const loginData = JSON.parse(sessionStorage.getItem("userLogin") || "null");
      if (loginData?.isLoggedIn && loginData?.token) {
        setIsLoggedIn(true);
        setUserInfo(loginData.user || { username: "User" });
        return;
      }

      const regData = JSON.parse(sessionStorage.getItem("userRegistration") || "null");
      if (regData?.isRegistered) {
        setIsLoggedIn(true);
        setUserInfo({ username: regData.username || "User", ...regData.userData });
        return;
      }

      const successReg = JSON.parse(localStorage.getItem("successfulRegistration") || "null");
      if (successReg?.isSuccessfullyRegistered) {
        setIsLoggedIn(true);
        setUserInfo({
          username: successReg.username || "User",
          email: successReg.email,
          full_name: successReg.full_name,
        });
        return;
      }

      setIsLoggedIn(false);
      setUserInfo(null);
    } catch {
      setIsLoggedIn(false);
      setUserInfo(null);
    }
  };

  // ── Logout ─────────────────────────────────────────────────
  const handleLogout = () => {
    sessionStorage.removeItem("userLogin");
    sessionStorage.removeItem("userRegistration");
    sessionStorage.removeItem("authToken");
    localStorage.removeItem("successfulRegistration");
    localStorage.removeItem("registerFormData");
    setIsLoggedIn(false);
    setUserInfo(null);
    setDropdownOpen(false);
    setIsMobileMenuOpen(false);
    navigate("/");
  };

  // ── Effects ────────────────────────────────────────────────
  useEffect(() => {
    checkAuthStatus();
    const iv = setInterval(checkAuthStatus, 2000);
    const handleStorage = (e) => {
      if (["userLogin", "userRegistration", "successfulRegistration"].includes(e.key)) {
        checkAuthStatus();
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      clearInterval(iv);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close mobile menu on resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) setIsMobileMenuOpen(false);
      setDropdownOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <header>
      <nav className="navbar">
        {/* Logo */}
        <div className="logo" onClick={() => navigate("/")}>
          <span className="logo-bold">GISTREAM</span>
        </div>

        {/* Desktop: right side */}
        <div className="nav-icons desktop-only">
          {!isLoggedIn ? (
            <div className="auth-buttons">
              <button className="auth-btn login-btn" onClick={() => navigate("/login")}>
                Masuk
              </button>
            </div>
          ) : (
            <div className={`dropdown ${dropdownOpen ? "show" : ""}`} ref={dropdownRef}>
              <button
                className="user-btn logged-in"
                onClick={() => setDropdownOpen((p) => !p)}
              >
                <div className="user-avatar-circle">
                  {userInfo?.avatar ? (
                    <img src={userInfo.avatar} alt="avatar" style={{ width: '100%', height: '100%', borderRadius: 'inherit', objectFit: 'cover' }} />
                  ) : (
                    <Icons.User />
                  )}
                </div>
                <span className="username">
                  {userInfo?.username || userInfo?.full_name || "User"}
                </span>
                <Icons.ChevronDown />
              </button>

              <div className={`dropdown-menu ${dropdownOpen ? "show" : ""}`}>
                <div className="dropdown-user-info">
                  <strong>{userInfo?.full_name || userInfo?.username || "User"}</strong>
                  <small>{userInfo?.email || ""}</small>
                </div>

                <button
                  className="dropdown-item"
                  onClick={() => { setDropdownOpen(false); navigate("/profile"); }}
                >
                  <Icons.Profile />
                  Profil Saya
                </button>

                <div className="dropdown-divider" />

                <button className="dropdown-item logout-btn" onClick={handleLogout}>
                  <Icons.Logout />
                  Keluar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Mobile: hamburger */}
        <button className="mobile-menu-btn" onClick={() => setIsMobileMenuOpen((p) => !p)}>
          {isMobileMenuOpen ? <Icons.Close /> : <Icons.Menu />}
        </button>
      </nav>

      {/* Mobile menu panel */}
      <div className={`mobile-menu ${isMobileMenuOpen ? "open" : ""}`}>
        {!isLoggedIn ? (
          <div className="mobile-auth-buttons mobile-only">
            <button className="mobile-auth-btn login" onClick={() => { setIsMobileMenuOpen(false); navigate("/login"); }}>
              Masuk
            </button>
          </div>
        ) : (
          <div className="mobile-user-section mobile-only">
            <div className="mobile-user-info">
              <div className="mobile-user-avatar">
                {userInfo?.avatar ? (
                  <img src={userInfo.avatar} alt="avatar" style={{ width: '100%', height: '100%', borderRadius: 'inherit', objectFit: 'cover' }} />
                ) : (
                  <Icons.User />
                )}
              </div>
              <div className="user-details">
                <span className="username">
                  {userInfo?.username || userInfo?.full_name || "User"}
                </span>
                <span className="email">{userInfo?.email || ""}</span>
              </div>
            </div>

            <div className="mobile-menu-actions">
              <button
                className="mobile-menu-item"
                onClick={() => { setIsMobileMenuOpen(false); navigate("/profile"); }}
              >
                <Icons.Profile />
                Profil Saya
              </button>
              <button className="mobile-menu-item logout" onClick={handleLogout}>
                <Icons.Logout />
                Keluar
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
