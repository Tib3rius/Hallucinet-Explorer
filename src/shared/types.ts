// ── LLM Provider Types ──

export type ProviderPreset = 'anthropic' | 'openai' | 'google' | 'ollama' | 'custom';

export interface LLMProviderConfig {
  preset: ProviderPreset;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface LLMRequest {
  systemPrompt: string;
  userMessage: string;
}

export interface LLMResponse {
  content: string;
  error?: string;
}

// ── HTTP Types ──

export interface ParsedHTTPResponse {
  statusCode: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  rawResponse: string;
}

export interface InterceptedRequest {
  method: string;
  url: string;
  hostname: string;
  path: string;
  headers: Record<string, string>;
  body?: string;
  referrer?: string;
}

// ── Cookie Types ──

export interface Cookie {
  domain: string;
  path: string;
  name: string;
  value: string;
  expires: number | null; // Unix timestamp, null = session
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  createdAt: number;
}

// ── Cache Types ──

export interface CacheEntry {
  method: string;
  url: string;
  bodyHash: string;
  rawResponse: string;
  statusCode: number;
  headers: string; // JSON-encoded
  body: string;
  timestamp: number;
}

// ── History Types ──

export interface HistoryEntry {
  id?: number;
  url: string;
  title: string;
  visitedAt: number;
  faviconUrl?: string;
}

// ── Settings Types ──

export interface AppSettings {
  provider: LLMProviderConfig;
  systemPrompt: string;
  requestTimeout: number; // seconds
  maxRedirectHops: number;
  temperature: number; // 0.0–2.0
}

export const DEFAULT_SYSTEM_PROMPT = `You are an HTTP server. When given an HTTP request, you must respond with a complete, valid HTTP/1.1 response including status line, headers, and body.

Rules:
- Always respond with a raw HTTP response. Do not wrap in markdown, code blocks, or any other formatting. Your entire response IS the HTTP response.
- Respond realistically based on the URL path, method, headers, and body provided.
- Generate full, functional HTML pages with inline CSS and JavaScript when responding to page requests.
- For non-HTML resources (images, JSON, CSS files, JS files, etc.), respond with appropriate Content-Type headers and realistic content.
- For images, generate an SVG, even if a JPEG or PNG etc. is requested, with Content-Type set appropriately. For favicon.ico files, generate a valid ICO file with an appropriate Content-Type header.
- You may issue Set-Cookie headers. Cookies will be stored and sent back in future requests.
- You may issue 3xx redirects. The browser will follow them.
- If a redirect is caused by a session change (e.g. authentication, session termination, etc.), add the \`X-Clear-Cache: reprompt\` header to the response headers.
- Make your pages visually interesting and functional. You are both the server and the creative director.
- Pretend that the pages are legitimate. No references to "fake", "demo", "test" etc. unless they make contextual sense.
- Focus on the URL path and request body to determine what to serve. Ignore headers that are purely technical metadata (User-Agent, Accept-Encoding, Cache-Control) unless they are semantically meaningful to the page (e.g. Accept-Language, Cookie, Authorization).
- Remember: a real human is looking at whatever you generate. Make it good.`;

export const DEFAULT_SETTINGS: AppSettings = {
  provider: {
    preset: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    apiKey: '',
    model: 'claude-sonnet-4-20250514',
  },
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  requestTimeout: 60,
  maxRedirectHops: 10,
  temperature: 1.0,
};

// ── IPC Channel Names ──

export const IPC = {
  // Navigation
  NAVIGATE: 'navigate',
  GO_BACK: 'go-back',
  GO_FORWARD: 'go-forward',
  REFRESH: 'refresh',
  REPROMPT: 'reprompt',
  STOP: 'stop',

  // Tab management
  NEW_TAB: 'new-tab',
  CLOSE_TAB: 'close-tab',
  SWITCH_TAB: 'switch-tab',

  // State updates (main → renderer)
  TAB_UPDATED: 'tab-updated',
  LOADING_STATE: 'loading-state',
  URL_CHANGED: 'url-changed',
  TITLE_CHANGED: 'title-changed',
  NAVIGATION_STATE: 'navigation-state',

  // Settings
  GET_SETTINGS: 'get-settings',
  SAVE_SETTINGS: 'save-settings',
  TEST_CONNECTION: 'test-connection',

  // History
  GET_HISTORY: 'get-history',
  CLEAR_HISTORY: 'clear-history',

  // Cache
  CLEAR_CACHE: 'clear-cache',
  GET_CACHE_SIZE: 'get-cache-size',

  // Cookies
  GET_COOKIES: 'get-cookies',
  CLEAR_COOKIES: 'clear-cookies',
} as const;

// ── Tab State ──

export interface TabState {
  id: string;
  url: string;
  title: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}
