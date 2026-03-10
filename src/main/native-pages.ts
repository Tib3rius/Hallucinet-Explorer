/**
 * Serves native pages for llm:// URLs (settings, history, newtab).
 */

export function serveNativePage(url: string): string {
  const parsed = new URL(url);
  const host = parsed.hostname;

  switch (host) {
    case 'newtab':
      return newTabPage();
    case 'settings':
      return settingsPage();
    case 'history':
      return historyPage();
    default:
      return notFoundPage(url);
  }
}

function newTabPage(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>New Tab — Hallucinet Explorer</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #1a1412, #0d0b09, #1a1412);
      color: #e0e0e0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    h1 {
      font-size: 64px;
      font-weight: 200;
      margin-bottom: 8px;
      background: linear-gradient(90deg, #e94560, #0f3460, #e94560);
      background-size: 200%;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      animation: shimmer 3s ease-in-out infinite;
    }
    @keyframes shimmer { 0%,100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
    .subtitle { color: #888; font-size: 16px; margin-bottom: 40px; }
    .search-box {
      display: flex;
      width: 560px;
      max-width: 90vw;
    }
    .search-box input {
      flex: 1;
      padding: 14px 20px;
      font-size: 16px;
      border: 2px solid #333;
      border-radius: 12px;
      background: rgba(255,255,255,0.05);
      color: #fff;
      outline: none;
      transition: border-color 0.2s;
    }
    .search-box input:focus { border-color: #e94560; }
    .search-box input::placeholder { color: #666; }
    .hint { margin-top: 20px; color: #555; font-size: 13px; }
  </style>
</head>
<body>
  <h1>Hallucinet Explorer</h1>
  <p class="subtitle">Browse the World Vibe Web</p>
  <div class="search-box">
    <input type="text" id="urlInput" placeholder="Enter a URL to browse the World Vibe Web..." autofocus />
  </div>
  <p class="hint">Try: http://wikipedia.org &bull; http://news.ycombinator.com &bull; http://recipes.ai</p>
  <script>
    document.getElementById('urlInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        let url = e.target.value.trim();
        if (url && !url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('llm://')) {
          url = 'http://' + url;
        }
        if (url) {
          window.electronAPI.navigate(url);
        }
      }
    });
  </script>
</body>
</html>`;
}

function settingsPage(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Settings — Hallucinet Explorer</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1a1a2e; color: #e0e0e0; padding: 40px; max-width: 800px; margin: 0 auto; }
    h1 { font-size: 28px; margin-bottom: 30px; color: #e94560; }
    h2 { font-size: 18px; margin: 24px 0 12px; color: #aaa; border-bottom: 1px solid #333; padding-bottom: 8px; }
    label { display: block; margin: 12px 0 4px; font-weight: 600; font-size: 14px; }
    input[type="text"], input[type="password"], input[type="number"], textarea, select {
      width: 100%; padding: 10px; background: #16213e; border: 1px solid #333; border-radius: 6px; color: #fff; font-size: 14px; font-family: inherit;
    }
    textarea { min-height: 200px; resize: vertical; font-family: monospace; }
    button { padding: 10px 20px; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; margin: 8px 8px 8px 0; }
    .btn-primary { background: #e94560; color: white; }
    .btn-primary:hover { background: #c73e54; }
    .btn-secondary { background: #333; color: #ccc; }
    .btn-secondary:hover { background: #444; }
    .btn-danger { background: #8b0000; color: white; }
    .btn-danger:hover { background: #a00; }
    .status { padding: 8px 12px; border-radius: 4px; margin: 8px 0; font-size: 13px; display: none; }
    .status.success { display: block; background: #1a4d2e; color: #4caf50; }
    .status.error { display: block; background: #4d1a1a; color: #f44336; }
    .row { display: flex; gap: 12px; align-items: flex-end; }
    .row > * { flex: 1; }
  </style>
</head>
<body>
  <h1>Settings</h1>

  <h2>LLM Provider</h2>
  <label>Provider Preset</label>
  <select id="preset">
    <option value="anthropic">Anthropic</option>
    <option value="openai">OpenAI</option>
    <option value="google">Google Gemini</option>
    <option value="ollama">Ollama (local)</option>
    <option value="custom">Custom</option>
  </select>

  <label>Base URL</label>
  <input type="text" id="baseUrl" placeholder="https://api.openai.com/v1" />

  <label>API Key</label>
  <input type="password" id="apiKey" placeholder="sk-..." />

  <label>Model</label>
  <input type="text" id="model" placeholder="gpt-4o" />

  <button class="btn-secondary" id="testBtn">Test Connection</button>
  <div id="testStatus" class="status"></div>

  <h2>System Prompt</h2>
  <textarea id="systemPrompt"></textarea>
  <button class="btn-secondary" id="resetPromptBtn">Reset to Default</button>
  <label>Temperature: <span id="tempValue">1.0</span></label>
  <div id="tempSlider" style="position:relative;width:100%;height:28px;cursor:pointer;user-select:none;">
    <div style="position:absolute;top:12px;left:0;right:0;height:4px;background:#333;border-radius:2px;">
      <div id="tempFill" style="height:100%;background:#e94560;border-radius:2px;width:50%;"></div>
    </div>
    <div id="tempThumb" style="position:absolute;top:5px;width:18px;height:18px;background:#e94560;border-radius:50%;left:calc(50% - 9px);box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>
  </div>
  <input type="hidden" id="temperature" value="1.0" />
  <div style="display:flex;justify-content:space-between;font-size:11px;color:#666;margin-top:2px;">
    <span>0 — Deterministic</span>
    <span>1 — Default</span>
    <span>2 — Creative</span>
  </div>

  <h2>Request Behavior</h2>
  <div class="row">
    <div>
      <label>Timeout (seconds)</label>
      <input type="number" id="timeout" min="10" max="300" value="60" />
    </div>
    <div>
      <label>Max Redirect Hops</label>
      <input type="number" id="maxRedirects" min="1" max="20" value="10" />
    </div>
  </div>

  <h2>Cache</h2>
  <p id="cacheSize">Cache entries: loading...</p>
  <select id="cacheClearRange">
    <option value="3600000">Last hour</option>
    <option value="86400000">Last 24 hours</option>
    <option value="604800000">Last 7 days</option>
    <option value="2592000000">Last 30 days</option>
    <option value="0">All time</option>
  </select>
  <button class="btn-danger" id="clearCacheBtn">Clear Cache</button>

  <h2>History</h2>
  <select id="historyClearRange">
    <option value="3600000">Last hour</option>
    <option value="86400000">Last 24 hours</option>
    <option value="604800000">Last 7 days</option>
    <option value="2592000000">Last 30 days</option>
    <option value="0">All time</option>
  </select>
  <button class="btn-danger" id="clearHistoryBtn">Clear History</button>

  <h2>Cookies</h2>
  <button class="btn-danger" id="clearCookiesBtn">Clear All Cookies</button>

  <div id="saveStatus" class="status"></div>

  <script>
    const presetUrls = {
      anthropic: 'https://api.anthropic.com/v1',
      openai: 'https://api.openai.com/v1',
      google: 'https://generativelanguage.googleapis.com/v1beta/openai',
      ollama: 'http://localhost:11434/v1',
      custom: '',
    };

    const presetModels = {
      anthropic: 'claude-sonnet-4-20250514',
      openai: 'gpt-4o',
      google: 'gemini-2.0-flash',
      ollama: 'llama3',
      custom: '',
    };

    let saveTimer = null;
    let isLoading = true;

    function gatherSettings() {
      return {
        provider: {
          preset: document.getElementById('preset').value,
          baseUrl: document.getElementById('baseUrl').value,
          apiKey: document.getElementById('apiKey').value,
          model: document.getElementById('model').value,
        },
        systemPrompt: document.getElementById('systemPrompt').value,
        requestTimeout: parseInt(document.getElementById('timeout').value) || 60,
        maxRedirectHops: parseInt(document.getElementById('maxRedirects').value) || 10,
        temperature: parseFloat(document.getElementById('temperature').value) ?? 1.0,
      };
    }

    function autoSave() {
      if (isLoading) return;
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        await window.electronAPI.saveSettings(gatherSettings());
        const el = document.getElementById('saveStatus');
        el.className = 'status success';
        el.textContent = 'Settings saved';
        setTimeout(() => el.className = 'status', 1500);
      }, 300);
    }

    // Attach auto-save to all settings fields
    ['preset', 'baseUrl', 'apiKey', 'model', 'systemPrompt', 'timeout', 'maxRedirects', 'temperature'].forEach(id => {
      const el = document.getElementById(id);
      el.addEventListener('input', autoSave);
      el.addEventListener('change', autoSave);
    });

    // Custom temperature slider drag handling
    (function() {
      const slider = document.getElementById('tempSlider');
      const thumb = document.getElementById('tempThumb');
      const fill = document.getElementById('tempFill');
      const hidden = document.getElementById('temperature');
      const label = document.getElementById('tempValue');
      const min = 0, max = 2, step = 0.1;

      function setTemp(ratio) {
        ratio = Math.max(0, Math.min(1, ratio));
        let val = min + ratio * (max - min);
        val = Math.round(val / step) * step;
        ratio = (val - min) / (max - min);
        hidden.value = val.toFixed(1);
        label.textContent = val.toFixed(1);
        fill.style.width = (ratio * 100) + '%';
        thumb.style.left = 'calc(' + (ratio * 100) + '% - 9px)';
      }

      function getRatio(e) {
        const rect = slider.getBoundingClientRect();
        return (e.clientX - rect.left) / rect.width;
      }

      let dragging = false;
      slider.addEventListener('mousedown', (e) => {
        dragging = true;
        setTemp(getRatio(e));
        e.preventDefault();
      });
      document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        setTemp(getRatio(e));
      });
      document.addEventListener('mouseup', () => {
        if (dragging) { dragging = false; autoSave(); }
      });
      slider.addEventListener('click', (e) => {
        setTemp(getRatio(e));
        autoSave();
      });
    })();

    // Load settings
    window.electronAPI.getSettings().then(settings => {
      document.getElementById('preset').value = settings.provider.preset;
      document.getElementById('baseUrl').value = settings.provider.baseUrl;
      document.getElementById('apiKey').value = settings.provider.apiKey;
      document.getElementById('model').value = settings.provider.model;
      document.getElementById('systemPrompt').value = settings.systemPrompt;
      document.getElementById('timeout').value = settings.requestTimeout;
      document.getElementById('maxRedirects').value = settings.maxRedirectHops;
      const temp = settings.temperature ?? 1.0;
      document.getElementById('temperature').value = temp.toFixed(1);
      document.getElementById('tempValue').textContent = temp.toFixed(1);
      const ratio = temp / 2;
      document.getElementById('tempFill').style.width = (ratio * 100) + '%';
      document.getElementById('tempThumb').style.left = 'calc(' + (ratio * 100) + '% - 9px)';
      isLoading = false;
    });

    window.electronAPI.getCacheSize().then(size => {
      document.getElementById('cacheSize').textContent = 'Cache entries: ' + size;
    });

    document.getElementById('preset').addEventListener('change', (e) => {
      const preset = e.target.value;
      const url = presetUrls[preset];
      if (url) document.getElementById('baseUrl').value = url;
      const model = presetModels[preset];
      if (model) document.getElementById('model').value = model;
      autoSave();
    });

    document.getElementById('testBtn').addEventListener('click', async () => {
      // Save current settings first so the test uses them
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      await window.electronAPI.saveSettings(gatherSettings());

      const el = document.getElementById('testStatus');
      el.className = 'status';
      el.textContent = 'Testing...';
      el.style.display = 'block';
      const result = await window.electronAPI.testConnection();
      el.className = result.ok ? 'status success' : 'status error';
      el.textContent = result.ok ? 'Connection successful!' : 'Failed: ' + result.error;
    });

    document.getElementById('resetPromptBtn').addEventListener('click', async () => {
      const settings = await window.electronAPI.getSettings();
      document.getElementById('systemPrompt').value = settings.defaultSystemPrompt || settings.systemPrompt;
      autoSave();
    });

    document.getElementById('clearCacheBtn').addEventListener('click', async () => {
      const range = parseInt(document.getElementById('cacheClearRange').value);
      const since = range > 0 ? Date.now() - range : undefined;
      await window.electronAPI.clearCache(since);
      window.electronAPI.getCacheSize().then(size => {
        document.getElementById('cacheSize').textContent = 'Cache entries: ' + size;
      });
    });

    document.getElementById('clearHistoryBtn').addEventListener('click', async () => {
      const range = parseInt(document.getElementById('historyClearRange').value);
      const since = range > 0 ? Date.now() - range : undefined;
      await window.electronAPI.clearHistory(since);
    });

    document.getElementById('clearCookiesBtn').addEventListener('click', async () => {
      await window.electronAPI.clearCookies();
    });
  </script>
</body>
</html>`;
}

function historyPage(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>History — Hallucinet Explorer</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1a1a2e; color: #e0e0e0; padding: 40px; max-width: 800px; margin: 0 auto; }
    h1 { font-size: 28px; margin-bottom: 20px; color: #e94560; }
    input[type="text"] { width: 100%; padding: 12px; background: #16213e; border: 1px solid #333; border-radius: 6px; color: #fff; font-size: 14px; margin-bottom: 20px; }
    .entry { padding: 12px; border-bottom: 1px solid #222; cursor: pointer; transition: background 0.15s; }
    .entry:hover { background: #16213e; }
    .entry-title { font-weight: 600; color: #e0e0e0; }
    .entry-url { font-size: 13px; color: #666; margin-top: 2px; }
    .entry-time { font-size: 12px; color: #444; margin-top: 2px; }
    #entries { margin-top: 10px; }
    .load-more { text-align: center; padding: 16px; }
    .load-more button { padding: 8px 20px; background: #333; color: #ccc; border: none; border-radius: 6px; cursor: pointer; }
  </style>
</head>
<body>
  <h1>History</h1>
  <input type="text" id="search" placeholder="Search history..." />
  <div id="entries"></div>
  <div class="load-more"><button id="loadMoreBtn">Load More</button></div>

  <script>
    let offset = 0;
    const limit = 50;

    async function loadHistory(query, append) {
      const entries = await window.electronAPI.getHistory(query, limit, append ? offset : 0);
      const container = document.getElementById('entries');
      if (!append) { container.innerHTML = ''; offset = 0; }

      entries.forEach(entry => {
        const div = document.createElement('div');
        div.className = 'entry';
        div.innerHTML = '<div class="entry-title">' + escapeHtml(entry.title || entry.url) + '</div>'
          + '<div class="entry-url">' + escapeHtml(entry.url) + '</div>'
          + '<div class="entry-time">' + new Date(entry.visitedAt).toLocaleString() + '</div>';
        div.addEventListener('click', () => window.electronAPI.navigate(entry.url));
        container.appendChild(div);
      });

      offset += entries.length;
    }

    function escapeHtml(t) { return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    document.getElementById('search').addEventListener('input', (e) => {
      loadHistory(e.target.value, false);
    });

    document.getElementById('loadMoreBtn').addEventListener('click', () => {
      loadHistory(document.getElementById('search').value, true);
    });

    loadHistory('', false);
  </script>
</body>
</html>`;
}

function notFoundPage(url: string): string {
  return `<!DOCTYPE html>
<html>
<head><title>Not Found</title>
<style>body { font-family: sans-serif; background: #1a1a2e; color: #e0e0e0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
.container { text-align: center; } h1 { color: #e94560; }</style></head>
<body><div class="container"><h1>404</h1><p>Unknown internal page: ${url}</p></div></body></html>`;
}
