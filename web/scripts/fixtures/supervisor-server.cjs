const http = require('node:http');
http.createServer((req, res) => {
  if (req.url === '/block') { const until = Date.now() + 8000; while(Date.now() < until) {} }
  let body = ''; req.on('data', part => body += part);
  req.on('end', () => { res.setHeader('x-fixture-pid', String(process.pid)); res.end(body || 'ok'); });
}).listen(Number(process.env.PORT), '127.0.0.1');
