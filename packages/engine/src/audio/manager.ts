export type AudioTier = 'bgm' | 'bgs' | 'me' | 'se';

export interface AudioPlayOptions {
  readonly volume?: number; // 0 to 1
  readonly loop?: boolean;
  readonly speed?: number;
}

// Minimal interface for @pixi/sound to avoid requiring browser document at import time in headless Node
export interface SoundLike {
  volumeAll: number;
  exists(alias: string): boolean;
  isPlaying(alias?: string): boolean;
  play(alias: string, options?: { loop?: boolean; volume?: number; speed?: number }): unknown;
  stop(alias?: string): unknown;
  resumeContext(): Promise<void>;
}

export class AudioManager {
  private static instance: AudioManager;

  private soundBackend: SoundLike | null = null;
  private currentBgm: string | null = null;
  private currentBgs: string | null = null;

  private masterVolume: number = 1.0;
  private bgmVolume: number = 0.8;
  private bgsVolume: number = 0.7;
  private meVolume: number = 0.9;
  private seVolume: number = 0.9;

  private unlocked: boolean = false;

  public static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  public setBackend(backend: SoundLike | null): void {
    this.soundBackend = backend;
    if (this.soundBackend) {
      this.soundBackend.volumeAll = this.masterVolume;
    }
  }

  public async getSound(): Promise<SoundLike | null> {
    if (this.soundBackend) {
      return this.soundBackend;
    }

    if (typeof document !== 'undefined') {
      try {
        const mod = await import('@pixi/sound');
        this.soundBackend = mod.sound as unknown as SoundLike;
        this.soundBackend.volumeAll = this.masterVolume;
        return this.soundBackend;
      } catch {
        return null;
      }
    }

    return null;
  }

  public isUnlocked(): boolean {
    return this.unlocked;
  }

  public setupUnlockHandler(): () => void {
    if (typeof window === 'undefined') {
      this.unlocked = true;
      return () => {};
    }

    const unlock = () => {
      this.unlocked = true;
      if (this.soundBackend && typeof this.soundBackend.resumeContext === 'function') {
        try {
          this.soundBackend.resumeContext();
        } catch {
          // Ignore audio context resumption errors
        }
      }

      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };

    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });

    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }

  public async playBGM(alias: string, options: AudioPlayOptions = {}): Promise<void> {
    const sound = await this.getSound();
    if (this.currentBgm === alias && sound?.isPlaying(alias)) {
      return;
    }
    this.stopBGM();
    this.currentBgm = alias;

    if (sound?.exists(alias)) {
      sound.play(alias, {
        loop: options.loop ?? true,
        volume: (options.volume ?? 1) * this.bgmVolume * this.masterVolume,
        speed: options.speed ?? 1,
      });
    }
  }

  public stopBGM(): void {
    if (this.currentBgm && this.soundBackend?.exists(this.currentBgm)) {
      this.soundBackend.stop(this.currentBgm);
    }
    this.currentBgm = null;
  }

  public async playBGS(alias: string, options: AudioPlayOptions = {}): Promise<void> {
    const sound = await this.getSound();
    this.stopBGS();
    this.currentBgs = alias;

    if (sound?.exists(alias)) {
      sound.play(alias, {
        loop: options.loop ?? true,
        volume: (options.volume ?? 1) * this.bgsVolume * this.masterVolume,
        speed: options.speed ?? 1,
      });
    }
  }

  public stopBGS(): void {
    if (this.currentBgs && this.soundBackend?.exists(this.currentBgs)) {
      this.soundBackend.stop(this.currentBgs);
    }
    this.currentBgs = null;
  }

  public async playME(alias: string, options: AudioPlayOptions = {}): Promise<void> {
    const sound = await this.getSound();
    if (sound?.exists(alias)) {
      sound.play(alias, {
        loop: false,
        volume: (options.volume ?? 1) * this.meVolume * this.masterVolume,
        speed: options.speed ?? 1,
      });
    }
  }

  public async playSE(alias: string, options: AudioPlayOptions = {}): Promise<void> {
    const sound = await this.getSound();
    if (sound?.exists(alias)) {
      sound.play(alias, {
        loop: false,
        volume: (options.volume ?? 1) * this.seVolume * this.masterVolume,
        speed: options.speed ?? 1,
      });
    }
  }

  public setVolume(tier: AudioTier | 'master', volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    switch (tier) {
      case 'master':
        this.masterVolume = clamped;
        if (this.soundBackend) this.soundBackend.volumeAll = clamped;
        break;
      case 'bgm': this.bgmVolume = clamped; break;
      case 'bgs': this.bgsVolume = clamped; break;
      case 'me': this.meVolume = clamped; break;
      case 'se': this.seVolume = clamped; break;
    }
  }

  public getVolume(tier: AudioTier | 'master'): number {
    switch (tier) {
      case 'master': return this.masterVolume;
      case 'bgm': return this.bgmVolume;
      case 'bgs': return this.bgsVolume;
      case 'me': return this.meVolume;
      case 'se': return this.seVolume;
    }
  }
}
