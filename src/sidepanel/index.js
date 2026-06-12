import { apiFetch } from "../auth.js";

const CONFIGS_KEY = "configs";
const ACTIVE_KEY = "activeId";
const COL_COUNT = 52;

const $ = (id) => document.getElementById(id);
const $configSel = $("configSel");
const $newConfig = $("newConfig");
const $deleteConfig = $("deleteConfig");
const $saveBtn = $("saveBtn");
const $status = $("status");
const $cfgName = $("cfgName");
const $sheetInput = $("sheetInput");
const $sheetInfo = $("sheetInfo");
const $tab = $("tab");
const $addType = $("addType");
const $mapUrl = $("mapUrl");
const $mapTitle = $("mapTitle");
const $mapDate = $("mapDate");
const $mapNotes = $("mapNotes");
const $save = $("save");
const $refresh = $("refresh");
const $cacheInfo = $("cacheInfo");

let configs = {};
let activeId = null;
let sheetId = null;
let sheetName = null;

function setStatus(msg, kind = "") {
  $status.textContent = msg;
  $status.className = kind;
}

function newId() {
  return "cfg_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

function colLetter(n) {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function extractSheetId(input) {
  if (!input) return null;
  const s = input.trim();
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(s)) return s;
  return null;
}

async function loadSheetMeta(id) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=properties.title,sheets.properties.title`;
  const data = await apiFetch(url);
  return {
    name: data.properties?.title,
    tabs: (data.sheets || []).map((s) => s.properties.title),
  };
}

function populateColSelector(sel, selectedCol) {
  sel.innerHTML = "";
  for (let i = COL_COUNT; i >= 1; i-=1) {
    const o = document.createElement("option");
    o.value = String(i);
    o.textContent = `${colLetter(i)} (Column ${i})`;
    sel.appendChild(o);
  }
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "(none)";
  sel.appendChild(none);
  sel.value = selectedCol ? String(selectedCol) : "";
}

function refreshColSelectors(preserve) {
  populateColSelector($mapUrl, preserve?.url);
  populateColSelector($mapTitle, preserve?.title);
  populateColSelector($mapDate, preserve?.date);
  populateColSelector($mapNotes, preserve?.notes);
}

function renderConfigList() {
  $configSel.innerHTML = "";
  const ids = Object.keys(configs);
  if (!ids.length) return;
  ids.forEach((id) => {
    const o = document.createElement("option");
    o.value = id;
    o.textContent = configs[id].name || "(unnamed)";
    $configSel.appendChild(o);
  });
  if (activeId) $configSel.value = activeId;
}

async function loadConfigIntoForm(id) {
  const c = configs[id];
  if (!c) {
    $cfgName.value = "";
    $sheetInput.value = "";
    $sheetInfo.textContent = "-";
    $tab.innerHTML = "<option>-</option>";
    refreshColSelectors();
    sheetId = null;
    sheetName = null;
    return;
  }
  $cfgName.value = c.name || "";
  $sheetInput.value = c.sheetUrl || c.sheetId || "";
  $addType.value = c.additionType || "append";
  sheetId = c.sheetId || null;
  sheetName = c.sheetName || null;
  $sheetInfo.textContent = sheetName || "-";

  $tab.innerHTML = "";
  if (sheetId) {
    try {
      const meta = await loadSheetMeta(sheetId);
      sheetName = meta.name;
      $sheetInfo.textContent = `${meta.name} · ${meta.tabs.length} tab(s)`;
      meta.tabs.forEach((t) => {
        const o = document.createElement("option");
        o.value = t;
        o.textContent = t;
        $tab.appendChild(o);
      });
      if (c.tabName) $tab.value = c.tabName;
    } catch {
      if (c.tabName) {
        const o = document.createElement("option");
        o.value = c.tabName;
        o.textContent = c.tabName;
        $tab.appendChild(o);
      }
    }
  }
  refreshColSelectors(c.mapping);
}

async function onSheetChange() {
  const id = extractSheetId($sheetInput.value);
  if (!id) {
    sheetId = null;
    sheetName = null;
    $sheetInfo.textContent = "invalid url or id";
    $tab.innerHTML = "<option>-</option>";
    return;
  }
  setStatus("Loading…");
  try {
    const meta = await loadSheetMeta(id);
    sheetId = id;
    sheetName = meta.name;
    $sheetInfo.textContent = `${meta.name} · ${meta.tabs.length} tab(s)`;
    $tab.innerHTML = "";
    meta.tabs.forEach((t) => {
      const o = document.createElement("option");
      o.value = t;
      o.textContent = t;
      $tab.appendChild(o);
    });
    refreshColSelectors();
    setStatus("");
  } catch (e) {
    sheetId = null;
    $sheetInfo.textContent = "fetch failed";
    setStatus(e.message, "err");
  }
}

async function persist() {
  try {
    await chrome.storage.local.set({ [CONFIGS_KEY]: configs, [ACTIVE_KEY]: activeId });
  } catch (e) {
    setStatus(`Save failed: ${e.message}`, "err");
  }
}

async function updateCacheInfo() {
  try {
    const o = await chrome.storage.local.get("urlCache");
    const c = o.urlCache;
    if (!c) { $cacheInfo.textContent = "empty"; return; }
    const ago = Math.round((Date.now() - c.fetchedAt) / 1000);
    $cacheInfo.textContent = `${c.urls.length} urls · refreshed ${ago}s ago`;
  } catch {
    $cacheInfo.textContent = "-";
  }
}

async function init() {
  try {
    const o = await chrome.storage.local.get([CONFIGS_KEY, ACTIVE_KEY, "settings"]);
    if (o[CONFIGS_KEY]) {
      configs = o[CONFIGS_KEY];
      activeId = o[ACTIVE_KEY];
    } else if (o.settings) {
      const id = newId();
      configs = { [id]: { ...o.settings, name: o.settings.sheetName || "default" } };
      activeId = id;
      await persist();
      await chrome.storage.local.remove("settings");
    }
    renderConfigList();
    if (activeId && configs[activeId]) {
      await loadConfigIntoForm(activeId);
    } else if (!Object.keys(configs).length) {
      const id = newId();
      configs[id] = { name: "", mapping: {}, additionType: "append" };
      activeId = id;
      renderConfigList();
      await loadConfigIntoForm(id);
      await persist();
      $cfgName.focus();
    }
  } catch (e) {
    setStatus(`Init failed: ${e.message}`, "err");
  }
  await updateCacheInfo();
}

// ---- Event wiring ----
$configSel.addEventListener("change", async () => {
  activeId = $configSel.value;
  await persist();
  await loadConfigIntoForm(activeId);
});

$newConfig.addEventListener("click", async () => {
  const id = newId();
  configs[id] = { name: "new config", mapping: {}, additionType: "append" };
  activeId = id;
  renderConfigList();
  await loadConfigIntoForm(id);
  await persist();
  $cfgName.focus();
});

$deleteConfig.addEventListener("click", async () => {
  if (!activeId || !configs[activeId]) return;
  if (!confirm(`Delete config "${configs[activeId].name}"?`)) return;
  delete configs[activeId];
  activeId = Object.keys(configs)[0] || null;
  renderConfigList();
  await loadConfigIntoForm(activeId);
  await persist();
  setStatus("Deleted", "ok");
});

$sheetInput.addEventListener("blur", onSheetChange);

$save.addEventListener("click", async () => {
  if (!activeId) return setStatus("Create a config first", "err");
  if (!sheetId && $sheetInput.value.trim()) await onSheetChange();
  if (!sheetId) return setStatus("Pick a valid spreadsheet first", "err");
  configs[activeId] = {
    name: $cfgName.value.trim() || sheetName || "unnamed",
    sheetId,
    sheetName,
    sheetUrl: $sheetInput.value.trim(),
    tabName: $tab.value,
    additionType: $addType.value,
    mapping: {
      url:   parseInt($mapUrl.value,   10) || null,
      title: parseInt($mapTitle.value, 10) || null,
      date:  parseInt($mapDate.value,  10) || null,
      notes: parseInt($mapNotes.value, 10) || null,
    },
  };
  await persist();
  renderConfigList();
  setStatus("Saved ✓", "ok");
});

$saveBtn.addEventListener("click", async () => {
  setStatus("Saving…");
  let res;
  try {
    res = await chrome.runtime.sendMessage({ type: "saveCurrentPage" });
  } catch (e) {
    setStatus(`Bg error: ${e.message}`, "err");
    return;
  }
  const map = {
    ok: ["Saved ✓", "ok"],
    duplicate: ["Already saved", "dup"],
    cache_unavailable: ["Cache unavailable - try Refresh", "err"],
    invalid_page: ["Can't save this page", "err"],
    no_config: ["No active config", "err"],
    no_mapping: ["Mapping missing", "err"],
    error: [`Error: ${res?.error || "?"}`, "err"],
  };
  const [msg, cls] = map[res?.status] || ["?", "err"];
  setStatus(msg, cls);
  await updateCacheInfo();
});

$refresh.addEventListener("click", async () => {
  setStatus("Refreshing cache…");
  try {
    const res = await chrome.runtime.sendMessage({ type: "refreshCache" });
    if (res?.ok) {
      setStatus(`Cache: ${res.count} urls`, "ok");
      await updateCacheInfo();
    } else {
      setStatus(`Refresh failed${res?.error ? `: ${res.error}` : ""}`, "err");
    }
  } catch (e) {
    setStatus(`Bg error: ${e.message}`, "err");
  }
});

init();
