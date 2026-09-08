import { getSettings, migrateSettings, missingAccess } from './lib/store.js';
import { reconcile, metrics, shouldBlock } from './lib/backlog.js';
import { canonicalize, matchesBlocklist, isHttp } from './lib/url.js';

const RECONCILE_ALARM = 'reconcile';
const ESCAPE_HATCH_MINUTES = 60;

let queue = Promise.resolve();
const serialize = (fn) => (queue = queue.then(fn, fn));

// A blocklist synced from another machine arrives without host permissions, so
// those sites are silently not blocked here. Badge the count so it's visible
// without having to open Settings.
async function refreshAccessBadge() {
  const { blocklist } = await getSettings();
  const missing = await missingAccess(blocklist);
  await chrome.action.setBadgeBackgroundColor({ color: '#b8420f' });
  await chrome.action.setBadgeText({ text: missing.length ? String(missing.length) : '' });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(RECONCILE_ALARM, { periodInMinutes: 5 });
  serialize(migrateSettings);
  serialize(reconcile);
  serialize(refreshAccessBadge);
});
chrome.runtime.onStartup.addListener(() => {
  serialize(migrateSettings);
  serialize(reconcile);
  serialize(refreshAccessBadge);
});

// Fires when settings land from another machine, which is the whole point.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.settings) serialize(refreshAccessBadge);
});
chrome.permissions.onAdded.addListener(() => serialize(refreshAccessBadge));
chrome.permissions.onRemoved.addListener(() => serialize(refreshAccessBadge));
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === RECONCILE_ALARM) serialize(reconcile);
});

for (const event of ['onEntryAdded', 'onEntryUpdated', 'onEntryRemoved']) {
  chrome.readingList[event].addListener(() => serialize(reconcile));
}

async function guard(tabId, url) {
  if (!isHttp(url)) return;

  const settings = await getSettings();
  const domain = matchesBlocklist(url, settings.blocklist);
  if (!domain) return;

  const now = Date.now();
  if (now < (settings.pausedUntil ?? 0)) return;

  const st = await chrome.storage.local.get(['snoozes', 'allowances', 'snapshot']);
  const snoozes = st.snoozes ?? {};
  const allowances = st.allowances ?? {};
  const snapshot = st.snapshot ?? {};

  if ((snoozes[domain] ?? 0) > now) return;

  const canon = canonicalize(url);
  if ((allowances[canon] ?? 0) > now) return;

  // Escape hatch: the thing you saved is allowed even when its host is blocked,
  // but only that exact URL — autoplaying to the next video still gets caught.
  const isSavedUnread = Object.entries(snapshot).some(
    ([entryUrl, entry]) => !entry.hasBeenRead && canonicalize(entryUrl) === canon,
  );
  if (isSavedUnread) {
    allowances[canon] = now + ESCAPE_HATCH_MINUTES * 60_000;
    await chrome.storage.local.set({ allowances });
    return;
  }

  const verdict = shouldBlock(await metrics(settings), settings);
  if (!verdict) return;

  const target =
    chrome.runtime.getURL('src/blocked.html') +
    '?' +
    new URLSearchParams({ url, domain, reason: verdict.reason });
  chrome.tabs.update(tabId, { url: target }).catch(() => {});
}

chrome.webNavigation.onBeforeNavigate.addListener((d) => {
  if (d.frameId === 0) guard(d.tabId, d.url);
});

// Blocked sites are mostly SPAs; clicking through to the next video or post
// never issues a top-level request, so onBeforeNavigate alone would miss it.
chrome.webNavigation.onHistoryStateUpdated.addListener((d) => {
  if (d.frameId === 0) guard(d.tabId, d.url);
});
