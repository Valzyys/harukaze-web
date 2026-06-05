import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/cart.css";

function Cart() {
  const [loading, setLoading] = useState(true);
  const [cartItems, setCartItems] = useState([]);
  const [toast, setToast] = useState({ show: false, message: '', type: '' });
  const navigate = useNavigate();

  useEffect(() => {
    const getCartItems = () => {
      try {
        const cartData = JSON.parse(localStorage.getItem('cart') || '[]');
        return cartData;
      } catch (error) {
        console.error('Error reading cart from localStorage:', error);
        return [];
      }
    };

    const items = getCartItems();
    setCartItems(items);
    setLoading(false);
  }, []);

  const saveCartItems = (items) => {
    try {
      localStorage.setItem('cart', JSON.stringify(items));
      window.dispatchEvent(new CustomEvent('cartUpdated'));
    } catch (error) {
      console.error('Error saving cart to localStorage:', error);
    }
  };

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: '', type: '' });
    }, 3000);
  };

  const updateQuantity = (productId, newQuantity) => {
    if (newQuantity <= 0) return;

    const updatedItems = cartItems.map(item => 
      item.id === productId 
        ? { ...item, quantity: newQuantity }
        : item
    );
    
    setCartItems(updatedItems);
    saveCartItems(updatedItems);
    showToast('Jumlah produk berhasil diupdate');
  };

  const removeFromCart = (productId, productName) => {
    const updatedItems = cartItems.filter(item => item.id !== productId);
    setCartItems(updatedItems);
    saveCartItems(updatedItems);
    showToast(`${productName} berhasil dihapus dari keranjang`);
  };

  const clearCart = () => {
    if (window.confirm('Apakah Anda yakin ingin mengosongkan seluruh keranjang?')) {
      setCartItems([]);
      saveCartItems([]);
      showToast('Keranjang berhasil dikosongkan');
    }
  };

  const getTotalPrice = () => {
    return cartItems.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  const getTotalItems = () => {
    return cartItems.reduce((total, item) => total + item.quantity, 0);
  };

  const handleCheckout = () => {
    if (cartItems.length === 0) {
      showToast('Keranjang kosong, silakan tambahkan produk terlebih dahulu', 'error');
      return;
    }
    showToast('Menuju ke halaman checkout...', 'success');
    console.log('Checkout with items:', cartItems);
  };

  const handleBuyItem = (item) => {
    navigate(`/purchase/${item.id}`);
  };

  const continueShopping = () => {
    navigate('/');
  };

  if (loading) {
    return (
      <div className="container">
        <div className="cart-loading">
          <div className="loading-spinner"></div>
          <p>Memuat keranjang...</p>
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

      <div className="cart-header">
        <h1>🛒 Keranjang Belanja</h1>
        <p>{getTotalItems()} item dalam keranjang</p>
      </div>

      {cartItems.length === 0 ? (
        <div className="empty-cart">
          <div className="empty-cart-icon">🛒</div>
          <h2>Keranjang Anda Kosong</h2>
          <p>Belum ada produk yang ditambahkan ke keranjang</p>
          <button className="btn btn-primary" onClick={continueShopping}>
            Mulai Berbelanja
          </button>
        </div>
      ) : (
        <div className="cart-content">
          <div className="cart-items">
            {cartItems.map((item) => (
              <div key={item.id} className="cart-item">
                <div className="cart-item-image">
                  <img src={item.image_url} alt={item.name} />
                </div>
                
                <div className="cart-item-details">
                  <h3 className="cart-item-name">{item.name}</h3>
                  <p className="cart-item-price">Rp {item.price.toLocaleString()}</p>
                  <p className="cart-item-added">
                    Ditambahkan: {new Date(item.addedAt).toLocaleDateString('id-ID')}
                  </p>
                </div>

                <div className="cart-item-controls">
                  <div className="quantity-controls">
                    <button 
                      className="qty-btn"
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      disabled={item.quantity <= 1}
                    >
                      -
                    </button>
                    <span className="quantity">{item.quantity}</span>
                    <button 
                      className="qty-btn"
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    >
                      +
                    </button>
                  </div>

                  <div className="item-total">
                    <strong>Rp {(item.price * item.quantity).toLocaleString()}</strong>
                  </div>

                  <div className="item-actions">
                    <button 
                      className="btn btn-sm btn-primary"
                      onClick={() => handleBuyItem(item)}
                    >
                      Beli
                    </button>
                    <button 
                      className="btn btn-sm btn-danger"
                      onClick={() => removeFromCart(item.id, item.name)}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="cart-summary">
            <div className="summary-card">
              <h3>Ringkasan Belanja</h3>
              <div className="summary-row">
                <span>Total Item:</span>
                <span>{getTotalItems()} item</span>
              </div>
              <div className="summary-row">
                <span>Subtotal:</span>
                <span>Rp {getTotalPrice().toLocaleString()}</span>
              </div>
              <div className="summary-row total">
                <span><strong>Total:</strong></span>
                <span><strong>Rp {getTotalPrice().toLocaleString()}</strong></span>
              </div>

              <div className="summary-actions">
                <button className="btn btn-outline" onClick={continueShopping}>
                  Lanjut Belanja
                </button>
                <button className="btn btn-danger btn-outline" onClick={clearCart}>
                  Kosongkan Keranjang
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Cart;
