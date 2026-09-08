import { canonicalize, matchesBlocklist, isHttp } from './url.js';
import { metrics, shouldBlock } from './backlog.js';
import { getSettings } from './store.js';

// The single answer to "should this URL be blocked right now, and why".
// Both the navigation guard and the nag screen ask this, so a nag screen can
// tell when the reason it exists has gone away.
export function decide({ url, settings, stats, snoozes, allowances, snapshot, now = Date.now() }) {
  if (!isHttp(url)) return { block: false, why: 'not-http' };

  const domain = matchesBlocklist(url, settings.blocklist);
  if (!domain) return { block: false, why: 'not-listed' };

  if (!settings.enabled) return { block: false, why: 'disabled', domain };
  if (now < (settings.pausedUntil ?? 0)) return { block: false, why: 'paused', domain };
  if ((snoozes[domain] ?? 0) > now) return { block: false, why: 'snoozed', domain };

  const canon = canonicalize(url);
  if ((allowances[canon] ?? 0) > now) return { block: false, why: 'allowance', domain, canon };

  const savedUnread = Object.entries(snapshot).some(
    ([entryUrl, entry]) => !entry.hasBeenRead && canonicalize(entryUrl) === canon,
  );
  if (savedUnread) return { block: false, why: 'saved-link', domain, canon, grantAllowance: true };

  const verdict = shouldBlock(stats, settings);
  if (!verdict) return { block: false, why: 'under-limit', domain, canon };

  return { block: true, why: verdict.reason, domain, canon };
}

export async function evaluate(url) {
  const settings = await getSettings();
  const [state, stats] = await Promise.all([
    chrome.storage.local.get(['snoozes', 'allowances', 'snapshot']),
    metrics(settings),
  ]);
  return decide({
    url,
    settings,
    stats,
    snoozes: state.snoozes ?? {},
    allowances: state.allowances ?? {},
    snapshot: state.snapshot ?? {},
  });
}
