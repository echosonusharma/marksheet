# Marksheet - Privacy Policy

**Marksheet does not collect any data.**

Everything written by the extension lives in **your own Google Sheet**, in **your** Google account. The extension has no backend, no server, no database, no analytics, no telemetry.

## What happens when you click "save"

The extension reads the URL and title of the currently active browser tab, adds a timestamp, and appends one row to the Google Sheet **you** configured. That row is written directly from your browser to the Google Sheets API using **your own** OAuth credentials.

No copy of that data is sent anywhere else. The developer never sees it.

## What is stored locally

The extension keeps the following in your browser's `chrome.storage.local` (never leaves your machine):

- Your sheet configurations (spreadsheet IDs, tab names, column mapping).
- A cached copy of the URL column from the active sheet, used to detect duplicates without re-querying the API every click.
- A short-lived OAuth access token issued to you by Google.

Uninstalling the extension removes all of the above.

## OAuth scope

Marksheet requests a single Google scope:

- `https://www.googleapis.com/auth/spreadsheets`

This allows the extension to read and write the spreadsheets you choose. No Google Drive access. No other Google APIs. No access to your Google account beyond what is strictly needed to write the row.

## Your control

- You can revoke Marksheet's access at any time at <https://myaccount.google.com/permissions>.
- You can delete any row you've saved by editing your sheet directly.
- You can uninstall the extension to wipe its local data.

## Contact

Open an issue on the project repository.
