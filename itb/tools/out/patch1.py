p = 'js/client/renderer.js'
s = open(p, encoding='utf-8').read()


def rep(old, new, cnt=1):
    global s
    assert s.count(old) == cnt, (old[:90], s.count(old))
    s = s.replace(old, new)


# 1. fog: butt caps, scaled falloff, doors in the face clip, darker lights fog
rep("""    const gr = f.createRadialGradient(mx, my, 0, mx, my, R);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.74, 'rgba(0,0,0,1)'); gr.addColorStop(0.9, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    f.fillStyle = gr; f.strokeStyle = gr;
    f.lineJoin = 'round'; f.lineCap = 'round'; f.lineWidth = RIM * 2 + 8;""",
"""    const edge = Math.min(0.3, 80 / Math.max(1, R));
    const gr = f.createRadialGradient(mx, my, 0, mx, my, R);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1 - edge, 'rgba(0,0,0,1)');
    gr.addColorStop(1 - edge * 0.45, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    f.fillStyle = gr; f.strokeStyle = gr;
    f.lineJoin = 'round'; f.lineCap = 'butt'; f.lineWidth = RIM * 2 + 8;""")
rep("""      f.rect(fc.x1 - RIM - 4, fc.y - FACE - RIM - 6, fc.x2 - fc.x1 + RIM * 2 + 8, FACE + RIM + 6);
      any = true;
    }""", """      f.rect(fc.x1 - RIM - 4, fc.y - FACE - RIM - 6, fc.x2 - fc.x1 + RIM * 2 + 8, FACE + RIM + 6);
      any = true;
    }
    for (const d of world.doors) {
      const r = d.rect;
      if (r[0] > mx + R + 40 || r[0] + r[2] < mx - R - 40 || r[1] > my + R + 10 || r[1] + r[3] < my - R - 10) continue;
      f.rect(r[0] - 10, r[1] - FACE - 14, r[2] + 20, r[3] + FACE + 14);
      any = true;
    }""")
rep("""    f.fillStyle = 'rgba(4,6,14,' + (0.88 + 0.07 * lightsDark).toFixed(3) + ')';""",
    """    f.fillStyle = 'rgba(4,6,14,' + (0.88 + 0.075 * lightsDark).toFixed(3) + ')';""")
rep("""      let a = lightsAmt * (st.dead ? 0.12 : st.impostor ? 0.16 : 0.3);""",
    """      let a = lightsAmt * (st.dead ? 0.1 : st.impostor ? 0.14 : 0.12);""")

# 2. lamp glow clipped inside the face
rep("""        const gl = g.createRadialGradient(x + w / 2, ly + 4, 2, x + w / 2, ly + 4, 46);
        gl.addColorStop(0, 'rgba(255,250,225,0.45)'); gl.addColorStop(1, 'rgba(255,250,225,0)');
        g.fillStyle = gl; g.fillRect(x + w / 2 - 46, yt + 4, 92, 50);""",
"""        const gl = g.createRadialGradient(x + w / 2, ly + 4, 2, x + w / 2, ly + 4, 44);
        gl.addColorStop(0, 'rgba(255,250,225,0.42)'); gl.addColorStop(0.6, 'rgba(255,250,225,0.12)'); gl.addColorStop(1, 'rgba(255,250,225,0)');
        g.fillStyle = gl; g.fillRect(x + w / 2 - 44, yt + 3, 88, FACE - 10);""")

# 3. name tags bigger
rep("""      const sz = clamp(18 * zoom, 13, 22);""", """      const sz = clamp(20 * zoom, 14, 24);""")

# 4. circle props: fallback sort key nearer the centre
rep("""    return p.r ? p.y + p.r : p.y + (p.h || 40) / 2;""", """    return p.r ? p.y + p.r * 0.4 : p.y + (p.h || 40) / 2;""")

