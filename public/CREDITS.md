# Velmora: Neo Monsters Arena — Credits, Provenance & Licenses

All visual and audio assets bundled in **Velmora: Neo Monsters Arena** (`public/assets/`) are cleared for commercial and production distribution under **CC0 1.0 Universal (Public Domain Dedication)**, **Public Domain**, or **First-Party Original Generation**.

---

## 1. Music & Sound Effects (`public/assets/audio/`)

All 8 audio files are authentic external chiptune and RPG sound recordings downloaded from **Wikimedia Commons** (see `public/assets/audio/audio_manifest.json` for SHA-level metadata):

| File Path | Role | Source Title | Author | License | Source URL |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/assets/audio/bgm_citadel.opus` | Citadel Hub & Sanctuary BGM | *8-bit Music for GameDev - 02. Perilous Dungeon* | HydroGene | CC0 1.0 Universal (Public Domain) | https://commons.wikimedia.org/wiki/File:8-bit_Music_for_GameDev_-_02._Perilous_Dungeon.opus |
| `/assets/audio/bgm_battle_4v4.opus` | 4v4 Tactical Arena BGM | *8-bit Music for GameDev - 01. Slay The Evil* | HydroGene | CC0 1.0 Universal (Public Domain) | https://commons.wikimedia.org/wiki/File:8-bit_Music_for_GameDev_-_01._Slay_The_Evil.opus |
| `/assets/audio/bgm_pvp_wager.opus` | High-Stakes PvP Wager Arena BGM | *8-bit Music for GameDev - 03. Boss Battle* | HydroGene | CC0 1.0 Universal (Public Domain) | https://commons.wikimedia.org/wiki/File:8-bit_Music_for_GameDev_-_03._Boss_Battle.opus |
| `/assets/audio/sfx_attack.ogg` | Tactical Skill Strike SFX | *Explosion 10* | tcpp | Public Domain | https://commons.wikimedia.org/wiki/File:Explosion_10.ogg |
| `/assets/audio/sfx_ultimate.ogg` | Ultimate Elemental Cataclysm SFX | *Juno-60-jp4* | Raymangold22 | CC0 1.0 Universal (Public Domain) | https://commons.wikimedia.org/wiki/File:Juno-60-jp4.ogg |
| `/assets/audio/sfx_evolve.wav` | Monster Evolution Ceremony Fanfare | *415061 gsb1039 clock-chime-tubebells-handbells-vibes* | gsb1039 (Freesound / Wikimedia) | CC0 1.0 Universal (Public Domain) | https://commons.wikimedia.org/wiki/File:415061_gsb1039_clock-chime-tubebells-handbells-vibes.wav |
| `/assets/audio/sfx_capture.ogg` | Monster Capture Orb Success SFX | *Mini Acerto - Atenção* | Rafael Tavares Juliani | CC0 1.0 Universal (Public Domain) | https://commons.wikimedia.org/wiki/File:Mini_Acerto_-_Aten%C3%A7%C3%A3o.ogg |
| `/assets/audio/sfx_coin.ogg` | Gold / TON / Stars Transaction SFX | *Sound Effect - Door Bell* | Wikimedia Commons Community | CC0 1.0 Universal (Public Domain) | https://commons.wikimedia.org/wiki/File:Sound_Effect_-_Door_Bell.ogg |

---

## 2. Background Scenes (`public/assets/scenes/`)

All 4 high-definition 2D pixel-art environment scenes were generated specifically for **Velmora: Neo Monsters Arena** as original first-party production artwork:

| File Path | Scene Purpose | Provenance | License |
| :--- | :--- | :--- | :--- |
| `/assets/scenes/title_hero_bg.png` | Title & Starter Selection Banner (Floating Elemental Islands) | First-Party Original AI 2D Pixel Art (`generate_image`) | First-Party Commercial / Royalty-Free |
| `/assets/scenes/citadel_hub_bg.png` | Citadel Resource Hub (Gold Mine, Essence Reactor, Sanctuary, Forge) | First-Party Original AI 2D Pixel Art (`generate_image`) | First-Party Commercial / Royalty-Free |
| `/assets/scenes/battle_arena_bg.png` | 4v4 Tactical Battle Arena Colosseum | First-Party Original AI 2D Pixel Art (`generate_image`) | First-Party Commercial / Royalty-Free |
| `/assets/scenes/summon_altar_bg.png` | Astral Summoning & Evolution Sanctuary | First-Party Original AI 2D Pixel Art (`generate_image`) | First-Party Commercial / Royalty-Free |

---

## 3. Monster Portraits (`public/assets/monsters/`) & 6×4 Sprite Sheets (`public/assets/spritesheets/`)

All 18 monster species feature anatomically distinct silhouettes and full 6-row × 4-column (`512×768 px`, `128×128 px` per cell) animation sprite sheets (`idle`, `idle_alt`, `attack`, `hit`, `faint`, `evolve`) compiled via `scripts/build_production_assets.py`:

- **Fire (`pyro_1`, `pyro_2`, `pyro_3`), Water (`hydro_1`, `hydro_2`, `hydro_3`), Earth (`terra_1`, `terra_2`, `terra_3`), and Storm Stage 1 (`volt_1`)**: First-Party Original 2D Pixel Art creature renders (`scripts/raw_monsters/*.png`), quantized to crisp 64×64 pixel-art grids with alpha flood-fill extraction.
- **Storm Stages 2–3 (`volt_2`, `volt_3`), Light Stages 1–3 (`lux_1`, `lux_2`, `lux_3`), and Shadow Stages 1–3 (`umbra_1`, `umbra_2`, `umbra_3`)**: Adapted from **Dungeon Crawl Stone Soup (`crawl/crawl` RLTiles)** (`mon/animals/raiju.png`, `mon/dragons/storm_dragon.png`, `mon/animals/bennu.png`, `mon/holy/daeva.png`, `mon/holy/seraph.png`, `mon/demons/shadow_imp.png`, `mon/demons/reaper.png`, `mon/abyss/herald_of_the_abyss.png`), released under **CC0 1.0 / Public Domain** (`https://github.com/crawl/crawl/blob/master/crawl-ref/source/rltiles/license.txt`).

---

## 4. 2D Pixel Art UI, Currency, Item, Elemental & Building Icons (`public/assets/icons/`)

All 24 game icons are derived from **Dungeon Crawl Stone Soup (`crawl/crawl` RLTiles)** (`item/`, `gui/spells/`, `gui/invocations/`, `dngn/gateways/`, `player/head/`), released under **CC0 1.0 / Public Domain** (`https://github.com/crawl/crawl/blob/master/crawl-ref/source/rltiles/license.txt`), upscaled via Nearest-Neighbor to `96×96 px`.
