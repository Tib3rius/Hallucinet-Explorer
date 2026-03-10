import { contextBridge, ipcRenderer } from 'electron';

// IPC channel names — inlined here because preload scripts can't require project modules
const IPC = {
  NAVIGATE: 'navigate',
  GO_BACK: 'go-back',
  GO_FORWARD: 'go-forward',
  REFRESH: 'refresh',
  REPROMPT: 'reprompt',
  STOP: 'stop',
  NEW_TAB: 'new-tab',
  CLOSE_TAB: 'close-tab',
  SWITCH_TAB: 'switch-tab',
  TAB_UPDATED: 'tab-updated',
  LOADING_STATE: 'loading-state',
  URL_CHANGED: 'url-changed',
  TITLE_CHANGED: 'title-changed',
  NAVIGATION_STATE: 'navigation-state',
  GET_SETTINGS: 'get-settings',
  SAVE_SETTINGS: 'save-settings',
  TEST_CONNECTION: 'test-connection',
  GET_HISTORY: 'get-history',
  CLEAR_HISTORY: 'clear-history',
  CLEAR_CACHE: 'clear-cache',
  GET_CACHE_SIZE: 'get-cache-size',
  GET_COOKIES: 'get-cookies',
  CLEAR_COOKIES: 'clear-cookies',
};

contextBridge.exposeInMainWorld('electronAPI', {
  // Navigation
  navigate: (url: string) => ipcRenderer.send(IPC.NAVIGATE, url),
  goBack: () => ipcRenderer.send(IPC.GO_BACK),
  goForward: () => ipcRenderer.send(IPC.GO_FORWARD),
  refresh: () => ipcRenderer.send(IPC.REFRESH),
  reprompt: () => ipcRenderer.send(IPC.REPROMPT),
  stop: () => ipcRenderer.send(IPC.STOP),

  // Tabs
  newTab: () => ipcRenderer.send(IPC.NEW_TAB),
  closeTab: (tabId: string) => ipcRenderer.send(IPC.CLOSE_TAB, tabId),
  switchTab: (tabId: string) => ipcRenderer.send(IPC.SWITCH_TAB, tabId),
  duplicateTab: (tabId: string) => ipcRenderer.send('duplicate-tab', tabId),
  showTabContextMenu: (tabId: string) => ipcRenderer.send('tab-context-menu', tabId),

  // State updates from main
  onTabUpdated: (callback: (tabs: any[], activeId: string) => void) => {
    ipcRenderer.on(IPC.TAB_UPDATED, (_event, tabs, activeId) => callback(tabs, activeId));
  },
  onLoadingState: (callback: (tabId: string, isLoading: boolean) => void) => {
    ipcRenderer.on(IPC.LOADING_STATE, (_event, tabId, isLoading) => callback(tabId, isLoading));
  },
  onUrlChanged: (callback: (tabId: string, url: string) => void) => {
    ipcRenderer.on(IPC.URL_CHANGED, (_event, tabId, url) => callback(tabId, url));
  },
  onTitleChanged: (callback: (tabId: string, title: string) => void) => {
    ipcRenderer.on(IPC.TITLE_CHANGED, (_event, tabId, title) => callback(tabId, title));
  },
  onNavigationState: (callback: (tabId: string, canGoBack: boolean, canGoForward: boolean) => void) => {
    ipcRenderer.on(IPC.NAVIGATION_STATE, (_event, tabId, canGoBack, canGoForward) => callback(tabId, canGoBack, canGoForward));
  },

  // Settings
  getSettings: () => ipcRenderer.invoke(IPC.GET_SETTINGS),
  saveSettings: (settings: any) => ipcRenderer.invoke(IPC.SAVE_SETTINGS, settings),
  testConnection: () => ipcRenderer.invoke(IPC.TEST_CONNECTION),

  // History
  getHistory: (query: string, limit: number, offset: number) => ipcRenderer.invoke(IPC.GET_HISTORY, query, limit, offset),
  clearHistory: (since?: number) => ipcRenderer.invoke(IPC.CLEAR_HISTORY, since),

  // Cache
  clearCache: (since?: number) => ipcRenderer.invoke(IPC.CLEAR_CACHE, since),
  getCacheSize: () => ipcRenderer.invoke(IPC.GET_CACHE_SIZE),

  // Cookies
  getCookies: () => ipcRenderer.invoke(IPC.GET_COOKIES),
  clearCookies: () => ipcRenderer.invoke(IPC.CLEAR_COOKIES),

  // Request current state from main process
  requestTabState: () => ipcRenderer.send('request-tab-state'),

  // LLM request activity
  onLLMRequestStart: (callback: (tabId: string, url: string) => void) => {
    ipcRenderer.on('llm-request-start', (_event, tabId, url) => callback(tabId, url));
  },
  onLLMRequestEnd: (callback: (tabId: string, url: string) => void) => {
    ipcRenderer.on('llm-request-end', (_event, tabId, url) => callback(tabId, url));
  },

  // Status bar
  onStatusText: (callback: (text: string) => void) => {
    ipcRenderer.on('status-text', (_event, text) => callback(text));
  },

  // Menu-triggered events
  onFocusUrlBar: (callback: () => void) => {
    ipcRenderer.on('focus-url-bar', () => callback());
  },
  onTriggerBack: (callback: () => void) => {
    ipcRenderer.on('trigger-back', () => callback());
  },
  onTriggerForward: (callback: () => void) => {
    ipcRenderer.on('trigger-forward', () => callback());
  },
});
