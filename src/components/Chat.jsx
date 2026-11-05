import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { gsap } from "../lib/gsap";
import { store } from "../lib/api";
import { fmtTime } from "../lib/format";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://mzxfuaoihgzxvokwarao.supabase.co";
const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16eGZ1YW9paGd6eHZva3dhcmFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MDg0NjIsImV4cCI6MjA4OTk4NDQ2Mn0.OFYCkBFXCSfLn-wG94OHHKL5CX8T_BLrbDGPiBdPIog";

let client = null;
const supabase = () => (client ||= createClient(SUPABASE_URL, SUPABASE_KEY));

// Warna nama stabil per nickname — dari palet hangat, bukan pelangi.
const HUES = ["#ff8a8f", "#f0b860", "#9fd3a8", "#a9c7ff", "#e3a8ff", "#ffd28a", "#8fe0d6"];
const hueOf = (name) => HUES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];

const defaultNick = (email) => {
  const base = (email || "penonton").split("@")[0].replace(/[^a-z0-9_.]/gi, "").slice(0, 14) || "penonton";
  return base;
};

export default function Chat({ slug, email, open }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [nick, setNick] = useState(() => store.get("hrz_nick") || defaultNick(email));
  const [editing, setEditing] = useState(false);
  const [online, setOnline] = useState(false);
  const channel = useRef(null);
  const list = useRef(null);

  useEffect(() => {
    let ch;
    try {
      ch = supabase().channel(`chat-${slug}`, { config: { broadcast: { ack: true } } });
      ch.on("broadcast", { event: "pesan_baru" }, ({ payload }) => {
        setMessages((prev) =>
          prev.some((m) => m.timestamp === payload.timestamp && m.username === payload.username) ? prev : [...prev.slice(-199), payload]
        );
      }).subscribe((status) => setOnline(status === "SUBSCRIBED"));
      channel.current = ch;
    } catch {
      setOnline(false);
    }
    return () => {
      if (ch) supabase().removeChannel(ch);
    };
  }, [slug]);

  useEffect(() => {
    const el = list.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    const last = el.querySelector(".msg:last-child");
    if (last) gsap.fromTo(last, { x: 18, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4 });
  }, [messages.length]);

  const send = async (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || !channel.current) return;
    const payload = { username: nick, text_content: t.slice(0, 200), timestamp: new Date().toISOString(), role: "member" };
    setMessages((prev) => [...prev, payload]);
    setText("");
    try {
      await channel.current.send({ type: "broadcast", event: "pesan_baru", payload });
    } catch { /* pesan tetap tampil lokal */ }
  };

  const saveNick = (e) => {
    e.preventDefault();
    const n = nick.trim().slice(0, 18) || defaultNick(email);
    setNick(n);
    store.set("hrz_nick", n);
    setEditing(false);
  };

  return (
    <aside className={`chat${open ? " is-open" : ""}`} aria-label="Obrolan penonton">
      <header className="chat__head">
        <span>Obrolan penonton</span>
        <span className={`chat__status mono${online ? " is-on" : ""}`}>{online ? "terhubung" : "menyambung…"}</span>
      </header>
      <div className="chat__list" ref={list}>
        {messages.length === 0 && <p className="chat__empty">Belum ada obrolan. Sapa penonton lain.</p>}
        {messages.map((m, i) => (
          <div key={i} className="msg">
            <span className="msg__time mono">{fmtTime(m.timestamp)}</span>
            <span className="msg__name" style={{ color: hueOf(m.username || "") }}>
              {m.role && m.role !== "member" && <em>{m.role}</em>}
              {m.username}
            </span>
            <span className="msg__text">{m.text_content}</span>
          </div>
        ))}
      </div>
      <div className="chat__foot">
        {editing ? (
          <form onSubmit={saveNick} className="chat__form">
            <input className="chat__input" autoFocus value={nick} maxLength={18} onChange={(e) => setNick(e.target.value)} aria-label="Nama tampilan" />
            <button className="chat__send" type="submit">Simpan</button>
          </form>
        ) : (
          <>
            <button className="chat__nick" onClick={() => setEditing(true)}>
              sebagai <b style={{ color: hueOf(nick) }}>{nick}</b> · ubah
            </button>
            <form onSubmit={send} className="chat__form">
              <input className="chat__input" placeholder="Tulis pesan…" maxLength={200} value={text} onChange={(e) => setText(e.target.value)} aria-label="Pesan" />
              <button className="chat__send" type="submit" disabled={!text.trim()} aria-label="Kirim">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </button>
            </form>
          </>
        )}
      </div>
    </aside>
  );
}
