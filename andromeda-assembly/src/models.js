import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures.js';

// ---------------------------------------------------------------------------
// Shared materials & geometry cache
// ---------------------------------------------------------------------------
export const M = {};
const geoCache = new Map();
function G(key, fn) {
  let g = geoCache.get(key);
  if (!g) {
    g = fn();
    g.userData.shared = true;
    geoCache.set(key, g);
  }
  return g;
}
const boxG = (w, h, d) => G(`b${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d));
const rboxG = (w, h, d, r = 0.03) => G(`rb${w}|${h}|${d}|${r}`, () => new RoundedBoxGeometry(w, h, d, 2, r));
const cylG = (rt, rb, h, seg = 24) => G(`c${rt}|${rb}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
const torG = (r, t, seg = 48) => G(`t${r}|${t}|${seg}`, () => new THREE.TorusGeometry(r, t, 8, seg));
const planeG = (w, h) => G(`p${w}|${h}`, () => new THREE.PlaneGeometry(w, h));

export function std(o) {
  const m = new THREE.MeshStandardMaterial(o);
  m.userData.shared = true;
  return m;
}
export function phys(o) {
  const m = new THREE.MeshPhysicalMaterial(o);
  m.userData.shared = true;
  return m;
}
function basic(o) {
  const m = new THREE.MeshBasicMaterial(o);
  m.userData.shared = true;
  return m;
}
const matCache = new Map();
function cmat(key, fn) {
  if (!matCache.has(key)) matCache.set(key, fn());
  return matCache.get(key);
}
function texMat(key, canvasFn, o = {}) {
  return cmat(key, () => {
    const t = T.toTex(canvasFn(), { shared: true });
    return std({ map: t, roughness: 0.5, metalness: 0.1, ...o });
  });
}

export function mesh(geo, mat, x = 0, y = 0, z = 0, parent, o = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (o.rx) m.rotation.x = o.rx;
  if (o.ry) m.rotation.y = o.ry;
  if (o.rz) m.rotation.z = o.rz;
  m.castShadow = o.cast !== false;
  m.receiveShadow = o.receive !== false;
  if (parent) parent.add(m);
  return m;
}

export function initMaterials() {
  const nBrushed = T.brushedNormal();
  const nPcb = T.pcbNormal();
  const nCard = T.corrugatedNormal();
  M.pcbTex = T.pcbTexture();
  M.pcb = std({ map: M.pcbTex, roughness: 0.62, metalness: 0.25, normalMap: nPcb, normalScale: new THREE.Vector2(0.5, 0.5) });
  M.black = std({ color: '#15161b', roughness: 0.55, metalness: 0.25 });
  M.blackGloss = phys({ color: '#0b0c10', roughness: 0.25, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.12 });
  M.darkMetal = std({ color: '#2e323b', roughness: 0.32, metalness: 0.9, normalMap: nBrushed, normalScale: new THREE.Vector2(0.35, 0.35) });
  M.alu = std({ color: '#d2d7df', roughness: 0.26, metalness: 0.96, map: T.brushedTexture(2, 215), normalMap: nBrushed, normalScale: new THREE.Vector2(0.4, 0.4) });
  M.aluDark = std({ color: '#5b6170', roughness: 0.3, metalness: 0.92, map: T.brushedTexture(3, 160), normalMap: nBrushed, normalScale: new THREE.Vector2(0.4, 0.4) });
  M.copper = std({ color: '#c97a45', roughness: 0.22, metalness: 1, normalMap: nBrushed, normalScale: new THREE.Vector2(0.2, 0.2) });
  M.gold = std({ color: '#e0b04f', roughness: 0.22, metalness: 1 });
  M.silver = std({ color: '#dde1e7', roughness: 0.18, metalness: 1 });
  M.brass = std({ color: '#bf953c', roughness: 0.3, metalness: 1 });
  M.plastic = std({ color: '#23262d', roughness: 0.5, metalness: 0.05 });
  M.plasticWhite = phys({ color: '#eef0f4', roughness: 0.4, metalness: 0.0, clearcoat: 0.4, clearcoatRoughness: 0.3 });
  M.rubber = std({ color: '#0b0b0d', roughness: 0.95 });
  M.ramPcb = std({ color: '#1b4a33', roughness: 0.55, normalMap: nPcb, normalScale: new THREE.Vector2(0.3, 0.3) });
  M.chip = std({ color: '#0a0a0c', roughness: 0.3, metalness: 0.25 });
  M.fan = std({ color: '#16171c', roughness: 0.45, metalness: 0.15 });
  M.fanWhite = std({ color: '#e7e9ee', roughness: 0.45, metalness: 0.05 });
  M.glass = phys({ color: '#b9cbe2', roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.07, depthWrite: false, envMapIntensity: 0.9, ior: 1.5, specularIntensity: 0.6 });
  M.sleeveN = T.sleeveTextures();
  M.cable = std({ color: '#121317', roughness: 0.6, metalness: 0.1, normalMap: M.sleeveN, normalScale: new THREE.Vector2(0.8, 0.8) });
  M.cardboard = std({ map: T.cardboardTexture(false), roughness: 0.9, normalMap: nCard, normalScale: new THREE.Vector2(0.5, 0.5) });
  M.cardboardPrint = std({ map: T.cardboardTexture(true), roughness: 0.88, normalMap: nCard, normalScale: new THREE.Vector2(0.5, 0.5) });
  M.cardboardInner = std({ color: '#9c6d43', roughness: 0.96, normalMap: nCard, normalScale: new THREE.Vector2(0.6, 0.6) });
  M.foam = std({ map: T.foamTexture(), roughness: 1, normalMap: T.foamNormal(), normalScale: new THREE.Vector2(0.8, 0.8) });
  M.tape = std({ map: T.tapeTexture(), transparent: true, roughness: 0.25, metalness: 0.05 });
  M.paste = std({ color: '#a9adb5', roughness: 0.35, metalness: 0.6 });
  // RGB: the "live" material that lights up on power, and the idle look for parts on the pads
  M.rgb = std({ color: '#111', emissive: new THREE.Color('#8b5cf6'), emissiveIntensity: 0, roughness: 0.3 });
  M.rgbIdle = std({ color: '#2b2d35', roughness: 0.2, metalness: 0.1 });
  M.legend = std({ color: '#221a05', emissive: new THREE.Color('#facc15'), emissiveIntensity: 1.6, roughness: 0.3 });
  M.ghost = basic({ color: '#7dd3fc', transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending });
  M.ghostHot = basic({ color: '#a5f3fc', transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending });
  M.hint = basic({ color: '#67e8f9', transparent: true, opacity: 0.95, depthTest: false });
  M.screenOff = std({ color: '#050608', roughness: 0.15, metalness: 0.3 });
  M.ledGreen = std({ color: '#062', emissive: new THREE.Color('#22c55e'), emissiveIntensity: 0, roughness: 0.4 });
  M.redBtn = std({ color: '#b91c1c', emissive: new THREE.Color('#ef4444'), emissiveIntensity: 0.2, roughness: 0.35 });
  M.ringTex = T.ringSpriteTexture();
}

export function swapMaterial(root, from, to) {
  root.traverse((o) => {
    if (o.isMesh && o.material === from) o.material = to;
  });
}

// ---------------------------------------------------------------------------
// Fans, screws, markers
// ---------------------------------------------------------------------------
export function buildFan(size = 1.1, thick = 0.25, frameMat = M.fan, rgb = M.rgb, rgbBack = true) {
  const g = new THREE.Group();
  const frameGeo = G(`fanframe${size}|${thick}`, () => {
    const s = size / 2;
    const shape = new THREE.Shape();
    const r = size * 0.08;
    shape.moveTo(-s + r, -s);
    shape.lineTo(s - r, -s);
    shape.quadraticCurveTo(s, -s, s, -s + r);
    shape.lineTo(s, s - r);
    shape.quadraticCurveTo(s, s, s - r, s);
    shape.lineTo(-s + r, s);
    shape.quadraticCurveTo(-s, s, -s, s - r);
    shape.lineTo(-s, -s + r);
    shape.quadraticCurveTo(-s, -s, -s + r, -s);
    const hole = new THREE.Path();
    hole.absarc(0, 0, size * 0.465, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 24 });
    geo.translate(0, 0, -thick / 2);
    return geo;
  });
  mesh(frameGeo, frameMat, 0, 0, 0, g);
  const rotor = new THREE.Group();
  rotor.userData.isRotor = true;
  g.add(rotor);
  mesh(cylG(size * 0.17, size * 0.17, thick * 0.8, 20), frameMat, 0, 0, 0, rotor, { rx: Math.PI / 2 });
  // all nine curved blades merged into one geometry (one draw call per rotor)
  const bladesGeo = G(`blades${size}`, () => {
    const L = size * 0.31, w = size * 0.2;
    const sh = new THREE.Shape();
    sh.moveTo(0, -w * 0.25);
    sh.quadraticCurveTo(L * 0.55, -w * 0.75, L, -w * 0.35);
    sh.quadraticCurveTo(L * 1.04, w * 0.1, L * 0.92, w * 0.5);
    sh.quadraticCurveTo(L * 0.45, w * 0.35, 0, w * 0.25);
    sh.closePath();
    const blade = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: false, curveSegments: 6 });
    blade.translate(0, 0, -0.006);
    const parts = [];
    const m = new THREE.Matrix4(), r = new THREE.Matrix4(), t = new THREE.Matrix4();
    for (let i = 0; i < 9; i++) {
      m.makeRotationZ((i / 9) * Math.PI * 2);
      t.makeTranslation(size * 0.13, 0, 0);
      r.makeRotationX(0.5);
      parts.push(blade.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(m, t).multiply(r)));
    }
    return mergeGeometries(parts);
  });
  mesh(bladesGeo, frameMat, 0, 0, 0, rotor, { cast: false });
  mesh(torG(size * 0.455, 0.014), rgb, 0, 0, thick / 2 + 0.002, g, { cast: false });
  if (rgbBack) mesh(torG(size * 0.455, 0.014), rgb, 0, 0, -thick / 2 - 0.002, g, { cast: false });
  return g;
}

