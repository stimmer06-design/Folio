// Forge-7 deck expansion: the walkable station beyond the assembly bay.
// Units: in walk mode 1 unit ≈ 21 cm (eye height 7.6 units, ceiling 15.5 units ≈ 3.2 m).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as T from './textures.js';
import { M, mesh, std, phys, buildPod, buildTapeGun, buildLabelPrinter, buildFan } from './models.js';
import { holoMaterial, U } from './shaders.js';
import { buildDecor } from './decor.js';
import { UPGRADES, THEMES, DECOR, ACHIEVEMENTS } from './catalog.js';
import { audio } from './audio.js';

export const FY = -4; // floor
export const CY = 11.5; // ceiling
const DOOR_TOP = 6;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const rbox = (w, h, d, r = 0.06) => new RoundedBoxGeometry(w, h, d, 2, r);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

export const ROOMS = [
  { id: 'bay', name: 'Assembly Bay', sub: 'Build · test · ship', x0: -22.6, z0: -3.4, x1: 13.5, z1: 16 },
  { id: 'corridor', name: 'Spine Corridor', sub: 'Deck 3', x0: 13.5, z0: 4, x1: 44, z1: 12 },
  { id: 'shop', name: 'Orbital Outfitters', sub: 'Tools · lighting · upgrades', x0: 14, z0: -12, x1: 29, z1: 4 },
  { id: 'observatory', name: 'Observatory', sub: 'Deep-space array · telescope', x0: 29, z0: -12, x1: 44, z1: 4 },
  { id: 'lounge', name: 'Crew Lounge', sub: 'Arcade · jukebox · trophies', x0: 14, z0: 12, x1: 29, z1: 28 },
  { id: 'core', name: 'ORIN Core', sub: 'Foreman intelligence · archive', x0: 29, z0: 12, x1: 44, z1: 28 },
  { id: 'hangar', name: 'Launch Hangar', sub: 'Pods · Sol shipment map', x0: 44, z0: -12, x1: 66, z1: 28 },
];
export function roomAt(x, z) {
  // corridor first (it overlaps the bay boundary at x 13.5)
  for (const id of ['corridor', 'shop', 'observatory', 'lounge', 'core', 'hangar', 'bay']) {
    const r = ROOMS.find((q) => q.id === id);
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r;
  }
  return null;
}

// box with world-scaled UVs so the hex panels keep a constant size on every wall
function boxUV(w, h, d, tile = 3.2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i;
    uv.setXY(k, uv.getX(k) * (dims[f][0] / tile), uv.getY(k) * (dims[f][1] / tile));
  }
  return g;
}

function labelTex(lines, { w = 512, h = 160, color = '#22d3ee', big = 64 } = {}) {
  return T.toTex(T.textCanvas(w, h, (ctx) => {
    ctx.clearRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = T.font(700, big);
    ctx.fillText(lines[0], w / 2, lines[1] ? h * 0.38 : h / 2);
    if (lines[1]) {
      ctx.fillStyle = color;
      ctx.font = T.font(700, big * 0.5);
      ctx.fillText(lines[1], w / 2, h * 0.75);
    }
  }));
}
function neon(text, color, w, h, parent, pos, ry = 0) {
  const tex = labelTex([text], { color, big: 92, w: 1024, h: 160 });
  const m = std({ color: '#000', emissive: new THREE.Color(color), emissiveMap: tex, transparent: true, map: tex, emissiveIntensity: 1.6 });
  return mesh(new THREE.PlaneGeometry(w, h), m, pos.x, pos.y, pos.z, parent, { ry, cast: false });
}
function holoLabel(title, sub, color, parent, pos, ry = 0, w = 2.2) {
  const tex = T.toTex(T.holoLabelCanvas(title, sub, color));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.3125), holoMaterial('#ffffff', 1, { map: tex }));
  m.position.copy(pos);
  m.rotation.y = ry;
  m.renderOrder = 30;
  parent.add(m);
  return m;
}

