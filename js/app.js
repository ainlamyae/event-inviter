// App state, screen switching, and wiring the UI to google-api.js.

const state = {
  pageIndex: 0, activeRow: null, locations: [], compiledHtml: '', outlineRows: [], linkRows: [], notesRows: [],
  activeLocationRow: null, filters: { query: '', date: '' },
  locationPageIndex: 0, locationFilters: { query: '' }
};

window.addEventListener('load', async () => {
  document.getElementById('signInBtn').addEventListener('click', handleSignIn);
  window.addEventListener('popstate', () => { applyRoute({ skipPush: true }); });

  try {
    initAuth();
  } catch (err) {
    // GIS script blocked/failed to load (ad-blocker, privacy browser, flaky
    // network) — surface this instead of leaving a dead sign-in button with
    // no explanation. handleSignIn() will retry initAuth() on click.
    showSigninError(describeAuthError_(err));
    return;
  }

  if (tryRestoreSession()) {
    await enterApp();
    return;
  }
  try {
    await trySilentSignIn();
    await enterApp();
  } catch (err) {
    // No active Google session / consent yet (or it timed out) — leave the
    // sign-in gate showing so the user can click through it once.
  }
});

async function enterApp() {
  document.getElementById('signinGate').style.display = 'none';
  document.getElementById('appRoot').style.display = 'block';
  await applyRoute({ skipPush: true });
}

// ---- URL routing: each screen gets its own ?view=... query string, so a
// refresh (or a bookmarked/shared link) restores the same screen instead of
// always falling back to the list. Back/forward navigates between them too.

function setRouteUrl(params) {
  const qs = new URLSearchParams(params).toString();
  history.pushState(null, '', location.pathname + (qs ? '?' + qs : ''));
}

async function applyRoute() {
  const params = new URLSearchParams(location.search);
  const view = params.get('view') || 'list';
  const row = params.get('row') ? parseInt(params.get('row'), 10) : null;
  const pageIndex = params.get('page') ? parseInt(params.get('page'), 10) : 0;

  if (view === 'edit' && row) {
    await editEvent(row, { skipPush: true });
  } else if (view === 'duplicate' && row) {
    await duplicateEventUi(row, { skipPush: true });
  } else if (view === 'new') {
    await showForm({ skipPush: true });
  } else if (view === 'compile' && row) {
    await compileEventUi(row, { skipPush: true });
  } else if (view === 'newLocation') {
    await showLocationForm({ skipPush: true });
  } else if (view === 'editLocation' && row) {
    await editLocation(row, { skipPush: true });
  } else if (view === 'duplicateLocation' && row) {
    await duplicateLocationUi(row, { skipPush: true });
  } else {
    state.pageIndex = pageIndex;
    await showList({ skipPush: true });
  }
}

async function handleSignIn() {
  clearSigninError();
  try {
    if (!tokenClient) initAuth(); // retry in case GIS finished loading after the initial attempt
    await signIn();
    await enterApp();
  } catch (err) {
    console.error(err);
    showSigninError(describeAuthError_(err));
  }
}

function showSigninError(msg) {
  const el = document.getElementById('signinError');
  el.textContent = msg;
  el.style.display = 'block';
}