export function buildScrew() {
  const g = new THREE.Group();
  mesh(cylG(0.075, 0.075, 0.04, 16), M.silver, 0, 0, 0.02, g, { rx: Math.PI / 2 });
  mesh(boxG(0.1, 0.02, 0.012), M.darkMetal, 0, 0, 0.042, g, { cast: false });
  mesh(boxG(0.02, 0.1, 0.012), M.darkMetal, 0, 0, 0.042, g, { cast: false });
  mesh(cylG(0.03, 0.03, 0.2, 8), M.silver, 0, 0, -0.08, g, { rx: Math.PI / 2, cast: false });
  return g;
}

export function buildMarker(color = '#67e8f9', size = 0.5) {
  const mat = new THREE.SpriteMaterial({ map: M.ringTex, color, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
  const s = new THREE.Sprite(mat);
  s.scale.set(size, size, size);
  s.renderOrder = 999;
  s.userData.baseSize = size;
  return s;
}

export function buildHintArrow() {
  const g = new THREE.Group();
  const cone = mesh(G('hintcone', () => new THREE.ConeGeometry(0.22, 0.42, 20)), M.hint, 0, 0.21, 0, g, { rx: Math.PI, cast: false });
  const shaft = mesh(cylG(0.07, 0.07, 0.42, 12), M.hint, 0, 0.62, 0, g, { cast: false });
  cone.renderOrder = shaft.renderOrder = 1000;
  return g;
}

// ---------------------------------------------------------------------------
// Case
// ---------------------------------------------------------------------------
export const CASE = { W: 4.4, H: 5.0, D: 2.2 };

export function buildCase(variant) {
  const g = new THREE.Group();
  g.name = 'case';
  const { W, H, D } = CASE;
  const t = 0.06;
  const body = cmat('case' + variant.id, () => phys({ color: variant.body, roughness: 0.38, metalness: 0.55, clearcoat: 0.8, clearcoatRoughness: 0.18 }));
  const frame = cmat('frame' + variant.id, () => phys({ color: variant.frame, roughness: 0.3, metalness: 0.65, clearcoat: 1, clearcoatRoughness: 0.1 }));
  const fanMat = variant.id === 'lumen' ? M.fanWhite : M.fan;

  mesh(boxG(W, H, t), body, 0, H / 2, -D / 2 + t / 2, g); // motherboard tray
  mesh(boxG(W, t, D), body, 0, t / 2, 0, g); // floor
  mesh(boxG(W, t, D), body, 0, H - t / 2, 0, g); // top
  mesh(boxG(t, H, D), frame, -W / 2 + t / 2, H / 2, 0, g); // front
  mesh(boxG(t, H, D), body, W / 2 - t / 2, H / 2, 0, g); // rear
  // top mesh vent
  const vent = cmat('vent', () => std({ color: '#050507', roughness: 0.6, alphaMap: T.grilleTexture(), transparent: true }));
  mesh(planeG(3.2, 1.6), vent, 0.2, H + 0.002, 0, g, { rx: -Math.PI / 2, cast: false });
  // open-side frame
  mesh(boxG(W, 0.1, 0.07), frame, 0, H - 0.05, D / 2 - 0.035, g);
  mesh(boxG(W, 0.1, 0.07), frame, 0, 0.05, D / 2 - 0.035, g);
  mesh(boxG(0.12, H, 0.07), frame, -W / 2 + 0.06, H / 2, D / 2 - 0.035, g);
  mesh(boxG(0.12, H, 0.07), frame, W / 2 - 0.06, H / 2, D / 2 - 0.035, g);
  // RGB light strip down the front pillar
  mesh(boxG(0.04, H - 0.5, 0.02), M.rgb, -W / 2 + 0.06, H / 2, D / 2 + 0.006, g, { cast: false });
  // PSU shroud
  mesh(boxG(W - 2 * t, 0.05, D - 0.08), body, 0, 1.25, -0.02, g);
  mesh(boxG(W - 2 * t, 0.16, 0.04), body, 0, 1.17, D / 2 - 0.1, g);
  const shroudLogo = texMat('shroudlogo', () => T.logoCanvas(1024, 160), { transparent: true, roughness: 0.4, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.15 });
  shroudLogo.emissiveMap = shroudLogo.map;
  mesh(planeG(1.6, 0.25), shroudLogo, -0.9, 1.17, D / 2 - 0.078, g, { cast: false });
  mesh(rboxG(0.5, 0.02, 0.32, 0.008), M.rubber, 0.4, 1.28, 0.55, g); // gpu cable cutout
  // rubber grommets for cable management
  mesh(rboxG(0.2, 0.75, 0.03, 0.01), M.rubber, -0.95, 3.25, -D / 2 + t + 0.01, g);
  mesh(rboxG(0.55, 0.16, 0.03, 0.01), M.rubber, -0.8, 4.72, -D / 2 + t + 0.01, g);
  // brass standoffs (where the motherboard sits)
  for (const sx of [-1.2, 1.2]) for (const sy of [-1.4, 1.4]) mesh(cylG(0.05, 0.05, 0.05, 6), M.brass, 0.75 + sx, 2.95 + sy, -1.02, g, { rx: Math.PI / 2 });
  // rear expansion slot covers
  for (let i = 0; i < 5; i++) mesh(boxG(0.03, 0.08, 1.0), M.darkMetal, W / 2 - 0.08, 2.35 - i * 0.22, -0.4, g);
  // fans
  const rotors = [];
  for (const fy of [1.95, 3.1, 4.25]) {
    const f = buildFan(1.1, 0.25, fanMat);
    f.position.set(-W / 2 + 0.24, fy, -0.05);
    f.rotation.y = Math.PI / 2;
    g.add(f);
  }
  const rf = buildFan(1.0, 0.25, fanMat);
  rf.position.set(W / 2 - 0.2, 4.0, -0.25);
  rf.rotation.y = -Math.PI / 2;
  g.add(rf);
  // feet
  for (const fx of [-1.9, 1.9]) for (const fz of [-0.8, 0.8]) mesh(cylG(0.13, 0.15, 0.08, 16), M.rubber, fx, -0.04, fz, g);
  // power button + I/O on top
  const btn = new THREE.Group();
  btn.position.set(-1.7, H, 0.55);
  g.add(btn);
  const cap = mesh(cylG(0.13, 0.13, 0.05, 24), M.silver, 0, 0.03, 0, btn);
  const led = mesh(torG(0.15, 0.018, 32), M.ledGreen, 0, 0.012, 0, btn, { rx: Math.PI / 2, cast: false });
  for (let i = 0; i < 2; i++) mesh(boxG(0.16, 0.02, 0.06), M.blackGloss, -1.25 + i * 0.25, H + 0.005, 0.55, g);
  // case badge on front
  const badge = texMat('badge', () => T.logoCanvas(512, 128, { text: false }), { transparent: true, emissive: new THREE.Color('#fff'), emissiveIntensity: 0.4 });
  badge.emissiveMap = badge.map;
  mesh(planeG(0.5, 0.125), badge, -W / 2 - 0.002, 0.45, 0, g, { ry: -Math.PI / 2, cast: false });

  g.userData.caseRefs = { btn, cap, led, rotors };
  return g;
}

export function buildPanel() {
  const g = new THREE.Group();
  const { W, H } = CASE;
  const glass = mesh(boxG(W - 0.08, H - 0.08, 0.035), M.glass, 0, 0, 0, g, { cast: false });
  glass.renderOrder = 5;
  mesh(boxG(W - 0.08, 0.07, 0.045), M.blackGloss, 0, H / 2 - 0.075, 0, g);
  mesh(boxG(W - 0.08, 0.07, 0.045), M.blackGloss, 0, -H / 2 + 0.075, 0, g);
  mesh(boxG(0.07, H - 0.08, 0.045), M.blackGloss, -W / 2 + 0.075, 0, 0, g);
  mesh(boxG(0.07, H - 0.08, 0.045), M.blackGloss, W / 2 - 0.075, 0, 0, g);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) mesh(cylG(0.08, 0.08, 0.06, 16), M.silver, sx * (W / 2 - 0.2), sy * (H / 2 - 0.2), 0.04, g, { rx: Math.PI / 2 });
  return g;
}

// ---------------------------------------------------------------------------
// Motherboard
// ---------------------------------------------------------------------------
export const MB_POS = new THREE.Vector3(0.75, 2.95, -1.0);
export const MB_SCREWS = [[-1.2, 1.4], [1.2, 1.4], [-1.2, -1.4], [1.2, -1.4]];

export function buildMB() {
  const g = new THREE.Group();
  const side = M.black;
  mesh(boxG(2.7, 3.1, 0.06), [side, side, side, side, M.pcb, side], 0, 0, 0.03, g);
  // socket
  const sx = 0.4, sy = 0.55;
  mesh(boxG(0.68, 0.68, 0.03), M.darkMetal, sx, sy, 0.075, g);
  mesh(boxG(0.52, 0.52, 0.01), M.gold, sx, sy, 0.092, g, { cast: false });
  const plate = new THREE.Group();
  plate.position.set(sx - 0.33, sy, 0.1);
  g.add(plate);
  const pf = new THREE.Group();
  plate.add(pf);
  mesh(boxG(0.66, 0.06, 0.02), M.silver, 0.33, 0.3, 0, pf);
  mesh(boxG(0.66, 0.06, 0.02), M.silver, 0.33, -0.3, 0, pf);
  mesh(boxG(0.06, 0.66, 0.02), M.silver, 0.03, 0, 0, pf);
  mesh(boxG(0.06, 0.66, 0.02), M.silver, 0.63, 0, 0, pf);
  plate.rotation.y = -1.75;
  const lever = new THREE.Group();
  lever.position.set(sx + 0.38, sy - 0.32, 0.09);
  g.add(lever);
  mesh(cylG(0.018, 0.018, 0.66, 8), M.silver, 0, 0.33, 0, lever);
  mesh(boxG(0.06, 0.03, 0.08), M.silver, 0, 0.66, 0.03, lever);
  lever.rotation.x = 1.15;
  // VRM heatsinks
  const vrm = M.aluDark;
  mesh(rboxG(0.2, 0.9, 0.24, 0.02), vrm, sx - 0.48, sy, 0.12, g);
  mesh(rboxG(0.9, 0.2, 0.24, 0.02), vrm, sx + 0.05, sy + 0.62, 0.12, g);
  for (let i = 0; i < 6; i++) mesh(boxG(0.22, 0.02, 0.25), M.darkMetal, sx - 0.48, sy - 0.38 + i * 0.15, 0.125, g, { cast: false });
  // IO cover with accent
  const io = cmat('iocover', () => std({ color: '#191a20', roughness: 0.3, metalness: 0.6 }));
  mesh(rboxG(0.32, 1.1, 0.3, 0.03), io, 1.15, 0.85, 0.15, g);
  mesh(boxG(0.03, 0.9, 0.02), M.rgb, 1.0, 0.85, 0.3, g, { cast: false });
  // RAM slots (A1 A2 B1 B2)
  const latches = [];
  [-0.22, -0.35, -0.48, -0.61].forEach((x, i) => {
    const used = i === 1 || i === 3;
    mesh(boxG(0.06, 1.32, 0.07), used ? M.plastic : M.blackGloss, x, sy, 0.095, g);
    for (const dir of [-1, 1]) {
      const l = new THREE.Group();
      l.position.set(x, sy + dir * 0.68, 0.06);
      g.add(l);
      mesh(boxG(0.06, 0.05, 0.1), M.plasticWhite, 0, dir * 0.02, 0.05, l);
      l.rotation.x = dir * 0.45;
      if (used) latches.push({ obj: l, dir });
    }
  });
  // PCIe slots
  mesh(boxG(1.0, 0.09, 0.09), M.blackGloss, 0.5, -0.8, 0.1, g);
  mesh(boxG(1.04, 0.11, 0.06), M.silver, 0.5, -0.8, 0.085, g);
  mesh(boxG(0.35, 0.07, 0.06), M.blackGloss, 0.83, -1.2, 0.09, g);
  // M.2 connector & standoff
  mesh(boxG(0.06, 0.22, 0.05), M.blackGloss, -0.08, -0.3, 0.085, g);
  mesh(cylG(0.03, 0.03, 0.03, 8), M.gold, 0.78, -0.3, 0.075, g, { rx: Math.PI / 2 });
  // chipset heatsink
  const chip = texMat('chipset', () => T.logoCanvas(512, 128, { text: true }), { metalness: 0.8, roughness: 0.3, color: '#9aa3b5' });
  mesh(rboxG(0.66, 0.42, 0.08, 0.02), M.aluDark, 0.62, -1.3, 0.1, g);
  mesh(planeG(0.6, 0.15), chip, 0.62, -1.3, 0.141, g, { cast: false });
  // power connectors
  mesh(boxG(0.13, 0.5, 0.12), M.plastic, -1.2, 0.3, 0.12, g);
  mesh(boxG(0.28, 0.11, 0.12), M.plastic, -0.75, 1.45, 0.12, g);
  // capacitors
  for (let i = 0; i < 5; i++) mesh(cylG(0.035, 0.035, 0.1, 10), M.darkMetal, 0.75 + i * 0.09, 1.38, 0.11, g, { rx: Math.PI / 2 });
  // screw holes & screws
  const screws = [];
  for (const [x, y] of MB_SCREWS) {
    mesh(cylG(0.09, 0.09, 0.005, 16), M.gold, x, y, 0.062, g, { rx: Math.PI / 2, cast: false });
    const s = buildScrew();
    s.position.set(x, y, 0.06);
    g.add(s);
    screws.push(s);
  }
  g.userData.refs = {
    plate, lever, latches, screws,
    port24: new THREE.Vector3(-1.2, 0.3, 0.18),
    port8: new THREE.Vector3(-0.75, 1.45, 0.18),
  };
  return g;
}

// ---------------------------------------------------------------------------
// CPU
// ---------------------------------------------------------------------------
export function buildCPU(spec) {
  const g = new THREE.Group();
  mesh(boxG(0.52, 0.52, 0.03), M.ramPcb, 0, 0, 0.015, g);
  const top = texMat('cpu' + spec.id, () => T.textCanvas(256, 256, (ctx) => {
    const gr = ctx.createLinearGradient(0, 0, 256, 256);
    gr.addColorStop(0, '#e9ecf1');
    gr.addColorStop(1, '#aeb4bf');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = spec.color;
    ctx.beginPath();
    ctx.moveTo(0, 256);
    ctx.lineTo(70, 256);
    ctx.lineTo(0, 186);
    ctx.fill();
    ctx.fillStyle = '#2a2f3a';
    ctx.font = T.font(800, 46);
    ctx.textAlign = 'center';
    ctx.fillText(spec.name.toUpperCase(), 128, 120);
    ctx.font = T.font(600, 20);
    ctx.fillText(spec.spec.toUpperCase(), 128, 155);
    ctx.font = T.font(700, 16);
    ctx.fillText('ANDROMEDA SILICON', 128, 40);
  }), { metalness: 0.75, roughness: 0.3 });
  mesh(boxG(0.44, 0.44, 0.03), [M.silver, M.silver, M.silver, M.silver, top, M.silver], 0, 0, 0.045, g);
  return g;
}

// ---------------------------------------------------------------------------
// Coolers
// ---------------------------------------------------------------------------
const logoTopMat = () => texMat('logoTop', () => T.textCanvas(512, 512, (ctx) => {
  ctx.fillStyle = '#121318';
  ctx.fillRect(0, 0, 512, 512);
  T.drawGalaxy(ctx, 256, 230, 170, { dots: 600 });
  ctx.fillStyle = '#e5e7eb';
  ctx.font = T.font(800, 48);
  ctx.textAlign = 'center';
  ctx.fillText('ANDROMEDA', 256, 440);
}), { metalness: 0.4, roughness: 0.35 });

export function buildCooler(spec) {
  const g = new THREE.Group();
  if (spec.kind === 'stock') {
    mesh(cylG(0.36, 0.36, 0.08, 32), M.copper, 0, 0, 0.04, g, { rx: Math.PI / 2 });
    const finsGeo = G('stockfins', () => {
      const parts = [];
      for (let i = 0; i < 18; i++) {
        const b = new THREE.BoxGeometry(0.34, 0.025, 0.22);
        b.translate(0.2, 0, 0);
        b.rotateZ((i / 18) * Math.PI * 2);
        b.translate(0, 0, 0.2);
        parts.push(b);
      }
      return mergeGeometries(parts);
    });
    mesh(finsGeo, M.alu, 0, 0, 0, g);
    const f = buildFan(0.78, 0.12, M.fan, M.rgbIdle, false);
    f.position.z = 0.38;
    g.add(f);
  } else if (spec.kind === 'tower') {
    mesh(boxG(0.46, 0.46, 0.08), M.copper, 0, 0, 0.04, g);
    for (const hx of [-0.18, -0.06, 0.06, 0.18]) mesh(cylG(0.03, 0.03, 1.2, 10), M.copper, hx, 0, 0.68, g, { rx: Math.PI / 2 });
    const finGeo = boxG(0.58, 1.12, 0.014);
    const fins = new THREE.InstancedMesh(finGeo, M.alu, 26);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 26; i++) {
      m4.makeTranslation(0, 0, 0.22 + i * 0.039);
      fins.setMatrixAt(i, m4);
    }
    fins.castShadow = fins.receiveShadow = true;
    g.add(fins);
    const top = logoTopMat();
    mesh(rboxG(0.62, 1.16, 0.06, 0.02), M.blackGloss, 0, 0, 1.25, g);
    mesh(planeG(0.5, 0.5), top, 0, 0.15, 1.282, g, { cast: false });
    mesh(boxG(0.62, 0.03, 0.03), M.rgbIdle, 0, -0.5, 1.285, g, { cast: false });
    const f = buildFan(1.06, 0.22, M.fan, M.rgbIdle);
    f.position.set(-0.42, 0, 0.72);
    f.rotation.y = Math.PI / 2;
    g.add(f);
  } else {
    // AIO liquid cooler: pump on the CPU, radiator under the roof of the case
    mesh(cylG(0.32, 0.32, 0.22, 36), M.blackGloss, 0, 0, 0.11, g, { rx: Math.PI / 2 });
    const cap = texMat('pumpcap', () => T.textCanvas(512, 512, (ctx) => {
      const gr = ctx.createRadialGradient(256, 256, 20, 256, 256, 256);
      gr.addColorStop(0, '#1d1640');
      gr.addColorStop(1, '#07060f');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, 512, 512);
      T.drawGalaxy(ctx, 256, 256, 200, { dots: 900 });
    }), { emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.25, roughness: 0.15 });
    cap.emissiveMap = cap.map;
    const capM = mesh(cylG(0.28, 0.28, 0.02, 36), cap, 0, 0, 0.23, g, { rx: Math.PI / 2 });
    capM.rotation.y = Math.PI / 2;
    mesh(torG(0.3, 0.022), M.rgbIdle, 0, 0, 0.225, g, { cast: false });
    const len = spec.len;
    const radX = spec.fans === 3 ? 0 : 0.3;
    const rad = new THREE.Group();
    rad.position.set(radX - 1.15, 1.22, 0.96); // relative to pump (CPU at case 1.15, 3.5)
    g.add(rad);
    const radTex = cmat('radtex', () => std({ map: T.radiatorTexture(), roughness: 0.6, metalness: 0.5 }));
    mesh(boxG(len - 0.24, 0.2, 1.15), [M.black, M.black, M.black, radTex, radTex, M.black], 0, 0, 0, rad);
    mesh(rboxG(0.13, 0.26, 1.2, 0.02), M.blackGloss, -len / 2 + 0.06, 0, 0, rad);
    mesh(rboxG(0.13, 0.26, 1.2, 0.02), M.blackGloss, len / 2 - 0.06, 0, 0, rad);
    for (let i = 0; i < spec.fans; i++) {
      const f = buildFan(1.1, 0.22, M.fan, M.rgbIdle);
      f.position.set((i - (spec.fans - 1) / 2) * 1.14, -0.21, 0);
      f.rotation.x = Math.PI / 2;
      rad.add(f);
    }
    // tubes
    const tankX = rad.position.x + len / 2 - 0.06;
    for (const [ox, oz] of [[-0.12, 0.08], [0.12, -0.04]]) {
      const tubeGeo = G(`tube${spec.id}${ox}`, () => {
        const pts = [
          new THREE.Vector3(ox, 0.2, 0.12 + oz * 0.2),
          new THREE.Vector3(ox, 0.36, 0.25),
          new THREE.Vector3((ox + tankX) / 2, 0.75, 0.75 + oz),
          new THREE.Vector3(tankX, 0.95, rad.position.z + oz * 3),
          new THREE.Vector3(tankX, 1.09, rad.position.z + oz * 3),
        ];
        return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.045, 10);
      });
      mesh(tubeGeo, M.cable, 0, 0, 0, g);
    }
  }
  return g;
}

