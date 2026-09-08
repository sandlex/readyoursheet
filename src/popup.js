import { getSettings, setSettings, missingAccess } from './lib/store.js';
import { metrics, shouldBlock, reconcile } from './lib/backlog.js';
import { toMatchPattern } from './lib/url.js';

await reconcile();

const settings = await getSettings();
const m = await metrics(settings);
const verdict = shouldBlock(m, settings);
const paused = Date.now() < (settings.pausedUntil ?? 0);

document.getElementById('status').textContent = !settings.blocklist.length
  ? 'No sites blocked yet'
  : paused
    ? 'Paused'
    : verdict
      ? 'Blocking'
      : 'Clear';

document.getElementById('detail').textContent = !settings.blocklist.length
  ? 'Add a site in Settings to get started.'
  : paused
    ? `Resumes at ${new Date(settings.pausedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
    : verdict === null
      ? `Blocking kicks in at +${settings.netGrowthLimit} net over ${m.windowDays} days.`
      : verdict.reason === 'ceiling'
        ? `Over your ${settings.maxUnread}-item ceiling.`
        : `You saved ${m.netGrowth} more than you read.`;

const stats = [
  { label: 'saved', value: m.saved },
  { label: 'read', value: m.read },
  { label: 'net', value: (m.netGrowth > 0 ? '+' : '') + m.netGrowth, tone: m.netGrowth > 0 ? 'bad' : 'good' },
  { label: 'unread', value: m.unread },
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

const missing = await missingAccess(settings.blocklist);
if (missing.length) {
  document.getElementById('access-text').textContent =
    missing.length === 1
      ? `${missing[0]} isn't blocked here yet — this device needs access to it.`
      : `${missing.length} sites aren't blocked here yet — this device needs access to them.`;
  document.getElementById('access').hidden = false;
  document.getElementById('grant').addEventListener('click', async () => {
    await chrome.permissions.request({ origins: missing.map(toMatchPattern) });
    window.close();
  });
}

const pause = document.getElementById('pause');
const resume = document.getElementById('resume');
pause.hidden = paused;
resume.hidden = !paused;

pause.addEventListener('click', async () => {
  await setSettings({ pausedUntil: Date.now() + 3_600_000 });
  window.close();
});
resume.addEventListener('click', async () => {
  await setSettings({ pausedUntil: 0 });
  window.close();
});
document.getElementById('options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});
