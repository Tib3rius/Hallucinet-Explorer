// chrome.ts — Browser chrome UI logic
// This file runs as a plain script in chrome.html (not a module).

interface ElectronAPI {
  navigate: (url: string) => void;
  goBack: () => void;
  goForward: () => void;
  refresh: () => void;
  reprompt: () => void;
  stop: () => void;
  newTab: () => void;
  closeTab: (tabId: string) => void;
  switchTab: (tabId: string) => void;
  duplicateTab: (tabId: string) => void;
  showTabContextMenu: (tabId: string) => void;
  onTabUpdated: (callback: (tabs: any[], activeId: string) => void) => void;
  onLoadingState: (callback: (tabId: string, isLoading: boolean) => void) => void;
  onUrlChanged: (callback: (tabId: string, url: string) => void) => void;
  onTitleChanged: (callback: (tabId: string, title: string) => void) => void;
  onNavigationState: (callback: (tabId: string, canGoBack: boolean, canGoForward: boolean) => void) => void;
  requestTabState: () => void;
  onLLMRequestStart: (callback: (tabId: string, url: string) => void) => void;
  onLLMRequestEnd: (callback: (tabId: string, url: string) => void) => void;
  onFocusUrlBar: (callback: () => void) => void;
  onTriggerBack: (callback: () => void) => void;
  onStatusText: (callback: (text: string) => void) => void;
  onTriggerForward: (callback: () => void) => void;
}

const api: ElectronAPI = (window as any).electronAPI;

const tabsContainer = document.getElementById('tabs')!;
const urlBar = document.getElementById('url-bar') as HTMLInputElement;
const backBtn = document.getElementById('back-btn') as HTMLButtonElement;
const forwardBtn = document.getElementById('forward-btn') as HTMLButtonElement;
const refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement;
const stopBtn = document.getElementById('stop-btn') as HTMLButtonElement;
const repromptBtn = document.getElementById('reprompt-btn') as HTMLButtonElement;
const newTabBtn = document.getElementById('new-tab-btn') as HTMLButtonElement;
const llmIndicator = document.getElementById('llm-indicator')!;
const llmCount = document.getElementById('llm-count')!;
const statusBar = document.getElementById('status-bar')!;
const statusText = document.getElementById('status-text')!;

let currentActiveTabId: string | null = null;
const repromptingTabs = new Set<string>(); // tabs where loading was initiated by reprompt

// Per-tab LLM request tracking
const tabRequests = new Map<string, string[]>(); // tabId -> list of active request URLs

// Per-tab URL bar draft: saves in-progress typing when switching tabs
const urlBarDrafts = new Map<string, string>(); // tabId -> draft text (only while focused)
let switchingTabs = false;

// ── Event Listeners ──

urlBar.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    let url = urlBar.value.trim();
    if (!url) return;
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('llm://')) {
      url = 'http://' + url;
    }
    if (currentActiveTabId) urlBarDrafts.delete(currentActiveTabId);
    api.navigate(url);
    urlBar.blur();
  }
});

urlBar.addEventListener('focus', () => {
  urlBar.select();
});

urlBar.addEventListener('blur', () => {
  // Clear the draft when the user blurs without switching tabs
  if (!switchingTabs && currentActiveTabId) urlBarDrafts.delete(currentActiveTabId);
});

backBtn.addEventListener('click', () => api.goBack());
forwardBtn.addEventListener('click', () => api.goForward());
refreshBtn.addEventListener('click', () => api.refresh());
stopBtn.addEventListener('click', () => api.stop());
repromptBtn.addEventListener('click', () => {
  if (currentActiveTabId && repromptingTabs.has(currentActiveTabId)) {
    // Already reprompting — act as stop button
    api.stop();
  } else {
    if (currentActiveTabId) repromptingTabs.add(currentActiveTabId);
    api.reprompt();
  }
});
newTabBtn.addEventListener('click', () => api.newTab());

// Double-click on empty tab bar area to create a new tab
const tabBar = document.getElementById('tab-bar')!;
tabBar.addEventListener('dblclick', (e: MouseEvent) => {
  // Only trigger if the click was on the tab bar itself or #tabs container, not on a tab
  const target = e.target as HTMLElement;
  if (target === tabBar || target === tabsContainer) {
    api.newTab();
  }
});

// ── IPC Listeners ──

