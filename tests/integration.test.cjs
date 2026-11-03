'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createServer, cleanup, MAX_FILE } = require('../server.cjs');
let server, base, demo;
before(async () => {
  server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise(resolve => server.close(resolve)); await cleanup(); });

test('verified engine and loopback-only server', async () => {
  assert.equal(server.address().address, '127.0.0.1');
  const response = await fetch(base + '/api/status');
  const status = await response.json();
  assert.equal(response.status, 200); assert.equal(status.engineReady, true);
  assert.equal(status.engineVersion, '11.1.0.9782'); assert.equal(status.analysis, 'static');
});
test('demo exposes types, signatures, strings and metadata without target execution', async () => {
  const response = await fetch(base + '/api/demo'); demo = await response.json();
  assert.equal(response.status, 200, JSON.stringify(demo));
  const calc = demo.types.find(t => t.fullName === 'LupaDemo.Calculator');
  assert.ok(calc); assert.equal(calc.methods.length, 3);
  assert.equal(calc.methods[0].signature, 'Int32 Add(Int32, Int32)');
  assert.equal(demo.sha256.length, 64); assert.equal(demo.architecture, 'AnyCPU');
  assert.ok(demo.strings.some(s => s.value === 'The value is negative'));
  assert.equal(demo.strings.length, 4, 'Padding bytes must not appear as empty strings.');
});
test('C# recovers addition and IL preserves add and ret instructions', async () => {
  for (const language of ['cs', 'il']) {
    const response = await fetch(`${base}/api/assemblies/${demo.id}/code?token=0x06000001&language=${language}`);
    const body = await response.json(); assert.equal(response.status, 200, JSON.stringify(body));
    if (language === 'cs') assert.match(body.code, /first \+ second/);
    else { assert.match(body.code, /\badd\b/); assert.match(body.code, /\bret\b/); }
  }
});
test('type selection produces C# and IL', async () => {
  for (const language of ['cs', 'il']) {
    const response = await fetch(`${base}/api/assemblies/${demo.id}/code?token=0x02000002&language=${language}`);
    const body = await response.json(); assert.equal(response.status, 200, JSON.stringify(body));
    assert.match(body.code, /Calculator/); assert.match(body.code, /Add/);
  }
});
test('import preserves identity and rejects an invalid PE file', async () => {
  const bytes = fs.readFileSync(path.join(__dirname, '../demo/Demo.dll'));
  const good = await fetch(base + '/api/assemblies', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent('copy.dll') }, body: bytes });
  assert.equal(good.status, 201); assert.equal((await good.json()).sha256, demo.sha256);
  const malformed = Buffer.alloc(128); malformed.write('MZ');
  const bad = await fetch(base + '/api/assemblies', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: malformed });
  assert.equal(bad.status, 422); assert.ok((await bad.json()).error);
});
test('invalid origin, host, format, tokens and private files are blocked', async () => {
  const origin = await fetch(base + '/api/status', { headers: { Origin: 'https://external.invalid' } });
  assert.equal(origin.status, 403);
  const hostStatus = await new Promise((resolve, reject) => {
    const req = http.get(base + '/api/status', { headers: { Host: 'external.invalid' } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); }); req.on('error', reject);
  });
  assert.equal(hostStatus, 403);
  const wrong = await fetch(base + '/api/assemblies', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'MZ' });
  assert.equal(wrong.status, 415);
  const invalid = await fetch(`${base}/api/assemblies/${demo.id}/code?token=../demo&language=cs`);
  assert.equal(invalid.status, 400);
  const missing = await fetch(`${base}/api/assemblies/${demo.id}/code?token=0x0600ffff&language=cs`);
  assert.equal(missing.status, 404);
  assert.equal((await fetch(base + '/backend/Analyzer.cs')).status, 404);
  assert.equal((await fetch(base + '/.runtime/anything.bin')).status, 404);
});
test('declared upload limit is enforced before accepting bytes', async () => {
  const status = await new Promise((resolve, reject) => {
    const req = http.request(base + '/api/assemblies', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': MAX_FILE + 1 } }, res => { res.resume(); res.on('end', () => { resolve(res.statusCode); req.destroy(); }); });
    req.on('error', reject); req.flushHeaders();
  });
  assert.equal(status, 413);
});
