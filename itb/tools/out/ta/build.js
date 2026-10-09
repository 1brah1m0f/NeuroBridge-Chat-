// Scratch assembler for tasks-a.js parts (p1.js, p2.js, ...).
const fs = require('fs'), path = require('path');
const dir = __dirname;
const files = fs.readdirSync(dir).filter((f) => /^p\d+\.js$/.test(f)).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
let out = files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
out = out.split('\n').filter((l) => l.indexOf('/*@@GAMES@@*/') < 0).join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
out += '\n})(globalThis.AS = globalThis.AS || {});\n';
fs.writeFileSync(path.join(dir, '..', '..', '..', 'js', 'client', 'tasks', 'tasks-a.js'), out);
console.log('built from', files.join(','), out.split('\n').length, 'lines');
