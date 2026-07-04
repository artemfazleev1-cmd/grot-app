import { useState } from 'react';
import { useStore } from '../context/store.jsx';
import { api } from '../api.js';

const DEMO = [
  ['Клиент', '5555555555', 'client'],
  ['Официант', '2222222222', 'waiter'],
  ['Кухня', '3333333333', 'cook'],
  ['Курьер', '4444444444', 'courier'],
  ['Владелец', '0000000000', 'owner'],
];

// Коды стран для международных номеров (Таиланд + основные туристы Паттайи)
const COUNTRIES = [
  ['🇹🇭 +66', '66'], ['🇷🇺 +7', '7'], ['🇬🇧 +44', '44'], ['🇺🇸 +1', '1'],
  ['🇩🇪 +49', '49'], ['🇫🇷 +33', '33'], ['🇦🇺 +61', '61'], ['🇨🇳 +86', '86'],
  ['🇰🇷 +82', '82'], ['🇯🇵 +81', '81'], ['🇮🇳 +91', '91'], ['🇸🇪 +46', '46'],
  ['🇳🇴 +47', '47'], ['🇦🇪 +971', '971'], ['🇰🇿 +7', '7'], ['🇺🇦 +380', '380'],
];

// Приводим к международному формату E.164: +<код><номер без ведущих нулей>
const toE164 = (cc, local) => {
  const digits = String(local).replace(/\D/g, '').replace(/^0+/, '');
  return digits ? `+${cc}${digits}` : '';
};

export default function Auth() {
  const { login, register, toast, config } = useStore();
  const [mode, setMode] = useState('login');           // login | register
  const [cc, setCc] = useState('66');                  // код страны (по умолч. Таиланд)
  const [f, setF] = useState({ phone: '', password: '', password2: '', name: '', code: '' });
  const [busy, setBusy] = useState(false);
  const [codeSent, setCodeSent] = useState(false);     // шаг регистрации: код отправлен
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const fullPhone = () => toE164(cc, f.phone);
  const switchMode = (m) => { setMode(m); setCodeSent(false); };

  // Регистрация, шаг 1 — отправить код на номер
  const sendCode = async () => {
    const phone = fullPhone();
    if (!phone) return toast('Введите номер телефона');
    try {
      setBusy(true);
      const r = await api.post('/auth/request-otp', { phone });
      setCodeSent(true);
      toast(r.devCode ? `Демо-код: ${r.devCode}` : `Код отправлен на ${phone}`);
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  };

  // Регистрация, шаг 2 — подтвердить код и создать аккаунт
  const doRegister = async () => {
    try {
      if (!f.code) return toast('Введите код из SMS');
      if (f.password.length < 4) return toast('Пароль минимум 4 символа');
      if (f.password !== f.password2) return toast('Пароли не совпадают');
      setBusy(true);
      await register({ phone: fullPhone(), code: f.code, password: f.password, name: f.name });
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  };

  const doLogin = async () => {
    try { setBusy(true); await login(fullPhone(), f.password); }
    catch (e) { toast(e.message); } finally { setBusy(false); }
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
          <button className={`chip ${mode === 'login' ? 'active' : ''}`} onClick={() => switchMode('login')}>Вход</button>
          <button className={`chip ${mode === 'register' ? 'active' : ''}`} onClick={() => switchMode('register')}>Регистрация</button>
        </div>

        {/* ---------- ВХОД: номер + пароль ---------- */}
        {mode === 'login' && (
          <>
            <label>Номер телефона</label>
            <div className="row" style={{ gap: 8 }}>
              <select value={cc} onChange={(e) => setCc(e.target.value)} style={{ width: 116 }}>
                {COUNTRIES.map(([label, code], i) => <option key={i} value={code}>{label}</option>)}
              </select>
              <input value={f.phone} onChange={set('phone')} placeholder="81 234 5678" inputMode="tel" style={{ flex: 1 }} />
            </div>
            <label>Пароль</label>
            <input type="password" value={f.password} onChange={set('password')} placeholder="••••••" />
            <button className="btn block" style={{ marginTop: 18 }} disabled={busy} onClick={doLogin}>Войти</button>
            <div className="muted center" style={{ marginTop: 12 }} onClick={() => toast('Восстановление пароля скоро будет — по коду из SMS')}>Забыли пароль?</div>
          </>
        )}

        {/* ---------- РЕГИСТРАЦИЯ: номер → SMS-код → пароль ---------- */}
        {mode === 'register' && (
          !codeSent ? (
            <>
              <label>Имя</label>
              <input value={f.name} onChange={set('name')} placeholder="Как вас зовут" />
              <label>Номер телефона</label>
              <div className="row" style={{ gap: 8 }}>
                <select value={cc} onChange={(e) => setCc(e.target.value)} style={{ width: 116 }}>
                  {COUNTRIES.map(([label, code], i) => <option key={i} value={code}>{label}</option>)}
                </select>
                <input value={f.phone} onChange={set('phone')} placeholder="81 234 5678" inputMode="tel" style={{ flex: 1 }} />
              </div>
              <button className="btn block" style={{ marginTop: 18 }} disabled={busy || !f.phone} onClick={sendCode}>Получить код по SMS</button>
              <div className="muted center" style={{ marginTop: 8, fontSize: 11 }}>
                {config.smsEnabled ? 'Код придёт SMS-сообщением' : 'Демо-режим: код покажется на экране'}
              </div>
            </>
          ) : (
            <>
              <div className="muted" style={{ marginBottom: 4 }}>Код отправлен на {fullPhone()}</div>
              <label>Код из SMS</label>
              <input value={f.code} onChange={set('code')} placeholder="000000" inputMode="numeric" />
              <label>Придумайте пароль</label>
              <input type="password" value={f.password} onChange={set('password')} placeholder="••••••" />
              <label>Повторите пароль</label>
              <input type="password" value={f.password2} onChange={set('password2')} placeholder="••••••" />
              <button className="btn block" style={{ marginTop: 18 }} disabled={busy} onClick={doRegister}>Создать аккаунт</button>
              <div className="muted center" style={{ marginTop: 10 }} onClick={sendCode}>Отправить код повторно</div>
            </>
          )
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
