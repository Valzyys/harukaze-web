import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/Success.css";

function Success() {
  const navigate = useNavigate();

  useEffect(() => {
    const purchaseData = sessionStorage.getItem("purchaseData");
    if (!purchaseData) {
      navigate("/");
    }
  }, []);

  const handleViewOrder = () => {
    navigate("/myorder");
  };

  const handleClose = () => {
    sessionStorage.removeItem("purchaseData");
    navigate("/");
  };

  return (
    <div className="success-container">
      <div className="checkmark-wrapper">
        <div className="checkmark">✓</div>
      </div>
      <h2>Pembelian Berhasil!</h2>
      <p>Terima kasih telah melakukan pembelian. Pesanan Anda berhasil disimpan.</p>
      <div className="success-buttons">
        <button onClick={handleViewOrder}>Lihat Pesanan</button>
        <button onClick={handleClose}>Tutup</button>
      </div>
    </div>
  );
}

export default Success;
