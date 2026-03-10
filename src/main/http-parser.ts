import { ParsedHTTPResponse } from '../shared/types';

/**
 * Lenient HTTP response parser that handles common LLM output quirks.
 */
export function parseHTTPResponse(raw: string): ParsedHTTPResponse {
  let cleaned = stripMarkdownFences(raw);
  cleaned = stripLeadingCommentary(cleaned);
  // Normalize line endings: \r\n or bare \r → \n
  cleaned = cleaned.replace(/\r\n?/g, '\n');

  // If it looks like bare HTML or JSON (no HTTP status line), wrap it
  if (looksLikeHTML(cleaned)) {
    return {
      statusCode: 200,
      statusText: 'OK',
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: cleaned,
      rawResponse: raw,
    };
  }

  if (looksLikeJSON(cleaned)) {
    return {
      statusCode: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      body: cleaned,
      rawResponse: raw,
    };
  }

  // Split headers from body
  const splitIndex = findHeaderBodySplit(cleaned);
  if (splitIndex === -1) {
    // No clear header/body split — treat entire thing as HTML body
    return {
      statusCode: 200,
      statusText: 'OK',
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: cleaned,
      rawResponse: raw,
    };
  }

  const headerSection = cleaned.substring(0, splitIndex);
  const body = cleaned.substring(splitIndex).replace(/^(\r?\n){1,2}/, '').replace(/^(\r?\n){1,2}/, '');

  // Parse status line
  const lines = headerSection.split(/\r?\n/);
  const { statusCode, statusText } = parseStatusLine(lines[0]);

  // Parse headers
  const headers = parseHeaders(lines.slice(1));

  // Infer Content-Type if missing
  if (!headers['content-type']) {
    if (looksLikeHTML(body)) {
      headers['content-type'] = 'text/html; charset=utf-8';
    } else if (looksLikeJSON(body)) {
      headers['content-type'] = 'application/json';
    } else {
      headers['content-type'] = 'text/plain; charset=utf-8';
    }
  }

  // Correct Content-Length
  if (headers['content-length']) {
    headers['content-length'] = String(Buffer.byteLength(body, 'utf-8'));
  }

  return { statusCode, statusText, headers, body, rawResponse: raw };
}

function stripMarkdownFences(text: string): string {
  // Strip ```http ... ``` or ```html ... ``` or just ``` ... ```
  let s = text.trim();
  const fencePattern = /^```(?:http|html|json|text)?\s*\r?\n([\s\S]*?)\r?\n```\s*$/;
  const match = s.match(fencePattern);
  if (match) {
    return match[1];
  }
  // Also handle case where only opening fence exists (truncated)
  const openFence = /^```(?:http|html|json|text)?\s*\r?\n/;
  if (openFence.test(s)) {
    s = s.replace(openFence, '');
    // Strip trailing ``` if present
    s = s.replace(/\r?\n```\s*$/, '');
  }
  return s;
}

function stripLeadingCommentary(text: string): string {
  // Strip everything before the first line matching HTTP/ or a bare HTML doctype
  const httpLineIndex = text.search(/^HTTP\/\d/m);
  const doctypeIndex = text.search(/^<!DOCTYPE\s/im);
  const htmlTagIndex = text.search(/^<html/im);

  const candidates = [httpLineIndex, doctypeIndex, htmlTagIndex].filter(i => i >= 0);
  if (candidates.length === 0) return text;

  const earliest = Math.min(...candidates);
  return earliest > 0 ? text.substring(earliest) : text;
}

function findHeaderBodySplit(text: string): number {
  // After normalization, all line endings are \n
  const index = text.indexOf('\n\n');
  if (index !== -1) return index;

  // No double-newline found — if it starts with HTTP/ status line,
  // treat the entire text as headers with an empty body
  if (/^HTTP\/[\d.]+\s+\d{3}/i.test(text.trim())) {
    return text.length;
  }
  return -1;
}

function parseStatusLine(line: string): { statusCode: number; statusText: string } {
  const match = line.match(/^HTTP\/[\d.]+\s+(\d{3})\s*(.*)/);
  if (match) {
    return {
      statusCode: parseInt(match[1], 10),
      statusText: match[2] || 'OK',
    };
  }
  return { statusCode: 200, statusText: 'OK' };
}

function parseHeaders(lines: string[]): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of lines) {
    if (line.trim() === '') continue; // Skip extra blank lines gracefully
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    const key = line.substring(0, colonIndex).trim().toLowerCase();
    const value = line.substring(colonIndex + 1).trim();
    // Support multiple Set-Cookie headers by appending
    if (key === 'set-cookie' && headers[key]) {
      headers[key] += '\n' + value;
    } else {
      headers[key] = value;
    }
  }
  return headers;
}

function looksLikeHTML(text: string): boolean {
  const trimmed = text.trimStart().substring(0, 200).toLowerCase();
  return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html') || trimmed.startsWith('<head') || trimmed.startsWith('<body');
}

function looksLikeJSON(text: string): boolean {
  const trimmed = text.trimStart();
  return (trimmed.startsWith('{') || trimmed.startsWith('['));
}

/**
 * Attempt to close unclosed HTML tags for truncated responses.
 */
export function closeTruncatedHTML(html: string): string {
  const openTags: string[] = [];
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*\/?>/g;
  const selfClosing = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr']);

  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    const fullMatch = match[0];
    const tagName = match[1].toLowerCase();

    if (selfClosing.has(tagName) || fullMatch.endsWith('/>')) continue;

    if (fullMatch.startsWith('</')) {
      // Closing tag — pop if it matches
      if (openTags.length > 0 && openTags[openTags.length - 1] === tagName) {
        openTags.pop();
      }
    } else {
      openTags.push(tagName);
    }
  }

  // Close remaining open tags in reverse order
  let result = html;
  for (let i = openTags.length - 1; i >= 0; i--) {
    result += `</${openTags[i]}>`;
  }
  return result;
}
