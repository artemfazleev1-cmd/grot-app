import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useStore } from '../context/store.jsx';
import { Loader, useFetch } from '../components/ui.jsx';

export default function Home() {
  const nav = useNavigate();
  const { user, t, L } = useStore();
  const { data, loading } = useFetch(() => api.get('/home'));
  if (loading || !data) return <Loader />;

  return (
    <div className="screen">
      {/* Геро-шапка с атмосферой */}
      <div className="hero">
        <h1 style={{ fontSize: 28 }}>{t('greeting')}, {user?.name?.split(' ')[0]}</h1>
        <div className="muted" style={{ marginBottom: 16 }}>{t('welcome')}</div>

        <div className="card" style={{ background: 'linear-gradient(135deg,#2a1606,#3a1d08)', borderColor: 'rgba(212,175,55,.45)' }}>
          <span className="badge gold">{L(data.intro, 'badge')}</span>
          <h2 style={{ marginTop: 10, fontSize: 22 }}>{L(data.intro, 'title')}</h2>
          <div className="muted">{L(data.intro, 'subtitle')} · {L(data.intro, 'text')}</div>
          <button className="btn fire" style={{ marginTop: 14 }} onClick={() => nav('/events')}>{t('more')}</button>
        </div>
      </div>

      {/* Крупные понятные действия */}
      <div className="tiles" style={{ marginTop: 18 }}>
        <div className="tile gold" onClick={() => nav('/menu')}>
          <span className="t">{t('tile_order')}</span><span className="s">{t('tile_order_sub')}</span>
        </div>
        <div className="tile" onClick={() => nav('/menu')}>
          <span className="t">{t('tile_menu')}</span><span className="s">{t('tile_menu_sub')}</span>
        </div>
        <div className="tile" onClick={() => nav('/events')}>
          <span className="t">{t('tile_events')}</span><span className="s">{t('tile_events_sub')}</span>
        </div>
        <div className="tile" onClick={() => nav('/profile')}>
          <span className="t">{t('tile_orders')}</span><span className="s">{t('tile_orders_sub')}</span>
        </div>
      </div>

      {/* Новости */}
      <div className="section-title"><h2>{t('news')}</h2></div>
      <div className="list">
        {data.news.map((n) => (
          <div key={n.id} className="card tight">
            <div style={{ fontWeight: 700, fontSize: 16 }}>{L(n, 'title')}</div>
            <div className="muted">{n.date}</div>
            <div style={{ marginTop: 4 }}>{L(n, 'text')}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
