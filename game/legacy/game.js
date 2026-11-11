import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// =====================================================================
//  PERSONALISE HERE: names, lines and the final message
//  {B} = what she calls him, {S} = what he calls her
// =====================================================================
const CONFIG = {
  brother: 'Bhaiya',
  sister: 'Honey',
  subtitle: 'A little game for my {B} 🪔',
  intro: [
    ['S', '{B}! Where are you?! Today is Bhai Phota!'],
    ['S', 'I am waiting at the swing in the backyard. But first, bring everything for the phota thala.'],
    ['S', 'Chandan, kajal, dhaan-durbo, a diya… and the mishti. Do NOT eat the mishti on the way!'],
    ['B', 'Haan haan, coming {S}…'],
  ],
  items: {
    chandan:     { icon: '🥣', name: 'Chandan',     line: 'Chandan! Smells exactly like Bhai Phota morning.' },
    kajal:       { icon: '⚫', name: 'Kajal',       line: 'Kajal for the phota. Careful, don\'t smudge it!' },
    dhaan_durbo: { icon: '🌾', name: 'Dhaan-durbo', line: 'Dhaan-durbo for the blessing. Live long, just like the durbo grass!' },
    diya:        { icon: '🪔', name: 'Diya',        line: 'The diya! Now the aarti can happen.' },
    mishti:      { icon: '🍬', name: 'Mishti',      line: 'Mishti! …why does the box feel lighter? {B}!!' },
  },
  allFound: 'Got everything! Now go to {S} at the swing in the backyard 🪢',
  gateOpen: 'The gate creaks open… 🚪',
  ceremony: {
    sit: [['S', 'Finally! Sit on the swing, {B}. And sit STILL.']],
    aarti: [['S', 'First, the aarti… 🪔']],
    phota: [['S', 'Now the phota. Close your eyes!']],
    durbo: [['S', 'Dhaan-durbo on your head. Live long and stay happy, {B}!']],
    shankh: '🐚 Shankh and ulu! 🎉',
    mishti: [['S', 'Open your mouth… one rosogolla for you!'], ['B', 'Only ONE?!']],
    askGift: [['S', 'Ahem. {B}… where is MY gift? 😌'], ['B', 'Gift? Of course I have a gift…']],
    choiceBiscuit: '🍪 The classic ₹5 cream biscuit',
    choiceReal: '🎁 A REAL gift this time',
    biscuit1: [
      ['S', '{B}!!! AGAIN the ₹5 cream biscuit?!'],
      ['S', 'The last real gift was the Galaxy Watch… in 2022! That was FOUR Bhai Photas ago!'],
      ['B', 'That watch was an advance payment for the next 10 Bhai Photas 😎'],
      ['S', 'Hmph. Try again, {B} 🙂'],
    ],
    biscuit2: [
      ['S', 'Two cream biscuits now. ₹10. Wow, what generosity 🙄'],
      ['S', '…fine, I am keeping both. But next year I want a real gift!'],
    ],
    real: [
      ['S', 'Wait… a REAL gift?! After 2022?! 😱'],
      ['S', 'This is now officially on record, {B}. Screenshot proof! 📸'],
    ],
    bye: [['B', 'Happy Bhai Phota, {S} ❤️']],
  },
  chant: [
    ['ভাইয়ের কপালে দিলাম ফোঁটা,', 'Bhaiyer kopale dilam phonta,'],
    ['যমের দুয়ারে পড়ল কাঁটা।', 'Jomer duare porlo kanta.'],
    ['যমুনা দেয় যমকে ফোঁটা,', 'Jomuna dey Jomke phonta,'],
    ['আমি দিই আমার ভাইকে ফোঁটা।', 'Ami dii amar bhaike phonta.'],
  ],
  endTitle: 'Shubho Bhai Phota! 🪔',
  endMessage: 'To my dearest {B},\nmay you live long, stay happy forever,\nand one day upgrade from the ₹5 cream biscuit 😜\n\nLove you always!\n— {S}',
};

// =====================================================================
const params = new URLSearchParams(location.search);
const AUTO = params.has('auto');           // auto-advance dialogue (testing)
const fmt = s => s.replaceAll('{B}', CONFIG.brother).replaceAll('{S}', CONFIG.sister);
const $ = id => document.getElementById(id);
const L = window.LAYOUT;
const V = (x, y, z = 0) => new THREE.Vector3(x, z, -y);              // Blender XY(Z) -> three XYZ
const toRect = r => ({ minX: r[0], maxX: r[1], minZ: -r[3], maxZ: -r[2], disabled: false });
const blockers = L.blockers.map(toRect);
const gateBlocker = toRect(L.gate.blocker);
blockers.push(gateBlocker);
const easeInOut = k => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
const easeOut = k => 1 - Math.pow(1 - k, 3);
const lerp = (a, b, k) => a + (b - a) * k;

