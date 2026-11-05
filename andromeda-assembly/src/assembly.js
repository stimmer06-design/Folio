import * as THREE from 'three';
import { PARTS, CAT_LABEL, CAT_COLOR, RGB_COLORS, TIERS } from './catalog.js';
import * as MD from './models.js';
import { M } from './models.js';
import * as T from './textures.js';
import { PADS } from './env.js';
import { holoMaterial } from './shaders.js';
import { tweens, tweenObj, wait, Ease, V3, QI, qEuler, damp, clamp, fmtTime } from './util.js';
import { audio } from './audio.js';

// Anchor points in case-local coordinates (case origin = bottom centre)
export const SLOTS = {
  mb: V3(0.75, 2.95, -1.0),
  cpu: V3(1.15, 3.5, -0.905),
  cooler: V3(1.15, 3.5, -0.845),
  ram: V3(0.27, 3.5, -0.9),
  ssd: V3(1.1, 2.65, -0.925),
  gpu: V3(1.25, 2.15, -0.88),
  psu: V3(1.3, 0.06, -0.22),
  panel: V3(0, 2.5, 1.12),
};
export const CASE_POS = V3(0, 0.16, 0);
const PANEL_PARK = { pos: V3(-3.15, 3.35, -2.8), quat: qEuler(-0.1, 0.5, 0.0) };
const PAD_LIFT = 0.12 + 0.2;
const TRAY_QUAT = qEuler(-0.12, -0.38, 0);
const TRAY_QUAT_RAM = qEuler(-0.12, -1.95, 0);
const HITBOX_MAT = new THREE.MeshBasicMaterial({ visible: false });
const ORDER = ['mb', 'cpu', 'cooler', 'ram', 'ssd', 'gpu', 'psu'];
const MAGNET = 0.85;

// Skill windows
const TORQUE = { time: 0.85, green: [0.62, 0.92], perfect: [0.72, 0.82] };
const TORQUE_PRO = { time: 0.85, green: [0.55, 0.95], perfect: [0.68, 0.86] };
const PASTE = { time: 1.15, green: [0.62, 0.9], perfect: [0.71, 0.83], min: 0.45, max: 0.98 };

function trayScaleFor(spec) {
  switch (spec.cat) {
    case 'mb': return 0.27;
    case 'cpu': return 1.2;
    case 'cooler': return spec.kind === 'stock' ? 0.85 : spec.kind === 'tower' ? 0.55 : 0.3;
    case 'ram': return 0.62;
    case 'ssd': return 1.15;
    case 'gpu': return 0.36;
    case 'psu': return 0.5;
  }
  return 0.5;
}

const CABLE_MATS = {};
function cableMat(variant) {
  if (!CABLE_MATS[variant.id]) {
    const col = { lumen: '#e8e9ee', eclipse: '#6d4ad6', titan: '#22262e', lighthouse: '#d4a514' }[variant.id] || '#15161b';
    CABLE_MATS[variant.id] = MD.std({ color: col, roughness: 0.6, metalness: 0.1, normalMap: M.sleeveN, normalScale: new THREE.Vector2(0.9, 0.9) });
  }
  return CABLE_MATS[variant.id];
}

export class Assembly {
  constructor(game) {
    this.g = game;
    this.scene = game.scene;
    this.parts = [];
    this.clickables = [];
    this.labels = [];
    this.caseObj = null;
    this.panel = null;
    this.held = null;
    this.gauge = null;
    this.active = false;
    this.fanSpeed = 0;
    this.rotors = [];
    this.stubs = {};
    this.tmpV = V3();
    this.hintArrow = MD.buildHintArrow();
    this.hintArrow.visible = false;
    this.scene.add(this.hintArrow);
    this.hover = null;
    this.ghostMat = holoMaterial('#67e8f9', 0.55);
    this.ghostHotMat = holoMaterial('#facc15', 0.9);
    // precision reticle
    const mk = (r, w, color, op) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(r - w, r, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.renderOrder = 998;
      return m;
    };
    this.reticle = new THREE.Group();
    this.retOuter = mk(MAGNET, 0.02, '#67e8f9', 0.5);
    this.retInner = mk(1, 0.035, '#67e8f9', 0.9);
    this.retPerfect = mk(0.2, 0.025, '#facc15', 0.8);
    this.reticle.add(this.retOuter, this.retInner, this.retPerfect);
    this.reticle.visible = false;
    this.scene.add(this.reticle);
    // paste target ring
    this.pasteRing = mk(0.2, 0.012, '#facc15', 0.9);
    this.pasteRing.visible = false;
    this.scene.add(this.pasteRing);
  }

  // ------------------------------------------------------------------ setup
  async setup(order) {
    this.order = order;
    this.active = true;
    this.testing = false;
    this.slot = { mb: null, cpu: null, cooler: null, ram: null, ssd: null, gpu: null, psu: null };
    this.cpuLocked = false;
    this.paste = { amount: 0, done: false, blob: null };
    this.cables = { c24: null, c8: null, cgpu: null };
    this.panelOn = false;
    this.lastAction = performance.now();
    this.clickables = [];
    this.stubs = {};
    const c = MD.buildCase(order.caseVariant);
    c.position.set(CASE_POS.x, 10, CASE_POS.z);
    this.scene.add(c);
    this.caseObj = c;
    const p = MD.buildPanel();
    p.position.copy(PANEL_PARK.pos);
    p.quaternion.copy(PANEL_PARK.quat);
    this.scene.add(p);
    this.panel = p;
    this.buildTray(order);
    this.buildClickables();
    // the chassis descends from the fabricator bay
    audio.play('whoosh');
    tweenObj(c, { pos: CASE_POS.clone(), duration: 0.7, ease: Ease.outBounce }).then(() => {});
    await wait(0.28);
    audio.play('heavy');
    this.g.fx.shake(0.14);
    this.g.post.pulse('#a5f3fc', 0.12);
    this.g.fx.ring(V3(0, 0.12, 0.15), { color: '#7dd3fc', radius: 3.2 });
    this.g.fx.burst(V3(0, 0.2, 0.6), { count: 40, color: '#94a3b8', color2: '#cbd5e1', speed: 3.4, size: 0.5, up: 0.3 });
    // parts materialise on their pads
    let i = 0;
    for (const part of this.parts) {
      const s = part.trayScale;
      part.obj.scale.setScalar(0.001);
      part.obj.visible = true;
      const k = i++;
      const d = 0.05 + k * 0.07;
      tweenObj(part.obj, { scale: s, duration: 0.4, delay: d, ease: Ease.outBack, key: part.obj.uuid + ':spawn' }).then(() => {});
      tweens.add({ duration: 0.01, delay: d, update: (e, kk) => {
        if (kk < 1) return;
        audio.play('pop', { pitch: 1 + k * 0.07 });
        this.g.fx.burst(part.base.pos.clone().add(V3(0, 0.3, 0)), { count: 10, color: '#a5f3fc', color2: '#c4b5fd', speed: 1.2, size: 0.35 });
      } });
    }
    await wait(0.5 + this.parts.length * 0.07);
    this.refreshTicket();
  }

