import * as THREE from 'three';

let maxAniso = 4;
export const setAniso = (a) => (maxAniso = a);

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

export function toTex(c, { repeat, srgb = true, shared = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  t.userData.shared = shared;
  return t;
}

// Seeded random so textures look the same every launch
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const FONT_BODY = '"Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif';
const FONT_DISPLAY = '"Rajdhani", "Segoe UI", "Helvetica Neue", Arial, sans-serif';
// Bold weights use the Rajdhani display face (sci-fi HUD look), lighter ones use Inter.
export const font = (w, px) => (w >= 700 ? `700 ${px}px ${FONT_DISPLAY}` : `${Math.min(w, 600) >= 550 ? 600 : 400} ${px}px ${FONT_BODY}`);

// ---------- Andromeda Insights logo mark (spiral galaxy) ----------
export function drawGalaxy(ctx, cx, cy, r, { tilt = 0.42, rot = -0.45, colA = '#a78bfa', colB = '#22d3ee', seed = 7, dots = 900, glow = true } = {}) {
  const R = rng(seed);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.scale(1, tilt);
  if (glow) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, 'rgba(255,250,240,0.95)');
    g.addColorStop(0.12, 'rgba(230,210,255,0.75)');
    g.addColorStop(0.4, 'rgba(140,100,255,0.25)');
    g.addColorStop(1, 'rgba(60,40,140,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const ca = new THREE.Color(colA), cb = new THREE.Color(colB), tmp = new THREE.Color();
  for (let i = 0; i < dots; i++) {
    const arm = i % 2;
    const t = R();
    const ang = t * 3.4 * Math.PI + arm * Math.PI;
    const rad = r * (0.08 + 0.92 * t);
    const spread = (R() - 0.5) * r * 0.16 * (0.4 + t);
    const x = Math.cos(ang) * rad + Math.cos(ang + 1.57) * spread;
    const y = Math.sin(ang) * rad + Math.sin(ang + 1.57) * spread;
    tmp.copy(ca).lerp(cb, t);
    const a = (1 - t) * 0.8 + 0.2;
    ctx.fillStyle = `rgba(${(tmp.r * 255) | 0},${(tmp.g * 255) | 0},${(tmp.b * 255) | 0},${a})`;
    const s = (R() * 1.6 + 0.6) * (r / 140);
    ctx.beginPath();
    ctx.arc(x, y, s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function logoCanvas(w = 1024, h = 256, { text = true, dark = false, sub = 'INSIGHTS' } = {}) {
  const [c, ctx] = canvas(w, h);
  drawGalaxy(ctx, h * 0.55, h * 0.5, h * 0.48, { dots: 700 });
  if (text) {
    ctx.fillStyle = dark ? '#1a1530' : '#f4f1ff';
    ctx.font = font(800, h * 0.34);
    ctx.textBaseline = 'middle';
    ctx.fillText('ANDROMEDA', h * 1.15, h * 0.42);
    ctx.fillStyle = dark ? '#5b3fd1' : '#b8a6ff';
    ctx.font = font(600, h * 0.16);
    const sp = sub.split('').join(String.fromCharCode(8202) + ' ');
    ctx.fillText(sp, h * 1.17, h * 0.74);
  }
  return c;
}

export function textCanvas(w, h, draw) {
  const [c, ctx] = canvas(w, h);
  draw(ctx, w, h);
  return c;
}

// ---------- surface textures ----------
export function pcbTexture(base = '#121418', trace = '#1f2a33', seed = 3) {
  const [c, ctx] = canvas(1024, 1024);
  const R = rng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 1024, 1024);
  ctx.strokeStyle = trace;
  ctx.lineWidth = 3;
  for (let i = 0; i < 220; i++) {
    let x = R() * 1024, y = R() * 1024;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      if (R() < 0.5) x += (R() - 0.5) * 240;
      else y += (R() - 0.5) * 240;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.fillStyle = '#3a4450';
  for (let i = 0; i < 300; i++) {
    ctx.beginPath();
    ctx.arc(R() * 1024, R() * 1024, 2.5, 0, 7);
    ctx.fill();
  }
  // silkscreen
  ctx.fillStyle = 'rgba(220,225,235,0.55)';
  ctx.font = font(700, 30);
  ctx.fillText('ANDROMEDA AX-1', 520, 940);
  ctx.font = font(500, 18);
  ctx.fillText('REV 1.0  ·  DESIGNED IN THE LOCAL GROUP', 520, 970);
  ctx.fillText('PCIE_1', 330, 760);
  ctx.fillText('M2_1', 600, 650);
  ctx.fillText('DIMM_A2  B2', 120, 120);
  ctx.fillText('ATX_PWR', 30, 470);
  ctx.fillText('CPU_PWR', 180, 40);
  return toTex(c, { shared: true });
}

export function brushedTexture(seed = 1, tint = 200) {
  const [c, ctx] = canvas(512, 512);
  const R = rng(seed);
  ctx.fillStyle = `rgb(${tint},${tint},${tint})`;
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1400; i++) {
    const v = tint + (R() - 0.5) * 50;
    ctx.strokeStyle = `rgba(${v | 0},${v | 0},${v | 0},0.35)`;
    ctx.beginPath();
    const y = R() * 512;
    ctx.moveTo(0, y);
    ctx.lineTo(512, y + (R() - 0.5) * 4);
    ctx.stroke();
  }
  return toTex(c, { shared: true });
}

export function noiseTexture({ base = '#808080', vary = 30, size = 512, seed = 9, specks = 6000, repeat = [1, 1] } = {}) {
  const [c, ctx] = canvas(size, size);
  const R = rng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < specks; i++) {
    const v = (R() - 0.5) * vary;
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v / 255})` : `rgba(0,0,0,${-v / 255})`;
    const s = R() * 3 + 1;
    ctx.fillRect(R() * size, R() * size, s, s);
  }
  return toTex(c, { repeat, shared: true });
}

export function cardboardTexture(printed = false) {
  const [c, ctx] = canvas(1024, 1024);
  const R = rng(printed ? 21 : 11);
  ctx.fillStyle = '#b98a57';
  ctx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 9000; i++) {
    const v = (R() - 0.5) * 40;
    ctx.fillStyle = v > 0 ? `rgba(255,235,200,${v / 255})` : `rgba(60,30,0,${-v / 255})`;
    ctx.fillRect(R() * 1024, R() * 1024, R() * 6 + 1, 1.5);
  }
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = 'rgba(90,55,20,0.08)';
    ctx.lineWidth = 6;
    const x = R() * 1024;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (R() - 0.5) * 30, 1024);
    ctx.stroke();
  }
  if (printed) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    drawGalaxy(ctx, 300, 420, 190, { colA: '#3b2a7a', colB: '#3b2a7a', glow: false, dots: 900 });
    ctx.fillStyle = '#2a1e5c';
    ctx.font = font(800, 92);
    ctx.fillText('ANDROMEDA', 160, 700);
    ctx.font = font(600, 46);
    ctx.fillText('I N S I G H T S', 166, 770);
    ctx.font = font(500, 30);
    ctx.fillText('Hand-built & tested by a real person.', 166, 850);
    // handling icons
    ctx.strokeStyle = '#2a1e5c';
    ctx.lineWidth = 8;
    ctx.strokeRect(720, 120, 220, 220);
    ctx.beginPath();
    ctx.moveTo(780, 300);
    ctx.lineTo(780, 170);
    ctx.lineTo(755, 200);
    ctx.moveTo(780, 170);
    ctx.lineTo(805, 200);
    ctx.moveTo(880, 300);
    ctx.lineTo(880, 170);
    ctx.lineTo(855, 200);
    ctx.moveTo(880, 170);
    ctx.lineTo(905, 200);
    ctx.stroke();
    ctx.font = font(700, 34);
    ctx.fillStyle = '#2a1e5c';
    ctx.fillText('THIS SIDE UP', 712, 390);
    ctx.fillText('FRAGILE', 752, 440);
    ctx.restore();
  }
  return toTex(c, { shared: true });
}

export function tapeTexture() {
  const [c, ctx] = canvas(1024, 128);
  ctx.fillStyle = 'rgba(214,190,150,0.92)';
  ctx.fillRect(0, 0, 1024, 128);
  ctx.fillStyle = '#4c2fb0';
  ctx.font = font(800, 40);
  ctx.textBaseline = 'middle';
  for (let x = 10; x < 1024; x += 512) {
    drawGalaxy(ctx, x + 32, 64, 26, { colA: '#4c2fb0', colB: '#4c2fb0', glow: false, dots: 120 });
    ctx.fillText('ANDROMEDA INSIGHTS', x + 70, 66);
  }
  const t = toTex(c, { shared: true });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

export function foamTexture() {
  return noiseTexture({ base: '#d9dde3', vary: 26, seed: 33, specks: 9000 });
}

export function matTexture(accent = '#8b5cf6') {
  const [c, ctx] = canvas(1024, 1024);
  ctx.fillStyle = '#1b2333';
  ctx.fillRect(0, 0, 1024, 1024);
  ctx.strokeStyle = 'rgba(160,180,220,0.13)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 1024; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 1024);
    ctx.moveTo(0, i);
    ctx.lineTo(1024, i);
    ctx.stroke();
  }
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 6;
  ctx.strokeRect(24, 24, 976, 976);
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#c7d2fe';
  ctx.font = font(700, 34);
  ctx.fillText('ESD SAFE WORK AREA', 48, 990);
  ctx.globalAlpha = 1;
  return toTex(c, { shared: true });
}

export function woodTexture() {
  const [c, ctx] = canvas(1024, 512);
  const R = rng(5);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#3a2a20');
  g.addColorStop(1, '#2e2119');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 260; i++) {
    const y = R() * 512;
    ctx.strokeStyle = `rgba(${R() < 0.5 ? '90,65,45' : '25,16,10'},${0.15 + R() * 0.25})`;
    ctx.lineWidth = R() * 3 + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 1024; x += 64) ctx.lineTo(x, y + Math.sin(x * 0.01 + i) * 4 + (R() - 0.5) * 3);
    ctx.stroke();
  }
  return toTex(c, { repeat: [2, 1], shared: true });
}

export function concreteTexture() {
  return noiseTexture({ base: '#2a2d35', vary: 22, seed: 77, specks: 14000, repeat: [6, 6] });
}

export function grilleTexture() {
  // alpha map: hex-hole mesh
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#000';
  for (let y = 0; y < 256 + 16; y += 16) {
    for (let x = 0; x < 256 + 16; x += 16) {
      ctx.beginPath();
      ctx.arc(x + ((y / 16) % 2) * 8, y, 5.2, 0, 7);
      ctx.fill();
    }
  }
  return toTex(c, { repeat: [6, 6], srgb: false, shared: true });
}

export function starfieldTexture() {
  const [c, ctx] = canvas(2048, 1024);
  const R = rng(1234);
  const bg = ctx.createLinearGradient(0, 0, 0, 1024);
  bg.addColorStop(0, '#05060f');
  bg.addColorStop(1, '#0b0820');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 2048, 1024);
  // nebula clouds
  for (let i = 0; i < 40; i++) {
    const x = R() * 2048, y = R() * 1024, r = 80 + R() * 260;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const hue = R() < 0.5 ? '120,70,220' : '30,140,200';
    g.addColorStop(0, `rgba(${hue},${0.05 + R() * 0.06})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 2600; i++) {
    const s = R();
    ctx.fillStyle = `rgba(255,255,255,${0.2 + s * 0.8})`;
    const sz = s > 0.985 ? 2.6 : s > 0.9 ? 1.6 : 1;
    ctx.fillRect(R() * 2048, R() * 1024, sz, sz);
  }
  drawGalaxy(ctx, 1250, 470, 330, { tilt: 0.3, rot: -0.55, dots: 5000, colA: '#e9d5ff', colB: '#67e8f9', seed: 99 });
  drawGalaxy(ctx, 1480, 380, 40, { tilt: 0.6, rot: 0.3, dots: 200, colA: '#fde68a', colB: '#fde68a', seed: 5 });
  return toTex(c, { shared: true });
}

