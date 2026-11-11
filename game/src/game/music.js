import { audio } from './audio';

// Background music, composed live in the browser (no audio files): a tanpura drone, a bansuri
// (flute) improvising in Raag Bhupali (Sa Re Ga Pa Dha, a bright festive pentatonic scale),
// a soft tabla in keherwa taal, and temple-bell chimes. During the phota it turns festive:
// fuller tabla and manjira cymbals. Every phrase is generated on the fly, so it never loops
// exactly.

const SA = 146.83;                    // Sa = D3
const SCALE = [0, 2, 4, 7, 9];        // Bhupali: Sa Re Ga Pa Dha (semitones)
const BPM = 78;
const SPB = 60 / BPM;                 // seconds per beat
const THEKA = ['dha', 'ge', 'na', 'ti', 'na', 'ka', 'dhi', 'na'];   // keherwa, 8 beats
const TANPURA = [0.75, 1, 1, 0.5];    // Pa (low), Sa, Sa, Sa (low): one pluck per beat

const freq = (deg, oct = 2) => {      // scale degree -> Hz (degree can run past the octave)
  const o = Math.floor(deg / 5), i = ((deg % 5) + 5) % 5;
  return SA * Math.pow(2, oct + o + SCALE[i] / 12);
};

let ctx = null, master = null, dry = null, send = null;
let timer = null, beatTime = 0, beat = 0, noteTime = 0, phrase = [], lastDeg = 0;
let mood = 'calm';
let enabled = true;
try { enabled = localStorage.getItem('bp-music') !== 'off'; } catch { /* storage blocked: default on */ }

function setup() {
  ctx = audio();
  if (!ctx || master) return !!ctx;
  master = ctx.createGain();
  master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.ratio.value = 3;
  master.connect(comp).connect(ctx.destination);
  dry = ctx.createGain();
  dry.connect(master);
  // a small courtyard reverb, made from decaying noise
  const len = Math.floor(ctx.sampleRate * 2.2);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  const verb = ctx.createConvolver();
  verb.buffer = ir;
  send = ctx.createGain();
  send.gain.value = 0.35;
  send.connect(verb).connect(master);
  return true;
}

function out(node, wet = 0.4) {        // route a voice to the mix (with some reverb)
  node.connect(dry);
  if (wet > 0) {
    const g = ctx.createGain();
    g.gain.value = wet;
    node.connect(g).connect(send);
  }
}

function env(g, t, peak, attack, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function noiseBuf(dur) {
  const b = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

// ---- voices
function tanpura(t, mult) {
  const f = SA * mult;
  const g = ctx.createGain();
  env(g, t, 0.05, 0.03, 3.4);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1500;
  const buzz = ctx.createBiquadFilter();       // the "jawari" shimmer sweeping down the harmonics
  buzz.type = 'bandpass';
  buzz.Q.value = 9;
  buzz.frequency.setValueAtTime(3200, t);
  buzz.frequency.exponentialRampToValueAtTime(700, t + 2.5);
  const bg = ctx.createGain();
  bg.gain.value = 0.5;
  for (const det of [-3, 3]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.detune.value = det;
    o.connect(lp);
    o.connect(buzz);
    o.start(t);
    o.stop(t + 3.6);
  }
  lp.connect(g);
  buzz.connect(bg).connect(g);
  out(g, 0.5);
}

function flute(t, f, dur, glideFrom) {
  const o = ctx.createOscillator();
  o.type = 'sine';
  if (glideFrom) {                      // meend: slide into the note
    o.frequency.setValueAtTime(glideFrom, t);
    o.frequency.exponentialRampToValueAtTime(f, t + Math.min(0.18, dur * 0.4));
  } else o.frequency.setValueAtTime(f, t);
  const o2 = ctx.createOscillator();    // a little body
  o2.type = 'triangle';
  o2.frequency.value = f * 2;
  const g2 = ctx.createGain();
  g2.gain.value = 0.12;
  const vib = ctx.createOscillator(), vg = ctx.createGain();
  vib.frequency.value = 5.2;
  vg.gain.setValueAtTime(0, t);
  vg.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(dur, 0.6));   // vibrato blooms on long notes
  vib.connect(vg).connect(o.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.075, t + 0.07);
  g.gain.setValueAtTime(0.075 * 0.85, t + Math.max(0.08, dur - 0.12));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.25);
  // breath
  const n = ctx.createBufferSource();
  n.buffer = noiseBuf(dur + 0.3);
  const nf = ctx.createBiquadFilter();
  nf.type = 'bandpass';
  nf.frequency.value = f * 2;
  nf.Q.value = 2;
  const ng = ctx.createGain();
  ng.gain.value = 0.05;
  n.connect(nf).connect(ng).connect(g);
  o.connect(g);
  o2.connect(g2).connect(g);
  out(g, 0.6);
  for (const x of [o, o2, vib, n]) { x.start(t); x.stop(t + dur + 0.35); }
}

