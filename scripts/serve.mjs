import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)), process.argv.includes('--dist') ? 'dist' : '.');
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || '127.0.0.1';
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'");
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end('Read-only preview server. No orders or payments are accepted.'); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, `http://${host}`).pathname); } catch { res.writeHead(400); res.end('Bad URL'); return; }
  if (pathname === '/') pathname = '/index.html';
  // Only public storefront assets are served. Never expose docs, dotfiles, tests or secrets.
  if (!(pathname === '/index.html' || pathname.startsWith('/src/') || pathname.startsWith('/assets/')) || !types[extname(pathname)] || pathname.includes('\0') || pathname.includes('\\')) { res.writeHead(404); res.end('Not found'); return; }
  const path = resolve(root, '.' + pathname);
  if (!path.startsWith(root + sep)) { res.writeHead(403); res.end('Forbidden'); return; }
  try {
    if (!(await stat(path)).isFile()) throw new Error('Not a file');
    const content = await readFile(path);
    res.writeHead(200, { 'Content-Type': types[extname(path)], 'Content-Length': content.length });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, host, () => console.log(`SoulTrace demo: http://${host}:${port}\nNo checkout API, uploads or payments. Ctrl+C to stop.`));
