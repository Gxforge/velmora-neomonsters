// Velmora Sound & Music Controller (External CC0 / Public Domain Audio from Wikimedia Commons)

type BgmTrack = 'citadel' | 'battle' | 'pvp';
type SfxType = 'attack' | 'ultimate' | 'evolve' | 'capture' | 'coin';

const BGM_PATHS: Record<BgmTrack, string> = {
  citadel: '/assets/audio/bgm_citadel.opus',
  battle: '/assets/audio/bgm_battle_4v4.opus',
  pvp: '/assets/audio/bgm_pvp_wager.opus',
};

const SFX_PATHS: Record<SfxType, string> = {
  attack: '/assets/audio/sfx_attack.ogg',
  ultimate: '/assets/audio/sfx_ultimate.ogg',
  evolve: '/assets/audio/sfx_evolve.wav',
  capture: '/assets/audio/sfx_capture.ogg',
  coin: '/assets/audio/sfx_coin.ogg',
};

class SoundController {
  private bgmAudio: HTMLAudioElement | null = null;
  private currentTrack: BgmTrack | null = null;
  public isMuted: boolean = false;

  constructor() {
    const saved = localStorage.getItem('velmora_muted');
    if (saved === 'true') this.isMuted = true;
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    localStorage.setItem('velmora_muted', String(this.isMuted));
    if (this.bgmAudio) {
      this.bgmAudio.muted = this.isMuted;
      if (!this.isMuted && this.bgmAudio.paused) {
        this.bgmAudio.play().catch(() => {});
      }
    }
    return this.isMuted;
  }

  public playBgm(track: BgmTrack) {
    if (this.currentTrack === track && this.bgmAudio && !this.bgmAudio.paused) {
      return;
    }
    this.currentTrack = track;
    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.bgmAudio = null;
    }
    const audio = new Audio(BGM_PATHS[track]);
    audio.loop = true;
    audio.volume = 0.35;
    audio.muted = this.isMuted;
    this.bgmAudio = audio;
    if (!this.isMuted) {
      audio.play().catch(() => {
        // Autoplay awaits user gesture
      });
    }
  }

  public playSfx(type: SfxType) {
    if (this.isMuted) return;
    try {
      const sfx = new Audio(SFX_PATHS[type]);
      sfx.volume = 0.6;
      sfx.play().catch(() => {});
    } catch {
      // Ignore audio errors on restricted devices
    }
  }
}

export const soundManager = new SoundController();
