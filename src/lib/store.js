import { toMatchPattern, hostOf, hostMatchesDomain } from './url.js';

export const DEFAULTS = {
  enabled: true,
  blocklist: [],
  windowDays: 7,
  netGrowthLimit: 3,
  maxUnread: 0,
  delaySeconds: 15,
  snoozeMinutes: 30,
  pausedUntil: 0,
};

// Settings live in sync storage so a second machine picks them up from the
// signed-in Google account. pausedUntil deliberately does not: pausing the
// laptop in front of you shouldn't unblock the one at home.
export async function getSettings() {
  const [synced, local] = await Promise.all([
    chrome.storage.sync.get('settings'),
    chrome.storage.local.get(['settings', 'pausedUntil']),
  ]);
  const stored = synced.settings ?? local.settings ?? {};
  return { ...DEFAULTS, ...stored, pausedUntil: local.pausedUntil ?? 0 };
}

export async function setSettings(patch) {
  const { pausedUntil, ...synced } = { ...(await getSettings()), ...patch };
  await Promise.all([
    chrome.storage.sync.set({ settings: synced }),
    chrome.storage.local.set({ pausedUntil }),
  ]);
  return { ...synced, pausedUntil };
}

export async function migrateSettings() {
  const [synced, local] = await Promise.all([
    chrome.storage.sync.get('settings'),
    chrome.storage.local.get('settings'),
  ]);
  if (synced.settings || !local.settings) return false;

  const { pausedUntil = 0, ...rest } = local.settings;
  await chrome.storage.sync.set({ settings: rest });
  await chrome.storage.local.set({ pausedUntil });
  await chrome.storage.local.remove('settings');
  return true;
}

// Host permissions are per-profile and can't sync, so a blocklist that arrived
// from another machine is inert until each site is granted access here.
export async function missingAccess(blocklist) {
  const checked = await Promise.all(
    blocklist.map(async (domain) =>
      (await chrome.permissions.contains({ origins: [toMatchPattern(domain)] })) ? null : domain,
    ),
  );
  return checked.filter(Boolean);
}

// Why a given blocked site is currently reachable. Snoozes and per-URL
// allowances expire quietly, so they need somewhere to be visible.
export async function siteStates(blocklist) {
  const now = Date.now();
  const { snoozes = {}, allowances = {} } = await chrome.storage.local.get(['snoozes', 'allowances']);
  const missing = await missingAccess(blocklist);
  const live = Object.entries(allowances).filter(([, expiry]) => expiry > now);

  return blocklist.map((domain) => ({
    domain,
    needsAccess: missing.includes(domain),
    snoozedUntil: (snoozes[domain] ?? 0) > now ? snoozes[domain] : 0,
    allowedLinks: live
      .filter(([url]) => hostMatchesDomain(hostOf(url), domain))
      .map(([url, until]) => ({ url, until })),
  }));
}

// Snoozes stay local — "I'm at this machine right now" isn't a synced fact.
export async function snooze(domain, minutes) {
  const { snoozes = {} } = await chrome.storage.local.get('snoozes');
  snoozes[domain] = Date.now() + minutes * 60_000;
  await chrome.storage.local.set({ snoozes });
}

export async function unsnooze(domain) {
  const { snoozes = {}, allowances = {} } = await chrome.storage.local.get(['snoozes', 'allowances']);
  delete snoozes[domain];
  for (const url of Object.keys(allowances)) {
    if (hostMatchesDomain(hostOf(url), domain)) delete allowances[url];
  }
  await chrome.storage.local.set({ snoozes, allowances });
}

export function prune(map, now = Date.now()) {
  return Object.fromEntries(Object.entries(map).filter(([, expiry]) => expiry > now));
}
