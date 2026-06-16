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
const $tabOptions = $("tabOptions");
const $mapUrl = $("mapUrl");
const $mapTitle = $("mapTitle");
const $mapDate = $("mapDate");
const $mapNotes = $("mapNotes");
const $save = $("save");
const $refresh = $("refresh");
const $refreshTab = $("refreshTab");
const $cacheInfo = $("cacheInfo");
const $exportConfigs = $("exportConfigs");
const $importConfigs = $("importConfigs");
const $importFile = $("importFile");

let configs = {};
let activeId = null;
let sheetId = null;
let sheetName = null;
let tabColCounts = {};

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
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=properties.title,sheets.properties(title,gridProperties.columnCount)`;
  const data = await apiFetch(url);
  return {
    name: data.properties?.title,
    tabs: (data.sheets || []).map((s) => ({
      title: s.properties.title,
      colCount: Math.min(s.properties.gridProperties?.columnCount || COL_COUNT, COL_COUNT),
    })),
  };
}

function populateColSelector(sel, selectedCol, colCount = COL_COUNT) {
  sel.innerHTML = "";
  for (let i = colCount; i >= 1; i -= 1) {
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
  const n = tabColCounts[$tab.value] ?? COL_COUNT;
  populateColSelector($mapUrl, preserve?.url, n);
  populateColSelector($mapTitle, preserve?.title, n);
  populateColSelector($mapDate, preserve?.date, n);
  populateColSelector($mapNotes, preserve?.notes, n);
}

function populateTabs(tabs, selectedTab) {
  $tabOptions.innerHTML = "";
  tabColCounts = {};
  tabs.forEach((t) => {
    const o = document.createElement("option");
    o.value = t.title;
    $tabOptions.appendChild(o);
    tabColCounts[t.title] = t.colCount;
  });
  $tab.value = selectedTab || (tabs[0]?.title ?? "");
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
    $tab.value = "";
    $tabOptions.innerHTML = "";
    tabColCounts = {};
    refreshColSelectors();
    sheetId = null;
    sheetName = null;
    return;
  }
  $cfgName.value = c.name || "";
  $sheetInput.value = c.sheetUrl || c.sheetId || "";
  sheetId = c.sheetId || null;
  sheetName = c.sheetName || null;
  $sheetInfo.textContent = sheetName || "-";

  $tab.value = "";
  $tabOptions.innerHTML = "";
  tabColCounts = {};

  if (sheetId) {
    try {
      const meta = await loadSheetMeta(sheetId);
      sheetName = meta.name;
      $sheetInfo.textContent = `${meta.name} · ${meta.tabs.length} tab(s)`;
      populateTabs(meta.tabs, c.tabName);
    } catch {
      if (c.tabName) $tab.value = c.tabName;
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
    $tab.value = "";
    $tabOptions.innerHTML = "";
    tabColCounts = {};
    return;
  }
  setStatus("Loading…");
  try {
    const meta = await loadSheetMeta(id);
    sheetId = id;
    sheetName = meta.name;
    $sheetInfo.textContent = `${meta.name} · ${meta.tabs.length} tab(s)`;
    populateTabs(meta.tabs, $tab.value);
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
    await chrome.storage.sync.set({ [CONFIGS_KEY]: configs, [ACTIVE_KEY]: activeId });
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
    const [synced, local] = await Promise.all([
      chrome.storage.sync.get([CONFIGS_KEY, ACTIVE_KEY]),
      chrome.storage.local.get("settings"),
    ]);
    if (synced[CONFIGS_KEY]) {
      configs = synced[CONFIGS_KEY];
      activeId = synced[ACTIVE_KEY];
    } else if (local.settings) {
      const id = newId();
      configs = { [id]: { ...local.settings, name: local.settings.sheetName || "default" } };
      activeId = id;
      await persist();
      await chrome.storage.local.remove("settings");
    }
    renderConfigList();
    if (activeId && configs[activeId]) {
      await loadConfigIntoForm(activeId);
    } else if (!Object.keys(configs).length) {
      const id = newId();
      configs[id] = { name: "", mapping: {} };
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
  configs[id] = { name: "new config", mapping: {} };
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

$sheetInput.addEventListener("blur", async () => {
  if (extractSheetId($sheetInput.value) === sheetId) return;
  await onSheetChange();
});

$tab.addEventListener("input", () => {
  const preserve = {
    url:   parseInt($mapUrl.value,   10) || null,
    title: parseInt($mapTitle.value, 10) || null,
    date:  parseInt($mapDate.value,  10) || null,
    notes: parseInt($mapNotes.value, 10) || null,
  };
  refreshColSelectors(preserve);
});

$refreshTab.addEventListener("click", async () => {
  if (!sheetId) return setStatus("Load a spreadsheet first", "err");
  $refreshTab.disabled = true;
  setStatus("Loading tabs…");
  try {
    const prev = $tab.value;
    const meta = await loadSheetMeta(sheetId);
    sheetName = meta.name;
    $sheetInfo.textContent = `${meta.name} · ${meta.tabs.length} tab(s)`;
    populateTabs(meta.tabs, prev);
    setStatus("");
  } catch (e) {
    setStatus(e.message, "err");
  } finally {
    $refreshTab.disabled = false;
  }
});

$save.addEventListener("click", async () => {
  if (!activeId) return setStatus("Create a config first", "err");
  const inputId = extractSheetId($sheetInput.value);
  if (!sheetId || inputId !== sheetId) await onSheetChange();
  if (!sheetId) return setStatus("Pick a valid spreadsheet first", "err");
  if (!$tab.value.trim()) return setStatus("Pick a tab first", "err");
  configs[activeId] = {
    name: $cfgName.value.trim() || sheetName || "unnamed",
    sheetId,
    sheetName,
    sheetUrl: $sheetInput.value.trim(),
    tabName: $tab.value.trim(),
    mapping: {
      url:   parseInt($mapUrl.value,   10) || null,
      title: parseInt($mapTitle.value, 10) || null,
      date:  parseInt($mapDate.value,  10) || null,
      notes: parseInt($mapNotes.value, 10) || null,
    },
  };
  await persist();
  renderConfigList();
  setStatus("Saved ✓ · refreshing cache…", "ok");
  try {
    const res = await chrome.runtime.sendMessage({ type: "refreshCache" });
    if (res?.ok) {
      setStatus(`Saved ✓ · cache: ${res.count} urls`, "ok");
      await updateCacheInfo();
    } else {
      setStatus("Saved ✓ · cache refresh failed", "ok");
    }
  } catch {
    setStatus("Saved ✓", "ok");
  }
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

$exportConfigs.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(configs, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "marksheet-configs.json";
  a.click();
  URL.revokeObjectURL(url);
});

$importConfigs.addEventListener("click", () => $importFile.click());

$importFile.addEventListener("change", async () => {
  const file = $importFile.files?.[0];
  if (!file) return;
  $importFile.value = "";
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    return setStatus("Invalid JSON file", "err");
  }
  if (typeof parsed !== "object" || Array.isArray(parsed) || !parsed) {
    return setStatus("Invalid config format", "err");
  }
  const valid = Object.values(parsed).every(
    (c) => typeof c === "object" && c !== null && "sheetId" in c
  );
  if (!valid) return setStatus("Invalid config format", "err");
  if (!confirm(`Replace all configs with ${Object.keys(parsed).length} imported config(s)?`)) return;
  configs = parsed;
  activeId = Object.keys(configs)[0] || null;
  renderConfigList();
  await loadConfigIntoForm(activeId);
  await persist();
  setStatus(`Imported ${Object.keys(configs).length} config(s) · refreshing cache…`, "ok");
  try {
    const res = await chrome.runtime.sendMessage({ type: "refreshCache" });
    if (res?.ok) {
      setStatus(`Imported ${Object.keys(configs).length} config(s) · cache: ${res.count} urls`, "ok");
      await updateCacheInfo();
    } else {
      setStatus(`Imported ${Object.keys(configs).length} config(s)`, "ok");
    }
  } catch {
    setStatus(`Imported ${Object.keys(configs).length} config(s)`, "ok");
  }
});

init();
