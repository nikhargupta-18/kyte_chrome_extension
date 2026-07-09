// ============================================================
// KYTE — Content Script
// Runs in every page. Checks if this domain is blocked and
// whether this specific URL is allowlisted.
// ============================================================

// ── Block State Helpers ───────────────────────────────────────
// Checks whether a URL is currently blocked given the extension state.
// Understands both domain-level blocks (instagram.com) and
// path-level blocks (instagram.com/reels).
function isUrlBlockedByState(url, state) {
  let parsed;
  try { parsed = new URL(url); } catch (_) { return false; }
  const hostname = parsed.hostname.replace(/^www\./, '');
  const pathname = parsed.pathname;

  // Explicit allowedUrls always override any block
  const isAllowed = state.allowedUrls.some(au => {
    try {
      const a = new URL(au);
      return a.origin === parsed.origin && a.pathname === pathname && a.search === parsed.search;
    } catch (_) { return false; }
  });
  if (isAllowed) return false;

  return state.blockedDomains.some(entry => {
    if (entry.includes('/')) {
      // Path-level block: e.g. "instagram.com/reels"
      const slash = entry.indexOf('/');
      const entryDomain = entry.slice(0, slash);
      const entryPath = entry.slice(slash); // includes leading /
      const domainMatch = hostname === entryDomain || hostname.endsWith('.' + entryDomain);
      if (!domainMatch) return false;
      // Block this path and all sub-paths
      return pathname === entryPath || pathname.startsWith(entryPath + '/');
    }
    // Domain-level block: e.g. "instagram.com"
    return hostname === entry || hostname.endsWith('.' + entry);
  });
}

// Returns true if the given hostname is involved in ANY block entry.
function domainHasAnyBlockEntry(hostname, state) {
  return state.blockedDomains.some(entry => {
    const d = entry.includes('/') ? entry.slice(0, entry.indexOf('/')) : entry;
    return hostname === d || hostname.endsWith('.' + d);
  });
}

// ── Init ──────────────────────────────────────────────────────
(async function kyteInit() {
  let state;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    if (!response?.ok) return;
    state = response.state;
  } catch (_) {
    return; // Extension context invalidated or SW unavailable
  }

  if (!state.kyteEnabled || state.blockedDomains.length === 0) return;

  const currentUrl = window.location.href;
  const currentHostname = window.location.hostname.replace(/^www\./, '');

  // Is this domain involved in any block entry at all?
  if (!domainHasAnyBlockEntry(currentHostname, state)) return;

  // React to state changes (e.g., user adds an allowed URL from the popup)
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'local') return;
    if (changes.kyteEnabled || changes.allowedUrls || changes.blockedDomains) {
      window.location.reload();
    }
  });

  if (isUrlBlockedByState(currentUrl, state)) {
    // This specific URL is blocked — show the overlay
    injectBlockOverlay(state, currentHostname, currentUrl);
  } else {
    // Not blocked right now, but watch for SPA navigation to a blocked URL.
    // Also applies to domain-blocked sites where this URL is an allowed exception.
    applyFocusMode(currentHostname);
    watchSpaNavigation(state, currentHostname);
  }
})();

