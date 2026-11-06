// POD RUNNER — a complete little arcade game on the Crew Lounge cabinet.
// Steer a courier pod through an asteroid field, grab credit chips, chain combos.
import { audio } from './audio.js';

export function runPodRunner(canvas, { best = 0 } = {}) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  return new Promise((resolve) => {
    let state = 'title';
    let raf = 0, last = performance.now();
    let pod, rocks, chips, shields, parts, stars, score, lives, speed, t, combo, comboT, spawnR, spawnC, shake, inv, hiscore = best, flash, runs = 0, bestRun = 0;
    const keys = new Set();
    let mouseY = null;

    const reset = () => {
      pod = { x: 110, y: H / 2, vy: 0, shield: 0 };
      rocks = [];
      chips = [];
      shields = [];
      parts = [];
      score = 0;
      lives = 3;
      speed = 260;
      t = 0;
      combo = 1;
      comboT = 0;
      spawnR = 0.8;
      spawnC = 1.2;
      shake = 0;
      inv = 1.5;
      flash = 0;
    };
    stars = Array.from({ length: 140 }, () => ({ x: Math.random() * W, y: Math.random() * H, z: Math.random() * 0.9 + 0.1 }));
    reset();

    const burst = (x, y, col, n = 18, sp = 220) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = Math.random() * sp;
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.6 + Math.random() * 0.4, t: 0, col });
      }
    };

    const onKey = (e) => {
      keys.add(e.code);
      e.stopPropagation(); // the cabinet owns the keyboard while you play
      if (e.code === 'Escape') {
        e.preventDefault();
        finish();
        return;
      }
      if ((e.code === 'Space' || e.code === 'Enter') && state !== 'play') {
        e.preventDefault();
        reset();
        state = 'play';
        runs++;
        audio.play('ui');
      }
      if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
    };
    const onKeyUp = (e) => keys.delete(e.code);
    const onMouse = (e) => {
      const r = canvas.getBoundingClientRect();
      mouseY = ((e.clientY - r.top) / r.height) * H;
    };
    const onClick = () => {
      if (state !== 'play') {
        reset();
        state = 'play';
        runs++;
        audio.play('ui');
      }
    };
    addEventListener('keydown', onKey, true);
    addEventListener('keyup', onKeyUp, true);
    canvas.addEventListener('mousemove', onMouse);
    canvas.addEventListener('pointerdown', onClick);

    function finish() {
      cancelAnimationFrame(raf);
      removeEventListener('keydown', onKey, true);
      removeEventListener('keyup', onKeyUp, true);
      canvas.removeEventListener('mousemove', onMouse);
      canvas.removeEventListener('pointerdown', onClick);
      resolve({ score: Math.max(bestRun, state === 'over' ? score : 0), runs });
    }

    const hit = () => {
      if (inv > 0) return;
      if (pod.shield > 0) {
        pod.shield = 0;
        inv = 1;
        audio.play('glass');
        burst(pod.x, pod.y, '#7dd3fc', 24);
        return;
      }
      lives--;
      combo = 1;
      inv = 2;
      shake = 0.5;
      flash = 0.6;
      audio.play('heavy');
      burst(pod.x, pod.y, '#fb923c', 40, 300);
      if (lives <= 0) {
        state = 'over';
        bestRun = Math.max(bestRun, Math.floor(score));
        if (score > hiscore) {
          hiscore = Math.floor(score);
          audio.play('levelup');
        } else audio.play('fail');
      }
    };

    const step = (dt) => {
      t += dt;
      for (const s of stars) {
        s.x -= speed * s.z * dt * 0.6;
        if (s.x < 0) {
          s.x = W;
          s.y = Math.random() * H;
        }
      }
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.t += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.96;
        p.vy *= 0.96;
        if (p.t > p.life) parts.splice(i, 1);
      }
      shake = Math.max(0, shake - dt);
      flash = Math.max(0, flash - dt * 2);
      if (state !== 'play') return;
      speed = 260 + t * 9;
      score += dt * speed * 0.05 * combo;
      inv = Math.max(0, inv - dt);
      comboT -= dt;
      if (comboT <= 0 && combo > 1) combo = Math.max(1, combo - 1), (comboT = 1.2);
      // controls
      let dir = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) dir -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) dir += 1;
      if (dir) {
        pod.vy += dir * 2600 * dt;
        mouseY = null;
      } else if (mouseY !== null) pod.vy += (mouseY - pod.y) * 18 * dt;
      pod.vy *= Math.pow(0.0015, dt);
      pod.y = Math.max(24, Math.min(H - 24, pod.y + pod.vy * dt));
      // spawns
      spawnR -= dt;
      if (spawnR <= 0) {
        spawnR = Math.max(0.22, 0.85 - t * 0.012) * (0.6 + Math.random() * 0.8);
        const r = 14 + Math.random() * 30;
        rocks.push({ x: W + r, y: Math.random() * H, r, vx: -(speed * (0.8 + Math.random() * 0.5)), vy: (Math.random() - 0.5) * 60, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 3, pts: Array.from({ length: 9 }, () => 0.75 + Math.random() * 0.35) });
      }
      spawnC -= dt;
      if (spawnC <= 0) {
        spawnC = 0.7 + Math.random() * 0.9;
        const y = 40 + Math.random() * (H - 80);
        for (let i = 0; i < 4; i++) chips.push({ x: W + 20 + i * 34, y: y + Math.sin(i) * 20, a: 0 });
        if (Math.random() < 0.12) shields.push({ x: W + 30, y: 40 + Math.random() * (H - 80) });
      }
      for (let i = rocks.length - 1; i >= 0; i--) {
        const r = rocks[i];
        r.x += r.vx * dt;
        r.y += r.vy * dt;
        r.rot += r.vr * dt;
        if (r.x < -60) rocks.splice(i, 1);
        else if (Math.hypot(r.x - pod.x, r.y - pod.y) < r.r * 0.85 + 12) {
          hit();
          burst(r.x, r.y, '#cbd5e1', 16);
          rocks.splice(i, 1);
        }
      }
      for (let i = chips.length - 1; i >= 0; i--) {
        const c = chips[i];
        c.x -= speed * dt;
        c.a += dt * 6;
        if (c.x < -20) {
          chips.splice(i, 1);
          continue;
        }
        if (Math.hypot(c.x - pod.x, c.y - pod.y) < 22) {
          chips.splice(i, 1);
          score += 25 * combo;
          combo = Math.min(10, combo + 1);
          comboT = 1.5;
          audio.play('coin', { pitch: 0.8 + combo * 0.08 });
          burst(c.x, c.y, '#facc15', 8, 120);
        }
      }
      for (let i = shields.length - 1; i >= 0; i--) {
        const s = shields[i];
        s.x -= speed * 0.9 * dt;
        if (s.x < -20) shields.splice(i, 1);
        else if (Math.hypot(s.x - pod.x, s.y - pod.y) < 24) {
          shields.splice(i, 1);
          pod.shield = 1;
          audio.play('success');
        }
      }
      if (Math.random() < 0.6) parts.push({ x: pod.x - 18, y: pod.y + (Math.random() - 0.5) * 6, vx: -200 - Math.random() * 100, vy: (Math.random() - 0.5) * 30, life: 0.35, t: 0, col: '#22d3ee' });
    };

    const glowLine = (col, w = 2) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.shadowColor = col;
      ctx.shadowBlur = 12;
    };
    const draw = () => {
      ctx.save();
      if (shake > 0) ctx.translate((Math.random() - 0.5) * 14 * shake, (Math.random() - 0.5) * 14 * shake);
      ctx.fillStyle = '#04030b';
      ctx.fillRect(-20, -20, W + 40, H + 40);
      for (const s of stars) {
        ctx.fillStyle = `rgba(255,255,255,${s.z})`;
        ctx.fillRect(s.x, s.y, s.z * 2.5, s.z * 2.5);
      }
      // grid floor
      ctx.strokeStyle = 'rgba(139,92,246,0.18)';
      ctx.lineWidth = 1;
      ctx.shadowBlur = 0;
      const off = (t * speed * 0.4) % 40;
      for (let x = -off; x < W; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, H - 50);
        ctx.lineTo(x - 60, H);
        ctx.stroke();
      }
      for (const c of chips) {
        glowLine('#facc15');
        ctx.beginPath();
        const s = 9 * Math.abs(Math.cos(c.a));
        ctx.moveTo(c.x, c.y - 9);
        ctx.lineTo(c.x + s, c.y);
        ctx.lineTo(c.x, c.y + 9);
        ctx.lineTo(c.x - s, c.y);
        ctx.closePath();
        ctx.stroke();
      }
      for (const s of shields) {
        glowLine('#7dd3fc', 3);
        ctx.beginPath();
        ctx.arc(s.x, s.y, 12 + Math.sin(t * 8) * 2, 0, 7);
        ctx.stroke();
      }
      for (const r of rocks) {
        glowLine('#cbd5e1', 2);
        ctx.beginPath();
        r.pts.forEach((k, i) => {
          const a = r.rot + (i / r.pts.length) * Math.PI * 2;
          ctx.lineTo(r.x + Math.cos(a) * r.r * k, r.y + Math.sin(a) * r.r * k);
        });
        ctx.closePath();
        ctx.stroke();
      }
      for (const p of parts) {
        ctx.globalAlpha = 1 - p.t / p.life;
        ctx.fillStyle = p.col;
        ctx.shadowColor = p.col;
        ctx.shadowBlur = 8;
        ctx.fillRect(p.x, p.y, 3, 3);
      }
      ctx.globalAlpha = 1;
      if (state === 'play' && !(inv > 0 && Math.floor(t * 12) % 2)) {
        glowLine('#22d3ee', 3);
        ctx.beginPath();
        ctx.moveTo(pod.x + 20, pod.y);
        ctx.lineTo(pod.x - 14, pod.y - 12);
        ctx.lineTo(pod.x - 8, pod.y);
        ctx.lineTo(pod.x - 14, pod.y + 12);
        ctx.closePath();
        ctx.stroke();
        if (pod.shield) {
          glowLine('#7dd3fc', 2);
          ctx.beginPath();
          ctx.arc(pod.x, pod.y, 26, 0, 7);
          ctx.stroke();
        }
      }
      ctx.shadowBlur = 0;
      ctx.fillStyle = `rgba(239,68,68,${flash * 0.4})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      // HUD
      ctx.font = '700 22px Rajdhani, sans-serif';
      ctx.fillStyle = '#e2e8f0';
      ctx.textAlign = 'left';
      ctx.fillText(`SCORE ${Math.floor(score).toString().padStart(6, '0')}`, 16, 28);
      ctx.fillStyle = '#facc15';
      ctx.fillText(`×${combo}`, 190, 28);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`HI ${hiscore.toString().padStart(6, '0')}`, W - 16, 28);
      ctx.fillStyle = '#22d3ee';
      ctx.fillText('▲'.repeat(Math.max(0, lives)), W - 16, 54);
      ctx.textAlign = 'center';
      if (state === 'title' || state === 'over') {
        ctx.fillStyle = 'rgba(4,3,11,0.6)';
        ctx.fillRect(0, 0, W, H);
        ctx.font = '700 64px Rajdhani, sans-serif';
        ctx.fillStyle = '#22d3ee';
        ctx.shadowColor = '#22d3ee';
        ctx.shadowBlur = 24;
        ctx.fillText(state === 'over' ? 'GAME OVER' : 'POD RUNNER', W / 2, H / 2 - 40);
        ctx.shadowBlur = 0;
        ctx.font = '700 22px Rajdhani, sans-serif';
        ctx.fillStyle = '#e2e8f0';
        if (state === 'over') ctx.fillText(`SCORE ${Math.floor(score)}   ·   BEST ${hiscore}`, W / 2, H / 2);
        else ctx.fillText('DODGE ASTEROIDS · GRAB ◈ CHIPS · CHAIN COMBOS', W / 2, H / 2);
        ctx.fillStyle = Math.floor(performance.now() / 500) % 2 ? '#facc15' : '#fde68a';
        ctx.fillText('SPACE / CLICK TO LAUNCH  ·  W/S OR MOUSE TO STEER  ·  ESC TO LEAVE', W / 2, H / 2 + 44);
      }
    };

    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      step(dt);
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  });
}
