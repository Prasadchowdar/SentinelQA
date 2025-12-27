# SentinelQA Recorder Chrome Extension

Record browser actions and generate AI-powered test instructions for SentinelQA.

## Features

- 🔴 **Record clicks, typing, and form submissions**
- 🎯 **Smart selector generation** (data-testid → id → aria-label → text)
- 📝 **Auto-generate test instructions** in natural language
- 📋 **Copy to clipboard** or send directly to SentinelQA
- 🔄 **Navigation tracking** across page loads

## Installation

### Developer Mode (Local)

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `chrome-extension` folder from this project
5. The SentinelQA Recorder icon should appear in your toolbar

### Production (Chrome Web Store)

Coming soon!

## Usage

1. **Click the extension icon** in your Chrome toolbar
2. **Click "Start Recording"** 
3. **Perform actions** on any website (click, type, submit forms)
4. **Click "Stop Recording"** when done
5. **Copy the generated instruction** or send it to SentinelQA

## How It Works

### Smart Selector Generation

The extension generates reliable selectors with this priority:

| Priority | Selector Type | Reliability |
|----------|--------------|-------------|
| 1 | `data-testid` | 100% |
| 2 | `#id` | 95% |
| 3 | `[aria-label]` | 90% |
| 4 | `[name]` | 85% |
| 5 | `text="..."` | 80% |
| 6 | `[placeholder]` | 75% |
| 7 | `tag.class` | 60% |
| 8 | CSS path | 20% |

### Recorded Actions

The extension captures:
- **Clicks** - Button clicks, link clicks, element interactions
- **Typing** - Text input in fields
- **Selections** - Dropdown selections
- **Submissions** - Form submissions
- **Navigation** - Page navigations

### Generated Instructions

Example output:
```
Fill in "John Doe" in Full Name, "john@email.com" in Email, 
then Click on "Submit" button
```

## Development

### Project Structure

```
chrome-extension/
├── manifest.json          # Extension configuration
├── popup/
│   ├── popup.html         # Extension popup UI
│   ├── popup.css          # Popup styles
│   └── popup.js           # Popup logic
├── content/
│   ├── content.js         # Event capture on pages
│   └── content.css        # Recording indicators
├── background/
│   └── background.js      # Service worker
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### Building

No build step required - Chrome extensions use vanilla JavaScript.

### Debugging

1. Open `chrome://extensions/`
2. Click "Details" on SentinelQA Recorder
3. Click "Service worker" to open background script DevTools
4. Open any webpage, press F12, go to Console to see content script logs

## Configuration

Settings are stored in `chrome.storage.sync`:

| Setting | Default | Description |
|---------|---------|-------------|
| `backendUrl` | `http://localhost:8000` | SentinelQA backend API |
| `frontendUrl` | `http://localhost:3000` | SentinelQA frontend |

## License

MIT License - Part of SentinelQA project
