Chrome:
    Go to chrome://extensions/
    Enable "Developer mode" (toggle top-right)
    Click "Load unpacked"
    Select the llm-chat-recorder folder

Firefox:
    Go to about:debugging#/runtime/this-firefox
    Click "Load Temporary Add-on"
    Select any file in the folder (like manifest.json)

Testing:
    Install the extension
    Go to any LLM chat website
    Click the extension icon
    Select text in a chat message
    See green outline appear
    Send a new message - it should broadcast after 1.5 seconds