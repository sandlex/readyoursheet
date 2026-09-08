import { getSettings, prune } from './store.js';

const DAY = 86_400_000;
const LEDGER_KEEP_DAYS = 60;

// The Reading List API only exposes current state, and the service worker is
// asleep whenever items get read on another device. So we diff against a stored
// snapshot on every wake-up and rebuild the history ourselves.
export async function reconcile() {
  const entries = await chrome.readingList.query({});
  const st = await chrome.storage.local.get(['snapshot', 'ledger', 'snoozes', 'allowances']);
  const snapshot = st.snapshot ?? {};
  const ledger = st.ledger ?? [];
  const now = Date.now();

  const next = {};
  for (const e of entries) {
    next[e.url] = {
      title: e.title,
      hasBeenRead: e.hasBeenRead,
      creationTime: e.creationTime,
      lastUpdateTime: e.lastUpdateTime,
    };
  }

  for (const [url, cur] of Object.entries(next)) {
    const prev = snapshot[url];
    if (!prev) {
      ledger.push({ t: cur.creationTime, type: 'saved', url });
      if (cur.hasBeenRead) ledger.push({ t: cur.lastUpdateTime, type: 'read', url });
    } else if (!prev.hasBeenRead && cur.hasBeenRead) {
      ledger.push({ t: cur.lastUpdateTime, type: 'read', url });
    }
  }
  for (const [url, prev] of Object.entries(snapshot)) {
    if (!next[url] && !prev.hasBeenRead) ledger.push({ t: now, type: 'dropped', url });
  }

  const cutoff = now - LEDGER_KEEP_DAYS * DAY;
  const seen = new Set();
  const cleaned = [];
  for (const e of ledger) {
    const key = `${e.type}|${e.t}|${e.url}`;
    if (e.t < cutoff || seen.has(key)) continue;
    seen.add(key);
    cleaned.push(e);
  }
  cleaned.sort((a, b) => a.t - b.t);

  await chrome.storage.local.set({
    snapshot: next,
    ledger: cleaned,
    snoozes: prune(st.snoozes ?? {}, now),
    allowances: prune(st.allowances ?? {}, now),
  });
}

export async function metrics(settings) {
  const s = settings ?? (await getSettings());
  const { ledger = [], snapshot = {} } = await chrome.storage.local.get(['ledger', 'snapshot']);
  const since = Date.now() - s.windowDays * DAY;

  let saved = 0;
  let read = 0;
  let dropped = 0;
  for (const e of ledger) {
    if (e.t < since) continue;
    if (e.type === 'saved') saved++;
    else if (e.type === 'read') read++;
    else if (e.type === 'dropped') dropped++;
  }

  const unread = Object.values(snapshot).filter((e) => !e.hasBeenRead).length;
  return { saved, read, dropped, unread, netGrowth: saved - read, windowDays: s.windowDays };
}

export function shouldBlock(m, s) {
  if (!s.enabled) return null;
  if (Date.now() < (s.pausedUntil ?? 0)) return null;
  if (s.maxUnread > 0 && m.unread >= s.maxUnread) return { reason: 'ceiling' };
  if (m.netGrowth >= s.netGrowthLimit) return { reason: 'growth' };
  return null;
}
