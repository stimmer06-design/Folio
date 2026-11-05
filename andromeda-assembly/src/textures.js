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

const FONT = '"Segoe UI", "Inter", "Helvetica Neue", Arial, sans-serif';
export const font = (w, px) => `${w} ${px}px ${FONT}`;

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
