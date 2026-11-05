import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { THEMES, UPGRADES, TIERS, RANKS, CASES, rankFor } from './catalog.js';
import { tweens, damp, clamp, V3, fmtMoney, fmtTime, wait } from './util.js';
import { audio } from './audio.js';
import * as MD from './models.js';
import { M } from './models.js';
import { setAniso } from './textures.js';
import { FX } from './fx.js';
import { UI } from './ui.js';
import { Assembly } from './assembly.js';
import { Packing } from './packing.js';
import { generateOrder, baseActions, dayLength } from './orders.js';
import { loadSave, writeSave, wipeSave } from './save.js';

const VIEWS = {
  assembly: { pos: V3(2.4, 5.6, 11.8), look: V3(2.4, 2.3, 0) },
  test: { pos: V3(2.2, 4.5, 10.6), look: V3(2.2, 2.9, -0.8) },
  pack: { pos: V3(-4.6, 15.5, 15.0), look: V3(-4.6, 1.2, 0.3) },
  packClose: { pos: V3(-8.4, 15.0, 11.9), look: V3(-8.9, 1.7, 0.8) },
  ship: { pos: V3(-12.5, 7.5, 12.5), look: V3(-15.5, -1.2, 0) },
};
const PLAYING = new Set(['arrive', 'assemble', 'test', 'pack']);
const COMBO_WINDOW = 4.0;

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
    this.lastActionT = -99;
    this.rgbMode = { color: new THREE.Color('#8b5cf6'), rainbow: false };
    this.save = loadSave();
    this.tweens = tweens;
    this.fps = 0;
  }

  // ------------------------------------------------------------------ boot
  async boot() {
    const canvas = document.getElementById('c');
    this.canvas = canvas;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = renderer;
    setAniso(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
    this.ui = new UI(this);
    this.theme = THEMES.find((t) => t.id === this.save.theme) || THEMES[0];
    this.ui.setTheme(this.theme);
    // give the loading screen a frame to appear
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#07080f');
    scene.fog = new THREE.Fog('#07080f', 34, 70);
    this.scene = scene;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.42;

    this.camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 200);
    this.camPos = V3(10, 6, 14);
    this.camLook = V3(1.5, 2.4, 0);
    this.view = null;

    MD.initMaterials();
    this.env = MD.buildEnvironment(this.theme);
    scene.add(this.env.group);
    this.setupLights();
    this.fx = new FX(scene, this.camera, renderer);
    this.assembly = new Assembly(this);
    this.packing = new Packing(this);
    this.applyProps();

    // post
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.55, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.applyQuality();
    this.resize();
    addEventListener('resize', () => this.resize());
    this.bindInput();

    audio.setVolumes({ master: this.save.settings.master, music: this.save.settings.music, sfx: this.save.settings.sfx });
    this.toTitle(true);
    // warm up shaders
    renderer.compile(scene, this.camera);
    this.last = performance.now();
    renderer.setAnimationLoop((t) => this.loop(t));
    setTimeout(() => this.ui.hideLoading(), 250);
  }

  setupLights() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight('#c7d2fe', '#1b1424', 0.6));
    const key = new THREE.DirectionalLight('#fff3e3', 2.3);
    key.position.set(7, 17, 13);
    key.target.position.set(-3, 0, 0);
    key.castShadow = true;
    const sc = key.shadow.camera;
    sc.left = -17;
    sc.right = 13;
    sc.top = 11;
    sc.bottom = -11;
    sc.near = 2;
    sc.far = 50;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.03;
    s.add(key, key.target);
    this.keyLight = key;
    const fill = new THREE.DirectionalLight('#a5b4fc', 0.55);
    fill.position.set(-12, 7, 9);
    s.add(fill);
    this.rimA = new THREE.PointLight(this.theme.a, 40, 24, 1.6);
    this.rimA.position.set(2.6, 6.2, -2.3);
    this.rimB = new THREE.PointLight(this.theme.b, 30, 22, 1.6);
    this.rimB.position.set(-9.5, 5.5, -2.2);
    s.add(this.rimA, this.rimB);
    const bench = new THREE.SpotLight('#ffffff', 60, 20, 0.62, 0.6, 1.6);
    bench.position.set(1.2, 10.5, 3.5);
    bench.target.position.set(1.5, 1.5, 0);
    s.add(bench, bench.target);
  }

  applyQuality() {
    const q = this.save.settings.quality;
    const r = this.renderer;
    r.setPixelRatio(q === 'high' ? Math.min(devicePixelRatio, 2) : q === 'medium' ? Math.min(devicePixelRatio, 1.5) : 1);
    const sh = q !== 'low';
    const size = q === 'high' ? 2048 : 1024;
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
    this.bloom.enabled = q === 'high';
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer && this.composer.setSize(w, h);
    this.composer && this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  applyTheme(theme) {
    this.theme = theme;
    this.ui.setTheme(theme);
    this.env.accentA.emissive.set(theme.a);
    this.env.accentB.emissive.set(theme.b);
    this.rimA.color.set(theme.a);
    this.rimB.color.set(theme.b);
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

  // ------------------------------------------------------------------ menus
  async menuAction(a) {
    if (a === 'new' || a === 'continue') return this.startShift();
    this.ui.hideTitle();
    if (a === 'workshop') await this.openWorkshop();
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
      this.applyProps();
      writeSave(this.save);
      return true;
    }, (id) => {
      const t = THEMES.find((x) => x.id === id);
      if (!this.save.themes[id]) {
        if (this.save.money < t.price) {
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
    if (!first) {
      if (this.assembly.active) this.assembly.teardown();
      if (this.assembly.caseObj) this.assembly.caseObj.removeFromParent();
      if (this.assembly.panel) this.assembly.panel.removeFromParent();
      this.packing.teardown();
    }
    this.packing.pc = null;
    this.assembly.fanSpeed = 0;
    // a finished, glowing showcase PC on the bench
    const sc = this.assembly.buildShowcase({
      parts: { mb: 'mb', cpu: 'orion9', cooler: 'aio360', ram: 'r64', ssd: 's4', gpu: 'q90', psu: 'w1000' },
      caseVariant: CASES[0],
    });
    this.showcase = sc;
    this.assembly.buildTray({ parts: { mb: 'mb', cpu: 'orion7', cooler: 'tower', ram: 'r32', ssd: 's2', gpu: 'q80', psu: 'w850' }, decoys: ['orion5', 'p70'] });
    for (const p of this.assembly.parts) p.obj.visible = true;
    this.assembly.fanSpeed = 1;
    M.rgb.emissiveIntensity = 2.2;
    this.setRgbMode('rainbow');
    this.assembly.drawScreen('splash');
    M.ledGreen.emissiveIntensity = 2;
    this.view = 'title';
    writeSave(this.save);
    this.ui.showTitle(this.save);
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
    if (!this.save.dayStats) this.save.dayStats = { orders: 0, stars: 0, earned: 0, best: null };
    this.ui.showHud(true);
    if (this.save.orderInDay === 0) this.ui.toast(`Day ${this.save.day} — ${dayLength(this.save.day)} orders on the board. Let's build!`, 'good');
    await this.beginOrder();
  }

  async beginOrder() {
    const gen = ++this.gen;
    const tutorial = this.save.stats.orders === 0;
    const order = generateOrder(this.save, { tutorial });
    this.order = order;
    this.orderStats = { qaFails: 0, card: false };
    this.combo = 0;
    this.maxCombo = 0;
    this.lastActionT = -99;
    this.orderTime = 0;
    let par = 0;
    if (!tutorial) {
      par = baseActions(order) * 4.0 + 30;
      if (this.hasUpgrade('espresso')) par *= 1.2;
      if (order.rush) par *= 0.75;
      par = Math.round(par / 5) * 5;
    }
    this.par = par;
    this.state = 'arrive';
    this.view = 'assembly';
    this.orbit.tyaw = this.orbit.tpitch = 0;
    this.packing.setupBox(order);
    this.ui.showTicket(order, par);
    this.ui.flow(0, 0);
    await this.assembly.setup(order);
    if (gen !== this.gen) return;
    this.state = 'assemble';
    if (tutorial) this.ui.toast('Welcome to the Andromeda workshop! Follow the glowing arrow and the prompt below.', 'good');
    else if (order.rush) this.ui.toast('RUSH ORDER — tighter par, 1.5× pay!', 'warn');
  }

  onAction(pos, text, bad = false) {
    if (!PLAYING.has(this.state)) return;
    const t = this.time;
    if (bad) this.combo = 0;
    else {
      this.combo = t - this.lastActionT < COMBO_WINDOW ? this.combo + 1 : 1;
      this.lastActionT = t;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
    }
    const label = !bad && this.combo >= 3 ? `${text}  ×${this.combo}` : text;
    this.fx.float(pos, label, bad ? 'bad' : this.combo >= 8 ? 'gold' : '');
    this.forceHint = false;
    this.assembly.lastAction = this.packing.lastAction = performance.now();
  }
  comboPitch() {
    return 1 + Math.min(this.combo, 14) * 0.035;
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
    this.combo = 0;
    this.ui.ticketCollapse(false);
    this.ui.toast(`QA failed: ${fails.map((f) => f.label).join(', ')} doesn't match the ticket. Swap it and re-test.`, 'warn');
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
    this.ui.toast('QA passed! Time to pack it up.', 'good');
  }
  onPackStage(stage) {
    if (this.state !== 'pack') return;
    if (stage === 'foam') this.view = 'packClose';
  }
  onShipStart() {
    if (this.state !== 'pack') return;
    this.view = 'ship';
  }

  async onShipped() {
    if (this.state !== 'pack') return;
    const gen = this.gen;
    this.state = 'results';
    this.ui.prompt(null);
    const res = this.computeResults();
    const rankBefore = rankFor(this.save.xp);
    // persist
    const s = this.save;
    s.money += res.total;
    s.xp += res.xp;
    s.stats.orders++;
    s.stats.earned += res.total;
    s.stats.stars += res.stars;
    s.stats.qaFails += this.orderStats.qaFails;
    if (res.stars === 3) s.stats.perfect++;
    if (!s.stats.bestTime || res.time < s.stats.bestTime) s.stats.bestTime = res.time;
    s.dayStats.orders++;
    s.dayStats.stars += res.stars;
    s.dayStats.earned += res.total;
    if (!s.dayStats.best || res.time < s.dayStats.best) s.dayStats.best = res.time;
    s.orderInDay++;
    writeSave(s);
    const rankAfter = rankFor(s.xp);
    const cur = RANKS[rankAfter - 1].xp, next = RANKS[rankAfter] ? RANKS[rankAfter].xp : cur + 1;
    const pct = (x) => (rankAfter >= RANKS.length ? 100 : clamp(((x - cur) / (next - cur)) * 100, 0, 100));
    res.xpFrom = rankAfter > rankBefore ? 0 : pct(s.xp - res.xp);
    res.xpTo = pct(s.xp);
    res.rankName = `Rank ${rankAfter} · ${RANKS[rankAfter - 1].name}`;
    const dayDone = s.orderInDay >= dayLength(s.day);
    res.nextLabel = dayDone ? 'Finish shift' : 'Next order';
    if (res.stars === 3) this.fx.confetti(this.camLook.clone().add(V3(0, 2, 3)), 160);
    await wait(0.35);
    await this.ui.results(res);
    if (gen !== this.gen) return;
    if (rankAfter > rankBefore) {
      audio.play('levelup');
      this.fx.confetti(this.camLook.clone().add(V3(0, 3, 2)), 200);
      await this.ui.rankUp(rankAfter);
      if (rankAfter >= RANKS.length && !s.careerDone) {
        s.careerDone = true;
        writeSave(s);
        audio.play('levelup');
        await this.ui.certificate(s);
      }
    }
    this.packing.teardown();
    if (dayDone) {
      const ds = s.dayStats;
      const choice = await this.ui.dayEnd({
        day: s.day, orders: ds.orders, stars: ds.stars, earned: ds.earned, best: ds.best, money: s.money,
        headline: ds.stars >= ds.orders * 3 ? 'A perfect shift!' : ds.stars >= ds.orders * 2 ? 'Great shift!' : 'Shift done',
      });
      s.day++;
      s.orderInDay = 0;
      s.dayStats = { orders: 0, stars: 0, earned: 0, best: null };
      writeSave(s);
      if (choice === 'menu') return this.toTitle();
      if (choice === 'workshop') await this.openWorkshop();
      this.ui.toast(`Day ${s.day} — ${dayLength(s.day)} orders on the board.`, 'good');
    }
    if (gen !== this.gen) return;
    await this.beginOrder();
  }

  computeResults() {
    const o = this.order, st = this.orderStats;
    const time = this.orderTime, par = this.par;
    const rows = [];
    const base = o.pay;
    let total = base;
    rows.push({ label: `${o.tierName} build${o.vip ? ' (VIP)' : ''}`, value: fmtMoney(base) });
    if (par) {
      if (time <= par * 0.7) {
        const b = Math.round(base * 0.5);
        total += b;
        rows.push({ label: `Lightning bonus (under ${fmtTime(par * 0.7)})`, value: '+' + fmtMoney(b), cls: 'pos' });
      } else if (time <= par) {
        const b = Math.round(base * 0.3);
        total += b;
        rows.push({ label: 'Beat par bonus', value: '+' + fmtMoney(b), cls: 'pos' });
      } else rows.push({ label: `Over par by ${fmtTime(time - par)}`, value: '$0', cls: 'neg' });
    }
    const flow = this.maxCombo * 3;
    if (flow) {
      total += flow;
      rows.push({ label: `Flow bonus (best ×${this.maxCombo})`, value: '+' + fmtMoney(flow), cls: 'pos' });
    }
    if (st.qaFails === 0) {
      const b = Math.round(base * 0.1);
      total += b;
      rows.push({ label: 'Passed QA first time', value: '+' + fmtMoney(b), cls: 'pos' });
    } else {
      const p = Math.round(base * 0.15) * st.qaFails;
      total -= p;
      rows.push({ label: `QA retries ×${st.qaFails}`, value: '−' + fmtMoney(p), cls: 'neg' });
    }
    if (st.card) {
      const tip = 10 + Math.round(base * 0.05);
      total += tip;
      rows.push({ label: 'Thank-you card tip', value: '+' + fmtMoney(tip), cls: 'pos' });
    }
    if (o.rush) {
      const d = Math.round(total * 0.5);
      total += d;
      rows.push({ label: 'Rush order ×1.5', value: '+' + fmtMoney(d), cls: 'pos' });
    }
    if (this.hasUpgrade('loyalty')) {
      const d = Math.round(total * 0.15);
      total += d;
      rows.push({ label: 'Loyalty program +15%', value: '+' + fmtMoney(d), cls: 'pos' });
    }
    total = Math.max(10, Math.round(total));
    let stars = 3;
    if (par && time > par) stars--;
    stars -= Math.min(2, st.qaFails);
    stars = Math.max(1, stars);
    const tierIdx = TIERS.findIndex((t) => t.id === o.tier);
    const xp = 20 + stars * 12 + tierIdx * 6;
    const headline = stars === 3 ? 'Flawless build!' : stars === 2 ? 'Solid work!' : 'Shipped — room to improve';
    return { no: o.no, city: o.city, rows, total, stars, xp, time, par, maxCombo: this.maxCombo, headline };
  }

  // ------------------------------------------------------------------ loop
  updateCamera(dt) {
    const asp = this.camera.aspect;
    let pos, look;
    if (this.view === 'title') {
      const a = Math.sin(this.time * 0.09) * 0.55 + 0.25;
      look = V3(1.2, 2.4, 0);
      pos = look.clone().add(V3(Math.sin(a) * 10.5, 2.6, Math.cos(a) * 10.5));
    } else {
      const v = VIEWS[this.view] || VIEWS.assembly;
      pos = v.pos.clone();
      look = v.look.clone();
    }
    // keep framing on narrow screens
    const k = Math.pow(Math.max(1, 1.7 / asp), 0.85) * this.orbit.zoom;
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
    // subtle parallax with the mouse
    if (this.state !== 'title') off.add(V3(this.pointer.x * 0.25, this.pointer.y * 0.15, 0));
    pos = look.clone().add(off);
    // arc long camera moves upward so the camera never flies through props
    const far = this.camPos.distanceTo(pos);
    if (far > 3) pos.y += (far - 3) * 0.45;
    const lam = this.view === 'title' ? 1.5 : 3.2;
    this.camPos.x = damp(this.camPos.x, pos.x, lam, dt);
    this.camPos.y = damp(this.camPos.y, pos.y, lam, dt);
    this.camPos.z = damp(this.camPos.z, pos.z, lam, dt);
    this.camLook.x = damp(this.camLook.x, look.x, lam, dt);
    this.camLook.y = damp(this.camLook.y, look.y, lam, dt);
    this.camLook.z = damp(this.camLook.z, look.z, lam, dt);
    this.camera.position.copy(this.camPos);
    const sh = this.fx.shakeOffset(this.time);
    if (sh) this.camera.position.add(sh);
    this.camera.lookAt(this.camLook);
  }

  loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.fps = this.fps * 0.95 + (1000 / Math.max(1, now - this.last)) * 0.05;
    this.last = now;
    const gdt = this.paused ? 0 : dt;
    tweens.update(gdt);
    this.time += gdt;
    if (!this.paused && (this.state === 'assemble' || this.state === 'test' || this.state === 'pack')) this.orderTime += gdt;
    this.assembly.update(gdt, this.time);
    this.packing.update(gdt, this.time);
    this.fx.update(gdt);
    // RGB
    if (this.rgbMode.rainbow) M.rgb.emissive.setHSL((this.time * 0.12) % 1, 1, 0.55);
    else M.rgb.emissive.copy(this.rgbMode.color);
    this.updateCamera(dt);
    // HUD
    if (PLAYING.has(this.state) || this.state === 'results') {
      this.hudT = (this.hudT || 0) + dt;
      if (this.hudT > 0.1) {
        this.hudT = 0;
        this.ui.hud({ day: this.save.day, order: Math.min(dayLength(this.save.day), this.save.orderInDay + (this.state === 'results' ? 0 : 1)), orders: dayLength(this.save.day), time: this.orderTime, par: this.par, money: this.save.money, xp: this.save.xp });
        const since = this.time - this.lastActionT;
        if (since > COMBO_WINDOW && this.combo > 0) this.combo = 0;
        this.ui.flow(Math.max(1, this.combo), this.combo > 0 ? 1 - since / COMBO_WINDOW : 0);
      }
    }
    this.autoQuality(dt);
    if (this.bloom.enabled) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  autoQuality(dt) {
    if (this.save.settings.autoChecked || this.state !== 'assemble' || this.paused) return;
    this.aq = this.aq || { t: 0, frames: 0 };
    this.aq.t += dt;
    this.aq.frames++;
    if (this.aq.t > 5) {
      const fps = this.aq.frames / this.aq.t;
      this.save.settings.autoChecked = true;
      if (fps < 34 && this.save.settings.quality === 'high') {
        this.save.settings.quality = 'medium';
        this.applyQuality();
        this.ui.toast('Graphics set to Medium for smoother play (change in Settings)');
      } else if (fps < 24 && this.save.settings.quality === 'medium') {
        this.save.settings.quality = 'low';
        this.applyQuality();
      }
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
