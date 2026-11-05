// Forge-7 orbital workshop: the whole set, lights and ambient animation.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as T from './textures.js';
import { M, mesh, std, phys, buildTapeGun } from './models.js';
import { skyMaterial, planetMaterial, ringMaterial, beamMaterial, holoMaterial, U } from './shaders.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const rbox = (w, h, d, r = 0.04) => new RoundedBoxGeometry(w, h, d, 2, r);

// Holo pads for the parts (top surface positions)
export const PADS = [
  V3(3.35, 0, 1.45), V3(4.55, 0, 1.45), V3(5.75, 0, 1.45), V3(6.95, 0, 1.45),
  V3(3.35, 0.7, 0.1), V3(4.55, 0.7, 0.1), V3(5.75, 0.7, 0.1), V3(6.95, 0.7, 0.1),
  V3(3.95, 1.4, -1.3), V3(5.15, 1.4, -1.3), V3(6.35, 1.4, -1.3),
];
const PAD_TOP = 0.12;

export const DECOR_SPOTS = {
  bonsai: { pos: V3(-3.05, 0, -1.85), ry: 0.4 },
  duck: { pos: V3(-3.15, 0, -0.75), ry: 0.6 },
  mug: { pos: V3(7.95, 0, 1.75), ry: -0.5 },
  lava: { pos: V3(7.95, 0, 0.85), ry: 0 },
  globe: { pos: V3(3.7, 1.4, -1.95), ry: 0 },
  astro: { pos: V3(6.7, 1.4, -1.95), ry: -0.4 },
  trophy: { pos: V3(5.2, 1.4, -1.98), ry: 0 },
  crt: { pos: V3(-12.2, -2.2, -2.45), ry: 0.25 },
  cat: { pos: V3(2.95, 0, -2.0), ry: -0.6 },
  shard: { pos: V3(-13.1, -2.2, -1.6), ry: 0 },
};

function planeUV(w, h, tile) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / tile), uv.getY(i) * (h / tile));
  return g;
}

