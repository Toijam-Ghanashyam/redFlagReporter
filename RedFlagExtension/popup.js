// Popup script for Red Flag Report extension

document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('apiKey');
  const saveBtn = document.getElementById('saveBtn');
  const status = document.getElementById('status');

  // Load saved API key
  const result = await chrome.storage.sync.get(['geminiApiKey']);
  if (result.geminiApiKey) {
    apiKeyInput.value = result.geminiApiKey;
  }

  // Save API key
  saveBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    
    if (!apiKey) {
      showStatus('Please enter an API key', 'error');
      return;
    }

    try {
      await chrome.storage.sync.set({ geminiApiKey: apiKey });
      showStatus('API key saved successfully!', 'success');
      
      // Clear status after 3 seconds
      setTimeout(() => {
        status.className = 'status';
        status.textContent = '';
      }, 3000);
    } catch (error) {
      showStatus('Error saving API key: ' + error.message, 'error');
    }
  });

  function showStatus(message, type) {
    status.textContent = message;
    status.className = `status ${type}`;
    if (type === 'error') {
      status.style.background = 'rgba(244, 67, 54, 0.2)';
      status.style.border = '1px solid rgba(244, 67, 54, 0.5)';
      status.style.color = '#ef5350';
      status.style.display = 'block';
    }
  }
});


