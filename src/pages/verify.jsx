import { useState } from "react";

function Verify() {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    whatsapp: "",
  });
  const [otpCode, setOtpCode] = useState("");
  const [verificationResult, setVerificationResult] = useState(null);
  const [toast, setToast] = useState({ show: false, message: "", type: "" });
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpTimer, setOtpTimer] = useState(0);
  const [canResendOtp, setCanResendOtp] = useState(true);

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: "", type: "" });
    }, 3000);
  };

  // Function to generate token
  const generateToken = () => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const length = 32;
    let token = '';
    for (let i = 0; i < length; i++) {
      token += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return token;
  };

  // Function to save verified user data to localStorage
  const saveVerifiedUserData = (userData) => {
    const now = new Date();
    const verifiedData = {
      token: generateToken(),
      email: userData.email,
      whatsapp: userData.nomor_whatsaap || userData.whatsapp,
      membershipType: userData.membership_type,
      registeredDate: userData.registered_date,
      verifiedAt: {
        date: now.getDate(),
        month: now.getMonth() + 1, // Month is 0-indexed
        year: now.getFullYear(),
        fullDate: now.toISOString(),
        formatted: now.toLocaleDateString('id-ID', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      },
      status: 'verified',
      isActive: true
    };

    // Save to localStorage
    localStorage.setItem('jkt48_verified_user', JSON.stringify(verifiedData));
    
    // Also save token separately for quick access
    localStorage.setItem('jkt48_auth_token', verifiedData.token);

    console.log('User data saved to localStorage:', verifiedData);
    return verifiedData;
  };

  // Function to check if user is already verified
  const checkExistingVerification = () => {
    const savedData = localStorage.getItem('jkt48_verified_user');
    if (savedData) {
      try {
        return JSON.parse(savedData);
      } catch (error) {
        console.error('Error parsing saved data:', error);
        return null;
      }
    }
    return null;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const validateForm = () => {
    if (!formData.email.trim()) {
      showToast("Email harus diisi", "error");
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      showToast("Format email tidak valid", "error");
      return false;
    }

    if (!formData.whatsapp.trim()) {
      showToast("Nomor WhatsApp harus diisi", "error");
      return false;
    }

    const cleanWhatsapp = formData.whatsapp.replace(/\D/g, "");
    if (cleanWhatsapp.length < 10 || cleanWhatsapp.length > 15) {
      showToast("Nomor WhatsApp tidak valid (10-15 digit)", "error");
      return false;
    }

    return true;
  };

  const startOtpTimer = (seconds) => {
    setOtpTimer(seconds);
    setCanResendOtp(false);

    const interval = setInterval(() => {
      setOtpTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setCanResendOtp(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const sendOTP = async () => {
    try {
      setLoading(true);

      const response = await fetch(
        "https://v2.jkt48connect.my.id/api/otp/send?apikey=JKTCONNECT&username=vzy&password=vzy",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: formData.email.trim(),
            purpose: "membership verification",
          }),
        }
      );

      const data = await response.json();

      if (response.ok && data.success) {
        showToast("Kode OTP telah dikirim ke email Anda", "success");
        setOtpSent(true);
        startOtpTimer(data.data.cooldownSeconds || 60);
      } else {
        showToast(data.message || "Gagal mengirim OTP", "error");
      }
    } catch (error) {
      console.error("Send OTP error:", error);
      showToast("Gagal mengirim OTP. Silakan coba lagi.", "error");
    } finally {
      setLoading(false);
    }
  };

  const verifyOTP = async () => {
    if (!otpCode.trim() || otpCode.trim().length !== 6) {
      showToast("Masukkan kode OTP 6 digit yang valid", "error");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(
        "https://v2.jkt48connect.my.id/api/otp/verify?apikey=JKTCONNECT&username=vzy&password=vzy",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: formData.email.trim(),
            otp: otpCode.trim(),
          }),
        }
      );

      const data = await response.json();

      if (response.ok && data.success) {
        showToast("OTP berhasil diverifikasi! ✅", "success");

        const updatedResult = {
          ...verificationResult,
          otpVerified: true,
          fullyVerified: true,
          message: "Membership dan OTP berhasil diverifikasi!",
        };

        setVerificationResult(updatedResult);

        // Save verified user data to localStorage
        const savedData = saveVerifiedUserData(updatedResult);
        
        // Show success message with saved data info
        setTimeout(() => {
          showToast(`Data tersimpan dengan token: ${savedData.token.substring(0, 8)}...`, "success");
        }, 1000);

        setShowOtpInput(false);
      } else {
        const remainingAttempts = data.remainingAttempts;
        if (remainingAttempts !== undefined) {
          showToast(
            `Kode OTP salah. Sisa percobaan: ${remainingAttempts}`,
            "error"
          );
        } else {
          showToast(data.message || "Verifikasi OTP gagal", "error");
        }
      }
    } catch (error) {
      console.error("Verify OTP error:", error);
      showToast("Terjadi kesalahan saat verifikasi OTP", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e) => {
  e.preventDefault();

  if (!validateForm()) {
    return;
  }

  // Check if user is already verified with same email
  const existingVerification = checkExistingVerification();
  if (existingVerification && existingVerification.email === formData.email.trim()) {
    showToast("Email ini sudah terverifikasi sebelumnya!", "warning");
    setVerificationResult({
      ...existingVerification,
      verified: true,
      otpVerified: true,
      fullyVerified: true,
      message: "Membership Anda sudah terverifikasi sebelumnya!",
    });
    return;
  }

  setLoading(true);
  setVerificationResult(null);
  setShowOtpInput(false);
  setOtpSent(false);
  setOtpCode("");

  try {
    const response = await fetch(
      "https://v2.jkt48connect.my.id/api/verify/check?apikey=JKTCONNECT&username=vzy&password=vzy",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: formData.email.trim(),
          whatsapp: formData.whatsapp.trim(),
        }),
      }
    );

    const data = await response.json();

    if (response.ok && data.success) {
      // Check if data is actually not found (verified: false in response)
      if (data.data.verified === false) {
        showToast(data.data.message || data.message || "Data tidak ditemukan", "error");
        setVerificationResult(null);
        setLoading(false);
        return;
      }

      const isTrueValue = (value) => {
        if (typeof value === "boolean") return value;
        if (typeof value === "string") {
          return value.toLowerCase() === "true";
        }
        return false;
      };

      // Prioritize status_pengecekan_ and status fields
      const hasStatusPengecekan = "status_pengecekan_" in data.data;
      const hasStatus = "status" in data.data;
      const hasColumn3 = "column_3" in data.data;
      
      let isFullyVerified = false;
      
      // Check status_pengecekan_ first (highest priority)
      if (hasStatusPengecekan) {
        isFullyVerified = isTrueValue(data.data.status_pengecekan_);
      } 
      // Then check status field
      else if (hasStatus) {
        isFullyVerified = data.data.status && data.data.status.toLowerCase() === "valid";
      }
      // Finally fallback to column_3 (lowest priority, only if others don't exist)
      else if (hasColumn3) {
        isFullyVerified = isTrueValue(data.data.column_3);
      }
      // If none exist, default to false
      else {
        isFullyVerified = false;
      }

      if (!isFullyVerified) {
        setVerificationResult({
          ...data.data,
          verified: false,
          paymentPending: true,
          otpVerified: false,
          fullyVerified: false,
          message:
            "Data ditemukan, tetapi pembayaran belum terverifikasi oleh admin",
        });
        showToast(
          "Pembayaran Anda sedang dalam proses verifikasi",
          "warning"
        );
      } else {
        setVerificationResult({
          ...data.data,
          verified: true,
          paymentPending: false,
          otpVerified: false,
          fullyVerified: false,
          message:
            "Membership terverifikasi! Kode OTP sedang dikirim ke email Anda.",
        });
        setShowOtpInput(true);
        
        // Auto send OTP
        try {
          const otpResponse = await fetch(
            "https://v2.jkt48connect.my.id/api/otp/send?apikey=JKTCONNECT&username=vzy&password=vzy",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                email: formData.email.trim(),
                purpose: "membership verification",
              }),
            }
          );

          const otpData = await otpResponse.json();

          if (otpResponse.ok && otpData.success) {
            showToast("Kode OTP telah dikirim ke email Anda", "success");
            setOtpSent(true);
            startOtpTimer(otpData.data.cooldownSeconds || 60);
          } else {
            showToast(otpData.message || "Gagal mengirim OTP otomatis", "warning");
          }
        } catch (otpError) {
          console.error("Auto send OTP error:", otpError);
          showToast("OTP akan dikirim manual. Klik tombol Kirim OTP.", "warning");
        }
      }
    } else {
      showToast(data.message || "Data tidak ditemukan", "error");
      setVerificationResult(null);
    }
  } catch (error) {
    console.error("Verification error:", error);
    showToast(
      "Terjadi kesalahan saat verifikasi. Silakan coba lagi.",
      "error"
    );
    setVerificationResult(null);
  } finally {
    setLoading(false);
  }
};

  const handleReset = () => {
    setFormData({
      email: "",
      whatsapp: "",
    });
    setVerificationResult(null);
    setShowOtpInput(false);
    setOtpSent(false);
    setOtpCode("");
    setOtpTimer(0);
    setCanResendOtp(true);
  };

  const handleBackToHome = () => {
    window.location.href = "/";
  };

  // Function to clear localStorage (optional, for logout or reset)
  const clearVerificationData = () => {
    localStorage.removeItem('jkt48_verified_user');
    localStorage.removeItem('jkt48_auth_token');
    showToast("Data verifikasi telah dihapus", "success");
    handleReset();
  };

  return (
    <div className="container">
      {toast.show && (
        <div className={`toast toast-${toast.type}`}>
          <div className="toast-content">
            <div className="toast-icon">
              {toast.type === "success"
                ? "✅"
                : toast.type === "warning"
                ? "⚠️"
                : "❌"}
            </div>
            <span className="toast-message">{toast.message}</span>
          </div>
        </div>
      )}

      <div className="verify-container">
        <div className="verify-header">
          <h1>Verifikasi Membership</h1>
          <p>Cek status membership Anda dengan email dan nomor WhatsApp</p>
        </div>

        <div className="verify-content">
          <div className="verify-form-section">
            <div className="verify-form">
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="contoh@email.com"
                  className="form-input"
                  disabled={loading || showOtpInput}
                  autoComplete="email"
                />
                <small className="form-hint">
                  Email yang Anda gunakan saat mendaftar
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="whatsapp">Nomor WhatsApp</label>
                <input
                  type="tel"
                  id="whatsapp"
                  name="whatsapp"
                  value={formData.whatsapp}
                  onChange={handleInputChange}
                  placeholder="08123456789 atau +628123456789"
                  className="form-input"
                  disabled={loading || showOtpInput}
                />
                <small className="form-hint">
                  Nomor WhatsApp yang terdaftar (gunakan format yang sama saat
                  mendaftar)
                </small>
              </div>

              {showOtpInput && (
                <div className="otp-section">
                  <div className="otp-header">
                    <h3>🔐 Verifikasi Email</h3>
                    <p>Masukkan kode OTP yang telah dikirim ke email Anda</p>
                  </div>

                  <div className="form-group">
                    <label htmlFor="otp">Kode OTP (6 digit)</label>
                    <input
                      type="text"
                      id="otp"
                      value={otpCode}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, "");
                        if (value.length <= 6) {
                          setOtpCode(value);
                        }
                      }}
                      placeholder="000000"
                      className="form-input otp-input"
                      disabled={loading}
                      maxLength={6}
                    />
                    <small className="form-hint">
                      {otpSent
                        ? "Kode OTP telah dikirim. Periksa inbox atau folder spam Anda."
                        : "Klik tombol 'Kirim OTP' untuk menerima kode verifikasi"}
                    </small>
                  </div>

                  <div className="otp-actions">
                    {!otpSent ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-full"
                        onClick={sendOTP}
                        disabled={loading}
                      >
                        {loading ? "Mengirim..." : "📧 Kirim Kode OTP"}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn-primary btn-full"
                          onClick={verifyOTP}
                          disabled={loading || otpCode.length !== 6}
                        >
                          {loading ? "Memverifikasi..." : "✓ Verifikasi OTP"}
                        </button>

                        <button
                          type="button"
                          className="btn btn-outline btn-full"
                          onClick={sendOTP}
                          disabled={loading || !canResendOtp}
                        >
                          {otpTimer > 0
                            ? `Kirim Ulang (${otpTimer}s)`
                            : "🔄 Kirim Ulang OTP"}
                        </button>
                      </>
                    )}
                  </div>

                  {otpSent && (
                    <div className="otp-info">
                      <p>⏱️ Kode OTP berlaku selama 10 menit</p>
                      <p>📧 Periksa folder spam jika tidak menerima email</p>
                      <p>🔒 Maksimal 3 kali percobaan verifikasi</p>
                    </div>
                  )}
                </div>
              )}

              <div className="form-actions">
                {!showOtpInput && (
                  <button
                    type="button"
                    className="btn btn-primary btn-full"
                    disabled={loading}
                    onClick={handleVerify}
                  >
                    {loading ? "Memverifikasi..." : "Verifikasi Sekarang"}
                  </button>
                )}

                <button
                  type="button"
                  className="btn btn-outline btn-full"
                  onClick={handleReset}
                  disabled={loading}
                >
                  Reset Form
                </button>

                <button
                  type="button"
                  className="btn btn-secondary btn-full"
                  onClick={handleBackToHome}
                  disabled={loading}
                >
                  ← Kembali ke Beranda
                </button>
              </div>
            </div>
          </div>

          {verificationResult && (
            <div className="verify-result">
              <div
                className={`result-card ${
                  verificationResult.fullyVerified
                    ? "fully-verified"
                    : verificationResult.verified
                    ? "verified"
                    : verificationResult.paymentPending
                    ? "payment-pending"
                    : "not-verified"
                }`}
              >
                <div className="result-icon">
                  {verificationResult.fullyVerified
                    ? "🎉"
                    : verificationResult.verified
                    ? "📧"
                    : verificationResult.paymentPending
                    ? "⏳"
                    : "❌"}
                </div>

                <h2 className="result-title">
                  {verificationResult.fullyVerified
                    ? "Verifikasi Lengkap!"
                    : verificationResult.verified
                    ? "Verifikasi Email Diperlukan"
                    : verificationResult.paymentPending
                    ? "Pembayaran Belum Diverifikasi"
                    : "Tidak Ditemukan"}
                </h2>

                <p className="result-message">{verificationResult.message}</p>

                {verificationResult.fullyVerified && (
                  <div className="success-info">
                    <div className="success-icon">🎉</div>
                    <h3>Selamat!</h3>
                    <p className="success-text">
                      Membership Anda telah terverifikasi sepenuhnya. Anda dapat
                      mengakses semua fitur premium.
                    </p>
                    <div className="verification-steps">
                      <div className="vstep done">
                        <span className="vstep-icon">✓</span>
                        <span className="vstep-text">Data Terverifikasi</span>
                      </div>
                      <div className="vstep done">
                        <span className="vstep-icon">✓</span>
                        <span className="vstep-text">
                          Pembayaran Dikonfirmasi
                        </span>
                      </div>
                      <div className="vstep done">
                        <span className="vstep-icon">✓</span>
                        <span className="vstep-text">Email Terverifikasi</span>
                      </div>
                    </div>
                    
                    {/* Optional: Button to clear verification data */}
                    <button
                      type="button"
                      className="btn btn-outline btn-full"
                      onClick={clearVerificationData}
                      style={{ marginTop: '15px' }}
                    >
                      🗑️ Hapus Data Verifikasi
                    </button>
                  </div>
                )}

                {verificationResult.verified &&
                  !verificationResult.fullyVerified && (
                    <div className="otp-required-info">
                      <div className="otp-required-icon">📧</div>
                      <h3>Verifikasi Email Diperlukan</h3>
                      <p className="otp-required-text">
                        Data dan pembayaran Anda sudah terverifikasi. Langkah
                        terakhir adalah memverifikasi email Anda dengan kode
                        OTP.
                      </p>
                      <div className="verification-steps">
                        <div className="vstep done">
                          <span className="vstep-icon">✓</span>
                          <span className="vstep-text">Data Terverifikasi</span>
                        </div>
                        <div className="vstep done">
                          <span className="vstep-icon">✓</span>
                          <span className="vstep-text">
                            Pembayaran Dikonfirmasi
                          </span>
                        </div>
                        <div className="vstep pending">
                          <span className="vstep-icon">📧</span>
                          <span className="vstep-text">Verifikasi Email</span>
                        </div>
                      </div>
                      <p className="otp-instruction">
                        👈 Gunakan form di sebelah kiri untuk verifikasi OTP
                      </p>
                    </div>
                  )}

                {verificationResult.paymentPending && (
                  <div className="payment-pending-info">
                    <div className="pending-icon">⏳</div>
                    <h3>Status Pembayaran</h3>
                    <p className="pending-text">
                      Data Anda sudah terdaftar, namun pembayaran masih dalam
                      proses verifikasi oleh admin.
                    </p>
                    <div className="pending-steps">
                      <div className="step">
                        <span className="step-number">1</span>
                        <span className="step-text">Data Diterima</span>
                        <span className="step-status done">✓</span>
                      </div>
                      <div className="step">
                        <span className="step-number">2</span>
                        <span className="step-text">Verifikasi Pembayaran</span>
                        <span className="step-status pending">⏳</span>
                      </div>
                      <div className="step">
                        <span className="step-number">3</span>
                        <span className="step-text">
                          Verifikasi Email (OTP)
                        </span>
                        <span className="step-status waiting">○</span>
                      </div>
                      <div className="step">
                        <span className="step-number">4</span>
                        <span className="step-text">Akses Aktif</span>
                        <span className="step-status waiting">○</span>
                      </div>
                    </div>
                    <div className="pending-actions">
                      <p className="pending-note">
                        <strong>📝 Catatan:</strong> Proses verifikasi biasanya
                        memakan waktu 1-24 jam. Anda akan menerima notifikasi
                        melalui WhatsApp setelah pembayaran diverifikasi.
                      </p>
                    </div>
                  </div>
                )}

                {(verificationResult.verified ||
                  verificationResult.fullyVerified) && (
                  <div className="member-details">
                    <h3>Detail Membership</h3>

                    <div className="detail-row">
                      <span className="detail-label">Email:</span>
                      <span className="detail-value">
                        {verificationResult.email || "-"}
                      </span>
                    </div>

                    <div className="detail-row">
                      <span className="detail-label">WhatsApp:</span>
                      <span className="detail-value">
                        {verificationResult.nomor_whatsaap ||
                          verificationResult.whatsapp ||
                          "-"}
                      </span>
                    </div>

                    <div className="detail-row">
                      <span className="detail-label">Tipe Membership:</span>
                      <span
                        className={`membership-badge ${verificationResult.membership_type}`}
                      >
                        {verificationResult.membership_type === "monthly"
                          ? "💎 Bulanan"
                          : "⭐ Mingguan"}
                      </span>
                    </div>

                    {verificationResult.registered_date && (
                      <div className="detail-row">
                        <span className="detail-label">Tanggal Daftar:</span>
                        <span className="detail-value">
                          {verificationResult.registered_date}
                        </span>
                      </div>
                    )}

                    <div className="detail-row">
                      <span className="detail-label">Status Pembayaran:</span>
                      <span className="status-badge verified">
                        ✓ Terverifikasi
                      </span>
                    </div>

                    <div className="detail-row">
                      <span className="detail-label">Status Email:</span>
                      <span
                        className={`status-badge ${
                          verificationResult.otpVerified
                            ? "verified"
                            : "pending"
                        }`}
                      >
                        {verificationResult.otpVerified
                          ? "✓ Terverifikasi"
                          : "⏳ Belum Diverifikasi"}
                      </span>
                    </div>

                    <div className="detail-row">
                      <span className="detail-label">Status Akses:</span>
                      <span
                        className={`status-badge ${
                          verificationResult.fullyVerified
                            ? "active"
                            : "pending"
                        }`}
                      >
                        {verificationResult.fullyVerified
                          ? "Aktif"
                          : "Menunggu Verifikasi OTP"}
                      </span>
                    </div>
                  </div>
                )}

                {!verificationResult.verified &&
                  !verificationResult.paymentPending && (
                    <div className="not-found-info">
                      <p>📋 Kemungkinan penyebab:</p>
                      <ul>
                        <li>Email atau nomor WhatsApp tidak terdaftar</li>
                        <li>
                          Format nomor WhatsApp berbeda (coba dengan/tanpa +62
                          atau 08)
                        </li>
                        <li>Belum melakukan pendaftaran</li>
                        <li>Data belum diinput oleh admin</li>
                      </ul>
                    </div>
                  )}
              </div>
            </div>
          )}

          {!verificationResult && (
            <div className="verify-info">
              <div className="info-card">
                <h3>ℹ️ Informasi Verifikasi</h3>
                <ul className="info-list">
                  <li>
                    Masukkan email dan nomor WhatsApp yang sama dengan saat
                    pendaftaran
                  </li>
                  <li>Sistem akan mengecek data dan status pembayaran Anda</li>
                  <li>
                    Setelah data terverifikasi, kode OTP akan otomatis dikirim ke email Anda
                  </li>
                  <li>Masukkan kode OTP untuk menyelesaikan verifikasi</li>
                  <li>
                    Jika pembayaran belum diverifikasi, harap tunggu 1-24 jam
                  </li>
                  <li>Hubungi admin jika ada masalah</li>
                </ul>
              </div>

              <div className="membership-types">
                <h3>📦 Tipe Membership</h3>
                <div className="type-cards">
                  <div className="type-card monthly">
                    <div className="type-icon">💎</div>
                    <h4>Bulanan</h4>
                    <p>Akses penuh selama 1 bulan</p>
                  </div>
                  <div className="type-card weekly">
                    <div className="type-icon">⭐</div>
                    <h4>Mingguan</h4>
                    <p>Akses show mingguan</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .container {
          max-width: 1100px;
          margin: 0 auto;
          padding: 20px;
          min-height: 100vh;
        }

        .verify-container {
          background: white;
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          overflow: hidden;
          margin-top: 20px;
        }

        .verify-header {
          background: linear-gradient(135deg, #7b1c1c, #6a1818);
          color: white;
          text-align: center;
          padding: 40px 20px;
        }

        .verify-header h1 {
          margin-bottom: 10px;
          font-size: 2.2rem;
          font-weight: bold;
        }

        .verify-header p {
          font-size: 1.1rem;
          opacity: 0.9;
        }

        .verify-content {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 30px;
          padding: 30px;
        }

        .verify-form-section {
          display: flex;
          flex-direction: column;
        }

        .verify-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .form-group label {
          font-weight: 600;
          color: #333;
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .form-input {
          padding: 12px 16px;
          border: 2px solid #e1e5e9;
          border-radius: 8px;
          font-size: 16px;
          transition: all 0.3s;
          background: #f8f9fa;
        }

        .form-input:focus {
          outline: none;
          border-color: #7b1c1c;
          background: white;
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(123, 28, 28, 0.2);
        }

        .form-input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .form-hint {
          color: #666;
          font-size: 12px;
          font-style: italic;
        }

        /* OTP Section Styles */
        .otp-section {
          background: linear-gradient(135deg, #f0f9ff, #e0f2fe);
          border: 2px solid #0ea5e9;
          border-radius: 12px;
          padding: 20px;
          margin-top: 10px;
        }

        .otp-header {
          text-align: center;
          margin-bottom: 20px;
        }

        .otp-header h3 {
          color: #0c4a6e;
          font-size: 1.3rem;
          margin-bottom: 8px;
        }

        .otp-header p {
          color: #0369a1;
          font-size: 14px;
        }

        .otp-input {
          text-align: center;
          font-size: 24px;
          font-weight: 600;
          letter-spacing: 8px;
          font-family: "Courier New", monospace;
        }

        .otp-actions {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 15px;
        }

        .otp-info {
          background: white;
          border-radius: 8px;
          padding: 15px;
          margin-top: 15px;
          border-left: 4px solid #0ea5e9;
        }

        .otp-info p {
          font-size: 13px;
          color: #0c4a6e;
          margin: 5px 0;
        }

        .form-actions {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 20px;
        }

        .btn {
          padding: 14px 20px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 16px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          transition: all 0.3s;
          text-align: center;
        }

        .btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-primary {
          background: linear-gradient(135deg, #7b1c1c, #6a1818);
          color: white;
        }

        .btn-outline {
          background: transparent;
          border: 2px solid #7b1c1c;
          color: #7b1c1c;
        }

        .btn-outline:hover:not(:disabled) {
          background: #7b1c1c;
          color: white;
        }

        .btn-secondary {
          background: #6c757d;
          color: white;
        }

        .btn-secondary:hover:not(:disabled) {
          background: #5a6268;
        }

        .btn-full {
          width: 100%;
        }

        .verify-result {
          display: flex;
          flex-direction: column;
        }

        .result-card {
          background: #f8f9fa;
          border-radius: 12px;
          padding: 30px;
          text-align: center;
          border: 2px solid #e1e5e9;
        }

        .result-card.fully-verified {
          background: linear-gradient(135deg, #d4edda, #c3e6cb);
          border-color: #28a745;
        }

        .result-card.verified {
          background: linear-gradient(135deg, #e0f2fe, #bae6fd);
          border-color: #0ea5e9;
        }

        .result-card.payment-pending {
          background: linear-gradient(135deg, #fff3cd, #ffeaa7);
          border-color: #ffc107;
        }

        .result-card.not-verified {
          background: linear-gradient(135deg, #f8d7da, #f5c6cb);
          border-color: #f5c6cb;
        }

        .result-icon {
          font-size: 60px;
          margin-bottom: 20px;
        }

        .result-title {
          font-size: 1.8rem;
          margin-bottom: 10px;
          color: #333;
        }

        .result-message {
          font-size: 1.1rem;
          color: #666;
          margin-bottom: 20px;
        }

        /* Success Info Styles */
        .success-info {
          background: white;
          border-radius: 8px;
          padding: 25px;
          margin-top: 20px;
        }

        .success-icon {
          font-size: 50px;
          margin-bottom: 15px;
          animation: bounce 1s ease infinite;
        }

        @keyframes bounce {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-10px);
          }
        }

        .success-info h3 {
          color: #155724;
          margin-bottom: 10px;
          font-size: 1.3rem;
        }

        .success-text {
          color: #155724;
          margin-bottom: 20px;
          line-height: 1.6;
        }

        /* OTP Required Info Styles */
        .otp-required-info {
          background: white;
          border-radius: 8px;
          padding: 25px;
          margin-top: 20px;
        }

        .otp-required-icon {
          font-size: 50px;
          margin-bottom: 15px;
          animation: pulse 2s infinite;
        }

        .otp-required-info h3 {
          color: #0c4a6e;
          margin-bottom: 10px;
          font-size: 1.3rem;
        }

        .otp-required-text {
          color: #0369a1;
          margin-bottom: 20px;
          line-height: 1.6;
        }

        .otp-instruction {
          background: #f0f9ff;
          padding: 15px;
          border-radius: 8px;
          border-left: 4px solid #0ea5e9;
          color: #0c4a6e;
          font-weight: 600;
          margin-top: 15px;
        }

        /* Verification Steps */
        .verification-steps {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin: 20px 0;
        }

        .vstep {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: #f8f9fa;
          border-radius: 8px;
          border-left: 4px solid #e1e5e9;
        }

        .vstep.done {
          background: #d4edda;
          border-left-color: #28a745;
        }

        .vstep.pending {
          background: #e0f2fe;
          border-left-color: #0ea5e9;
          animation: pulse 2s infinite;
        }

        .vstep-icon {
          font-size: 20px;
          width: 30px;
          text-align: center;
        }

        .vstep-text {
          flex: 1;
          font-weight: 500;
          color: #333;
        }

        .payment-pending-info {
          background: white;
          border-radius: 8px;
          padding: 25px;
          margin-top: 20px;
          text-align: center;
        }

        .pending-icon {
          font-size: 50px;
          margin-bottom: 15px;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%,
          100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.7;
            transform: scale(1.1);
          }
        }

        .payment-pending-info h3 {
          color: #856404;
          margin-bottom: 10px;
          font-size: 1.3rem;
        }

        .pending-text {
          color: #666;
          margin-bottom: 20px;
          line-height: 1.6;
        }

        .pending-steps {
          display: flex;
          flex-direction: column;
          gap: 15px;
          margin: 20px 0;
          text-align: left;
        }

        .step {
          display: flex;
          align-items: center;
          gap: 15px;
          padding: 12px;
          background: #f8f9fa;
          border-radius: 8px;
          border-left: 4px solid #e1e5e9;
        }

        .step-number {
          background: #7b1c1c;
          color: white;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          flex-shrink: 0;
        }

        .step-text {
          flex: 1;
          font-weight: 500;
          color: #333;
        }

        .step-status {
          font-size: 20px;
          flex-shrink: 0;
        }

        .step-status.done {
          color: #28a745;
        }

        .step-status.pending {
          color: #ffc107;
          animation: pulse 2s infinite;
        }

        .step-status.waiting {
          color: #ccc;
        }

        .pending-actions {
          margin-top: 20px;
        }

        .pending-note {
          background: #f8f9fa;
          padding: 15px;
          border-radius: 8px;
          border-left: 4px solid #ffc107;
          text-align: left;
          font-size: 14px;
          color: #666;
          line-height: 1.6;
        }

        .pending-note strong {
          color: #856404;
        }

        .member-details {
          background: white;
          border-radius: 8px;
          padding: 20px;
          margin-top: 20px;
          text-align: left;
        }

        .member-details h3 {
          margin-bottom: 15px;
          color: #333;
          font-size: 1.2rem;
          border-bottom: 2px solid #e1e5e9;
          padding-bottom: 10px;
        }

        .detail-row {
          display: flex;
          justify-content: space-between;
          padding: 12px 0;
          border-bottom: 1px solid #f0f0f0;
          align-items: center;
        }

        .detail-row:last-child {
          border-bottom: none;
        }

        .detail-label {
          font-weight: 600;
          color: #666;
        }

        .detail-value {
          color: #333;
          font-weight: 500;
        }

        .membership-badge {
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: 600;
        }

        .membership-badge.monthly {
          background: linear-gradient(135deg, #ffd700, #ffed4e);
          color: #7b1c1c;
        }

        .membership-badge.weekly {
          background: linear-gradient(135deg, #87ceeb, #b0e0e6);
          color: #0c5460;
        }

        .status-badge {
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: 600;
        }

        .status-badge.verified {
          background: #d4edda;
          color: #155724;
        }

        .status-badge.active {
          background: #d4edda;
          color: #155724;
        }

        .status-badge.pending {
          background: #fff3cd;
          color: #856404;
        }

        .not-found-info {
          background: white;
          border-radius: 8px;
          padding: 20px;
          margin-top: 20px;
          text-align: left;
        }

        .not-found-info p {
          font-weight: 600;
          margin-bottom: 10px;
          color: #333;
        }

        .not-found-info ul {
          margin: 0;
          padding-left: 20px;
        }

        .not-found-info li {
          color: #666;
          margin-bottom: 8px;
          font-size: 14px;
        }

        .verify-info {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .info-card {
          background: #f8f9fa;
          border-radius: 8px;
          padding: 20px;
          border: 1px solid #e1e5e9;
        }

        .info-card h3 {
          margin-bottom: 15px;
          color: #333;
          font-size: 1.1rem;
        }

        .info-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .info-list li {
          padding: 8px 0;
          color: #666;
          font-size: 14px;
          border-bottom: 1px solid #eee;
          position: relative;
          padding-left: 20px;
        }

        .info-list li:before {
          content: "•";
          color: #7b1c1c;
          font-weight: bold;
          position: absolute;
          left: 0;
        }

        .info-list li:last-child {
          border-bottom: none;
        }

        .membership-types h3 {
          margin-bottom: 15px;
          color: #333;
          font-size: 1.1rem;
        }

        .type-cards {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
        }

        .type-card {
          background: white;
          border-radius: 8px;
          padding: 20px;
          text-align: center;
          border: 2px solid #e1e5e9;
          transition: all 0.3s;
        }

        .type-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .type-card.monthly {
          border-color: #ffd700;
        }

        .type-card.weekly {
          border-color: #87ceeb;
        }

        .type-icon {
          font-size: 40px;
          margin-bottom: 10px;
        }

        .type-card h4 {
          margin-bottom: 8px;
          color: #333;
          font-size: 1.1rem;
        }

        .type-card p {
          color: #666;
          font-size: 14px;
        }

        .toast {
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 1000;
          max-width: 400px;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          animation: slideIn 0.3s ease-out;
        }

        .toast-success {
          background: linear-gradient(135deg, #d4edda, #c3e6cb);
          border: 1px solid #c3e6cb;
          color: #155724;
        }

        .toast-warning {
          background: linear-gradient(135deg, #fff3cd, #ffeaa7);
          border: 1px solid #ffc107;
          color: #856404;
        }

        .toast-error {
          background: linear-gradient(135deg, #f8d7da, #f5c6cb);
          border: 1px solid #f5c6cb;
          color: #721c24;
        }

        .toast-content {
          display: flex;
          align-items: center;
          padding: 12px 16px;
          gap: 10px;
        }

        .toast-icon {
          font-size: 18px;
        }

        .toast-message {
          font-weight: 500;
          font-size: 14px;
        }

        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        @media (max-width: 768px) {
          .verify-content {
            grid-template-columns: 1fr;
            padding: 20px;
          }

          .verify-header h1 {
            font-size: 1.8rem;
          }

          .type-cards {
            grid-template-columns: 1fr;
          }

          .result-icon {
            font-size: 50px;
          }

          .result-title {
            font-size: 1.5rem;
          }

          .otp-instruction {
            font-size: 13px;
          }
        }

        @media (max-width: 480px) {
          .verify-header {
            padding: 30px 15px;
          }

          .verify-content {
            padding: 15px;
          }

          .form-input {
            font-size: 16px;
          }

          .btn {
            padding: 16px 20px;
          }

          .toast {
            right: 10px;
            left: 10px;
            max-width: none;
          }

          .otp-input {
            font-size: 20px;
            letter-spacing: 4px;
          }
        }
      `}</style>
    </div>
  );
}

export default Verify;