  buildTray(order) {
    const list = [];
    for (const cat of ORDER) {
      const id = order.parts[cat];
      if (!id) continue;
      const group = [id, ...order.decoys.filter((d) => PARTS[d].cat === cat)];
      group.sort(() => Math.random() - 0.5);
      for (const g of group) list.push(PARTS[g]);
    }
    list.forEach((spec, i) => {
      const obj = MD.buildPart(spec);
      obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(obj);
      const center = box.getCenter(V3());
      const size = box.getSize(V3());
      const pad = PADS[i % PADS.length];
      const s = trayScaleFor(spec);
      const tq = spec.cat === 'ram' ? TRAY_QUAT_RAM : TRAY_QUAT;
      const off = center.clone().multiplyScalar(s).applyQuaternion(tq);
      const pos = pad.clone().add(V3(0, PAD_LIFT + (size.y * s) / 2, 0)).sub(off);
      obj.position.copy(pos);
      obj.quaternion.copy(tq);
      obj.scale.setScalar(s);
      obj.visible = false;
      const padSz = 0.25 / s;
      const hb = new THREE.Mesh(new THREE.BoxGeometry(size.x + padSz, size.y + padSz, size.z + padSz), HITBOX_MAT);
      hb.position.copy(center);
      hb.userData.hitbox = true;
      obj.add(hb);
      const part = { spec, cat: spec.cat, obj, center, size, trayScale: s, base: { pos: pos.clone(), quat: tq.clone() }, tray: { pos: pos.clone(), quat: tq.clone(), scale: s }, state: 'tray', hitbox: hb, phase: i * 1.7 };
      obj.userData.it = { type: 'part', part };
      const refs = obj.userData.refs || {};
      part.screws = refs.screws ? refs.screws.slice() : refs.screw ? [refs.screw] : [];
      for (const sc of part.screws) {
        sc.userData.base = sc.position.clone();
        sc.userData.axis = V3(0, 0, 1).applyQuaternion(sc.quaternion);
        sc.userData.tight = false;
        sc.visible = false;
      }
      if (spec.legendary) this.addLegendaryAura(obj, center, size);
      this.scene.add(obj);
      this.parts.push(part);
      // holographic label floating in front of the pad
      const tex = T.toTex(T.holoLabelCanvas(spec.short, CAT_LABEL[spec.cat], spec.legendary ? '#facc15' : CAT_COLOR[spec.cat]));
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.36), holoMaterial('#ffffff', 1, { map: tex }));
      lbl.position.set(pad.x, pad.y + 0.06, pad.z + 0.62);
      lbl.rotation.x = -0.95;
      lbl.renderOrder = 30;
      this.scene.add(lbl);
      this.labels.push(lbl);
    });
  }

  addLegendaryAura(obj, center, size) {
    const r = Math.max(size.x, size.y, size.z) * 0.62;
    const aura = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), holoMaterial('#facc15', 0.35));
    aura.position.copy(center);
    aura.userData.noAO = true;
    aura.userData.aura = true;
    obj.add(aura);
  }

  teardown() {
    for (const p of this.parts) {
      if (p.state !== 'installed') p.obj.removeFromParent();
      if (p.hitbox) p.hitbox.geometry.dispose();
    }
    for (const l of this.labels) {
      l.material.uniforms.uMap.value.dispose();
      l.material.dispose();
      l.geometry.dispose();
      l.removeFromParent();
    }
    for (const c of this.clickables) c.marker.removeFromParent();
    for (const id of Object.keys(this.stubs)) this.removeStub(id);
    this.labels = [];
    this.clickables = [];
    this.parts = [];
    this.held = null;
    this.endGauge(true);
    this.active = false;
    this.hintArrow.visible = false;
    this.reticle.visible = false;
    this.pasteRing.visible = false;
  }

  // ------------------------------------------------------------------ helpers
  get needGpu() {
    return !!this.order.parts.gpu;
  }
  slotWorld(cat) {
    return this.caseObj.localToWorld(SLOTS[cat].clone());
  }
  prereq(cat) {
    const s = this.slot;
    switch (cat) {
      case 'cpu':
      case 'ram':
      case 'ssd':
      case 'gpu':
        return s.mb ? null : 'Install the motherboard first';
      case 'cooler':
        return !s.cpu ? 'Install the CPU first' : !this.cpuLocked ? 'Lock the CPU socket lever first' : !this.paste.done ? 'Apply thermal paste to the CPU first' : null;
    }
    return null;
  }
  canRemove(part) {
    if (this.panelOn || this.testing) return 'Open the case first';
    const s = this.slot;
    switch (part.cat) {
      case 'cpu': return s.cooler ? 'Remove the cooler first' : null;
      case 'gpu': return this.cables.cgpu ? 'Unplug the GPU power cable first' : null;
      case 'psu': return this.cables.c24 || this.cables.c8 || this.cables.cgpu ? 'Unplug the power cables first' : null;
      case 'mb': return s.cpu || s.ram || s.ssd || s.gpu || this.cables.c24 || this.cables.c8 ? 'Remove the parts on the motherboard first' : null;
    }
    return null;
  }
  isCorrect(cat) {
    const p = this.slot[cat];
    return !!p && p.spec.id === this.order.parts[cat];
  }
  screwsTight(part) {
    return !!part && part.screws.every((s) => s.userData.tight);
  }
  requiredDone() {
    const s = this.slot;
    if (!s.mb || !this.screwsTight(s.mb) || !s.cpu || !this.cpuLocked || !this.paste.done || !s.cooler || !s.ram || !s.ssd || !this.screwsTight(s.ssd) || !s.psu) return false;
    if (!this.cables.c24 || !this.cables.c8) return false;
    if (this.needGpu && (!s.gpu || !this.screwsTight(s.gpu) || !this.cables.cgpu)) return false;
    return true;
  }
  remainingCount() {
    return this.steps().filter((x) => !x.done && x.id !== 'panel' && x.id !== 'power').length;
  }
  trayPartFor(cat) {
    const want = this.order.parts[cat];
    return this.parts.find((p) => p.spec.id === want && p.state === 'tray') || this.parts.find((p) => p.spec.id === want);
  }
  partWorldCenter(part) {
    return part.obj.localToWorld(part.center.clone());
  }
  screenOf(world) {
    const v = world.clone().project(this.g.camera);
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
  }

  // ------------------------------------------------------------------ steps / hints
  steps() {
    const s = this.slot, o = this.order.parts, out = [];
    const add = (id, done, avail, text, target, wrong = false) => out.push({ id, done, avail, text, target, wrong });
    const partStep = (cat, verb) => {
      const want = PARTS[o[cat]];
      if (s[cat] && !this.isCorrect(cat)) {
        add(cat, false, true, `Wrong ${CAT_LABEL[cat].toLowerCase()}! Drag the ${s[cat].spec.name} back and fit the ${want.name}`, () => this.partWorldCenter(s[cat]), true);
      } else {
        add(cat, !!s[cat], !this.prereq(cat), `${verb} the ${want.name}`, () => {
          const p = this.trayPartFor(cat);
          return p ? this.partWorldCenter(p) : this.slotWorld(cat);
        });
      }
    };
    const screwStep = (id, cat) => {
      const p = s[cat];
      add(id, this.screwsTight(p), !!p, 'HOLD a screw and release in the gold zone for perfect torque', () => {
        const sc = p && p.screws.find((x) => !x.userData.tight);
        return sc ? sc.getWorldPosition(V3()) : this.slotWorld(cat);
      });
    };
    partStep('mb', 'Drag onto the standoffs:');
    screwStep('mbScrews', 'mb');
    partStep('cpu', 'Seat in the socket:');
    add('cpuLock', this.cpuLocked, !!s.cpu, 'Click the socket lever to lock the CPU in', () => this.leverWorld());
    add('paste', this.paste.done, !!s.cpu && this.cpuLocked, this.g.hasUpgrade('pastegun') ? 'Click the CPU to apply thermal paste' : 'HOLD on the CPU to dispense thermal paste — release when it fills the gold ring', () => this.slotWorld('cpu').add(V3(0, 0, 0.1)));
    partStep('cooler', 'Mount on the CPU:');
    partStep('ram', 'Click into the memory slots:');
    partStep('ssd', 'Slot into the M.2 connector:');
    screwStep('ssdScrew', 'ssd');
    if (this.needGpu) {
      partStep('gpu', 'Seat in the PCIe slot:');
      screwStep('gpuScrew', 'gpu');
    }
    partStep('psu', 'Slide into the power bay:');
    const cab = (id, label, ok) => add(id, !!this.cables[id], ok, `DRAG the ${label} cable to its glowing port`, () => (this.stubs[id] ? this.stubs[id].plug.getWorldPosition(V3()) : this.portWorld(id)));
    cab('c24', '24-pin board', !!(s.mb && s.psu));
    cab('c8', 'CPU power', !!(s.mb && s.psu));
    if (this.needGpu) cab('cgpu', 'GPU power', !!(s.gpu && s.psu));
    add('panel', this.panelOn, this.requiredDone(), 'Click the glass side panel to seal the case', () => this.panel.getWorldPosition(V3()));
    add('power', false, this.panelOn, 'Press the power button on top of the case to run QA', () => this.caseObj.userData.caseRefs.btn.getWorldPosition(V3()).add(V3(0, 0.1, 0)));
    return out;
  }
  currentStep() {
    const st = this.steps();
    return st.find((x) => x.wrong) || st.find((x) => !x.done && x.avail) || null;
  }

  // ------------------------------------------------------------------ clickables
  buildClickables() {
    const add = (c) => {
      c.marker = MD.buildMarker(c.color || '#67e8f9', c.size || 0.45);
      c.marker.userData.it = { type: 'click', c };
      c.marker.visible = false;
      this.scene.add(c.marker);
      this.clickables.push(c);
      return c;
    };
    for (const part of this.parts) {
      part.screws.forEach((sc, i) => {
        const c = add({
          id: `screw-${part.cat}-${i}`, size: 0.36, hold: true,
          avail: () => part.state === 'installed' && !sc.userData.tight && !this.panelOn && !sc.userData.busy && !this.gauge,
          pos: () => sc.getWorldPosition(this.tmpV).clone(),
          onDown: () => this.startScrew(part, sc),
        });
        sc.userData.it = { type: 'click', c };
      });
    }
    add({
      id: 'lever', avail: () => !!this.slot.cpu && !this.cpuLocked && this.slot.cpu.state === 'installed' && !!this.slot.mb, pos: () => this.leverWorld(),
      onDown: () => this.lockCPU(),
    });
    add({
      id: 'paste', color: '#facc15', size: 0.5, hold: true,
      avail: () => !!this.slot.cpu && this.cpuLocked && !this.paste.done && !this.slot.cooler && !this.gauge,
      pos: () => this.slotWorld('cpu').add(V3(0, 0, 0.12)),
      onDown: () => this.startPaste(),
    });
    for (const id of ['c24', 'c8', 'cgpu']) {
      add({
        id: 'cable-' + id, color: '#fde047', size: 0.42,
        avail: () => !!this.stubs[id] && !this.cables[id] && !this.panelOn && !this.held,
        pos: () => this.stubs[id].plug.getWorldPosition(this.tmpV).clone(),
        onDown: (ev) => this.startCable(id, ev),
      });
    }
    const pc = add({
      id: 'panel', size: 0.9, avail: () => !this.panelOn && this.requiredDone() && !this.testing, pos: () => this.panel.getWorldPosition(this.tmpV).clone(),
      onDown: () => this.closePanel(),
    });
    this.panel.userData.it = { type: 'click', c: pc };
    const btn = this.caseObj.userData.caseRefs.btn;
    const bc = add({
      id: 'power', color: '#86efac', size: 0.5, avail: () => this.panelOn && !this.testing, pos: () => btn.getWorldPosition(this.tmpV).clone().add(V3(0, 0.12, 0)),
      onDown: () => this.runTest(),
    });
    btn.userData.it = { type: 'click', c: bc };
  }
  leverWorld() {
    const mb = this.slot.mb;
    if (!mb) return this.slotWorld('cpu');
    return mb.obj.userData.refs.lever.localToWorld(V3(0, 0.45, 0));
  }
  portAvail(id) {
    const s = this.slot;
    if (id === 'cgpu') return !!(s.gpu && s.psu && s.gpu.state === 'installed' && s.psu.state === 'installed');
    return !!(s.mb && s.psu && s.mb.state === 'installed' && s.psu.state === 'installed');
  }
  portLocal(id) {
    if (id === 'c24') return SLOTS.mb.clone().add(V3(-1.2, 0.3, 0.2));
    if (id === 'c8') return SLOTS.mb.clone().add(V3(-0.75, 1.45, 0.2));
    const gpu = this.slot.gpu;
    const port = gpu ? gpu.obj.userData.refs.port : V3(-0.4, -0.3, 1.27);
    return SLOTS.gpu.clone().add(port).add(V3(0, 0, 0.06));
  }
  portWorld(id) {
    return this.caseObj.localToWorld(this.portLocal(id));
  }
  cableStart(id) {
    return { c24: V3(-0.95, 3.25, -1.06), c8: V3(-0.8, 4.72, -1.06), cgpu: V3(0.4, 1.27, 0.55) }[id].clone();
  }
  cableSpec(id) {
    return { c24: { strands: [-1.5, -0.5, 0.5, 1.5], off: V3(0, 0.07, 0) }, c8: { strands: [-1.5, -0.5, 0.5, 1.5], off: V3(0.07, 0, 0) }, cgpu: { strands: [-1.5, -0.5, 0.5, 1.5], off: V3(0.07, 0, 0) } }[id];
  }
  cablePath(id) {
    const p = this.portLocal(id);
    if (id === 'c24') return [V3(-0.95, 3.25, -1.06), V3(-0.95, 3.25, -0.74), V3(-0.8, 3.25, -0.56), V3(-0.55, 3.25, -0.56), V3(p.x, p.y, p.z + 0.12), V3(p.x, p.y, p.z)];
    if (id === 'c8') return [V3(-0.8, 4.72, -1.06), V3(-0.8, 4.72, -0.76), V3(-0.5, 4.68, -0.6), V3(-0.08, 4.58, -0.6), V3(p.x, p.y + 0.02, p.z + 0.12), V3(p.x, p.y, p.z)];
    return [V3(0.4, 1.27, 0.55), V3(0.43, 1.42, 0.78), V3(p.x - 0.1, p.y - 0.12, p.z + 0.42), V3(p.x, p.y, p.z + 0.18), V3(p.x, p.y, p.z)];
  }
  // live cable from its grommet to an arbitrary point (case-local), with a little sag
  livePath(id, endLocal) {
    const a = this.cableStart(id);
    const out = id === 'cgpu' ? V3(0, 0.25, 0.15) : V3(0, 0, 0.3);
    const a2 = a.clone().add(out);
    const mid = a2.clone().lerp(endLocal, 0.5);
    mid.y -= 0.18 + a2.distanceTo(endLocal) * 0.18;
    mid.z += 0.15;
    return [a, a2, mid, endLocal.clone().add(V3(0, 0, 0.12)), endLocal.clone()];
  }

  // ------------------------------------------------------------------ cable stubs & drag
  ensureStub(id) {
    if (this.stubs[id]) return;
    const start = this.cableStart(id);
    const end = start.clone().add(id === 'cgpu' ? V3(0.15, 0.35, 0.25) : V3(0.12, -0.32, 0.32));
    const st = this.buildLive(id, this.livePath(id, end));
    st.end = end;
    this.stubs[id] = st;
  }
  buildLive(id, pts) {
    const { strands, off } = this.cableSpec(id);
    const cable = MD.buildCable(pts, strands, off, 0.034, cableMat(this.order.caseVariant));
    this.caseObj.add(cable);
    return { group: cable, plug: cable.userData.plug };
  }
  removeStub(id) {
    const st = this.stubs[id];
    if (!st) return;
    st.group.removeFromParent();
    st.group.traverse((o) => o.isMesh && o.geometry && !o.geometry.userData.shared && o.geometry.dispose());
    delete this.stubs[id];
  }
  startCable(id, ev) {
    if (this.g.hasUpgrade('cablecomb')) {
      const ids = ['c24', 'c8', 'cgpu'].filter((k) => !this.cables[k] && this.portAvail(k));
      ids.forEach((k, i) => this.connect(k, i * 0.1, false, 'perfect'));
      return;
    }
    const port = this.portWorld(id);
    this.held = { type: 'cable', id, plane: new THREE.Plane(V3(0, 0, 1), -(port.z + 0.08)), t0: performance.now(), x0: ev.clientX, y0: ev.clientY, moved: false, sticky: false, snap: false, d: 9 };
    audio.play('pick', { pitch: 1.2 });
  }
  updateCableDrag() {
    const h = this.held;
    const rc = this.g.raycaster;
    rc.setFromCamera(this.g.pointer, this.g.camera);
    const p = rc.ray.intersectPlane(h.plane, V3());
    if (!p) return;
    const portW = this.portWorld(h.id);
    const d = Math.hypot(p.x - portW.x, p.y - portW.y);
    h.d = d;
    const wasSnap = h.snap;
    h.snap = d < 0.55;
    if (h.snap && !wasSnap) audio.play('zone');
    const endW = h.snap ? portW : p;
    const endL = this.caseObj.worldToLocal(endW.clone());
    this.removeStub(h.id);
    const st = this.buildLive(h.id, this.livePath(h.id, endL));
    st.end = endL;
    this.stubs[h.id] = st;
    this.showReticle(portW, d, 0.15, h.snap);
  }
  releaseCable() {
    const h = this.held;
    this.held = null;
    this.reticle.visible = false;
    if (h.snap) {
      const tier = h.d < 0.15 ? 'perfect' : h.d < 0.32 ? 'great' : 'good';
      this.connect(h.id, 0, false, tier);
    } else {
      // spring back to the stub
      this.removeStub(h.id);
      audio.play('drop');
    }
  }

  // ------------------------------------------------------------------ actions
  startScrew(part, sc) {
    const all = this.g.hasUpgrade('driver');
    const list = all ? part.screws.filter((s) => !s.userData.tight && !s.userData.busy) : [sc];
    for (const s of list) {
      s.userData.busy = true;
      s.userData.from = s.position.clone();
    }
    this.gauge = { kind: 'screw', part, list, anchor: sc, t0: this.g.time, v: 0, zones: all ? TORQUE_PRO : TORQUE, lastTick: 0 };
    audio.play(all ? 'drill' : 'pick', { pitch: 0.8 });
  }
  startPaste() {
    if (this.g.hasUpgrade('pastegun')) {
      this.ensureBlob();
      this.paste.done = true;
      tweens.add({ duration: 0.45, ease: Ease.outCubic, update: (e) => this.setBlob(e * 0.77) }).then(() => {
        audio.play('squish', { v: 0.8 });
        this.g.judge('paste', 'perfect', this.slotWorld('cpu').add(V3(0, 0.3, 0.2)), 'Perfect pea!');
        this.refreshTicket();
      });
      return;
    }
    this.ensureBlob();
    this.gauge = { kind: 'paste', t0: this.g.time - (this.paste.amount * PASTE.time), v: this.paste.amount, zones: PASTE, lastTick: 0 };
    audio.play('squish', { v: 0.2 });
  }
  ensureBlob() {
    if (this.paste.blob) return;
    const b = MD.buildPasteBlob();
    b.position.set(0, 0, 0.065);
    b.scale.setScalar(0.001);
    this.slot.cpu.obj.add(b);
    this.paste.blob = b;
  }
  setBlob(v) {
    const b = this.paste.blob;
    if (!b) return;
    const s = 0.15 + v * 1.25;
    b.scale.set(s, s, 0.5 * Math.min(1.2, 0.4 + v));
  }
  updateGauge(dt) {
    const gq = this.gauge;
    const el = (this.g.time - gq.t0) / gq.zones.time;
    gq.v = el;
    // tick sound as the needle sweeps
    if (Math.floor(el * 12) !== gq.lastTick) {
      gq.lastTick = Math.floor(el * 12);
      audio.play(gq.kind === 'paste' ? 'squish' : 'gauge', { v: el });
    }
    if (gq.kind === 'screw') {
      const k = Math.min(1, el);
      for (const s of gq.list) {
        s.position.lerpVectors(s.userData.from, s.userData.base, k);
        s.rotateZ(dt * 22);
      }
      const p = this.screenOf(gq.anchor.getWorldPosition(V3()));
      this.g.ui.gauge({ ...p, v: el, zones: gq.zones, label: 'TORQUE' });
      if (el > 1.25) this.endGauge();
    } else {
      this.setBlob(el);
      const cpuW = this.slotWorld('cpu');
      const p = this.screenOf(cpuW);
      this.g.ui.gauge({ ...p, v: el, zones: gq.zones, label: 'PASTE' });
      this.pasteRing.visible = true;
      this.pasteRing.position.copy(cpuW).add(V3(0, 0, 0.09));
      const target = (0.15 + 0.77 * 1.25) * 0.1;
      this.pasteRing.scale.setScalar(target / 0.2);
      if (el > 1.2) this.endGauge();
    }
  }
  endGauge(cancel = false) {
    const gq = this.gauge;
    if (!gq) return;
    this.gauge = null;
    this.g.ui.gauge(null);
    this.pasteRing.visible = false;
    if (cancel) {
      if (gq.kind === 'screw') for (const s of gq.list) {
        s.userData.busy = false;
        if (!s.userData.tight) s.position.copy(s.userData.from);
      }
      return;
    }
    const v = gq.v, z = gq.zones;
    if (gq.kind === 'screw') {
      const pos = gq.anchor.getWorldPosition(V3());
      if (v < 0.4) {
        // too loose — screw backs out, try again
        for (const s of gq.list) {
          s.userData.busy = false;
          tweenObj(s, { pos: s.userData.from.clone(), duration: 0.2 });
        }
        audio.play('error');
        this.g.fx.float(pos, 'TOO LOOSE', 'bad');
        return;
      }
      const tier = v >= z.perfect[0] && v <= z.perfect[1] ? 'perfect' : v >= z.green[0] && v <= z.green[1] ? 'great' : v < z.green[0] ? 'good' : 'sloppy';
      for (const s of gq.list) {
        s.position.copy(s.userData.base);
        s.userData.tight = true;
        s.userData.busy = false;
        this.g.fx.burst(s.getWorldPosition(V3()), { count: tier === 'perfect' ? 18 : 8, speed: 1.4, size: 0.32, color: tier === 'perfect' ? '#fde68a' : '#e2e8f0', color2: '#fef3c7' });
      }
      audio.play(tier === 'sloppy' ? 'error' : 'screw');
      const label = tier === 'sloppy' ? 'OVER-TORQUED' : gq.list.length > 1 ? `×${gq.list.length}` : '';
      for (let i = 0; i < gq.list.length; i++) this.g.judge('screw', tier, pos, i === 0 ? label : null, i > 0);
      this.refreshTicket();
    } else {
      this.paste.amount = Math.min(v, 1.2);
      const pos = this.slotWorld('cpu').add(V3(0, 0.3, 0.2));
      if (v < PASTE.min) {
        this.g.fx.float(pos, 'MORE PASTE…', '');
        return;
      }
      this.paste.done = true;
      const tier = v >= z.perfect[0] && v <= z.perfect[1] ? 'perfect' : v >= z.green[0] && v <= z.green[1] ? 'great' : v < z.green[0] ? 'good' : 'sloppy';
      audio.play('squish', { v: 1 });
      this.g.judge('paste', tier, pos, tier === 'sloppy' ? 'TOO MUCH!' : tier === 'perfect' ? 'Perfect pea!' : null);
      this.refreshTicket();
    }
  }

  async lockCPU() {
    if (this.cpuLocked) return;
    this.cpuLocked = true;
    const r = this.slot.mb.obj.userData.refs;
    const p0 = r.plate.rotation.y, l0 = r.lever.rotation.x;
    await tweens.add({ duration: 0.2, ease: Ease.inCubic, update: (e) => (r.plate.rotation.y = p0 * (1 - e)) });
    audio.play('clack', { pitch: 0.7 });
    await tweens.add({ duration: 0.18, ease: Ease.inCubic, update: (e) => (r.lever.rotation.x = l0 * (1 - e)) });
    audio.play('lever');
    this.g.fx.shake(0.05);
    this.g.action(this.leverWorld(), 'LOCKED');
    this.refreshTicket();
  }
  unlockCPU() {
    if (!this.slot.mb) return;
    const r = this.slot.mb.obj.userData.refs;
    this.cpuLocked = false;
    tweens.add({ duration: 0.25, update: (e) => { r.lever.rotation.x = 1.15 * e; r.plate.rotation.y = -1.75 * e; } });
  }

  async connect(id, delay = 0, instant = false, tier = 'great') {
    if (this.cables[id]) return;
    this.removeStub(id);
    const pts = this.cablePath(id);
    const { strands, off } = this.cableSpec(id);
    const cable = MD.buildCable(pts, strands, off, 0.034, cableMat(this.order.caseVariant));
    cable.userData.it = { type: 'cable', id };
    this.caseObj.add(cable);
    this.cables[id] = cable;
    if (instant) {
      MD.setCableGrowth(cable, 1);
      return;
    }
    MD.setCableGrowth(cable, 0);
    if (delay) await wait(delay);
    await tweens.add({ duration: 0.18, ease: Ease.outCubic, update: (e) => MD.setCableGrowth(cable, e) });
    MD.setCableGrowth(cable, 1);
    audio.play('plug');
    const pw = this.portWorld(id);
    this.g.fx.burst(pw, { count: 16, color: '#fde047', color2: '#fb923c', speed: 1.8, size: 0.4 });
    this.g.judge('cable', tier, pw, tier === 'perfect' ? 'Clean route!' : null);
    this.refreshTicket();
  }
  async unplug(id) {
    const cable = this.cables[id];
    if (!cable || this.panelOn || this.testing) return;
    this.cables[id] = null;
    audio.play('plug', { pitch: 0.8 });
    await tweens.add({ duration: 0.22, ease: Ease.inCubic, update: (e) => MD.setCableGrowth(cable, 1 - e) });
    cable.removeFromParent();
    cable.traverse((o) => o.isMesh && o.geometry && !o.geometry.userData.shared && o.geometry.dispose());
    this.refreshTicket();
  }

  async closePanel() {
    if (this.panelOn) return;
    this.panelOn = true;
    const p = this.panel;
    this.caseObj.attach(p);
    audio.play('whoosh');
    const mid = SLOTS.panel.clone().add(V3(-0.5, 0.4, 1.4));
    await tweenObj(p, { pos: mid, quat: qEuler(0, 0.2, 0), duration: 0.32, ease: Ease.inOutCubic });
    await tweenObj(p, { pos: SLOTS.panel.clone(), quat: QI(), duration: 0.24, ease: Ease.outCubic });
    audio.play('glass');
    audio.play('snap', { pitch: 0.8 });
    this.g.fx.shake(0.06);
    this.g.post.pulse('#c7d2fe', 0.1);
    this.g.action(p.getWorldPosition(V3()).add(V3(0, 1, 0)), 'SEALED');
    this.refreshTicket();
  }
  async openPanel() {
    const p = this.panel;
    this.scene.attach(p);
    audio.play('whoosh');
    await tweenObj(p, { pos: PANEL_PARK.pos.clone(), quat: PANEL_PARK.quat.clone(), duration: 0.6, ease: Ease.inOutCubic });
    this.panelOn = false;
  }

  // ------------------------------------------------------------------ install / remove
  canInstallNow(part) {
    return !this.prereq(part.cat) && !this.slot[part.cat] && !this.panelOn && !this.testing;
  }

  async install(part, instant = false, tier = 'great') {
    const cat = part.cat;
    this.slot[cat] = part;
    part.state = 'anim';
    const obj = part.obj;
    for (const c of obj.children) if (c.userData.aura) c.visible = false;
    this.caseObj.attach(obj);
    const slot = SLOTS[cat].clone();
    if (instant) {
      obj.position.copy(slot);
      obj.quaternion.identity();
      obj.scale.setScalar(1);
    } else {
      const above = slot.clone().add(V3(0, 0, cat === 'psu' ? 0.6 : 0.22));
      await tweenObj(obj, { pos: above, quat: QI(), scale: 1, duration: 0.11, ease: Ease.outCubic });
      await tweenObj(obj, { pos: slot, duration: 0.07, ease: Ease.inQuad });
    }
    part.state = 'installed';
    MD.swapMaterial(obj, M.rgbIdle, M.rgb);
    for (const sc of part.screws) {
      sc.visible = true;
      sc.userData.tight = !!instant;
      sc.position.copy(sc.userData.base);
      if (!instant) sc.position.addScaledVector(sc.userData.axis, 0.16);
    }
    if (cat === 'ram' && this.slot.mb) {
      const latches = this.slot.mb.obj.userData.refs.latches;
      if (instant) latches.forEach((l) => (l.obj.rotation.x = 0));
      else tweens.add({ duration: 0.12, delay: 0.02, ease: Ease.outBack, update: (e) => latches.forEach((l) => (l.obj.rotation.x = l.dir * 0.45 * (1 - e))) });
    }
    if (cat === 'cooler' && this.paste.blob) {
      // the cooler squashes the paste flat
      const b = this.paste.blob;
      b.scale.z = 0.12;
    }
    if (instant) return;
    const wp = this.partWorldCenter(part);
    const ok = part.spec.id === this.order.parts[cat];
    audio.play(cat === 'ram' ? 'clack' : cat === 'psu' ? 'thump' : 'snap', { pitch: this.g.comboPitch() });
    if (cat === 'psu' || cat === 'mb') audio.play('snap', { pitch: this.g.comboPitch() * 0.8 });
    this.g.fx.burst(wp, { count: tier === 'perfect' ? 40 : 24, speed: tier === 'perfect' ? 3.2 : 2.2, color: tier === 'perfect' ? '#fde68a' : '#a5f3fc', color2: tier === 'perfect' ? '#fbbf24' : '#c4b5fd' });
    this.g.fx.ring(this.slotWorld(cat).add(V3(0, 0, 0.3)), { color: tier === 'perfect' ? '#facc15' : '#67e8f9', radius: 1.2, axis: 'z' });
    this.g.fx.shake(cat === 'psu' || cat === 'mb' || cat === 'gpu' ? 0.08 : 0.04);
    if (ok) this.g.judge('place', tier, wp);
    else this.g.wrong(wp);
    this.refreshTicket();
  }

  uninstall(part) {
    const cat = part.cat;
    if (this.slot[cat] === part) this.slot[cat] = null;
    if (cat === 'cpu') {
      if (this.cpuLocked) this.unlockCPU();
      if (this.paste.blob) {
        this.paste.blob.removeFromParent();
        this.paste = { amount: 0, done: false, blob: null };
      }
    }
    if (cat === 'cooler' && this.paste.blob) this.setBlob(this.paste.amount);
    if (cat === 'ram' && this.slot.mb) {
      const latches = this.slot.mb.obj.userData.refs.latches;
      tweens.add({ duration: 0.15, update: (e) => latches.forEach((l) => (l.obj.rotation.x = l.dir * 0.45 * e)) });
    }
    for (const sc of part.screws) {
      sc.visible = false;
      sc.userData.tight = false;
    }
    for (const c of part.obj.children) if (c.userData.aura) c.visible = true;
    MD.swapMaterial(part.obj, M.rgb, M.rgbIdle);
    this.scene.attach(part.obj);
    this.refreshTicket();
  }

  async returnToTray(part) {
    part.state = 'anim';
    this.hideGhost(part);
    audio.play('drop');
    await tweenObj(part.obj, { pos: part.base.pos.clone(), quat: part.base.quat.clone(), scale: part.trayScale, duration: 0.4, ease: Ease.outCubic });
    part.state = 'tray';
  }

  ghostFor(part) {
    if (!part.ghost) {
      const gh = ghostClone(part.obj, this.ghostMat);
      gh.position.copy(SLOTS[part.cat]);
      gh.quaternion.identity();
      gh.scale.setScalar(1);
      part.ghost = gh;
    }
    return part.ghost;
  }
  showGhost(part, hot) {
    const gh = this.ghostFor(part);
    if (!gh.parent) this.caseObj.add(gh);
    gh.visible = true;
    const mat = hot ? this.ghostHotMat : this.ghostMat;
    if (gh.userData.mat !== mat) {
      gh.traverse((o) => o.isMesh && (o.material = mat));
      gh.userData.mat = mat;
    }
  }
  hideGhost(part) {
    if (part.ghost) part.ghost.visible = false;
  }
  showReticle(at, d, perfR, hot) {
    this.reticle.visible = true;
    this.reticle.position.copy(at).add(V3(0, 0, 0.45));
    const r = Math.max(perfR, Math.min(MAGNET, d));
    this.retInner.scale.setScalar(r);
    this.retPerfect.scale.setScalar(perfR / 0.2);
    const gold = d <= perfR;
    this.retInner.material.color.set(gold ? '#facc15' : hot ? '#a5f3fc' : '#67e8f9');
    this.retOuter.material.opacity = hot ? 0.7 : 0.35;
  }

  // ------------------------------------------------------------------ input
  pickHit(ndc) {
    const rc = this.g.raycaster;
    rc.setFromCamera(ndc, this.g.camera);
    const markers = this.clickables.filter((c) => c.marker.visible).map((c) => c.marker);
    const hit = markers.length ? rc.intersectObjects(markers, false)[0] : null;
    if (hit) return hit.object.userData.it;
    const roots = [...this.parts.map((p) => p.obj), this.panel, this.caseObj];
    const hits = rc.intersectObjects(roots, true);
    for (const h of hits) {
      const mat = h.object.material;
      if (mat === this.ghostMat || mat === this.ghostHotMat || h.object.userData.aura) continue;
      if (h.object.userData.hitbox) {
        const it = h.object.parent.userData.it;
        if (it && it.part.state === 'tray') return it;
        continue;
      }
      if (!visibleChain(h.object)) continue;
      let o = h.object;
      while (o) {
        if (o.userData && o.userData.it) return o.userData.it;
        o = o.parent;
      }
      return null;
    }
    return null;
  }

  onDown(ndc, ev) {
    if (!this.active || this.testing) return;
    if (this.held) {
      if (this.held.sticky) this.held.type === 'cable' ? this.releaseCable() : this.release();
      return;
    }
    if (this.gauge) return;
    const it = this.pickHit(ndc);
    if (!it) return;
    if (it.type === 'click') {
      const c = it.c;
      if (c.avail()) c.onDown(ev);
      else if (c.id === 'panel' && !this.panelOn) {
        const n = this.remainingCount();
        this.g.toast(`Finish the build first — ${n} step${n === 1 ? '' : 's'} to go`, 'warn');
        audio.play('error');
      }
      return;
    }
    if (it.type === 'cable') {
      if (!this.panelOn) this.unplug(it.id);
      return;
    }
    if (it.type === 'part') {
      const part = it.part;
      if (part.state === 'anim' || part.state === 'held') return;
      if (part.state === 'installed') {
        const why = this.canRemove(part);
        if (why) {
          this.g.toast(why, 'warn');
          audio.play('error');
          return;
        }
        this.uninstall(part);
      }
      this.startHold(part, ev);
    }
  }

  startHold(part, ev) {
    const fromInstalled = part.state !== 'tray';
    tweens.cancel(part.obj.uuid + ':xf');
    tweens.cancel(part.obj.uuid + ':spawn');
    if (this.hover === part) this.hover = null;
    part.state = 'held';
    const slotW = this.slotWorld(part.cat);
    const z0 = slotW.z + part.center.z + 0.32;
    this.held = {
      type: 'part', part, plane: new THREE.Plane(V3(0, 0, 1), -z0), t0: performance.now(), x0: ev.clientX, y0: ev.clientY,
      moved: false, sticky: false, magnet: false, fromInstalled, d: 9, inPerfect: false,
    };
    audio.play('pick');
    this.g.ui.tooltip(null);
  }

  onMove(ndc, ev) {
    if (!this.active) return;
    if (this.held) {
      if (Math.hypot(ev.clientX - this.held.x0, ev.clientY - this.held.y0) > 7) this.held.moved = true;
      return;
    }
    if (this.testing || this.gauge) return;
    const it = this.pickHit(ndc);
    let hov = null;
    if (it && it.type === 'part' && it.part.state === 'tray') hov = it.part;
    if (hov !== this.hover) {
      this.hover = hov;
      if (hov) audio.play('hover');
    }
    if (hov) this.g.ui.tooltip({ title: hov.spec.name, sub: hov.spec.spec, cat: hov.spec.legendary ? 'LEGENDARY · ' + CAT_LABEL[hov.cat] : CAT_LABEL[hov.cat], color: hov.spec.legendary ? '#facc15' : CAT_COLOR[hov.cat] }, ev.clientX, ev.clientY);
    else if (it && it.type === 'part' && it.part.state === 'installed') this.g.ui.tooltip({ title: it.part.spec.name, sub: this.canRemove(it.part) || 'Drag to remove', cat: 'Installed', color: CAT_COLOR[it.part.cat] }, ev.clientX, ev.clientY);
    else this.g.ui.tooltip(null);
    let cursor = 'default';
    if (it) {
      if (it.type === 'part') cursor = 'grab';
      else if (it.type === 'click') cursor = it.c.avail() || it.c.id === 'panel' ? 'pointer' : 'default';
      else if (it.type === 'cable') cursor = this.panelOn ? 'default' : 'pointer';
    }
    this.g.setCursor(cursor);
  }

  onUp(ndc, ev) {
    if (this.gauge) {
      this.endGauge();
      return;
    }
    const h = this.held;
    if (!h || h.sticky) return;
    const quick = !h.moved && performance.now() - h.t0 < 260;
    if (h.type === 'cable') {
      if (quick) {
        h.sticky = true;
        return;
      }
      this.releaseCable();
      return;
    }
    if (quick) {
      if (this.g.hasUpgrade('gloves') && !h.fromInstalled && this.canInstallNow(h.part)) {
        this.held = null;
        this.hideGhost(h.part);
        this.install(h.part, false, 'great');
        return;
      }
      h.sticky = true;
      return;
    }
    this.release();
  }

  release() {
    const h = this.held;
    if (!h) return;
    this.held = null;
    this.reticle.visible = false;
    const part = h.part;
    this.hideGhost(part);
    if (h.magnet) {
      const perfR = this.g.hasUpgrade('optics') ? 0.32 : 0.2;
      const tier = h.d <= perfR ? 'perfect' : h.d <= 0.45 ? 'great' : 'good';
      this.install(part, false, tier);
      return;
    }
    const slotW = this.slotWorld(part.cat);
    const d = Math.hypot(part.obj.position.x - slotW.x, part.obj.position.y - slotW.y);
    if (d < 1.2) {
      const why = this.prereq(part.cat) || (this.slot[part.cat] ? `That slot is taken — drag the installed ${CAT_LABEL[part.cat].toLowerCase()} out first` : null);
      if (why) {
        this.g.toast(why, 'warn');
        audio.play('error');
      }
    }
    this.returnToTray(part);
  }

  cancelHold() {
    if (this.gauge) this.endGauge(true);
    if (this.held) {
      const h = this.held;
      this.held = null;
      this.reticle.visible = false;
      if (h.type === 'cable') this.removeStub(h.id);
      else this.returnToTray(h.part);
    }
  }

  // ------------------------------------------------------------------ frame update
  update(dt, t) {
    if (!this.caseObj) return;
    if (this.fanSpeed > 0.001) for (const r of this.rotors) r.rotation.z += dt * 28 * this.fanSpeed;
    // floating parts on their pads
    for (const p of this.parts) {
      if (p.state !== 'tray') continue;
      const lift = this.hover === p ? 0.16 : 0;
      p.hoverLift = damp(p.hoverLift || 0, lift, 10, dt);
      p.obj.position.copy(p.base.pos).add(V3(0, Math.sin(t * 1.6 + p.phase) * 0.04 + p.hoverLift, 0));
      const yaw = this.hover === p ? 0 : Math.sin(t * 0.55 + p.phase) * 0.28;
      p.yaw = damp(p.yaw || 0, yaw, 6, dt);
      p.obj.quaternion.copy(p.base.quat).premultiply(TMPQ.setFromAxisAngle(UP, p.yaw));
    }
    if (!this.active) return;

    if (this.gauge) this.updateGauge(dt);
    // cable stubs appear once both ends are installed
    for (const id of ['c24', 'c8', 'cgpu']) {
      const want = this.portAvail(id) && !this.cables[id] && !this.panelOn;
      const dragging = this.held && this.held.type === 'cable' && this.held.id === id;
      if (want && !this.stubs[id]) this.ensureStub(id);
      else if (!want && this.stubs[id] && !dragging) this.removeStub(id);
    }

    const h = this.held;
    if (h && h.type === 'cable') this.updateCableDrag();
    else if (h) {
      const part = h.part, obj = part.obj;
      const rc = this.g.raycaster;
      rc.setFromCamera(this.g.pointer, this.g.camera);
      const p = rc.ray.intersectPlane(h.plane, V3());
      const sc = damp(obj.scale.x, 1, 14, dt);
      obj.scale.setScalar(sc);
      obj.quaternion.slerp(QI(), 1 - Math.exp(-14 * dt));
      if (p) {
        const off = part.center.clone().multiplyScalar(sc).applyQuaternion(obj.quaternion);
        const target = p.sub(off);
        const slotW = this.slotWorld(part.cat);
        const can = this.canInstallNow(part);
        const d = Math.hypot(target.x - slotW.x, target.y - slotW.y);
        h.d = d;
        h.magnet = can && d < MAGNET;
        const perfR = this.g.hasUpgrade('optics') ? 0.32 : 0.2;
        const inP = h.magnet && d <= perfR;
        if (inP && !h.inPerfect) audio.play('zone');
        h.inPerfect = inP;
        if (h.magnet) target.lerp(slotW.clone().add(V3(0, 0, 0.2)), 0.55);
        const prev = obj.position.clone();
        obj.position.x = damp(obj.position.x, target.x, 22, dt);
        obj.position.y = damp(obj.position.y, target.y, 22, dt);
        obj.position.z = damp(obj.position.z, target.z, 16, dt);
        const vx = (obj.position.x - prev.x) / Math.max(dt, 1e-3);
        obj.rotateZ(clamp(-vx * 0.004, -0.08, 0.08));
        if (can) {
          this.showGhost(part, inP);
          this.showReticle(slotW, d, perfR, h.magnet);
        } else {
          this.hideGhost(part);
          this.reticle.visible = false;
        }
      }
    }

    // markers
    const pulse = 1 + Math.sin(t * 6) * 0.12;
    for (const c of this.clickables) {
      const v = c.avail();
      c.marker.visible = v;
      if (v) {
        c.marker.position.copy(c.pos());
        const s = c.marker.userData.baseSize * pulse;
        c.marker.scale.set(s, s, s);
      }
    }
    if (!this.testing) M.ledGreen.emissiveIntensity = this.panelOn ? 0.6 + Math.sin(t * 5) * 0.5 : 0;

    const st = this.held || this.gauge ? null : this.currentStep();
    const idle = (performance.now() - this.lastAction) / 1000;
    const showHint = st && !this.testing && this.g.save.settings.hints && (this.order.tutorial || this.g.forceHint || idle > 7 || st.wrong);
    this.hintArrow.visible = !!showHint;
    if (showHint) {
      const p = st.target();
      this.hintArrow.position.set(p.x, p.y + 0.55 + Math.abs(Math.sin(t * 4)) * 0.25, p.z);
    }
    if (st && st.id !== this.lastStepId) {
      this.lastStepId = st.id;
      this.g.onStep(st.id);
    }
    let prompt = null, warn = false;
    if (this.testing) prompt = null;
    else if (this.gauge) prompt = this.gauge.kind === 'screw' ? 'Release in the GOLD zone for perfect torque!' : 'Release when the paste fills the gold ring!';
    else if (this.held && this.held.type === 'cable') prompt = this.held.snap ? 'Release to plug it in!' : 'Drag the connector to its glowing port';
    else if (this.held) prompt = this.held.magnet ? (this.held.inPerfect ? 'PERFECT alignment — release!' : 'Line it up with the gold ring for a PERFECT') : this.canInstallNow(this.held.part) ? 'Move it over the glowing outline' : this.prereq(this.held.part.cat) || 'That slot is already taken';
    else if (st) {
      prompt = st.text;
      warn = st.wrong;
    }
    this.g.ui.prompt(prompt, warn);
  }

  refreshTicket() {
    const status = {};
    for (const cat of ORDER) {
      if (!this.order.parts[cat]) continue;
      const p = this.slot[cat];
      status[cat] = !p ? 'none' : p.spec.id === this.order.parts[cat] ? 'ok' : 'bad';
    }
    this.g.ui.ticketStatus(status);
    this.lastAction = performance.now();
  }

  // ------------------------------------------------------------------ QA & benchmark
  collectRotors() {
    this.rotors = [];
    this.caseObj.traverse((o) => o.userData.isRotor && this.rotors.push(o));
  }
  qaLines() {
    const o = this.order.parts;
    const out = [];
    for (const cat of ['cpu', 'cooler', 'ram', 'ssd', 'gpu', 'psu']) {
      if (!o[cat]) continue;
      const inst = this.slot[cat] && this.slot[cat].spec;
      out.push({ cat, label: CAT_LABEL[cat], name: inst ? inst.name : 'missing', want: PARTS[o[cat]].name, ok: !!inst && inst.id === o[cat] });
    }
    return out;
  }

  drawScreen(mode, lines = [], extra = {}) {
    const { ctx, tex } = this.g.env.screen;
    const W = 1024, H = 600;
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#060a16');
    bg.addColorStop(1, '#0a0618');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    // scanlines
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
    if (mode === 'off') {
      ctx.fillStyle = 'rgba(103,232,249,0.35)';
      ctx.font = T.font(700, 30);
      ctx.textAlign = 'center';
      ctx.fillText('QA TERMINAL · STANDBY', W / 2, H / 2 + 10);
      ctx.textAlign = 'left';
      tex.needsUpdate = true;
      return;
    }
    if (mode === 'splash') {
      ctx.drawImage(T.logoCanvas(900, 225), 62, 150);
      ctx.fillStyle = '#7dd3fc';
      ctx.font = T.font(700, 30);
      ctx.textAlign = 'center';
      ctx.fillText('FORGE-7 QUALITY ASSURANCE · POWER-ON SELF TEST', W / 2, 460);
      ctx.textAlign = 'left';
      tex.needsUpdate = true;
      return;
    }
    if (mode === 'bench') {
      const { score = 0, k = 0, record = false, best = 0 } = extra;
      ctx.fillStyle = '#a78bfa';
      ctx.font = T.font(700, 40);
      ctx.fillText('STRESS TEST · ' + this.order.no, 40, 66);
      // bars
      for (let i = 0; i < 24; i++) {
        const hh = (0.3 + 0.7 * Math.abs(Math.sin(i * 1.7 + k * 14))) * 180 * Math.min(1, k * 1.5);
        const gr = ctx.createLinearGradient(0, 420 - hh, 0, 420);
        gr.addColorStop(0, '#facc15');
        gr.addColorStop(1, '#7c3aed');
        ctx.fillStyle = gr;
        ctx.fillRect(60 + i * 38, 420 - hh, 26, hh);
      }
      ctx.fillStyle = '#f8fafc';
      ctx.font = T.font(700, 120);
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(score).toLocaleString('en-US'), W - 50, 200);
      ctx.font = T.font(700, 30);
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('ANDROMARK SCORE' + (best ? ` · BEST ${best.toLocaleString('en-US')}` : ''), W - 50, 245);
      if (record) {
        ctx.fillStyle = '#facc15';
        ctx.font = T.font(700, 52);
        ctx.textAlign = 'center';
        ctx.fillText('★ NEW TIER RECORD ★', W / 2, 520);
      }
      ctx.textAlign = 'left';
      tex.needsUpdate = true;
      return;
    }
    ctx.fillStyle = '#a78bfa';
    ctx.font = T.font(700, 40);
    ctx.fillText('ANDROMEDA QA  ·  ' + this.order.no, 40, 64);
    ctx.fillStyle = '#334155';
    ctx.fillRect(40, 84, W - 80, 3);
    ctx.font = '600 30px Consolas, "Courier New", monospace';
    lines.forEach((l, i) => {
      const y = 140 + i * 56;
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(l.label.toUpperCase().padEnd(10, ' '), 40, y);
      ctx.fillStyle = l.ok ? '#e2e8f0' : '#fca5a5';
      ctx.fillText(l.name, 280, y);
      ctx.fillStyle = l.ok ? '#4ade80' : '#f87171';
      ctx.textAlign = 'right';
      ctx.fillText(l.ok ? '[ OK ]' : '[FAIL]', W - 40, y);
      ctx.textAlign = 'left';
      if (!l.ok) {
        ctx.fillStyle = '#fca5a5';
        ctx.font = '500 20px Consolas, monospace';
        ctx.fillText('expected: ' + l.want, 280, y + 22);
        ctx.font = '600 30px Consolas, "Courier New", monospace';
      }
    });
    if (mode === 'pass' || mode === 'fail' || mode === 'rgb') {
      ctx.fillStyle = mode === 'fail' ? '#7f1d1d' : '#14532d';
      ctx.fillRect(40, H - 110, W - 80, 70);
      ctx.fillStyle = mode === 'fail' ? '#fecaca' : '#bbf7d0';
      ctx.font = T.font(700, 42);
      ctx.textAlign = 'center';
      ctx.fillText(mode === 'fail' ? 'QA FAILED — OPEN THE CASE AND FIX IT' : mode === 'rgb' ? 'SET RGB PROFILE: ' + (extra.rgb || '').toUpperCase() : 'ALL SYSTEMS NOMINAL', W / 2, H - 62);
      ctx.textAlign = 'left';
    }
    tex.needsUpdate = true;
  }

  async runTest() {
    if (this.testing) return;
    this.testing = true;
    const gen = this.g.gen;
    const dead = () => gen !== this.g.gen;
    this.g.action(this.caseObj.userData.caseRefs.btn.getWorldPosition(V3()), 'POWER ON');
    this.g.onTestStart();
    const refs = this.caseObj.userData.caseRefs;
    await tweens.add({ duration: 0.08, update: (e) => (refs.cap.position.y = 0.03 - e * 0.025) });
    audio.play('power');
    await tweens.add({ duration: 0.12, update: (e) => (refs.cap.position.y = 0.005 + e * 0.025) });
    M.ledGreen.emissiveIntensity = 2.5;
    this.collectRotors();
    audio.humStart();
    tweens.add({ duration: 1.4, ease: Ease.inOutSine, update: (e) => (this.fanSpeed = e) });
    this.g.setRgbMode(this.g.themeColor());
    tweens.add({ duration: 1.2, update: (e) => (M.rgb.emissiveIntensity = e * 2.6) });
    this.g.post.pulse('#c4b5fd', 0.18);
    this.drawScreen('splash');
    await wait(1.0);
    if (dead()) return;
    const lines = this.qaLines();
    for (let i = 1; i <= lines.length; i++) {
      this.drawScreen('list', lines.slice(0, i));
      audio.play(lines[i - 1].ok ? 'tick' : 'error', { pitch: 1 + i * 0.05 });
      await wait(0.22);
      if (dead()) return;
    }
    const fails = lines.filter((l) => !l.ok);
    if (fails.length) {
      this.drawScreen('fail', lines);
      audio.play('fail');
      this.g.setRgbMode('#ef4444');
      this.g.post.pulse('#ef4444', 0.25);
      await wait(1.5);
      if (dead()) return;
      await this.powerOff();
      await this.openPanel();
      if (dead()) return;
      this.testing = false;
      this.g.onQAFail(fails);
      this.drawScreen('fail', lines);
      return;
    }
    this.drawScreen('pass', lines);
    audio.play('success');
    this.g.fx.burst(this.caseObj.localToWorld(V3(0, 3, 1.2)), { count: 60, speed: 3.5, size: 0.7 });
    await wait(0.5);
    if (dead()) return;
    // stress test benchmark — number goes up
    const tier = TIERS.find((x) => x.id === this.order.tier);
    const q = this.g.currentQuality();
    const score = Math.round(tier.bench * (0.74 + 0.26 * q) * (0.985 + Math.random() * 0.03));
    const best = (this.g.save.records && this.g.save.records[tier.id]) || 0;
    const record = score > best;
    tweens.add({ duration: 0.4, update: (e) => (this.fanSpeed = 1 + e * 1.4) });
    audio.play('drill');
    let lastTick = 0;
    await tweens.add({
      duration: 1.7, ease: Ease.outCubic,
      update: (e, k) => {
        this.drawScreen('bench', [], { score: score * e, k, best });
        if (k - lastTick > 0.06) {
          lastTick = k;
          audio.play('coin', { pitch: 0.7 + e * 0.8 });
        }
      },
    });
    this.drawScreen('bench', [], { score, k: 1, record, best });
    this.g.onBenchmark(score, record);
    if (record) {
      audio.play('levelup');
      this.g.fx.confetti(this.g.env.monitor.getWorldPosition(V3()).add(V3(0, -1, 2)), 90);
    }
    await wait(record ? 1.1 : 0.6);
    if (dead()) return;
    tweens.add({ duration: 0.5, update: (e) => (this.fanSpeed = 2.4 - e * 1.4) });
    if (this.order.rgb) {
      const want = RGB_COLORS.find((c) => c.id === this.order.rgb);
      this.drawScreen('rgb', lines, { rgb: want.name });
      const t0 = performance.now();
      let first = true;
      await this.g.ui.pickRgb(want, (c) => {
        this.g.setRgbMode(c.hex || 'rainbow');
        const right = c.id === want.id;
        audio.play(right ? 'success' : 'tick');
        if (right) this.g.judge('rgb', first && performance.now() - t0 < 3500 ? 'perfect' : first ? 'great' : 'good', this.caseObj.localToWorld(V3(0, 3.5, 1.2)), 'Perfect glow!');
        first = false;
      });
      this.drawScreen('pass', lines);
      await wait(0.8);
    } else await wait(0.3);
    if (dead()) return;
    await this.powerOff();
    if (dead()) return;
    this.testing = false;
    this.g.onTestPassed();
  }

  async powerOff() {
    audio.humStop();
    const i0 = M.rgb.emissiveIntensity, f0 = this.fanSpeed;
    await tweens.add({ duration: 0.9, ease: Ease.inOutSine, update: (e) => { this.fanSpeed = f0 * (1 - e); M.rgb.emissiveIntensity = i0 * (1 - e); } });
    this.fanSpeed = 0;
    M.ledGreen.emissiveIntensity = 0;
    this.drawScreen('off');
  }

  // Debug/QA helper used by the automated playtest
  debugComplete() {
    for (const cat of ORDER) {
      const id = this.order.parts[cat];
      if (!id || this.slot[cat]) continue;
      const p = this.trayPartFor(cat);
      if (p) this.install(p, true);
    }
    const r = this.slot.mb.obj.userData.refs;
    r.plate.rotation.y = 0;
    r.lever.rotation.x = 0;
    this.cpuLocked = true;
    this.paste.done = true;
    for (const cat of ORDER) {
      const p = this.slot[cat];
      if (p) for (const sc of p.screws) {
        sc.userData.tight = true;
        sc.position.copy(sc.userData.base);
      }
    }
    for (const id of ['c24', 'c8', 'cgpu']) if (id !== 'cgpu' || this.needGpu) this.connect(id, 0, true);
    this.refreshTicket();
  }

  // ------------------------------------------------------------------ showcase build (title screen)
  buildShowcase(order) {
    this.order = order;
    this.slot = { mb: null, cpu: null, cooler: null, ram: null, ssd: null, gpu: null, psu: null };
    this.cables = { c24: null, c8: null, cgpu: null };
    this.paste = { amount: 0, done: true, blob: null };
    const c = MD.buildCase(order.caseVariant);
    c.position.copy(CASE_POS);
    this.scene.add(c);
    this.caseObj = c;
    for (const cat of ORDER) {
      const id = order.parts[cat];
      if (!id) continue;
      const obj = MD.buildPart(PARTS[id]);
      const refs = obj.userData.refs || {};
      const screws = refs.screws ? refs.screws : refs.screw ? [refs.screw] : [];
      const part = { spec: PARTS[id], cat, obj, center: V3(), screws: [] };
      for (const s of screws) s.visible = true;
      this.scene.add(obj);
      this.install(part, true);
      if (cat === 'mb') {
        const r = obj.userData.refs;
        r.plate.rotation.y = 0;
        r.lever.rotation.x = 0;
        r.latches.forEach((l) => (l.obj.rotation.x = 0));
      }
    }
    for (const id of ['c24', 'c8', 'cgpu']) if (id !== 'cgpu' || this.needGpu) this.connect(id, 0, true);
    const p = MD.buildPanel();
    p.position.copy(SLOTS.panel);
    c.add(p);
    this.panel = p;
    this.collectRotors();
    return c;
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const TMPQ = new THREE.Quaternion();

function visibleChain(o) {
  while (o) {
    if (!o.visible) return false;
    o = o.parent;
  }
  return true;
}

// Rebuild an object tree with ghost material (Object3D.clone would deep-copy userData)
function ghostClone(src, mat) {
  let o;
  if (src.userData.hitbox || src.userData.aura || src.isSprite) return null;
  if (src.isInstancedMesh) {
    o = new THREE.InstancedMesh(src.geometry, mat, src.count);
    o.instanceMatrix.array.set(src.instanceMatrix.array);
  } else if (src.isMesh) o = new THREE.Mesh(src.geometry, mat);
  else o = new THREE.Group();
  o.position.copy(src.position);
  o.quaternion.copy(src.quaternion);
  o.scale.copy(src.scale);
  o.visible = src.visible;
  o.renderOrder = 4;
  o.castShadow = o.receiveShadow = false;
  for (const c of src.children) {
    const k = ghostClone(c, mat);
    if (k) o.add(k);
  }
  return o;
}
