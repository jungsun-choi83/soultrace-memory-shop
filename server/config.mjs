import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadConfig(root, env = process.env) {
  const mode = env.SHOP_MODE || 'demo';
  if (!['demo', 'live'].includes(mode)) throw new Error('SHOP_MODE must be demo or live.');
  const host = env.HOST || '127.0.0.1';
  const port = Number(env.PORT || 5173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
  const origin = env.APP_ORIGIN || `http://${host}:${port}`;
  const url = new URL(origin);
  if (url.origin !== origin || url.username || url.password) throw new Error('APP_ORIGIN must be an exact origin without a trailing slash.');
  if (mode === 'demo' && (env.NODE_ENV === 'production' || !['127.0.0.1', 'localhost', '::1'].includes(host) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) {
    throw new Error('Demo mode is local-only; refusing public/production demo authentication.');
  }
  const local = resolve(root, '.local');
  mkdirSync(local, { recursive: true, mode: 0o700 });
  let secret = env.SHOP_AUTH_SECRET || '';
  if (mode === 'demo' && !secret) {
    const path = resolve(local, 'demo-secret');
    if (!existsSync(path)) writeFileSync(path, randomBytes(32).toString('base64'), { mode: 0o600, flag: 'wx' });
    secret = readFileSync(path, 'utf8').trim();
  }
  if (!/^[A-Za-z0-9+/]{43}=$/.test(secret) || Buffer.from(secret, 'base64').length !== 32) throw new Error('SHOP_AUTH_SECRET must be 32 random bytes, base64 encoded. Use npm run keygen.');
  if (mode === 'live') {
    if (url.protocol !== 'https:') throw new Error('Live mode requires HTTPS APP_ORIGIN.');
    for (const key of ['RESEND_API_KEY', 'EMAIL_FROM', 'SOULTRACE_BRIDGE_ORIGIN', 'SOULTRACE_BRIDGE_KEY']) {
      if (!env[key]?.trim()) throw new Error(`${key} is required in live mode; no mock fallback.`);
    }
    const bridge = new URL(env.SOULTRACE_BRIDGE_ORIGIN);
    if (bridge.protocol !== 'https:' || bridge.origin !== env.SOULTRACE_BRIDGE_ORIGIN || bridge.username || bridge.password) throw new Error('SOULTRACE_BRIDGE_ORIGIN must be an HTTPS origin.');
    if (env.SOULTRACE_BRIDGE_KEY.length < 32) throw new Error('Use a scoped bridge key of at least 32 characters.');
    if (env.LIVE_DATA_FLOW_REVIEWED !== 'yes') throw new Error('Review ownership, consent, vendors and retention, then explicitly set LIVE_DATA_FLOW_REVIEWED=yes. This is not a legal sign-off.');
  }
  const dbPath = env.AUTH_DB_PATH ? resolve(env.AUTH_DB_PATH) : resolve(local, `auth-${mode}.sqlite`);
  return { root, mode, host, port, origin, secure: url.protocol === 'https:', secret: Buffer.from(secret, 'base64'), dbPath,
    resendKey: env.RESEND_API_KEY, emailFrom: env.EMAIL_FROM, bridgeOrigin: env.SOULTRACE_BRIDGE_ORIGIN, bridgeKey: env.SOULTRACE_BRIDGE_KEY,
    otpTtlMs: 10 * 60_000, sessionTtlMs: 30 * 60_000, resendMs: 60_000, maxAttempts: 5 };
}
