'use strict';
/* Tiny .env loader (zero dependencies). Existing environment variables win. */
const fs = require('fs');

function load(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return false; }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
  return true;
}

module.exports = { load };