// ── SPA Navigation Watcher ────────────────────────────────────
// Four independent methods to detect navigation (including SPA pushState)
// and block it if the destination URL matches any block entry.
function watchSpaNavigation(state, hostname) {
  let lastUrl = window.location.href;
  let overlayInjected = false;

  const blockIfNeeded = (url) => {
    if (overlayInjected) return;
    if (isUrlBlockedByState(url, state)) {
      overlayInjected = true;
      injectBlockOverlay(state, hostname, url);
    }
  };

  const checkUrl = () => {
    if (overlayInjected) return;
    const newUrl = window.location.href;
    if (newUrl === lastUrl) return;
    lastUrl = newUrl;
    blockIfNeeded(newUrl);
  };

  // Method 1: Anchor click interceptor (capture phase, runs BEFORE site handlers)
  document.addEventListener('click', (e) => {
    if (overlayInjected) return;
    const anchor = e.target.closest('a');
    if (!anchor?.href) return;
    try {
      const dest = new URL(anchor.href, window.location.href);
      if (dest.origin !== window.location.origin) return;
      if (isUrlBlockedByState(dest.href, state)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        overlayInjected = true;
        injectBlockOverlay(state, hostname, dest.href);
      }
    } catch (_) {}
  }, true);

  // Method 2: MutationObserver — fires on DOM changes during SPA navigation
  const observer = new MutationObserver(checkUrl);
  const startObserver = () => {
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        observer.observe(document.body, { childList: true, subtree: true });
      }, { once: true });
    }
  };
  startObserver();

  // Method 3: popstate — catches back/forward button navigation
  window.addEventListener('popstate', checkUrl);

  // Method 4: Polling fallback
  const poller = setInterval(() => {
    if (overlayInjected) { clearInterval(poller); return; }
    checkUrl();
  }, 500);
}

// ── Focus Mode ────────────────────────────────────────────────
// Applied when a URL is in the allowlist. Hides distracting
// UI elements specific to known sites.
function applyFocusMode(hostname) {
  const selectors = getFocusModeSelectors(hostname);
  if (!selectors.length) return;

  const style = document.createElement('style');
  style.id = 'kyte-focus-style';
  style.textContent = selectors.map(s => `${s} { display: none !important; }`).join('\n');

  // Inject as early as possible
  const inject = () => {
    if (!document.head && !document.documentElement) return;
    (document.head || document.documentElement).appendChild(style);
  };

  if (document.head || document.documentElement) {
    inject();
  } else {
    document.addEventListener('DOMContentLoaded', inject, { once: true });
  }
}

function getFocusModeSelectors(hostname) {
  if (hostname.includes('youtube.com')) {
    return [
      // Sidebar recommendations
      'ytd-watch-next-secondary-results-renderer',
      // Home feed
      'ytd-rich-grid-renderer',
      // Shorts shelf
      'ytd-rich-shelf-renderer',
      // Comment section
      '#comments',
      // End screen cards
      '.ytp-ce-element',
      // Masthead search suggestions / trending
      'ytd-search-box',
      // Mini player
      'ytd-miniplayer',
      // Up next autoplay
      '#autoplay-checkbox',
      '.ytp-endscreen-content',
    ];
  }
  if (hostname.includes('reddit.com')) {
    return [
      // Right sidebar
      '.reddit-sidebar',
      '[data-testid="right-sidebar"]',
      // Trending / Popular
      '[data-testid="trending-searches-widget"]',
      // Community carousel
      '[data-testid="subreddit-carousel"]',
    ];
  }
  if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
    return [
      // What's happening sidebar
      '[aria-label="Timeline: Trending now"]',
      // Who to follow
      '[aria-label="Who to follow"]',
      // Explore suggestions
      '[data-testid="sidebarColumn"]',
    ];
  }
  return [];
}