// ---------------------------------------------------------------- renderer, scene
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: AUTO });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xf3dccb, 45, 120);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 500);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
  uniforms: { top: { value: new THREE.Color('#6fa9e6') }, mid: { value: new THREE.Color('#bcdcf7') },
              bottom: { value: new THREE.Color('#ffe2c4') } },
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP;
    void main(){ float h = vP.y; vec3 c = mix(mid, top, smoothstep(0.05, 0.7, h)); c = mix(bottom, c, smoothstep(-0.02, 0.18, h));
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
    }`,
}));
scene.add(sky);

scene.add(new THREE.HemisphereLight(0xe6eeff, 0xc9a98a, 1.15));
const sun = new THREE.DirectionalLight(0xffe2ba, 2.5);
sun.position.copy(V(-11, -21, 15));
sun.target.position.copy(V(0, 6, 0));
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 70 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

// ---------------------------------------------------------------- small helpers
const stdMat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...o });
function add(parent, geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}
function limb(radius, length, mat) {
  const pivot = new THREE.Group();
  add(pivot, new THREE.CapsuleGeometry(radius, Math.max(0.01, length - 2 * radius), 4, 10), mat, 0, -length / 2, 0);
  pivot.rotation.order = 'YXZ';
  return pivot;
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function textSprite(text, color = '#6d4fa3') {
  const tex = canvasTex(512, 128, (g, w, h) => {
    g.font = '800 64px "Baloo Da 2", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const tw = g.measureText(text).width + 60;
    g.fillStyle = 'rgba(255,248,236,0.95)';
    g.beginPath(); g.roundRect((w - tw) / 2, 18, tw, h - 36, 40); g.fill();
    g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 4);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(1.6, 0.4, 1);
  s.renderOrder = 10;
  return s;
}
const glowTex = canvasTex(64, 64, (g, w) => {
  const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(0.3, 'rgba(255,220,140,0.8)'); gr.addColorStop(1, 'rgba(255,200,100,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
});
const heartTex = canvasTex(128, 128, (g, w) => {
  g.font = '100px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('❤️', w / 2, w / 2 + 6);
});

// ---------------------------------------------------------------- characters
function headBase(head, skin) {
  add(head, new THREE.CylinderGeometry(0.08, 0.09, 0.14, 10), skin, 0, 0.02, 0);
  add(head, new THREE.SphereGeometry(0.34, 32, 24), skin, 0, 0.33, 0);
  for (const sx of [-1, 1]) add(head, new THREE.SphereGeometry(0.065, 10, 8), skin, sx * 0.33, 0.31, 0);
}

function makeBrother() {
  const skin = stdMat('#c58b66'), shirt = stdMat('#1c1c22', { roughness: 0.9 }), jeans = stdMat('#34425f');
  const shoe = stdMat('#f1f1ee'), hair = stdMat('#151012', { roughness: 0.6 }), gold = stdMat('#e2a531');
  const c = { kind: 'brother', root: new THREE.Group(), body: new THREE.Group(), t: 0, phase: 0, idle: 0,
              pose: 'cross', sitting: false, targetYaw: 0 };
  c.root.add(c.body);
  c.legL = limb(0.085, 0.55, jeans); c.legR = limb(0.085, 0.55, jeans);
  c.legL.position.set(-0.1, 0.55, 0); c.legR.position.set(0.1, 0.55, 0);
  for (const leg of [c.legL, c.legR]) {
    add(leg, new THREE.SphereGeometry(0.1, 12, 8), shoe, 0, -0.53, 0.05).scale.set(1, 0.55, 1.5);
    c.body.add(leg);
  }
  add(c.body, new THREE.CapsuleGeometry(0.25, 0.28, 4, 14), shirt, 0, 0.82, 0).scale.set(1, 1, 0.78);
  add(c.body, new THREE.BoxGeometry(0.07, 0.035, 0.02), gold, 0.11, 0.93, 0.2);
  c.armL = limb(0.072, 0.46, skin); c.armR = limb(0.072, 0.46, skin);
  c.armL.position.set(-0.31, 1.0, 0); c.armR.position.set(0.31, 1.0, 0);
  for (const arm of [c.armL, c.armR]) {
    add(arm, new THREE.CylinderGeometry(0.1, 0.095, 0.22, 12), shirt, 0, -0.08, 0);
    add(arm, new THREE.SphereGeometry(0.075, 10, 8), skin, 0, -0.45, 0);
    c.body.add(arm);
  }
  const head = c.head = new THREE.Group();
  head.position.set(0, 1.08, 0);
  c.body.add(head);
  headBase(head, skin);
  const cap = add(head, new THREE.SphereGeometry(0.356, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.42), hair, 0, 0.35, -0.03);
  cap.rotation.x = -0.28;
  add(head, new THREE.SphereGeometry(0.17, 16, 12), hair, 0, 0.62, 0.1).scale.set(1.45, 0.72, 1.15);  // styled-up quiff
  for (const sx of [-1, 1]) add(head, new THREE.SphereGeometry(0.035, 10, 8), stdMat('#151515'), sx * 0.12, 0.33, 0.31);
  const lens = new THREE.MeshStandardMaterial({ color: '#2b2f3c', roughness: 0.08, metalness: 0.5, transparent: true, opacity: 0.75 });
  const frame = stdMat('#0c0c0f', { roughness: 0.35 });
  for (const sx of [-1, 1]) {
    const l = add(head, new THREE.CylinderGeometry(0.1, 0.1, 0.015, 24), lens, sx * 0.125, 0.32, 0.335);
    l.rotation.x = Math.PI / 2; l.scale.set(1.08, 1, 0.92);
    add(head, new THREE.TorusGeometry(0.1, 0.014, 8, 28), frame, sx * 0.125, 0.32, 0.34).scale.set(1.08, 0.92, 1);
    const tmp = add(head, new THREE.BoxGeometry(0.014, 0.014, 0.3), frame, sx * 0.245, 0.35, 0.2);
    tmp.rotation.y = sx * 0.12;
  }
  add(head, new THREE.BoxGeometry(0.06, 0.016, 0.016), frame, 0, 0.37, 0.345);
  add(head, new THREE.CapsuleGeometry(0.022, 0.13, 4, 8), hair, 0, 0.19, 0.318).rotation.z = Math.PI / 2;  // moustache
  add(head, new THREE.SphereGeometry(0.075, 12, 10), hair, 0, 0.08, 0.27).scale.set(0.95, 1.1, 0.6);      // goatee
  add(head, new THREE.SphereGeometry(0.344, 24, 12, Math.PI * 0.12, Math.PI * 0.76, Math.PI * 0.6, Math.PI * 0.24),
      stdMat('#2a1d18', { transparent: true, opacity: 0.3 }), 0, 0.33, 0);                               // beard shadow
  c.forehead = new THREE.Object3D(); c.forehead.position.set(0, 0.47, 0.31); head.add(c.forehead);
  c.mouth = new THREE.Object3D(); c.mouth.position.set(0, 0.14, 0.33); head.add(c.mouth);
  c.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return c;
}

function makeSister() {
  const skin = stdMat('#d8a37e'), hair = stdMat('#22140f', { roughness: 0.55 }), pink = stdMat('#e8b4be');
  const floral = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#9d9bd6'; g.fillRect(0, 0, w, h);
    const cols = ['#e3a63c', '#ef8d3b', '#f6f2fb', '#c3d5f4', '#e3a63c'];
    for (let i = 0; i < 140; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 3 + Math.random() * 4;
      g.fillStyle = cols[i % cols.length];
      for (let p = 0; p < 5; p++) {
        const a = p * Math.PI * 2 / 5;
        g.beginPath(); g.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.65, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = '#7a4a2a'; g.beginPath(); g.arc(x, y, r * 0.4, 0, Math.PI * 2); g.fill();
    }
  });
  floral.wrapS = floral.wrapT = THREE.RepeatWrapping;
  floral.repeat.set(2, 1.5);
  const dress = stdMat('#ffffff', { map: floral, roughness: 0.85 });
  const c = { kind: 'sister', root: new THREE.Group(), body: new THREE.Group(), t: 0, phase: 0, idle: 0,
              pose: 'wave', sitting: false, targetYaw: 0 };
  c.root.add(c.body);
  c.legL = limb(0.07, 0.55, skin); c.legR = limb(0.07, 0.55, skin);
  c.legL.position.set(-0.09, 0.55, 0); c.legR.position.set(0.09, 0.55, 0);
  for (const leg of [c.legL, c.legR]) {
    add(leg, new THREE.SphereGeometry(0.085, 12, 8), pink, 0, -0.53, 0.04).scale.set(1, 0.5, 1.5);
    c.body.add(leg);
  }
  add(c.body, new THREE.CylinderGeometry(0.23, 0.42, 0.46, 28), dress, 0, 0.5, 0);           // flared skirt
  add(c.body, new THREE.CylinderGeometry(0.2, 0.23, 0.36, 24), dress, 0, 0.88, 0);           // smocked bodice
  add(c.body, new THREE.SphereGeometry(0.215, 20, 12), dress, 0, 1.03, 0).scale.set(1.05, 0.45, 0.85);
  const strap = add(c.body, new THREE.BoxGeometry(0.035, 0.66, 0.015), pink, 0.0, 0.83, 0.215);
  strap.rotation.z = 0.62;
  add(c.body, new RoundedBoxGeometry(0.17, 0.13, 0.06, 2, 0.02), pink, 0.27, 0.56, 0.12);   // little bag
  c.armL = limb(0.064, 0.44, skin); c.armR = limb(0.064, 0.44, skin);
  c.armL.position.set(-0.28, 1.0, 0); c.armR.position.set(0.28, 1.0, 0);
  for (const arm of [c.armL, c.armR]) {
    add(arm, new THREE.SphereGeometry(0.105, 14, 10), dress, 0, -0.05, 0);                  // puff sleeve
    add(arm, new THREE.SphereGeometry(0.068, 10, 8), skin, 0, -0.43, 0);
    c.body.add(arm);
  }
  const head = c.head = new THREE.Group();
  head.position.set(0, 1.08, 0);
  c.body.add(head);
  headBase(head, skin);
  add(head, new THREE.SphereGeometry(0.358, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.45), hair, 0, 0.34, -0.02).rotation.x = -0.18;
  add(head, new RoundedBoxGeometry(0.64, 1.0, 0.2, 3, 0.08), hair, 0, -0.06, -0.19);         // long straight hair
  for (const sx of [-1, 1]) {
    add(head, new THREE.CapsuleGeometry(0.06, 0.5, 4, 10), hair, sx * 0.31, 0.05, 0.0).scale.set(1, 1, 0.8);
  }
  add(head, new THREE.BoxGeometry(0.014, 0.012, 0.32), stdMat('#5a3a2c'), 0, 0.705, 0.04).rotation.x = 0.35;  // centre parting
  const eye = stdMat('#1a1210'), white = stdMat('#ffffff', { roughness: 0.3 });
  for (const sx of [-1, 1]) {
    add(head, new THREE.SphereGeometry(0.042, 12, 10), eye, sx * 0.12, 0.34, 0.3);
    add(head, new THREE.SphereGeometry(0.013, 8, 6), white, sx * 0.12 + 0.012, 0.355, 0.338);
    add(head, new THREE.BoxGeometry(0.085, 0.016, 0.01), eye, sx * 0.125, 0.43, 0.31).rotation.z = -sx * 0.12;
    add(head, new THREE.CircleGeometry(0.045, 16), stdMat('#f08f9a', { transparent: true, opacity: 0.45 }), sx * 0.2, 0.25, 0.285)
      .rotation.y = sx * 0.55;
  }
  const smile = add(head, new THREE.TorusGeometry(0.055, 0.012, 6, 14, Math.PI), stdMat('#a63f45'), 0, 0.2, 0.322);
  smile.rotation.z = Math.PI;
  c.hand = new THREE.Object3D(); c.hand.position.set(0, -0.43, 0); c.armR.add(c.hand);
  c.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return c;
}

function setArm(arm, x, y, z, k) {
  arm.rotation.x = lerp(arm.rotation.x, x, k);
  arm.rotation.y = lerp(arm.rotation.y, y, k);
  arm.rotation.z = lerp(arm.rotation.z, z, k);
}

function animateChar(c, dt, move) {
  c.t += dt;
  let d = c.targetYaw - c.root.rotation.y;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  c.root.rotation.y += d * Math.min(1, dt * 10);
  const k = Math.min(1, dt * 10);
  if (c.sitting) {
    setArm(c.legL, -1.38, 0, 0, k); setArm(c.legR, -1.38, 0, 0, k);
    c.body.position.y = lerp(c.body.position.y, 0, k);
  } else if (move > 0) {
    c.phase += dt * 10 * (0.65 + move * 0.5);
    const s = Math.sin(c.phase);
    c.legL.rotation.x = s * 0.7 * move; c.legR.rotation.x = -s * 0.7 * move;
    c.body.position.y = Math.abs(Math.cos(c.phase)) * 0.05;
    c.idle = 0;
    if (c.pose !== 'manual') {
      setArm(c.armL, -s * 0.6 * move, 0, -0.12, 0.5); setArm(c.armR, s * 0.6 * move, 0, 0.12, 0.5);
    }
    return;
  } else {
    c.idle += dt;
    setArm(c.legL, 0, 0, 0, k); setArm(c.legR, 0, 0, 0, k);
    c.body.position.y = lerp(c.body.position.y, Math.sin(c.t * 2) * 0.008, k);
  }
  if (c.pose === 'manual') return;
  if (c.pose === 'cross' && c.idle > 0.4) {                 // Bhaiya's signature arms-crossed pose
    setArm(c.armL, -1.3, 0.95, 0, k * 0.6); setArm(c.armR, -1.45, -0.95, 0, k * 0.6);
  } else if (c.pose === 'wave') {
    setArm(c.armL, 0, 0, -0.12, k);
    setArm(c.armR, 0, 0, 2.55 + Math.sin(c.t * 9) * 0.35, k);
  } else if (c.pose === 'happy') {
    setArm(c.armL, 0, 0, -2.4 - Math.sin(c.t * 10) * 0.2, k); setArm(c.armR, 0, 0, 2.4 + Math.sin(c.t * 10) * 0.2, k);
  } else {
    setArm(c.armL, 0, 0, -0.12, k); setArm(c.armR, 0, 0, 0.12, k);
  }
}

// ---------------------------------------------------------------- props
const brass = stdMat('#d9a93e', { metalness: 0.8, roughness: 0.3 });
const clay = stdMat('#b5532e');
const flameMat = new THREE.MeshStandardMaterial({ color: '#ffb347', emissive: '#ff9a2e', emissiveIntensity: 3 });
const PROPS = {
  diya(g) {
    add(g, new THREE.CylinderGeometry(0.075, 0.045, 0.05, 14), clay, 0, 0.025, 0);
    add(g, new THREE.SphereGeometry(0.022, 10, 8), flameMat, 0, 0.085, 0).scale.set(1, 1.9, 1);
  },
  chandan(g) {
    add(g, new THREE.CylinderGeometry(0.07, 0.05, 0.05, 16), brass, 0, 0.025, 0);
    add(g, new THREE.SphereGeometry(0.062, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), stdMat('#f3e2bf'), 0, 0.04, 0).scale.y = 0.4;
  },
  kajal(g) {
    add(g, new THREE.CylinderGeometry(0.035, 0.05, 0.07, 14), brass, 0, 0.035, 0);
    add(g, new THREE.CylinderGeometry(0.045, 0.045, 0.012, 14), stdMat('#111'), 0, 0.075, 0);
    add(g, new THREE.TorusGeometry(0.035, 0.007, 6, 14, Math.PI), brass, 0.06, 0.04, 0).rotation.z = -Math.PI / 2;
  },
  dhaan_durbo(g) {
    add(g, new THREE.CircleGeometry(0.08, 14), stdMat('#5c9a3f', { side: THREE.DoubleSide }), 0, 0.005, 0).rotation.x = -Math.PI / 2;
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2;
      const b = add(g, new THREE.ConeGeometry(0.007, 0.13, 4), stdMat('#58b047'), Math.cos(a) * 0.02, 0.07, Math.sin(a) * 0.02);
      b.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
    }
    for (let i = 0; i < 10; i++) add(g, new THREE.SphereGeometry(0.009, 6, 4), stdMat('#e6b43c'),
      (Math.random() - 0.5) * 0.09, 0.012, (Math.random() - 0.5) * 0.09).scale.set(1, 0.6, 1.6);
  },
  mishti(g) {
    add(g, new THREE.CylinderGeometry(0.075, 0.06, 0.06, 14), clay, 0, 0.03, 0);
    for (const [x, z] of [[-0.03, 0], [0.03, 0.01], [0, -0.03], [0.0, 0.03]])
      add(g, new THREE.SphereGeometry(0.03, 12, 10), stdMat('#fbf7ee', { roughness: 0.4 }), x, 0.075, z);
  },
};
function makeThala() {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.21, 0.19, 0.022, 32), brass, 0, 0, 0);
  const spots = { diya: [0, 0.011, -0.1], chandan: [-0.1, 0.011, 0.03], kajal: [0.1, 0.011, 0.03],
                  dhaan_durbo: [-0.04, 0.011, 0.12], mishti: [0.07, 0.011, 0.12] };
  g.userData.parts = {};
  for (const [id, p] of Object.entries(spots)) {
    const s = new THREE.Group(); s.position.set(...p); PROPS[id](s); g.add(s); g.userData.parts[id] = s;
  }
  const light = new THREE.PointLight(0xffa64d, 0, 3, 2);
  light.position.set(0, 0.15, -0.1);
  g.add(light);
  g.userData.light = light;
  return g;
}
function makeBiscuit() {
  const g = new THREE.Group();
  add(g, new RoundedBoxGeometry(0.22, 0.1, 0.07, 2, 0.02), stdMat('#e43d3d'), 0, 0, 0);
  add(g, new THREE.BoxGeometry(0.225, 0.03, 0.075), stdMat('#ffd23a'), 0, 0, 0);
  return g;
}
function makeGift() {
  const g = new THREE.Group();
  add(g, new RoundedBoxGeometry(0.3, 0.24, 0.3, 2, 0.03), stdMat('#7b5bd6'), 0, 0, 0);
  const rib = stdMat('#ffcf3a', { metalness: 0.3, roughness: 0.4 });
  add(g, new THREE.BoxGeometry(0.31, 0.25, 0.05), rib, 0, 0, 0);
  add(g, new THREE.BoxGeometry(0.05, 0.25, 0.31), rib, 0, 0, 0);
  for (const s of [-1, 1]) add(g, new THREE.TorusGeometry(0.05, 0.016, 8, 16), rib, s * 0.045, 0.16, 0).rotation.y = s * 0.6;
  return g;
}

// ---------------------------------------------------------------- particles
const particles = [];
const petalMats = ['#ff9f1c', '#ffd23a', '#ff7b1c'].map(c => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
const petalGeo = new THREE.PlaneGeometry(0.07, 0.045);
function spawn(obj, pos, vel, life, opts = {}) {
  obj.position.copy(pos);
  scene.add(obj);
  particles.push({ obj, vel, life, max: life, spin: opts.spin || 0, grav: opts.grav ?? 0, drag: opts.drag ?? 0, s0: obj.scale.x });
}
function petals(center, n = 120, spread = 2.5) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(petalGeo, petalMats[i % 3]);
    m.rotation.set(Math.random() * 6, Math.random() * 6, 0);
    const p = center.clone().add(new THREE.Vector3((Math.random() - 0.5) * spread, 2 + Math.random() * 1.5, (Math.random() - 0.5) * spread));
    spawn(m, p, new THREE.Vector3((Math.random() - 0.5) * 0.4, -0.5 - Math.random() * 0.5, (Math.random() - 0.5) * 0.4),
      4 + Math.random() * 2, { spin: 3 });
  }
}
function sparkles(center, n = 18, color = 0xffe08a, size = 0.18) {
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.scale.setScalar(size * (0.6 + Math.random()));
    const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize();
    spawn(s, center, dir.multiplyScalar(1 + Math.random() * 1.5), 0.6 + Math.random() * 0.5, { drag: 2.5 });
  }
}
function hearts(center, n = 8) {
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthWrite: false }));
    s.scale.setScalar(0.22 + Math.random() * 0.12);
    spawn(s, center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6)),
      new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.7 + Math.random() * 0.5, 0), 1.6 + Math.random());
  }
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    p.vel.y -= p.grav * dt;
    if (p.drag) p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
    p.obj.position.addScaledVector(p.vel, dt);
    if (p.spin) { p.obj.rotation.x += p.spin * dt; p.obj.rotation.y += p.spin * 0.7 * dt; }
    const k = p.life / p.max;
    if (k < 0.3) p.obj.scale.setScalar(p.s0 * k / 0.3);
    if (p.life <= 0) { scene.remove(p.obj); particles.splice(i, 1); }
  }
}

// ---------------------------------------------------------------- sound (tiny synth, no files needed)
let actx = null;
function ac() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
function tone(freq, t0, dur, type = 'sine', vol = 0.12) {
  const a = ac(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.05);
}
const SFX = {
  ding() { const a = ac(); if (!a) return; const t = a.currentTime; tone(880, t, 0.3); tone(1318, t + 0.08, 0.4); },
  pop() { const a = ac(); if (!a) return; tone(520, a.currentTime, 0.15, 'triangle', 0.1); },
  chime() { const a = ac(); if (!a) return; const t = a.currentTime; [523, 659, 784, 1046].forEach((f, i) => tone(f, t + i * 0.12, 0.6)); },
  gate() { const a = ac(); if (!a) return; const t = a.currentTime; tone(180, t, 0.5, 'sawtooth', 0.04); tone(140, t + 0.25, 0.6, 'sawtooth', 0.03); },
  shankh() {                                      // conch: buzzy horn with slow swell
    const a = ac(); if (!a) return;
    const t = a.currentTime, o = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain();
    const lfo = a.createOscillator(), lg = a.createGain();
    o.type = 'sawtooth'; o.frequency.value = 233; f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 4;
    lfo.frequency.value = 5; lg.gain.value = 3; lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.13, t + 0.45); g.gain.setValueAtTime(0.13, t + 1.7);
    g.gain.linearRampToValueAtTime(0, t + 2.3);
    o.connect(f).connect(g).connect(a.destination); o.start(t); lfo.start(t); o.stop(t + 2.4); lfo.stop(t + 2.4);
  },
  ulu() {                                         // ulu-dhwani: fast warbling trill
    const a = ac(); if (!a) return;
    const t = a.currentTime + 0.4, o = a.createOscillator(), g = a.createGain(), lfo = a.createOscillator(), lg = a.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(900, t); o.frequency.linearRampToValueAtTime(1050, t + 1.8);
    lfo.type = 'sine'; lfo.frequency.value = 13; lg.gain.value = 170; lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.07, t + 0.1); g.gain.setValueAtTime(0.07, t + 1.7);
    g.gain.linearRampToValueAtTime(0, t + 2.0);
    o.connect(g).connect(a.destination); o.start(t); lfo.start(t); o.stop(t + 2.1); lfo.stop(t + 2.1);
  },
};

// ---------------------------------------------------------------- UI
let dlgResolve = null, dlgFull = '', dlgShown = 0;
function say(who, text) {
  return new Promise(res => {
    const isS = who === 'S';
    $('dlgName').textContent = isS ? CONFIG.sister : CONFIG.brother;
    $('dlgAvatar').textContent = isS ? '👧🏻' : '😎';
    $('dlgAvatar').style.background = isS ? '#d9c8f2' : '#3a3a44';
    dlgFull = fmt(text); dlgShown = 0;
    $('dlgText').textContent = '';
    $('dialog').classList.add('show');
    dlgResolve = res;
    if (AUTO) setTimeout(() => { dlgShown = dlgFull.length; advance(); }, 700);
  });
}
async function sayAll(lines) { for (const [w, t] of lines) await say(w, t); }
function advance() {
  if (!dlgResolve) return;
  if (dlgShown < dlgFull.length) { dlgShown = dlgFull.length; $('dlgText').textContent = dlgFull; return; }
  const r = dlgResolve; dlgResolve = null;
  $('dialog').classList.remove('show');
  r();
}
$('dialog').addEventListener('pointerdown', e => { e.stopPropagation(); advance(); });
let chantResolve = null;
function chant(bn, en) {
  return new Promise(res => {
    $('chant').querySelector('.bn').textContent = bn;
    $('chant').querySelector('.en').textContent = en;
    $('chant').classList.add('show');
    chantResolve = res;
    if (AUTO) setTimeout(closeChant, 700);
  });
}
function closeChant() { if (!chantResolve) return; const r = chantResolve; chantResolve = null; $('chant').classList.remove('show'); r(); }
$('chant').addEventListener('pointerdown', e => { e.stopPropagation(); closeChant(); });
function choose(options) {
  return new Promise(res => {
    const box = $('choice');
    box.innerHTML = '';
    options.forEach((label, i) => {
      const b = document.createElement('button');
      b.textContent = fmt(label);
      b.addEventListener('pointerdown', e => { e.stopPropagation(); box.classList.remove('show'); res(i); });
      box.appendChild(b);
    });
    box.classList.add('show');
    if (AUTO) setTimeout(() => { box.classList.remove('show'); res(chooseAutoIdx++ % 2 === 0 ? 0 : 1); }, 800);
  });
}
let chooseAutoIdx = 0;
let toastTimer = 0;
function toast(text, ms = 3200) {
  const t = $('toast');
  t.textContent = fmt(text);
  t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  toastTimer = ms / 1000;
}
function setObjective(text) { $('objective').textContent = fmt(text); }

// ---------------------------------------------------------------- input
const keys = new Set();
addEventListener('keydown', e => {
  keys.add(e.code);
  if (e.code === 'Space' || e.code === 'Enter') { advance(); closeChant(); }
});
addEventListener('keyup', e => keys.delete(e.code));
const joy = { id: null, x: 0, y: 0, cx: 0, cy: 0 };
const drag = { id: null, x: 0 };
const camState = { yaw: 0, dist: 8.5, height: 6.0 };
canvas.addEventListener('pointerdown', e => {
  ac();
  if (e.pointerType === 'touch' && e.clientX < innerWidth * 0.5 && joy.id === null) {
    joy.id = e.pointerId; joy.cx = e.clientX; joy.cy = e.clientY; joy.x = joy.y = 0;
    const s = $('stick'); s.style.display = 'block'; s.style.left = (e.clientX - 60) + 'px'; s.style.top = (e.clientY - 60) + 'px';
    $('knob').style.transform = 'translate(0px, 0px)';
  } else if (drag.id === null) {
    drag.id = e.pointerId; drag.x = e.clientX;
  }
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerId === joy.id) {
    let dx = e.clientX - joy.cx, dy = e.clientY - joy.cy;
    const d = Math.hypot(dx, dy), m = 50;
    if (d > m) { dx *= m / d; dy *= m / d; }
    joy.x = dx / m; joy.y = -dy / m;
    $('knob').style.transform = `translate(${dx}px, ${dy}px)`;
  } else if (e.pointerId === drag.id) {
    camState.yaw -= (e.clientX - drag.x) * 0.008;
    drag.x = e.clientX;
  }
});
function release(e) {
  if (e.pointerId === joy.id) { joy.id = null; joy.x = joy.y = 0; $('stick').style.display = 'none'; }
  if (e.pointerId === drag.id) drag.id = null;
}
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('wheel', e => {
  const f = Math.exp(e.deltaY * 0.001);
  camState.dist = Math.min(16, Math.max(4.5, camState.dist * f));
  camState.height = Math.min(11, Math.max(3.2, camState.height * f));
}, { passive: true });
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// ---------------------------------------------------------------- world state
let mode = 'loading';            // loading | title | intro | play | ceremony | end | roam
let world = null;
const fadeables = [];
const gatePivots = [];
let gateOpen = false;
const player = makeBrother();
const sister = makeSister();
scene.add(player.root, sister.root);
const sisterLabel = textSprite(CONFIG.sister);
sister.root.add(sisterLabel);
sisterLabel.position.set(0, 2.15, 0);
const items = [];
let collected = 0;
const guide = new THREE.Mesh(
  new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0.32), new THREE.Vector2(-0.2, -0.08), new THREE.Vector2(0, 0.02), new THREE.Vector2(0.2, -0.08)])).rotateX(Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xffa51f, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
scene.add(guide);
guide.visible = false;

const swing = L.swing;
function placeAt(c, x, y, faceYaw, sitting = false) {
  c.root.position.copy(V(x, y, sitting ? swing[2] - 0.55 : 0));
  c.root.rotation.y = c.targetYaw = faceYaw;
  c.sitting = sitting;
}

function buildItems() {
  for (const it of L.items) {
    const g = new THREE.Group();
    g.position.copy(V(it.x, it.y, 0));
    const model = new THREE.Group();
    PROPS[it.id](model);
    model.scale.setScalar(2.6);
    model.position.y = 0.75;
    g.add(model);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.45, 7, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 3.5;
    g.add(beam);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.55, 32),
      new THREE.MeshBasicMaterial({ color: 0xffb340, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
    g.add(ring);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
    glow.scale.setScalar(1.1); glow.position.y = 0.85;
    g.add(glow);
    scene.add(g);
    items.push({ id: it.id, group: g, model, got: false, t: Math.random() * 6 });
  }
  const slots = $('slots');
  for (const it of items) {
    const d = document.createElement('div');
    d.className = 'slot'; d.id = 'slot_' + it.id; d.textContent = CONFIG.items[it.id].icon;
    d.title = CONFIG.items[it.id].name;
    slots.appendChild(d);
  }
}

// ---------------------------------------------------------------- tweens
const tweens = [];
function tween(dur, fn, ease = easeInOut) { return new Promise(res => tweens.push({ t: 0, dur, fn, ease, res })); }
const wait = s => tween(s, () => {});
function updateTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.dur);
    tw.fn(tw.ease(k), k);
    if (k >= 1) { tweens.splice(i, 1); tw.res(); }
  }
}

// ---------------------------------------------------------------- camera
const camLook = new THREE.Vector3();
const cut = { active: false, pos: new THREE.Vector3(), look: new THREE.Vector3(), speed: 2.5 };
function cutTo(pos, look, speed = 2.5) { cut.active = true; cut.pos.copy(pos); cut.look.copy(look); cut.speed = speed; }
function updateCamera(dt) {
  if (cut.active) {
    const k = 1 - Math.exp(-cut.speed * dt);
    camera.position.lerp(cut.pos, k);
    camLook.lerp(cut.look, k);
  } else {
    if (keys.has('KeyQ')) camState.yaw += 1.8 * dt;
    if (keys.has('KeyE')) camState.yaw -= 1.8 * dt;
    const p = player.root.position;
    const target = new THREE.Vector3(p.x + Math.sin(camState.yaw) * camState.dist, p.y + camState.height, p.z + Math.cos(camState.yaw) * camState.dist);
    const k = 1 - Math.exp(-6 * dt);
    camera.position.lerp(target, k);
    camLook.lerp(new THREE.Vector3(p.x, p.y + 1.0, p.z), 1 - Math.exp(-10 * dt));
  }
  camera.lookAt(camLook);
  sky.position.copy(camera.position);
}

// fade whatever stands between the camera and the characters
const ray = new THREE.Raycaster();
let occFrame = 0;
function updateOcclusion() {
  if (!world) return;
  if (++occFrame % 3 === 0) {
    for (const f of fadeables) f.target = 1;
    const targets = [player.root.position.clone().add(new THREE.Vector3(0, 1.1, 0))];
    if (mode === 'ceremony') targets.push(sister.root.position.clone().add(new THREE.Vector3(0, 1.1, 0)));
    for (const t of targets) {
      const dir = t.clone().sub(camera.position);
      const dist = dir.length();
      ray.set(camera.position, dir.normalize());
      ray.far = dist - 0.4;
      for (const h of ray.intersectObjects(fadeables.map(f => f.obj), true)) {
        let o = h.object;
        while (o && !o.userData.fade) o = o.parent;
        if (o) o.userData.fade.target = 0.15;
      }
    }
  }
  for (const f of fadeables) {
    if (Math.abs(f.opacity - f.target) < 0.01) continue;
    f.opacity += (f.target - f.opacity) * 0.2;
    if (Math.abs(f.opacity - f.target) < 0.01) f.opacity = f.target;
    const transparent = f.opacity < 0.99;
    for (const m of f.mats) {
      if (m.transparent !== transparent) { m.transparent = transparent; m.depthWrite = !transparent; m.needsUpdate = true; }
      m.opacity = f.opacity;
    }
  }
}

// ---------------------------------------------------------------- movement + collision
const RADIUS = 0.3;
function collide(p) {
  for (const b of blockers) {
    if (b.disabled) continue;
    const cx = Math.max(b.minX, Math.min(p.x, b.maxX)), cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
    const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= RADIUS * RADIUS) continue;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      p.x = cx + dx / d * RADIUS; p.z = cz + dz / d * RADIUS;
    } else {
      const pen = [p.x - b.minX, b.maxX - p.x, p.z - b.minZ, b.maxZ - p.z];
      const i = pen.indexOf(Math.min(...pen));
      if (i === 0) p.x = b.minX - RADIUS; else if (i === 1) p.x = b.maxX + RADIUS;
      else if (i === 2) p.z = b.minZ - RADIUS; else p.z = b.maxZ + RADIUS;
    }
  }
  const [x0, x1, y0, y1] = L.bounds;
  p.x = Math.min(x1, Math.max(x0, p.x));
  p.z = Math.min(-y0, Math.max(-y1, p.z));
}
function updatePlayer(dt) {
  let ix = 0, iy = 0;
  const canMove = mode === 'play' || mode === 'roam';
  if (canMove) {
    if (keys.has('KeyW') || keys.has('ArrowUp')) iy += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) iy -= 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
    ix += joy.x; iy += joy.y;
  }
  const len = Math.hypot(ix, iy);
  if (len > 1) { ix /= len; iy /= len; }
  const amt = Math.min(1, len);
  if (amt > 0.08) {
    const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight')) ? 5.5 : 3.6;
    const fx = -Math.sin(camState.yaw), fz = -Math.cos(camState.yaw);
    const rx = Math.cos(camState.yaw), rz = -Math.sin(camState.yaw);
    const mx = (fx * iy + rx * ix) * speed * dt, mz = (fz * iy + rz * ix) * speed * dt;
    const p = player.root.position;
    p.x += mx; collide(p);
    p.z += mz; collide(p);
    player.targetYaw = Math.atan2(mx, mz);
    animateChar(player, dt, amt);
  } else {
    animateChar(player, dt, 0);
  }
}

// ---------------------------------------------------------------- gameplay
function nearestTarget() {
  if (collected >= items.length) return sister.root.position;
  let best = null, bd = Infinity;
  for (const it of items) {
    if (it.got) continue;
    const d = it.group.position.distanceToSquared(player.root.position);
    if (d < bd) { bd = d; best = it.group.position; }
  }
  return best;
}
function updateGameplay(dt) {
  for (const it of items) {
    if (!it.group.visible) continue;
    it.t += dt;
    it.model.rotation.y += dt * 1.4;
    it.model.position.y = 0.75 + Math.sin(it.t * 2.2) * 0.08;
    if (!it.got && mode === 'play' && it.group.position.distanceTo(player.root.position) < 1.05) collect(it);
  }
  const gc = V(L.gate.center[0], L.gate.center[1]);
  if (!gateOpen && (mode === 'play' || mode === 'roam') && gc.distanceTo(player.root.position) < 3.0) openGate();
  // sister waits by the swing, waving when Bhaiya is near
  if (mode === 'play' || mode === 'roam') {
    const toP = player.root.position.clone().sub(sister.root.position);
    const near = toP.length() < 9;
    sister.pose = near ? 'wave' : 'rest';
    if (near) sister.targetYaw = Math.atan2(toP.x, toP.z);
    if (mode === 'play' && collected >= items.length && toP.length() < 2.3) startCeremony();
  }
  animateChar(sister, dt, 0);
  sisterLabel.visible = mode === 'play' || mode === 'roam';
  // guide arrow
  const tgt = mode === 'play' ? nearestTarget() : null;
  guide.visible = !!tgt;
  if (tgt) {
    const d = tgt.clone().sub(player.root.position); d.y = 0;
    const dist = d.length();
    d.normalize();
    guide.position.copy(player.root.position).addScaledVector(d, 1.0); guide.position.y = 0.06;
    guide.rotation.y = Math.atan2(d.x, d.z);
    guide.material.opacity = dist < 2 ? 0.25 : 0.85;
  }
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('toast').classList.remove('show'); }
  if (dlgResolve && dlgShown < dlgFull.length) {
    dlgShown = Math.min(dlgFull.length, dlgShown + dt * 45);
    $('dlgText').textContent = dlgFull.slice(0, Math.floor(dlgShown));
  }
}
function collect(it) {
  it.got = true;
  collected++;
  SFX.ding();
  sparkles(it.group.position.clone().add(new THREE.Vector3(0, 0.8, 0)), 24);
  const s0 = it.group.scale.x;
  tween(0.35, k => it.group.scale.setScalar(s0 * (1 - k))).then(() => { it.group.visible = false; });
  $('slot_' + it.id).classList.add('got');
  toast(CONFIG.items[it.id].line);
  if (collected >= items.length) {
    setObjective('Go to {S} at the swing in the backyard 🪢');
    setTimeout(() => { if (mode === 'play') toast(CONFIG.allFound, 4000); }, 3300);
  } else {
    setObjective(`Find the phota things: ${collected} / ${items.length}`);
  }
}
function openGate() {
  gateOpen = true;
  gateBlocker.disabled = true;
  SFX.gate();
  toast(CONFIG.gateOpen, 2200);
  const [pl, pr] = gatePivots;
  tween(1.4, k => { if (pl) pl.rotation.y = 1.75 * k; if (pr) pr.rotation.y = -1.75 * k; });
}

// ---------------------------------------------------------------- the phota ceremony
let ceremonyStarted = false;
async function startCeremony() {
  if (ceremonyStarted) return;
  ceremonyStarted = true;
  mode = 'ceremony';
  $('hud').classList.remove('show');
  $('toast').classList.remove('show');
  guide.visible = false;
  const [sx, sy] = swing;
  // a quick fade-cut onto the swing
  placeAt(player, sx, sy + 0.02, 0, true);
  player.pose = 'rest';
  placeAt(sister, sx - 0.35, sy - 0.8, 0);
  const toB = player.root.position.clone().sub(sister.root.position);
  sister.root.rotation.y = sister.targetYaw = Math.atan2(toB.x, toB.z);
  player.root.rotation.y = player.targetYaw = Math.atan2(-toB.x, -toB.z) * 0.6;
  sister.pose = 'manual';
  setArm(sister.armL, 0, 0, -0.12, 1); setArm(sister.armR, 0, 0, 0.12, 1);
  scene.updateMatrixWorld(true);
  // cameras sit in front of the swing so its steel frame stays out of the shot
  const twoShot = [V(sx + 1.9, sy - 2.3, 1.6), V(sx - 0.15, sy - 0.4, 1.15)];
  const closeUp = [V(sx + 0.75, sy - 1.45, 1.6), V(sx - 0.05, sy - 0.05, 1.45)];
  const wide = [V(sx + 3.6, sy - 4.2, 2.8), V(sx - 0.1, sy - 0.4, 1.0)];
  camera.position.copy(twoShot[0]); camLook.copy(twoShot[1]);
  cutTo(...twoShot);
  await sayAll(CONFIG.ceremony.sit);

  // aarti: the thala circles in front of Bhaiya's face
  const thala = makeThala();
  scene.add(thala);
  const holdPos = sister.root.localToWorld(new THREE.Vector3(0, 0.85, 0.32));
  thala.position.copy(holdPos);
  setArm(sister.armL, -1.25, 0.35, 0, 1); setArm(sister.armR, -1.25, -0.35, 0, 1);
  thala.userData.light.intensity = 1.6;
  await sayAll(CONFIG.ceremony.aarti);
  const face = player.head.localToWorld(new THREE.Vector3(0, 0.3, 0));
  const center = face.clone().add(new THREE.Vector3(0, -0.15, 0.5));
  await tween(0.6, k => thala.position.lerpVectors(holdPos, center.clone().add(new THREE.Vector3(0, -0.22, 0)), k));
  await tween(3.2, (k, raw) => {
    const a = raw * Math.PI * 2 * 3 - Math.PI / 2;
    thala.position.set(center.x + Math.cos(a) * 0.22, center.y + Math.sin(a) * 0.22, center.z);
    thala.rotation.y = a * 0.1;
  }, k => k);
  SFX.chime();
  await tween(0.6, k => thala.position.lerpVectors(thala.position.clone(), holdPos, k));
  thala.userData.light.intensity = 0.6;

  // phota: two dots on Bhaiya's forehead while the chant is said
  cutTo(...closeUp, 3);
  await sayAll(CONFIG.ceremony.phota);
  const dots = [];
  const dotSpecs = [
    { color: '#f3e2bf', scale: [0.9, 1.6, 1], r: 0.032, offset: 0.0 },     // chandan
    { color: '#121212', scale: [1, 1, 1], r: 0.017, offset: 0.004 },       // kajal
  ];
  for (let i = 0; i < CONFIG.chant.length; i++) {
    const [bn, en] = CONFIG.chant[i];
    if (i === 0 || i === 2) {
      const spec = dotSpecs[i === 0 ? 0 : 1];
      await tween(0.7, k => setArm(sister.armR, -2.05, -0.25, 0.12, k));
      const from = sister.hand.getWorldPosition(new THREE.Vector3());
      const to = player.forehead.getWorldPosition(new THREE.Vector3());
      const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      spark.scale.setScalar(0.12);
      scene.add(spark);
      await tween(0.5, k => spark.position.lerpVectors(from, to, k));
      scene.remove(spark);
      const dot = new THREE.Mesh(new THREE.CircleGeometry(spec.r, 20), stdMat(spec.color, { roughness: 0.6 }));
      dot.position.z = spec.offset + 0.006;
      dot.scale.set(...spec.scale);
      player.forehead.add(dot);
      dots.push(dot);
      SFX.pop();
      sparkles(to, 10, 0xfff3c4, 0.1);
      tween(0.6, k => setArm(sister.armR, -1.25, -0.35, 0, k));
    }
    await chant(bn, en);
  }

  // dhaan-durbo sprinkled on his head
  cutTo(...twoShot);
  await sayAll(CONFIG.ceremony.durbo);
  const top = player.head.localToWorld(new THREE.Vector3(0, 0.75, 0));
  for (let i = 0; i < 26; i++) {
    const g = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), stdMat(i % 2 ? '#58b047' : '#e6b43c'));
    g.scale.set(1, 0.6, 2);
    spawn(g, top.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.3 + Math.random() * 0.3, (Math.random() - 0.5) * 0.4)),
      new THREE.Vector3(0, -0.4, 0), 1.6, { grav: 1.5, spin: 4 });
  }
  await wait(1.2);

  // shankh + ulu + marigold petals
  cutTo(...wide, 1.5);
  SFX.shankh(); SFX.ulu();
  petals(V(sx, sy - 0.5, 0), 160, 4);
  toast(CONFIG.ceremony.shankh, 2600);
  await wait(2.6);

  // mishti
  cutTo(...twoShot);
  await say(...CONFIG.ceremony.mishti[0]);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), stdMat('#fbf7ee', { roughness: 0.35 }));
  const ballFrom = thala.position.clone().add(new THREE.Vector3(0.07, 0.12, 0.12));
  const mouth = player.mouth.getWorldPosition(new THREE.Vector3());
  scene.add(ball);
  await tween(0.8, k => { ball.position.lerpVectors(ballFrom, mouth, k); ball.position.y += Math.sin(k * Math.PI) * 0.25; });
  scene.remove(ball);
  SFX.pop();
  await tween(0.8, (k, raw) => { player.head.rotation.x = Math.sin(raw * Math.PI * 4) * 0.12; });
  player.head.rotation.x = 0;
  for (let i = 1; i < CONFIG.ceremony.mishti.length; i++) await say(...CONFIG.ceremony.mishti[i]);
  scene.remove(thala);
  setArm(sister.armL, 0, 0, -0.12, 1); setArm(sister.armR, 0, 0, 0.12, 1);

  // the gift (Bhaiya chooses!)
  await sayAll(CONFIG.ceremony.askGift);
  let biscuits = 0;
  for (;;) {
    const pick = await choose([CONFIG.ceremony.choiceBiscuit, CONFIG.ceremony.choiceReal]);
    const obj = pick === 0 ? makeBiscuit() : makeGift();
    const fromP = player.root.localToWorld(new THREE.Vector3(0, 0.9, 0.35));
    const toP = sister.root.localToWorld(new THREE.Vector3(0, 0.95, 0.3));
    obj.position.copy(fromP);
    scene.add(obj);
    player.pose = 'manual';
    setArm(player.armL, -1.3, 0.3, 0, 1); setArm(player.armR, -1.3, -0.3, 0, 1);
    await tween(0.9, k => { obj.position.lerpVectors(fromP, toP, k); obj.position.y += Math.sin(k * Math.PI) * 0.3; obj.rotation.y = k * 4; });
    setArm(player.armL, 0, 0, -0.12, 1); setArm(player.armR, 0, 0, 0.12, 1);
    player.pose = 'rest';
    if (pick === 0) {
      biscuits++;
      await sayAll(biscuits === 1 ? CONFIG.ceremony.biscuit1 : CONFIG.ceremony.biscuit2);
      if (biscuits === 1) { scene.remove(obj); continue; }
      sister.pose = 'happy';
      hearts(toP, 6);
      await wait(1.0);
    } else {
      SFX.chime();
      sister.pose = 'happy';
      hearts(toP, 14);
      petals(V(sx, sy - 0.8, 0), 80, 2.5);
      const base = sister.root.position.y;
      tween(1.2, (k, raw) => { sister.root.position.y = base + Math.abs(Math.sin(raw * Math.PI * 3)) * 0.25; }, k => k);
      await sayAll(CONFIG.ceremony.real);
    }
    break;
  }
  player.sitting = false;
  placeAt(player, sx + 0.1, sy - 1.6, Math.PI * 0.1);
  placeAt(sister, sx - 0.6, sy - 1.55, -Math.PI * 0.1);
  player.pose = 'cross';
  cutTo(V(sx + 0.2, sy - 5.2, 1.8), V(sx - 0.25, sy - 1.5, 1.1), 2);
  await sayAll(CONFIG.ceremony.bye);
  hearts(sister.root.position.clone().add(new THREE.Vector3(0, 1.8, 0)), 10);
  petals(V(sx, sy - 1.5, 0), 140, 4);
  SFX.chime();
  await wait(1.2);
  mode = 'end';
  $('endTitle').textContent = fmt(CONFIG.endTitle);
  $('endMsg').textContent = fmt(CONFIG.endMessage);
  $('endcard').classList.add('show');
}

// ---------------------------------------------------------------- flow
$('againBtn').addEventListener('click', () => location.reload());
$('roamBtn').addEventListener('click', () => {
  $('endcard').classList.remove('show');
  cut.active = false;
  mode = 'roam';
  $('hint').style.display = 'block';
});

async function startGame() {
  $('title').classList.remove('show');
  ac();
  mode = 'intro';
  const s = L.start;
  placeAt(player, s[0], s[1], Math.PI);
  // fly-in over the house
  camera.position.copy(V(14, -20, 14));
  camLook.copy(V(0, 4, 2));
  cutTo(V(6, -14, 8), V(-1, 2, 2), 0.8);
  if (!params.has('skip')) {
    await wait(2.0);
    await sayAll(CONFIG.intro);
  }
  cut.active = false;
  camState.yaw = 0;
  mode = 'play';
  $('hud').classList.add('show');
  setObjective(`Find the phota things: 0 / ${items.length}`);
  $('hint').textContent = matchMedia('(pointer: coarse)').matches
    ? 'Left thumb: walk · Right thumb: turn camera'
    : 'WASD / arrows: walk · Shift: run · Drag or Q/E: turn camera';
  $('hint').style.display = 'block';
  if (params.has('phota')) {           // testing shortcut: jump straight to the ceremony
    for (const it of items) if (!it.got) collect(it);
    startCeremony();
  }
}
$('startBtn').addEventListener('click', startGame);

// ---------------------------------------------------------------- load the house
function b64ToBuffer(b64) {
  const bin = atob(b64), n = bin.length, bytes = new Uint8Array(n);
  for (let i = 0; i < n; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}
new GLTFLoader().parse(b64ToBuffer(window.HOUSE_GLB_B64), '', gltf => {
  world = gltf.scene;
  scene.add(world);
  const flat = new Set(['Ground', 'Yard_Floor', 'Alpona']);
  for (const top of [...world.children]) {
    const meshes = [];
    top.traverse(o => {
      if (!o.isMesh) return;
      o.receiveShadow = true;
      o.castShadow = !flat.has(top.name);
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) m.envMapIntensity = 0.35;
      meshes.push(o);
    });
    if (flat.has(top.name)) continue;
    const mats = [];
    for (const o of meshes) {
      o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
      mats.push(...(Array.isArray(o.material) ? o.material : [o.material]));
    }
    const f = { obj: top, mats, opacity: 1, target: 1 };
    top.userData.fade = f;
    fadeables.push(f);
  }
  // gate leaves swing on their hinges
  for (const [name, hinge] of [['Gate_Leaf_L', L.gate.hingeL], ['Gate_Leaf_R', L.gate.hingeR]]) {
    const leaf = world.getObjectByName(name);
    if (!leaf) continue;
    const pivot = new THREE.Group();
    pivot.position.copy(V(hinge[0], hinge[1]));
    world.add(pivot);
    pivot.attach(leaf);
    gatePivots.push(pivot);
  }
  buildItems();
  placeAt(player, L.start[0], L.start[1], Math.PI);
  placeAt(sister, L.didi[0], L.didi[1], 0);
  camera.position.copy(V(14, -20, 14));
  camLook.copy(V(0, 4, 2));
  camera.lookAt(camLook);
  $('loading').classList.remove('show');
  $('titleSub').textContent = fmt(CONFIG.subtitle);
  $('titleHelp').textContent = 'Walk around the house, find everything for the phota thala, and come to the backyard swing 🪢';
  if (params.has('autostart')) startGame(); else { mode = 'title'; $('title').classList.add('show'); }
}, err => window.__showError('Could not load the house: ' + (err && err.message || err)));

// ---------------------------------------------------------------- main loop
const clock = new THREE.Clock();
let titleSpin = 0;
const MAX_DT = AUTO ? 0.25 : 0.05;
// in auto-test mode drive frames with timers (headless browsers pause requestAnimationFrame)
const nextFrame = AUTO ? f => setTimeout(f, 100) : f => requestAnimationFrame(f);
function frame() {
  const dt = Math.min(MAX_DT, clock.getDelta());
  if (mode === 'title' || mode === 'loading') {
    titleSpin += dt * 0.12;
    camera.position.copy(V(Math.sin(titleSpin) * 22 + 1, -Math.cos(titleSpin) * 22 + 5, 12));
    camLook.copy(V(1, 5, 2));
    camera.lookAt(camLook);
    sky.position.copy(camera.position);
  } else {
    updatePlayer(dt);
    updateGameplay(dt);
    updateTweens(dt);
    updateCamera(dt);
  }
  updateParticles(dt);
  updateOcclusion();
  renderer.render(scene, camera);
  nextFrame(frame);
}
nextFrame(frame);
