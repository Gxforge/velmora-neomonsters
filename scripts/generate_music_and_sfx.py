#!/usr/bin/env python3
"""
Velmora: Neo Monsters Arena - 16-Bit RPG Chiptune Music & SFX Synthesizer
Generates real, seamless loopable WAV audio tracks & retro RPG sound effects
in /home/user/public/assets/audio/
"""

import os
import wave
import math
import numpy as np

AUDIO_DIR = "/home/user/public/assets/audio"
os.makedirs(AUDIO_DIR, exist_ok=True)

SAMPLE_RATE = 22050  # Crisp retro 16-bit PCM rate (fast loading in Telegram Mini Apps)

NOTE_FREQS = {
    "C3": 130.81, "D3": 146.83, "Eb3": 155.56, "E3": 164.81, "F3": 174.61, "G3": 196.00, "Ab3": 207.65, "A3": 220.00, "Bb3": 233.08, "B3": 246.94,
    "C4": 261.63, "D4": 293.66, "Eb4": 311.13, "E4": 329.63, "F4": 349.23, "F#4": 369.99, "G4": 392.00, "Ab4": 415.30, "A4": 440.00, "Bb4": 466.16, "B4": 493.88,
    "C5": 523.25, "D5": 587.33, "Eb5": 622.25, "E5": 659.25, "F5": 698.46, "G5": 783.99, "Ab5": 830.61, "A5": 880.00, "Bb5": 932.33, "C6": 1046.50,
    "R": 0.0
}

