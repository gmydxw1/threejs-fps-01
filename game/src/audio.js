// Synthesised sound: every effect is built from oscillators and filtered noise, so
// the game ships no audio files and makes no network request. Created lazily on the
// first user gesture; a headless run without audio just stays silent.
export function createAudio() {
  let ctx = null;
  let master = null;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function noiseBurst(duration, filterFreq, gainValue, type = 'lowpass') {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(t);
  }

  function tone(freq, duration, gainValue, type = 'sine', slideTo = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + duration);
  }

  return {
    unlock() { ensure(); },
    shot(kind) {
      // Rifle cracks loud, pistol snaps, SMG chatters, DMR booms.
      if (kind === 'dmr') { noiseBurst(0.22, 900, 0.9); tone(120, 0.12, 0.4, 'square', 50); }
      else if (kind === 'smg') noiseBurst(0.09, 1800, 0.5);
      else if (kind === 'pistol') noiseBurst(0.12, 1400, 0.55);
      else noiseBurst(0.14, 1200, 0.7);
    },
    dryFire() { tone(900, 0.03, 0.12, 'square'); },
    reload() {
      tone(1400, 0.04, 0.15, 'square');
      setTimeout(() => tone(900, 0.05, 0.15, 'square'), 260);
      setTimeout(() => tone(1700, 0.04, 0.15, 'square'), 520);
    },
    hit(head) {
      tone(head ? 2400 : 1700, 0.05, 0.2, 'sine');
    },
    kill() {
      tone(660, 0.08, 0.22, 'sine');
      setTimeout(() => tone(990, 0.1, 0.22, 'sine'), 80);
    },
    hurt() { noiseBurst(0.15, 500, 0.5); tone(180, 0.12, 0.2, 'sawtooth', 90); },
    step() { noiseBurst(0.05, 400, 0.08); },
    plantBeep(final) { tone(final ? 1800 : 1200, 0.07, 0.25, 'sine'); },
    bombTick() { tone(1500, 0.05, 0.2, 'square'); },
    explosion() {
      noiseBurst(1.2, 300, 1.0);
      tone(60, 1.0, 0.6, 'sine', 30);
    },
    horn(win) {
      tone(win ? 523 : 392, 0.35, 0.25, 'triangle');
      setTimeout(() => tone(win ? 784 : 523, 0.5, 0.25, 'triangle'), 180);
    },
    buy() { tone(880, 0.06, 0.18, 'sine'); setTimeout(() => tone(1320, 0.08, 0.18, 'sine'), 70); },
    denied() { tone(220, 0.12, 0.2, 'square'); },
  };
}
