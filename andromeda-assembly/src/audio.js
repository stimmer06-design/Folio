// Fully synthesized audio: every sound effect and the lo-fi soundtrack are generated
// with the Web Audio API at runtime, so the game ships as a single offline file.

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.vol = { master: 0.8, music: 0.45, sfx: 0.8 };
    this.mood = 'title';
    this.loops = {};
    this.lastPlay = {};
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.music = ctx.createGain();
    this.sfx.connect(this.master);
    this.music.connect(this.master);

    // white noise buffer
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // small room reverb
    const irLen = Math.floor(ctx.sampleRate * 1.6);
    const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c);
      for (let i = 0; i < irLen; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3.2);
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    this.revSend = ctx.createGain();
    this.revSend.gain.value = 0.22;
    this.revSend.connect(this.reverb).connect(this.master);
    this.musicRev = ctx.createGain();
    this.musicRev.gain.value = 0.5;
    this.musicRev.connect(this.reverb);

    this.applyVolumes();
    this.startMusic();
  }

  setVolumes(v) {
    Object.assign(this.vol, v);
    this.applyVolumes();
  }
  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.05);
    this.sfx.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
    this.music.gain.setTargetAtTime(this.vol.music * (this.duck || 1), t, 0.3);
  }
  setDuck(v) {
    this.duck = v;
    this.applyVolumes();
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // ---------- primitives ----------
  tone({ f = 440, f2, type = 'sine', dur = 0.1, gain = 0.2, attack = 0.004, t = 0, out, rev = 0, detune = 0, q }) {
    const ctx = this.ctx;
    const t0 = this.now + t;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
    if (detune) o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = o;
    if (q) {
      const fl = ctx.createBiquadFilter();
      fl.type = 'lowpass';
      fl.frequency.value = q;
      node.connect(fl);
      node = fl;
    }
    node.connect(g);
    g.connect(out || this.sfx);
    if (rev) {
      const s = ctx.createGain();
      s.gain.value = rev;
      g.connect(s).connect(this.revSend);
    }
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  noise({ dur = 0.1, type = 'bandpass', f = 1000, f2, Q = 1, gain = 0.2, attack = 0.002, t = 0, out, rev = 0 }) {
    const ctx = this.ctx;
    const t0 = this.now + t;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const fl = ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.setValueAtTime(f, t0);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    fl.Q.value = Q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(fl).connect(g).connect(out || this.sfx);
    if (rev) {
      const s = ctx.createGain();
      s.gain.value = rev;
      g.connect(s).connect(this.revSend);
    }
    const off = Math.random() * 1.5;
    src.start(t0, off);
    src.stop(t0 + dur + 0.05);
  }

  // ---------- sound effects ----------
  play(name, opt = {}) {
    if (!this.ctx) return;
    // simple anti-spam for very frequent sounds
    const nowMs = performance.now();
    if (name === 'hover' && nowMs - (this.lastPlay[name] || 0) < 60) return;
    this.lastPlay[name] = nowMs;
    const p = opt.pitch || 1;
    switch (name) {
      case 'hover':
        this.tone({ f: 1900 * p, dur: 0.035, gain: 0.025, type: 'sine' });
        break;
      case 'ui':
        this.tone({ f: 880, f2: 1320, dur: 0.06, gain: 0.07, type: 'triangle' });
        this.noise({ dur: 0.02, type: 'highpass', f: 4000, gain: 0.05 });
        break;
      case 'pick':
        this.tone({ f: 420 * p, f2: 760 * p, dur: 0.09, gain: 0.09, type: 'triangle' });
        this.noise({ dur: 0.05, type: 'bandpass', f: 2200, Q: 2, gain: 0.06 });
        break;
      case 'drop':
        this.tone({ f: 520, f2: 260, dur: 0.12, gain: 0.08, type: 'triangle' });
        this.noise({ dur: 0.06, type: 'lowpass', f: 900, gain: 0.08 });
        break;
      case 'snap': {
        // crisp mechanical click whose pitch climbs with the combo
        this.noise({ dur: 0.035, type: 'highpass', f: 3500, gain: 0.35 });
        this.tone({ f: 1250 * p, dur: 0.05, gain: 0.07, type: 'square', q: 4000 });
        this.tone({ f: 2500 * p, dur: 0.16, gain: 0.08, type: 'sine', t: 0.012, rev: 0.6 });
        this.tone({ f: 160, f2: 70, dur: 0.12, gain: 0.25, type: 'sine' });
        break;
      }
      case 'clack':
        this.noise({ dur: 0.03, type: 'highpass', f: 2500, gain: 0.3 });
        this.tone({ f: 1800 * p, dur: 0.04, gain: 0.06, type: 'square', q: 5000 });
        this.noise({ dur: 0.03, type: 'highpass', f: 2800, gain: 0.3, t: 0.09 });
        this.tone({ f: 2100 * p, dur: 0.12, gain: 0.06, type: 'sine', t: 0.09, rev: 0.5 });
        break;
      case 'screw': {
        const n = 7;
        for (let i = 0; i < n; i++) this.noise({ dur: 0.02, type: 'bandpass', f: 2500 + i * 300, Q: 6, gain: 0.18, t: i * 0.045 });
        this.tone({ f: 900, f2: 1400, dur: 0.12, gain: 0.07, type: 'triangle', t: n * 0.045, rev: 0.5 });
        this.noise({ dur: 0.04, type: 'highpass', f: 3000, gain: 0.25, t: n * 0.045 });
        break;
      }
      case 'drill':
        this.tone({ f: 180, f2: 520, dur: 0.45, gain: 0.07, type: 'sawtooth', q: 1800 });
        this.tone({ f: 360, f2: 1040, dur: 0.45, gain: 0.03, type: 'square', q: 2400 });
        this.noise({ dur: 0.05, type: 'highpass', f: 3000, gain: 0.25, t: 0.42 });
        this.tone({ f: 1200, dur: 0.12, gain: 0.06, type: 'sine', t: 0.42, rev: 0.5 });
        break;
      case 'lever':
        this.noise({ dur: 0.06, type: 'bandpass', f: 1200, Q: 3, gain: 0.3 });
        this.tone({ f: 220, f2: 110, dur: 0.16, gain: 0.22, type: 'triangle' });
        this.tone({ f: 1480, dur: 0.35, gain: 0.05, type: 'sine', t: 0.03, rev: 0.7 });
        break;
      case 'plug':
        this.noise({ dur: 0.05, type: 'bandpass', f: 900, Q: 2, gain: 0.3 });
        this.tone({ f: 300, f2: 180, dur: 0.1, gain: 0.2, type: 'triangle' });
        this.noise({ dur: 0.03, type: 'highpass', f: 3500, gain: 0.25, t: 0.06 });
        break;
      case 'whoosh':
        this.noise({ dur: 0.35, type: 'bandpass', f: 300, f2: 2400, Q: 1.2, gain: 0.12, attack: 0.12 });
        break;
      case 'thump':
        this.tone({ f: 120, f2: 45, dur: 0.3, gain: 0.45, type: 'sine' });
        this.noise({ dur: 0.12, type: 'lowpass', f: 600, gain: 0.25 });
        break;
      case 'heavy':
        this.tone({ f: 90, f2: 35, dur: 0.5, gain: 0.6, type: 'sine' });
        this.noise({ dur: 0.25, type: 'lowpass', f: 400, gain: 0.35 });
        this.noise({ dur: 0.08, type: 'bandpass', f: 2000, gain: 0.08, t: 0.02 });
        break;
      case 'cardboard':
        this.noise({ dur: 0.18, type: 'bandpass', f: 700 * p, Q: 0.9, gain: 0.35 });
        this.tone({ f: 140, f2: 70, dur: 0.15, gain: 0.25, type: 'sine' });
        break;
      case 'foam':
        this.noise({ dur: 0.22, type: 'lowpass', f: 500, gain: 0.3, attack: 0.02 });
        this.tone({ f: 90, f2: 60, dur: 0.2, gain: 0.2, type: 'sine' });
        break;
      case 'rip':
        this.noise({ dur: 0.3, type: 'bandpass', f: 1800, f2: 5000, Q: 1.5, gain: 0.25 });
        break;
      case 'stamp':
        this.tone({ f: 150, f2: 60, dur: 0.18, gain: 0.4, type: 'sine' });
        this.noise({ dur: 0.08, type: 'lowpass', f: 1500, gain: 0.35 });
        break;
      case 'printer':
        for (let i = 0; i < 12; i++) this.noise({ dur: 0.025, type: 'bandpass', f: 3200, Q: 4, gain: 0.08, t: i * 0.05 });
        this.tone({ f: 1760, dur: 0.15, gain: 0.05, type: 'sine', t: 0.62, rev: 0.4 });
        break;
      case 'power':
        this.noise({ dur: 0.05, type: 'bandpass', f: 1500, Q: 2, gain: 0.25 });
        this.tone({ f: 55, f2: 110, dur: 0.9, gain: 0.12, type: 'sawtooth', q: 500, attack: 0.2 });
        this.tone({ f: 1000, dur: 0.14, gain: 0.07, type: 'square', t: 0.9, q: 3000 });
        break;
      case 'tick':
        this.tone({ f: 1500 * p, dur: 0.035, gain: 0.05, type: 'square', q: 3000 });
        break;
      case 'ok':
        this.tone({ f: 1320 * p, dur: 0.08, gain: 0.06, type: 'sine' });
        break;
      case 'success': {
        const notes = [72, 76, 79, 84];
        notes.forEach((n, i) => this.tone({ f: NOTE(n), dur: 0.5, gain: 0.09, type: 'triangle', t: i * 0.07, rev: 0.8 }));
        break;
      }
      case 'fail':
        this.tone({ f: 160, dur: 0.22, gain: 0.12, type: 'square', q: 1200 });
        this.tone({ f: 120, dur: 0.3, gain: 0.12, type: 'square', t: 0.26, q: 1200 });
        break;
      case 'error':
        this.tone({ f: 220, f2: 180, dur: 0.12, gain: 0.08, type: 'square', q: 1500 });
        break;
      case 'cash':
        this.noise({ dur: 0.08, type: 'highpass', f: 5000, gain: 0.2 });
        this.tone({ f: 2093, dur: 0.6, gain: 0.08, type: 'sine', t: 0.05, rev: 0.6 });
        this.tone({ f: 2637, dur: 0.7, gain: 0.07, type: 'sine', t: 0.1, rev: 0.6 });
        this.tone({ f: 3136, dur: 0.8, gain: 0.05, type: 'sine', t: 0.15, rev: 0.6 });
        break;
      case 'coin':
        this.tone({ f: 1568 * p, f2: 2093 * p, dur: 0.07, gain: 0.04, type: 'square', q: 4000 });
        break;
      case 'star':
        this.tone({ f: NOTE(76 + (opt.i || 0) * 4), dur: 0.7, gain: 0.1, type: 'triangle', rev: 0.9 });
        this.tone({ f: NOTE(88 + (opt.i || 0) * 4), dur: 0.5, gain: 0.04, type: 'sine', rev: 0.9 });
        break;
      case 'levelup': {
        const seq = [67, 72, 76, 79, 84, 88];
        seq.forEach((n, i) => this.tone({ f: NOTE(n), dur: 0.6, gain: 0.08, type: 'triangle', t: i * 0.09, rev: 0.9 }));
        this.tone({ f: NOTE(60), dur: 1.2, gain: 0.08, type: 'sawtooth', q: 1200, t: 0.0, attack: 0.05 });
        break;
      }
      case 'pop':
        this.tone({ f: 500 * p, f2: 1100 * p, dur: 0.07, gain: 0.06, type: 'sine' });
        break;
      case 'conveyor':
        this.tone({ f: 60, dur: 1.6, gain: 0.1, type: 'sawtooth', q: 300, attack: 0.2 });
        this.noise({ dur: 1.6, type: 'lowpass', f: 300, gain: 0.15, attack: 0.2 });
        break;
      case 'buy':
        this.play('cash');
        this.tone({ f: NOTE(84), dur: 0.4, gain: 0.06, type: 'triangle', t: 0.2, rev: 0.7 });
        break;
      case 'perfect': {
        // bright stacked chime — climbs with the combo
        const base = 76 + Math.min(14, opt.combo || 0);
        [0, 7, 12, 16].forEach((iv, i) => this.tone({ f: NOTE(base + iv), dur: 0.55, gain: 0.07 - i * 0.01, type: i ? 'sine' : 'triangle', t: i * 0.018, rev: 0.9 }));
        this.noise({ dur: 0.25, type: 'highpass', f: 7000, gain: 0.05, attack: 0.01, rev: 0.5 });
        break;
      }
      case 'great': {
        const base = 74 + Math.min(12, opt.combo || 0);
        [0, 7, 12].forEach((iv, i) => this.tone({ f: NOTE(base + iv), dur: 0.35, gain: 0.06, type: 'triangle', t: i * 0.02, rev: 0.6 }));
        break;
      }
      case 'good':
        this.tone({ f: NOTE(69 + Math.min(10, opt.combo || 0)), dur: 0.25, gain: 0.06, type: 'triangle', rev: 0.4 });
        break;
      case 'sloppy':
        this.tone({ f: 330, f2: 220, dur: 0.22, gain: 0.07, type: 'square', q: 1400 });
        break;
      case 'overdrive': {
        const lvl = opt.tier || 1;
        this.noise({ dur: 0.7, type: 'bandpass', f: 300, f2: 6000, Q: 1.4, gain: 0.16, attack: 0.5 });
        this.tone({ f: 55, f2: 110, dur: 0.8, gain: 0.18, type: 'sawtooth', q: 900, attack: 0.5 });
        [0, 4, 7, 12].forEach((iv, i) => this.tone({ f: NOTE(60 + lvl * 2 + iv), dur: 1.1, gain: 0.06, type: 'sawtooth', q: 2600, t: 0.55 + i * 0.03, rev: 1 }));
        this.tone({ f: 70, f2: 35, dur: 0.6, gain: 0.5, type: 'sine', t: 0.55 });
        break;
      }
      case 'flowlost':
        this.tone({ f: 600, f2: 150, dur: 0.4, gain: 0.06, type: 'sawtooth', q: 1200 });
        break;
      case 'gauge':
        this.tone({ f: 900 + (opt.v || 0) * 1400, dur: 0.025, gain: 0.03, type: 'square', q: 4000 });
        break;
      case 'zone':
        this.tone({ f: 2093, dur: 0.12, gain: 0.04, type: 'sine', rev: 0.5 });
        break;
      case 'squish':
        this.noise({ dur: 0.12, type: 'lowpass', f: 700 + (opt.v || 0) * 600, gain: 0.08, attack: 0.03 });
        break;
      case 'grade': {
        this.tone({ f: 60, f2: 30, dur: 0.9, gain: 0.6, type: 'sine' });
        this.noise({ dur: 0.5, type: 'lowpass', f: 900, gain: 0.4 });
        const good = opt.g === 'S' || opt.g === 'A';
        const ch = good ? [60, 64, 67, 72, 76] : [57, 60, 64, 69];
        ch.forEach((n, i) => this.tone({ f: NOTE(n), dur: 1.6, gain: 0.05, type: 'sawtooth', q: 2400, t: 0.04, rev: 1 }));
        break;
      }
      case 'crate':
        this.noise({ dur: 0.08, type: 'bandpass', f: 900, Q: 3, gain: 0.25 });
        this.tone({ f: 180, f2: 120, dur: 0.12, gain: 0.15, type: 'triangle' });
        break;
      case 'reveal': {
        const r = { common: 0, rare: 1, epic: 2, legendary: 3 }[opt.r] || 0;
        this.noise({ dur: 0.5 + r * 0.2, type: 'highpass', f: 3000, gain: 0.12 + r * 0.04, attack: 0.02, rev: 1 });
        const seq = [[72, 76, 79], [72, 76, 79, 84], [71, 74, 78, 83, 86], [72, 76, 79, 84, 88, 91]][r];
        seq.forEach((n, i) => this.tone({ f: NOTE(n), dur: 0.9 + r * 0.3, gain: 0.08, type: 'triangle', t: i * 0.07, rev: 1 }));
        if (r >= 2) this.tone({ f: NOTE(48), dur: 1.6, gain: 0.12, type: 'sawtooth', q: 900, attack: 0.05 });
        break;
      }
      case 'launch':
        this.noise({ dur: 2.4, type: 'lowpass', f: 200, f2: 1600, gain: 0.45, attack: 0.3 });
        this.tone({ f: 40, f2: 90, dur: 2.2, gain: 0.3, type: 'sawtooth', q: 400, attack: 0.3 });
        this.noise({ dur: 1.4, type: 'bandpass', f: 600, f2: 4000, Q: 0.7, gain: 0.15, attack: 0.6, t: 0.6 });
        break;
      case 'blip':
        this.tone({ f: (opt.f || 880) * (0.95 + Math.random() * 0.1), dur: 0.03, gain: 0.02, type: 'square', q: 3000 });
        break;
      case 'contract':
        [67, 71, 74, 79, 83].forEach((n, i) => this.tone({ f: NOTE(n), dur: 0.5, gain: 0.07, type: 'triangle', t: i * 0.06, rev: 0.9 }));
        this.play('cash');
        break;
      case 'transmission':
        this.tone({ f: 1320, dur: 0.08, gain: 0.05, type: 'sine' });
        this.tone({ f: 1760, dur: 0.12, gain: 0.05, type: 'sine', t: 0.09, rev: 0.6 });
        this.noise({ dur: 0.3, type: 'bandpass', f: 2500, Q: 3, gain: 0.04, attack: 0.05 });
        break;
      case 'whisper':
        [48, 55, 60, 67].forEach((n, i) => this.tone({ f: NOTE(n), dur: 3, gain: 0.05, type: 'sine', attack: 0.8, t: i * 0.2, rev: 1 }));
        break;
      case 'glass':
        this.tone({ f: 2400, dur: 0.5, gain: 0.04, type: 'sine', rev: 0.8 });
        this.tone({ f: 3300, dur: 0.4, gain: 0.03, type: 'sine', rev: 0.8, t: 0.02 });
        this.noise({ dur: 0.05, type: 'bandpass', f: 1200, Q: 2, gain: 0.2 });
        break;
    }
  }

  // continuous tape sound
  tapeStart() {
    if (!this.ctx || this.loops.tape) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2600;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(bp).connect(g).connect(this.sfx);
    src.start();
    this.loops.tape = { src, g, bp };
  }
  tapeLevel(v) {
    const l = this.loops.tape;
    if (!l) return;
    const t = this.now;
    l.g.gain.setTargetAtTime(Math.min(0.35, v), t, 0.03);
    l.bp.frequency.setTargetAtTime(1800 + v * 3000, t, 0.05);
  }
  tapeStop() {
    const l = this.loops.tape;
    if (!l) return;
    l.g.gain.setTargetAtTime(0, this.now, 0.03);
    l.src.stop(this.now + 0.2);
    this.loops.tape = null;
  }

  // fan hum while a PC is powered
  humStart() {
    if (!this.ctx || this.loops.hum) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(0.09, this.now, 0.5);
    const o = ctx.createOscillator();
    o.frequency.value = 120;
    const og = ctx.createGain();
    og.gain.value = 0.012;
    o.connect(og).connect(this.sfx);
    src.connect(lp).connect(g).connect(this.sfx);
    src.start();
    o.start();
    this.loops.hum = { src, g, o, og };
  }
  humStop() {
    const l = this.loops.hum;
    if (!l) return;
    l.g.gain.setTargetAtTime(0, this.now, 0.4);
    l.og.gain.setTargetAtTime(0, this.now, 0.4);
    l.src.stop(this.now + 2);
    l.o.stop(this.now + 2);
    this.loops.hum = null;
  }

  // ---------- adaptive generative soundtrack ----------
  // Layers (pad, keys, bass, drums, arp) fade in as the Overdrive intensity rises.
  setMood(m) {
    this.mood = m;
    if (m !== 'shift') this.setIntensity(0);
  }
  setIntensity(i) {
    this.intensity = i;
    if (!this.ctx || !this.layers) return;
    const t = this.ctx.currentTime;
    const shift = this.mood === 'shift';
    const want = {
      pad: 1,
      keys: shift ? 0.9 : 0.6,
      bass: shift ? (i >= 1 ? 1 : 0.55) : 0,
      drums: shift ? (i >= 1 ? 1 : 0.6) : 0,
      hats: shift ? (i >= 2 ? 1 : i >= 1 ? 0.5 : 0) : 0,
      arp: shift ? (i >= 2 ? 1 : 0) : this.mood === 'title' ? 0.35 : 0,
      lead: shift && i >= 3 ? 1 : this.mood === 'finale' ? 1 : 0,
    };
    for (const k in this.layers) this.layers[k].gain.setTargetAtTime(want[k] || 0, t, 0.6);
  }
  startMusic() {
    const ctx = this.ctx;
    this.layers = {};
    for (const k of ['pad', 'keys', 'bass', 'drums', 'hats', 'arp', 'lead']) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.music);
      if (k !== 'drums' && k !== 'bass' && k !== 'hats') g.connect(this.musicRev);
      this.layers[k] = g;
    }
    this.intensity = 0;
    this.setIntensity(0);
    this.bpm = 92;
    this.step = 0;
    this.nextT = ctx.currentTime + 0.2;
    // F#m9 – Dmaj7 – A6/9 – E6sus ... spacey, hopeful
    this.prog = [
      { root: 42, notes: [57, 61, 64, 68, 73] },
      { root: 38, notes: [57, 61, 62, 66, 69] },
      { root: 45, notes: [59, 61, 64, 66, 71] },
      { root: 40, notes: [56, 59, 61, 64, 68] },
      { root: 42, notes: [57, 61, 64, 68, 71] },
      { root: 38, notes: [54, 57, 62, 66, 69] },
      { root: 47, notes: [59, 62, 66, 69, 71] },
      { root: 40, notes: [56, 59, 64, 68, 71] },
    ];
    this.arpPat = [0, 2, 1, 3, 2, 4, 3, 1];
    this.musicTimer = setInterval(() => this.schedule(), 30);
  }
  schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const spb = 60 / this.bpm / 4;
    while (this.nextT < ctx.currentTime + 0.15) {
      this.playStep(this.step, this.nextT, spb);
      this.nextT += spb * (this.step % 2 === 0 ? 1.06 : 0.94);
      this.step++;
    }
  }
  playStep(step, at, spb) {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const chord = this.prog[bar % this.prog.length];
    const ctx = this.ctx;
    const L = this.layers;

    const voice = (out, f, dur, gain, type, attack, filt, detune = 0, filtEnv = 0) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = detune;
      const fl = ctx.createBiquadFilter();
      fl.type = 'lowpass';
      fl.frequency.setValueAtTime(filt + filtEnv, at);
      if (filtEnv) fl.frequency.exponentialRampToValueAtTime(filt, at + dur * 0.6);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(gain, at + attack);
      g.gain.setValueAtTime(gain, at + Math.max(attack, dur * 0.4));
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(fl).connect(g).connect(out);
      o.start(at);
      o.stop(at + dur + 0.1);
    };
    const noiseHit = (out, dur, type, f, gain, Q = 1) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const fl = ctx.createBiquadFilter();
      fl.type = type;
      fl.frequency.value = f;
      fl.Q.value = Q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      src.connect(fl).connect(g).connect(out);
      src.start(at, Math.random());
      src.stop(at + dur + 0.05);
    };

    if (s === 0) {
      const barDur = spb * 16;
      for (const n of chord.notes.slice(0, 4)) {
        voice(L.pad, NOTE(n), barDur * 1.08, 0.014, 'sawtooth', 1.0, 900, -7);
        voice(L.pad, NOTE(n), barDur * 1.08, 0.014, 'sawtooth', 1.0, 1100, 7);
        voice(L.pad, NOTE(n - 12), barDur * 1.08, 0.012, 'triangle', 1.2, 700);
      }
    }
    // keys (soft e-piano)
    if ([0, 3, 6, 10, 13].includes(s) && Math.random() < 0.8) {
      const n = chord.notes[(Math.random() * chord.notes.length) | 0] + (Math.random() < 0.2 ? 12 : 0);
      voice(L.keys, NOTE(n), spb * 7, 0.03, 'sine', 0.005, 3000);
      voice(L.keys, NOTE(n) * 2, spb * 2, 0.007, 'triangle', 0.003, 4000);
    }
    // bass
    if (s === 0 || s === 6 || s === 10 || (s === 14 && bar % 2)) {
      const n = s === 10 ? chord.root + 7 : chord.root;
      voice(L.bass, NOTE(n), spb * (s === 0 ? 5 : 3), 0.11, 'sine', 0.01, 500);
      voice(L.bass, NOTE(n), spb * (s === 0 ? 5 : 3), 0.035, 'sawtooth', 0.01, 300, 0, 900);
    }
    // arp (synthwave pluck)
    if (s % 2 === 0) {
      const idx = this.arpPat[(s / 2) % 8];
      const n = chord.notes[idx % chord.notes.length] + 12;
      voice(L.arp, NOTE(n), spb * 1.8, 0.03, 'sawtooth', 0.004, 900, 0, 2600);
    }
    // lead (overdrive III) — simple melodic motif
    if (s === 0 || s === 4 || s === 7 || s === 12) {
      const motif = [4, 3, 2, 3];
      const n = chord.notes[motif[[0, 4, 7, 12].indexOf(s)]] + 12;
      voice(L.lead, NOTE(n), spb * 3.5, 0.03, 'square', 0.02, 2400, 5);
      voice(L.lead, NOTE(n), spb * 3.5, 0.02, 'sawtooth', 0.02, 2000, -5);
    }
    // drums
    if (s === 0 || s === 8 || (s === 10 && bar % 2 === 1)) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(120, at);
      o.frequency.exponentialRampToValueAtTime(40, at + 0.16);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.4, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
      o.connect(g).connect(L.drums);
      o.start(at);
      o.stop(at + 0.35);
    }
    if (s === 4 || s === 12) {
      noiseHit(L.drums, 0.2, 'bandpass', 1900, 0.11, 0.7);
      noiseHit(L.drums, 0.07, 'lowpass', 500, 0.08);
    }
    if (s % 2 === 0) noiseHit(L.hats, 0.04, 'highpass', 8000, s % 4 === 2 ? 0.04 : 0.022);
    if (s % 2 === 1 && Math.random() < 0.4) noiseHit(L.hats, 0.02, 'highpass', 9000, 0.015);
    if (Math.random() < 0.2) noiseHit(L.keys, 0.01, 'highpass', 3000, 0.01 + Math.random() * 0.015);
  }
}

export const audio = new AudioEngine();
