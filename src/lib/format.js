const TZ = "Asia/Jakarta";

export const fmtDay = (ts) =>
  ts ? new Date(ts).toLocaleDateString("id-ID", { weekday: "long", timeZone: TZ }) : "";
export const fmtDate = (ts) =>
  ts ? new Date(ts).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: TZ }) : "";
export const fmtShortDate = (ts) =>
  ts ? new Date(ts).toLocaleDateString("id-ID", { day: "2-digit", month: "short", timeZone: TZ }) : "";
export const fmtTime = (ts) =>
  ts ? new Date(ts).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).replace(".", ":") : "";
export const fmtDateTime = (ts) => (ts ? `${fmtShortDate(ts)} · ${fmtTime(ts)}` : "—");

export const pad = (n) => String(n).padStart(2, "0");

export function splitDuration(ms) {
  const d = Math.max(0, ms);
  return {
    days: Math.floor(d / 86400000),
    hours: Math.floor((d / 3600000) % 24),
    mins: Math.floor((d / 60000) % 60),
    secs: Math.floor((d / 1000) % 60),
  };
}

export function humanLeft(ts) {
  const ms = ts - Date.now();
  if (ms <= 0) return "berakhir";
  const { days, hours, mins } = splitDuration(ms);
  if (days > 0) return `${days} hari ${hours} jam`;
  if (hours > 0) return `${hours} jam ${mins} mnt`;
  return `${mins} menit`;
}

// "Pajama Drive" → "PD" — dipakai sebagai nomor/kode tiket dekoratif.
export const initials = (s) =>
  (s || "")
    .split(/\s+/)
    .filter((w) => /^[a-z0-9]/i.test(w))
    .slice(0, 3)
    .map((w) => w[0].toUpperCase())
    .join("");
