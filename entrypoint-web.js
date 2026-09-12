import http from 'node:http';

const API_PORT = process.env.API_PORT || '3001';
const WEB_PORT = '3002';
const PORT = process.env.PORT || 3000;

// Start the real SvelteKit server on an internal port
process.env.PORT = WEB_PORT;
await import('./web/build/index.js');

function proxy(req, res, targetPort) {
  const headers = { ...req.headers };
  delete headers.forwarded;
  delete headers['x-forwarded-host'];
  delete headers['x-forwarded-proto'];

  const proxyReq = http.request(
    {
      hostname: '127.0.0.1',
      port: targetPort,
      path: req.url,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      proxyRes.headers['x-robots-tag'] = 'noindex, nofollow, noarchive';
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    }
  );
  proxyReq.on('error', () => {
    res.writeHead(502);
    res.end('Service unavailable');
  });
  req.pipe(proxyReq, { end: true });
}

const server = http.createServer((req, res) => {
  if (req.url?.startsWith('/api/')) {
    proxy(req, res, API_PORT);
  } else {
    proxy(req, res, WEB_PORT);
  }
});

server.on('upgrade', (req, socket, head) => {
  const targetPort = req.url?.startsWith('/api/') ? API_PORT : WEB_PORT;
  const headers = { ...req.headers };
  delete headers.forwarded;
  delete headers['x-forwarded-host'];
  delete headers['x-forwarded-proto'];
  const proxyReq = http.request({
    hostname: '127.0.0.1',
    port: targetPort,
    path: req.url,
    method: req.method,
    headers,
  });
  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n` +
        Object.entries(proxyRes.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\r\n') +
        '\r\n\r\n'
    );
    if (proxyHead.length) socket.write(proxyHead);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
  });
  proxyReq.on('error', () => socket.end());
  proxyReq.end();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Proxy listening on http://0.0.0.0:${PORT}`);
});