function clearSigninError() {
  const el = document.getElementById('signinError');
  el.style.display = 'none';
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

async function showList(opts) {
  if (!(opts && opts.skipPush)) setRouteUrl({ view: 'list', page: state.pageIndex });
  showScreen('listScreen');
  await loadPage(state.pageIndex, { skipPush: true });
  await loadLocationsList();
}

// Used by the top nav links — jumps to the list screen, then scrolls to the
// Event List or Location List section within it.
async function goToSection(sectionId) {
  await showList();
  const el = document.getElementById(sectionId);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function onError(err) {
  console.error(err);
  alert('خطا (Error): ' + (err && err.message ? err.message : err));
}

function escapeHtmlClient(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

// ---- List ----

async function loadPage(pageIndex, opts) {
  if (!(opts && opts.skipPush)) setRouteUrl({ view: 'list', page: pageIndex });
  try {
    const data = await getEventsPage(pageIndex, state.filters);
    renderList(data);
  } catch (err) {
    onError(err);
  }
}

// Re-reads the search box / date filter and reloads the list from page 0.
function onFilterChange() {
  state.filters.query = document.getElementById('f_searchQuery').value;
  state.filters.date = document.getElementById('f_searchDate').value;
  loadPage(0);
}

function clearFilters() {
  document.getElementById('f_searchQuery').value = '';
  document.getElementById('f_searchDate').value = '';
  state.filters.query = '';
  state.filters.date = '';
  loadPage(0);
}

function renderList(data) {
  state.pageIndex = data.pageIndex;
  const tbody = document.getElementById('eventsTableBody');
  tbody.innerHTML = '';
  document.getElementById('emptyState').style.display = data.events.length ? 'none' : 'block';
  data.events.forEach((ev) => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + escapeHtmlClient(ev.date) + '</td>' +
      '<td>' + escapeHtmlClient(ev.title) + '</td>' +
      '<td class="actions">' +
        '<button class="btn btn-sm" onclick="editEvent(' + ev.rowNumber + ')">ویرایش (Edit)</button>' +
        '<button class="btn btn-sm" onclick="duplicateEventUi(' + ev.rowNumber + ')">تکثیر (Duplicate)</button>' +
        '<button class="btn btn-sm" onclick="compileEventUi(' + ev.rowNumber + ')">آماده‌سازی (Compile)</button>' +
        '<button class="btn btn-sm btn-danger" onclick="deleteEventUi(' + ev.rowNumber + ')">حذف (Delete)</button>' +
      '</td>';
    tbody.appendChild(tr);
  });
  document.getElementById('pageLabel').textContent =
    'صفحه ' + (data.pageIndex + 1) + ' · ' + data.totalCount + ' رویداد (Page ' + (data.pageIndex + 1) + ' · ' + data.totalCount + ' events)';
  document.getElementById('prevBtn').disabled = !data.hasPrev;
  document.getElementById('nextBtn').disabled = !data.hasNext;
}

function goPrev() { if (state.pageIndex > 0) loadPage(state.pageIndex - 1); }
function goNext() { loadPage(state.pageIndex + 1); }

async function deleteEventUi(rowNumber) {
  if (!confirm('این رویداد حذف شود؟ این کار قابل بازگشت نیست. (Delete this event? This cannot be undone.)')) return;
  try {
    await deleteEvent(rowNumber);
    showToast('حذف شد (Deleted)');
    await loadPage(state.pageIndex);
  } catch (err) {
    onError(err);
  }
}

// ---- Locations list (shown under the events list) ----

async function loadLocationsList(pageIndex) {
  if (typeof pageIndex === 'number') state.locationPageIndex = pageIndex;
  try {
    const data = await getLocationsPage(state.locationPageIndex, state.locationFilters);
    renderLocationsList(data);
  } catch (err) {
    onError(err);
  }
}

function locGoPrev() { if (state.locationPageIndex > 0) loadLocationsList(state.locationPageIndex - 1); }
function locGoNext() { loadLocationsList(state.locationPageIndex + 1); }

function onLocationFilterChange() {
  state.locationFilters.query = document.getElementById('f_locationSearchQuery').value;
  loadLocationsList(0);
}

function clearLocationFilters() {
  document.getElementById('f_locationSearchQuery').value = '';
  state.locationFilters.query = '';
  loadLocationsList(0);
}

function renderLocationsList(data) {
  state.locationPageIndex = data.pageIndex;
  const tbody = document.getElementById('locationsTableBody');
  tbody.innerHTML = '';
  document.getElementById('locationsEmptyState').style.display = data.locations.length ? 'none' : 'block';
  data.locations.forEach((loc) => {
    const tr = document.createElement('tr');
    const mapCell = loc.mapUrl
      ? '<a href="' + escapeHtmlClient(loc.mapUrl) + '" target="_blank" rel="noopener">' + escapeHtmlClient(loc.mapUrl) + '</a>'
      : '';
    tr.innerHTML =
      '<td>' + escapeHtmlClient(loc.label) + '</td>' +
      '<td>' + escapeHtmlClient(loc.address) + '</td>' +
      '<td>' + mapCell + '</td>' +
      '<td class="actions">' +
        '<button class="btn btn-sm" onclick="editLocation(' + loc.rowNumber + ')">ویرایش (Edit)</button>' +
        '<button class="btn btn-sm" onclick="duplicateLocationUi(' + loc.rowNumber + ')">تکثیر (Duplicate)</button>' +
        '<button class="btn btn-sm btn-danger" onclick="deleteLocationUi(' + loc.rowNumber + ')">حذف (Delete)</button>' +
      '</td>';
    tbody.appendChild(tr);
  });
  document.getElementById('locationPageLabel').textContent =
    'صفحه ' + (data.pageIndex + 1) + ' · ' + data.totalCount + ' مکان (Page ' + (data.pageIndex + 1) + ' · ' + data.totalCount + ' locations)';
  document.getElementById('locPrevBtn').disabled = !data.hasPrev;
  document.getElementById('locNextBtn').disabled = !data.hasNext;
}

function invalidateLocationsCache() {
  state.locations = []; // forces ensureLocationsLoaded()/the event form's datalist to refetch
}

function clearLocationForm() {
  ['label', 'address', 'mapUrl'].forEach((f) => {
    document.getElementById('loc_' + f).value = '';
  });
}

function fillLocationForm(loc) {
  document.getElementById('loc_label').value = loc.label || '';
  document.getElementById('loc_address').value = loc.address || '';
  document.getElementById('loc_mapUrl').value = loc.mapUrl || '';
}

async function showLocationForm(opts) {
  if (!(opts && opts.skipPush)) setRouteUrl({ view: 'newLocation' });
  state.activeLocationRow = null;
  document.getElementById('locationFormTitle').textContent = 'مکان جدید (New Location)';
  clearLocationForm();
  showScreen('locationFormScreen');
}

async function editLocation(rowNumber, opts) {
  try {
    if (!(opts && opts.skipPush)) setRouteUrl({ view: 'editLocation', row: rowNumber });
    const loc = await getLocation(rowNumber);
    state.activeLocationRow = loc.rowNumber;
    document.getElementById('locationFormTitle').textContent = 'ویرایش مکان (Edit Location)';
    fillLocationForm(loc);
    showScreen('locationFormScreen');
  } catch (err) {
    onError(err);
  }
}

async function duplicateLocationUi(rowNumber, opts) {
  try {
    if (!(opts && opts.skipPush)) setRouteUrl({ view: 'duplicateLocation', row: rowNumber });
    const loc = await duplicateLocation(rowNumber);
    state.activeLocationRow = null;
    document.getElementById('locationFormTitle').textContent = 'مکان جدید (کپی) (New Location, duplicated)';
    fillLocationForm(loc);
    showScreen('locationFormScreen');
  } catch (err) {
    onError(err);
  }
}

async function deleteLocationUi(rowNumber) {
  if (!confirm('این مکان حذف شود؟ این کار قابل بازگشت نیست. (Delete this location? This cannot be undone.)')) return;
  try {
    await deleteLocation(rowNumber);
    showToast('حذف شد (Deleted)');
    invalidateLocationsCache();
    await loadLocationsList();
  } catch (err) {
    onError(err);
  }
}

async function saveLocationForm() {
  const loc = {
    label: document.getElementById('loc_label').value,
    address: document.getElementById('loc_address').value,
    mapUrl: document.getElementById('loc_mapUrl').value
  };
  try {
    await saveLocation(state.activeLocationRow, loc);
    showToast('ذخیره شد (Saved)');
    invalidateLocationsCache();
    await showList();
  } catch (err) {
    onError(err);
  }
}

// ---- Form (create / edit / duplicate) ----

async function ensureLocationsLoaded() {
  if (state.locations.length) return;
  state.locations = await getLocations();
  const datalist = document.getElementById('locationDatalist');
  datalist.innerHTML = '';
  state.locations.forEach((loc) => {
    const opt = document.createElement('option');
    opt.value = loc.label;
    datalist.appendChild(opt);
  });
}

// ---- Outline: Time / Topic / Location rows, serialized to a single text cell ----
// One line per entry: "{time} - {topic} ({location})". Also accepts older rows saved
// with a leading "📌" and/or blank lines between entries, so nothing is lost when
// editing pre-existing events.

function parseOutline(text) {
  if (!text) return [];
  return text
    .split(/\n+/)
    .map((line) => line.trim().replace(/^📌\s*/, ''))
    .filter(Boolean)
    .map((line) => {
      const m = /^(.*?)\s[-—]\s(.*?)(?:\s\(([^)]+)\))?$/.exec(line);
      if (m) {
        return { time: m[1].trim(), topic: m[2].trim(), location: (m[3] || '').trim() };
      }
      return { time: '', topic: line, location: '' };
    });
}

function serializeOutline(rows) {
  return rows
    .filter((r) => r.time || r.topic || r.location)
    .map((r) => {
      let line = '';
      if (r.time) line += r.time + ' — ';
      line += r.topic || '';
      if (r.location) line += ' (' + r.location + ')';
      return line;
    })
    .join('\n');
}

function renderOutlineRows() {
  const container = document.getElementById('outlineRows');
  container.innerHTML = '';
  state.outlineRows.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td><input type="text" placeholder="مثلاً ۱۹:۴۵ - ۲۰:۳۰" value="' + escapeHtmlClient(row.time) + '" oninput="updateOutlineField(' + i + ',\'time\',this.value)"></td>' +
      '<td><input type="text" value="' + escapeHtmlClient(row.topic) + '" oninput="updateOutlineField(' + i + ',\'topic\',this.value)"></td>' +
      '<td><input type="text" list="locationDatalist" value="' + escapeHtmlClient(row.location) + '" oninput="updateOutlineField(' + i + ',\'location\',this.value)"></td>' +
      '<td class="outline-row-actions">' +
        '<button type="button" class="btn btn-sm" onclick="moveOutlineRow(' + i + ',-1)"' + (i === 0 ? ' disabled' : '') + '>&uarr;</button>' +
        '<button type="button" class="btn btn-sm" onclick="moveOutlineRow(' + i + ',1)"' + (i === state.outlineRows.length - 1 ? ' disabled' : '') + '>&darr;</button>' +
        '<button type="button" class="btn btn-sm btn-danger" onclick="removeOutlineRow(' + i + ')">&times;</button>' +
      '</td>';
    container.appendChild(tr);
  });
}

