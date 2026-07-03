// Renders the same table-based, inline-styled HTML email that the old
// Apps Script EmailTemplate.html produced, as a plain JS template function.

// Parses "{text}: {url}" lines (same format app.js's Links table serializes)
// so each entry can render as "<a href=url>text</a>" instead of showing the
// raw URL next to its label.
function parseLinksForEmail_(text) {
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

function buildLinksHtml_(linksText) {
  const rows = parseLinksForEmail_(linksText);
  if (!rows.length) return '';
  return rows
    .map((r) => {
      if (!r.url) return '&bull; ' + escapeHtml(r.text);
      const label = escapeHtml(r.text || r.url);
      return '&bull; <a href="' + escapeHtml(r.url) + '" target="_blank" rel="noopener" style="color:#1f4e78;">' + label + '</a>';
    })
    .join('<br>');
}

// One bullet per line, e.g. for Recommendations (one item per row in the form).
function buildBulletListHtml_(text) {
  if (!text) return '';
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => '&bull; ' + linkifyAndEscape(line))
    .join('<br>');
}

// e.g. "۳ جولای ۲۰۲۶ (July 3, 2026)" — for the date sentence specifically
// (the form's read-only display field uses the shorter formatGregorianDisplay).
function formatGregorianSentence_(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const fa = toPersianDigits_(String(d)) + ' ' + GREGORIAN_MONTHS_FA[m - 1] + ' ' + toPersianDigits_(String(y));
  const en = GREGORIAN_MONTHS_EN[m - 1] + ' ' + d + ', ' + y;
  return fa + ' (' + en + ')';
}

// Combines whichever of Day-of-week / Gregorian / Hijri / Shamsi are enabled
// into one flowing sentence, e.g. "جمعه (Friday)، ۳ جولای ۲۰۲۶ (July 3, 2026)،
// مصادف با ۱۸ محرم ۱۴۴۸ و معادل با ۱۲ تیر ۱۴۰۵" — gracefully drops whichever
// pieces are turned off (and re-labels "مصادف با"/"و معادل با" accordingly).
function buildDateSentence_(event) {
  const dayPart = event.showDayOfWeekInEmail && event.dayOfWeek ? escapeHtml(event.dayOfWeek) : '';
  const gregorianPart = event.showGregorianInEmail && event.date ? formatGregorianSentence_(event.date) : '';
  const hijriPart = event.showHijriInEmail && event.hijriDate ? escapeHtml(event.hijriDate) : '';
  const shamsiPart = event.showShamsiInEmail && event.shamsiDate ? escapeHtml(event.shamsiDate) : '';

  const mainParts = [dayPart, gregorianPart].filter(Boolean);
  const extra = [];
  if (hijriPart) extra.push('مصادف با ' + hijriPart);
  if (shamsiPart) extra.push((extra.length ? 'و معادل با ' : 'مصادف با ') + shamsiPart);

  return mainParts.concat(extra.length ? [extra.join(' ')] : []).join('، ');
}