// ---------------------------------------------------------------------------
// RAM kit (two sticks)
// ---------------------------------------------------------------------------
export function buildRAM(spec) {
  const g = new THREE.Group();
  const spreader = cmat('ram' + spec.id, () => std({ color: spec.color, roughness: 0.35, metalness: 0.75 }));
  const label = texMat('ramlbl' + spec.id, () => T.textCanvas(512, 96, (ctx) => {
    ctx.fillStyle = spec.color;
    ctx.fillRect(0, 0, 512, 96);
    const light = new THREE.Color(spec.color).getHSL({}).l > 0.5;
    ctx.fillStyle = light ? '#1f2937' : '#f1f5f9';
    ctx.font = T.font(800, 46);
    ctx.textBaseline = 'middle';
    ctx.fillText('STELLAR', 24, 50);
    ctx.font = T.font(700, 40);
    ctx.textAlign = 'right';
    ctx.fillText(spec.short, 490, 50);
  }), { metalness: 0.6, roughness: 0.35 });
  for (const sx of [-0.13, 0.13]) {
    const s = new THREE.Group();
    s.position.x = sx;
    g.add(s);
    mesh(boxG(0.022, 1.25, 0.3), M.ramPcb, 0, 0, 0.15, s);
    mesh(boxG(0.018, 1.28, 0.31), spreader, -0.022, 0, 0.165, s);
    mesh(boxG(0.018, 1.28, 0.31), spreader, 0.022, 0, 0.165, s);
    mesh(boxG(0.064, 1.24, 0.05), M.rgbIdle, 0, 0, 0.345, s, { cast: false });
    mesh(planeG(1.05, 0.19), label, 0.0325, 0, 0.17, s, { cast: false }).rotation.set(0, Math.PI / 2, Math.PI / 2);
  }
  return g;
}