# 5. door frames: styled posts with status LEDs
rep("""  function drawDoor(g, d, c, part) {
    const [x, y, w, h] = d.rect;
    const DH = FACE;
    if (d.orient === 'h') {
      // posts (recessed frame)
      box(g, x - 6, y, 12, h, DH + 4, '#5b6684', '#353e57', 'rgba(255,255,255,0.25)');
      box(g, x + w - 6, y, 12, h, DH + 4, '#5b6684', '#353e57', 'rgba(255,255,255,0.25)');
      if (c > 0.002) {
        const half = (w / 2 - 6) * c;
        doorPanelH(g, x + 6, y, half, h, DH, false);
        doorPanelH(g, x + w - 6 - half, y, half, h, DH, true);
      }
    } else {
      const half = (h / 2 - 6) * c;
      if (part === 1) {
        box(g, x, y - 6, w, 12, DH + 4, '#5b6684', '#353e57', 'rgba(255,255,255,0.25)');
        if (c > 0.002) doorPanelV(g, x, y + 6, w, half, DH, false);
      } else {
        if (c > 0.002) doorPanelV(g, x, y + h - 6 - half, w, half, DH, true);
        box(g, x, y + h - 6, w, 12, DH + 4, '#5b6684', '#353e57', 'rgba(255,255,255,0.25)');
      }
    }
  }""", """  function doorPost(g, bx, by, bw, bh, H, c) {
    const fy = by + bh - H;
    g.fillStyle = INK;
    g.fillRect(bx - 1.5, by - H - 1.5, bw + 3, bh + H + 3);
    g.fillStyle = '#69769a'; g.fillRect(bx, by - H, bw, bh);
    g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(bx, by - H, bw, 1.5);
    const gr = g.createLinearGradient(bx, 0, bx + bw, 0);
    gr.addColorStop(0, '#4c5878'); gr.addColorStop(0.5, '#3b4562'); gr.addColorStop(1, '#2a3149');
    g.fillStyle = gr; g.fillRect(bx, fy, bw, H);
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(bx, fy, bw, 1.5);
    hazard(g, bx, by + bh - 16, bw, 9, 4, '#f4c531', '#1c1d24');
    // status light: green when open -> red when closed
    const r = Math.round(60 + 195 * c), gC = Math.round(230 - 170 * c), b = Math.round(120 - 40 * c);
    const lx = bx + bw / 2, ly = fy + 12;
    g.fillStyle = INK; g.fillRect(lx - 3.5, ly - 3.5, 7, 7);
    g.fillStyle = 'rgb(' + r + ',' + gC + ',' + b + ')'; g.fillRect(lx - 2.5, ly - 2.5, 5, 5);
    g.save();
    g.globalCompositeOperation = 'lighter';
    const gl = g.createRadialGradient(lx, ly, 0, lx, ly, 12);
    gl.addColorStop(0, 'rgba(' + r + ',' + gC + ',' + b + ',0.55)'); gl.addColorStop(1, 'rgba(' + r + ',' + gC + ',' + b + ',0)');
    g.fillStyle = gl; g.fillRect(lx - 12, ly - 12, 24, 24);
    g.restore();
  }
  function drawDoor(g, d, c, part) {
    const [x, y, w, h] = d.rect;
    const DH = FACE;
    if (d.orient === 'h') {
      doorPost(g, x - 6, y, 12, h, DH + 4, c);
      doorPost(g, x + w - 6, y, 12, h, DH + 4, c);
      if (c > 0.002) {
        const half = (w / 2 - 6) * c;
        doorPanelH(g, x + 6, y, half, h, DH, false);
        doorPanelH(g, x + w - 6 - half, y, half, h, DH, true);
      }
    } else {
      const half = (h / 2 - 6) * c;
      if (part === 1) {
        doorPost(g, x, y - 6, w, 12, DH + 4, c);
        if (c > 0.002) doorPanelV(g, x, y + 6, w, half, DH, false);
      } else {
        if (c > 0.002) doorPanelV(g, x, y + h - 6 - half, w, half, DH, true);
        doorPost(g, x, y + h - 6, w, 12, DH + 4, c);
      }
    }
  }""")
rep("""  function box(g, bx, by, bw, bh, H, top, front, edge) {
    if (bw <= 0.5 || bh <= 0.5) return;
    g.fillStyle = INK;
    g.fillRect(bx - 1.5, by - H - 1.5, bw + 3, bh + H + 3);
    g.fillStyle = top; g.fillRect(bx, by - H, bw, bh);
    g.fillStyle = front; g.fillRect(bx, by + bh - H, bw, H);
    if (edge) { g.fillStyle = edge; g.fillRect(bx, by + bh - H, bw, 2); }
  }
""", "")