// ---------------------------------------------------------------- characters
export function buildCrew({ suit = '#6d4ad6', trim = '#22d3ee', skin = '#c99a77', hair = '#2b1d14', headset = false, style = 'short', badge = '' }) {
  const g = new THREE.Group();
  const suitM = phys({ color: suit, roughness: 0.5, metalness: 0.15, clearcoat: 0.35, clearcoatRoughness: 0.4 });
  const panelM = phys({ color: new THREE.Color(suit).multiplyScalar(0.55), roughness: 0.6, metalness: 0.3 });
  const trimM = std({ color: '#111', emissive: new THREE.Color(trim), emissiveIntensity: 1.6 });
  const skinM = phys({ color: skin, roughness: 0.6, sheen: 0.25, sheenColor: new THREE.Color(skin).lerp(new THREE.Color('#ffd0b0'), 0.3), sheenRoughness: 0.7 });
  const hairM = phys({ color: hair, roughness: 0.7, sheen: 0.3, sheenColor: new THREE.Color(hair).lerp(new THREE.Color('#ffffff'), 0.1), sheenRoughness: 0.5 });
  const dark = std({ color: '#1a1c24', roughness: 0.6 });
  const bootM = phys({ color: '#14161d', roughness: 0.35, metalness: 0.4, clearcoat: 0.8 });
  const eyeW = std({ color: '#f4f1ec', roughness: 0.25 });
  const iris = phys({ color: '#20140c', roughness: 0.1, clearcoat: 1 });
  // legs + boots
  for (const x of [-0.32, 0.32]) {
    mesh(new THREE.CapsuleGeometry(0.27, 2.2, 6, 12), panelM, x, 1.65, 0, g);
    mesh(rbox(0.5, 0.42, 0.85, 0.14), bootM, x, 0.21, 0.1, g);
    mesh(new THREE.TorusGeometry(0.27, 0.035, 6, 20), trimM, x, 0.5, 0, g, { rx: Math.PI / 2, cast: false });
  }
  const body = new THREE.Group();
  body.position.y = 3.0;
  g.add(body);
  // hips + belt
  mesh(new THREE.CylinderGeometry(0.66, 0.62, 0.5, 24), panelM, 0, 0.05, 0, body).scale.z = 0.72;
  mesh(new THREE.CylinderGeometry(0.69, 0.69, 0.14, 24), dark, 0, 0.3, 0, body).scale.z = 0.74;
  mesh(rbox(0.26, 0.18, 0.08, 0.03), trimM, 0, 0.3, 0.52, body, { cast: false });
  // tapered torso (lathe), flattened front-to-back
  const prof = [[0.0, 0.25], [0.64, 0.25], [0.66, 0.6], [0.6, 1.0], [0.7, 1.45], [0.84, 1.85], [0.74, 2.08], [0.34, 2.22], [0.0, 2.24]].map(([r, y]) => new THREE.Vector2(r, y));
  mesh(new THREE.LatheGeometry(prof, 32), suitM, 0, 0, 0, body).scale.z = 0.7;
  // jacket seam, collar, shoulder plates, chest badge
  mesh(box(0.05, 1.7, 0.04), trimM, 0.12, 1.15, 0.49, body, { rz: 0.05, cast: false });
  mesh(new THREE.TorusGeometry(0.33, 0.09, 10, 28), panelM, 0, 2.16, 0, body, { rx: Math.PI / 2 }).scale.y = 0.8;
  for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.36, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), panelM, s * 0.8, 1.9, 0, body, { rz: -s * 0.5 }).scale.set(1, 0.7, 0.9);
  if (badge) {
    const tex = T.toTex(T.textCanvas(256, 128, (ctx) => {
      ctx.fillStyle = '#0b0d14';
      ctx.fillRect(0, 0, 256, 128);
      ctx.fillStyle = trim;
      ctx.fillRect(0, 0, 12, 128);
      ctx.font = '700 46px Rajdhani, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      ctx.fillText(badge.toUpperCase(), 30, 50);
      ctx.font = '600 22px Rajdhani, sans-serif';
      ctx.fillStyle = trim;
      ctx.fillText('FORGE-7 CREW', 30, 96);
    }));
    mesh(new THREE.PlaneGeometry(0.46, 0.23), std({ map: tex, emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: 0.5, roughness: 0.3 }), -0.32, 1.55, 0.52, body, { ry: -0.18, cast: false });
  }
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 0.9, 1.85, 0);
    body.add(arm);
    mesh(new THREE.CapsuleGeometry(0.21, 0.6, 6, 10), suitM, 0, -0.42, 0, arm);
    const fore = new THREE.Group();
    fore.position.y = -0.9;
    fore.rotation.x = -0.25;
    arm.add(fore);
    mesh(new THREE.CapsuleGeometry(0.19, 0.55, 6, 10), suitM, 0, -0.35, 0, fore);
    mesh(new THREE.TorusGeometry(0.19, 0.035, 6, 18), trimM, 0, -0.68, 0, fore, { rx: Math.PI / 2, cast: false });
    mesh(new THREE.SphereGeometry(0.19, 14, 10), skinM, 0, -0.86, 0.02, fore).scale.set(0.85, 1.15, 0.7);
    arm.rotation.z = s * 0.1;
    body.userData['arm' + s] = arm;
  }
  // head
  const head = new THREE.Group();
  head.position.y = 2.75;
  body.add(head);
  mesh(new THREE.CylinderGeometry(0.19, 0.23, 0.36, 14), skinM, 0, -0.27, 0, head);
  mesh(new THREE.SphereGeometry(0.5, 32, 24), skinM, 0, 0.2, 0, head).scale.set(0.9, 1.08, 0.96);
  for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.1, 10, 8), skinM, s * 0.45, 0.18, 0, head).scale.set(0.5, 1, 0.8); // ears
  mesh(new THREE.SphereGeometry(0.075, 12, 10), skinM, 0, 0.13, 0.48, head).scale.set(0.9, 1.1, 1); // nose
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Group();
    e.position.set(s * 0.17, 0.27, 0.4);
    head.add(e);
    mesh(new THREE.SphereGeometry(0.085, 14, 10), eyeW, 0, 0, 0, e, { cast: false }).scale.set(1.15, 0.85, 0.6);
    mesh(new THREE.SphereGeometry(0.052, 12, 10), iris, 0, -0.005, 0.04, e, { cast: false });
    eyes.push(e);
    mesh(rbox(0.19, 0.045, 0.05, 0.02), hairM, s * 0.17, 0.4, 0.43, head, { rz: -s * 0.12, cast: false }); // brows
  }
  mesh(new THREE.TorusGeometry(0.09, 0.016, 6, 16, Math.PI * 0.8), std({ color: '#5a2b24', roughness: 0.5 }), 0, 0.02, 0.47, head, { rz: Math.PI * 1.1, cast: false }); // smile
  // hair
  const cap = mesh(new THREE.SphereGeometry(0.54, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.52), hairM, 0, 0.24, -0.04, head);
  cap.scale.set(0.95, 1.08, 1.0);
  cap.rotation.x = -0.32;
  if (style === 'bun') {
    mesh(new THREE.SphereGeometry(0.26, 18, 14), hairM, 0, 0.5, -0.5, head);
    mesh(new THREE.TorusGeometry(0.17, 0.035, 6, 18), trimM, 0, 0.44, -0.37, head, { rx: 0.9, cast: false });
    mesh(new THREE.SphereGeometry(0.5, 24, 14, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.3), hairM, 0, 0.2, -0.08, head).scale.set(0.97, 1, 0.9);
  } else {
    // messy fringe + side tufts
    for (let i = 0; i < 6; i++) {
      const a = -0.95 + i * 0.38;
      mesh(new THREE.SphereGeometry(0.17, 12, 10), hairM, Math.sin(a) * 0.36, 0.56 - Math.abs(a) * 0.07, Math.cos(a) * 0.3, head).scale.set(1, 0.65, 0.9);
    }
    for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.2, 12, 10), hairM, s * 0.4, 0.3, -0.12, head).scale.set(0.6, 1.1, 1.1);
  }
  if (headset) {
    mesh(new THREE.TorusGeometry(0.56, 0.045, 8, 24, Math.PI), dark, 0, 0.2, -0.02, head); // band over the top, ear to ear
    for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 16), dark, s * 0.53, 0.18, 0, head, { rz: Math.PI / 2 });
    mesh(new THREE.SphereGeometry(0.07, 10, 8), trimM, 0.6, 0.18, 0, head, { cast: false });
    mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.5, 6), dark, 0.42, 0.0, 0.25, head, { rx: 1.1, rz: 0.5 });
    mesh(new THREE.SphereGeometry(0.045, 8, 6), dark, 0.27, -0.06, 0.45, head);
  }
  g.userData = { body, head, eyes };
  g.scale.setScalar(1.25); // ~1.7 m tall at walk-mode scale
  return g;
}

export function buildPip() {
  const g = new THREE.Group();
  const shell = phys({ color: '#eef2f6', roughness: 0.25, metalness: 0.2, clearcoat: 1 });
  const body = new THREE.Group();
  g.add(body);
  mesh(new THREE.SphereGeometry(1.0, 32, 24), shell, 0, 0, 0, body);
  const [fc, fctx] = T.canvas(256, 128);
  const faceTex = T.toTex(fc);
  const faceM = std({ color: '#000', emissive: new THREE.Color('#ffffff'), emissiveMap: faceTex, emissiveIntensity: 1.4, roughness: 0.2 });
  // partial sphere patch facing +z (phi = π/2 points along +z in three's sphere param)
  mesh(new THREE.SphereGeometry(1.01, 32, 24, Math.PI / 2 - 0.75, 1.5, 1.05, 1.0), faceM, 0, 0, 0, body, { cast: false });
  mesh(new THREE.TorusGeometry(1.02, 0.05, 8, 48), std({ color: '#111', emissive: new THREE.Color('#34d399'), emissiveIntensity: 2 }), 0, -0.2, 0, body, { rx: Math.PI / 2, cast: false });
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 1.05, -0.2, 0.2);
    body.add(arm);
    mesh(new THREE.CapsuleGeometry(0.12, 0.6, 4, 8), shell, s * 0.25, -0.3, 0, arm, { rz: s * 0.6 });
    body.userData['arm' + s] = arm;
  }
  mesh(new THREE.ConeGeometry(0.35, 0.5, 16), M.darkMetal, 0, -1.15, 0, body, { rx: Math.PI });
  let blink = 0;
  const draw = (t, mood = 0) => {
    fctx.fillStyle = '#04110c';
    fctx.fillRect(0, 0, 256, 128);
    fctx.fillStyle = '#34d399';
    const closed = (t % 4) < 0.12;
    for (const x of [96, 160]) {
      if (closed) fctx.fillRect(x - 16, 60, 32, 6);
      else {
        fctx.beginPath();
        fctx.ellipse(x, 62, 13, 20, 0, 0, 7);
        fctx.fill();
      }
    }
    fctx.strokeStyle = '#34d399';
    fctx.lineWidth = 5;
    fctx.beginPath();
    fctx.arc(128, 84, 18 + mood * 4, 0.15 * Math.PI, 0.85 * Math.PI);
    fctx.stroke();
    faceTex.needsUpdate = true;
  };
  draw(0);
  g.userData = { body, head: body, draw, lastDraw: 0 };
  return g;
}

export function buildDrone() {
  const g = new THREE.Group();
  const shell = phys({ color: '#d7dde6', roughness: 0.3, metalness: 0.5, clearcoat: 1 });
  mesh(new THREE.SphereGeometry(0.42, 24, 18), shell, 0, 0, 0, g);
  const eyeM = std({ color: '#001', emissive: new THREE.Color('#22d3ee'), emissiveIntensity: 2.4 });
  mesh(new THREE.SphereGeometry(0.16, 16, 12), eyeM, 0, 0.03, 0.34, g, { cast: false });
  mesh(new THREE.TorusGeometry(0.44, 0.04, 8, 32), M.darkMetal, 0, 0, 0, g, { rx: Math.PI / 2 });
  const rotor = new THREE.Group();
  rotor.position.y = 0.48;
  g.add(rotor);
  mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.15, 6), M.darkMetal, 0, -0.06, 0, rotor);
  mesh(box(0.9, 0.015, 0.08), M.darkMetal, 0, 0, 0, rotor);
  g.userData = { rotor, eyeM };
  return g;
}

