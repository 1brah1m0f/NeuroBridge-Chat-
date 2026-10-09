// Prints every line containing a backslash or a non-ASCII character in the given files.
const fs = require('fs');
const BS = String.fromCharCode(92);
for (const f of process.argv.slice(2)) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((l, i) => {
    const nonAscii = [...l].filter((ch) => ch.codePointAt(0) > 126);
    if (l.includes(BS) || nonAscii.length) {
      const marks = nonAscii.length ? '  [non-ascii: ' + nonAscii.map((c) => 'U+' + c.codePointAt(0).toString(16)).join(' ') + ']' : '';
      console.log(f + ':' + (i + 1) + ': ' + l.trim().slice(0, 170) + marks);
    }
  });
}
