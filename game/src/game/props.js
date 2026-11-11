import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { glowTex, canvasTex } from './fx';

const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o });
function add(parent, geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

const brass = std('#d9a93e', { metalness: 0.8, roughness: 0.3 });
const clay = std('#b5532e');
const flame = new THREE.MeshStandardMaterial({ color: '#ffb347', emissive: '#ff9a2e', emissiveIntensity: 3 });
const white = std('#fbf7ee', { roughness: 0.35 });

export const PROPS = {
  diya(g) {
    add(g, new THREE.CylinderGeometry(0.075, 0.045, 0.05, 14), clay, 0, 0.025, 0);
    add(g, new THREE.SphereGeometry(0.022, 10, 8), flame, 0, 0.085, 0).scale.set(1, 1.9, 1);
  },
  chandan(g) {
    add(g, new THREE.CylinderGeometry(0.07, 0.05, 0.05, 16), brass, 0, 0.025, 0);
    add(g, new THREE.SphereGeometry(0.062, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), std('#f3e2bf'), 0, 0.04, 0).scale.y = 0.4;
  },
  kajal(g) {
    add(g, new THREE.CylinderGeometry(0.035, 0.05, 0.07, 14), brass, 0, 0.035, 0);
    add(g, new THREE.CylinderGeometry(0.045, 0.045, 0.012, 14), std('#111'), 0, 0.075, 0);
    add(g, new THREE.TorusGeometry(0.035, 0.007, 6, 14, Math.PI), brass, 0.06, 0.04, 0).rotation.z = -Math.PI / 2;
  },
  dhaan_durbo(g) {
    add(g, new THREE.CircleGeometry(0.08, 14), std('#5c9a3f', { side: THREE.DoubleSide }), 0, 0.005, 0).rotation.x = -Math.PI / 2;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const b = add(g, new THREE.ConeGeometry(0.007, 0.13, 4), std('#58b047'), Math.cos(a) * 0.02, 0.07, Math.sin(a) * 0.02);
      b.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
    }
    for (let i = 0; i < 10; i++)
      add(g, new THREE.SphereGeometry(0.009, 6, 4), std('#e6b43c'), (Math.random() - 0.5) * 0.09, 0.012, (Math.random() - 0.5) * 0.09).scale.set(1, 0.6, 1.6);
  },
  mishti(g) {
    add(g, new THREE.CylinderGeometry(0.075, 0.06, 0.06, 14), clay, 0, 0.03, 0);
    for (const [x, z] of [[-0.03, 0], [0.03, 0.01], [0, -0.03], [0, 0.03]])
      add(g, new THREE.SphereGeometry(0.03, 12, 10), white, x, 0.075, z);
  },
};

export function makeThala() {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.18, 0.165, 0.02, 32), brass, 0, 0, 0);
  const spots = { diya: [0, 0.01, -0.09], chandan: [-0.09, 0.01, 0.03], kajal: [0.09, 0.01, 0.03], dhaan_durbo: [-0.035, 0.01, 0.11], mishti: [0.06, 0.01, 0.1] };
  g.userData.parts = {};
  for (const [id, p] of Object.entries(spots)) {
    const s = new THREE.Group();
    s.position.set(...p);
    s.scale.setScalar(0.85);
    PROPS[id](s);
    g.add(s);
    g.userData.parts[id] = s;
  }
  const light = new THREE.PointLight(0xffa64d, 0, 3, 2);
  light.position.set(0, 0.15, -0.09);
  g.add(light);
  g.userData.light = light;
  return g;
}

export function makeItem(id) {
  const g = new THREE.Group();
  const model = new THREE.Group();
  PROPS[id](model);
  model.scale.setScalar(2.6);
  model.position.y = 0.75;
  g.add(model);
  // a thin, faint beam so it can be spotted from far away (the game fades it out up close)
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.06, 5, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = 3.4;
  g.add(beam);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.36, 40),
    new THREE.MeshBasicMaterial({ color: 0xffb340, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  g.add(ring);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.35 }));
  glow.scale.setScalar(0.55);
  glow.position.y = 0.82;
  g.add(glow);
  g.userData.model = model;
  g.userData.beam = beam;
  g.userData.glow = glow;
  return g;
}

