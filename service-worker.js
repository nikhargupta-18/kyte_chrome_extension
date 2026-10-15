// ============================================================
// KYTE — Service Worker
// Manages blocking state, sessions, declarativeNetRequest rules
// ============================================================

const RULE_ID_BASE = 1000; // DNR rule IDs start here

// ── Helpers ──────────────────────────────────────────────────

async function getState() {
  const defaults = {
    kyteEnabled: false,
    sessionActive: false,
    sessionLockedUntil: 0,   // epoch ms; 0 = unlocked
    sessionEndTime: 0,        // epoch ms; 0 = no timer
    blockedDomains: [],       // ['youtube.com', 'reddit.com']
    allowedUrls: [],          // ['https://youtube.com/watch?v=abc']
    isPremium: false,         // true after one-time payment
  };
  const data = await chrome.storage.local.get(Object.keys(defaults));
  return { ...defaults, ...data };
}

async function setState(partial) {
  await chrome.storage.local.set(partial);
}

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
        sendResponse({ ok: true, state });
        break;
      }

      case 'SET_ENABLED': {
        const { enabled } = payload;
        await setState({ kyteEnabled: enabled });
        await syncDNRRules();
        sendResponse({ ok: true });
        break;
      }

      case 'START_SESSION': {
        const { durationMinutes, locked, lockedMinutes } = payload;
        const now = Date.now();
        const sessionLockedUntil = locked
          ? now + (lockedMinutes || durationMinutes) * 60 * 1000
          : 0;
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
  })();
  return true; // Keep message channel open for async
});

// ── Startup: Re-sync rules in case SW was killed ──────────────
chrome.runtime.onStartup.addListener(syncDNRRules);
chrome.runtime.onInstalled.addListener(syncDNRRules);
