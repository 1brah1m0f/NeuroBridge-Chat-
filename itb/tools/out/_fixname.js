const fs = require('fs');
for (const [file, indent] of [['js/client/main.js', '    '], ['server/server.js', '  ']]) {
  const src = fs.readFileSync(file, 'utf8').split('\n');
  const i = src.findIndex((l) => l.includes('s = s.replace(/[') && l.includes('u0000'));
  if (i < 0) { console.log('not found in', file); continue; }
  src[i] = indent + "s = stripInvisible(s).replace(/\s+/g, ' ').trim();";
  fs.writeFileSync(file, src.join('\n'));
  console.log('fixed', file, 'line', i + 1);
}
