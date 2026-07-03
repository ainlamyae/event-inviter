// Auth + Sheets API / Gmail API wrappers. Loaded after config.js, before app.js.

let accessToken = null;
let tokenClient = null;
let sheetIdCache = null;

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets/' + CONFIG.SPREADSHEET_ID;
// hijriDate/shamsiDate/dayOfWeek/azan times/show*InEmail are appended at the end
// (columns H-T) rather than inserted after 'date', so existing rows/columns A-G
// never shift. Only 3 azan times (Fajr/Dhuhr/Maghrib) — Shia practice combines
// Asr into the Dhuhr azan and Isha into the Maghrib azan, so those two don't
// get their own azan.
const EVENT_FIELDS = [
  'date', 'title', 'outline', 'notes', 'background', 'links', 'receivers',
  'hijriDate', 'shamsiDate', 'dayOfWeek',
  'fajrTime', 'dhuhrTime', 'maghribTime',
  'showGregorianInEmail', 'showHijriInEmail', 'showShamsiInEmail', 'showDayOfWeekInEmail',
  'showFajrInEmail', 'showDhuhrInEmail', 'showMaghribInEmail'
];
// showGregorianInEmail defaults to true (preserves the original always-shown
// behavior for rows saved before this column existed); the others default to
// false since they never had prior "shown" behavior to preserve.
const BOOLEAN_FIELDS_DEFAULT_TRUE = ['showGregorianInEmail'];
const BOOLEAN_FIELDS_DEFAULT_FALSE = [
  'showHijriInEmail', 'showShamsiInEmail', 'showDayOfWeekInEmail',
  'showFajrInEmail', 'showDhuhrInEmail', 'showMaghribInEmail'
];
const EVENT_RANGE_SUFFIX = 'T'; // last column letter for EVENT_FIELDS.length (20 -> T)
const TOKEN_STORAGE_KEY = 'eventInviterToken';

function initAuth() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: CONFIG.SCOPES,
    callback: () => {} // overridden per-call in requestToken_()
  });
}

function isSignedIn() {
  return !!accessToken;
}

// Reuses a still-valid token from sessionStorage so a page refresh doesn't force
// a fresh sign-in — only the tab's own session, cleared when it's closed.
function tryRestoreSession() {
  try {
    const raw = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (saved.accessToken && saved.expiresAt - Date.now() > 60000) {
      accessToken = saved.accessToken;
      return true;
    }
  } catch (e) { /* corrupt/unavailable storage: ignore, fall back to signing in */ }
  return false;
}

function requestToken_(promptValue) {
  return new Promise((resolve, reject) => {
    tokenClient.callback = (resp) => {
      if (resp.error) { reject(resp); return; }
      accessToken = resp.access_token;
      const expiresAt = Date.now() + (resp.expires_in ? resp.expires_in * 1000 : 3600 * 1000);
      try {
        sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify({ accessToken, expiresAt }));
      } catch (e) { /* storage unavailable: token still works for this page load */ }
      resolve();
    };
    tokenClient.requestAccessToken({ prompt: promptValue });
  });
}

// Explicit sign-in, triggered by the button click.
function signIn() {
  return requestToken_('');
}

// Silent renewal: succeeds with no UI if there's still an active Google session
// and consent was already granted; rejects otherwise (caller falls back to the
// sign-in button). Guarded with a timeout in case it hangs instead of rejecting.
function trySilentSignIn(timeoutMs) {
  return Promise.race([
    requestToken_(''),
    new Promise((_, reject) => setTimeout(() => reject(new Error('silent sign-in timed out')), timeoutMs || 4000))
  ]);
}

async function apiFetch(url, options) {
  options = options || {};
  const doFetch = () => fetch(url, Object.assign({}, options, {
    headers: Object.assign({}, options.headers, {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json'
    })
  }));
  let res = await doFetch();
  if (res.status === 401) {
    // Access token expired mid-session (they last ~1 hour) — renew silently and retry once.
    try {
      await requestToken_('');
      res = await doFetch();
    } catch (e) { /* fall through; the original 401 will be reported below */ }
  }
  if (!res.ok) {
    throw new Error('Google API error ' + res.status + ': ' + (await res.text()));
  }
  if (res.status === 204) return null;
  return res.json();
}

async function getSheetId_(sheetName) {
  if (!sheetIdCache) {
    const data = await apiFetch(SHEETS_BASE + '?fields=sheets.properties');
    sheetIdCache = {};
    data.sheets.forEach((s) => { sheetIdCache[s.properties.title] = s.properties.sheetId; });
  }
  return sheetIdCache[sheetName];
}

