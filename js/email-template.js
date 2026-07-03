// Renders the same table-based, inline-styled HTML email that the old
// Apps Script EmailTemplate.html produced, as a plain JS template function.

function buildEmailHtml(event, mentionedLocations, rtl) {
  const dateLines = [
    event.showGregorianInEmail && event.date ? escapeHtml(event.date) + ' (میلادی)' : '',
    event.showHijriInEmail && event.hijriDate ? escapeHtml(event.hijriDate) + ' (قمری)' : '',
    event.showShamsiInEmail && event.shamsiDate ? escapeHtml(event.shamsiDate) + ' (شمسی)' : '',
    event.showDayOfWeekInEmail && event.dayOfWeek ? escapeHtml(event.dayOfWeek) : ''
  ].filter(Boolean).join(' &middot; ');

  const azanHtml = [
    event.showFajrInEmail && event.fajrTime ? 'اذان صبح (Fajr): ' + escapeHtml(event.fajrTime) : '',
    event.showDhuhrInEmail && event.dhuhrTime ? 'اذان ظهر (Dhuhr): ' + escapeHtml(event.dhuhrTime) : '',
    event.showMaghribInEmail && event.maghribTime ? 'اذان مغرب (Maghrib): ' + escapeHtml(event.maghribTime) : ''
  ].filter(Boolean).join('<br>');

  const section = (label, contentHtml) => contentHtml ? `
          <tr>
            <td style="padding:16px 24px 4px;">
              <div style="font-size:13px; font-weight:bold; color:#1f4e78; text-transform:uppercase; letter-spacing:0.04em;">${label}</div>
              <div style="font-size:14px; line-height:1.7; margin-top:8px;">${contentHtml}</div>
            </td>
          </tr>` : '';

  const locationsHtml = mentionedLocations && mentionedLocations.length ? `
          <tr>
            <td style="padding:16px 24px 4px;">
              <div style="font-size:13px; font-weight:bold; color:#1f4e78; text-transform:uppercase; letter-spacing:0.04em;">مکان (Location)</div>
              ${mentionedLocations.map((loc) => `
              <div style="font-size:14px; line-height:1.6; margin-top:8px;">
                📍 <strong>${escapeHtml(loc.label)}</strong><br>
                ${escapeHtml(loc.address)}
                ${loc.mapUrl ? `&nbsp;&middot;&nbsp;<a href="${escapeHtml(loc.mapUrl)}" target="_blank" style="color:#1f4e78;">مشاهده روی نقشه (View on map)</a>` : ''}
              </div>`).join('')}
            </td>
          </tr>` : '';

  return `<!DOCTYPE html>
<html ${rtl ? 'dir="rtl"' : ''}>
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:0; background:#f2f4f6; font-family: Tahoma, Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f6; padding: 24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0"
               style="background:#ffffff; border-radius:8px; overflow:hidden; max-width:600px; width:100%;">
          <tr>
            <td style="background:#1f4e78; color:#ffffff; padding:20px 24px;">
              ${dateLines ? `<div style="font-size:12px; opacity:0.85;">${dateLines}</div>` : ''}
              <div style="font-size:20px; font-weight:bold; margin-top:4px;">${escapeHtml(event.title)}</div>
            </td>
          </tr>
          ${event.background ? `
          <tr>
            <td style="padding:16px 24px 4px;">
              <div style="font-size:14px; line-height:1.7; font-style:italic; color:#444;">${linkifyAndEscape(event.background)}</div>
            </td>
          </tr>` : ''}
          ${section('دستور کار (Agenda)', linkifyAndEscape(event.outline))}
          ${section('اوقات اذان (Azan Times)', azanHtml)}
          ${section('یادداشت‌ها (Notes)', linkifyAndEscape(event.notes))}
          ${section('لینک‌ها (Links)', linkifyAndEscape(event.links))}
          ${locationsHtml}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
