'use strict';
// Read bytes and compare hashes; never load analyzed targets.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'MANIFEST_SHA256.json'), 'utf8'));
const errors = [];
for (const record of manifest.files) {
  const file = path.resolve(root, record.path);
  if (!file.startsWith(root + path.sep)) throw new Error('Path outside the project.');
  try {
    const bytes = fs.readFileSync(file);
    if (bytes.length !== record.bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== record.sha256) errors.push(record.path);
  } catch { errors.push(record.path); }
}
console.log(JSON.stringify({ status: errors.length ? 'MISMATCH' : 'OK', files: manifest.files.length, errors }, null, 2));
if (errors.length) process.exitCode = 1;
