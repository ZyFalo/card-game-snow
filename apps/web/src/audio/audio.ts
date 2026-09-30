/*
 * Audio sintetizado con WebAudio: no hay archivos externos, todo se genera en
 * el momento (sonidos de papel, golpes, destellos y una música generativa suave).
 */

export type SfxName =
  | 'select'
  | 'place'
  | 'confirm'
  | 'tick'
  | 'error'
  | 'move'
  | 'attack-fire'
  | 'attack-water'
  | 'attack-snow'
  | 'hit'
  | 'block'
  | 'ko'
  | 'shatter'
  | 'revive'
  | 'heal'
  | 'draw'
  | 'card-fire'
  | 'card-water'
  | 'card-snow'
  | 'combo'
  | 'spawn'
  | 'enemy-sniper'
  | 'enemy-artillery'
  | 'enemy-colossus'
  | 'stun'
  | 'burn'
  | 'shield'
  | 'round'
  | 'bonus'
  | 'victory'
  | 'defeat';

interface ToneOpts {
  type?: OscillatorType;
  freq: number;
  to?: number;
  dur: number;
  vol?: number;
  delay?: number;
  attack?: number;
}

interface NoiseOpts {
  dur: number;
  vol?: number;
  delay?: number;
  filter?: BiquadFilterType;
  freq?: number;
  to?: number;
  q?: number;
}

