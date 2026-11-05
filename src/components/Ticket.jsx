import { Link } from "react-router-dom";
import Countdown from "./Countdown";
import { fmtDay, fmtDate, fmtTime, initials } from "../lib/format";

// Barcode dekoratif yang stabil per slug.
function Barcode({ seed = "" }) {
  const bars = [];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  for (let i = 0; i < 34; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    bars.push(1 + (h % 3));
  }
  return (
    <div className="barcode" aria-hidden="true">
      {bars.map((w, i) => (
        <i key={i} style={{ width: w }} />
      ))}
    </div>
  );
}

// Tiket besar (hero) — show terdekat / sedang live.
export function HeroTicket({ show }) {
  if (!show) {
    return (
      <div className="hticket hticket--empty stub">
        <div className="hticket__main">
          <p className="eyebrow">Belum ada jadwal</p>
          <h3 className="display">Panggung sedang istirahat.</h3>
          <p>Jadwal show berikutnya akan muncul di sini begitu diumumkan.</p>
        </div>
        <div className="hticket__stub"><span className="mono">— — —</span></div>
      </div>
    );
  }
  const live = show.status === "live";
  return (
    <article className="hticket stub">
      <div className="hticket__main">
        <div className="hticket__poster">
          <img src={show.image} alt="" loading="eager" />
          {live && <span className="stamp">Sedang<br />Tayang</span>}
        </div>
        <div className="hticket__body">
          <p className="eyebrow">{live ? "Sekarang di panggung" : "Show berikutnya"}</p>
          <h3 className="display hticket__title">{show.name}</h3>
          <dl className="hticket__meta">
            <div><dt>Hari</dt><dd>{fmtDay(show.scheduledAt)}</dd></div>
            <div><dt>Tanggal</dt><dd>{fmtDate(show.scheduledAt)}</dd></div>
            <div><dt>Buka</dt><dd className="mono">{fmtTime(show.scheduledAt)} WIB</dd></div>
          </dl>
          {live ? (
            <Link to={`/live/${show.slug}`} className="btn btn--red">
              <span className="live-dot" /> Masuk ruang nonton <span className="arrow">→</span>
            </Link>
          ) : (
            <Countdown to={show.scheduledAt} />
          )}
        </div>
      </div>
      <div className="hticket__stub">
        <span className="hticket__admit mono">ADMIT ONE</span>
        <span className="hticket__code display">{initials(show.name) || "HK"}</span>
        <Barcode seed={show.slug} />
        <span className="mono hticket__serial">{(show.showId || show.slug.slice(-6)).toUpperCase()}</span>
      </div>
    </article>
  );
}

// Tiket baris — daftar program.
export function TicketRow({ show, index, action }) {
  const live = show.status === "live";
  return (
    <article className={`trow${live ? " trow--live" : ""}`}>
      <div className="trow__no mono">{String(index + 1).padStart(2, "0")}</div>
      <div className="trow__img">
        <img src={show.image} alt="" loading="lazy" />
      </div>
      <div className="trow__info">
        <h3 className="display">{show.name}</h3>
        <p className="trow__desc">{show.description.split("\n").filter(Boolean).join(" · ") || "Show theater JKT48"}</p>
      </div>
      <div className="trow__when">
        <span className="trow__day">{fmtDay(show.scheduledAt)}</span>
        <span className="mono">{fmtDate(show.scheduledAt)}</span>
        <span className="mono trow__time">{fmtTime(show.scheduledAt)} WIB</span>
      </div>
      <div className="trow__act">
        {live ? (
          <Link to={`/live/${show.slug}`} className="btn btn--red btn--sm">
            <span className="live-dot" /> Tonton
          </Link>
        ) : (
          action || (
            <span className="trow__cd">
              <small className="eyebrow">mulai dalam</small>
              <Countdown to={show.scheduledAt} compact />
            </span>
          )
        )}
      </div>
    </article>
  );
}