function updateOutlineField(index, field, value) {
  state.outlineRows[index][field] = value;
}

function addOutlineRow() {
  state.outlineRows.push({ time: '', topic: '', location: '' });
  renderOutlineRows();
}

function moveOutlineRow(index, delta) {
  const newIndex = index + delta;
  if (newIndex < 0 || newIndex >= state.outlineRows.length) return;
  const rows = state.outlineRows;
  [rows[index], rows[newIndex]] = [rows[newIndex], rows[index]];
  renderOutlineRows();
}

function removeOutlineRow(index) {
  state.outlineRows.splice(index, 1);
  renderOutlineRows();
}

// ---- Links: Text / URL rows, serialized to a single text cell ----
// One line per entry: "{text}: {url}" (or just the url/text alone if the other is
// blank). Accepts older free-form lines that just contain a bare URL somewhere.

function parseLinks(text) {
  if (!text) return [];
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = /^(.*?):\s*(https?:\/\/\S+)$/.exec(line);
      if (m) return { text: m[1].trim(), url: m[2].trim() };
      const urlMatch = /(https?:\/\/\S+)/.exec(line);
      if (urlMatch) {
        return { text: line.slice(0, urlMatch.index).replace(/[:\s]+$/, '').trim(), url: urlMatch[1] };
      }
      return { text: line, url: '' };
    });
}

