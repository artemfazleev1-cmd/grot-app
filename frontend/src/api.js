// Тонкий клиент REST API.
// Веб (PWA): пусто → same-origin '/api'. Нативная обёртка (Capacitor):
// задаётся VITE_API_BASE=https://ваш-сервер.onrender.com при сборке.
const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
const TOKEN_KEY = 'grot_token';

// Абсолютный URL для статики с сервера (фото меню и т.п.).
// В вебе API_BASE пуст — путь остаётся same-origin. В APK (Capacitor) файлы
// приложения локальные, но фото должны грузиться с прод-сервера — иначе
// новые картинки не появятся без пересборки APK.
export const assetUrl = (p) => (p && p.startsWith('/') ? API_BASE + p : p);

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

async function request(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const t = getToken();
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(`${API_BASE}/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
  return data;
}

export const api = {
  get: (p) => request(p),
  post: (p, body) => request(p, { method: 'POST', body }),
  put: (p, body) => request(p, { method: 'PUT', body }),
  patch: (p, body) => request(p, { method: 'PATCH', body }),
  del: (p) => request(p, { method: 'DELETE' }),
};
