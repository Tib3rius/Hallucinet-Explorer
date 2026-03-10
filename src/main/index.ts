import { app, BrowserWindow, BrowserView, ipcMain, session, Session, protocol, Menu, MenuItemConstructorOptions } from 'electron';
import * as path from 'path';
import * as crypto from 'crypto';
import { SettingsManager } from './settings-manager';
import { LLMClient } from './llm-client';
import { RequestInterceptor } from './request-interceptor';
import { CookieJar } from './cookie-jar';
import { CacheManager } from './cache-manager';
import { HistoryManager } from './history-manager';
import { serveNativePage } from './native-pages';
import { IPC, TabState, DEFAULT_SYSTEM_PROMPT } from '../shared/types';

// ── Register llm:// as a privileged scheme BEFORE app ready ──

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'llm',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

// ── Globals ──

let mainWindow: BrowserWindow;
let settingsManager: SettingsManager;
let llmClient: LLMClient;
let cookieJar: CookieJar;
let cacheManager: CacheManager;
let historyManager: HistoryManager;
// requestInterceptor is created per-tab

interface Tab {
  id: string;
  view: BrowserView;
  url: string;
  title: string;
  isLoading: boolean;
  historyStack: string[];
  historyIndex: number;
  session: Session;
}

const tabs: Map<string, Tab> = new Map();
let activeTabId: string | null = null;

// ── App Initialization ──

app.whenReady().then(() => {
  // Initialize managers
  settingsManager = new SettingsManager();
  const db = settingsManager.getDatabase();
  const settings = settingsManager.getSettings();

  llmClient = new LLMClient(settings.provider);
  cookieJar = new CookieJar(db);
  cacheManager = new CacheManager(db);
  historyManager = new HistoryManager(db);

  // requestInterceptor is created per-tab (see createTab)

  setupIPC();
  createMainWindow();

  // Wait for the chrome UI to finish loading before creating the first tab
  mainWindow.webContents.on('did-finish-load', () => {
    createTab('llm://newtab');
  });

});

app.on('window-all-closed', () => {
  settingsManager.close();
  app.quit();
});

// ── Window Creation ──

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Hallucinet Explorer',
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'chrome.html'));

  buildAppMenu();

  mainWindow.on('closed', () => {
    tabs.forEach(tab => tab.view.webContents.close());
    tabs.clear();
  });

  mainWindow.on('resize', () => {
    updateViewBounds();
  });
}

// ── Tab Management ──

