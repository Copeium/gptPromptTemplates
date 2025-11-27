// popup.js
const PROMPT_STORAGE_KEY = 'geminiPrompts';
const ENABLED_KEY = 'isPromptExpanderEnabled';

const promptsListEl = document.getElementById('promptsList');
const saveButton = document.getElementById('saveButton');
const shortcutInput = document.getElementById('shortcut');
const expansionInput = document.getElementById('expansion');
const enableToggle = document.getElementById('enableToggle');

let currentPrompts = {};

// --- CRUD Functions (Create, Read, Update, Delete) ---

/**
 * Loads all prompts and the enabled status from storage.
 */
function loadAll() {
  chrome.storage.sync.get([PROMPT_STORAGE_KEY, ENABLED_KEY], (data) => {
    currentPrompts = data[PROMPT_STORAGE_KEY] || {};
    // Checkbox state: true unless explicitly set to false
    enableToggle.checked = data[ENABLED_KEY] !== false; 
    renderPrompts();
  });
}

/**
 * Renders the list of prompts to the popup UI.
 */
function renderPrompts() {
  promptsListEl.innerHTML = '<h3>Current Prompts</h3>'; // Clear and re-add heading
  
  if (Object.keys(currentPrompts).length === 0) {
      promptsListEl.innerHTML += '<p style="font-size: 0.9rem; color: #999; margin-left: 10px;">No prompts saved yet. Add one above!</p>';
      return;
  }

  for (const shortcut in currentPrompts) {
    const expansion = currentPrompts[shortcut];
    const item = document.createElement('div');
    item.className = 'prompt-item';
    
    // Structure for better visibility, same as before
    item.innerHTML = `
      <div class="prompt-header">
        <span class="prompt-shortcut">${shortcut}</span>
        <div class="prompt-actions">
          <button data-shortcut="${shortcut}" class="editBtn">Edit</button>
          <button data-shortcut="${shortcut}" class="deleteBtn">Delete</button>
        </div>
      </div>
      <div class="prompt-expansion">${expansion}</div>
    `;
    promptsListEl.appendChild(item);
  }
}

/**
 * Handles saving a new or edited prompt.
 */
saveButton.addEventListener('click', () => {
  let shortcut = shortcutInput.value.trim();
  const expansion = expansionInput.value.trim();

  if (!shortcut || !expansion) {
    alert('Both shortcut and expansion text are required.');
    return;
  }
  
  // Enforce the '#' prefix
  if (!shortcut.startsWith('#')) {
    shortcut = '#' + shortcut;
  }
  
  currentPrompts[shortcut] = expansion;

  chrome.storage.sync.set({ [PROMPT_STORAGE_KEY]: currentPrompts }, () => {
    // Notify the content script to reload the prompts
    notifyContentScript('statusChange');
    loadAll(); // Re-render the list immediately
    shortcutInput.value = '';
    expansionInput.value = '';
  });
});

/**
 * Handles edit and delete actions via event delegation.
 */
promptsListEl.addEventListener('click', (e) => {
  const target = e.target;
  const shortcut = target.dataset.shortcut;

  if (target.className.includes('deleteBtn') && confirm(`Delete prompt ${shortcut}?`)) {
    delete currentPrompts[shortcut];
    chrome.storage.sync.set({ [PROMPT_STORAGE_KEY]: currentPrompts }, () => {
      notifyContentScript('statusChange');
      loadAll(); // Re-render the list immediately
    });
  } else if (target.className.includes('editBtn')) {
    // Populate the form with the current prompt for editing
    shortcutInput.value = shortcut;
    expansionInput.value = currentPrompts[shortcut];
  }
});

// --- Status Toggle ---

/**
 * Handles the enable/disable toggle.
 */
enableToggle.addEventListener('change', () => {
  const isEnabled = enableToggle.checked;
  chrome.storage.sync.set({ [ENABLED_KEY]: isEnabled }, () => {
    // Notify the content script of the status change
    notifyContentScript('statusChange'); 
  });
});

// --- Communication ---

/**
 * Sends a message to the content script running on gemini.google.com
 */
function notifyContentScript(action) {
  chrome.tabs.query({url: "https://gemini.google.com/*"}, function(tabs) {
    if (tabs.length > 0) {
      // Send the message to the first matching tab
      chrome.tabs.sendMessage(tabs[0].id, { action: action });
    }
  });
}

// 🔑 CRITICAL FIX: Start the process by loading everything when the popup opens
loadAll();