// ── Block Overlay ─────────────────────────────────────────────
function injectBlockOverlay(state, hostname, currentUrl) {
  // Prevent body from flashing by covering it immediately
  const earlyStyle = document.createElement('style');
  earlyStyle.textContent = 'body { visibility: hidden !important; }';
  (document.head || document.documentElement || document).appendChild(earlyStyle);

  const overlay = document.createElement('div');
  overlay.id = 'kyte-block-overlay';

  // Detect if session is locked
  const isLocked = state.sessionLockedUntil > Date.now();
  const sessionEndTime = state.sessionEndTime;

  const htmlStr = buildOverlayHTML(hostname, currentUrl, isLocked, sessionEndTime);
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlStr, 'text/html');
  overlay.append(...doc.body.childNodes);

  const mount = () => {
    if (!document.documentElement) return;
    earlyStyle.textContent = ''; // Remove hidden style
    document.documentElement.appendChild(overlay);

    // ── Guard: re-attach overlay if YouTube's SPA removes it ──
    // YouTube's DOM rewriter can wipe out the entire <html> content
    // on navigation. We watch for our overlay being removed and
    // immediately re-inject it.
    const overlayGuard = new MutationObserver(() => {
      if (!document.getElementById('kyte-block-overlay')) {
        document.documentElement.appendChild(overlay);
      }
    });
    overlayGuard.observe(document.documentElement, { childList: true });

    // Attach event listeners
    const addUrlBtn = overlay.querySelector('#kyte-add-allow-btn');
    const urlInput = overlay.querySelector('#kyte-allow-input');

    if (addUrlBtn && urlInput) {
      addUrlBtn.addEventListener('click', async () => {
        const url = urlInput.value.trim() || currentUrl;
        try {
          new URL(url); // Validate
          await chrome.runtime.sendMessage({ type: 'ADD_ALLOWED_URL', payload: { url } });
          window.location.reload();
        } catch (_) {
          urlInput.classList.add('kyte-input-error');
          setTimeout(() => urlInput.classList.remove('kyte-input-error'), 1500);
        }
      });

      // Pre-fill with current URL
      urlInput.value = stripTrailingSlash(currentUrl);

      urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addUrlBtn.click();
      });
    }

    const goBackBtn = overlay.querySelector('#kyte-go-back');
    if (goBackBtn) {
      goBackBtn.addEventListener('click', () => {
        window.location.href = 'https://www.google.com';
      });
    }

    // Countdown timer
    if (sessionEndTime > 0) {
      startCountdown(overlay.querySelector('#kyte-timer'), sessionEndTime);
    }
  };

  if (document.documentElement) {
    mount();
  } else {
    const obs = new MutationObserver(() => {
      if (document.documentElement) {
        obs.disconnect();
        mount();
      }
    });
    obs.observe(document, { childList: true });
  }
}

function stripTrailingSlash(url) {
  try {
    const u = new URL(url);
    if (u.pathname === '/') return url.replace(/\/$/, '');
    return url;
  } catch (_) {
    return url;
  }
}

function buildOverlayHTML(hostname, currentUrl, isLocked, sessionEndTime) {
  const hasTimer = sessionEndTime > 0;
  const remaining = hasTimer ? Math.max(0, Math.ceil((sessionEndTime - Date.now()) / 60000)) : 0;

  return `
    <div id="kyte-overlay-inner">
      <div id="kyte-overlay-grid"></div>

      <div id="kyte-overlay-content">
        <div id="kyte-logo-mark">KYTE</div>

        <div id="kyte-status-chip">
          <span class="kyte-chip-dot"></span>
          <span>Session Active${isLocked ? ' · Locked' : ''}</span>
        </div>

        <h1 id="kyte-overlay-title">Stop negotiating<br>with yourself.</h1>
        <p id="kyte-overlay-sub">
          <strong>${hostname}</strong> is blocked.
          ${hasTimer ? `Session ends in <span id="kyte-timer">—</span>.` : ''}
        </p>

        ${isLocked ? '' : `
        <div id="kyte-allow-box">
          <div id="kyte-allow-box-header">
            <span class="kyte-mono-label">Allow this specific URL</span>
          </div>
          <div id="kyte-allow-input-row">
            <input
              id="kyte-allow-input"
              type="text"
              placeholder="Paste any URL on this domain…"
              spellcheck="false"
              autocomplete="off"
            />
            <button id="kyte-add-allow-btn">ALLOW THIS PAGE</button>
          </div>
          <p id="kyte-allow-hint">Everything else on ${hostname} stays blocked.</p>
        </div>
        `}

        <div id="kyte-go-back">← Go back</div>
      </div>
    </div>
  `;
}

function startCountdown(el, endTime) {
  if (!el) return;
  const tick = () => {
    const remaining = endTime - Date.now();
    if (remaining <= 0) {
      el.textContent = '0s';
      return;
    }
    const h = Math.floor(remaining / 3600000);
    const m = Math.floor((remaining % 3600000) / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    el.textContent = h > 0
      ? `${h}h ${m}m`
      : m > 0
      ? `${m}m ${s}s`
      : `${s}s`;
  };
  tick();
  setInterval(tick, 1000);
}