export function ringSpriteTexture() {
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 20, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.0)');
  g.addColorStop(0.72, 'rgba(255,255,255,1)');
  g.addColorStop(0.82, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const g2 = ctx.createRadialGradient(64, 64, 0, 64, 64, 22);
  g2.addColorStop(0, 'rgba(255,255,255,0.9)');
  g2.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, 128, 128);
  return toTex(c, { shared: true });
}

export function radiatorTexture() {
  const [c, ctx] = canvas(512, 64);
  ctx.fillStyle = '#16181d';
  ctx.fillRect(0, 0, 512, 64);
  ctx.strokeStyle = '#2c3038';
  ctx.lineWidth = 2;
  for (let x = 0; x < 512; x += 5) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 3, 64);
    ctx.stroke();
  }
  return toTex(c, { shared: true });
}

// simple label: colored chip + text
export function chipLabel(text, sub, color, w = 512, h = 128) {
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = 'rgba(10,12,20,0.92)';
  roundRect(ctx, 4, 4, w - 8, h - 8, 22);
  ctx.fill();
  ctx.fillStyle = color;
  roundRect(ctx, 18, 22, 16, h - 44, 8);
  ctx.fill();
  ctx.fillStyle = '#f8fafc';
  ctx.font = font(800, h * 0.36);
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 52, sub ? h * 0.38 : h * 0.52);
  if (sub) {
    ctx.fillStyle = 'rgba(200,210,230,0.75)';
    ctx.font = font(600, h * 0.2);
    ctx.fillText(sub, 54, h * 0.73);
  }
  return toTex(c);
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function barcode(ctx, x, y, w, h, seed = 1) {
  const R = rng(seed);
  let cx = x;
  ctx.fillStyle = '#111';
  while (cx < x + w) {
    const bw = R() < 0.5 ? 2 : R() < 0.5 ? 4 : 6;
    if (R() < 0.6) ctx.fillRect(cx, y, bw, h);
    cx += bw + 2;
  }
}


