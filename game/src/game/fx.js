import * as THREE from 'three';

export const fx = { scene: null };

// ---------------------------------------------------------------- tweens
export const easeInOut = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const tweens = [];
export function tween(dur, fn, ease = easeInOut) {
  return new Promise((res) => tweens.push({ t: 0, dur, fn, ease, res }));
}
export const wait = (s) => tween(s, () => {});
export function updateTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.dur);
    tw.fn(tw.ease(k), k);
    if (k >= 1) {
      tweens.splice(i, 1);
      tw.res();
    }
  }
}

// ---------------------------------------------------------------- textures
export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export const glowTex = canvasTex(64, 64, (g, w) => {
  const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  gr.addColorStop(0, 'rgba(255,255,240,1)');
  gr.addColorStop(0.3, 'rgba(255,220,140,0.8)');
  gr.addColorStop(1, 'rgba(255,200,100,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, w);
});
const puffTex = canvasTex(64, 64, (g, w) => {
  const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.55, 'rgba(236,236,244,0.95)');
  gr.addColorStop(0.8, 'rgba(170,170,190,0.55)');   // soft grey rim so steam shows on light walls
  gr.addColorStop(1, 'rgba(150,150,170,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, w);
});
const emojiTex = (ch) =>
  canvasTex(128, 128, (g, w) => {
    g.font = '100px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(ch, w / 2, w / 2 + 6);
  });
const heartTex = emojiTex('❤️');
const angerTex = emojiTex('💢');

export function textSprite(text, color = '#6d4fa3') {
  const tex = canvasTex(512, 128, (g, w, h) => {
    g.font = '800 64px "Baloo Da 2", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const tw = g.measureText(text).width + 60;
    g.fillStyle = 'rgba(255,248,236,0.95)';
    g.beginPath();
    g.roundRect((w - tw) / 2, 18, tw, h - 36, 40);
    g.fill();
    g.fillStyle = color;
    g.fillText(text, w / 2, h / 2 + 4);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(1.4, 0.35, 1);
  s.renderOrder = 10;
  return s;
}

// ---------------------------------------------------------------- particles
const particles = [];
const petalMats = ['#ff9f1c', '#ffd23a', '#ff7b1c'].map((c) => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
const petalGeo = new THREE.PlaneGeometry(0.07, 0.045);

export function spawn(obj, pos, vel, life, o = {}) {
  obj.position.copy(pos);
  fx.scene.add(obj);
  particles.push({ obj, vel, life, max: life, spin: o.spin || 0, grav: o.grav ?? 0, drag: o.drag ?? 0, grow: o.grow || 0, s0: obj.scale.x, fade: !!o.fade });
}
const sprite = (map, opts = {}) =>
  new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, ...opts }));

export function petals(center, n = 120, spread = 2.5) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(petalGeo, petalMats[i % 3]);
    m.rotation.set(Math.random() * 6, Math.random() * 6, 0);
    const p = center.clone().add(new THREE.Vector3((Math.random() - 0.5) * spread, 2 + Math.random() * 1.5, (Math.random() - 0.5) * spread));
    spawn(m, p, new THREE.Vector3((Math.random() - 0.5) * 0.4, -0.5 - Math.random() * 0.5, (Math.random() - 0.5) * 0.4), 4 + Math.random() * 2, { spin: 3 });
  }
}
export function sparkles(center, n = 18, color = 0xffe08a, size = 0.18) {
  for (let i = 0; i < n; i++) {
    const s = sprite(glowTex, { color, blending: THREE.AdditiveBlending });
    s.scale.setScalar(size * (0.6 + Math.random()));
    const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize();
    spawn(s, center, dir.multiplyScalar(1 + Math.random() * 1.5), 0.6 + Math.random() * 0.5, { drag: 2.5 });
  }
}
export function hearts(center, n = 8) {
  for (let i = 0; i < n; i++) {
    const s = sprite(heartTex);
    s.scale.setScalar(0.2 + Math.random() * 0.12);
    spawn(s, center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6)),
      new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.7 + Math.random() * 0.5, 0), 1.6 + Math.random());
  }
}
// cartoon steam: puffs shooting out of both sides of the head, then drifting up
export function steamPuff(pos, side) {
  for (const s of [1, -1]) {
    const p = sprite(puffTex, { opacity: 0.95 });
    p.scale.setScalar(0.16);
    const out = side.clone().multiplyScalar(s);
    spawn(p, pos.clone().addScaledVector(out, 0.1),
      out.multiplyScalar(0.9 + Math.random() * 0.4).add(new THREE.Vector3(0, 0.7 + Math.random() * 0.5, 0)), 0.8, { grow: 0.9, fade: true, drag: 1.2 });
  }
}
export function angerMark(pos) {
  const s = sprite(angerTex);
  s.scale.setScalar(0.22);
  spawn(s, pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.25, 0, (Math.random() - 0.5) * 0.1)),
    new THREE.Vector3(0, 0.25, 0), 0.7, { grow: 0.15 });
}
export function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    p.vel.y -= p.grav * dt;
    if (p.drag) p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
    p.obj.position.addScaledVector(p.vel, dt);
    if (p.spin) {
      p.obj.rotation.x += p.spin * dt;
      p.obj.rotation.y += p.spin * 0.7 * dt;
    }
    const k = p.life / p.max;
    if (p.grow) p.obj.scale.setScalar(p.obj.scale.x + p.grow * dt);
    if (p.fade && p.obj.material) p.obj.material.opacity = Math.max(0, k) * 0.9;
    else if (k < 0.3) p.obj.scale.setScalar(p.s0 * Math.max(0.01, k / 0.3));
    if (p.life <= 0) {
      fx.scene.remove(p.obj);
      particles.splice(i, 1);
    }
  }
}
