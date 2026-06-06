// Auth via chrome.identity.launchWebAuthFlow (implicit flow).
// Works in Chromium / Brave / un-signed-in Chrome (unlike getAuthToken which
// requires Chrome browser sign-in).
//
// Setup: in Google Cloud Console, create an OAuth client of type
// "Web application" with redirect URI:
//   https://<extension-id>.chromiumapp.org/
// Paste its client ID below.

const CLIENT_ID = "600773913801-btpbl42gi6hbbmor6vdqghtcki02subk.apps.googleusercontent.com";
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
].join(" ");
const TOKEN_KEY = "oauth_token";

function getRedirectURL() {
  return chrome.identity.getRedirectURL();
}

function parseFragment(url) {
  const i = url.indexOf("#");
  if (i < 0) return {};
  return Object.fromEntries(new URLSearchParams(url.slice(i + 1)));
}

function launchAuth(interactive) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "token",
    redirect_uri: getRedirectURL(),
    scope: SCOPES,
    prompt: interactive ? "consent" : "none",
  });
  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({
      url,
      interactive,
      abortOnLoadForNonInteractive: !interactive,
      timeoutMsForNonInteractive: 3000,
    }, (redir) => {
      if (chrome.runtime.lastError || !redir) {
        reject(new Error(chrome.runtime.lastError?.message || "auth failed"));
        return;
      }
      const f = parseFragment(redir);
      if (f.error) { reject(new Error(f.error)); return; }
      if (!f.access_token) { reject(new Error("no access_token in redirect")); return; }
      const ttl = parseInt(f.expires_in || "3600", 10);
      resolve({
        token: f.access_token,
        expiresAt: Date.now() + ttl * 1000 - 60_000, // 1min safety
      });
    });
  });
}

async function loadCachedToken() {
  const obj = await chrome.storage.local.get(TOKEN_KEY);
  return obj[TOKEN_KEY] || null;
}

async function saveToken(t) {
  await chrome.storage.local.set({ [TOKEN_KEY]: t });
}

async function clearToken() {
  await chrome.storage.local.remove(TOKEN_KEY);
}

export async function getToken(interactive = true) {
  const cached = await loadCachedToken();
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  try {
    const t = await launchAuth(false);
    await saveToken(t);
    return t.token;
  } catch (e) {
    // Only go interactive for errors that genuinely require user action.
    // Never prompt from a background context (alarm, onStartup, etc.).
    const recoverable = /interaction_required|consent_required|login_required|User interaction required/.test(e.message);
    if (!interactive || !recoverable) throw e;
    const t = await launchAuth(true);
    await saveToken(t);
    return t.token;
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function apiFetch(url, opts = {}, attempt = 0) {
  const { interactive = true, ...fetchOpts } = opts;
  const token = await getToken(interactive);
  const res = await fetch(url, {
    ...fetchOpts,
    headers: {
      ...(fetchOpts.headers || {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  // Token rejected → drop cache, retry once.
  if (res.status === 401 && attempt === 0) {
    await clearToken();
    return apiFetch(url, opts, attempt + 1);
  }

  // Rate-limited or transient server error → exponential backoff, max 3 retries.
  if ((res.status === 429 || (res.status >= 500 && res.status < 600)) && attempt < 3) {
    const wait = 500 * 2 ** attempt; // 500ms, 1s, 2s
    await sleep(wait);
    return apiFetch(url, opts, attempt + 1);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }

  if (res.status === 204) return null;
  return res.json();
}
