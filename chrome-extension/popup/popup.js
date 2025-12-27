/**
 * SentinelQA Recorder - Popup Logic
 * Handles UI interactions and communication with content/background scripts
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
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabId = tab.id;
    currentUrl = tab.url;
    currentUrlEl.textContent = currentUrl;

    // Load existing state from storage
    const state = await chrome.storage.local.get(['isRecording', 'recordedActions', 'recordingTabId']);

    if (state.isRecording && state.recordingTabId === currentTabId) {
        isRecording = true;
        recordedActions = state.recordedActions || [];
        updateUI();
    } else if (state.recordedActions && state.recordedActions.length > 0 && !state.isRecording) {
        // Show previous recording results
        recordedActions = state.recordedActions;
        showResults();
    }

    // Listen for action updates from content script
    chrome.runtime.onMessage.addListener(handleMessage);
}

/**
 * Handle messages from content script
 */
function handleMessage(message, sender, sendResponse) {
    if (message.type === 'ACTION_RECORDED' && sender.tab?.id === currentTabId) {
        recordedActions.push(message.action);
        updateActionsList();
        // Save to storage
        chrome.storage.local.set({ recordedActions });
    }
}

/**
 * Start recording
 */
async function startRecording() {
    isRecording = true;
    recordedActions = [];

    // Save state
    await chrome.storage.local.set({
        isRecording: true,
        recordedActions: [],
        recordingTabId: currentTabId,
        recordingUrl: currentUrl
    });

    // Notify content script to start recording
    await chrome.tabs.sendMessage(currentTabId, { type: 'START_RECORDING' });

    updateUI();
}

/**
 * Stop recording
 */
async function stopRecording() {
    isRecording = false;

    // Save state
    await chrome.storage.local.set({ isRecording: false });

    // Notify content script to stop recording
    await chrome.tabs.sendMessage(currentTabId, { type: 'STOP_RECORDING' });

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
        <span class="action-type">${action.type}</span>: ${action.description}
      </span>
    `;
        actionsList.appendChild(li);
    });

    // Scroll to bottom
    actionsList.scrollTop = actionsList.scrollHeight;
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

    // Add URL context (but shortened)
    const urlObj = new URL(currentUrl);

    // Group and simplify actions
    let currentForm = null;
    const simplifiedActions = [];

    for (const action of recordedActions) {
        if (action.type === 'click' && action.elementType === 'input') {
            // Skip clicks on input fields (focus events)
            continue;
        }

        if (action.type === 'type' && currentForm === null) {
            currentForm = { type: 'form', fields: [] };
            simplifiedActions.push(currentForm);
        }

        if (action.type === 'type' && currentForm) {
            currentForm.fields.push({
                label: action.fieldLabel || action.fieldName || 'field',
                value: action.value
            });
        } else if (action.type !== 'type') {
            currentForm = null;
            simplifiedActions.push(action);
        }
    }

    // Generate instruction text
    for (const action of simplifiedActions) {
        if (action.type === 'form') {
            const fieldTexts = action.fields.map(f => `"${f.value}" in ${f.label}`).join(', ');
            parts.push(`Fill in ${fieldTexts}`);
        } else if (action.type === 'click') {
            parts.push(`Click on "${action.elementText || action.description}"`);
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
        return `Test the page at ${urlObj.hostname}${urlObj.pathname}`;
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

        // For now, open SentinelQA with pre-filled data
        // In production, this would make an API call
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
