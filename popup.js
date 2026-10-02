const LEAK_THRESHOLD_MB = 400;
const REFRESH_MS = 3000;
const VAULT_KEY = 'vaults';
const PREVIEW_TITLES = 3;
const BYTES_PER_MB = 1024 * 1024;

const memoryNote = document.getElementById('memory-note');
const memoryList = document.getElementById('memory-list');
const memoryStatus = document.getElementById('memory-status');
const freezeButton = document.getElementById('freeze');
const freezeStatus = document.getElementById('freeze-status');
const vaultList = document.getElementById('vault-list');
const vaultsEmpty = document.getElementById('vaults-empty');
const vaultStatus = document.getElementById('vault-status');

let refreshTimer;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label, onClick) {
  const node = el('button', '', label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function showStatus(target, text, isError = false) {
  target.textContent = text;
  target.classList.toggle('error', isError);
}

async function currentWindowId() {
  const win = await chrome.windows.getCurrent();
  return win.id;
}

function callProcesses(method, ...args) {
  return new Promise((resolve, reject) => {
    chrome.processes[method](...args, (result) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(result);
    });
  });
}

async function readTabMemory() {
  const tabs = await chrome.tabs.query({ discarded: false });
  const pids = await Promise.all(
    tabs.map((tab) => callProcesses('getProcessIdForTab', tab.id).catch(() => -1)),
  );
  const uniquePids = [...new Set(pids.filter((pid) => pid > 0))];
  if (!uniquePids.length) return [];

  const processes = await callProcesses('getProcessInfo', uniquePids, true);
  const tabsPerPid = new Map();
  for (const pid of pids) tabsPerPid.set(pid, (tabsPerPid.get(pid) ?? 0) + 1);

  return tabs
    .flatMap((tab, i) => {
      const info = processes[pids[i]];
      if (info?.privateMemory === undefined) return [];
      const mb = Math.round((info.privateMemory / BYTES_PER_MB) * 10) / 10;
      return [{ tab, mb, sharedBy: tabsPerPid.get(pids[i]) }];
    })
    .sort((a, b) => b.mb - a.mb);
}

function buildFavicon(url) {
  if (!url) return el('span', 'favicon');
  const img = el('img', 'favicon');
  img.alt = '';
  img.addEventListener('error', () => img.replaceWith(el('span', 'favicon')), { once: true });
  img.src = url;
  return img;
}

function buildMemoryRow({ tab, mb, sharedBy }) {
  const row = el('li', 'row');
  const label = tab.title || tab.url || 'Untitled';
  const title = el('span', 'title', label);
  title.title = label;
  row.append(buildFavicon(tab.favIconUrl), title);

  if (mb > LEAK_THRESHOLD_MB) row.append(el('span', 'badge', 'Memory Leak'));
  if (sharedBy > 1) {
    const shared = el('span', 'shared', `shared ×${sharedBy}`);
    shared.title = `This process hosts ${sharedBy} tabs. The figure covers all of them.`;
    row.append(shared);
  }

  const discard = button('Discard', () => discardTab(tab.id));
  discard.disabled = tab.active;
  if (tab.active) discard.title = 'The active tab cannot be discarded';
  row.append(el('span', 'mb', `${mb.toFixed(1)} MB`), discard);
  return row;
}

async function refreshMemory() {
  try {
    const rows = await readTabMemory();
    memoryList.replaceChildren(...rows.map(buildMemoryRow));
    showStatus(memoryStatus, rows.length ? '' : 'No active tab processes to show.');
  } catch (err) {
    showStatus(memoryStatus, `Could not read memory use: ${err.message}`, true);
  }
}

function scheduleMemoryRefresh() {
  refreshTimer = setTimeout(async () => {
    await refreshMemory();
    scheduleMemoryRefresh();
  }, REFRESH_MS);
}

async function discardTab(id) {
  try {
    await chrome.tabs.discard(id);
  } catch {
    showStatus(memoryStatus, 'That tab could not be discarded.', true);
    return;
  }
  refreshMemory();
}

function startMemoryPanel() {
  // chrome.processes exists only on the Dev channel; on Stable the namespace is missing even with the permission declared.
  if (typeof chrome.processes === 'undefined') {
    memoryNote.textContent = 'Live memory tracking needs the Chrome Dev channel. Tab hibernation and sessions work normally.';
    memoryNote.hidden = false;
    return;
  }
  refreshMemory().then(scheduleMemoryRefresh);
  window.addEventListener('pagehide', () => clearTimeout(refreshTimer));
}

async function freezeSession() {
  freezeButton.disabled = true;
  showStatus(freezeStatus, '');
  try {
    const res = await chrome.runtime.sendMessage({ type: 'freeze', windowId: await currentWindowId() });
    if (!res.ok) throw new Error(res.error);
    if (res.saved === 0) {
      showStatus(freezeStatus, 'Nothing in this window can be reopened later.');
    } else {
      const skipped = res.skipped ? `, skipped ${plural(res.skipped, 'internal page')}` : '';
      showStatus(freezeStatus, `Frozen ${plural(res.saved, 'tab')}${skipped}.`);
    }
  } catch (err) {
    showStatus(freezeStatus, `Freeze failed: ${err.message}`, true);
  } finally {
    freezeButton.disabled = false;
  }
}

async function readVaults() {
  const { [VAULT_KEY]: vaults = [] } = await chrome.storage.local.get(VAULT_KEY);
  return vaults;
}

async function restoreVault(id) {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'restore', id, windowId: await currentWindowId() });
    if (!res.ok) throw new Error(res.error);
    if (res.failed) {
      showStatus(vaultStatus, `Restored ${plural(res.opened, 'tab')}. ${res.failed} could not be opened.`, true);
    }
  } catch (err) {
    showStatus(vaultStatus, `Restore failed: ${err.message}`, true);
  }
}

async function deleteVault(id) {
  try {
    const vaults = await readVaults();
    await chrome.storage.local.set({ [VAULT_KEY]: vaults.filter((v) => v.id !== id) });
  } catch (err) {
    showStatus(vaultStatus, `Delete failed: ${err.message}`, true);
  }
}

function formatPreview(tabs) {
  const titles = tabs.slice(0, PREVIEW_TITLES).map((t) => t.title).join(' · ');
  const rest = tabs.length - PREVIEW_TITLES;
  return rest > 0 ? `${titles} +${rest} more` : titles;
}

function buildVaultRow(vault) {
  const when = new Date(vault.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const skipped = vault.skipped ? `, ${vault.skipped} skipped` : '';

  const meta = el('div', 'vault-meta');
  meta.append(el('strong', '', when), el('span', 'vault-count', ` · ${plural(vault.tabs.length, 'tab')}${skipped}`));

  const head = el('div', 'vault-head');
  head.append(meta, button('Restore', () => restoreVault(vault.id)), button('Delete', () => deleteVault(vault.id)));

  const preview = el('div', 'vault-preview', formatPreview(vault.tabs));
  preview.title = vault.tabs.map((t) => t.title).join('\n');

  const row = el('li', 'vault');
  row.append(head, preview);
  return row;
}

async function renderVaults() {
  try {
    const vaults = await readVaults();
    vaultList.replaceChildren(...vaults.map(buildVaultRow));
    vaultsEmpty.hidden = vaults.length > 0;
  } catch (err) {
    showStatus(vaultStatus, `Could not load vaults: ${err.message}`, true);
  }
}

freezeButton.addEventListener('click', freezeSession);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && VAULT_KEY in changes) renderVaults();
});

startMemoryPanel();
renderVaults();
