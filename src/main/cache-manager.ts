import Database from 'better-sqlite3';
import * as crypto from 'crypto';
import { CacheEntry } from '../shared/types';

export class CacheManager {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cache (
        method TEXT NOT NULL,
        url TEXT NOT NULL,
        body_hash TEXT NOT NULL,
        raw_response TEXT NOT NULL,
        status_code INTEGER NOT NULL,
        headers TEXT NOT NULL,
        body TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        PRIMARY KEY (method, url, body_hash)
      )
    `);
  }

  private hashBody(body?: string): string {
    if (!body) return 'empty';
    return crypto.createHash('sha256').update(body).digest('hex').substring(0, 16);
  }

  get(method: string, url: string, requestBody?: string): CacheEntry | null {
    const bodyHash = this.hashBody(requestBody);
    const row = this.db.prepare(
      'SELECT * FROM cache WHERE method = ? AND url = ? AND body_hash = ?'
    ).get(method, url, bodyHash) as any;

    if (!row) return null;
    return {
      method: row.method,
      url: row.url,
      bodyHash: row.body_hash,
      rawResponse: row.raw_response,
      statusCode: row.status_code,
      headers: row.headers,
      body: row.body,
      timestamp: row.timestamp,
    };
  }

  set(method: string, url: string, requestBody: string | undefined, rawResponse: string, statusCode: number, headers: Record<string, string>, body: string): void {
    const bodyHash = this.hashBody(requestBody);
    this.db.prepare(`
      INSERT OR REPLACE INTO cache (method, url, body_hash, raw_response, status_code, headers, body, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(method, url, bodyHash, rawResponse, statusCode, JSON.stringify(headers), body, Date.now());
  }

  clearUrl(url: string): void {
    this.db.prepare('DELETE FROM cache WHERE url = ?').run(url);
  }

  clear(since?: number): void {
    if (since) {
      this.db.prepare('DELETE FROM cache WHERE timestamp >= ?').run(since);
    } else {
      this.db.prepare('DELETE FROM cache').run();
    }
  }

  getSize(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM cache').get() as { count: number };
    return row.count;
  }
}
