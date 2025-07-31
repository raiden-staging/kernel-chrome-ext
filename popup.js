document.addEventListener('DOMContentLoaded', () => {
  // Tabs
  const sessionBtn = document.getElementById('session-tab-btn');
  const settingsBtn = document.getElementById('settings-tab-btn');
  const sessionTab = document.getElementById('session-tab');
  const settingsTab = document.getElementById('settings-tab');
  const gotoSettings = document.getElementById('goto-settings');

  // Session UI
  const noKeyWarning = document.getElementById('no-key-warning');
  const toggleControls = document.getElementById('toggle-controls');
  const controls = document.getElementById('controls');
  const widthInput = document.getElementById('width');
  const heightInput = document.getElementById('height');
  const saveDims = document.getElementById('save-dims');
  const newSessionBtn = document.getElementById('new-session');
  const resumeContainer = document.getElementById('resume-container');
  const sessionList = document.getElementById('session-list');
  const resumeSessionBtn = document.getElementById('resume-session');
  const iframeContainer = document.getElementById('iframe-container');
  const fullscreenBtn = document.getElementById('fullscreen');

  // Settings UI
  const apiKeyInput = document.getElementById('api-key');
  const saveKeyBtn = document.getElementById('save-key');

  // storage helpers
  const getStored = keys => new Promise(r => chrome.storage.local.get(keys, r));
  const setStored = obj => new Promise(r => chrome.storage.local.set(obj, r));
  const isRecent = ts => (Date.now() - ts) < 3600_000; // 1h

  // Tab switching
  function showSessionTab() {
    settingsTab.classList.add('hidden');
    sessionTab.classList.remove('hidden');
    settingsBtn.classList.replace('text-purple-600', 'text-gray-500');
    sessionBtn.classList.replace('text-gray-500', 'text-purple-600');
  }
  function showSettingsTab() {
    sessionTab.classList.add('hidden');
    settingsTab.classList.remove('hidden');
    sessionBtn.classList.replace('text-purple-600', 'text-gray-500');
    settingsBtn.classList.replace('text-gray-500', 'text-purple-600');
  }
  sessionBtn.addEventListener('click', showSessionTab);
  settingsBtn.addEventListener('click', showSettingsTab);
  gotoSettings.addEventListener('click', showSettingsTab);

  // Refresh the <select> of recent sessions (<1h old)
  async function refreshSessionList() {
    const { kernel_sessions = [] } = await getStored('kernel_sessions');
    const recent = kernel_sessions.filter(s => isRecent(s.timestamp));
    if (recent.length === 0) {
      resumeContainer.classList.add('hidden');
      return;
    }
    resumeContainer.classList.remove('hidden');
    sessionList.innerHTML = '';
    recent.forEach((s, i) => {
      const opt = document.createElement('option');
      const dt = new Date(s.timestamp).toLocaleString();
      opt.value = i;
      opt.text = `${s.session_id} — ${dt}`;
      sessionList.add(opt);
    });
    resumeSessionBtn.disabled = false;
  }

  // Load a session into the iframe
  async function loadSession(sess) {
    iframeContainer.innerHTML = '';
    iframeContainer.classList.remove('hidden');
    const { kernel_width: w = 800, kernel_height: h = 600 } =
      await getStored(['kernel_width', 'kernel_height']);
    const url = new URL(sess.url);
    url.searchParams.set('w', w);
    url.searchParams.set('h', h);
    const ifr = document.createElement('iframe');
    ifr.src = url.toString();
    ifr.style.width = '100%';
    ifr.style.height = '100%';
    ifr.style.border = 'none';
    ifr.style.backgroundColor = "transparent";
    ifr.allowtransparency = "true";
    iframeContainer.appendChild(ifr);
  }

  // Initial UI setup
  (async () => {
    const store = await getStored([
      'kernel_api_key', 'kernel_width', 'kernel_height', 'kernel_sessions'
    ]);
    if (!store.kernel_api_key) {
      noKeyWarning.classList.remove('hidden');
      controls.classList.add('hidden');
    } else {
      apiKeyInput.value = store.kernel_api_key;
    }
    widthInput.value = store.kernel_width || 800;
    heightInput.value = store.kernel_height || 600;
    await refreshSessionList();
  })();

  // Hide/Show controls
  toggleControls.addEventListener('click', () => {
    const hidden = controls.classList.toggle('hidden');
    toggleControls.textContent = hidden ? 'Show Controls' : 'Hide Controls';
  });

  // Open the current iframe's src in a new tab
  fullscreenBtn.addEventListener('click', () => {
    const ifr = iframeContainer.querySelector('iframe');
    if (ifr && ifr.src) {
      chrome.tabs.create({ url: ifr.src });
    }
  });

  // Save API key
  saveKeyBtn.addEventListener('click', async () => {
    const k = apiKeyInput.value.trim();
    if (!k) return alert('Key cannot be empty');
    await setStored({ kernel_api_key: k });
    alert('API key saved');
    showSessionTab();
    noKeyWarning.classList.add('hidden');
    controls.classList.remove('hidden');
  });

  // Save width/height
  saveDims.addEventListener('click', async () => {
    const w = parseInt(widthInput.value, 10);
    const h = parseInt(heightInput.value, 10);
    if (!w || !h) return alert('Invalid dims');
    await setStored({ kernel_width: w, kernel_height: h });
  });

  // New Session → POST /browsers
  newSessionBtn.addEventListener('click', async () => {
    const { kernel_api_key: key, kernel_sessions = [] } =
      await getStored(['kernel_api_key', 'kernel_sessions']);
    if (!key) return alert('Please set API key first');
    const persistenceId = Date.now().toString();
    try {
      const resp = await fetch('https://api.onkernel.com/browsers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + key
        },
        body: JSON.stringify({ persistence: { id: persistenceId } })
      });
      const data = await resp.json();
      if (!data.browser_live_view_url) throw new Error('no URL returned');
      // prepend to sessions (keep full history)
      kernel_sessions.unshift({
        url: data.browser_live_view_url,
        timestamp: Date.now(),
        persistenceId,
        session_id: data.session_id
      });
      // optionally prune to last 10 sessions:
      if (kernel_sessions.length > 10) kernel_sessions.pop();
      await setStored({ kernel_sessions });
      await refreshSessionList();
      loadSession(kernel_sessions[0]);
    } catch (err) {
      console.error(err);
      alert('Failed to create session');
    }
  });

  // Resume the selected session
  resumeSessionBtn.addEventListener('click', async () => {
    const { kernel_sessions = [] } = await getStored('kernel_sessions');
    const recent = kernel_sessions.filter(s => isRecent(s.timestamp));
    const idx = parseInt(sessionList.value, 10);
    const sess = recent[idx];
    if (!sess) return alert('Pick a valid session');
    loadSession(sess);
  });
});