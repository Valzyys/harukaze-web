// Klien untuk Worker (/api/*) + sumber data publik JKT48Connect.

export const IDN_PLUS_API = "https://v5.jkt48connect.com/api/jkt48/idnplus?apikey=JKTCONNECT";
export const THEATER_API = "https://v5.jkt48connect.com/api/jkt48/theater?apikey=JKTCONNECT";

// Origin partner stream (playback exchange & resume langsung dari browser).
export const PARTNER_ORIGIN = (import.meta.env.VITE_PARTNER_ORIGIN || "https://st.oshigo.web.id").replace(/\/$/, "");

export async function api(path, { method = "GET", body, token } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    return { ok: false, code: "NETWORK", message: "Tidak bisa terhubung ke server." };
  }
  try {
    const data = await res.json();
    return { ...data, status: res.status };
  } catch {
    return { ok: false, code: "BAD_RESPONSE", message: "Respon server tidak valid.", status: res.status };
  }
}

const DEFAULT_IMG = "https://res.cloudinary.com/haymzm4wp/image/upload/v1760105848/bi5ej2hgh0cc2uowu5xr.jpg";

// Show dari IDN Live Plus (sumber utama), dinormalisasi.
export async function fetchShows() {
  const res = await fetch(IDN_PLUS_API);
  const data = await res.json();
  const list = Array.isArray(data?.data) ? data.data : [];
  return list
    .filter((s) => /jkt\s?48/i.test(s.creator?.name || ""))
    .map((s) => ({
      slug: s.slug,
      title: s.title,
      name: (s.title || "").replace(/\s*-\s*\d{4}\/\d{2}\/\d{2}\s*$/, ""),
      image: s.image_url || DEFAULT_IMG,
      status: s.status, // live | scheduled
      scheduledAt: s.scheduled_at ? s.scheduled_at * 1000 : null,
      liveAt: s.live_at ? s.live_at * 1000 : null,
      description: s.idnliveplus?.description || "",
      viewers: s.view_count || 0,
      showId: s.showId || null,
    }))
    .sort((a, b) => (a.status === "live" ? -1 : b.status === "live" ? 1 : (a.scheduledAt || 0) - (b.scheduledAt || 0)));
}

export async function fetchShowMembers(showId) {
  if (!showId) return [];
  try {
    const res = await fetch(`https://v5.jkt48connect.com/api/jkt48/theater/${showId}?apikey=JKTCONNECT`);
    const data = await res.json();
    return data?.shows?.[0]?.members || [];
  } catch {
    return [];
  }
}

// ID perangkat acak, dipakai untuk batas perangkat per email.
export function deviceId() {
  try {
    let id = localStorage.getItem("hrz_device");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("hrz_device", id);
    }
    return id;
  } catch {
    return "volatile-" + Math.random().toString(36).slice(2);
  }
}

export const store = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage penuh/diblokir */ }
  },
  del(key) {
    try { localStorage.removeItem(key); } catch { /* abaikan */ }
  },
};

// Link kontak admin; untuk WhatsApp otomatis menyisipkan pesan.
export function contactHref(config, text) {
  const url = config.contact_url || "";
  if (!url) return null;
  if (/wa\.me|whatsapp\.com/.test(url)) {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}text=${encodeURIComponent(text)}`;
  }
  return url;
}