export function buildStation(theme) {
  const g = new THREE.Group();
  const accentA = std({ color: '#111', emissive: new THREE.Color(theme.a), emissiveIntensity: 2.2 });
  const accentB = std({ color: '#111', emissive: new THREE.Color(theme.b), emissiveIntensity: 1.8 });
  const white = std({ color: '#111', emissive: new THREE.Color('#fff4e0'), emissiveIntensity: 3 });
  const steel = std({ color: '#262a33', roughness: 0.32, metalness: 0.88, normalMap: T.brushedNormal(), normalScale: new THREE.Vector2(0.3, 0.3) });
  const darkPanel = std({ color: '#171a22', roughness: 0.5, metalness: 0.6 });
  const updaters = [];

  // ---------------------------------------------------------------- floor
  const ft = T.floorTextures();
  const floorM = std({ map: ft.map, normalMap: ft.normal, roughnessMap: ft.rough, roughness: 0.55, metalness: 0.7, envMapIntensity: 1.2 });
  mesh(new THREE.PlaneGeometry(90, 34.4), floorM, -4, -4.0, 13.8, g, { rx: -Math.PI / 2, cast: false });
  // glowing floor guide lines
  mesh(box(60, 0.02, 0.06), accentA, -4, -3.99, 3.6, g, { cast: false });
  mesh(box(60, 0.02, 0.06), accentB, -4, -3.99, -2.6, g, { cast: false });

  // ---------------------------------------------------------------- walls (hex panels)
  const hex = T.hexPanelTextures('#ffffff');
  for (const t of [hex.map, hex.normal, hex.emissive]) t.repeat.set(1, 1);
  const wallM = std({ map: hex.map, normalMap: hex.normal, normalScale: new THREE.Vector2(0.7, 0.7), emissiveMap: hex.emissive, emissive: new THREE.Color(theme.a), emissiveIntensity: 0.22, roughness: 0.5, metalness: 0.65, color: '#8a90a0' });
  const WZ = -3.42;
  const wall = (w, h, x, y) => mesh(planeUV(w, h, 3.2), wallM, x, y, WZ, g, { cast: false });
  wall(24, 18, -28.4, 5); // left of window
  wall(36, 18, 15.0, 5); // right of window
  wall(13.4, 5.0, -9.7, -1.5); // under window
  wall(13.4, 5.6, -9.7, 11.2); // above window
  // side walls
  const side = mesh(planeUV(16, 18, 3.2), wallM, -22.6, 5, 4.6, g, { ry: Math.PI / 2, cast: false });
  mesh(planeUV(16, 18, 3.2), wallM, 13.5, 5, 4.6, g, { ry: -Math.PI / 2, cast: false });
  // horizontal light strips along the wall
  mesh(box(36, 0.05, 0.05), accentA, 15, 8.8, WZ + 0.05, g, { cast: false });
  mesh(box(24, 0.05, 0.05), accentA, -28.4, 8.8, WZ + 0.05, g, { cast: false });
  mesh(box(36, 0.05, 0.05), accentB, 15, -3.7, WZ + 0.05, g, { cast: false });

  // ---------------------------------------------------------------- panoramic window
  const frameM = phys({ color: '#0d0e13', roughness: 0.3, metalness: 0.8, clearcoat: 1, clearcoatRoughness: 0.15 });
  const WX0 = -16.4, WX1 = -3.0, WY0 = 1.0, WY1 = 8.4;
  const wcx = (WX0 + WX1) / 2, wcy = (WY0 + WY1) / 2, ww = WX1 - WX0, wh = WY1 - WY0;
  mesh(box(ww + 0.6, 0.35, 0.5), frameM, wcx, WY1 + 0.1, WZ, g);
  mesh(box(ww + 0.6, 0.35, 0.5), frameM, wcx, WY0 - 0.1, WZ, g);
  mesh(box(0.35, wh + 0.5, 0.5), frameM, WX0 - 0.1, wcy, WZ, g);
  mesh(box(0.35, wh + 0.5, 0.5), frameM, WX1 + 0.1, wcy, WZ, g);
  for (const x of [wcx - ww / 6, wcx + ww / 6]) mesh(box(0.14, wh, 0.3), frameM, x, wcy, WZ, g);
  mesh(box(ww, 0.04, 0.04), accentB, wcx, WY0 + 0.05, WZ + 0.25, g, { cast: false });
  const glassM = phys({ color: '#9fb7d8', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.06, depthWrite: false, envMapIntensity: 1.6, clearcoat: 1 });
  mesh(new THREE.PlaneGeometry(ww, wh), glassM, wcx, wcy, WZ - 0.05, g, { cast: false });

  // ---------------------------------------------------------------- outside: sky, Saturn, Titan, ships
  const sky = new THREE.Mesh(new THREE.SphereGeometry(420, 48, 32), skyMaterial(V3(0.5, 0.3, -0.81)));
  sky.renderOrder = 1; // after opaque geometry so early-z skips hidden sky pixels
  g.add(sky);
  const saturn = new THREE.Group();
  saturn.position.set(84, 2, -92);
  saturn.rotation.set(0.25, -0.55, -0.38);
  g.add(saturn);
  const sp = new THREE.Mesh(new THREE.SphereGeometry(14, 64, 48), planetMaterial(T.saturnBands()));
  saturn.add(sp);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.25, 2.35, 160, 1), ringMaterial(T.ringTexture()));
  ring.scale.setScalar(14);
  ring.rotation.x = -Math.PI / 2 + 0.5;
  saturn.add(ring);
  // hazy Titan limb at the bottom of the window
  const [tc, tctx] = T.canvas(16, 256);
  const tg = tctx.createLinearGradient(0, 0, 0, 256);
  tg.addColorStop(0, '#b77a3c');
  tg.addColorStop(0.35, '#9a6230');
  tg.addColorStop(0.6, '#a86c35');
  tg.addColorStop(1, '#5e3a1a');
  tctx.fillStyle = tg;
  tctx.fillRect(0, 0, 16, 256);
  const titanM = planetMaterial(T.toTex(tc, { shared: true }));
  titanM.uniforms.uSun.value.set(0.85, 0.35, 0.25).normalize();
  const titan = new THREE.Mesh(new THREE.SphereGeometry(60, 64, 48), titanM);
  titan.position.set(70, -80, -140);
  g.add(titan);
  // distant traffic
  const glowTex = T.ringSpriteTexture();
  const ships = [];
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: i % 2 ? '#7dd3fc' : '#fde68a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    s.scale.setScalar(0.8 + i * 0.3);
    s.userData = { speed: 0.6 + i * 0.25, y: 3 + i * 2.2, z: -40 - i * 22, phase: i * 37 };
    g.add(s);
    ships.push(s);
  }
  updaters.push((t) => {
    for (const s of ships) {
      const u = s.userData;
      const x = -40 + ((t * u.speed * 4 + u.phase) % 120);
      s.position.set(x, u.y + Math.sin(t * 0.3 + u.phase) * 0.4, u.z);
    }
  });

  // ---------------------------------------------------------------- ceiling truss & lamps
  const truss = std({ color: '#1b1e26', roughness: 0.4, metalness: 0.8 });
  for (const z of [-1.6, 2.6]) mesh(box(46, 0.35, 0.35), truss, -4, 10.5, z, g, { cast: false });
  for (let x = -24; x <= 14; x += 3) mesh(box(0.2, 0.2, 4.6), truss, x, 10.5, 0.5, g, { cast: false });
  const lamps = [];
  const lamp = (x, y, z, floorY, r, key) => {
    const L = new THREE.Group();
    L.position.set(x, y, z);
    g.add(L);
    mesh(new THREE.CylinderGeometry(0.02, 0.02, 10.5 - y, 6), M.darkMetal, 0, (10.5 - y) / 2, 0, L, { cast: false });
    mesh(new THREE.CylinderGeometry(0.25, 0.75, 0.5, 32, 1, true), steel, 0, 0, 0, L);
    mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.04, 24), steel, 0, 0.25, 0, L, { cast: false });
    mesh(new THREE.CircleGeometry(0.68, 32), white, 0, -0.2, 0, L, { rx: Math.PI / 2, cast: false });
    const hgt = y - 0.25 - floorY;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.66, r, hgt, 40, 1, true), beamMaterial('#ffeccc', key ? 0.16 : 0.12));
    beam.position.set(0, -0.25 - hgt / 2, 0);
    beam.renderOrder = 20;
    L.add(beam);
    const spot = new THREE.SpotLight('#ffe8c8', key ? 110 : 80, 24, 0.55, 0.75, 1.5);
    spot.position.set(x, y - 0.3, z);
    spot.target.position.set(x, floorY, z);
    g.add(spot, spot.target);
    lamps.push({ group: L, beam, spot });
  };
  lamp(0.2, 8.3, 0.5, 0, 2.6, true);
  lamp(5.2, 8.3, 0.4, 0.3, 2.4, false);
  lamp(-8.4, 7.6, 0.8, -2.2, 3.0, false);

  // dust motes drifting in the light
  const DN = 420;
  const dpos = new Float32Array(DN * 3);
  const dseed = [];
  for (let i = 0; i < DN; i++) {
    const x = -11 + Math.random() * 19, y = -2 + Math.random() * 9.5, z = -1.8 + Math.random() * 4.2;
    dpos.set([x, y, z], i * 3);
    dseed.push(Math.random() * 100);
  }
  const dgeo = new THREE.BufferGeometry();
  dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  const dust = new THREE.Points(dgeo, new THREE.PointsMaterial({ size: 0.05, map: glowTex, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffe6c0' }));
  dust.frustumCulled = false;
  g.add(dust);
  updaters.push((t, dt) => {
    const p = dgeo.attributes.position.array;
    for (let i = 0; i < DN; i++) {
      const s = dseed[i];
      p[i * 3] += Math.sin(t * 0.21 + s) * 0.0025;
      p[i * 3 + 1] += Math.sin(t * 0.13 + s * 1.7) * 0.0018 + 0.0006;
      p[i * 3 + 2] += Math.cos(t * 0.17 + s) * 0.0022;
      if (p[i * 3 + 1] > 7.5) p[i * 3 + 1] = -2;
    }
    dgeo.attributes.position.needsUpdate = true;
  });

  // ---------------------------------------------------------------- neon sign
  const signTex = T.toTex(T.logoCanvas(2048, 512), { shared: true });
  const signM = std({ color: '#000', emissive: new THREE.Color('#ffffff'), emissiveMap: signTex, transparent: true, map: signTex, emissiveIntensity: 1.4 });
  mesh(new THREE.PlaneGeometry(5.2, 1.3), signM, 0.9, 6.5, WZ + 0.06, g, { cast: false });
  mesh(box(5.8, 0.05, 0.05), accentA, 0.9, 5.72, WZ + 0.06, g, { cast: false });
  updaters.push((t) => (signM.emissiveIntensity = 1.35 + Math.sin(t * 2.1) * 0.05 + (Math.sin(t * 23) > 0.995 ? -0.6 : 0)));

  // ---------------------------------------------------------------- assembly bench
  const benchM = phys({ color: '#181b23', roughness: 0.38, metalness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.3, normalMap: T.brushedNormal(), normalScale: new THREE.Vector2(0.15, 0.15) });
  mesh(rbox(11.8, 0.24, 4.7, 0.06), benchM, 2.4, -0.12, -0.05, g);
  mesh(box(11.6, 0.035, 0.035), accentA, 2.4, -0.13, 2.31, g, { cast: false });
  mesh(box(0.035, 0.035, 4.5), accentB, 8.31, -0.13, -0.05, g, { cast: false });
  for (const x of [-3.2, 8.0]) {
    for (const z of [-2.0, 1.9]) {
      const leg = mesh(box(0.22, 3.8, 0.22), steel, x, -2.12, z, g);
      leg.rotation.z = x < 0 ? 0.06 : -0.06;
    }
  }
  mesh(box(11.0, 0.14, 0.14), steel, 2.4, -3.3, -2.0, g);
  // back riser with tool silhouettes
  mesh(rbox(11.8, 0.7, 0.18, 0.04), darkPanel, 2.4, 0.35, -2.32, g);
  mesh(box(11.6, 0.03, 0.03), accentB, 2.4, 0.68, -2.22, g, { cast: false });
  // turntable for the case
  mesh(new THREE.CylinderGeometry(2.55, 2.6, 0.08, 64), steel, 0, 0.04, 0.15, g);
  const ttRing = mesh(new THREE.TorusGeometry(2.56, 0.025, 8, 96), accentB, 0, 0.085, 0.15, g, { rx: Math.PI / 2, cast: false });
  const tickM = std({ color: '#111', emissive: new THREE.Color(theme.a), emissiveIntensity: 1.2 });
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    mesh(box(0.03, 0.01, i % 4 ? 0.12 : 0.25), tickM, Math.cos(a) * 2.35, 0.085, 0.15 + Math.sin(a) * 2.35, g, { ry: -a, cast: false });
  }

  // ---------------------------------------------------------------- holo part pads
  const platM = phys({ color: '#1d2029', roughness: 0.4, metalness: 0.7, clearcoat: 0.5 });
  mesh(rbox(4.75, 0.7, 1.3, 0.05), platM, 5.15, 0.35, 0.1, g);
  mesh(rbox(3.6, 1.4, 1.5, 0.05), platM, 5.15, 0.7, -1.3, g);
  mesh(box(4.6, 0.03, 0.03), accentA, 5.15, 0.69, 0.77, g, { cast: false });
  mesh(box(3.5, 0.03, 0.03), accentA, 5.15, 1.39, -0.53, g, { cast: false });
  const padRings = [];
  for (const p of PADS) {
    mesh(new THREE.CylinderGeometry(0.44, 0.48, PAD_TOP, 40), steel, p.x, p.y + PAD_TOP / 2, p.z, g);
    const r = mesh(new THREE.TorusGeometry(0.42, 0.018, 8, 64), accentB, p.x, p.y + PAD_TOP + 0.005, p.z, g, { rx: Math.PI / 2, cast: false });
    padRings.push(r);
    const bm = beamMaterial(theme.b, 0.32);
    bm.uniforms.uFlip.value = 1;
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.42, 1.0, 32, 1, true), bm);
    cone.position.set(p.x, p.y + PAD_TOP + 0.5, p.z);
    cone.renderOrder = 21;
    g.add(cone);
    padRings.push(cone);
  }

  // ---------------------------------------------------------------- QA holo monitor
  const mon = new THREE.Group();
  mon.position.set(5.1, 4.65, -3.0);
  g.add(mon);
  mesh(rbox(3.2, 1.98, 0.1, 0.04), M.blackGloss, 0, 0, 0, mon);
  const frameGlow = holoMaterial(theme.b, 0.9, { scan: 0 });
  for (const [w, h, x, y] of [[3.24, 0.03, 0, 1.0], [3.24, 0.03, 0, -1.0], [0.03, 2.0, 1.62, 0], [0.03, 2.0, -1.62, 0]]) {
    const b = new THREE.Mesh(box(w, h, 0.03), frameGlow);
    b.position.set(x, y, 0.06);
    mon.add(b);
  }
  const [sc, sctx] = T.canvas(1024, 600);
  const screenTex = T.toTex(sc);
  const screenM = std({ color: '#000', emissive: new THREE.Color('#ffffff'), emissiveMap: screenTex, emissiveIntensity: 1.1, roughness: 0.15 });
  const screen = mesh(new THREE.PlaneGeometry(3.04, 1.8), screenM, 0, 0, 0.056, mon, { cast: false });
  updaters.push((t) => (mon.position.y = 4.65 + Math.sin(t * 0.8) * 0.03));

  // ---------------------------------------------------------------- dispatch platform (packing)
  const deck = std({ color: '#22262e', roughness: 0.4, metalness: 0.8, normalMap: ft.normal, normalScale: new THREE.Vector2(0.6, 0.6) });
  mesh(rbox(10.2, 0.25, 7.0, 0.05), deck, -8.5, -2.325, 0.6, g);
  const hz = std({ map: T.hazardTexture(), roughness: 0.5, metalness: 0.3 });
  mesh(box(10.2, 0.2, 0.02), hz, -8.5, -2.33, 4.11, g, { cast: false });
  mesh(box(10.2, 0.03, 0.03), accentB, -8.5, -2.2, 4.12, g, { cast: false });
  for (const x of [-13.3, -3.7]) for (const z of [-2.6, 3.8]) mesh(box(0.25, 1.7, 0.25), steel, x, -3.15, z, g);
  // conveyor to the airlock
  const conv = new THREE.Group();
  g.add(conv);
  mesh(box(9, 0.2, 3.6), steel, -18.1, -2.5, -0.2, conv);
  const rollers = [];
  for (let x = -22.4; x < -13.8; x += 0.45) rollers.push(mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.3, 14), M.silver, x, -2.29, -0.2, conv, { rx: Math.PI / 2 }));
  mesh(box(9, 0.35, 0.1), steel, -18.1, -2.25, 1.6, conv);
  mesh(box(9, 0.35, 0.1), steel, -18.1, -2.25, -2.0, conv);
  mesh(box(9, 0.03, 0.03), accentA, -18.1, -2.06, 1.66, conv, { cast: false });
  // airlock doors in the left wall
  const airlock = new THREE.Group();
  airlock.position.set(-22.5, 1.0, -0.2);
  g.add(airlock);
  mesh(box(0.5, 7.6, 0.5), frameM, 0, 0, -2.4, airlock);
  mesh(box(0.5, 7.6, 0.5), frameM, 0, 0, 2.4, airlock);
  mesh(box(0.5, 0.5, 5.3), frameM, 0, 3.8, 0, airlock);
  const doorM = phys({ color: '#2a2f3a', roughness: 0.35, metalness: 0.8, clearcoat: 0.6 });
  const doorL = mesh(box(0.2, 7.2, 2.2), doorM, 0.1, 0, -1.1, airlock);
  const doorR = mesh(box(0.2, 7.2, 2.2), doorM, 0.1, 0, 1.1, airlock);
  mesh(box(0.05, 7.0, 0.2), hz, 0.22, 0, -0.08, airlock, { cast: false });
  const warn = std({ color: '#300', emissive: new THREE.Color('#f59e0b'), emissiveIntensity: 0.3 });
  const warnL = mesh(new THREE.SphereGeometry(0.16, 16, 12), warn, 0.3, 4.3, -1.2, airlock);
  const warnR = mesh(new THREE.SphereGeometry(0.16, 16, 12), warn, 0.3, 4.3, 1.2, airlock);
  const shipSign = std({ color: '#000', emissive: new THREE.Color(theme.b), emissiveIntensity: 1.6, emissiveMap: T.toTex(T.textCanvas(512, 128, (ctx) => {
    ctx.fillStyle = '#fff';
    ctx.font = T.font(800, 84);
    ctx.textAlign = 'center';
    ctx.fillText('DISPATCH', 256, 98);
  })) });
  mesh(new THREE.PlaneGeometry(3, 0.75), shipSign, -22.33, 5.6, -0.2, g, { ry: Math.PI / 2, cast: false });
  const airlockState = { open: 0, target: 0, alarm: 0 };
  updaters.push((t, dt) => {
    airlockState.open += (airlockState.target - airlockState.open) * Math.min(1, dt * 4);
    doorL.position.z = -1.1 - airlockState.open * 2.1;
    doorR.position.z = 1.1 + airlockState.open * 2.1;
    const on = airlockState.alarm > 0 && Math.sin(t * 12) > 0;
    warn.emissiveIntensity = on ? 3 : 0.3;
    airlockState.alarm = Math.max(0, airlockState.alarm - dt);
  });

  // ---------------------------------------------------------------- upgrade props
  const props = {};
  const esp = new THREE.Group();
  esp.position.set(7.85, 0, -1.75);
  g.add(esp);
  mesh(rbox(0.85, 1.25, 0.85, 0.08), phys({ color: '#b91c1c', roughness: 0.3, metalness: 0.3, clearcoat: 1 }), 0, 0.625, 0, esp);
  mesh(rbox(0.9, 0.14, 0.9, 0.05), M.silver, 0, 1.3, 0, esp);
  mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.24, 16), M.plasticWhite, 0, 0.12, 0.48, esp);
  props.espresso = esp;
  const drv = new THREE.Group();
  drv.position.set(-2.95, 0.12, 1.45);
  drv.rotation.y = 0.6;
  g.add(drv);
  mesh(rbox(0.9, 0.24, 0.24, 0.08), phys({ color: '#f59e0b', roughness: 0.4, clearcoat: 0.8 }), 0, 0, 0, drv);
  mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8), M.silver, 0.65, 0, 0, drv, { rz: Math.PI / 2 });
  props.driver = drv;
  const glv = new THREE.Group();
  glv.position.set(-2.95, 0.06, 0.35);
  g.add(glv);
  mesh(rbox(0.55, 0.1, 0.8, 0.05), std({ color: theme.a, roughness: 0.8 }), 0, 0, 0, glv);
  mesh(rbox(0.55, 0.1, 0.8, 0.05), std({ color: theme.b, roughness: 0.8 }), 0.15, 0.08, -0.15, glv, { ry: 0.4 });
  props.gloves = glv;
  const tgun = buildTapeGun();
  tgun.position.set(-12.4, -1.66, 3.3);
  tgun.rotation.y = 0.5;
  g.add(tgun);
  props.tapegun = tgun;
  for (let i = 0; i < 6; i++) mesh(box(2.4, 0.08, 1.6), M.cardboard, -12.4 + (i % 2) * 0.05, -2.15 + i * 0.09, 3.3, g);

  // ---------------------------------------------------------------- lights
  const lights = [];
  lights.push(new THREE.HemisphereLight('#a5b4fc', '#120e18', 0.35));
  const key = new THREE.DirectionalLight('#fff3e3', 1.9);
  key.position.set(7, 17, 13);
  key.target.position.set(-3, 0, 0);
  key.castShadow = true;
  Object.assign(key.shadow.camera, { left: -17, right: 13, top: 11, bottom: -11, near: 2, far: 50 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.03;
  lights.push(key, key.target);
  const win = new THREE.DirectionalLight('#9cc2ff', 1.1);
  win.position.set(-14, 8, -14);
  win.target.position.set(-2, 0, 3);
  lights.push(win, win.target);
  const rimA = new THREE.PointLight(theme.a, 45, 24, 1.6);
  rimA.position.set(1.5, 6.0, -2.5);
  const rimB = new THREE.PointLight(theme.b, 30, 22, 1.6);
  rimB.position.set(5.5, 3.5, -2.4);
  lights.push(rimA, rimB);
  for (const l of lights) g.add(l);

  const update = (t, dt) => {
    U.time.value = t;
    for (const f of updaters) f(t, dt);
    for (let i = 0; i < padRings.length; i += 2) padRings[i].rotation.z = t * 0.6 + i;
  };

  const setTheme = (th) => {
    accentA.emissive.set(th.a);
    accentB.emissive.set(th.b);
    wallM.emissive.set(th.a);
    tickM.emissive.set(th.a);
    rimA.color.set(th.a);
    rimB.color.set(th.b);
    frameGlow.uniforms.uColor.value.set(th.b);
    for (let i = 1; i < padRings.length; i += 2) padRings[i].material.uniforms.uColor.value.set(th.b);
  };

  const setQuality = (q) => {
    const lite = q === 'low';
    for (const l of lamps) l.spot.visible = !lite;
    rimB.visible = !lite;
    dust.visible = !lite;
  };

  return {
    setQuality,
    group: g, accentA, accentB, screen: { canvas: sc, ctx: sctx, tex: screenTex, mesh: screen }, rollers, props, monitor: mon,
    keyLight: key, lamps, airlock: airlockState, sky, saturn, update, setTheme, dust,
  };
}
