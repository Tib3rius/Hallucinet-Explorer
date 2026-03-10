import { Session, protocol } from 'electron';
import { LLMClient } from './llm-client';
import { parseHTTPResponse, closeTruncatedHTML } from './http-parser';
import { CookieJar } from './cookie-jar';
import { CacheManager } from './cache-manager';
import { HistoryManager } from './history-manager';
import { AppSettings, ParsedHTTPResponse } from '../shared/types';

export interface RequestInterceptorDeps {
  llmClient: LLMClient;
  cookieJar: CookieJar;
  cacheManager: CacheManager;
  historyManager: HistoryManager;
  getSettings: () => AppSettings;
  onRequestStart?: (url: string) => void;
  onRequestEnd?: (url: string) => void;
}

interface PendingRequest {
  resolve: (response: Response) => void;
  controller: AbortController;
}

export class RequestInterceptor {
  private deps: RequestInterceptorDeps;
  private pendingRequests = new Map<string, PendingRequest>();

  constructor(deps: RequestInterceptorDeps) {
    this.deps = deps;
  }

  /**
   * Register protocol handlers on a custom session to intercept all HTTP/HTTPS requests.
   */
  registerOnSession(session: Session): void {
    // Intercept http:// and https:// schemes
    session.protocol.handle('https', (request) => this.handleRequest(request));
    session.protocol.handle('http', (request) => this.handleRequest(request));
  }

  private async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;
    const hostname = url.hostname;
    const pathname = url.pathname + url.search;

    // Check cache first (only for GET requests from refresh, not reprompt)
    const cached = this.deps.cacheManager.get(method, request.url);
    if (cached && method === 'GET') {
      const contentType = JSON.parse(cached.headers)['content-type'] || 'text/html';
      return new Response(cached.body, {
        status: cached.statusCode,
        headers: { 'Content-Type': contentType },
      });
    }

    // Build the HTTP request string for the LLM
    const cookieHeader = this.deps.cookieJar.getCookieHeader(hostname, url.pathname);
    let requestBody = '';
    if (request.body) {
      try {
        requestBody = await new Response(request.body).text();
      } catch { /* no body */ }
    }

    const httpRequest = this.buildHTTPRequest(method, pathname, hostname, cookieHeader, requestBody, request.referrer);

    const settings = this.deps.getSettings();

    // Notify that an LLM request is starting
    this.deps.onRequestStart?.(request.url);

    // Send to LLM (pass request.signal so Stop button can abort the fetch)
    const llmResponse = await this.deps.llmClient.sendRequest(
      {
        systemPrompt: settings.systemPrompt,
        userMessage: httpRequest,
      },
      settings.requestTimeout * 1000,
      settings.temperature ?? 1.0,
      request.signal
    );

    // Notify that the LLM request finished
    this.deps.onRequestEnd?.(request.url);

    if (llmResponse.error) {
      return this.make542Response(llmResponse.error, llmResponse.content);
    }

    // Parse HTTP response from LLM
    let parsed: ParsedHTTPResponse;
    try {
      parsed = parseHTTPResponse(llmResponse.content);
    } catch (err: any) {
      return this.make542Response(`Parse error: ${err.message}`, llmResponse.content);
    }

    // Handle redirects
    if (parsed.statusCode >= 300 && parsed.statusCode < 400 && parsed.headers['location']) {
      // If X-Clear-Cache: reprompt is set, clear the cache for the redirect target
      if ((parsed.headers['x-clear-cache'] || '').toLowerCase() === 'reprompt') {
        let targetUrl: string;
        try {
          targetUrl = new URL(parsed.headers['location'], request.url).toString();
        } catch {
          targetUrl = parsed.headers['location'];
        }
        this.deps.cacheManager.clearUrl(targetUrl);
      }
      return this.handleRedirect(parsed.headers['location'], request.url, 0, settings);
    }

    // Process Set-Cookie headers
    if (parsed.headers['set-cookie']) {
      this.deps.cookieJar.setCookiesFromHeaders(parsed.headers['set-cookie'], hostname, url.pathname);
    }

