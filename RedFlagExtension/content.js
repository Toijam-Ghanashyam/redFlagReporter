// Red Flag Report - Content Script
// Scans for Sign Up buttons and legal links, then summarizes using Gemini API

(function() {
  'use strict';

  // State
  let overlay = null;
  let isProcessing = false;

  // Initialize
  function init() {
    scanPage();
  }

  // Scan page for Sign Up buttons and legal links
  function scanPage() {
    // Look for Sign Up buttons (common patterns)
    const signUpSelectors = [
      'button:contains("Sign Up")',
      'button:contains("Sign up")',
      'button:contains("Sign-Up")',
      'a:contains("Sign Up")',
      'a:contains("Sign up")',
      '[data-testid*="signup"]',
      '[id*="signup"]',
      '[class*="signup"]',
      '[class*="sign-up"]'
    ];

    const signUpButton = findElementByText(signUpSelectors) || 
                        document.querySelector('button[type="submit"]') ||
                        document.querySelector('a[href*="signup"]') ||
                        document.querySelector('a[href*="register"]');

    if (signUpButton) {
      console.log('Sign Up button detected');
      findAndProcessLegalLinks();
    }
  }

  // Helper to find elements by text content
  function findElementByText(selectors) {
    // First try direct selectors
    for (const selector of selectors) {
      if (selector.includes(':contains')) {
        const text = selector.match(/contains\("(.+?)"\)/)?.[1];
        if (text) {
          const elements = document.querySelectorAll('button, a, [role="button"]');
          for (const el of elements) {
            if (el.textContent.trim().toLowerCase().includes(text.toLowerCase())) {
              return el;
            }
          }
        }
      } else {
        const element = document.querySelector(selector);
        if (element) return element;
      }
    }
    return null;
  }

  // Find Terms of Service and Privacy Policy links
  function findAndProcessLegalLinks() {
    const legalLinkPatterns = [
      'Terms of Service',
      'Terms of service',
      'Terms and Conditions',
      'Terms',
      'Privacy Policy',
      'Privacy policy',
      'Privacy',
      'Legal'
    ];

    const legalLinks = [];
    const allLinks = document.querySelectorAll('a[href]');

    for (const link of allLinks) {
      const linkText = link.textContent.trim();
      for (const pattern of legalLinkPatterns) {
        if (linkText.toLowerCase().includes(pattern.toLowerCase())) {
          legalLinks.push({
            text: linkText,
            url: link.href,
            type: pattern.toLowerCase().includes('privacy') ? 'privacy' : 'terms'
          });
          break;
        }
      }
    }

    if (legalLinks.length > 0) {
      console.log('Legal links found:', legalLinks);
      fetchLegalTexts(legalLinks);
    } else {
      console.log('No legal links found');
    }
  }

  // Fetch text from legal links
  async function fetchLegalTexts(legalLinks) {
    if (isProcessing) return;
    isProcessing = true;

    showLoadingOverlay();

    try {
      const texts = [];
      
      // Use background script to fetch (avoids CORS issues)
      for (const link of legalLinks) {
        try {
          const response = await chrome.runtime.sendMessage({
            action: 'fetchLegalText',
            url: link.url
          });
          
          if (response && response.success && response.text) {
            texts.push({
              type: link.type,
              text: response.text
            });
          } else {
            const errorMsg = response?.error || 'Unknown error';
            console.error(`Failed to fetch ${link.url}:`, errorMsg);
          }
        } catch (error) {
          console.error(`Error fetching ${link.url}:`, error);
        }
      }

      if (texts.length > 0) {
        await summarizeWithGemini(texts);
      } else {
        showError('Could not fetch legal document text');
      }
    } catch (error) {
      console.error('Error processing legal texts:', error);
      showError('Error processing legal documents');
    } finally {
      isProcessing = false;
    }
  }

  // Summarize using Gemini API (via background script)
  async function summarizeWithGemini(texts) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'summarizeWithGemini',
        texts: texts
      });

      if (response.success) {
        showSummary(response.summary);
      } else {
        if (response.error === 'API key not set') {
          showError('Please set your Gemini API key in the extension options');
        } else {
          showError(`Error generating summary: ${response.error}`);
        }
      }
    } catch (error) {
      console.error('Error calling Gemini API:', error);
      showError(`Error generating summary: ${error.message}`);
    }
  }

  // Show loading overlay
  function showLoadingOverlay() {
    if (!overlay) {
      createOverlay();
    }
    overlay.classList.add('active');
    overlay.innerHTML = `
      <div class="overlay-content">
        <div class="overlay-header">
          <h2>🔴 Red Flag Report</h2>
          <button class="close-btn">×</button>
        </div>
        <div class="overlay-body">
          <div class="loading">
            <div class="spinner"></div>
            <p>Analyzing legal documents...</p>
          </div>
        </div>
      </div>
    `;
    attachCloseHandler();
  }

  // Show summary in overlay
  function showSummary(data) {
    if (!overlay) {
      createOverlay();
    }
    overlay.classList.add('active');
    
    // Handle both old string format and new object format
    let rating = 'C';
    let ratingExplanation = 'Unable to determine rating';
    let redFlags = [];
    let summary = 'Unable to generate summary';

    if (typeof data === 'string') {
      // Legacy format - parse it
      const lines = data.split('\n');
      redFlags = lines
        .filter(line => line.trim().includes('⚠️') || line.trim().match(/^[-•*]/))
        .slice(0, 3)
        .map(line => line.replace(/^[-•*⚠️\s]+/, '').trim())
        .filter(line => line.length > 0);
      summary = 'Please review the full Terms of Service and Privacy Policy for complete details.';
    } else if (typeof data === 'object') {
      // New structured format
      rating = data.rating || 'C';
      ratingExplanation = data.ratingExplanation || 'Unable to determine rating';
      redFlags = data.redFlags || [];
      summary = data.summary || 'Unable to generate summary';
    }

    // Get rating color
    const ratingColors = {
      'A': '#4caf50',
      'B': '#8bc34a',
      'C': '#ffc107',
      'D': '#ff9800',
      'E': '#ff5722',
      'F': '#f44336'
    };
    const ratingColor = ratingColors[rating] || '#ffc107';

    // Format red flags
    const bullets = redFlags.length > 0 
      ? redFlags.map(flag => `<li>⚠️ ${flag}</li>`).join('')
      : '<li>No specific red flags identified</li>';

    overlay.innerHTML = `
      <div class="overlay-content">
        <div class="overlay-header">
          <h2>🔴 Red Flag Report</h2>
          <button class="close-btn">×</button>
        </div>
        <div class="overlay-body">
          <!-- Safety Rating Section -->
          <div class="safety-rating">
            <div class="rating-badge" style="background: ${ratingColor}20; border-color: ${ratingColor};">
              <div class="rating-letter" style="color: ${ratingColor};">${rating}</div>
            </div>
            <p class="rating-explanation">${ratingExplanation}</p>
          </div>

          <!-- Red Flags Section -->
          <div class="summary">
            <h3>⚠️ Key Concerns:</h3>
            <ul class="red-flags">
              ${bullets}
            </ul>
          </div>

          <!-- Plain English Summary Section -->
          <div class="plain-summary">
            <h3>📄 Terms Summary:</h3>
            <p class="summary-text">${summary}</p>
          </div>

          <p class="disclaimer">Always read the full Terms of Service and Privacy Policy before signing up.</p>
        </div>
      </div>
    `;
    attachCloseHandler();
  }

  // Show error in overlay
  function showError(message) {
    if (!overlay) {
      createOverlay();
    }
    overlay.classList.add('active');
    overlay.innerHTML = `
      <div class="overlay-content">
        <div class="overlay-header">
          <h2>🔴 Red Flag Report</h2>
          <button class="close-btn">×</button>
        </div>
        <div class="overlay-body">
          <div class="error">
            <p>❌ ${message}</p>
            <p class="help-text">Make sure your Gemini API key is set in the extension options.</p>
          </div>
        </div>
      </div>
    `;
    attachCloseHandler();
  }

  // Attach close button handler
  function attachCloseHandler() {
    const closeBtn = overlay?.querySelector('.close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        overlay.classList.remove('active');
      });
    }
  }

  // Create overlay element
  function createOverlay() {
    overlay = document.createElement('div');
    overlay.className = 'red-flag-overlay';
    document.body.appendChild(overlay);

    // Close on outside click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('active');
      }
    });
  }

  // Run initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Re-scan on dynamic content changes
  const observer = new MutationObserver(() => {
    if (!overlay?.classList.contains('active')) {
      scanPage();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

})();

