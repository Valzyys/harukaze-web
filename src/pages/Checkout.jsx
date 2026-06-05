import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/checkout.css";

function Checkout() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [product, setProduct] = useState(null);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const [loadingProduct, setLoadingProduct] = useState(true);
  const [loadingOngkir, setLoadingOngkir] = useState(false);
  const [ongkir, setOngkir] = useState(0);
  const [ongkirError, setOngkirError] = useState("");

  const kodeUnik = 123;
  const originId = 17473; // ID asal (sesuaikan dengan lokasi toko)

  useEffect(() => {
    const storedData =
      sessionStorage.getItem("customerData") ||
      sessionStorage.getItem("purchaseData");

    if (!storedData) {
      navigate("/", { replace: true });
      return;
    }

    const parsedData = JSON.parse(storedData);
    setData(parsedData);

    const fetchProducts = async () => {
      try {
        const res = await fetch(
          "https://backend-seven-nu-19.vercel.app/api/merchant/products"
        );
        if (!res.ok) throw new Error("Gagal mengambil data produk");
        const productsData = await res.json();

        const selected = productsData.find(
          (p) =>
            p.id ===
            parseInt(parsedData.product_id || parsedData.product_id_ref)
        );

        if (!selected) throw new Error("Produk tidak ditemukan");
        setProduct(selected);
      } catch (err) {
        console.error(err);
        setError(err.message);
      } finally {
        setLoadingProduct(false);
      }
    };

    fetchProducts();
  }, [navigate]);

  // Function untuk mengekstrak informasi alamat secara dinamis
  const extractAddressInfo = (alamat) => {
    const alamatLower = alamat.toLowerCase();
    const parts = alamat.split(',').map(part => part.trim());
    
    const extractedInfo = {
      kecamatan: null,
      kota: null,
      kelurahan: null,
      zipCode: null,
      keywords: []
    };
    
    // Cari kode pos (5 digit angka)
    const zipMatch = alamat.match(/\b\d{5}\b/);
    if (zipMatch) {
      extractedInfo.zipCode = zipMatch[0];
    }
    
    // Keywords umum untuk identifikasi kecamatan/kabupaten
    const kecamatanKeywords = [
      'kec', 'kecamatan', 'kab', 'kabupaten', 'kota'
    ];
    
    // Keywords umum untuk identifikasi kelurahan/desa
    const kelurahanKeywords = [
      'desa', 'kelurahan', 'kel', 'ds'
    ];
    
    // Ekstrak informasi dari setiap bagian alamat
    parts.forEach((part, index) => {
      const partLower = part.toLowerCase();
      const cleanPart = part.replace(/[^\w\s]/g, '').trim();
      
      // Skip jika terlalu pendek
      if (cleanPart.length < 3) return;
      
      // Cek apakah ini kecamatan/kabupaten
      const isKecamatan = kecamatanKeywords.some(keyword => 
        partLower.includes(keyword)
      );
      
      // Cek apakah ini kelurahan/desa
      const isKelurahan = kelurahanKeywords.some(keyword => 
        partLower.includes(keyword)
      );
      
      if (isKecamatan && !extractedInfo.kecamatan) {
        // Ambil nama kecamatan tanpa prefix
        let kecamatanName = cleanPart;
        kecamatanKeywords.forEach(keyword => {
          kecamatanName = kecamatanName.replace(new RegExp(keyword, 'gi'), '').trim();
        });
        if (kecamatanName) {
          extractedInfo.kecamatan = kecamatanName.toLowerCase();
        }
      } else if (isKelurahan && !extractedInfo.kelurahan) {
        // Ambil nama kelurahan tanpa prefix
        let kelurahanName = cleanPart;
        kelurahanKeywords.forEach(keyword => {
          kelurahanName = kelurahanName.replace(new RegExp(keyword, 'gi'), '').trim();
        });
        if (kelurahanName) {
          extractedInfo.kelurahan = kelurahanName.toLowerCase();
        }
      } else {
        // Tambahkan sebagai keyword umum jika tidak kosong
        if (cleanPart && !extractedInfo.keywords.includes(cleanPart.toLowerCase())) {
          extractedInfo.keywords.push(cleanPart.toLowerCase());
        }
      }
    });
    
    // Jika tidak ada kecamatan yang teridentifikasi, coba ambil dari bagian akhir alamat
    if (!extractedInfo.kecamatan && parts.length >= 2) {
      const possibleKecamatan = parts[parts.length - 2].replace(/[^\w\s]/g, '').trim();
      if (possibleKecamatan && possibleKecamatan.length >= 3) {
        extractedInfo.kecamatan = possibleKecamatan.toLowerCase();
      }
    }
    
    // Jika tidak ada kelurahan, coba ambil dari bagian awal alamat
    if (!extractedInfo.kelurahan && parts.length >= 1) {
      const possibleKelurahan = parts[0].replace(/[^\w\s]/g, '').trim();
      if (possibleKelurahan && possibleKelurahan.length >= 3) {
        extractedInfo.kelurahan = possibleKelurahan.toLowerCase();
      }
    }
    
    // Identifikasi kota dari keywords atau bagian alamat
    extractedInfo.keywords.forEach(keyword => {
      if (keyword.length > 4 && !extractedInfo.kota) {
        extractedInfo.kota = keyword;
      }
    });
    
    return extractedInfo;
  };

  // Function untuk mencari destination ID berdasarkan alamat
  const findDestinationId = async (alamat) => {
    try {
      console.log("Mencari destination untuk alamat:", alamat);
      
      const extractedInfo = extractAddressInfo(alamat);
      console.log("Extracted info:", extractedInfo);
      
      // Function untuk menghitung skor kecocokan
      const calculateMatchScore = (destination) => {
        let score = 0;
        const destLabel = destination.label.toLowerCase();
        const destCity = destination.city_name.toLowerCase();
        const destDistrict = destination.district_name.toLowerCase();
        const destSubdistrict = destination.subdistrict_name.toLowerCase();
        
        // Bonus besar jika kode pos cocok (prioritas utama)
        if (extractedInfo.zipCode && destination.zip_code === extractedInfo.zipCode) {
          score += 100;
        }
        
        // Bonus jika kecamatan cocok
        if (extractedInfo.kecamatan) {
          if (destDistrict.includes(extractedInfo.kecamatan) || 
              destLabel.includes(extractedInfo.kecamatan)) {
            score += 50;
          }
        }
        
        // Bonus jika kelurahan/desa cocok
        if (extractedInfo.kelurahan) {
          if (destSubdistrict.includes(extractedInfo.kelurahan) || 
              destLabel.includes(extractedInfo.kelurahan)) {
            score += 40;
          }
        }
        
        // Bonus jika kota cocok
        if (extractedInfo.kota) {
          if (destCity.includes(extractedInfo.kota) || 
              destLabel.includes(extractedInfo.kota)) {
            score += 30;
          }
        }
        
        // Cek kecocokan dengan keywords lainnya
        extractedInfo.keywords.forEach(keyword => {
          if (keyword.length > 2) {
            if (destLabel.includes(keyword) || 
                destCity.includes(keyword) || 
                destDistrict.includes(keyword) || 
                destSubdistrict.includes(keyword)) {
              score += 10;
            }
          }
        });
        
        return score;
      };
      
      // Buat daftar query pencarian berdasarkan informasi yang diekstrak
      const searchQueries = [];
      
      // Prioritas: kode pos terlebih dahulu
      if (extractedInfo.zipCode) {
        searchQueries.push(extractedInfo.zipCode);
      }
      
      // Kemudian kecamatan
      if (extractedInfo.kecamatan) {
        searchQueries.push(extractedInfo.kecamatan);
      }
      
      // Kelurahan
      if (extractedInfo.kelurahan) {
        searchQueries.push(extractedInfo.kelurahan);
      }
      
      // Kota
      if (extractedInfo.kota) {
        searchQueries.push(extractedInfo.kota);
      }
      
      // Keywords lainnya
      extractedInfo.keywords.forEach(keyword => {
        if (keyword.length > 3 && !searchQueries.includes(keyword)) {
          searchQueries.push(keyword);
        }
      });
      
      // Fallback: gunakan bagian pertama dan terakhir alamat
      const alamatParts = alamat.split(',').map(part => part.trim());
      if (alamatParts.length > 0) {
        const firstPart = alamatParts[0].replace(/[^\w\s]/g, '').trim();
        const lastPart = alamatParts[alamatParts.length - 1].replace(/[^\w\s]/g, '').trim();
        
        if (firstPart && firstPart.length > 2 && !searchQueries.includes(firstPart.toLowerCase())) {
          searchQueries.push(firstPart);
        }
        if (lastPart && lastPart.length > 2 && !searchQueries.includes(lastPart.toLowerCase())) {
          searchQueries.push(lastPart);
        }
      }
      
      console.log("Search queries:", searchQueries);
      
      let allDestinations = [];
      
      // Lakukan pencarian dengan setiap query
      for (const query of searchQueries) {
        try {
          console.log("Searching with query:", query);
          const response = await fetch(
            `https://v2.jkt48connect.com/api/rajaongkir/destination?search=${encodeURIComponent(query)}&limit=20&offset=0&username=vzy&password=vzy`
          );
          
          const result = await response.json();
          
          if (result.success && result.data && result.data.length > 0) {
            // Tambahkan destinations yang belum ada
            result.data.forEach(dest => {
              if (!allDestinations.find(d => d.id === dest.id)) {
                allDestinations.push(dest);
              }
            });
          }
        } catch (err) {
          console.warn(`Error searching with query "${query}":`, err);
          continue;
        }
      }
      
      if (allDestinations.length === 0) {
        throw new Error("Lokasi tujuan tidak ditemukan. Pastikan alamat lengkap dengan nama kecamatan/kelurahan.");
      }
      
      console.log(`Found ${allDestinations.length} potential destinations`);
      
      // Hitung skor untuk setiap destination
      const destinationsWithScore = allDestinations.map(dest => ({
        ...dest,
        score: calculateMatchScore(dest)
      }));
      
      // Urutkan berdasarkan skor tertinggi
      destinationsWithScore.sort((a, b) => b.score - a.score);
      
      console.log("Top destinations with scores:");
      destinationsWithScore.slice(0, 5).forEach(dest => {
        console.log(`- ${dest.label} (Score: ${dest.score})`);
      });
      
      // Ambil destination dengan skor tertinggi
      const bestMatch = destinationsWithScore[0];
      
      console.log(`Selected destination: ${bestMatch.label} (Score: ${bestMatch.score})`);
      return bestMatch.id;
      
    } catch (err) {
      console.error("Error finding destination:", err);
      throw new Error(err.message || "Gagal mencari lokasi tujuan");
    }
  };

  // Function untuk menghitung ongkir melalui backend proxy
  const calculateShipping = async (destinationId) => {
    try {
      // Gunakan backend sebagai proxy untuk menghindari CORS
      const response = await fetch(
        `https://v2.jkt48connect.com/api/rajaongkir/cost?origin=${originId}&destination=${destinationId}&weight=1000&courier=jne&price=lowest&username=vzy&password=vzy`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
        }
      );

      const result = await response.json();
      
      if (result.success && result.data && result.data.length > 0) {
        // Cari service REG atau ambil yang pertama jika REG tidak ada
        const regService = result.data.find(service => service.service === 'REG');
        const selectedService = regService || result.data[0];
        
        return selectedService.cost;
      } else {
        throw new Error("Gagal menghitung ongkos kirim");
      }
    } catch (err) {
      console.error("Error calculating shipping:", err);
      throw new Error("Gagal menghitung ongkos kirim");
    }
  };

  // Effect untuk menghitung ongkir ketika data alamat tersedia
  useEffect(() => {
    if (data && data.alamat && !loadingProduct) {
      const fetchOngkir = async () => {
        setLoadingOngkir(true);
        setOngkirError("");
        
        try {
          const destinationId = await findDestinationId(data.alamat);
          const shippingCost = await calculateShipping(destinationId);
          setOngkir(shippingCost);
        } catch (err) {
          console.error("Error fetching ongkir:", err);
          setOngkirError(err.message);
          // Set default ongkir jika gagal
          setOngkir(15000);
        } finally {
          setLoadingOngkir(false);
        }
      };

      fetchOngkir();
    }
  }, [data, loadingProduct]);

  // Hitung diskon dari data redeem atau gunakan default
  const getDiskonAmount = () => {
    if (data && data.discount_type && data.discount_value) {
      if (data.discount_type === 'nominal') {
        return data.discount_value;
      } else if (data.discount_type === 'percentage' && product) {
        return Math.round((product.price * data.discount_percentage) / 100);
      }
    }
    return 0; // Tidak ada diskon jika tidak ada redeem code
  };

  const diskon = getDiskonAmount();
  const total = product ? product.price + ongkir - diskon + kodeUnik : 0;

  const handleFinalSubmit = async () => {
    if (loadingOngkir) {
      setError("Mohon tunggu hingga ongkir selesai dihitung");
      return;
    }

    setPaying(true);
    setError("");

    const checkoutData = {
      ...data,
      ongkir,
      diskon,
      kode_unik: kodeUnik,
      total,
      product_name: product?.name,
    };

    try {
      const response = await fetch(
        "https://v2.jkt48connect.com/api/nayrakuen/customer-input",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: "vzy",
            password: "vzy",
            nama: data.nama,
            alamat: data.alamat,
            nomor_hp: data.nomor_hp,
            email: data.email,
            harga: total,
            product: product?.name || "Produk Default",
            member: data.member || "no",
          }),
        }
      );

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.message || "Terjadi kesalahan pada server");
      }

      sessionStorage.setItem("checkoutData", JSON.stringify(checkoutData));
      navigate("/success", { replace: true });
    } catch (err) {
      console.error(err);
      setError(err.message);
      setPaying(false);
    }
  };

  if (!data || loadingProduct) {
    return (
      <div className="checkout container">
        <h2>Invoice Pembelian</h2>
        <div className="skeleton-section">
          <div className="skeleton skeleton-label"></div>
          <div className="skeleton skeleton-text"></div>
          <div className="skeleton skeleton-text"></div>
          <div className="skeleton skeleton-text"></div>
        </div>
        <div className="skeleton-section">
          <div className="skeleton skeleton-label"></div>
          <div className="skeleton skeleton-table-row"></div>
          <div className="skeleton skeleton-table-row"></div>
          <div className="skeleton skeleton-table-row"></div>
          <div className="skeleton skeleton-table-row"></div>
          <div className="skeleton skeleton-table-row"></div>
          <div className="skeleton skeleton-table-row total-row"></div>
        </div>
        <div className="skeleton skeleton-button"></div>
      </div>
    );
  }

  if (!product) return <p>Produk tidak ditemukan.</p>;

  return (
    <div className="checkout container">
      <h2>Invoice Pembelian</h2>

      <div className="invoice-section">
        <h3>Data Pembeli</h3>
        <p>
          <strong>Nama:</strong> {data.nama}
        </p>
        <p>
          <strong>Email:</strong> {data.email}
        </p>
        <p>
          <strong>No. HP:</strong> {data.nomor_hp}
        </p>
        <p>
          <strong>Alamat:</strong> {data.alamat}
        </p>
        {data.redeem_code && (
          <p>
            <strong>Code Redeem:</strong> {data.redeem_code}
          </p>
        )}
      </div>

      <div className="invoice-section">
        <h3>Rincian Produk</h3>
        <table className="invoice-table">
          <tbody>
            <tr>
              <td>Produk</td>
              <td>{product.name}</td>
            </tr>
            <tr>
              <td>Harga Produk</td>
              <td>Rp {product.price.toLocaleString()}</td>
            </tr>
            <tr>
              <td>Ongkir (JNE REG)</td>
              <td>
                {loadingOngkir ? (
                  <span style={{ fontSize: '12px', color: '#666' }}>
                    Menghitung...
                  </span>
                ) : ongkirError ? (
                  <span style={{ fontSize: '12px', color: '#e74c3c' }}>
                    Rp {ongkir.toLocaleString()} (default)
                  </span>
                ) : (
                  `Rp ${ongkir.toLocaleString()}`
                )}
              </td>
            </tr>
            {diskon > 0 && (
              <tr>
                <td>
                  Diskon
                  {data.redeem_code && (
                    <span style={{ fontSize: '12px', color: '#27ae60', display: 'block' }}>
                      ({data.redeem_code})
                    </span>
                  )}
                </td>
                <td>- Rp {diskon.toLocaleString()}</td>
              </tr>
            )}
            <tr>
              <td>Kode Unik</td>
              <td>Rp {kodeUnik.toLocaleString()}</td>
            </tr>
            <tr className="total-row">
              <td>
                <strong>Total Bayar</strong>
              </td>
              <td>
                <strong>Rp {total.toLocaleString()}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {ongkirError && (
        <div style={{ 
          padding: '10px', 
          backgroundColor: '#fff3cd', 
          border: '1px solid #ffeaa7', 
          borderRadius: '4px', 
          marginBottom: '15px',
          fontSize: '14px',
          color: '#856404'
        }}>
          <strong>Peringatan:</strong> {ongkirError}. Menggunakan ongkir default Rp {ongkir.toLocaleString()}.
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <button 
        className="btn-pay" 
        onClick={handleFinalSubmit} 
        disabled={paying || loadingOngkir}
      >
        {paying ? (
          <div className="btn-loader">
            <span className="loader-ring"></span>
            Memproses...
          </div>
        ) : loadingOngkir ? (
          <div className="btn-loader">
            <span className="loader-ring"></span>
            Menghitung Ongkir...
          </div>
        ) : (
          "Bayar Sekarang"
        )}
      </button>
    </div>
  );
}

export default Checkout;