function serializeLinks(rows) {
  return rows
    .filter((r) => r.text || r.url)
    .map((r) => {
      if (r.text && r.url) return r.text + ': ' + r.url;
      return r.url || r.text;
    })
    .join('\n');
}

function renderLinkRows() {
  const container = document.getElementById('linkRows');
  container.innerHTML = '';
  state.linkRows.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td><input type="text" value="' + escapeHtmlClient(row.text) + '" oninput="updateLinkField(' + i + ',\'text\',this.value)"></td>' +
      '<td><input type="url" value="' + escapeHtmlClient(row.url) + '" oninput="updateLinkField(' + i + ',\'url\',this.value)"></td>' +
      '<td class="outline-row-actions">' +
        '<button type="button" class="btn btn-sm" onclick="moveLinkRow(' + i + ',-1)"' + (i === 0 ? ' disabled' : '') + '>&uarr;</button>' +
        '<button type="button" class="btn btn-sm" onclick="moveLinkRow(' + i + ',1)"' + (i === state.linkRows.length - 1 ? ' disabled' : '') + '>&darr;</button>' +
        '<button type="button" class="btn btn-sm btn-danger" onclick="removeLinkRow(' + i + ')">&times;</button>' +
      '</td>';
    container.appendChild(tr);
  });
}

