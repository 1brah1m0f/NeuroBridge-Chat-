const fs = require('fs');
const BS = String.fromCharCode(92);
const helper = [
  '  // Drop control / zero-width / bidi characters (no escapes in the source on purpose).',
  '  function stripInvisible(s) {',
  "    let out = '';",
  '    for (const ch of s) {',
  '      const c = ch.codePointAt(0);',
  '      if (c < 32 || (c >= 0x7f && c <= 0x9f) || (c >= 0x200b && c <= 0x200f) || (c >= 0x2028 && c <= 0x202e) || (c >= 0x2060 && c <= 0x206f) || c === 0xfeff) continue;',
  '      out += ch;',
  '    }',
  '    return out;',
  '  }',
];
for (const [file, indent, anchor] of [
  ['js/client/main.js', '    ', '  function cleanName(s) {'],
  ['server/server.js', '  ', 'function cleanName(s) {'],
]) {
  const src = fs.readFileSync(file, 'utf8').split('\n');
  const i = src.findIndex((l) => l.includes('s = stripInvisible(s).replace('));
  src[i] = indent + "s = stripInvisible(s).replace(/" + BS + "s+/g, ' ').trim();";
  const a = src.findIndex((l) => l === anchor);
  const pad = anchor.startsWith('  ') ? '' : null;
  const lines = pad === null ? helper.map((l) => l.replace(/^  /, '')) : helper;
  src.splice(a, 0, ...lines);
  fs.writeFileSync(file, src.join('\n'));
  console.log('patched', file);
}
