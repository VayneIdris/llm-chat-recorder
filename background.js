// State management for the extension
let recordingState = {
  activeTabId: null,
  isRecording: false,
  awaitingSelection: false
};

const ICON_COLORS = {
  INACTIVE: { color: [128, 128, 128, 255], text: "" },
  AWAITING_SELECTION: { color: [255, 255, 0, 255], text: "?" },
  RECORDING: { color: [0, 255, 0, 255], text: "●" }
};

async function updateIcon(tabId, state) {
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: state.color });
    await chrome.action.setBadgeText({ tabId, text: state.text });
  } catch (e) { console.error(e); }
}

// Handle browser action clicks
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.url?.startsWith('chrome://')) return;

  if (recordingState.activeTabId === tab.id && (recordingState.isRecording || recordingState.awaitingSelection)) {
    // STOP LOGIC
    recordingState = { activeTabId: null, isRecording: false, awaitingSelection: false };
    await updateIcon(tab.id, ICON_COLORS.INACTIVE);
    
    // Catch potential "receiving end does not exist"
    try {
      await chrome.tabs.sendMessage(tab.id, { action: "stopRecording" });
    } catch(e) { console.log("Tab closed or script not injected."); }

  } else {
    // START LOGIC
    recordingState.awaitingSelection = true;
    recordingState.activeTabId = tab.id;
    await updateIcon(tab.id, ICON_COLORS.AWAITING_SELECTION);
    
    try {
      await chrome.tabs.sendMessage(tab.id, { action: "startSelection" });
    } catch(e) { 
      console.error("Content script not ready. Refreshing tab...");
      await chrome.tabs.reload(tab.id);
    }
  }
});

// Handle tab updates/removals
chrome.tabs.onRemoved.addListener((tabId) => {
  if (recordingState.activeTabId === tabId) {
    recordingState.activeTabId = null;
    recordingState.isRecording = false;
    recordingState.awaitingSelection = false;
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (recordingState.activeTabId === tabId && changeInfo.url) {
    // Tab navigated, stop recording
    recordingState.activeTabId = null;
    recordingState.isRecording = false;
    recordingState.awaitingSelection = false;
    updateIcon(tabId, ICON_COLORS.INACTIVE);
  }
});

// Initialize icon state
chrome.runtime.onInstalled.addListener(() => {
  // Set default icon state
  chrome.action.setBadgeText({ text: "" });
});


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "recordingStarted") {
    recordingState.isRecording = true;
    recordingState.awaitingSelection = false;
    updateIcon(sender.tab.id, ICON_COLORS.RECORDING);
    sendResponse({ status: "acknowledged" });
  }
  return true; 
});