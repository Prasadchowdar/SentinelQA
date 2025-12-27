/**
 * SentinelQA Recorder - Background Service Worker
 * Manages extension state and coordinates between popup and content scripts
 */

// Track which tabs are being recorded
const recordingTabs = new Map();

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
            // Forward action to popup if it's open
            // Also store in memory for the current session
            if (sender.tab?.id) {
                const tabActions = recordingTabs.get(sender.tab.id) || [];
                tabActions.push(message.action);
                recordingTabs.set(sender.tab.id, tabActions);
            }
            break;

        case 'GET_ACTIONS':
            // Return recorded actions for a specific tab
            const actions = recordingTabs.get(message.tabId) || [];
            sendResponse({ actions });
            break;

        case 'CLEAR_ACTIONS':
            // Clear actions for a specific tab
            if (message.tabId) {
                recordingTabs.delete(message.tabId);
            }
            sendResponse({ success: true });
            break;
    }

    return true; // Keep message channel open for async responses
});

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

        const tabActions = recordingTabs.get(tabId) || [];
        tabActions.push(action);
        recordingTabs.set(tabId, tabActions);

        // Update storage
        const storageActions = (await chrome.storage.local.get(['recordedActions'])).recordedActions || [];
        storageActions.push(action);
        await chrome.storage.local.set({ recordedActions: storageActions });

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
    // Remove from memory
    recordingTabs.delete(tabId);

    // Check if this was the recording tab
    const state = await chrome.storage.local.get(['recordingTabId']);
    if (state.recordingTabId === tabId) {
        // Stop recording since tab was closed
        await chrome.storage.local.set({ isRecording: false, recordingTabId: null });
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
    } else if (details.reason === 'update') {
        console.log('[SentinelQA] Extension updated to version', chrome.runtime.getManifest().version);
    }
});

/**
 * Handle extension icon click (when no popup)
 * This is a fallback - normally popup.html handles the UI
 */
chrome.action.onClicked.addListener(async (tab) => {
    // This will only fire if default_popup is not set
    // Since we have a popup, this won't normally execute
    console.log('[SentinelQA] Extension icon clicked on tab:', tab.id);
});

// Log that service worker started
console.log('[SentinelQA] Background service worker initialized');
