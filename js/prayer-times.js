// Azan (prayer) time calculation using the "Tehran" method (Institute of
// Geophysics, University of Tehran): Fajr angle 17.7°, Maghrib angle 4.5°
// below horizon. Only Fajr/Dhuhr/Maghrib get their own azan, matching Shia
// practice (Asr follows the Dhuhr azan, Isha follows the Maghrib azan, with
// no separate call for either). Single-pass approximation using solar-noon
// declination — accurate to within a minute or two, not a fiqh-grade engine.

const TEHRAN_METHOD = { fajrAngle: 17.7, maghribAngle: 4.5 };

function dsin(d) { return Math.sin((d * Math.PI) / 180); }
function dcos(d) { return Math.cos((d * Math.PI) / 180); }
function darcsin(x) { return (Math.asin(x) * 180) / Math.PI; }
function darccos(x) { return (Math.acos(x) * 180) / Math.PI; }
function darctan2(y, x) { return (Math.atan2(y, x) * 180) / Math.PI; }
function fix(a, b) { const r = a - b * Math.floor(a / b); return r < 0 ? r + b : r; }
function fixAngle(a) { return fix(a, 360); }
function fixHour(a) { return fix(a, 24); }

function julianDate(year, month, day) {
  if (month <= 2) { year -= 1; month += 12; }
  const A = Math.floor(year / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + B - 1524.5;
}

// Declination and equation of time (hours) of the sun at a given Julian date.
function sunPosition(jd) {
  const D = jd - 2451545.0;
  const g = fixAngle(357.529 + 0.98560028 * D);
  const q = fixAngle(280.459 + 0.98564736 * D);
  const L = fixAngle(q + 1.915 * dsin(g) + 0.02 * dsin(2 * g));
  const e = 23.439 - 0.00000036 * D;
  const RA = darctan2(dcos(e) * dsin(L), dcos(L)) / 15;
  const eqt = q / 15 - fixHour(RA);
  const decl = darcsin(dsin(e) * dsin(L));
  return { declination: decl, equation: eqt };
}

// Hours from solar noon at which the sun reaches `angle` degrees below the horizon.
function hourAngle(angle, lat, decl) {
  const val = (-dsin(angle) - dsin(lat) * dsin(decl)) / (dcos(lat) * dcos(decl));
  return darccos(Math.max(-1, Math.min(1, val))) / 15;
}

function getTimezoneOffsetHours_(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const parts = dtf.formatToParts(date).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  const asUTC = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return (asUTC - date.getTime()) / 3600000;
}

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
function toPersianDigits_(str) {
  return str.replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

function formatHours_(hours) {
  hours = fixHour(hours);
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  const hh = m === 60 ? h + 1 : h;
  const mm = m === 60 ? 0 : m;
  const hhmm = String(hh % 24).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  return toPersianDigits_(hhmm);
}

// dateStr: 'YYYY-MM-DD' (Gregorian). Returns {fajr, dhuhr, maghrib} as "HH:MM"
// local-time strings (Persian numerals) for the given location/timezone.
function calculateAzanTimes(dateStr, latitude, longitude, timeZone) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const jd = julianDate(y, mo, d) - longitude / (15 * 24);
  const noonUtc = new Date(Date.UTC(y, mo - 1, d, 12));
  const tzOffset = getTimezoneOffsetHours_(noonUtc, timeZone);

  const { declination: decl, equation: eqt } = sunPosition(jd + 0.5);

  const dhuhr = 12 + tzOffset - longitude / 15 - eqt;
  const fajr = dhuhr - hourAngle(TEHRAN_METHOD.fajrAngle, latitude, decl);
  const maghrib = dhuhr + hourAngle(TEHRAN_METHOD.maghribAngle, latitude, decl);

  return {
    fajr: formatHours_(fajr),
    dhuhr: formatHours_(dhuhr),
    maghrib: formatHours_(maghrib)
  };
}
