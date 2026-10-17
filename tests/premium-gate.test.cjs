const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const { webcrypto } = require('node:crypto');
const vm = require('node:vm');

const source = readFileSync(new URL('../service-worker.js', `file://${__filename}`), 'utf8');

function worker(initial = {}, fetchImpl = async () => { throw new Error('offline'); }, identityImpl = {}) {
  const storage = { ...initial };
  let listener;
  let tabUpdatedListener;
  let tabRemovedListener;
  const tabUpdates = [];
  const removedTabs = [];
  const chrome = {
    storage: { local: {
      get: async (keys) => Object.fromEntries(keys.filter((key) => key in storage).map((key) => [key, storage[key]])),
      set: async (values) => Object.assign(storage, values),
      remove: async (key) => { delete storage[key]; },
    } },
    runtime: { onMessage: { addListener: (fn) => { listener = fn; } }, getURL: () => 'chrome-extension://test/blocked.html' },
    alarms: { onAlarm: { addListener() {} }, clear: async () => {}, create: async () => {} },
    declarativeNetRequest: { getDynamicRules: async () => [], updateDynamicRules: async () => {} },
    tabs: {
      query: async () => [],
      create: async () => ({ id: 17 }),
      update: async (id, values) => { tabUpdates.push({ id, ...values }); return { id, ...values }; },
      remove: async (id) => { removedTabs.push(id); if (tabRemovedListener) tabRemovedListener(id); },
      onUpdated: { addListener: (fn) => { tabUpdatedListener = fn; } },
      onRemoved: { addListener: (fn) => { tabRemovedListener = fn; } },
    },
    identity: identityImpl,
  };
  chrome.runtime.onStartup = { addListener() {} };
  chrome.runtime.onInstalled = { addListener() {} };
  vm.runInNewContext(source, { chrome, fetch: fetchImpl, URL, Date, console, crypto: webcrypto,
    btoa, TextEncoder }, { filename: 'service-worker.js' });
  return {
    storage,
    tabUpdates,
    removedTabs,
    updateTab: (id, url) => tabUpdatedListener(id, { url }),
    message: (type, payload = {}) => new Promise((resolve) => listener({ type, payload }, {}, resolve)),
  };
}

test('unpaid user cannot start a locked session', async () => {
  const app = worker();
  assert.equal((await app.message('START_SESSION', { durationMinutes: 25, locked: true })).reason, 'premium_required');
  assert.equal(app.storage.sessionActive, undefined);
});

test('verified purchase works offline within seven days', async () => {
  const app = worker({ premiumToken: 'device-token', premiumPurchased: true,
    premiumCheckedAt: Date.now() - 6 * 86400_000 });
  assert.equal((await app.message('START_SESSION', { durationMinutes: 25, locked: true })).ok, true);
  assert.ok(app.storage.sessionLockedUntil > Date.now());
  assert.equal((await app.message('SET_ENABLED', { enabled: false })).reason, 'locked');
});

test('expired offline cache cannot start a locked session', async () => {
  const app = worker({ premiumToken: 'device-token', premiumPurchased: true,
    premiumCheckedAt: Date.now() - 8 * 86400_000 });
  assert.equal((await app.message('START_SESSION', { durationMinutes: 25, locked: true })).reason, 'premium_required');
});

test('stored legacy isPremium flag cannot unlock paid mode', async () => {
  const app = worker({ isPremium: true });
  const response = await app.message('GET_STATE');
  assert.equal(response.state.isPremium, false);
  assert.equal((await app.message('START_SESSION', { durationMinutes: 25, locked: true })).reason, 'premium_required');
});

test('server-confirmed purchase is cached and unlocks a session', async () => {
  let calls = 0;
  const app = worker({ premiumToken: 'device-token' }, async () => {
    calls++;
    return { ok: true, status: 200, json: async () => ({ purchased: true, account: 'buyer@example.com' }) };
  });
  assert.equal((await app.message('GET_ENTITLEMENT')).purchased, true);
  assert.equal((await app.message('START_SESSION', { durationMinutes: 25, locked: true })).ok, true);
  assert.equal(calls, 1);
});

test('revoked device session clears the paid cache', async () => {
  const app = worker({ premiumToken: 'device-token', premiumPurchased: true,
    premiumCheckedAt: Date.now() - 86400_000 }, async () => ({ status: 401 }));
  assert.equal((await app.message('REFRESH_ENTITLEMENT')).purchased, false);
  assert.equal(app.storage.premiumToken, '');
  assert.equal((await app.message('START_SESSION', { durationMinutes: 25, locked: true })).reason, 'premium_required');
});

test('regular-tab authorization code is exchanged with its verifier', async () => {
  let challenge;
  let exchanged = false;
  const redirect = 'https://extension-id.chromiumapp.org/';
  const app = worker({}, async (url, options) => {
    if (url.endsWith('/exchange')) {
      const body = JSON.parse(options.body);
      const digest = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(body.verifier));
      assert.equal(Buffer.from(digest).toString('base64url'), challenge);
      assert.equal(body.code, 'website-code');
      exchanged = true;
      return { ok: true, json: async () => ({ token: 'device-token' }) };
    }
    return { ok: true, json: async () => ({ purchased: true, account: 'buyer@example.com' }) };
  }, {
    getRedirectURL: () => redirect,
  });
  assert.equal((await app.message('CONNECT_PREMIUM')).pending, true);
  const start = new URL(app.tabUpdates[0].url);
  assert.equal(start.searchParams.get('redirect_uri'), redirect);
  challenge = start.searchParams.get('challenge');
  app.updateTab(17, `${redirect}?code=website-code&state=${start.searchParams.get('state')}`);
  for (let i = 0; i < 20 && !exchanged; i++) await new Promise((resolve) => setTimeout(resolve, 1));
  assert.equal(exchanged, true);
  assert.equal(app.storage.premiumToken, 'device-token');
  assert.deepEqual(app.removedTabs, [17]);
});

test('tab callback with wrong state cannot create a device session', async () => {
  let exchangeCalled = false;
  const app = worker({}, async () => { exchangeCalled = true; throw new Error('unexpected fetch'); }, {
    getRedirectURL: () => 'https://extension-id.chromiumapp.org/',
  });
  assert.equal((await app.message('CONNECT_PREMIUM')).pending, true);
  app.updateTab(17, 'https://extension-id.chromiumapp.org/?code=website-code&state=wrong-state');
  for (let i = 0; i < 20 && !app.storage.premiumAuthError; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  assert.equal(exchangeCalled, false);
  assert.equal(app.storage.premiumToken, undefined);
  assert.equal(app.storage.premiumPendingAuth, undefined);
  assert.ok(app.storage.premiumAuthError);
});