// ---------------------------------------------------------------------------
// M.2 SSD
// ---------------------------------------------------------------------------
export function buildSSD(spec) {
  const g = new THREE.Group();
  const board = cmat('ssdpcb', () => std({ color: '#111827', roughness: 0.55, metalness: 0.2 }));
  mesh(boxG(0.86, 0.22, 0.016), board, 0, 0, 0.008, g);
  mesh(boxG(0.06, 0.18, 0.017), M.gold, -0.41, 0, 0.008, g, { cast: false });
  const lbl = texMat('ssdlbl' + spec.id, () => T.textCanvas(512, 128, (ctx) => {
    ctx.fillStyle = '#0b0c10';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = spec.color;
    ctx.fillRect(0, 0, 18, 128);
    ctx.fillStyle = '#f8fafc';
    ctx.font = T.font(800, 52);
    ctx.textBaseline = 'middle';
    ctx.fillText('VEGA', 40, 64);
    ctx.fillStyle = spec.color;
    ctx.textAlign = 'right';
    ctx.fillText(spec.short, 495, 64);
  }), { roughness: 0.5 });
  if (spec.heatsink) {
    mesh(rboxG(0.78, 0.24, 0.09, 0.02), M.aluDark, 0.02, 0, 0.06, g);
    for (let i = 0; i < 6; i++) mesh(boxG(0.7, 0.012, 0.02), M.darkMetal, 0.02, -0.09 + i * 0.036, 0.105, g, { cast: false });
    mesh(planeG(0.5, 0.12), lbl, 0.02, 0, 0.117, g, { cast: false });
  } else {
    mesh(boxG(0.22, 0.17, 0.02), M.chip, -0.2, 0, 0.026, g);
    mesh(boxG(0.22, 0.17, 0.02), M.chip, 0.08, 0, 0.026, g);
    mesh(planeG(0.66, 0.17), lbl, -0.04, 0, 0.0375, g, { cast: false });
  }
  const s = buildScrew();
  s.scale.setScalar(0.75);
  s.position.set(0.43, 0, 0.016);
  g.add(s);
  g.userData.refs = { screw: s };
  return g;
}

