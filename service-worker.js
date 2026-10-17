// ============================================================
// KYTE — Service Worker
// Manages blocking state, sessions, declarativeNetRequest rules
// ============================================================

const RULE_ID_BASE = 1000; // DNR rule IDs start here
const PREMIUM_API = 'https://www.getkyte.online';
const PREMIUM_CACHE_MS = 7 * 24 * 60 * 60 * 1000;

// ── Helpers ──────────────────────────────────────────────────

async function getState() {
  const defaults = {
    kyteEnabled: false,
    sessionActive: false,
    sessionLockedUntil: 0,   // epoch ms; 0 = unlocked
    sessionEndTime: 0,        // epoch ms; 0 = no timer
    blockedDomains: [],       // ['youtube.com', 'reddit.com']
    allowedUrls: [],          // ['https://youtube.com/watch?v=abc']
    premiumToken: '',         // website-issued device session, never a payment key
    premiumAccount: '',
    premiumPurchased: false,
    premiumCheckedAt: 0,
    premiumAuthError: '',
  };
  const data = await chrome.storage.local.get(Object.keys(defaults));
  return { ...defaults, ...data };
}

async function setState(partial) {
  await chrome.storage.local.set(partial);
}

// ── Locked In Mode entitlement ───────────────────────────────

function cachedPremium(state) {
  return Boolean(state.premiumToken && state.premiumPurchased &&
    state.premiumCheckedAt > 0 &&
    Date.now() >= state.premiumCheckedAt &&
    Date.now() - state.premiumCheckedAt < PREMIUM_CACHE_MS);
}

async function refreshPremium(force = false) {
  const state = await getState();
  if (!state.premiumToken) return { purchased: false, signedIn: false };
  if (!force && cachedPremium(state)) {
    return { purchased: true, signedIn: true, account: state.premiumAccount };
  }
  try {
    const response = await fetch(`${PREMIUM_API}/api/extension/entitlement`, {
      headers: { Authorization: `Bearer ${state.premiumToken}` },
      cache: 'no-store',
    });
    if (response.status === 401) {
      await setState({ premiumToken: '', premiumAccount: '', premiumPurchased: false, premiumCheckedAt: 0 });
      return { purchased: false, signedIn: false };
    }
    if (!response.ok) throw new Error('entitlement_unavailable');
    const result = await response.json();
    if (typeof result.purchased !== 'boolean' || typeof result.account !== 'string') {
      throw new Error('invalid_entitlement');
    }
    await setState({
      premiumAccount: result.account,
      premiumPurchased: result.purchased,
      premiumCheckedAt: Date.now(),
    });
    return { purchased: result.purchased, signedIn: true, account: result.account };
  } catch (_) {
    // A previously verified purchase remains usable for seven days offline.
    return { purchased: cachedPremium(state), signedIn: true, account: state.premiumAccount, offline: true };
  }
}

function randomBase64Url(bytes = 32) {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...values)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function connectPremium() {
  const { premiumPendingAuth } = await chrome.storage.local.get(['premiumPendingAuth']);
  if (premiumPendingAuth?.tabId) {
    try {
      await chrome.tabs.update(premiumPendingAuth.tabId, { active: true });
      return { pending: true };
    } catch (_) {
      await chrome.storage.local.remove('premiumPendingAuth');
    }
  }
  const verifier = randomBase64Url();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const state = randomBase64Url();
  const redirectUri = chrome.identity.getRedirectURL();
  const start = new URL(`${PREMIUM_API}/extension/locked-in`);
  start.searchParams.set('redirect_uri', redirectUri);
  start.searchParams.set('challenge', challenge);
  start.searchParams.set('state', state);
  // Opening a regular tab lets the buyer choose an account and complete checkout
  // in their usual browser context. Save the verifier before navigation so a
  // fast callback cannot race the pending auth state.
  const tab = await chrome.tabs.create({ url: 'about:blank' });
  if (!Number.isInteger(tab?.id)) throw new Error('auth_tab_unavailable');
  await chrome.storage.local.set({
    premiumPendingAuth: { tabId: tab.id, redirectUri, state, verifier },
    premiumAuthError: '',
  });
  try {
    await chrome.tabs.update(tab.id, { url: start.toString() });
  } catch (error) {
    await chrome.storage.local.remove('premiumPendingAuth');
    await chrome.tabs.remove(tab.id);
    throw error;
  }
  return { pending: true };
}

let premiumCallbackInProgress = false;

