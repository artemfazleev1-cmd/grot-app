import { useState } from 'react';
import { useStore } from '../context/store.jsx';
import { api } from '../api.js';

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
  const { login, register, toast, config, t } = useStore();
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
    if (!phone) return toast(t('enter_phone'));
    try {
      setBusy(true);
      const r = await api.post('/auth/request-otp', { phone });
      setCodeSent(true);
      toast(r.devCode ? `${t('demo_code')}: ${r.devCode}` : `${t('code_sent')} ${phone}`);
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  };

  // Регистрация, шаг 2 — подтвердить код и создать аккаунт
  const doRegister = async () => {
    try {
      if (!f.code) return toast(t('enter_code'));
      if (f.password.length < 4) return toast(t('pw_min'));
      if (f.password !== f.password2) return toast(t('pw_mismatch'));
      setBusy(true);
      await register({ phone: fullPhone(), code: f.code, password: f.password, name: f.name });
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  };

  // Простая регистрация (без SMS-кода): имя + телефон + пароль
  const doRegisterSimple = async () => {
    try {
      if (!f.name.trim()) return toast(t('enter_name'));
      if (!fullPhone()) return toast(t('enter_phone'));
      if (f.password.length < 4) return toast(t('pw_min'));
      if (f.password !== f.password2) return toast(t('pw_mismatch'));
      setBusy(true);
      await register({ phone: fullPhone(), password: f.password, name: f.name });
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  };

  const doLogin = async () => {
    try { setBusy(true); await login(fullPhone(), f.password); }
    catch (e) { toast(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100dvh', paddingTop: 'calc(24px + env(safe-area-inset-top))', paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
      <div className="center" style={{ marginBottom: 26 }}>
        <img src="/logo.png" alt="GROT" className="brand-logo glow-lg" style={{ width: 150, height: 150, margin: '0 auto' }} />
        <div className="muted" style={{ marginTop: 12, letterSpacing: 1 }}>GRILL BAR · BEER BAR · PATTAYA</div>
      </div>

      <div className="card">
        <div className="chips" style={{ marginBottom: 14 }}>
          <button className={`chip ${mode === 'login' ? 'active' : ''}`} onClick={() => switchMode('login')}>{t('auth_login')}</button>
          <button className={`chip ${mode === 'register' ? 'active' : ''}`} onClick={() => switchMode('register')}>{t('auth_register')}</button>
        </div>

        {/* ---------- ВХОД: номер + пароль ---------- */}
        {mode === 'login' && (
          <>
            <label>{t('phone_label')}</label>
            <div className="row" style={{ gap: 8 }}>
              <select value={cc} onChange={(e) => setCc(e.target.value)} style={{ width: 116 }}>
                {COUNTRIES.map(([label, code], i) => <option key={i} value={code}>{label}</option>)}
              </select>
              <input value={f.phone} onChange={set('phone')} placeholder="81 234 5678" inputMode="tel" style={{ flex: 1 }} />
            </div>
            <label>{t('password_label')}</label>
            <input type="password" value={f.password} onChange={set('password')} placeholder="••••••" />
            <button className="btn block" style={{ marginTop: 18 }} disabled={busy} onClick={doLogin}>{t('login_btn')}</button>
            <div className="muted center" style={{ marginTop: 12 }} onClick={() => toast(t('forgot_pw_msg'))}>{t('forgot_pw')}</div>
          </>
        )}

        {/* ---------- РЕГИСТРАЦИЯ (простая, без SMS-кода) ---------- */}
        {mode === 'register' && !config.otpRequired && (
          <>
            <label>{t('name_label')}</label>
            <input value={f.name} onChange={set('name')} placeholder={t('name_ph')} />
            <label>{t('phone_label')}</label>
            <div className="row" style={{ gap: 8 }}>
              <select value={cc} onChange={(e) => setCc(e.target.value)} style={{ width: 116 }}>
                {COUNTRIES.map(([label, code], i) => <option key={i} value={code}>{label}</option>)}
              </select>
              <input value={f.phone} onChange={set('phone')} placeholder="81 234 5678" inputMode="tel" style={{ flex: 1 }} />
            </div>
            <label>{t('create_pw')}</label>
            <input type="password" value={f.password} onChange={set('password')} placeholder="••••••" />
            <label>{t('repeat_pw')}</label>
            <input type="password" value={f.password2} onChange={set('password2')} placeholder="••••••" />
            <button className="btn block" style={{ marginTop: 18 }} disabled={busy || !f.phone} onClick={doRegisterSimple}>{t('create_account')}</button>
          </>
        )}

        {/* ---------- РЕГИСТРАЦИЯ: номер → SMS-код → пароль ---------- */}
        {mode === 'register' && config.otpRequired && (
          !codeSent ? (
            <>
              <label>{t('name_label')}</label>
              <input value={f.name} onChange={set('name')} placeholder={t('name_ph')} />
              <label>{t('phone_label')}</label>
              <div className="row" style={{ gap: 8 }}>
                <select value={cc} onChange={(e) => setCc(e.target.value)} style={{ width: 116 }}>
                  {COUNTRIES.map(([label, code], i) => <option key={i} value={code}>{label}</option>)}
                </select>
                <input value={f.phone} onChange={set('phone')} placeholder="81 234 5678" inputMode="tel" style={{ flex: 1 }} />
              </div>
              <button className="btn block" style={{ marginTop: 18 }} disabled={busy || !f.phone} onClick={sendCode}>{t('get_code')}</button>
              <div className="muted center" style={{ marginTop: 8, fontSize: 11 }}>
                {config.smsEnabled ? t('sms_will_come') : t('demo_code_screen')}
              </div>
            </>
          ) : (
            <>
              <div className="muted" style={{ marginBottom: 4 }}>{t('code_sent_to')} {fullPhone()}</div>
              <label>{t('sms_code_label')}</label>
              <input value={f.code} onChange={set('code')} placeholder="000000" inputMode="numeric" />
              <label>{t('create_pw')}</label>
              <input type="password" value={f.password} onChange={set('password')} placeholder="••••••" />
              <label>{t('repeat_pw')}</label>
              <input type="password" value={f.password2} onChange={set('password2')} placeholder="••••••" />
              <button className="btn block" style={{ marginTop: 18 }} disabled={busy} onClick={doRegister}>{t('create_account')}</button>
              <div className="muted center" style={{ marginTop: 10 }} onClick={sendCode}>{t('resend_code')}</div>
            </>
          )
        )}
      </div>
    </div>
  );
}
