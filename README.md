# Tab Warden

A small Chrome extension that keeps tab-heavy browsing under control.

- **Hibernation**: every 5 minutes, tabs you haven't looked at in 15 minutes are discarded to free memory. They reload when you click them. Active, pinned and audible tabs are never touched.
- **Memory**: the popup lists open tabs by memory use, heaviest first. Anything over 400 MB gets flagged, and any tab except the active one can be discarded with one click.
- **Freeze Session**: saves every tab in the current window to a vault and closes them, leaving a single blank tab. Vaults can be restored or deleted later from the popup.

## Install

1. Clone or download this repo.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and pick the repo folder.

## Notes

- Live memory numbers use the `chrome.processes` API, which only exists on the [Chrome Dev channel](https://www.google.com/chrome/dev/). On regular Chrome the memory panel says so, and everything else works normally. Chrome may also show a warning about the `processes` permission on the extensions page; it's harmless.
- Memory is reported per process. Chrome sometimes runs several tabs in one process, so those tabs show the same figure with a "shared" tag.
- Internal pages (`chrome://`, `about:`, other extensions) can't be reopened, so Freeze Session skips them and shows how many were skipped.
- Up to 50 vaults are kept. Once you go past that, the oldest ones are dropped.
- Nothing leaves your machine. Vaults are stored in `chrome.storage.local` and only hold URLs, titles and pinned state.

## Files

| File | What it does |
| --- | --- |
| `manifest.json` | Extension manifest (MV3) |
| `background.js` | Service worker: idle sweep, freeze and restore |
| `popup.html` | Popup layout and styles |
| `popup.js` | Memory list, freeze button, vault list |

## License

MIT
