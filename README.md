<p align="center">
  <img src="assets/icon_128.png" width="96" alt="Marksheet" />
</p>

<p align="center">
  <img src="assets/title.svg" alt="bookmark to googlesheet" width="520" />
</p>

A tiny browser extension that saves the page you're on into a Google Sheet - one click, configurable columns, multiple sheet profiles.

## What it does

- Click toolbar icon → appends the current page's URL, title, and timestamp to a row in your sheet.
- Pick which column each field goes into. Skip any you don't want.
- Keep multiple sheet configurations (e.g. *work*, *reading*, *bookmarks*) and switch active from the side panel.
- Select text on any page → right-click → "Save to Marksheet with note" to append a note alongside the URL. If the URL is already in the sheet, the note is appended to the existing row.
- Detects duplicates against a local cache of the URL column — no double rows.
- Status feedback via icon tint: green (saved), blue (already saved), red (error).

## Built on

- Manifest V3, Chromium-based browsers (Chrome, Brave, Edge, Opera, Vivaldi).
- Google Sheets API only - `auth/spreadsheets` scope.
- OAuth via `chrome.identity.launchWebAuthFlow` (works without Chrome sign-in).
- No backend. No telemetry. All config stored locally in `chrome.storage.local`.