const PENTA = [146.83, 174.61, 196.0, 220.0, 261.63, 293.66, 349.23, 392.0, 440.0, 523.25];

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private sfxOn = true;
  private musicOn = true;
  private musicTimer: number | null = null;
  private nextNoteTime = 0;
  private step = 0;

  /** Crea el contexto tras el primer gesto del usuario (requisito de los navegadores). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxOn ? 1 : 0;
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicOn ? 0.32 : 0;
    this.musicBus.connect(this.master);
    const len = Math.floor(ctx.sampleRate * 1.5);
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    if (this.musicOn) this.startMusic();
  }

  setSfx(on: boolean): void {
    this.sfxOn = on;
    if (this.sfxBus && this.ctx) this.sfxBus.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    if (!this.ctx || !this.musicBus) return;
    this.musicBus.gain.setTargetAtTime(on ? 0.32 : 0, this.ctx.currentTime, 0.3);
    if (on) this.startMusic();
    else this.stopMusic();
  }

  private tone(o: ToneOpts, bus: GainNode | null = this.sfxBus): void {
    const ctx = this.ctx;
    if (!ctx || !bus) return;
    const t = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + o.dur);
    const vol = o.vol ?? 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (o.attack ?? 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g).connect(bus);
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
  }

  private noise(o: NoiseOpts): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || !this.noiseBuffer) return;
    const t = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = o.filter ?? 'bandpass';
    filter.frequency.setValueAtTime(o.freq ?? 1200, t);
    if (o.to) filter.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
    filter.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    const vol = o.vol ?? 0.15;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(filter).connect(g).connect(this.sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + o.dur + 0.05);
  }

  play(name: SfxName): void {
    if (!this.ctx || !this.sfxOn) return;
    switch (name) {
      case 'select':
        this.tone({ type: 'triangle', freq: 880, to: 1200, dur: 0.07, vol: 0.08 });
        this.noise({ dur: 0.04, vol: 0.05, freq: 4000 });
        break;
      case 'place':
        this.tone({ type: 'triangle', freq: 660, to: 990, dur: 0.1, vol: 0.12 });
        this.noise({ dur: 0.08, vol: 0.07, freq: 2500, filter: 'highpass' });
        break;
      case 'confirm':
        this.noise({ dur: 0.18, vol: 0.09, freq: 800, to: 3500, filter: 'bandpass' });
        this.tone({ type: 'triangle', freq: 523, dur: 0.12, vol: 0.12 });
        this.tone({ type: 'triangle', freq: 784, dur: 0.16, vol: 0.12, delay: 0.07 });
        break;
      case 'tick':
        this.tone({ type: 'sine', freq: 1100, dur: 0.05, vol: 0.09 });
        break;
      case 'error':
        this.tone({ type: 'square', freq: 220, to: 170, dur: 0.14, vol: 0.06 });
        break;
      case 'move':
        this.noise({ dur: 0.14, vol: 0.06, freq: 1400, q: 0.8 });
        this.noise({ dur: 0.1, vol: 0.05, freq: 2200, delay: 0.09 });
        break;
      case 'attack-fire':
        this.noise({ dur: 0.22, vol: 0.12, freq: 600, to: 3000, filter: 'bandpass' });
        this.tone({ type: 'sawtooth', freq: 420, to: 160, dur: 0.18, vol: 0.06 });
        break;
      case 'attack-water':
        this.noise({ dur: 0.2, vol: 0.18, freq: 500, to: 200, filter: 'lowpass' });
        this.tone({ type: 'sine', freq: 200, to: 70, dur: 0.18, vol: 0.2 });
        break;
      case 'attack-snow':
        this.tone({ type: 'triangle', freq: 1600, to: 2600, dur: 0.14, vol: 0.07 });
        this.noise({ dur: 0.12, vol: 0.06, freq: 5000, filter: 'highpass' });
        break;
      case 'hit':
        this.noise({ dur: 0.1, vol: 0.16, freq: 900, q: 1.4 });
        this.tone({ type: 'square', freq: 170, to: 90, dur: 0.1, vol: 0.07 });
        break;
      case 'block':
        this.tone({ type: 'sine', freq: 1250, dur: 0.25, vol: 0.12 });
        this.tone({ type: 'sine', freq: 1870, dur: 0.3, vol: 0.08, delay: 0.02 });
        break;
      case 'ko':
        this.noise({ dur: 0.35, vol: 0.14, freq: 1200, to: 300 });
        this.tone({ type: 'triangle', freq: 440, to: 110, dur: 0.45, vol: 0.12 });
        break;
      case 'shatter':
        for (let i = 0; i < 4; i++)
          this.tone({ type: 'sine', freq: 1800 + i * 420, dur: 0.12, vol: 0.05, delay: i * 0.03 });
        this.noise({ dur: 0.25, vol: 0.12, freq: 3500, filter: 'highpass' });
        break;
      case 'revive':
        [523, 659, 784, 1046].forEach((f, i) => {
          this.tone({ type: 'sine', freq: f, dur: 0.18, vol: 0.1, delay: i * 0.06 });
        });
        break;
      case 'heal':
        [784, 988, 1175].forEach((f, i) => {
          this.tone({ type: 'sine', freq: f, dur: 0.22, vol: 0.07, delay: i * 0.07 });
        });
        this.noise({ dur: 0.3, vol: 0.03, freq: 6000, filter: 'highpass' });
        break;
      case 'draw':
        this.noise({ dur: 0.07, vol: 0.08, freq: 3000, filter: 'highpass' });
        this.tone({ type: 'triangle', freq: 1046, to: 1568, dur: 0.1, vol: 0.08, delay: 0.03 });
        break;
      case 'card-fire':
        this.noise({ dur: 0.6, vol: 0.18, freq: 300, to: 2600, filter: 'lowpass' });
        this.tone({ type: 'sawtooth', freq: 180, to: 520, dur: 0.45, vol: 0.06 });
        this.tone({ type: 'sine', freq: 90, to: 45, dur: 0.5, vol: 0.2, delay: 0.4 });
        break;
      case 'card-water':
        this.noise({ dur: 0.8, vol: 0.2, freq: 300, to: 1500, filter: 'lowpass' });
        this.noise({ dur: 0.5, vol: 0.12, freq: 1500, to: 250, filter: 'lowpass', delay: 0.4 });
        break;
      case 'card-snow':
        for (let i = 0; i < 7; i++) {
          this.tone({ type: 'sine', freq: 1400 + Math.random() * 1600, dur: 0.18, vol: 0.05, delay: i * 0.07 });
        }
        this.noise({ dur: 0.6, vol: 0.05, freq: 7000, filter: 'highpass' });
        break;
      case 'combo':
        for (const [f, d] of [
          [196, 0],
          [294, 0.03],
          [392, 0.06],
          [587, 0.1],
        ] as const) {
          this.tone({ type: 'sine', freq: f, dur: 1.4, vol: 0.12, delay: d, attack: 0.02 });
        }
        this.noise({ dur: 0.9, vol: 0.1, freq: 400, to: 5000, filter: 'bandpass' });
        break;
      case 'spawn':
        this.noise({ dur: 0.5, vol: 0.12, freq: 200, to: 600, filter: 'lowpass' });
        this.tone({ type: 'sine', freq: 1500, dur: 0.2, vol: 0.05, delay: 0.3 });
        break;
      case 'enemy-sniper':
        this.tone({ type: 'sine', freq: 2200, to: 1300, dur: 0.16, vol: 0.08 });
        this.noise({ dur: 0.15, vol: 0.07, freq: 4000, filter: 'highpass' });
        break;
      case 'enemy-artillery':
        this.noise({ dur: 0.3, vol: 0.16, freq: 400, to: 150, filter: 'lowpass', delay: 0.25 });
        this.tone({ type: 'sine', freq: 130, to: 55, dur: 0.3, vol: 0.2, delay: 0.25 });
        break;
      case 'enemy-colossus':
        this.noise({ dur: 0.35, vol: 0.2, freq: 220, filter: 'lowpass' });
        this.tone({ type: 'sine', freq: 85, to: 38, dur: 0.4, vol: 0.28 });
        break;
      case 'stun':
        this.tone({ type: 'triangle', freq: 700, to: 500, dur: 0.3, vol: 0.06 });
        this.tone({ type: 'triangle', freq: 900, to: 650, dur: 0.3, vol: 0.05, delay: 0.1 });
        break;
      case 'burn':
        this.noise({ dur: 0.3, vol: 0.08, freq: 2400, q: 2 });
        break;
      case 'shield':
        this.tone({ type: 'sine', freq: 660, to: 990, dur: 0.3, vol: 0.08 });
        this.tone({ type: 'sine', freq: 1320, dur: 0.3, vol: 0.04, delay: 0.05 });
        break;
      case 'round':
        [392, 523, 659].forEach((f, i) => {
          this.tone({ type: 'triangle', freq: f, dur: 0.35, vol: 0.09, delay: i * 0.08 });
        });
        break;
      case 'bonus':
        [523, 659, 784, 1046, 1318].forEach((f, i) => {
          this.tone({ type: 'triangle', freq: f, dur: 0.3, vol: 0.08, delay: i * 0.07 });
        });
        break;
      case 'victory':
        [523, 659, 784, 1046].forEach((f, i) => {
          this.tone({ type: 'triangle', freq: f, dur: 0.4, vol: 0.11, delay: i * 0.13 });
        });
        this.tone({ type: 'sine', freq: 261.6, dur: 1.2, vol: 0.1, delay: 0.4, attack: 0.05 });
        break;
      case 'defeat':
        [392, 330, 262].forEach((f, i) => {
          this.tone({ type: 'sine', freq: f, dur: 0.5, vol: 0.1, delay: i * 0.25 });
        });
        break;
    }
  }

  /** Música generativa: pulsaciones pentatónicas y un colchón grave, a 72 BPM. */
  private startMusic(): void {
    if (!this.ctx || this.musicTimer !== null) return;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => this.schedule(), 100);
  }

  private stopMusic(): void {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    const beat = 60 / 72 / 2;
    while (this.nextNoteTime < ctx.currentTime + 0.25) {
      const t = this.nextNoteTime - ctx.currentTime;
      if (this.step % 16 === 0) {
        const root = [0, 3, 2, 4][Math.floor(this.step / 16) % 4] ?? 0;
        for (const k of [0, 2, 4]) {
          const f = (PENTA[(root + k) % PENTA.length] as number) / 2;
          this.tone({ type: 'sine', freq: f, dur: beat * 15, vol: 0.05, delay: t, attack: 0.6 }, this.musicBus);
        }
      }
      if (Math.random() < (this.step % 2 === 0 ? 0.55 : 0.2)) {
        const f = PENTA[Math.floor(Math.random() * PENTA.length)] as number;
        this.tone({ type: 'triangle', freq: f * 2, dur: 0.5, vol: 0.05, delay: t }, this.musicBus);
      }
      this.nextNoteTime += beat;
      this.step += 1;
    }
  }
}

export const audio = new AudioEngine();
