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

  // ---------- generative lo-fi soundtrack ----------
  setMood(m) {
    this.mood = m;
  }
  startMusic() {
    const ctx = this.ctx;
    this.bpm = 76;
    this.step = 0;
    this.nextT = ctx.currentTime + 0.2;
    // Dmaj9 - Bm9 - Gmaj7 - A6/9 ... cosy & spacey
    this.prog = [
      { root: 50, notes: [62, 66, 69, 73, 76] },
      { root: 47, notes: [59, 62, 66, 69, 73] },
      { root: 43, notes: [59, 62, 66, 71, 74] },
      { root: 45, notes: [61, 64, 66, 69, 71] },
      { root: 50, notes: [62, 66, 69, 71, 76] },
      { root: 42, notes: [61, 64, 69, 73, 76] },
      { root: 43, notes: [62, 66, 67, 71, 74] },
      { root: 45, notes: [61, 64, 67, 69, 73] },
    ];
    this.musicTimer = setInterval(() => this.schedule(), 30);
  }
  schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const spb = 60 / this.bpm / 4; // 16th
    while (this.nextT < ctx.currentTime + 0.15) {
      this.playStep(this.step, this.nextT, spb);
      const swing = this.step % 2 === 0 ? 1.12 : 0.88;
      this.nextT += spb * swing;
      this.step++;
    }
  }
  playStep(step, at, spb) {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const chord = this.prog[bar % this.prog.length];
    const ctx = this.ctx;
    const mood = this.mood;
    const full = mood === 'shift';
    const out = this.music;

    const voice = (f, dur, gain, type, attack, filt, detune = 0) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = detune;
      const fl = ctx.createBiquadFilter();
      fl.type = 'lowpass';
      fl.frequency.value = filt;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(gain, at + attack);
      g.gain.setValueAtTime(gain, at + Math.max(attack, dur * 0.5));
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(fl).connect(g);
      g.connect(out);
      g.connect(this.musicRev);
      o.start(at);
      o.stop(at + dur + 0.1);
    };

    // pad: once per bar
    if (s === 0) {
      const barDur = spb * 16;
      for (const n of chord.notes.slice(0, 4)) {
        voice(NOTE(n), barDur * 1.05, 0.018, 'sawtooth', 0.9, 900, -6);
        voice(NOTE(n), barDur * 1.05, 0.018, 'triangle', 0.9, 1400, 7);
      }
    }
    // bass
    if (full && (s === 0 || s === 7 || s === 10)) {
      const n = s === 10 ? chord.root + 7 : chord.root;
      voice(NOTE(n - 12 + 12), spb * (s === 0 ? 5 : 2.5), 0.12, 'sine', 0.01, 600);
      voice(NOTE(n), spb * (s === 0 ? 5 : 2.5), 0.03, 'triangle', 0.01, 500);
    }
    // e-piano style arpeggio
    const pattern = full ? [0, 3, 6, 8, 11, 14] : [0, 6, 11];
    if (pattern.includes(s) && Math.random() < (full ? 0.82 : 0.6)) {
      const n = chord.notes[Math.floor(Math.random() * chord.notes.length)] + (Math.random() < 0.25 ? 12 : 0);
      const f = NOTE(n);
      voice(f, spb * 6, 0.035, 'sine', 0.005, 3000);
      voice(f * 2, spb * 2, 0.008, 'triangle', 0.003, 4000);
    }
    if (!full) return;
    // drums
    const noiseHit = (dur, type, f, gain, Q = 1) => {
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
    if (s === 0 || s === 10 || (s === 7 && bar % 2 === 1)) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(110, at);
      o.frequency.exponentialRampToValueAtTime(42, at + 0.18);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.32, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.32);
      o.connect(g).connect(out);
      o.start(at);
      o.stop(at + 0.4);
    }
    if (s === 4 || s === 12) {
      noiseHit(0.18, 'bandpass', 1800, 0.09, 0.8);
      noiseHit(0.08, 'lowpass', 400, 0.06);
    }
    if (s % 2 === 0) noiseHit(0.035, 'highpass', 7000, s % 4 === 2 ? 0.035 : 0.02);
    // vinyl crackle
    if (Math.random() < 0.25) noiseHit(0.01, 'highpass', 3000, 0.012 + Math.random() * 0.02);
  }
}

export const audio = new AudioEngine();
