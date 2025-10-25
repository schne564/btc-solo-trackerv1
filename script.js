// ============================================
// CONFIGURATION & STATE
// ============================================
const CONFIG = {
  defaultAddress: "bc1qd6mfkav3yzztuhpq6qg0kfm5fc2ay7jvy52rdn",
  endpoint: "https://broad-cell-151e.schne564.workers.dev/",
  refreshInterval: 5000,
  maxHistoryItems: 10
};

let state = {
  previousBestShare: 0,
  previousDifficulty: 0,
  autoRefreshEnabled: true,
  refreshTimer: null,
  shareHistory: [],
  notificationsEnabled: false,
  currentData: {}
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatWithSuffix(value) {
  if (!value || isNaN(value)) return "Unavailable";
  if (value >= 1e12) return (value / 1e12).toFixed(2) + " T";
  if (value >= 1e9) return (value / 1e9).toFixed(2) + " G";
  if (value >= 1e6) return (value / 1e6).toFixed(2) + " M";
  if (value >= 1e3) return (value / 1e3).toFixed(2) + " K";
  return value.toLocaleString();
}

function formatTimestamp(date = new Date()) {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function formatTimeEstimate(timeEstimateString) {
  if (!timeEstimateString || timeEstimateString === "Unavailable") {
    return "Unavailable";
  }
  
  // Extract number of days from string like "X days" or "X.XX days"
  const match = timeEstimateString.match(/([\d,\.]+)\s*days?/i);
  if (!match) {
    return timeEstimateString; // Return original if we can't parse it
  }
  
  // Remove commas and parse the number
  const totalDays = parseFloat(match[1].replace(/,/g, ''));
  
  if (isNaN(totalDays)) {
    return timeEstimateString;
  }
  
  // Convert to years and days
  const years = Math.floor(totalDays / 365);
  const days = Math.floor(totalDays % 365);
  
  if (years === 0) {
    return `${days} day${days !== 1 ? 's' : ''}`;
  } else if (days === 0) {
    return `${years} year${years !== 1 ? 's' : ''}`;
  } else {
    return `${years} year${years !== 1 ? 's' : ''}, ${days} day${days !== 1 ? 's' : ''}`;
  }
}

function formatHashrate(hashrateString) {
  if (!hashrateString || hashrateString === "Unavailable") {
    return "Unavailable";
  }
  
  // Extract number and unit from string like "123.45 H/s" or "1,234.56 H/s"
  const match = hashrateString.match(/([\d,\.]+)\s*([a-z]+\/s)/i);
  if (!match) {
    return hashrateString; // Return original if we can't parse it
  }
  
  // Remove commas and parse the number
  const value = parseFloat(match[1].replace(/,/g, ''));
  const unit = match[2].toUpperCase();
  
  if (isNaN(value)) {
    return hashrateString;
  }
  
  // Convert to TH/s based on current unit
  let thValue;
  
  if (unit === 'H/S') {
    thValue = value / 1e12; // H/s to TH/s
  } else if (unit === 'KH/S') {
    thValue = value / 1e9; // KH/s to TH/s
  } else if (unit === 'MH/S') {
    thValue = value / 1e6; // MH/s to TH/s
  } else if (unit === 'GH/S') {
    thValue = value / 1e3; // GH/s to TH/s
  } else if (unit === 'TH/S') {
    thValue = value; // Already in TH/s
  } else if (unit === 'PH/S') {
    thValue = value * 1e3; // PH/s to TH/s
  } else {
    return hashrateString; // Unknown unit, return original
  }
  
  return `${thValue.toFixed(2)} TH/s`;
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function showError(message) {
  const errorDiv = document.getElementById('errorMessage');
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';
  setTimeout(() => {
    errorDiv.style.display = 'none';
  }, 5000);
}

function showLoading(show) {
  document.getElementById('loadingIndicator').style.display = show ? 'flex' : 'none';
}

// ============================================
// LOCAL STORAGE MANAGEMENT
// ============================================

function saveToLocalStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('Failed to save to localStorage:', e);
  }
}

function loadFromLocalStorage(key, defaultValue = null) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (e) {
    console.error('Failed to load from localStorage:', e);
    return defaultValue;
  }
}

function loadShareHistory() {
  state.shareHistory = loadFromLocalStorage('shareHistory', []);
  updateHistoryDisplay();
}

function saveShareHistory() {
  saveToLocalStorage('shareHistory', state.shareHistory);
}

