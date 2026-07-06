import { useState, useEffect, useRef } from 'react';
import { api } from '../api.js';
import { useStore } from '../context/store.jsx';
import { Sheet } from './ui.jsx';

const hhmm = (iso) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

// Чат по заказу. me: 'client' | 'courier' | 'owner' (owner — только просмотр + телефон).
export default function OrderChat({ orderId, me, onClose }) {
  const { t } = useStore();
  const [data, setData] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);

  const load = async () => { try { setData(await api.get(`/orders/${orderId}/chat`)); } catch {} };
  useEffect(() => { load(); const iv = setInterval(load, 4000); return () => clearInterval(iv); }, [orderId]);
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [data?.messages?.length]);

  const send = async () => {
    const body = text.trim(); if (!body) return;
    try { setBusy(true); await api.post(`/orders/${orderId}/chat`, { text: body }); setText(''); await load(); }
    catch (e) { /* тост не критичен здесь */ } finally { setBusy(false); }
  };

  const title = me === 'client' ? t('chat_with_courier') : me === 'courier' ? t('chat_with_client') : `${t('chat')} · #${orderId}`;
  const mySide = me === 'client' ? 'client' : me === 'courier' ? 'courier' : null;
  const msgs = data?.messages || [];

  return (
    <Sheet open={true} onClose={onClose}>
      <h2>{title}</h2>
      {me === 'owner' && data && (
        <div className="muted" style={{ marginBottom: 8 }}>{data.clientName} · <span className="gold">{data.clientPhone}</span></div>
      )}
      <div ref={listRef} style={{ maxHeight: '50vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, margin: '12px 0', padding: '2px' }}>
        {msgs.length === 0 && <div className="muted center" style={{ padding: '24px 0' }}>{t('chat_empty')}</div>}
        {msgs.map((m) => {
          const own = m.from === mySide;
          return (
            <div key={m.id} style={{ alignSelf: own ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
              <div style={{
                background: own ? 'var(--grad-gold)' : 'var(--graphite-2)',
                color: own ? '#1a1206' : 'var(--text)',
                border: own ? 'none' : '1px solid var(--line)',
                padding: '9px 13px', borderRadius: 14, fontSize: 15, wordBreak: 'break-word',
              }}>
                {me === 'owner' && <div style={{ fontSize: 10, fontWeight: 800, opacity: .65, marginBottom: 2 }}>{m.from === 'client' ? 'Клиент' : 'Курьер'}</div>}
                {m.text}
              </div>
              <div className="muted" style={{ fontSize: 10, textAlign: own ? 'right' : 'left', marginTop: 2 }}>{hhmm(m.at)}</div>
            </div>
          );
        })}
      </div>
      {me === 'owner' ? (
        <div className="muted center" style={{ fontSize: 12 }}>Только просмотр</div>
      ) : data && data.open ? (
        <div className="row" style={{ gap: 8 }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('message_ph')}
            onKeyDown={(e) => e.key === 'Enter' && send()} style={{ flex: 1 }} />
          <button className="btn sm" disabled={busy || !text.trim()} onClick={send}>{t('send_msg')}</button>
        </div>
      ) : (
        <div className="muted center" style={{ fontSize: 13 }}>{t('chat_closed')}</div>
      )}
    </Sheet>
  );
}
