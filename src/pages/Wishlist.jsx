import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/wishlist.css";

function Wishlist() {
  const [loading, setLoading] = useState(true);
  const [wishlistItems, setWishlistItems] = useState([]);
  const [toast, setToast] = useState({ show: false, message: '', type: '' });
  const navigate = useNavigate();

  useEffect(() => {
    const getWishlistItems = () => {
      try {
        const wishlistData = JSON.parse(localStorage.getItem('wishlist') || '[]');
        return wishlistData;
      } catch (error) {
        console.error('Error reading wishlist from localStorage:', error);
        return [];
      }
    };

    const items = getWishlistItems();
    setWishlistItems(items);
    setLoading(false);
  }, []);

  const saveWishlistItems = (items) => {
    try {
      localStorage.setItem('wishlist', JSON.stringify(items));
      window.dispatchEvent(new CustomEvent('wishlistUpdated'));
    } catch (error) {
      console.error('Error saving wishlist to localStorage:', error);
    }
  };

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: '', type: '' });
    }, 3000);
  };

  const removeFromWishlist = (productId, productName) => {
    const updatedItems = wishlistItems.filter(item => item.id !== productId);
    setWishlistItems(updatedItems);
    saveWishlistItems(updatedItems);
    showToast(`${productName} berhasil dihapus dari wishlist`);
  };

  const addToCart = (item) => {
    try {
      const existingCart = JSON.parse(localStorage.getItem('cart') || '[]');
      
      const productToAdd = {
        id: item.id,
        name: item.name,
        price: item.price,
        image_url: item.image_url,
        quantity: 1,
        addedAt: new Date().toISOString()
      };
      
      const existingProductIndex = existingCart.findIndex(cartItem => cartItem.id === item.id);
      
      if (existingProductIndex > -1) {
        existingCart[existingProductIndex].quantity += 1;
        showToast(`${item.name} sudah ada di keranjang, jumlah ditambah`);
      } else {
        existingCart.push(productToAdd);
        showToast(`${item.name} berhasil ditambahkan ke keranjang`);
      }
      
      localStorage.setItem('cart', JSON.stringify(existingCart));
      window.dispatchEvent(new CustomEvent('cartUpdated'));
      
    } catch (error) {
      console.error('Error adding to cart:', error);
      showToast('Gagal menambahkan ke keranjang. Silakan coba lagi.', 'error');
    }
  };

  const handleBuyItem = (item) => {
    navigate(`/purchase/${item.id}`);
  };

  const continueShopping = () => {
    navigate('/');
  };

  const viewProduct = (item) => {
    navigate(`/product/${item.id}`);
  };

  if (loading) {
    return (
      <div className="container">
        <div className="wishlist-loading">
          <div className="loading-spinner"></div>
          <p>Memuat wishlist...</p>
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
              {toast.type === 'success' ? '✅' : '❌'}
            </div>
            <span className="toast-message">{toast.message}</span>
          </div>
        </div>
      )}

      <div className="wishlist-header">
        <h1>Wishlist</h1>
        <p>{wishlistItems.length} produk dalam wishlist</p>
      </div>

      {wishlistItems.length === 0 ? (
        <div className="empty-wishlist">
          <div className="empty-wishlist-icon">❤️</div>
          <h2>Wishlist Anda Kosong</h2>
          <p>Belum ada produk yang ditambahkan ke wishlist</p>
          <button className="btn btn-primary" onClick={continueShopping}>
            Mulai Berbelanja
          </button>
        </div>
      ) : (
        <div className="wishlist-content">
          <div className="wishlist-items">
            {wishlistItems.map((item) => (
              <div key={item.id} className="wishlist-item">
                <div className="wishlist-item-image" onClick={() => viewProduct(item)}>
                  <img src={item.image_url} alt={item.name} />
                  <div className="wishlist-overlay">
                    <span>Lihat Detail</span>
                  </div>
                </div>
                
                <div className="wishlist-item-details">
                  <h3 className="wishlist-item-name" onClick={() => viewProduct(item)}>
                    {item.name}
                  </h3>
                  <p className="wishlist-item-price">Rp {item.price.toLocaleString()}</p>
                  <p className="wishlist-item-added">
                    Ditambahkan: {new Date(item.addedAt).toLocaleDateString('id-ID')}
                  </p>
                </div>

                <div className="wishlist-item-actions">
                  <button 
                    className="btn btn-primary btn-sm"
                    onClick={() => addToCart(item)}
                  >
                    + Keranjang
                  </button>
                  <button 
                    className="btn btn-success btn-sm"
                    onClick={() => handleBuyItem(item)}
                  >
                    Beli Sekarang
                  </button>
                  <button 
                    className="btn btn-danger btn-sm"
                    onClick={() => removeFromWishlist(item.id, item.name)}
                    title="Hapus dari wishlist"
                  >
                    Hapus
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="wishlist-summary">
            <div className="summary-card">
              <h3>Ringkasan Wishlist</h3>
              <div className="summary-row">
                <span>Total Produk:</span>
                <span>{wishlistItems.length} item</span>
              </div>
              <div className="summary-row">
                <span>Produk Terfavorit:</span>
                <span>{wishlistItems.length > 0 ? wishlistItems[0].name.substring(0, 20) + '...' : '-'}</span>
              </div>

              <div className="summary-actions">
                <button className="btn btn-outline btn-full" onClick={continueShopping}>
                  Lanjut Berbelanja
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Wishlist;
