import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { THEMES, UPGRADES, TIERS, RANKS, CASES, JUDGE, OVERDRIVE, REVIEWS, rankFor, gradeFor } from './catalog.js';
import { TRANSMISSIONS, BARKS, CODEX, chapterFor } from './story.js';
import { tweens, damp, clamp, V3, fmtTime, wait, pick } from './util.js';
import { audio } from './audio.js';
import * as MD from './models.js';
import { M } from './models.js';
import { setAniso } from './textures.js';
import { buildStation, DECOR_SPOTS } from './env.js';
import { buildDecor } from './decor.js';
import { Post } from './post.js';
import { FX } from './fx.js';
import { UI, cr } from './ui.js';
import { Assembly } from './assembly.js';
import { Packing } from './packing.js';
import { generateOrder, baseActions, dayLength } from './orders.js';
import { loadSave, writeSave, wipeSave } from './save.js';
import { rollContracts, bumpStat, rollCrate, openCrate, signalGain, SIGNAL_MILESTONES } from './meta.js';

const VIEWS = {
  assembly: { pos: V3(2.4, 5.6, 11.8), look: V3(2.4, 2.3, 0) },
  test: { pos: V3(2.2, 4.5, 10.6), look: V3(2.2, 2.9, -0.8) },
  pack: { pos: V3(-4.6, 15.5, 15.0), look: V3(-4.6, 1.2, 0.3) },
  packClose: { pos: V3(-8.4, 15.0, 11.9), look: V3(-8.9, 1.7, 0.8) },
  ship: { pos: V3(-13.5, 10.5, 17), look: V3(-17, -0.8, -0.5) },
  launch: { pos: V3(-17, 3.5, 7), look: V3(-10.2, 3.8, -9.7) },
};
const PLAYING = new Set(['arrive', 'assemble', 'test', 'pack']);

class Game {
  constructor() {
    this.state = 'boot';
    this.paused = false;
    this.time = 0;
    this.gen = 0;
    this.pointer = new THREE.Vector2(0, 0);
    this.raycaster = new THREE.Raycaster();
    this.orbit = { yaw: 0, pitch: 0, zoom: 1, dragging: false, lx: 0, ly: 0, tyaw: 0, tpitch: 0 };
    this.combo = 0;
    this.maxCombo = 0;
    this.odTier = 0;
    this.lastActionT = -99;
    this.windowEnd = -99;
    this.rgbMode = { color: new THREE.Color('#8b5cf6'), rainbow: false };
    this.save = loadSave();
    this.tweens = tweens;
    this.fps = 60;
    this.decor = {};
  }

  // ------------------------------------------------------------------ boot
  async boot() {
    const canvas = document.getElementById('c');
    this.canvas = canvas;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = renderer;
    setAniso(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
    this.ui = new UI(this);
    this.theme = THEMES.find((t) => t.id === this.save.theme) || THEMES[0];
    this.ui.setTheme(this.theme);
    // fonts must be ready before we paint them into textures
    try {
      await Promise.race([
        Promise.all(['700 20px Rajdhani', '400 16px Inter', '600 16px Inter'].map((f) => document.fonts.load(f))),
        new Promise((r) => setTimeout(r, 1500)),
      ]);
    } catch (e) {}
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#03040a');
    scene.fog = new THREE.Fog('#05060e', 40, 90);
    this.scene = scene;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.38;

    this.camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 600);
    this.camPos = V3(12, 7, 16);
    this.camLook = V3(-1, 3, -1);
    this.view = null;

    MD.initMaterials();
    this.env = buildStation(this.theme);
    scene.add(this.env.group);
    this.keyLight = this.env.keyLight;
    this.fx = new FX(scene, this.camera, renderer);
    this.post = new Post(renderer, scene, this.camera);
    this.assembly = new Assembly(this);
    this.packing = new Packing(this);
    this.applyProps();
    this.applyDecor();
    this.applyQuality();
    addEventListener('resize', () => this.resize());
    this.bindInput();

    audio.setVolumes({ master: this.save.settings.master, music: this.save.settings.music, sfx: this.save.settings.sfx });
    this.toTitle(true);
    renderer.compile(scene, this.camera);
    this.last = performance.now();
    renderer.setAnimationLoop(() => this.loop());
    setTimeout(() => this.ui.hideLoading(), 300);
  }

