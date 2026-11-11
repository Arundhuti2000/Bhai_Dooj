import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CONFIG } from '../config';
import { useUI } from '../store';
import { say, sayAll, chant, choose, toast, showIntro, openShop, AUTO, params } from './ui';
import { music } from './music';
import { fx, tween, wait, updateTweens, updateParticles, petals, sparkles, hearts, steamPuff, angerMark, textSprite, spawn, canvasTex } from './fx';
import { SFX, audio } from './audio';
import { makeThala, makeItem, makeBiscuit, makeGift, makeNintendo, makePhone, makeShop, makeRosogolla } from './props';
import { Character, lerp } from './rig';

// Blender XY(Z) metres -> three.js (x, z, -y)
const V = (x, y, z = 0) => new THREE.Vector3(x, z, -y);
const UP = new THREE.Vector3(0, 1, 0);
const set = (p) => useUI.getState().set(p);
const st = () => useUI.getState();
const wpos = (o) => o.getWorldPosition(new THREE.Vector3());

export const input = { keys: new Set(), joy: { x: 0, y: 0 } };
let game = null;
export const getGame = () => game;

export function createGame({ scene, camera, gl, controls, house, chars, meta, layout }) {
  if (game) return game;
  fx.scene = scene;
  const L = layout;

  // ------------------------------------------------------------ sky, light environment
  const pmrem = new THREE.PMREMGenerator(gl);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.fog = new THREE.Fog(0xf3dccb, 50, 130);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(300, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
      uniforms: { top: { value: new THREE.Color('#6fa9e6') }, mid: { value: new THREE.Color('#bcdcf7') }, bottom: { value: new THREE.Color('#ffe2c4') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP;
        void main(){ float h = vP.y; vec3 c = mix(mid, top, smoothstep(0.05, 0.7, h)); c = mix(bottom, c, smoothstep(-0.02, 0.18, h));
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  scene.add(sky);

  // ------------------------------------------------------------ house
  scene.add(house);
  const flat = new Set(['Ground', 'Yard_Floor', 'Alpona']);
  const fadeables = [];
  for (const top of [...house.children]) {
    const meshes = [];
    top.traverse((o) => {
      if (!o.isMesh) return;
      o.receiveShadow = true;
      o.castShadow = !flat.has(top.name);
      for (const m of [].concat(o.material)) m.envMapIntensity = 0.4;
      meshes.push(o);
    });
    if (flat.has(top.name)) continue;
    const mats = [];
    for (const o of meshes) {
      o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
      mats.push(...[].concat(o.material));
    }
    const f = { obj: top, mats, opacity: 1, target: 1 };
    top.userData.fade = f;
    fadeables.push(f);
  }
  const gatePivots = [];
  for (const [name, h] of [['Gate_Leaf_L', L.gate.hingeL], ['Gate_Leaf_R', L.gate.hingeR]]) {
    const leaf = house.getObjectByName(name);
    if (!leaf) continue;
    const pivot = new THREE.Group();
    pivot.position.copy(V(h[0], h[1]));
    house.add(pivot);
    pivot.attach(leaf);
    gatePivots.push(pivot);
  }
  // the main door stands open: Maa waits in the doorway
  const doorLeaf = house.getObjectByName('Door_Main');
  if (doorLeaf && L.doorHinge) {
    const pivot = new THREE.Group();
    pivot.position.copy(V(L.doorHinge[0], L.doorHinge[1]));
    house.add(pivot);
    pivot.attach(doorLeaf);
    pivot.rotation.y = 1.65;
  }
  const toRect =(r) => ({ minX: r[0], maxX: r[1], minZ: -r[3], maxZ: -r[2], off: false });
  const blockers = L.blockers.map(toRect);
  const gateBlocker = toRect(L.gate.blocker);
  blockers.push(gateBlocker);
  const gateCenter = V(L.gate.center[0], L.gate.center[1]);
  blockers.push(toRect([2.05, 3.95, -7.65, -6.95]));   // the gift shop stall on the street

  // ------------------------------------------------------------ characters
  // Papa's scan comes out a little small next to his chair: scale him up a touch
  // (before rigging, so bone lengths and face points are measured at the new size)
  const SIZE = { baba: 1.04 };
  const mk = (key, name) => {
    const k = SIZE[key] || 1;
    chars[key].scale.setScalar(k);
    const c = new Character(chars[key], { name });
    const m = meta[key];
    c.setupFace(m.forehead * k, m.mouth * k, m.headTop * k);
    c.size = k;
    scene.add(c.root);
    return c;
  };
  const player = mk('bhaiya', 'Bhaiya');
  const sister = mk('honey', 'Honey');
  const maa = mk('maa', 'Maa');
  const baba = mk('baba', 'Papa');
  const npcs = { honey: sister, maa, baba };
  player.pose = 'rest';
  const labels = {};
  for (const [k, c] of Object.entries(npcs)) {
    const lb = textSprite({ honey: CONFIG.sister, maa: CONFIG.maa, baba: CONFIG.baba }[k]);
    lb.position.set(0, meta[k].height * c.size + 0.25, 0);
    c.root.add(lb);
    labels[k] = lb;
  }
  const place = (c, x, y, yaw, sit = false) => {
    c.root.position.copy(V(x, y));
    c.root.rotation.y = c.targetYaw = yaw;
    c.sitting = sit;
    c.root.updateMatrixWorld(true);
  };
  place(player, L.start[0], L.start[1], Math.PI);
  place(sister, L.didi[0], L.didi[1], 0);
  // Maa waits by the main door; Baba reads the paper on the plastic chair in the backyard
  const MAA_SPOT = L.maaDoor || [-1.2, -0.16, 0.45];   // in the open doorway, on the top step
  const CHAIR = [-5.9, 13.25, 0.47];
  place(maa, MAA_SPOT[0], MAA_SPOT[1], 0);
  maa.root.position.y = MAA_SPOT[2];
  maa.pose = 'rest';
  // sat a little forward on the seat with the hips above the cushion, so his thighs rest on
  // top of the seat instead of sinking into it
  place(baba, CHAIR[0], CHAIR[1] - 0.06, 0, true);
  baba.seatY = CHAIR[2] + 0.13;
  // Papa's scan has a big puffy jacket, which makes his head look small: scale it up a bit
  baba.bones.head.scale.setScalar(1.2);
  // hands hang clear of the puffy jacket, arms straight from the shoulder (no "waist" curve)
  baba.armOut = 0.24;
  // a man's stance: feet apart under the shoulders, toes out, knees over the feet, arms straight
  Object.assign(baba, { stance: 1.45, toeOut: 0.16, kneeOut: 0.14, armDrop: 0.975 });
  Object.assign(player, { stance: 1.2, toeOut: 0.12, kneeOut: 0.1, armDrop: 0.965 });
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.3), new THREE.MeshStandardMaterial({
    map: canvasTex(256, 184, (g, w, h) => {
      g.fillStyle = '#f1ede3'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#222'; g.font = 'bold 22px serif'; g.fillText('BHAI PHOTA', 12, 30);
      g.font = '13px serif'; g.fillText('Brother gives REAL gift?', 12, 50);
      g.fillStyle = '#999';
      for (let y = 64; y < h - 8; y += 9) g.fillRect(12, y, w - 24 - (y % 3) * 18, 3);
    }),
    side: THREE.DoubleSide, roughness: 0.9,
  }));
  scene.add(paper);

  // ------------------------------------------------------------ phota items + guide arrow
  const items = L.items.map((it) => {
    const g = makeItem(it.id);
    g.position.copy(V(it.x, it.y));
    scene.add(g);
    return { id: it.id, g, got: false, t: Math.random() * 6 };
  });
  let collected = 0;
  const guide = new THREE.Mesh(
    new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0.32), new THREE.Vector2(-0.2, -0.08), new THREE.Vector2(0, 0.02), new THREE.Vector2(0.2, -0.08)])).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffa51f, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
  );
  guide.visible = false;
  scene.add(guide);

  // ------------------------------------------------------------ the gift shop on the street
  // a little stall just outside the front wall, its counter facing the house (Blender +Y):
  // it is built facing local +Z, so turn it round (three -Z = Blender +Y)
  const SHOP = [3.0, -7.3];
  const shopG = makeShop();
  shopG.position.copy(V(SHOP[0], SHOP[1]));
  shopG.rotation.y = Math.PI;
  shopG.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
  scene.add(shopG);
  shopG.updateMatrixWorld(true);
  const shopFront = V(SHOP[0], SHOP[1] + 0.7);      // where he stands to shop
  const shopSpot = (x, y = 1.12, z = 0.05) => shopG.localToWorld(new THREE.Vector3(x, y, z));
  const SHOP_DISPLAY = { biscuit: -0.55, box: 0, nintendo: 0.55 };   // the gifts on the counter (local x)
  const bought = new Set();                          // gifts he has bought (the ₹5 biscuit is always in his pocket)

  // ------------------------------------------------------------ camera (drei CameraControls)
  // third-person camera: orbits Bhaiya's head; drag / Q,E to turn, scroll / pinch to zoom,
  // walls push it in (instead of hiding him), C swings round to see his face
  const A = controls.constructor.ACTION;
  const MIN_D = 0.7;
  Object.assign(controls, {
    minDistance: MIN_D, maxDistance: 30, minPolarAngle: 0.12, maxPolarAngle: Math.PI * 0.53,
    smoothTime: 0.18, draggingSmoothTime: 0.08, azimuthRotateSpeed: 1.2, polarRotateSpeed: 1.0, dollySpeed: 1.2,
  });
  controls.mouseButtons.right = A.NONE;
  controls.mouseButtons.wheel = A.DOLLY;
  controls.touches.two = A.TOUCH_DOLLY;
  const SOLID = new Set(['Block_A', 'Block_B', 'Crown', 'Stair_Room', 'Side_Features', 'Back_Features', 'Plinth',
    'Boundary_Wall', 'Fence_Blue_Gate', 'Neighbours', 'College_Across', 'Door_Main', 'Door_Side', 'Door_Back']);
  // walls push the camera in only while walking around; cinematic shots (title, intro,
  // phota, photos) aim at points inside the house and would otherwise get pulled through walls
  const solids = house.children.filter((o) => SOLID.has(o.name));
  const colliders = (on) => { controls.colliderMeshes = on ? solids : []; };
  colliders(false);
  const shot = (pos, look, smooth = true) => controls.setLookAt(pos.x, pos.y, pos.z, look.x, look.y, look.z, smooth);
  shot(V(16, -18, 14), V(1, 5, 2), false);
  let cine = false;
  const FOLLOW_H = 1.45;               // look at his head, not his chest
  const follow = (smooth = true) => {
    const p = player.root.position;
    controls.moveTo(p.x, p.y + FOLLOW_H, p.z, smooth);
  };
  // swing round in front of him to see his face
  function lookAtMe() {
    if (cine || busy) return;
    controls.rotateTo(player.root.rotation.y, Math.PI * 0.44, true);
    controls.dollyTo(1.8, true);
  }

  // ------------------------------------------------------------ state
  let gateOpen = false, busy = false, stolen = 0, talkIdx = 0, bonkIdx = 0, angryT = 0, puffT = 0, photaStarted = false;
  let maaGreeted = false, walkTest = null;
  let afterPose = null;                 // runs every frame after the characters are posed (e.g. a phone kept in a hand)
  let onRoam = null;                    // tidy-up when he goes walking around after the ending
  const talkCount = { maa: 0, baba: 0 };
  const holds = new Map(); // character -> { obj, half, hands, anchor }
  const releaseHold = (c) => {
    holds.delete(c);
    c.hand.L = c.hand.R = null;
  };
  const paperAnchor = () => new THREE.Vector3(0, baba.restLocal.chest.y + (baba.seatY - baba.hipsY) + 0.02, 0.36);
  holds.set(baba, { obj: paper, half: 0.18, anchor: paperAnchor() });
  const nearOf = (who) => npcs[who];   // (undefined for 'shop')

  // ------------------------------------------------------------ movement
  const RADIUS = 0.3;
  const WALK = 1.9, RUN = 4.8;          // m/s: a real walking pace; Shift (or the stick pushed all the way) runs
  let runSpeed = WALK;
  function collide(p) {
    for (const b of blockers) {
      if (b.off) continue;
      const cx = Math.max(b.minX, Math.min(p.x, b.maxX)), cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
      const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= RADIUS * RADIUS) continue;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * RADIUS;
        p.z = cz + (dz / d) * RADIUS;
      } else {
        const pen = [p.x - b.minX, b.maxX - p.x, p.z - b.minZ, b.maxZ - p.z];
        const i = pen.indexOf(Math.min(...pen));
        if (i === 0) p.x = b.minX - RADIUS; else if (i === 1) p.x = b.maxX + RADIUS;
        else if (i === 2) p.z = b.minZ - RADIUS; else p.z = b.maxZ + RADIUS;
      }
    }
    for (const c of Object.values(npcs)) {   // don't walk through the family
      const s = c.root.position, dx = p.x - s.x, dz = p.z - s.z, d = Math.hypot(dx, dz);
      if (d < 0.55 && d > 1e-6) { p.x = s.x + (dx / d) * 0.55; p.z = s.z + (dz / d) * 0.55; }
    }
    const [x0, x1, y0, y1] = L.bounds;
    p.x = Math.min(x1, Math.max(x0, p.x));
    p.z = Math.min(-y0, Math.max(-y1, p.z));
  }
  function movePlayer(dt) {
    const k = input.keys;
    let ix = 0, iy = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) iy += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) iy -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) ix -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) ix += 1;
    ix += input.joy.x;
    iy += input.joy.y;
    const len = Math.hypot(ix, iy);
    if (len > 1) { ix /= len; iy /= len; }
    const amt = Math.min(1, len);
    const running = k.has('ShiftLeft') || k.has('ShiftRight') || Math.hypot(input.joy.x, input.joy.y) > 0.96;
    runSpeed = lerp(runSpeed, running ? RUN : WALK, Math.min(1, dt * 5));   // ease between walk and run
    const p = player.root.position;
    const before = p.clone();
    if (amt > 0.08) {
      const az = controls.azimuthAngle;
      const fwx = -Math.sin(az), fwz = -Math.cos(az), rx = Math.cos(az), rz = -Math.sin(az);
      const speed = runSpeed;
      const mx = (fwx * iy + rx * ix) * speed * dt, mz = (fwz * iy + rz * ix) * speed * dt;
      p.x += mx; collide(p);
      p.z += mz; collide(p);
      player.targetYaw = Math.atan2(mx, mz);
      player.move = lerp(player.move, amt, Math.min(1, dt * 8));
      player.pose = 'walk';
    } else {
      player.move = lerp(player.move, 0, Math.min(1, dt * 8));
      if (player.move < 0.05 && player.pose === 'walk') player.pose = 'rest';
    }
    // the steps follow how fast he really moved (sliding along a wall = slower steps)
    const actual = dt > 0 ? before.distanceTo(p) / dt : 0;
    player.walkSpeed = lerp(player.walkSpeed, amt > 0.08 ? Math.max(actual, 0.7) : 0, Math.min(1, dt * 10));
  }
  // a few scripted steps (walking up to someone), with the legs really stepping
  async function stepTo(c, to, time = 0.45, face = true) {
    const from = c.root.position.clone();
    const dist = from.distanceTo(to);
    if (dist < 0.02) return;
    if (face) c.targetYaw = Math.atan2(to.x - from.x, to.z - from.z);
    c.scripted = true;
    // stepping backwards when the move is against the way he faces
    const facing = new THREE.Vector3(Math.sin(c.targetYaw), 0, Math.cos(c.targetYaw));
    const sign = to.clone().sub(from).setY(0).dot(facing) < 0 ? -1 : 1;
    await tween(time, (k) => {
      c.root.position.lerpVectors(from, to, k);
      c.move = 1;
      c.walkSpeed = sign * dist / time;
    }, (k) => k);
    c.scripted = false;
    c.move = 0;
    c.walkSpeed = 0;
  }

  // ------------------------------------------------------------ gameplay
  function collect(it) {
    it.got = true;
    collected++;
    SFX.ding();
    sparkles(it.g.position.clone().add(new THREE.Vector3(0, 0.8, 0)), 24);
    const s0 = it.g.scale.x;
    tween(0.35, (k) => it.g.scale.setScalar(s0 * (1 - k))).then(() => (it.g.visible = false));
    set({ got: { ...st().got, [it.id]: true } });
    toast(CONFIG.items[it.id].line);
    if (collected >= items.length) {
      set({ objective: 'Go to {S} at the swing in the backyard 🪢'.replace('{S}', CONFIG.sister) });
      setTimeout(() => st().phase === 'play' && toast(CONFIG.allFound, 4000), 3300);
    } else set({ objective: `Find the phota things: ${collected} / ${items.length}` });
  }
  function openGate() {
    gateOpen = true;
    gateBlocker.off = true;
    SFX.gate();
    toast(CONFIG.gateOpen, 2200);
    const [pl, pr] = gatePivots;
    tween(1.4, (k) => { if (pl) pl.rotation.y = 1.75 * k; if (pr) pr.rotation.y = -1.75 * k; });
  }
  function nearestTarget() {
    if (collected >= items.length) return sister.root.position;
    let best = null, bd = Infinity;
    for (const it of items) {
      if (it.got) continue;
      const d = it.g.position.distanceToSquared(player.root.position);
      if (d < bd) { bd = d; best = it.g.position; }
    }
    return best;
  }
  const losRay = new THREE.Raycaster();
  let losN = -1;
  function gameplay(dt) {
    const phase = st().phase;
    const playing = phase === 'play' || phase === 'roam';
    for (const it of items) {
      if (!it.g.visible) continue;
      it.t += dt;
      it.g.userData.model.rotation.y += dt * 1.4;
      it.g.userData.model.position.y = 0.75 + Math.sin(it.t * 2.2) * 0.08;
      // the guide beam fades away as he gets close, so the item itself is what you see
      const dd = it.g.position.distanceTo(player.root.position);
      it.g.userData.beam.material.opacity = 0.3 * Math.min(1, Math.max(0, (dd - 2.5) / 4));
      it.g.userData.glow.material.opacity = 0.2 + 0.15 * Math.sin(it.t * 3);
      if (!it.got && phase === 'play' && it.g.position.distanceTo(player.root.position) < 1.05) collect(it);
    }
    if (!gateOpen && playing && gateCenter.distanceTo(player.root.position) < 3.0) openGate();
    // family members turn to him, wave, and look at him; find who he is standing next to
    let nearWho = null, nearD = Infinity;
    const head = wpos(player.forehead);   // look at his eyes, not his neck
    // can they actually see each other? (no chatting / staring through walls)
    if (++losN % 10 === 0) {
      for (const c of Object.values(npcs)) {
        const to = wpos(c.forehead).sub(head);
        const d = to.length();
        if (d > 6) { c.seen = false; continue; }
        losRay.set(head, to.normalize());
        losRay.far = Math.max(0.01, d - 0.25);
        c.seen = losRay.intersectObjects(solids, true).length === 0;
      }
    }
    for (const [k, c] of Object.entries(npcs)) {
      const toP = player.root.position.clone().sub(c.root.position);
      const dist = toP.length();
      if (playing && !busy) {
        if (dist < 8 && !c.sitting) c.targetYaw = Math.atan2(toP.x, toP.z);
        if (!holds.has(c) && !(c === sister && angryT > 0)) {
          const waving = dist < 8 && dist > 2.6 && (c !== maa || !maaGreeted);
          c.pose = waving ? 'wave' : 'rest';
        }
        c.lookAt = dist < 8 ? head : null;
      }
      if (c.seen && dist < (c.sitting ? 2.3 : 2.6) && dist < nearD) { nearD = dist; nearWho = k; }
    }
    if (playing && !busy) player.lookAt = nearWho ? wpos(npcs[nearWho].forehead) : null;
    if (!maaGreeted && phase === 'play' && !busy && maa.seen && player.root.position.distanceTo(maa.root.position) < 3.4) greetMaa();
    // meeting Honey or Papa for the first time: their intro card
    if (phase === 'play' && !busy && nearWho && nearWho !== 'maa' && !met.has(nearWho)) introduce(nearWho);
    // nobody from the family around, but standing at the gift shop counter
    if (!nearWho && playing && !busy) {
      const p = player.root.position;
      if (Math.hypot(p.x - shopFront.x, p.z - shopFront.z) < 1.4) {
        nearWho = 'shop';
        player.lookAt = shopSpot(0, 1.15, 0.1);
      }
    }
    if (!playing || busy) nearWho = null;
    const canPhota = nearWho === 'honey' && phase === 'play' && collected >= items.length;
    const u = st();
    if (nearWho !== u.near || canPhota !== u.canPhota || busy !== u.busy) set({ near: nearWho, canPhota, busy });
    for (const lb of Object.values(labels)) lb.visible = playing && !busy && !cine;
    const tgt = phase === 'play' ? nearestTarget() : null;
    guide.visible = !!tgt && !busy;
    if (tgt) {
      const d = tgt.clone().sub(player.root.position);
      d.y = 0;
      const dl = d.length();
      d.normalize();
      guide.position.copy(player.root.position).addScaledVector(d, 1.0);
      guide.position.y = 0.06;
      guide.rotation.y = Math.atan2(d.x, d.z);
      guide.material.opacity = dl < 2 ? 0.25 : 0.85;
    }
  }
  function updateAngry(dt) {
    if (angryT <= 0) return;
    angryT -= dt;
    puffT -= dt;
    sister.setTint('#ff2a1a', 0.2 + 0.14 * Math.sin(sister.t * 14));
    const top = wpos(sister.headTop);
    if (puffT <= 0) {
      puffT = 0.1;
      steamPuff(top.clone().add(new THREE.Vector3(0, -0.1, 0)), new THREE.Vector3(1, 0, 0).applyQuaternion(sister.root.quaternion));
      if (Math.random() < 0.2) angerMark(top.clone().add(new THREE.Vector3(0.14, 0.02, 0)));
    }
    sister.bounce = angryT > 2.4 ? Math.abs(Math.sin(sister.t * 16)) * 0.05 : 0;
    if (angryT <= 0) {
      sister.setTint('#000000', 0);
      sister.bounce = 0;
      sister.pose = 'rest';
    }
  }
  function updateHolds() {
    for (const [c, h] of holds) {
      const q = c.root.quaternion;
      if (h.anchor) {
        h.obj.position.copy(c.root.localToWorld(h.anchor.clone()));
        h.obj.rotation.y = c.root.rotation.y;
      }
      const lx = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
      const fw = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      const base = h.obj.position.clone().addScaledVector(fw, -0.05).add(new THREE.Vector3(0, -0.02, 0));
      if (h.hands !== 'R') c.hand.L = base.clone().addScaledVector(lx, h.half);
      if (h.hands !== 'L') c.hand.R = base.clone().addScaledVector(lx, -h.half);
    }
  }

  // fade whatever stands between the camera and the characters
  const ray = new THREE.Raycaster();
  let occN = 0;
  function occlusion() {
    if (++occN % 3 === 0) {
      for (const f of fadeables) f.target = 1;
      const targets = [player.root.position.clone().add(new THREE.Vector3(0, 1.1, 0))];
      if (st().phase === 'ceremony' || busy) targets.push(sister.root.position.clone().add(new THREE.Vector3(0, 1.1, 0)));
      const objs = fadeables.map((f) => f.obj);
      for (const t of targets) {
        const dir = t.clone().sub(camera.position);
        const dist = dir.length();
        ray.set(camera.position, dir.normalize());
        ray.far = Math.max(0.01, dist - 0.4);
        for (const h of ray.intersectObjects(objs, true)) {
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

  // ------------------------------------------------------------ sibling interactions
  const faceEachOther = (c = sister) => {
    const d = player.root.position.clone().sub(c.root.position);
    if (!c.sitting) c.targetYaw = Math.atan2(d.x, d.z);
    player.targetYaw = Math.atan2(-d.x, -d.z);
  };
  // frame Bhaiya and whoever he is with, from the side the camera is already on
  const frameBoth = (c = sister) => {
    const a = player.root.position, b = c.root.position;
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const ab = b.clone().sub(a).setY(0).normalize();
    let side = new THREE.Vector3(-ab.z, 0, ab.x);
    if (side.dot(camera.position.clone().sub(mid)) < 0) side.negate();
    // pick a side (and angle) with nothing in the way: no bushes, walls or trees
    const look = mid.clone().add(new THREE.Vector3(0, 1.2, 0));
    const solidsAll = house.children.filter((o) => !flat.has(o.name));
    let best = null;
    for (const ang of [0, Math.PI, 0.6, -0.6, Math.PI + 0.6, Math.PI - 0.6, 1.1, -1.1]) {
      const dir = side.clone().applyAxisAngle(UP, ang);
      const pos = mid.clone().addScaledVector(dir, 2.6).add(new THREE.Vector3(0, 1.5, 0));
      // cast from them out towards the camera (and a bit past it), so a camera that would
      // sit inside a bush or wall counts as blocked too
      // (the centre line plus the edges of the view, so no bush pokes in at the side)
      const lateral = new THREE.Vector3(-dir.z, 0, dir.x);
      const probes = [pos, pos.clone().addScaledVector(lateral, 0.7), pos.clone().addScaledVector(lateral, -0.7), pos.clone().add(new THREE.Vector3(0, -0.8, 0))];
      const clear = probes.every((q) => {
        const out = q.clone().sub(look);
        frameRay.set(look, out.clone().normalize());
        frameRay.near = 0.45;
        frameRay.far = out.length() + 0.4;
        return frameRay.intersectObjects(solidsAll, true).length === 0;
      });
      if (clear) { best = pos; break; }
    }
    cine = true;
    shot(best || mid.clone().addScaledVector(side, 2.6).add(new THREE.Vector3(0, 1.5, 0)), look);
  };
  const frameRay = new THREE.Raycaster();
  const unframe = () => { cine = false; };
  async function greetMaa() {
    maaGreeted = true;
    busy = true;
    player.pose = 'rest';
    faceEachOther(maa);
    maa.pose = 'wave';
    await wait(0.3);
    await introduce('maa');
    maa.pose = 'wave';
    frameBoth(maa);
    await sayAll(CONFIG.maaGreeting);
    maa.pose = 'rest';
    unframe();
    busy = false;
  }
  async function talk() {
    const who = st().near;
    if (busy || !who || !npcs[who]) return;   // (near can also be 'shop')
    busy = true;
    const c = nearOf(who);
    faceEachOther(c);
    frameBoth(c);
    if (who === 'honey') await sayAll(CONFIG.talk[talkIdx++ % CONFIG.talk.length]);
    else {
      const list = who === 'maa' ? CONFIG.talkMaa : CONFIG.talkBaba;
      await sayAll(list[talkCount[who]++ % list.length]);
    }
    unframe();
    busy = false;
  }
  // pronam: touch the elder's feet, get a blessing (hand on the head)
  async function pronam() {
    const who = st().near;
    if (busy || (who !== 'maa' && who !== 'baba')) return;
    busy = true;
    const c = nearOf(who);
    const cp = c.root.position;
    const from = player.root.position.clone();
    const away = from.clone().sub(cp).setY(0).normalize();
    // kneel a bow's length from their FEET (a seated parent's feet are well in front of them,
    // so measuring from the body put his head in Papa's chest)
    const feet0 = wpos(c.bones.foot_L).add(wpos(c.bones.foot_R)).multiplyScalar(0.5);
    const ahead = Math.max(0, feet0.clone().sub(cp).setY(0).dot(away));
    const to = cp.clone().addScaledVector(away, ahead + 0.7);
    to.y = 0;
    collide(to);                         // e.g. stay at the foot of the steps for Maa
    await stepTo(player, to);
    faceEachOther(c);
    frameBoth(c);
    player.pose = 'rest';
    // Papa lowers his newspaper to his lap (held in one hand) while Happy bows
    const h = holds.get(c);
    const anchor0 = h?.anchor?.clone();
    if (h) h.hands = 'L';
    await tween(0.6, (k) => {
      player.crouch = 0.42 * k;
      player.lean = 0.75 * k;
      if (h && anchor0) h.anchor = anchor0.clone().add(new THREE.Vector3(0.14 * k, -0.24 * k, -0.06 * k));
    });
    const feet = wpos(c.bones.foot_L).add(wpos(c.bones.foot_R)).multiplyScalar(0.5)
      .add(new THREE.Vector3(0, 0.08, 0)).addScaledVector(away, 0.12);
    const s0 = player.palm('R'), s1 = player.palm('L');
    await tween(0.4, (k) => { player.hand.R = s0.clone().lerp(feet, k); player.hand.L = s1.clone().lerp(feet, k); });
    // the blessing: they lean in and put a hand on his head
    const top = wpos(player.headTop).add(new THREE.Vector3(0, 0.03, 0));
    const lookWas = c.lookAt;
    c.lookAt = top.clone();
    const b0 = c.palm('R');
    const bend = c.sitting ? 0.3 : 0.18;
    await tween(0.5, (k) => { c.hand.R = b0.clone().lerp(top, k); c.lean = bend * k; });
    hearts(top.clone().add(new THREE.Vector3(0, 0.2, 0)), 8);
    SFX.chime();
    toast(CONFIG.pronam[who], 3000);
    await wait(1.2);
    await tween(0.4, (k) => { c.hand.R = top.clone().lerp(b0, k); c.lean = bend * (1 - k); });
    c.hand.R = null;
    c.lean = 0;
    c.lookAt = lookWas;
    player.hand.R = player.hand.L = null;
    await tween(0.5, (k) => {
      player.crouch = 0.42 * (1 - k);
      player.lean = 0.75 * (1 - k);
      if (h && anchor0) h.anchor = anchor0.clone().add(new THREE.Vector3(0.14 * (1 - k), -0.24 * (1 - k), -0.06 * (1 - k)));
    });
    if (h) { h.anchor = anchor0; h.hands = undefined; }
    player.pose = 'rest';
    await wait(0.6);
    unframe();
    busy = false;
  }
  async function bonk() {
    if (busy || st().near !== 'honey') return;
    busy = true;
    faceEachOther();
    const sp = sister.root.position;
    const from = player.root.position.clone();
    const to = sp.clone().addScaledVector(from.clone().sub(sp).setY(0).normalize(), 0.6);
    await stepTo(player, to);
    faceEachOther();
    frameBoth();
    player.pose = 'rest';
    await wait(0.35);
    const start = player.palm('R');
    const above = wpos(sister.headTop).add(new THREE.Vector3(0, 0.28, 0));
    await tween(0.28, (k) => (player.hand.R = start.clone().lerp(above, k)));
    const hit = wpos(sister.headTop).add(new THREE.Vector3(0, 0.04, 0));
    await tween(0.1, (k) => (player.hand.R = above.clone().lerp(hit, k)), (k) => k * k);
    SFX.bonk();
    sparkles(hit, 10, 0xffffff, 0.12);
    angryT = 3.2;
    puffT = 0;
    sister.pose = 'angry';
    sister.lookAt = wpos(player.forehead);
    SFX.steam();
    toast(CONFIG.bonk[bonkIdx++ % CONFIG.bonk.length], 2600);
    await tween(0.3, (k) => (player.hand.R = hit.clone().lerp(start, k)));
    player.hand.R = null;
    player.pose = 'rest';
    await wait(1.8);
    unframe();
    busy = false;
  }
  async function steal() {
    if (busy || st().near !== 'honey') return;
    if (!st().got.mishti) { toast(CONFIG.steal.none, 1800); return; }
    busy = true;
    faceEachOther();
    frameBoth();
    await wait(0.3);
    const ball = makeRosogolla();
    scene.add(ball);
    player.pose = 'rest';
    const start = player.palm('R');
    const mouth = wpos(player.mouth);
    const nearMouth = mouth.clone().add(new THREE.Vector3(0, -0.1, 0)).addScaledVector(new THREE.Vector3(0, 0, 1).applyQuaternion(player.root.quaternion), 0.12);
    await tween(0.6, (k) => {
      player.hand.R = start.clone().lerp(nearMouth, k);
      ball.position.copy(player.palm('R'));
    });
    scene.remove(ball);
    SFX.pop();
    toast(CONFIG.steal.eat, 1400);
    await tween(0.7, (k, raw) => (player.lean = Math.sin(raw * Math.PI * 4) * 0.06), (k) => k);
    player.lean = 0;
    player.hand.R = null;
    player.pose = 'rest';
    stolen++;
    faceEachOther();
    angryT = 3.2;
    puffT = 0;
    sister.pose = 'angry';
    SFX.steam();
    toast(CONFIG.steal.angry, 2800);
    await wait(2.0);
    unframe();
    busy = false;
  }
  async function selfie() {
    if (busy || st().near !== 'honey') return;
    busy = true;
    cine = true;
    const yaw = player.root.rotation.y;
    const right = new THREE.Vector3(-1, 0, 0).applyAxisAngle(UP, yaw);
    const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(UP, yaw);
    const pp = player.root.position.clone();
    const spot = pp.clone().addScaledVector(right, 0.55);
    const keep = sister.root.position.clone();
    sister.root.position.copy(spot);
    sister.root.rotation.y = sister.targetYaw = player.targetYaw = yaw;
    player.pose = 'rest';
    sister.pose = 'peace';
    sister.lookAt = player.lookAt = null;
    const mid = pp.clone().add(spot).multiplyScalar(0.5);
    shot(mid.clone().addScaledVector(fwd, 1.75).add(new THREE.Vector3(0, 1.55, 0)), mid.clone().add(new THREE.Vector3(0, 1.32, 0)));
    toast(CONFIG.selfie, 1500);
    await wait(1.8);
    set({ flash: Date.now() });
    SFX.shutter();
    await wait(0.06);
    set({ photo: gl.domElement.toDataURL('image/jpeg', 0.92) });
    await wait(0.6);
    sister.root.position.copy(keep);
    sister.pose = 'rest';
    cine = false;
    busy = false;
  }

  // ------------------------------------------------------------ movie-style character intros
  // the first time he meets someone: black bars, the camera pushes in on their face,
  // a freeze-frame photo, and a polaroid card with a funny description
  const met = new Set();
  const INTROS = !params.has('skip') || params.has('intros');
  async function introduce(key) {
    if (met.has(key) || !INTROS || !CONFIG.intros?.[key]) return;
    met.add(key);
    const c = key === 'bhaiya' ? player : npcs[key];
    const was = { busy, cine, smooth: controls.smoothTime, pose: c.pose, look: c.lookAt };
    const camWas = { p: controls.getPosition(new THREE.Vector3()), t: controls.getTarget(new THREE.Vector3()) };
    busy = true;
    cine = true;
    colliders(false);
    set({ letterbox: true });
    const face = wpos(c.forehead).add(new THREE.Vector3(0, -0.05, 0));
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(c.root.quaternion).setY(0).normalize();
    const side = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const camPos = face.clone().addScaledVector(fwd, c.sitting ? 1.0 : 1.2).addScaledVector(side, 0.28).add(new THREE.Vector3(0, 0.03, 0));
    controls.smoothTime = 0.55;
    shot(camPos, face);
    c.lookAt = camPos.clone();
    if (!holds.has(c)) c.pose = key === 'maa' ? 'wave' : key === 'baba' ? 'rest' : 'peace';
    await wait(1.5);
    SFX.shutter();
    set({ flash: Date.now() });
    await wait(0.06);
    const photo = gl.domElement.toDataURL('image/jpeg', 0.9);
    await showIntro({ key, photo, ...CONFIG.intros[key] });
    set({ letterbox: false });
    c.pose = was.pose === 'walk' ? 'rest' : was.pose;
    c.lookAt = was.look;
    controls.smoothTime = was.smooth;
    controls.setLookAt(camWas.p.x, camWas.p.y, camWas.p.z, camWas.t.x, camWas.t.y, camWas.t.z, true);
    cine = was.cine;
    busy = was.busy;
    const ph = st().phase;
    if ((ph === 'play' || ph === 'roam') && !cine) colliders(true);
  }

  // ------------------------------------------------------------ with Maa and Papa
  // walk up to a parent and face them
  async function approach(c, gap) {
    const cp = c.root.position;
    const to = cp.clone().addScaledVector(player.root.position.clone().sub(cp).setY(0).normalize(), gap);
    to.y = 0;
    collide(to);
    await stepTo(player, to);
    faceEachOther(c);
    frameBoth(c);
    player.pose = 'rest';
    c.lookAt = wpos(player.forehead);
    player.lookAt = wpos(c.forehead);
    await wait(0.35);
  }
  // Maa pinches his cheek
  let pinchIdx = 0;
  async function pinch() {
    if (busy || st().near !== 'maa') return;
    busy = true;
    await approach(maa, 0.66);
    // Maa is up on the door step, so she comes down to him (he makes room by stepping back)
    const p = player.root.position.clone();
    const dir = maa.root.position.clone().sub(p).setY(0).normalize();
    const back = p.clone().addScaledVector(dir, -0.5);
    collide(back);
    await stepTo(player, back, 0.5, false);
    const meet = p.clone().setY(0);
    await stepTo(maa, meet, 0.8);
    faceEachOther(maa);
    frameBoth(maa);
    maa.lookAt = wpos(player.forehead);
    await wait(0.4);
    // her right hand to his cheek on that side (his left, when they face each other)
    const cheek = () => wpos(player.mouth).add(new THREE.Vector3(0.055, 0.04, -0.035).applyQuaternion(player.root.quaternion));
    const h0 = maa.palm('R');
    await tween(0.45, (k) => (maa.hand.R = h0.clone().lerp(cheek(), k)));
    SFX.pop();
    hearts(cheek().add(new THREE.Vector3(0, 0.18, 0)), 7);
    // a little wiggle of the cheek, his head tilting with it
    await tween(1.1, (k, raw) => {
      const w = Math.sin(raw * Math.PI * 7);
      maa.hand.R = cheek().add(new THREE.Vector3(0, w * 0.012, 0));
      player.lean = 0.05 + w * 0.03;
    }, (k) => k);
    const h1 = maa.hand.R.clone();
    tween(0.4, (k) => (maa.hand.R = h1.clone().lerp(maa.palm('R'), k))).then(() => (maa.hand.R = null));
    player.lean = 0;
    await sayAll(CONFIG.pinch[pinchIdx++ % CONFIG.pinch.length]);
    // back up to her place in the doorway
    const home = V(MAA_SPOT[0], MAA_SPOT[1]).setY(MAA_SPOT[2]);
    await stepTo(maa, home, 0.8);
    faceEachOther(maa);
    unframe();
    busy = false;
  }
  // Papa gives him pocket money (for the gift... maybe)
  let gotMoney = 0;
  const makeNote = () => new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.07), new THREE.MeshStandardMaterial({
    map: canvasTex(150, 70, (g, w, h) => {
      g.fillStyle = '#b8b6a6'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#8c8a7a'; g.fillRect(4, 4, w - 8, h - 8);
      g.fillStyle = '#d9d6c4'; g.fillRect(8, 8, w - 16, h - 16);
      g.fillStyle = '#4b4a3e'; g.font = 'bold 26px sans-serif'; g.fillText('₹500', 12, 44);
      g.beginPath(); g.arc(w - 30, h / 2, 16, 0, Math.PI * 2); g.fillStyle = '#a9a693'; g.fill();
    }),
    side: THREE.DoubleSide, roughness: 0.85,
  }));
  async function money() {
    if (busy || st().near !== 'baba') return;
    busy = true;
    await approach(baba, 0.82);
    if (gotMoney) {
      await sayAll(CONFIG.money.again);
      unframe();
      busy = false;
      return;
    }
    await sayAll(CONFIG.money.ask);
    // Papa lets go of one side of the newspaper and holds out a note
    const h = holds.get(baba);
    if (h) h.hands = 'L';
    const note = makeNote();
    scene.add(note);
    const orient = () => note.quaternion.copy(baba.root.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -1.2));
    const b0 = baba.palm('R');
    const give = baba.root.position.clone().lerp(player.root.position, 0.5).setY(baba.seatY + 0.38);
    await tween(0.55, (k) => { baba.hand.R = b0.clone().lerp(give, k); note.position.copy(baba.palm('R')); orient(); });
    const p0 = player.palm('R');
    await tween(0.45, (k) => {
      player.hand.R = p0.clone().lerp(give.clone().add(new THREE.Vector3(0, 0.03, 0)), k);
      player.lean = 0.18 * k;
      note.position.copy(baba.palm('R'));
    });
    SFX.ding();
    toast('💸 ₹500 from Papa!', 2200);
    gotMoney = 1;
    // Papa's hand goes back to the paper, the note goes into Bhaiya's pocket
    const pocket = player.root.localToWorld(new THREE.Vector3(-0.2, player.hipsY - 0.02, 0.06));
    const pr = player.hand.R.clone();
    tween(0.45, (k) => (baba.hand.R = give.clone().lerp(baba.palm('R'), k))).then(() => { baba.hand.R = null; if (h) h.hands = undefined; });
    await tween(0.6, (k) => {
      player.hand.R = pr.clone().lerp(pocket, k);
      player.lean = 0.18 * (1 - k);
      note.position.copy(player.palm('R'));
      note.scale.setScalar(1 - 0.7 * k);
    });
    scene.remove(note);
    player.hand.R = null;
    player.lean = 0;
    await sayAll(CONFIG.money.give);
    toast(CONFIG.shop.nearToast, 4200);   // (only the first time: the money is given once)
    unframe();
    busy = false;
  }

  // the gift shop: he steps up to the counter and picks something (one purchase per visit)
  const SI = CONFIG.shop.items;
  const pocketLine = () => (gotMoney ? CONFIG.shop.pocketPapa : CONFIG.shop.pocket);
  const shopItem = (id, o = {}) => {
    const it = SI[id];
    return { id, icon: it.icon, name: it.name, price: it.price, line: it.line, locked: false, owned: false, ...o };
  };
  const buy = (id) => {
    bought.add(id);
    set({ gifts: [...bought] });
  };
  async function shop() {
    if (busy || st().near !== 'shop') return;
    busy = true;
    player.pose = 'rest';
    // up to the counter, facing it (the stall is towards the street: Blender -Y = yaw 0)
    const to = V(SHOP[0], SHOP[1] + 0.8);
    collide(to);
    await stepTo(player, to, Math.max(0.3, player.root.position.distanceTo(to) / WALK));
    player.targetYaw = 0;
    player.lookAt = shopSpot(0, 1.15, 0.1);
    // over his shoulder: him and the whole stall
    cine = true;
    shot(V(SHOP[0] + 1.9, SHOP[1] + 3.6, 2.3), V(SHOP[0] - 0.15, SHOP[1] + 0.3, 1.3));
    await wait(0.6);
    const id = await openShop({
      title: CONFIG.shop.title,
      pocket: pocketLine(),
      trip: false,
      items: Object.keys(SI).map((k) => shopItem(k, { locked: k !== 'biscuit' && !gotMoney, owned: bought.has(k) })),
    });
    if (id && SI[id]) {
      // he reaches over the counter for it
      // (with the hand on that side: the stall is turned round, so the biscuit is on his left)
      const spot = shopSpot(SHOP_DISPLAY[id]);
      const side = player.root.worldToLocal(spot.clone()).x > 0.1 ? 'L' : 'R';
      const reach = spot.clone().lerp(player.root.position.clone().setY(spot.y), 0.2);
      const h0 = player.palm(side);
      await tween(0.4, (k) => { player.hand[side] = h0.clone().lerp(reach, k); player.lean = 0.22 * k; });
      buy(id);
      SFX.ding();
      toast(SI[id].bought, 3200);
      sparkles(spot.clone().add(new THREE.Vector3(0, 0.12, 0)), 22);
      hearts(spot.clone().add(new THREE.Vector3(0, 0.25, 0)), id === 'biscuit' ? 3 : 7);
      await tween(0.4, (k) => { player.hand[side] = reach.clone().lerp(h0, k); player.lean = 0.22 * (1 - k); });
      player.hand[side] = null;
      player.lean = 0;
      await wait(0.6);
    }
    player.lookAt = null;
    unframe();
    busy = false;
  }

  // ------------------------------------------------------------ the phota ceremony
  async function phota() {
    if (photaStarted || (!st().canPhota && !params.has('phota'))) return;
    photaStarted = true;
    busy = true;
    cine = true;
    set({ phase: 'ceremony', near: false, canPhota: false, toast: null });
    music.setMood('festive');
    colliders(false);
    const [sx, sy, seat] = L.swing;
    const P = (x, y, z) => V(sx + x, sy + y, z);
    controls.minDistance = 0.35;
    angryT = 0;
    sister.setTint('#000000', 0);
    // he stands in front of the swing, facing her (an arm's length apart)
    place(player, sx, sy - 0.55, 0);
    player.pose = 'rest';
    player.move = 0;
    place(sister, sx - 0.3, sy - 1.25, 0);
    const toB = player.root.position.clone().sub(sister.root.position);
    sister.root.rotation.y = sister.targetYaw = Math.atan2(toB.x, toB.z);
    player.root.rotation.y = player.targetYaw = Math.atan2(-toB.x, -toB.z);
    sister.pose = 'rest';
    // Maa and Papa come to the swing to watch (clear of the bushes and the chair)
    releaseHold(baba);
    paper.visible = false;
    place(maa, sx - 0.85, sy - 1.85, 0);
    place(baba, sx + 1.35, sy - 0.35, 0);   // beside the swing: in the background of the side cameras, not in front
    for (const c of [maa, baba]) {
      const d = player.root.position.clone().sub(c.root.position);
      c.root.rotation.y = c.targetYaw = Math.atan2(d.x, d.z);
      c.pose = 'rest';
    }
    player.update(1e-4);
    sister.update(1e-4);
    sister.lookAt = wpos(player.forehead);
    player.lookAt = wpos(sister.forehead);
    maa.lookAt = baba.lookAt = wpos(player.forehead);
    const hy = sister.restLocal.upperarm_L.y - 0.27; // comfortable holding height for her
    const herTop = wpos(sister.headTop).y;            // her hands stay below this (in front of her)
    // he bows towards her so she can reach without lifting her hands over her head
    const bow = (amt, t = 0.5) => {
      const l0 = player.lean, c0 = player.crouch;
      return tween(t, (k) => { player.lean = lerp(l0, 0.5 * amt, k); player.crouch = lerp(c0, 0.06 * amt, k); });
    };
    // cameras look across the pair from the side (a step back, so both are fully in view)
    const twoShot = [P(2.2, -2.3, 1.65), P(-0.15, -0.9, 1.3)];
    const closeUp = [P(1.25, -1.75, 1.6), P(-0.15, -0.85, 1.42)];
    const wide = [P(2.9, -3.55, 2.5), P(-0.25, -1.3, 1.0)];
    shot(...twoShot, false);
    await sayAll(CONFIG.ceremony.sit);

    // aarti: both hands on the thala, circling in front of his face (at her face height at most)
    const thala = makeThala();
    scene.add(thala);
    const leftHold = new THREE.Vector3(0.13, hy, 0.28);
    thala.position.copy(sister.root.localToWorld(leftHold.clone()));
    holds.set(sister, { obj: thala, half: 0.17 });
    thala.userData.light.intensity = 1.4;
    await sayAll(CONFIG.ceremony.aarti);
    const fh = wpos(player.forehead);
    const center = sister.root.position.clone().lerp(player.root.position, 0.5)
      .setY(Math.min(fh.y - 0.2, sister.restLocal.upperarm_L.y + 0.08));
    const h0 = thala.position.clone();
    const acrossH = new THREE.Vector3(-toB.z, 0, toB.x).normalize();   // circles across his face
    await tween(0.6, (k) => thala.position.lerpVectors(h0, center, k));
    await tween(3.4, (k, raw) => {
      const a = raw * Math.PI * 2 * 3 - Math.PI / 2;
      thala.position.copy(center).addScaledVector(acrossH, Math.cos(a) * 0.11).add(new THREE.Vector3(0, Math.sin(a) * 0.1, 0));
    }, (k) => k);
    SFX.chime();
    const h1 = thala.position.clone();
    await tween(0.6, (k) => thala.position.lerpVectors(h1, sister.root.localToWorld(leftHold.clone()), k));
    releaseHold(sister);
    holds.set(sister, { obj: thala, half: 0.17, hands: 'L', anchor: leftHold });

    // phota: right hand dips in chandan / kajal and touches his forehead
    shot(...closeUp);
    await sayAll(CONFIG.ceremony.phota);
    const toward = () => wpos(sister.bones.upperarm_R).sub(wpos(player.forehead)).normalize();
    await bow(1);                                          // he bows his head towards her
    for (let i = 0; i < CONFIG.chant.length; i++) {
      if (i === 0 || i === 2) {
        const part = thala.userData.parts[i === 0 ? 'chandan' : 'kajal'];
        const bowl = wpos(part).add(new THREE.Vector3(0, 0.08, 0));
        const start = sister.palm('R');
        await tween(0.5, (k) => (sister.hand.R = start.clone().lerp(bowl, k)));
        await wait(0.15);
        const fh2 = wpos(player.forehead);
        const tgt = fh2.clone().addScaledVector(toward(), 0.085);
        await tween(0.7, (k) => (sister.hand.R = bowl.clone().lerp(tgt, k)));
        const dot = new THREE.Mesh(
          new THREE.CircleGeometry(i === 0 ? 0.017 : 0.008, 20),
          new THREE.MeshStandardMaterial({ color: i === 0 ? '#f3e2bf' : '#121212', roughness: 0.6 }),
        );
        if (i === 0) dot.scale.set(0.85, 1.5, 1);
        dot.position.z = i === 0 ? 0.002 : 0.004;
        player.forehead.add(dot);
        SFX.pop();
        sparkles(fh2, 10, 0xfff3c4, 0.1);
        const rest = sister.root.localToWorld(new THREE.Vector3(-0.2, hy - 0.08, 0.1));
        tween(0.5, (k) => (sister.hand.R = tgt.clone().lerp(rest, k))).then(() => (sister.hand.R = null));
      }
      await chant(...CONFIG.chant[i]);
    }
    await bow(0);

    // dhaan-durbo sprinkled on his (bowed) head, from her hand held in front of her face
    shot(...twoShot);
    await sayAll(CONFIG.ceremony.durbo);
    await bow(1);
    const top = wpos(player.headTop);
    const sprinkle = top.clone().addScaledVector(toward(), 0.1);
    sprinkle.y = Math.min(top.y + 0.08, herTop - 0.04);
    const s0 = sister.palm('R');
    await tween(0.5, (k) => (sister.hand.R = s0.clone().lerp(sprinkle, k)));
    for (let i = 0; i < 26; i++) {
      const g = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), new THREE.MeshStandardMaterial({ color: i % 2 ? '#58b047' : '#e6b43c' }));
      g.scale.set(1, 0.6, 2);
      const from = sprinkle.clone().lerp(top, Math.random()).add(new THREE.Vector3((Math.random() - 0.5) * 0.16, 0.04 + Math.random() * 0.06, (Math.random() - 0.5) * 0.16));
      spawn(g, from, new THREE.Vector3(0, -0.3, 0), 1.4, { grav: 1.5, spin: 4 });
    }
    await wait(1.2);
    const s0b = sister.hand.R.clone();
    tween(0.4, (k) => (sister.hand.R = s0b.clone().lerp(sister.root.localToWorld(new THREE.Vector3(-0.2, hy - 0.08, 0.1)), k))).then(() => (sister.hand.R = null));
    await bow(0);

    // shankh + ulu + marigold petals
    shot(...wide);
    maa.pose = 'ulu';
    baba.pose = 'clap';
    SFX.shankh();
    SFX.ulu();
    petals(P(0, -0.5, 0), 160, 4);
    toast(CONFIG.ceremony.shankh, 2600);
    await wait(2.6);
    maa.pose = baba.pose = 'rest';

    // mishti, fed by hand
    shot(...twoShot);
    const lines = stolen > 0 ? CONFIG.ceremony.mishtiStolen : CONFIG.ceremony.mishti;
    await say(...lines[0]);
    const ball = makeRosogolla();
    scene.add(ball);
    const plate = wpos(thala.userData.parts.mishti).add(new THREE.Vector3(0, 0.09, 0));
    const s1 = sister.palm('R');
    bow(0.6);
    await tween(0.5, (k) => (sister.hand.R = s1.clone().lerp(plate, k)));
    const mouth = wpos(player.mouth);
    const feed = mouth.clone().addScaledVector(toward(), 0.1);
    await tween(0.8, (k) => {
      sister.hand.R = plate.clone().lerp(feed, k);
      ball.position.copy(sister.palm('R'));
    });
    scene.remove(ball);
    SFX.pop();
    sister.hand.R = null;
    const chew0 = player.lean;
    await tween(0.8, (k, raw) => (player.lean = chew0 + Math.sin(raw * Math.PI * 4) * 0.05), (k) => k);
    await bow(0);
    for (let i = 1; i < lines.length; i++) await say(...lines[i]);
    // she hands the thala to Maa (both hold it for a moment), so her hands are free for the gift
    const maaHold = new THREE.Vector3(0.12, maa.restLocal.upperarm_L.y - 0.3, 0.3);
    const t0 = thala.position.clone();
    const t1 = maa.root.localToWorld(maaHold.clone());
    releaseHold(sister);
    holds.set(sister, { obj: thala, half: 0.17, hands: 'L' });
    holds.set(maa, { obj: thala, half: 0.17, hands: 'L' });
    await tween(0.9, (k) => {
      thala.position.lerpVectors(t0, t1, k);
      thala.position.y += Math.sin(k * Math.PI) * 0.04;
      if (k > 0.6) { holds.delete(sister); sister.hand.L = null; }
    });
    releaseHold(sister);
    holds.set(maa, { obj: thala, half: 0.17, hands: 'L', anchor: maaHold });
    thala.userData.light.intensity = 0.7;

    // the gift: Bhaiya chooses from what he bought at the shop (the ₹5 cream biscuit always
    // lives in his pocket), and maybe runs off to buy her something better
    await sayAll(CONFIG.ceremony.askGift);
    const tierOf = (g) => SI[g].tier;
    // what he bought, plus the ₹5 biscuit as a prank (it always lives in his pocket)
    const options = [...new Set(['biscuit', ...bought])].sort((a, b) => tierOf(a) - tierOf(b));
    const optionLabel = (o) => (o === 'biscuit' && !bought.has('biscuit') && bought.size ? SI.biscuit.prank : SI[o].give);
    const MAKE = { biscuit: makeBiscuit, box: makeGift, nintendo: makeNintendo };
    const giftAnchor = () => new THREE.Vector3(0, hy, 0.28);
    let gift = null, caught = false;
    const calmSister = () => {
      if (angryT <= 0) return;
      angryT = 0;
      sister.setTint('#000000', 0);
      sister.bounce = 0;
      sister.pose = 'rest';
    };
    const dropGift = () => {               // (she puts the last one away)
      if (!gift) return;
      if (holds.get(sister)?.obj === gift) releaseHold(sister);
      scene.remove(gift);
      gift = null;
    };
    // poses that go back to 'rest' after a while (unless something else changed them meanwhile)
    const settle = (c, pose, t = 2.5) => wait(t).then(() => { if (c.pose === pose) c.pose = 'rest'; });
    async function giveGift(id) {
      calmSister();
      dropGift();
      // it appears in his hands, and he hands it over to her
      const obj = MAKE[id]();
      scene.add(obj);
      const by = player.restLocal.upperarm_L.y + player.model.position.y - 0.3;
      const fromP = player.root.localToWorld(new THREE.Vector3(0, by, 0.3));
      obj.position.copy(fromP);
      obj.rotation.y = player.root.rotation.y;
      holds.set(player, { obj, half: obj.userData.half + 0.02 });
      player.pose = 'rest';
      await wait(0.5);
      const toP = sister.root.localToWorld(giftAnchor());
      await tween(0.9, (k) => {
        obj.position.lerpVectors(fromP, toP, k);
        obj.position.y += Math.sin(k * Math.PI) * 0.1;
      });
      releaseHold(player);
      player.pose = 'rest';
      holds.set(sister, { obj, half: obj.userData.half + 0.02, anchor: giftAnchor() });
      gift = obj;
      // her reaction, by how good the gift is
      if (id === 'biscuit') {
        // AGAIN?! steam, a hand on the waist, the biscuit held out in the other
        const h = holds.get(sister);
        h.hands = 'L';
        sister.hand.R = null;
        angryT = 2.8;
        puffT = 0;
        sister.pose = 'angry';
        sister.lookAt = wpos(player.forehead);
        SFX.steam();
        wait(2.8).then(() => { if (holds.get(sister) === h) h.hands = undefined; });
      } else if (id === 'box') {
        SFX.chime();
        hearts(toP, 12);
        maa.pose = 'happy';
        baba.pose = 'clap';
        settle(maa, 'happy');
        settle(baba, 'clap');
        tween(0.8, (k, raw) => (sister.bounce = Math.abs(Math.sin(raw * Math.PI * 2)) * 0.1), (k) => k).then(() => (sister.bounce = 0));
      } else {
        // the Nintendo: the whole family goes wild
        shot(...wide);
        SFX.chime();
        SFX.ding();
        hearts(toP, 24);
        hearts(wpos(sister.headTop).add(new THREE.Vector3(0, 0.1, 0)), 12);
        petals(P(0, -0.8, 0), 180, 3.5);
        sparkles(toP, 30);
        maa.pose = 'clap';
        baba.pose = 'happy';
        settle(maa, 'clap', 3.5);
        settle(baba, 'happy', 3.5);
        tween(2.0, (k, raw) => (sister.bounce = Math.abs(Math.sin(raw * Math.PI * 6)) * 0.18), (k) => k).then(() => (sister.bounce = 0));
      }
      await sayAll(CONFIG.shop.react[id]);
      if (gotMoney && id !== 'biscuit' && !caught) {
        caught = true;
        await sayAll(CONFIG.money.caught);   // Papa recognises his ₹500
      }
    }
    let id = options[await choose(options.map(optionLabel))] ?? options[0];
    await giveGift(id);
    // she has to end up happy: biscuit -> something better -> the Nintendo, every time.
    // If the better gift is already in his pocket, the biscuit was just a prank; otherwise he
    // runs to the shop for it.
    while (tierOf(id) < 2) {
      const up = CONFIG.shop.upgrade[tierOf(id)];
      const pocketed = [...bought].filter((k) => tierOf(k) > tierOf(id)).sort((a, b) => tierOf(a) - tierOf(b));
      if (pocketed.length) {
        await choose([up.reveal]);
        await sayAll(up.revealLines);
        id = pocketed[0];
        await giveGift(id);
        continue;
      }
      await choose([up.go]);
      await sayAll(up.goLines);
      set({ fade: CONFIG.shop.tripOut });
      await wait(1.2);
      player.root.visible = false;          // (he is off at the shop)
      calmSister();
      dropGift();
      const higher = Object.keys(SI).filter((k) => tierOf(k) > tierOf(id));
      const picked = await openShop({ title: CONFIG.shop.tripTitle, pocket: pocketLine(), trip: true, items: higher.map((k) => shopItem(k)) });
      const next = higher.includes(picked) ? picked : higher[0];
      buy(next);
      SFX.ding();
      player.root.visible = true;
      set({ fade: CONFIG.shop.tripBack });
      await wait(1.0);
      set({ fade: null });
      id = next;
      await giveGift(id);
    }
    const selfie = id === 'nintendo';
    calmSister();
    for (const c of [player, sister, maa, baba]) c.lookAt = null;

    // the Nintendo ending: a family SELFIE instead of the photo. Everyone faces the swing
    // (Blender +Y) with the house behind them; Bunu in front holds the phone up in her right
    // hand (the Nintendo in her left), the others squeeze in behind her, clear of Papa's chair
    async function familySelfie() {
      const yaw = Math.PI;
      // one shoulder-to-shoulder row so every face is in the photo (nobody behind anybody):
      // Papa, Maa, Bunu (a half step forward, holding the phone), Bhaiya at the end with his
      // peace sign on the outside where it can't cover a face
      place(baba, sx + 0.8, sy - 3.25, yaw);
      place(maa, sx + 1.26, sy - 3.15, yaw);
      place(sister, sx + 1.72, sy - 3.0, yaw);
      place(player, sx + 2.2, sy - 3.1, yaw);
      player.lean = player.crouch = 0;
      player.pose = 'peace';
      maa.pose = 'rest';
      baba.pose = 'rest';
      sister.pose = 'rest';
      releaseHold(sister);
      // (showing it off in the photo, below her chin)
      if (gift) holds.set(sister, { obj: gift, half: gift.userData.half + 0.02, hands: 'L', anchor: new THREE.Vector3(0.1, sister.restLocal.upperarm_L.y + 0.02, 0.3) });
      for (const c of [player, sister, maa, baba]) c.update(1e-4);
      const faces = [player, sister, maa, baba].reduce((a, c) => a.add(wpos(c.forehead)), new THREE.Vector3()).multiplyScalar(0.25);
      // the phone, up in her right hand at arm's length (her right = local -X)
      const phone = makePhone();
      scene.add(phone);
      const sh = sister.restLocal.upperarm_R;
      sister.hand.R = sister.root.localToWorld(new THREE.Vector3(sh.x * 0.5, sh.y + 0.3, 0.45));
      const keepPhone = () => {
        phone.position.copy(sister.palm('R'));
        phone.lookAt(faces);                // screen (+Z) towards the family
      };
      afterPose = keepPhone;
      keepPhone();
      onRoam = () => {                      // walking around afterwards: phone away, gift back in both hands
        afterPose = null;
        scene.remove(phone);
        releaseHold(sister);
        if (gift) holds.set(sister, { obj: gift, half: gift.userData.half + 0.02, anchor: giftAnchor() });
        player.pose = 'rest';
        controls.dollyTo(3.2, true);        // (the selfie camera was very close)
      };
      for (const c of [player, sister, maa, baba]) c.lookAt = phone.position;   // (follows the phone)
      // first from the swing side (Papa's side, so Bhaiya isn't hidden behind her): Bunu with
      // her phone up, everyone squeezing in
      shot(P(2.9, -0.9, 1.8), P(1.5, -3.15, 1.2));
      await sayAll(CONFIG.ceremony.byeSelfie);
      toast(CONFIG.ceremony.selfieToast, 1800);
      // then the phone's own view: just behind the phone and a little above it, centred on the
      // group and far enough back for all four to fit across the screen. Everyone looks into the
      // lens; her arm reaches out of the bottom corner of the frame, as in a real selfie (the
      // phone itself is not in its own photo)
      const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(UP, yaw);
      const halfW = 1.2;
      const fit = halfW / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.max(0.45, camera.aspect));
      const dist = THREE.MathUtils.clamp(fit, faces.distanceTo(phone.position) + 0.2, 2.4);
      const lens = faces.clone().addScaledVector(fwd, dist).add(new THREE.Vector3(0, 0.35, 0));
      shot(lens, faces.clone().add(new THREE.Vector3(0, -0.12, 0)));
      sister.hand.R = sister.root.localToWorld(new THREE.Vector3(sh.x - 0.2, sh.y - 0.2, 0.42));
      phone.visible = false;
      for (const c of [player, sister, maa, baba]) c.lookAt = lens;
      await wait(2.0);
      set({ flash: Date.now() });
      SFX.shutter();
      await wait(0.06);
      set({ familyPhoto: gl.domElement.toDataURL('image/jpeg', 0.92) });
      hearts(wpos(sister.headTop), 10);
      petals(P(1.5, -2.6, 0), 160, 4);
      SFX.chime();
      await wait(1.4);
    }

    if (!selfie) {
      // everyone together for the family photo, Maa with the thala, Honey with her gift
      // (lined up in front of Papa's chair, clear of the garden bushes on the left)
      const X = 0.62;
      place(player, sx + X + 0.38, sy - 3.3, 0.08);
      place(sister, sx + X - 0.38, sy - 3.3, -0.08);
      place(maa, sx + X - 1.12, sy - 3.4, 0.18);
      place(baba, sx + X + 1.12, sy - 3.4, -0.18);
      player.pose = 'rest';
      maa.pose = baba.pose = 'rest';
      shot(P(X + 0.2, -6.7, 1.7), P(X, -3.2, 1.05));
      await sayAll(CONFIG.ceremony.bye);
      maa.pose = 'wave';
      baba.pose = 'rest';
      shot(P(X, -5.75, 1.75), P(X, -3.3, 1.0));
      toast(CONFIG.ceremony.familyPhoto, 1800);
      await wait(2.0);
      set({ flash: Date.now() });
      SFX.shutter();
      await wait(0.06);
      set({ familyPhoto: gl.domElement.toDataURL('image/jpeg', 0.92) });
      hearts(wpos(sister.headTop), 10);
      petals(P(0, -1.5, 0), 140, 4);
      SFX.chime();
      await wait(1.4);
      set({ photoCaption: CONFIG.ceremony.photoCaption });
    } else {
      await familySelfie();
      set({ photoCaption: CONFIG.ceremony.selfieCaption });
    }
    controls.minDistance = 1.6;
    busy = false;
    set({ phase: 'end' });
  }

  // ------------------------------------------------------------ flow
  async function start() {
    audio();
    music.start();
    set({ phase: 'intro' });
    place(player, L.start[0], L.start[1], Math.PI);
    colliders(false);
    // opening: the house from the street, then a slow glide down to Bhaiya at the gate
    shot(V(11, -17.5, 7.5), V(1.5, 1.5, 3.2), false);
    if (!params.has('skip')) {
      await wait(1.8);
      controls.smoothTime = 1.4;
      shot(V(-1.6, -9.6, 2.5), V(-3.0, -4.6, 1.5));
      await sayAll(CONFIG.intro);
      controls.smoothTime = 0.18;
      await introduce('bhaiya');
    }
    const p = player.root.position;
    // close third-person camera just behind and above Bhaiya's shoulders
    // (scroll / pinch to zoom out and see the whole house)
    shot(new THREE.Vector3(p.x, p.y + 2.05, p.z + 2.9), new THREE.Vector3(p.x, p.y + FOLLOW_H, p.z));
    colliders(true);
    set({
      phase: 'play',
      objective: `Find the phota things: 0 / ${items.length}`,
      hint: matchMedia('(pointer: coarse)').matches
        ? 'Left thumb: walk (push all the way to run) · Drag: turn camera · Pinch: zoom'
        : 'WASD / arrows: walk · Shift: run · Drag or Q/E: turn camera · Scroll: zoom · C: see my face',
    });
    // testing: &money=1 (Papa's ₹500 already in his pocket), &gifts=biscuit,box (already bought)
    if (params.has('money')) gotMoney = 1;
    for (const g of (params.get('gifts') || '').split(',')) if (SI[g]) buy(g);
    if (params.has('phota')) {
      for (const it of items) if (!it.got) collect(it);
      place(player, L.didi[0] + 0.8, L.didi[1] - 1.3, Math.PI);
      phota();
    }
    const act = params.get('do');            // testing: ?do=bonk|talk|steal|selfie|pronam|shop  (&who=maa|baba)
    if (act) {
      const who = params.get('who');
      if (act === 'shop') place(player, SHOP[0] + 0.3, SHOP[1] + 1.4, 0);   // just in front of the stall
      else if (who === 'maa') { maaGreeted = true; place(player, MAA_SPOT[0] - 0.2, MAA_SPOT[1] - 1.5, Math.PI); }
      else if (who === 'baba') place(player, CHAIR[0] + 0.3, CHAIR[1] - 1.6, Math.PI);
      else place(player, L.didi[0] + 0.3, L.didi[1] - 1.15, Math.PI);
      if (act === 'steal') collect(items.find((i) => i.id === 'mishti'));
      if (act === 'walk') {                 // walk (or &run) up and down the street, camera &cam=side|back|front
        place(player, -8, -5.6, Math.PI / 2);
        walkTest = { cam: params.get('cam') || 'side', v: params.has('run') ? RUN : WALK, dir: 1 };
        // frame-by-frame gait check: __gait(0..1) freezes him at that point of the step cycle
        window.__gait = (u) => { player.holdPhase = true; player.phase = u * Math.PI * 2; player.root.position.x = 0; };
        cine = true;
        return;
      }
      if (act === 'grab') {                 // walk onto the chandan, then look at where it was
        const it = L.items.find((i) => i.id === 'chandan');
        place(player, it.x - 0.6, it.y - 0.6, 0.8);
        await wait(2.5);
        cine = true;
        shot(V(it.x - 1.8, it.y - 2.6, 1.7), V(it.x, it.y, 0.6));
        return;
      }
      await wait(1.0);
      game[act]?.();
    }
  }
  function roam() {
    onRoam?.();
    onRoam = null;
    cine = false;
    colliders(true);
    set({ phase: 'roam' });
    follow(false);
  }

  // ------------------------------------------------------------ frame update
  function update(rawDt) {
    const dt = Math.min(rawDt, AUTO ? 0.25 : 0.05);
    const phase = st().phase;
    updateTweens(dt);
    if (phase === 'title') controls.rotate(dt * 0.08, 0, false);
    if ((phase === 'play' || phase === 'roam') && !cine) {
      if (input.keys.has('KeyQ')) controls.rotate(1.8 * dt, 0, true);
      if (input.keys.has('KeyE')) controls.rotate(-1.8 * dt, 0, true);
    }
    if (walkTest) {
      const p = player.root.position, w = walkTest;
      if (p.x > 8) w.dir = -1;
      if (p.x < -8) w.dir = 1;
      if (!player.holdPhase) p.x += w.v * w.dir * dt;
      player.targetYaw = w.dir * Math.PI / 2;
      player.move = 1;
      player.walkSpeed = w.v;
      player.pose = 'walk';
      const cp = { side: [0, 1.05, 3.4], back: [-3.2 * w.dir, 1.9, 0.2], front: [3.0 * w.dir, 1.6, 0.4] }[w.cam];
      controls.setLookAt(p.x + cp[0], cp[1], p.z + cp[2], p.x, w.cam === 'side' ? 0.85 : 1.35, p.z, false);
    } else if ((phase === 'play' || phase === 'roam') && !busy) movePlayer(dt);
    else if (!player.scripted) {
      // talking / cutscenes: he stops walking (and doesn't keep stepping on the spot)
      player.move = lerp(player.move, 0, Math.min(1, dt * 10));
      if (player.move < 0.05) { player.move = 0; player.walkSpeed = 0; }
      if (player.move === 0 && player.pose === 'walk') player.pose = 'rest';
    }
    gameplay(dt);
    updateAngry(dt);
    updateHolds();
    player.update(dt);
    for (const c of Object.values(npcs)) c.update(dt);   // Honey, Maa and Baba are posed every frame too
    afterPose?.();
    if ((phase === 'play' || phase === 'roam') && !cine) follow();
    occlusion();
    updateParticles(dt);
    sky.position.copy(camera.position);
  }

  // testing: ?view=pose  -> both characters side by side in the front yard, cycling poses
  async function poseView() {
    set({ phase: 'ceremony' });
    cine = true;
    busy = true;
    place(player, 1.6, -1.6, 0);
    place(sister, 3.0, -1.6, 0);
    place(maa, 0.2, -1.6, 0);             // all four of them in a row
    maa.root.position.y = 0;
    releaseHold(baba);
    paper.visible = false;
    place(baba, 4.4, -1.6, 0);
    for (const it of items) it.g.visible = false;
    const look = V(2.3, -1.6, 1.0);
    const cam = params.get('cam') || 'front';
    const camPos = { front: V(2.3, -6.4, 1.4), side: V(7.6, -2.2, 1.3), arms: V(2.3, -4.6, 1.3), papa: V(4.4, -3.4, 1.45), papaback: V(4.4, -0.25, 1.45) }[cam];
    if (cam === 'papa') look.copy(V(4.4, -1.6, 1.25));
    if (cam === 'papaback') look.copy(V(4.4, -1.6, 1.05));
    shot(camPos, look, false);
    const thala = makeThala();
    scene.add(thala);
    thala.visible = false;
    const poses = (params.get('poses') || 'rest,cross,wave,hold,walk,reach').split(',');
    for (;;) {
      for (const p of poses) {
        releaseHold(sister);
        thala.visible = false;
        player.move = sister.move = maa.move = baba.move = 0;
        player.pose = sister.pose = maa.pose = baba.pose = p === 'walk' || p === 'hold' || p === 'reach' ? 'rest' : p;
        if (p === 'hold') {
          thala.visible = true;
          holds.set(sister, { obj: thala, half: 0.17, anchor: new THREE.Vector3(0, 1.0, 0.3) });
          holds.set(player, { obj: thala.clone(), half: 0.17, anchor: new THREE.Vector3(0, 1.05, 0.32) });
          scene.add(holds.get(player).obj);
        }
        if (p === 'reach') {
          player.hand.R = player.root.localToWorld(new THREE.Vector3(-0.15, 1.45, 0.45));
          sister.hand.R = sister.root.localToWorld(new THREE.Vector3(-0.12, 1.35, 0.4));
        }
        if (p === 'walk') player.move = sister.move = maa.move = baba.move = 1;
        toast('pose: ' + p, 2400);
        await wait(2.5);
        if (holds.get(player)) scene.remove(holds.get(player).obj);
        releaseHold(player);
        player.move = sister.move = 0;
      }
    }
  }

  game = { update, start, talk, bonk, steal, selfie, pronam, pinch, money, shop, phota, roam, lookAtMe };
  if (params.get('view') === 'pose') poseView();
  else if (params.has('autostart')) start();
  else set({ phase: 'title' });
  return game;
}