// ---------------------------------------------------------------- shop display models
function upgradeModel(id) {
  const g = new THREE.Group();
  const acc = std({ color: '#111', emissive: new THREE.Color('#22d3ee'), emissiveIntensity: 1.8 });
  switch (id) {
    case 'optics':
      mesh(new THREE.TorusGeometry(0.35, 0.07, 10, 24), M.blackGloss, -0.38, 0.4, 0, g);
      mesh(new THREE.TorusGeometry(0.35, 0.07, 10, 24), M.blackGloss, 0.38, 0.4, 0, g);
      mesh(new THREE.CircleGeometry(0.32, 24), holoMaterial('#facc15', 0.7, { scan: 0 }), -0.38, 0.4, 0.01, g);
      mesh(new THREE.CircleGeometry(0.32, 24), holoMaterial('#facc15', 0.7, { scan: 0 }), 0.38, 0.4, 0.01, g);
      break;
    case 'driver':
      mesh(rbox(1.1, 0.32, 0.32, 0.1), phys({ color: '#f59e0b', roughness: 0.4, clearcoat: 0.8 }), 0, 0.3, 0, g);
      mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 8), M.silver, 0.8, 0.3, 0, g, { rz: Math.PI / 2 });
      break;
    case 'pastegun':
      mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.0, 16), M.plasticWhite, 0, 0.35, 0, g, { rz: Math.PI / 2 });
      mesh(new THREE.ConeGeometry(0.12, 0.35, 12), M.silver, 0.65, 0.35, 0, g, { rz: -Math.PI / 2 });
      mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.6, 12), M.paste, -0.1, 0.35, 0, g, { rz: Math.PI / 2 });
      break;
    case 'flapper': {
      const c = M.cardboard;
      mesh(box(0.8, 0.6, 0.6), c, 0, 0.3, 0, g);
      mesh(box(0.8, 0.03, 0.3), c, 0, 0.75, 0.32, g, { rx: 0.9 });
      mesh(box(0.8, 0.03, 0.3), c, 0, 0.75, -0.32, g, { rx: -0.9 });
      break;
    }
    case 'labeler': {
      const p = buildLabelPrinter();
      p.scale.setScalar(0.9);
      g.add(p);
      break;
    }
    case 'tapegun': {
      const t = buildTapeGun();
      t.scale.setScalar(1.2);
      g.add(t);
      break;
    }
    case 'cablecomb':
      mesh(rbox(1.0, 0.15, 0.3, 0.05), M.blackGloss, 0, 0.5, 0, g);
      for (let i = 0; i < 8; i++) mesh(box(0.05, 0.35, 0.08), M.blackGloss, -0.42 + i * 0.12, 0.3, 0, g);
      for (let i = 0; i < 4; i++) mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.2, 8), M.cable, -0.3 + i * 0.2, 0.3, 0.3, g, { rx: Math.PI / 2 });
      break;
    case 'capacitor':
      mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 24), M.aluDark, 0, 0.45, 0, g);
      for (const y of [0.2, 0.45, 0.7]) mesh(new THREE.TorusGeometry(0.31, 0.03, 8, 24), acc, 0, y, 0, g, { rx: Math.PI / 2, cast: false });
      break;
    case 'espresso':
      mesh(rbox(0.6, 0.8, 0.6, 0.06), phys({ color: '#b91c1c', roughness: 0.3, clearcoat: 1 }), 0, 0.4, 0, g);
      mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.16, 12), M.plasticWhite, 0, 0.08, 0.36, g);
      break;
    case 'gloves':
      for (const s of [-1, 1]) {
        mesh(rbox(0.35, 0.12, 0.6, 0.05), std({ color: s < 0 ? '#8b5cf6' : '#22d3ee', roughness: 0.8 }), s * 0.25, 0.1, 0, g, { ry: s * 0.3 });
        mesh(new THREE.TorusGeometry(0.12, 0.03, 6, 16), M.silver, s * 0.25, 0.2, -0.15, g, { rx: Math.PI / 2 });
      }
      break;
    case 'scanner':
      mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.5, 8), M.darkMetal, 0, 0.25, 0, g);
      mesh(new THREE.SphereGeometry(0.5, 24, 12, 0, Math.PI * 2, 0, 0.9), M.alu, 0, 0.75, 0, g, { rx: Math.PI });
      mesh(new THREE.SphereGeometry(0.06, 8, 6), acc, 0, 0.62, 0, g);
      break;
    case 'loyalty': {
      const hm = std({ color: '#300', emissive: new THREE.Color('#ec4899'), emissiveIntensity: 1.8 });
      mesh(new THREE.SphereGeometry(0.26, 16, 12), hm, -0.18, 0.62, 0, g);
      mesh(new THREE.SphereGeometry(0.26, 16, 12), hm, 0.18, 0.62, 0, g);
      mesh(new THREE.ConeGeometry(0.42, 0.55, 4), hm, 0, 0.32, 0, g, { rx: Math.PI, ry: Math.PI / 4 });
      break;
    }
  }
  return g;
}

function arcadeCabinet() {
  const g = new THREE.Group();
  const body = phys({ color: '#1a1030', roughness: 0.4, clearcoat: 0.6 });
  const side = std({ color: '#111', emissive: new THREE.Color('#ec4899'), emissiveIntensity: 1.4 });
  mesh(rbox(2.6, 8.4, 2.4, 0.08), body, 0, 4.2, 0, g);
  for (const x of [-1.31, 1.31]) mesh(box(0.03, 7.6, 0.08), side, x, 4.2, 1.1, g, { cast: false });
  // marquee
  const mq = labelTex(['POD RUNNER', 'FORGE-7 ARCADE'], { color: '#22d3ee', big: 78, w: 512, h: 160 });
  const mqM = std({ color: '#000', emissive: new THREE.Color('#ffffff'), emissiveMap: mq, emissiveIntensity: 1.5, map: mq });
  mesh(new THREE.PlaneGeometry(2.3, 0.72), mqM, 0, 7.75, 1.21, g, { cast: false });
  // screen (attract mode)
  const [sc, sctx] = T.canvas(256, 192);
  const stex = T.toTex(sc);
  const scrM = std({ color: '#000', emissive: new THREE.Color('#ffffff'), emissiveMap: stex, emissiveIntensity: 1.3 });
  const screen = mesh(new THREE.PlaneGeometry(2.0, 1.5), scrM, 0, 5.8, 1.14, g, { rx: -0.18, cast: false });
  // control deck
  mesh(rbox(2.6, 0.3, 1.0, 0.06), body, 0, 4.1, 1.4, g, { rx: 0.3 });
  mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.35, 8), M.silver, -0.5, 4.4, 1.45, g);
  mesh(new THREE.SphereGeometry(0.15, 12, 10), std({ color: '#ef4444', roughness: 0.3 }), -0.5, 4.6, 1.45, g);
  for (const [x, c] of [[0.3, '#22d3ee'], [0.7, '#facc15']]) mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 16), std({ color: '#111', emissive: new THREE.Color(c), emissiveIntensity: 1.6 }), x, 4.3, 1.5, g, { rx: 0.3 });
  const stars = Array.from({ length: 40 }, () => [Math.random() * 256, Math.random() * 192, Math.random() * 2 + 0.5]);
  let last = 0;
  g.userData.update = (t) => {
    if (t - last < 0.08) return;
    last = t;
    sctx.fillStyle = '#05030c';
    sctx.fillRect(0, 0, 256, 192);
    sctx.fillStyle = '#fff';
    for (const s of stars) {
      s[0] -= s[2] * 3;
      if (s[0] < 0) s[0] = 256;
      sctx.fillRect(s[0], s[1], s[2], s[2]);
    }
    const y = 96 + Math.sin(t * 2) * 40;
    sctx.fillStyle = '#22d3ee';
    sctx.beginPath();
    sctx.moveTo(60, y);
    sctx.lineTo(36, y - 10);
    sctx.lineTo(36, y + 10);
    sctx.fill();
    sctx.fillStyle = '#facc15';
    sctx.font = '700 22px Rajdhani, sans-serif';
    sctx.textAlign = 'center';
    if (Math.floor(t * 2) % 2) sctx.fillText('INSERT COIN · PRESS E', 128, 176);
    stex.needsUpdate = true;
  };
  return g;
}