async function finishPremium(tabId, callbackUrl) {
  if (premiumCallbackInProgress) return;
  const { premiumPendingAuth } = await chrome.storage.local.get(['premiumPendingAuth']);
  if (!premiumPendingAuth || premiumPendingAuth.tabId !== tabId) return;
  const expected = new URL(premiumPendingAuth.redirectUri);
  const result = new URL(callbackUrl);
  if (result.origin !== expected.origin || result.pathname !== expected.pathname) return;
  if (premiumCallbackInProgress) return;
  premiumCallbackInProgress = true;
  await chrome.storage.local.remove('premiumPendingAuth');
  try {
    if (result.searchParams.get('state') !== premiumPendingAuth.state) throw new Error('invalid_auth_state');
    const code = result.searchParams.get('code');
    if (!code) throw new Error('missing_auth_code');
    const exchange = await fetch(`${PREMIUM_API}/api/extension/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, verifier: premiumPendingAuth.verifier }),
    });
    if (!exchange.ok) throw new Error('sign_in_failed');
    const { token } = await exchange.json();
    if (typeof token !== 'string') throw new Error('invalid_session');
    await setState({ premiumToken: token, premiumAccount: '', premiumPurchased: false,
      premiumCheckedAt: 0, premiumAuthError: '' });
    await refreshPremium(true);
  } catch (_) {
    await setState({ premiumAuthError: 'Could not connect your account. Please try again.' });
  } finally {
    premiumCallbackInProgress = false;
    await chrome.tabs.remove(tabId).catch(() => {});
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) void finishPremium(tabId, changeInfo.url);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void (async () => {
    const { premiumPendingAuth } = await chrome.storage.local.get(['premiumPendingAuth']);
    if (premiumPendingAuth?.tabId === tabId) await chrome.storage.local.remove('premiumPendingAuth');
  })();
});

// ── DNR Rule Sync ─────────────────────────────────────────────
// We use dynamic rules only. Static ruleset is empty.
// Rule layout:
//   1000..1999 → ALLOW rules for specific URLs (higher priority)
//   2000..2999 → BLOCK rules for domains

async function syncDNRRules() {
  const state = await getState();

  // Remove all existing dynamic rules
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existingRules.map(r => r.id);

  const addRules = [];

  if (state.kyteEnabled && state.blockedDomains.length > 0) {
    // The blocked page URL — the original URL is appended as the hash fragment
    // so blocked.html can read it and show the correct hostname.
    const blockedPageBase = chrome.runtime.getURL('blocked.html');

    // Add REDIRECT rules for each blocked entry.
    // We use regexFilter + regexSubstitution so \0 captures the full original URL.
    state.blockedDomains.forEach((entry, index) => {
      // Escape dots for use inside a regex pattern
      const escapeDots = (s) => s.replace(/\./g, '\\.');

      let regexFilter;
      if (entry.includes('/')) {
        // Path-level block: e.g. "instagram.com/reels"
        const slashIdx = entry.indexOf('/');
        const domain = escapeDots(entry.slice(0, slashIdx));
        const path = escapeDots(entry.slice(slashIdx)); // includes leading /
        // Match domain (with optional www./subdomain) + path prefix + anything after
        regexFilter = `^https?://(?:[^/]*\\.)?${domain}${path}(?:/.*)?$`;
      } else {
        // Domain-level block: e.g. "instagram.com"
        const domain = escapeDots(entry);
        regexFilter = `^https?://(?:[^/]*\\.)?${domain}(?:/.*)?$`;
      }

      addRules.push({
        id: RULE_ID_BASE + 1000 + index,
        priority: 1,
        action: {
          type: 'redirect',
          redirect: {
            // \0 = the full matched URL (the original destination).
            // We put it in the hash so blocked.html can parse it without
            // URL-encoding issues.
            regexSubstitution: `${blockedPageBase}#\\0`,
          },
        },
        condition: {
          regexFilter,
          resourceTypes: ['main_frame'],
        },
      });
    });

    // Add ALLOW rules for each explicitly allowed URL (priority 10 > redirect priority 1)
    state.allowedUrls.forEach((url, index) => {
      try {
        const parsed = new URL(url);
        // Match exact path + query. We strip the hash.
        const urlFilter = `${parsed.origin}${parsed.pathname}${parsed.search}`;
        addRules.push({
          id: RULE_ID_BASE + index,
          priority: 10, // Higher than block rules
          action: { type: 'allow' },
          condition: {
            urlFilter,
            resourceTypes: ['main_frame'],
          },
        });
      } catch (_) {
        // Invalid URL; skip
      }
    });
  }

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: removeIds,
    addRules,
  });
}

// ── Session Timer ─────────────────────────────────────────────

async function startSessionAlarm(durationMinutes) {
  await chrome.alarms.clear('kyte-session-end');
  if (durationMinutes > 0) {
    await chrome.alarms.create('kyte-session-end', {
      delayInMinutes: durationMinutes,
    });
    const sessionEndTime = Date.now() + durationMinutes * 60 * 1000;
    await setState({ sessionEndTime });
  } else {
    await setState({ sessionEndTime: 0 });
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'kyte-session-end') {
    // Session timer ran out — deactivate blocking
    await setState({
      kyteEnabled: false,
      sessionActive: false,
      sessionEndTime: 0,
      sessionLockedUntil: 0,
    });
    await syncDNRRules();
  }
});

