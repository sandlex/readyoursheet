import { getSettings, snooze } from './lib/store.js';
import { metrics } from './lib/backlog.js';
import { canonicalize, hostOf, isHttp } from './lib/url.js';

const params = new URLSearchParams(location.search);
const target = params.get('url') ?? '';
const domain = params.get('domain') ?? hostOf(target);
const reason = params.get('reason');

const settings = await getSettings();
const m = await metrics(settings);
const entries = await chrome.readingList.query({ hasBeenRead: false });

document.getElementById('lede').textContent =
  reason === 'ceiling'
    ? `${m.unread} unread in your Reading List. ${domain} can wait.`
    : `In the last ${m.windowDays} days you saved ${m.saved} and read ${m.read}. The pile is winning.`;

const stats = [
  { label: `saved / ${m.windowDays}d`, value: m.saved },
  { label: `read / ${m.windowDays}d`, value: m.read },
  { label: 'net growth', value: (m.netGrowth > 0 ? '+' : '') + m.netGrowth, tone: m.netGrowth > 0 ? 'bad' : 'good' },
  { label: 'unread total', value: m.unread },
];
document.getElementById('stats').replaceChildren(
  ...stats.map(({ label, value, tone }) => {
    const div = document.createElement('div');
    div.className = 'stat' + (tone ? ' ' + tone : '');
    const b = document.createElement('b');
    b.textContent = String(value);
    const span = document.createElement('span');
    span.textContent = label;
    div.append(b, span);
    return div;
  }),
);

function renderList(node, list) {
  node.replaceChildren(
    ...list.map((entry) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = entry.url;
      a.textContent = entry.title || entry.url;
      const host = document.createElement('span');
      host.className = 'host';
      host.textContent = hostOf(entry.url);
      a.append(host);
      li.append(a);
      return li;
    }),
  );
}

const readable = entries.filter((e) => isHttp(e.url));
// canonicalize first so a saved youtu.be link is recognised as youtube.com
const here = readable.filter((e) => {
  const h = hostOf(canonicalize(e.url));
  return h === domain || h.endsWith('.' + domain);
});
const other = readable.filter((e) => !here.includes(e)).slice(0, 5);

if (here.length) {
  document.getElementById('here-title').textContent = `You saved ${here.length} from ${domain}`;
  renderList(document.getElementById('here'), here);
  document.getElementById('here-wrap').hidden = false;
}
if (other.length) {
  renderList(document.getElementById('other'), other);
  document.getElementById('other-wrap').hidden = false;
}

document.getElementById('footnote').textContent =
  `Continuing snoozes ${domain} for ${settings.snoozeMinutes} minutes. Opening something from the list above is always allowed.`;

document.getElementById('options').addEventListener('click', () => chrome.runtime.openOptionsPage());

const button = document.getElementById('continue');
if (!isHttp(target)) {
  button.remove();
} else {
  let left = settings.delaySeconds;
  const tick = () => {
    if (left > 0) {
      button.textContent = `Continue anyway (${left})`;
      left--;
      return;
    }
    clearInterval(timer);
    button.textContent = 'Continue anyway';
    button.disabled = false;
  };
  const timer = setInterval(tick, 1000);
  tick();

  button.addEventListener('click', async () => {
    button.disabled = true;
    await snooze(domain, settings.snoozeMinutes);
    location.replace(target);
  });
}
