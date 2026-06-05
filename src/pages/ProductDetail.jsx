import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import "../styles/product-details.css";

function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);
  const [togglingWishlist, setTogglingWishlist] = useState(false);
  const [isInWishlist, setIsInWishlist] = useState(false);
  const [product, setProduct] = useState(null);
  const [mainImage, setMainImage] = useState("");
  const [toast, setToast] = useState({ show: false, message: '', type: '' });

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const res = await fetch(
          `https://backend-seven-nu-19.vercel.app/api/merchant/products/${id}`
        );
        const data = await res.json();

        if (res.ok) {
          setProduct(data);

          if (Array.isArray(data.image_url) && data.image_url.length > 0) {
            setMainImage(data.image_url[0]);
          } else {
            setMainImage(data.image_url);
          }
          
          // Cek apakah produk sudah ada di wishlist
          checkWishlistStatus(data.id);
        } else {
          setProduct(null);
        }
      } catch (err) {
        console.error("Gagal ambil detail produk:", err);
        setProduct(null);
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [id]);

  // Function untuk mengecek status wishlist
  const checkWishlistStatus = (productId) => {
    try {
      const existingWishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
      const isWishlisted = existingWishlist.some(item => item.id === productId);
      setIsInWishlist(isWishlisted);
    } catch (error) {
      console.error('Error checking wishlist status:', error);
      setIsInWishlist(false);
    }
  };

  if (!loading && !product) return <p>Produk tidak ditemukan</p>;

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: '', type: '' });
    }, 3000);
  };

  const handleAddToCart = () => {
    setAddingToCart(true);
    
    try {
      // Ambil data keranjang yang sudah ada dari localStorage
      const existingCart = JSON.parse(localStorage.getItem('cart') || '[]');
      
      // Data produk yang akan disimpan
      const productToAdd = {
        id: product.id,
        name: product.name,
        price: product.price,
        image_url: Array.isArray(product.image_url) ? product.image_url[0] : product.image_url,
        quantity: 1,
        addedAt: new Date().toISOString()
      };
      
      // Cek apakah produk sudah ada di keranjang
      const existingProductIndex = existingCart.findIndex(item => item.id === product.id);
      
      if (existingProductIndex > -1) {
        // Jika sudah ada, tambah quantity
        existingCart[existingProductIndex].quantity += 1;
      } else {
        // Jika belum ada, tambah produk baru
        existingCart.push(productToAdd);
      }
      
      // Simpan kembali ke localStorage
      localStorage.setItem('cart', JSON.stringify(existingCart));
      
      // Trigger event untuk update cart count di header
      window.dispatchEvent(new CustomEvent('cartUpdated'));
      
      // Tampilkan notifikasi atau feedback
      console.log('Produk berhasil ditambahkan ke keranjang!');
      
      setTimeout(() => {
        setAddingToCart(false);
        // Tampilkan toast notification
        showToast('Produk berhasil ditambahkan ke keranjang!', 'success');
      }, 500);
      
    } catch (error) {
      console.error('Gagal menambahkan ke keranjang:', error);
      setAddingToCart(false);
      showToast('Gagal menambahkan ke keranjang. Silakan coba lagi.', 'error');
    }
  };

  const handleToggleWishlist = () => {
    setTogglingWishlist(true);
    
    try {
      // Ambil data wishlist yang sudah ada dari localStorage
      const existingWishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
      
      // Data produk yang akan disimpan
      const productToAdd = {
        id: product.id,
        name: product.name,
        price: product.price,
        image_url: Array.isArray(product.image_url) ? product.image_url[0] : product.image_url,
        addedAt: new Date().toISOString()
      };
      
      // Cek apakah produk sudah ada di wishlist
      const existingProductIndex = existingWishlist.findIndex(item => item.id === product.id);
      
      if (existingProductIndex > -1) {
        // Jika sudah ada, hapus dari wishlist
        existingWishlist.splice(existingProductIndex, 1);
        setIsInWishlist(false);
        
        setTimeout(() => {
          setTogglingWishlist(false);
          showToast('Produk dihapus dari wishlist!', 'success');
        }, 500);
      } else {
        // Jika belum ada, tambah ke wishlist
        existingWishlist.push(productToAdd);
        setIsInWishlist(true);
        
        setTimeout(() => {
          setTogglingWishlist(false);
          showToast('Produk ditambahkan ke wishlist!', 'success');
        }, 500);
      }
      
      // Simpan kembali ke localStorage
      localStorage.setItem('wishlist', JSON.stringify(existingWishlist));
      
      // Trigger event untuk update wishlist count jika ada
      window.dispatchEvent(new CustomEvent('wishlistUpdated'));
      
    } catch (error) {
      console.error('Gagal mengubah status wishlist:', error);
      setTogglingWishlist(false);
      showToast('Gagal mengubah status wishlist. Silakan coba lagi.', 'error');
    }
  };

  const handleBuyNow = () => {
    setBuying(true);
    setTimeout(() => {
      navigate(`/purchase/${product.id}`);
    }, 1500);
  };

  return (
    <>
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

      <div className="product-detail container">
        {loading ? (
          <div className="product-detail-grid">
            <div className="skeleton-img"></div>
            <div className="product-info">
              <div className="skeleton-text long"></div>
              <div className="skeleton-text short"></div>
              <div className="skeleton-text long"></div>
              <div className="skeleton-text short"></div>
            </div>
          </div>
        ) : (
          <div className="product-detail-grid">
            <div className="product-image-wrapper">
              <div className="main-image-container">
                <img
                  src={mainImage}
                  alt={product.name}
                  className="product-image"
                />

                {/* Wishlist Button - positioned on top of image */}
                <button
                  className={`btn-wishlist ${isInWishlist ? 'wishlisted' : ''} ${togglingWishlist ? 'loading' : ''}`}
                  onClick={handleToggleWishlist}
                  disabled={togglingWishlist}
                  title={isInWishlist ? 'Hapus dari Wishlist' : 'Tambah ke Wishlist'}
                >
                  {togglingWishlist ? (
                    <span className="wishlist-loading">⏳</span>
                  ) : (
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill={isInWishlist ? "#ff6b6b" : "none"}
                      stroke={isInWishlist ? "#ff6b6b" : "#666"}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                  )}
                </button>

                {Array.isArray(product.image_url) &&
                  product.image_url.length > 1 && (
                    <div className="product-thumbnails">
                      {product.image_url.map((url, index) => (
                        <img
                          key={index}
                          src={url}
                          alt={`${product.name}-${index}`}
                          className={`thumbnail ${
                            url === mainImage ? "active" : ""
                          }`}
                          onClick={() => setMainImage(url)}
                        />
                      ))}
                    </div>
                  )}
              </div>
            </div>

            <div className="product-info">
              <h1 className="product-title">{product.name}</h1>
              <p className="product-price">
                Rp {product.price.toLocaleString()}
              </p>

              <div className="product-actions">
                <button 
                  className={`btn btn-cart ${addingToCart ? "loading-ring" : ""}`}
                  onClick={handleAddToCart}
                  disabled={addingToCart}
                >
                  {addingToCart ? <span className="ring"></span> : "Masukkan Keranjang"}
                </button>
                <button
                  className={`btn btn-buy ${buying ? "loading-ring" : ""}`}
                  onClick={handleBuyNow}
                  disabled={buying}
                >
                  {buying ? <span className="ring"></span> : "Beli Sekarang"}
                </button>
              </div>

              <div className="product-section">
                <h3>Detail Produk</h3>
                <div className="product-description">
                  {product.description
                    ? product.description.split("\n").map((line, index) => (
                        <p key={index}>{line}</p>
                      ))
                    : "Tidak ada deskripsi"}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default ProductDetail;