function addToHistory(share, timestamp) {
  state.shareHistory.unshift({
    share,
    timestamp,
    formatted: formatWithSuffix(share)
  });
  
  // Keep only last N items
  if (state.shareHistory.length > CONFIG.maxHistoryItems) {
    state.shareHistory = state.shareHistory.slice(0, CONFIG.maxHistoryItems);
  }
  
  saveShareHistory();
  updateHistoryDisplay();
}

function updateHistoryDisplay() {
  const historyList = document.getElementById('historyList');
  
  if (state.shareHistory.length === 0) {
    historyList.innerHTML = '<div class="no-history">No share history yet</div>';
    return;
  }
  
  historyList.innerHTML = state.shareHistory.map((item, index) => `
    <div class="history-item ${index === 0 ? 'latest' : ''}">
      <span class="history-share">${item.formatted}</span>
      <span class="history-time">${item.timestamp}</span>
    </div>
  `).join('');
}

// ============================================
// NOTIFICATIONS
// ============================================

function requestNotifications() {
  if (!("Notification" in window)) {
    showToast("Browser doesn't support notifications", 'error');
    return;
  }

  if (Notification.permission === "granted") {
    state.notificationsEnabled = true;
    showToast("Notifications already enabled!", 'success');
    updateNotifyButton();
    return;
  }

  if (Notification.permission !== "denied") {
    Notification.requestPermission().then(permission => {
      if (permission === "granted") {
        state.notificationsEnabled = true;
        showToast("Notifications enabled!", 'success');
        updateNotifyButton();
        // Show test notification
        new Notification("BTC Solo Tracker", {
          body: "Notifications are now enabled!",
          icon: "⛏️"
        });
      }
    });
  }
}

function sendNotification(title, body) {
  if (state.notificationsEnabled && Notification.permission === "granted") {
    new Notification(title, {
      body: body,
      icon: "⛏️",
      badge: "⛏️"
    });
  }
}

function updateNotifyButton() {
  const btn = document.getElementById('notifyBtn');
  if (state.notificationsEnabled) {
    btn.textContent = '🔔 ON';
    btn.classList.add('active');
  } else {
    btn.textContent = '🔔 Notify';
    btn.classList.remove('active');
  }
}

function notifyNewBestShare(newShare) {
  const shareElem = document.getElementById("bestshare");
  shareElem.classList.add("highlight");
  
  // Play sound
  try {
    const audio = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
    audio.play().catch(e => console.log('Could not play sound:', e));
  } catch (e) {
    console.log('Audio not supported');
  }
  
  // Send notification
  sendNotification(
    "🎉 New Best Share!",
    `New best share: ${formatWithSuffix(newShare)}`
  );
  
  // Add to history
  addToHistory(newShare, formatTimestamp());
  
  // Show toast
  showToast(`New best share: ${formatWithSuffix(newShare)}!`, 'success');
  
  setTimeout(() => {
    shareElem.classList.remove("highlight");
  }, 3000);
}

function notifyDifficultyChange(newDifficulty) {
  sendNotification(
    "📊 Difficulty Changed",
    `Network difficulty: ${newDifficulty.toLocaleString()}`
  );
  showToast(`Difficulty updated: ${newDifficulty.toLocaleString()}`, 'info');
}

// ============================================
// DATA FETCHING & UPDATES
// ============================================

function updateStats(address) {
  if (!address) {
    showError("Please enter a valid BTC address");
    return;
  }
  
  showLoading(true);
  const endpoint = `${CONFIG.endpoint}?address=${address}`;
  
  fetch(endpoint)
    .then((res) => {
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      return res.json();
    })
    .then((data) => {
      state.currentData = data;
      
      // Update all fields
      document.getElementById("address").textContent = data.address || "Unavailable";
      document.getElementById("workers").textContent = formatWithSuffix(data.workers);
      document.getElementById("shares").textContent = data.shares || "Unavailable";
      document.getElementById("lastBlock").textContent = data.lastBlock || "Unavailable";
      document.getElementById("hashrate1hr").textContent = formatHashrate(data.hashrate1hr);
      document.getElementById("hashrate5m").textContent = formatHashrate(data.hashrate5m);
      document.getElementById("chancePerBlock").textContent = data.chancePerBlock || "Unavailable";
      document.getElementById("chancePerDay").textContent = data.chancePerDay || "Unavailable";
      document.getElementById("timeEstimate").textContent = formatTimeEstimate(data.timeEstimate);
      
      // Handle best share with notification
      const newBestShare = parseFloat(data.bestshare);
      document.getElementById("bestshare").textContent = formatWithSuffix(newBestShare);
      
      if (!isNaN(newBestShare) && newBestShare > state.previousBestShare && state.previousBestShare > 0) {
        notifyNewBestShare(newBestShare);
      }
      state.previousBestShare = newBestShare;
      
      // Handle difficulty with notification
      const newDifficulty = parseFloat(data.difficulty);
      document.getElementById("difficulty").textContent = newDifficulty.toLocaleString();
      
      if (!isNaN(newDifficulty) && newDifficulty !== state.previousDifficulty && state.previousDifficulty > 0) {
        notifyDifficultyChange(newDifficulty);
      }
      state.previousDifficulty = newDifficulty;
      
      // Update timestamp
      document.getElementById("lastUpdated").textContent = `Last updated: ${formatTimestamp()}`;
      
      showLoading(false);
    })
    .catch((err) => {
      console.error("Error fetching data:", err);
      showError(`Failed to fetch data: ${err.message}. Retrying...`);
      showLoading(false);
    });
}

