// First-person exploration of Forge-7.
import * as THREE from 'three';
import { FY, roomAt, buildDrone } from './station.js';
import { audio } from './audio.js';
import { clamp, damp } from './util.js';

export const EYE = 7.6;
const RADIUS = 0.95;
const SPEED = 9.5, SPRINT = 15;
export const SPAWNS = {
  bench: { x: 2.4, z: 6.8, yaw: 0 },
  shop: { x: 21.5, z: 1.5, yaw: 0 },
  hangar: { x: 47, z: 8, yaw: -Math.PI / 2 },
};

export class Walk {
  constructor(game, deck) {
    this.g = game;
    this.deck = deck;
    this.pos = new THREE.Vector3(2.4, FY + EYE, 6.8);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = -0.1;
    this.keys = new Set();
    this.active = false;
    this.locked = false;
    this.drag = null;
    this.target = null;
    this.room = null;
    this.bob = 0;
    this.stepT = 0;
    this.drone = buildDrone();
    this.drone.visible = false;
    this.drone.position.copy(this.pos);
    game.scene.add(this.drone);
    // the bench is interactable from the bay
    this.extra = [
      { id: 'bench', action: 'bench', label: 'Sit at the bench — start the next order', pos: new THREE.Vector3(2.4, 0.5, 2.8), r: 7.5 },
      { id: 'window', action: 'window', label: 'Admire the view', pos: new THREE.Vector3(-9.7, 4.7, -3.4), r: 9 },
    ];
    addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (this.g.ui.isOpen || this.g.ui.txKey || this.g.ui.overlayOpen) return;
      this.keys.add(e.code);
      if (e.code === 'KeyE' || e.code === 'Enter') this.interact();
      if (e.code === 'Tab') {
        e.preventDefault();
        this.g.walkInteract({ action: 'bench' });
      }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.g.canvas;
      this.g.ui.walkLockHint(this.active && !this.locked);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.active || !this.locked) return;
      this.look(e.movementX, e.movementY);
    });
  }

  enter(spawn = 'bench') {
    const s = SPAWNS[spawn] || SPAWNS.bench;
    this.pos.set(s.x, FY + EYE, s.z);
    this.yaw = s.yaw;
    this.pitch = -0.08;
    this.vel.set(0, 0, 0);
    this.active = true;
    this.keys.clear();
    this.room = null;
    this.drone.visible = true;
    this.drone.position.copy(this.pos).add(new THREE.Vector3(1.5, 0.6, 1.5));
    this.g.camera.fov = 70;
    this.g.camera.updateProjectionMatrix();
    this.g.ui.walkLockHint(!this.locked);
  }
  exit() {
    this.active = false;
    this.keys.clear();
    this.drone.visible = false;
    this.target = null;
    this.g.ui.walkPrompt(null);
    this.g.ui.walkLockHint(false);
    if (document.pointerLockElement) document.exitPointerLock();
    this.g.camera.fov = 42;
    this.g.camera.updateProjectionMatrix();
  }
  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }
  teleport(x, z, yaw = this.yaw) {
    this.pos.set(x, FY + EYE, z);
    this.yaw = yaw;
  }

  look(dx, dy) {
    this.yaw -= dx * 0.0022;
    this.pitch = clamp(this.pitch - dy * 0.0022, -1.35, 1.35);
  }

  // pointer events routed by the game when state === 'walk'
  onDown(ndc, e) {
    if (!this.locked) {
      try {
        const p = this.g.canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      } catch (err) {}
      this.drag = { x: e.clientX, y: e.clientY };
    } else this.interact();
  }
  onMove(ndc, e) {
    if (this.drag && !this.locked) {
      this.look((e.clientX - this.drag.x) * 1.4, (e.clientY - this.drag.y) * 1.4);
      this.drag = { x: e.clientX, y: e.clientY };
    }
  }
  onUp() {
    this.drag = null;
  }

  forward() {
    return new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  interact() {
    if (this.target) this.g.walkInteract(this.target);
  }

  collide() {
    for (let iter = 0; iter < 3; iter++) {
      for (const b of this.deck.colliders) {
        const cx = clamp(this.pos.x, b.x0, b.x1), cz = clamp(this.pos.z, b.z0, b.z1);
        const dx = this.pos.x - cx, dz = this.pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < RADIUS * RADIUS) {
          if (d2 < 1e-8) {
            // centre inside the box: push out along the shallowest axis
            const pen = [this.pos.x - b.x0, b.x1 - this.pos.x, this.pos.z - b.z0, b.z1 - this.pos.z];
            const m = Math.min(...pen);
            if (m === pen[0]) this.pos.x = b.x0 - RADIUS;
            else if (m === pen[1]) this.pos.x = b.x1 + RADIUS;
            else if (m === pen[2]) this.pos.z = b.z0 - RADIUS;
            else this.pos.z = b.z1 + RADIUS;
          } else {
            const d = Math.sqrt(d2);
            this.pos.x = cx + (dx / d) * RADIUS;
            this.pos.z = cz + (dz / d) * RADIUS;
          }
        }
      }
    }
  }

  update(dt, t) {
    if (!this.active) return;
    // movement
    const k = this.keys;
    let fx = 0, fz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) fz += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fz -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) fx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) fx += 1;
    const len = Math.hypot(fx, fz) || 1;
    const sp = k.has('ShiftLeft') || k.has('ShiftRight') ? SPRINT : SPEED;
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const want = fwd.multiplyScalar((fz / len) * sp).add(right.multiplyScalar((fx / len) * sp));
    this.vel.x = damp(this.vel.x, want.x, 12, dt);
    this.vel.z = damp(this.vel.z, want.z, 12, dt);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.collide();
    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (speed > 1) {
      this.bob += dt * speed * 0.9;
      this.stepT -= dt;
      if (this.stepT <= 0) {
        this.stepT = sp === SPRINT ? 0.3 : 0.42;
        audio.play('step');
      }
    }
    // camera
    const cam = this.g.camera;
    const bobY = Math.sin(this.bob * 2) * 0.09 * Math.min(1, speed / SPEED);
    cam.position.set(this.pos.x, this.pos.y + bobY, this.pos.z);
    cam.rotation.set(this.pitch, this.yaw, Math.sin(this.bob) * 0.006, 'YXZ');
    // room detection
    const room = roomAt(this.pos.x, this.pos.z);
    if (room && room !== this.room) {
      this.room = room;
      this.g.onEnterRoom(room);
    }
    // interaction target: closest to the centre of view within reach
    const f = this.forward();
    let best = null, bestA = 0.42;
    for (const it of [...this.deck.interact, ...this.extra]) {
      const d = it.pos.clone().sub(this.pos);
      const dist = d.length();
      if (dist > it.r) continue;
      const a = Math.acos(clamp(d.normalize().dot(f), -1, 1));
      const lim = dist < 3 ? 0.75 : bestA;
      if (a < lim && (!best || a < best.a)) best = { it, a };
    }
    const tgt = best ? best.it : null;
    if (tgt !== this.target) {
      this.target = tgt;
      this.g.ui.walkPrompt(tgt ? tgt.label : null);
      if (tgt) audio.play('hover');
    }
    // companion drone: hovers over your right shoulder
    const dr = this.drone;
    const goal = this.pos.clone().add(new THREE.Vector3(Math.cos(this.yaw) * 1.6 - Math.sin(this.yaw) * 1.2, 0.9 + Math.sin(t * 2.1) * 0.15, -Math.sin(this.yaw) * 1.6 - Math.cos(this.yaw) * 1.2));
    dr.position.x = damp(dr.position.x, goal.x, 3, dt);
    dr.position.y = damp(dr.position.y, goal.y, 3, dt);
    dr.position.z = damp(dr.position.z, goal.z, 3, dt);
    dr.rotation.y = damp(dr.rotation.y, this.yaw + Math.PI, 4, dt);
    dr.userData.rotor.rotation.y += dt * 30;
    dr.userData.eyeM.emissiveIntensity = 2 + Math.sin(t * 3) * 0.5;
  }
}
