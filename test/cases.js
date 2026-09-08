import { installFakeChrome } from './fake-chrome.js';

const { local, sync, granted, readingList } = installFakeChrome();

// Loaded after the fake is installed, and cache-busted so a reload always picks
// up edited source.
const v = '?v=' + Date.now();
const { canonicalize, matchesBlocklist, normalizeDomain, hostMatchesDomain } =
  await import('../src/lib/url.js' + v);
const { reconcile, metrics, shouldBlock } = await import('../src/lib/backlog.js' + v);
const {
  getSettings, setSettings, migrateSettings, missingAccess, siteStates, unsnooze, prune, DEFAULTS,
} = await import('../src/lib/store.js' + v);

const results = [];
const eq = (name, actual, expected) => {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ pass, name, actual, expected });
};

const DAY = 86_400_000;
const MIN = 60_000;
const now = Date.now();
const ago = (days) => now - days * DAY;

// ---------------------------------------------------------------- url
eq('youtu.be -> watch', canonicalize('https://youtu.be/abc123?si=xyz'), 'https://youtube.com/watch?v=abc123');
eq('strips timestamp + playlist', canonicalize('https://www.youtube.com/watch?v=abc123&t=30s&list=PL9'), 'https://youtube.com/watch?v=abc123');
eq('strips utm params', canonicalize('https://example.com/post?utm_source=nl&id=4'), 'https://example.com/post?id=4');
eq('drops hash and trailing slash', canonicalize('https://Example.com/a/b/#frag'), 'https://example.com/a/b');
eq('keeps root slash', canonicalize('https://www.example.com/'), 'https://example.com/');
eq('short and long youtube forms agree',
  canonicalize('https://youtu.be/K1/?si=1') === canonicalize('https://www.youtube.com/watch?v=K1&t=9'), true);

eq('bare domain matches', matchesBlocklist('https://youtube.com/feed', ['youtube.com']), 'youtube.com');
eq('www matches', matchesBlocklist('https://www.youtube.com/feed', ['youtube.com']), 'youtube.com');
eq('subdomain matches', matchesBlocklist('https://m.youtube.com/feed', ['youtube.com']), 'youtube.com');
eq('suffix trap does not match', matchesBlocklist('https://notyoutube.com/x', ['youtube.com']), null);
eq('unrelated host', matchesBlocklist('https://news.ycombinator.com', ['youtube.com']), null);
eq('hostMatchesDomain rejects suffix trap', hostMatchesDomain('notyoutube.com', 'youtube.com'), false);
eq('normalizeDomain strips scheme and path', normalizeDomain(' HTTPS://WWW.Reddit.com/r/x '), 'reddit.com');

// ------------------------------------------------------ ledger + metrics
readingList.entries = [
  { url: 'https://a.com/1', title: 'A', hasBeenRead: false, creationTime: ago(2), lastUpdateTime: ago(2) },
  { url: 'https://a.com/2', title: 'B', hasBeenRead: true, creationTime: ago(3), lastUpdateTime: ago(1) },
  { url: 'https://a.com/3', title: 'C', hasBeenRead: false, creationTime: ago(40), lastUpdateTime: ago(40) },
];
await reconcile();
let m = await metrics();
eq('seed: saved inside window', m.saved, 2);
eq('seed: read inside window', m.read, 1);
eq('seed: unread includes old backlog', m.unread, 2);
eq('seed: net growth', m.netGrowth, 1);

// read on another device: only a reconcile can notice
readingList.entries[0].hasBeenRead = true;
readingList.entries[0].lastUpdateTime = now;
await reconcile();
m = await metrics();
eq('synced read detected', m.read, 2);
eq('net growth after read', m.netGrowth, 0);
eq('unread drops', m.unread, 1);

await reconcile();
await reconcile();
m = await metrics();
eq('reconcile idempotent (read)', m.read, 2);
eq('reconcile idempotent (saved)', m.saved, 2);

readingList.entries = readingList.entries.filter((e) => e.url !== 'https://a.com/3');
await reconcile();
m = await metrics();
eq('deleting unread is not a read', m.read, 2);
eq('deletion tracked as dropped', m.dropped, 1);

for (let i = 0; i < 4; i++) {
  readingList.entries.push({ url: `https://b.com/${i}`, title: 'n', hasBeenRead: false, creationTime: now, lastUpdateTime: now });
}
await reconcile();
m = await metrics();
eq('saved after burst', m.saved, 6);
eq('net growth after burst', m.netGrowth, 4);

// ------------------------------------------------------------ shouldBlock
const s = await getSettings();
eq('blocks over growth limit', shouldBlock(m, s), { reason: 'growth' });
eq('respects enabled=false', shouldBlock(m, { ...s, enabled: false }), null);
eq('respects pause', shouldBlock(m, { ...s, pausedUntil: now + MIN }), null);
eq('under the limit passes', shouldBlock({ ...m, netGrowth: 2 }, s), null);
eq('ceiling off by default', shouldBlock({ ...m, unread: 9999, netGrowth: 0 }, s), null);
eq('ceiling fires when set', shouldBlock({ ...m, unread: 100, netGrowth: 0 }, { ...s, maxUnread: 100 }), { reason: 'ceiling' });
eq('ceiling outranks growth', shouldBlock({ ...m, unread: 100 }, { ...s, maxUnread: 100 }), { reason: 'ceiling' });

