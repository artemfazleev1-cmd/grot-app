import { useEffect, useState } from 'react';

export const Loader = () => <div className="loader"><i /></div>;

// Картинка блюда с фирменной заглушкой при ошибке загрузки
export function FoodImg({ src, alt = '', className, style, onClick }) {
  const onError = (e) => {
    if (e.currentTarget.dataset.fallback) return;
    e.currentTarget.dataset.fallback = '1';
    e.currentTarget.src = '/logo.png';
    e.currentTarget.style.objectFit = 'cover';
    e.currentTarget.style.opacity = '.85';
  };
  return <img src={src} alt={alt} className={className} style={style} loading="lazy" onClick={onClick} onError={onError} />;
}

export const Empty = ({ icon = '🍽', text = 'Пусто' }) => (
  <div className="empty"><div className="big">{icon}</div>{text}</div>
);

export const SectionTitle = ({ children }) => (
  <div className="section-title"><h2>{children}</h2></div>
);

export function Sheet({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        {children}
      </div>
    </div>
  );
}

export const money = (n) => `${Number(n).toLocaleString('ru-RU')} ฿`;

// Хук загрузки данных
export function useFetch(fn, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn().then((d) => alive && setData(d)).catch(() => {}).finally(() => alive && setLoading(false));
    return () => { alive = false; };
    // eslint-disable-next-line
  }, [...deps, reloadKey]);
  return { data, loading, reload: () => setReloadKey((k) => k + 1), setData };
}
