'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const ignored = new Set(['.git', '.runtime', 'node_modules', 'samples', 'evidence', 'exports']);
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (ignored.has(entry.name) || entry.name === 'MANIFEST_SHA256.json' || entry.name === '.DS_Store' || entry.name === 'Thumbs.db' || /^\.env(?:\.|$)/.test(entry.name) || entry.name.endsWith('.log')) return [];
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Symbolic links are not permitted in the distribution manifest.');
    if (entry.isDirectory()) return walk(file);
    const bytes = fs.readFileSync(file);
    return [{ path: path.relative(root, file).split(path.sep).join('/'), bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }];
  });
}
const files = walk(root).sort((a, b) => a.path.localeCompare(b.path, 'en'));
fs.writeFileSync(path.join(root, 'MANIFEST_SHA256.json'), JSON.stringify({ algorithm: 'SHA-256', files }, null, 2) + '\n');
console.log(`Recorded ${files.length} distribution files. Review the changes before publishing.`);