def save_wav(filename: str, samples: np.ndarray):
    samples = np.clip(samples, -1.0, 1.0)
    pcm = (samples * 32767).astype(np.int16)
    path = os.path.join(AUDIO_DIR, filename)
    with wave.open(path, "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm.tobytes())
    print(f"Saved {filename} ({len(pcm)/SAMPLE_RATE:.1f}s)")

def synth_note(freq: float, dur: float, wave_type: str = "square", vol: float = 0.25) -> np.ndarray:
    n = int(SAMPLE_RATE * dur)
    if freq <= 0.0 or n == 0:
        return np.zeros(n, dtype=np.float32)
    t = np.linspace(0, dur, n, endpoint=False, dtype=np.float32)
    phase = 2.0 * np.pi * freq * t
    if wave_type == "square":
        sig = np.where(np.sin(phase) >= 0, 1.0, -1.0) * 0.6 + np.sin(phase) * 0.4
    elif wave_type == "triangle":
        sig = (2.0 / np.pi) * np.arcsin(np.sin(phase))
    elif wave_type == "pulse":
        sig = np.where((t * freq) % 1.0 < 0.25, 1.0, -0.5)
    else:
        sig = np.sin(phase)

    # ADSR envelope
    env = np.ones(n, dtype=np.float32)
    atk = min(int(0.015 * SAMPLE_RATE), n // 4)
    rel = min(int(0.04 * SAMPLE_RATE), n // 3)
    if atk > 0:
        env[:atk] = np.linspace(0, 1, atk)
    if rel > 0:
        env[-rel:] = np.linspace(1, 0.05, rel)
    return sig * env * vol

def generate_bgm_citadel():
    """Adventurous fantasy RPG town/citadel loop"""
    step = 0.22
    melody_notes = [
        "E4", "G4", "A4", "B4", "C5", "B4", "A4", "G4",
        "F4", "A4", "C5", "E5", "D5", "C5", "B4", "G4",
        "E4", "G4", "A4", "C5", "D5", "E5", "C5", "A4",
        "B4", "G4", "A4", "F4", "E4", "G4", "A4", "E4"
    ]
    bass_notes = [
        "A3", "E3", "A3", "E3", "A3", "E3", "A3", "G3",
        "F3", "C3", "F3", "C3", "G3", "D3", "G3", "D3",
        "A3", "E3", "A3", "E3", "F3", "C3", "F3", "D3",
        "E3", "B3", "F3", "D3", "A3", "E3", "A3", "E3"
    ]
    mel_track = np.concatenate([synth_note(NOTE_FREQS[n], step, "square", 0.22) for n in melody_notes])
    bass_track = np.concatenate([synth_note(NOTE_FREQS[n], step, "triangle", 0.28) for n in bass_notes])
    full = np.tile(mel_track + bass_track, 2)
    save_wav("bgm_citadel.wav", full)

def generate_bgm_battle_4v4():
    """Energetic 140 BPM 4v4 Neo Monsters tactical battle theme"""
    step = 0.14
    melody = [
        "A4", "A4", "C5", "A4", "D5", "C5", "E5", "D5",
        "F5", "E5", "D5", "C5", "B4", "G4", "B4", "D5",
        "A4", "A4", "C5", "A4", "E5", "D5", "G5", "E5",
        "F5", "E5", "D5", "C5", "B4", "C5", "A4", "A4"
    ]
    bass = [
        "A3", "A3", "E3", "A3", "A3", "A3", "G3", "A3",
        "F3", "F3", "C3", "F3", "G3", "G3", "D3", "G3",
        "A3", "A3", "E3", "A3", "C4", "C4", "G3", "C4",
        "F3", "F3", "G3", "G3", "E3", "E3", "A3", "E3"
    ]
    mel_track = np.concatenate([synth_note(NOTE_FREQS[n], step, "pulse", 0.24) for n in melody])
    bass_track = np.concatenate([synth_note(NOTE_FREQS[n], step, "triangle", 0.30) for n in bass])
    full = np.tile(mel_track + bass_track, 3)
    save_wav("bgm_battle_4v4.wav", full)

def generate_bgm_pvp_wager():
    """High-stakes PvP Real-Money Wager Arena theme"""
    step = 0.13
    melody = [
        "C5", "G4", "Eb5", "D5", "C5", "Bb4", "Ab4", "G4",
        "Ab4", "C5", "F5", "Eb5", "D5", "C5", "B4", "G4",
        "C5", "D5", "Eb5", "G5", "F5", "Eb5", "D5", "C5",
        "Ab4", "Bb4", "B4", "D5", "C5", "G4", "C5", "C5"
    ]
    bass = [
        "C3", "G3", "C3", "G3", "C3", "G3", "C3", "G3",
        "Ab3", "Eb3", "Ab3", "Eb3", "G3", "D3", "G3", "D3",
        "C3", "G3", "C3", "G3", "F3", "C3", "F3", "C3",
        "Ab3", "F3", "G3", "D3", "C3", "G3", "C3", "C3"
    ]
    mel_track = np.concatenate([synth_note(NOTE_FREQS[n], step, "square", 0.24) for n in melody])
    bass_track = np.concatenate([synth_note(NOTE_FREQS[n], step, "triangle", 0.30) for n in bass])
    full = np.tile(mel_track + bass_track, 3)
    save_wav("bgm_pvp_wager.wav", full)

def generate_sfx():
    # 1. Attack hit
    t = np.linspace(0, 0.22, int(SAMPLE_RATE * 0.22), dtype=np.float32)
    freq_sweep = np.linspace(520, 90, len(t))
    noise = np.random.uniform(-0.4, 0.4, len(t)).astype(np.float32)
    sig = (np.sin(2 * np.pi * freq_sweep * t) * 0.6 + noise * 0.4) * np.linspace(1.0, 0.0, len(t))
    save_wav("sfx_attack.wav", sig * 0.5)

    # 2. Ultimate skill blast
    t = np.linspace(0, 0.55, int(SAMPLE_RATE * 0.55), dtype=np.float32)
    sweep = np.linspace(180, 880, len(t))
    sig = (np.sin(2 * np.pi * sweep * t) + np.sin(4 * np.pi * sweep * t) * 0.5) * np.linspace(0.9, 0.05, len(t))
    save_wav("sfx_ultimate.wav", sig * 0.4)

    # 3. Evolution fanfare
    evo_notes = [("C4", 0.1), ("E4", 0.1), ("G4", 0.1), ("C5", 0.12), ("E5", 0.12), ("G5", 0.15), ("C6", 0.35)]
    evo_sig = np.concatenate([synth_note(NOTE_FREQS[n], d, "square", 0.32) for n, d in evo_notes])
    save_wav("sfx_evolve.wav", evo_sig)

    # 4. Capture orb success
    cap_notes = [("G4", 0.09), ("C5", 0.09), ("E5", 0.12), ("G5", 0.28)]
    cap_sig = np.concatenate([synth_note(NOTE_FREQS[n], d, "triangle", 0.35) for n, d in cap_notes])
    save_wav("sfx_capture.wav", cap_sig)

    # 5. Coin / Gold / TON collect
    coin_sig = np.concatenate([
        synth_note(NOTE_FREQS["B4"], 0.07, "square", 0.3),
        synth_note(NOTE_FREQS["E5"], 0.22, "square", 0.3)
    ])
    save_wav("sfx_coin.wav", coin_sig)

if __name__ == "__main__":
    generate_bgm_citadel()
    generate_bgm_battle_4v4()
    generate_bgm_pvp_wager()
    generate_sfx()

