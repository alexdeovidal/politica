// Keep core navigation isolated from analytical pages. A blocked native query
// cannot block this proxy or its liveness checks. Children bind only to loopback.
const http = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');

function createSupervisor({ port = Number(process.env.PORT) || 3000, host = '0.0.0.0', command = process.execPath,
  args = require.resolve('next/dist/bin/next'), healthInterval = 2000, healthTimeout = 1200,
  requestTimeout = 35000, basePort = port + 1 } = {}) {
  let stopping = false;
  const slots = ['core', 'pages', 'pages'].map((lane, i) => ({ lane, port: basePort + i, child: null, ready: false, failures: 0, active: 0, routes: new Map(), checking: false }));
  const isCore = url => {
    const p = url.split('?')[0];
    return p === '/' || p.startsWith('/_next/') || ['/favicon.ico', '/api/search', '/api/home-summary', '/api/top-suppliers', '/api/health/live'].includes(p);
  };
  function launch(slot) {
    if (stopping) return;
    slot.ready = false; slot.failures = 0;
    const child = spawn(command, [args, 'start', '-p', String(slot.port), '-H', '127.0.0.1'], {
      env: { ...process.env, PORT: String(slot.port) }, stdio: ['ignore', 'inherit', 'inherit'],
    });
    slot.child = child;
    console.log(`[availability] starting ${slot.lane} pid=${child.pid} port=${slot.port}`);
    child.once('error', error => console.error('[availability] child error', error.message));
    child.once('exit', (code, signal) => {
      if (slot.child !== child) return;
      slot.child = null; slot.ready = false;
      console.error(`[availability] child exited port=${slot.port} code=${code} signal=${signal}`);
      if (!stopping) setTimeout(() => launch(slot), 500).unref();
    });
  }
  function probe(slot) {
    if (!slot.child || slot.checking || stopping) return;
    slot.checking = true;
    const child = slot.child;
    let finished = false;
    const done = ok => {
      if (finished) return; finished = true; slot.checking = false;
      if (slot.child !== child) return;
      if (ok) { slot.ready = true; slot.failures = 0; return; }
      slot.failures++;
      // Allow cold startup; once ready, stop routing after the first failed probe.
      const wasReady = slot.ready;
      slot.ready = false;
      if (wasReady) console.error(`[availability] unresponsive port=${slot.port} routes=${JSON.stringify([...slot.routes.keys()])}`);
      if (slot.failures >= 10) {
        // Other instances continue serving. A stuck SQL native call cannot
        // process SIGTERM, so this isolated child must be re-created.
        console.error(`[availability] replacing unresponsive child port=${slot.port}`);
        child.kill('SIGKILL');
      }
    };
    const req = http.get({ host: '127.0.0.1', port: slot.port, path: '/api/health/live', agent: false }, res => {
      res.resume(); done(res.statusCode === 200);
    });
    req.setTimeout(healthTimeout, () => { req.destroy(); done(false); });
    req.on('error', () => done(false));
  }
  const server = http.createServer((req, res) => {
    const core = isCore(req.url || '/');
    const pool = slots.filter(s => s.ready && (core || s.lane === 'pages'));
    pool.sort((a, b) => (core ? Number(a.lane !== 'core') - Number(b.lane !== 'core') : 0) || a.active - b.active);
    const slot = pool[0];
    if (!slot) {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '2', 'Cache-Control': 'no-store' });
      res.end('Consulta temporariamente indisponível. Tente novamente em instantes.'); return;
    }
    const route = (req.url || '/').split('?')[0];
    slot.active++; slot.routes.set(route, (slot.routes.get(route) || 0) + 1);
    let finished = false;
    const upstream = http.request({ host: '127.0.0.1', port: slot.port, path: req.url, method: req.method,
      headers: req.headers, agent: false }, reply => {
      res.writeHead(reply.statusCode || 502, reply.headers);
      reply.pipe(res);
      reply.on('error', () => res.destroy());
    });
    const timer = setTimeout(() => upstream.destroy(new Error('request deadline exceeded')), requestTimeout);
    const finish = () => {
      if (finished) return; finished = true; clearTimeout(timer); slot.active--;
      const count = (slot.routes.get(route) || 1) - 1;
      if (count) slot.routes.set(route, count); else slot.routes.delete(route);
      upstream.destroy();
    };
    upstream.on('error', error => {
      console.error(`[availability] request failed route=${route} port=${slot.port}: ${error.message}`);
      if (!res.headersSent) {
        res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '2' });
        res.end(JSON.stringify({ error: 'A consulta excedeu o tempo de resposta. Tente novamente.' }));
      } else res.destroy();
      finish();
    });
    res.once('finish', finish); res.once('close', finish);
    req.pipe(upstream);
  });
  for (const slot of slots) launch(slot);
  const interval = setInterval(() => slots.forEach(probe), healthInterval);
  server.listen(port, host);
  async function close() {
    stopping = true; clearInterval(interval);
    server.close(); server.closeAllConnections();
    for (const slot of slots) slot.child?.kill('SIGTERM');
    const kill = setTimeout(() => slots.forEach(s => s.child?.kill('SIGKILL')), 3000);
    kill.unref();
  }
  return { server, slots, close };
}
module.exports = { createSupervisor };
if (require.main === module) {
  const service = createSupervisor();
  process.once('SIGTERM', service.close); process.once('SIGINT', service.close);
}
