import { apiFetch } from "./auth.js";

// ---- Storage keys ----
const CONFIGS_KEY = "configs";
const ACTIVE_KEY = "activeId";
const URL_CACHE_KEY = "urlCache";
const LEGACY_SETTINGS_KEY = "settings";
const REFRESH_ALARM = "urlCacheRefresh";
const REFRESH_MINUTES = 60;
const ICON_FLASH_MS = 4000;

// ---- Field producers ----
const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "medium",
  hour12: true,
});

const FIELDS = {
  url: (t) => t.url || "",
  title: (t) => t.title || "",
  date: () => DATE_FMT.format(new Date()),
};

// ---- Helpers ----
function colNumToLetter(n) {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function cacheKey(sheetId, tabName, colNum) {
  return `${sheetId}::${tabName}::${colNum}`;
}

// ---- Config storage ----
let legacyMigrated = false;
async function migrateLegacy() {
  if (legacyMigrated) return;
  const o = await chrome.storage.local.get([CONFIGS_KEY, LEGACY_SETTINGS_KEY]);
  if (!o[CONFIGS_KEY] && o[LEGACY_SETTINGS_KEY]) {
    const id = "cfg_" + Date.now().toString(36);
    const cfg = { ...o[LEGACY_SETTINGS_KEY], name: o[LEGACY_SETTINGS_KEY].sheetName || "default" };
    await chrome.storage.local.set({ [CONFIGS_KEY]: { [id]: cfg }, [ACTIVE_KEY]: id });
    await chrome.storage.local.remove(LEGACY_SETTINGS_KEY);
  }
  legacyMigrated = true;
}

async function getActiveConfig() {
  await migrateLegacy();
  const o = await chrome.storage.local.get([CONFIGS_KEY, ACTIVE_KEY]);
  const configs = o[CONFIGS_KEY] || {};
  const id = o[ACTIVE_KEY];
  if (!id || !configs[id]) return null;
  return { id, ...configs[id] };
}

// ---- Sheets API ----
async function readColumn(sheetId, tabName, colNum) {
  const range = encodeURIComponent(`${tabName}!${colNumToLetter(colNum)}:${colNumToLetter(colNum)}`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`;
  const data = await apiFetch(url);
  return (data.values || []).map((r) => r[0] || "");
}

async function appendRow(sheetId, tabName, row) {
  const range = encodeURIComponent(`${tabName}!A1`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:append?valueInputOption=USER_ENTERED`;
  return apiFetch(url, { method: "POST", body: JSON.stringify({ values: [row] }) });
}

// ---- URL cache ----
async function loadUrlCache() {
  const o = await chrome.storage.local.get(URL_CACHE_KEY);
  return o[URL_CACHE_KEY] || null;
}

async function saveUrlCache(cache) {
  await chrome.storage.local.set({ [URL_CACHE_KEY]: cache });
}

async function refreshUrlCache() {
  const cfg = await getActiveConfig();
  if (!cfg?.sheetId || !cfg?.tabName || !cfg?.mapping?.url) return null;
  try {
    const urls = await readColumn(cfg.sheetId, cfg.tabName, cfg.mapping.url);
    const cache = {
      key: cacheKey(cfg.sheetId, cfg.tabName, cfg.mapping.url),
      urls,
      fetchedAt: Date.now(),
    };
    await saveUrlCache(cache);
    return cache;
  } catch (e) {
    console.error("Marksheet refresh:", e);
    return null;
  }
}

async function getUrlCacheForCurrent(sheetId, tabName, colNum) {
  const want = cacheKey(sheetId, tabName, colNum);
  const cached = await loadUrlCache();
  if (cached?.key === want) return cached;
  return await refreshUrlCache();
}

async function appendUrlToCache(sheetId, tabName, colNum, url) {
  const want = cacheKey(sheetId, tabName, colNum);
  const cached = await loadUrlCache();
  if (!cached || cached.key !== want) return; // stale or missing → next refresh picks it up
  cached.urls.push(url);
  await saveUrlCache(cached);
}

// ---- Icon rendering ----
const GLOW = { idle: null, ok: "#00ff6e", err: "#ff0000", dup: "#0080ff" };
const ICON_SIZES = [16, 32, 48, 128];
const iconCache = {};

async function buildIconForState(state) {
  if (iconCache[state]) return iconCache[state];
  const glow = GLOW[state];
  const out = {};
  for (const size of ICON_SIZES) {
    const blob = await fetch(chrome.runtime.getURL(`assets/icon_${size}.png`)).then((r) => r.blob());
    const bmp = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext("2d");

    ctx.drawImage(bmp, 0, 0, size, size);
    if (glow) {
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);
      ctx.globalCompositeOperation = "source-over";
    }
    out[size] = ctx.getImageData(0, 0, size, size);
    bmp.close();
  }
  iconCache[state] = out;
  return out;
}

// Icon ops never throw to caller — failing to update an icon must not break savePage.
async function setIconState(state) {
  try {
    await chrome.action.setIcon({ imageData: await buildIconForState(state) });
  } catch (e) {
    console.error("Marksheet setIconState:", e);
  }
}

async function flashIcon(state) {
  await setIconState(state);
  setTimeout(() => setIconState("idle"), ICON_FLASH_MS);
}

// ---- Click handler ----
// Synchronous open — must be called inside the user-gesture event handler,
// before any `await`. Used as a fallback for first-time setup when no config
// exists yet.
function openSidePanelSync(windowId) {
  try {
    chrome.sidePanel?.open?.({ windowId });
  } catch (e) {
    console.error("Marksheet openSidePanelSync:", e);
  }
}

// Cached config-presence flag so the action click handler can decide whether
// to open the panel (no config) or save (has config) synchronously.
let hasActiveConfig = false;
async function recomputeHasActive() {
  try {
    const o = await chrome.storage.local.get([CONFIGS_KEY, ACTIVE_KEY]);
    const id = o[ACTIVE_KEY];
    const cfg = id && o[CONFIGS_KEY]?.[id];
    hasActiveConfig = !!(cfg?.sheetId && cfg?.tabName && Object.values(cfg.mapping || {}).some(Boolean));
  } catch (e) {
    console.error("Marksheet recomputeHasActive:", e);
    hasActiveConfig = false;
  }
}
recomputeHasActive();

// Single-flight lock so rapid double-clicks can't append duplicate rows.
let saveInFlight = null;
async function savePage(tab) {
  if (saveInFlight) return saveInFlight;
  saveInFlight = (async () => {
    try {
      return await savePageInner(tab);
    } finally {
      saveInFlight = null;
    }
  })();
  return saveInFlight;
}

async function savePageInner(tab) {
  try {
    const cfg = await getActiveConfig();
    if (!cfg?.sheetId || !cfg?.tabName) {
      // Gesture already lost here — caller must have opened panel synchronously.
      await flashIcon("err");
      return { status: "no_config" };
    }

    const pageUrl = tab?.url;
    if (!pageUrl || !/^https?:/i.test(pageUrl)) {
      await flashIcon("err");
      return { status: "invalid_page" };
    }

    const { sheetId, tabName, mapping = {} } = cfg;
    const tabData = { url: pageUrl, title: tab?.title };

    if (mapping.url) {
      const cache = await getUrlCacheForCurrent(sheetId, tabName, mapping.url);
      if (cache?.urls.includes(pageUrl)) {
        await flashIcon("dup");
        return { status: "duplicate" };
      }
    }

    const entries = Object.entries(mapping).filter(([, c]) => c);
    if (!entries.length) {
      await flashIcon("err");
      return { status: "no_mapping" };
    }
    const maxCol = Math.max(...entries.map(([, c]) => c));
    const row = new Array(maxCol).fill("");
    for (const [field, col] of entries) {
      row[col - 1] = FIELDS[field](tabData);
    }

    await appendRow(sheetId, tabName, row);
    if (mapping.url) await appendUrlToCache(sheetId, tabName, mapping.url, pageUrl);
    await flashIcon("ok");
    return { status: "ok" };
  } catch (e) {
    console.error("Marksheet:", e);
    await flashIcon("err");
    return { status: "error", error: e.message };
  }
}

chrome.action.onClicked.addListener((tab) => {
  // First time / no setup → open side panel synchronously (gesture valid).
  if (!hasActiveConfig) {
    openSidePanelSync(tab.windowId);
    return;
  }
  savePage(tab);
});

// Side panel: register once on install. No-op on browsers without sidePanel.
if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
}

