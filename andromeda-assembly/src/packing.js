import * as THREE from 'three';
import * as MD from './models.js';
import { M, BOX, FOAM_HOLES } from './models.js';
import * as T from './textures.js';
import { tweens, tweenObj, wait, Ease, V3, QI, qEuler, damp, clamp } from './util.js';
import { audio } from './audio.js';
import { CASE_POS } from './assembly.js';

export const BOX_POS = V3(-7.6, -2.2, -0.2);
const PC_IN_BOX = V3(0, 0.48, 0); // box-local
const TOP_FOAM_Y = 5.48;
const BOX_TOP_WORLD = BOX_POS.y + BOX.H;
const TABLE_Y = -2.2;
const TAPE_BINS = 52;
const TAPE_HALF = BOX.W / 2;
const TAPE_Y = BOX.H + 0.072;

const ITEM_SPOTS = {
  foam: { pos: V3(-11.4, TABLE_Y, 0.4), quat: qEuler(0, Math.PI / 2, 0) },
  kit: { pos: V3(-9.6, TABLE_Y, 3.25), quat: qEuler(0, 0.12, 0) },
  keyboard: { pos: V3(-7.1, TABLE_Y, 3.3), quat: qEuler(0, -0.05, 0) },
  mouse: { pos: V3(-5.0, TABLE_Y, 3.3), quat: qEuler(0, 0.2, 0) },
  card: { pos: V3(-4.25, TABLE_Y, 2.1), quat: qEuler(0, -0.3, 0) },
};
const PRINTER_POS = V3(-4.25, TABLE_Y, 0.25);
const BUTTON_POS = V3(-4.2, TABLE_Y, -1.75);
const LABEL_LOCAL = V3(1.4, BOX.H + 0.08, -0.8);

