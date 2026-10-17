# Firefox Add-ons (AMO) Listing — Kyte

> Last Updated: 2026-10-16

---

## AMO Listing

**Add-on Name**
Kyte

**Summary** (max 250 chars — shown in search results)
Block websites by domain or specific URL path. Unlock one exception per blocked site. Run timed focus sessions with an optional lock mode that prevents early deactivation.

**Description**
Kyte is a focused website blocker that works at the URL level — not just the domain level.

Block entire domains or specific paths:
Add instagram.com to block all of Instagram. Add instagram.com/reels to block only the Reels feed while keeping the rest of Instagram accessible.

Allow one exception per blocked domain:
If youtube.com is blocked but you need to watch a specific tutorial, paste the exact URL into the Allowed URLs list. Only that URL stays accessible.

Run timed focus sessions:
Choose a duration (25m, 45m, 1h, 2h, or custom) and start a session. Locked In Mode is a separate one-time purchase that prevents early deactivation.

Privacy:
Blocklists and session details stay on your device. Optional Locked In Mode uses Google sign-in, Polar checkout, and a purchase check on getkyte.online.

**Category**
Productivity

---

## Compatibility

**Minimum Firefox Version**: 128.0
Reason: Firefox 128 (released June 2024) added full support for `declarativeNetRequest` dynamic rules with `regexFilter` and `regexSubstitution`, which Kyte uses to redirect blocked pages to the custom block overlay.

**Manifest**: V3 with `browser_specific_settings.gecko` configured.

---

## Graphics & Assets

| Asset | Dimensions | Status | Notes |
|-------|-----------|--------|-------|
| Add-on Icon | 128×128 PNG | ✅ Ready | `icons/icon-128.png` — same as Chrome |
| Screenshot 1 | 1280×800 | ⬜ Not created | Same screenshots as Chrome work |
| Screenshot 2 | 1280×800 | ⬜ Not created | |

---

## Permissions Justification (AMO form)

| Permission | Justification |
|------------|---------------|
| `storage` | Stores blocking settings locally; paid mode also stores a device sign-in token and cached purchase status. |
| `tabs` | Reads the URL of the currently active tab when the user clicks "Use current tab URL" in the popup, so the exact page URL can be pre-filled. |
| `declarativeNetRequest` | Registers dynamic redirect rules that intercept navigation to blocked domains and URL paths, redirecting to the extension's custom block page before the blocked site loads. |
| `alarms` | Schedules the automatic end of a focus session. When a timed session is started, an alarm is set for the chosen duration. |
| `identity` | Opens the Kyte website sign-in and Polar checkout flow and returns an authorization code to the extension. |
| `<all_urls>` (host_permissions) | The content script must run on every page to detect SPA navigation (where the URL changes without a full page reload, bypassing declarativeNetRequest) on blocked domains. The set of blocked sites is entirely user-defined at runtime. |

---

## Privacy & Data Use

Same as Chrome: blocklists stay local; paid mode sends account entitlement requests to getkyte.online. Google, Polar, and Supabase process sign-in, payment, and purchase status.

**Privacy Policy URL**: *(same URL as Chrome listing)*

---

## Submission Notes

- The `browser_specific_settings.gecko.id` is set to `kyte@kyte-extension`. Update this to match your AMO developer account if different.
- AMO review may ask about `<all_urls>` host permission. Justification: user-defined block list makes specific host_permissions impossible to predict.
- AMO does NOT support Chrome's `declarativeNetRequestWithHostAccess` — this permission has been removed from the manifest.

---

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 2.0.0 | 2026-07-07 | Initial AMO submission. Domain + path-level blocking, timed sessions with lock mode, redirect-based block overlay (Firefox 128+ required for DNR regexSubstitution). | Draft |
