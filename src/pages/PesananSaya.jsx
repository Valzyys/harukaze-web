import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/my-orders.css";

function MyOrders() {
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(null);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [toast, setToast] = useState({ show: false, message: '', type: '' });
  const navigate = useNavigate();

  useEffect(() => {
    // Ambil data user dari sessionStorage
    const getUserData = () => {
      try {
        const storedUserData = sessionStorage.getItem('userData');
        const storedPurchaseData = sessionStorage.getItem('purchaseData');
        const storedCheckoutData = sessionStorage.getItem('checkoutData');
        
        // Prioritas: userData -> purchaseData -> checkoutData
        if (storedUserData) {
          return JSON.parse(storedUserData);
        } else if (storedPurchaseData) {
          const purchaseData = JSON.parse(storedPurchaseData);
          return {
            email: purchaseData.email,
            nama: purchaseData.nama,
            nomor_hp: purchaseData.nomor_hp,
            alamat: purchaseData.alamat
          };
        } else if (storedCheckoutData) {
          const checkoutData = JSON.parse(storedCheckoutData);
          return {
            email: checkoutData.email,
            nama: checkoutData.nama,
            nomor_hp: checkoutData.nomor_hp,
            alamat: checkoutData.alamat
          };
        }
        return null;
      } catch (error) {
        console.error('Error reading user data from sessionStorage:', error);
        return null;
      }
    };

    const user = getUserData();
    if (!user || !user.email) {
      setError("Data pesanan tidak ditemukan. Silakan lakukan pemesanan terlebih dahulu.");
      setLoading(false);
      return;
    }

    setUserData(user);
    fetchOrdersData(user);
  }, []);

  const fetchOrdersData = async (user) => {
    try {
      setLoading(true);
      setError("");

      // Fetch data dari API menggunakan email
      const response = await fetch(
        `https://v2.jkt48connect.com/api/nayrakuen/cari-data?email=${encodeURIComponent(user.email)}&username=vzy&password=vzy`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (!result.status) {
        throw new Error(result.message || "Gagal mengambil data pesanan");
      }

      if (result.count === 0 || !result.data) {
        setOrders([]);
        setLoading(false);
        return;
      }

      // Filter dan match data berdasarkan alamat, nama, atau nomor HP
      const matchedOrders = result.data.filter(order => {
        // Normalize alamat untuk perbandingan
        const normalizeAddress = (addr) => {
          return addr ? addr.toLowerCase().replace(/[^\w\s]/g, '').trim() : '';
        };

        const orderAddress = normalizeAddress(order.alamat);
        const userAddress = normalizeAddress(user.alamat);
        
        // Match berdasarkan beberapa kriteria
        const addressMatch = orderAddress.includes(userAddress.substring(0, 20)) || 
                           userAddress.includes(orderAddress.substring(0, 20));
        const nameMatch = order.nama.toLowerCase() === user.nama.toLowerCase();
        const phoneMatch = order.nomor_hp === user.nomor_hp;

        return addressMatch || nameMatch || phoneMatch;
      });

      // Urutkan berdasarkan tanggal terbaru
      const sortedOrders = matchedOrders.sort((a, b) => 
        new Date(b.created_at) - new Date(a.created_at)
      );

      setOrders(sortedOrders);
    } catch (err) {
      console.error("Error fetching orders:", err);
      setError(err.message || "Terjadi kesalahan saat mengambil data pesanan");
    } finally {
      setLoading(false);
    }
  };

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: '', type: '' });
    }, 3000);
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      'belum bayar': { class: 'status-pending', text: 'Belum Bayar', icon: '' },
      'lunas': { class: 'status-paid', text: 'Lunas', icon: '' },
      'dikemas': { class: 'status-processing', text: 'Dikemas', icon: '📦' },
      'dikirim': { class: 'status-shipped', text: 'Dikirim', icon: '🚚' },
      'selesai': { class: 'status-completed', text: 'Selesai', icon: '🎉' },
      'dibatalkan': { class: 'status-cancelled', text: 'Dibatalkan', icon: '❌' }
    };

    const config = statusConfig[status?.toLowerCase()] || statusConfig['belum bayar'];
    
    return (
      <span className={`status-badge ${config.class}`}>
        <span className="status-icon">{config.icon}</span>
        {config.text}
      </span>
    );
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(price);
  };

  const handleOrderClick = (order) => {
    showToast(`Detail pesanan ${order.customer_id}`, 'info');
  };

  const refreshOrders = () => {
    if (userData) {
      fetchOrdersData(userData);
      showToast("Data pesanan berhasil diperbarui");
    }
  };

  const goToShopping = () => {
    navigate('/');
  };

  if (loading) {
    return (
      <div className="container">
        <div className="orders-loading">
          <div className="loading-spinner"></div>
          <p>Memuat data pesanan...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <div className="error-container">
          <div className="error-icon">⚠️</div>
          <h2>Terjadi Kesalahan</h2>
          <p>{error}</p>
          <button className="btn btn-primary" onClick={goToShopping}>
            Kembali ke Beranda
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      {/* Toast Notification */}
      {toast.show && (
        <div className={`toast toast-${toast.type}`}>
          <div className="toast-content">
            <div className="toast-icon">
              {toast.type === 'success' ? '✅' : toast.type === 'info' ? 'ℹ️' : '❌'}
            </div>
            <span className="toast-message">{toast.message}</span>
          </div>
        </div>
      )}

      <div className="orders-header">
        <h1>Pesanan Saya</h1>
        <button className="btn btn-outline btn-refresh" onClick={refreshOrders}>
           Refresh
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="empty-orders">
          <div className="empty-orders-icon">📦</div>
          <h2>Belum Ada Pesanan</h2>
          <p>Anda belum memiliki pesanan apapun</p>
          <button className="btn btn-primary" onClick={goToShopping}>
            Mulai Berbelanja
          </button>
        </div>
      ) : (
        <div className="orders-content">
          <div className="orders-summary">
            <div className="summary-card">
              <h3>Ringkasan</h3>
              <div className="summary-stats">
                <div className="stat-item">
                  <span className="stat-number">{orders.length}</span>
                  <span className="stat-label">Total Pesanan</span>
                </div>
                <div className="stat-item">
                  <span className="stat-number">
                    {orders.filter(o => o.status === 'lunas').length}
                  </span>
                  <span className="stat-label">Lunas</span>
                </div>
                <div className="stat-item">
                  <span className="stat-number">
                    {orders.filter(o => o.status === 'belum bayar').length}
                  </span>
                  <span className="stat-label">Pending</span>
                </div>
              </div>
            </div>
          </div>

          <div className="orders-list">
            {orders.map((order) => (
              <div key={order.customer_id} className="order-card" onClick={() => handleOrderClick(order)}>
                <div className="order-header">
                  <div className="order-id">
                    <h3>#{order.customer_id}</h3>
                    <span className="order-date">{formatDate(order.created_at)}</span>
                  </div>
                  {getStatusBadge(order.status)}
                </div>

                <div className="order-body">
                  <div className="order-product">
                    <h4>{order.product}</h4>
                    <p className="order-price">{formatPrice(order.harga)}</p>
                  </div>

                  <div className="order-details">
                    <div className="detail-row">
                      <span className="detail-label">Alamat:</span>
                      <span className="detail-value">{order.alamat}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">No. HP:</span>
                      <span className="detail-value">{order.nomor_hp}</span>
                    </div>
                  </div>

                  <div className="order-timeline">
                    <div className="timeline-item">
                      <span className="timeline-date">
                        {formatDate(order.created_at)}
                      </span>
                      <span className="timeline-event">Pesanan dibuat</span>
                    </div>
                    {order.updated_at !== order.created_at && (
                      <div className="timeline-item">
                        <span className="timeline-date">
                          {formatDate(order.updated_at)}
                        </span>
                        <span className="timeline-event">Status terakhir diperbarui</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="orders-actions">
            <button className="btn btn-outline" onClick={goToShopping}>
              Lanjut Berbelanja
            </button>
            <button className="btn btn-secondary" onClick={refreshOrders}>
              Refresh Data
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default MyOrders;
