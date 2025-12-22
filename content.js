// Main content script
class LLMChatRecorder {
  constructor() {
    this.recording = false;
    this.container = null;
    this.observer = null;
    this.streamingMessages = new Map(); // div -> {text, lastUpdate, timeoutId}
    this.broadcastChannel = null;
    this.selectionHint = null;
    
    this.initialize();
  }
  
  initialize() {
    // Create broadcast channel
    this.broadcastChannel = new BroadcastChannel('llm_chat_messages');
    
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === "startSelection") {
        this.startSelectionMode();
      } else if (message.action === "stopRecording") {
        this.stopRecording();
      }
      return true;
    });
    
    // Listen for selection events
    document.addEventListener('selectionchange', this.handleSelectionChange.bind(this));
  }
  
  // Start selection mode - show hint and wait for user to select text
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
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (this.selectionHint) {
        this.selectionHint.remove();
        this.selectionHint = null;
      }
    }, 10000);
  }
  
  // Handle text selection
  handleSelectionChange() {
    if (!this.recording && this.selectionHint) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && selection.toString().trim()) {
        const range = selection.getRangeAt(0);
        const startNode = range.startContainer;
        
        // Find container using the algorithm
        const container = this.findStableAnchor(startNode);
        
        if (container) {
          this.container = container;
          this.startRecording();
          
          // Remove selection hint
          if (this.selectionHint) {
            this.selectionHint.remove();
            this.selectionHint = null;
          }
        }
      }
    }
  }
  
  // Your algorithm implementation
  findStableAnchor(startingNode) {
    // 1. Move up to the first <div> ancestor
    let element = startingNode.nodeType === 1 ? startingNode : startingNode.parentElement;
    
    while (element && element !== document.body && element.tagName !== 'DIV') {
      element = element.parentElement;
    }
    
    if (!element || element === document.body || element.tagName !== 'DIV') {
      console.log('LLM Recorder: No suitable div found');
      return null;
    }
    
    // Now, 'element' is the Initial Div Container (D1)
    const maxWalkDepth = 20; // Safety limit
    
    // 2. Walk Up, checking only <div> parents for repetition
    for (let i = 0; i < maxWalkDepth; i++) {
      let potentialMessageContainer = element.parentElement;
      
      // Find the next <div> ancestor to test
      while (potentialMessageContainer && 
             potentialMessageContainer !== document.body && 
             potentialMessageContainer.tagName !== 'DIV') {
        potentialMessageContainer = potentialMessageContainer.parentElement;
      }
      
      if (!potentialMessageContainer || potentialMessageContainer === document.body) {
        return null; // Hit the top
      }
      
      // 3. Test for Repetition
      const repeatingSibling = this.findRepetitiveSibling(potentialMessageContainer);
      
      if (repeatingSibling) {
        // Found the Message Container
        const chatLogContainer = potentialMessageContainer.parentElement;
        console.log('LLM Recorder: Found container', chatLogContainer);
        return chatLogContainer;
      }
      
      // Move up to the next <div> ancestor
      element = potentialMessageContainer;
    }
    
    return null;
  }
  
  findRepetitiveSibling(div) {
    // Look for sibling divs with similar structure
    // This is a simplified version - you may need to adjust
    if (!div.parentElement) return null;
    
    const siblings = Array.from(div.parentElement.children).filter(
      child => child.tagName === 'DIV' && child !== div
    );
    
    // Check if any sibling has similar class structure
    for (const sibling of siblings) {
      if (this.areElementsSimilar(div, sibling)) {
        return sibling;
      }
    }
    
    return null;
  }
  
  areElementsSimilar(el1, el2) {
    // Compare classes, data attributes, etc.
    const classes1 = el1.className.split(' ').sort();
    const classes2 = el2.className.split(' ').sort();
    
    // If both have classes and share some
    if (classes1.length > 0 && classes2.length > 0) {
      const common = classes1.filter(c => classes2.includes(c));
      return common.length > 0;
    }
    
    // Or compare children structure
    return el1.children.length === el2.children.length;
  }
  
  // Start recording on the found container
  startRecording() {
    if (!this.container || this.recording) return;
    
    this.recording = true;
    
    // Add visual outline
    this.container.classList.add('llm-recorder-outline');
    
    // Notify background script
    chrome.runtime.sendMessage({ 
      action: "recordingStarted",
      containerFound: true 
    });
    
    // Start observing for new messages
    this.startObserving();
    
    console.log('LLM Recorder: Started recording');
  }
  
  stopRecording() {
    this.recording = false;
    
    // Remove visual outline
    if (this.container) {
      this.container.classList.remove('llm-recorder-outline');
    }
    
    // Stop observing
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    
    // Clear streaming timeouts
    this.streamingMessages.forEach(data => {
      if (data.timeoutId) clearTimeout(data.timeoutId);
    });
    this.streamingMessages.clear();
    
    // Remove selection hint if present
    if (this.selectionHint) {
      this.selectionHint.remove();
      this.selectionHint = null;
    }
    
    console.log('LLM Recorder: Stopped recording');
  }
  
  startObserving() {
    if (!this.container || this.observer) return;
    
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          this.handleNewNodes(mutation.addedNodes);
        }
      });
    });
    
    // Observe only the container for new children
    this.observer.observe(this.container, {
      childList: true,
      subtree: true
    });
  }
  
  handleNewNodes(nodes) {
    Array.from(nodes).forEach(node => {
      if (node.nodeType === 1) { // Element node
        // Check if this looks like a message container
        if (this.isMessageContainer(node)) {
          this.startMonitoringMessage(node);
        }
        
        // Also check children
        if (node.querySelectorAll) {
          node.querySelectorAll('*').forEach(child => {
            if (this.isMessageContainer(child)) {
              this.startMonitoringMessage(child);
            }
          });
        }
      }
    });
  }
  
  isMessageContainer(element) {
    // Heuristic: look for elements that might contain chat messages
    const text = element.textContent || '';
    const hasReasonableLength = text.length > 10 && text.length < 10000;
    const hasCommonClasses = ['message', 'chat', 'content', 'text', 'assistant', 'user']
      .some(word => element.className.toLowerCase().includes(word));
    
    return hasReasonableLength && (hasCommonClasses || element.children.length === 0);
  }
  
  startMonitoringMessage(messageDiv) {
    const messageId = Math.random().toString(36).substr(2, 9);
    
    // Initial extract
    const initialText = this.extractMessageText(messageDiv);
    const sender = this.inferSender(messageDiv);
    
    // Store in streaming map
    this.streamingMessages.set(messageDiv, {
      id: messageId,
      text: initialText,
      sender: sender,
      lastUpdate: Date.now(),
      timeoutId: null
    });
    
    // Watch for changes in this message (streaming)
    const textObserver = new MutationObserver(() => {
      const data = this.streamingMessages.get(messageDiv);
      if (data) {
        data.text = this.extractMessageText(messageDiv);
        data.lastUpdate = Date.now();
        
        // Reset timeout
        if (data.timeoutId) clearTimeout(data.timeoutId);
        
        // Set new timeout (1.5 seconds after last change)
        data.timeoutId = setTimeout(() => {
          this.broadcastMessage(data);
          this.streamingMessages.delete(messageDiv);
          textObserver.disconnect();
        }, 1500);
      }
    });
    
    textObserver.observe(messageDiv, {
      childList: true,
      subtree: true,
      characterData: true
    });
    
    // Also set an initial timeout in case no changes happen
    const data = this.streamingMessages.get(messageDiv);
    data.timeoutId = setTimeout(() => {
      this.broadcastMessage(data);
      this.streamingMessages.delete(messageDiv);
      textObserver.disconnect();
    }, 1500);
  }
  
  extractMessageText(element) {
    // Get text content but preserve formatting markers
    let text = '';
    
    // Use a recursive function to walk the DOM
    const walk = (node) => {
      if (node.nodeType === 3) { // Text node
        text += node.textContent || '';
      } else if (node.nodeType === 1) { // Element node
        // Preserve important formatting indicators
        const tag = node.tagName.toLowerCase();
        if (tag === 'code' || tag === 'pre') {
          text += '```' + (node.textContent || '') + '```';
        } else if (tag === 'strong' || tag === 'b') {
          text += '**' + (node.textContent || '') + '**';
        } else if (tag === 'em' || tag === 'i') {
          text += '*' + (node.textContent || '') + '*';
        } else {
          // Recurse through children
          Array.from(node.childNodes).forEach(walk);
        }
      }
    };
    
    walk(element);
    
    // Clean up excessive whitespace but preserve intentional line breaks
    text = text.replace(/\s+/g, ' ').trim();
    return text;
  }
  
  inferSender(messageDiv) {
    // Try to infer sender from various clues
    
    // 1. Check classes
    const className = (messageDiv.className || '').toLowerCase();
    if (className.includes('user') || className.includes('human')) return 'user';
    if (className.includes('assistant') || className.includes('ai') || className.includes('bot')) return 'assistant';
    if (className.includes('system')) return 'system';
    
    // 2. Check data attributes
    if (messageDiv.hasAttribute('data-role')) {
      const role = messageDiv.getAttribute('data-role').toLowerCase();
      if (role.includes('user')) return 'user';
      if (role.includes('assistant') || role.includes('ai')) return 'assistant';
    }
    
    // 3. Check parent classes
    let parent = messageDiv.parentElement;
    for (let i = 0; i < 3 && parent; i++) {
      const parentClass = (parent.className || '').toLowerCase();
      if (parentClass.includes('user')) return 'user';
      if (parentClass.includes('assistant') || parentClass.includes('ai')) return 'assistant';
      parent = parent.parentElement;
    }
    
    // 4. Fallback: alternate messages (very rough guess)
    const allMessages = Array.from(this.container.querySelectorAll('*'))
      .filter(el => this.isMessageContainer(el));
    const index = allMessages.indexOf(messageDiv);
    return index % 2 === 0 ? 'user' : 'assistant';
  }
  
  broadcastMessage(data) {
    if (!data.text || data.text.trim().length === 0) return;
    
    const message = {
      type: "llm_chat_message",
      version: "1.0",
      timestamp: Date.now(),
      sender: data.sender,
      text: data.text,
      source: this.getSourceFromDomain(),
      streamed: true
    };
    
    console.log('LLM Recorder: Broadcasting message', message);
    this.broadcastChannel.postMessage(message);
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

// Initialize the recorder when page loads
let recorder = null;

document.addEventListener('DOMContentLoaded', () => {
  recorder = new LLMChatRecorder();
});

// Also initialize if script loads after DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    recorder = new LLMChatRecorder();
  });
} else {
  recorder = new LLMChatRecorder();
}