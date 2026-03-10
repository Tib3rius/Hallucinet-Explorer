/**
 * Preload script injected into every tab's WebContentsView.
 * Overrides APIs that cannot be intercepted at the protocol level.
 */
import { contextBridge, ipcRenderer } from 'electron';

// IPC channel names — inlined because preload scripts can't require project modules
const IPC = {
  NAVIGATE: 'navigate',
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

// Expose a minimal API for native pages (llm:// URLs)
contextBridge.exposeInMainWorld('electronAPI', {
  navigate: (url: string) => ipcRenderer.send(IPC.NAVIGATE, url),
  getSettings: () => ipcRenderer.invoke(IPC.GET_SETTINGS),
  saveSettings: (settings: any) => ipcRenderer.invoke(IPC.SAVE_SETTINGS, settings),
  testConnection: () => ipcRenderer.invoke(IPC.TEST_CONNECTION),
  getHistory: (query: string, limit: number, offset: number) => ipcRenderer.invoke(IPC.GET_HISTORY, query, limit, offset),
  clearHistory: (since?: number) => ipcRenderer.invoke(IPC.CLEAR_HISTORY, since),
  clearCache: (since?: number) => ipcRenderer.invoke(IPC.CLEAR_CACHE, since),
  getCacheSize: () => ipcRenderer.invoke(IPC.GET_CACHE_SIZE),
  getCookies: () => ipcRenderer.invoke(IPC.GET_COOKIES),
  clearCookies: () => ipcRenderer.invoke(IPC.CLEAR_COOKIES),
});

// Disable WebSocket to prevent real network connections
const script = document.createElement('script');
script.textContent = `
  window.WebSocket = class {
    constructor() { throw new Error('WebSocket is disabled in Hallucinet Explorer — all requests go through the LLM.'); }
  };
  window.EventSource = class {
    constructor() { throw new Error('EventSource is disabled in Hallucinet Explorer.'); }
  };
`;
// Inject early
if (document.head) {
  document.head.prepend(script);
} else {
  document.addEventListener('DOMContentLoaded', () => document.head.prepend(script));
}
