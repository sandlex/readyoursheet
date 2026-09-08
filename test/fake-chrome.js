// In-memory stand-in for the extension APIs, so the real lib/ modules can be
// exercised in a plain page. Returns handles to the backing stores so tests can
// seed them and assert on what landed where.
export function installFakeChrome() {
  const local = {};
  const sync = {};
  const granted = new Set();
  const readingList = { entries: [] };
  const badge = { text: '', color: '' };

  const area = (backing) => ({
    get: async (keys) => {
      const ks = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(
        ks.filter((k) => k in backing).map((k) => [k, structuredClone(backing[k])]),
      );
    },
    set: async (obj) => {
      Object.assign(backing, structuredClone(obj));
    },
    remove: async (keys) => {
      for (const k of Array.isArray(keys) ? keys : [keys]) delete backing[k];
    },
  });

  globalThis.chrome = {
    storage: { local: area(local), sync: area(sync) },

    readingList: {
      query: async (info = {}) =>
        structuredClone(
          readingList.entries.filter(
            (e) => info.hasBeenRead === undefined || e.hasBeenRead === info.hasBeenRead,
          ),
        ),
    },

    permissions: {
      contains: async ({ origins }) => origins.every((o) => granted.has(o)),
      request: async ({ origins }) => {
        origins.forEach((o) => granted.add(o));
        return true;
      },
      remove: async ({ origins }) => {
        origins.forEach((o) => granted.delete(o));
        return true;
      },
    },

    action: {
      setBadgeText: async ({ text }) => {
        badge.text = text;
      },
      setBadgeBackgroundColor: async ({ color }) => {
        badge.color = color;
      },
    },

    runtime: { openOptionsPage() {}, getURL: (p) => p },
  };

  return { local, sync, granted, readingList, badge };
}