// ---- Lifecycle: alarms + initial refresh ----
function scheduleAlarm() {
  chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: REFRESH_MINUTES });
}

chrome.runtime.onInstalled.addListener(() => {
  scheduleAlarm();
  refreshUrlCache().catch((e) => console.error("Marksheet onInstalled:", e));
});
chrome.runtime.onStartup.addListener(() => {
  scheduleAlarm();
  refreshUrlCache().catch((e) => console.error("Marksheet onStartup:", e));
});
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === REFRESH_ALARM) {
    refreshUrlCache().catch((e) => console.error("Marksheet onAlarm:", e));
  }
});

// Options page "Refresh now"
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "refreshCache") {
    refreshUrlCache()
      .then((c) => sendResponse({ ok: c !== null, count: c?.urls.length ?? 0 }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (msg?.type === "saveCurrentPage") {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const res = await savePage(tab);
        sendResponse(res);
      } catch (e) {
        console.error("Marksheet saveCurrentPage msg:", e);
        sendResponse({ status: "error", error: e.message });
      }
    })();
    return true;
  }
});

// Invalidate cache when active or stored configs change
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[ACTIVE_KEY] || changes[CONFIGS_KEY]) {
    recomputeHasActive();
    chrome.storage.local.remove(URL_CACHE_KEY)
      .then(() => refreshUrlCache())
      .catch((e) => console.error("Marksheet onChanged refresh:", e));
  }
});
