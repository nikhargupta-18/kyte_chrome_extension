// ============================================================
// KYTE — Popup Script
// ============================================================

const $ = id => document.getElementById(id);

// ── State ──────────────────────────────────────────────────

let state = {
  kyteEnabled: false,
  sessionActive: false,
  sessionLockedUntil: 0,
  sessionEndTime: 0,
  blockedDomains: [],
  allowedUrls: [],
  isPremium: false,
};

let selectedDurationMinutes = 60; // Default chip
let lockEnabled = false;
let timerInterval = null;

// ── Boot ───────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await loadState();
  bindEvents();
  renderAll();
  startTimerTick();
  refreshPremiumUi();
});

async function loadState() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  if (response?.ok) state = response.state;
  applyPremiumState();
}

// ── Premium State ──────────────────────────────────────────

const LOCK_ICON_SVG = `<svg id="lock-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;

const CROWN_ICON_SVG = `<svg id="lock-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8l4 4 6-7 6 7 4-4v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8z"></path></svg>`;

function applyPremiumState() {
  const row = $('lock-row');
  const iconContainer = $('lock-icon-container');
  if (!row || !iconContainer) return;

  if (state.isPremium) {
    row.classList.remove('is-free');
    iconContainer.innerHTML = LOCK_ICON_SVG;
  } else {
    row.classList.add('is-free');
    iconContainer.innerHTML = CROWN_ICON_SVG;
  }
  $('premium-status').textContent = state.isPremium
    ? `Unlocked${state.premiumAccount ? ` · ${state.premiumAccount}` : ''}`
    : state.premiumAuthError || (state.premiumAuthPending
      ? 'Continue in the open Kyte tab'
      : state.premiumAccount ? 'Sign in to restore or purchase' : 'One-time purchase');
  $('premium-connect-btn').textContent = state.isPremium ? 'Refresh' : 'Unlock / Restore';
}

async function refreshPremiumUi() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_ENTITLEMENT' });
  if (response?.ok) {
    await loadState();
    if (response.offline && !response.purchased) {
      $('premium-status').textContent = 'Connect to verify Locked In Mode';
    }
  }
}

async function connectPremiumUi() {
  const button = $('premium-connect-btn');
  if (!state.isPremium) {
    const { premiumDataConsent } = await chrome.storage.local.get('premiumDataConsent');
    if (!premiumDataConsent) {
      const accepted = window.confirm(
        'Locked In Mode uses your Google account email and Polar purchase status to unlock the feature across devices. Kyte stores a device sign-in token and checks purchase status with getkyte.online. Continue?'
      );
      if (!accepted) return;
      await chrome.storage.local.set({ premiumDataConsent: true });
    }
  }
  button.disabled = true;
  $('premium-status').textContent = state.isPremium ? 'Checking purchase…' : 'Continue on the website…';
  try {
    const response = await chrome.runtime.sendMessage({
      type: state.isPremium ? 'REFRESH_ENTITLEMENT' : 'CONNECT_PREMIUM',
    });
    if (!response?.ok) throw new Error(response?.reason || 'Connection failed');
    await loadState();
    if (response.pending) $('premium-status').textContent = 'Continue in the open Kyte tab';
    else if (!response.purchased) $('premium-status').textContent = 'Payment pending. Reopen Kyte to check.';
  } catch (_) {
    $('premium-status').textContent = 'Could not connect. Try again.';
  } finally {
    button.disabled = false;
  }
}

// ── Event Binding ──────────────────────────────────────────

function bindEvents() {
  // Master toggle
  $('kyte-master-toggle').addEventListener('click', async () => {
    if (state.sessionActive && state.sessionLockedUntil > Date.now()) {
      flashLocked();
      return;
    }
    const newEnabled = !state.kyteEnabled;
    const response = await chrome.runtime.sendMessage({ type: 'SET_ENABLED', payload: { enabled: newEnabled } });
    if (!response?.ok) {
      if (response?.reason === 'locked') flashLocked();
      return;
    }
    state.kyteEnabled = newEnabled;
    renderHeader();
  });

  // Add domain
  $('add-domain-btn').addEventListener('click', () => addDomain());
  $('domain-input').addEventListener('keydown', e => { if (e.key === 'Enter') addDomain(); });

  // Add URL
  $('add-url-btn').addEventListener('click', () => addAllowedUrl());
  $('url-input').addEventListener('keydown', e => { if (e.key === 'Enter') addAllowedUrl(); });

  // "This tab" button — block current tab's domain
  $('add-domain-current-btn').addEventListener('click', async () => {
    const response = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_TAB_URL' });
    if (response?.ok && response.url) {
      try {
        const hostname = new URL(response.url).hostname;
        $('domain-input').value = hostname;
        $('domain-input').focus();
      } catch (_) {
        $('domain-input').value = response.url;
        $('domain-input').focus();
      }
    }
  });

  // Duration chips
  document.querySelectorAll('.duration-chip').forEach(chip => {
    if (chip.tagName === 'BUTTON') {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.duration-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        selectedDurationMinutes = parseInt(chip.dataset.minutes, 10);
        const customInput = $('custom-duration');
        if (customInput) customInput.value = '';
        renderSessionSection();
      });
    }
  });

  const customInput = $('custom-duration');
  if (customInput) {
    const handleCustomInput = () => {
      document.querySelectorAll('.duration-chip').forEach(c => c.classList.remove('active'));
      customInput.closest('.duration-chip')?.classList.add('active');
      const val = parseInt(customInput.value, 10);
      selectedDurationMinutes = !isNaN(val) && val > 0 ? val : 0;
      renderSessionSection();
    };
    customInput.addEventListener('focus', handleCustomInput);
    customInput.addEventListener('input', handleCustomInput);
  }

  // Lock toggle
  $('lock-toggle').addEventListener('click', () => {
    if (!state.isPremium) {
      connectPremiumUi();
      return;
    }
    lockEnabled = !lockEnabled;
    $('lock-toggle').setAttribute('aria-checked', String(lockEnabled));
  });
  $('premium-connect-btn').addEventListener('click', connectPremiumUi);

  // Start session
  $('start-session-btn').addEventListener('click', startSession);

  // Visit site
  $('kyte-visit-btn').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'https://getkyte.online' });
  });

  // End session
  $('kyte-end-session-btn').addEventListener('click', async () => {
    const response = await chrome.runtime.sendMessage({ type: 'END_SESSION' });
    if (response?.ok) {
      state.sessionActive = false;
      state.sessionEndTime = 0;
      state.sessionLockedUntil = 0;
      state.kyteEnabled = false;
      renderAll();
    } else if (response?.reason === 'locked') {
      flashLocked();
    }
  });
}

// ── Actions ────────────────────────────────────────────────

async function addDomain() {
  const input = $('domain-input');
  const raw = input.value.trim();
  if (!raw) return;

  const response = await chrome.runtime.sendMessage({
    type: 'ADD_DOMAIN',
    payload: { domain: raw },
  });

  if (response?.ok) {
    // Re-fetch state so cleaned domain name is reflected
    await loadState();
    input.value = '';
    renderBlockedList();
  } else {
    input.classList.add('error');
    setTimeout(() => input.classList.remove('error'), 1200);
  }
}

async function addAllowedUrl() {
  const input = $('url-input');
  const url = input.value.trim();
  if (!url) return;

  try {
    new URL(url.startsWith('http') ? url : 'https://' + url);
  } catch (_) {
    input.classList.add('error');
    setTimeout(() => input.classList.remove('error'), 1200);
    return;
  }

  const finalUrl = url.startsWith('http') ? url : 'https://' + url;

  const response = await chrome.runtime.sendMessage({
    type: 'ADD_ALLOWED_URL',
    payload: { url: finalUrl },
  });

  if (response?.ok) {
    await loadState();
    input.value = '';
    renderAllowedList();
  }
}

async function removeDomain(domain) {
  if (state.sessionActive && state.sessionLockedUntil > Date.now()) {
    flashLocked();
    return;
  }
  await chrome.runtime.sendMessage({ type: 'REMOVE_DOMAIN', payload: { domain } });
  await loadState();
  renderBlockedList();
  renderAllowedList(); // Allowed URLs for this domain also removed
}

async function removeAllowedUrl(url) {
  if (state.sessionActive && state.sessionLockedUntil > Date.now()) {
    flashLocked();
    return;
  }
  await chrome.runtime.sendMessage({ type: 'REMOVE_ALLOWED_URL', payload: { url } });
  await loadState();
  renderAllowedList();
}

async function startSession() {
  if (state.sessionActive) return;

  const response = await chrome.runtime.sendMessage({
    type: 'START_SESSION',
    payload: {
      durationMinutes: selectedDurationMinutes,
      locked: lockEnabled,
      lockedMinutes: selectedDurationMinutes,
    },
  });

  if (response?.ok) {
    await loadState();
    renderAll();
  } else if (response?.reason === 'premium_required') {
    lockEnabled = false;
    $('lock-toggle').setAttribute('aria-checked', 'false');
    await loadState();
    connectPremiumUi();
  } else {
    $('premium-status').textContent = 'Could not start session. Try again.';
  }
}

// ── Render ──────────────────────────────────────────────────

function renderAll() {
  renderHeader();
  renderSessionBanner();
  renderBlockedList();
  renderAllowedList();
  renderSessionSection();
}

function renderHeader() {
  const toggle = $('kyte-master-toggle');
  const label = $('kyte-master-label');
  toggle.setAttribute('aria-checked', String(state.kyteEnabled));
  label.textContent = state.kyteEnabled ? 'On' : 'Off';
  label.style.color = state.kyteEnabled ? 'var(--ink)' : '';
}

function renderSessionBanner() {
  const banner = $('kyte-session-banner');
  const label = $('kyte-session-label');

  if (!state.sessionActive) {
    banner.classList.add('hidden');
    return;
  }

  banner.classList.remove('hidden');
  const isLocked = state.sessionLockedUntil > Date.now();
  label.textContent = isLocked ? 'Session active · Locked' : 'Session active';
}

function renderBlockedList() {
  const list = $('blocked-list');
  const empty = $('blocked-empty');
  const count = $('blocked-count');

  list.textContent = '';
  count.textContent = state.blockedDomains.length;

  if (state.blockedDomains.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  state.blockedDomains.forEach(entry => {
    const isPathBlock = entry.includes('/');
    const li = document.createElement('li');
    
    const span = document.createElement('span');
    span.className = 'item-domain';
    span.textContent = entry;
    li.appendChild(span);
    
    if (isPathBlock) {
      const badge = document.createElement('span');
      badge.className = 'item-path-badge';
      badge.textContent = 'PATH';
      li.appendChild(badge);
    }
    
    const btn = document.createElement('button');
    btn.className = 'item-remove';
    btn.title = 'Remove';
    btn.textContent = '×';
    li.appendChild(btn);
    
    btn.addEventListener('click', () => removeDomain(entry));
    list.appendChild(li);
  });
}

function renderAllowedList() {
  const list = $('allowed-list');
  const empty = $('allowed-empty');
  const count = $('allowed-count');

  list.textContent = '';
  count.textContent = state.allowedUrls.length;

  if (state.allowedUrls.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  state.allowedUrls.forEach(url => {
    const li = document.createElement('li');
    
    const span = document.createElement('span');
    span.className = 'item-url';
    span.title = url;
    span.textContent = formatUrl(url);
    li.appendChild(span);
    
    const btn = document.createElement('button');
    btn.className = 'item-remove';
    btn.title = 'Remove';
    btn.textContent = '×';
    li.appendChild(btn);
    
    btn.addEventListener('click', () => removeAllowedUrl(url));
    list.appendChild(li);
  });
}

function renderSessionSection() {
  const section = $('session-section');
  const btn = $('start-session-btn');
  const stateTitle = $('kyte-current-state');
  const target = $('kyte-target-minutes');
  if (stateTitle) {
    stateTitle.textContent = state.sessionActive ? 'Focus Active' : 'Ready to Focus';
  }
  if (target) {
    target.textContent = formatDurationTarget(selectedDurationMinutes);
  }
  if (state.sessionActive) {
    section.classList.add('session-active');
    btn.textContent = 'Session Running...';
    btn.disabled = true;
  } else {
    section.classList.remove('session-active');
    btn.textContent = 'Begin Focus Session';
    btn.disabled = selectedDurationMinutes <= 0;
  }
}

// ── Timer ──────────────────────────────────────────────────

function startTimerTick() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(tickTimer, 1000);
  tickTimer();
}

function tickTimer() {
  const el = $('kyte-session-timer');
  if (!state.sessionActive || !state.sessionEndTime) {
    if (el) el.textContent = '—';
    return;
  }

  const remaining = state.sessionEndTime - Date.now();
  if (remaining <= 0) {
    el.textContent = '0s';
    return;
  }

  const h = Math.floor(remaining / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  el.textContent = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ── Helpers ────────────────────────────────────────────────

function flashLocked() {
  const banner = $('kyte-session-banner');
  banner.style.transition = 'background 0.1s';
  banner.style.background = 'rgba(248,113,113,0.12)';
  setTimeout(() => { banner.style.background = ''; }, 600);
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace('www.', '') + u.pathname + u.search;
  } catch (_) {
    return url;
  }
}

function formatDurationTarget(minutes) {
  if (!minutes || minutes <= 0) return 'SET MIN';
  if (minutes < 60) return `${minutes} MIN`;
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? 'HR' : 'HRS'}`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}H ${mins}M`;
}
