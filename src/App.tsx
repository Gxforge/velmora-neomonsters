import React, { useEffect, useState } from 'react';
import {
  ELEMENT_META,
  MONSTER_SPECIES,
  OwnedMonster,
  SPECIES_BY_ID,
  STARTER_SPECIES,
} from './data/monstersData';
import {
  gameSupabase,
  getTelegramUserContext,
  PlayerProfile,
  syncMonstersToSupabase,
} from './lib/supabase';
import { soundManager } from './lib/audio';
import { BattleArena4v4 } from './components/BattleArena4v4';
import { CitadelHub } from './components/CitadelHub';
import { TeamSanctuary } from './components/TeamSanctuary';
import { CodexAndPixelQA } from './components/CodexAndPixelQA';
import { HybridStoreAndWallet } from './components/HybridStoreAndWallet';
import { AdminTreasuryPanel } from './components/AdminTreasuryPanel';
import { Volume2, VolumeX, Sparkles, RefreshCw } from 'lucide-react';

type NavTab = 'arena' | 'citadel' | 'sanctuary' | 'codex' | 'store' | 'admin';

const DEFAULT_INVENTORY: Record<string, number> = {
  essence_fire: 12,
  essence_water: 12,
  essence_earth: 12,
  essence_storm: 12,
  essence_light: 12,
  essence_shadow: 12,
  capture_orb_basic: 8,
  capture_orb_master: 2,
  xp_fruit: 15,
  evolution_crown: 3,
};

