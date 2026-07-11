// ============================================================
// Kyte — blocked.js
// Runs on chrome-extension://…/blocked.html
// DNR redirects blocked URLs here (original URL is in the hash).
// ============================================================

(async function init() {
  // ── 1. Get the original blocked URL from the hash ──────────
  // DNR regexSubstitution puts the full original URL after '#'
  const originalUrl = decodeURIComponent(location.hash.slice(1));
  let hostname = 'this site';

  try {
    hostname = new URL(originalUrl).hostname.replace(/^www\./, '');
  } catch (_) {}

  // ── 2. Load extension state ────────────────────────────────
  let state;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    state = response?.state ?? {};
  } catch (_) {
    state = {};
  }

  // ── 3. If the URL is now allowed (e.g. popup just updated it), go there
  if (originalUrl && isNowAllowed(originalUrl, state)) {
    window.location.replace(originalUrl);
    return;
  }

  // ── 4. Populate the UI ────────────────────────────────────
  document.getElementById('blocked-hostname').textContent = hostname;
  document.getElementById('allow-hint').textContent =
    `Everything else on ${hostname} stays blocked.`;

  const isLocked = state.sessionLockedUntil > Date.now();
  const sessionEndTime = state.sessionEndTime;

  if (isLocked) {
    document.getElementById('status-text').textContent = 'Session Active · Locked';
    document.getElementById('allow-box').style.display = 'none';
  }

  if (sessionEndTime > 0) {
    const timerWrap = document.getElementById('timer-wrap');
    timerWrap.style.display = '';
    startCountdown(document.getElementById('kyte-timer'), sessionEndTime);
  }

  // ── 5. Pre-fill the allow input with the original URL ──────
  const allowInput = document.getElementById('allow-input');
  if (originalUrl) {
    allowInput.value = stripTrailingSlash(originalUrl);
  }

  // ── 6. Allow button ───────────────────────────────────────
  const addAllowBtn = document.getElementById('add-allow-btn');
  addAllowBtn.addEventListener('click', async () => {
    const url = allowInput.value.trim() || originalUrl;
    try {
      new URL(url); // validate
      await chrome.runtime.sendMessage({ type: 'ADD_ALLOWED_URL', payload: { url } });
      // Navigate to the now-allowed URL — DNR allow rule (priority 10) will let it through
      window.location.replace(url);
    } catch (_) {
      allowInput.classList.add('error');
      setTimeout(() => allowInput.classList.remove('error'), 1500);
    }
  });

  allowInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addAllowBtn.click();
  });

  // ── 7. Go back button ─────────────────────────────────────
  document.getElementById('go-back').addEventListener('click', () => {
    if (history.length > 1) {
      history.back();
    } else {
      window.location.href = 'https://www.google.com';
    }
  });

  // ── 8. React to state changes from the popup ──────────────
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'local') return;
    if (changes.kyteEnabled || changes.allowedUrls || changes.blockedDomains) {
      // Re-check if we should still be blocking
      (async () => {
        try {
          const resp = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
          const newState = resp?.state ?? {};
          if (!newState.kyteEnabled || isNowAllowed(originalUrl, newState)) {
            window.location.replace(originalUrl || 'https://www.google.com');
          }
        } catch (_) {}
      })();
    }
  });
})();

// ── Helpers ───────────────────────────────────────────────────

function isNowAllowed(url, state) {
  if (!url || !state.allowedUrls?.length) return false;
  try {
    const current = new URL(url);
    return state.allowedUrls.some(au => {
      try {
        const a = new URL(au);
        return a.origin === current.origin &&
               a.pathname === current.pathname &&
               a.search === current.search;
      } catch (_) { return false; }
    });
  } catch (_) { return false; }
}

function stripTrailingSlash(url) {
  try {
    const u = new URL(url);
    if (u.pathname === '/') return url.replace(/\/$/, '');
    return url;
  } catch (_) { return url; }
}

function startCountdown(el, endTime) {
  if (!el) return;
  const tick = () => {
    const remaining = endTime - Date.now();
    if (remaining <= 0) { el.textContent = '0s'; return; }
    const h = Math.floor(remaining / 3600000);
    const m = Math.floor((remaining % 3600000) / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    el.textContent = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
  };
  tick();
  setInterval(tick, 1000);
}