function handleAddressSubmit() {
  const address = document.getElementById("btcAddressInput").value.trim();
  if (address) {
    // Save to localStorage
    saveToLocalStorage('lastAddress', address);
    
    // Update URL without reload
    const url = new URL(window.location);
    url.searchParams.set('address', address);
    window.history.pushState({}, '', url);
    
    updateStats(address);
    resetAutoRefresh();
  } else {
    showError("Please enter a valid BTC address");
  }
}

// ============================================
// AUTO-REFRESH MANAGEMENT
// ============================================

function toggleAutoRefresh() {
  state.autoRefreshEnabled = !state.autoRefreshEnabled;
  const btn = document.getElementById('pauseBtn');
  const status = document.getElementById('autoRefreshStatus');
  
  if (state.autoRefreshEnabled) {
    btn.textContent = '⏸️ Pause';
    btn.classList.remove('paused');
    status.textContent = `Auto-refresh: ON (${CONFIG.refreshInterval / 1000}s)`;
    resetAutoRefresh();
    showToast('Auto-refresh enabled', 'info');
  } else {
    btn.textContent = '▶️ Resume';
    btn.classList.add('paused');
    status.textContent = 'Auto-refresh: OFF';
    if (state.refreshTimer) {
      clearInterval(state.refreshTimer);
      state.refreshTimer = null;
    }
    showToast('Auto-refresh paused', 'info');
  }
}

function resetAutoRefresh() {
  if (state.refreshTimer) {
    clearInterval(state.refreshTimer);
  }
  
  if (state.autoRefreshEnabled) {
    state.refreshTimer = setInterval(() => {
      const currentAddress = document.getElementById("btcAddressInput").value.trim();
      if (currentAddress) {
        updateStats(currentAddress);
      }
    }, CONFIG.refreshInterval);
  }
}

function manualRefresh() {
  const currentAddress = document.getElementById("btcAddressInput").value.trim();
  if (currentAddress) {
    updateStats(currentAddress);
    showToast('Refreshing...', 'info');
  } else {
    showError("Please enter a valid BTC address first");
  }
}

// ============================================
// DATA EXPORT
// ============================================

function exportData() {
  if (!state.currentData || Object.keys(state.currentData).length === 0) {
    showError("No data to export. Fetch stats first!");
    return;
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `btc-mining-stats-${timestamp}.csv`;
  
  // Create CSV content
  const headers = Object.keys(state.currentData).join(',');
  const values = Object.values(state.currentData).join(',');
  const csv = `${headers}\n${values}`;
  
  // Create download
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
  
  showToast('Data exported successfully!', 'success');
}

// ============================================
// INITIALIZATION
// ============================================

function getAddressFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get('address');
}

function initializeApp() {
  // Load share history
  loadShareHistory();
  
  // Check for notification permission
  if (Notification.permission === "granted") {
    state.notificationsEnabled = true;
    updateNotifyButton();
  }
  
  // Get address from URL or localStorage or use default
  let address = getAddressFromURL() || 
                loadFromLocalStorage('lastAddress') || 
                CONFIG.defaultAddress;
  
  // Set input field
  document.getElementById("btcAddressInput").value = address;
  
  // Add enter key support
  document.getElementById("btcAddressInput").addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleAddressSubmit();
    }
  });
  
  // Initial fetch
  updateStats(address);
  
  // Start auto-refresh
  resetAutoRefresh();
  
  console.log('BTC Solo Mining Tracker initialized!');
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
