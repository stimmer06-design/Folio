import * as THREE from 'three';
import { rand } from './util.js';

const MAX = 600;

export class FX {
  constructor(scene, camera, renderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    // sparkles (points)
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('psize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('palpha', new THREE.BufferAttribute(this.alpha, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 1 } },
      vertexShader: `
        attribute vec3 pcolor; attribute float psize; attribute float palpha;
        varying vec3 vC; varying float vA; uniform float uScale;
        void main(){ vC=pcolor; vA=palpha; vec4 mv=modelViewMatrix*vec4(position,1.0);
          gl_PointSize = psize * uScale * (300.0 / -mv.z); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `
        varying vec3 vC; varying float vA;
        void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d); float a=smoothstep(0.5,0.0,r); a*=a;
          gl_FragColor=vec4(vC*a*vA*1.6, a*vA); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 50;
    scene.add(this.points);
    this.parts = [];
    for (let i = 0; i < MAX; i++) this.alpha[i] = 0;

    // confetti
    const cgeo = new THREE.PlaneGeometry(0.14, 0.08);
    const cmat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    this.conf = new THREE.InstancedMesh(cgeo, cmat, 260);
    this.conf.frustumCulled = false;
    this.conf.count = 0;
    scene.add(this.conf);
    this.confData = [];
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.v = new THREE.Vector3();
    this.one = new THREE.Vector3(1, 1, 1);

    this.shakeAmt = 0;
    this.floatLayer = document.getElementById('floaters');
    // shockwave rings
    this.ringGeo = new THREE.RingGeometry(0.86, 1, 64);
    this.rings = [];
  }

