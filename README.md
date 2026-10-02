# Tab Warden

A small Chrome extension that keeps tab-heavy browsing under control.

- **Hibernation**: every 5 minutes, tabs you haven't looked at in 15 minutes are discarded to free memory. They reload when you click them. Active, pinned and audible tabs are never touched.
- **Tabs**: the popup lists open tabs with how long each has been idle, longest first. Tabs can be hibernated one at a time or all at once.
- **Freeze Session**: saves every tab in the current window to a vault and closes them, leaving a single blank tab. Vaults can be restored or deleted later from the popup.

## Install

Tab Warden isn't on the Chrome Web Store, so you load it yourself. It takes about a minute.

### 1. Download it

1. On this repo's page, click the green **Code** button.
2. Click **Download ZIP**.
3. Unzip the file. You'll get a folder called `chrome-optimizer-main`.
4. Move that folder somewhere you won't delete by accident, like your Documents folder. Chrome loads the extension from this folder, so it has to stay there.

If you use git, `git clone` the repo instead.

### 2. Load it into Chrome

1. Open a new tab and go to `chrome://extensions`.
2. Turn on **Developer mode** with the switch in the top right corner.
3. Click **Load unpacked** (top left).
4. Select the `chrome-optimizer-main` folder, the one that has `manifest.json` directly inside it, and click **Select**.

Tab Warden now shows up in your list of extensions.

> If Chrome says "Manifest file is missing or unreadable", you picked the wrong folder. Unzipping sometimes creates a folder inside a folder; pick the inner one.

### 3. Pin it to the toolbar

1. Click the puzzle piece icon to the right of the address bar.
2. Click the pin next to **Tab Warden**.

Its icon (a letter "T", since it doesn't ship its own icon) now sits in the toolbar. Click it any time to open the popup.

## Using it

### Hibernation

You don't need to do anything. Once installed, Tab Warden checks your tabs every 5 minutes and puts any tab you haven't opened in the last 15 minutes to sleep. A sleeping tab stays in the tab bar with its title and icon, but stops using memory. Click it and it reloads where you left off.

These tabs are never put to sleep:

- the tab you're currently looking at in each window
- pinned tabs (right-click a tab, then **Pin**)
- tabs playing sound

Tip: pin anything you never want reloaded, like a music player or a page with a form you're halfway through.

### The Tabs list

Click the Tab Warden icon. The **Tabs** section lists every open tab:

- **"12 min idle"** means you haven't looked at that tab in 12 minutes.
- **Hibernated** means it's already asleep.
- **Active** is the tab you're on right now.

Click **Discard** on a row to put that tab to sleep right away, without waiting for the 15 minutes.

Click **Hibernate all** to put every tab to sleep at once. The same tabs as above are left alone: the one you're on in each window, pinned tabs, and tabs playing sound.

### Freeze Session

Use this when you're done with a group of tabs for now but want them back later, like research for an assignment.

1. Go to the window you want to save.
2. Click the Tab Warden icon, then **Freeze Session**.

Every tab in that window is saved and closed, and you're left with one empty tab. Pinned tabs come back pinned when you restore them.

Chrome's own pages (settings, `chrome://` pages, the extensions page) can't be saved, so they're skipped. The vault shows how many were skipped.

### Frozen Vaults

Every frozen session shows up under **Frozen Vaults**, newest first, with the date, the number of tabs, and the first few titles.

- **Restore** opens all of its tabs in your current window. If the window only has an empty new tab in it, that tab is closed for you.
- **Delete** removes the vault for good.

Restoring a vault doesn't delete it, so you can restore the same session more than once. Up to 50 vaults are kept; past that, the oldest ones are dropped.

## Updating

1. Download the new version the same way, and replace the old folder with it.
2. Go to `chrome://extensions` and click the reload arrow on the Tab Warden card.

Your saved vaults are kept.

## Removing

Go to `chrome://extensions` and click **Remove** on the Tab Warden card. This also deletes your saved vaults, so restore anything you still need first.

## FAQ

**A tab reloaded when I clicked it. Is that normal?**
Yes. That's how hibernation frees memory. Most sites come back as they were, but unsaved text in a form can be lost. Pin those tabs.

**A tab has been idle for over 15 minutes and isn't hibernated.**
The check runs every 5 minutes, so it can take up to 20 minutes. Pinned tabs, tabs playing sound, and the tab you're on are always skipped.

**Chrome shows a "Disable developer mode extensions" popup when it starts.**
Chrome shows that for every extension loaded this way. Click the X to close it; Tab Warden keeps working.

**Does it send my data anywhere?**
No. Vaults are stored in Chrome on your computer and only contain the address, title and pinned state of each tab.

## Files

| File | What it does |
| --- | --- |
| `manifest.json` | Extension manifest (MV3) |
| `background.js` | Service worker: idle sweep, freeze and restore |
| `popup.html` | Popup layout and styles |
| `popup.js` | Tab list, freeze button, vault list |

## License

MIT
