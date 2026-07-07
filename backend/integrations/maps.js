// =====================================================================
// Карты / геокодирование адресов доставки + расчёт зоны доставки.
// ENV: GOOGLE_MAPS_KEY. Без ключа — демо-режим (фиксированная зона Pattaya).
// Координаты заведения берём из ENV RESTAURANT_LAT/LNG (по умолчанию — центр Паттайи).
// =====================================================================
const KEY = process.env.GOOGLE_MAPS_KEY || null;
export const mapsEnabled = !!KEY;
export const mapsBrowserKey = process.env.GOOGLE_MAPS_BROWSER_KEY || KEY || null;

// Координаты бара GROT (Pattaya). Можно переопределить через ENV RESTAURANT_LAT/LNG.
const ORIGIN = {
  lat: Number(process.env.RESTAURANT_LAT || 12.805392),
  lng: Number(process.env.RESTAURANT_LNG || 100.928761),
};
const DELIVERY_RADIUS_KM = Number(process.env.DELIVERY_RADIUS_KM || 8);

function haversine(a, b) {
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export async function geocode(address) {
  if (!KEY) {
    // демо: возвращаем центр Паттайи как «найденную» точку
    return { lat: ORIGIN.lat + 0.01, lng: ORIGIN.lng + 0.01, demo: true, formatted: address };
  }
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  const r = data.results?.[0];
  if (!r) throw new Error('Адрес не найден');
  return { lat: r.geometry.location.lat, lng: r.geometry.location.lng, formatted: r.formatted_address };
}

// Обратное геокодирование: координаты GPS -> адрес. Без ключа — демо.
export async function reverseGeocode(lat, lng) {
  if (!KEY) return { lat, lng, demo: true, formatted: `Геолокация ${(+lat).toFixed(5)}, ${(+lng).toFixed(5)}` };
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  const r = data.results?.[0];
  return { lat, lng, formatted: r?.formatted_address || `${lat}, ${lng}` };
}

// Проверка зоны доставки. На входе адрес ИЛИ координаты ({lat,lng}).
export async function checkDelivery({ address, lat, lng } = {}) {
  const point = (lat != null && lng != null) ? await reverseGeocode(lat, lng) : await geocode(address);
  const distanceKm = +haversine(ORIGIN, point).toFixed(2);
  const inZone = distanceKm <= DELIVERY_RADIUS_KM;
  const fee = inZone ? Math.max(0, Math.round((distanceKm - 2) * 10)) : null;
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}`;
  return { ...point, distanceKm, inZone, fee, radiusKm: DELIVERY_RADIUS_KM, mapUrl };
}