function jukebox() {
  const g = new THREE.Group();
  const body = phys({ color: '#2b1a10', roughness: 0.35, clearcoat: 1 });
  mesh(rbox(3.0, 6.0, 1.8, 0.4), body, 0, 3, 0, g);
  const arch = std({ color: '#111', emissive: new THREE.Color('#f59e0b'), emissiveIntensity: 2 });
  mesh(new THREE.TorusGeometry(1.2, 0.12, 10, 40, Math.PI), arch, 0, 4.2, 0.92, g, { cast: false });
  for (const x of [-1.2, 1.2]) mesh(box(0.24, 2.6, 0.1), arch, x, 2.9, 0.92, g, { cast: false });
  mesh(new THREE.PlaneGeometry(1.8, 1.2), holoMaterial('#f472b6', 0.6), 0, 3.1, 0.95, g);
  mesh(new THREE.CircleGeometry(0.5, 24), M.chip, 0, 1.4, 0.92, g, { cast: false });
  g.userData.update = (t) => arch.emissive.setHSL((t * 0.1) % 1, 0.9, 0.55);
  return g;
}

function telescope() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = mesh(new THREE.CylinderGeometry(0.08, 0.1, 6.0, 8), M.darkMetal, Math.cos(a) * 1.0, 2.8, Math.sin(a) * 1.0, g);
    leg.rotation.set(Math.sin(a) * 0.32, 0, -Math.cos(a) * 0.32);
  }
  const mount = new THREE.Group();
  mount.position.y = 5.8;
  g.add(mount);
  mesh(new THREE.SphereGeometry(0.35, 16, 12), M.darkMetal, 0, 0, 0, mount);
  const tube = new THREE.Group();
  mount.add(tube);
  mesh(new THREE.CylinderGeometry(0.55, 0.45, 4.6, 32), M.plasticWhite, 0, 0.6, 0, tube);
  for (const y of [-1.4, 0.6, 2.7]) mesh(new THREE.TorusGeometry(0.56, 0.06, 8, 32), M.brass, 0, y, 0, tube, { rx: Math.PI / 2 });
  mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.6, 12), M.darkMetal, 0, -1.9, 0, tube);
  g.userData.tube = tube;
  return g;
}

function solMap() {
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(3.2, 3.6, 3.8, 48), M.darkMetal, 0, 1.9, 0, g);
  mesh(new THREE.TorusGeometry(3.2, 0.06, 8, 64), std({ color: '#111', emissive: new THREE.Color('#22d3ee'), emissiveIntensity: 2 }), 0, 3.82, 0, g, { rx: Math.PI / 2, cast: false });
  const holo = new THREE.Group();
  holo.position.y = 5.2;
  g.add(holo);
  const sunM = std({ color: '#200', emissive: new THREE.Color('#fbbf24'), emissiveIntensity: 3 });
  mesh(new THREE.SphereGeometry(0.4, 24, 16), sunM, 0, 0, 0, holo, { cast: false });
  const PL = [
    ['mercury', 0.6, 0.06, '#a8a29e'], ['venus', 0.9, 0.09, '#fcd34d'], ['earth', 1.2, 0.1, '#60a5fa'], ['mars', 1.5, 0.08, '#f87171'],
    ['belt', 1.8, 0.05, '#94a3b8'], ['jupiter', 2.2, 0.2, '#fdba74'], ['saturn', 2.6, 0.17, '#fde68a'], ['neptune', 3.0, 0.12, '#818cf8'],
  ];
  const planets = {};
  for (const [id, r, size, col] of PL) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.006, r + 0.006, 96), holoMaterial('#7dd3fc', 0.35, { scan: 0 }));
    ring.rotation.x = -Math.PI / 2;
    holo.add(ring);
    const piv = new THREE.Group();
    piv.rotation.y = Math.random() * Math.PI * 2;
    holo.add(piv);
    const p = new THREE.Mesh(new THREE.SphereGeometry(size, 16, 12), holoMaterial(col, 1.0, { scan: 0.3 }));
    p.position.x = r;
    piv.add(p);
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), std({ color: '#111', emissive: new THREE.Color('#facc15'), emissiveIntensity: 3 }));
    marker.position.set(r, size + 0.15, 0);
    marker.visible = false;
    piv.add(marker);
    planets[id] = { piv, r, speed: 0.8 / Math.pow(r, 1.4), marker };
  }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.1, 1.6, 48, 1, true), holoMaterial('#22d3ee', 0.18));
  beam.position.y = 4.6;
  g.add(beam);
  g.userData.update = (t) => {
    for (const k in planets) planets[k].piv.rotation.y = t * planets[k].speed + planets[k].r;
  };
  g.userData.planets = planets;
  return g;
}

function screenCanvas(w, h) {
  const [c, ctx] = T.canvas(w, h);
  const tex = T.toTex(c);
  const m = std({ color: '#000', emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: 1.2, roughness: 0.2 });
  return { c, ctx, tex, m };
}

