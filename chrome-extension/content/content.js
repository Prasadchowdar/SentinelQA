/**
 * SentinelQA Recorder - Content Script
 * Injected into web pages to capture user interactions
 */

// State
let isRecording = false;
let lastClickTime = 0;
const DEBOUNCE_MS = 100;

/**
 * Generate the best possible selector for an element
 * Uses a priority-based approach for reliability
 */
function generateSelector(element) {
    // Priority 1: data-testid (best practice)
    if (element.dataset && element.dataset.testid) {
        return {
            selector: `[data-testid="${element.dataset.testid}"]`,
            type: 'testid',
            reliability: 100
        };
    }

    // Priority 2: Unique ID
    if (element.id && !element.id.match(/^[0-9]|[:]/)) {
        // Check if ID is unique
        if (document.querySelectorAll(`#${CSS.escape(element.id)}`).length === 1) {
            return {
                selector: `#${element.id}`,
                type: 'id',
                reliability: 95
            };
        }
    }

    // Priority 3: aria-label
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
        const selector = `[aria-label="${ariaLabel}"]`;
        if (document.querySelectorAll(selector).length === 1) {
            return {
                selector,
                type: 'aria-label',
                reliability: 90
            };
        }
    }

    // Priority 4: name attribute (for form elements)
    if (element.name) {
        const tag = element.tagName.toLowerCase();
        const selector = `${tag}[name="${element.name}"]`;
        if (document.querySelectorAll(selector).length === 1) {
            return {
                selector,
                type: 'name',
                reliability: 85
            };
        }
    }

    // Priority 5: Unique text content (for buttons/links)
    const text = element.textContent?.trim();
    if (text && text.length > 0 && text.length < 50) {
        const tag = element.tagName.toLowerCase();
        if (['button', 'a', 'span'].includes(tag)) {
            // Check if text is unique for this element type
            const sameTextElements = Array.from(document.querySelectorAll(tag))
                .filter(el => el.textContent?.trim() === text);
            if (sameTextElements.length === 1) {
                return {
                    selector: `text="${text}"`,
                    type: 'text',
                    reliability: 80
                };
            }
        }
    }

    // Priority 6: Type + placeholder (for inputs)
    if (element.tagName.toLowerCase() === 'input' && element.placeholder) {
        const selector = `input[placeholder="${element.placeholder}"]`;
        if (document.querySelectorAll(selector).length === 1) {
            return {
                selector,
                type: 'placeholder',
                reliability: 75
            };
        }
    }

    // Priority 7: Combination of tag + class (semantic classes only)
    const classes = Array.from(element.classList || [])
        .filter(c => !c.match(/^(mt-|mb-|p-|m-|flex|grid|w-|h-|text-|bg-|border)/))
        .slice(0, 2);

    if (classes.length > 0) {
        const tag = element.tagName.toLowerCase();
        const classSelector = classes.map(c => `.${CSS.escape(c)}`).join('');
        const selector = `${tag}${classSelector}`;
        if (document.querySelectorAll(selector).length === 1) {
            return {
                selector,
                type: 'class',
                reliability: 60
            };
        }
    }

    // Priority 8: Role attribute
    const role = element.getAttribute('role');
    if (role) {
        const selector = `[role="${role}"]`;
        const count = document.querySelectorAll(selector).length;
        if (count === 1) {
            return {
                selector,
                type: 'role',
                reliability: 55
            };
        }
    }

    // Fallback: CSS path (least reliable)
    return {
        selector: getCssPath(element),
        type: 'css-path',
        reliability: 20
    };
}

/**
 * Get CSS path to element (fallback selector)
 */
function getCssPath(element) {
    const path = [];
    let current = element;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
        let selector = current.tagName.toLowerCase();

        if (current.id) {
            selector = `#${CSS.escape(current.id)}`;
            path.unshift(selector);
            break;
        }

        const siblings = Array.from(current.parentNode?.children || []);
        const sameTagSiblings = siblings.filter(s => s.tagName === current.tagName);

        if (sameTagSiblings.length > 1) {
            const index = sameTagSiblings.indexOf(current) + 1;
            selector += `:nth-of-type(${index})`;
        }

        path.unshift(selector);
        current = current.parentNode;
    }

    return path.join(' > ');
}

/**
 * Get human-readable description of an element
 */
function getElementDescription(element) {
    const tag = element.tagName.toLowerCase();
    const text = element.textContent?.trim().substring(0, 30);
    const ariaLabel = element.getAttribute('aria-label');
    const placeholder = element.placeholder;
    const value = element.value;
    const type = element.type;
    const name = element.name;

    // Button or link with text
    if (text && ['button', 'a'].includes(tag)) {
        return text;
    }

    // Input with label
    if (tag === 'input' || tag === 'textarea') {
        // Try to find associated label
        const label = findAssociatedLabel(element);
        if (label) return label;
        if (placeholder) return placeholder;
        if (ariaLabel) return ariaLabel;
        if (name) return name;
        return `${type || 'text'} input`;
    }

    // Select dropdown
    if (tag === 'select') {
        const label = findAssociatedLabel(element);
        if (label) return label;
        if (name) return name;
        return 'dropdown';
    }

    // Aria-label
    if (ariaLabel) return ariaLabel;

    // Generic description
    return text || `${tag} element`;
}

/**
 * Find the label associated with a form element
 */
