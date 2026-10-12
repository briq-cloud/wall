// Small synth blips through WebAudio: no sound files.
let ctx = null;
let master = null;
let muted = false;

function audio() {
  if (!ctx) {
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return null;
    ctx = new A();
    master = ctx.createGain();
    master.gain.value = 0.45;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur, { type = 'square', vol = 0.06, to, at = 0 } = {}) {
  if (muted) return;
  const c = audio();
  if (!c) return;
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

let noiseBuffer = null;
/** A burst of filtered noise: explosions, the fireball. */
function noise(dur, { vol = 0.25, from = 1800, to = 120, at = 0 } = {}) {
  if (muted) return;
  const c = audio();
  if (!c) return;
  if (!noiseBuffer) {
    noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const t0 = c.currentTime + at;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(from, t0);
  filter.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const gain = c.createGain();
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(gain).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

/** At most one of a kind per `gap` seconds, so a chain of explosions stays a sound. */
const lastPlayed = new Map();
function once(name, gap, play) {
  const now = performance.now() / 1000;
  if (now - (lastPlayed.get(name) ?? 0) < gap) return;
  lastPlayed.set(name, now);
  play();
}

const arpeggio = (notes, step, opts) => notes.forEach((f, i) => tone(f, step * 1.6, { ...opts, at: i * step }));

export const sound = {
  unlock: () => audio(),
  get muted() {
    return muted;
  },
  toggle() {
    muted = !muted;
    return muted;
  },
  wall: () => tone(240, 0.035, { type: 'triangle', vol: 0.05 }),
  paddle: () => tone(170, 0.08, { vol: 0.05, to: 250 }),
  brick: (row) => once('brick', 0.03, () => tone(330 + (10 - row) * 45, 0.07, { vol: 0.045 })),
  tough: () => tone(130, 0.09, { type: 'sawtooth', vol: 0.05 }),
  mark: () => arpeggio([660, 990], 0.05, { type: 'triangle', vol: 0.06 }),
  wake: () => arpeggio([520, 780], 0.08, { type: 'triangle', vol: 0.07 }),
  catch: () => arpeggio([523, 659, 784, 1047], 0.06, { type: 'triangle', vol: 0.07 }),
  lose: () => tone(300, 0.5, { type: 'sawtooth', vol: 0.05, to: 60 }),
  boom: () =>
    once('boom', 0.06, () => {
      noise(0.55, { vol: 0.35 });
      tone(90, 0.35, { type: 'sine', vol: 0.12, to: 40 });
    }),
  pop: () => once('pop', 0.05, () => noise(0.18, { vol: 0.16, from: 2400, to: 300 })),
  rocket: () => once('rocket', 0.05, () => tone(260, 0.12, { type: 'sawtooth', vol: 0.03, to: 900 })),
  fire: () => noise(0.6, { vol: 0.15, from: 400, to: 3000 }),
  clear: () => arpeggio([392, 523, 659, 784, 1047], 0.08, { type: 'triangle', vol: 0.07 }),
};
