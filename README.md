# event-inviter

A bilingual (Persian/English, RTL) web app that uses a Google Sheet as its backend to manage
community events: create, edit, duplicate, and organize events, maintain reusable location
records, and compile a ready-to-send HTML email invite (with a calendar-invite attachment) for
each one.

It's a static site (no server, no Apps Script) hosted on GitHub Pages, talking directly to the
Google Sheets API and Gmail API from the browser via OAuth — so every future change is just a
`git push`.

## Features

- **Events**: paginated list, create/edit/duplicate/delete, all with refresh- and bookmark-safe
  URLs (`?view=edit&row=…`, etc.).
- **Locations**: a second CRUD list (Label/Address/Google Map URL) shown under the events list,
  used to auto-detect and link locations mentioned in an event's Agenda.
- **Compile**: renders a styled HTML email preview, lets you jump back to editing without losing
  your place, and can drop a ready-to-send draft straight into Gmail — subject line
  auto-includes the earliest Agenda time and the most-mentioned location; an attached `.ics`
  calendar invite (`METHOD:REQUEST` with an `ORGANIZER`/`ATTENDEE`s) lets Gmail/Apple
  Mail/Outlook recognize it as an event and offer "Add to calendar".
- **Dates**: Gregorian (picked from a calendar widget), Hijri, and Shamsi (Jalali) dates plus
  day-of-week, each independently toggleable for inclusion in the compiled email, combined into
  one natural-language sentence.
- **Azan times**: Fajr/Dhuhr/Maghrib calculated for a given date using the Tehran method (Shia
  practice — Asr/Isha follow the Dhuhr/Maghrib azan rather than getting their own), for a
  configurable location (`js/config.js`).
- Structured Agenda (Time/Topic/Location rows) and Links (Text/URL rows) tables, each rendering
  as bulleted, properly linked content in the compiled email.

## Architecture

High-level: a static site with no backend of its own, talking directly to two Google APIs.

```
User
  │  HTTPS
  ▼
GitHub Pages  (index.html + css/js)
  │
  ├──▶ Google Identity Services   (OAuth token exchange)
  ├──▶ Google Sheets API          (read/write Locations + Event rows)
  └──▶ Gmail API                 (create draft / send message)
                                        │
                                        ▼
                                  Recipients  (HTML email + .ics invite)
```

Detailed module/function view — what calls what, and which Google API each call hits:

```
Browser (static site, no server)
│
├─ index.html — List / Form / Compile / Location screens
│
├─ js/app.js
│   ├─ applyRoute() / setRouteUrl()        URL routing (?view=list|edit|compile...&row=)
│   ├─ loadPage() / renderList()           list + pagination + search filter
│   │  goPrev() / goNext() / onFilterChange()
│   ├─ loadLocationsList() / renderLocationsList()   same, for the Location list
│   ├─ buildEventFromForm() / saveForm()    create/edit event
│   ├─ editEvent() / duplicateEventUi()
│   └─ compileEventUi() / createDraft() / sendDirectly()
│         │
│         ▼
├─ js/google-api.js
│   ├─ initAuth() / signIn() / tryRestoreSession() ──▶ Google Identity Services (OAuth token)
│   ├─ getEventsPage() / saveEvent() / deleteEvent()
│   │  getLocationsPage() / saveLocation()          ──▶ Google Sheets API
│   │                                                   (values.get/update/append, batchUpdate)
│   ├─ compileEmail() → findMainLocation_() / buildSubject_()
│   │       │
│   │       ▼
│   │   js/email-template.js
│   │     ├─ buildEmailHtml()   → buildLinksHtml_() / buildBulletListHtml_()
│   │     └─ buildIcsContent()  → METHOD:REQUEST + ORGANIZER/ATTENDEE
│   │       │
│   │       ▼
│   │   js/prayer-times.js
│   │     ├─ calculateAzanTimes()             (Tehran method: Fajr/Dhuhr/Maghrib)
│   │     └─ toPersianDigits_() / fromPersianDigits_() / formatGregorianDisplay()
│   │
│   └─ createGmailDraft() / sendGmailMessage()
│       getUserEmail_() / buildRawMessage_()  ──▶ Gmail API
│                                                 (drafts.create, messages.send, users.getProfile)
│
└─ js/config.js — CLIENT_ID, SPREADSHEET_ID, azan location
    (read by js/google-api.js and js/prayer-times.js)
```

## Repo layout

```
index.html              app shell (sign-in gate + List / Form / Compile screens)
css/style.css           styles
js/config.js            CLIENT_ID, Spreadsheet ID, azan location — fill in per GOOGLE_CLOUD_SETUP.md
js/google-api.js        auth + Sheets API / Gmail API calls, event/location CRUD, email compile logic
js/prayer-times.js      azan time calculation, Persian-digit/date-formatting helpers
js/email-template.js    compiled HTML email + .ics calendar invite generation
js/app.js               UI state, screen routing, form wiring
template/               generates the example workbook used to seed a new Sheet
assets/                 favicon, apple-touch-icon, social preview image (+ the script that made them)
```

## Setup

1. Run `template/generate_template.py` (or use the already-generated
   `template/event-inviter-template.xlsx`) to seed a new Google Sheet with `Locations` and
   `Event` tabs.
2. Follow [`GOOGLE_CLOUD_SETUP.md`](GOOGLE_CLOUD_SETUP.md) for the one-time Google Cloud Console
   setup (OAuth Client ID) and enabling GitHub Pages.
3. Fill in `js/config.js` with your Client ID, Spreadsheet ID, and azan calculation location.

The `Event` tab needs 22 columns (A–V) — see `EVENT_FIELDS` in `js/google-api.js` for the exact
list/order if you're setting up the sheet by hand.