// ---------------------------------------------------------------------------
// GPU
// ---------------------------------------------------------------------------
export function buildGPU(spec) {
  const g = new THREE.Group();
  const L = spec.len, Tk = spec.thick;
  const cx = 0.83 - L / 2;
  const shroud = cmat('gpushroud' + spec.id, () => phys({ color: spec.body, roughness: 0.32, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.15 }));
  const accent = cmat('gpuaccent' + spec.id, () => std({ color: spec.accent, roughness: 0.3, metalness: 0.6 }));
  mesh(boxG(L - 0.05, 0.03, 1.15), M.ramPcb, cx, 0, 0.6, g);
  mesh(boxG(0.5, 0.03, 0.08), M.gold, 0.3, 0, 0.02, g, { cast: false });
  const back = texMat('gpuback' + spec.id, () => T.textCanvas(1024, 384, (ctx) => {
    ctx.fillStyle = '#16171c';
    ctx.fillRect(0, 0, 1024, 384);
    ctx.strokeStyle = spec.accent;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 4;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 80, 384);
      ctx.lineTo(260 + i * 80, 0);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    T.drawGalaxy(ctx, 620, 190, 110, { dots: 400 });
    ctx.fillStyle = '#e5e7eb';
    ctx.font = T.font(800, 56);
    ctx.fillText(spec.name.toUpperCase(), 700, 210);
  }), { metalness: 0.7, roughness: 0.35 });
  mesh(boxG(L - 0.08, 0.025, 1.13), [M.darkMetal, M.darkMetal, back, M.darkMetal, M.darkMetal, M.darkMetal], cx, 0.03, 0.6, g);
  const sh = mesh(rboxG(L - 0.06, Tk, 1.2, 0.05), shroud, cx, -Tk / 2 - 0.02, 0.62, g);
  sh.userData.gpuShroud = true;
  // angular armour plates
  const plate = (x, w, ang) => mesh(boxG(w, Tk * 0.18, 0.04), accent, x, -Tk * 0.86, 1.245, g, { rz: ang, cast: false });
  plate(cx - L * 0.32, L * 0.22, 0.22);
  plate(cx + L * 0.3, L * 0.18, -0.22);
  if (spec.legendary) {
    mesh(boxG(L - 0.1, 0.03, 0.03), M.legend, cx, -0.01, 1.24, g, { cast: false });
    mesh(boxG(L - 0.1, 0.03, 0.03), M.legend, cx, -Tk - 0.03, 1.24, g, { cast: false });
  }
  // accent stripes along the side facing the glass
  mesh(boxG(L - 0.2, 0.05, 0.02), accent, cx, -Tk * 0.85, 1.225, g, { cast: false });
  mesh(boxG(L * 0.55, 0.04, 0.02), M.rgbIdle, cx - L * 0.12, -Tk * 0.25, 1.225, g, { cast: false });
  const side = texMat('gpuside' + spec.id, () => T.textCanvas(512, 96, (ctx) => {
    ctx.clearRect(0, 0, 512, 96);
    ctx.fillStyle = '#f1f5f9';
    ctx.font = T.font(800, 54);
    ctx.textBaseline = 'middle';
    ctx.fillText(spec.name.toUpperCase(), 10, 50);
  }), { transparent: true, roughness: 0.4, emissive: new THREE.Color('#fff'), emissiveIntensity: 0.15 });
  side.emissiveMap = side.map;
  mesh(planeG(1.1, 0.2), side, cx + L * 0.18, -Tk * 0.52, 1.224, g, { cast: false });
  const fanSize = spec.fans === 3 ? 0.84 : Math.min(1.0, (L - 0.3) / 2);
  for (let i = 0; i < spec.fans; i++) {
    const f = buildFan(fanSize, 0.12, M.fan, M.rgbIdle, false);
    f.position.set(cx + (i - (spec.fans - 1) / 2) * (fanSize + 0.06), -Tk - 0.02 + 0.06, 0.62);
    f.rotation.x = Math.PI / 2;
    g.add(f);
  }
  // bracket
  mesh(boxG(0.03, Tk + 0.2, 1.28), M.silver, 0.85, -Tk / 2 + 0.06, 0.62, g);
  mesh(boxG(0.14, 0.03, 0.3), M.silver, 0.79, 0.11, 0.98, g);
  // power socket on the glass-facing side
  const portX = 0.83 - L * 0.42;
  mesh(boxG(0.34, 0.16, 0.06), M.blackGloss, portX, -Tk * 0.55, 1.235, g);
  const s = buildScrew();
  s.position.set(0.79, 0.125, 0.98);
  s.rotation.x = -Math.PI / 2;
  g.add(s);
  g.userData.refs = { screw: s, port: new THREE.Vector3(portX, -Tk * 0.55, 1.27) };
  return g;
}

