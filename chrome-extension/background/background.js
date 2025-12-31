/**
 * SentinelQA Recorder - Background Service Worker
 * Manages extension state and coordinates between popup and content scripts
 * 
 * KEY FIX: Actions are now persistently saved to chrome.storage.local
 * so they survive popup close/reopen cycles.
 */

/**
 * Handle messages from popup and content scripts
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case 'GET_TAB_ID':
            // Respond with the sender's tab ID
            sendResponse({ tabId: sender.tab?.id });
            break;

        case 'ACTION_RECORDED':
            // CRITICAL FIX: Save action to persistent storage immediately
            handleActionRecorded(message.action, sender.tab?.id);
            sendResponse({ success: true });
            break;

        case 'GET_ACTIONS':
            // Return recorded actions from storage
            getActionsFromStorage().then(actions => {
                sendResponse({ actions });
            });
            return true; // Keep channel open for async response

        case 'CLEAR_ACTIONS':
            // Clear all recorded actions
            chrome.storage.local.set({ recordedActions: [] });
            sendResponse({ success: true });
            break;

        case 'START_RECORDING':
            // Forward to content script
            if (message.tabId) {
                chrome.tabs.sendMessage(message.tabId, { type: 'START_RECORDING' });
            }
            break;

        case 'STOP_RECORDING':
            // Forward to content script  
            if (message.tabId) {
                chrome.tabs.sendMessage(message.tabId, { type: 'STOP_RECORDING' });
            }
            break;
    }

    return true; // Keep message channel open for async responses
});

/**
 * Handle a recorded action - save it persistently
 */
async function handleActionRecorded(action, tabId) {
    try {
        // Get current state
        const state = await chrome.storage.local.get(['isRecording', 'recordingTabId', 'recordedActions']);

        // Only save if we're still recording the same tab
        if (!state.isRecording) {
            console.log('[SentinelQA] Ignoring action - not recording');
            return;
        }

        // Get existing actions or create new array
        const actions = state.recordedActions || [];

        // Add new action with tabId
        action.tabId = tabId;
        actions.push(action);

        // Save back to storage
        await chrome.storage.local.set({ recordedActions: actions });

        console.log('[SentinelQA] Action saved:', action.type, '- Total:', actions.length);

        // Also notify popup if it's open (popup will update UI)
        try {
            chrome.runtime.sendMessage({
                type: 'ACTIONS_UPDATED',
                actions: actions,
                count: actions.length
            });
        } catch (e) {
            // Popup is closed, that's okay - actions are saved to storage
        }

    } catch (error) {
        console.error('[SentinelQA] Error saving action:', error);
    }
}

/**
 * Get actions from storage
 */
async function getActionsFromStorage() {
    const state = await chrome.storage.local.get(['recordedActions']);
    return state.recordedActions || [];
}

/**
 * Handle tab updated events
 * Re-inject content script if needed after navigation
 */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Only act on completed page loads
    if (changeInfo.status !== 'complete') return;

    // Check if this tab is being recorded
    const state = await chrome.storage.local.get(['isRecording', 'recordingTabId']);

    if (state.isRecording && state.recordingTabId === tabId) {
        // Record the navigation event
        const action = {
            type: 'navigate',
            url: tab.url,
            description: `Navigated to ${new URL(tab.url).hostname}${new URL(tab.url).pathname}`,
            timestamp: new Date().toISOString()
        };

        // Save navigation action
        await handleActionRecorded(action, tabId);

        // Re-inject content script after navigation
        try {
            await chrome.scripting.executeScript({
                target: { tabId },
                files: ['content/content.js']
            });

            await chrome.scripting.insertCSS({
                target: { tabId },
                files: ['content/content.css']
            });

            // Tell content script to resume recording
            await chrome.tabs.sendMessage(tabId, { type: 'START_RECORDING' });
            console.log('[SentinelQA] Re-injected content script after navigation');
        } catch (error) {
            console.error('[SentinelQA] Error re-injecting content script:', error);
        }
    }
});

/**
 * Handle tab closed events
 * Clean up recording state if the recorded tab is closed
 */
chrome.tabs.onRemoved.addListener(async (tabId) => {
    // Check if this was the recording tab
    const state = await chrome.storage.local.get(['recordingTabId']);
    if (state.recordingTabId === tabId) {
        // Stop recording since tab was closed
        await chrome.storage.local.set({ isRecording: false, recordingTabId: null });
        console.log('[SentinelQA] Recording tab closed, stopping recording');
    }
});

/**
 * Handle extension installed/updated
 */
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('[SentinelQA] Extension installed!');

        // Set default settings
        chrome.storage.sync.set({
            backendUrl: 'http://localhost:8000',
            frontendUrl: 'http://localhost:3000'
        });

        // Initialize empty actions array
        chrome.storage.local.set({ recordedActions: [], isRecording: false });
    } else if (details.reason === 'update') {
        console.log('[SentinelQA] Extension updated to version', chrome.runtime.getManifest().version);
    }
});

// Log that service worker started
console.log('[SentinelQA] Background service worker initialized');