function createTab(url: string): string {
  const tabId = crypto.randomUUID();

  // Create an isolated session for this tab's content
  const tabSession = session.fromPartition(`tab-${tabId}`, { cache: false });

  // Register per-tab request interceptor so LLM activity is tracked per-tab
  registerInterceptors(tabSession, tabId);

  const view = new BrowserView({
    webPreferences: {
      preload: path.join(__dirname, 'tab-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      session: tabSession,
      sandbox: true,
    },
  });

  const tab: Tab = {
    id: tabId,
    view,
    url,
    title: 'New Tab',
    isLoading: false,
    historyStack: [url],
    historyIndex: 0,
    session: tabSession,
  };

  // Track in-page navigations (form submissions, link clicks, JS navigations)
  view.webContents.on('did-navigate', (_event, newUrl) => {
    tab.url = newUrl;
    // Update history stack
    if (tab.historyStack[tab.historyIndex] !== newUrl) {
      tab.historyStack = tab.historyStack.slice(0, tab.historyIndex + 1);
      tab.historyStack.push(newUrl);
      tab.historyIndex = tab.historyStack.length - 1;
    }
    mainWindow.webContents.send(IPC.URL_CHANGED, tabId, newUrl);
    broadcastTabState();
  });

  view.webContents.on('did-navigate-in-page', (_event, newUrl) => {
    tab.url = newUrl;
    mainWindow.webContents.send(IPC.URL_CHANGED, tabId, newUrl);
    broadcastTabState();
  });

  view.webContents.on('page-title-updated', (_event, title) => {
    tab.title = title;
    mainWindow.webContents.send(IPC.TITLE_CHANGED, tabId, title);
    broadcastTabState();
  });

  view.webContents.on('did-start-loading', () => {
    tab.isLoading = true;
    mainWindow.webContents.send(IPC.LOADING_STATE, tabId, true);
    if (tabId === activeTabId) {
      mainWindow.webContents.send('status-text', 'Loading ' + tab.url + '…');
    }
    broadcastTabState();
  });

  view.webContents.on('did-stop-loading', () => {
    tab.isLoading = false;
    mainWindow.webContents.send(IPC.LOADING_STATE, tabId, false);
    if (tabId === activeTabId) {
      mainWindow.webContents.send('status-text', '');
    }
    broadcastTabState();
  });

  view.webContents.on('did-finish-load', () => {
    // Always re-read the title after a page finishes loading,
    // since page-title-updated may not fire on protocol-handled navigations
    const title = view.webContents.getTitle();
    if (title && title !== tab.url && title !== tab.title) {
      tab.title = title;
      mainWindow.webContents.send(IPC.TITLE_CHANGED, tabId, title);
      broadcastTabState();
    }
  });

  // Status bar: show link URL on hover
  view.webContents.on('update-target-url', (_event, url) => {
    if (tabId === activeTabId) {
      mainWindow.webContents.send('status-text', url);
    }
  });

  // Right-click context menu on page content
  view.webContents.on('context-menu', (_event, params) => {
    const menuItems: MenuItemConstructorOptions[] = [];

    if (params.linkURL) {
      menuItems.push({
        label: 'Open Link in New Tab',
        click: () => createTab(params.linkURL),
      });
      menuItems.push({
        label: 'Copy Link URL',
        click: () => {
          const { clipboard } = require('electron');
          clipboard.writeText(params.linkURL);
        },
      });
      menuItems.push({ type: 'separator' });
    }

    if (params.selectionText) {
      menuItems.push({
        label: 'Copy',
        role: 'copy',
      });
      menuItems.push({ type: 'separator' });
    }

    menuItems.push({
      label: 'Reload',
      click: () => view.webContents.reload(),
    });

    if (menuItems.length > 0) {
      const menu = Menu.buildFromTemplate(menuItems);
      menu.popup();
    }
  });

  tabs.set(tabId, tab);
  mainWindow.addBrowserView(view);
  switchToTab(tabId);
  navigateTab(tabId, url);

  return tabId;
}

function registerInterceptors(tabSession: Session, tabId: string): void {
  // Handle llm:// protocol for native pages
  tabSession.protocol.handle('llm', (request) => {
    const html = serveNativePage(request.url);
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  });

  // Create per-tab interceptor with tab-specific callbacks
  const interceptor = new RequestInterceptor({
    llmClient,
    cookieJar,
    cacheManager,
    historyManager,
    getSettings: () => settingsManager.getSettings(),
    onRequestStart: (url: string) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('llm-request-start', tabId, url);
      }
    },
    onRequestEnd: (url: string) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('llm-request-end', tabId, url);
      }
    },
  });

  // Intercept http:// and https:// — route to LLM
  interceptor.registerOnSession(tabSession);
}

function switchToTab(tabId: string): void {
  const tab = tabs.get(tabId);
  if (!tab) return;

  // Hide all views
  tabs.forEach(t => {
    t.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  });

  activeTabId = tabId;
  updateViewBounds();
  broadcastTabState();
}

function updateViewBounds(): void {
  if (!activeTabId || !mainWindow) return;
  const tab = tabs.get(activeTabId);
  if (!tab) return;

  const [width, height] = mainWindow.getContentSize();
  const chromeHeight = 80; // Height of tab bar + nav bar
  const statusBarHeight = 22;
  tab.view.setBounds({
    x: 0,
    y: chromeHeight,
    width,
    height: height - chromeHeight - statusBarHeight,
  });
}