export class Packing {
  constructor(game) {
    this.g = game;
    this.scene = game.scene;
    this.items = [];
    this.clickables = [];
    this.held = null;
    this.active = false;
    this.printer = MD.buildLabelPrinter();
    this.printer.position.copy(PRINTER_POS);
    this.printer.rotation.y = -0.4;
    this.scene.add(this.printer);
    this.button = MD.buildShipButton();
    this.button.position.copy(BUTTON_POS);
    this.scene.add(this.button);
    this.tapeGun = MD.buildTapeGun();
    this.tapeGun.visible = false;
    this.scene.add(this.tapeGun);
    this.hintArrow = MD.buildHintArrow();
    this.hintArrow.visible = false;
    this.scene.add(this.hintArrow);
    this.pod = MD.buildPod();
    this.pod.visible = false;
    this.scene.add(this.pod);
    // stamp timing rings
    const ring = (color, op) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.7, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 999;
      m.visible = false;
      this.scene.add(m);
      return m;
    };
    this.stampTarget = ring('#facc15', 0.9);
    this.stampCloser = ring('#67e8f9', 0.9);
    this.tmp = V3();
  }

  // ------------------------------------------------------------------ setup
  setupBox(order) {
    this.order = order;
    this.stage = 'wait';
    this.pc = null;
    this.items = [];
    this.clickables = [];
    this.labelDone = false;
    this.folds = [];
    this.stamp = null;
    const box = MD.buildBox();
    box.position.copy(BOX_POS);
    this.scene.add(box);
    this.box = box;
    this.flaps = box.userData.flaps;
    const need = ['kit', ...order.peripherals];
    const addItem = (kind, required, obj) => {
      const spot = ITEM_SPOTS[kind];
      obj.position.copy(spot.pos);
      obj.quaternion.copy(spot.quat);
      this.scene.add(obj);
      const it = { kind, obj, required, state: 'table', home: spot };
      obj.userData.it = { type: 'item', item: it };
      this.items.push(it);
      return it;
    };
    this.foam = addItem('foam', true, MD.buildTopFoam());
    for (const k of need) addItem(k, true, MD.buildAccessory(k));
    this.card = addItem('card', false, MD.buildAccessory('card'));
    // freehand tape ribbon
    this.tape = { bins: new Array(TAPE_BINS).fill(null), started: false, done: false, strokes: 0, dragging: false, lastX: 0 };
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TAPE_BINS * 2 * 3), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(TAPE_BINS * 2 * 2), 2));
    const idx = [];
    for (let i = 0; i < TAPE_BINS - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b, b, c, d);
    }
    geo.setIndex(idx);
    geo.setDrawRange(0, 0);
    this.tapeMesh = new THREE.Mesh(geo, M.tape);
    this.tapeMesh.frustumCulled = false;
    box.add(this.tapeMesh);
    this.tapeEnds = [-1, 1].map((sx) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.6, 0.42), M.tape);
      m.position.set(sx * (TAPE_HALF + 0.004), BOX.H - 0.25, 0);
      m.visible = false;
      box.add(m);
      return m;
    });
    const tex = T.toTex(MD.labelCanvas(order));
    this.labelTex = tex;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.79), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
    label.visible = false;
    label.castShadow = false;
    this.scene.add(label);
    this.label = label;
    this.buildClickables();
  }

  buildClickables() {
    const add = (c) => {
      c.marker = MD.buildMarker(c.color || '#67e8f9', c.size || 0.6);
      c.marker.userData.it = { type: 'click', c };
      c.marker.visible = false;
      this.scene.add(c.marker);
      this.clickables.push(c);
      return c;
    };
    this.flaps.forEach((f, i) => {
      const c = add({
        id: 'flap' + i, size: 0.7,
        avail: () => this.stage === 'flaps' && !f.done && (f.kind === 'short' || this.flaps.filter((x) => x.kind === 'short').every((x) => x.done)),
        pos: () => f.piv.children[0].getWorldPosition(this.tmp).clone().add(V3(0, 0.15, 0)),
        onClick: () => this.clickFlap(f),
      });
      f.piv.userData.it = { type: 'click', c, flap: f };
    });
    add({
      id: 'tape', color: '#fde047', size: 0.8,
      avail: () => this.stage === 'tape' && !this.tape.started,
      pos: () => this.box.localToWorld(V3(-TAPE_HALF + 0.2, BOX.H + 0.2, 0)),
      onClick: () => {},
    });
    const lc = add({
      id: 'label', color: '#fde047', size: 0.7,
      avail: () => this.stage === 'label' && this.label.userData.ready,
      pos: () => this.label.getWorldPosition(this.tmp).clone().add(V3(0, 0.2, 0)),
      onClick: () => this.pickLabel(),
    });
    this.label.userData.it = { type: 'click', c: lc };
    const sc = add({
      id: 'ship', color: '#fca5a5', size: 0.9,
      avail: () => this.stage === 'ship',
      pos: () => this.button.localToWorld(V3(0, 1.45, 0)),
      onClick: () => this.ship(),
    });
    this.button.userData.it = { type: 'click', c: sc };
  }

  receivePC(pc) {
    this.pc = pc;
    this.active = true;
    this.stage = 'pc';
    pc.userData.it = { type: 'pc' };
    this.lastAction = performance.now();
  }

  teardown() {
    for (const it of this.items) it.obj.removeFromParent();
    for (const c of this.clickables) c.marker.removeFromParent();
    if (this.box) {
      this.box.removeFromParent();
      this.tapeMesh.geometry.dispose();
      this.tapeEnds.forEach((m) => m.geometry.dispose());
    }
    if (this.label) {
      this.label.removeFromParent();
      this.label.geometry.dispose();
      this.label.material.dispose();
      this.labelTex.dispose();
    }
    if (this.pc) {
      this.pc.traverse((o) => {
        if (o.isMesh && o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      });
      this.pc.removeFromParent();
      this.pc = null;
    }
    this.items = [];
    this.clickables = [];
    this.active = false;
    this.held = null;
    this.hintArrow.visible = false;
    this.tapeGun.visible = false;
    this.stampTarget.visible = this.stampCloser.visible = false;
    this.pod.visible = false;
    M.redBtn.emissiveIntensity = 0.2;
  }

  // ------------------------------------------------------------------ steps
  requiredItemsIn() {
    return this.items.filter((i) => i.required && i.kind !== 'foam').every((i) => i.state === 'in');
  }
  currentStep() {
    const s = this.stage;
    if (s === 'pc') return { text: 'Drag the finished PC into the shipping box — centre it for a PERFECT', target: () => this.pc.localToWorld(V3(0, 5.4, 0)) };
    if (s === 'foam') return { text: 'Drag the top foam insert onto the PC', target: () => this.foam.obj.localToWorld(V3(0, 0.6, 0)) };
    if (s === 'acc') {
      const next = this.items.find((i) => i.required && i.state === 'table' && i.kind !== 'foam');
      if (next) {
        const names = { kit: 'accessory kit', keyboard: 'keyboard', mouse: 'mouse' };
        return { text: `Drop the ${names[next.kind]} into its foam cut-out`, target: () => next.obj.localToWorld(V3(0, 0.6, 0)) };
      }
    }
    if (s === 'flaps') {
      const shortOpen = this.flaps.filter((f) => f.kind === 'short' && !f.done);
      const f = shortOpen[0] || this.flaps.find((x) => !x.done);
      const extra = this.card.state === 'table' && !this.flaps.some((x) => x.done) ? '  ·  Add the thank-you card for a tip!' : '';
      return { text: (shortOpen.length ? 'Fold the short flaps, then the long ones — fast for a SPEED FOLD' : 'Now fold the long flaps') + extra, target: () => f.piv.children[0].getWorldPosition(V3()) };
    }
    if (s === 'tape') return { text: this.g.hasUpgrade('tapegun') ? 'Click the seam to fire the tape gun' : 'Drag ONE straight line along the seam to tape the box', target: () => this.box.localToWorld(V3(this.tape.started ? this.tape.lastX : -TAPE_HALF + 0.3, BOX.H + 0.1, 0)) };
    if (s === 'label') return { text: 'Click the printed shipping label', target: () => this.label.getWorldPosition(V3()) };
    if (s === 'stamp') return { text: 'CLICK when the blue ring meets the gold ring!', target: () => this.box.localToWorld(LABEL_LOCAL.clone()) };
    if (s === 'ship') return { text: 'Hit the big red SHIP button!', target: () => this.button.localToWorld(V3(0, 1.4, 0)) };
    return null;
  }

  // ------------------------------------------------------------------ input
  pickHit(ndc) {
    const rc = this.g.raycaster;
    rc.setFromCamera(ndc, this.g.camera);
    const markers = this.clickables.filter((c) => c.marker.visible).map((c) => c.marker);
    const mh = markers.length ? rc.intersectObjects(markers, false)[0] : null;
    if (mh) return mh.object.userData.it;
    const roots = [...this.items.map((i) => i.obj), this.label, this.button, this.box];
    if (this.pc) roots.push(this.pc);
    const hits = rc.intersectObjects(roots, true);
    for (const h of hits) {
      if (!h.object.visible) continue;
      let o = h.object, found = null, inPc = false;
      while (o) {
        if (o === this.pc) {
          inPc = true;
          break;
        }
        if (!found && o.userData && o.userData.it) found = o.userData.it;
        if (o === this.box) {
          if (!found) found = { type: 'box' };
          break;
        }
        o = o.parent;
      }
      if (inPc) return { type: 'pc', point: h.point };
      if (found) return { ...found, point: h.point };
      return null;
    }
    return null;
  }

  onDown(ndc, ev) {
    if (!this.active || this.busy) return;
    if (this.stage === 'stamp') {
      this.doStamp();
      return;
    }
    if (this.held) {
      if (this.held.sticky) this.release();
      return;
    }
    const it = this.pickHit(ndc);
    if (this.stage === 'tape' && it && (it.type === 'box' || it.type === 'pc' || (it.type === 'click' && (it.c.id === 'tape' || it.c.id.startsWith('flap'))))) {
      this.startTape(ndc);
      return;
    }
    if (!it) return;
    if (it.type === 'click') {
      if (it.c.avail()) it.c.onClick();
      else if (it.flap && this.stage === 'flaps') {
        this.g.toast('Fold the short side flaps first', 'warn');
        audio.play('error');
      } else if (it.flap && (this.stage === 'acc' || this.stage === 'foam' || this.stage === 'pc')) {
        this.g.toast('Finish packing the box before closing it', 'warn');
        audio.play('error');
      }
      return;
    }
    if (it.type === 'pc' && this.stage === 'pc') {
      this.startHold({ kind: 'pc', obj: this.pc, home: { pos: CASE_POS.clone(), quat: QI() } }, ev, BOX_TOP_WORLD + 0.35);
      return;
    }
    if (it.type === 'item') {
      const item = it.item;
      if (item.state !== 'table') return;
      if (item.kind === 'foam' && this.stage !== 'foam') {
        this.g.toast(this.stage === 'pc' ? 'Put the PC in the box first' : 'The foam is already in', 'warn');
        audio.play('error');
        return;
      }
      if (item.kind !== 'foam' && this.stage !== 'acc' && this.stage !== 'flaps') {
        this.g.toast(this.stage === 'pc' || this.stage === 'foam' ? 'Box the PC and add the top foam first' : 'The box is already closed', 'warn');
        audio.play('error');
        return;
      }
      if (item.kind === 'card' && this.flaps.some((f) => f.done)) {
        this.g.toast('Too late for the card — the box is closing', 'warn');
        audio.play('error');
        return;
      }
      this.startHold(item, ev, BOX_TOP_WORLD + 0.6);
    }
  }

  targetFor(item) {
    if (item.kind === 'pc') return this.box.localToWorld(PC_IN_BOX.clone());
    if (item.kind === 'foam') return this.box.localToWorld(V3(0, TOP_FOAM_Y, 0));
    const h = FOAM_HOLES[item.kind];
    return this.box.localToWorld(V3(h.x, TOP_FOAM_Y, h.z));
  }

  startHold(item, ev, planeY) {
    item.state = 'held';
    tweens.cancel(item.obj.uuid + ':xf');
    this.held = { item, plane: new THREE.Plane(V3(0, 1, 0), -planeY), planeY, t0: performance.now(), x0: ev.clientX, y0: ev.clientY, moved: false, sticky: false, magnet: false, d: 9 };
    audio.play('pick', { pitch: item.kind === 'pc' ? 0.6 : 1 });
  }

  onMove(ndc, ev) {
    if (!this.active) return;
    if (this.held) {
      if (Math.hypot(ev.clientX - this.held.x0, ev.clientY - this.held.y0) > 7) this.held.moved = true;
      return;
    }
    if (this.tape.dragging) return;
    const it = this.pickHit(ndc);
    let cur = 'default';
    if (this.stage === 'stamp') cur = 'crosshair';
    else if (it) {
      if (it.type === 'item' && it.item.state === 'table') cur = 'grab';
      else if (it.type === 'pc' && this.stage === 'pc') cur = 'grab';
      else if (it.type === 'click' && it.c.avail()) cur = 'pointer';
      else if (this.stage === 'tape' && (it.type === 'box' || it.type === 'click')) cur = 'crosshair';
    }
    this.g.setCursor(cur);
    if (it && it.type === 'item' && it.item.state === 'table' && it.item.kind === 'card') this.g.ui.tooltip({ title: 'Thank-you card', sub: 'Optional — colonists love it (+tip)', cat: 'Bonus', color: '#facc15' }, ev.clientX, ev.clientY);
    else this.g.ui.tooltip(null);
  }

  onUp(ndc, ev) {
    if (this.tape.dragging) {
      this.tape.dragging = false;
      audio.tapeStop();
      return;
    }
    const h = this.held;
    if (!h || h.sticky) return;
    if (!h.moved && performance.now() - h.t0 < 260) {
      h.sticky = true;
      return;
    }
    this.release();
  }

  release() {
    const h = this.held;
    if (!h) return;
    this.held = null;
    if (h.magnet) {
      const big = h.item.kind === 'pc' || h.item.kind === 'foam';
      const tier = h.d < (big ? 0.35 : 0.18) ? 'perfect' : h.d < (big ? 0.8 : 0.4) ? 'great' : 'good';
      this.drop(h.item, tier);
    } else this.returnHome(h.item);
  }

  async returnHome(item) {
    item.state = 'anim';
    audio.play('drop');
    await tweenObj(item.obj, { pos: item.home.pos.clone(), quat: item.home.quat.clone(), duration: 0.45, ease: Ease.inOutCubic });
    item.state = item.kind === 'pc' ? 'bench' : 'table';
  }

  async drop(item, tier) {
    item.state = 'anim';
    this.busy = true;
    const target = this.targetFor(item);
    const obj = item.obj;
    const over = target.clone();
    over.y = obj.position.y;
    await tweenObj(obj, { pos: over, quat: QI(), duration: 0.1 });
    const fall = item.kind === 'pc' ? 0.6 : 0.26;
    await tweenObj(obj, { pos: target, duration: fall, ease: item.kind === 'pc' ? Ease.inOutSine : Ease.inQuad });
    this.box.attach(obj);
    item.state = 'in';
    this.busy = false;
    const wp = obj.getWorldPosition(V3()).add(V3(0, 0.5, 0));
    if (item.kind === 'pc') {
      audio.play('foam');
      audio.play('thump');
      this.g.fx.shake(0.12);
      this.g.fx.burst(this.box.localToWorld(V3(0, 0.6, 1.6)), { count: 36, color: '#e2e8f0', color2: '#cbd5e1', speed: 2.8, up: 0.5 });
      this.g.judge('pack', tier, wp.add(V3(0, 5, 0)), tier === 'perfect' ? 'Dead centre!' : null);
      this.stage = 'foam';
      this.g.onPackStage('foam');
    } else if (item.kind === 'foam') {
      audio.play('foam');
      this.g.fx.burst(wp, { count: 26, color: '#f1f5f9', color2: '#e2e8f0', speed: 2.2, up: 0.4 });
      this.g.judge('pack', tier, wp);
      this.stage = this.requiredItemsIn() ? 'flaps' : 'acc';
    } else {
      audio.play(item.kind === 'card' ? 'pop' : 'cardboard', { pitch: 1.3 });
      this.g.fx.burst(wp, { count: 18, speed: 1.8 });
      if (item.kind === 'card') {
        this.g.orderStats.card = true;
        this.g.action(wp, '♥ +TIP');
      } else this.g.judge('pack', tier, wp);
      if (this.stage === 'acc' && this.requiredItemsIn()) this.stage = 'flaps';
    }
  }

  async clickFlap(f) {
    if (this.card.state === 'held') return;
    const flapper = this.g.hasUpgrade('flapper');
    const list = flapper
      ? [...this.flaps.filter((x) => x.kind === 'short' && !x.done), ...this.flaps.filter((x) => x.kind === 'long' && !x.done)]
      : [f];
    for (const fl of list) fl.done = true;
    this.busy = true;
    for (const fl of list) {
      const a0 = fl.piv.rotation[fl.axis];
      await tweens.add({ duration: 0.2, ease: Ease.outBackSoft, update: (e) => (fl.piv.rotation[fl.axis] = a0 * (1 - e)) });
      audio.play('cardboard', { pitch: 0.9 + this.folds.length * 0.08 });
      this.g.fx.shake(0.03);
      this.folds.push(this.g.time);
    }
    this.busy = false;
    const pos = f.piv.getWorldPosition(V3()).add(V3(0, 0.6, 0));
    if (this.flaps.every((x) => x.done)) {
      const span = this.folds[this.folds.length - 1] - this.folds[0];
      const speed = flapper || span < 2.6;
      this.g.judge('fold', speed ? 'perfect' : 'great', this.box.localToWorld(V3(0, BOX.H + 0.8, 0)), speed ? 'SPEED FOLD!' : 'Folded');
      this.stage = 'tape';
      this.tapeGun.visible = true;
      this.tapeGun.position.copy(this.box.localToWorld(V3(-TAPE_HALF - 0.1, BOX.H + 0.08, 0)));
      this.tapeGun.rotation.set(0, Math.PI, 0);
    } else this.g.action(pos, 'FOLD');
  }

  // ------------------------------------------------------------------ tape (freehand ribbon)
  startTape(ndc) {
    if (this.tape.done) return;
    if (this.g.hasUpgrade('tapegun')) {
      this.autoTape();
      return;
    }
    const p = this.tapePoint(ndc);
    if (!p) return;
    this.tape.started = true;
    this.tape.dragging = true;
    this.tape.strokes++;
    this.tape.lastX = p.x;
    this.tape.lastT = performance.now();
    audio.tapeStart();
  }
  tapePoint(ndc) {
    const rc = this.g.raycaster;
    rc.setFromCamera(ndc, this.g.camera);
    const plane = new THREE.Plane(V3(0, 1, 0), -(BOX_TOP_WORLD + 0.07));
    const p = rc.ray.intersectPlane(plane, V3());
    if (!p) return null;
    const l = this.box.worldToLocal(p);
    return { x: clamp(l.x, -TAPE_HALF, TAPE_HALF), z: clamp(l.z, -0.6, 0.6) };
  }
  binX(i) {
    return -TAPE_HALF + (i / (TAPE_BINS - 1)) * BOX.W;
  }
  paintTape(x0, x1, z) {
    const a = Math.min(x0, x1), b = Math.max(x0, x1);
    for (let i = 0; i < TAPE_BINS; i++) {
      const bx = this.binX(i);
      if (bx >= a - 0.06 && bx <= b + 0.06 && this.tape.bins[i] === null) this.tape.bins[i] = z;
    }
  }
  rebuildTape() {
    const bins = this.tape.bins;
    const pos = this.tapeMesh.geometry.attributes.position;
    const uv = this.tapeMesh.geometry.attributes.uv;
    let first = -1, last = -1;
    for (let i = 0; i < TAPE_BINS; i++) if (bins[i] !== null) {
      if (first < 0) first = i;
      last = i;
    }
    if (first < 0) return;
    // interpolate holes inside the covered span
    let k = 0;
    for (let i = first; i <= last; i++) {
      let z = bins[i];
      if (z === null) {
        let j = i + 1;
        while (j <= last && bins[j] === null) j++;
        const zl = bins[i - 1] !== null ? bins[i - 1] : 0, zr = j <= last ? bins[j] : zl;
        z = zl + (zr - zl) * 0.5;
      }
      const x = this.binX(i);
      pos.setXYZ(k * 2, x, TAPE_Y, z - 0.21);
      pos.setXYZ(k * 2 + 1, x, TAPE_Y, z + 0.21);
      uv.setXY(k * 2, x / 2.4, 0);
      uv.setXY(k * 2 + 1, x / 2.4, 1);
      k++;
    }
    pos.needsUpdate = uv.needsUpdate = true;
    this.tapeMesh.geometry.setDrawRange(0, Math.max(0, (k - 1) * 6));
    this.tapeMesh.geometry.computeBoundingSphere();
    this.tape.coverage = k / TAPE_BINS;
  }
  async autoTape() {
    this.tape.started = true;
    this.busy = true;
    audio.tapeStart();
    await tweens.add({
      duration: 0.6, ease: Ease.inOutSine,
      update: (e) => {
        const x = -TAPE_HALF + e * BOX.W;
        this.paintTape(-TAPE_HALF, x, 0);
        this.tape.lastX = x;
        audio.tapeLevel(0.3);
        this.rebuildTape();
        this.tapeGun.position.copy(this.box.localToWorld(V3(x, BOX.H + 0.08, 0)));
      },
    });
    audio.tapeStop();
    this.busy = false;
    this.finishTape(true);
  }
  finishTape(auto = false) {
    if (this.tape.done) return;
    this.tape.done = true;
    this.tape.dragging = false;
    audio.tapeStop();
    const bins = this.tape.bins;
    for (let i = 0; i < TAPE_BINS; i++) if (bins[i] === null) bins[i] = bins[i - 1] !== undefined && bins[i - 1] !== null ? bins[i - 1] : 0;
    this.rebuildTape();
    this.tapeEnds[0].position.z = bins[0];
    this.tapeEnds[1].position.z = bins[TAPE_BINS - 1];
    this.tapeEnds.forEach((m) => (m.visible = true));
    audio.play('rip');
    // grade: how straight and how continuous was the run?
    const mean = bins.reduce((a, z) => a + Math.abs(z), 0) / TAPE_BINS;
    const straight = clamp(1 - mean / 0.3, 0, 1) * (this.tape.strokes <= 1 ? 1 : this.tape.strokes === 2 ? 0.8 : 0.6);
    const tier = auto ? 'perfect' : straight >= 0.82 ? 'perfect' : straight >= 0.6 ? 'great' : straight >= 0.35 ? 'good' : 'sloppy';
    const at = this.box.localToWorld(V3(0, BOX.H + 0.6, 0));
    this.g.fx.burst(this.box.localToWorld(V3(TAPE_HALF, BOX.H, 0)), { count: 24, color: '#fde68a', color2: '#fbbf24', speed: 2 });
    this.g.judge('tape', tier, at, tier === 'perfect' ? 'Laser straight!' : tier === 'sloppy' ? 'Wonky tape…' : null);
    this.tapeGun.visible = false;
    this.stage = 'label';
    this.printLabel();
  }

  // ------------------------------------------------------------------ label & stamp timing
  async printLabel() {
    const lbl = this.label;
    lbl.userData.ready = false;
    lbl.visible = true;
    const base = this.printer.localToWorld(V3(0, 0.46, 0.4));
    lbl.position.copy(base);
    lbl.quaternion.copy(this.printer.quaternion).multiply(qEuler(-Math.PI / 2 + 0.25, 0, 0));
    lbl.scale.set(0.6, 0.01, 0.6);
    audio.play('printer');
    const out = this.printer.localToWorld(V3(0, 0.5, 0.85));
    await tweens.add({ duration: 0.6, ease: Ease.linear, update: (e) => { lbl.position.lerpVectors(base, out, e); lbl.scale.set(0.6, 0.01 + e * 0.59, 0.6); } });
    lbl.scale.set(0.6, 0.6, 0.6);
    lbl.userData.ready = true;
    if (this.g.hasUpgrade('labeler')) {
      await wait(0.1);
      this.pickLabel(true);
    }
  }

  async pickLabel(auto = false) {
    if (this.labelDone || this.stage !== 'label') return;
    this.labelDone = true;
    const lbl = this.label;
    lbl.userData.ready = false;
    audio.play('whoosh');
    const target = this.box.localToWorld(LABEL_LOCAL.clone());
    const q = this.box.quaternion.clone().multiply(qEuler(-Math.PI / 2, 0, 0.06));
    await tweenObj(lbl, { pos: target.clone().add(V3(0, 1.1, 0)), quat: q, scale: 1.0, duration: 0.32, ease: Ease.inOutCubic });
    if (auto) {
      this.stamp = { t0: this.g.time, auto: true };
      this.doStamp(true);
      return;
    }
    this.stage = 'stamp';
    this.stamp = { t0: this.g.time };
    this.stampTarget.visible = this.stampCloser.visible = true;
    this.stampTarget.position.copy(target).add(V3(0, 0.05, 0));
    this.stampCloser.position.copy(this.stampTarget.position);
  }
  stampScale() {
    const period = 1.0;
    const k = ((this.g.time - this.stamp.t0) % period) / period;
    return 3.0 - k * 2.6; // 3.0 → 0.4, target is 1.0
  }
  async doStamp(auto = false) {
    if (!this.stamp || this.stamp.done) return;
    this.stamp.done = true;
    const err = auto ? 0 : Math.abs(this.stampScale() - 1);
    const tier = err < 0.13 ? 'perfect' : err < 0.32 ? 'great' : err < 0.65 ? 'good' : 'sloppy';
    this.stampTarget.visible = this.stampCloser.visible = false;
    const lbl = this.label;
    const target = this.box.localToWorld(LABEL_LOCAL.clone());
    // sloppy stamps land a little crooked
    if (tier !== 'perfect') {
      const off = { great: 0.06, good: 0.14, sloppy: 0.28 }[tier];
      target.x += (Math.random() - 0.5) * off * 2;
      target.z += (Math.random() - 0.5) * off * 2;
      lbl.rotateZ((Math.random() - 0.5) * off * 2);
    }
    await tweenObj(lbl, { pos: target, duration: 0.08, ease: Ease.inQuad });
    this.box.attach(lbl);
    audio.play('stamp');
    this.g.fx.shake(tier === 'perfect' ? 0.1 : 0.05);
    this.g.fx.ring(target.clone().add(V3(0, 0.05, 0)), { color: tier === 'perfect' ? '#facc15' : '#ffffff', radius: 1.4, axis: 'y' });
    this.g.fx.burst(target.clone().add(V3(0, 0.1, 0)), { count: 24, speed: 2.6, color: '#ffffff', color2: '#c4b5fd' });
    this.g.judge('stamp', tier, target.clone().add(V3(0, 0.6, 0)), tier === 'perfect' ? 'Dead centre!' : null);
    this.stage = 'ship';
  }

  // ------------------------------------------------------------------ ship & launch
  async ship() {
    if (this.stage !== 'ship') return;
    this.stage = 'shipping';
    const gen = this.g.gen;
    const cap = this.button.userData.cap;
    await tweens.add({ duration: 0.08, update: (e) => (cap.position.y = 1.2 - e * 0.08) });
    audio.play('stamp');
    tweens.add({ duration: 0.2, delay: 0.1, update: (e) => (cap.position.y = 1.12 + e * 0.08) });
    this.g.action(this.button.getWorldPosition(V3()).add(V3(0, 1.6, 0)), 'SHIP IT!');
    this.g.onShipStart();
    const air = this.g.env.airlock;
    air.target = 1;
    air.alarm = 4;
    audio.play('conveyor');
    this.spinRollers = true;
    const from = this.box.position.clone();
    const to = V3(-24.5, from.y, from.z);
    await tweens.add({ duration: 1.8, ease: Ease.inCubic, update: (e) => this.box.position.lerpVectors(from, to, e) });
    this.spinRollers = false;
    this.box.visible = false;
    air.target = 0;
    if (gen !== this.g.gen) return;
    await this.launchPod(gen);
    if (gen !== this.g.gen) return;
    audio.play('cash');
    this.g.onShipped();
  }

  async launchPod(gen) {
    this.g.onLaunch();
    await wait(0.5);
    const pod = this.pod;
    pod.visible = true;
    const P = [V3(-23.5, -1.5, -8), V3(-16, 1, -24), V3(15, 4, -55), V3(60, 4, -80)];
    const bez = (t) => {
      const u = 1 - t;
      return P[0].clone().multiplyScalar(u * u * u).add(P[1].clone().multiplyScalar(3 * u * u * t)).add(P[2].clone().multiplyScalar(3 * u * t * t)).add(P[3].clone().multiplyScalar(t * t * t));
    };
    audio.play('launch');
    this.g.post.pulse('#bae6fd', 0.15);
    const q = new THREE.Quaternion();
    let lastBurst = 0;
    await tweens.add({
      duration: 2.8, ease: Ease.inCubic,
      update: (e, k) => {
        const p = bez(e), p2 = bez(Math.min(1, e + 0.02));
        pod.position.copy(p);
        const dir = p2.sub(p);
        if (dir.lengthSq() > 1e-6) {
          q.setFromUnitVectors(V3(1, 0, 0), dir.normalize());
          pod.quaternion.copy(q);
        }
        pod.userData.flame.scale.set(1, 0.8 + Math.random() * 0.5, 1);
        if (k - lastBurst > 0.02) {
          lastBurst = k;
          const tail = pod.localToWorld(V3(-3.2, 0, 0));
          this.g.fx.burst(tail, { count: 6, color: '#7dd3fc', color2: '#fb923c', speed: 1.2, size: 1.4, life: 1.1, up: 0 });
        }
      },
    });
    pod.visible = false;
    if (gen === this.g.gen) this.g.post.pulse('#ffffff', 0.12);
  }

  // ------------------------------------------------------------------ frame
  update(dt, t) {
    if (this.spinRollers) for (const r of this.g.env.rollers) r.rotation.y += dt * 12;
    if (!this.active) return;
    const h = this.held;
    if (h) {
      const rc = this.g.raycaster;
      rc.setFromCamera(this.g.pointer, this.g.camera);
      const p = rc.ray.intersectPlane(h.plane, V3());
      const obj = h.item.obj;
      obj.quaternion.slerp(QI(), 1 - Math.exp(-10 * dt));
      if (p) {
        const target = this.targetFor(h.item);
        const pos = p.clone();
        const d = Math.hypot(pos.x - target.x, pos.z - target.z);
        h.d = d;
        h.magnet = d < (h.item.kind === 'pc' || h.item.kind === 'foam' ? 1.8 : 0.9);
        if (h.magnet) {
          pos.x = target.x * 0.6 + pos.x * 0.4;
          pos.z = target.z * 0.6 + pos.z * 0.4;
        }
        obj.position.x = damp(obj.position.x, pos.x, 16, dt);
        obj.position.z = damp(obj.position.z, pos.z, 16, dt);
        obj.position.y = damp(obj.position.y, h.planeY, 10, dt);
      }
    }
    if (this.tape.dragging) {
      const p = this.tapePoint(this.g.pointer);
      if (p) {
        const now = performance.now();
        const v = (Math.abs(p.x - this.tape.lastX) / Math.max(1, now - this.tape.lastT)) * 1000;
        this.paintTape(this.tape.lastX, p.x, p.z);
        this.tape.lastX = p.x;
        this.tape.lastT = now;
        audio.tapeLevel(clamp(v / 12, 0, 1) * 0.35);
        this.rebuildTape();
        this.tapeGun.position.copy(this.box.localToWorld(V3(p.x, BOX.H + 0.08, p.z)));
        if (this.tape.coverage >= 0.96) this.finishTape();
      }
    }
    if (this.stage === 'stamp' && this.stamp && !this.stamp.done) {
      const s = this.stampScale();
      this.stampCloser.scale.setScalar(s);
      const err = Math.abs(s - 1);
      this.stampCloser.material.color.set(err < 0.13 ? '#facc15' : '#67e8f9');
    }
    const pulse = 1 + Math.sin(t * 6) * 0.12;
    for (const c of this.clickables) {
      const v = c.avail() && !this.held && !this.busy;
      c.marker.visible = v;
      if (v) {
        c.marker.position.copy(c.pos());
        const s = c.marker.userData.baseSize * pulse;
        c.marker.scale.set(s, s, s);
      }
    }
    M.redBtn.emissiveIntensity = this.stage === 'ship' ? 1.2 + Math.sin(t * 8) * 0.8 : 0.2;
    const st = this.held ? null : this.currentStep();
    const idle = (performance.now() - this.lastAction) / 1000;
    const show = st && this.stage !== 'stamp' && this.g.save.settings.hints && (this.order.tutorial || this.g.forceHint || idle > 7) && !this.busy;
    this.hintArrow.visible = !!show;
    if (show) {
      const p = st.target();
      this.hintArrow.position.set(p.x, p.y + 0.6 + Math.abs(Math.sin(t * 4)) * 0.3, p.z);
    }
    if (this.stage !== this.lastStage) {
      this.lastStage = this.stage;
      this.g.onStep(this.stage);
    }
    if (this.stage === 'shipping') this.g.ui.prompt(null);
    else this.g.ui.prompt(this.held ? (this.held.magnet ? 'Release to drop it in' : 'Carry it over the box') : this.tape.dragging ? 'Keep it straight along the seam…' : st ? st.text : null);
  }
}
