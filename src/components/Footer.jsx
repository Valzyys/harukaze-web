import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="foot">
      <div className="wrap foot__grid">
        <div className="foot__big display" aria-hidden="true">春風</div>
        <div className="foot__cols">
          <div>
            <p className="eyebrow">Harukaze48</p>
            <p className="foot__lede">Ruang nonton show theater JKT48 — cukup dengan email yang terdaftar.</p>
          </div>
          <div>
            <p className="eyebrow">Navigasi</p>
            <ul>
              <li><Link className="link-u" to="/jadwal">Jadwal & Tiket</Link></li>
              <li><Link className="link-u" to="/akses">Cek Akses Email</Link></li>
            </ul>
          </div>
          <div>
            <p className="eyebrow">Catatan</p>
            <p className="foot__small">Situs fan-made, tidak berafiliasi dengan JKT48 maupun IDN. Data jadwal dari JKT48Connect.</p>
          </div>
        </div>
      </div>
      <div className="wrap foot__base mono">
        <span>© {new Date().getFullYear()} Harukaze48</span>
        <span>Dibuat dengan angin musim semi</span>
      </div>
    </footer>
  );
}
