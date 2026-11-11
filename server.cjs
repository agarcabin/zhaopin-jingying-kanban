const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const port = Number(process.env.PORT || 4173);
http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/favicon.ico') {res.writeHead(204);res.end();return;}
  const routes = {'/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/embed-tests.html': ['embed-tests.html', 'text/html'], '/embeds/dashboard.html': ['embeds/dashboard.html', 'text/html'], '/assets/echarts.min.js': ['assets/echarts.min.js', 'application/javascript'], '/task-preview.css': ['task-preview.css', 'text/css'], '/task-preview.js': ['task-preview.js', 'application/javascript'], '/positions.css': ['positions.css', 'text/css'], '/positions.js': ['positions.js', 'application/javascript'], '/data/ai-development.json': ['data/ai-development.json', 'application/json']};
  const route = routes[pathname];
  if (!route) {res.writeHead(404);res.end('Not found');return;}
  fs.readFile(path.join(__dirname, route[0]), (error, data) => {
    if (error) {res.writeHead(500);res.end('Unable to read index.html');return;}
    res.writeHead(200, {'Content-Type': `${route[1]}; charset=utf-8`, 'Cache-Control': 'no-store'});
    res.end(data);
  });
}).listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}`));