function updateLinkField(index, field, value) {
  state.linkRows[index][field] = value;
}

function addLinkRow() {
  state.linkRows.push({ text: '', url: '' });
  renderLinkRows();
}

function moveLinkRow(index, delta) {
  const newIndex = index + delta;
  if (newIndex < 0 || newIndex >= state.linkRows.length) return;
  const rows = state.linkRows;
  [rows[index], rows[newIndex]] = [rows[newIndex], rows[index]];
  renderLinkRows();
}

function removeLinkRow(index) {
  state.linkRows.splice(index, 1);
  renderLinkRows();
}

// ---- Recommendations: one text item per row, serialized one per line ----
// (rendered with a bullet per line in the compiled email).

function parseRecommendations(text) {
  if (!text) return [];
  return text.split(/\n+/).map((line) => line.trim()).filter(Boolean).map((line) => ({ text: line }));
}

function serializeRecommendations(rows) {
  return rows.map((r) => r.text || '').filter(Boolean).join('\n');
}

function renderNotesRows() {
  const container = document.getElementById('notesRows');
  container.innerHTML = '';
  state.notesRows.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td><input type="text" value="' + escapeHtmlClient(row.text) + '" oninput="updateNotesField(' + i + ',this.value)"></td>' +
      '<td class="outline-row-actions">' +
        '<button type="button" class="btn btn-sm" onclick="moveNotesRow(' + i + ',-1)"' + (i === 0 ? ' disabled' : '') + '>&uarr;</button>' +
        '<button type="button" class="btn btn-sm" onclick="moveNotesRow(' + i + ',1)"' + (i === state.notesRows.length - 1 ? ' disabled' : '') + '>&darr;</button>' +
        '<button type="button" class="btn btn-sm btn-danger" onclick="removeNotesRow(' + i + ')">&times;</button>' +
      '</td>';
    container.appendChild(tr);
  });
}

function updateNotesField(index, value) {
  state.notesRows[index].text = value;
}

function addNotesRow() {
  state.notesRows.push({ text: '' });
  renderNotesRows();
}