export function App() {
  const tgUser = getTelegramUserContext();

  const [profile, setProfile] = useState<PlayerProfile>(() => {
    const saved = localStorage.getItem('velmora_profile_v1');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // Fallback
      }
    }
    return {
      id: `local-${tgUser.telegramId}`,
      telegram_id: tgUser.telegramId,
      username: tgUser.username,
      first_name: tgUser.firstName,
      starter_chosen: null,
      gold: 2500,
      velmora_crystals: 150,
      ton_balance: 5.0,
      stars_balance: 250,
      energy: 100,
      max_energy: 100,
      trophies: 1000,
      wins: 0,
      losses: 0,
      campaign_stage: 1,
      referral_code: `REF_${tgUser.telegramId}`,
      referral_count: 3,
      referral_earnings_ton: 0.45,
      base_buildings: {
        gold_mine: { level: 1, last_collected: 0, rate_per_hour: 320 },
        essence_reactor: { level: 1, last_collected: 0, rate_per_hour: 15 },
        elemental_sanctuary: { level: 1, capacity: 16 },
        capture_forge: { level: 1, orbs_stored: 5 },
      },
      inventory: DEFAULT_INVENTORY,
    };
  });

  const [ownedMonsters, setOwnedMonsters] = useState<OwnedMonster[]>(() => {
    const saved = localStorage.getItem('velmora_monsters_v1');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {
        // Fallback
      }
    }
    return [];
  });

  const [activeTab, setActiveTab] = useState<NavTab>('arena');
  const [showStarterModal, setShowStarterModal] = useState<boolean>(
    !profile.starter_chosen || ownedMonsters.length === 0
  );
  const [previewStarterId, setPreviewStarterId] = useState<string>('pyro_1');
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Sync profile & monsters to localStorage & Supabase Game DB
  useEffect(() => {
    localStorage.setItem('velmora_profile_v1', JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem('velmora_monsters_v1', JSON.stringify(ownedMonsters));
  }, [ownedMonsters]);

  // Upsert player profile in Supabase Game DB on mount & updates
  useEffect(() => {
    const syncToDb = async () => {
      try {
        const { data } = await gameSupabase
          .from('players')
          .upsert(
            {
              telegram_id: profile.telegram_id,
              username: profile.username,
              first_name: profile.first_name,
              starter_chosen: profile.starter_chosen,
              gold: profile.gold,
              velmora_crystals: profile.velmora_crystals,
              ton_balance: profile.ton_balance,
              stars_balance: profile.stars_balance,
              trophies: profile.trophies,
              wins: profile.wins,
              losses: profile.losses,
              campaign_stage: profile.campaign_stage,
              referral_code: profile.referral_code,
              base_buildings: profile.base_buildings,
              inventory: profile.inventory,
            },
            { onConflict: 'telegram_id' }
          )
          .select('id')
          .single();

        if (data?.id && profile.id.startsWith('local-')) {
          setProfile((prev) => ({ ...prev, id: data.id }));
        }
      } catch {
        // Ignore offline/network errors
      }
    };
    syncToDb();
  }, [
    profile.starter_chosen,
    profile.gold,
    profile.ton_balance,
    profile.velmora_crystals,
    profile.wins,
  ]);

  // Choose 1 of the 6 Main Elemental Starters!
  const handleSelectStarter = (starterSpeciesId: string) => {
    const sp = SPECIES_BY_ID[starterSpeciesId];
    if (!sp) return;

    soundManager.playSfx('evolve');
    soundManager.playBgm('citadel');

    const starterMon: OwnedMonster = {
      instanceId: `starter_${starterSpeciesId}_${Date.now()}`,
      speciesId: starterSpeciesId,
      level: 5,
      xp: 0,
      teamSlot: 1, // Starts as #1 in the 4v4 lineup!
    };

    setProfile((prev) => ({
      ...prev,
      starter_chosen: starterSpeciesId,
    }));

    setOwnedMonsters((prev) => {
      const next = prev.length === 0 ? [starterMon] : [starterMon, ...prev.slice(1)];
      syncMonstersToSupabase(profile.id, next);
      return next;
    });

    setShowStarterModal(false);
  };

  // Add a captured monster during 4v4 Wild Expedition directly into the player's 4v4 team!
  const handleCaptureMonster = (speciesId: string, level: number) => {
    setOwnedMonsters((prev) => {
      const usedSlots = new Set(prev.map((m) => m.teamSlot).filter(Boolean));
      let nextSlot: number | null = null;
      for (let s = 1; s <= 8; s++) {
        if (!usedSlots.has(s)) {
          nextSlot = s;
          break;
        }
      }
      const captured: OwnedMonster = {
        instanceId: `cap_${speciesId}_${Date.now()}`,
        speciesId,
        level,
        xp: 0,
        teamSlot: nextSlot,
      };
      const updated = [...prev, captured];
      syncMonstersToSupabase(profile.id, updated);
      return updated;
    });
  };

  const previewSpecies = SPECIES_BY_ID[previewStarterId] || STARTER_SPECIES[0];
  const previewEvolutionStages = MONSTER_SPECIES.filter(
    (s) => s.family_id === previewSpecies.family_id
  ).sort((a, b) => a.stage - b.stage);

  return (
    <div className="min-h-screen bg-[#090b14] text-slate-100 pb-24">
      {/* Top Sticky Pixel Art HUD Header */}
      <header className="sticky top-0 z-30 bg-[#0b0e1a]/95 backdrop-blur-md border-b-2 border-slate-800 px-3 py-2">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2">
          {/* Brand & Player Badge */}
          <div className="flex items-center gap-2.5">
            <img
              src="/assets/icons/icon_summon_egg.png"
              alt="Velmora"
              className="w-9 h-9 pixelated bg-slate-900 rounded-lg border border-amber-500/60 p-0.5"
            />
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="font-pixel-title text-[11px] sm:text-xs text-amber-400">
                  VELMORA 4v4
                </h1>
                <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 border border-emerald-500/40 text-[10px] font-bold text-emerald-300">
                  🏆 {profile.trophies}
                </span>
              </div>
              <div className="text-[11px] text-slate-400">
                @{profile.username} • Equipo: {ownedMonsters.filter((m) => m.teamSlot && m.teamSlot <= 4).length}/4
              </div>
            </div>
          </div>

          {/* Currencies HUD Bar (Gold, Crystals, TON, Stars + Audio + Starter Switch) */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 px-2 py-1 rounded-lg text-xs font-bold text-amber-300">
              <img src="/assets/icons/icon_gold.png" className="w-4 h-4 pixelated" alt="Oro" />
              <span>{profile.gold.toLocaleString()}</span>
            </div>

            <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 px-2 py-1 rounded-lg text-xs font-bold text-cyan-300">
              <img
                src="/assets/icons/icon_crystals.png"
                className="w-4 h-4 pixelated"
                alt="Cristales"
              />
              <span>{profile.velmora_crystals}</span>
            </div>

            <div className="flex items-center gap-1 bg-sky-950/90 border border-sky-500/50 px-2 py-1 rounded-lg text-xs font-bold text-sky-300">
              <img src="/assets/icons/icon_ton.png" className="w-4 h-4 pixelated" alt="TON" />
              <span>{profile.ton_balance.toFixed(2)} TON</span>
            </div>

            <div className="hidden sm:flex items-center gap-1 bg-amber-950/80 border border-amber-500/40 px-2 py-1 rounded-lg text-xs font-bold text-amber-200">
              <img src="/assets/icons/icon_stars.png" className="w-4 h-4 pixelated" alt="Stars" />
              <span>{profile.stars_balance}</span>
            </div>

            <button
              onClick={() => setShowStarterModal(true)}
              title="Elegir Monstruo Inicial (1 de 6 Elementos)"
              className="px-2 py-1 rounded-lg bg-purple-900/80 hover:bg-purple-800 border border-purple-400/50 text-[11px] font-bold text-purple-200 flex items-center gap-1"
            >
              <Sparkles className="w-3.5 h-3.5" /> 6 Iniciales
            </button>

            <button
              onClick={() => {
                const muted = soundManager.toggleMute();
                setIsMuted(muted);
              }}
              title="Música Chiptune 16-Bit"
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-amber-400"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-6xl mx-auto px-3 pt-4">
        {activeTab === 'arena' && (
          <BattleArena4v4
            profile={profile}
            ownedMonsters={ownedMonsters}
            onUpdateProfile={setProfile}
            onCaptureMonster={handleCaptureMonster}
          />
        )}

        {activeTab === 'citadel' && (
          <CitadelHub profile={profile} onUpdateProfile={setProfile} />
        )}

        {activeTab === 'sanctuary' && (
          <TeamSanctuary
            profile={profile}
            ownedMonsters={ownedMonsters}
            onUpdateProfile={setProfile}
            onUpdateMonsters={setOwnedMonsters}
          />
        )}

        {activeTab === 'codex' && <CodexAndPixelQA />}

        {activeTab === 'store' && (
          <HybridStoreAndWallet profile={profile} onUpdateProfile={setProfile} />
        )}

        {activeTab === 'admin' && <AdminTreasuryPanel />}
      </main>

      {/* Bottom Fixed Pixel Art Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-[#0b0e1a]/95 backdrop-blur-md border-t-2 border-slate-800 px-2 py-1.5">
        <div className="max-w-4xl mx-auto grid grid-cols-6 gap-1.5">
          {[
            {
              id: 'arena' as NavTab,
              label: 'Arena 4v4',
              icon: '/assets/icons/icon_sword_pvp.png',
            },
            {
              id: 'sanctuary' as NavTab,
              label: 'Equipo & Evol.',
              icon: '/assets/icons/icon_summon_egg.png',
            },
            {
              id: 'citadel' as NavTab,
              label: 'Ciudadela & Mochila',
              icon: '/assets/icons/icon_backpack.png',
            },
            {
              id: 'codex' as NavTab,
              label: 'Hojas Diseño',
              icon: '/assets/icons/icon_codex.png',
            },
            {
              id: 'store' as NavTab,
              label: 'Tienda & TON',
              icon: '/assets/icons/icon_ton.png',
            },
            {
              id: 'admin' as NavTab,
              label: 'Admin / Casa',
              icon: '/assets/icons/icon_evo_crown.png',
            },
          ].map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (tab.id !== 'arena') {
                    soundManager.playBgm('citadel');
                  }
                }}
                className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl border transition ${
                  active
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold -translate-y-0.5'
                    : 'bg-slate-900/60 border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <img src={tab.icon} alt={tab.label} className="w-6 h-6 pixelated mb-0.5" />
                <span className="text-[10px] truncate max-w-full">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Starter Selection Modal: Elige 1 entre los 6 Monstruos Principales (6 Elementos) */}
      {showStarterModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-3 overflow-y-auto">
          <div className="pixel-panel-gold rounded-2xl max-w-4xl w-full p-4 sm:p-6 space-y-4 my-auto">
            {/* Hero Header */}
            <div className="relative rounded-xl overflow-hidden border border-amber-400/50">
              <img
                src="/assets/scenes/title_hero_bg.png"
                alt="Velmora Citadel"
                className="w-full h-32 sm:h-40 object-cover pixelated"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent flex flex-col justify-end p-4">
                <span className="text-[10px] font-pixel-title text-amber-300">
                  VELMORA: NEO MONSTERS ARENA • ELIGE 1 ENTRE LOS 6 ELEMENTOS
                </span>
                <h2 className="text-lg sm:text-2xl font-bold text-white mt-0.5">
                  Elige tu Monstruo Principal Inicial
                </h2>
                <p className="text-xs text-slate-300">
                  Comenzarás tu aventura con el monstruo elegido en el Slot #1 y podrás capturar o invocar hasta formar tu equipo 4v4.
                </p>
              </div>
            </div>

            {/* 6 Elemental Starters Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
              {STARTER_SPECIES.map((st) => {
                const elem = ELEMENT_META[st.element];
                const isSelected = previewStarterId === st.id;
                return (
                  <button
                    key={st.id}
                    onClick={() => setPreviewStarterId(st.id)}
                    className={`p-2.5 rounded-xl border-2 flex flex-col items-center text-center transition ${
                      isSelected
                        ? `${elem.bgClass} ${elem.borderClass} scale-105 shadow-lg`
                        : 'bg-slate-900/90 border-slate-700 hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-center gap-1 mb-1">
                      <img src={elem.icon} className="w-4 h-4 pixelated" alt="" />
                      <span className="text-[10px] font-bold uppercase text-amber-300">
                        {elem.nameEs}
                      </span>
                    </div>
                    <img
                      src={`/assets/monsters/${st.id}.png`}
                      alt={st.name}
                      className="w-16 h-16 pixelated"
                    />
                    <span className="text-xs font-bold text-white mt-1">{st.name}</span>
                    <span className="text-[10px] text-slate-400">{st.title}</span>
                  </button>
                );
              })}
            </div>

            {/* Selected Starter Evolution Line Preview (Stage 1 -> Stage 2 -> Stage 3) */}
            <div className="bg-slate-950/95 border border-slate-800 rounded-xl p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-pixel-title text-amber-400">
                    VISTA PREVIA DE HOJA EVOLUTIVA ({ELEMENT_META[previewSpecies.element].nameEs.toUpperCase()})
                  </span>
                  <p className="text-xs text-slate-400">
                    Pasiva Inicial: <strong className="text-white">{previewSpecies.passive_trait.name}</strong> —{' '}
                    {previewSpecies.passive_trait.desc}
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-xs text-emerald-400 font-bold">
                  Fuerte contra: {ELEMENT_META[ELEMENT_META[previewSpecies.element].strongAgainst].nameEs} (x1.5 Daño)
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                {previewEvolutionStages.map((stg) => (
                  <div
                    key={stg.id}
                    className="bg-slate-900/90 border border-slate-700 rounded-lg p-2.5 flex items-center gap-2.5"
                  >
                    <img
                      src={`/assets/monsters/${stg.id}.png`}
                      alt={stg.name}
                      className="w-14 h-14 pixelated shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-amber-400">
                        ETAPA {stg.stage} ({stg.rarity})
                      </div>
                      <div className="text-xs font-bold text-white truncate">{stg.name}</div>
                      <div className="text-[10px] text-slate-400">
                        HP {stg.base_hp} • ATK {stg.base_atk}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                {ownedMonsters.length > 0 && (
                  <button
                    onClick={() => setShowStarterModal(false)}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300"
                  >
                    Cancelar
                  </button>
                )}
                <button
                  onClick={() => handleSelectStarter(previewSpecies.id)}
                  className="pixel-btn px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-slate-950 font-pixel-title text-xs"
                >
                  🔥 ELEGIR A {previewSpecies.name.toUpperCase()} Y EMPEZAR 4v4
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default App;
