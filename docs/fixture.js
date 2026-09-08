// Staged data for README screenshots. Never capture from a real profile — that
// leaks the actual Reading List into a public repo.
//
// Query params: ?granted=all grants every blocked site (used for the popup, so
// it isn't shown permanently in a needs-access state).
(() => {
  const DAY = 86_400_000;
  const MIN = 60_000;
  const now = Date.now();
  const ago = (d) => now - d * DAY;
  const grantAll = new URLSearchParams(location.search).get('granted') === 'all';

  const named = [
    ['https://lwn.net/Articles/250967/', 'What every programmer should know about memory', 2],
    ['https://lexi-lambda.github.io/blog/parse-dont-validate/', "Parse, don't validate", 1],
    ['https://incompleteideas.net/IncIdeas/BitterLesson.html', 'The Bitter Lesson', 3],
    ['https://infiniteundo.com/falsehoods-about-time', 'Falsehoods programmers believe about time', 4],
    ['https://danluu.com/latency-pitfalls/', 'Latency pitfalls nobody warns you about', 5],
    ['https://www.youtube.com/watch?v=SxdOUGdseq4', 'Rich Hickey — Simple Made Easy', 6],
    ['https://youtu.be/xY5ClY7Zg2E', 'How the Apollo Guidance Computer actually worked', 2],
  ];
  const filler = [
    'Notes on distributed tracing', 'A tour of CRDTs', 'Why your p99 is lying to you',
    'Designing resilient retry policies', 'The cost of a context switch',
    'Understanding memory ordering', 'Column stores, explained', 'On writing good commit messages',
    'Rate limiting without tears', 'Schema migrations at scale', 'What is a monad, really',
    'Debugging TLS handshakes', 'The case against microservices', 'Property-based testing in practice',
    'Caching invalidation strategies', 'How DNS resolution actually works',
  ];

  const entries = named.map(([url, title, days]) => ({
    url, title, hasBeenRead: false, creationTime: ago(days), lastUpdateTime: ago(days),
  }));
  filler.forEach((title, i) => {
    const days = i < 5 ? 3 + i * 0.5 : 20 + i * 3; // first five land inside the window
    entries.push({ url: `https://example.com/articles/${i + 1}`, title, hasBeenRead: false, creationTime: ago(days), lastUpdateTime: ago(days) });
  });
  for (let i = 0; i < 4; i++) {
    entries.push({ url: `https://example.org/read/${i + 1}`, title: `Already read ${i + 1}`, hasBeenRead: true, creationTime: ago(25 + i * 4), lastUpdateTime: ago(1 + i) });
  }
  // => 12 saved / 4 read / +8 net / 23 unread over the default 7-day window

  const snapshot = {};
  const ledger = [];
  for (const e of entries) {
    snapshot[e.url] = { title: e.title, hasBeenRead: e.hasBeenRead, creationTime: e.creationTime, lastUpdateTime: e.lastUpdateTime };
    ledger.push({ t: e.creationTime, type: 'saved', url: e.url });
    if (e.hasBeenRead) ledger.push({ t: e.lastUpdateTime, type: 'read', url: e.url });
  }

  const sync = {
    settings: {
      enabled: true,
      blocklist: ['youtube.com', 'reddit.com', 'instagram.com', 'news.ycombinator.com'],
      windowDays: 7, netGrowthLimit: 3, maxUnread: 0, delaySeconds: 15, snoozeMinutes: 30,
    },
  };

  // One site per row state: open links / snoozed / plain gated / needs access.
  const local = {
    snapshot,
    ledger,
    snoozes: { 'reddit.com': now + 22 * MIN },
    allowances: {
      'https://youtube.com/watch?v=SxdOUGdseq4': now + 41 * MIN,
      'https://m.youtube.com/watch?v=xY5ClY7Zg2E': now + 12 * MIN,
    },
  };

  const granted = new Set(['*://*.youtube.com/*', '*://*.reddit.com/*', '*://*.instagram.com/*']);
  if (grantAll) granted.add('*://*.news.ycombinator.com/*');

  const area = (backing) => ({
    get: async (keys) => {
      const ks = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(ks.filter((k) => k in backing).map((k) => [k, structuredClone(backing[k])]));
    },
    set: async (o) => Object.assign(backing, structuredClone(o)),
    remove: async (keys) => { for (const k of [].concat(keys)) delete backing[k]; },
  });

  globalThis.chrome = {
    storage: { local: area(local), sync: area(sync) },
    readingList: {
      query: async (info = {}) => structuredClone(
        entries.filter((e) => info.hasBeenRead === undefined || e.hasBeenRead === info.hasBeenRead),
      ),
    },
    permissions: {
      contains: async ({ origins }) => origins.every((o) => granted.has(o)),
      request: async () => true,
      remove: async () => true,
    },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    runtime: { openOptionsPage() {}, getURL: (p) => p },
  };
})();
