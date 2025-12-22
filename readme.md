# LLM Chat Recorder Browser Extension

A browser extension that captures LLM chat messages from sites like ChatGPT, Claude, Gemini, and others, then broadcasts them to other tabs via the BroadcastChannel API.

## Features

- **One-click setup**: Click extension icon, select any chat message, start recording
- **Universal detection**: Works on most LLM chat websites with smart container detection
- **Streaming-aware**: Waits for complete messages (1.5s after streaming stops)
- **Formatting preserved**: Keeps *italics*, **bold**, `code`, and other roleplay formatting
- **Cross-tab broadcast**: Sends messages via BroadcastChannel API for other apps to receive
- **Visual feedback**: Green outline shows detected chat area, clear status indicators

## Installation

### Development (Unpacked)

1. **Clone or download** this repository
2. **Open browser extensions page**:
   - Chrome: `chrome://extensions/`
   - Firefox: `about:debugging#/runtime/this-firefox`
3. **Enable Developer Mode** (Chrome) or use **Load Temporary Add-on** (Firefox)
4. **Load unpacked extension** and select the `llm-chat-recorder` folder

### From Store (Future)
*Coming soon...*

## How to Use

1. **Visit** any LLM chat site (ChatGPT, Claude, Gemini, etc.)
2. **Click** the LLM Chat Recorder extension icon
3. **Select text** in any chat message (click and drag over some text)
4. **See green outline** around the detected chat container
5. **Continue chatting** - new messages will be captured automatically
6. **Listen** in your other app using BroadcastChannel API

## Listening to Messages

In your other application (running in a separate tab/window):

```javascript
// Create a listener for LLM chat messages
const channel = new BroadcastChannel('llm_chat_messages');

channel.onmessage = (event) => {
  if (event.data.type === 'llm_chat_message') {
    const message = event.data;
    console.log('New message received:', {
      text: message.text,
      sender: message.sender,  // 'user', 'assistant', or 'system'
      timestamp: new Date(message.timestamp),
      source: message.source   // 'chatgpt', 'claude', etc.
    });
    // Process the message in your app...
  }
};
```

### Message Format

```javascript
{
  type: "llm_chat_message",
  version: "1.0",
  timestamp: 1737472234567,  // Unix timestamp in milliseconds
  sender: "user",            // "user", "assistant", or "system"
  text: "Hello *there*! How are _you_ today?",  // Text with formatting markers
  source: "chatgpt",         // Detected source: 'chatgpt', 'claude', 'gemini', etc.
  streamed: true             // Whether the message arrived via streaming
}
```

## Supported Sites

- ✅ ChatGPT (chat.openai.com)
- ✅ Claude (claude.ai, anthropic.com)
- ✅ Google Gemini/Bard (gemini.google.com)
- ✅ DeepSeek Chat (chat.deepseek.com)
- ✅ Groq (groq.com)
- ✅ Kindroid
- ✅ Most other LLM chat interfaces

## How It Works

### 1. Container Detection
Uses a custom algorithm (`FindStableAnchor_DivOnly`) to:
- Start from selected text in a chat message
- Walk up the DOM tree looking for repeating div structures
- Identify the stable chat container that holds all messages
- Outline it in green for visual confirmation

### 2. Message Monitoring
- Observes the container with `MutationObserver`
- Detects new message elements as they're added
- Handles streaming responses by waiting for pauses

### 3. Broadcasting
- Uses `BroadcastChannel` API for cross-tab communication
- No external servers - all data stays in your browser
- Compatible with any web app listening on the same channel

## Project Structure

```
llm-chat-recorder/
├── manifest.json           # Extension manifest
├── background.js          # Background service worker
├── content.js            # Main content script
├── styles/
│   └── overlay.css       # Visual styles for outlines/hints
├── popup/
│   ├── popup.html        # Extension popup UI
│   └── popup.js          # Popup logic
└── icons/                # Extension icons (various sizes)
```

## Browser Compatibility

- ✅ Google Chrome (Manifest V3)
- ✅ Mozilla Firefox (WebExtensions)
- ⚠️ Safari (not yet tested, may need adjustments)
- ⚠️ Edge (should work with Chrome compatibility)

## Development

### Prerequisites
- Basic understanding of browser extensions
- Modern browser (Chrome 88+ or Firefox 89+)

### Building
No build process required - it's vanilla JavaScript. Just load the unpacked extension.

### Testing
1. Load the extension in developer mode
2. Visit an LLM chat site
3. Test the workflow:
   - Icon state changes
   - Container detection
   - Message capture
   - Broadcast reception

## Troubleshooting

### "Could not find chat container"
- Try selecting different text in the chat
- Some sites use non-standard structures
- The algorithm works best with div-based layouts

### Messages not broadcasting
- Check that your listening app is on same origin
- Verify BroadcastChannel is supported (modern browsers)
- Check console for errors (F12 → Console)

### Streaming detection issues
- Adjust the timeout in `content.js` (default: 1500ms)
- Some sites may need longer/shorter delays

## Privacy & Security

🔒 **No data leaves your browser**
- All processing happens locally
- No external servers or analytics
- No data collection
- Open source - inspect the code yourself

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues, questions, or feature requests:
1. Check the [Issues](../../issues) page
2. Create a new issue with details about your problem
3. Include: Browser version, site URL, steps to reproduce

---

**Happy chatting!** 🎤✨
