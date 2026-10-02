const REFRESH_MS = 5000;
const VAULT_KEY = 'vaults';
const PREVIEW_TITLES = 3;
const MINUTE_MS = 60 * 1000;

const tabSummary = document.getElementById('tab-summary');
const tabList = document.getElementById('tab-list');
const tabStatus = document.getElementById('tab-status');
const hibernateAllButton = document.getElementById('hibernate-all');
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

function describeState(tab, now) {
  if (tab.active) return 'Active';
  if (tab.discarded) return 'Hibernated';
  if (typeof tab.lastAccessed !== 'number') return '';
  const min = Math.floor((now - tab.lastAccessed) / MINUTE_MS);
  if (min < 1) return 'Just now';
  return min < 60 ? `${min} min idle` : `${Math.floor(min / 60)} h idle`;
}

// Longest-idle awake tabs first, since those are the ones worth discarding by hand.
function compareTabs(a, b) {
  if (a.discarded !== b.discarded) return a.discarded ? 1 : -1;
  return (a.lastAccessed ?? Infinity) - (b.lastAccessed ?? Infinity);
}

function canHibernate(tab) {
  return !tab.active && !tab.pinned && !tab.audible && !tab.discarded;
}

function buildFavicon(url) {
  if (!url) return el('span', 'favicon');
  const img = el('img', 'favicon');
  img.alt = '';
  img.addEventListener('error', () => img.replaceWith(el('span', 'favicon')), { once: true });
  img.src = url;
  return img;
}

function buildTabRow(tab, now) {
  const row = el('li', tab.discarded ? 'row hibernated' : 'row');
  const label = tab.title || tab.url || 'Untitled';
  const title = el('span', 'title', label);
  title.title = label;

  const discard = button('Discard', () => discardTab(tab.id));
  discard.disabled = tab.active || tab.discarded;
  if (tab.active) discard.title = 'The active tab cannot be discarded';

  row.append(buildFavicon(tab.favIconUrl), title, el('span', 'state', describeState(tab, now)), discard);
  return row;
}

async function refreshTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    const now = Date.now();
    const hibernated = tabs.filter((tab) => tab.discarded).length;
    tabList.replaceChildren(...tabs.sort(compareTabs).map((tab) => buildTabRow(tab, now)));
    tabSummary.textContent = `${tabs.length} open, ${hibernated} hibernated`;
    hibernateAllButton.disabled = !tabs.some(canHibernate);
  } catch (err) {
    showStatus(tabStatus, `Could not read tabs: ${err.message}`, true);
  }
}

function scheduleTabRefresh() {
  refreshTimer = setTimeout(async () => {
    await refreshTabs();
    scheduleTabRefresh();
  }, REFRESH_MS);
}

async function discardTab(id) {
  showStatus(tabStatus, '');
  try {
    await chrome.tabs.discard(id);
  } catch {
    showStatus(tabStatus, 'That tab could not be discarded.', true);
    return;
  }
  refreshTabs();
}

async function hibernateAll() {
  hibernateAllButton.disabled = true;
  showStatus(tabStatus, '');
  try {
    const tabs = (await chrome.tabs.query({})).filter(canHibernate);
    const results = await Promise.allSettled(tabs.map((tab) => chrome.tabs.discard(tab.id)));
    // discard() resolves with undefined instead of rejecting when Chrome declines a tab.
    const done = results.filter((r) => r.status === 'fulfilled' && r.value).length;
    const missed = tabs.length - done;
    showStatus(tabStatus, `Hibernated ${plural(done, 'tab')}.${missed ? ` ${missed} could not be hibernated.` : ''}`, missed > 0);
  } catch (err) {
    showStatus(tabStatus, `Hibernate failed: ${err.message}`, true);
  }
  refreshTabs();
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

hibernateAllButton.addEventListener('click', hibernateAll);
freezeButton.addEventListener('click', freezeSession);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && VAULT_KEY in changes) renderVaults();
});

refreshTabs().then(scheduleTabRefresh);
window.addEventListener('pagehide', () => clearTimeout(refreshTimer));
renderVaults();
