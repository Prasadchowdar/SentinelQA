import logging
import asyncio
import base64
import json
import os
from datetime import datetime
from typing import Dict, List, Optional
from urllib.parse import urlparse
from playwright.async_api import async_playwright, Page
from openai import AsyncOpenAI

# Ensure directories exist
os.makedirs("videos", exist_ok=True)
os.makedirs("screenshots", exist_ok=True)

logger = logging.getLogger(__name__)


class PageStateTracker:
    """
    Track page state changes to intelligently detect task completion.
    Monitors URL changes, success messages, and page transitions.
    """
    
    def __init__(self):
        self.previous_url = None
        self.previous_title = None
        self.action_count = 0
        self.success_keywords = [
            'success', 'successfully', 'sent', 'submitted',
            'thank you', 'thanks', 'confirmation', 'confirmed',
            'check your email', 'password reset email', 'reset link',
            'completed', 'done', 'congratulations'
        ]
    
    def detect_navigation(self, current_url: str) -> tuple[bool, str]:
        """
        Detect if page navigated to a different location.
        Returns (navigated: bool, description: str)
        """
        if not self.previous_url:
            self.previous_url = current_url
            return False, ""
        
        prev = urlparse(self.previous_url)
        curr = urlparse(current_url)
        
        # Major navigation detected
        if prev.netloc != curr.netloc:
            desc = f"Domain changed: {prev.netloc} → {curr.netloc}"
            self.previous_url = current_url
            return True, desc
        
        if prev.path != curr.path:
            desc = f"Path changed: {prev.path} → {curr.path}"
            self.previous_url = current_url
            return True, desc
        
        # Query params or hash changed (minor navigation)
        if prev.query != curr.query or prev.fragment != curr.fragment:
            # This might indicate form submission or state change
            self.previous_url = current_url
            return False, "URL params changed (possible state change)"
        
        return False, ""
    
    def detect_success_message(self, html_content: str) -> tuple[bool, Optional[str]]:
        """
        Scan HTML for success indicators.
        Returns (has_success: bool, keyword: str | None)
        """
        html_lower = html_content.lower()
        
        for keyword in self.success_keywords:
            if keyword in html_lower:
                # Check if it's in visible text context (not in script/style)
                # Simple heuristic: if keyword appears outside of <script> and <style> tags
                return True, keyword
        
        return False, None
    
    def should_verify_completion(self) -> bool:
        """
        Determine if we should ask AI to verify completion.
        Returns True if we've detected strong completion signals.
        """
        return self.action_count >= 3  # After 3+ actions, be more eager to complete



