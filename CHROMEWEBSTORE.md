# Chrome Web Store Listing — Kyte

> Last Updated: 2026-10-16

---

## Store Listing

**Extension Name**
Kyte

**Short Description** (max 132 chars)
Block websites by domain or specific URL path. Allow one exception. Run timed focus sessions with an optional lock mode.

**Detailed Description**
Kyte is a focused website blocker that works at the URL level — not just the domain level.

Block entire domains or specific paths:
Add instagram.com to block all of Instagram. Add instagram.com/reels to block only the Reels feed while keeping the rest of Instagram accessible. Add both entries to combine them.

Allow one exception per blocked domain:
If youtube.com is blocked but you need to watch a specific tutorial, paste the exact URL into the Allowed URLs list. Only that URL stays accessible — everything else on YouTube stays blocked.

Run timed focus sessions:
Choose a duration (25m, 45m, 1h, 2h, or custom) and start a session. Blocking activates automatically. When the session ends, blocking turns off on its own. Locked In Mode is a separate one-time purchase that prevents early deactivation.

How to use:
1. Click the Kyte icon in your Chrome toolbar.
2. Add domains or URL paths to the Blocked list.
3. Optionally add specific URLs to the Allowed list to create exceptions.
4. Use the on/off toggle for manual blocking, or set a Session for timed focus.

Privacy:
Blocked sites, allowed URLs, and session state stay on your device. Optional Locked In Mode uses Google sign-in, a Polar purchase, and a Kyte server check for access across devices. We do not upload your blocklist or browsing history.

For support or feedback, open an issue on GitHub.

**Category**
Productivity

**Single Purpose**
Block websites by domain or URL path, with optional timed sessions and a lock mode that prevents early deactivation.

**Primary Language**
English

---

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon | 128×128 PNG | ✅ Ready | `icons/icon-128.png` |
| Screenshot 1 | 1280×800 or 640×400 | ⬜ Not created | — |
| Screenshot 2 | 1280×800 or 640×400 | ⬜ Not created | — |
| Screenshot 3 | 1280×800 or 640×400 | ⬜ Not created | — |
| Small Promo Tile | 440×280 | ⬜ Not created | — |
| Marquee Promo Tile | 1400×560 | ⬜ Not created | — |

### Screenshot Notes
1. **Popup — Blocked list**: Show the popup with 2-3 domains added, including one PATH-level entry (e.g. `instagram.com/reels` with the PATH badge).
2. **Popup — Session running**: Show the session banner at the top with a live countdown timer and the "Locked" state active.
3. **Block overlay**: Show the full-screen block overlay on YouTube or Instagram, with the "Allow this specific URL" box visible.

> ⚠️ Screenshots are still needed before submission. Take them with the extension loaded in Chrome.

---

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | Stores blocking settings and session state locally; for Locked In Mode it also stores a device sign-in token and cached purchase status. |
| `tabs` | permissions | Reads the URL of the currently active tab when the user clicks "This tab" in the Allowed URLs section, so the exact current page URL can be pre-filled. |
| `declarativeNetRequest` | permissions | Registers dynamic blocking rules that prevent navigation to blocked domains and URL paths at the network level, before the page loads. |
| `declarativeNetRequestWithHostAccess` | permissions | Required alongside `declarativeNetRequest` to apply dynamic rules to all URLs (not just a predefined static ruleset). Needed because the user's block list is built at runtime. |
| `alarms` | permissions | Schedules the end of a focus session. When a timed session is started, an alarm is set for the chosen duration. When it fires, blocking is automatically deactivated. Uses `chrome.alarms` instead of `setTimeout` because service workers are ephemeral. |
| `identity` | permissions | Opens the Kyte website sign-in and Polar checkout flow, then returns an authorization code to the extension. |
| `*://*/*` | host_permissions | The content script must run on every page to detect whether that page's domain or URL path is in the user's block list and inject the block overlay if so. The set of blocked sites is entirely user-defined and cannot be predicted in advance, requiring broad host access. |

