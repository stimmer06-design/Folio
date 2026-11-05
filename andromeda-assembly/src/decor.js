// Collectible workshop decor (dropped by supply crates)
import * as THREE from 'three';
import { M, mesh, std, phys } from './models.js';
import { holoMaterial, U } from './shaders.js';
import * as T from './textures.js';

const S = (r, ws = 24, hs = 16) => new THREE.SphereGeometry(r, ws, hs);
const C = (rt, rb, h, s = 24) => new THREE.CylinderGeometry(rt, rb, h, s);
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);

export function buildDecor(id) {
  const g = new THREE.Group();
  g.userData.anim = null;
  switch (id) {
    case 'bonsai': {
      mesh(C(0.28, 0.22, 0.22), phys({ color: '#2b2f3a', roughness: 0.3, clearcoat: 1 }), 0, 0.11, 0, g);
      mesh(C(0.26, 0.26, 0.02), std({ color: '#3b2a1c', roughness: 1 }), 0, 0.22, 0, g);
      const trunk = std({ color: '#5a3a22', roughness: 0.9 });
      mesh(C(0.03, 0.05, 0.4, 8), trunk, 0.03, 0.42, 0, g, { rz: -0.4 });
      const leaf = std({ color: '#3f8f4a', roughness: 0.8 });
      for (const [x, y, z, r] of [[0.15, 0.62, 0, 0.16], [-0.05, 0.7, 0.06, 0.13], [0.22, 0.55, -0.1, 0.11], [0.05, 0.6, -0.12, 0.12]]) mesh(S(r, 12, 10), leaf, x, y, z, g);
      break;
    }
    case 'duck': {
      const y = std({ color: '#facc15', roughness: 0.35 });
      mesh(S(0.18), y, 0, 0.15, 0, g).scale.set(1.2, 0.9, 1);
      mesh(S(0.11), y, 0.13, 0.33, 0, g);
      mesh(C(0.0, 0.05, 0.1, 12), std({ color: '#f97316', roughness: 0.4 }), 0.25, 0.32, 0, g, { rz: -Math.PI / 2 });
      for (const z of [-0.05, 0.05]) mesh(S(0.018, 8, 6), M.chip, 0.21, 0.37, z, g);
      g.userData.anim = (o, t) => (o.rotation.z = Math.sin(t * 2) * 0.05);
      break;
    }
    case 'mug': {
      const tex = T.toTex(T.textCanvas(256, 128, (ctx) => {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, 256, 128);
        ctx.fillStyle = '#5b3fd1';
        ctx.font = T.font(700, 30);
        ctx.textAlign = 'center';
        ctx.fillText("WORLD'S BEST", 128, 54);
        ctx.fillText('BUILDER', 128, 92);
      }));
      mesh(C(0.14, 0.13, 0.3, 28), std({ map: tex, roughness: 0.3 }), 0, 0.15, 0, g, { ry: -1.2 });
      mesh(new THREE.TorusGeometry(0.08, 0.02, 8, 20), M.plasticWhite, -0.15, 0.16, 0, g);
      mesh(C(0.12, 0.12, 0.01, 20), std({ color: '#3b2314', roughness: 0.2 }), 0, 0.28, 0, g);
      break;
    }
    case 'lava': {
      mesh(C(0.14, 0.18, 0.12), M.darkMetal, 0, 0.06, 0, g);
      mesh(C(0.1, 0.14, 0.5, 24), phys({ color: '#6d28d9', transparent: true, opacity: 0.55, roughness: 0.05, clearcoat: 1 }), 0, 0.37, 0, g);
      mesh(C(0.06, 0.1, 0.1), M.darkMetal, 0, 0.67, 0, g);
      const blob = std({ color: '#200', emissive: new THREE.Color('#f472b6'), emissiveIntensity: 2.5 });
      const bs = [0, 1, 2].map((i) => mesh(S(0.05 + i * 0.012, 12, 10), blob, 0, 0.3, 0, g, { cast: false }));
      g.userData.anim = (o, t) => bs.forEach((b, i) => (b.position.y = 0.27 + (Math.sin(t * 0.6 + i * 2.1) * 0.5 + 0.5) * 0.28));
      break;
    }
    case 'globe': {
      mesh(C(0.12, 0.16, 0.05), M.darkMetal, 0, 0.025, 0, g);
      mesh(C(0.015, 0.015, 0.25, 8), M.silver, 0, 0.15, 0, g);
      const p = new THREE.Group();
      p.position.y = 0.42;
      g.add(p);
      mesh(S(0.15, 28, 20), std({ map: T.saturnBands(), roughness: 0.6 }), 0, 0, 0, p);
      mesh(new THREE.RingGeometry(0.2, 0.32, 48), std({ color: '#d6c39a', side: THREE.DoubleSide, transparent: true, opacity: 0.8 }), 0, 0, 0, p, { rx: -Math.PI / 2 + 0.4 });
      g.userData.anim = (o, t) => (p.rotation.y = t * 0.4);
      break;
    }
    case 'astro': {
      const w = phys({ color: '#f1f5f9', roughness: 0.4, clearcoat: 0.6 });
      mesh(C(0.14, 0.16, 0.04), M.darkMetal, 0, 0.02, 0, g);
      mesh(new THREE.CapsuleGeometry(0.09, 0.16, 6, 12), w, 0, 0.22, 0, g);
      mesh(S(0.1), w, 0, 0.44, 0, g);
      mesh(S(0.075, 16, 12), phys({ color: '#1e293b', roughness: 0.05, metalness: 0.8, clearcoat: 1 }), 0.04, 0.445, 0, g).scale.set(0.6, 0.8, 1);
      const arm = mesh(new THREE.CapsuleGeometry(0.03, 0.12, 4, 8), w, 0.12, 0.34, 0, g, { rz: -2.2 });
      g.userData.anim = (o, t) => (arm.rotation.z = -2.2 + Math.sin(t * 3) * 0.35);
      break;
    }
    case 'crt': {
      mesh(new THREE.BoxGeometry(0.6, 0.5, 0.55), std({ color: '#d8d2c0', roughness: 0.6 }), 0, 0.25, 0, g);
      const [c, ctx] = T.canvas(128, 96);
      const tex = T.toTex(c);
      const scr = std({ color: '#000', emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: 1.2 });
      mesh(new THREE.PlaneGeometry(0.44, 0.33), scr, 0, 0.27, 0.276, g, { cast: false });
      let last = 0;
      g.userData.anim = (o, t) => {
        if (t - last < 0.1) return;
        last = t;
        ctx.fillStyle = 'rgba(0,10,20,0.35)';
        ctx.fillRect(0, 0, 128, 96);
        for (let i = 0; i < 20; i++) {
          const a = i * 0.7 + t * 0.6;
          const r = ((t * 30 + i * 13) % 70);
          ctx.fillStyle = i % 3 ? '#9be7ff' : '#f0abfc';
          ctx.fillRect(64 + Math.cos(a) * r, 48 + Math.sin(a) * r * 0.7, 2, 2);
        }
        tex.needsUpdate = true;
      };
      break;
    }
    case 'cat': {
      const hm = holoMaterial('#67e8f9', 0.9);
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.22, 6, 12), hm);
      body.rotation.z = Math.PI / 2;
      body.position.y = 0.16;
      g.add(body);
      const head = new THREE.Mesh(S(0.1, 16, 12), hm);
      head.position.set(0.2, 0.27, 0);
      g.add(head);
      for (const z of [-0.05, 0.05]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.08, 8), hm);
        ear.position.set(0.2, 0.37, z);
        g.add(ear);
      }
      const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.22, 4, 8), hm);
      tail.position.set(-0.24, 0.26, 0);
      g.add(tail);
      mesh(C(0.2, 0.22, 0.03), M.darkMetal, 0, 0.015, 0, g);
      g.userData.anim = (o, t) => {
        tail.rotation.z = 0.6 + Math.sin(t * 2.5) * 0.4;
        head.rotation.y = Math.sin(t * 0.5) * 0.4;
      };
      break;
    }
    case 'trophy': {
      const gold = std({ color: '#f5c542', roughness: 0.15, metalness: 1 });
      mesh(B(0.3, 0.08, 0.2), M.blackGloss, 0, 0.04, 0, g);
      const w = new THREE.Group();
      w.position.y = 0.32;
      w.rotation.z = 0.5;
      g.add(w);
      mesh(B(0.05, 0.38, 0.04), gold, 0, 0, 0, w);
      mesh(new THREE.TorusGeometry(0.06, 0.025, 8, 16, Math.PI * 1.5), gold, 0, 0.22, 0, w, { rz: -Math.PI * 0.25 });
      g.userData.anim = (o, t) => (w.rotation.y = t * 0.8);
      break;
    }
    case 'shard': {
      mesh(C(0.14, 0.18, 0.08, 6), M.darkMetal, 0, 0.04, 0, g);
      const cm = std({ color: '#2a0a3a', emissive: new THREE.Color('#e879f9'), emissiveIntensity: 2.2, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.9 });
      const cr = mesh(new THREE.OctahedronGeometry(0.13, 0), cm, 0, 0.33, 0, g, { cast: false });
      cr.scale.set(0.7, 1.6, 0.7);
      g.userData.anim = (o, t) => {
        cr.rotation.y = t * 0.9;
        cr.position.y = 0.33 + Math.sin(t * 1.4) * 0.03;
        cm.emissiveIntensity = 1.8 + Math.sin(t * 3) * 0.6;
      };
      break;
    }
  }
  return g;
}