class AIVisionController:
    """
    AI-powered browser controller using GPT-4 Vision.
    Analyzes screenshots and generates Playwright actions.
    """
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY not found in environment variables")
        
        self.client = AsyncOpenAI(api_key=self.api_key)
        self.model = "gpt-4o"  # GPT-4o has vision capabilities
    
    async def analyze_page_and_get_action(
        self, 
        screenshot_base64: str, 
        instruction: str,
        page_html: str,
        action_history: list = None  # NEW: Track previous actions
    ) -> Dict:
        """
        Send screenshot to GPT-4 Vision and get next action to take.
        
        Returns:
        {
            "action": "click" | "type" | "navigate" | "wait" | "complete",
            "selector": "css selector or text to find",
            "value": "text to type (for 'type' action)",
            "reasoning": "why this action was chosen"
        }
        """
        
        # Build action history context
        history_context = ""
        if action_history:
            history_context = "\n\nACTIONS ALREADY COMPLETED (DO NOT REPEAT THESE):\n"
            for i, action in enumerate(action_history, 1):
                history_context += f"{i}. {action}\n"
            history_context += "\n⚠️ IMPORTANT: You must choose a DIFFERENT action/element from the ones above!\n"
        
        system_prompt = """You are an expert web automation assistant. Your job is to analyze a webpage screenshot and HTML, then determine the next action to take to complete the user's instruction.

IMPORTANT RULES:
1. Return ONLY valid JSON, no markdown, no explanations outside the JSON
2. Use simple, robust CSS selectors when possible
3. For text buttons/links, use text-based selectors (e.g., "text=Login")
4. If the task is complete, return action: "complete"
5. If unclear or element not found, return action: "wait" with reasoning
6. NEVER repeat an action that was already completed - choose a NEW action!

SELECTOR STRATEGIES (use in this priority order):
1. For ICONS (search, menu, close, cart, etc.) - Use element-AGNOSTIC aria-label selectors:
   - [aria-label*="search" i] - matches ANY element with aria-label containing "search"
   - [aria-label*="menu" i] - for menu icons (could be button, a, div, etc.)
   - [aria-label*="cart" i] or [aria-label*="bag" i] - for cart icons
   - [role="search"] - for search containers
   - a:has(svg), button:has(svg) - for icon links/buttons
   IMPORTANT: Do NOT use button[aria-label...] - use [aria-label...] without element type!
   
2. For BUTTONS/LINKS with visible text: text=Login, text=Submit, text=Sign In

3. For INPUT fields:
   - input[type="search"], input[name="search"], input[placeholder*="search" i]
   - input[type="email"], input[type="password"], input[name="email"]

4. For NAVIGATION links: text=Mac, text=iPad, nav a[href*="mac"]

5. CSS ID or class as last resort: #search-btn, .nav-search

Available actions:
- "click": Click an element (requires selector)
- "type": Type text into an input (requires selector and value)
- "press": Press a keyboard key (requires value like "Enter", "Tab", "Escape")
- "verify": Verify an assertion about the page (requires assertion details)
- "navigate": Navigate to a URL (requires value as URL)
- "wait": Wait for element or condition (requires selector)
- "complete": Task is done successfully

VERIFICATION (Critical for QA):
When you reach a goal state, ALWAYS add verification steps before marking complete!
For "verify" action, use this format:
{
    "action": "verify",
    "selector": "CSS selector for element to verify",
    "verify_type": "text_contains|text_equals|exists|visible|not_visible|enabled|url_contains",
    "expected": "expected value or text",
    "assertion": "Human-readable description of what you're verifying",
    "reasoning": "Why this verification matters"
}

Verification types:
- text_contains: Element text contains expected value
- text_equals: Element text exactly equals expected value
- exists: Element exists in DOM
- visible: Element is visible on page
- not_visible: Element is NOT visible (spinner gone, modal closed, error absent)
- enabled: Button/input is enabled and clickable
- url_contains: Current URL contains expected pattern

IMPORTANT: After typing in a SEARCH field, you should ALWAYS follow with a "press" action with value "Enter" to submit the search!

IMPORTANT: Before returning "complete", add at least 1-2 verification steps to PROVE the task succeeded!

Response format:
{
    "action": "click|type|press|verify|navigate|wait|complete",
    "selector": "CSS selector or text=",
    "value": "value for type/navigate/press actions",
    "verify_type": "for verify action only",
    "expected": "for verify action only", 
    "assertion": "for verify action only",
    "reasoning": "Brief explanation of why this action"
}"""

        user_prompt = f"""Instruction to complete: "{instruction}"
{history_context}
Analyze the screenshot and determine the NEXT SINGLE ACTION needed.

Here's a sample of the page HTML for context (showing key interactive elements):
```html
{page_html[:2000]}
```

COMPLETION DETECTION HINTS:
- If you see "success", "sent", "submitted", "thank you", or "confirmation" messages, the task is likely COMPLETE
- If you've already tested all items mentioned in the instruction, return "complete"
- If the instruction was to navigate somewhere and you're now there, return "complete"
- If the instruction was to submit a form and you see a success message, return "complete"
- CRITICAL: Check the "ACTIONS ALREADY COMPLETED" list above and DO NOT repeat any action!

Return your response as JSON only."""

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": user_prompt
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/png;base64,{screenshot_base64}"
                                }
                            }
                        ]
                    }
                ],
                max_tokens=500,
                temperature=0.1  # Low temperature for consistent, reliable responses
            )
            
            content = response.choices[0].message.content.strip()
            
            # Try to extract JSON from response (in case AI adds markdown)
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            
            action_data = json.loads(content)
            logger.info(f"AI suggested action: {action_data}")
            
            return action_data
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse AI response as JSON: {content}")
            return {
                "action": "wait",
                "selector": "",
                "value": "",
                "reasoning": f"AI response was not valid JSON: {str(e)}"
            }
        except Exception as e:
            logger.error(f"AI vision request failed: {e}")
            return {
                "action": "wait",
                "selector": "",
                "value": "",
                "reasoning": f"AI request failed: {str(e)}"
            }