// ---------------------------------------------------------------------------
// PSU
// ---------------------------------------------------------------------------
export function buildPSU(spec) {
  const g = new THREE.Group();
  const lbl = texMat('psulbl' + spec.id, () => T.textCanvas(512, 288, (ctx) => {
    ctx.fillStyle = '#121318';
    ctx.fillRect(0, 0, 512, 288);
    ctx.fillStyle = spec.color;
    ctx.fillRect(0, 230, 512, 58);
    T.drawGalaxy(ctx, 80, 90, 60, { dots: 240 });
    ctx.fillStyle = '#f8fafc';
    ctx.font = T.font(800, 56);
    ctx.fillText('PHOTON', 160, 100);
    ctx.font = T.font(800, 64);
    ctx.fillStyle = spec.color;
    ctx.fillText(spec.short, 160, 180);
    ctx.fillStyle = '#111';
    ctx.font = T.font(800, 34);
    ctx.fillText(spec.spec.toUpperCase(), 24, 270);
  }), { roughness: 0.5 });
  mesh(rboxG(1.6, 0.85, 1.6, 0.05), M.black, 0, 0.425, 0, g);
  mesh(planeG(1.2, 0.68), lbl, 0, 0.43, 0.802, g, { cast: false });
  for (let i = 0; i < 3; i++) mesh(boxG(0.02, 0.14, 0.3), M.blackGloss, -0.81, 0.25 + i * 0.2, 0.25, g);
  const grill = cmat('psugrill', () => std({ color: '#050507', roughness: 0.6, alphaMap: T.grilleTexture(), transparent: true }));
  mesh(planeG(1.3, 1.3), grill, 0, 0.852, 0, g, { rx: -Math.PI / 2, cast: false });
  return g;
}

export function buildPart(spec) {
  switch (spec.cat) {
    case 'mb': return buildMB();
    case 'cpu': return buildCPU(spec);
    case 'cooler': return buildCooler(spec);
    case 'ram': return buildRAM(spec);
    case 'ssd': return buildSSD(spec);
    case 'gpu': return buildGPU(spec);
    case 'psu': return buildPSU(spec);
  }
}