  applyQuality() {
    const q = this.save.settings.quality;
    const r = this.renderer;
    r.setPixelRatio(q === 'ultra' || q === 'high' ? Math.min(devicePixelRatio, 2) : q === 'medium' ? Math.min(devicePixelRatio, 1.5) : 1);
    const sh = q !== 'low';
    const size = q === 'ultra' ? 4096 : q === 'high' ? 2048 : 1024;
    if (r.shadowMap.enabled !== sh || this.keyLight.shadow.mapSize.x !== size) {
      r.shadowMap.enabled = sh;
      this.keyLight.castShadow = sh;
      this.keyLight.shadow.mapSize.set(size, size);
      if (this.keyLight.shadow.map) {
        this.keyLight.shadow.map.dispose();
        this.keyLight.shadow.map = null;
      }
      this.scene.traverse((o) => {
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true));
      });
    }
    this.post.setQuality(q);
    this.env.setQuality(q);
    this.resize();
  }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, this.renderer.getPixelRatio());
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  applyTheme(theme) {
    this.theme = theme;
    this.ui.setTheme(theme);
    this.env.setTheme(theme);
  }
  themeColor() {
    return this.theme.a;
  }
  applyProps() {
    const p = this.env.props;
    p.espresso.visible = !!this.save.upgrades.espresso;
    p.driver.visible = !!this.save.upgrades.driver;
    p.gloves.visible = !!this.save.upgrades.gloves;
    p.tapegun.visible = !!this.save.upgrades.tapegun;
  }
  applyDecor() {
    const owned = (this.save.collection && this.save.collection.decor) || {};
    for (const id of Object.keys(owned)) {
      if (this.decor[id] || !DECOR_SPOTS[id]) continue;
      const d = buildDecor(id);
      const sp = DECOR_SPOTS[id];
      d.position.copy(sp.pos);
      d.rotation.y = sp.ry;
      this.scene.add(d);
      this.decor[id] = d;
    }
  }
  hasUpgrade(id) {
    return !!this.save.upgrades[id];
  }

  // ------------------------------------------------------------------ input
  bindInput() {
    const c = this.canvas;
    const ndc = (e) => {
      this.pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      return this.pointer;
    };
    document.addEventListener('pointerdown', () => audio.init(), { capture: true });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      ndc(e);
      try {
        c.setPointerCapture(e.pointerId);
      } catch (err) {}
      if (e.button === 2 || e.button === 1) {
        this.orbit.dragging = true;
        this.orbit.lx = e.clientX;
        this.orbit.ly = e.clientY;
        return;
      }
      if (this.paused || this.ui.isOpen) return;
      const ctl = this.controller();
      if (ctl) ctl.onDown(this.pointer, e);
    });
    c.addEventListener('pointermove', (e) => {
      ndc(e);
      if (this.orbit.dragging) {
        const o = this.orbit;
        o.tyaw = clamp(o.tyaw - (e.clientX - o.lx) * 0.004, -0.6, 0.6);
        o.tpitch = clamp(o.tpitch + (e.clientY - o.ly) * 0.003, -0.25, 0.35);
        o.lx = e.clientX;
        o.ly = e.clientY;
        return;
      }
      if (this.paused || this.ui.isOpen) return;
      const ctl = this.controller();
      if (ctl) ctl.onMove(this.pointer, e);
    });
    const up = (e) => {
      ndc(e);
      if (this.orbit.dragging && (e.button === 2 || e.button === 1 || e.type === 'pointercancel')) {
        this.orbit.dragging = false;
        return;
      }
      const ctl = this.controller();
      if (ctl && !this.paused) ctl.onUp(this.pointer, e);
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.orbit.zoom = clamp(this.orbit.zoom * (e.deltaY > 0 ? 1.08 : 0.93), 0.6, 1.35);
    }, { passive: false });
    addEventListener('keydown', (e) => {
      if (this.ui.txKey) {
        this.ui.txKey(e);
        return;
      }
      if (this.ui.isOpen && this.ui.onKey) {
        this.ui.onKey(e);
        return;
      }
      if (e.code === 'Escape') {
        if (PLAYING.has(this.state) && !this.paused) this.pause();
      } else if (e.code === 'KeyH') this.hint();
      else if (e.code === 'KeyM') this.toggleMute();
      else if (e.code === 'KeyF') this.toggleFullscreen();
      else if (e.code === 'KeyR' && !this.ui.isOpen) {
        this.orbit.tyaw = this.orbit.tpitch = 0;
        this.orbit.zoom = 1;
      }
    });
    addEventListener('blur', () => {
      if (PLAYING.has(this.state) && !this.paused && !this.ui.isOpen) this.pause();
    });
  }
  controller() {
    if (this.state === 'assemble' || this.state === 'test') return this.assembly;
    if (this.state === 'pack') return this.packing;
    return null;
  }
  setCursor(c) {
    if (this.canvas.style.cursor !== c) this.canvas.style.cursor = c;
  }
  toggleMute() {
    this.muted = !this.muted;
    audio.setVolumes({ master: this.muted ? 0 : this.save.settings.master });
    this.ui.toast(this.muted ? 'Sound muted (M)' : 'Sound on');
  }
  toggleFullscreen() {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    } catch (e) {}
  }
  hint() {
    if (!PLAYING.has(this.state)) return;
    this.forceHint = true;
    const st = this.state === 'pack' ? this.packing.currentStep() : this.assembly.currentStep();
    if (st) this.ui.toast('Hint: ' + st.text, 'good');
  }

  // ------------------------------------------------------------------ story
  async tx(id, force = false) {
    const lines = TRANSMISSIONS[id];
    if (!lines || (this.save.seen[id] && !force)) return;
    this.save.seen[id] = true;
    writeSave(this.save);
    const prev = this.state;
    this.state = 'story';
    audio.setDuck(0.55);
    await this.ui.transmission(lines);
    audio.setDuck(1);
    this.state = prev;
    const unlocked = CODEX.filter((c) => c.unlock === id);
    if (unlocked.length) this.ui.toast(`Codex updated: ${unlocked.map((c) => c.title).join(', ')}`, 'gold');
  }
  // one-time coaching the first time a mechanic shows up
  onStep(id) {
    const TIPS = {
      mbScrews: ['orin', 'Torque check: HOLD a screw and release when the needle hits gold. Too early and it backs out.'],
      paste: ['orin', 'Thermal paste: hold on the CPU for a pea-sized blob. Fill the gold ring — not the whole socket.'],
      c24: ['juno', 'Cables! Drag the connector out of the grommet to its glowing port. Tidy routes make me happy.'],
      tape: ['juno', 'One clean swipe along the seam. Wobbly tape means wobbly reviews!'],
      stamp: ['juno', 'Stamp it the moment the blue ring meets the gold one!'],
    };
    const t = TIPS[id];
    if (!t || this.save.seen['tip_' + id]) return;
    this.save.seen['tip_' + id] = true;
    this.ui.bark(t[0], t[1]);
  }
  bark(kind) {
    const list = BARKS[kind];
    if (!list) return;
    const [who, text] = pick(list);
    this.ui.bark(who, text);
  }

  // ------------------------------------------------------------------ menus
  async menuAction(a) {
    if (a === 'new' || a === 'continue') return this.startShift();
    this.ui.hideTitle();
    if (a === 'workshop') await this.openWorkshop();
    else if (a === 'codex') await this.ui.codex(this.save);
    else if (a === 'howto') await this.ui.howto();
    else if (a === 'settings') await this.openSettings();
    else if (a === 'credits') await this.ui.credits();
    if (this.state === 'title') this.ui.showTitle(this.save);
  }
  openWorkshop() {
    return this.ui.workshop(this.save, (id) => {
      const u = UPGRADES.find((x) => x.id === id);
      if (!u || this.save.upgrades[id] || this.save.money < u.price) return false;
      this.save.money -= u.price;
      this.save.upgrades[id] = true;
      audio.play('buy');
      this.post.pulse(this.theme.b, 0.15);
      this.applyProps();
      writeSave(this.save);
      return true;
    }, (id) => {
      const t = THEMES.find((x) => x.id === id);
      if (!this.save.themes[id]) {
        if (t.crate || this.save.money < t.price) {
          audio.play('error');
          return false;
        }
        this.save.money -= t.price;
        this.save.themes[id] = true;
        audio.play('buy');
      }
      this.save.theme = id;
      this.applyTheme(t);
      writeSave(this.save);
      return true;
    });
  }
  openSettings() {
    return this.ui.settings(this.save, (k, v) => {
      if (k === 'master' || k === 'music' || k === 'sfx') audio.setVolumes({ [k]: v });
      if (k === 'quality') this.applyQuality();
      writeSave(this.save);
    }, () => {
      wipeSave();
      location.reload();
    });
  }

  async pause() {
    if (this.paused) return;
    this.paused = true;
    this.assembly.cancelHold();
    if (this.packing.held) {
      const h = this.packing.held;
      this.packing.held = null;
      this.packing.returnHome(h.item);
    }
    audio.setDuck(0.4);
    audio.tapeStop();
    for (;;) {
      const a = await this.ui.pauseMenu();
      if (a === 'resume') break;
      if (a === 'howto') await this.ui.howto();
      if (a === 'codex') await this.ui.codex(this.save);
      if (a === 'settings') await this.openSettings();
      if (a === 'menu') {
        this.paused = false;
        audio.setDuck(1);
        this.toTitle();
        return;
      }
    }
    this.paused = false;
    audio.setDuck(1);
  }

  // ------------------------------------------------------------------ flow
  toTitle(first = false) {
    this.gen++;
    this.state = 'title';
    this.paused = false;
    this.ui.close();
    this.ui.showHud(false);
    this.ui.prompt(null);
    document.getElementById('rgbpick').classList.add('hidden');
    audio.humStop();
    audio.tapeStop();
    audio.setMood('title');
    this.setOverdrive(0, true);
    if (!first) {
      if (this.assembly.active) this.assembly.teardown();
      if (this.assembly.caseObj) this.assembly.caseObj.removeFromParent();
      if (this.assembly.panel) this.assembly.panel.removeFromParent();
      this.packing.teardown();
    }
    this.packing.pc = null;
    this.assembly.fanSpeed = 0;
    const sc = this.assembly.buildShowcase({
      parts: { mb: 'mb', cpu: 'orion9', cooler: 'aio360', ram: 'r64', ssd: 's4', gpu: 'q90', psu: 'w1000' },
      caseVariant: CASES[0],
    });
    this.showcase = sc;
    this.assembly.buildTray({ parts: { mb: 'mb', cpu: 'orion7', cooler: 'tower', ram: 'r32', ssd: 's2', gpu: 'q80', psu: 'w850' }, decoys: ['orion5', 'p70', 'w750'] });
    for (const p of this.assembly.parts) p.obj.visible = true;
    this.assembly.fanSpeed = 1;
    M.rgb.emissiveIntensity = 2.4;
    this.setRgbMode('rainbow');
    this.assembly.drawScreen('splash');
    M.ledGreen.emissiveIntensity = 2;
    this.view = 'title';
    writeSave(this.save);
    this.ui.showTitle(this.save);
    if (first) this.ui.splash();
  }

  async startShift() {
    this.ui.hideTitle();
    this.assembly.teardown();
    if (this.showcase) {
      this.showcase.removeFromParent();
      this.showcase = null;
      this.assembly.caseObj = null;
      this.assembly.panel = null;
    }
    this.assembly.fanSpeed = 0;
    M.rgb.emissiveIntensity = 0;
    M.ledGreen.emissiveIntensity = 0;
    this.assembly.drawScreen('off');
    audio.setMood('shift');
    this.save.started = true;
    if (!this.save.dayStats) this.save.dayStats = { orders: 0, stars: 0, earned: 0, best: null, bestGrade: null };
    if (!this.save.contracts || !this.save.contracts.length || this.save.orderInDay === 0 && this.save.contractsDay !== this.save.day) {
      this.save.contracts = rollContracts(this.save);
      this.save.contractsDay = this.save.day;
    }
    this.view = 'assembly';
    this.ui.showHud(true);
    this.ui.contracts(this.save.contracts);
    if (!this.save.seen.intro) await this.tx('intro');
    else if (this.save.orderInDay === 0) {
      this.ui.toast(`Day ${this.save.day} — ${dayLength(this.save.day)} orders on the board`, 'good');
      this.bark('day');
    }
    await this.beginOrder();
  }

  async beginOrder() {
    const gen = ++this.gen;
    const rank = rankFor(this.save.xp);
    const special = rank >= RANKS.length && !this.save.finaleDone;
    if (special && !this.save.seen.finaleOrder) await this.tx('finaleOrder');
    if (gen !== this.gen) return;
    const tutorial = this.save.stats.orders === 0;
    const order = generateOrder(this.save, { tutorial, special });
    this.order = order;
    this.orderStats = { qaFails: 0, card: false, samples: [], perfects: 0, wrongs: 0, peakTier: 0, bench: 0, perfectStreak: 0 };
    this.combo = 0;
    this.maxCombo = 0;
    this.lastActionT = -99;
    this.windowEnd = -99;
    this.setOverdrive(0, true);
    this.orderTime = 0;
    let par = 0;
    if (!tutorial) {
      par = baseActions(order) * 4.3 + 34;
      if (this.hasUpgrade('espresso')) par *= 1.2;
      if (order.rush) par *= 0.75;
      if (special) par *= 1.4;
      par = Math.round(par / 5) * 5;
    }
    this.par = par;
    this.state = 'arrive';
    this.view = 'assembly';
    this.orbit.tyaw = this.orbit.tpitch = 0;
    this.packing.setupBox(order);
    this.ui.showTicket(order, par);
    await this.assembly.setup(order);
    if (gen !== this.gen) return;
    this.state = 'assemble';
    if (tutorial) this.ui.toast('Follow the glowing arrow and the objective at the bottom of the screen', 'good');
    else if (order.rush) this.ui.toast('RUSH ORDER — tighter par, 1.5× pay!', 'warn');
    else if (special) this.ui.toast('THE LIGHTHOUSE CORE — legendary components on the pads', 'gold');
  }

  // ------------------------------------------------------------------ judgement, flow & overdrive
  comboWindow() {
    return 4.0 + (this.hasUpgrade('capacitor') ? 1.5 : 0);
  }
  addCombo(extra = 0) {
    const t = this.time;
    this.combo = t <= this.windowEnd ? this.combo + 1 : 1;
    this.windowEnd = t + this.comboWindow() + extra;
    this.lastActionT = t;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const tier = OVERDRIVE.reduce((a, o) => (this.combo >= o.at ? o.tier : a), 0);
    if (tier > this.odTier) this.setOverdrive(tier);
  }
  setOverdrive(tier, silent = false) {
    const prev = this.odTier;
    this.odTier = tier;
    const o = OVERDRIVE[tier];
    this.post.setEdge(tier ? 0.12 + tier * 0.1 : 0, o.color);
    audio.setIntensity(tier);
    if (silent) return;
    if (tier > prev) {
      this.ui.odBanner(tier);
      audio.play('overdrive', { tier });
      this.post.pulse(o.color, 0.22);
      this.fx.shake(0.08 + tier * 0.03);
      this.bark('od' + tier);
      if (this.orderStats) this.orderStats.peakTier = Math.max(this.orderStats.peakTier, tier);
      if (tier >= 2) this.stat('od2');
      if (tier >= 3) this.stat('od3');
    } else if (tier === 0 && prev > 0) {
      audio.play('flowlost');
      this.ui.toast('Flow lost', 'warn');
    }
  }
  judge(kind, tier, pos, sub = null, silent = false) {
    if (!PLAYING.has(this.state) || !this.orderStats) return;
    const J = JUDGE[tier];
    this.orderStats.samples.push(J.score);
    if (tier === 'perfect') {
      this.orderStats.perfects++;
      this.orderStats.perfectStreak++;
      this.save.stats.perfects = (this.save.stats.perfects || 0) + 1;
      this.stat('perfect');
      const map = { screw: 'perfectScrew', paste: 'perfectPaste', cable: 'perfectCable', tape: 'perfectTape', stamp: 'perfectStamp' };
      if (map[kind]) this.stat(map[kind]);
      if (this.orderStats.perfectStreak === 5) this.bark('perfectStreak');
    } else this.orderStats.perfectStreak = 0;
    if (tier !== 'sloppy') this.addCombo(tier === 'perfect' ? 0.6 : 0);
    if (!silent) {
      this.fx.judge(pos, J.label, sub || (this.combo >= 3 ? `FLOW ×${this.combo}` : ''), J.cls);
      audio.play(tier, { combo: this.combo });
      if (tier === 'perfect') this.post.pulse('#fde68a', 0.07);
    }
    this.forceHint = false;
    this.assembly.lastAction = this.packing.lastAction = performance.now();
  }
  action(pos, text) {
    if (!PLAYING.has(this.state)) return;
    this.addCombo();
    this.fx.float(pos, this.combo >= 3 ? `${text}  ×${this.combo}` : text, this.combo >= 12 ? 'gold' : '');
    this.forceHint = false;
    this.assembly.lastAction = this.packing.lastAction = performance.now();
  }
  wrong(pos) {
    if (!this.orderStats) return;
    this.orderStats.wrongs++;
    this.orderStats.perfectStreak = 0;
    this.fx.judge(pos, 'WRONG PART', 'CHECK THE WORK ORDER', 'wrong');
    audio.play('error');
    this.combo = 0;
    this.windowEnd = -99;
    if (this.odTier) this.setOverdrive(0);
    this.bark('wrong');
  }
  comboPitch() {
    return 1 + Math.min(this.combo, 14) * 0.035;
  }
  currentQuality() {
    const s = this.orderStats;
    if (!s || !s.samples.length) return 0.8;
    const avg = s.samples.reduce((a, b) => a + b, 0) / s.samples.length;
    return clamp(avg - s.wrongs * 0.04 - s.qaFails * 0.12, 0, 1);
  }
  stat(name, n = 1) {
    const done = bumpStat(this.save, name, n);
    for (const c of done) {
      this.save.money += c.reward.money;
      (this.pendingCrates = this.pendingCrates || []).push(c.reward.crate);
      this.ui.toast(`CONTRACT COMPLETE — ${c.text} · +${cr(c.reward.money)} & ${c.reward.crate} crate`, 'gold');
      audio.play('contract');
      this.post.pulse('#facc15', 0.15);
    }
    if (done.length || name) this.ui.contracts(this.save.contracts);
  }
  toast(m, k) {
    this.ui.toast(m, k);
  }
  setRgbMode(c) {
    if (c === 'rainbow') this.rgbMode.rainbow = true;
    else {
      this.rgbMode.rainbow = false;
      this.rgbMode.color.set(c);
    }
  }

  // ------------------------------------------------------------------ stage callbacks
  onTestStart() {
    if (!PLAYING.has(this.state)) return;
    this.state = 'test';
    this.view = 'test';
    this.ui.ticketCollapse(true);
  }
  onQAFail(fails) {
    if (!PLAYING.has(this.state)) return;
    this.state = 'assemble';
    this.view = 'assembly';
    this.orderStats.qaFails++;
    this.save.stats.qaFails++;
    this.combo = 0;
    this.windowEnd = -99;
    if (this.odTier) this.setOverdrive(0);
    this.ui.ticketCollapse(false);
    this.ui.toast(`QA failed: ${fails.map((f) => f.label).join(', ')} doesn't match the order. Swap it and re-test.`, 'warn');
    this.bark('qaFail');
  }
  onBenchmark(score, record) {
    this.orderStats.bench = score;
    if (record) {
      this.save.records[this.order.tier] = score;
      this.ui.toast(`NEW ${this.order.tierName.toUpperCase()} RECORD — ${score.toLocaleString('en-US')}`, 'gold');
    }
  }
  onTestPassed() {
    if (!PLAYING.has(this.state)) return;
    const pc = this.assembly.caseObj;
    this.assembly.teardown();
    this.assembly.caseObj = null;
    this.assembly.panel = null;
    this.state = 'pack';
    this.view = 'pack';
    this.ui.ticketCollapse(false);
    this.packing.receivePC(pc);
    this.ui.toast('QA passed — pack it for launch!', 'good');
  }
  onPackStage(stage) {
    if (this.state === 'pack' && stage === 'foam') this.view = 'packClose';
  }
  onShipStart() {
    if (this.state === 'pack') this.view = 'ship';
  }
  onLaunch() {
    if (this.state === 'pack') this.view = 'launch';
  }

  async onShipped() {
    if (this.state !== 'pack') return;
    const gen = this.gen;
    this.state = 'results';
    this.ui.prompt(null);
    this.setOverdrive(0, true);
    const s = this.save;
    const res = this.computeResults();
    const rankBefore = rankFor(s.xp);
    const sigBefore = s.signal || 0;
    s.money += res.total;
    s.xp += res.xp;
    if (res.xpBoost) s.xpBoost = Math.max(0, (s.xpBoost || 0) - 1);
    s.stats.orders++;
    s.stats.earned += res.total;
    if (res.grade.id === 'S') s.stats.sGrades = (s.stats.sGrades || 0) + 1;
    if (!s.stats.bestTime || res.time < s.stats.bestTime) s.stats.bestTime = res.time;
    s.dayStats.orders++;
    s.dayStats.earned += res.total;
    if (!s.dayStats.best || res.time < s.dayStats.best) s.dayStats.best = res.time;
    const gOrder = 'SABCD';
    if (!s.dayStats.bestGrade || gOrder.indexOf(res.grade.id) < gOrder.indexOf(s.dayStats.bestGrade)) s.dayStats.bestGrade = res.grade.id;
    if (this.order.special || s.finaleDone) s.signal = 100;
    else if (res.signalGain) s.signal = Math.min(99, sigBefore + res.signalGain);
    res.signal = s.signal;
    // contract stats from the finished order
    if ('SA'.includes(res.grade.id)) this.stat('gradeA');
    if (res.grade.id === 'S') this.stat('gradeS');
    if (this.par && this.par - res.time >= 20) this.stat('parBy20');
    if (this.orderStats.card) this.stat('card');
    s.orderInDay++;
    writeSave(s);
    const rankAfter = rankFor(s.xp);
    const cur = RANKS[rankAfter - 1].xp, next = RANKS[rankAfter] ? RANKS[rankAfter].xp : cur + 1;
    const pct = (x) => (rankAfter >= RANKS.length ? 100 : clamp(((x - cur) / (next - cur)) * 100, 0, 100));
    res.xpFrom = rankAfter > rankBefore ? 0 : pct(s.xp - res.xp);
    res.xpTo = pct(s.xp);
    res.rankName = `Rank ${rankAfter} · ${RANKS[rankAfter - 1].name}`;
    const dayDone = s.orderInDay >= dayLength(s.day);
    if (res.grade.id === 'S') {
      this.fx.confetti(this.camLook.clone().add(V3(0, 2, 3)), 180);
      this.bark('gradeS');
    }
    await wait(0.3);
    await this.ui.results(res);
    if (gen !== this.gen) return;
    // supply crates
    const crates = [rollCrate(res.grade.id, this.hasUpgrade('scanner'), this.order.special ? 'legendary' : null), ...(this.pendingCrates || [])];
    this.pendingCrates = [];
    for (const rarity of crates) {
      const reward = openCrate(s, rarity);
      writeSave(s);
      await this.ui.crate(rarity, reward);
      if (reward.kind === 'decor') this.applyDecor();
      if (gen !== this.gen) return;
    }
    if (s.stats.orders === 1) await this.tx('firstShip');
    if (rankAfter > rankBefore) {
      audio.play('levelup');
      this.fx.confetti(this.camLook.clone().add(V3(0, 3, 2)), 200);
      this.post.pulse(this.theme.a, 0.3);
      await this.ui.rankUp(rankAfter);
      for (let r = rankBefore + 1; r <= rankAfter; r++) await this.tx('rank' + r);
      if (rankAfter >= 3 && sigBefore === 0 && !this.order.special) this.ui.toast('Signal decoding is now online — every build helps', 'gold');
    }
    for (const m of SIGNAL_MILESTONES) if (sigBefore < m && s.signal >= m) await this.tx('sig' + m);
    if (this.order.special) {
      s.finaleDone = true;
      s.careerDone = true;
      writeSave(s);
      audio.setMood('finale');
      this.view = 'launch';
      this.env.sky.material.uniforms.uBoost.value = 0.6;
      await this.tx('finale');
      this.env.sky.material.uniforms.uBoost.value = 0;
      audio.setMood('shift');
      await this.ui.certificate(s);
    }
    if (gen !== this.gen) return;
    this.packing.teardown();
    if (dayDone) {
      const ds = s.dayStats;
      const choice = await this.ui.dayEnd({
        day: s.day, orders: ds.orders, earned: ds.earned, best: ds.best, money: s.money, bestGrade: ds.bestGrade, contracts: s.contracts,
        headline: ds.bestGrade === 'S' ? 'Legendary shift' : ds.bestGrade === 'A' ? 'Great shift' : 'Shift done',
      });
      s.day++;
      s.orderInDay = 0;
      s.dayStats = { orders: 0, stars: 0, earned: 0, best: null, bestGrade: null };
      s.contracts = rollContracts(s);
      s.contractsDay = s.day;
      writeSave(s);
      this.ui.contracts(s.contracts);
      if (choice === 'menu') return this.toTitle();
      if (choice === 'workshop') await this.openWorkshop();
      this.ui.toast(`Day ${s.day} — ${dayLength(s.day)} orders on the board · new contracts posted`, 'good');
      this.bark('day');
    }
    if (gen !== this.gen) return;
    await this.beginOrder();
  }

  computeResults() {
    const o = this.order, st = this.orderStats;
    const time = this.orderTime, par = this.par;
    const quality = this.currentQuality();
    const grade = gradeFor(quality, st.qaFails);
    const rows = [];
    const base = o.pay;
    let total = base;
    rows.push({ label: `${o.tierName} build${o.vip ? ' (VIP)' : ''}`, value: cr(base) });
    if (par) {
      if (time <= par * 0.7) {
        const b = Math.round(base * 0.5);
        total += b;
        rows.push({ label: 'Lightning bonus (under 70% of par)', value: '+' + cr(b), cls: 'pos' });
      } else if (time <= par) {
        const b = Math.round(base * 0.3);
        total += b;
        rows.push({ label: 'Beat par', value: '+' + cr(b), cls: 'pos' });
      } else rows.push({ label: `Over par by ${fmtTime(time - par)}`, value: cr(0), cls: 'neg' });
    }
    if (st.perfects) {
      const b = st.perfects * 4;
      total += b;
      rows.push({ label: `Perfect actions ×${st.perfects}`, value: '+' + cr(b), cls: 'pos' });
    }
    if (st.qaFails) {
      const p = Math.round(base * 0.15) * st.qaFails;
      total -= p;
      rows.push({ label: `QA retries ×${st.qaFails}`, value: '−' + cr(p), cls: 'neg' });
    }
    if (st.card) {
      const tip = 12 + Math.round(base * 0.06);
      total += tip;
      rows.push({ label: 'Thank-you card tip', value: '+' + cr(tip), cls: 'pos' });
    }
    const gm = grade.mult;
    if (gm !== 1) {
      const d = Math.round(total * (gm - 1));
      total += d;
      rows.push({ label: `Grade ${grade.id} ×${gm}`, value: (d >= 0 ? '+' : '−') + cr(Math.abs(d)), cls: d >= 0 ? 'mul' : 'neg' });
    }
    if (st.peakTier) {
      const od = OVERDRIVE[st.peakTier];
      const d = Math.round(total * (od.mult - 1));
      total += d;
      rows.push({ label: `Peak ${od.name} ×${od.mult}`, value: '+' + cr(d), cls: 'mul' });
    }
    if (o.rush) {
      const d = Math.round(total * 0.5);
      total += d;
      rows.push({ label: 'Rush order ×1.5', value: '+' + cr(d), cls: 'mul' });
    }
    if (this.hasUpgrade('loyalty')) {
      const d = Math.round(total * 0.15);
      total += d;
      rows.push({ label: 'Loyalty program +15%', value: '+' + cr(d), cls: 'mul' });
    }
    total = Math.max(10, Math.round(total));
    const tierIdx = Math.max(0, TIERS.findIndex((t) => t.id === o.tier));
    const gBonus = { S: 40, A: 28, B: 18, C: 10, D: 4 }[grade.id];
    const xpBoost = (this.save.xpBoost || 0) > 0;
    const xp = Math.round((30 + gBonus + Math.min(4, tierIdx) * 8) * (xpBoost ? 2 : 1));
    const rank = rankFor(this.save.xp);
    const sg = rank >= 3 && !o.special && !this.save.finaleDone ? signalGain(o, quality) : 0;
    const reviewStars = { S: 5, A: 5, B: 4, C: 3, D: 2 }[grade.id];
    return {
      no: o.no, city: o.city, customer: o.customerFull, rows, total, grade, quality, xp, xpBoost, time, par,
      maxCombo: this.maxCombo, perfects: st.perfects, bench: st.bench, signalGain: sg, review: pick(REVIEWS[grade.id]), reviewStars,
    };
  }

  // ------------------------------------------------------------------ loop
  updateCamera(dt) {
    const asp = this.camera.aspect;
    let pos, look;
    if (this.view === 'title') {
      // slow cinematic dolly: workshop on the right, Saturn & Andromeda through the window
      const s = Math.sin(this.time * 0.06);
      pos = V3(-24 + s * 2.5, 6 + Math.sin(this.time * 0.09) * 0.5, 14 - s * 1.5);
      look = V3(-12.8 + s * 1.2, 4.8, 2.2);
    } else {
      const v = VIEWS[this.view] || VIEWS.assembly;
      pos = v.pos.clone();
      look = v.look.clone();
    }
    const k = Math.pow(Math.max(1, 1.7 / asp), 0.85) * (this.view === 'launch' || this.view === 'title' ? 1 : this.orbit.zoom);
    const off = pos.clone().sub(look).multiplyScalar(k);
    const o = this.orbit;
    if (!o.dragging) {
      o.tyaw = damp(o.tyaw, 0, 0.6, dt);
      o.tpitch = damp(o.tpitch, 0, 0.6, dt);
    }
    o.yaw = damp(o.yaw, o.tyaw, 8, dt);
    o.pitch = damp(o.pitch, o.tpitch, 8, dt);
    off.applyAxisAngle(V3(0, 1, 0), o.yaw);
    const right = V3(1, 0, 0).applyAxisAngle(V3(0, 1, 0), o.yaw);
    off.applyAxisAngle(right, -o.pitch);
    if (this.state !== 'title') off.add(V3(this.pointer.x * 0.25, this.pointer.y * 0.15, 0));
    pos = look.clone().add(off);
    const far = this.camPos.distanceTo(pos);
    if (far > 3) pos.y += (far - 3) * 0.45;
    const lam = this.view === 'title' ? 1.2 : this.view === 'launch' ? 2.2 : 3.2;
    this.camPos.x = damp(this.camPos.x, pos.x, lam, dt);
    this.camPos.y = damp(this.camPos.y, pos.y, lam, dt);
    this.camPos.z = damp(this.camPos.z, pos.z, lam, dt);
    this.camLook.x = damp(this.camLook.x, look.x, lam, dt);
    this.camLook.y = damp(this.camLook.y, look.y, lam, dt);
    this.camLook.z = damp(this.camLook.z, look.z, lam, dt);
    this.camera.position.copy(this.camPos);
    const sh = this.save.settings.shake !== false ? this.fx.shakeOffset(this.time) : null;
    if (sh) this.camera.position.add(sh);
    this.camera.lookAt(this.camLook);
  }

  loop() {
    // measure with performance.now(): rAF timestamps can lag behind it and go "backwards"
    const now = performance.now();
    const dt = clamp((now - this.last) / 1000, 0, 0.05);
    this.fps = this.fps * 0.95 + (1000 / Math.max(1, now - this.last)) * 0.05;
    this.last = now;
    const gdt = this.paused ? 0 : dt;
    tweens.update(gdt);
    this.time += gdt;
    if (!this.paused && (this.state === 'assemble' || this.state === 'test' || this.state === 'pack')) this.orderTime += gdt;
    this.env.update(this.time, gdt);
    for (const id in this.decor) {
      const d = this.decor[id];
      if (d.userData.anim) d.userData.anim(d, this.time);
    }
    this.assembly.update(gdt, this.time);
    this.packing.update(gdt, this.time);
    this.fx.update(gdt);
    if (this.rgbMode.rainbow) M.rgb.emissive.setHSL((this.time * 0.12) % 1, 1, 0.55);
    else M.rgb.emissive.copy(this.rgbMode.color);
    this.updateCamera(dt);
    // combo window expiry
    if (this.combo > 0 && this.time > this.windowEnd && PLAYING.has(this.state)) {
      this.combo = 0;
      if (this.odTier) this.setOverdrive(0);
    }
    if (PLAYING.has(this.state) || this.state === 'results' || this.state === 'story') {
      this.hudT = (this.hudT || 0) + dt;
      if (this.hudT > 0.1) {
        this.hudT = 0;
        const rank = rankFor(this.save.xp);
        this.ui.hud({ day: this.save.day, order: Math.min(dayLength(this.save.day), this.save.orderInDay + (this.state === 'results' ? 0 : 1)), orders: dayLength(this.save.day), time: this.orderTime || 0, par: this.par, money: this.save.money, xp: this.save.xp, signal: this.save.signal || 0, chapter: chapterFor(rank) });
        const next = OVERDRIVE[Math.min(3, this.odTier + 1)];
        const prevAt = OVERDRIVE[this.odTier].at;
        const frac = this.odTier >= 3 ? 1 : (this.combo - prevAt) / Math.max(1, next.at - prevAt);
        const win = this.combo > 0 ? (this.windowEnd - this.time) / this.comboWindow() : 0;
        this.ui.overdrive(this.combo, this.odTier, (this.odTier + clamp(frac, 0, 1)) / 3, win);
      }
    }
    this.autoQuality(dt);
    this.post.render(dt, this.time);
  }

  autoQuality(dt) {
    if (this.save.settings.autoChecked || this.state !== 'assemble' || this.paused) return;
    this.aq = this.aq || { t: 0, frames: 0 };
    this.aq.t += dt;
    this.aq.frames++;
    if (this.aq.t > 5) {
      const fps = this.aq.frames / this.aq.t;
      const q = this.save.settings.quality;
      const order = ['ultra', 'high', 'medium', 'low'];
      let i = order.indexOf(q);
      if (fps < 40 && i < 3) i++;
      if (fps < 28 && i < 3) i++;
      if (fps < 20 && i < 3) i++;
      if (order[i] !== q) {
        this.save.settings.quality = order[i];
        this.applyQuality();
        this.ui.toast(`Graphics set to ${order[i]} for smoother play (change in Settings)`);
      }
      this.save.settings.autoChecked = true;
      writeSave(this.save);
    }
  }
}

const game = new Game();
window.__game = game; // handy for support & automated testing
game.boot().catch((e) => {
  console.error(e);
  const l = document.getElementById('loading');
  if (l) l.querySelector('p').textContent = 'Sorry — this PC could not start the 3D renderer (WebGL). ' + (e && e.message ? e.message : '');
});
