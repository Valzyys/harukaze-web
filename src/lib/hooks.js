import { useEffect, useState } from "react";
import { api, fetchShows } from "./api";

export function useShows(refreshMs = 30000) {
  const [state, setState] = useState({ shows: [], loading: true, error: null });
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchShows()
        .then((shows) => alive && setState({ shows, loading: false, error: null }))
        .catch(() => alive && setState((s) => ({ ...s, loading: false, error: "Gagal memuat jadwal." })));
    load();
    const id = setInterval(load, refreshMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [refreshMs]);
  return state;
}

let configCache = null;
export function useSiteConfig() {
  const [config, setConfig] = useState(configCache || {});
  useEffect(() => {
    if (configCache) return;
    api("/config").then((r) => {
      if (r.ok) {
        configCache = r.data;
        setConfig(r.data);
      }
    });
  }, []);
  return config;
}

export function useNow(interval = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return now;
}