// ---------------------------------------------------------------------------
// Cables (grow-in animation via drawRange)
// ---------------------------------------------------------------------------
export function buildCable(points, strands, offset, radius = 0.035, mat = M.cable) {
  const g = new THREE.Group();
  const tubes = [];
  strands.forEach((k) => {
    const pts = points.map((p) => p.clone().addScaledVector(offset, k));
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, radius, 8);
    const m = mesh(geo, mat, 0, 0, 0, g);
    tubes.push(m);
  });
  const end = points[points.length - 1];
  const plug = new THREE.Group();
  plug.position.copy(end);
  g.add(plug);
  const span = Math.max(...strands) - Math.min(...strands);
  const pw = Math.abs(offset.x) * span + 0.12;
  const ph = Math.abs(offset.y) * span + 0.12;
  mesh(boxG(pw, ph, 0.1), M.plastic, 0, 0, 0.0, plug);
  g.userData.tubes = tubes;
  g.userData.plug = plug;
  return g;
}

export function setCableGrowth(cable, f) {
  for (const m of cable.userData.tubes) {
    const count = m.geometry.index.count;
    const n = Math.floor((count * f) / 6) * 6;
    m.geometry.setDrawRange(0, n);
  }
  cable.userData.plug.visible = f > 0.97;
}

// ---------------------------------------------------------------------------
// Shipping box, foam, accessories
// ---------------------------------------------------------------------------
export const BOX = { W: 5.1, H: 6.0, D: 3.1 };
export const FOAM_HOLES = {
  keyboard: { x: -0.55, z: 0.72, w: 3.1, d: 0.95 },
  mouse: { x: 1.75, z: 0.72, w: 0.82, d: 0.95 },
  kit: { x: -1.35, z: -0.72, w: 1.5, d: 0.95 },
  card: { x: 0.35, z: -0.72, w: 1.3, d: 0.85 },
};

export function buildBox() {
  const g = new THREE.Group();
  const { W, H, D } = BOX;
  const t = 0.05;
  const C = M.cardboard, P = M.cardboardPrint, I = M.cardboardInner;
  mesh(boxG(W, t, D), [C, C, I, C, C, C], 0, t / 2, 0, g);
  mesh(boxG(W, H, t), [C, C, C, C, P, I], 0, H / 2, D / 2 - t / 2, g);
  mesh(boxG(W, H, t), [C, C, C, C, I, P], 0, H / 2, -D / 2 + t / 2, g);
  mesh(boxG(t, H, D - 2 * t), [C, I, C, C, C, C], W / 2 - t / 2, H / 2, 0, g);
  mesh(boxG(t, H, D - 2 * t), [I, C, C, C, C, C], -W / 2 + t / 2, H / 2, 0, g);
  // bottom foam
  for (const fx of [-1.85, 0, 1.85]) mesh(boxG(fx === 0 ? 0.9 : 1.2, 0.35, D - 0.14), M.foam, fx, 0.05 + 0.175, 0, g);
  // flaps
  const flaps = [];
  const mk = (kind, hx, hz, w, d, mx, mz, axis, open) => {
    const piv = new THREE.Group();
    piv.position.set(hx, kind === 'long' ? H + 0.045 : H + 0.02, hz);
    g.add(piv);
    mesh(boxG(w, 0.04, d), [C, C, C, I, C, C], mx, 0, mz, piv);
    piv.rotation[axis] = open;
    flaps.push({ piv, kind, axis, open, closed: 0, done: false });
    return piv;
  };
  mk('short', -W / 2 + 0.02, 0, 1.55, D - 0.1, 0.775, 0, 'z', 2.35);
  mk('short', W / 2 - 0.02, 0, 1.55, D - 0.1, -0.775, 0, 'z', -2.35);
  mk('long', 0, -D / 2 + 0.02, W - 0.02, 1.55, 0, 0.775, 'x', -2.35);
  mk('long', 0, D / 2 - 0.02, W - 0.02, 1.55, 0, -0.775, 'x', 2.35);
  g.userData.flaps = flaps;
  return g;
}

export function buildTopFoam() {
  const geo = G('topfoam', () => {
    const w = 4.9, d = 2.9;
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, -d / 2);
    shape.lineTo(w / 2, -d / 2);
    shape.lineTo(w / 2, d / 2);
    shape.lineTo(-w / 2, d / 2);
    shape.closePath();
    for (const h of Object.values(FOAM_HOLES)) {
      const p = new THREE.Path();
      const x0 = h.x - h.w / 2, x1 = h.x + h.w / 2, y0 = -h.z - h.d / 2, y1 = -h.z + h.d / 2;
      p.moveTo(x0, y0);
      p.lineTo(x0, y1);
      p.lineTo(x1, y1);
      p.lineTo(x1, y0);
      p.closePath();
      shape.holes.push(p);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    return geo;
  });
  const g = new THREE.Group();
  mesh(geo, M.foam, 0, 0, 0, g);
  return g;
}

export function buildAccessory(kind) {
  const g = new THREE.Group();
  if (kind === 'kit') {
    const top = texMat('kittop', () => T.textCanvas(512, 320, (ctx) => {
      ctx.fillStyle = '#f4f4f7';
      ctx.fillRect(0, 0, 512, 320);
      T.drawGalaxy(ctx, 110, 150, 80, { dots: 300 });
      ctx.fillStyle = '#2a1e5c';
      ctx.font = T.font(800, 46);
      ctx.fillText('ACCESSORY', 210, 130);
      ctx.fillText('KIT', 210, 185);
      ctx.font = T.font(600, 22);
      ctx.fillText('Power cable · Quick-start guide', 30, 280);
    }), { roughness: 0.6 });
    mesh(rboxG(1.4, 0.4, 0.85, 0.03), M.plasticWhite, 0, 0.2, 0, g);
    mesh(planeG(1.32, 0.8), top, 0, 0.402, 0, g, { rx: -Math.PI / 2, cast: false });
  } else if (kind === 'keyboard') {
    const top = texMat('kbtop', () => T.textCanvas(1024, 300, (ctx) => {
      ctx.fillStyle = '#15161c';
      ctx.fillRect(0, 0, 1024, 300);
      ctx.fillStyle = '#2b2d36';
      for (let r = 0; r < 5; r++) for (let c = 0; c < 18; c++) {
        ctx.fillStyle = (r + c) % 7 === 0 ? '#7c5cf0' : '#2d3039';
        T.roundRect(ctx, 40 + c * 52, 40 + r * 44, 44, 36, 6);
        ctx.fill();
      }
      ctx.fillStyle = '#c4b5fd';
      ctx.font = T.font(800, 34);
      ctx.fillText('ANDROMEDA K1', 40, 285);
    }), { roughness: 0.5 });
    mesh(rboxG(3.0, 0.3, 0.88, 0.03), M.plastic, 0, 0.15, 0, g);
    mesh(planeG(2.92, 0.84), top, 0, 0.302, 0, g, { rx: -Math.PI / 2, cast: false });
  } else if (kind === 'mouse') {
    const top = texMat('mousetop', () => T.textCanvas(256, 320, (ctx) => {
      ctx.fillStyle = '#15161c';
      ctx.fillRect(0, 0, 256, 320);
      ctx.fillStyle = '#2f3240';
      ctx.beginPath();
      ctx.ellipse(128, 150, 70, 110, 0, 0, 7);
      ctx.fill();
      ctx.strokeStyle = '#7c5cf0';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(128, 45);
      ctx.lineTo(128, 130);
      ctx.stroke();
      ctx.fillStyle = '#c4b5fd';
      ctx.font = T.font(800, 30);
      ctx.textAlign = 'center';
      ctx.fillText('M1', 128, 300);
    }), { roughness: 0.5 });
    mesh(rboxG(0.7, 0.4, 0.88, 0.03), M.plastic, 0, 0.2, 0, g);
    mesh(planeG(0.64, 0.84), top, 0, 0.402, 0, g, { rx: -Math.PI / 2, cast: false });
  } else if (kind === 'card') {
    const top = texMat('cardtop', () => T.textCanvas(512, 352, (ctx) => {
      const gr = ctx.createLinearGradient(0, 0, 512, 352);
      gr.addColorStop(0, '#1e1442');
      gr.addColorStop(1, '#0d1a3a');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, 512, 352);
      T.drawGalaxy(ctx, 380, 120, 110, { dots: 500 });
      ctx.fillStyle = '#fef3c7';
      ctx.font = 'italic 700 64px Georgia, serif';
      ctx.fillText('Thank you!', 30, 230);
      ctx.font = T.font(500, 22);
      ctx.fillStyle = '#ddd6fe';
      ctx.fillText('Built with care by your Andromeda builder.', 30, 290);
    }), { roughness: 0.6 });
    mesh(boxG(1.1, 0.025, 0.75), [M.plasticWhite, M.plasticWhite, top, M.plasticWhite, M.plasticWhite, M.plasticWhite], 0, 0.0125, 0, g);
  }
  return g;
}