class AuthenticationAwareWorker:
    """
    Enhanced worker with AI-powered instruction execution.
    """
    
    def __init__(self):
        api_key = os.getenv("OPENAI_API_KEY")
        if api_key:
            self.ai_controller = AIVisionController(api_key)
            logger.info("AI Vision Controller initialized")
        else:
            self.ai_controller = None
            logger.warning("OPENAI_API_KEY not set - AI features disabled")
    
    async def capture_page_state(self, page: Page) -> tuple[str, str]:
        """Capture screenshot and extract key HTML elements"""
        # Take screenshot
        screenshot_bytes = await page.screenshot(full_page=False)
        screenshot_base64 = base64.b64encode(screenshot_bytes).decode('utf-8')
        
        # Get simplified HTML (including accessibility attributes for AI)
        html = await page.evaluate("""() => {
            const elements = document.querySelectorAll('button, a, input, select, textarea, [role="button"], [role="search"], [aria-label]');
            let html = '';
            elements.forEach((el, i) => {
                if (i < 60) {  // Limit to first 60 elements to save tokens
                    const tag = el.tagName.toLowerCase();
                    const text = el.innerText?.substring(0, 30) || '';
                    const id = el.id ? `id="${el.id}"` : '';
                    const className = el.className && typeof el.className === 'string' ? `class="${el.className.substring(0, 50)}"` : '';
                    const type = el.type ? `type="${el.type}"` : '';
                    const ariaLabel = el.getAttribute('aria-label') ? `aria-label="${el.getAttribute('aria-label')}"` : '';
                    const title = el.title ? `title="${el.title}"` : '';
                    const href = el.href ? `href="${el.href.substring(0, 50)}"` : '';
                    const role = el.getAttribute('role') ? `role="${el.getAttribute('role')}"` : '';
                    html += `<${tag} ${id} ${className} ${type} ${ariaLabel} ${title} ${href} ${role}>${text}</${tag}>\\n`;
                }
            });
            return html;
        }""")
        
        return screenshot_base64, html
    
    async def execute_action(self, page: Page, action_data: Dict) -> bool:
        """Execute a single action based on AI's decision"""
        action = action_data.get("action", "wait")
        selector = action_data.get("selector", "")
        value = action_data.get("value", "")
        
        logger.info(f"Executing action: {action} on {selector}")
        
        try:
            if action == "click":
                # Try multiple selector strategies
                if selector.startswith("text="):
                    # Text-based selector
                    text = selector.replace("text=", "")
                    locator = page.get_by_text(text, exact=False)
                    
                    # Find the FIRST VISIBLE element (not just the first in DOM)
                    count = await locator.count()
                    clicked = False
                    for i in range(count):
                        element = locator.nth(i)
                        try:
                            if await element.is_visible():
                                await element.click(timeout=5000)
                                clicked = True
                                break
                        except Exception:
                            continue
                    
                    if not clicked:
                        # GENERIC FALLBACK: Try multiple strategies based on ANY text
                        text_lower = text.lower().strip()
                        logger.info(f"Text '{text}' not found, trying generic fallbacks...")
                        
                        # Generate dynamic fallback selectors based on the text
                        fallback_selectors = [
                            # 1. Aria-label contains the text (most accessible)
                            f'button[aria-label*="{text}" i]',
                            f'a[aria-label*="{text}" i]',
                            f'[aria-label*="{text}" i]',
                            
                            # 2. Title attribute contains the text
                            f'[title*="{text}" i]',
                            
                            # 3. Role-based selectors
                            f'[role="button"][aria-label*="{text}" i]',
                            f'[role="link"][aria-label*="{text}" i]',
                            
                            # 4. Data attributes (common pattern)
                            f'[data-action*="{text_lower}"]',
                            f'[data-test*="{text_lower}"]',
                            f'[data-testid*="{text_lower}"]',
                            
                            # 5. ID or class contains the text
                            f'#{text_lower}',
                            f'[id*="{text_lower}"]',
                            f'[class*="{text_lower}"]',
                            
                            # 6. Links with href containing the text
                            f'a[href*="{text_lower}"]',
                            
                            # 7. Buttons/links with child elements containing the text
                            f'button:has([alt*="{text}" i])',
                            f'a:has([alt*="{text}" i])',
                        ]
                        
                        # Try each fallback selector
                        for fb_selector in fallback_selectors:
                            try:
                                fb_locator = page.locator(fb_selector).first
                                if await fb_locator.count() > 0 and await fb_locator.is_visible():
                                    await fb_locator.click(timeout=3000)
                                    clicked = True
                                    logger.info(f"✅ Fallback selector worked: {fb_selector}")
                                    break
                            except Exception as e:
                                logger.debug(f"Fallback {fb_selector} failed: {e}")
                                continue
                        
                        if not clicked:
                            # Last resort: try get_by_role with accessible name
                            try:
                                role_locator = page.get_by_role("button", name=text)
                                if await role_locator.count() > 0:
                                    await role_locator.first.click(timeout=3000)
                                    clicked = True
                                    logger.info(f"✅ get_by_role('button', name='{text}') worked")
                            except Exception:
                                pass
                        
                        if not clicked:
                            try:
                                role_locator = page.get_by_role("link", name=text)
                                if await role_locator.count() > 0:
                                    await role_locator.first.click(timeout=3000)
                                    clicked = True
                                    logger.info(f"✅ get_by_role('link', name='{text}') worked")
                            except Exception:
                                pass
                        
                        if not clicked:
                            # Final fallback: try clicking the first text match anyway
                            logger.warning(f"All fallbacks failed for '{text}', trying original locator")
                            await locator.first.click(timeout=5000)
                else:
                    # CSS selector - also check for visibility!
                    locator = page.locator(selector)
                    count = await locator.count()
                    clicked = False
                    
                    if count > 1:
                        logger.info(f"Found {count} elements matching CSS selector, looking for visible one...")
                        for i in range(count):
                            element = locator.nth(i)
                            try:
                                if await element.is_visible():
                                    await element.click(timeout=5000)
                                    clicked = True
                                    logger.info(f"✅ Clicked visible element at index {i}")
                                    break
                            except Exception:
                                continue
                    
                    if not clicked:
                        # Fallback to normal click
                        await page.click(selector, timeout=5000)
                
                # Wait for navigation or network to settle
                await page.wait_for_load_state("domcontentloaded", timeout=5000)
                return True
                
            elif action == "type":
                # Wait a moment for any animations/transitions
                await page.wait_for_timeout(500)
                
                # Try the specified selector first
                try:
                    locator = page.locator(selector)
                    if await locator.count() > 0 and await locator.first.is_visible():
                        await locator.first.fill(value, timeout=5000)
                        return True
                except Exception:
                    pass
                
                # Fallback: Try common input selectors
                logger.info(f"Selector '{selector}' not found, trying fallback input selectors...")
                fallback_selectors = [
                    'input[type="search"]',
                    'input[name="search"]',
                    'input[placeholder*="search" i]',
                    'input[aria-label*="search" i]',
                    '[role="search"] input',
                    '[role="searchbox"]',
                    'input:visible',  # Last resort: any visible input
                ]
                
                for fb_selector in fallback_selectors:
                    try:
                        fb_locator = page.locator(fb_selector).first
                        if await fb_locator.count() > 0 and await fb_locator.is_visible():
                            await fb_locator.fill(value, timeout=3000)
                            logger.info(f"✅ Fallback input worked: {fb_selector}")
                            return True
                    except Exception:
                        continue
                
                # If all fallbacks fail, try the original
                await page.fill(selector, value, timeout=5000)
                return True
                
            elif action == "navigate":
                await page.goto(value, timeout=30000)
                await page.wait_for_load_state("networkidle")
                return True
            
            elif action == "press":
                # Press a keyboard key (Enter, Tab, Escape, etc.)
                key = value.strip()
                logger.info(f"Pressing keyboard key: {key}")
                await page.keyboard.press(key)
                # Wait for any navigation or action triggered by key press
                await page.wait_for_timeout(1000)
                try:
                    await page.wait_for_load_state("domcontentloaded", timeout=5000)
                except Exception:
                    pass  # Some key presses don't trigger navigation
                return True
                
            elif action == "wait":
                if selector:
                    await page.wait_for_selector(selector, timeout=5000)
                else:
                    await page.wait_for_timeout(2000)
                return True
                
            elif action == "verify":
                # Execute a verification/assertion
                return await self.execute_verification(page, action_data)
                
            elif action == "complete":
                logger.info("Task marked as complete by AI")
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"Action execution failed: {e}")
            return False
    
    async def execute_verification(self, page: Page, verification: Dict) -> Dict:
        """
        Execute a verification/assertion and return detailed result.
        
        Returns:
            Dict with: passed, actual, expected, assertion, confidence, reason, selector_used
        """
        selector = verification.get("selector", "")
        verify_type = verification.get("verify_type", "exists")
        expected = verification.get("expected", "")
        assertion = verification.get("assertion", f"Verify {verify_type}")
        
        result = {
            "passed": False,
            "assertion": assertion,
            "verify_type": verify_type,
            "expected": expected,
            "actual": "",
            "confidence": "low",
            "reason": "",
            "selector_used": selector
        }
        
        try:
            # SELECTOR STRATEGY: Try multiple approaches
            locator = None
            selectors_tried = []
            
            if selector:
                # Strategy 1: Try the provided selector
                try:
                    locator = page.locator(selector)
                    if await locator.count() == 0:
                        selectors_tried.append(f"{selector} (not found)")
                        locator = None
                    else:
                        result["confidence"] = "high"  # Direct selector match
                except Exception:
                    selectors_tried.append(f"{selector} (invalid)")
                    locator = None
                
                # Strategy 2: Try text-based if selector failed
                if locator is None and expected:
                    try:
                        text_locator = page.get_by_text(expected, exact=False)
                        if await text_locator.count() > 0:
                            locator = text_locator
                            result["selector_used"] = f"text='{expected}'"
                            result["confidence"] = "medium"  # Fallback to text
                        else:
                            selectors_tried.append(f"text='{expected}' (not found)")
                    except Exception:
                        pass
                
                # Strategy 3: Try aria-label fallback
                if locator is None and expected:
                    try:
                        aria_selector = f'[aria-label*="{expected}" i]'
                        aria_locator = page.locator(aria_selector)
                        if await aria_locator.count() > 0:
                            locator = aria_locator
                            result["selector_used"] = aria_selector
                            result["confidence"] = "medium"
                        else:
                            selectors_tried.append(f"{aria_selector} (not found)")
                    except Exception:
                        pass
            
            # URL-based verification (no selector needed)
            if verify_type == "url_contains":
                current_url = page.url
                result["actual"] = current_url
                result["passed"] = expected.lower() in current_url.lower()
                result["confidence"] = "high"  # URL is reliable
                if result["passed"]:
                    result["reason"] = f"URL contains '{expected}'"
                else:
                    result["reason"] = f"URL does not contain '{expected}'"
                logger.info(f"VERIFY url_contains: {'✓' if result['passed'] else '✗'} - {result['reason']}")
                return result
            
            # Element-based verifications
            if locator is None:
                result["reason"] = f"Element not found. Tried selectors: {', '.join(selectors_tried)}"
                result["confidence"] = "low"
                logger.warning(f"VERIFY failed: {result['reason']}")
                return result
            
            # Execute verification based on type
            if verify_type == "exists":
                count = await locator.count()
                result["passed"] = count > 0
                result["actual"] = f"{count} element(s) found"
                result["reason"] = f"Element exists" if result["passed"] else "Element not found in DOM"
                
            elif verify_type == "visible":
                try:
                    is_visible = await locator.first.is_visible()
                    result["passed"] = is_visible
                    result["actual"] = "visible" if is_visible else "not visible"
                    result["reason"] = f"Element is visible" if result["passed"] else "Element exists but not visible"
                except Exception:
                    result["passed"] = False
                    result["actual"] = "not found"
                    result["reason"] = "Could not check visibility"
                    
            elif verify_type == "not_visible":
                # Critical for checking: spinner gone, modal closed, error absent
                try:
                    count = await locator.count()
                    if count == 0:
                        result["passed"] = True
                        result["actual"] = "not present"
                        result["reason"] = "Element not present in DOM (good)"
                    else:
                        is_visible = await locator.first.is_visible()
                        result["passed"] = not is_visible
                        result["actual"] = "hidden" if not is_visible else "still visible"
                        result["reason"] = "Element hidden" if result["passed"] else "Element still visible (should be hidden)"
                except Exception:
                    result["passed"] = True  # If we can't find it, it's "not visible"
                    result["actual"] = "not found"
                    result["reason"] = "Element not found (treated as not visible)"
                    
            elif verify_type == "enabled":
                try:
                    is_enabled = await locator.first.is_enabled()
                    result["passed"] = is_enabled
                    result["actual"] = "enabled" if is_enabled else "disabled"
                    result["reason"] = f"Element is clickable" if result["passed"] else "Element is disabled"
                except Exception:
                    result["passed"] = False
                    result["actual"] = "unknown"
                    result["reason"] = "Could not check enabled state"
                    
            elif verify_type == "text_contains":
                try:
                    actual_text = await locator.first.inner_text()
                    result["actual"] = actual_text[:100] if len(actual_text) > 100 else actual_text
                    result["passed"] = expected.lower() in actual_text.lower()
                    result["reason"] = f"Text contains '{expected}'" if result["passed"] else f"Text does not contain '{expected}'"
                except Exception as e:
                    result["passed"] = False
                    result["actual"] = "could not read text"
                    result["reason"] = f"Error reading text: {str(e)}"
                    
            elif verify_type == "text_equals":
                try:
                    actual_text = await locator.first.inner_text()
                    result["actual"] = actual_text.strip()
                    result["passed"] = expected.strip().lower() == actual_text.strip().lower()
                    result["reason"] = f"Text matches exactly" if result["passed"] else f"Text mismatch: got '{result['actual']}'"
                except Exception as e:
                    result["passed"] = False
                    result["actual"] = "could not read text"
                    result["reason"] = f"Error reading text: {str(e)}"
            
            else:
                result["reason"] = f"Unknown verification type: {verify_type}"
            
            # Log result
            status = "✓ PASS" if result["passed"] else "✗ FAIL"
            logger.info(f"VERIFY [{result['confidence']}] {status}: {assertion} - {result['reason']}")
            
            return result
            
        except Exception as e:
            result["reason"] = f"Verification error: {str(e)}"
            result["confidence"] = "low"
            logger.error(f"VERIFY ERROR: {result['reason']}")
            return result

    async def run_test(self, url: str, instruction: str) -> dict:
        """
        Runs a test using Playwright with AI-powered instruction execution.
        """
        logging.info(f"Starting AI-powered test for {url} with instruction: {instruction}")
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                record_video_dir="videos/",
                record_video_size={"width": 1280, "height": 720}
            )
            page = await context.new_page()
            
            start_time = datetime.now()
            error = None
            title = "Unknown"
            video_path = None
            execution_log = []
            
            try:
                # 1. Navigate to URL
                logging.info(f"Navigating to {url}")
                try:
                    await page.goto(url, timeout=30000, wait_until="domcontentloaded")
                    # Try to wait for networkidle, but don't fail if it times out
                    try:
                        await page.wait_for_load_state("networkidle", timeout=10000)
                    except Exception:
                        logging.warning("Network not idle after 10s, proceeding anyway")
                except Exception as nav_error:
                    error = f"Navigation failed: {str(nav_error)}"
                    logging.error(error)
                    raise  # Re-raise to skip AI execution if navigation completely failed
                
                title = await page.title()
                execution_log.append(f"✓ Navigated to {url}")
                execution_log.append(f"✓ Page title: {title}")
                
                # 2. Execute AI-powered instruction
                if self.ai_controller and instruction:
                    logging.info("Starting AI-powered execution loop")
                    max_steps = 10  # Prevent infinite loops
                    step_count = 0
                    state_tracker = PageStateTracker()  # Initialize state tracker
                    action_history = []  # NEW: Track all actions taken
                    test_failed = False  # Track if any action execution failed
                    
                    # Verification tracking
                    verification_results = []  # Store all verification outcomes
                    verifications_passed = 0
                    verifications_total = 0
                    
                    while step_count < max_steps:
                        step_count += 1
                        state_tracker.action_count = step_count
                        logging.info(f"AI Step {step_count}/{max_steps}")
                        
                        try:
                            # Capture current page state
                            screenshot_b64, page_html = await self.capture_page_state(page)
                            current_url = page.url
                            logging.info(f"Captured screenshot ({len(screenshot_b64)} bytes) and HTML ({len(page_html)} chars)")
                            
                            # Check for navigation (URL change)
                            navigated, nav_desc = state_tracker.detect_navigation(current_url)
                            if navigated:
                                logging.info(f"Navigation detected: {nav_desc}")
                                execution_log.append(f"🔄 {nav_desc}")
                                
                                # After navigation, check if the task is complete
                                if step_count >= 2:  # Give AI at least 2 steps before checking
                                    logging.info("Checking if task completed after navigation...")
                            
                            # Check for success messages
                            has_success, keyword = state_tracker.detect_success_message(page_html)
                            if has_success:
                                logging.info(f"Success indicator detected: '{keyword}'")
                                execution_log.append(f"✅ Success message found: '{keyword}'")
                            
                            # Get AI's decision - NOW WITH ACTION HISTORY!
                            logging.info(f"Sending to AI for analysis... (History: {len(action_history)} actions)")
                            action_data = await self.ai_controller.analyze_page_and_get_action(
                                screenshot_b64,
                                instruction,
                                page_html,
                                action_history  # NEW: Pass action history to prevent loops
                            )
                            
                            reasoning = action_data.get("reasoning", "No reasoning provided")
                            action = action_data.get("action", "unknown")
                            logging.info(f"AI decided: {action} - {reasoning}")
                            execution_log.append(f"Step {step_count}: {reasoning}")
                            
                            # Check if task is complete
                            if action == "complete":
                                execution_log.append("✓ Task completed successfully")
                                break
                            
                            # Execute the action
                            if action == "verify":
                                # Special handling for verify action
                                verify_result = await self.execute_action(page, action_data)
                                # execute_action returns the verification result dict for verify
                                if isinstance(verify_result, dict):
                                    verifications_total += 1
                                    verification_results.append(verify_result)
                                    
                                    assertion = verify_result.get("assertion", "Verification")
                                    confidence = verify_result.get("confidence", "low")
                                    
                                    if verify_result.get("passed"):
                                        verifications_passed += 1
                                        execution_log.append(f"  ✓ VERIFY [{confidence}]: {assertion}")
                                        execution_log.append(f"    Result: {verify_result.get('reason', 'Passed')}")
                                    else:
                                        test_failed = True  # Failed verification = failed test
                                        execution_log.append(f"  ✗ VERIFY FAILED [{confidence}]: {assertion}")
                                        execution_log.append(f"    Expected: {verify_result.get('expected', 'N/A')}")
                                        execution_log.append(f"    Actual: {verify_result.get('actual', 'N/A')}")
                                        execution_log.append(f"    Reason: {verify_result.get('reason', 'Unknown')}")
                                        execution_log.append(f"    Selector: {verify_result.get('selector_used', 'N/A')}")
                                    
                                    action_history.append(f"verify: {assertion} - {'PASS' if verify_result.get('passed') else 'FAIL'}")
                                else:
                                    # Fallback if we get a boolean
                                    execution_log.append(f"  ? Verification result: {verify_result}")
                            else:
                                # Normal action execution
                                success = await self.execute_action(page, action_data)
                                
                                if success:
                                    action_desc = f"{action_data.get('action')} {action_data.get('selector', '')}"
                                    execution_log.append(f"✓ Executed: {action_desc}")
                                    
                                    # Track this action in history to prevent repetition
                                    action_history.append(f"{action_data.get('action')} on '{action_data.get('selector', '')}' - {reasoning[:50]}")
                                    logging.info(f"Action history now has {len(action_history)} items")
                                else:
                                    execution_log.append(f"✗ Failed to execute action")
                                    test_failed = True  # Mark test as failed
                                    break
                            
                            # Small delay between actions
                            await page.wait_for_timeout(1000)
                            
                        except Exception as step_error:
                            logging.error(f"Error in AI step {step_count}: {step_error}")
                            execution_log.append(f"✗ Step {step_count} error: {str(step_error)}")
                            break
                    
                    if step_count >= max_steps:
                        execution_log.append("⚠ Reached maximum step limit")
                else:
                    # Fallback if no AI configured
                    logging.warning("AI not configured or no instruction provided")
                    execution_log.append("⚠ AI not configured - only navigated to URL")
                    await page.wait_for_timeout(2000)

            except Exception as e:
                logging.error(f"Test failed: {e}")
                error = str(e)
                execution_log.append(f"✗ Error: {error}")
            
            # Close context to save video
            await context.close()
            
            # Get video path
            try:
                video_page = page.video
                if video_page:
                    video_path = await video_page.path()
                    logging.info(f"Video saved to {video_path}")
            except Exception as e:
                logger.warning(f"Could not retrieve video path: {e}")
            
            await browser.close()
            
            duration = (datetime.now() - start_time).total_seconds() * 1000
            
            # Get verification counts (may not exist if AI wasn't used)
            try:
                v_passed = verifications_passed
                v_total = verifications_total
            except NameError:
                v_passed = 0
                v_total = 0
            
            # Determine status (fail if error OR action failed OR verification failed)
            has_failed_verifications = v_total > 0 and v_passed < v_total
            status = "fail" if (error or test_failed or has_failed_verifications) else "pass"
            
            # Build verification summary
            verification_summary = ""
            if v_total > 0:
                verification_summary = f"\n\n📊 Verification Results: {v_passed}/{v_total} passed"
                if v_passed == v_total:
                    verification_summary += " ✓"
                else:
                    verification_summary += f" ({v_total - v_passed} failed)"
            
            # Construct summaries
            if status == "pass":
                ai_summary = f"Successfully completed test on {url}. Page title: '{title}'.{verification_summary}\n" + "\n".join(execution_log)
                bug_summary = None
            else:
                ai_summary = f"Failed to complete test on {url}.{verification_summary}\n" + "\n".join(execution_log)
                bug_summary = error if error else ("Verification failed" if has_failed_verifications else "Test execution incomplete")

            return {
                "status": status,
                "duration_ms": int(duration),
                "ai_summary": ai_summary,
                "bug_summary": bug_summary,
                "video_path": str(video_path) if video_path else None,
                "execution_log": execution_log
            }
