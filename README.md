<p align="center">
  <img src="assets/icon_128.png" width="96" alt="Marksheet" />
</p>

<p align="center">
  <img src="assets/title.svg" alt="bookmark to googlesheet" width="520" />
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/marksheet/lalliloaddnobnfelobeaejemgfkcbfd">Chrome Web Store</a> &nbsp;·&nbsp;
  <a href="https://marksheet.echosonusharma.in">Website</a> &nbsp;·&nbsp;
  MIT License
</p>

A Chrome extension that saves the current tab - URL, title, timestamp & notes to a Google Sheet with one click.

## What it does

- **Click toolbar icon** → appends URL, title, and timestamp as a new row in your sheet.
- **Select text → right-click → "Save to Marksheet with note"** → saves the URL with your note. If the URL is already in the sheet, the note is appended to the existing row.
- **Duplicate detection** - local URL cache prevents double rows. Icon flashes blue if already saved.
- **Multiple sheet configs** - separate sheets for work, reading, research. Switch active config from the side panel.
- **Flexible column mapping** - map URL, title, and date to any column. Skip fields you don't need.
- **Status feedback** via icon tint: green (saved), blue (duplicate), red (error).

## Built on

- Manifest V3 - Chrome 114+
- Google Sheets API only - `spreadsheets` scope. No Gmail, no Drive, no profile data.
- No backend. No telemetry. All config stored locally.
