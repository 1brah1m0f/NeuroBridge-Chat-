#!/usr/bin/env node
/* Live build status of the AI IMPOSTOR: SPACE SHIP agents.  Usage:  node tools/status.js   (Ctrl+C to quit) */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const GAME = path.resolve(__dirname, '..');
const C = { r: '\x1b[0m', b: '\x1b[1m', dim: '\x1b[2m', g: '\x1b[32m', y: '\x1b[33m', c: '\x1b[36m', m: '\x1b[35m', red: '\x1b[31m' };

function findWorkflowDir() {
  const base = path.join(os.homedir(), '.claude', 'projects');
  let best = null;
  for (const proj of safeList(base)) {
    if (!/game/i.test(proj)) continue;
    for (const sess of safeList(path.join(base, proj))) {
      const wfRoot = path.join(base, proj, sess, 'subagents', 'workflows');
      for (const wf of safeList(wfRoot)) {
        const p = path.join(wfRoot, wf);
        const j = path.join(p, 'journal.jsonl');
        if (!fs.existsSync(j)) continue;
        const t = fs.statSync(j).mtimeMs;
        if (!best || t > best.t) best = { p, t };
      }
    }
  }
  return best && best.p;
}
function safeList(d) { try { return fs.readdirSync(d); } catch (e) { return []; } }
function tail(file, bytes) {
  const st = fs.statSync(file);
  const len = Math.min(bytes, st.size);
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(len);
  fs.readSync(fd, buf, 0, len, st.size - len);
  fs.closeSync(fd);
  return buf.toString('utf8');
}
const ago = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? s + 's' : Math.floor(s / 60) + 'm' + String(s % 60).padStart(2, '0') + 's'; };
const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const rel = (p) => (p ? String(p).replace(/\\/g, '/').replace(/^.*?\/Desktop\/game\//i, '') : '');

function describe(file) {
  let lines;
  try { lines = tail(file, 400000).split('\n').filter(Boolean); } catch (e) { return { doing: '?', at: 0 }; }
  for (let i = lines.length - 1; i >= 0; i--) {
    let o; try { o = JSON.parse(lines[i]); } catch (e) { continue; }
    if (o.type === 'user' && o.message && Array.isArray(o.message.content) && o.message.content.some((c) => c.type === 'tool_result')) {
      return { doing: C.dim + 'düşünür / növbəti addımı yazır…' + C.r, at: Date.parse(o.timestamp) || 0 };
    }
    if (o.type !== 'assistant' || !o.message || !Array.isArray(o.message.content)) continue;
    for (let k = o.message.content.length - 1; k >= 0; k--) {
      const c = o.message.content[k];
      if (c.type === 'tool_use') {
        const inp = c.input || {};
        let d = c.name;
        if (inp.file_path) d += ' ' + rel(inp.file_path);
        else if (inp.description) d += ': ' + inp.description;
        else if (inp.command) d += ': ' + String(inp.command).split('\n')[0];
        return { doing: d, at: Date.parse(o.timestamp) || 0 };
      }
      if (c.type === 'text' && c.text.trim()) return { doing: '“' + c.text.trim().split('\n')[0] + '”', at: Date.parse(o.timestamp) || 0 };
    }
  }
  return { doing: C.dim + 'oxuyur…' + C.r, at: 0 };
}

function gameFiles() {
  const out = [];
  const walk = (d) => {
    for (const n of safeList(d)) {
      const p = path.join(d, n);
      let st; try { st = fs.statSync(p); } catch (e) { continue; }
      if (st.isDirectory()) { if (!/^(out|node_modules|\.git)$/.test(n)) walk(p); }
      else if (/\.(js|css|html|bat|json|md)$/.test(n)) out.push({ f: path.relative(GAME, p).replace(/\\/g, '/'), kb: st.size / 1024, t: st.mtimeMs });
    }
  };
  walk(GAME);
  return out.sort((a, b) => b.t - a.t);
}

function render() {
  const dir = findWorkflowDir();
  const now = Date.now();
  let s = '\x1b[2J\x1b[H';
  s += C.b + C.c + '★ AI IMPOSTOR: SPACE SHIP — agentlərin canlı vəziyyəti' + C.r + C.dim + '   ' + new Date().toLocaleTimeString() + '   (hər 2 san yenilənir, çıxmaq: Ctrl+C)' + C.r + '\n\n';
  if (!dir) { process.stdout.write(s + 'Workflow tapılmadı.\n'); return; }
  const journal = fs.readFileSync(path.join(dir, 'journal.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return {}; } });
  const finished = {};
  const started = {};
  for (const j of journal) {
    if (!j.agentId) continue;
    if (j.type === 'started') started[j.agentId] = j.label;
    else finished[j.agentId] = j.type;
  }
  const rows = [];
  for (const n of safeList(dir)) {
    if (!n.endsWith('.meta.json')) continue;
    const id = n.replace(/^agent-/, '').replace(/\.meta\.json$/, '');
    let label = id;
    try { label = JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8')).description || id; } catch (e) { /* ignore */ }
    const jl = path.join(dir, n.replace('.meta.json', '.jsonl'));
    const st = fs.existsSync(jl) ? fs.statSync(jl) : null;
    const d = st ? describe(jl) : { doing: '', at: 0 };
    rows.push({ label, id, last: st ? st.mtimeMs : 0, kb: st ? st.size / 1024 : 0, done: finished[id], doing: d.doing });
  }
  rows.sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || a.label.localeCompare(b.label));
  s += C.b + 'AGENT      VƏZİYYƏT       SON HƏRƏKƏT   NƏ EDİR' + C.r + '\n';
  let nDone = 0;
  for (const r of rows) {
    let state;
    if (r.done) { state = C.g + '✔ bitdi       ' + C.r; nDone++; }
    else if (now - r.last < 90000) state = C.y + '● işləyir     ' + C.r;
    else state = C.m + '✎ fayl yazır  ' + C.r;
    s += C.c + r.label.padEnd(10) + C.r + ' ' + state + ' ' + (ago(now - r.last) + ' əvvəl').padEnd(13) + ' ' + short(r.doing, 70) + '\n';
  }
  s += '\n' + C.b + 'Bitib: ' + nDone + '/' + rows.length + C.r + C.dim + '  (bots agenti core bitəndən sonra başlayır)' + C.r + '\n\n';
  const files = gameFiles();
  s += C.b + 'OYUN FAYLLARI (' + files.length + ', ən təzələri yuxarıda):' + C.r + '\n';
  for (const f of files.slice(0, 22)) s += '  ' + f.f.padEnd(34) + (f.kb.toFixed(1) + ' KB').padStart(9) + C.dim + '   ' + new Date(f.t).toLocaleTimeString() + C.r + '\n';
  process.stdout.write(s);
}

render();
setInterval(render, 2000);
