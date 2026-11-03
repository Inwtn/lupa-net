'use strict';
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const ROOT = __dirname;
const ENGINE_VERSION = '11.1.0.9782';
const ENGINE = path.join(ROOT, 'vendor', `ilspy-${ENGINE_VERSION}`, 'lib', 'netstandard2.0', 'ICSharpCode.Decompiler.dll');
const ENGINE_HASH = '38e6abf7497845d79d9d01d56351a3203991356de1d3496b8c51142f495e9f9c';
const MAX_FILE = 32 * 1024 * 1024;
const MAX_SESSIONS = 8;
const MAX_WORKERS = 2;
const publicDir = path.join(ROOT, 'public');
const runtime = path.join(ROOT, '.runtime');
const sessions = new Map();
let activeWorkers = 0;

function findPowerShell() {
  if (process.env.LUPA_PWSH) return process.env.LUPA_PWSH;
  const candidates = process.platform === 'win32' ? [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PowerShell', '7', 'pwsh.exe'),
    path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'native', 'powershell', 'pwsh.exe')
  ] : [];
  return candidates.find(f => fs.existsSync(f)) || 'pwsh';
}
function httpError(status, message) { return Object.assign(new Error(message), { status }); }
function engineReady() {
  try { return crypto.createHash('sha256').update(fs.readFileSync(ENGINE)).digest('hex') === ENGINE_HASH; }
  catch { return false; }
}
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
async function removeRuntimeFile(file) {
  const resolved = path.resolve(file);
  if (path.dirname(resolved) !== path.resolve(runtime)) throw new Error('Cleanup outside the temporary directory is blocked.');
  await fsp.unlink(resolved).catch(e => { if (e.code !== 'ENOENT') throw e; });
}
async function worker(input, mode = 'inspect', token = '', language = 'cs') {
  if (activeWorkers >= MAX_WORKERS) throw httpError(429, 'Two analyses are in progress. Wait before trying again.');
  if (!engineReady()) throw httpError(503, 'The ILSpy engine is missing or its hash does not match.');
  activeWorkers++;
  const output = path.join(runtime, `${crypto.randomUUID()}.json`);
  const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', path.join(ROOT, 'backend', 'analyze.ps1'), '-InputPath', input, '-OutputPath', output, '-Mode', mode, '-Token', token || 'none', '-Language', language];
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(findPowerShell(), args, { cwd: ROOT, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let log = '', settled = false;
      const finish = err => { if (settled) return; settled = true; clearTimeout(timer); err ? reject(err) : resolve(); };
      const timer = setTimeout(() => { child.kill(); finish(httpError(408, 'Analysis exceeded 35 seconds and was stopped.')); }, 35000);
      for (const stream of [child.stdout, child.stderr]) stream.on('data', d => { if (log.length < 16000) log += d.toString(); });
      child.once('error', e => finish(httpError(503, `PowerShell 7 is unavailable: ${e.message}`)));
      child.once('exit', code => finish(code === 0 ? null : httpError(422, `The analyzer did not complete. ${log.slice(-1600)}`)));
    });
    const stat = await fsp.stat(output);
    if (stat.size > 20 * 1024 * 1024) throw httpError(422, 'The result exceeds the 20 MiB limit.');
    const result = JSON.parse(await fsp.readFile(output, 'utf8'));
    if (result.error) throw httpError(422, result.error);
    return result;
  } finally {
    activeWorkers--;
    await removeRuntimeFile(output);
  }
}
async function importAssembly(bytes, name) {
  if (bytes.length < 64 || bytes[0] !== 0x4d || bytes[1] !== 0x5a) throw httpError(422, 'Select a PE/.NET binary (.dll, .exe or .bin).');
  if (bytes.length > MAX_FILE) throw httpError(413, 'The limit is 32 MiB per file.');
  const digest = sha256(bytes);
  const known = [...sessions.values()].find(s => s.data.sha256 === digest);
  if (known) return known.data;
  const id = crypto.randomUUID(); const file = path.join(runtime, `${id}.bin`);
  await fsp.writeFile(file, bytes, { flag: 'wx' });
  try {
    const info = await worker(file);
    if (sessions.size >= MAX_SESSIONS) {
      const [oldId, old] = sessions.entries().next().value;
      sessions.delete(oldId); await removeRuntimeFile(old.file);
    }
    const data = { id, name: name.slice(0, 200), sha256: digest, bytes: bytes.length, ...info };
    sessions.set(id, { file, data, cache: new Map(), cacheBytes: 0 });
    return data;
  } catch (e) { await removeRuntimeFile(file); throw e; }
}
async function readBody(req) {
  const length = Number(req.headers['content-length']);
  if (Number.isFinite(length) && length > MAX_FILE) throw httpError(413, 'The limit is 32 MiB per file.');
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_FILE) throw httpError(413, 'The limit is 32 MiB per file.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function send(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}
function createServer() {
  fs.mkdirSync(runtime, { recursive: true });
  return http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    try {
      const port = res.socket.localPort;
      const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
      if (!allowedHosts.includes(req.headers.host)) throw httpError(403, 'Host is not allowed.');
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) throw httpError(403, 'Origin is not allowed.');
      if (req.headers['sec-fetch-site'] === 'cross-site') throw httpError(403, 'Cross-site request blocked.');
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (req.method === 'GET' && url.pathname === '/api/status') return send(res, 200, { engineReady: engineReady(), engineVersion: ENGINE_VERSION, maxFileBytes: MAX_FILE, analysis: 'static', activeWorkers, maxWorkers: MAX_WORKERS });
      if (req.method === 'GET' && url.pathname === '/api/demo') return send(res, 200, await importAssembly(await fsp.readFile(path.join(ROOT, 'demo', 'Demo.dll')), 'Demo.dll'));
      if (req.method === 'POST' && url.pathname === '/api/assemblies') {
        if (!/^application\/octet-stream(?:;|$)/i.test(req.headers['content-type'] || '')) throw httpError(415, 'Send the file as application/octet-stream.');
        let name;
        try { name = decodeURIComponent(req.headers['x-file-name'] || 'assembly.bin'); } catch { throw httpError(400, 'Invalid file name.'); }
        return send(res, 201, await importAssembly(await readBody(req), name));
      }
      const match = url.pathname.match(/^\/api\/assemblies\/([0-9a-f-]{36})(\/code)?$/);
      if (req.method === 'GET' && match) {
        const session = sessions.get(match[1]);
        if (!session) throw httpError(404, 'Assembly not found. Open the file again.');
        if (!match[2]) return send(res, 200, session.data);
        const token = url.searchParams.get('token'); const language = url.searchParams.get('language') || 'cs';
        if (!/^0x(?:02|06)[0-9a-fA-F]{6}$/.test(token || '') || !['cs', 'il'].includes(language)) throw httpError(400, 'Invalid token or language.');
        const validToken = session.data.types.some(t => t.token.toLowerCase() === token.toLowerCase() || t.methods.some(m => m.token.toLowerCase() === token.toLowerCase()));
        if (!validToken) throw httpError(404, 'Token not found in this assembly.');
        const cacheKey = `${token.toLowerCase()}:${language}`;
        if (session.cache.has(cacheKey)) return send(res, 200, session.cache.get(cacheKey));
        const code = await worker(session.file, 'code', token, language);
        const codeBytes = Buffer.byteLength(JSON.stringify(code));
        while (session.cache.size && (session.cache.size >= 100 || session.cacheBytes + codeBytes > 16 * 1024 * 1024)) {
          const oldest = session.cache.keys().next().value;
          session.cacheBytes -= Buffer.byteLength(JSON.stringify(session.cache.get(oldest)));
          session.cache.delete(oldest);
        }
        session.cache.set(cacheKey, code); session.cacheBytes += codeBytes;
        return send(res, 200, code);
      }
      if (url.pathname.startsWith('/api/')) throw httpError(404, 'Route not found.');
      if (!['GET', 'HEAD'].includes(req.method)) throw httpError(405, 'Method not allowed.');
      const staticFiles = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'], '/styles.css': ['styles.css', 'text/css'] };
      const entry = staticFiles[url.pathname];
      if (!entry) throw httpError(404, 'File not found.');
      const bytes = await fsp.readFile(path.join(publicDir, entry[0]));
      res.writeHead(200, { 'Content-Type': entry[1] + '; charset=utf-8' });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch (e) {
      if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'Internal error while processing the file.' });
      else res.end();
    }
  });
}
async function cleanup() {
  for (const s of sessions.values()) await removeRuntimeFile(s.file);
  sessions.clear();
}
if (require.main === module) {
  const port = Number(process.env.LUPA_PORT || 4318);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('LUPA_PORT must be between 1024 and 65535.');
  const server = createServer();
  server.listen(port, '127.0.0.1', () => console.log(`Lupa.NET at http://127.0.0.1:${port} — local static analysis`));
  server.on('error', e => { console.error(e.message); process.exitCode = 1; });
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
    if (stopping) return; stopping = true;
    server.close(); await cleanup(); process.exit(0);
  });
}
module.exports = { createServer, cleanup, MAX_FILE, importAssembly };
