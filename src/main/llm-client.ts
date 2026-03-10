import { LLMProviderConfig, LLMRequest, LLMResponse } from '../shared/types';

const DEBUG = process.env.HALLUCINET_EXPLORER_DEBUG === '1' || process.argv.includes('--debug');

function debugLog(label: string, data: any): void {
  if (!DEBUG) return;
  const separator = '─'.repeat(60);
  console.log(`\n${separator}`);
  console.log(`[DEBUG] ${label}`);
  console.log(separator);
  console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  console.log(separator);
}

export class LLMClient {
  private config: LLMProviderConfig;

  constructor(config: LLMProviderConfig) {
    this.config = config;
    if (DEBUG) console.log('[DEBUG] LLM debug mode enabled');
  }

  updateConfig(config: LLMProviderConfig): void {
    this.config = config;
  }

  async sendRequest(request: LLMRequest, timeoutMs: number, temperature: number = 1.0, externalSignal?: AbortSignal): Promise<LLMResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // If an external signal aborts (e.g. user pressed Stop), abort our controller too
    if (externalSignal) {
      if (externalSignal.aborted) {
        clearTimeout(timer);
        return { content: '', error: 'Request cancelled' };
      }
      externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      if (this.config.preset === 'anthropic') {
        return await this.sendAnthropic(request, controller.signal, temperature);
      }
      return await this.sendOpenAICompat(request, controller.signal, temperature);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        if (externalSignal?.aborted) {
          return { content: '', error: 'Request cancelled' };
        }
        return { content: '', error: `Request timed out after ${timeoutMs / 1000}s` };
      }
      return { content: '', error: err.message || String(err) };
    } finally {
      clearTimeout(timer);
    }
  }

  private async sendOpenAICompat(request: LLMRequest, signal: AbortSignal, temperature: number): Promise<LLMResponse> {
    const url = `${this.config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    // OpenAI models require max_completion_tokens; others use max_tokens
    const tokenParam = this.config.preset === 'openai'
      ? { max_completion_tokens: 16384 }
      : { max_tokens: 16384 };

    const body = JSON.stringify({
      model: this.config.model,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userMessage },
      ],
      ...tokenParam,
      temperature,
    });

    debugLog('OpenAI-compat REQUEST → ' + url, JSON.parse(body));

    const res = await fetch(url, { method: 'POST', headers, body, signal });

    if (!res.ok) {
      const text = await res.text();
      debugLog('OpenAI-compat ERROR RESPONSE', text);
      throw new Error(`LLM API error ${res.status}: ${text.substring(0, 500)}`);
    }

    const json = await res.json() as any;
    debugLog('OpenAI-compat RESPONSE', json);
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('LLM returned empty response');
    }
    return { content };
  }

  private async sendAnthropic(request: LLMRequest, signal: AbortSignal, temperature: number): Promise<LLMResponse> {
    const url = `${this.config.baseUrl.replace(/\/+$/, '')}/messages`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': this.config.apiKey,
      'anthropic-version': '2023-06-01',
    };

    const body = JSON.stringify({
      model: this.config.model,
      max_tokens: 16384,
      temperature,
      system: request.systemPrompt,
      messages: [
        { role: 'user', content: request.userMessage },
      ],
    });

    debugLog('Anthropic REQUEST → ' + url, JSON.parse(body));

    const res = await fetch(url, { method: 'POST', headers, body, signal });

    if (!res.ok) {
      const text = await res.text();
      debugLog('Anthropic ERROR RESPONSE', text);
      throw new Error(`Anthropic API error ${res.status}: ${text.substring(0, 500)}`);
    }

    const json = await res.json() as any;
    debugLog('Anthropic RESPONSE', json);
    const content = json.content?.[0]?.text;
    if (!content) {
      throw new Error('Anthropic returned empty response');
    }
    return { content };
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const result = await this.sendRequest(
        {
          systemPrompt: 'Respond with exactly: HTTP/1.1 200 OK\\n\\nHello',
          userMessage: 'GET / HTTP/1.1\\nHost: test',
        },
        10000
      );
      if (result.error) return { ok: false, error: result.error };
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }
}
