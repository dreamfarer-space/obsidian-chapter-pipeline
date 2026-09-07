type AudioContextConstructor = new () => AudioContextLike;

interface AudioParamLike {
  value?: number;
  setValueAtTime?: (value: number, time: number) => void;
  exponentialRampToValueAtTime?: (value: number, time: number) => void;
}

interface AudioNodeLike {
  connect: (destination: AudioNodeLike) => void;
}

interface OscillatorLike extends AudioNodeLike {
  type: string;
  frequency: AudioParamLike;
  start: (when?: number) => void;
  stop: (when?: number) => void;
}

interface GainLike extends AudioNodeLike {
  gain: AudioParamLike;
}

interface FilterLike extends AudioNodeLike {
  type: string;
  frequency: AudioParamLike;
  Q: AudioParamLike;
}

interface AudioContextLike {
  currentTime: number;
  state?: string;
  destination: AudioNodeLike;
  resume?: () => Promise<void>;
  close?: () => Promise<void>;
  createGain: () => GainLike;
  createOscillator: () => OscillatorLike;
  createBiquadFilter: () => FilterLike;
}

/** Small Web Audio synthesizer used for tactile navigation feedback. */
export class SoundEngine {
  private static lastAudioContextClass: AudioContextConstructor | null = null;
  private ctx: AudioContextLike | null = null;
  private lastScrollTime = 0;

  private getAudioContext(): AudioContextLike | null {
    if (!this.ctx) {
      const globalWindow = typeof window !== 'undefined' ? window as unknown as {
        AudioContext?: AudioContextConstructor;
        webkitAudioContext?: AudioContextConstructor;
      } : undefined;
      const globalObject = typeof globalThis !== 'undefined' ? globalThis as typeof globalThis & {
        AudioContext?: AudioContextConstructor;
        webkitAudioContext?: AudioContextConstructor;
      } : undefined;
      const AudioContextClass = globalWindow?.AudioContext
        || globalWindow?.webkitAudioContext
        || globalObject?.AudioContext
        || globalObject?.webkitAudioContext
        || SoundEngine.lastAudioContextClass;
      if (AudioContextClass) {
        SoundEngine.lastAudioContextClass = AudioContextClass;
        try {
          this.ctx = new AudioContextClass();
        } catch {
          this.ctx = null;
        }
      }
    }

    if (this.ctx?.state === 'suspended') this.ctx.resume?.().catch(() => undefined);
    return this.ctx;
  }

  destroy(): void {
    if (!this.ctx) return;
    try {
      this.ctx.close?.().catch(() => undefined);
    } catch {
      // Audio is optional; teardown must never prevent Obsidian from unloading.
    }
    this.ctx = null;
  }

  playClick(volumePct = 50): void {
    if (volumePct <= 0) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const masterGain = ctx.createGain();
      const volume = (Math.max(0, Math.min(100, volumePct)) / 100) * 0.12;
      masterGain.gain.setValueAtTime?.(volume, now);
      masterGain.connect(ctx.destination);

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime?.(1850, now);
      filter.Q.setValueAtTime?.(3.5, now);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime?.(1200, now);
      osc.frequency.exponentialRampToValueAtTime?.(400, now + 0.022);
      gain.gain.setValueAtTime?.(1, now);
      gain.gain.exponentialRampToValueAtTime?.(0.001, now + 0.024);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.027);

      const lowOsc = ctx.createOscillator();
      const lowGain = ctx.createGain();
      lowOsc.type = 'sine';
      lowOsc.frequency.setValueAtTime?.(450, now);
      lowOsc.frequency.exponentialRampToValueAtTime?.(180, now + 0.016);
      lowGain.gain.setValueAtTime?.(0.6, now);
      lowGain.gain.exponentialRampToValueAtTime?.(0.001, now + 0.018);
      lowOsc.connect(lowGain);
      lowGain.connect(masterGain);
      lowOsc.start(now);
      lowOsc.stop(now + 0.021);
    } catch {
      // Audio is a progressive enhancement and may be unavailable on mobile.
    }
  }

  playScrollTick(volumePct = 50): void {
    if (volumePct <= 0) return;
    const nowMs = Date.now();
    if (nowMs - this.lastScrollTime < 75) return;
    this.lastScrollTime = nowMs;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const masterGain = ctx.createGain();
      const volume = (Math.max(0, Math.min(100, volumePct)) / 100) * 0.045;
      masterGain.gain.setValueAtTime?.(volume, now);
      masterGain.connect(ctx.destination);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime?.(820, now);
      osc.frequency.exponentialRampToValueAtTime?.(300, now + 0.014);
      gain.gain.setValueAtTime?.(0.8, now);
      gain.gain.exponentialRampToValueAtTime?.(0.001, now + 0.016);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.018);
    } catch {
      // Ignore browser-specific Web Audio failures.
    }
  }
}

export default SoundEngine;
