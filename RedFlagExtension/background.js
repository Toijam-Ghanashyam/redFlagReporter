// Background service worker for Red Flag Report
// Handles cross-origin fetches and Gemini API calls

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchLegalText') {
    fetchLegalText(request.url)
      .then(text => {
        if (!text || text.trim().length === 0) {
          console.warn('Fetched text is empty for:', request.url);
          sendResponse({ success: false, error: 'No text content found' });
        } else {
          sendResponse({ success: true, text });
        }
      })
      .catch(error => {
        console.error('Error in fetchLegalText:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }

  if (request.action === 'summarizeWithGemini') {
    summarizeWithGemini(request.texts)
      .then(summary => sendResponse({ success: true, summary }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }
});

// Fetch legal document text
async function fetchLegalText(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const html = await response.text();
    
    // Extract text content using regex (DOMParser not available in service workers)
    // Remove script and style tags and their content
    let text = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
      .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
      .replace(/<[^>]+>/g, ' ') // Remove remaining HTML tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    // Limit to 50k chars
    const cleanedText = text.substring(0, 50000);
    
    return cleanedText;
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    throw error;
  }
}

// Parse Gemini API response into structured format
function parseGeminiResponse(response) {
  const result = {
    rating: 'C',
    ratingExplanation: 'Unable to determine rating',
    redFlags: [],
    summary: 'Unable to generate summary'
  };

  try {
    // Extract rating
    const ratingMatch = response.match(/RATING:\s*([A-F])\s*-\s*(.+?)(?:\n|RED_FLAGS|$)/i);
    if (ratingMatch) {
      result.rating = ratingMatch[1].toUpperCase();
      result.ratingExplanation = ratingMatch[2].trim();
    }

    // Extract red flags
    const redFlagsMatch = response.match(/RED_FLAGS:\s*([\s\S]*?)(?:\nSUMMARY:|$)/i);
    if (redFlagsMatch) {
      const flagsText = redFlagsMatch[1];
      const flags = flagsText.split('\n')
        .filter(line => line.trim().includes('⚠️') || line.trim().match(/^[-•*]/))
        .map(line => line.replace(/^[-•*⚠️\s]+/, '').trim())
        .filter(line => line.length > 0)
        .slice(0, 3);
      result.redFlags = flags.length > 0 ? flags : ['No specific red flags identified'];
    } else {
      // Fallback: try to find bullet points with ⚠️
      const fallbackFlags = response.split('\n')
        .filter(line => line.trim().includes('⚠️'))
        .map(line => line.replace(/.*⚠️\s*/, '').trim())
        .filter(line => line.length > 0)
        .slice(0, 3);
      if (fallbackFlags.length > 0) {
        result.redFlags = fallbackFlags;
      }
    }

    // Extract summary
    const summaryMatch = response.match(/SUMMARY:\s*([\s\S]+?)(?:\n\n|$)/i);
    if (summaryMatch) {
      result.summary = summaryMatch[1].trim();
    } else {
      // Fallback: try to find a summary-like paragraph
      const paragraphs = response.split('\n\n').filter(p => p.trim().length > 50);
      if (paragraphs.length > 0) {
        result.summary = paragraphs[paragraphs.length - 1].trim().substring(0, 500);
      }
    }

    // If no red flags found, try alternative parsing
    if (result.redFlags.length === 0) {
      const altFlags = response.split('\n')
        .filter(line => line.trim().match(/^[-•*]/) && line.trim().length > 20)
        .map(line => line.replace(/^[-•*\s]+/, '').trim())
        .slice(0, 3);
      if (altFlags.length > 0) {
        result.redFlags = altFlags;
      } else {
        result.redFlags = ['Analysis incomplete - please review terms manually'];
      }
    }
  } catch (error) {
    console.error('Error parsing Gemini response:', error);
    // Fallback: return raw response as summary
    result.summary = response.substring(0, 500);
    result.redFlags = ['Unable to parse response'];
  }

  return result;
}

// List available Gemini models (for debugging)
async function listAvailableModels(apiKey) {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`);
    if (response.ok) {
      const data = await response.json();
      console.log('Available models:', data.models?.map(m => m.name) || []);
      return data.models?.map(m => m.name.replace('models/', '')) || [];
    }
  } catch (error) {
    console.error('Error listing models:', error);
  }
  return [];
}

// Summarize using Gemini API
async function summarizeWithGemini(texts) {
  try {
    // Get API key from storage
    const result = await chrome.storage.sync.get(['geminiApiKey']);
    const apiKey = result.geminiApiKey;

    if (!apiKey) {
      throw new Error('API key not set');
    }

    // Combine all texts
    const combinedText = texts.map(t => `[${t.type.toUpperCase()}]\n${t.text}`).join('\n\n---\n\n');
    
    const prompt = `Please analyze the following Terms of Service and Privacy Policy text. You need to provide THREE things:

1. SAFETY RATING: Rate the overall safety of this website/service from A (safest) to F (most risky) based on the terms. Consider factors like data privacy, user rights, hidden fees, arbitration clauses, content ownership, etc. Respond with ONLY a single letter (A, B, C, D, E, or F) followed by a brief one-sentence explanation (max 20 words).

2. RED FLAGS: Extract and summarize the 3 most concerning or "red flag" points that users should be aware of before signing up. Format as 3 scary bullet points, each starting with "⚠️", each point having maximum 30 words. Be specific and highlight concerning practices like data sharing, hidden fees, binding arbitration, ownership of user content, etc.

3. PLAIN ENGLISH SUMMARY: Provide a short, easy-to-understand summary of the Terms and Conditions in plain English (maximum 100 words). Focus on what users are agreeing to, key rights they're giving up, and important obligations.

Format your response EXACTLY as follows:
RATING: [letter] - [brief explanation]
RED_FLAGS:
⚠️ [first red flag]
⚠️ [second red flag]
⚠️ [third red flag]
SUMMARY: [plain English summary]

Text to analyze:
${combinedText.substring(0, 30000)}`;

    // Try multiple model names in order of preference
    const modelsToTry = [
      'gemini-1.5-flash',
      'gemini-1.5-pro', 
      'gemini-pro',
      'gemini-1.0-pro',
      'gemini-2.5-flash'
    ];

    let lastError = null;
    
    for (let i = 0; i < modelsToTry.length; i++) {
      const model = modelsToTry[i];
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: prompt
              }]
            }]
          })
        });

        if (response.ok) {
          const data = await response.json();
          const fullResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No summary generated';
          console.log(`Successfully used model: ${model}`);
          
          // Parse the response into structured data
          const parsed = parseGeminiResponse(fullResponse);
          return parsed;
        }
        
        // Not OK response
        const errorData = await response.json().catch(() => ({}));
        lastError = new Error(`API error with ${model}: ${response.status} - ${JSON.stringify(errorData)}`);
        
        // If 404 and not the last model, try next
        if (response.status === 404 && i < modelsToTry.length - 1) {
          console.warn(`Model ${model} not available (404), trying next...`);
          continue;
        }
        
        // For non-404 errors or last model, throw
        throw lastError;
      } catch (error) {
        lastError = error;
        
        // If it's the last model, try listing available models for better error message
        if (i === modelsToTry.length - 1) {
          try {
            const availableModels = await listAvailableModels(apiKey);
            if (availableModels.length > 0) {
              throw new Error(`None of the tried models worked. Available models for your API key: ${availableModels.join(', ')}. Last error: ${error.message}`);
            }
          } catch (listError) {
            // If listing fails, just throw original error
          }
          throw error;
        }
        
        // If error message contains 404, continue to next model
        if (error.message.includes('404')) {
          console.warn(`Model ${model} failed with 404, trying next...`);
          continue;
        }
        
        // For other errors, throw immediately
        throw error;
      }
    }

    throw lastError || new Error('Failed to generate summary with any model');
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    throw error;
  }
}

