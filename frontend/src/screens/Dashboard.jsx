import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useStore } from '../context/store.jsx';

const ST = {
  new: ['Новый', '#ff7a18'], accepted: ['Принят', '#f4c430'], cooking: ['Готовится', '#f4c430'],
  ready: ['Готов', '#3ec46d'], delivering: ['У курьера', '#3ec46d'],
};
const TYPE = { delivery: '🛵 Доставка', pickup: '🥡 Самовывоз', dinein: '🍽 В зале' };
const fmt = (iso) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const money = (n) => `${Number(n).toLocaleString('ru-RU')} ฿`;

export default function Dashboard() {
  const { logout } = useStore();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [soundOn, setSoundOn] = useState(false);
  const [flash, setFlash] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const ac = useRef(null);
  const prevOrders = useRef(null);   // Set of active order ids
  const prevReg = useRef(null);      // registrations.total

  // Синтез звука через Web Audio (без файлов). Нужен жест пользователя, чтобы разблокировать.
  const enableSound = () => {
    try { ac.current = new (window.AudioContext || window.webkitAudioContext)(); setSoundOn(true); chime([660, 990]); } catch {}
  };
  const chime = (freqs) => {
    const a = ac.current; if (!a) return;
    freqs.forEach((f, i) => {
      const o = a.createOscillator(), g = a.createGain();
      o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(a.destination);
      const t = a.currentTime + i * 0.16;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.start(t); o.stop(t + 0.24);
    });
  };

  const load = async () => {
    try {
      const d = await api.get('/dashboard');
      const ids = new Set(d.active.map((o) => o.id));
      // Новый заказ — звук + вспышка
      if (prevOrders.current) {
        const fresh = d.active.filter((o) => !prevOrders.current.has(o.id));
        if (fresh.length) { chime([880, 1320, 1760]); setFlash(true); setTimeout(() => setFlash(false), 1200); }
      }
      prevOrders.current = ids;
      // Новая регистрация — отдельный сигнал
      if (prevReg.current != null && d.registrations.total > prevReg.current) chime([520, 780]);
      prevReg.current = d.registrations.total;
      setData(d); setUpdatedAt(new Date());
    } catch {}
  };

  useEffect(() => { load(); const iv = setInterval(load, 3000); return () => clearInterval(iv); }, []);

  const kpi = (v, l, color) => (
    <div style={{ flex: 1, minWidth: 180, background: 'linear-gradient(160deg,#16161a,#1f1f25)', border: '1px solid #2a2a31', borderRadius: 16, padding: '18px 20px' }}>
      <div style={{ fontSize: 38, fontWeight: 800, color: color || '#f6f3ec', lineHeight: 1 }}>{v}</div>
      <div style={{ fontSize: 13, color: '#bdb8ac', marginTop: 6 }}>{l}</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: flash ? '#241405' : '#0a0a0b', color: '#f6f3ec', transition: 'background .4s',
      fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,Inter,Roboto,sans-serif', padding: 24 }}>
      {/* Шапка */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20, maxWidth: 1200, margin: '0 auto 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/logo.png" alt="GROT" style={{ width: 44, height: 44, borderRadius: '50%' }} />
          <div>
            <div style={{ fontFamily: 'Georgia,serif', letterSpacing: 3, fontSize: 22, color: '#ffb070' }}>GR<span>O</span>T · Монитор</div>
            <div style={{ fontSize: 12, color: '#bdb8ac' }}>
              <span style={{ color: '#3ec46d' }}>●</span> в реальном времени · обновлено {updatedAt ? updatedAt.toLocaleTimeString('ru-RU') : '…'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {!soundOn
            ? <button onClick={enableSound} style={btn('#ff7a18')}>🔔 Включить звук</button>
            : <button onClick={() => chime([880, 1320])} style={btn('#2a2a31')}>🔊 Звук включён · тест</button>}
          <button onClick={() => nav('/owner')} style={btn('#2a2a31')}>↩ В панель</button>
          <button onClick={() => { logout(); nav('/'); }} style={btn('#2a2a31')}>Выйти</button>
        </div>
      </div>

      {!data ? <div style={{ textAlign: 'center', padding: 80, color: '#bdb8ac' }}>Загрузка…</div> : (
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          {/* KPI */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 24 }}>
            {kpi(data.registrations.total, 'Регистраций всего')}
            {kpi(`+${data.registrations.today}`, 'Регистраций за сутки', '#3ec46d')}
            {kpi(data.activeCount, 'Активных заказов', data.activeCount ? '#ff7a18' : null)}
            {kpi(data.ordersToday, 'Заказов за сутки')}
            {kpi(money(data.revenueToday), 'Выручка за сутки', '#d4af37')}
          </div>

          {/* Входящие заказы */}
          <div style={{ fontSize: 18, fontWeight: 700, margin: '0 0 12px' }}>Входящие / активные заказы ({data.active.length})</div>
          {data.active.length === 0
            ? <div style={{ padding: 50, textAlign: 'center', color: '#bdb8ac', border: '1px dashed #2a2a31', borderRadius: 16 }}>Пока нет активных заказов</div>
            : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 14 }}>
                {data.active.map((o) => {
                  const [label, color] = ST[o.status] || [o.status, '#bdb8ac'];
                  return (
                    <div key={o.id} style={{ background: '#161618', border: `1px solid ${color}55`, borderRadius: 14, padding: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <b style={{ fontSize: 20 }}>#{o.id}</b>
                        <span style={{ background: color + '22', color, border: `1px solid ${color}66`, borderRadius: 999, padding: '3px 12px', fontSize: 12, fontWeight: 700 }}>{label}</span>
                      </div>
                      <div style={{ color: '#bdb8ac', fontSize: 13, margin: '6px 0' }}>{TYPE[o.type] || o.type}{o.tableNumber ? ` · Стол №${o.tableNumber}` : ''} · {fmt(o.createdAt)}</div>
                      <div style={{ fontSize: 14, margin: '4px 0' }}>{o.items}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                        <span style={{ color: '#bdb8ac' }}>{o.clientName}</span>
                        <b style={{ color: '#d4af37', fontSize: 18 }}>{money(o.total)}</b>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
        </div>
      )}
    </div>
  );
}

function btn(bg) {
  return { background: bg, color: '#f6f3ec', border: '1px solid #2a2a31', borderRadius: 12, padding: '10px 16px', fontWeight: 700, fontSize: 14, cursor: 'pointer' };
}