// ---------------------------------------------------------------------------
// Normal maps from height fields (Sobel) — gives every surface real micro-detail
// ---------------------------------------------------------------------------
export function heightToNormal(src, strength = 2, repeat) {
  const w = src.width, h = src.height;
  const sctx = src.getContext('2d');
  const d = sctx.getImageData(0, 0, w, h).data;
  const [c, ctx] = canvas(w, h);
  const out = ctx.createImageData(w, h);
  const H = (x, y) => d[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x - 1, y) - H(x - 1, y + 1)) * strength;
      const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x, y - 1) - H(x + 1, y - 1)) * strength;
      const nz = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * w + x) * 4;
      out.data[i] = (-dx * nz * 0.5 + 0.5) * 255;
      out.data[i + 1] = (dy * nz * 0.5 + 0.5) * 255;
      out.data[i + 2] = nz * 255;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return toTex(c, { srgb: false, repeat, shared: true });
}

function heightCanvas(size, draw) {
  const [c, ctx] = canvas(size, size);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  draw(ctx, size);
  return c;
}

export function brushedNormal() {
  const R = rng(41);
  return heightToNormal(heightCanvas(256, (ctx, S) => {
    for (let i = 0; i < 900; i++) {
      const v = 128 + (R() - 0.5) * 70;
      ctx.strokeStyle = `rgb(${v},${v},${v})`;
      ctx.beginPath();
      const y = R() * S;
      ctx.moveTo(0, y);
      ctx.lineTo(S, y);
      ctx.stroke();
    }
  }), 1.2, [2, 2]);
}

