import { mkdir, readFile, writeFile, rm, cp, readdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const dist = resolve(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(resolve(root, 'src'), resolve(dist, 'src'), { recursive: true });
await cp(resolve(root, 'assets'), resolve(dist, 'assets'), { recursive: true });
const html = await readFile(resolve(root, 'index.html'), 'utf8');
await writeFile(resolve(dist, 'index.html'), html);
const sourceNames = ['catalog.mjs', 'fixtures.mjs', 'core.mjs', 'i18n.mjs', 'archive-api.mjs', 'archive-flow.mjs', 'app.mjs'];
const modules = await Promise.all(sourceNames.map(async name => (await readFile(resolve(root, 'src', name), 'utf8')).replace(/^import .*;\s*$/gm, '').replace(/^export /gm, '')));
const css = await readFile(resolve(root, 'src/styles.css'), 'utf8');
const assets = {};
for (const file of await readdir(resolve(root, 'assets'))) {
  const ext = extname(file);
  if (!['.webp', '.svg', '.png'].includes(ext)) continue;
  const mime = ext === '.svg' ? 'image/svg+xml' : ext === '.png' ? 'image/png' : 'image/webp';
  assets[file] = `data:${mime};base64,${(await readFile(resolve(root, 'assets', file))).toString('base64')}`;
}
let single = html.replace('<link rel="stylesheet" href="./src/styles.css" />', `<style>${css}</style>`);
single = single.replace('./assets/favicon.svg', assets['favicon.svg']);
const bundle = `globalThis.SOULTRACE_OFFLINE_PREVIEW = true;\nglobalThis.SOULTRACE_EMBEDDED_ASSETS = ${JSON.stringify(assets)};\n${modules.join('\n\n')}`.replaceAll('</script', '<\\/script');
single = single.replace('<script type="module" src="./src/app.mjs"></script>', `<script type="module">\n${bundle}\n</script>`);
await writeFile(resolve(root, 'preview.html'), single);
console.log('Built dist/ for static hosting and preview.html for double-click/offline preview.');