async function getValues_(range) {
  const data = await apiFetch(SHEETS_BASE + '/values/' + encodeURIComponent(range));
  return data.values || [];
}

async function updateRow_(sheetName, rowNumber, values) {
  const lastCol = String.fromCharCode(64 + values.length); // 7 columns -> 'G', fine for this sheet
  const range = sheetName + '!A' + rowNumber + ':' + lastCol + rowNumber;
  await apiFetch(
    SHEETS_BASE + '/values/' + encodeURIComponent(range) + '?valueInputOption=USER_ENTERED',
    { method: 'PUT', body: JSON.stringify({ range, values: [values] }) }
  );
}

async function appendRow_(sheetName, values) {
  const data = await apiFetch(
    SHEETS_BASE + '/values/' + encodeURIComponent(sheetName + '!A1') +
      ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS',
    { method: 'POST', body: JSON.stringify({ values: [values] }) }
  );
  const match = /![A-Z]+(\d+)/.exec(data.updates.updatedRange);
  return match ? parseInt(match[1], 10) : null;
}

async function deleteRow_(sheetName, rowNumber) {
  const sheetId = await getSheetId_(sheetName);
  await apiFetch(SHEETS_BASE + ':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({
      requests: [{
        deleteDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: rowNumber - 1, endIndex: rowNumber }
        }
      }]
    })
  });
}

function rowToEvent(rowValues, rowNumber) {
  const ev = { rowNumber };
  EVENT_FIELDS.forEach((field, i) => {
    const v = rowValues[i];
    if (BOOLEAN_FIELDS_DEFAULT_TRUE.includes(field)) {
      ev[field] = !(v === false || String(v).toUpperCase() === 'FALSE');
    } else if (BOOLEAN_FIELDS_DEFAULT_FALSE.includes(field)) {
      ev[field] = v === true || String(v).toUpperCase() === 'TRUE';
    } else {
      ev[field] = v || '';
    }
  });
  return ev;
}

function eventToRow(ev) {
  const booleanFields = BOOLEAN_FIELDS_DEFAULT_TRUE.concat(BOOLEAN_FIELDS_DEFAULT_FALSE);
  return EVENT_FIELDS.map((f) => (booleanFields.includes(f) ? !!ev[f] : ev[f] || ''));
}

async function getAllEvents() {
  const values = await getValues_(CONFIG.EVENT_SHEET_NAME + '!A2:' + EVENT_RANGE_SUFFIX);
  const events = [];
  values.forEach((row, i) => {
    if (row.every((v) => !v)) return;
    events.push(rowToEvent(row, i + 2));
  });
  return events;
}

async function getEventsPage(pageIndex) {
  const all = await getAllEvents();
  all.sort((a, b) => {
    if (a.date === b.date) return 0;
    return a.date < b.date ? 1 : -1;
  });
  const start = pageIndex * CONFIG.PAGE_SIZE;
  return {
    events: all.slice(start, start + CONFIG.PAGE_SIZE),
    pageIndex,
    hasNext: start + CONFIG.PAGE_SIZE < all.length,
    hasPrev: pageIndex > 0,
    totalCount: all.length
  };
}

async function getEvent(rowNumber) {
  const values = await getValues_(
    CONFIG.EVENT_SHEET_NAME + '!A' + rowNumber + ':' + EVENT_RANGE_SUFFIX + rowNumber
  );
  return rowToEvent(values[0] || [], rowNumber);
}

async function saveEvent(rowNumber, ev) {
  const row = eventToRow(ev);
  if (rowNumber) {
    await updateRow_(CONFIG.EVENT_SHEET_NAME, rowNumber, row);
    return rowToEvent(row, rowNumber);
  }
  const newRowNumber = await appendRow_(CONFIG.EVENT_SHEET_NAME, row);
  return rowToEvent(row, newRowNumber);
}

async function deleteEvent(rowNumber) {
  await deleteRow_(CONFIG.EVENT_SHEET_NAME, rowNumber);
}

async function duplicateEvent(rowNumber) {
  const ev = await getEvent(rowNumber);
  ev.rowNumber = null;
  return ev;
}

const LOCATION_FIELDS = ['label', 'address', 'mapUrl'];

