import { useEffect, useState, useRef, useCallback } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import ProductDetail from "./pages/ProductDetail";
import PurchaseForm from "./pages/PurchaseForm";
import Checkout from "./pages/Checkout";
import Cart from "./pages/Cart";
import Wishlist from "./pages/Wishlist";
import Success from "./pages/Success";
import Order from "./pages/Order";
import MyOrders from "./pages/PesananSaya";
import Register from "./pages/Register";
import Login from "./pages/Login";
import ProfilePage from "./pages/Profile";
import Header from "./components/Header";
import LiveStream from "./pages/live";
import Verify from "./pages/verify";
import Replay from "./pages/replay";
import AdminLive from "./pages/admin";
import BuyShowAccess from "./pages/buy-show";

// ─────────────────────────────────────────────────────────────
//  APP
// ─────────────────────────────────────────────────────────────
function App() {
 // const devToolsOpen = useStrictDevToolsDetection();

//  if (devToolsOpen) return <DevToolsBlocker />;

  return (
    <Router>
      <Header />
      <main>
        <Routes>
          <Route path="/"                   element={<Home />} />
          <Route path="/keranjang"          element={<Cart />} />
          <Route path="/product/:id"        element={<ProductDetail />} />
          <Route path="/purchase/:id"       element={<PurchaseForm />} />
          <Route path="/checkout"           element={<Checkout />} />
          <Route path="/wish"               element={<Wishlist />} />
          <Route path="/success"            element={<Success />} />
          <Route path="/order"              element={<Order />} />
          <Route path="/myorder"            element={<MyOrders />} />
          <Route path="/register"           element={<Register />} />
          <Route path="/login"              element={<Login />} />
          <Route path="/profile"            element={<ProfilePage />} />
          <Route path="/live/:playbackId"   element={<LiveStream />} />
          <Route path="/verify"             element={<Verify />} />
          <Route path="/replay/:playbackId" element={<Replay />} /> 
          <Route path="/buyshow" element={<BuyShowAccess />} />
          <Route path="/admin" element={<AdminLive />} />
          <Route path="*"                   element={<NotFound />} />
        </Routes>
      </main>
    </Router>
  );
}

// ─────────────────────────────────────────────────────────────
//  404
// ─────────────────────────────────────────────────────────────
function NotFound() {
  return (
    <div style={{
      textAlign:      "center",
      padding:        "50px 20px",
      minHeight:      "60vh",
      display:        "flex",
      flexDirection:  "column",
      justifyContent: "center",
      alignItems:     "center",
    }}>
      <h1 style={{ fontSize: "48px", color: "#e74c3c", marginBottom: "20px" }}>404</h1>
      <h2 style={{ fontSize: "24px", marginBottom: "20px" }}>Halaman Tidak Ditemukan</h2>
      <p style={{ fontSize: "16px", color: "#666", marginBottom: "30px" }}>
        Maaf, halaman yang Anda cari tidak dapat ditemukan.
      </p>
      <a
        href="/"
        style={{
          backgroundColor: "#3498db",
          color:           "white",
          padding:         "12px 24px",
          textDecoration:  "none",
          borderRadius:    "4px",
          fontSize:        "16px",
        }}
      >
        Kembali ke Beranda
      </a>
    </div>
  );
}

export default App;
