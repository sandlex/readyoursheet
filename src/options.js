import { getSettings, setSettings, siteStates, unsnooze } from './lib/store.js';
import { metrics, shouldBlock } from './lib/backlog.js';
import { normalizeDomain, toMatchPattern } from './lib/url.js';

const minutesLeft = (until) => Math.max(1, Math.ceil((until - Date.now()) / 60_000));

const NUMBERS = ['windowDays', 'netGrowthLimit', 'maxUnread', 'delaySeconds', 'snoozeMinutes'];
const note = document.getElementById('saved-note');

let settings = await getSettings();

function flash(text) {
  note.textContent = text;
  setTimeout(() => (note.textContent = ''), 2000);
}

async function renderSites() {
  const container = document.getElementById('sites');
  if (!settings.blocklist.length) {
    container.replaceChildren(
      Object.assign(document.createElement('div'), {
        className: 'site muted',
        textContent: 'Nothing blocked yet.',
      }),
    );
    return;
  }

  const states = await siteStates(settings.blocklist);

  const rows = states.map(({ domain, needsAccess, snoozedUntil, allowedLinks }) => {
    const row = document.createElement('div');
    row.className = 'site';

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = domain;
    row.append(name);

    if (needsAccess) {
      const warn = document.createElement('button');
      warn.className = 'warn';
      warn.textContent = 'Grant access';
      warn.addEventListener('click', async () => {
        await chrome.permissions.request({ origins: [toMatchPattern(domain)] });
        refresh();
      });
      row.append(warn);
    } else if (snoozedUntil) {
      const chip = document.createElement('span');
      chip.className = 'chip hot';
      chip.textContent = `snoozed · ${minutesLeft(snoozedUntil)}m left`;
      const undo = document.createElement('button');
      undo.textContent = 'Block now';
      undo.addEventListener('click', async () => {
        await unsnooze(domain);
        refresh();
      });
      row.append(chip, undo);
    } else if (allowedLinks.length) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent =
        allowedLinks.length === 1
          ? '1 saved link allowed'
          : `${allowedLinks.length} saved links allowed`;
      chip.title = ['Let through from your Reading List:']
        .concat(allowedLinks.map((l) => `• ${l.url}  (${minutesLeft(l.until)}m left)`))
        .join('\n');
      row.append(chip);
    }

    const remove = document.createElement('button');
    remove.textContent = 'Remove';
    remove.addEventListener('click', async () => {
      settings = await setSettings({ blocklist: settings.blocklist.filter((d) => d !== domain) });
      await chrome.permissions.remove({ origins: [toMatchPattern(domain)] });
      refresh();
    });
    row.append(remove);

    return row;
  });
  container.replaceChildren(...rows);
}

async function renderGate() {
  const gate = document.getElementById('gate');
  if (!settings.blocklist.length) return (gate.textContent = '');

  const m = await metrics(settings);
  const verdict = shouldBlock(m, settings);

  gate.className = 'small' + (verdict ? '' : ' muted');
  if (!settings.enabled) gate.textContent = 'Blocking is switched off, so nothing below is gated.';
  else if (settings.pausedUntil > Date.now())
    gate.textContent = `Paused for another ${minutesLeft(settings.pausedUntil)} minutes — nothing below is gated.`;
  else if (verdict?.reason === 'ceiling')
    gate.textContent = `Gating now: ${m.unread} unread is over your ${settings.maxUnread}-item ceiling.`;
  else if (verdict)
    gate.textContent = `Gating now: you saved ${m.netGrowth} more than you read in ${m.windowDays} days.`;
  else
    gate.textContent = `Not gating right now — net ${m.netGrowth >= 0 ? '+' : ''}${m.netGrowth} over ${m.windowDays} days, under your limit of ${settings.netGrowthLimit}.`;
}

async function refresh() {
  settings = await getSettings();
  await Promise.all([renderSites(), renderGate()]);
}

// snoozes and allowances tick down on their own
setInterval(refresh, 30_000);

document.getElementById('add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('domain');
  const domain = normalizeDomain(input.value);
  if (!domain) return flash('That does not look like a domain.');
  if (settings.blocklist.includes(domain)) return flash(`${domain} is already blocked.`);

  const granted = await chrome.permissions.request({ origins: [toMatchPattern(domain)] });
  if (!granted) return flash('Access denied — blocking needs permission for that site.');

  settings = await setSettings({ blocklist: [...settings.blocklist, domain] });
  input.value = '';
  refresh();
});

const enabled = document.getElementById('enabled');
enabled.checked = settings.enabled;
enabled.addEventListener('change', async () => {
  settings = await setSettings({ enabled: enabled.checked });
  flash('Saved.');
  renderGate();
});

for (const key of NUMBERS) {
  const input = document.getElementById(key);
  input.value = settings[key];
  input.addEventListener('change', async () => {
    const value = Number(input.value);
    if (!Number.isFinite(value)) return;
    settings = await setSettings({ [key]: value });
    flash('Saved.');
    renderGate();
  });
}

refresh();
