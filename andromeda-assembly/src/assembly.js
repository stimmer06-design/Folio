import * as THREE from 'three';
import { PARTS, CAT_LABEL, CAT_COLOR, RGB_COLORS } from './catalog.js';
import * as MD from './models.js';
import { M } from './models.js';
import * as T from './textures.js';
import { tweens, tweenObj, wait, Ease, V3, QI, qEuler, damp, clamp } from './util.js';
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
export const CASE_POS = V3(0, 0.08, 0);
const PANEL_PARK = { pos: V3(-3.05, 2.55, -2.35), quat: qEuler(-0.08, 0.55, 0.02) };

const RACK_TIERS = [{ y: 0.3, z: 1.75 }, { y: 1.05, z: 0.85 }, { y: 1.8, z: -0.05 }, { y: 2.55, z: -0.95 }];
const RACK_X = [3.55, 5.0, 6.45];
const TRAY_QUAT = qEuler(-0.1, -0.38, 0);
const TRAY_QUAT_RAM = qEuler(-0.1, -1.95, 0);
const HITBOX_MAT = new THREE.MeshBasicMaterial({ visible: false });
const ORDER = ['mb', 'cpu', 'cooler', 'ram', 'ssd', 'gpu', 'psu'];

function trayScaleFor(spec) {
  switch (spec.cat) {
    case 'mb': return 0.27;
    case 'cpu': return 1.15;
    case 'cooler': return spec.kind === 'stock' ? 0.85 : spec.kind === 'tower' ? 0.55 : 0.3;
    case 'ram': return 0.62;
    case 'ssd': return 1.15;
    case 'gpu': return 0.4;
    case 'psu': return 0.52;
  }
  return 0.5;
}

