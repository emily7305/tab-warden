const SWEEP_ALARM = 'hibernate-sweep';
const SWEEP_PERIOD_MIN = 5;
const IDLE_LIMIT_MS = 15 * 60 * 1000;
const VAULT_KEY = 'vaults';
const MAX_VAULTS = 50;
const INTERNAL_URL = /^(about|chrome|chrome-extension|chrome-untrusted|devtools):/i;
const NEW_TAB_URLS = new Set(['chrome://newtab/', 'chrome://new-tab-page/']);

async function ensureSweepAlarm() {
  const alarm = await chrome.alarms.get(SWEEP_ALARM);
  if (!alarm) {
    await chrome.alarms.create(SWEEP_ALARM, { periodInMinutes: SWEEP_PERIOD_MIN });
  }
}

function isIdle(tab, now) {
  if (tab.id === undefined || tab.id === chrome.tabs.TAB_ID_NONE) return false;
  if (tab.active || tab.pinned || tab.audible || tab.discarded) return false;
  // Tabs restored at startup can lack lastAccessed; without it we can't tell idle from untouched, so leave them alone.
  if (typeof tab.lastAccessed !== 'number') return false;
  return now - tab.lastAccessed > IDLE_LIMIT_MS;
}

async function sweepIdleTabs() {
  const tabs = await chrome.tabs.query({});
  const now = Date.now();
  for (const tab of tabs) {
    if (!isIdle(tab, now)) continue;
    try {
      await chrome.tabs.discard(tab.id);
    } catch {
      // The tab closed mid-sweep or Chrome refused to discard it; the next sweep will try again.
    }
  }
}

function isRestorable(url) {
  return url !== '' && !INTERNAL_URL.test(url);
}

async function readVaults() {
  const { [VAULT_KEY]: vaults = [] } = await chrome.storage.local.get(VAULT_KEY);
  return vaults;
}

async function saveVault(vault) {
  const vaults = await readVaults();
  await chrome.storage.local.set({ [VAULT_KEY]: [vault, ...vaults].slice(0, MAX_VAULTS) });
}

async function removeTabs(ids) {
  try {
    await chrome.tabs.remove(ids);
  } catch {
    // A batch remove rejects if any tab already closed, so close whatever is left one by one.
    await Promise.allSettled(ids.map((id) => chrome.tabs.remove(id)));
  }
}

async function freezeWindow(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  const saved = [];
  let skipped = 0;
  for (const tab of tabs) {
    const url = tab.url || tab.pendingUrl || '';
    if (isRestorable(url)) {
      saved.push({ url, title: tab.title || url, pinned: tab.pinned });
    } else {
      skipped++;
    }
  }
  if (!saved.length) return { ok: true, saved: 0, skipped };

  await saveVault({ id: crypto.randomUUID(), createdAt: Date.now(), tabs: saved, skipped });
  // The blank tab must exist before the removal, otherwise the window drops to zero tabs and closes.
  await chrome.tabs.create({ windowId, active: true });
  await removeTabs(tabs.map((tab) => tab.id));
  return { ok: true, saved: saved.length, skipped };
}

async function findUntouchedBlankTab(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  if (tabs.length !== 1) return null;
  const [tab] = tabs;
  return NEW_TAB_URLS.has(tab.url || tab.pendingUrl) ? tab : null;
}

async function restoreVault(id, windowId) {
  const vault = (await readVaults()).find((v) => v.id === id);
  if (!vault) throw new Error('This vault no longer exists.');

  const blank = await findUntouchedBlankTab(windowId);
  const opened = [];
  for (const { url, pinned } of vault.tabs) {
    try {
      opened.push(await chrome.tabs.create({ windowId, url, pinned, active: false }));
    } catch {
      // Some saved URLs (file:, data:) can be refused at create time; restore the rest.
    }
  }

  if (opened.length) {
    await chrome.tabs.update(opened[0].id, { active: true });
    if (blank) await chrome.tabs.remove(blank.id).catch(() => {});
  }
  return { ok: true, opened: opened.length, failed: vault.tabs.length - opened.length };
}

// Freeze and restore change the active tab, which closes the popup mid-operation, so they run here instead.
const handlers = {
  freeze: ({ windowId }) => freezeWindow(windowId),
  restore: ({ id, windowId }) => restoreVault(id, windowId),
};

chrome.runtime.onInstalled.addListener(ensureSweepAlarm);
chrome.runtime.onStartup.addListener(ensureSweepAlarm);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SWEEP_ALARM) sweepIdleTabs();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handler = handlers[message?.type];
  if (!handler) return false;
  handler(message).then(sendResponse, (err) => sendResponse({ ok: false, error: err.message }));
  return true;
});