export function buildTapeGun() {
  const g = new THREE.Group();
  const body = cmat('tapegun', () => std({ color: '#ef4444', roughness: 0.45, metalness: 0.1 }));
  mesh(cylG(0.24, 0.24, 0.46, 24), M.tape, 0, 0.3, 0, g, { rx: Math.PI / 2 });
  mesh(cylG(0.12, 0.12, 0.5, 16), body, 0, 0.3, 0, g, { rx: Math.PI / 2 });
  mesh(rboxG(0.12, 0.6, 0.12, 0.03), body, 0.25, 0.65, 0, g, { rz: -0.5 });
  mesh(boxG(0.32, 0.04, 0.5), M.darkMetal, -0.18, 0.08, 0, g);
  return g;
}

export function labelCanvas(order) {
  return T.textCanvas(640, 420, (ctx) => {
    ctx.fillStyle = '#fbfaf6';
    ctx.fillRect(0, 0, 640, 420);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, 624, 404);
    T.drawGalaxy(ctx, 70, 62, 44, { colA: '#111', colB: '#111', glow: false, dots: 220 });
    ctx.fillStyle = '#111';
    ctx.font = T.font(800, 34);
    ctx.fillText('ANDROMEDA INSIGHTS', 130, 58);
    ctx.font = T.font(500, 18);
    ctx.fillText('PRIORITY · HANDLE WITH CARE', 132, 86);
    ctx.fillRect(8, 110, 624, 3);
    ctx.font = T.font(600, 20);
    ctx.fillText('SHIP TO', 28, 145);
    ctx.font = T.font(800, 40);
    ctx.fillText(order.customer.toUpperCase(), 28, 192);
    ctx.font = T.font(500, 26);
    ctx.fillText(order.address, 28, 230);
    ctx.fillText(order.city.toUpperCase(), 28, 264);
    ctx.font = T.font(800, 26);
    ctx.fillText('ORDER ' + order.no, 420, 145);
    T.barcode(ctx, 28, 290, 584, 90, order.seed || 3);
    ctx.font = T.font(600, 16);
    ctx.fillText(`*${order.no}*  ${order.tierName.toUpperCase()}  BUILD`, 28, 402);
  });
}

export function buildLabelPrinter() {
  const g = new THREE.Group();
  mesh(rboxG(1.0, 0.55, 0.9, 0.08), M.plasticWhite, 0, 0.275, 0, g);
  mesh(boxG(0.8, 0.03, 0.05), M.chip, 0, 0.44, 0.45, g);
  const scr = cmat('printerscr', () => std({ color: '#0b1220', emissive: new THREE.Color('#38bdf8'), emissiveIntensity: 0.6 }));
  mesh(boxG(0.3, 0.02, 0.18), scr, 0.2, 0.555, -0.2, g, { cast: false });
  return g;
}

export function buildShipButton() {
  const g = new THREE.Group();
  mesh(cylG(0.25, 0.32, 0.12, 24), M.darkMetal, 0, 0.06, 0, g);
  mesh(cylG(0.08, 0.08, 0.9, 12), M.darkMetal, 0, 0.55, 0, g);
  mesh(rboxG(0.6, 0.25, 0.6, 0.06), M.black, 0, 1.08, 0, g);
  const cap = new THREE.Group();
  cap.position.y = 1.2;
  g.add(cap);
  mesh(cylG(0.24, 0.26, 0.14, 28), M.redBtn, 0, 0.07, 0, cap);
  g.userData.cap = cap;
  return g;
}

// ---------------------------------------------------------------------------
// Thermal paste blob & launch pod
// ---------------------------------------------------------------------------
export function buildPasteBlob() {
  const m = new THREE.Mesh(G('paste', () => new THREE.SphereGeometry(0.1, 20, 12)), M.paste);
  m.scale.set(1, 1, 0.45);
  return m;
}

export function buildPod() {
  const g = new THREE.Group();
  const hull = cmat('podhull', () => phys({ color: '#e8ebf1', roughness: 0.3, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.1 }));
  const body = mesh(G('podbody', () => new THREE.CapsuleGeometry(0.9, 2.2, 8, 20)), hull, 0, 0, 0, g);
  body.rotation.z = Math.PI / 2;
  const stripe = cmat('podstripe', () => std({ color: '#111', emissive: new THREE.Color('#8b5cf6'), emissiveIntensity: 2.2 }));
  mesh(torG(0.92, 0.05, 40), stripe, 0.6, 0, 0, g, { ry: Math.PI / 2, cast: false });
  mesh(torG(0.92, 0.05, 40), stripe, -0.6, 0, 0, g, { ry: Math.PI / 2, cast: false });
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Group();
    fin.rotation.x = (i / 4) * Math.PI * 2;
    fin.position.x = -1.3;
    g.add(fin);
    mesh(boxG(0.8, 0.05, 0.6), M.darkMetal, 0, 0, 0.95, fin);
  }
  const glow = cmat('podglow', () => basic({ color: '#7dd3fc', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  const flame = mesh(G('podflame', () => new THREE.ConeGeometry(0.55, 2.6, 20, 1, true)), glow, -2.9, 0, 0, g, { rz: Math.PI / 2, cast: false });
  g.userData.flame = flame;
  return g;
}
