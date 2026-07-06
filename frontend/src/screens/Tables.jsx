import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useStore } from '../context/store.jsx';
import { Loader, Sheet, useFetch, money } from '../components/ui.jsx';

const ST = { free: 'st-free', reserved: 'st-reserved', occupied: 'st-occupied' };
const DOT = { free: '🟢', reserved: '🟡', occupied: '🔴' };

export default function Tables() {
  const { data, loading, reload } = useFetch(() => api.get('/tables'));
  const { setTable, toast, t } = useStore();
  const nav = useNavigate();
  const [sel, setSel] = useState(null);
  const [book, setBook] = useState(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [form, setForm] = useState({ date: '2026-06-24', time: '19:30', guests: 2, comment: '' });

  if (loading || !data) return <Loader />;

  const statusLabel = (s) => `${DOT[s]} ${t('tbl_' + s)}`;

  // Имитация сканирования QR — выбор стола активирует «режим стола»
  const scanTable = (tbl) => {
    setTable({ id: tbl.id, number: tbl.number });
    setQrOpen(false);
    toast(`${t('youre_at_table')} №${tbl.number}`);
    nav('/table-service');
  };

  const reserve = async () => {
    try {
      await api.post('/reservations', { tableNumber: book.number, ...form });
      toast(`${t('table')} №${book.number} ${t('reserved_toast')}`);
      setBook(null); reload();
    } catch (e) { toast(e.message); }
  };

  return (
    <div className="screen">
      <div className="between"><h1>{t('hall_bookings')}</h1>
        <button className="btn sm" onClick={() => setQrOpen(true)}>📷 {t('scan_qr')}</button></div>
      <div className="row" style={{ gap: 14, margin: '10px 0' }}>
        <span className="muted">🟢 {t('tbl_free')}</span><span className="muted">🟡 {t('tbl_reserved')}</span><span className="muted">🔴 {t('tbl_occupied')}</span>
      </div>

      <div className="floor">
        {data.map((tbl) => (
          <div key={tbl.id} className={`tbl ${ST[tbl.status]}`} style={{ left: `${tbl.x}%`, top: `${tbl.y}%` }} onClick={() => setSel(tbl)}>
            №{tbl.number}<small>{tbl.seats} {t('seats')}</small>
          </div>
        ))}
      </div>

      <Sheet open={!!sel} onClose={() => setSel(null)}>
        {sel && (<>
          <h2>{t('table')} №{sel.number}</h2>
          <div className="muted">{sel.seats} {t('seats')} · {statusLabel(sel.status)}</div>
          <div className="divider" />
          <button className="btn block" disabled={sel.status === 'occupied'} onClick={() => { setBook(sel); setSel(null); }}>{t('book_btn')}</button>
          <button className="btn ghost block" style={{ marginTop: 10 }} onClick={() => scanTable(sel)}>{t('im_at_table')}</button>
        </>)}
      </Sheet>

      <Sheet open={!!book} onClose={() => setBook(null)}>
        {book && (<>
          <h2>{t('booking_word')} · {t('table').toLowerCase()} №{book.number}</h2>
          <label>{t('date_label')}</label><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <label>{t('time_label')}</label><input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
          <label>{t('guests_label')}</label><input type="number" min={1} max={book.seats} value={form.guests} onChange={(e) => setForm({ ...form, guests: +e.target.value })} />
          <label>{t('comment')}</label><input value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} placeholder={t('wishes_ph')} />
          <div className="card tight" style={{ marginTop: 12 }}>
            🍢 {t('preorder_hint')}
          </div>
          <button className="btn block" style={{ marginTop: 14 }} onClick={reserve}>{t('confirm_booking')}</button>
        </>)}
      </Sheet>

      <Sheet open={qrOpen} onClose={() => setQrOpen(false)}>
        <h2>{t('qr_scan_title')}</h2>
        <div className="muted">{t('qr_demo_hint')}</div>
        <div className="chips wrap" style={{ flexWrap: 'wrap', marginTop: 14 }}>
          {data.map((tbl) => <button key={tbl.id} className="chip" onClick={() => scanTable(tbl)}>{t('table')} №{tbl.number}</button>)}
        </div>
      </Sheet>
    </div>
  );
}

// Экран обслуживания за столом (после QR)
export function TableService() {
  const { table, toast, t } = useStore();
  const nav = useNavigate();
  if (!table) { nav('/tables'); return null; }
  const call = async (type) => {
    try { await api.post('/calls', { tableNumber: table.number, type }); toast(type === 'bill' ? t('bill_requested') : t('waiter_notified')); }
    catch (e) { toast(e.message); }
  };
  return (
    <div className="screen">
      <div className="card center" style={{ background: 'linear-gradient(135deg,#2a1606,#3a1d08)' }}>
        <div style={{ fontSize: 40 }}>🍽</div>
        <h1>{t('table')} №{table.number}</h1>
        <div className="muted">{t('order_from_table')}</div>
      </div>
      <button className="btn block" style={{ marginTop: 18 }} onClick={() => nav('/menu')}>📖 {t('open_menu_order')}</button>
      <button className="btn ghost block" style={{ marginTop: 12 }} onClick={() => call('waiter')}>🔔 {t('call_waiter_btn')}</button>
      <button className="btn fire block" style={{ marginTop: 12 }} onClick={() => call('bill')}>💳 {t('ask_bill_btn')}</button>
    </div>
  );
}
