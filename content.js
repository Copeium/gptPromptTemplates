// content.js - Listener Management Fix

const PROMPT_STORAGE_KEY = 'geminiPrompts';
const ENABLED_KEY = 'isPromptExpanderEnabled';
const UNIVERSAL_INPUT_SELECTOR = 'textarea, input[type="text"], [contenteditable="true"]';

let prompts = {}; 
let isEnabled = false;
const attachedInputs = new Set(); 

// --- 1. Storage and State Management ---

function loadPromptsAndStatus() {
  chrome.storage.sync.get([PROMPT_STORAGE_KEY, ENABLED_KEY], (data) => {
    prompts = data[PROMPT_STORAGE_KEY] || {};
    isEnabled = data[ENABLED_KEY] !== false;
    
    // CRITICAL: After loading state, manage all listeners based on 'isEnabled'
    manageListeners(); 
  });
}

// --- 2. Replacement Logic (handleInput is unchanged, but now relies on listeners being present) ---

function handleInput(event) {
    // We don't need to check 'isEnabled' here anymore, because if it's disabled, 
    // this listener function will be removed by manageListeners().
    
    const inputElement = event.target;

    if (event.key === ' ') {
        let fullText;
        const isContentEditable = inputElement.getAttribute('contenteditable') === 'true';

        if (isContentEditable) {
            fullText = inputElement.innerText;
        } else {
            fullText = inputElement.value;
        }

        const textBeforeSpace = fullText.trimEnd();
        const match = textBeforeSpace.match(/(#\S+)$/);

        if (match) {
            const lastWord = match[0];
            
            if (prompts[lastWord]) {
                const replacementText = prompts[lastWord];
                const startIndex = textBeforeSpace.lastIndexOf(lastWord);
                
                let newText = textBeforeSpace.substring(0, startIndex) + replacementText + " ";
                
                if (isContentEditable) {
                    inputElement.innerText = newText;
                    moveCursorToEnd(inputElement); 
                } else {
                    inputElement.value = newText;
                }
                
                event.preventDefault();
            }
        }
    }
}

// Helper to move the cursor to the end of a contenteditable div
function moveCursorToEnd(el) {
    el.focus();
    const range = document.createRange();
    const sel = window.getSelection();

    if (el.childNodes.length > 0) {
        range.selectNodeContents(el);
        range.collapse(false);
    } else {
        range.selectNodeContents(el);
        range.collapse(false);
    }
    
    sel.removeAllRanges();
    sel.addRange(range);
}

// --- 3. Dynamic Listener Management FIX ---

function manageListeners() {
    document.querySelectorAll(UNIVERSAL_INPUT_SELECTOR).forEach(el => {
        const isCurrentlyAttached = attachedInputs.has(el);
        
        if (isEnabled && !isCurrentlyAttached) {
            // ENABLED: Add listener if it's not already attached
            el.addEventListener('keyup', handleInput);
            attachedInputs.add(el);
        } else if (!isEnabled && isCurrentlyAttached) {
            // DISABLED: Remove listener if it IS attached
            el.removeEventListener('keyup', handleInput);
            attachedInputs.delete(el);
        }
    });
}

// Create a MutationObserver to watch for new input elements loading
const observer = new MutationObserver((mutationsList, observer) => {
    // We call manageListeners, which handles both adding (if enabled) and removing (if disabled/cleanup)
    manageListeners();
});

const targetNode = document.body;
const config = { childList: true, subtree: true };

if (targetNode) {
    observer.observe(targetNode, config);
    // Initial call to manage listeners
    manageListeners(); 
}

// --- 4. Inter-Script Communication ---

// Listen for messages from the popup (for prompt/status changes)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'statusChange') {
        // Reload state, which calls manageListeners() inside
        loadPromptsAndStatus(); 
    }
});

// Start by loading the initial state
loadPromptsAndStatus();