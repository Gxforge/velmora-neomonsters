// 16-Bit Chiptune Audio Manager for Velmora: Neo Monsters Arena

export type BgmTrack = 'citadel' | 'battle_4v4' | 'pvp_wager';
export type SfxType = 'attack' | 'ultimate' | 'evolve' | 'capture' | 'coin';

const BGM_URLS: Record<BgmTrack, string> = {
  citadel: '/assets/audio/bgm_citadel.wav',
  battle_4v4: '/assets/audio/bgm_battle_4v4.wav',
  pvp_wager: '/assets/audio/bgm_pvp_wager.wav',
};

const SFX_URLS: Record<SfxType, string> = {
  attack: '/assets/audio/sfx_attack.wav',
  ultimate: '/assets/audio/sfx_ultimate.wav',
  evolve: '/assets/audio/sfx_evolve.wav',
  capture: '/assets/audio/sfx_capture.wav',
  coin: '/assets/audio/sfx_coin.wav',
};

class SoundController {
  private bgmAudio: HTMLAudioElement | null = null;
  private currentTrack: BgmTrack = 'citadel';
  public isMuted: boolean = false;
  public isPlayingBgm: boolean = false;

  public playBgm(track: BgmTrack) {
    this.currentTrack = track;
    if (this.isMuted) return;
    try {
      if (this.bgmAudio) {
        this.bgmAudio.pause();
      }
      this.bgmAudio = new Audio(BGM_URLS[track]);
      this.bgmAudio.loop = true;
      this.bgmAudio.volume = 0.28;
      this.bgmAudio.play().then(() => {
        this.isPlayingBgm = true;
      }).catch(() => {
        // Autoplay blocked until first user interaction
        this.isPlayingBgm = false;
      });
    } catch {
      // Ignore audio errors
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      if (this.bgmAudio) {
        this.bgmAudio.pause();
      }
      this.isPlayingBgm = false;
    } else {
      this.playBgm(this.currentTrack);
    }
    return this.isMuted;
  }

  public playSfx(sfx: SfxType) {
    if (this.isMuted) return;
    try {
      const a = new Audio(SFX_URLS[sfx]);
      a.volume = 0.45;
      a.play().catch(() => {});
    } catch {
      // Ignore
    }
  }
}

export const soundManager = new SoundController();