function closeTab(tabId: string): void {
  const tab = tabs.get(tabId);
  if (!tab) return;

  mainWindow.removeBrowserView(tab.view);
  tab.view.webContents.close();
  tabs.delete(tabId);

  if (tabs.size === 0) {
    app.quit();
    return;
  }

  if (activeTabId === tabId) {
    const first = tabs.keys().next().value;
    if (first) switchToTab(first);
  }

  broadcastTabState();
}

function navigateTab(tabId: string, url: string): void {
  const tab = tabs.get(tabId);
  if (!tab) return;

  // Set URL eagerly so the address bar updates immediately
  tab.url = url;
  mainWindow.webContents.send(IPC.URL_CHANGED, tabId, url);

  // loadURL triggers did-navigate / did-start-loading / did-stop-loading
  // which handle history stack, loading state, and title updates
  tab.view.webContents.loadURL(url).catch(() => {
    // Errors are handled by the request interceptor (542 page)
  });
}

function broadcastTabState(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const tabStates: TabState[] = [];
  tabs.forEach(tab => {
    tabStates.push({
      id: tab.id,
      url: tab.url,
      title: tab.title,
      isLoading: tab.isLoading,
      canGoBack: tab.historyIndex > 0,
      canGoForward: tab.historyIndex < tab.historyStack.length - 1,
    });
  });

  mainWindow.webContents.send(IPC.TAB_UPDATED, tabStates, activeTabId);
}

// ── Application Menu ──

function buildAppMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => createTab('llm://newtab') },
        { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: () => { if (activeTabId) closeTab(activeTabId); } },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
      ],
    },
    {
      label: 'Navigation',
      submenu: [
        { label: 'Back', accelerator: 'Alt+Left', click: () => mainWindow.webContents.send('trigger-back') },
        { label: 'Forward', accelerator: 'Alt+Right', click: () => mainWindow.webContents.send('trigger-forward') },
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => { if (activeTabId) { const tab = tabs.get(activeTabId); if (tab) tab.view.webContents.reload(); } } },
        { label: 'Reprompt', accelerator: 'CmdOrCtrl+Shift+R', click: () => { if (activeTabId) { const tab = tabs.get(activeTabId); if (tab) { cacheManager.clearUrl(tab.url); navigateTab(activeTabId, tab.url); } } } },
        { type: 'separator' },
        { label: 'Focus Address Bar', accelerator: 'CmdOrCtrl+L', click: () => mainWindow.webContents.send('focus-url-bar') },
      ],
    },
    {
      label: 'Tools',
      submenu: [
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: () => createTab('llm://settings') },
        { label: 'History', accelerator: 'CmdOrCtrl+H', click: () => createTab('llm://history') },
        { type: 'separator' },
        { label: 'Developer Tools (Chrome)', accelerator: 'F12', click: () => mainWindow.webContents.openDevTools() },
        { label: 'Developer Tools (Tab)', accelerator: 'CmdOrCtrl+Shift+I', click: () => { if (activeTabId) { const tab = tabs.get(activeTabId); if (tab) tab.view.webContents.openDevTools(); } } },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ── IPC Handlers ──

function setupIPC(): void {
  // Navigation
  ipcMain.on(IPC.NAVIGATE, (_event, url: string) => {
    if (activeTabId) navigateTab(activeTabId, url);
  });

  ipcMain.on(IPC.GO_BACK, () => {
    if (!activeTabId) return;
    const tab = tabs.get(activeTabId);
    if (!tab || tab.historyIndex <= 0) return;
    tab.historyIndex--;
    const url = tab.historyStack[tab.historyIndex];
    tab.url = url;
    tab.view.webContents.loadURL(url);
    broadcastTabState();
    mainWindow.webContents.send(IPC.URL_CHANGED, activeTabId, url);
  });

  ipcMain.on(IPC.GO_FORWARD, () => {
    if (!activeTabId) return;
    const tab = tabs.get(activeTabId);
    if (!tab || tab.historyIndex >= tab.historyStack.length - 1) return;
    tab.historyIndex++;
    const url = tab.historyStack[tab.historyIndex];
    tab.url = url;
    tab.view.webContents.loadURL(url);
    broadcastTabState();
    mainWindow.webContents.send(IPC.URL_CHANGED, activeTabId, url);
  });

  ipcMain.on(IPC.REFRESH, () => {
    if (!activeTabId) return;
    const tab = tabs.get(activeTabId);
    if (tab) tab.view.webContents.reload();
  });

  ipcMain.on(IPC.REPROMPT, () => {
    if (!activeTabId) return;
    const tab = tabs.get(activeTabId);
    if (!tab) return;
    // Clear cache for this URL and reload
    cacheManager.clearUrl(tab.url);
    navigateTab(activeTabId, tab.url);
  });

  ipcMain.on(IPC.STOP, () => {
    if (!activeTabId) return;
    const tab = tabs.get(activeTabId);
    if (tab) tab.view.webContents.stop();
  });

  // Tab management
  ipcMain.on(IPC.NEW_TAB, () => {
    createTab('llm://newtab');
  });

  ipcMain.on(IPC.CLOSE_TAB, (_event, tabId: string) => {
    closeTab(tabId);
  });

  ipcMain.on(IPC.SWITCH_TAB, (_event, tabId: string) => {
    switchToTab(tabId);
  });

  ipcMain.on('duplicate-tab', (_event, tabId: string) => {
    const tab = tabs.get(tabId);
    if (tab) createTab(tab.url);
  });

  // Tab context menu (shown via native menu so it renders above BrowserView)
  ipcMain.on('tab-context-menu', (_event, tabId: string) => {
    const menu = Menu.buildFromTemplate([
      { label: 'New Tab', click: () => createTab('llm://newtab') },
      { label: 'Duplicate Tab', click: () => { const tab = tabs.get(tabId); if (tab) createTab(tab.url); } },
      { label: 'Close Tab', click: () => closeTab(tabId) },
    ]);
    menu.popup();
  });

  // Let the renderer request current state (e.g. after it finishes loading)
  ipcMain.on('request-tab-state', () => {
    broadcastTabState();
  });

  // Settings
  ipcMain.handle(IPC.GET_SETTINGS, () => {
    const settings = settingsManager.getSettings();
    return { ...settings, defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT };
  });

  ipcMain.handle(IPC.SAVE_SETTINGS, (_event, settings) => {
    settingsManager.saveSettings(settings);
    llmClient.updateConfig(settings.provider);
    return { ok: true };
  });

  ipcMain.handle(IPC.TEST_CONNECTION, async () => {
    return await llmClient.testConnection();
  });

  // History
  ipcMain.handle(IPC.GET_HISTORY, (_event, query: string, limit: number, offset: number) => {
    if (query) return historyManager.search(query, limit, offset);
    return historyManager.getAll(limit, offset);
  });

  ipcMain.handle(IPC.CLEAR_HISTORY, (_event, since?: number) => {
    historyManager.clear(since);
    return { ok: true };
  });

  // Cache
  ipcMain.handle(IPC.CLEAR_CACHE, (_event, since?: number) => {
    cacheManager.clear(since);
    return { ok: true };
  });

  ipcMain.handle(IPC.GET_CACHE_SIZE, () => {
    return cacheManager.getSize();
  });

  // Cookies
  ipcMain.handle(IPC.GET_COOKIES, () => {
    return cookieJar.getAllCookies();
  });

  ipcMain.handle(IPC.CLEAR_COOKIES, () => {
    cookieJar.clearAll();
    return { ok: true };
  });
}
