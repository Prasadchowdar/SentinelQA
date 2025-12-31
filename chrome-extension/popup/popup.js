/**
 * SentinelQA Recorder - Popup Logic
 * Handles UI interactions and communication with content/background scripts
 * 
 * KEY FIX: Actions are now loaded from persistent storage and updated via
 * storage change listener, surviving popup close/reopen cycles.
 */

// DOM Elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const copyBtn = document.getElementById('copyBtn');
const sendBtn = document.getElementById('sendBtn');
const clearBtn = document.getElementById('clearBtn');
const statusBanner = document.getElementById('statusBanner');
const statusText = document.getElementById('statusText');
const currentUrlEl = document.getElementById('currentUrl');
const actionsContainer = document.getElementById('actionsContainer');
const actionsList = document.getElementById('actionsList');
const actionCount = document.getElementById('actionCount');
const resultContainer = document.getElementById('resultContainer');
const generatedInstruction = document.getElementById('generatedInstruction');
const clearContainer = document.getElementById('clearContainer');

// State
let isRecording = false;
let recordedActions = [];
let currentTabId = null;
let currentUrl = '';

/**
 * Initialize popup
 */
async function init() {
    console.log('[SentinelQA Popup] Initializing...');

    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabId = tab.id;
    currentUrl = tab.url;
    currentUrlEl.textContent = currentUrl;

    // Load existing state from storage
    await loadStateFromStorage();

    // Listen for storage changes (when background script saves new actions)
    chrome.storage.onChanged.addListener(handleStorageChange);

    // Also listen for direct messages from background
    chrome.runtime.onMessage.addListener(handleMessage);

    console.log('[SentinelQA Popup] Initialized. Recording:', isRecording, 'Actions:', recordedActions.length);
}

/**
 * Load state from storage
 */
async function loadStateFromStorage() {
    const state = await chrome.storage.local.get(['isRecording', 'recordedActions', 'recordingTabId']);

    console.log('[SentinelQA Popup] Loaded state:', state);

    isRecording = state.isRecording || false;
    recordedActions = state.recordedActions || [];

    // Update UI based on state
    if (isRecording && state.recordingTabId === currentTabId) {
        updateUI();
    } else if (recordedActions.length > 0 && !isRecording) {
        // Show previous recording results
        showResults();
    } else {
        // Reset to initial state
        startBtn.classList.remove('hidden');
        stopBtn.classList.add('hidden');
        statusBanner.classList.add('hidden');
        actionsContainer.classList.add('hidden');
        resultContainer.classList.add('hidden');
        clearContainer.classList.add('hidden');
    }
}

/**
 * Handle storage changes (real-time updates from background script)
 */
function handleStorageChange(changes, areaName) {
    if (areaName !== 'local') return;

    console.log('[SentinelQA Popup] Storage changed:', Object.keys(changes));

    if (changes.recordedActions) {
        recordedActions = changes.recordedActions.newValue || [];
        console.log('[SentinelQA Popup] Actions updated:', recordedActions.length);
        updateActionsList();
    }

    if (changes.isRecording) {
        isRecording = changes.isRecording.newValue || false;
        updateUI();
    }
}

/**
 * Handle messages from background script
 */
function handleMessage(message, sender, sendResponse) {
    console.log('[SentinelQA Popup] Message received:', message.type);

    if (message.type === 'ACTIONS_UPDATED') {
        recordedActions = message.actions || [];
        updateActionsList();
    }
}

/**
 * Start recording
 */
async function startRecording() {
    console.log('[SentinelQA Popup] Starting recording...');

    isRecording = true;
    recordedActions = [];

    // Save state to storage
    await chrome.storage.local.set({
        isRecording: true,
        recordedActions: [],
        recordingTabId: currentTabId,
        recordingUrl: currentUrl
    });

    // Notify content script to start recording
    try {
        await chrome.tabs.sendMessage(currentTabId, { type: 'START_RECORDING' });
        console.log('[SentinelQA Popup] Content script notified');
    } catch (error) {
        console.error('[SentinelQA Popup] Error notifying content script:', error);
        // Try to inject the content script first
        try {
            await chrome.scripting.executeScript({
                target: { tabId: currentTabId },
                files: ['content/content.js']
            });
            await chrome.tabs.sendMessage(currentTabId, { type: 'START_RECORDING' });
        } catch (e) {
            console.error('[SentinelQA Popup] Failed to inject content script:', e);
        }
    }

    updateUI();
}

/**
 * Stop recording
 */
async function stopRecording() {
    console.log('[SentinelQA Popup] Stopping recording...');

    isRecording = false;

    // Save state
    await chrome.storage.local.set({ isRecording: false });

    // Notify content script to stop recording
    try {
        await chrome.tabs.sendMessage(currentTabId, { type: 'STOP_RECORDING' });
    } catch (error) {
        console.error('[SentinelQA Popup] Error stopping content script:', error);
    }

    // Reload actions from storage (in case we missed any)
    const state = await chrome.storage.local.get(['recordedActions']);
    recordedActions = state.recordedActions || [];

    showResults();
}

/**
 * Update UI based on current state
 */
function updateUI() {
    if (isRecording) {
        startBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
        statusBanner.classList.remove('hidden', 'stopped');
        statusText.textContent = 'Recording...';
        actionsContainer.classList.remove('hidden');
        resultContainer.classList.add('hidden');
        clearContainer.classList.add('hidden');
    } else {
        startBtn.classList.remove('hidden');
        stopBtn.classList.add('hidden');
        statusBanner.classList.add('hidden');
        actionsContainer.classList.add('hidden');
    }

    updateActionsList();
}

