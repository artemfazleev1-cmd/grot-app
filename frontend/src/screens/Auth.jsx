import { useState } from 'react';
import { useStore } from '../context/store.jsx';
import { api, setToken } from '../api.js';

const DEMO = [
  ['Клиент', '5555555555', 'client'],
  ['Официант', '2222222222', 'waiter'],
  ['Кухня', '3333333333', 'cook'],
  ['Курьер', '4444444444', 'courier'],
  ['Владелец', '0000000000', 'owner'],
];

export default function Auth() {
  const { login, register, toast, refreshMe, config } = useStore();
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ phone: '', password: '', password2: '', name: '' });
  const [busy, setBusy] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const requestOtp = async () => {
    try {
      setBusy(true);
      const r = await api.post('/auth/request-otp', { phone: f.phone });
      setOtpSent(true);
      toast(r.devCode ? `Демо-код: ${r.devCode}` : 'Код отправлен по SMS');
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  };
  const verifyOtp = async () => {
    try {
      setBusy(true);
      const { token, user } = await api.post('/auth/verify-otp', { phone: f.phone, code: otp, name: f.name });
      setToken(token); await refreshMe();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  };

  const submit = async () => {
    try {
      setBusy(true);
      if (mode === 'register') {
        if (f.password !== f.password2) throw new Error('Пароли не совпадают');
        await register({ phone: f.phone, password: f.password, name: f.name });
      } else {
        await login(f.phone, f.password);
      }
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  };

  const quick = async (phone, pw) => { try { setBusy(true); await login(phone, pw); } catch (e) { toast(e.message); } finally { setBusy(false); } };

  return (
    <div className="screen" style={{ paddingTop: 40 }}>
      <div className="center" style={{ marginBottom: 26 }}>
        <img src="/logo.png" alt="GROT" className="brand-logo glow-lg" style={{ width: 150, height: 150, margin: '0 auto' }} />
        <div className="muted" style={{ marginTop: 12, letterSpacing: 1 }}>GRILL BAR · BEER BAR · PATTAYA</div>
      </div>

      <div className="card">
        <div className="chips" style={{ marginBottom: 14 }}>
          <button className={`chip ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>Вход</button>
          <button className={`chip ${mode === 'register' ? 'active' : ''}`} onClick={() => setMode('register')}>Регистрация</button>
          <button className={`chip ${mode === 'sms' ? 'active' : ''}`} onClick={() => { setMode('sms'); setOtpSent(false); }}>По SMS-коду</button>
        </div>

        {mode === 'sms' ? (
          <>
            <label>Номер телефона</label>
            <input value={f.phone} onChange={set('phone')} placeholder="0XXXXXXXXX" inputMode="tel" />
            {!otpSent ? (
              <button className="btn block" style={{ marginTop: 16 }} disabled={busy || !f.phone} onClick={requestOtp}>Получить код</button>
            ) : (
              <>
                <label>Код из SMS</label>
                <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="000000" inputMode="numeric" />
                <button className="btn block" style={{ marginTop: 16 }} disabled={busy || !otp} onClick={verifyOtp}>Войти</button>
                <div className="muted center" style={{ marginTop: 8 }} onClick={requestOtp}>Отправить код повторно</div>
              </>
            )}
            <div className="muted center" style={{ marginTop: 8, fontSize: 11 }}>
              {config.smsEnabled ? 'Код придёт по SMS' : 'Демо-режим: код показывается на экране'}
            </div>
          </>
        ) : (
        <>
        {mode === 'register' && (<><label>Имя</label><input value={f.name} onChange={set('name')} placeholder="Как вас зовут" /></>)}
        <label>Номер телефона</label>
        <input value={f.phone} onChange={set('phone')} placeholder="0XXXXXXXXX" inputMode="tel" />
        <label>Пароль</label>
        <input type="password" value={f.password} onChange={set('password')} placeholder="••••••" />
        {mode === 'register' && (<><label>Повтор пароля</label><input type="password" value={f.password2} onChange={set('password2')} /></>)}

        <button className="btn block" style={{ marginTop: 18 }} disabled={busy} onClick={submit}>
          {mode === 'login' ? 'Войти' : 'Создать аккаунт'}
        </button>
        {mode === 'login' && <div className="muted center" style={{ marginTop: 12 }} onClick={() => toast('Восстановление: введите телефон администратору (демо)')}>Забыли пароль?</div>}
        </>
        )}
      </div>

      <div className="section-title"><h2>Демо-вход по ролям</h2></div>
      <div className="chips wrap" style={{ flexWrap: 'wrap' }}>
        {DEMO.map(([label, phone, pw]) => (
          <button key={phone} className="chip" onClick={() => quick(phone, pw)}>{label}</button>
        ))}
      </div>
    </div>
  );
}