export function pcbNormal() {
  const R = rng(3);
  return heightToNormal(heightCanvas(512, (ctx, S) => {
    ctx.strokeStyle = '#a8a8a8';
    ctx.lineWidth = 2;
    for (let i = 0; i < 160; i++) {
      let x = R() * S, y = R() * S;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        if (R() < 0.5) x += (R() - 0.5) * 120;
        else y += (R() - 0.5) * 120;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = '#c0c0c0';
    for (let i = 0; i < 200; i++) ctx.fillRect(R() * S, R() * S, 3, 3);
  }), 2.5);
}

export function corrugatedNormal() {
  return heightToNormal(heightCanvas(256, (ctx, S) => {
    for (let x = 0; x < S; x++) {
      const v = 128 + Math.sin((x / S) * Math.PI * 2 * 18) * 40;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x, 0, 1, S);
    }
    const R = rng(8);
    for (let i = 0; i < 2000; i++) {
      const v = 128 + (R() - 0.5) * 50;
      ctx.fillStyle = `rgba(${v},${v},${v},0.4)`;
      ctx.fillRect(R() * S, R() * S, 2, 2);
    }
  }), 0.9, [3, 3]);
}

export function foamNormal() {
  const R = rng(19);
  return heightToNormal(heightCanvas(256, (ctx, S) => {
    for (let i = 0; i < 1800; i++) {
      const v = 80 + R() * 120;
      ctx.fillStyle = `rgba(${v},${v},${v},0.7)`;
      ctx.beginPath();
      ctx.arc(R() * S, R() * S, R() * 3 + 1, 0, 7);
      ctx.fill();
    }
  }), 2.0, [3, 3]);
}

