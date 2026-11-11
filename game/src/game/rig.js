import * as THREE from 'three';

// Character rig built on the Blender skeleton (bones: hips, spine, chest, neck, head,
// clavicle/upperarm/forearm/hand _L/_R, thigh/shin/foot _L/_R). Rest pose is an A-pose.
// Every frame the bones are reset to rest and posed procedurally: legs and arms are solved
// with 2-bone IK so hands can really hold things (thala, gift) and feet stay on the ground.
// All pose targets are measured from each character's own shoulders and limb lengths,
// so the same poses fit Bhaiya, Honey, Maa and Baba.
// Character-local space: +Z = front, +X = the character's left, +Y = up, root at the feet.

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;

function rotWorld(bone, axisW, angle) {
  bone.parent.getWorldQuaternion(_q);
  _q2.setFromAxisAngle(axisW, angle);
  const local = _q.clone().invert().multiply(_q2).multiply(_q);
  bone.quaternion.premultiply(local);
  bone.updateMatrixWorld(true);
}

function aimBone(bone, child, target) {
  const b = bone.getWorldPosition(new THREE.Vector3());
  const cur = child.getWorldPosition(new THREE.Vector3()).sub(b);
  const des = target.clone().sub(b);
  if (cur.lengthSq() < 1e-10 || des.lengthSq() < 1e-10) return;
  const q = new THREE.Quaternion().setFromUnitVectors(cur.normalize(), des.normalize());
  bone.parent.getWorldQuaternion(_q);
  bone.quaternion.premultiply(_q.clone().invert().multiply(q).multiply(_q));
  bone.updateMatrixWorld(true);
}

