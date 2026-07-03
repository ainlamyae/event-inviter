# event-inviter
A web application that uses Google Sheets as a lightweight backend to manage community events. Create, edit, duplicate, and organize events, maintain reusable location records, and generate professional HTML email announcements ready to send.

Static site at the repo root, hosted on GitHub Pages, talking directly to the Google Sheets API and
Gmail API from the browser (no server, no Apps Script). See:

- [`template/`](template) — generates the example workbook (Locations + Event tabs) to seed a
  new spreadsheet.
- [`GOOGLE_CLOUD_SETUP.md`](GOOGLE_CLOUD_SETUP.md) — one-time Google Cloud Console setup
  (OAuth Client ID) and enabling GitHub Pages.