function moveNotesRow(index, delta) {
  const newIndex = index + delta;
  if (newIndex < 0 || newIndex >= state.notesRows.length) return;
  const rows = state.notesRows;
  [rows[index], rows[newIndex]] = [rows[newIndex], rows[index]];
  renderNotesRows();
}

function removeNotesRow(index) {
  state.notesRows.splice(index, 1);
  renderNotesRows();
}

// Only Fajr/Dhuhr/Maghrib get their own azan — Shia practice combines Asr into
// the Dhuhr azan and Isha into the Maghrib azan.
const AZAN_FIELDS = ['fajrTime', 'dhuhrTime', 'maghribTime'];
const AZAN_CHECKBOX_IDS = ['f_showFajr', 'f_showDhuhr', 'f_showMaghrib'];

// The Gregorian date is entered as separate Day / Month (word) / Year fields
// (fewer transposition mistakes than a single numeric date field) and
// combined into a 'YYYY-MM-DD' string only when read or saved.
// f_dateRaw (hidden) is the source of truth ('YYYY-MM-DD'); f_dateDisplay and
// f_datePicker are just views of it, kept in sync here.
function getFormDateValue() {
  return document.getElementById('f_dateRaw').value;
}

function setFormDateValue(dateStr) {
  document.getElementById('f_dateRaw').value = dateStr || '';
  document.getElementById('f_dateDisplay').value = formatGregorianDisplay(dateStr);
  document.getElementById('f_datePicker').value = dateStr || '';
}

// The calendar-grid picker is the only way to set the Gregorian date, so it
// can't be typed in an inconsistent format.
function applyDatePicker() {
  setFormDateValue(document.getElementById('f_datePicker').value);
}

function clearForm() {
  ['title', 'senderName', 'background', 'closing', 'receivers', 'hijriDate', 'shamsiDate', 'dayOfWeek']
    .concat(AZAN_FIELDS)
    .forEach((f) => { document.getElementById('f_' + f).value = ''; });
  setFormDateValue('');
  document.getElementById('f_showGregorian').checked = true;
  document.getElementById('f_showHijri').checked = false;
  document.getElementById('f_showShamsi').checked = false;
  document.getElementById('f_showDayOfWeek').checked = false;
  AZAN_CHECKBOX_IDS.forEach((id) => { document.getElementById(id).checked = false; });
  state.outlineRows = [{ time: '', topic: '', location: '' }];
  state.linkRows = [{ text: '', url: '' }];
  state.notesRows = [{ text: '' }];
  renderLinkRows();
  renderOutlineRows();
  renderNotesRows();
}

function fillForm(ev) {
  setFormDateValue(ev.date || '');
  document.getElementById('f_title').value = ev.title || '';
  document.getElementById('f_senderName').value = ev.senderName || '';
  document.getElementById('f_background').value = ev.background || '';
  document.getElementById('f_closing').value = ev.closing || '';
  document.getElementById('f_receivers').value = ev.receivers || '';
  document.getElementById('f_hijriDate').value = ev.hijriDate || '';
  document.getElementById('f_shamsiDate').value = ev.shamsiDate || '';
  document.getElementById('f_dayOfWeek').value = ev.dayOfWeek || '';
  document.getElementById('f_showGregorian').checked = ev.showGregorianInEmail !== false;
  document.getElementById('f_showHijri').checked = !!ev.showHijriInEmail;
  document.getElementById('f_showShamsi').checked = !!ev.showShamsiInEmail;
  document.getElementById('f_showDayOfWeek').checked = !!ev.showDayOfWeekInEmail;
  AZAN_FIELDS.forEach((f) => { document.getElementById('f_' + f).value = ev[f] || ''; });
  document.getElementById('f_showFajr').checked = !!ev.showFajrInEmail;
  document.getElementById('f_showDhuhr').checked = !!ev.showDhuhrInEmail;
  document.getElementById('f_showMaghrib').checked = !!ev.showMaghribInEmail;
  state.outlineRows = parseOutline(ev.outline || '');
  if (!state.outlineRows.length) state.outlineRows = [{ time: '', topic: '', location: '' }];
  renderOutlineRows();
  state.linkRows = parseLinks(ev.links || '');
  if (!state.linkRows.length) state.linkRows = [{ text: '', url: '' }];
  renderLinkRows();
  state.notesRows = parseRecommendations(ev.notes || '');
  if (!state.notesRows.length) state.notesRows = [{ text: '' }];
  renderNotesRows();
}

