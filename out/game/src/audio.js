// Every sound is synthesised with WebAudio: an engine hum that follows the
// throttle, wind that follows speed, and a chime, a thud and a crunch for
// the moments that matter. No audio files, no network.
export function createAudio() {
  const audio = {
    ctx: null,
    muted: false,
    engineOsc: null,
    engineGain: null,
    windSource: null,
    windGain: null,
    windFilter: null,
  };

  audio.unlock = () => {
    if (audio.ctx) {
      if (audio.ctx.state === 'suspended') audio.ctx.resume();
      return;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audio.ctx = new Ctx();
    } catch (e) {
      audio.ctx = null;
      return;
    }
    // Engine: two detuned saws through a lowpass, pitch follows throttle.
    audio.engineOsc = audio.ctx.createOscillator();
    audio.engineOsc.type = 'sawtooth';
    audio.engineOsc.frequency.value = 52;
    const engineOsc2 = audio.ctx.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 55;
    audio.engineGain = audio.ctx.createGain();
    audio.engineGain.gain.value = 0;
    const engineFilter = audio.ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 320;
    audio.engineOsc.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(audio.engineGain);
    audio.engineGain.connect(audio.ctx.destination);
    audio.engineOsc.start();
    engineOsc2.start();
    audio.engineOsc2 = engineOsc2;
    // Wind: looped noise through a bandpass, loudness follows speed.
    const length = audio.ctx.sampleRate * 2;
    const buffer = audio.ctx.createBuffer(1, length, audio.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    audio.windSource = audio.ctx.createBufferSource();
    audio.windSource.buffer = buffer;
    audio.windSource.loop = true;
    audio.windFilter = audio.ctx.createBiquadFilter();
    audio.windFilter.type = 'bandpass';
    audio.windFilter.frequency.value = 480;
    audio.windFilter.Q.value = 0.6;
    audio.windGain = audio.ctx.createGain();
    audio.windGain.gain.value = 0;
    audio.windSource.connect(audio.windFilter);
    audio.windFilter.connect(audio.windGain);
    audio.windGain.connect(audio.ctx.destination);
    audio.windSource.start();
  };

  // Called every frame while flying: engine and wind track the plane.
  audio.update = (throttle, speed, airborne) => {
    if (!audio.ctx || audio.muted) return;
    const t = audio.ctx.currentTime;
    const engineLevel = airborne || throttle > 0.05 ? 0.05 + throttle * 0.075 : 0;
    audio.engineGain.gain.setTargetAtTime(engineLevel, t, 0.1);
    audio.engineOsc.frequency.setTargetAtTime(48 + throttle * 62, t, 0.1);
    audio.engineOsc2.frequency.setTargetAtTime(51 + throttle * 66, t, 0.1);
    const windLevel = airborne ? Math.min(0.14, speed * 0.0016) : 0;
    audio.windGain.gain.setTargetAtTime(windLevel, t, 0.15);
    audio.windFilter.frequency.setTargetAtTime(320 + speed * 9, t, 0.2);
  };

  function tone(freq, when, dur, type, level) {
    if (!audio.ctx || audio.muted) return;
    const osc = audio.ctx.createOscillator();
    const gain = audio.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(level, when + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(gain);
    gain.connect(audio.ctx.destination);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }

  audio.ring = () => {
    if (!audio.ctx) return;
    const t = audio.ctx.currentTime;
    tone(880, t, 0.35, 'sine', 0.22);
    tone(1318, t + 0.09, 0.45, 'sine', 0.18);
  };

  audio.thud = () => {
    if (!audio.ctx) return;
    const t = audio.ctx.currentTime;
    tone(90, t, 0.3, 'sine', 0.4);
    tone(55, t + 0.05, 0.35, 'triangle', 0.3);
  };

  audio.crash = () => {
    if (!audio.ctx || audio.muted) return;
    const t = audio.ctx.currentTime;
    const dur = 0.7;
    const buffer = audio.ctx.createBuffer(1, audio.ctx.sampleRate * dur, audio.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const src = audio.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = audio.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const gain = audio.ctx.createGain();
    gain.gain.value = 0.5;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(audio.ctx.destination);
    src.start(t);
    tone(70, t, 0.6, 'sine', 0.4);
  };

  audio.toggleMute = () => {
    audio.muted = !audio.muted;
    if (audio.ctx && audio.engineGain) {
      audio.engineGain.gain.value = 0;
      audio.windGain.gain.value = 0;
    }
    return audio.muted;
  };

  return audio;
}