function rowToLocation(rowValues, rowNumber) {
  const loc = { rowNumber };
  LOCATION_FIELDS.forEach((field, i) => { loc[field] = rowValues[i] || ''; });
  return loc;
}

function locationToRow(loc) {
  return LOCATION_FIELDS.map((f) => loc[f] || '');
}

async function getLocations() {
  const values = await getValues_(CONFIG.LOCATIONS_SHEET_NAME + '!A2:C');
  const locations = [];
  values.forEach((row, i) => {
    if (!row[0]) return;
    locations.push(rowToLocation(row, i + 2));
  });
  return locations;
}

async function getLocation(rowNumber) {
  const values = await getValues_(CONFIG.LOCATIONS_SHEET_NAME + '!A' + rowNumber + ':C' + rowNumber);
  return rowToLocation(values[0] || [], rowNumber);
}

async function saveLocation(rowNumber, loc) {
  const row = locationToRow(loc);
  if (rowNumber) {
    await updateRow_(CONFIG.LOCATIONS_SHEET_NAME, rowNumber, row);
    return rowToLocation(row, rowNumber);
  }
  const newRowNumber = await appendRow_(CONFIG.LOCATIONS_SHEET_NAME, row);
  return rowToLocation(row, newRowNumber);
}

async function deleteLocation(rowNumber) {
  await deleteRow_(CONFIG.LOCATIONS_SHEET_NAME, rowNumber);
}

async function duplicateLocation(rowNumber) {
  const loc = await getLocation(rowNumber);
  loc.rowNumber = null;
  return loc;
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function linkifyAndEscape(text) {
  if (!text) return '';
  // Collapse blank lines so older data saved with blank-line separators (or any
  // stray double line breaks) doesn't render with extra gaps.
  return String(text)
    .replace(/\n\s*\n+/g, '\n')
    .split(/(https?:\/\/[^\s]+)/g)
    .map((part) => {
      if (/^https?:\/\//.test(part)) {
        const safeUrl = escapeHtml(part);
        return '<a href="' + safeUrl + '" target="_blank" rel="noopener">' + safeUrl + '</a>';
      }
      return escapeHtml(part).replace(/\n/g, '<br>');
    })
    .join('');
}

function isRtl(text) {
  return /[֐-ࣿ]/.test(text || '');
}

function findMentionedLocations(text, locations) {
  if (!text) return [];
  return locations.filter((loc) => loc.label && text.indexOf(loc.label) !== -1);
}

async function compileEmail(rowNumber) {
  const event = await getEvent(rowNumber);
  const locations = await getLocations();
  const seen = {};
  const mentionedLocations = [];
  [event.outline, event.notes, event.background].forEach((text) => {
    findMentionedLocations(text, locations).forEach((loc) => {
      if (!seen[loc.label]) { seen[loc.label] = true; mentionedLocations.push(loc); }
    });
  });
  const rtl = isRtl(event.title) || isRtl(event.outline) || isRtl(event.background);
  const html = buildEmailHtml(event, mentionedLocations, rtl);
  return { subject: event.title, to: event.receivers, html };
}

// ---- Gmail draft (raw RFC 2822 MIME message, per Gmail API's `raw` field) ----

function utf8ToBase64_(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function base64ToBase64Url_(b64) {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// RFC 2045 caps base64 body lines at 76 chars.
function wrapBase64_(b64) {
  return b64.replace(/.{76}/g, '$&\r\n');
}

// RFC 2047 encoded-word, needed because Subject may contain non-ASCII (Farsi) text.
function encodeMimeWord_(text) {
  if (!/[^\x00-\x7F]/.test(text)) return text;
  return '=?UTF-8?B?' + utf8ToBase64_(text) + '?=';
}

function buildMimeMessage_(to, subject, htmlBody) {
  const headers = [
    'To: ' + to,
    'Subject: ' + encodeMimeWord_(subject || '(no subject)'),
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64'
  ];
  return headers.join('\r\n') + '\r\n\r\n' + wrapBase64_(utf8ToBase64_(htmlBody));
}

async function createGmailDraft(rowNumber) {
  const compiled = await compileEmail(rowNumber);
  if (!compiled.to) {
    throw new Error('This event has no Receivers set — add at least one email address first.');
  }
  const raw = base64ToBase64Url_(utf8ToBase64_(buildMimeMessage_(compiled.to, compiled.subject, compiled.html)));
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { raw } })
  });
  if (!res.ok) {
    throw new Error('Gmail API error ' + res.status + ': ' + (await res.text()));
  }
}