/**
 * Update the actions list display
 */
function updateActionsList() {
    actionsList.innerHTML = '';
    actionCount.textContent = recordedActions.length;

    recordedActions.forEach((action, index) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span class="action-number">${index + 1}</span>
            <span class="action-text">
                <span class="action-type">${action.type}</span>: ${action.description || action.selector || 'Unknown'}
            </span>
        `;
        actionsList.appendChild(li);
    });

    // Scroll to bottom
    actionsList.scrollTop = actionsList.scrollHeight;

    console.log('[SentinelQA Popup] UI updated with', recordedActions.length, 'actions');
}

/**
 * Show results after recording stops
 */
function showResults() {
    startBtn.classList.add('hidden');
    stopBtn.classList.add('hidden');
    statusBanner.classList.remove('hidden');
    statusBanner.classList.add('stopped');
    statusText.textContent = `Recording complete - ${recordedActions.length} actions`;

    actionsContainer.classList.remove('hidden');
    resultContainer.classList.remove('hidden');
    clearContainer.classList.remove('hidden');

    updateActionsList();

    // Generate test instruction
    const instruction = generateTestInstruction();
    generatedInstruction.value = instruction;
}

/**
 * Generate natural language test instruction from recorded actions
 */
function generateTestInstruction() {
    if (recordedActions.length === 0) {
        return 'No actions recorded.';
    }

    // Build instruction parts
    const parts = [];

    // Group and simplify actions
    let currentForm = null;
    const simplifiedActions = [];

    for (const action of recordedActions) {
        // Skip clicks on input fields (just focus events)
        if (action.type === 'click' && action.elementType === 'input') {
            continue;
        }

        // Group consecutive type actions into a form
        if (action.type === 'type') {
            if (currentForm === null) {
                currentForm = { type: 'form', fields: [] };
                simplifiedActions.push(currentForm);
            }
            currentForm.fields.push({
                label: action.fieldLabel || action.fieldName || 'field',
                value: action.value
            });
        } else {
            // Non-type action - close any open form group
            currentForm = null;
            simplifiedActions.push(action);
        }
    }

    // Generate instruction text
    for (const action of simplifiedActions) {
        if (action.type === 'form' && action.fields && action.fields.length > 0) {
            const fieldTexts = action.fields.map(f => `"${f.value}" in ${f.label}`).join(', ');
            parts.push(`Fill in ${fieldTexts}`);
        } else if (action.type === 'click') {
            const target = action.elementText || action.description || 'element';
            parts.push(`Click on "${target}"`);
        } else if (action.type === 'navigate') {
            parts.push(`Navigate to ${action.url}`);
        } else if (action.type === 'submit') {
            parts.push(`Submit the form`);
        } else if (action.type === 'select') {
            parts.push(`Select "${action.value}" from ${action.fieldLabel || 'dropdown'}`);
        }
    }

    // Combine into single instruction
    if (parts.length === 0) {
        try {
            const urlObj = new URL(currentUrl);
            return `Test the page at ${urlObj.hostname}${urlObj.pathname}`;
        } catch {
            return 'Test the current page';
        }
    }

    return parts.join(', then ');
}

/**
 * Copy instruction to clipboard
 */
async function copyToClipboard() {
    const instruction = generatedInstruction.value;
    await navigator.clipboard.writeText(instruction);

    // Show feedback
    const originalText = copyBtn.innerHTML;
    copyBtn.innerHTML = '✓ Copied!';
    copyBtn.style.background = '#22c55e';
    copyBtn.style.color = 'white';

    setTimeout(() => {
        copyBtn.innerHTML = originalText;
        copyBtn.style.background = '';
        copyBtn.style.color = '';
    }, 2000);
}

/**
 * Send test to SentinelQA backend
 */
async function sendToSentinelQA() {
    const instruction = generatedInstruction.value;

    // Get backend URL from storage or use default
    const settings = await chrome.storage.sync.get(['backendUrl', 'apiKey']);
    const backendUrl = settings.backendUrl || 'http://localhost:8000';

    try {
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<span class="loading"></span> Sending...';

        // Open SentinelQA with pre-filled data
        const params = new URLSearchParams({
            url: currentUrl,
            instruction: instruction
        });

        // Open SentinelQA frontend
        chrome.tabs.create({
            url: `http://localhost:3000/new-test?${params.toString()}`
        });

    } catch (error) {
        console.error('Error sending to SentinelQA:', error);
        alert('Failed to send to SentinelQA. Please check your connection.');
    } finally {
        sendBtn.disabled = false;
        sendBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
            Send to SentinelQA
        `;
    }
}

/**
 * Clear recording and start fresh
 */
async function clearRecording() {
    recordedActions = [];
    isRecording = false;

    await chrome.storage.local.set({
        isRecording: false,
        recordedActions: [],
        recordingTabId: null
    });

    // Reset UI
    startBtn.classList.remove('hidden');
    stopBtn.classList.add('hidden');
    statusBanner.classList.add('hidden');
    actionsContainer.classList.add('hidden');
    resultContainer.classList.add('hidden');
    clearContainer.classList.add('hidden');
    actionsList.innerHTML = '';
    generatedInstruction.value = '';
}

// Event Listeners
startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
copyBtn.addEventListener('click', copyToClipboard);
sendBtn.addEventListener('click', sendToSentinelQA);
clearBtn.addEventListener('click', clearRecording);

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
