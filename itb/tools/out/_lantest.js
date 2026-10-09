// Extracts lanAddresses() from server/server.js and runs it (no server, no listening socket).
const fs = require('fs');
const os = require('os');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'server.js'), 'utf8');
const start = src.indexOf('function lanAddresses()');
const end = src.indexOf('function printBanner()');
const fn = new Function('os', src.slice(start, end) + '\nreturn lanAddresses;')(os);
console.log(fn());
