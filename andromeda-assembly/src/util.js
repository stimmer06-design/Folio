import * as THREE from 'three';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const Ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outBackSoft: (t) => {
    const c1 = 0.9, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outBounce: (t) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  outElastic: (t) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
};

// ---------- Tween engine (driven by game time so pausing freezes it) ----------
class TweenEngine {
  constructor() {
    this.list = [];
    this.keys = new Map();
  }
  add({ duration = 0.3, delay = 0, ease = Ease.outCubic, update, key }) {
    return new Promise((resolve) => {
      if (key && this.keys.has(key)) this.cancel(key);
      const tw = { t: -delay, duration: Math.max(1e-4, duration), ease, update, resolve, key, dead: false };
      this.list.push(tw);
      if (key) this.keys.set(key, tw);
    });
  }
  cancel(key) {
    const tw = this.keys.get(key);
    if (tw) {
      tw.dead = true;
      this.keys.delete(key);
      tw.resolve(false);
    }
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const tw = this.list[i];
      if (tw.dead) {
        this.list.splice(i, 1);
        continue;
      }
      tw.t += dt;
      if (tw.t < 0) continue;
      const k = Math.min(1, tw.t / tw.duration);
      tw.update && tw.update(tw.ease(k), k);
      if (k >= 1) {
        this.list.splice(i, 1);
        if (tw.key && this.keys.get(tw.key) === tw) this.keys.delete(tw.key);
        tw.resolve(true);
      }
    }
  }
  clear() {
    for (const tw of this.list) tw.resolve(false);
    this.list.length = 0;
    this.keys.clear();
  }
}
export const tweens = new TweenEngine();

export const wait = (s) => tweens.add({ duration: s, ease: Ease.linear });

export function tweenObj(obj, { pos, quat, scale, duration = 0.4, ease = Ease.outCubic, delay = 0, key }) {
  const p0 = obj.position.clone();
  const q0 = obj.quaternion.clone();
  const s0 = obj.scale.clone();
  const sTo = scale === undefined ? null : typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : scale;
  return tweens.add({
    duration, delay, ease, key: key || obj.uuid + ':xf',
    update: (e) => {
      if (pos) obj.position.lerpVectors(p0, pos, e);
      if (quat) obj.quaternion.slerpQuaternions(q0, quat, Math.min(1, Math.max(0, e)));
      if (sTo) obj.scale.lerpVectors(s0, sTo, e);
    },
  });
}

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const QI = () => new THREE.Quaternion();
export const qEuler = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));

export function fmtTime(s) {
  s = Math.max(0, Math.round(s));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
export const fmtMoney = (n) => '$' + Math.round(n).toLocaleString('en-US');

export function findInteractive(obj) {
  while (obj) {
    if (obj.userData && obj.userData.it) return obj;
    obj = obj.parent;
  }
  return null;
}

export function disposeTree(root, keepShared = true) {
  root.traverse((o) => {
    if (o.isMesh || o.isSprite || o.isPoints) {
      if (o.geometry && !(keepShared && o.geometry.userData.shared)) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m || (keepShared && m.userData.shared)) continue;
        if (m.map && !m.map.userData.shared) m.map.dispose();
        m.dispose();
      }
    }
  });
  root.removeFromParent();
}
