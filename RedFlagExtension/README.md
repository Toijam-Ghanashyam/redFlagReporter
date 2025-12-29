# Red Flag Report - Chrome Extension

A Chrome Extension that scans signup pages for Terms of Service and Privacy Policy links, then uses the Gemini API to summarize potential red flags into 3 concerning bullet points.

## Features

- 🔍 Automatically detects Sign Up buttons on web pages
- 📄 Finds and fetches Terms of Service and Privacy Policy links
- 🤖 Uses Google's Gemini API to analyze legal documents
- ⚠️ Displays 3 key red flags in a sleek dark-mode sidebar overlay
- 🎨 Beautiful "Ghostwriter" overlay that slides in from the right

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked" and select the extension directory
5. Click the extension icon and enter your Gemini API key

## Setup

1. Get a Gemini API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Click the extension icon in Chrome
3. Enter your API key and click "Save Settings"

## Usage

Simply visit any website with a Sign Up button. The extension will automatically:
1. Detect the signup button
2. Find Terms of Service/Privacy Policy links
3. Fetch and analyze the legal documents
4. Display red flags in the sidebar overlay

## Files

- `manifest.json` - Extension manifest (v3)
- `content.js` - Main content script that scans pages and processes legal documents
- `style.css` - Styles for the Ghostwriter overlay
- `popup.html` - Settings popup UI
- `popup.js` - Settings popup logic

## Privacy

This extension processes legal documents using Google's Gemini API. No data is stored locally except for your API key (stored in Chrome's sync storage).

## License

MIT