function findAssociatedLabel(element) {
    // Check for explicit label via 'for' attribute
    if (element.id) {
        const label = document.querySelector(`label[for="${element.id}"]`);
        if (label) return label.textContent?.trim();
    }

    // Check for wrapping label
    const parentLabel = element.closest('label');
    if (parentLabel) {
        // Get label text excluding input value
        const clone = parentLabel.cloneNode(true);
        const inputs = clone.querySelectorAll('input, textarea, select');
        inputs.forEach(i => i.remove());
        return clone.textContent?.trim();
    }

    // Check for aria-labelledby
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
        const labelEl = document.getElementById(labelledBy);
        if (labelEl) return labelEl.textContent?.trim();
    }

    return null;
}

/**
 * Record a click action
 */
function handleClick(event) {
    if (!isRecording) return;

    // Debounce rapid clicks
    const now = Date.now();
    if (now - lastClickTime < DEBOUNCE_MS) return;
    lastClickTime = now;

    const element = event.target;
    const selectorInfo = generateSelector(element);
    const description = getElementDescription(element);

    const action = {
        type: 'click',
        selector: selectorInfo.selector,
        selectorType: selectorInfo.type,
        reliability: selectorInfo.reliability,
        elementText: element.textContent?.trim().substring(0, 50),
        elementType: element.tagName.toLowerCase(),
        description: description,
        timestamp: new Date().toISOString(),
        url: window.location.href
    };

    // Send to popup
    chrome.runtime.sendMessage({ type: 'ACTION_RECORDED', action });

    // Visual feedback
    showRecordingIndicator(element);
}

/**
 * Record an input/change action
 */
function handleInput(event) {
    if (!isRecording) return;

    const element = event.target;
    if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)) return;

    const selectorInfo = generateSelector(element);
    const fieldLabel = findAssociatedLabel(element) || getElementDescription(element);

    const action = {
        type: element.tagName === 'SELECT' ? 'select' : 'type',
        selector: selectorInfo.selector,
        selectorType: selectorInfo.type,
        reliability: selectorInfo.reliability,
        value: element.value,
        fieldLabel: fieldLabel,
        fieldName: element.name,
        elementType: element.tagName.toLowerCase(),
        inputType: element.type,
        description: `${fieldLabel}: "${element.value}"`,
        timestamp: new Date().toISOString(),
        url: window.location.href
    };

    // Send to popup
    chrome.runtime.sendMessage({ type: 'ACTION_RECORDED', action });
}

/**
 * Record form submission
 */
function handleSubmit(event) {
    if (!isRecording) return;

    const form = event.target;
    const selectorInfo = generateSelector(form);

    const action = {
        type: 'submit',
        selector: selectorInfo.selector,
        selectorType: selectorInfo.type,
        reliability: selectorInfo.reliability,
        formId: form.id,
        formName: form.name,
        description: `Submit ${form.name || form.id || 'form'}`,
        timestamp: new Date().toISOString(),
        url: window.location.href
    };

    // Send to popup
    chrome.runtime.sendMessage({ type: 'ACTION_RECORDED', action });
}

/**
 * Show visual indicator when recording an action
 */
function showRecordingIndicator(element) {
    // Create indicator
    const indicator = document.createElement('div');
    indicator.className = 'sentinelqa-recording-indicator';
    indicator.innerHTML = '●';

    // Position near the element
    const rect = element.getBoundingClientRect();
    indicator.style.cssText = `
    position: fixed;
    left: ${rect.left + rect.width / 2}px;
    top: ${rect.top - 20}px;
    color: #ef4444;
    font-size: 16px;
    z-index: 999999;
    pointer-events: none;
    animation: sentinelqa-pulse 0.5s ease-out forwards;
  `;

    document.body.appendChild(indicator);

    // Remove after animation
    setTimeout(() => indicator.remove(), 500);
}

/**
 * Start recording
 */
function startRecording() {
    isRecording = true;
    document.addEventListener('click', handleClick, true);
    document.addEventListener('change', handleInput, true);
    document.addEventListener('submit', handleSubmit, true);

    // Show recording badge
    showRecordingBadge();

    console.log('[SentinelQA] Recording started');
}

/**
 * Stop recording
 */
function stopRecording() {
    isRecording = false;
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('change', handleInput, true);
    document.removeEventListener('submit', handleSubmit, true);

    // Remove recording badge
    const badge = document.querySelector('.sentinelqa-recording-badge');
    if (badge) badge.remove();

    console.log('[SentinelQA] Recording stopped');
}

/**
 * Show recording badge on page
 */
function showRecordingBadge() {
    // Remove existing badge if any
    const existing = document.querySelector('.sentinelqa-recording-badge');
    if (existing) existing.remove();

    const badge = document.createElement('div');
    badge.className = 'sentinelqa-recording-badge';
    badge.innerHTML = `
    <span class="sentinelqa-recording-dot"></span>
    <span>SentinelQA Recording</span>
  `;
    badge.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: linear-gradient(135deg, #ef4444, #dc2626);
    color: white;
    padding: 8px 16px;
    border-radius: 20px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 12px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 8px;
    z-index: 999999;
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
    animation: sentinelqa-slide-in 0.3s ease-out;
  `;

    document.body.appendChild(badge);
}

/**
 * Listen for messages from popup/background
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case 'START_RECORDING':
            startRecording();
            sendResponse({ success: true });
            break;
        case 'STOP_RECORDING':
            stopRecording();
            sendResponse({ success: true });
            break;
        case 'GET_STATUS':
            sendResponse({ isRecording });
            break;
    }
    return true;
});

/**
 * Check if we should resume recording (page reload)
 */
async function checkRecordingState() {
    const state = await chrome.storage.local.get(['isRecording', 'recordingTabId']);

    // Get current tab ID
    chrome.runtime.sendMessage({ type: 'GET_TAB_ID' }, (response) => {
        if (response && state.isRecording && state.recordingTabId === response.tabId) {
            startRecording();
        }
    });
}

// Initialize
checkRecordingState();