function buildEmailHtml(event, mentionedLocations, rtl) {
  const dateLines = buildDateSentence_(event);

  const azanHtml = [
    event.showFajrInEmail && event.fajrTime ? '&bull; اذان صبح (Fajr): ' + escapeHtml(event.fajrTime) : '',
    event.showDhuhrInEmail && event.dhuhrTime ? '&bull; اذان ظهر (Dhuhr): ' + escapeHtml(event.dhuhrTime) : '',
    event.showMaghribInEmail && event.maghribTime ? '&bull; اذان مغرب (Maghrib): ' + escapeHtml(event.maghribTime) : ''
  ].filter(Boolean).join('<br>');

  const section = (label, contentHtml) => contentHtml ? `
          <tr>
            <td style="padding:16px 24px 4px;">
              <div style="font-size:13px; font-weight:bold; color:#1f4e78; text-transform:uppercase; letter-spacing:0.04em;"><br>${label}</div>
              <div style="font-size:14px; line-height:1.7; margin-top:8px;">${contentHtml}</div>
            </td>
          </tr>` : '';

  const locationsHtml = mentionedLocations && mentionedLocations.length ? `
          <tr>
            <td style="padding:16px 24px 4px;">
              <div style="font-size:13px; font-weight:bold; color:#1f4e78; text-transform:uppercase; letter-spacing:0.04em;"><br>${mentionedLocations.length > 1 ? 'مکان‌ها (Locations)' : 'مکان (Location)'}</div>
              ${mentionedLocations.map((loc) => `
              <div style="font-size:14px; line-height:1.6; margin-top:8px;">
                &bull; <strong>${escapeHtml(loc.label)}</strong> &ndash;
                ${loc.mapUrl
                  ? `<a href="${escapeHtml(loc.mapUrl)}" target="_blank" rel="noopener" style="color:#1f4e78;">${escapeHtml(loc.address)}</a>`
                  : escapeHtml(loc.address)}
              </div>`).join('')}
            </td>
          </tr>` : '';

  const dirAttr = rtl ? 'rtl' : 'ltr';
  const dirStyle = 'direction:' + dirAttr + '; text-align:' + (rtl ? 'right' : 'left') + ';';

  return `<!DOCTYPE html>
<html dir="${dirAttr}">
<head><meta charset="utf-8"></head>
<body dir="${dirAttr}" style="margin:0; padding:0; background:#f2f4f6; font-family: Tahoma, 'Segoe UI', Arial, sans-serif; ${dirStyle}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${dirAttr}" style="background:#f2f4f6; padding: 24px 0; ${dirStyle}">
    <tr>
      <td align="center">
        <table role="presentation" width="660" cellpadding="0" cellspacing="0" dir="${dirAttr}"
               style="background:#ffffff; border-radius:8px; overflow:hidden; max-width:660px; width:100%; ${dirStyle}">
          ${event.senderName ? `
          <tr>
            <td style="padding:14px 24px 20px; text-align:center; font-size:13px; font-weight:600; color:#1f4e78;">
              ${escapeHtml(event.senderName)}
            </td>
          </tr>` : ''}
          <tr>
            <td style="background:#1f4e78; color:#ffffff; padding:20px 24px;">
              <div style="font-size:20px; font-weight:bold;">${escapeHtml(event.title)}</div>
              ${dateLines ? `<div style="font-size:12px; line-height:1.6; opacity:0.85; margin-top:4px;"><br>${dateLines}</div>` : ''}
            </td>
          </tr>
          ${event.background ? `
          <tr>
            <td style="padding:16px 24px 4px;">
              <div style="font-size:14px; line-height:1.7; color:#000;">${linkifyAndEscape(event.background)}</div>
            </td>
          </tr>` : ''}
          ${section('دستور کار (Agenda)', linkifyAndEscape(event.outline))}
          ${section('اوقات اذان (Azan Times)', azanHtml)}
          ${event.closing ? `
          <tr>
            <td style="padding:16px 24px 4px;">
              <div style="font-size:14px; line-height:1.7; color:#000;"><br>${linkifyAndEscape(event.closing)}</div>
            </td>
          </tr>` : ''}
          ${section('توصیه‌ها (Recommendations)', buildBulletListHtml_(event.notes))}
          ${section('پیوندها (Links)', buildLinksHtml_(event.links))}
          ${locationsHtml}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ---- iCalendar (.ics) generation, so Gmail/Apple Mail/Outlook offer an
// "Add to calendar" action on the email instead of it being plain HTML. ----

function icsEscape_(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function formatIcsUtcStamp_(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return date.getUTCFullYear() + pad(date.getUTCMonth() + 1) + pad(date.getUTCDate()) + 'T' +
    pad(date.getUTCHours()) + pad(date.getUTCMinutes()) + pad(date.getUTCSeconds()) + 'Z';
}

// Converts a local wall-clock time on `dateStr` (in `timeZone`) to an ICS UTC stamp.
function toIcsUtc_(dateStr, hour, minute, timeZone) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const localNoonUtc = new Date(Date.UTC(y, mo - 1, d, 12));
  const tzOffset = getTimezoneOffsetHours_(localNoonUtc, timeZone); // e.g. -4 for EDT
  const utcDate = new Date(Date.UTC(y, mo - 1, d, hour - tzOffset, minute));
  return formatIcsUtcStamp_(utcDate);
}

// Pulls "HH:MM - HH:MM" off the first Agenda line, if present, so the
// calendar entry gets a real start/end time instead of being all-day.
function extractFirstTimeRange_(outline) {
  if (!outline) return null;
  const firstLine = outline.split('\n')[0] || '';
  // Agenda times may be typed in Persian numerals — normalize before matching.
  const m = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/.exec(fromPersianDigits_(firstLine));
  if (!m) return null;
  return { startH: +m[1], startM: +m[2], endH: +m[3], endM: +m[4] };
}

function buildIcsContent(event, mentionedLocations, organizerEmail) {
  if (!event.date) return null;

  const timeRange = extractFirstTimeRange_(event.outline);
  let dtStartLine, dtEndLine;
  if (timeRange) {
    dtStartLine = 'DTSTART:' + toIcsUtc_(event.date, timeRange.startH, timeRange.startM, CONFIG.AZAN_TIMEZONE);
    dtEndLine = 'DTEND:' + toIcsUtc_(event.date, timeRange.endH, timeRange.endM, CONFIG.AZAN_TIMEZONE);
  } else {
    const [y, mo, d] = event.date.split('-').map(Number);
    const next = new Date(Date.UTC(y, mo - 1, d + 1));
    const pad = (n) => String(n).padStart(2, '0');
    dtStartLine = 'DTSTART;VALUE=DATE:' + y + pad(mo) + pad(d);
    dtEndLine = 'DTEND;VALUE=DATE:' + next.getUTCFullYear() + pad(next.getUTCMonth() + 1) + pad(next.getUTCDate());
  }

  const location = mentionedLocations && mentionedLocations.length
    ? mentionedLocations.map((loc) => loc.address).filter(Boolean).join('; ')
    : '';

  // METHOD:REQUEST + ORGANIZER + ATTENDEE is what makes Gmail/Apple Mail/Outlook
  // recognize this as an actual invitation (with an "Add to calendar" / RSVP
  // banner) rather than just a downloadable file — METHOD:PUBLISH alone
  // (a plain calendar file, no organizer/attendees) doesn't get that treatment.
  const attendees = (event.receivers || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
    .map((email) => 'ATTENDEE;RSVP=TRUE;PARTSTAT=NEEDS-ACTION;CN=' + icsEscape_(email) + ':mailto:' + email);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Event Inviter//EN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    'UID:' + Date.now() + '-' + Math.random().toString(36).slice(2) + '@event-inviter',
    'DTSTAMP:' + formatIcsUtcStamp_(new Date()),
    dtStartLine,
    dtEndLine,
    'SUMMARY:' + icsEscape_(event.title),
    location ? 'LOCATION:' + icsEscape_(location) : '',
    'DESCRIPTION:' + icsEscape_(event.outline),
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    organizerEmail ? 'ORGANIZER;CN=' + icsEscape_(organizerEmail) + ':mailto:' + organizerEmail : ''
  ].concat(attendees).concat([
    'END:VEVENT',
    'END:VCALENDAR'
  ]).filter(Boolean);

  return lines.join('\r\n');
}
