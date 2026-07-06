import { api } from '../api.js';
import { useStore } from '../context/store.jsx';
import { Loader, useFetch } from '../components/ui.jsx';

const DOW_EN = { 'ПН': 'Mon', 'ВТ': 'Tue', 'СР': 'Wed', 'ЧТ': 'Thu', 'ПТ': 'Fri', 'СБ': 'Sat', 'ВС': 'Sun' };

export default function Events() {
  const { data, loading } = useFetch(() => api.get('/events'));
  const { toast, t, L, lang } = useStore();
  if (loading || !data) return <Loader />;

  const dow = (d) => (lang === 'en' && DOW_EN[d]) ? DOW_EN[d] : d;
  const remind = async (e) => { try { await api.post(`/events/${e.id}/remind`); toast(`${t('remind_me')}: «${L(e, 'title')}»`); } catch (er) { toast(er.message); } };

  return (
    <div className="screen">
      <h1>{t('events_title')}</h1>
      <div className="muted">{t('events_sub')}</div>
      <div className="list" style={{ marginTop: 16 }}>
        {data.map((e) => (
          <div key={e.id} className="card">
            <div className="between">
              <div className="row">
                <div style={{ fontSize: 30 }}>{e.emoji}</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{L(e, 'title')}</div>
                  <div className="muted">{dow(e.day)} · {e.time}</div>
                </div>
              </div>
              <span className="badge gold">{dow(e.day)}</span>
            </div>
            <div style={{ marginTop: 10 }}>{L(e, 'description')}</div>
            <button className="btn ghost sm" style={{ marginTop: 12 }} onClick={() => remind(e)}>{t('remind_me')}</button>
          </div>
        ))}
      </div>
    </div>
  );
}
