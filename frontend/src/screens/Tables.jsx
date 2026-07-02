import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useStore } from '../context/store.jsx';
import { Loader, Sheet, useFetch, money } from '../components/ui.jsx';

const ST = { free: 'st-free', reserved: 'st-reserved', occupied: 'st-occupied' };
const LBL = { free: '🟢 Свободен', reserved: '🟡 Бронь', occupied: '🔴 Занят' };

export default function Tables() {
  const { data, loading, reload } = useFetch(() => api.get('/tables'));
  const { setTable, toast } = useStore();
  const nav = useNavigate();
  const [sel, setSel] = useState(null);
  const [book, setBook] = useState(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [form, setForm] = useState({ date: '2026-06-24', time: '19:30', guests: 2, comment: '' });

  if (loading || !data) return <Loader />;

  // Имитация сканирования QR — выбор стола активирует «режим стола»
  const scanTable = (t) => {
    setTable({ id: t.id, number: t.number });
    setQrOpen(false);
    toast(`Вы за столом №${t.number}`);
    nav('/table-service');
  };

  const reserve = async () => {
    try {
      await api.post('/reservations', { tableNumber: book.number, ...form });
      toast(`Стол №${book.number} забронирован`);
      setBook(null); reload();
    } catch (e) { toast(e.message); }
  };

  return (
    <div className="screen">
      <div className="between"><h1>Зал и брони</h1>
        <button className="btn sm" onClick={() => setQrOpen(true)}>📷 Скан QR стола</button></div>
      <div className="row" style={{ gap: 14, margin: '10px 0' }}>
        <span className="muted">🟢 Свободен</span><span className="muted">🟡 Бронь</span><span className="muted">🔴 Занят</span>
      </div>

      <div className="floor">
        {data.map((t) => (
          <div key={t.id} className={`tbl ${ST[t.status]}`} style={{ left: `${t.x}%`, top: `${t.y}%` }} onClick={() => setSel(t)}>
            №{t.number}<small>{t.seats} мест</small>
          </div>
        ))}
      </div>

      <Sheet open={!!sel} onClose={() => setSel(null)}>
        {sel && (<>
          <h2>Стол №{sel.number}</h2>
          <div className="muted">{sel.seats} мест · {LBL[sel.status]}</div>
          <div className="divider" />
          <button className="btn block" disabled={sel.status === 'occupied'} onClick={() => { setBook(sel); setSel(null); }}>Забронировать</button>
          <button className="btn ghost block" style={{ marginTop: 10 }} onClick={() => scanTable(sel)}>Я за этим столом (QR)</button>
        </>)}
      </Sheet>

      <Sheet open={!!book} onClose={() => setBook(null)}>
        {book && (<>
          <h2>Бронь · стол №{book.number}</h2>
          <label>Дата</label><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <label>Время</label><input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
          <label>Гостей</label><input type="number" min={1} max={book.seats} value={form.guests} onChange={(e) => setForm({ ...form, guests: +e.target.value })} />
          <label>Комментарий</label><input value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} placeholder="Пожелания" />
          <div className="card tight" style={{ marginTop: 12 }}>
            🍢 Можно сделать предзаказ к приходу — оформите его в Меню, он привяжется к брони.
          </div>
          <button className="btn block" style={{ marginTop: 14 }} onClick={reserve}>Подтвердить бронь</button>
        </>)}
      </Sheet>

      <Sheet open={qrOpen} onClose={() => setQrOpen(false)}>
        <h2>Сканирование QR стола</h2>
        <div className="muted">Демо: выберите стол, как будто отсканировали его QR-код</div>
        <div className="chips wrap" style={{ flexWrap: 'wrap', marginTop: 14 }}>
          {data.map((t) => <button key={t.id} className="chip" onClick={() => scanTable(t)}>Стол №{t.number}</button>)}
        </div>
      </Sheet>
    </div>
  );
}

// Экран обслуживания за столом (после QR)
export function TableService() {
  const { table, toast } = useStore();
  const nav = useNavigate();
  if (!table) { nav('/tables'); return null; }
  const call = async (type) => {
    try { await api.post('/calls', { tableNumber: table.number, type }); toast(type === 'bill' ? 'Счёт запрошен' : 'Официант уведомлён'); }
    catch (e) { toast(e.message); }
  };
  return (
    <div className="screen">
      <div className="card center" style={{ background: 'linear-gradient(135deg,#2a1606,#3a1d08)' }}>
        <div style={{ fontSize: 40 }}>🍽</div>
        <h1>Стол №{table.number}</h1>
        <div className="muted">Заказывайте прямо со стола</div>
      </div>
      <button className="btn block" style={{ marginTop: 18 }} onClick={() => nav('/menu')}>📖 Открыть меню и заказать</button>
      <button className="btn ghost block" style={{ marginTop: 12 }} onClick={() => call('waiter')}>🔔 Вызвать официанта</button>
      <button className="btn fire block" style={{ marginTop: 12 }} onClick={() => call('bill')}>💳 Попросить счёт</button>
    </div>
  );
}
