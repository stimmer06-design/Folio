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

const ITEM_SPOTS = {
  foam: { pos: V3(-11.6, TABLE_Y, 0.2), quat: qEuler(0, Math.PI / 2, 0) },
  kit: { pos: V3(-10.0, TABLE_Y, 3.25), quat: qEuler(0, 0.12, 0) },
  keyboard: { pos: V3(-7.4, TABLE_Y, 3.3), quat: qEuler(0, -0.05, 0) },
  mouse: { pos: V3(-5.4, TABLE_Y, 3.3), quat: qEuler(0, 0.2, 0) },
  card: { pos: V3(-4.25, TABLE_Y, 2.1), quat: qEuler(0, -0.3, 0) },
};
const PRINTER_POS = V3(-4.25, TABLE_Y, 0.25);
const BUTTON_POS = V3(-4.2, TABLE_Y, -1.75);

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
    this.tmp = V3();
  }

  // ------------------------------------------------------------------ setup
  setupBox(order) {
    this.order = order;
    this.stage = 'wait';
    this.pc = null;
    this.items = [];
    this.clickables = [];
    this.tape = { lo: 0, hi: 0, started: false, done: false, mesh: null };
    this.labelDone = false;
    const box = MD.buildBox();
    box.position.copy(BOX_POS);
    this.scene.add(box);
    this.box = box;
    this.flaps = box.userData.flaps;
    // items on the table
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
    // tape strip
    const tapeMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 0.008, 0.42), M.tape);
    tapeMesh.position.set(0, BOX.H + 0.072, 0);
    tapeMesh.visible = false;
    tapeMesh.castShadow = false;
    box.add(tapeMesh);
    this.tape.mesh = tapeMesh;
    this.tapeEnds = [-1, 1].map((sx) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.6, 0.42), M.tape);
      m.position.set(sx * (BOX.W / 2 + 0.004), BOX.H - 0.25, 0);
      m.visible = false;
      box.add(m);
      return m;
    });
    // label
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
    const tc = add({
      id: 'tape', color: '#fde047', size: 0.8,
      avail: () => this.stage === 'tape' && !this.tape.started,
      pos: () => this.box.localToWorld(V3(-BOX.W / 2 + 0.2, BOX.H + 0.2, 0)),
      onClick: () => {},
    });
    this.tapeClick = tc;
    const lc = add({
      id: 'label', color: '#fde047', size: 0.7,
      avail: () => this.stage === 'label' && this.label.userData.ready,
      pos: () => this.label.getWorldPosition(this.tmp).clone().add(V3(0, 0.2, 0)),
      onClick: () => this.applyLabel(),
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
      this.tape.mesh.geometry.dispose();
      this.tapeEnds.forEach((m) => m.geometry.dispose());
    }
    if (this.label) {
      this.label.removeFromParent();
      this.label.geometry.dispose();
      this.label.material.dispose();
      this.labelTex.dispose();
    }
    if (this.pc) {
      // free per-order geometry (cables, pick-boxes); shared part geometry stays cached
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
    M.redBtn.emissiveIntensity = 0.2;
  }

  // ------------------------------------------------------------------ steps
  requiredItemsIn() {
    return this.items.filter((i) => i.required && i.kind !== 'foam').every((i) => i.state === 'in');
  }
  currentStep() {
    const s = this.stage;
    if (s === 'pc') return { text: 'Drag the finished PC into the shipping box', target: () => this.pc.localToWorld(V3(0, 5.4, 0)) };
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
      const extra = this.card.state === 'table' ? '  ·  Tip: a thank-you card earns a bonus!' : '';
      return { text: (shortOpen.length ? 'Fold the short side flaps first' : 'Now fold the long flaps') + extra, target: () => f.piv.children[0].getWorldPosition(V3()) };
    }
    if (s === 'tape') return { text: this.g.hasUpgrade('tapegun') ? 'Click the seam to fire the tape gun' : 'Drag along the seam to tape the box shut', target: () => this.box.localToWorld(V3(this.tape.started ? this.tape.hi : -BOX.W / 2 + 0.3, BOX.H + 0.1, 0)) };
    if (s === 'label') return { text: 'Click the printed shipping label to stick it on', target: () => this.label.getWorldPosition(V3()) };
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
    if (this.held) {
      if (this.held.sticky) this.release();
      return;
    }
    const it = this.pickHit(ndc);
    if (this.stage === 'tape' && it && (it.type === 'box' || (it.type === 'click' && (it.c.id === 'tape' || it.c.id.startsWith('flap'))))) {
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
    this.held = { item, plane: new THREE.Plane(V3(0, 1, 0), -planeY), planeY, t0: performance.now(), x0: ev.clientX, y0: ev.clientY, moved: false, sticky: false, magnet: false, grab: null };
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
    if (it) {
      if (it.type === 'item' && it.item.state === 'table') cur = 'grab';
      else if (it.type === 'pc' && this.stage === 'pc') cur = 'grab';
      else if (it.type === 'click' && it.c.avail()) cur = 'pointer';
      else if (this.stage === 'tape' && (it.type === 'box' || it.type === 'click')) cur = 'crosshair';
    }
    this.g.setCursor(cur);
    if (it && it.type === 'item' && it.item.state === 'table' && it.item.kind === 'card') this.g.ui.tooltip({ title: 'Thank-you card', sub: 'Optional — customers love it (+tip)', cat: 'Bonus', color: '#facc15' }, ev.clientX, ev.clientY);
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
    const item = h.item;
    if (h.magnet) this.drop(item);
    else this.returnHome(item);
  }

  async returnHome(item) {
    item.state = 'anim';
    audio.play('drop');
    await tweenObj(item.obj, { pos: item.home.pos.clone(), quat: item.home.quat.clone(), duration: 0.45, ease: Ease.inOutCubic });
    item.state = item.kind === 'pc' ? 'bench' : 'table';
  }

  async drop(item) {
    item.state = 'anim';
    this.busy = true;
    const target = this.targetFor(item);
    const obj = item.obj;
    const over = target.clone();
    over.y = obj.position.y;
    await tweenObj(obj, { pos: over, quat: QI(), duration: 0.12 });
    const fall = item.kind === 'pc' ? 0.75 : 0.3;
    await tweenObj(obj, { pos: target, duration: fall, ease: item.kind === 'pc' ? Ease.inOutSine : Ease.inQuad });
    this.box.attach(obj);
    item.state = 'in';
    this.busy = false;
    const wp = obj.getWorldPosition(V3()).add(V3(0, 0.5, 0));
    if (item.kind === 'pc') {
      audio.play('foam');
      audio.play('thump');
      this.g.fx.shake(0.1);
      this.g.fx.burst(this.box.localToWorld(V3(0, 0.6, 1.6)), { count: 30, color: '#e2e8f0', color2: '#cbd5e1', speed: 2.5, up: 0.5 });
      this.g.onAction(wp.add(V3(0, 5, 0)), 'Snug as a bug!');
      this.stage = 'foam';
      this.g.onPackStage('foam');
    } else if (item.kind === 'foam') {
      audio.play('foam');
      this.g.fx.burst(wp, { count: 24, color: '#f1f5f9', color2: '#e2e8f0', speed: 2.2, up: 0.4 });
      this.g.onAction(wp, 'Cushioned!');
      this.stage = this.requiredItemsIn() ? 'flaps' : 'acc';
    } else {
      audio.play(item.kind === 'card' ? 'pop' : 'cardboard', { pitch: 1.3 });
      this.g.fx.burst(wp, { count: 16, speed: 1.8 });
      this.g.onAction(wp, item.kind === 'card' ? 'Aww! +Tip' : 'Packed!');
      if (item.kind === 'card') this.g.orderStats.card = true;
      if (this.stage === 'acc' && this.requiredItemsIn()) this.stage = 'flaps';
    }
  }

  async clickFlap(f) {
    const list = this.g.hasUpgrade('flapper')
      ? [...this.flaps.filter((x) => x.kind === 'short' && !x.done), ...this.flaps.filter((x) => x.kind === 'long' && !x.done)]
      : [f];
    if (this.card.state === 'held') return;
    for (const fl of list) fl.done = true;
    this.busy = true;
    for (const fl of list) {
      const a0 = fl.piv.rotation[fl.axis];
      await tweens.add({ duration: 0.26, ease: Ease.outBackSoft, update: (e) => (fl.piv.rotation[fl.axis] = a0 * (1 - e)) });
      audio.play('cardboard', { pitch: 0.9 + Math.random() * 0.3 });
      this.g.fx.shake(0.025);
    }
    this.busy = false;
    this.g.onAction(f.piv.getWorldPosition(V3()).add(V3(0, 0.6, 0)), list.length > 1 ? 'Folded ×' + list.length : 'Fold!');
    if (this.flaps.every((x) => x.done)) {
      // the card/accessories can no longer be added
      this.stage = 'tape';
      this.tapeGun.visible = true;
      this.tapeGun.position.copy(this.box.localToWorld(V3(-BOX.W / 2 - 0.1, BOX.H + 0.08, 0)));
      this.tapeGun.rotation.set(0, Math.PI, 0);
    }
  }

  // ------------------------------------------------------------------ tape
  startTape(ndc) {
    if (this.g.hasUpgrade('tapegun')) {
      this.autoTape();
      return;
    }
    const x = this.tapeX(ndc);
    if (x === null) return;
    if (!this.tape.started) {
      this.tape.started = true;
      this.tape.lo = this.tape.hi = x;
      this.tape.mesh.visible = true;
    }
    this.tape.dragging = true;
    this.tape.lastX = x;
    this.tape.lastT = performance.now();
    audio.tapeStart();
  }
  tapeX(ndc) {
    const rc = this.g.raycaster;
    rc.setFromCamera(ndc, this.g.camera);
    const plane = new THREE.Plane(V3(0, 1, 0), -(BOX_TOP_WORLD + 0.07));
    const p = rc.ray.intersectPlane(plane, V3());
    if (!p) return null;
    const local = this.box.worldToLocal(p);
    return clamp(local.x, -BOX.W / 2, BOX.W / 2);
  }
  updateTapeMesh() {
    const t = this.tape;
    const len = Math.max(0.02, t.hi - t.lo);
    t.mesh.scale.x = len;
    t.mesh.position.x = (t.lo + t.hi) / 2;
    M.tape.map.repeat.x = len / 2.4;
    M.tape.map.offset.x = 0;
    this.tapeGun.position.copy(this.box.localToWorld(V3(t.lastX !== undefined ? t.lastX : t.hi, BOX.H + 0.08, 0)));
  }
  async autoTape() {
    if (this.tape.done) return;
    this.tape.started = true;
    this.tape.mesh.visible = true;
    this.busy = true;
    audio.tapeStart();
    this.tape.lo = -BOX.W / 2;
    await tweens.add({
      duration: 0.65, ease: Ease.inOutSine,
      update: (e) => {
        this.tape.hi = -BOX.W / 2 + e * BOX.W;
        this.tape.lastX = this.tape.hi;
        audio.tapeLevel(0.3);
        this.updateTapeMesh();
      },
    });
    audio.tapeStop();
    this.busy = false;
    this.finishTape();
  }
  finishTape() {
    if (this.tape.done) return;
    this.tape.done = true;
    this.tape.dragging = false;
    audio.tapeStop();
    this.tape.lo = -BOX.W / 2;
    this.tape.hi = BOX.W / 2;
    this.updateTapeMesh();
    this.tapeEnds.forEach((m) => (m.visible = true));
    audio.play('rip');
    this.g.fx.burst(this.box.localToWorld(V3(BOX.W / 2, BOX.H, 0)), { count: 20, color: '#fde68a', color2: '#fbbf24', speed: 2 });
    this.g.onAction(this.box.localToWorld(V3(0, BOX.H + 0.6, 0)), 'Sealed tight!');
    this.tapeGun.visible = false;
    this.stage = 'label';
    this.printLabel();
  }

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
    await tweens.add({ duration: 0.65, ease: Ease.linear, update: (e) => { lbl.position.lerpVectors(base, out, e); lbl.scale.set(0.6, 0.01 + e * 0.59, 0.6); } });
    lbl.scale.set(0.6, 0.6, 0.6);
    lbl.userData.ready = true;
    if (this.g.hasUpgrade('labeler')) {
      await wait(0.15);
      this.applyLabel();
    }
  }

  async applyLabel() {
    if (this.labelDone) return;
    this.labelDone = true;
    const lbl = this.label;
    lbl.userData.ready = false;
    audio.play('whoosh');
    const target = this.box.localToWorld(V3(1.4, BOX.H + 0.08, -0.8));
    const q = this.box.quaternion.clone().multiply(qEuler(-Math.PI / 2, 0, 0.06));
    const lift = target.clone().add(V3(0, 1.0, 0));
    await tweenObj(lbl, { pos: lift, quat: q, scale: 1.0, duration: 0.35, ease: Ease.inOutCubic });
    await tweenObj(lbl, { pos: target, duration: 0.1, ease: Ease.inQuad });
    this.box.attach(lbl);
    audio.play('stamp');
    this.g.fx.shake(0.06);
    this.g.fx.burst(target.clone().add(V3(0, 0.1, 0)), { count: 20, speed: 2.5, color: '#ffffff', color2: '#c4b5fd' });
    this.g.onAction(target.clone().add(V3(0, 0.5, 0)), 'Labelled!');
    this.stage = 'ship';
  }

  async ship() {
    if (this.stage !== 'ship') return;
    this.stage = 'shipping';
    const gen = this.g.gen;
    const cap = this.button.userData.cap;
    await tweens.add({ duration: 0.08, update: (e) => (cap.position.y = 1.2 - e * 0.08) });
    audio.play('stamp');
    tweens.add({ duration: 0.2, delay: 0.1, update: (e) => (cap.position.y = 1.12 + e * 0.08) });
    this.g.onShipStart();
    audio.play('conveyor');
    this.spinRollers = true;
    const from = this.box.position.clone();
    const to = V3(-25, from.y, from.z);
    await tweens.add({ duration: 2.1, ease: Ease.inCubic, update: (e) => this.box.position.lerpVectors(from, to, e) });
    this.spinRollers = false;
    if (gen !== this.g.gen) return;
    audio.play('cash');
    this.g.onShipped();
  }

  // ------------------------------------------------------------------ frame
  update(dt, t, ndc) {
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
        h.magnet = d < (h.item.kind === 'pc' || h.item.kind === 'foam' ? 1.8 : 0.9);
        if (h.magnet) {
          pos.x = target.x * 0.85 + pos.x * 0.15;
          pos.z = target.z * 0.85 + pos.z * 0.15;
        }
        obj.position.x = damp(obj.position.x, pos.x, 16, dt);
        obj.position.z = damp(obj.position.z, pos.z, 16, dt);
        obj.position.y = damp(obj.position.y, h.planeY, 10, dt);
      }
    }
    if (this.tape.dragging) {
      const x = this.tapeX(this.g.pointer);
      if (x !== null) {
        const now = performance.now();
        const v = Math.abs(x - this.tape.lastX) / Math.max(1, now - this.tape.lastT) * 1000;
        this.tape.lastX = x;
        this.tape.lastT = now;
        this.tape.lo = Math.min(this.tape.lo, x);
        this.tape.hi = Math.max(this.tape.hi, x);
        audio.tapeLevel(clamp(v / 12, 0, 1) * 0.35);
        this.updateTapeMesh();
        if (this.tape.hi - this.tape.lo >= BOX.W * 0.94) this.finishTape();
      }
    }
    // markers
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
    // ghost-ish target glow for held items
    const st = this.held ? null : this.currentStep();
    const idle = (performance.now() - this.lastAction) / 1000;
    const show = st && this.g.save.settings.hints && (this.order.tutorial || this.g.forceHint || idle > 7) && !this.busy;
    this.hintArrow.visible = !!show;
    if (show) {
      const p = st.target();
      this.hintArrow.position.set(p.x, p.y + 0.6 + Math.abs(Math.sin(t * 4)) * 0.3, p.z);
    }
    if (this.stage === 'shipping') this.g.ui.prompt(null);
    else this.g.ui.prompt(this.held ? (this.held.magnet ? 'Release to drop it in' : 'Carry it over the box') : this.tape.dragging ? 'Keep dragging along the seam…' : st ? st.text : null);
  }
}
