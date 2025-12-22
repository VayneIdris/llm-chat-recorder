// State management for the extension
let recordingState = {
  activeTabId: null,
  isRecording: false,
  awaitingSelection: false
};

// Icon colors for different states
const ICON_COLORS = {
  INACTIVE: { color: [128, 128, 128, 255] },  // Gray
  AWAITING_SELECTION: { color: [255, 255, 0, 255] },  // Yellow
  RECORDING: { color: [0, 255, 0, 255] }  // Green
};

// Update the extension icon
async function updateIcon(tabId, state) {
  try {
    await chrome.action.setIcon({
      tabId: tabId,
      path: {
        "16": "icons/icon16.png",
        "48": "icons/icon48.png",
        "128": "icons/icon128.png"
      }
    });
    
    await chrome.action.setBadgeBackgroundColor({
      tabId: tabId,
      color: state.color
    });
    
    await chrome.action.setBadgeText({
      tabId: tabId,
      text: state === ICON_COLORS.RECORDING ? "●" : ""
    });
  } catch (error) {
    console.error("Error updating icon:", error);
  }
}

// Handle browser action clicks
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) {
    return;
  }

  if (recordingState.activeTabId === tab.id && recordingState.isRecording) {
    // Stop recording
    recordingState.isRecording = false;
    recordingState.awaitingSelection = false;
    recordingState.activeTabId = null;
    
    await updateIcon(tab.id, ICON_COLORS.INACTIVE);
    
    // Send stop command to content script
    await chrome.tabs.sendMessage(tab.id, { action: "stopRecording" });
    
  } else if (!recordingState.isRecording) {
    // Start recording process
    recordingState.awaitingSelection = true;
    recordingState.activeTabId = tab.id;
    
    await updateIcon(tab.id, ICON_COLORS.AWAITING_SELECTION);
    
    // Send start selection command to content script
    await chrome.tabs.sendMessage(tab.id, { action: "startSelection" });
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