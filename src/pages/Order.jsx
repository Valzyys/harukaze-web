import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/order.css";

function Order() {
  const navigate = useNavigate();
  const [orderData, setOrderData] = useState(null);

  useEffect(() => {
    const storedOrder = sessionStorage.getItem("checkoutData");
    if (!storedOrder) {
      alert("Pesanan tidak ditemukan atau sudah ditutup!");
      navigate("/");
    } else {
      setOrderData(JSON.parse(storedOrder));
    }
  }, []);

  if (!orderData) return null;

  return (
    <div className="order container">
      <h2>Pesanan Anda</h2>

      <div className="invoice-section">
        <h3>Data Pembeli</h3>
        <p><strong>Nama:</strong> {orderData.nama}</p>
        <p><strong>Email:</strong> {orderData.email}</p>
        <p><strong>No. Telpon:</strong> {orderData.telpon}</p>
        <p><strong>Alamat:</strong> {orderData.alamat}</p>
      </div>

      <div className="invoice-section">
        <h3>Rincian Produk</h3>
        <table className="invoice-table">
          <tbody>
            <tr>
              <td>Produk</td>
              <td>{orderData.product_name}</td>
            </tr>
            <tr>
              <td>Harga Produk</td>
              <td>Rp {orderData.total - orderData.ongkir + orderData.diskon - orderData.kode_unik}</td>
            </tr>
            <tr>
              <td>Ongkir</td>
              <td>Rp {orderData.ongkir.toLocaleString()}</td>
            </tr>
            <tr>
              <td>Diskon</td>
              <td>- Rp {orderData.diskon.toLocaleString()}</td>
            </tr>
            <tr>
              <td>Kode Unik</td>
              <td>Rp {orderData.kode_unik.toLocaleString()}</td>
            </tr>
            <tr className="total-row">
              <td><strong>Total Bayar</strong></td>
              <td><strong>Rp {orderData.total.toLocaleString()}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      <button
        className="btn-close-order"
        onClick={() => {
          sessionStorage.removeItem("checkoutData"); 
          navigate("/"); 
        }}
      >
        Tutup Pesanan
      </button>
    </div>
  );
}

export default Order;