// Sci-fi hex wall panels: returns { map, normal, emissive }
export function hexPanelTextures(accent = '#8b5cf6') {
  const S = 512;
  const hexPath = (ctx, cx, cy, r) => {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath();
  };
  const r = 46, dx = r * Math.sqrt(3), dy = r * 1.5;
  const each = (fn) => {
    for (let row = -1; row < S / dy + 2; row++) for (let col = -1; col < S / dx + 2; col++) fn(col * dx + (row % 2 ? dx / 2 : 0), row * dy, row, col);
  };
  const [cm, cmx] = canvas(S, S);
  cmx.fillStyle = '#14161f';
  cmx.fillRect(0, 0, S, S);
  const R = rng(55);
  each((x, y) => {
    const v = 26 + R() * 10;
    cmx.fillStyle = `rgb(${v},${v + 2},${v + 8})`;
    hexPath(cmx, x, y, r - 4);
    cmx.fill();
  });
  const hc = heightCanvas(S, (ctx) => {
    ctx.fillStyle = '#303030';
    ctx.fillRect(0, 0, S, S);
    each((x, y) => {
      ctx.fillStyle = '#b0b0b0';
      hexPath(ctx, x, y, r - 4);
      ctx.fill();
      ctx.fillStyle = '#c8c8c8';
      hexPath(ctx, x, y, r - 12);
      ctx.fill();
    });
  });
  const [ce, cex] = canvas(S, S);
  cex.fillStyle = '#000';
  cex.fillRect(0, 0, S, S);
  cex.strokeStyle = accent;
  cex.lineWidth = 2;
  const R2 = rng(77);
  each((x, y) => {
    if (R2() < 0.12) {
      hexPath(cex, x, y, r - 7);
      cex.stroke();
    }
  });
  const map = toTex(cm, { repeat: [6, 3], shared: true });
  const normal = heightToNormal(hc, 3, [6, 3]);
  const emissive = toTex(ce, { repeat: [6, 3], shared: true });
  return { map, normal, emissive };
}

// Metal floor plates with glossy/rough variation
export function floorTextures() {
  const S = 512;
  const R = rng(91);
  const [cm, cmx] = canvas(S, S);
  cmx.fillStyle = '#1c1f27';
  cmx.fillRect(0, 0, S, S);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const v = 26 + R() * 8;
    cmx.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
    cmx.fillRect(i * 128 + 3, j * 128 + 3, 122, 122);
  }
  for (let i = 0; i < 5000; i++) {
    cmx.fillStyle = `rgba(255,255,255,${R() * 0.03})`;
    cmx.fillRect(R() * S, R() * S, 2, 2);
  }
  const hc = heightCanvas(S, (ctx) => {
    ctx.fillStyle = '#404040';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#909090';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      ctx.fillRect(i * 128 + 3, j * 128 + 3, 122, 122);
      ctx.fillStyle = '#707070';
      for (const [cx, cy] of [[10, 10], [118, 10], [10, 118], [118, 118]]) {
        ctx.beginPath();
        ctx.arc(i * 128 + cx, j * 128 + cy, 3, 0, 7);
        ctx.fill();
      }
      ctx.fillStyle = '#909090';
    }
  });
  const [cr, crx] = canvas(S, S);
  crx.fillStyle = '#5a5a5a';
  crx.fillRect(0, 0, S, S);
  for (let i = 0; i < 60; i++) {
    const x = R() * S, y = R() * S, rad = 20 + R() * 80;
    const g = crx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(20,20,20,0.6)');
    g.addColorStop(1, 'rgba(20,20,20,0)');
    crx.fillStyle = g;
    crx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  return {
    map: toTex(cm, { repeat: [10, 10], shared: true }),
    normal: heightToNormal(hc, 2.5, [10, 10]),
    rough: toTex(cr, { repeat: [10, 10], srgb: false, shared: true }),
  };
}

