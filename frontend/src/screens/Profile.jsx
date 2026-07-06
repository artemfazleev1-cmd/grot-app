import { api } from '../api.js';
import { useStore } from '../context/store.jsx';
import { Loader, useFetch, money, Empty } from '../components/ui.jsx';

const STEPS = ['new', 'accepted', 'cooking', 'ready', 'delivered'];

function OrderCard({ o, onRepeat, t }) {
  const idx = Math.max(0, STEPS.indexOf(o.status === 'handed' ? 'delivered' : o.status === 'delivering' ? 'ready' : o.status));
  const active = !['delivered', 'handed'].includes(o.status);
  const typeLabel = o.type === 'delivery' ? t('delivery') : o.type === 'pickup' ? t('pickup') : `${t('table')} №${o.tableNumber}`;
  return (
    <div className="card">
      <div className="between">
        <b>№{o.id}</b>
        <span className={`badge ${active ? 'gold' : 'green'}`}>{t('st_' + o.status)}</span>
      </div>
      <div className="muted" style={{ margin: '4px 0' }}>{typeLabel}</div>
      {active && <div className="steps">{STEPS.map((s, i) => <i key={s} className={i <= idx ? 'on' : ''} />)}</div>}
      <div className="muted">{o.items.map((i) => `${i.name} ×${i.qty}`).join(', ')}</div>
      <div className="between" style={{ marginTop: 8 }}>
        <b className="gold">{money(o.total)}</b>
        <button className="btn ghost sm" onClick={() => onRepeat(o)}>↩ {t('repeat')}</button>
      </div>
    </div>
  );
}

export default function Profile() {
  const { user, logout, addToCart, toast, t } = useStore();
  const orders = useFetch(() => api.get('/orders'));

  if (orders.loading) return <Loader />;
  const repeat = (o) => { o.items.forEach((i) => addToCart({ id: i.menuId, name: i.name, price: i.price })); toast(t('added_to_cart')); };
  const activeOrders = orders.data.filter((o) => !['delivered', 'handed'].includes(o.status));
  const pastOrders = orders.data.filter((o) => ['delivered', 'handed'].includes(o.status));

  return (
    <div className="screen">
      <div className="between"><h1>{t('account')}</h1><button className="btn ghost sm" onClick={logout}>{t('logout')}</button></div>

      {user?.favDishes?.length > 0 && (
        <div className="card tight" style={{ marginTop: 14 }}>
          <div className="muted">{t('fav_dishes')}</div><div>{user.favDishes.join(', ')}</div>
          <div className="muted" style={{ marginTop: 8 }}>{t('fav_drinks')}</div><div>{user.favDrinks?.join(', ') || '—'}</div>
        </div>
      )}

      <div className="section-title"><h2>{t('active_orders')}</h2></div>
      <div className="list">
        {activeOrders.map((o) => <OrderCard key={o.id} o={o} onRepeat={repeat} t={t} />)}
        {activeOrders.length === 0 && <Empty icon="✨" text={t('no_active')} />}
      </div>

      <div className="section-title"><h2>{t('order_history')}</h2></div>
      <div className="list">
        {pastOrders.map((o) => <OrderCard key={o.id} o={o} onRepeat={repeat} t={t} />)}
      </div>
    </div>
  );
}
