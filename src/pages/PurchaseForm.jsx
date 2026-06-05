import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import "../styles/purchase-form.css";

function PurchaseForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: "",
    nama: "",
    nomor_hp: "",
    alamat: "",
    detail_alamat: "", // Tambahan untuk detail alamat
    member: "non", // default non-anggota
    code_redeem: "", // Tambahan untuk code redeem
  });
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [autoFillApplied, setAutoFillApplied] = useState(false);
  
  // State untuk redeem code
  const [redeemCodeError, setRedeemCodeError] = useState("");
  const [redeemCodeSuccess, setRedeemCodeSuccess] = useState("");
  const [validatingCode, setValidatingCode] = useState(false);
  const [redeemData, setRedeemData] = useState(null); // Untuk menyimpan data redeem yang valid

  // Function untuk mendapatkan data dari berbagai sumber localStorage/sessionStorage
  const getStoredUserData = () => {
    try {
      // 1. Cek data registrasi yang berhasil di localStorage
      const successfulReg = localStorage.getItem('successfulRegistration');
      if (successfulReg) {
        const regData = JSON.parse(successfulReg);
        console.log('Found successful registration data:', regData);
        return {
          email: regData.email,
          nama: regData.full_name || regData.username,
          nomor_hp: regData.nomor_hp || '',
          source: 'successful_registration'
        };
      }

      // 2. Cek data form registrasi yang tersimpan di localStorage
      const registerFormData = localStorage.getItem('registerFormData');
      if (registerFormData) {
        const formData = JSON.parse(registerFormData);
        console.log('Found register form data:', formData);
        return {
          email: formData.email,
          nama: formData.full_name || formData.username,
          nomor_hp: formData.nomor_hp || '',
          source: 'register_form'
        };
      }

      // 3. Cek data login di sessionStorage
      const loginData = sessionStorage.getItem('userLogin');
      if (loginData) {
        const login = JSON.parse(loginData);
        console.log('Found login data:', login);
        if (login.isLoggedIn && login.user) {
          return {
            email: login.user.email,
            nama: login.user.full_name || login.user.username,
            nomor_hp: login.user.nomor_hp || '',
            source: 'login_session'
          };
        }
      }

      // 4. Cek data registrasi di sessionStorage
      const regData = sessionStorage.getItem('userRegistration');
      if (regData) {
        const registration = JSON.parse(regData);
        console.log('Found registration session data:', registration);
        if (registration.isRegistered) {
          return {
            email: registration.userData?.email || '',
            nama: registration.userData?.full_name || registration.username,
            nomor_hp: registration.userData?.nomor_hp || '',
            source: 'registration_session'
          };
        }
      }

      // 5. Cek data user yang tersimpan dari form sebelumnya
      const userData = sessionStorage.getItem('userData');
      if (userData) {
        const user = JSON.parse(userData);
        console.log('Found user session data:', user);
        return {
          email: user.email,
          nama: user.nama,
          nomor_hp: user.nomor_hp,
          alamat: user.alamat,
          source: 'user_session'
        };
      }

      console.log('No stored user data found');
      return null;
    } catch (error) {
      console.error('Error getting stored user data:', error);
      return null;
    }
  };

  // Function untuk mendapatkan data alamat dari localStorage
  const getStoredAddressData = () => {
    try {
      const userAddress = localStorage.getItem('userAddress');
      if (userAddress) {
        const addressData = JSON.parse(userAddress);
        console.log('Found stored address data:', addressData);
        return {
          alamat: addressData.alamat || '',
          source: 'user_address'
        };
      }
      return null;
    } catch (error) {
      console.error('Error getting stored address data:', error);
      return null;
    }
  };

  // Function untuk auto-fill form dari data yang tersimpan
  const autoFillFormFromStorage = () => {
    if (autoFillApplied) return; // Hindari auto-fill berulang

    const userData = getStoredUserData();
    const addressData = getStoredAddressData();

    if (userData || addressData) {
      const updatedForm = { ...form };
      let hasChanges = false;

      // Fill user data
      if (userData) {
        if (userData.email && !updatedForm.email) {
          updatedForm.email = userData.email;
          hasChanges = true;
        }
        if (userData.nama && !updatedForm.nama) {
          updatedForm.nama = userData.nama;
          hasChanges = true;
        }
        if (userData.nomor_hp && !updatedForm.nomor_hp) {
          updatedForm.nomor_hp = userData.nomor_hp;
          hasChanges = true;
        }
        if (userData.alamat && !updatedForm.alamat) {
          updatedForm.alamat = userData.alamat;
          hasChanges = true;
        }
      }

      // Fill address data (prioritas dari localStorage userAddress)
      if (addressData && addressData.alamat && !updatedForm.alamat) {
        updatedForm.alamat = addressData.alamat;
        hasChanges = true;
      }

      if (hasChanges) {
        setForm(updatedForm);
        setAutoFillApplied(true);
        
        // Show success message
        const sources = [];
        if (userData) sources.push(userData.source);
        if (addressData) sources.push(addressData.source);
        
        console.log(`Auto-filled form from: ${sources.join(', ')}`);
        
        // Set a temporary success message (optional)
        setTimeout(() => {
          // You could show a toast or notification here
          console.log('Form auto-filled successfully');
        }, 500);
      }
    }
  };

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const res = await fetch(
          `https://backend-seven-nu-19.vercel.app/api/merchant/products/${id}`
        );
        const data = await res.json();
        if (res.ok) {
          setProduct(data);
        } else {
          setError("Produk tidak ditemukan.");
        }
      } catch (err) {
        console.error("Gagal ambil detail produk:", err);
        setError("Gagal mengambil data produk.");
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [id]);

  // Auto-fill form ketika component mount
  useEffect(() => {
    // Delay sedikit untuk memastikan state form sudah ter-initialize
    const timer = setTimeout(() => {
      autoFillFormFromStorage();
    }, 100);

    return () => clearTimeout(timer);
  }, []); // Empty dependency array, hanya jalankan sekali saat mount

  // Function untuk menyimpan data pengguna ke sessionStorage
  const saveUserDataToSession = (userData) => {
    try {
      // Simpan data pengguna untuk halaman pesanan saya
      const userSessionData = {
        email: userData.email,
        nama: userData.nama,
        nomor_hp: userData.nomor_hp,
        alamat: userData.alamat,
        product_id: id,
        saved_at: new Date().toISOString()
      };
      
      sessionStorage.setItem("userData", JSON.stringify(userSessionData));
      console.log("User data saved to session:", userSessionData);
    } catch (err) {
      console.error("Error saving user data to session:", err);
    }
  };

  // Function untuk validasi redeem code
  const validateRedeemCode = async (code, email) => {
    if (!code.trim()) {
      setRedeemCodeError("");
      setRedeemCodeSuccess("");
      setRedeemData(null);
      return;
    }

    if (!email.trim()) {
      setRedeemCodeError("Email harus diisi terlebih dahulu untuk validasi code redeem");
      return;
    }

    setValidatingCode(true);
    setRedeemCodeError("");
    setRedeemCodeSuccess("");

    try {
      const res = await fetch(
        `https://v2.jkt48connect.com/api/nayrakuen/lihat-redeem?username=vzy&password=vzy`
      );
      const result = await res.json();

      if (result.status && result.data) {
        // Cari code yang sesuai
        const matchingCode = result.data.find(item => 
          item.code === code.trim() && 
          item.is_active === true && 
          item.is_used === false
        );

        if (matchingCode) {
          // Code ditemukan, cek email
          if (matchingCode.email.toLowerCase() === email.toLowerCase()) {
            // Code dan email valid
            setRedeemCodeSuccess(`Code valid! Diskon ${matchingCode.discount_type === 'nominal' 
              ? `Rp ${matchingCode.discount_value.toLocaleString('id-ID')}` 
              : `${matchingCode.discount_percentage}%`} akan diterapkan.`);
            setRedeemData(matchingCode);
          } else {
            // Code valid tapi email tidak cocok
            setRedeemCodeError("Email tidak terdaftar untuk code redeem ini");
            setRedeemData(null);
          }
        } else {
          // Code tidak ditemukan atau tidak valid
          const codeExists = result.data.find(item => item.code === code.trim());
          if (codeExists) {
            if (!codeExists.is_active) {
              setRedeemCodeError("Code redeem tidak aktif");
            } else if (codeExists.is_used) {
              setRedeemCodeError("Code redeem sudah digunakan");
            }
          } else {
            setRedeemCodeError("Code redeem tidak valid");
          }
          setRedeemData(null);
        }
      } else {
        setRedeemCodeError("Gagal memvalidasi code redeem");
        setRedeemData(null);
      }
    } catch (err) {
      console.error("Error validating redeem code:", err);
      setRedeemCodeError("Terjadi kesalahan saat validasi code redeem");
      setRedeemData(null);
    } finally {
      setValidatingCode(false);
    }
  };

  // Function untuk search alamat dari HERE Maps API
  const searchAddress = async (query) => {
    if (query.length < 3) {
      setAddressSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setSearchingAddress(true);
    try {
      const apiKey = "ZcgqQFaE9azO73XJTasyhgHSVBST-aHpmj-VF4UM6sY"; // ganti dengan API Key HERE kamu
      const url = `https://autosuggest.search.hereapi.com/v1/autosuggest?at=-6.2,106.8&q=${encodeURIComponent(
        query
      )}&limit=5&apiKey=${apiKey}`;

      const res = await fetch(url);
      const data = await res.json();

      // Filter hanya alamat/tempat yang punya address
      const suggestions = data.items.filter(
        (item) => item.address && item.address.label
      );

      setAddressSuggestions(suggestions);
      setShowSuggestions(suggestions.length > 0);
    } catch (err) {
      console.error("Error searching address:", err);
      setAddressSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setSearchingAddress(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    const updatedForm = {
      ...form,
      [name]: value,
    };
    
    setForm(updatedForm);

    // Simpan data ke sessionStorage setiap kali ada perubahan pada field utama
    if (['email', 'nama', 'nomor_hp', 'alamat'].includes(name) && value.trim()) {
      // Gabungkan alamat dan detail alamat untuk penyimpanan
      const fullAddress = name === 'alamat' 
        ? (updatedForm.detail_alamat ? `${value}, ${updatedForm.detail_alamat}` : value)
        : (updatedForm.detail_alamat ? `${updatedForm.alamat}, ${updatedForm.detail_alamat}` : updatedForm.alamat);
      
      const dataToSave = {
        email: updatedForm.email,
        nama: updatedForm.nama,
        nomor_hp: updatedForm.nomor_hp,
        alamat: fullAddress,
      };
      
      // Hanya simpan jika semua field utama terisi
      if (dataToSave.email && dataToSave.nama && dataToSave.nomor_hp && dataToSave.alamat) {
        saveUserDataToSession(dataToSave);
      }
    }

    // Simpan juga ketika detail alamat berubah
    if (name === 'detail_alamat') {
      const fullAddress = updatedForm.alamat 
        ? (value ? `${updatedForm.alamat}, ${value}` : updatedForm.alamat)
        : '';
      
      if (updatedForm.email && updatedForm.nama && updatedForm.nomor_hp && fullAddress) {
        const dataToSave = {
          email: updatedForm.email,
          nama: updatedForm.nama,
          nomor_hp: updatedForm.nomor_hp,
          alamat: fullAddress,
        };
        saveUserDataToSession(dataToSave);
      }
    }

    // Trigger address search when alamat field changes
    if (name === "alamat") {
      searchAddress(value);
    }

    // Reset redeem code validation when member status changes
    if (name === "member") {
      setRedeemCodeError("");
      setRedeemCodeSuccess("");
      setRedeemData(null);
      if (value === "non") {
        setForm(prev => ({ ...prev, code_redeem: "" }));
      }
    }

    // Validate redeem code when email or code changes
    if (name === "email" && form.member === "yes" && form.code_redeem) {
      // Debounce validation untuk email
      setTimeout(() => {
        validateRedeemCode(form.code_redeem, value);
      }, 500);
    }

    if (name === "code_redeem") {
      // Debounce validation untuk code
      setTimeout(() => {
        validateRedeemCode(value, form.email);
      }, 500);
    }
  };

  // Function untuk select alamat dari suggestion
  const selectAddress = (selectedAddress) => {
    const updatedForm = {
      ...form,
      alamat: selectedAddress.address.label,
    };
    
    setForm(updatedForm);
    setShowSuggestions(false);
    setAddressSuggestions([]);
    
    // Simpan data ke sessionStorage setelah memilih alamat
    if (updatedForm.email && updatedForm.nama && updatedForm.nomor_hp) {
      const fullAddress = updatedForm.detail_alamat 
        ? `${selectedAddress.address.label}, ${updatedForm.detail_alamat}`
        : selectedAddress.address.label;
      
      const dataToSave = {
        email: updatedForm.email,
        nama: updatedForm.nama,
        nomor_hp: updatedForm.nomor_hp,
        alamat: fullAddress,
      };
      saveUserDataToSession(dataToSave);
    }
    
    console.log(
      "Selected address - Lat:",
      selectedAddress.position?.lat,
      "Lon:",
      selectedAddress.position?.lng
    );
  };

  // Function untuk hide suggestions ketika click outside
  const handleAddressBlur = () => {
    // Delay untuk memungkinkan click pada suggestion
    setTimeout(() => {
      setShowSuggestions(false);
    }, 200);
  };

  // Function untuk manual refresh auto-fill (opsional)
  const refreshAutoFill = () => {
    setAutoFillApplied(false);
    setTimeout(() => {
      autoFillFormFromStorage();
    }, 100);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.email || !form.nama || !form.nomor_hp || !form.alamat) {
      setError("Harap lengkapi semua field wajib.");
      return;
    }

    if (!product) {
      setError("Produk tidak valid.");
      return;
    }

    // Validasi redeem code jika diisi
    if (form.member === "yes" && form.code_redeem && !redeemData) {
      setError("Code redeem tidak valid atau belum divalidasi.");
      return;
    }

    setSubmitting(true);

    try {
      const params = new URLSearchParams({
        username: "vzy",
        password: "vzy",
        email: form.email,
        limit: 1,
      });

      const res = await fetch(
        `https://v2.jkt48connect.com/api/nayrakuen/cari-data?${params}`
      );
      const result = await res.json();

      let dataToSave;

      // Gabungkan alamat dan detail alamat
      const fullAddress = form.detail_alamat
        ? `${form.alamat}, ${form.detail_alamat}`
        : form.alamat;

      if (result.status && result.count > 0) {
        const existing = result.data[0];
        dataToSave = {
          customer_id: existing.customer_id,
          nama: existing.nama,
          alamat: fullAddress,
          nomor_hp: existing.nomor_hp,
          email: existing.email,
          member: existing.member,
          product_id: id,
        };
      } else {
        dataToSave = {
          product_id: id,
          email: form.email,
          nama: form.nama,
          nomor_hp: form.nomor_hp,
          alamat: fullAddress,
          member: form.member,
        };
      }

      // Tambahkan data redeem jika ada
      if (redeemData) {
        dataToSave.redeem_code = redeemData.code;
        dataToSave.discount_type = redeemData.discount_type;
        dataToSave.discount_value = redeemData.discount_value;
        dataToSave.discount_percentage = redeemData.discount_percentage;
      }

      // Simpan data final ke sessionStorage sebelum navigate
      const finalUserData = {
        email: dataToSave.email,
        nama: dataToSave.nama,
        nomor_hp: dataToSave.nomor_hp,
        alamat: dataToSave.alamat,
      };
      saveUserDataToSession(finalUserData);

      sessionStorage.setItem("purchaseData", JSON.stringify(dataToSave));
      navigate("/checkout");
    } catch (err) {
      setError("Terjadi kesalahan koneksi.");
      console.error("Error checking email:", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="purchase-form">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 className="form-title">Form Penginputan Pembelian</h2>
        {/* Auto-fill indicator/refresh button (opsional) */}
        {autoFillApplied && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '10px',
            padding: '5px 10px',
            backgroundColor: '#e8f5e8',
            borderRadius: '4px',
            fontSize: '12px',
            color: '#2d5a2d'
          }}>
            <span>✓ Form auto-filled from saved data</span>
            <button 
              type="button"
              onClick={refreshAutoFill}
              style={{
                background: 'none',
                border: 'none',
                color: '#2d5a2d',
                cursor: 'pointer',
                fontSize: '12px',
                textDecoration: 'underline'
              }}
            >
              Refresh
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="skeleton-form">
          <div className="skeleton skeleton-label"></div>
          <div className="skeleton skeleton-input"></div>
          <div className="skeleton skeleton-label"></div>
          <div className="skeleton skeleton-input"></div>
          <div className="skeleton skeleton-label"></div>
          <div className="skeleton skeleton-input"></div>
          <div className="skeleton skeleton-label"></div>
          <div className="skeleton skeleton-textarea"></div>
          <div className="skeleton skeleton-button"></div>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="contoh: adam@gmail.com"
              required
            />
          </label>
          <label>
            Nama
            <input
              type="text"
              name="nama"
              value={form.nama}
              onChange={handleChange}
              placeholder="contoh: Adam"
              required
            />
          </label>
          <label>
            No Telepon
            <input
              type="tel"
              name="nomor_hp"
              value={form.nomor_hp}
              onChange={handleChange}
              placeholder="contoh: 0898XXXXXXXX"
              required
            />
          </label>
          
          {/* Address field with HERE Maps integration */}
          <label>
            Alamat Utama
            <div className="address-input-container" style={{ position: 'relative' }}>
              <input
                type="text"
                name="alamat"
                value={form.alamat}
                onChange={handleChange}
                onBlur={handleAddressBlur}
                placeholder="Ketik alamat... (minimal 3 karakter)"
                required
                style={{ width: '100%' }}
              />
              {searchingAddress && (
                <div className="address-loading" style={{ 
                  position: 'absolute', 
                  right: '10px', 
                  top: '50%', 
                  transform: 'translateY(-50%)',
                  fontSize: '12px',
                  color: '#666'
                }}>
                  Mencari...
                </div>
              )}
              
              {/* Address suggestions dropdown */}
              {showSuggestions && addressSuggestions.length > 0 && (
                <ul className="address-suggestions" style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  backgroundColor: 'white',
                  border: '1px solid #ddd',
                  borderTop: 'none',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  zIndex: 1000,
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                  borderRadius: '0 0 4px 4px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}>
                  {addressSuggestions.map((address, index) => (
                    <li
                      key={index}
                      onClick={() => selectAddress(address)}
                      style={{
                        padding: '10px',
                        cursor: 'pointer',
                        borderBottom: '1px solid #eee',
                        fontSize: '14px',
                        lineHeight: '1.4'
                      }}
                      onMouseEnter={(e) => e.target.style.backgroundColor = '#f5f5f5'}
                      onMouseLeave={(e) => e.target.style.backgroundColor = 'white'}
                    >
                      {address.address.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </label>

          {/* Detail alamat field */}
          <label>
            Detail Alamat (Opsional)
            <textarea
              name="detail_alamat"
              value={form.detail_alamat}
              onChange={handleChange}
              placeholder="contoh: Blok A No. 15, Lantai 2, dekat Indomaret"
              rows="2"
              style={{ resize: 'vertical' }}
            />
            <small style={{ fontSize: '12px', color: '#666', marginTop: '5px', display: 'block' }}>
              Tambahkan detail seperti nomor rumah, blok, lantai, patokan, dll.
            </small>
          </label>

          <label>
            Status Anggota Fanbase
            <select
              name="member"
              value={form.member}
              onChange={handleChange}
              required
            >
              <option value="non">Bukan Anggota</option>
              <option value="yes">Anggota Fanbase</option>
            </select>
          </label>

          {/* Code Redeem field - hanya tampil jika member = "yes" */}
          {form.member === "yes" && (
            <label>
              Code Redeem (Opsional)
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  name="code_redeem"
                  value={form.code_redeem}
                  onChange={handleChange}
                  placeholder="Masukkan code redeem..."
                  style={{ 
                    width: '100%',
                    paddingRight: validatingCode ? '80px' : '10px'
                  }}
                />
                {validatingCode && (
                  <div style={{ 
                    position: 'absolute', 
                    right: '10px', 
                    top: '50%', 
                    transform: 'translateY(-50%)',
                    fontSize: '12px',
                    color: '#666'
                  }}>
                    Validating...
                  </div>
                )}
              </div>
              
              {/* Pesan error atau success untuk redeem code */}
              {redeemCodeError && (
                <small style={{ 
                  fontSize: '12px', 
                  color: '#e74c3c', 
                  marginTop: '5px', 
                  display: 'block' 
                }}>
                  {redeemCodeError}
                </small>
              )}
              
              {redeemCodeSuccess && (
                <small style={{ 
                  fontSize: '12px', 
                  color: '#27ae60', 
                  marginTop: '5px', 
                  display: 'block',
                  fontWeight: '500'
                }}>
                  {redeemCodeSuccess}
                </small>
              )}
              
              <small style={{ fontSize: '12px', color: '#666', marginTop: '5px', display: 'block' }}>
                Masukkan code redeem untuk mendapatkan diskon. Email harus diisi terlebih dahulu.
              </small>
            </label>
          )}

          {error && <p className="error">{error}</p>}

          <div className="button-container">
            <button type="submit" disabled={submitting}>
              {submitting ? (
                <div className="btn-loader">
                  <span className="loader-ring"></span>
                  Mengecek...
                </div>
              ) : (
                "Submit"
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default PurchaseForm;