// Braided cable sleeving
export function sleeveTextures() {
  const S = 128;
  const hc = heightCanvas(S, (ctx) => {
    for (let y = 0; y < S; y += 8) {
      for (let x = 0; x < S; x += 8) {
        const g = ctx.createLinearGradient(x, y, x + 8, y + 8);
        const flip = ((x + y) / 8) % 2;
        g.addColorStop(0, flip ? '#e0e0e0' : '#404040');
        g.addColorStop(1, flip ? '#404040' : '#e0e0e0');
        ctx.fillStyle = g;
        ctx.fillRect(x, y, 8, 8);
      }
    }
  });
  return heightToNormal(hc, 1.6, [24, 1]);
}

export function hazardTexture() {
  const [c, ctx] = canvas(256, 64);
  ctx.fillStyle = '#0f1014';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#f5b301';
  for (let x = -64; x < 256 + 64; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 64);
    ctx.lineTo(x + 16, 64);
    ctx.lineTo(x + 48, 0);
    ctx.lineTo(x + 32, 0);
    ctx.fill();
  }
  return toTex(c, { repeat: [8, 1], shared: true });
}

export function saturnBands() {
  const [c, ctx] = canvas(64, 512);
  const R = rng(4);
  const cols = ['#e3d2a8', '#c49a62', '#efe3c6', '#9c7448', '#d9bb86', '#86613d', '#f3e9d2', '#b88a56'];
  let y = 0;
  while (y < 512) {
    const h = 6 + R() * 26;
    ctx.fillStyle = cols[(R() * cols.length) | 0];
    ctx.fillRect(0, y, 64, h);
    y += h;
  }
  ctx.globalAlpha = 0.25;
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = R() < 0.5 ? '#fff' : '#6b5135';
    ctx.fillRect(0, R() * 512, 64, 1);
  }
  const t = toTex(c, { shared: true });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

export function ringTexture() {
  const [c, ctx] = canvas(512, 4);
  const R = rng(12);
  for (let x = 0; x < 512; x++) {
    const t = x / 512;
    let a = 0.25 + R() * 0.5;
    if (t > 0.48 && t < 0.53) a *= 0.08; // Cassini division
    if (t < 0.06 || t > 0.97) a *= t < 0.06 ? t / 0.06 : (1 - t) / 0.03;
    const v = 170 + R() * 70;
    ctx.fillStyle = `rgba(${v},${v * 0.92 | 0},${v * 0.8 | 0},${a})`;
    ctx.fillRect(x, 0, 1, 4);
  }
  return toTex(c, { shared: true });
}

export function holoLabelCanvas(title, sub, color, w = 512, h = 160) {
  return textCanvas(w, h, (ctx) => {
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(10,20,40,0.0)');
    g.addColorStop(0.08, 'rgba(10,20,40,0.75)');
    g.addColorStop(0.92, 'rgba(10,20,40,0.75)');
    g.addColorStop(1, 'rgba(10,20,40,0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 18, w, h - 36);
    ctx.fillStyle = color;
    ctx.fillRect(40, 18, w - 80, 3);
    ctx.fillRect(40, h - 21, w - 80, 3);
    ctx.fillStyle = '#f8fafc';
    ctx.font = font(700, 58);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title.toUpperCase(), w / 2, h * 0.43);
    ctx.fillStyle = color;
    ctx.font = font(700, 26);
    ctx.fillText(sub.toUpperCase(), w / 2, h * 0.74);
  });
}
