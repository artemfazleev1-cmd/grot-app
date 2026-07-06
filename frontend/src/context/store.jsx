import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api, setToken, getToken } from '../api.js';
import { subscribePush } from '../pwa.js';
import { STR } from '../i18n.js';

const Store = createContext(null);
export const useStore = () => useContext(Store);

export function StoreProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [cart, setCart] = useState([]);          // [{menuId,name,price,qty}]
  const [table, setTable] = useState(null);      // активный стол по QR
  const [notifications, setNotifications] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [config, setConfig] = useState({});
  const [lang, setLangState] = useState(() => localStorage.getItem('grot_lang') || 'ru');
  const setLang = (l) => { localStorage.setItem('grot_lang', l); setLangState(l); };
  const t = useCallback((key, data) => {
    let s = (STR[lang] && STR[lang][key]) || STR.ru[key] || key;
    if (data) for (const k in data) s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), data[k]);
    return s;
  }, [lang]);
  const seen = useRef(new Set());

  // Публичный конфиг (какие интеграции включены на сервере)
  useEffect(() => { api.get('/config').then(setConfig).catch(() => {}); }, []);

  // ---- toast ----
  const toast = useCallback((text) => {
    const tid = Math.random();
    setToasts((t) => [...t, { tid, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.tid !== tid)), 3200);
  }, []);

  // ---- auth ----
  const refreshMe = useCallback(async () => {
    if (!getToken()) { setBooting(false); return; }
    try { setUser(await api.get('/me')); } catch { setToken(null); }
    setBooting(false);
  }, []);
  useEffect(() => { refreshMe(); }, [refreshMe]);

  const login = async (phone, password) => {
    const { token, user } = await api.post('/auth/login', { phone, password });
    setToken(token); setUser(user); return user;
  };
  const register = async (payload) => {
    const { token, user } = await api.post('/auth/register', payload);
    setToken(token); setUser(user); return user;
  };
  const logout = () => { setToken(null); setUser(null); setCart([]); setTable(null); };

  // ---- cart ----
  const addToCart = (item) => {
    setCart((c) => {
      const ex = c.find((x) => x.menuId === item.id);
      if (ex) return c.map((x) => x.menuId === item.id ? { ...x, qty: x.qty + 1 } : x);
      return [...c, { menuId: item.id, name: item.name, price: item.price, qty: 1 }];
    });
    toast(`Добавлено: ${item.name}`);
  };
  const setQty = (menuId, qty) => setCart((c) => qty <= 0 ? c.filter((x) => x.menuId !== menuId) : c.map((x) => x.menuId === menuId ? { ...x, qty } : x));
  const clearCart = () => setCart([]);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const cartTotal = cart.reduce((s, i) => s + i.qty * i.price, 0);

  // ---- notifications polling ----
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const poll = async () => {
      try {
        const list = await api.get('/notifications');
        if (!alive) return;
        list.forEach((n) => { if (!seen.current.has(n.id)) { seen.current.add(n.id); if (seen.current.size > 1) toast(n.text); } });
        if (seen.current.size <= list.length && list.length) list.forEach((n) => seen.current.add(n.id));
        setNotifications(list);
      } catch {}
    };
    poll();
    const iv = setInterval(poll, 4000);
    return () => { alive = false; clearInterval(iv); };
  }, [user, toast]);

  // Подписка на Web Push после входа (если сервер настроил VAPID)
  useEffect(() => { if (user && config.vapidPublicKey) subscribePush(config.vapidPublicKey); }, [user, config.vapidPublicKey]);

  const unread = notifications.filter((n) => !n.read).length;
  const markRead = async () => { try { await api.patch('/notifications/read'); setNotifications((n) => n.map((x) => ({ ...x, read: true }))); } catch {} };

  return (
    <Store.Provider value={{
      user, booting, login, register, logout, refreshMe, setUser,
      cart, addToCart, setQty, clearCart, cartCount, cartTotal,
      table, setTable, toast, config,
      lang, setLang, t,
      notifications, unread, markRead,
    }}>
      {children}
      <div className="toast-wrap">{toasts.map((t) => <div key={t.tid} className="toast">{t.text}</div>)}</div>
    </Store.Provider>
  );
}
