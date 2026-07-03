// Fill in CLIENT_ID after completing GOOGLE_CLOUD_SETUP.md.
// Neither value here is a secret: the OAuth Client ID for a browser app has no
// client secret, and the Spreadsheet ID alone grants no access — every request
// still requires a valid Google OAuth token for an account with access to the sheet.
const CONFIG = {
  CLIENT_ID: '82989159529-cfisq3b2u9hhoghofsiqotoautc1ma0i.apps.googleusercontent.com',
  SPREADSHEET_ID: '171W621OgZ09yBKjIgxOnS7piH9yOMughgYPRfnKEhRE',
  EVENT_SHEET_NAME: 'Event',
  LOCATIONS_SHEET_NAME: 'Locations',
  PAGE_SIZE: 20,
  SCOPES: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/gmail.compose',
  // Used for azan (prayer) time calculation (Tehran method) — University of Waterloo, ON.
  AZAN_LATITUDE: 43.4723,
  AZAN_LONGITUDE: -80.5449,
  AZAN_TIMEZONE: 'America/Toronto'
};