function drum(t, f0, f1, decay, vol) {   // a membrane: pitch drops as it rings
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + decay * 0.6);
  const g = ctx.createGain();
  env(g, t, vol, 0.004, decay);
  o.connect(g);
  out(g, 0.25);
  o.start(t);
  o.stop(t + decay + 0.05);
}
function click(t, f, vol, decay = 0.05) {
  const n = ctx.createBufferSource();
  n.buffer = noiseBuf(decay + 0.02);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = f;
  bp.Q.value = 3;
  const g = ctx.createGain();
  env(g, t, vol, 0.002, decay);
  n.connect(bp).connect(g);
  out(g, 0.2);
  n.start(t);
}
function dayan(t, vol) {                 // the small drum, tuned to Sa
  drum(t, SA * 4, SA * 4 * 0.995, 0.32, vol);
  drum(t, SA * 8.1, SA * 8, 0.12, vol * 0.3);
  click(t, 3000, vol * 0.5, 0.03);
}
function tabla(t, bol, full) {
  const v = full ? 1 : 0.55;
  if (bol === 'dha' || bol === 'ge' || bol === 'dhi') drum(t, 120, 72, 0.45, 0.2 * v);
  if (bol === 'dha' || bol === 'na') dayan(t, 0.09 * v);
  if (bol === 'dhi') dayan(t, 0.06 * v);
  if (bol === 'ti' || bol === 'ka') click(t, 2400, 0.08 * v, 0.06);
}
function manjira(t, vol) {               // small hand cymbals
  click(t, 6500, vol, 0.5);
  const o = ctx.createOscillator();
  o.frequency.value = 3150;
  const g = ctx.createGain();
  env(g, t, vol * 0.25, 0.002, 0.7);
  o.connect(g);
  out(g, 0.5);
  o.start(t);
  o.stop(t + 0.75);
}
function bell(t, f = 1318) {             // temple bell: inharmonic partials, long ring
  [[1, 0.05], [2.76, 0.025], [5.4, 0.014], [8.9, 0.008]].forEach(([m, v]) => {
    const o = ctx.createOscillator();
    o.frequency.value = f * m;
    const g = ctx.createGain();
    env(g, t, v, 0.003, 3.2 / Math.sqrt(m));
    o.connect(g);
    out(g, 0.7);
    o.start(t);
    o.stop(t + 3.3);
  });
}

// ---- the improvising flute: short phrases that wander through the raag and settle on Sa/Pa/Ga
function makePhrase() {
  const notes = [];
  let deg = lastDeg, beats = 0;
  const len = 4 + Math.floor(Math.random() * 4);
  for (let i = 0; i < len; i++) {
    const step = [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)];
    deg = Math.max(-1, Math.min(7, deg + step));
    const d = [0.5, 0.5, 1, 1, 1, 1.5][Math.floor(Math.random() * 6)];
    notes.push({ deg, beats: d });
    beats += d;
  }
  // land on a resting note, held
  const rest = [0, 3, 5, 2][Math.floor(Math.random() * 4)];
  notes.push({ deg: rest, beats: 2 + Math.floor(Math.random() * 2) });
  lastDeg = rest;
  // silence between phrases (shorter when festive)
  notes.push({ deg: null, beats: (mood === 'festive' ? 1 : 3) + Math.floor(Math.random() * 3) });
  return notes;
}

function schedule() {
  if (!ctx) return;
  if (!enabled && master.gain.value < 0.001) {  // muted: stay silent (and in time) without playing notes
    beatTime = noteTime = ctx.currentTime + 0.1;
    return;
  }
  const ahead = ctx.currentTime + 0.25;
  if (beatTime < ctx.currentTime - 0.2) {      // the tab was asleep: pick up from now
    beatTime = noteTime = ctx.currentTime + 0.05;
  }
  const festive = mood === 'festive';
  while (beatTime < ahead) {
    const b = beat % 8;
    tanpura(beatTime, TANPURA[beat % 4]);
    if (beat >= 8) {                            // tabla joins after the first cycle
      tabla(beatTime, THEKA[b], festive);
      if (festive && (b === 1 || b === 3 || b === 5 || b === 7)) tabla(beatTime + SPB / 2, 'ti', true);
      if (festive && b % 2 === 0) manjira(beatTime, b === 0 || b === 4 ? 0.07 : 0.035);
    }
    if (b === 0 && beat % 32 === 0) bell(beatTime);
    if (festive && b === 0 && beat % 16 === 8) bell(beatTime, 1760);
    beatTime += SPB;
    beat++;
  }
  let prevF = null;
  while (noteTime < ahead) {
    if (!phrase.length) phrase = makePhrase();
    const n = phrase.shift();
    const dur = n.beats * SPB;
    if (n.deg !== null && beat > 4) {
      const f = freq(n.deg);
      flute(noteTime, f, dur * 0.95, prevF && Math.random() < 0.35 ? prevF : null);
      prevF = f;
    }
    noteTime += dur;
  }
}

export const music = {
  get on() { return enabled; },
  start() {
    if (!setup() || timer) { if (enabled) this.fade(); return; }
    beatTime = noteTime = ctx.currentTime + 0.1;
    beat = 0;
    timer = setInterval(schedule, 60);
    this.fade();
  },
  fade() {
    if (!master) return;
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(enabled ? 0.55 : 0, t + 1.2);
  },
  setMood(m) { mood = m; },
  toggle() {
    enabled = !enabled;
    try { localStorage.setItem('bp-music', enabled ? 'on' : 'off'); } catch { /* not saved */ }
    if (enabled && !timer) this.start();
    else this.fade();
    return enabled;
  },
};