    // Cache the response
    this.deps.cacheManager.set(method, request.url, requestBody, llmResponse.content, parsed.statusCode, parsed.headers, parsed.body);

    // Record in history (only for top-level navigations that look like pages)
    const contentType = parsed.headers['content-type'] || '';
    if (method === 'GET' && contentType.includes('html')) {
      const title = this.extractTitle(parsed.body) || hostname + pathname;
      this.deps.historyManager.add(request.url, title);
    }

    // Close truncated HTML tags if needed
    let body = parsed.body;
    if (contentType.includes('html')) {
      body = closeTruncatedHTML(body);
    }

    // Build response headers
    const responseHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed.headers)) {
      if (key !== 'set-cookie' && key !== 'content-length') {
        responseHeaders[key] = value;
      }
    }

    return new Response(body, {
      status: parsed.statusCode,
      statusText: parsed.statusText,
      headers: responseHeaders,
    });
  }

  private buildHTTPRequest(method: string, path: string, hostname: string, cookie: string, body: string, referrer: string): string {
    let req = `${method} ${path} HTTP/1.1\nHost: ${hostname}`;
    if (cookie) req += `\nCookie: ${cookie}`;
    if (referrer) req += `\nReferer: ${referrer}`;
    if (body) req += `\n\n${body}`;
    return req;
  }

  private async handleRedirect(location: string, currentUrl: string, hops: number, settings: AppSettings): Promise<Response> {
    if (hops >= settings.maxRedirectHops) {
      return this.make542Response(`Too many redirects (${hops})`, '');
    }

    // Resolve relative URLs
    let resolvedUrl: string;
    try {
      resolvedUrl = new URL(location, currentUrl).toString();
    } catch {
      return this.make542Response(`Invalid redirect location: ${location}`, '');
    }

    // Create a new request for the redirect target
    const redirectRequest = new Request(resolvedUrl, { method: 'GET', redirect: 'manual' });
    return this.handleRequest(redirectRequest);
  }

  private make542Response(error: string, rawResponse: string): Response {
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>542 The Robot Broke</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1a1a2e; color: #e0e0e0; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
    .container { max-width: 600px; padding: 40px; text-align: center; }
    h1 { color: #e94560; font-size: 48px; margin-bottom: 10px; }
    .code { font-size: 120px; font-weight: bold; color: #e94560; opacity: 0.3; }
    .error { background: #16213e; padding: 16px; border-radius: 8px; margin: 20px 0; text-align: left; font-family: monospace; font-size: 14px; color: #ff6b6b; }
    details { margin-top: 20px; text-align: left; }
    summary { cursor: pointer; color: #0f3460; font-weight: bold; }
    pre { background: #16213e; padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 12px; max-height: 300px; overflow-y: auto; }
    .retry-btn { background: #e94560; color: white; border: none; padding: 12px 24px; border-radius: 6px; font-size: 16px; cursor: pointer; margin-top: 20px; }
    .retry-btn:hover { background: #c73e54; }
  </style>
</head>
<body>
  <div class="container">
    <div class="code">542</div>
    <h1>The Robot Broke</h1>
    <div class="error">${escapeHtml(error)}</div>
    ${rawResponse ? `<details><summary>Raw LLM Response</summary><pre>${escapeHtml(rawResponse)}</pre></details>` : ''}
    <button class="retry-btn" onclick="location.reload()">Reprompt</button>
  </div>
</body>
</html>`;

    return new Response(html, {
      status: 542,
      statusText: 'The Robot Broke',
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  private extractTitle(html: string): string | null {
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return match ? match[1].trim() : null;
  }

  /**
   * Make a request bypassing cache (for Reprompt).
   */
  async repromptRequest(url: string): Promise<Response> {
    // Remove this URL from cache
    this.deps.cacheManager.clearUrl(url);
    const request = new Request(url, { method: 'GET' });
    return this.handleRequest(request);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