  ring(p, { color = '#67e8f9', radius = 1.5, axis = 'y', life = 0.55 } = {}) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.position.copy(p);
    if (axis === 'y') m.rotation.x = -Math.PI / 2;
    m.renderOrder = 60;
    m.scale.setScalar(0.05);
    this.scene.add(m);
    this.rings.push({ m, t: 0, life, radius });
  }

  burst(p, { count = 24, color = '#a5f3fc', color2 = '#c4b5fd', speed = 2.2, size = 0.6, life = 0.7, up = 1, spread = 1 } = {}) {
    const c1 = new THREE.Color(color), c2 = new THREE.Color(color2), c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      let idx = this.parts.length < MAX ? this.parts.length : -1;
      if (idx < 0) {
        // recycle oldest
        idx = 0;
        this.parts.shift();
      }
      c.copy(c1).lerp(c2, Math.random());
      const dir = new THREE.Vector3(rand(-1, 1) * spread, rand(-0.2, 1) * up, rand(-1, 1) * spread).normalize().multiplyScalar(speed * rand(0.4, 1));
      this.parts.push({ p: p.clone(), v: dir, life, t: 0, size: size * rand(0.5, 1.2), c: c.clone() });
    }
  }

  confetti(center, n = 160) {
    const cols = ['#8b5cf6', '#22d3ee', '#f472b6', '#facc15', '#34d399', '#ffffff'].map((h) => new THREE.Color(h));
    for (let i = 0; i < n; i++) {
      if (this.confData.length >= 260) this.confData.shift();
      this.confData.push({
        p: center.clone().add(new THREE.Vector3(rand(-3, 3), rand(3, 6), rand(-1.5, 1.5))),
        v: new THREE.Vector3(rand(-2, 2), rand(-1, 3), rand(-1.5, 1.5)),
        r: new THREE.Vector3(rand(0, 6), rand(0, 6), rand(0, 6)),
        w: new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8)),
        t: 0, life: rand(2.2, 3.5), c: cols[i % cols.length],
      });
    }
  }

  shake(a = 0.08) {
    this.shakeAmt = Math.max(this.shakeAmt, a);
  }

  judge(worldPos, word, sub, cls) {
    if (!this.floatLayer) return;
    const v = worldPos.clone().project(this.camera);
    if (v.z > 1) return;
    const el = document.createElement('div');
    el.className = 'judge ' + cls;
    el.innerHTML = `<b>${word}</b>${sub ? `<i>${sub}</i>` : ''}`;
    el.style.left = ((v.x + 1) / 2) * 100 + '%';
    el.style.top = ((1 - v.y) / 2) * 100 + '%';
    this.floatLayer.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }

  float(worldPos, text, cls = '') {
    if (!this.floatLayer) return;
    const v = worldPos.clone().project(this.camera);
    if (v.z > 1) return;
    const el = document.createElement('div');
    el.className = 'floater ' + cls;
    el.textContent = text;
    el.style.left = ((v.x + 1) / 2) * 100 + '%';
    el.style.top = ((1 - v.y) / 2) * 100 + '%';
    this.floatLayer.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  update(dt) {
    this.mat.uniforms.uScale.value = this.renderer.getPixelRatio();
    const P = this.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const q = P[i];
      q.t += dt;
      if (q.t >= q.life) {
        P.splice(i, 1);
        continue;
      }
      q.v.y -= 3.5 * dt;
      q.v.multiplyScalar(1 - 2.2 * dt);
      q.p.addScaledVector(q.v, dt);
    }
    for (let i = 0; i < MAX; i++) {
      const q = P[i];
      if (q) {
        this.pos[i * 3] = q.p.x;
        this.pos[i * 3 + 1] = q.p.y;
        this.pos[i * 3 + 2] = q.p.z;
        this.col[i * 3] = q.c.r;
        this.col[i * 3 + 1] = q.c.g;
        this.col[i * 3 + 2] = q.c.b;
        const k = q.t / q.life;
        this.size[i] = q.size * (1 - k * 0.6);
        this.alpha[i] = 1 - k * k;
      } else this.alpha[i] = 0;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.pcolor.needsUpdate = true;
    g.attributes.psize.needsUpdate = true;
    g.attributes.palpha.needsUpdate = true;
    g.setDrawRange(0, Math.max(1, P.length));

    // confetti
    const C = this.confData;
    for (let i = C.length - 1; i >= 0; i--) {
      const c = C[i];
      c.t += dt;
      if (c.t > c.life) {
        C.splice(i, 1);
        continue;
      }
      c.v.y -= 2.4 * dt;
      c.v.x += Math.sin(c.t * 3 + i) * 0.6 * dt;
      c.v.multiplyScalar(1 - 1.2 * dt);
      c.p.addScaledVector(c.v, dt);
      c.r.addScaledVector(c.w, dt);
    }
    this.conf.count = C.length;
    for (let i = 0; i < C.length; i++) {
      const c = C[i];
      this.q.setFromEuler(this.e.set(c.r.x, c.r.y, c.r.z));
      const s = c.t > c.life - 0.5 ? (c.life - c.t) / 0.5 : 1;
      this.v.set(s, s, s);
      this.m4.compose(c.p, this.q, this.v);
      this.conf.setMatrixAt(i, this.m4);
      this.conf.setColorAt(i, c.c);
    }
    this.conf.instanceMatrix.needsUpdate = true;
    if (this.conf.instanceColor) this.conf.instanceColor.needsUpdate = true;

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const k = r.t / r.life;
      if (k >= 1) {
        r.m.removeFromParent();
        r.m.material.dispose();
        this.rings.splice(i, 1);
        continue;
      }
      const e = 1 - Math.pow(1 - k, 3);
      r.m.scale.setScalar(0.05 + e * r.radius);
      r.m.material.opacity = 0.9 * (1 - k);
    }
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 0.5);
  }

  shakeOffset(t) {
    const a = this.shakeAmt;
    if (a <= 0.0001) return null;
    return new THREE.Vector3(Math.sin(t * 61) * a, Math.sin(t * 47 + 1) * a, 0);
  }
}
