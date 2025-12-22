document.addEventListener('DOMContentLoaded', async () => {
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  const statusDescription = document.getElementById('statusDescription');
  const statusBox = document.getElementById('statusBox');
  const actionButton = document.getElementById('actionButton');
  
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  // Check recording status
  chrome.runtime.sendMessage({ action: "getStatus", tabId: tab.id }, (response) => {
    updateUI(response || { isRecording: false, awaitingSelection: false });
  });
  
  // Update UI based on status
  function updateUI(status) {
    if (status.awaitingSelection) {
      // Awaiting selection mode
      statusIndicator.className = 'status-indicator status-awaiting';
      statusText.textContent = 'Awaiting Selection';
      statusDescription.textContent = 'Click on any chat message to start recording';
      statusBox.className = 'status-box status-awaiting-box';
      actionButton.textContent = 'Cancel Selection';
      actionButton.className = 'button button-stop';
    } else if (status.isRecording) {
      // Recording active
      statusIndicator.className = 'status-indicator status-recording';
      statusText.textContent = 'Recording Active';
      statusDescription.textContent = 'New messages are being captured';
      statusBox.className = 'status-box status-recording-box';
      actionButton.textContent = 'Stop Recording';
      actionButton.className = 'button button-stop';
    } else {
      // Inactive
      statusIndicator.className = 'status-indicator status-inactive';
      statusText.textContent = 'Inactive';
      statusDescription.textContent = 'Click the extension icon to start recording';
      statusBox.className = 'status-box status-inactive-box';
      actionButton.textContent = 'Start Recording';
      actionButton.className = 'button';
    }
  }
  
  // Handle button click
  actionButton.addEventListener('click', async () => {
    // Simulate clicking the extension icon
    chrome.runtime.sendMessage({ action: "toggleRecording", tabId: tab.id }, (response) => {
      if (response) {
        updateUI(response);
      }
      // Close popup after action
      window.close();
    });
  });
  
  // Listen for status updates
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "statusUpdated") {
      updateUI(message.status);
    }
  });
});