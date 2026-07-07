import { useStore } from '../context/store.jsx';

// Координаты бара (из встраиваемой карты Google)
const LAT = 12.805392487494904;
const LNG = 100.92876147600134;
const EMBED = 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3890.5855483299447!2d100.92876147600134!3d12.805392487494904!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x310293ce633966bb%3A0xe347f9c74e3086a!2sGRILL%20DRAFT%20BEER%20BAR%20%22GROT%22!5e0!3m2!1s{LANG}!2sth!4v1783408084650!5m2!1s{LANG}!2sth';

export default function Location() {
  const { t, lang } = useStore();
  const src = EMBED.replaceAll('{LANG}', lang === 'en' ? 'en' : 'ru');
  const query = `${LAT},${LNG}`;

  return (
    <div className="screen">
      <h1>{t('location_title')}</h1>
      <div className="muted" style={{ marginBottom: 12 }}>GRILL &amp; DRAFT BEER BAR «GROT» · Pattaya</div>

      <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid var(--line)', lineHeight: 0 }}>
        <iframe
          title="GROT map"
          src={src}
          width="100%"
          height="330"
          style={{ border: 0, display: 'block' }}
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>

      <a className="btn block" style={{ marginTop: 14 }}
         href={`https://www.google.com/maps/dir/?api=1&destination=${query}`}
         target="_blank" rel="noreferrer">🧭 {t('build_route')}</a>
      <a className="btn ghost block" style={{ marginTop: 10 }}
         href={`https://www.google.com/maps/search/?api=1&query=${query}`}
         target="_blank" rel="noreferrer">📍 {t('open_in_maps')}</a>
    </div>
  );
}