const CABLE_MATS = {};
function cableMat(variant) {
  if (!CABLE_MATS[variant.id]) {
    const col = variant.id === 'lumen' ? '#e8e9ee' : variant.id === 'eclipse' ? '#5b3fb8' : '#15161b';
    CABLE_MATS[variant.id] = MD.std({ color: col, roughness: 0.8 });
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
    this.active = false;
    this.fanSpeed = 0;
    this.rotors = [];
    this.tmpV = V3();
    this.hintArrow = MD.buildHintArrow();
    this.hintArrow.visible = false;
    this.scene.add(this.hintArrow);
    this.hover = null;
  }

  // ------------------------------------------------------------------ setup
  async setup(order) {
    this.order = order;
    this.active = true;
    this.testing = false;
    this.slot = { mb: null, cpu: null, cooler: null, ram: null, ssd: null, gpu: null, psu: null };
    this.cpuLocked = false;
    this.cables = { c24: null, c8: null, cgpu: null };
    this.panelOn = false;
    this.lastAction = performance.now();
    this.clickables = [];

    // case drops in
    const c = MD.buildCase(order.caseVariant);
    c.position.set(CASE_POS.x, 9, CASE_POS.z);
    this.scene.add(c);
    this.caseObj = c;
    // glass panel parked against the wall
    const p = MD.buildPanel();
    p.position.copy(PANEL_PARK.pos);
    p.quaternion.copy(PANEL_PARK.quat);
    this.scene.add(p);
    this.panel = p;

    this.buildTray(order);
    this.buildClickables();

    tweenObj(c, { pos: CASE_POS.clone(), duration: 0.75, ease: Ease.outBounce }).then(() => {});
    await wait(0.3);
    audio.play('heavy');
    this.g.fx.shake(0.12);
    this.g.fx.burst(V3(0, 0.2, 0.6), { count: 30, color: '#94a3b8', color2: '#cbd5e1', speed: 3, size: 0.5, up: 0.3 });
    // restock the rack with a satisfying pop cascade
    let i = 0;
    for (const part of this.parts) {
      const s = part.trayScale;
      part.obj.scale.setScalar(0.001);
      part.obj.visible = true;
      const k = i++;
      tweenObj(part.obj, { scale: s, duration: 0.35, delay: 0.05 + k * 0.06, ease: Ease.outBack }).then(() => {});
      tweens.add({ duration: 0.01, delay: 0.05 + k * 0.06, update: (e, kk) => kk >= 1 && audio.play('pop', { pitch: 1 + k * 0.06 }) });
    }
    await wait(0.5 + this.parts.length * 0.06);
    this.refreshTicket();
  }

  buildTray(order) {
    const list = [];
    for (const cat of ORDER) {
      const id = order.parts[cat];
      if (!id) continue;
      const group = [id, ...order.decoys.filter((d) => PARTS[d].cat === cat)];
      // shuffle so the right one is not always first
      group.sort(() => Math.random() - 0.5);
      for (const g of group) list.push(PARTS[g]);
    }
    list.forEach((spec, i) => {
      const obj = MD.buildPart(spec);
      obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(obj);
      const center = box.getCenter(V3());
      const size = box.getSize(V3());
      const tier = RACK_TIERS[Math.floor(i / 3)];
      const col = i % 3;
      const s = trayScaleFor(spec);
      const cell = V3(RACK_X[col], tier.y, tier.z);
      const tq = spec.cat === 'ram' ? TRAY_QUAT_RAM : TRAY_QUAT;
      const off = center.clone().multiplyScalar(s).applyQuaternion(tq);
      const pos = cell.clone().add(V3(0, (size.y * s) / 2 + 0.06, 0)).sub(off);
      obj.position.copy(pos);
      obj.quaternion.copy(tq);
      obj.scale.setScalar(s);
      obj.visible = false;
      // generous invisible pick-box so thin parts are easy to grab from the rack
      const pad = 0.25 / s;
      const hb = new THREE.Mesh(new THREE.BoxGeometry(size.x + pad, size.y + pad, size.z + pad), HITBOX_MAT);
      hb.position.copy(center);
      hb.userData.hitbox = true;
      obj.add(hb);
      const part = { spec, cat: spec.cat, obj, center, size, trayScale: s, tray: { pos: pos.clone(), quat: tq.clone(), scale: s }, state: 'tray', hitbox: hb };
      obj.userData.it = { type: 'part', part };
      const refs = obj.userData.refs || {};
      part.screws = refs.screws ? refs.screws.slice() : refs.screw ? [refs.screw] : [];
      for (const sc of part.screws) {
        sc.userData.base = sc.position.clone();
        sc.userData.axis = V3(0, 0, 1).applyQuaternion(sc.quaternion);
        sc.userData.tight = false;
        sc.visible = false;
      }
      this.scene.add(obj);
      this.parts.push(part);
      // label on rack front
      const tex = T.chipLabel(spec.short, CAT_LABEL[spec.cat], CAT_COLOR[spec.cat]);
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.325), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
      lbl.position.set(cell.x, tier.y - 0.17, tier.z + 0.456);
      this.scene.add(lbl);
      this.labels.push(lbl);
    });
  }

  teardown() {
    for (const p of this.parts) {
      if (p.state !== 'installed') p.obj.removeFromParent();
      if (p.hitbox) p.hitbox.geometry.dispose();
    }
    for (const l of this.labels) {
      l.material.map.dispose();
      l.material.dispose();
      l.geometry.dispose();
      l.removeFromParent();
    }
    for (const c of this.clickables) c.marker.removeFromParent();
    this.labels = [];
    this.clickables = [];
    this.parts = [];
    this.held = null;
    this.active = false;
    this.hintArrow.visible = false;
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
      case 'cpu': return s.mb ? null : 'Install the motherboard first';
      case 'ram': return s.mb ? null : 'Install the motherboard first';
      case 'ssd': return s.mb ? null : 'Install the motherboard first';
      case 'gpu': return s.mb ? null : 'Install the motherboard first';
      case 'cooler': return !s.cpu ? 'Install the CPU first' : !this.cpuLocked ? 'Lock the CPU socket lever first' : null;
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
      case 'mb':
        return s.cpu || s.ram || s.ssd || s.gpu || this.cables.c24 || this.cables.c8 ? 'Remove the parts on the motherboard first' : null;
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
    if (!s.mb || !this.screwsTight(s.mb) || !s.cpu || !this.cpuLocked || !s.cooler || !s.ram || !s.ssd || !this.screwsTight(s.ssd) || !s.psu) return false;
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

  // ------------------------------------------------------------------ steps / hints
  steps() {
    const s = this.slot, o = this.order.parts, out = [];
    const add = (id, done, avail, text, target, wrong = false) => out.push({ id, done, avail, text, target, wrong });
    const partStep = (cat, verb) => {
      const want = PARTS[o[cat]];
      if (s[cat] && !this.isCorrect(cat)) {
        add(cat, false, true, `Wrong ${CAT_LABEL[cat].toLowerCase()}! Drag the ${s[cat].spec.name} back to the rack and fit the ${want.name}`, () => this.partWorldCenter(s[cat]), true);
      } else {
        add(cat, !!s[cat], !this.prereq(cat), `${verb} the ${want.name}`, () => {
          const p = this.trayPartFor(cat);
          return p ? this.partWorldCenter(p) : this.slotWorld(cat);
        });
      }
    };
    const screwStep = (id, cat, text) => {
      const p = s[cat];
      add(id, this.screwsTight(p), !!p, text, () => {
        const sc = p && p.screws.find((x) => !x.userData.tight);
        return sc ? sc.getWorldPosition(V3()) : this.slotWorld(cat);
      });
    };
    partStep('mb', 'Drag onto the brass standoffs:');
    screwStep('mbScrews', 'mb', 'Click the screws to fasten the motherboard');
    partStep('cpu', 'Drop into the socket:');
    add('cpuLock', this.cpuLocked, !!s.cpu, 'Click the socket lever to lock the CPU in', () => this.leverWorld());
    partStep('cooler', 'Mount on the CPU:');
    partStep('ram', 'Click into the memory slots:');
    partStep('ssd', 'Slot into the M.2 connector:');
    screwStep('ssdScrew', 'ssd', 'Click the tiny screw to hold the SSD down');
    if (this.needGpu) {
      partStep('gpu', 'Seat in the PCIe slot:');
      screwStep('gpuScrew', 'gpu', 'Click the bracket screw to secure the graphics card');
    }
    partStep('psu', 'Slide into the bottom chamber:');
    add('c24', !!this.cables.c24, !!(s.mb && s.psu), 'Click the glowing port to plug in the 24-pin power cable', () => this.portWorld('c24'));
    add('c8', !!this.cables.c8, !!(s.mb && s.psu), 'Click the glowing port to plug in the CPU power cable', () => this.portWorld('c8'));
    if (this.needGpu) add('cgpu', !!this.cables.cgpu, !!(s.gpu && s.psu), 'Click the glowing port to power the graphics card', () => this.portWorld('cgpu'));
    add('panel', this.panelOn, this.requiredDone(), 'Click the glass side panel to close up the case', () => this.panel.getWorldPosition(V3()));
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
    // screws (generic: every installed part with loose screws)
    for (const part of this.parts) {
      part.screws.forEach((sc, i) => {
        const c = add({
          id: `screw-${part.cat}-${i}`, size: 0.36,
          avail: () => part.state === 'installed' && !sc.userData.tight && !this.panelOn && !sc.userData.busy,
          pos: () => sc.getWorldPosition(this.tmpV).clone(),
          onClick: () => this.clickScrew(part, sc),
        });
        sc.userData.it = { type: 'click', c };
      });
    }
    // CPU lever
    add({
      id: 'lever', avail: () => !!this.slot.cpu && !this.cpuLocked && this.slot.cpu.state === 'installed' && !!this.slot.mb, pos: () => this.leverWorld(),
      onClick: () => this.lockCPU(),
    });
    // cable ports
    for (const id of ['c24', 'c8', 'cgpu']) {
      add({
        id: 'port-' + id, color: '#fde047', size: 0.42,
        avail: () => !this.cables[id] && !this.panelOn && this.portAvail(id), pos: () => this.portWorld(id),
        onClick: () => this.clickPort(id),
      });
    }
    // panel
    const pc = add({
      id: 'panel', size: 0.9, avail: () => !this.panelOn && this.requiredDone() && !this.testing, pos: () => this.panel.getWorldPosition(this.tmpV).clone(),
      onClick: () => this.closePanel(),
    });
    this.panel.userData.it = { type: 'click', c: pc, always: true };
    // power button
    const btn = this.caseObj.userData.caseRefs.btn;
    const bc = add({
      id: 'power', color: '#86efac', size: 0.5, avail: () => this.panelOn && !this.testing, pos: () => btn.getWorldPosition(this.tmpV).clone().add(V3(0, 0.12, 0)),
      onClick: () => this.runTest(),
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
    if (id === 'cgpu') return !!(s.gpu && s.psu && s.gpu.state === 'installed');
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
  cablePath(id) {
    const p = this.portLocal(id);
    if (id === 'c24') {
      return { pts: [V3(-0.95, 3.25, -1.06), V3(-0.95, 3.25, -0.74), V3(-0.8, 3.25, -0.56), V3(-0.55, 3.25, -0.56), V3(p.x, p.y, p.z + 0.12), V3(p.x, p.y, p.z)], strands: [-1.5, -0.5, 0.5, 1.5], off: V3(0, 0.07, 0) };
    }
    if (id === 'c8') {
      return { pts: [V3(-0.8, 4.72, -1.06), V3(-0.8, 4.72, -0.76), V3(-0.5, 4.68, -0.6), V3(-0.08, 4.58, -0.6), V3(p.x, p.y + 0.02, p.z + 0.12), V3(p.x, p.y, p.z)], strands: [-1.5, -0.5, 0.5, 1.5], off: V3(0.07, 0, 0) };
    }
    return { pts: [V3(0.4, 1.27, 0.55), V3(0.43, 1.42, 0.78), V3(p.x - 0.1, p.y - 0.12, p.z + 0.42), V3(p.x, p.y, p.z + 0.18), V3(p.x, p.y, p.z)], strands: [-1.5, -0.5, 0.5, 1.5], off: V3(0.07, 0, 0) };
  }

  // ------------------------------------------------------------------ actions
  async clickScrew(part, sc) {
    const all = this.g.hasUpgrade('driver');
    const list = all ? part.screws.filter((s) => !s.userData.tight && !s.userData.busy) : [sc];
    audio.play(all ? 'drill' : 'screw');
    const dur = all ? 0.45 : 0.36;
    await Promise.all(list.map((s, i) => {
      s.userData.busy = true;
      const from = s.position.clone();
      const to = s.userData.base.clone();
      let last = 0;
      return tweens.add({
        duration: dur, ease: Ease.inOutSine,
        update: (e) => {
          s.position.lerpVectors(from, to, e);
          s.rotateZ((e - last) * 14);
          last = e;
        },
      }).then(() => {
        s.userData.tight = true;
        s.userData.busy = false;
        this.g.fx.burst(s.getWorldPosition(V3()), { count: 8, speed: 1.2, size: 0.3, color: '#e2e8f0', color2: '#fde68a' });
      });
    }));
    this.g.onAction(sc.getWorldPosition(V3()), all && list.length > 1 ? `×${list.length} Tight!` : 'Tight!');
    this.refreshTicket();
  }

  async lockCPU() {
    if (this.cpuLocked) return;
    this.cpuLocked = true;
    const r = this.slot.mb.obj.userData.refs;
    const p0 = r.plate.rotation.y, l0 = r.lever.rotation.x;
    await tweens.add({ duration: 0.22, ease: Ease.inCubic, update: (e) => (r.plate.rotation.y = p0 * (1 - e)) });
    audio.play('clack', { pitch: 0.7 });
    await tweens.add({ duration: 0.2, ease: Ease.inCubic, update: (e) => (r.lever.rotation.x = l0 * (1 - e)) });
    audio.play('lever');
    this.g.fx.shake(0.04);
    this.g.onAction(this.leverWorld(), 'Locked!');
    this.refreshTicket();
  }
  unlockCPU(instant = false) {
    if (!this.slot.mb) return;
    const r = this.slot.mb.obj.userData.refs;
    this.cpuLocked = false;
    if (instant) {
      r.plate.rotation.y = -1.75;
      r.lever.rotation.x = 1.15;
      return;
    }
    tweens.add({ duration: 0.25, update: (e) => { r.lever.rotation.x = 1.15 * e; r.plate.rotation.y = -1.75 * e; } });
  }

  async clickPort(id) {
    const ids = this.g.hasUpgrade('cablecomb') ? ['c24', 'c8', 'cgpu'].filter((k) => !this.cables[k] && this.portAvail(k)) : [id];
    await Promise.all(ids.map((k, i) => this.connect(k, i * 0.08)));
    this.g.onAction(this.portWorld(id), ids.length > 1 ? `×${ids.length} Plugged in!` : 'Plugged in!');
    this.refreshTicket();
  }
  async connect(id, delay = 0, instant = false) {
    if (this.cables[id]) return;
    const { pts, strands, off } = this.cablePath(id);
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
    audio.play('whoosh');
    await tweens.add({ duration: 0.42, ease: Ease.inOutCubic, update: (e) => MD.setCableGrowth(cable, e) });
    MD.setCableGrowth(cable, 1);
    audio.play('plug');
    this.g.fx.burst(this.portWorld(id), { count: 14, color: '#fde047', color2: '#fb923c', speed: 1.6, size: 0.4 });
  }
  async unplug(id) {
    const cable = this.cables[id];
    if (!cable) return;
    if (this.panelOn || this.testing) return;
    this.cables[id] = null;
    audio.play('plug', { pitch: 0.8 });
    await tweens.add({ duration: 0.25, ease: Ease.inCubic, update: (e) => MD.setCableGrowth(cable, 1 - e) });
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
    await tweenObj(p, { pos: mid, quat: qEuler(0, 0.2, 0), duration: 0.35, ease: Ease.inOutCubic });
    await tweenObj(p, { pos: SLOTS.panel.clone(), quat: QI(), duration: 0.28, ease: Ease.outCubic });
    audio.play('glass');
    audio.play('snap', { pitch: 0.8 });
    this.g.fx.shake(0.05);
    this.g.onAction(p.getWorldPosition(V3()).add(V3(0, 1, 0)), 'Sealed up!');
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

  async install(part, instant = false) {
    const cat = part.cat;
    this.slot[cat] = part;
    part.state = 'anim';
    const obj = part.obj;
    this.caseObj.attach(obj);
    const slot = SLOTS[cat].clone();
    if (instant) {
      obj.position.copy(slot);
      obj.quaternion.identity();
      obj.scale.setScalar(1);
    } else {
      const above = slot.clone().add(V3(0, 0, cat === 'psu' ? 0.6 : 0.22));
      await tweenObj(obj, { pos: above, quat: QI(), scale: 1, duration: 0.13, ease: Ease.outCubic });
      await tweenObj(obj, { pos: slot, duration: 0.08, ease: Ease.inQuad });
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
      else {
        tweens.add({ duration: 0.12, delay: 0.02, ease: Ease.outBack, update: (e) => latches.forEach((l) => (l.obj.rotation.x = l.dir * 0.45 * (1 - e))) });
      }
    }
    if (instant) return;
    const wp = this.partWorldCenter(part);
    audio.play(cat === 'ram' ? 'clack' : cat === 'psu' ? 'thump' : 'snap', { pitch: this.g.comboPitch() });
    if (cat === 'psu' || cat === 'mb') audio.play('snap', { pitch: this.g.comboPitch() * 0.8 });
    this.g.fx.burst(wp, { count: 26, speed: 2.4 });
    this.g.fx.shake(cat === 'psu' || cat === 'mb' || cat === 'gpu' ? 0.07 : 0.035);
    const ok = part.spec.id === this.order.parts[cat];
    this.g.onAction(wp, ok ? pickPraise() : 'Hmm… check the ticket', !ok);
    if (!ok) audio.play('error');
    this.refreshTicket();
  }

  uninstall(part) {
    const cat = part.cat;
    if (this.slot[cat] === part) this.slot[cat] = null;
    if (cat === 'cpu' && this.cpuLocked) this.unlockCPU();
    if (cat === 'ram' && this.slot.mb) {
      const latches = this.slot.mb.obj.userData.refs.latches;
      tweens.add({ duration: 0.15, update: (e) => latches.forEach((l) => (l.obj.rotation.x = l.dir * 0.45 * e)) });
    }
    for (const sc of part.screws) {
      sc.visible = false;
      sc.userData.tight = false;
    }
    MD.swapMaterial(part.obj, M.rgb, M.rgbIdle);
    this.scene.attach(part.obj);
    this.refreshTicket();
  }

  async returnToTray(part) {
    part.state = 'anim';
    this.hideGhost(part);
    audio.play('drop');
    await tweenObj(part.obj, { pos: part.tray.pos.clone(), quat: part.tray.quat.clone(), scale: part.trayScale, duration: 0.4, ease: Ease.outCubic });
    part.state = 'tray';
  }

  ghostFor(part) {
    if (!part.ghost) {
      const gh = ghostClone(part.obj);
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
    const mat = hot ? M.ghostHot : M.ghost;
    if (gh.userData.mat !== mat) {
      gh.traverse((o) => o.isMesh && (o.material = mat));
      gh.userData.mat = mat;
    }
  }
  hideGhost(part) {
    if (part.ghost) part.ghost.visible = false;
  }

  // ------------------------------------------------------------------ input
  pickHit(ndc) {
    const rc = this.g.raycaster;
    rc.setFromCamera(ndc, this.g.camera);
    const markers = this.clickables.filter((c) => c.marker.visible).map((c) => c.marker);
    let hit = markers.length ? rc.intersectObjects(markers, false)[0] : null;
    if (hit) return hit.object.userData.it;
    const roots = [...this.parts.map((p) => p.obj), this.panel, this.caseObj];
    const hits = rc.intersectObjects(roots, true);
    for (const h of hits) {
      if (h.object.material === M.ghost || h.object.material === M.ghostHot) continue;
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
      // hit something solid without interaction (e.g. the case): stop here
      return null;
    }
    return null;
  }

  onDown(ndc, ev) {
    if (!this.active || this.testing) return;
    if (this.held) {
      if (this.held.sticky) this.release();
      return;
    }
    const it = this.pickHit(ndc);
    if (!it) return;
    if (it.type === 'click') {
      const c = it.c;
      if (c.avail()) c.onClick();
      else if (c.id === 'panel' && !this.panelOn) {
        this.g.toast(`Finish the build first — ${this.remainingCount()} step${this.remainingCount() === 1 ? '' : 's'} to go`, 'warn');
        audio.play('error');
      }
      return;
    }
    if (it.type === 'cable') {
      if (this.panelOn) return;
      this.unplug(it.id);
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
    if (this.hover === part) this.hover = null;
    part.state = 'held';
    const slotW = this.slotWorld(part.cat);
    const z0 = slotW.z + part.center.z + 0.32;
    this.held = {
      part, plane: new THREE.Plane(V3(0, 0, 1), -z0), t0: performance.now(), x0: ev.clientX, y0: ev.clientY,
      moved: false, sticky: false, magnet: false, fromInstalled,
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
    if (this.testing) return;
    // hover feedback
    const it = this.pickHit(ndc);
    let hov = null;
    if (it && it.type === 'part' && it.part.state === 'tray') hov = it.part;
    if (hov !== this.hover) {
      if (this.hover && this.hover.state === 'tray') tweenObj(this.hover.obj, { pos: this.hover.tray.pos.clone(), duration: 0.15 });
      this.hover = hov;
      if (hov) {
        audio.play('hover');
        tweenObj(hov.obj, { pos: hov.tray.pos.clone().add(V3(0, 0.12, 0.05)), duration: 0.15 });
      }
    }
    if (hov) this.g.ui.tooltip({ title: hov.spec.name, sub: hov.spec.spec, cat: CAT_LABEL[hov.cat], color: CAT_COLOR[hov.cat] }, ev.clientX, ev.clientY);
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
    const h = this.held;
    if (!h || h.sticky) return;
    const quick = !h.moved && performance.now() - h.t0 < 260;
    if (quick) {
      if (this.g.hasUpgrade('gloves') && !h.fromInstalled && this.canInstallNow(h.part)) {
        this.held = null;
        this.hideGhost(h.part);
        this.install(h.part);
        return;
      }
      h.sticky = true; // click-to-carry: click again to drop
      return;
    }
    this.release();
  }

  release() {
    const h = this.held;
    if (!h) return;
    this.held = null;
    const part = h.part;
    this.hideGhost(part);
    if (h.magnet) {
      this.install(part);
      return;
    }
    // explain why it didn't fit if the player was close
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
    if (this.held) {
      const p = this.held.part;
      this.held = null;
      this.returnToTray(p);
    }
  }

  // ------------------------------------------------------------------ frame update
  update(dt, t) {
    if (!this.caseObj) return;
    // fans
    if (this.fanSpeed > 0.001) for (const r of this.rotors) r.rotation.z += dt * 28 * this.fanSpeed;
    if (!this.active) return;

    // held part follows the pointer
    const h = this.held;
    if (h) {
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
        h.magnet = can && d < 0.8;
        if (h.magnet) target.lerp(slotW.clone().add(V3(0, 0, 0.2)), 0.8);
        const prev = obj.position.clone();
        obj.position.x = damp(obj.position.x, target.x, 22, dt);
        obj.position.y = damp(obj.position.y, target.y, 22, dt);
        obj.position.z = damp(obj.position.z, target.z, 16, dt);
        // juicy sway based on velocity
        const vx = (obj.position.x - prev.x) / Math.max(dt, 1e-3);
        obj.rotateZ(clamp(-vx * 0.004, -0.08, 0.08));
        if (can) this.showGhost(part, h.magnet);
        else this.hideGhost(part);
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
    // power button glow
    const refs = this.caseObj.userData.caseRefs;
    if (!this.testing) M.ledGreen.emissiveIntensity = this.panelOn ? 0.6 + Math.sin(t * 5) * 0.5 : 0;

    // hint arrow
    const st = this.held ? null : this.currentStep();
    const idle = (performance.now() - this.lastAction) / 1000;
    const showHint = st && !this.testing && this.g.save.settings.hints && (this.order.tutorial || this.g.forceHint || idle > 7 || st.wrong);
    this.hintArrow.visible = !!showHint;
    if (showHint) {
      const p = st.target();
      this.hintArrow.position.set(p.x, p.y + 0.55 + Math.abs(Math.sin(t * 4)) * 0.25, p.z);
    }
    this.g.ui.prompt(this.testing ? null : this.held ? (this.held.magnet ? 'Release to snap it in!' : this.canInstallNow(this.held.part) ? 'Move it over the glowing outline' : this.prereq(this.held.part.cat) || 'That slot is already taken') : st ? st.text : null, st && st.wrong);
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

  // ------------------------------------------------------------------ QA test
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
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, W, H);
    if (mode === 'off') {
      tex.needsUpdate = true;
      return;
    }
    if (mode === 'splash') {
      const c = T.logoCanvas(900, 225);
      ctx.drawImage(c, 62, 170);
      ctx.fillStyle = '#94a3b8';
      ctx.font = T.font(600, 26);
      ctx.textAlign = 'center';
      ctx.fillText('QUALITY ASSURANCE · POWER-ON SELF TEST', W / 2, 470);
      ctx.textAlign = 'left';
      tex.needsUpdate = true;
      return;
    }
    ctx.fillStyle = '#a78bfa';
    ctx.font = T.font(800, 34);
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
      ctx.font = T.font(800, 38);
      ctx.textAlign = 'center';
      ctx.fillText(mode === 'fail' ? 'QA FAILED — OPEN THE CASE AND FIX IT' : mode === 'rgb' ? 'SET RGB PROFILE: ' + (extra.rgb || '').toUpperCase() : 'ALL SYSTEMS NOMINAL ✓', W / 2, H - 62);
      ctx.textAlign = 'left';
    }
    tex.needsUpdate = true;
  }

  async runTest() {
    if (this.testing) return;
    this.testing = true;
    const gen = this.g.gen;
    const dead = () => gen !== this.g.gen;
    this.g.onAction(this.caseObj.userData.caseRefs.btn.getWorldPosition(V3()), 'Power on!');
    this.g.onTestStart();
    const refs = this.caseObj.userData.caseRefs;
    // press the button
    await tweens.add({ duration: 0.08, update: (e) => (refs.cap.position.y = 0.03 - e * 0.025) });
    audio.play('power');
    await tweens.add({ duration: 0.12, update: (e) => (refs.cap.position.y = 0.005 + e * 0.025) });
    M.ledGreen.emissiveIntensity = 2.5;
    this.collectRotors();
    audio.humStart();
    tweens.add({ duration: 1.4, ease: Ease.inOutSine, update: (e) => (this.fanSpeed = e) });
    this.g.setRgbMode(this.g.themeColor(), 0);
    tweens.add({ duration: 1.2, update: (e) => (M.rgb.emissiveIntensity = e * 2.4) });
    this.drawScreen('splash');
    await wait(1.1);
    if (dead()) return;
    const lines = this.qaLines();
    for (let i = 1; i <= lines.length; i++) {
      this.drawScreen('list', lines.slice(0, i));
      audio.play(lines[i - 1].ok ? 'tick' : 'error', { pitch: 1 + i * 0.05 });
      await wait(0.26);
    }
    const fails = lines.filter((l) => !l.ok);
    if (fails.length) {
      this.drawScreen('fail', lines);
      audio.play('fail');
      M.rgb.emissive.set('#ef4444');
      this.g.setRgbMode('#ef4444', 0);
      await wait(1.6);
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
    await wait(0.7);
    if (dead()) return;
    if (this.order.rgb) {
      const want = RGB_COLORS.find((c) => c.id === this.order.rgb);
      this.drawScreen('rgb', lines, { rgb: want.name });
      await this.g.ui.pickRgb(want, (c) => {
        this.g.setRgbMode(c.hex || 'rainbow', 0);
        audio.play(c.id === want.id ? 'success' : 'tick');
      });
      this.g.onAction(this.caseObj.localToWorld(V3(0, 3.5, 1.2)), 'Perfect glow!');
      this.drawScreen('pass', lines);
      await wait(0.9);
    } else await wait(0.5);
    await this.powerOff();
    if (dead()) return;
    this.testing = false;
    this.g.onTestPassed();
  }

  async powerOff() {
    audio.humStop();
    const i0 = M.rgb.emissiveIntensity;
    await tweens.add({ duration: 0.9, ease: Ease.inOutSine, update: (e) => { this.fanSpeed = 1 - e; M.rgb.emissiveIntensity = i0 * (1 - e); } });
    this.fanSpeed = 0;
    M.ledGreen.emissiveIntensity = 0;
    this.drawScreen('off');
  }

  // Debug/QA helper: finish the current build instantly (used by the automated playtest)
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

function visibleChain(o) {
  while (o) {
    if (!o.visible) return false;
    o = o.parent;
  }
  return true;
}

// Rebuild an object tree with ghost material (Object3D.clone would deep-copy userData)
function ghostClone(src) {
  let o;
  if (src.isInstancedMesh) {
    o = new THREE.InstancedMesh(src.geometry, M.ghost, src.count);
    o.instanceMatrix.array.set(src.instanceMatrix.array);
  } else if (src.isMesh) o = new THREE.Mesh(src.geometry, M.ghost);
  else if (src.isSprite) return null;
  if (src.userData.hitbox) return null;
  else o = new THREE.Group();
  o.position.copy(src.position);
  o.quaternion.copy(src.quaternion);
  o.scale.copy(src.scale);
  o.visible = src.visible;
  o.renderOrder = 4;
  for (const c of src.children) {
    const k = ghostClone(c);
    if (k) o.add(k);
  }
  return o;
}

const PRAISE = ['Perfect fit!', 'Click!', 'Smooth!', 'Nailed it!', 'Snug!', 'Clean!', 'Beautiful!', 'Textbook!'];
function pickPraise() {
  return PRAISE[Math.floor(Math.random() * PRAISE.length)];
}
