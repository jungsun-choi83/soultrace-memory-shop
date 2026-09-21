import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { HttpError, constantEqual } from './security.mjs';

/** One persistent SQLite database per server deployment. No customer content is stored here.
 * Do NOT copy independent DBs across replicas. See docs/DEPLOYMENT.md before scaling.
 */
export class AuthStore {
  constructor(path) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') { try { chmodSync(path, 0o600); } catch { /* Windows ACLs must be configured by deployer. */ } }
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON;
      CREATE TABLE IF NOT EXISTS challenges (id TEXT PRIMARY KEY, browser TEXT NOT NULL, email_key TEXT NOT NULL, email_cipher TEXT NOT NULL, code_hash TEXT NOT NULL, expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS challenge_browser ON challenges(browser);
      CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, email_cipher TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);`);
  }
  transaction(fn) { this.db.exec('BEGIN IMMEDIATE'); try { const result = fn(); this.db.exec('COMMIT'); return result; } catch (e) { this.db.exec('ROLLBACK'); throw e; } }
  consumeLimits(rules, now) {
    this.transaction(() => {
      for (const r of rules) {
        const row = this.db.prepare('SELECT * FROM limits WHERE key=?').get(r.key);
        if (row && row.expires > now && row.count >= r.max) throw new HttpError(429, 'RATE_LIMIT', '잠시 후 다시 시도해주세요.', Math.max(1, Math.ceil((row.expires - now)/1000)));
      }
      for (const r of rules) this.db.prepare(`INSERT INTO limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<=? THEN 1 ELSE count+1 END, expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END`).run(r.key, now + r.window, now, now);
    });
  }
  insertChallenge(c) {
    this.transaction(() => {
      // Resending invalidates only this browser's prior challenge, not another user's session.
      this.db.prepare('DELETE FROM challenges WHERE browser=?').run(c.browser);
      this.db.prepare('INSERT INTO challenges(id,browser,email_key,email_cipher,code_hash,expires) VALUES(?,?,?,?,?,?)').run(c.id,c.browser,c.emailKey,c.emailCipher,c.codeHash,c.expires);
    });
  }
  deleteChallenge(id) { this.db.prepare('DELETE FROM challenges WHERE id=?').run(id); }
  verifyAndCreateSession({ id, browser, codeHash, maxAttempts, now, sessionHash, sessionExpires, oldSessionHash }) {
    return this.transaction(() => {
      const row = this.db.prepare('SELECT * FROM challenges WHERE id=?').get(id);
      if (!row || row.browser !== browser || row.expires <= now || row.attempts >= maxAttempts) return null;
      if (!constantEqual(row.code_hash, codeHash)) {
        this.db.prepare('UPDATE challenges SET attempts=attempts+1 WHERE id=?').run(id);
        return null;
      }
      this.db.prepare('DELETE FROM challenges WHERE id=?').run(id); // consumed before session commit
      if (oldSessionHash) this.db.prepare('DELETE FROM sessions WHERE hash=?').run(oldSessionHash);
      this.db.prepare('INSERT INTO sessions(hash,email_cipher,expires) VALUES(?,?,?)').run(sessionHash,row.email_cipher,sessionExpires);
      return { emailCipher: row.email_cipher, expires: sessionExpires };
    });
  }
  getSession(hash, now) { return this.db.prepare('SELECT * FROM sessions WHERE hash=? AND expires>?').get(hash, now) || null; }
  revokeSession(hash) { this.db.prepare('DELETE FROM sessions WHERE hash=?').run(hash); }
  prune(now) {
    this.transaction(() => { for (const table of ['challenges','sessions','limits']) this.db.prepare(`DELETE FROM ${table} WHERE expires<=?`).run(now); });
  }
  close() { this.db.close(); }
}
