// Tiny synthesised sound effects (no audio files needed).
let ctx = null;
export function audio() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, t0, dur, type = 'sine', vol = 0.12) {
  const a = audio();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noise(t0, dur, vol, freq = 1200) {
  const a = audio();
  if (!a) return;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource();
  const f = a.createBiquadFilter();
  const g = a.createGain();
  src.buffer = buf;
  f.type = 'bandpass';
  f.frequency.value = freq;
  g.gain.value = vol;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t0);
}

const now = () => (audio() ? audio().currentTime : 0);

export const SFX = {
  ding() { const t = now(); tone(880, t, 0.3); tone(1318, t + 0.08, 0.4); },
  pop() { tone(520, now(), 0.15, 'triangle', 0.1); },
  chime() { const t = now(); [523, 659, 784, 1046].forEach((f, i) => tone(f, t + i * 0.12, 0.6)); },
  gate() { const t = now(); tone(180, t, 0.5, 'sawtooth', 0.04); tone(140, t + 0.25, 0.6, 'sawtooth', 0.03); },
  bonk() { const t = now(); tone(190, t, 0.18, 'square', 0.12); tone(120, t + 0.02, 0.25, 'sine', 0.2); noise(t, 0.08, 0.4, 900); },
  steam() { noise(now(), 0.6, 0.12, 3000); },
  shutter() { const t = now(); noise(t, 0.05, 0.5, 2500); noise(t + 0.08, 0.06, 0.4, 1800); },
  shankh() {
    const a = audio();
    if (!a) return;
    const t = a.currentTime;
    const o = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain();
    const lfo = a.createOscillator(), lg = a.createGain();
    o.type = 'sawtooth'; o.frequency.value = 233;
    f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 4;
    lfo.frequency.value = 5; lg.gain.value = 3;
    lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.13, t + 0.45);
    g.gain.setValueAtTime(0.13, t + 1.7); g.gain.linearRampToValueAtTime(0, t + 2.3);
    o.connect(f).connect(g).connect(a.destination);
    o.start(t); lfo.start(t); o.stop(t + 2.4); lfo.stop(t + 2.4);
  },
  ulu() {
    const a = audio();
    if (!a) return;
    const t = a.currentTime + 0.4;
    const o = a.createOscillator(), g = a.createGain(), lfo = a.createOscillator(), lg = a.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(900, t); o.frequency.linearRampToValueAtTime(1050, t + 1.8);
    lfo.frequency.value = 13; lg.gain.value = 170;
    lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.07, t + 0.1);
    g.gain.setValueAtTime(0.07, t + 1.7); g.gain.linearRampToValueAtTime(0, t + 2.0);
    o.connect(g).connect(a.destination);
    o.start(t); lfo.start(t); o.stop(t + 2.1); lfo.stop(t + 2.1);
  },
};