// ---------------------------------------------------------------- the deck
export function buildDeck(env, theme) {
  const { wallM, floorM, steel, frameM, white, ceilM, hz } = env.mats;
  const g = new THREE.Group();
  g.name = 'deck';
  const colliders = [];
  const interact = [];
  const doors = [];
  const npcs = {};
  const updaters = [];
  const accentA = env.accentA, accentB = env.accentB;
  const coll = (x0, z0, x1, z1) => colliders.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) });
  const H = CY - FY, T2 = 0.5;

  // ---- bay boundaries (the bay geometry lives in env.js)
  coll(-24, -4, -22.6, 17);
  coll(-24, -6, 14, -3.4);
  coll(-24, 16, 14, 18);
  coll(13.5, -4, 14.2, 4);
  coll(13.5, 12, 14.2, 18);
  // bay furniture
  coll(-3.7, -2.5, 8.5, 2.45);
  coll(-13.7, -3.0, -3.3, 4.2);
  coll(-22.6, -2.1, -13.6, 1.7);

  // ---- walls with door gaps
  const wallZ = (z, x0, x1, gaps = [], win = null) => {
    let x = x0;
    const segs = [];
    for (const [a, b] of [...gaps, [x1, x1]]) {
      if (a > x) segs.push([x, a]);
      if (b > a) {
        // lintel above the door
        const w = b - a;
        mesh(boxUV(w, CY - DOOR_TOP, T2), wallM, (a + b) / 2, (CY + DOOR_TOP) / 2, z, g, { cast: false });
      }
      x = b;
    }
    for (const [a, b] of segs) {
      if (win && win[0] < b && win[1] > a) {
        // window cut-out inside this segment
        const wa = Math.max(a, win[0]), wb = Math.min(b, win[1]);
        if (wa > a) { mesh(boxUV(wa - a, H, T2), wallM, (a + wa) / 2, (FY + CY) / 2, z, g, { cast: false }); }
        if (b > wb) { mesh(boxUV(b - wb, H, T2), wallM, (wb + b) / 2, (FY + CY) / 2, z, g, { cast: false }); }
        mesh(boxUV(wb - wa, win[2] - FY, T2), wallM, (wa + wb) / 2, (FY + win[2]) / 2, z, g, { cast: false });
        mesh(boxUV(wb - wa, CY - win[3], T2), wallM, (wa + wb) / 2, (win[3] + CY) / 2, z, g, { cast: false });
        windowFrame((wa + wb) / 2, (win[2] + win[3]) / 2, z, wb - wa, win[3] - win[2], 0);
      } else mesh(boxUV(b - a, H, T2), wallM, (a + b) / 2, (FY + CY) / 2, z, g, { cast: false });
      coll(a, z - 0.35, b, z + 0.35);
    }
  };
  const wallX = (x, z0, z1, gaps = [], win = null) => {
    let z = z0;
    const segs = [];
    for (const [a, b] of [...gaps, [z1, z1]]) {
      if (a > z) segs.push([z, a]);
      if (b > a) mesh(boxUV(T2, CY - DOOR_TOP, b - a), wallM, x, (CY + DOOR_TOP) / 2, (a + b) / 2, g, { cast: false });
      z = b;
    }
    for (const [a, b] of segs) {
      if (win && win[0] < b && win[1] > a) {
        const wa = Math.max(a, win[0]), wb = Math.min(b, win[1]);
        if (wa > a) mesh(boxUV(T2, H, wa - a), wallM, x, (FY + CY) / 2, (a + wa) / 2, g, { cast: false });
        if (b > wb) mesh(boxUV(T2, H, b - wb), wallM, x, (FY + CY) / 2, (wb + b) / 2, g, { cast: false });
        mesh(boxUV(T2, win[2] - FY, wb - wa), wallM, x, (FY + win[2]) / 2, (wa + wb) / 2, g, { cast: false });
        mesh(boxUV(T2, CY - win[3], wb - wa), wallM, x, (win[3] + CY) / 2, (wa + wb) / 2, g, { cast: false });
        windowFrame(x, (win[2] + win[3]) / 2, (wa + wb) / 2, wb - wa, win[3] - win[2], Math.PI / 2);
      } else mesh(boxUV(T2, H, b - a), wallM, x, (FY + CY) / 2, (a + b) / 2, g, { cast: false });
      coll(x - 0.35, a, x + 0.35, b);
    }
  };
  const glassM = phys({ color: '#9fb7d8', roughness: 0.05, transparent: true, opacity: 0.06, depthWrite: false, envMapIntensity: 1.4 });
  function windowFrame(cx, cy, cz, w, h, ry) {
    const f = new THREE.Group();
    f.position.set(cx, cy, cz);
    f.rotation.y = ry;
    g.add(f);
    mesh(box(w + 0.4, 0.3, 0.6), frameM, 0, h / 2, 0, f);
    mesh(box(w + 0.4, 0.3, 0.6), frameM, 0, -h / 2, 0, f);
    mesh(box(w, 0.04, 0.04), accentB, 0, -h / 2 + 0.17, 0.3, f, { cast: false });
    for (let i = 1; i < 3; i++) mesh(box(0.14, h, 0.3), frameM, -w / 2 + (w * i) / 3, 0, 0, f);
    mesh(new THREE.PlaneGeometry(w, h), glassM, 0, 0, 0, f, { cast: false });
  }
  const door = (cx, cz, axis, w, parent = g) => {
    const d = { cx, cz, axis, w, open: 0, target: 0, panels: [] };
    const doorM = phys({ color: '#2b303c', roughness: 0.5, metalness: 0.55, clearcoat: 0.15, envMapIntensity: 0.3 });
    for (const s of [-1, 1]) {
      const p = new THREE.Group();
      parent.add(p);
      const pw = w / 2;
      const geo = axis === 'x' ? box(pw, DOOR_TOP - FY, 0.25) : box(0.25, DOOR_TOP - FY, pw);
      mesh(geo, doorM, 0, 0, 0, p);
      const strip = axis === 'x' ? box(0.06, DOOR_TOP - FY - 0.6, 0.27) : box(0.27, DOOR_TOP - FY - 0.6, 0.06);
      mesh(strip, accentB, axis === 'x' ? -s * (pw / 2 - 0.2) : 0, 0, axis === 'x' ? 0 : -s * (pw / 2 - 0.2), p, { cast: false });
      p.userData.s = s;
      d.panels.push(p);
    }
    const place = () => {
      for (const p of d.panels) {
        const off = p.userData.s * (d.w / 4 + d.open * (d.w / 2 - 0.1));
        if (axis === 'x') p.position.set(cx + off, (FY + DOOR_TOP) / 2, cz);
        else p.position.set(cx, (FY + DOOR_TOP) / 2, cz + off);
      }
    };
    d.place = place;
    place();
    doors.push(d);
    return d;
  };
  const floor = (x0, z0, x1, z1, mat = floorM) => mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat, (x0 + x1) / 2, FY + 0.003, (z0 + z1) / 2, g, { rx: -Math.PI / 2, cast: false });
  const panelLight = std({ color: '#111', emissive: new THREE.Color('#fff1dc'), emissiveIntensity: 1.1 });
  const ceiling = (x0, z0, x1, z1) => {
    mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), ceilM, (x0 + x1) / 2, CY, (z0 + z1) / 2, g, { rx: Math.PI / 2, cast: false });
    for (let z = z0 + 3; z < z1 - 1; z += 5) mesh(box(x1 - x0 - 3, 0.05, 0.3), panelLight, (x0 + x1) / 2, CY - 0.05, z, g, { cast: false });
  };

  // corridor
  floor(13.5, 4, 44, 12);
  ceiling(13.5, 4, 44, 12);
  wallZ(4, 14, 44, [[19, 24], [34, 39]]);
  wallZ(12, 14, 44, [[19, 24], [34, 39]]);
  for (let x = 16; x < 44; x += 4) mesh(box(1.2, 0.02, 0.15), accentA, x, FY + 0.01, 8, g, { cast: false });
  mesh(box(30.5, 0.04, 0.04), accentB, 28.75, FY + 0.6, 4.3, g, { cast: false });
  mesh(box(30.5, 0.04, 0.04), accentB, 28.75, FY + 0.6, 11.7, g, { cast: false });
  door(13.75, 8, 'z', 8, env.group); // lives with the bay so it is visible (closed) in work mode
  door(21.5, 4, 'x', 5);
  door(36.5, 4, 'x', 5);
  door(21.5, 12, 'x', 5);
  door(36.5, 12, 'x', 5);
  // door signs (corridor side)
  neon('ORBITAL OUTFITTERS', '#34d399', 5.6, 0.9, g, V3(21.5, 7.3, 4.3));
  neon('OBSERVATORY', '#a78bfa', 4.6, 0.9, g, V3(36.5, 7.3, 4.3));
  neon('CREW LOUNGE', '#f472b6', 4.6, 0.9, g, V3(21.5, 7.3, 11.7), Math.PI);
  neon('ORIN CORE', '#22d3ee', 4.2, 0.9, g, V3(36.5, 7.3, 11.7), Math.PI);
  neon('LAUNCH HANGAR', '#f59e0b', 5.0, 0.9, g, V3(43.7, 7.3, 8), -Math.PI / 2);
  neon('ASSEMBLY BAY', '#8b5cf6', 4.6, 0.9, g, V3(13.9, 7.3, 8), Math.PI / 2);

  // ======================================================== SHOP: Orbital Outfitters
  floor(14, -12, 29, 4);
  ceiling(14, -12, 29, 4);
  wallX(14, -12, 4);
  wallZ(-12, 14, 29);
  wallX(29, -12, 4);
  neon('ORBITAL OUTFITTERS', '#34d399', 7, 1.1, g, V3(21.5, 8.6, -11.7));
  // counter + PIP
  const counterM = phys({ color: '#1d2a26', roughness: 0.35, metalness: 0.4, clearcoat: 0.8 });
  mesh(rbox(9, 3.6, 1.6, 0.1), counterM, 21.5, FY + 1.8, -8.5, g);
  mesh(box(9, 0.05, 0.05), std({ color: '#111', emissive: new THREE.Color('#34d399'), emissiveIntensity: 2 }), 21.5, FY + 3.6, -7.68, g, { cast: false });
  coll(16.9, -9.4, 26.1, -7.6);
  const pip = buildPip();
  pip.position.set(21.5, FY + 5.4, -10.2);
  g.add(pip);
  npcs.pip = pip;
  interact.push({ id: 'pip', action: 'talk', who: 'pip', label: 'Talk to PIP', pos: V3(21.5, 2, -10), r: 7 });
  // upgrade pedestals
  const shopItems = {};
  UPGRADES.forEach((u, i) => {
    const west = i < 6;
    const k = i % 6;
    const x = west ? 15.8 : 27.2, z = -9.5 + k * 2.4;
    mesh(new THREE.CylinderGeometry(0.75, 0.85, 3.2, 24), steel, x, FY + 1.6, z, g);
    const ringM = std({ color: '#111', emissive: new THREE.Color('#34d399'), emissiveIntensity: 1.8 });
    mesh(new THREE.TorusGeometry(0.75, 0.03, 8, 32), ringM, x, FY + 3.21, z, g, { rx: Math.PI / 2, cast: false });
    const model = upgradeModel(u.id);
    model.position.set(x, FY + 3.35, z);
    model.rotation.y = west ? Math.PI / 2 : -Math.PI / 2;
    model.scale.setScalar(1.4);
    g.add(model);
    const lbl = holoLabel(u.name, '◈ ' + u.price, '#34d399', g, V3(x + (west ? 0.9 : -0.9), FY + 6.0, z), west ? Math.PI / 2 : -Math.PI / 2, 2.2);
    coll(x - 0.9, z - 0.9, x + 0.9, z + 0.9);
    shopItems[u.id] = { model, lbl, ringM, base: model.position.y, i };
    interact.push({ id: 'buy-' + u.id, action: 'buy', item: u.id, label: `Inspect ${u.name}`, pos: V3(x, FY + 4, z), r: 5.5 });
  });
  // lighting theme orbs on the back wall
  const themeOrbs = {};
  THEMES.forEach((t, i) => {
    const x = 16.6 + i * 1.62, z = -11.4;
    const orbM = std({ color: '#111', emissive: new THREE.Color(t.a), emissiveIntensity: 2.0 });
    const orb = mesh(new THREE.SphereGeometry(0.45, 24, 16), orbM, x, 5.0, z, g, { cast: false });
    mesh(new THREE.TorusGeometry(0.6, 0.04, 8, 32), std({ color: '#111', emissive: new THREE.Color(t.b), emissiveIntensity: 1.6 }), x, 5.0, z, g, { cast: false });
    themeOrbs[t.id] = { orb, orbM };
    interact.push({ id: 'theme-' + t.id, action: 'theme', theme: t.id, label: `Lighting: ${t.name}`, pos: V3(x, 5.0, z), r: 8 });
  });
  holoLabel('WORKSHOP LIGHTING', 'Light up the whole station', '#a78bfa', g, V3(21.5, 6.6, -11.3), 0, 3.2);

  // ======================================================== OBSERVATORY
  const starTex = T.toTex(T.textCanvas(1024, 1024, (ctx) => {
    ctx.fillStyle = '#0a0c16';
    ctx.fillRect(0, 0, 1024, 1024);
    ctx.strokeStyle = 'rgba(167,139,250,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(512, 512, 460, 0, 7);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(512, 512, 300, 0, 7);
    ctx.stroke();
    const pts = Array.from({ length: 60 }, () => [Math.random() * 1024, Math.random() * 1024]);
    ctx.fillStyle = '#c4b5fd';
    for (const [x, y] of pts) {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, 7);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(196,181,253,0.3)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 30; i++) {
      const a = pts[i], b = pts[i + 1];
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
  }));
  floor(29, -12, 44, 4, std({ map: starTex, roughness: 0.4, metalness: 0.6 }));
  ceiling(29, -12, 44, 4);
  wallZ(-12, 29, 44, [], [30.2, 42.8, -1.5, 9.5]);
  const scope = telescope();
  scope.position.set(36.5, FY, -8.2);
  g.add(scope);
  coll(35.2, -9.5, 37.8, -6.9);
  interact.push({ id: 'telescope', action: 'telescope', label: 'Look through the telescope', pos: V3(36.5, 2, -8.2), r: 6 });
  const sela = buildCrew({ suit: '#4c3a8a', trim: '#a78bfa', skin: '#5e3a26', hair: '#16100c', style: 'bun', badge: 'Dir. Okafor' });
  sela.position.set(31.5, FY, -5.5);
  sela.rotation.y = 0.8;
  g.add(sela);
  npcs.sela = sela;
  coll(30.8, -6.2, 32.2, -4.8);
  interact.push({ id: 'sela', action: 'talk', who: 'sela', label: 'Talk to Director Okafor', pos: V3(31.5, 2.5, -5.5), r: 6 });
  // signal console
  mesh(rbox(3.2, 3.4, 1.4, 0.08), M.blackGloss, 41.8, FY + 1.7, -7.5, g);
  const sig = screenCanvas(512, 256);
  mesh(new THREE.PlaneGeometry(3.0, 1.5), sig.m, 41.8, FY + 4.6, -7.9, g, { rx: -0.3, ry: -0.5, cast: false }).rotation.set(-0.3, -0.5, 0, 'YXZ');
  coll(40.1, -8.3, 43.5, -6.7);
  interact.push({ id: 'signal', action: 'signal', label: 'Signal decode console', pos: V3(41.8, 1, -7.5), r: 5.5 });
  updaters.push((t, ctx) => {
    if (t - (sig.last || 0) < 0.1) return;
    sig.last = t;
    const c = sig.ctx;
    c.fillStyle = '#060714';
    c.fillRect(0, 0, 512, 256);
    c.strokeStyle = '#facc15';
    c.lineWidth = 3;
    c.beginPath();
    for (let x = 0; x < 512; x += 3) c.lineTo(x, 130 + Math.sin(x * 0.05 + t * 3) * 40 * Math.sin(x * 0.011 + t) + Math.sin(x * 0.31) * 6);
    c.stroke();
    c.fillStyle = '#c4b5fd';
    c.font = '700 30px Rajdhani, sans-serif';
    c.fillText(`WHISPER DECODE ${(ctx.signal || 0).toFixed(1)}%`, 16, 36);
    sig.tex.needsUpdate = true;
  });

  // ======================================================== LOUNGE
  const carpet = std({ color: '#2a1f3d', roughness: 0.95, normalMap: T.foamNormal(), normalScale: new THREE.Vector2(0.5, 0.5) });
  floor(14, 12, 29, 28, carpet);
  ceiling(14, 12, 29, 28);
  wallX(14, 12, 28);
  wallZ(28, 14, 29, [], [16, 27, -1, 8.5]);
  wallX(29, 12, 28);
  const cab = arcadeCabinet();
  cab.position.set(15.6, FY, 22);
  cab.rotation.y = Math.PI / 2;
  g.add(cab);
  updaters.push((t) => cab.userData.update(t));
  coll(14, 20.6, 17.1, 23.4);
  interact.push({ id: 'arcade', action: 'arcade', label: 'Play POD RUNNER', pos: V3(15.8, 1.8, 22), r: 6 });
  const jb = jukebox();
  jb.position.set(27.4, FY, 15);
  jb.rotation.y = -Math.PI / 2;
  g.add(jb);
  updaters.push((t) => jb.userData.update(t));
  coll(26.3, 13.4, 29, 16.6);
  interact.push({ id: 'jukebox', action: 'jukebox', label: 'Change the station music', pos: V3(27.4, 0, 15), r: 6 });
  // couch facing the window
  const couchM = std({ color: '#3b2f5c', roughness: 0.85 });
  mesh(rbox(7, 1.8, 2.4, 0.4), couchM, 21.5, FY + 0.9, 23.6, g);
  mesh(rbox(7, 2.6, 0.8, 0.35), couchM, 21.5, FY + 2.2, 22.6, g);
  for (const x of [17.9, 25.1]) mesh(rbox(0.8, 2.4, 2.4, 0.3), couchM, x, FY + 1.2, 23.6, g);
  coll(17.5, 22.2, 25.5, 24.9);
  mesh(rbox(4, 1.1, 1.8, 0.1), phys({ color: '#18181b', roughness: 0.2, clearcoat: 1 }), 21.5, FY + 0.55, 19.4, g);
  coll(19.5, 18.5, 23.5, 20.3);
  // plants
  for (const [x, z] of [[15, 13], [28, 27]]) {
    mesh(new THREE.CylinderGeometry(0.6, 0.45, 1.6, 16), phys({ color: '#e5e7eb', clearcoat: 1 }), x, FY + 0.8, z, g);
    for (let i = 0; i < 7; i++) mesh(new THREE.SphereGeometry(0.55, 10, 8), std({ color: '#2f7a42', roughness: 0.8 }), x + Math.cos(i) * 0.4, FY + 2.2 + (i % 3) * 0.45, z + Math.sin(i) * 0.4, g);
    coll(x - 0.7, z - 0.7, x + 0.7, z + 0.7);
  }
  // trophy wall (achievements)
  const plaques = [];
  const plaqueOn = std({ color: '#2a1f05', emissive: new THREE.Color('#facc15'), emissiveIntensity: 1.5, metalness: 0.8, roughness: 0.3 });
  const plaqueOff = std({ color: '#1b1d24', roughness: 0.5, metalness: 0.6 });
  holoLabel('HALL OF ACHIEVEMENT', 'Press E to view', '#facc15', g, V3(28.6, 8.3, 20), -Math.PI / 2, 3.4);
  ACHIEVEMENTS.forEach((a, i) => {
    const r = Math.floor(i / 6), c = i % 6;
    const p = mesh(rbox(0.12, 0.7, 0.9, 0.03), plaqueOff, 28.65, 6.7 - r * 0.95, 17.0 + c * 1.2, g, { cast: false });
    plaques.push(p);
  });
  interact.push({ id: 'trophies', action: 'trophies', label: 'Hall of Achievement', pos: V3(28.6, 5.3, 20), r: 7 });
  // collection cabinet (owned decor appears here)
  const cabinet = new THREE.Group();
  cabinet.position.set(15.0, FY, 16.5);
  g.add(cabinet);
  mesh(rbox(1.6, 8.0, 5.6, 0.06), M.blackGloss, 0, 4.0, 0, cabinet);
  const cglass = phys({ color: '#c6d6ea', roughness: 0.03, transparent: true, opacity: 0.1, depthWrite: false });
  mesh(box(0.05, 7.4, 5.2), cglass, 0.82, 4.1, 0, cabinet, { cast: false });
  for (const y of [1.4, 3.6, 5.8]) mesh(box(1.3, 0.08, 5.2), M.alu, 0.05, y, 0, cabinet);
  const slots = [];
  for (let i = 0; i < DECOR.length; i++) slots.push(V3(0.2, [1.48, 3.68, 5.88][Math.floor(i / 4)], -1.9 + (i % 4) * 1.25));
  coll(14, 13.6, 15.9, 19.4);
  interact.push({ id: 'collection', action: 'collection', label: 'Collection cabinet', pos: V3(15.4, 1, 16.5), r: 6 });
  const shown = {};

  // ======================================================== ORIN CORE
  floor(29, 12, 44, 28);
  ceiling(29, 12, 44, 28);
  wallZ(28, 29, 44);
  const core = new THREE.Group();
  core.position.set(36.5, 3.5, 21);
  g.add(core);
  mesh(new THREE.CylinderGeometry(1.6, 2.0, 3.0, 32), steel, 0, -6.0, 0, core);
  coll(34.5, 19, 38.5, 23);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(1.4, 32, 24), holoMaterial('#22d3ee', 0.9));
  core.add(eye);
  const iris = mesh(new THREE.SphereGeometry(0.5, 24, 16), std({ color: '#001', emissive: new THREE.Color('#e0f2fe'), emissiveIntensity: 3 }), 0, 0, 0, core, { cast: false });
  const rings = [0, 1, 2].map((i) => {
    const r = new THREE.Mesh(new THREE.TorusGeometry(2.0 + i * 0.45, 0.04, 8, 64), holoMaterial(i === 1 ? '#a78bfa' : '#22d3ee', 0.9, { scan: 0 }));
    core.add(r);
    return r;
  });
  updaters.push((t, ctx) => {
    rings.forEach((r, i) => {
      r.rotation.x = t * (0.3 + i * 0.17);
      r.rotation.y = t * (0.21 + i * 0.11);
    });
    core.position.y = 3.5 + Math.sin(t * 1.1) * 0.15;
    if (ctx.player) {
      const d = ctx.player.clone().sub(core.position).normalize().multiplyScalar(1.0);
      iris.position.lerp(d, 0.1);
    }
  });
  npcs.orin = core;
  interact.push({ id: 'orin', action: 'talk', who: 'orin', label: 'Talk to ORIN', pos: V3(36.5, 3.5, 21), r: 7 });
  // codex terminal
  mesh(rbox(3.4, 3.2, 1.6, 0.08), M.blackGloss, 41.9, FY + 1.6, 25.9, g);
  const cdx = screenCanvas(512, 256);
  cdx.ctx.fillStyle = '#05070f';
  cdx.ctx.fillRect(0, 0, 512, 256);
  cdx.ctx.fillStyle = '#22d3ee';
  cdx.ctx.font = '700 40px Rajdhani, sans-serif';
  cdx.ctx.fillText('FORGE-7 ARCHIVE', 24, 60);
  cdx.ctx.fillStyle = '#94a3b8';
  cdx.ctx.font = '600 24px Inter, sans-serif';
  for (let i = 0; i < 5; i++) cdx.ctx.fillText('▸ ' + ['Station records', 'Crew files', 'Signal fragments', 'Founder logs', 'Launch manifests'][i], 30, 110 + i * 30);
  cdx.tex.needsUpdate = true;
  mesh(new THREE.PlaneGeometry(3.0, 1.5), cdx.m, 41.9, FY + 4.3, 26.5, g, { ry: Math.PI, rx: 0, cast: false }).rotation.set(0.25, Math.PI + 0.35, 0, 'YXZ');
  coll(40.1, 25, 43.7, 27.8);
  interact.push({ id: 'codex', action: 'codex', label: 'Open the archive (Codex)', pos: V3(41.9, 1, 25.9), r: 5.5 });
  // bunk
  mesh(rbox(3.4, 1.4, 7, 0.1), M.darkMetal, 31, FY + 0.7, 23.5, g);
  mesh(rbox(3.0, 0.5, 6.6, 0.2), std({ color: '#475569', roughness: 0.9 }), 31, FY + 1.6, 23.5, g);
  mesh(rbox(2.0, 0.5, 1.2, 0.2), std({ color: '#e2e8f0', roughness: 0.9 }), 31, FY + 2.05, 26.2, g);
  coll(29.2, 19.9, 32.8, 27.1);
  interact.push({ id: 'bunk', action: 'bunk', label: 'Your bunk', pos: V3(31, 0, 23.5), r: 5 });
  for (let i = 0; i < 3; i++) mesh(rbox(1.6, 7, 1.4, 0.05), std({ color: '#334155', roughness: 0.5, metalness: 0.6 }), 30.0, FY + 3.5, 13.4 + i * 1.6, g);
  coll(29.2, 12.6, 30.9, 17.6);

  // ======================================================== HANGAR
  floor(44, -12, 66, 28);
  for (let z = -10; z <= 26; z += 6) mesh(box(18, 0.02, 0.3), std({ map: T.hazardTexture(), roughness: 0.5 }), 55, FY + 0.012, z, g, { cast: false });
  ceiling(44, -12, 66, 28);
  wallX(44, -12, 28, [[4, 12]]);
  wallZ(-12, 44, 66);
  wallZ(28, 44, 66);
  // the east "wall" is an atmospheric forcefield onto open space
  wallX(66, -12, 28, [], [-8, 24, -3.5, 10.5]);
  const field = new THREE.Mesh(new THREE.PlaneGeometry(32, 14), holoMaterial('#38bdf8', 0.18));
  field.position.set(65.6, 3.5, 8);
  field.rotation.y = -Math.PI / 2;
  g.add(field);
  neon('LAUNCH HANGAR · DOCK 3', '#f59e0b', 8, 1.2, g, V3(55, 9, -11.6));
  const pods = [];
  for (const [i, z] of [[0, -4], [1, 6], [2, 16]]) {
    const pod = buildPod();
    pod.position.set(59, 0.2, z);
    pod.scale.setScalar(1.25);
    pod.userData.flame.visible = false;
    g.add(pod);
    mesh(box(5, 3.6, 0.6), M.darkMetal, 59, FY + 1.8, z - 1.4, g);
    mesh(box(5, 3.6, 0.6), M.darkMetal, 59, FY + 1.8, z + 1.4, g);
    coll(55.5, z - 1.8, 63, z + 1.8);
    pods.push(pod);
    interact.push({ id: 'pod' + i, action: 'pod', pod: i, label: ['Pod "Big Kevin"', 'Pod "Comet Lady"', 'Pod "Ol\' Reliable"'][i], pos: V3(59, 1, z), r: 6 });
  }
  const juno = buildCrew({ suit: '#b45309', trim: '#fde68a', skin: '#d6a07a', hair: '#7c2d12', headset: true, badge: 'J. Reyes' });
  juno.position.set(50.5, FY, -1);
  juno.rotation.y = -0.6;
  g.add(juno);
  npcs.juno = juno;
  coll(49.8, -1.7, 51.2, -0.3);
  interact.push({ id: 'juno', action: 'talk', who: 'juno', label: 'Talk to Juno', pos: V3(50.5, 2.5, -1), r: 6 });
  const map = solMap();
  map.position.set(51, FY, 18);
  g.add(map);
  updaters.push((t) => map.userData.update(t));
  coll(47.4, 14.4, 54.6, 21.6);
  interact.push({ id: 'solmap', action: 'solmap', label: 'Sol shipment map', pos: V3(51, 1.5, 18), r: 7 });
  // launch log screen
  const log = screenCanvas(768, 384);
  mesh(new THREE.PlaneGeometry(6, 3), log.m, 51, 4.5, -11.65, g, { cast: false });
  interact.push({ id: 'log', action: 'solmap', label: 'Launch log', pos: V3(51, 4.5, -11.5), r: 8 });
  // props: fuel tanks & crates
  for (const z of [-9, -6.6]) {
    mesh(new THREE.CylinderGeometry(1.0, 1.0, 6, 24), std({ color: '#cbd5e1', roughness: 0.4, metalness: 0.7 }), 64, FY + 3, z, g);
    mesh(new THREE.TorusGeometry(1.0, 0.05, 8, 24), accentA, 64, FY + 4.5, z, g, { rx: Math.PI / 2, cast: false });
  }
  coll(62.8, -10.2, 65.3, -5.4);
  for (let i = 0; i < 5; i++) mesh(box(2, 2, 2), M.cardboard, 46.5 + (i % 2) * 2.1, FY + 1 + Math.floor(i / 2) * 2, 25.5, g);
  coll(45.3, 24.4, 49.8, 26.7);

  // roaming lights that follow the player in walk mode (constant count → no shader recompiles)
  const warm = new THREE.PointLight('#ffe8c8', 0, 34, 1.4);
  const tint = new THREE.PointLight(theme.a, 0, 30, 1.6);
  g.add(warm, tint);

  const state = { player: null, signal: 0, walking: false };
  const update = (t, dt, player, walking) => {
    state.player = player;
    state.walking = walking;
    for (const f of updaters) f(t, state);
    // doors slide open as you approach
    for (const d of doors) {
      const near = walking && player && Math.hypot(player.x - d.cx, player.z - d.cz) < 6.5;
      if (near && d.target === 0) audio.play('door');
      d.target = near ? 1 : 0;
      const prev = d.open;
      d.open += (d.target - d.open) * Math.min(1, dt * 6);
      if (Math.abs(prev - d.open) > 0.0005) d.place();
    }
    // shop item turntables
    for (const id in shopItems) {
      const s = shopItems[id];
      s.model.rotation.y += dt * 0.5;
      s.model.position.y = s.base + Math.sin(t * 1.5 + s.i) * 0.08;
    }
    pip.position.y = FY + 5.4 + Math.sin(t * 2) * 0.2;
    if (t - pip.userData.lastDraw > 0.1) {
      pip.userData.lastDraw = t;
      pip.userData.draw(t);
    }
    // crew idle + look at the player
    for (const k of ['sela', 'juno']) {
      const n = npcs[k];
      const { body, head } = n.userData;
      body.scale.y = 1 + Math.sin(t * 1.8 + k.length) * 0.012;
      const blink = (t + k.length * 0.7) % 3.9 < 0.13;
      for (const e of n.userData.eyes) e.scale.y = blink ? 0.12 : 1;
      body.userData['arm-1'].rotation.x = Math.sin(t * 0.9 + k.length) * 0.05;
      body.userData.arm1.rotation.x = Math.sin(t * 0.9 + k.length + 1.3) * 0.05;
      if (player && walking) {
        const local = n.worldToLocal(player.clone());
        const yaw = Math.atan2(local.x, local.z);
        head.rotation.y += (THREE.MathUtils.clamp(yaw, -1.0, 1.0) - head.rotation.y) * 0.08;
      }
    }
    if (player && walking) {
      const r = roomAt(player.x, player.z) || ROOMS[0];
      const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      warm.position.set(cx, 8, cz);
      tint.position.set(player.x, 6, player.z);
      warm.intensity = r.id === 'bay' ? 0 : 140;
      tint.intensity = r.id === 'bay' ? 0 : 30;
    } else warm.intensity = tint.intensity = 0;
  };

  const refreshShop = (save) => {
    for (const id in shopItems) {
      const owned = !!save.upgrades[id];
      shopItems[id].ringM.emissive.set(owned ? '#64748b' : '#34d399');
    }
    for (const id in themeOrbs) themeOrbs[id].orbM.emissiveIntensity = save.themes[id] ? 2.2 : 0.6;
  };
  const refreshTrophies = (unlocked) => {
    ACHIEVEMENTS.forEach((a, i) => (plaques[i].material = unlocked[a.id] ? plaqueOn : plaqueOff));
  };
  const refreshCollection = (owned) => {
    DECOR.forEach((d, i) => {
      if (owned[d.id] && !shown[d.id]) {
        const o = buildDecor(d.id);
        o.position.copy(slots[i]);
        o.scale.setScalar(1.6);
        cabinet.add(o);
        shown[d.id] = o;
        if (o.userData.anim) updaters.push((t) => o.userData.anim(o, t));
      }
    });
  };
  const setTheme = (th) => tint.color.set(th.a);
  const drawLog = (history) => {
    const c = log.ctx;
    c.fillStyle = '#070912';
    c.fillRect(0, 0, 768, 384);
    c.fillStyle = '#f59e0b';
    c.font = '700 40px Rajdhani, sans-serif';
    c.fillText('LAUNCH LOG', 24, 50);
    c.font = '600 22px Consolas, monospace';
    (history || []).slice(-8).reverse().forEach((h, i) => {
      c.fillStyle = i === 0 ? '#fde68a' : '#cbd5e1';
      c.fillText(`${h.no.padEnd(8)} ${h.grade}  ${h.customer.slice(0, 18).padEnd(18)} → ${h.city.slice(0, 20)}`, 24, 100 + i * 34);
    });
    if (!history || !history.length) {
      c.fillStyle = '#64748b';
      c.fillText('No launches yet. Get building!', 24, 110);
    }
    log.tex.needsUpdate = true;
  };
  const setMapMarkers = (shipments) => {
    for (const k in map.userData.planets) map.userData.planets[k].marker.visible = !!(shipments && shipments[k]);
  };

  return { group: g, colliders, interact, doors, npcs, update, refreshShop, refreshTrophies, refreshCollection, setTheme, drawLog, setMapMarkers, state, telescope: scope };
}