export function makeBiscuit() {
  const g = new THREE.Group();
  add(g, new RoundedBoxGeometry(0.2, 0.09, 0.06, 2, 0.015), std('#e43d3d'));
  add(g, new THREE.BoxGeometry(0.205, 0.028, 0.065), std('#ffd23a'));
  g.userData.half = 0.1;
  return g;
}

export function makeGift() {
  const g = new THREE.Group();
  add(g, new RoundedBoxGeometry(0.28, 0.22, 0.28, 2, 0.03), std('#7b5bd6'));
  const rib = std('#ffcf3a', { metalness: 0.3, roughness: 0.4 });
  add(g, new THREE.BoxGeometry(0.29, 0.23, 0.05), rib);
  add(g, new THREE.BoxGeometry(0.05, 0.23, 0.29), rib);
  for (const s of [-1, 1]) add(g, new THREE.TorusGeometry(0.05, 0.016, 8, 16), rib, s * 0.045, 0.15, 0).rotation.y = s * 0.6;
  g.userData.half = 0.15;
  return g;
}

// the "new gift": a Nintendo Switch (screen in the middle, a blue and a red controller)
export function makeNintendo() {
  const g = new THREE.Group();
  add(g, new RoundedBoxGeometry(0.2, 0.092, 0.016, 2, 0.006), std('#2a2a30', { roughness: 0.4 }));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.08), new THREE.MeshStandardMaterial({
    map: canvasTex(160, 80, (c, w, h) => {
      const sky = c.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#7fd3ff'); sky.addColorStop(1, '#d9f3ff');
      c.fillStyle = sky; c.fillRect(0, 0, w, h);
      c.fillStyle = '#5cc25b'; c.fillRect(0, h * 0.72, w, h * 0.28);
      c.fillStyle = '#ffd23a'; c.beginPath(); c.arc(w * 0.78, h * 0.25, 9, 0, Math.PI * 2); c.fill();
      c.font = '30px sans-serif'; c.fillText('❤️', w * 0.4, h * 0.68);
    }),
    emissive: '#ffffff', emissiveIntensity: 0.25, roughness: 0.2,
  }));
  screen.position.z = 0.0085;
  g.add(screen);
  for (const [x, col] of [[-0.118, '#19b6ea'], [0.118, '#ff4f4f']]) {
    add(g, new RoundedBoxGeometry(0.036, 0.092, 0.022, 2, 0.012), std(col, { roughness: 0.35 }), x, 0, 0);
    add(g, new THREE.CylinderGeometry(0.007, 0.007, 0.006, 10), std('#222'), x, x < 0 ? 0.018 : -0.012, 0.012).rotation.x = Math.PI / 2;
  }
  g.userData.half = 0.14;
  return g;
}

// a phone for the family selfie
export function makePhone() {
  const g = new THREE.Group();
  add(g, new RoundedBoxGeometry(0.075, 0.15, 0.01, 2, 0.008), std('#1b1b22', { roughness: 0.3, metalness: 0.4 }));
  const cam = add(g, new THREE.CylinderGeometry(0.006, 0.006, 0.004, 12), std('#444', { metalness: 0.8 }), 0.022, 0.058, -0.006);
  cam.rotation.x = Math.PI / 2;
  return g;
}