// ── Message Handling ──────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    const { type, payload } = message;

    switch (type) {
      case 'GET_STATE': {
        const state = await getState();
        state.isPremium = cachedPremium(state);
        const { premiumPendingAuth } = await chrome.storage.local.get(['premiumPendingAuth']);
        state.premiumAuthPending = Boolean(premiumPendingAuth);
        delete state.premiumToken;
        sendResponse({ ok: true, state });
        break;
      }

      case 'GET_ENTITLEMENT':
      case 'REFRESH_ENTITLEMENT': {
        const result = await refreshPremium(type === 'REFRESH_ENTITLEMENT');
        sendResponse({ ok: true, ...result });
        break;
      }

      case 'CONNECT_PREMIUM': {
        const result = await connectPremium();
        sendResponse({ ok: true, ...result });
        break;
      }

      case 'SET_ENABLED': {
        const { enabled } = payload;
        const state = await getState();
        if (!enabled && state.sessionActive && state.sessionLockedUntil > Date.now()) {
          sendResponse({ ok: false, reason: 'locked' });
          break;
        }
        await setState({ kyteEnabled: enabled });
        await syncDNRRules();
        sendResponse({ ok: true });
        break;
      }

      case 'START_SESSION': {
        const { durationMinutes, locked } = payload;
        if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || durationMinutes > 1440) {
          sendResponse({ ok: false, reason: 'invalid_duration' });
          break;
        }
        if (locked && !(await refreshPremium()).purchased) {
          sendResponse({ ok: false, reason: 'premium_required' });
          break;
        }
        const now = Date.now();
        const sessionLockedUntil = locked ? now + durationMinutes * 60 * 1000 : 0;
        await setState({
          kyteEnabled: true,
          sessionActive: true,
          sessionLockedUntil,
        });
        await startSessionAlarm(durationMinutes);
        await syncDNRRules();
        sendResponse({ ok: true });
        break;
      }

      case 'END_SESSION': {
        const state = await getState();
        const now = Date.now();
        if (state.sessionLockedUntil > now) {
          sendResponse({ ok: false, reason: 'locked' });
          break;
        }
        await chrome.alarms.clear('kyte-session-end');
        await setState({
          kyteEnabled: false,
          sessionActive: false,
          sessionEndTime: 0,
          sessionLockedUntil: 0,
        });
        await syncDNRRules();
        sendResponse({ ok: true });
        break;
      }

      case 'ADD_DOMAIN': {
        const { domain } = payload;
        const state = await getState();
        // Clean the input: remove protocol, remove www., remove trailing slash.
        // Preserve any path (e.g. instagram.com/reels stays as instagram.com/reels).
        let cleaned = domain.replace(/^https?:\/\//, '').replace(/^www\./, '');
        cleaned = cleaned.replace(/\/$/, ''); // trim trailing slash only
        if (!state.blockedDomains.includes(cleaned)) {
          state.blockedDomains.push(cleaned);
          await setState({ blockedDomains: state.blockedDomains });
          await syncDNRRules();
        }
        sendResponse({ ok: true });
        break;
      }

      case 'REMOVE_DOMAIN': {
        const { domain } = payload;
        const state = await getState();
        const now = Date.now();
        if (state.sessionActive && state.sessionLockedUntil > now) {
          sendResponse({ ok: false, reason: 'locked' });
          break;
        }
        state.blockedDomains = state.blockedDomains.filter(d => d !== domain);
        // Also remove any allowed URLs that were on this domain
        state.allowedUrls = state.allowedUrls.filter(u => !u.includes(domain));
        await setState({
          blockedDomains: state.blockedDomains,
          allowedUrls: state.allowedUrls,
        });
        await syncDNRRules();
        sendResponse({ ok: true });
        break;
      }

      case 'ADD_ALLOWED_URL': {
        const { url } = payload;
        const state = await getState();
        if (!state.allowedUrls.includes(url)) {
          state.allowedUrls.push(url);
          await setState({ allowedUrls: state.allowedUrls });
          await syncDNRRules();
        }
        sendResponse({ ok: true });
        break;
      }

      case 'REMOVE_ALLOWED_URL': {
        const { url } = payload;
        const state = await getState();
        const now = Date.now();
        if (state.sessionActive && state.sessionLockedUntil > now) {
          sendResponse({ ok: false, reason: 'locked' });
          break;
        }
        state.allowedUrls = state.allowedUrls.filter(u => u !== url);
        await setState({ allowedUrls: state.allowedUrls });
        await syncDNRRules();
        sendResponse({ ok: true });
        break;
      }

      case 'GET_CURRENT_TAB_URL': {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        sendResponse({ ok: true, url: tab?.url || '' });
        break;
      }

      default:
        sendResponse({ ok: false, reason: 'unknown_message' });
    }
  })().catch(() => sendResponse({ ok: false, reason: 'unavailable' }));
  return true; // Keep message channel open for async
});

// ── Startup: Re-sync rules in case SW was killed ──────────────
chrome.runtime.onStartup.addListener(syncDNRRules);
chrome.runtime.onInstalled.addListener(syncDNRRules);
