import Database from 'better-sqlite3';
import { Cookie } from '../shared/types';

export class CookieJar {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cookies (
        domain TEXT NOT NULL,
        path TEXT NOT NULL DEFAULT '/',
        name TEXT NOT NULL,
        value TEXT NOT NULL,
        expires INTEGER,
        http_only INTEGER NOT NULL DEFAULT 0,
        secure INTEGER NOT NULL DEFAULT 0,
        same_site TEXT NOT NULL DEFAULT 'lax',
        created_at INTEGER NOT NULL,
        PRIMARY KEY (domain, path, name)
      )
    `);
  }

  /**
   * Parse Set-Cookie header(s) and store them.
   * Multiple cookies are separated by newlines (from our parser).
   */
  setCookiesFromHeaders(setCookieHeader: string, requestDomain: string, requestPath: string): void {
    const lines = setCookieHeader.split('\n');
    for (const line of lines) {
      this.parseAndStore(line.trim(), requestDomain, requestPath);
    }
  }

  private parseAndStore(setCookie: string, requestDomain: string, requestPath: string): void {
    const parts = setCookie.split(';').map(p => p.trim());
    if (parts.length === 0) return;

    const [nameValue, ...attrs] = parts;
    const eqIndex = nameValue.indexOf('=');
    if (eqIndex === -1) return;

    const name = nameValue.substring(0, eqIndex).trim();
    const value = nameValue.substring(eqIndex + 1).trim();
    if (!name) return;

    const cookie: Cookie = {
      domain: requestDomain,
      path: requestPath,
      name,
      value,
      expires: null,
      httpOnly: false,
      secure: false,
      sameSite: 'lax',
      createdAt: Date.now(),
    };

    for (const attr of attrs) {
      const lower = attr.toLowerCase();
      if (lower === 'httponly') {
        cookie.httpOnly = true;
      } else if (lower === 'secure') {
        cookie.secure = true;
      } else if (lower.startsWith('domain=')) {
        let d = attr.substring(7).trim();
        if (d.startsWith('.')) d = d.substring(1);
        cookie.domain = d;
      } else if (lower.startsWith('path=')) {
        cookie.path = attr.substring(5).trim();
      } else if (lower.startsWith('max-age=')) {
        const seconds = parseInt(attr.substring(8).trim(), 10);
        if (!isNaN(seconds)) {
          cookie.expires = Date.now() + seconds * 1000;
        }
      } else if (lower.startsWith('expires=')) {
        const date = new Date(attr.substring(8).trim());
        if (!isNaN(date.getTime())) {
          cookie.expires = date.getTime();
        }
      } else if (lower.startsWith('samesite=')) {
        const ss = attr.substring(9).trim().toLowerCase();
        if (ss === 'strict' || ss === 'lax' || ss === 'none') {
          cookie.sameSite = ss;
        }
      }
    }

    this.db.prepare(`
      INSERT OR REPLACE INTO cookies (domain, path, name, value, expires, http_only, secure, same_site, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      cookie.domain, cookie.path, cookie.name, cookie.value,
      cookie.expires, cookie.httpOnly ? 1 : 0, cookie.secure ? 1 : 0,
      cookie.sameSite, cookie.createdAt
    );
  }

  /**
   * Get the Cookie header string for a given domain and path.
   */
  getCookieHeader(domain: string, urlPath: string): string {
    this.purgeExpired();

    // Match domain and parent domains
    const domains = this.getDomainMatches(domain);
    const rows = this.db.prepare(`
      SELECT name, value, path FROM cookies WHERE domain IN (${domains.map(() => '?').join(',')})
    `).all(...domains) as Array<{ name: string; value: string; path: string }>;

    const matching = rows.filter(r => urlPath.startsWith(r.path));
    if (matching.length === 0) return '';

    return matching.map(r => `${r.name}=${r.value}`).join('; ');
  }

  private getDomainMatches(domain: string): string[] {
    const parts = domain.split('.');
    const domains: string[] = [];
    for (let i = 0; i < parts.length - 1; i++) {
      domains.push(parts.slice(i).join('.'));
    }
    return domains;
  }

  private purgeExpired(): void {
    this.db.prepare('DELETE FROM cookies WHERE expires IS NOT NULL AND expires < ?').run(Date.now());
  }

  getAllCookies(): Cookie[] {
    this.purgeExpired();
    const rows = this.db.prepare('SELECT * FROM cookies ORDER BY domain, name').all() as any[];
    return rows.map(r => ({
      domain: r.domain,
      path: r.path,
      name: r.name,
      value: r.value,
      expires: r.expires,
      httpOnly: !!r.http_only,
      secure: !!r.secure,
      sameSite: r.same_site,
      createdAt: r.created_at,
    }));
  }

  clearAll(): void {
    this.db.prepare('DELETE FROM cookies').run();
  }
}
