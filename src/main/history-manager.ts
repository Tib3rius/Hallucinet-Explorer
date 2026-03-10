import Database from 'better-sqlite3';
import { HistoryEntry } from '../shared/types';

export class HistoryManager {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        visited_at INTEGER NOT NULL,
        favicon_url TEXT
      )
    `);
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_history_visited ON history(visited_at DESC)');
  }

  add(url: string, title: string, faviconUrl?: string): void {
    this.db.prepare(
      'INSERT INTO history (url, title, visited_at, favicon_url) VALUES (?, ?, ?, ?)'
    ).run(url, title, Date.now(), faviconUrl || null);
  }

  search(query: string, limit: number = 50, offset: number = 0): HistoryEntry[] {
    const rows = this.db.prepare(`
      SELECT * FROM history
      WHERE url LIKE ? OR title LIKE ?
      ORDER BY visited_at DESC
      LIMIT ? OFFSET ?
    `).all(`%${query}%`, `%${query}%`, limit, offset) as any[];

    return rows.map(r => ({
      id: r.id,
      url: r.url,
      title: r.title,
      visitedAt: r.visited_at,
      faviconUrl: r.favicon_url,
    }));
  }

  getAll(limit: number = 100, offset: number = 0): HistoryEntry[] {
    const rows = this.db.prepare(
      'SELECT * FROM history ORDER BY visited_at DESC LIMIT ? OFFSET ?'
    ).all(limit, offset) as any[];

    return rows.map(r => ({
      id: r.id,
      url: r.url,
      title: r.title,
      visitedAt: r.visited_at,
      faviconUrl: r.favicon_url,
    }));
  }

  clear(since?: number): void {
    if (since) {
      this.db.prepare('DELETE FROM history WHERE visited_at >= ?').run(since);
    } else {
      this.db.prepare('DELETE FROM history').run();
    }
  }
}