// Uses the Tehran-method calculation in prayer-times.js for the configured location.
function calculateAzanTimesUi() {
  const dateStr = getFormDateValue();
  if (!dateStr) {
    alert('لطفاً ابتدا تاریخ میلادی را وارد کنید. (Please enter the Gregorian date first.)');
    return;
  }
  const times = calculateAzanTimes(dateStr, CONFIG.AZAN_LATITUDE, CONFIG.AZAN_LONGITUDE, CONFIG.AZAN_TIMEZONE);
  document.getElementById('f_fajrTime').value = times.fajr;
  document.getElementById('f_dhuhrTime').value = times.dhuhr;
  document.getElementById('f_maghribTime').value = times.maghrib;
}

// Uses the browser's built-in ICU calendars (no external library needed).
function calculateAltDates() {
  const dateStr = getFormDateValue();
  if (!dateStr) {
    alert('لطفاً ابتدا تاریخ میلادی را وارد کنید. (Please enter the Gregorian date first.)');
    return;
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12)); // noon UTC avoids timezone date-shift

  // Month spelled out as a word (e.g. "۱۲ تیر ۱۴۰۵") rather than numeric, so it
  // can't be mistaken for a different field the way a plain number could.
  const formatCalendar = (calendar) => {
    const parts = new Intl.DateTimeFormat('fa-IR-u-ca-' + calendar, {
      year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'
    }).formatToParts(date);
    const withoutEra = parts.filter((p) => p.type !== 'era');
    while (withoutEra.length && withoutEra[withoutEra.length - 1].type === 'literal') withoutEra.pop();
    return withoutEra.map((p) => p.value).join('');
  };

  document.getElementById('f_shamsiDate').value = formatCalendar('persian');
  document.getElementById('f_hijriDate').value = formatCalendar('islamic-umalqura');
  const dayFa = new Intl.DateTimeFormat('fa-IR', { weekday: 'long', timeZone: 'UTC' }).format(date);
  const dayEn = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(date);
  document.getElementById('f_dayOfWeek').value = dayFa + ' (' + dayEn + ')';
}

async function showForm(opts) {
  try {
    if (!(opts && opts.skipPush)) setRouteUrl({ view: 'new' });
    await ensureLocationsLoaded();
    state.activeRow = null;
    document.getElementById('formTitle').textContent = 'رویداد جدید (New Event)';
    clearForm();
    showScreen('formScreen');
  } catch (err) {
    onError(err);
  }
}

async function editEvent(rowNumber, opts) {
  try {
    if (!(opts && opts.skipPush)) setRouteUrl({ view: 'edit', row: rowNumber });
    await ensureLocationsLoaded();
    const ev = await getEvent(rowNumber);
    state.activeRow = ev.rowNumber;
    document.getElementById('formTitle').textContent = 'ویرایش رویداد (Edit Event)';
    fillForm(ev);
    showScreen('formScreen');
  } catch (err) {
    onError(err);
  }
}

async function duplicateEventUi(rowNumber, opts) {
  try {
    if (!(opts && opts.skipPush)) setRouteUrl({ view: 'duplicate', row: rowNumber });
    await ensureLocationsLoaded();
    const ev = await duplicateEvent(rowNumber);
    state.activeRow = null;
    document.getElementById('formTitle').textContent = 'رویداد جدید (کپی) (New Event, duplicated)';
    fillForm(ev);
    showScreen('formScreen');
  } catch (err) {
    onError(err);
  }
}