---

## Privacy & Data Use

**Does the extension collect user data?** Locked In Mode uses the signed-in account email and purchase status.

Blocklists and session details remain in `chrome.storage.local`. For Locked In Mode, the extension contacts getkyte.online to check account entitlement; Google handles sign-in, Polar handles checkout, and Supabase stores the account purchase record.

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|------------------------|---------|---------------------------|
| Personally identifiable info | Yes, for paid mode | Yes | Account email identifies the purchase across devices | Google, Polar, Supabase as needed |
| Web history | No | No | — | No |
| Website content | No | No | — | No |
| User activity | No | No | — | No |
| Purchase status | Yes, for paid mode | Yes | Verify access to Locked In Mode | Polar and Supabase |

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

---

## Privacy Policy

**Privacy Policy URL**
https://getkyte.online/privacy

### Privacy Policy Text (to be hosted publicly)

```
Privacy Policy for Kyte — Chrome Extension
Last updated: 2026-07-05

Kyte keeps blocklists and session details on your device. Optional Locked In Mode uses your account email and purchase status to unlock the feature across devices.

Data Storage
Blocked domains, allowed URL exceptions, and session state are stored locally using chrome.storage.local. For Locked In Mode, a device sign-in token and seven-day purchase cache are also stored locally. Your blocklist and browsing history are not uploaded.

Data the extension stores locally:
- The list of blocked domains and URL paths you add
- The list of allowed URL exceptions you add
- Session state (duration, start time, lock status)

Network Requests
For Locked In Mode, the extension contacts getkyte.online to check the signed-in account's purchase. Google handles sign-in, Polar handles payment, and Supabase stores the purchase record. See https://getkyte.online/privacy.

Removal
Uninstalling the extension removes all locally stored data.

Contact
For questions about this policy, open an issue on the project's GitHub repository.
```

---

## Distribution

**Visibility**: Public
**Regions**: All regions
**Pricing**: Free core features; optional one-time purchase for Locked In Mode

---

## Developer Info

**Publisher Name**
> ⚠️ Fill in your name or organisation name.

**Contact Email**
> ⚠️ Fill in a monitored email address. This is shown publicly on the store listing.

**Support URL / Email**
> ⚠️ Recommended: link to a GitHub Issues page or support email.

**Homepage URL**
> ⚠️ Optional but recommended.

---

## Pre-Submit Checklist

### Code & Manifest
- [x] Manifest V3
- [x] All icon files exist at correct paths (`icons/icon-16.png`, `icons/icon-48.png`, `icons/icon-128.png`)
- [x] No eval(), no inline scripts, no remote code
- [x] All permissions justified above
- [x] Service worker stores all state in `chrome.storage` — no global variables
- [x] `return true` in `onMessage` listener for async responses
- [x] `tabs` permission declared (used to read current tab URL)

### Store Listing
- [x] Extension name ≤ 75 characters
- [x] Short description ≤ 132 characters
- [x] Detailed description is specific and function-first (no vague marketing language)
- [x] Single purpose is narrow and clear
- [ ] At least 1 screenshot at 1280×800 or 640×400 **← STILL NEEDED**
- [ ] Privacy policy URL is live and accessible **← STILL NEEDED**
- [ ] Publisher name and contact email filled in **← STILL NEEDED**

### Known Issues / Limitations
- The SPA navigation watcher relies on DOM MutationObserver + polling (500ms) as a fallback. On very fast computers this means up to a 500ms window where a user could theoretically navigate to a blocked path before the overlay fires. This is an inherent limitation of content-script-based blocking of SPA navigation.
- `host_permissions: ["*://*/*"]` is broad. It is required because blocked sites are user-defined at runtime. Be prepared to justify this during review if asked.

---

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 2.0.0 | 2026-07-05 | Initial store submission. Domain + path-level blocking, timed sessions with lock mode, SPA navigation interception, allow-list exceptions, block overlay with in-page allow button. | Draft |
