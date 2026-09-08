const TRACKING_PARAMS = new Set([
  'fbclid', 'gclid', 'igshid', 'mc_cid', 'mc_eid', 'ref', 'ref_src',
  'si', 'spm', 'yclid', '_hsenc', '_hsmi', 'feature', 'pp',
]);

export function isHttp(rawUrl) {
  return typeof rawUrl === 'string' && /^https?:\/\//i.test(rawUrl);
}

export function hostOf(rawUrl) {
  try {
    return new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

// Reading List entries are keyed by exact URL, so `?t=30s` and `&si=...` make
// the same video look like a different page. Normalise before comparing.
export function canonicalize(rawUrl) {
  try {
    const u = new URL(rawUrl);
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    u.hash = '';

    if (u.hostname === 'youtu.be') {
      const id = u.pathname.replace(/^\/+|\/+$/g, '');
      if (id) {
        u.hostname = 'youtube.com';
        u.pathname = '/watch';
        u.searchParams.set('v', id);
      }
    }
    if (u.hostname === 'youtube.com' && u.pathname === '/watch') {
      const v = u.searchParams.get('v');
      u.search = '';
      if (v) u.searchParams.set('v', v);
    }

    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key) || key.startsWith('utm_')) u.searchParams.delete(key);
    }
    u.searchParams.sort();
    if (u.pathname !== '/' && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);

    return u.toString();
  } catch {
    return rawUrl;
  }
}

export function hostMatchesDomain(host, domain) {
  return host === domain || host.endsWith('.' + domain);
}

export function matchesBlocklist(rawUrl, blocklist) {
  const host = hostOf(rawUrl);
  if (!host) return null;
  return blocklist.find((d) => hostMatchesDomain(host, d)) ?? null;
}

export function normalizeDomain(input) {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return '';
  const withScheme = /^https?:\/\//.test(trimmed) ? trimmed : 'https://' + trimmed;
  return hostOf(withScheme);
}

export function toMatchPattern(domain) {
  return `*://*.${domain}/*`;
}
