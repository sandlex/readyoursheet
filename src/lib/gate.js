import { canonicalize, matchesBlocklist, isHttp } from './url.js';
import { metrics, shouldBlock } from './backlog.js';
import { getSettings } from './store.js';

// The single answer to "should this URL be blocked right now, and why".
// Both the navigation guard and the nag screen ask this, so a nag screen can
// tell when the reason it exists has gone away.
export function decide({ url, settings, stats, snoozes, allowances, unreadUrls, now = Date.now() }) {
  if (!isHttp(url)) return { block: false, why: 'not-http' };

  const domain = matchesBlocklist(url, settings.blocklist);
  if (!domain) return { block: false, why: 'not-listed' };

  if (!settings.enabled) return { block: false, why: 'disabled', domain };
  if (now < (settings.pausedUntil ?? 0)) return { block: false, why: 'paused', domain };
  if ((snoozes[domain] ?? 0) > now) return { block: false, why: 'snoozed', domain };

  const canon = canonicalize(url);
  if ((allowances[canon] ?? 0) > now) return { block: false, why: 'allowance', domain, canon };

  const savedUnread = unreadUrls.some((entryUrl) => canonicalize(entryUrl) === canon);
  if (savedUnread) return { block: false, why: 'saved-link', domain, canon, grantAllowance: true };

  const verdict = shouldBlock(stats, settings);
  if (!verdict) return { block: false, why: 'under-limit', domain, canon };

  return { block: true, why: verdict.reason, domain, canon };
}

export async function evaluate(url) {
  const settings = await getSettings();
  // Ask the Reading List directly rather than the stored snapshot: the snapshot
  // is for the ledger and can lag a phone sync by up to a reconcile interval,
  // which would block a link the nag screen is actively offering you.
  const [state, stats, unread] = await Promise.all([
    chrome.storage.local.get(['snoozes', 'allowances']),
    metrics(settings),
    chrome.readingList.query({ hasBeenRead: false }),
  ]);
  return decide({
    url,
    settings,
    stats,
    snoozes: state.snoozes ?? {},
    allowances: state.allowances ?? {},
    unreadUrls: unread.map((e) => e.url),
  });
}
