// Main content script - CLEANED & FIXED
class LLMChatRecorder {
  constructor() {
    this.recording = false;
    this.container = null;
    this.observer = null;
    this.streamingMessages = new Map();
    this.broadcastChannel = null;
    this.selectionHint = null;
    
    this.initialize();
  }
  
  initialize() {
    this.broadcastChannel = new BroadcastChannel('llm_chat_messages');
    
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log("LLM Recorder: Received message", message.action);
      if (message.action === "startSelection") {
        this.startSelectionMode();
        sendResponse({ status: "selection_started" });
      } else if (message.action === "stopRecording") {
        this.stopRecording();
        sendResponse({ status: "recording_stopped" });
      }
      return true;
    });
    
    document.addEventListener('click', (e) => this.handleInitialClick(e), true);
  }
  
  handleInitialClick(event) {
    if (this.recording || !this.selectionHint) return;
    
    console.log("LLM Recorder: Click detected on:", event.target);
    event.preventDefault();
    event.stopPropagation();
    
    const container = this.findStableAnchor(event.target);
    
    if (container) {
      console.log("LLM Recorder: SUCCESS! Container found.");
      this.container = container;
      this.startRecording();
    } else {
      console.warn("LLM Recorder: Clicked, but couldn't find container.");
    }
  }
  
  // FIXED ALGORITHM - Finds container with most messages
  findStableAnchor(startingNode) {
    console.log("🔍 FINDING CHAT CONTAINER");
    
    let current = startingNode.nodeType === 1 ? startingNode : startingNode.parentElement;
    let bestContainer = null;
    let maxMessages = 0;
    
    // Check 12 parent levels
    for (let level = 0; level < 12 && current; level++) {
      const parent = current.parentElement;
      if (!parent) break;
      
      // Count ALL divs with message-like text in parent's subtree
      const allDivs = parent.querySelectorAll('div');
      let messageCount = 0;
      
      allDivs.forEach(div => {
        const text = (div.textContent || "").trim();
        if (text.length > 30 && text.length < 3000) {
          messageCount++;
        }
      });
      
      console.log(`${parent.className || parent.tagName}: ${messageCount} messages`);
      
      if (messageCount > maxMessages) {
        maxMessages = messageCount;
        bestContainer = parent;
      }
      
      current = parent;
    }
    
    if (bestContainer && maxMessages >= 2) {
      console.log(`✅ Found: ${bestContainer.className} with ${maxMessages} messages`);
      return bestContainer;
    }
    
    console.log("❌ No chat container found");
    return null;
  }
  
  // Selection mode methods
  startSelectionMode() {
    this.showSelectionHint();
    this.recording = false;
    this.container = null;
  }
  
  showSelectionHint() {
    if (this.selectionHint) {
      this.selectionHint.remove();
    }
    
    this.selectionHint = document.createElement('div');
    this.selectionHint.className = 'llm-recorder-selection-hint';
    this.selectionHint.textContent = 'Click on any chat message to start recording';
    document.body.appendChild(this.selectionHint);
    
    setTimeout(() => {
      if (this.selectionHint) {
        this.selectionHint.remove();
        this.selectionHint = null;
      }
    }, 10000);
  }
  
  // Recording methods
  startRecording() {
    if (!this.container) return;
    
    this.recording = true;
    this.container.classList.add('llm-recorder-outline');
    this.container.style.outline = "5px dashed blue";
    this.container.style.padding = "10px";
    
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) {
            console.log("LLM Recorder: New message detected!");
            this.startMonitoringMessage(node);
          }
        });
      });
    });
    
    this.observer.observe(this.container, { childList: true });
  }
  
  stopRecording() {
    this.recording = false;
    
    if (this.container) {
      this.container.classList.remove('llm-recorder-outline');
      this.container.style.outline = "";
      this.container.style.padding = "";
    }
    
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    
    this.streamingMessages.forEach(data => {
      if (data.timeoutId) clearTimeout(data.timeoutId);
    });
    this.streamingMessages.clear();
    
    if (this.selectionHint) {
      this.selectionHint.remove();
      this.selectionHint = null;
    }
    
    console.log('LLM Recorder: Stopped recording');
  }
  
  startMonitoringMessage(messageDiv) {
    console.log("LLM Recorder: Monitoring message for completion...");
    
    let stabilityTimer = null;
    let lastLength = 0;
    const QUIET_PERIOD = 2000;
    
    const checkCompletion = () => {
      const currentText = this.extractPlainTextMessage(messageDiv);
      const currentLength = currentText.length;
      
      const isStillGenerating = messageDiv.querySelector('.generating, .loading, .typing, [aria-busy="true"]');
      
      if (isStillGenerating) {
        console.log("LLM Recorder: Still generating...");
        return;
      }
      
      if (currentLength === lastLength && currentLength > 0) {
        console.log("LLM Recorder: Text stabilized.");
        this.finalizeMessage(messageDiv, currentText);
      } else {
        lastLength = currentLength;
      }
    };
    
    const completionObserver = new MutationObserver(() => {
      clearTimeout(stabilityTimer);
      stabilityTimer = setTimeout(checkCompletion, QUIET_PERIOD);
    });
    
    completionObserver.observe(messageDiv, {
      childList: true,
      subtree: true,
      characterData: true
    });
    
    messageDiv._completionObserver = completionObserver;
  }
  
  extractPlainTextMessage(element) {
    const clone = element.cloneNode(true);
    
    clone.querySelectorAll('i, em').forEach(el => {
      const text = el.textContent.trim();
      if (text && !text.startsWith('*')) el.textContent = `*${text}*`;
    });
    
    clone.querySelectorAll('b, strong').forEach(el => {
      const text = el.textContent.trim();
      if (text && !text.startsWith('**')) el.textContent = `**${text}**`;
    });
    
    clone.querySelectorAll('p, div, br').forEach(el => {
      if (el.tagName === 'BR') {
        el.after('\n');
      } else {
        el.prepend('\n');
        el.append('\n');
      }
    });
    
    return clone.textContent
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
  }
  
  finalizeMessage(messageDiv, finalRawText) {
    if (messageDiv._completionObserver) {
      messageDiv._completionObserver.disconnect();
    }
    
    const payload = {
      action: "new_completed_message",
      sender: this.inferSender(messageDiv),
      text: finalRawText,
      timestamp: new Date().toISOString()
    };
    
    console.log(payload);
    this.broadcastChannel.postMessage(payload);
  }
  
  inferSender(messageDiv) {
    const nameElement = messageDiv.querySelector('[class*="name"], [class*="author"], [class*="user-label"]');
    if (nameElement && nameElement.textContent) {
      return nameElement.textContent.trim();
    }
    
    const ariaLabel = messageDiv.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;
    
    const rawClass = messageDiv.className.toLowerCase();
    if (rawClass.includes('user')) return "User";
    if (rawClass.includes('assistant') || rawClass.includes('model')) return "AI";
    
    return "Unknown";
  }
  
  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: ${type === 'error' ? '#f44336' : 
                   type === 'success' ? '#4CAF50' : '#2196F3'};
      color: white;
      padding: 12px 20px;
      border-radius: 6px;
      z-index: 999999;
      font-family: sans-serif;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 3000);
  }
  
  getSourceFromDomain() {
    const hostname = window.location.hostname;
    if (hostname.includes('chat.openai.com')) return 'chatgpt';
    if (hostname.includes('claude.ai')) return 'claude';
    if (hostname.includes('gemini.google.com') || hostname.includes('bard.google.com')) return 'gemini';
    if (hostname.includes('chat.deepseek.com')) return 'deepseek';
    if (hostname.includes('groq.com')) return 'groq';
    if (hostname.includes('anthropic.com')) return 'claude';
    return 'unknown';
  }
}

// Initialize
let recorder = null;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    recorder = new LLMChatRecorder();
  });
} else {
  recorder = new LLMChatRecorder();
}