api.onTabUpdated((tabs: any[], activeId: string) => {
  // Save URL bar draft for the previous tab if the user was typing
  if (currentActiveTabId && currentActiveTabId !== activeId && document.activeElement === urlBar) {
    urlBarDrafts.set(currentActiveTabId, urlBar.value);
    switchingTabs = true;
    urlBar.blur();
    switchingTabs = false;
  }

  currentActiveTabId = activeId;
  renderTabs(tabs, activeId);

  // Update URL bar and nav buttons for active tab
  const activeTab = tabs.find((t: any) => t.id === activeId);
  if (activeTab) {
    // Restore draft if one was saved, otherwise show the tab's URL
    const draft = urlBarDrafts.get(activeId);
    if (draft !== undefined) {
      urlBar.value = draft;
      urlBar.focus();
    } else if (document.activeElement !== urlBar) {
      urlBar.value = activeTab.url;
    }
    backBtn.disabled = !activeTab.canGoBack;
    forwardBtn.disabled = !activeTab.canGoForward;

    // Restore correct button states for this tab
    const isReprompting = repromptingTabs.has(activeId) && activeTab.isLoading;
    if (isReprompting) {
      repromptBtn.innerHTML = '&#10005;';
      repromptBtn.title = 'Stop loading';
      refreshBtn.classList.remove('hidden');
      stopBtn.classList.add('hidden');
    } else {
      repromptBtn.innerHTML = '&#10227;';
      repromptBtn.title = 'Reprompt (fresh LLM request)';
      refreshBtn.classList.toggle('hidden', activeTab.isLoading);
      stopBtn.classList.toggle('hidden', !activeTab.isLoading);
    }
  }

  // Update LLM indicator for the active tab
  updateLLMIndicator();
});

api.onLoadingState((tabId: string, isLoading: boolean) => {
  if (tabId === currentActiveTabId) {
    if (repromptingTabs.has(tabId)) {
      // Reprompt-initiated loading: toggle reprompt button, leave refresh alone
      if (isLoading) {
        repromptBtn.innerHTML = '&#10005;';
        repromptBtn.title = 'Stop loading';
      } else {
        repromptBtn.innerHTML = '&#10227;';
        repromptBtn.title = 'Reprompt (fresh LLM request)';
      }
    } else {
      // Regular navigation: toggle refresh ↔ stop
      refreshBtn.classList.toggle('hidden', isLoading);
      stopBtn.classList.toggle('hidden', !isLoading);
    }
  }
  if (!isLoading) {
    repromptingTabs.delete(tabId);
    // Clear any stale request tracking when loading fully stops
    tabRequests.delete(tabId);
    if (tabId === currentActiveTabId) updateLLMIndicator();
  }
  // Update tab loading indicator
  const tabEl = document.querySelector(`.tab[data-id="${tabId}"]`);
  if (tabEl) tabEl.classList.toggle('loading', isLoading);
});

api.onUrlChanged((tabId: string, url: string) => {
  if (tabId === currentActiveTabId && document.activeElement !== urlBar) {
    urlBar.value = url;
  }
});

api.onTitleChanged((tabId: string, title: string) => {
  const titleEl = document.querySelector(`.tab[data-id="${tabId}"] .tab-title`);
  if (titleEl) titleEl.textContent = title;
});

api.onNavigationState((tabId: string, canGoBack: boolean, canGoForward: boolean) => {
  if (tabId === currentActiveTabId) {
    backBtn.disabled = !canGoBack;
    forwardBtn.disabled = !canGoForward;
  }
});

// ── Status Bar ──

api.onStatusText((text: string) => {
  statusText.textContent = text;
  statusBar.classList.toggle('hidden', !text);
});

// ── LLM Request Activity Indicator (per-tab) ──

function updateLLMIndicator(): void {
  const urls = currentActiveTabId ? (tabRequests.get(currentActiveTabId) || []) : [];
  const count = urls.length;
  if (count > 0) {
    llmIndicator.classList.remove('hidden');
    llmCount.textContent = String(count);
    const urlList = urls.slice(-5).join('\n');
    llmIndicator.title = `${count} active LLM request${count > 1 ? 's' : ''}\nEach request is sent to your configured LLM to generate a response.\n\n${urlList}`;
  } else {
    llmIndicator.classList.add('hidden');
    llmIndicator.title = '';
  }
}

api.onLLMRequestStart((tabId: string, url: string) => {
  if (!tabRequests.has(tabId)) tabRequests.set(tabId, []);
  tabRequests.get(tabId)!.push(url);
  if (tabId === currentActiveTabId) updateLLMIndicator();
});

api.onLLMRequestEnd((tabId: string, url: string) => {
  const urls = tabRequests.get(tabId);
  if (urls) {
    const idx = urls.indexOf(url);
    if (idx !== -1) urls.splice(idx, 1);
    if (urls.length === 0) tabRequests.delete(tabId);
  }
  if (tabId === currentActiveTabId) updateLLMIndicator();
});

// ── Menu-triggered events ──

api.onFocusUrlBar(() => {
  urlBar.focus();
  urlBar.select();
});

api.onTriggerBack(() => api.goBack());
api.onTriggerForward(() => api.goForward());

// ── Rendering ──

function renderTabs(tabs: any[], activeId: string): void {
  tabsContainer.innerHTML = '';
  for (const tab of tabs) {
    const el = document.createElement('div');
    el.className = `tab${tab.id === activeId ? ' active' : ''}${tab.isLoading ? ' loading' : ''}`;
    el.dataset.id = tab.id;

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.title || tab.url;
    el.appendChild(title);

    const close = document.createElement('span');
    close.className = 'tab-close';
    close.textContent = '\u00d7';
    close.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      api.closeTab(tab.id);
    });
    el.appendChild(close);

    el.addEventListener('click', () => {
      api.switchTab(tab.id);
    });

    el.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      api.showTabContextMenu(tab.id);
    });

    tabsContainer.appendChild(el);
  }
}

// Request current tab state in case we missed the initial broadcast
api.requestTabState();
