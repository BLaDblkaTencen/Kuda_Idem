const CITY_TZ = 'Europe/Moscow'; // Севастополь

const dateFmt = new Intl.DateTimeFormat('ru-RU', {
  timeZone: CITY_TZ,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** «пятница, 20 ноября в 19:00» */
export function formatTripDate(date: Date): string {
  const p = Object.fromEntries(dateFmt.formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.weekday}, ${p.day} ${p.month} в ${p.hour}:${p.minute}`;
}

export function yandexMapsLink(place: { name: string; address: string; lat: number | null; lon: number | null }): string {
  if (place.lat !== null && place.lon !== null) {
    return `https://yandex.ru/maps/?pt=${place.lon},${place.lat}&z=17&l=map`;
  }
  return `https://yandex.ru/maps/?text=${encodeURIComponent(`${place.name}, ${place.address}, Севастополь`)}`;
}
