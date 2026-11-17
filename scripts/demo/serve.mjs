// Serves site/ under /a/demo/ with a strict content policy, like an artifact.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
const ROOT = process.argv[2], PORT = Number(process.argv[3] ?? 8901), PREFIX = '/a/demo/';
const T = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.ttf': 'font/ttf', '.bin': 'application/octet-stream', '.wasm': 'application/wasm', '.txt': 'text/plain' };
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' data: blob:; frame-src 'none'";
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (!u.pathname.startsWith(PREFIX)) { res.statusCode = 404; return res.end('not here'); }
  let rel = decodeURIComponent(u.pathname.slice(PREFIX.length)) || 'index.html';
  try {
    let body = await readFile(join(ROOT, rel));
    if (rel === 'index.html') body = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0}</style></head><body>${body}</body></html>`;
    res.setHeader('content-type', T[extname(rel)] ?? 'application/octet-stream');
    res.setHeader('content-security-policy', CSP);
    res.end(body);
  } catch { res.statusCode = 404; res.end('missing'); }
}).listen(PORT, () => console.log('demo on', PORT));