# 6. minimap: per-room union outline, mini crewmate dots, stronger sabotage red
rep("""    // rooms: lighter fills with inner borders
    for (const r of W.map.rooms || []) {
      if (r.lobby) continue;
      for (const rc of roomRects(r)) {
        const q = R(rc, -1.5);
        const gr = g.createLinearGradient(0, q[1], 0, q[1] + q[3]);
        gr.addColorStop(0, '#2a4f9c'); gr.addColorStop(1, '#1f3c7c');
        g.fillStyle = gr;
        g.beginPath(); rrPath(g, q[0], q[1], q[2], q[3], Math.max(1, rad - 1.5)); g.fill();
        g.strokeStyle = 'rgba(150,200,255,0.35)'; g.lineWidth = 1;
        g.stroke();
      }
    }""", """    // rooms: lighter fills with a thin border around each room's union
    for (const r of W.map.rooms || []) {
      if (r.lobby) continue;
      const rcs = roomRects(r);
      g.fillStyle = 'rgba(150,200,255,0.45)';
      g.beginPath(); for (const rc of rcs) { const q = R(rc, -0.5); rrPath(g, q[0], q[1], q[2], q[3], Math.max(1, rad - 0.5)); } g.fill();
      let y0 = Infinity, y1 = -Infinity;
      for (const rc of rcs) { y0 = Math.min(y0, rc[1]); y1 = Math.max(y1, rc[1] + rc[3]); }
      const gr = g.createLinearGradient(0, L.oy + y0 * L.s, 0, L.oy + y1 * L.s);
      gr.addColorStop(0, '#2b52a3'); gr.addColorStop(1, '#1e3a7a');
      g.fillStyle = gr;
      g.beginPath(); for (const rc of rcs) { const q = R(rc, -1.6); rrPath(g, q[0], q[1], q[2], q[3], Math.max(1, rad - 1.6)); } g.fill();
    }""")
rep("""      g.fillStyle = 'rgba(255,50,70,' + (0.22 + 0.28 * pulse).toFixed(3) + ')'; g.fill();
      g.strokeStyle = 'rgba(255,90,100,' + (0.6 + 0.4 * pulse).toFixed(3) + ')'; g.lineWidth = 2; g.stroke();""",
"""      g.fillStyle = 'rgba(235,30,55,' + (0.42 + 0.3 * pulse).toFixed(3) + ')'; g.fill();
      g.strokeStyle = 'rgba(255,110,120,' + (0.7 + 0.3 * pulse).toFixed(3) + ')'; g.lineWidth = 2; g.stroke();""")
rep("""          g.fillStyle = INK; g.beginPath(); g.ellipse(x, y, dr + 1.5, dr * 1.1 + 1.5, 0, 0, TAU); g.fill();
          g.fillStyle = '#f2f6ff'; g.beginPath(); g.ellipse(x, y, dr, dr * 1.1, 0, 0, TAU); g.fill();
          g.fillStyle = '#29355c'; g.beginPath(); g.ellipse(x + dr * 0.3, y - dr * 0.25, dr * 0.55, dr * 0.4, 0, 0, TAU); g.fill();""",
"""          miniNaut(g, x, y, dr);""")
rep("""  function markerColor(c, def) {""", """  // tiny star-naut silhouette for admin dots: round body, visor, jetpack, legs
  function miniNaut(g, x, y, r) {
    g.fillStyle = INK;
    g.beginPath(); g.arc(x, y - r * 0.1, r + 1.4, 0, TAU); g.fill();
    g.fillRect(x - r * 1.2 - 1.2, y - r * 0.45 - 1.2, r * 0.5 + 2.4, r * 0.9 + 2.4);
    g.fillRect(x - r * 0.62 - 1.2, y + r * 0.5, r * 0.5 + 2.4, r * 0.62 + 1.2);
    g.fillRect(x + r * 0.12 - 1.2, y + r * 0.5, r * 0.5 + 2.4, r * 0.62 + 1.2);
    g.fillStyle = '#dfe7f7';
    g.fillRect(x - r * 1.2, y - r * 0.45, r * 0.5, r * 0.9);
    g.fillRect(x - r * 0.62, y + r * 0.5, r * 0.5, r * 0.5);
    g.fillRect(x + r * 0.12, y + r * 0.5, r * 0.5, r * 0.5);
    g.fillStyle = '#f4f8ff';
    g.beginPath(); g.arc(x, y - r * 0.1, r, 0, TAU); g.fill();
    g.fillStyle = '#26345e';
    g.beginPath(); g.ellipse(x + r * 0.22, y - r * 0.28, r * 0.62, r * 0.42, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath(); g.ellipse(x + r * 0.05, y - r * 0.42, r * 0.2, r * 0.1, -0.4, 0, TAU); g.fill();
  }

  function markerColor(c, def) {""")
open(p, 'w', encoding='utf-8').write(s)
print('patched')
