'use strict';

// Zero-dependency static file server for this folder, made to sit behind a tunnel:
//
//   node serve.js
//   cloudflared tunnel --url http://localhost:8080
//
// Set PORT to serve on something else.

const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = Number(process.env.PORT) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8'
};

function fail(res, status, message) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(message + '\n');
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
    pathname = decodeURIComponent(url.pathname);
  } catch {
    fail(res, 400, 'Bad request');
    return;
  }

  if (pathname.endsWith('/')) pathname += 'index.html';

  const file = path.join(root, pathname);
  if (file !== root && !file.startsWith(root + path.sep)) {
    fail(res, 403, 'Forbidden');
    return;
  }

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      fail(res, 404, 'Not found');
      return;
    }

    res.writeHead(200, {
      'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'content-length': stat.size,
      'cache-control': 'no-cache'
    });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    const stream = fs.createReadStream(file);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });
});

server.on('error', (err) => {
  console.error('Server error: ' + err.message);
  process.exit(1);
});

server.listen(port, () => {
  console.log('Serving this folder at http://localhost:' + port);
  console.log('Expose it with: cloudflared tunnel --url http://localhost:' + port);
});
