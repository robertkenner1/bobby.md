#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'pics');
const exts = /\.(jpe?g|png|webp|gif)$/i;

const files = fs.readdirSync(dir)
  .filter(f => exts.test(f))
  .map(f => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime)
  .map(f => f.name);

fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(files, null, 2));
console.log('pics manifest: ' + files.length + ' entries (newest first)');
