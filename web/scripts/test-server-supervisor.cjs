const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createSupervisor } = require('./server-supervisor.cjs');
const delay = ms => new Promise(r => setTimeout(r, ms));
test('blocked analytical pages do not block home/search and dead children recover', async () => {
  const port = 41000 + Math.floor(Math.random() * 1000);
  const service = createSupervisor({ port, host:'127.0.0.1', args: path.join(__dirname, 'fixtures/supervisor-server.cjs'), healthInterval: 100, healthTimeout: 50, requestTimeout: 3000 });
  const get = path => fetch(`http://127.0.0.1:${port}${path}`);
  try {
    for(let i=0;i<50&&!service.slots.every(s=>s.ready);i++) await delay(50);
    assert.ok(service.slots.every(s=>s.ready));
    const original = service.slots.slice(1).map(s=>s.child.pid);
    const blocked = [get('/block').catch(()=>null), get('/block').catch(()=>null)];
    await delay(250);
    const began = Date.now();
    const home = await get('/'); assert.equal(home.status,200); assert.equal(await home.text(),'ok');
    assert.ok(Date.now()-began < 500, 'home must respond while both page instances are blocked');
    const search = await get('/api/search'); assert.equal(search.status,200);
    await Promise.all(blocked);
    for(let i=0;i<80&&!service.slots.slice(1).every((s,i)=>s.ready&&s.child.pid!==original[i]);i++) await delay(50);
    assert.ok(service.slots.slice(1).every((s,i)=>s.ready&&s.child.pid!==original[i]), 'hung children must recover');
    const post = await fetch(`http://127.0.0.1:${port}/submit`,{method:'POST',body:'preserve-request-body'});
    assert.equal(await post.text(),'preserve-request-body');
  } finally { await service.close(); }
});