// -------------------------------------------------- settings: sync vs local
await setSettings({ blocklist: ['youtube.com'], netGrowthLimit: 9 });
eq('settings persist', (await getSettings()).netGrowthLimit, 9);
eq('defaults still fill in', (await getSettings()).delaySeconds, 15);
eq('blocklist goes to sync', sync.settings.blocklist, ['youtube.com']);
eq('pausedUntil kept out of sync', 'pausedUntil' in sync.settings, false);
eq('no settings key left in local', 'settings' in local, false);

await setSettings({ pausedUntil: now + 3600_000 });
eq('pausedUntil written to local', local.pausedUntil, now + 3600_000);
eq('pausedUntil still absent from sync', 'pausedUntil' in sync.settings, false);
eq('pausedUntil reads back', (await getSettings()).pausedUntil, now + 3600_000);
eq('pausing left blocklist alone', (await getSettings()).blocklist, ['youtube.com']);

// a second machine: same sync bucket, empty local
delete local.pausedUntil;
eq('second machine inherits blocklist', (await getSettings()).blocklist, ['youtube.com']);
eq('second machine inherits tuning', (await getSettings()).netGrowthLimit, 9);
eq('second machine is not paused', (await getSettings()).pausedUntil, 0);

// ------------------------------------------------- migration from local-only
delete sync.settings;
delete local.pausedUntil;
local.settings = { ...DEFAULTS, blocklist: ['reddit.com'], delaySeconds: 42, pausedUntil: now + 5000 };
eq('legacy local read before migration', (await getSettings()).blocklist, ['reddit.com']);
eq('migration runs once', await migrateSettings(), true);
eq('blocklist migrated to sync', sync.settings.blocklist, ['reddit.com']);
eq('tuning migrated to sync', sync.settings.delaySeconds, 42);
eq('pausedUntil migrated to local', local.pausedUntil, now + 5000);
eq('legacy local settings removed', 'settings' in local, false);
eq('reads intact after migration', (await getSettings()).delaySeconds, 42);
eq('migration is a no-op second time', await migrateSettings(), false);

local.settings = { blocklist: ['clobber.com'] };
eq('never clobbers existing sync', await migrateSettings(), false);
eq('sync survived', sync.settings.blocklist, ['reddit.com']);

// --------------------------------------------------------- host permissions
granted.clear();
eq('fresh machine: synced sites are inert', await missingAccess(['youtube.com', 'reddit.com']), ['youtube.com', 'reddit.com']);
granted.add('*://*.youtube.com/*');
eq('partially granted', await missingAccess(['youtube.com', 'reddit.com']), ['reddit.com']);
granted.add('*://*.reddit.com/*');
eq('fully granted', await missingAccess(['youtube.com', 'reddit.com']), []);
eq('empty blocklist', await missingAccess([]), []);

// ------------------------------------- why is this site reachable right now?
local.snoozes = { 'reddit.com': now + 22 * MIN, 'instagram.com': now - 5 * MIN };
local.allowances = {
  'https://youtube.com/watch?v=a': now + 40 * MIN,
  'https://m.youtube.com/watch?v=b': now + 10 * MIN,
  'https://youtube.com/watch?v=stale': now - MIN,
  'https://elsewhere.com/x': now + 40 * MIN,
};
const states = Object.fromEntries(
  (await siteStates(['youtube.com', 'reddit.com', 'instagram.com'])).map((x) => [x.domain, x]),
);
eq('allowed links counted, subdomains included', states['youtube.com'].allowedLinks.length, 2);
eq('expired allowance ignored', states['youtube.com'].allowedLinks.length < 3, true);
eq('other domains not attributed', states['reddit.com'].allowedLinks.length, 0);
eq('active snooze reported', states['reddit.com'].snoozedUntil, now + 22 * MIN);
eq('expired snooze not reported', states['instagram.com'].snoozedUntil, 0);
eq('ungranted site flagged', states['instagram.com'].needsAccess, true);
eq('granted site not flagged', states['youtube.com'].needsAccess, false);

// "Block now" has to kill the snooze *and* any live per-URL allowances
await unsnooze('youtube.com');
eq('unsnooze clears that domain of links', (await siteStates(['youtube.com']))[0].allowedLinks.length, 0);
eq('unsnooze leaves other domains alone', local.allowances['https://elsewhere.com/x'], now + 40 * MIN);
await unsnooze('reddit.com');
eq('unsnooze clears the snooze', (await siteStates(['reddit.com']))[0].snoozedUntil, 0);

eq('allowed links carry an expiry', states['youtube.com'].allowedLinks.every(l => l.until > now), true);
eq('prune drops expired entries', prune({ a: now - 1, b: now + 10_000 }, now), { b: now + 10_000 });

// ------------------------------------------------------------------ report
const failed = results.filter((r) => !r.pass);
const lines = results.map((r) =>
  r.pass
    ? `PASS  ${r.name}`
    : `FAIL  ${r.name}\n        got  ${JSON.stringify(r.actual)}\n        want ${JSON.stringify(r.expected)}`,
);
lines.push('', `${results.length - failed.length}/${results.length} passed`);

document.getElementById('out').textContent = lines.join('\n');
// run.sh reads the exit status out of the title
document.title = failed.length ? `FAIL ${failed.length}` : `OK ${results.length}`;