// the little gift shop on the street, with the three gifts on the counter
export function makeShop() {
  const g = new THREE.Group();
  const wood = std('#c98a4b'), dark = std('#6b4a2b'), top = std('#8a5a2b');
  // counter with a painted front
  add(g, new THREE.BoxGeometry(1.8, 1.0, 0.6), wood, 0, 0.5, 0);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.8), new THREE.MeshStandardMaterial({
    map: canvasTex(512, 240, (c, w, h) => {
      c.fillStyle = '#ffe9c7'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#d9822b'; c.lineWidth = 10; c.strokeRect(10, 10, w - 20, h - 20);
      c.fillStyle = '#b8401d'; c.textAlign = 'center';
      c.font = '700 74px "Baloo Da 2", sans-serif'; c.fillText('উপহার', w / 2, 105);
      c.font = '800 46px "Baloo Da 2", sans-serif'; c.fillStyle = '#6a3d8f'; c.fillText('GIFTS · খেলনা · MISHTI', w / 2, 175);
      c.font = '34px sans-serif'; c.fillText('🎁 🍪 🎮 🧸', w / 2, 222);
    }),
    roughness: 0.8,
  }));
  front.position.set(0, 0.5, 0.302);
  g.add(front);
  add(g, new THREE.BoxGeometry(1.9, 0.05, 0.7), top, 0, 1.025, 0);
  // posts, shelf with colourful boxes, striped awning, sign board, fairy lights
  for (const x of [-0.88, 0.88]) {
    add(g, new THREE.CylinderGeometry(0.035, 0.035, 2.35, 8), dark, x, 1.175, -0.27);
    add(g, new THREE.CylinderGeometry(0.03, 0.03, 1.2, 8), dark, x, 1.6, 0.3);
  }
  add(g, new THREE.BoxGeometry(1.7, 0.04, 0.26), top, 0, 1.55, -0.2);
  const cols = ['#e94b5a', '#ffb627', '#4bb3fd', '#8b5cf6', '#2ec4b6', '#ff7aa2'];
  for (let i = 0; i < 9; i++) {
    const s = 0.1 + (i % 3) * 0.04;
    add(g, new THREE.BoxGeometry(s, s, s * 0.9), std(cols[i % cols.length]), -0.72 + i * 0.18, 1.57 + s / 2, -0.2).rotation.y = (i % 2) * 0.3;
  }
  const awning = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.03, 1.0), new THREE.MeshStandardMaterial({
    map: canvasTex(256, 64, (c, w, h) => {
      for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#fff4e0' : '#e8433c'; c.fillRect((i * w) / 8, 0, w / 8, h); }
    }),
    roughness: 0.9,
  }));
  awning.position.set(0, 2.25, 0.05);
  awning.rotation.x = 0.28;
  awning.castShadow = true;
  g.add(awning);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.42, 0.05), [dark, dark, dark, dark, new THREE.MeshStandardMaterial({
    map: canvasTex(512, 112, (c, w, h) => {
      c.fillStyle = '#6a3d8f'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#ffd23a'; c.textAlign = 'center'; c.font = '800 64px "Baloo Da 2", sans-serif';
      c.fillText('🎁 GIFT SHOP', w / 2, 78);
    }),
    emissive: '#ffffff', emissiveIntensity: 0.15,
  }), dark]);
  sign.position.set(0, 2.62, -0.25);
  g.add(sign);
  const bulbCols = ['#ffd27a', '#ff8fa3', '#9be7ff', '#c7ff8f'];
  for (let i = 0; i < 11; i++) {
    const b = add(g, new THREE.SphereGeometry(0.022, 8, 6), new THREE.MeshStandardMaterial({ color: bulbCols[i % 4], emissive: bulbCols[i % 4], emissiveIntensity: 2 }), -1.0 + i * 0.2, 2.05 - Math.sin((i / 10) * Math.PI) * 0.05, 0.52);
    b.castShadow = false;
  }
  // the three gifts on display
  const bis = makeBiscuit();
  bis.position.set(-0.55, 1.1, 0.08);
  bis.rotation.y = 0.3;
  g.add(bis);
  const box = makeGift();
  box.scale.setScalar(0.65);
  box.position.set(0, 1.12, 0.05);
  g.add(box);
  const sw = makeNintendo();
  sw.position.set(0.55, 1.12, 0.05);
  sw.rotation.x = -0.35;
  g.add(sw);
  return g;
}

export function makeRosogolla() {
  return new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), white);
}