function ik2(a, b, c, target, pole, la, lb) {
  const S = a.getWorldPosition(new THREE.Vector3());
  const d = target.clone().sub(S);
  const dist = clamp(d.length(), Math.abs(la - lb) + 1e-3, la + lb - 1e-3);
  const dir = d.normalize();
  const cosA = clamp((la * la + dist * dist - lb * lb) / (2 * la * dist), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  const p = pole.clone().sub(S);
  p.addScaledVector(dir, -p.dot(dir));
  if (p.lengthSq() < 1e-8) p.set(0, 0, 1);
  p.normalize();
  const elbow = S.clone().addScaledVector(dir, la * cosA).addScaledVector(p, la * sinA);
  aimBone(a, b, elbow);
  aimBone(b, c, S.clone().addScaledVector(dir, dist));
}

export class Character {
  constructor(model, { name }) {
    this.name = name;
    this.root = new THREE.Group();
    this.root.name = name + '_root';
    this.model = model;
    this.root.add(model);
    this.bones = {};
    this.mats = [];
    model.traverse((o) => {
      if (o.isBone) this.bones[o.name] = o;
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
        for (const m of [].concat(o.material)) {
          m.envMapIntensity = 0.35;
          this.mats.push(m);
        }
      }
    });
    this.rest = {};
    for (const [n, b] of Object.entries(this.bones)) this.rest[n] = b.quaternion.clone();
    this.root.updateMatrixWorld(true);
    const wp = (n) => this.bones[n].getWorldPosition(new THREE.Vector3());
    this.len = {};
    for (const s of ['L', 'R']) {
      this.len['arm' + s] = [wp('upperarm_' + s).distanceTo(wp('forearm_' + s)), wp('forearm_' + s).distanceTo(wp('hand_' + s))];
      this.len['leg' + s] = [wp('thigh_' + s).distanceTo(wp('shin_' + s)), wp('shin_' + s).distanceTo(wp('foot_' + s))];
    }
    this.restLocal = {};
    for (const n of Object.keys(this.bones)) this.restLocal[n] = wp(n);
    this.hipsY = this.restLocal.hips.y;
    this.ankleY = this.restLocal.foot_L.y;
    this.legLen = this.len.legL[0] + this.len.legL[1];
    // how the feet sit at rest (flat on the floor); kept that way while the legs bend
    this.restFootQ = {};
    for (const s of ['L', 'R']) this.restFootQ[s] = this.bones['foot_' + s].getWorldQuaternion(new THREE.Quaternion());
    // state the game sets
    this.t = 0;
    this.phase = 0;
    this.move = 0;             // 0..1 walking amount
    this.walkSpeed = 0;        // actual ground speed (m/s), set by the game, times the steps
    this.sitting = false;
    this.seatY = 0.66;
    this.crouch = 0;           // lowers the body; legs bend to keep the feet planted
    this.pose = 'rest';        // rest | walk | cross | wave | happy | peace | angry | ulu | clap  (rest = arms relaxed at the sides)
    this.hand = { L: null, R: null };   // world-space hand targets that override the pose
    this.lookAt = null;        // world point to look at
    this.look = { yaw: 0, pitch: 0 };   // eased head turn (so the head never snaps)
    this.run = 0;              // 0 = walking gait, 1 = running gait (from the speed)
    this.armOut = 0.04;        // how far out the relaxed hands hang (bulky jackets need more)
    this.armDrop = 0.95;       // how far down they hang (closer to 1 = straighter arms)
    this.stance = 1;           // how wide the feet are when standing (men stand wider)
    this.toeOut = 0.05;        // toes turned outwards (rad)
    this.kneeOut = 0.05;       // knees pointing a little outwards, over the feet
    this.lean = 0;
    this.bounce = 0;
    this.targetYaw = 0;
  }

  // anchor points on the face (found by ray casting onto the model at rest)
  setupFace(foreheadY, mouthY, headTopY) {
    const rc = new THREE.Raycaster();
    const find = (y) => {
      rc.set(new THREE.Vector3(0, y, 1), new THREE.Vector3(0, 0, -1));
      const hit = rc.intersectObject(this.model, true)[0];
      return new THREE.Vector3(0, y, hit ? hit.point.z : 0.1);
    };
    const mk = (pos, out) => {
      const o = new THREE.Object3D();
      o.position.copy(pos).add(new THREE.Vector3(0, 0, out));
      this.root.add(o);
      this.root.updateMatrixWorld(true);
      this.bones.head.attach(o);
      return o;
    };
    this.forehead = mk(find(foreheadY), 0.004);
    this.mouth = mk(find(mouthY), 0.02);
    this.headTop = mk(new THREE.Vector3(0, headTopY ?? foreheadY + 0.12, this.restLocal.head.z), 0);
  }

  palm(side) {
    const h = this.bones['hand_' + side].getWorldPosition(new THREE.Vector3());
    const f = this.bones['forearm_' + side].getWorldPosition(new THREE.Vector3());
    return h.add(h.clone().sub(f).normalize().multiplyScalar(0.07));
  }

  update(dt) {
    this.t += dt;
    let d = this.targetYaw - this.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.root.rotation.y += d * Math.min(1, dt * 10);
    for (const [n, b] of Object.entries(this.bones)) b.quaternion.copy(this.rest[n]);
    // ---- gait. Each foot is planted for part of the cycle and slides back exactly as fast
    // as the body moves forward, so it stays put on the ground (no skating); then it lifts,
    // swings forward and lands heel first. The cycle speed comes from the real ground speed.
    const legLen = this.legLen;
    const walking = this.move > 0.05 && !this.sitting;
    // walkSpeed < 0 = stepping backwards (the cycle simply runs in reverse)
    const vs = Math.abs(this.walkSpeed) > 0.05 ? this.walkSpeed : 1.4 * this.move;
    const v = Math.abs(vs);
    this.run = lerp(this.run, walking ? clamp((v - 2.6) / 1.6, 0, 1) : 0, Math.min(1, dt * 6));
    const r = this.run, mv = walking ? this.move : 0;
    const stride = legLen * lerp(0.4, 0.5, r) * mv;     // foot reach in front of / behind the hip
    const S = lerp(0.5, 0.36, r);                        // share of the cycle a foot is on the ground
    if (walking && !this.holdPhase) this.phase += Math.sign(vs) * dt * Math.PI * S * v / Math.max(stride, 0.1 * legLen);
    const ph = this.phase;
    let bodyY = 0;
    if (this.sitting) bodyY = this.seatY - this.hipsY;
    else if (walking) {
      const bobWalk = -(0.5 + 0.5 * Math.cos(2 * ph)) * 0.05;                  // lowest with both feet down
      const bobRun = 0.03 - (0.5 + 0.5 * Math.cos(2 * (ph - Math.PI * S))) * 0.05; // highest in the air
      bodyY = lerp(bobWalk, bobRun, r) * mv;
    }
    this.model.position.y = bodyY + this.bounce - this.crouch;
    this.root.updateMatrixWorld(true);
    const R = this.root;
    const W = (x, y, z) => R.localToWorld(new THREE.Vector3(x, y, z));
    const axisX = new THREE.Vector3(1, 0, 0).applyQuaternion(R.quaternion);
    const breathe = Math.sin(this.t * 1.8) * 0.012;
    const twist = Math.cos(ph) * lerp(0.06, 0.15, r) * mv;     // shoulders swing against the hips
    rotWorld(this.bones.spine, axisX, this.lean + breathe + lerp(0.03, 0.13, r) * mv);   // upright walk, lean into a run
    if (walking) {
      rotWorld(this.bones.chest, UP, twist);
      rotWorld(this.bones.neck, UP, -twist);                    // the head keeps looking ahead
    }

    // head look-at (small yaw/pitch, eased in and out)
    let wantYaw = 0, wantPitch = 0;
    if (this.lookAt) {
      const hp = this.bones.head.getWorldPosition(new THREE.Vector3());
      const to = this.lookAt.clone().sub(hp);
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(R.quaternion);
      wantYaw = clamp(Math.atan2(to.dot(axisX), to.dot(fwd)), -0.9, 0.9);
      wantPitch = clamp(Math.atan2(to.y, Math.hypot(to.dot(axisX), to.dot(fwd))), -0.3, 0.3);
    }
    const ke = Math.min(1, dt * 5);
    this.look.yaw = lerp(this.look.yaw, wantYaw, ke);
    this.look.pitch = lerp(this.look.pitch, wantPitch, ke);
    if (Math.abs(this.look.yaw) + Math.abs(this.look.pitch) > 1e-3) {
      rotWorld(this.bones.neck, UP, this.look.yaw * 0.45);
      rotWorld(this.bones.head, UP, this.look.yaw * 0.45);
      rotWorld(this.bones.head, new THREE.Vector3(1, 0, 0).applyQuaternion(this.bones.neck.getWorldQuaternion(new THREE.Quaternion())), -this.look.pitch * 0.6);
    }

    // legs
    const lift = legLen * lerp(0.12, 0.2, r) * mv, heelUp = 0.065 * legLen * mv;
    const smooth = (x) => x * x * (3 - 2 * x);
    for (const s of ['L', 'R']) {
      const hip = this.restLocal['thigh_' + s];
      const sx = Math.sign(hip.x);
      const [la, lb] = this.len['leg' + s];
      let target, pitch = 0;
      if (this.sitting) {
        target = W(hip.x * 1.15 * this.stance, this.ankleY, la);
      } else if (walking) {
        const u = (((ph + (s === 'L' ? 0 : Math.PI)) / (2 * Math.PI)) % 1 + 1) % 1;
        let z, y;
        if (u < S) {                       // planted: the body rolls over it
          const w = u / S;
          const heel = clamp((w - 0.7) / 0.3, 0, 1);           // heel peels up before the toes leave
          z = stride * (1 - 2 * w);
          y = heel * heel * heelUp;
          pitch = heel * 0.5 - 0.3 * Math.max(0, 1 - w / 0.15);
        } else {                           // swing: knee up, foot forward, toes up to land on the heel
          const w = (u - S) / (1 - S);
          z = stride * (2 * smooth(w) - 1);
          y = Math.sin(Math.PI * w) * lift + (1 - w) * heelUp;
          pitch = lerp(0.5, -0.3, smooth(w));
        }
        target = W(hip.x * 0.9 * Math.sqrt(this.stance), this.ankleY + y, z + 0.02);
        pitch *= mv;
      } else {
        target = W(hip.x * 1.05 * this.stance, this.ankleY, 0.02 + this.crouch * 0.3);
      }
      const pole = W(hip.x * this.stance + sx * this.kneeOut, this.hipsY * 0.6, 1.5);
      const foot = this.bones['foot_' + s];
      ik2(this.bones['thigh_' + s], this.bones['shin_' + s], foot, target, pole, la, lb);
      // keep the foot flat on the floor (or rolled for heel-strike / toe-off) whatever the knee does
      const want = new THREE.Quaternion().setFromAxisAngle(UP, sx * this.toeOut)
        .multiply(new THREE.Quaternion().setFromAxisAngle(axisX, pitch))
        .multiply(R.quaternion.clone().multiply(this.restFootQ[s]));
      foot.parent.getWorldQuaternion(_q);
      foot.quaternion.copy(_q.invert().multiply(want));
      foot.updateMatrixWorld(true);
    }

    // arms: placed relative to the character's own shoulder, with the elbows kept low
    for (const s of ['L', 'R']) {
      const sx = s === 'L' ? 1 : -1;
      const sh = this.restLocal['upperarm_' + s];
      const [la, lb] = this.len['arm' + s];
      const L = la + lb;
      const ax = Math.abs(sh.x), sy = sh.y + this.model.position.y; // follows the body when sitting/crouching
      let target = this.hand[s];
      let pole = W(sx * (ax + 0.85 * L), sy - 1.15 * L, 0.1 * L); // elbows down and slightly out
      const rest = (dz = 0) => (this.sitting
        ? W(sx * (ax - 0.08 * L), sy - 0.8 * L, 0.5 * L)          // hands resting on the lap
        : W(sx * (ax + this.armOut * L), sy - lerp(this.armDrop, 0.62, r * mv) * L, (0.08 + 0.14 * r * mv) * L + dz));  // running: elbows bent
      // walking arms: a pendulum from the shoulder, opposite to the legs (left arm forward
      // with the right foot). The whole arm swings, the hand travels on an arc clear of the
      // thigh and the elbow softens on the forward swing. Running: elbows bent, bigger pumps.
      const swingArm = () => {
        const c = -Math.cos(ph + (s === 'L' ? 0 : Math.PI));        // +1 = this hand fully forward
        const a = mv * (lerp(0.36, 0.85, r) * c + 0.06);             // swing angle (rad), a bit more forward than back
        const reach = lerp(0.97 - 0.07 * Math.max(0, c) * mv, 0.66, r * mv) * L;
        // (running: hands stay close to the body and come slightly inwards on the forward swing)
        const dx = sx * (this.armOut + 0.05 * mv * (1 - r) - 0.08 * r * mv * Math.max(0, c)) * L, dz0 = 0.06 * L;
        const dy = -Math.sqrt(Math.max(0, reach * reach - dx * dx - dz0 * dz0));
        const y = dy * Math.cos(a) + dz0 * Math.sin(a), z = -dy * Math.sin(a) + dz0 * Math.cos(a);
        return W(sx * ax + dx, sy + y, sh.z + z);
      };
      if (!target) {
        const sw = 0;
        const wv = Math.sin(this.t * 9);
        switch (this.pose) {
          case 'angry': {    // hands on the waist, elbows out to the sides (full "hmph!" mode)
            const waistY = this.restLocal.spine.y + this.model.position.y + 0.02;
            target = W(sx * (ax * 0.8 + 0.05), waistY, 0.03);
            pole = W(sx * (ax + 1.2 * L), sy - 0.35 * L, -0.3 * L);
            break;
          }
          case 'cross':      // forearms folded across the tummy, elbows at the sides
            target = s === 'L' ? W(-0.06 * L, sy - 0.45 * L, 0.36 * L) : W(0.06 * L, sy - 0.39 * L, 0.41 * L);
            pole = W(sx * (ax + 0.66 * L), sy - 1.35 * L, 0.0);
            break;
          case 'wave':       // a small "hi" with the forearm up, elbow down
            if (s === 'R') {
              target = W(-(ax + 0.19 * L), sy + 0.11 * L + wv * 0.04 * L, 0.32 * L + wv * 0.11 * L);
              pole = W(-(ax + 0.76 * L), sy - 1.35 * L, 0.0);
            } else target = rest();
            break;
          case 'happy':
            target = W(sx * (ax + 0.15 * L), sy + 0.19 * L + Math.sin(this.t * 10 + sx) * 0.05 * L, 0.3 * L);
            pole = W(sx * (ax + 0.76 * L), sy - 1.35 * L, 0.0);
            break;
          case 'peace':      // photo: hand up beside the face (not in front of it)
            if (s === 'R') {
              target = W(-(ax + 0.13 * L), sy + 0.25 * L, 0.19 * L);
              pole = W(-(ax + 0.85 * L), sy - 1.15 * L, 0.0);
            } else target = rest();
            break;
          case 'ulu':        // ulu-dhwani: right hand at the mouth
            if (s === 'R' && this.mouth) {
              target = this.mouth.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, -0.06, 0)).addScaledVector(new THREE.Vector3(-1, 0, 1).applyQuaternion(R.quaternion), 0.06);
              pole = W(-(ax + 0.7 * L), sy - 1.2 * L, 0.0);
            } else target = rest();
            break;
          case 'clap': {     // hands meeting in front, again and again
            const open = 0.5 + 0.5 * Math.sin(this.t * 16);
            target = W(sx * (0.03 + 0.1 * open) * L, sy - 0.32 * L, 0.5 * L);
            pole = W(sx * (ax + 0.7 * L), sy - 1.3 * L, 0.0);
            break;
          }
          default:
            target = walking ? swingArm() : rest(sw);
            // elbows point back; when running they stay tucked in (not flaring out sideways)
            pole = W(sx * (ax + lerp(0.76, 0.12, r * mv) * L), sy - lerp(0.55, 0.3, r * mv) * L, -lerp(1.15, 1.7, r * mv) * L);
        }
      }
      ik2(this.bones['upperarm_' + s], this.bones['forearm_' + s], this.bones['hand_' + s], target, pole, la, lb);
    }
  }

  setTint(hex, amount) {
    for (const m of this.mats) {
      if (!m.emissive) continue;
      m.emissive.set(hex);
      m.emissiveIntensity = amount;
    }
  }
}

export { lerp, clamp };
