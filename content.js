// Main content script - DOM-REPLACEMENT RESISTANT VERSION
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
  
  // IMPROVED: Find the MOST STABLE parent (highest in tree with messages)
  findStableAnchor(startingNode) {
    console.log("🔍 FINDING STABLE CHAT CONTAINER");
    
    let current = startingNode.nodeType === 1 ? startingNode : startingNode.parentElement;
    let bestContainer = null;
    let maxMessages = 0;
    let containers = [];
    
    // Check 15 parent levels
    for (let level = 0; level < 15 && current; level++) {
      const parent = current.parentElement;
      if (!parent) break;
      
      // Count messages in this parent's subtree
      const messageCount = this.countMessagesInSubtree(parent);
      
      console.log(`${parent.className || parent.tagName}: ${messageCount} messages`);
      
      containers.push({
        element: parent,
        level: level,
        messageCount: messageCount,
        className: parent.className || parent.tagName
      });
      
      if (messageCount > maxMessages) {
        maxMessages = messageCount;
        bestContainer = parent;
      }
      
      current = parent;
    }
    
    // Try to find a STABLE container (not too deep, has many messages)
    let stableContainer = null;
    for (const container of containers) {
      // Good stability criteria:
      // 1. Has multiple messages (>= 3)
      // 2. Not too deep in tree (level <= 8)
      // 3. Has a reasonable class name (not generic)
      if (container.messageCount >= 3 && 
          container.level <= 8 &&
          container.className.length > 10) { // Not too generic
        stableContainer = container.element;
        console.log(`🏆 Stable candidate: ${container.className} (level ${container.level}, ${container.messageCount} msgs)`);
        break;
      }
    }
    
    // Fallback to best container
    const finalContainer = stableContainer || bestContainer;
    
    if (finalContainer && maxMessages >= 2) {
      console.log(`✅ Using container: ${finalContainer.className} with ${maxMessages} messages`);
      return finalContainer;
    }
    
    console.log("❌ No suitable chat container found");
    return null;
  }
  
  countMessagesInSubtree(element) {
    const allDivs = element.querySelectorAll('div');
    let messageCount = 0;
    
    allDivs.forEach(div => {
      const text = (div.textContent || "").trim();
      if (text.length > 30 && text.length < 3000) {
        messageCount++;
      }
    });
    
    return messageCount;
  }
  
  // COMPLETELY REVISED: Watches for new messages in a resilient way
  startRecording() {
    if (!this.container) return;
    
    this.recording = true;
    this.container.classList.add('llm-recorder-outline');
    this.container.style.outline = "5px dashed blue";
    this.container.style.padding = "10px";
    
    console.log("🎬 STARTING RESILIENT RECORDING");
    console.log("Container:", this.container.className);
    
    // Track known messages to avoid duplicates
    this.knownMessageIds = new Set();
    
    // Function to scan for new messages
    const scanForNewMessages = () => {
      if (!this.recording || !this.container) return;
      
      const allDivs = this.container.querySelectorAll('div');
      const newMessages = [];
      
      allDivs.forEach(div => {
        if (this.isLikelyMessageDiv(div)) {
          const messageId = this.getMessageId(div);
          
          if (!this.knownMessageIds.has(messageId)) {
            this.knownMessageIds.add(messageId);
            newMessages.push(div);
            console.log(`📝 Found new message: ${messageId}`);
          }
        }
      });
      
      // Start monitoring new messages
      newMessages.forEach(messageDiv => {
        this.startMonitoringMessage(messageDiv);
      });
      
      if (newMessages.length > 0) {
        console.log(`✅ Started monitoring ${newMessages.length} new messages`);
      }
    };
    
    // Initial scan
    scanForNewMessages();
    
    // Set up periodic scanning (as backup to MutationObserver)
    this.scanInterval = setInterval(scanForNewMessages, 3000);
    
    // ALSO use MutationObserver for real-time detection
    this.observer = new MutationObserver((mutations) => {
      if (!this.recording) return;
      
      let foundNewMessages = false;
      
      mutations.forEach(mutation => {
        // Check added nodes
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) { // Element
            // Check if this is a message div
            if (node.tagName === 'DIV' && this.isLikelyMessageDiv(node)) {
              const messageId = this.getMessageId(node);
              if (!this.knownMessageIds.has(messageId)) {
                this.knownMessageIds.add(messageId);
                console.log("🎯 MutationObserver detected new message:", messageId);
                this.startMonitoringMessage(node);
                foundNewMessages = true;
              }
            }
            
            // Also check children
            if (node.querySelectorAll) {
              node.querySelectorAll('div').forEach(childDiv => {
                if (this.isLikelyMessageDiv(childDiv)) {
                  const messageId = this.getMessageId(childDiv);
                  if (!this.knownMessageIds.has(messageId)) {
                    this.knownMessageIds.add(messageId);
                    console.log("🎯 Found message in child:", messageId);
                    this.startMonitoringMessage(childDiv);
                    foundNewMessages = true;
                  }
                }
              });
            }
          }
        });
        
        // Handle removals
        if (mutation.removedNodes.length > 0) {
          console.log(`⚠️ ${mutation.removedNodes.length} nodes removed`);
          
          // Check if our container is still in DOM
          if (!document.body.contains(this.container)) {
            console.log("❌ CONTAINER REMOVED! Attempting to recover...");
            this.attemptContainerRecovery();
          }
        }
      });
      
      if (foundNewMessages) {
        console.log("✅ Processed new messages from mutations");
      }
    });
    
    // OBSERVE THE DOCUMENT BODY instead of just container (more stable!)
    this.observer.observe(document.body, { 
      childList: true, 
      subtree: true,
      attributes: false,
      characterData: false
    });
    
    console.log("✅ Resilient recording started!");
  }
  
  // Generate unique ID for a message div
  getMessageId(div) {
    // Use combination of text hash and position
    const text = (div.textContent || "").trim();
    const textHash = text.length > 0 ? 
      text.split('').reduce((a, b) => (((a << 5) - a) + b.charCodeAt(0)) | 0, 0) : 
      0;
    
    const className = div.className || '';
    const parentChain = [];
    let parent = div.parentElement;
    
    for (let i = 0; i < 3 && parent; i++) {
      parentChain.push(parent.className || parent.tagName);
      parent = parent.parentElement;
    }
    
    return `${textHash}-${className}-${parentChain.join('-')}`;
  }
  
  // Attempt to recover if container is removed
  attemptContainerRecovery() {
    console.log("🔄 Attempting container recovery...");
    
    // Stop current recording
    this.stopRecording();
    
    // Look for any chat-like containers in the document
    const allDivs = document.querySelectorAll('div');
    let bestContainer = null;
    let maxMessages = 0;
    
    allDivs.forEach(div => {
      const messageCount = this.countMessagesInSubtree(div);
      if (messageCount > maxMessages && messageCount >= 3) {
        maxMessages = messageCount;
        bestContainer = div;
      }
    });
    
    if (bestContainer) {
      console.log(`✅ Recovered container: ${bestContainer.className} with ${maxMessages} messages`);
      this.container = bestContainer;
      this.startRecording();
    } else {
      console.log("❌ Could not recover container");
    }
  }
  
  isLikelyMessageDiv(div) {
    if (div.tagName !== 'DIV') return false;
    
    const text = (div.textContent || "").trim();
    const hasReasonableText = text.length > 50 && text.length < 10000;
    
    if (!hasReasonableText) return false;
    
    // Additional checks
    const className = (div.className || "").toLowerCase();
    const hasMessageClass = className.includes('message') || 
                           className.includes('chat') || 
                           className.includes('bubble') ||
                           className.includes('response') ||
                           className.includes('content') ||
                           className.includes('model-response');
    
    const hasMessageAttr = div.hasAttribute('data-message') || 
                          div.hasAttribute('role') && 
                          (div.getAttribute('role') === 'article' || 
                           div.getAttribute('role') === 'listitem');
    
    // Look for specific Gemini patterns
    const isGeminiMessage = className.includes('ng-tns-c') && 
                           (className.includes('response') || 
                            className.includes('message'));
    
    return hasMessageClass || hasMessageAttr || isGeminiMessage;
  }
  
  startMonitoringMessage(messageDiv) {
    console.log("👀 STARTING MESSAGE MONITOR");
    console.log("Div classes:", messageDiv.className);
    console.log("Text preview:", (messageDiv.textContent || "").substring(0, 100));
    
    // Skip if already monitoring
    const messageId = this.getMessageId(messageDiv);
    if (this.streamingMessages.has(messageId)) {
      console.log("Already monitoring this message");
      return;
    }
    
    let checkCount = 0;
    const MAX_CHECKS = 15;
    
    const checkAndCapture = () => {
      checkCount++;
      
      const text = this.extractPlainTextMessage(messageDiv);
      const currentLength = text.length;
      
      console.log(`🔍 Check ${checkCount}/${MAX_CHECKS}: Length = ${currentLength}`);
      
      // Check if message is complete
      const isComplete = this.isMessageComplete(messageDiv, text);
      
      if (isComplete || checkCount >= MAX_CHECKS) {
        console.log("✅ Message complete! Capturing...");
        this.captureMessage(messageDiv, text);
        this.streamingMessages.delete(messageId);
      } else {
        // Schedule next check
        setTimeout(checkAndCapture, 1000);
      }
    };
    
    // Store monitoring state
    this.streamingMessages.set(messageId, {
      startTime: Date.now(),
      lastCheck: Date.now()
    });
    
    // Start checking
    setTimeout(checkAndCapture, 1500);
  }
  
  isMessageComplete(messageDiv, currentText) {
    // Check for "typing" indicators
    const isGenerating = messageDiv.querySelector('.generating, .loading, .typing, [aria-busy="true"]');
    if (isGenerating) {
      console.log("⏳ Still generating...");
      return false;
    }
    
    // Check if text ends with completion markers
    const trimmedText = currentText.trim();
    const endsWithPunctuation = /[.!?。！？]$/.test(trimmedText);
    const endsWithCompleteThought = trimmedText.length > 0 && 
                                   (endsWithPunctuation || 
                                    trimmedText.includes('\n\n') ||
                                    trimmedText.length > 500); // Long enough
    
    return endsWithCompleteThought;
  }
  
  captureMessage(messageDiv, text) {
    console.log("💬 CAPTURING FINAL MESSAGE");
    console.log("Length:", text.length);
    console.log("Preview:", text.substring(0, 150));
    
    const payload = {
      action: "new_completed_message",
      sender: this.inferSender(messageDiv),
      text: text,
      timestamp: new Date().toISOString(),
      source: window.location.hostname
    };
    
    // Log to console
    console.log("📤 MESSAGE CAPTURED:");
    console.log("From:", payload.sender);
    console.log("Text:", payload.text);
    console.log("---");
    
    // Send via broadcast channel
    this.broadcastChannel.postMessage(payload);
    
    // Visual feedback
    messageDiv.style.backgroundColor = 'rgba(76, 175, 80, 0.2)';
    setTimeout(() => {
      messageDiv.style.backgroundColor = '';
    }, 2000);
  }
  
  // Rest of the class remains the same...
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
      } else if (el.tagName === 'P' || el.tagName === 'DIV') {
        el.prepend('\n');
        el.append('\n');
      }
    });
    
    return clone.textContent
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
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
  
  stopRecording() {
    this.recording = false;
    
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    
    if (this.container) {
      this.container.classList.remove('llm-recorder-outline');
      this.container.style.outline = "";
      this.container.style.padding = "";
    }
    
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    
    this.streamingMessages.forEach((data, messageId) => {
      // Clear any timeouts if needed
    });
    this.streamingMessages.clear();
    this.knownMessageIds = new Set();
    
    if (this.selectionHint) {
      this.selectionHint.remove();
      this.selectionHint = null;
    }
    
    console.log('LLM Recorder: Stopped recording');
  }
  
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