function buildEventFromForm() {
  return {
    date: getFormDateValue(),
    title: document.getElementById('f_title').value,
    senderName: document.getElementById('f_senderName').value,
    outline: serializeOutline(state.outlineRows),
    notes: serializeRecommendations(state.notesRows),
    background: document.getElementById('f_background').value,
    closing: document.getElementById('f_closing').value,
    links: serializeLinks(state.linkRows),
    receivers: document.getElementById('f_receivers').value,
    hijriDate: document.getElementById('f_hijriDate').value,
    shamsiDate: document.getElementById('f_shamsiDate').value,
    dayOfWeek: document.getElementById('f_dayOfWeek').value,
    fajrTime: document.getElementById('f_fajrTime').value,
    dhuhrTime: document.getElementById('f_dhuhrTime').value,
    maghribTime: document.getElementById('f_maghribTime').value,
    showGregorianInEmail: document.getElementById('f_showGregorian').checked,
    showHijriInEmail: document.getElementById('f_showHijri').checked,
    showShamsiInEmail: document.getElementById('f_showShamsi').checked,
    showDayOfWeekInEmail: document.getElementById('f_showDayOfWeek').checked,
    showFajrInEmail: document.getElementById('f_showFajr').checked,
    showDhuhrInEmail: document.getElementById('f_showDhuhr').checked,
    showMaghribInEmail: document.getElementById('f_showMaghrib').checked
  };
}

async function saveForm() {
  try {
    await saveEvent(state.activeRow, buildEventFromForm());
    showToast('ذخیره شد (Saved)');
    await showList();
  } catch (err) {
    onError(err);
  }
}

// Saves the form first (so Compile always reflects the latest edits, and a
// brand-new event gets a row to compile against) then jumps to Compile.
async function saveAndCompile() {
  try {
    const saved = await saveEvent(state.activeRow, buildEventFromForm());
    state.activeRow = saved.rowNumber;
    showToast('ذخیره شد (Saved)');
    await compileEventUi(saved.rowNumber);
  } catch (err) {
    onError(err);
  }
}

// ---- Compile ----

async function compileEventUi(rowNumber, opts) {
  try {
    if (!(opts && opts.skipPush)) setRouteUrl({ view: 'compile', row: rowNumber });
    const compiled = await compileEmail(rowNumber);
    state.activeRow = rowNumber;
    state.compiledHtml = compiled.html;
    document.getElementById('c_to').textContent = compiled.to || '(تنظیم نشده / none set)';
    document.getElementById('c_subject').textContent = compiled.subject || '(بدون عنوان / untitled)';
    document.getElementById('previewFrame').srcdoc = compiled.html;
    showScreen('compileScreen');
  } catch (err) {
    onError(err);
  }
}

async function createDraft() {
  try {
    await createGmailDraft(state.activeRow);
    showToast('پیش‌نویس ساخته شد — پوشه پیش‌نویس‌های جیمیل را بررسی کنید (Draft created — check Gmail Drafts)');
  } catch (err) {
    onError(err);
  }
}

// Bypasses Gmail's compose UI (which doesn't reliably preserve the calendar
// invite part when a draft is later edited/sent by hand), so use this if
// "Add to calendar" isn't showing up after sending a draft normally.
async function sendDirectly() {
  if (!confirm('این ایمیل مستقیماً برای گیرندگان ارسال می‌شود. این کار قابل بازگشت نیست. مطمئن هستید؟ (This will send the email directly to recipients right now. This cannot be undone. Are you sure?)')) return;
  try {
    await sendGmailMessage(state.activeRow);
    showToast('ایمیل ارسال شد (Email sent)');
  } catch (err) {
    onError(err);
  }
}

function copyHtml() {
  navigator.clipboard.writeText(state.compiledHtml).then(() => showToast('HTML در کلیپ‌بورد کپی شد (HTML copied to clipboard)'));
}
