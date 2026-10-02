import React, { useState } from 'react';
import {
  ALL_MONSTERS,
  ELEMENT_META,
  MONSTERS_BY_ID,
  OwnedMonster,
  computeMonsterStats,
} from '../data/monstersData';
import { soundManager } from '../lib/audio';
import { EvolutionCeremonyModal } from './EvolutionCeremonyModal';

interface TeamSanctuaryProps {
  roster: OwnedMonster[];
  gold: number;
  crystals: number;
  inventory: Record<string, number>;
  onUpdateRoster: (nextRoster: OwnedMonster[]) => void;
  onSpendResources: (goldDelta: number, crystalDelta: number, itemDeltas?: Record<string, number>) => void;
  onOpenEvolutionSheet: (element: string) => void;
}

interface CeremonyState {
  oldSpeciesId: string;
  newSpeciesId: string;
  level: number;
  oldStats: { hp: number; atk: number; def: number; spd: number };
  newStats: { hp: number; atk: number; def: number; spd: number };
}

export const TeamSanctuary: React.FC<TeamSanctuaryProps> = ({
  roster,
  gold,
  crystals,
  inventory,
  onUpdateRoster,
  onSpendResources,
  onOpenEvolutionSheet,
}) => {
  const [selectedId, setSelectedId] = useState<string>(roster[0]?.instanceId || '');
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);
  const [ceremony, setCeremony] = useState<CeremonyState | null>(null);

  const selectedMonster = roster.find((m) => m.instanceId === selectedId) || roster[0];
  const selectedSpec = selectedMonster ? MONSTERS_BY_ID[selectedMonster.speciesId] : null;
  const selectedStats = selectedMonster
    ? computeMonsterStats(selectedMonster.speciesId, selectedMonster.level)
    : null;

  const swapSlot = (instanceId: string, targetSlot: number | null) => {
    const next = roster.map((m) => ({ ...m }));
    const current = next.find((m) => m.instanceId === instanceId);
    if (!current) return;

    if (targetSlot !== null) {
      const occupant = next.find((m) => m.teamSlot === targetSlot && m.instanceId !== instanceId);
      if (occupant) {
        occupant.teamSlot = current.teamSlot;
      }
    }
    current.teamSlot = targetSlot;
    soundManager.playSfx('coin');
    onUpdateRoster(next);
  };

  const handleTrainMonster = () => {
    if (!selectedMonster || !selectedSpec) return;
    const fruitCount = inventory.xp_fruit || 0;
    const goldCost = 180;
    if (fruitCount < 1 || gold < goldCost) {
      setBannerMsg('⚠️ Necesitas 1 Fruta Astral XP + 180 Oro para entrenar.');
      return;
    }

    onSpendResources(goldCost, 0, { xp_fruit: -1 });
    soundManager.playSfx('coin');
    const nextLv = Math.min(50, selectedMonster.level + 2);
    const nextRoster = roster.map((m) =>
      m.instanceId === selectedMonster.instanceId ? { ...m, level: nextLv, xp: m.xp + 200 } : m
    );
    onUpdateRoster(nextRoster);
    setBannerMsg(`✨ ¡${selectedSpec.name} subió a Nivel ${nextLv}! Sus estadísticas han aumentado.`);
  };

  const handleEvolveMonster = () => {
    if (!selectedMonster || !selectedSpec) return;
    if (!selectedSpec.evolves_to) {
      setBannerMsg('👑 Este monstruo ya alcanzó su Etapa 3 Mítica definitiva.');
      return;
    }

    const reqEssenceKey = `elem_${selectedSpec.element}`;
    const essenceCount = inventory[reqEssenceKey] || 0;
    const needEssence = selectedSpec.stage === 1 ? 3 : 6;
    const needCrown = selectedSpec.stage === 2 ? 1 : 0;
    const goldCost = selectedSpec.stage === 1 ? 600 : 1500;

    if (essenceCount < needEssence) {
      setBannerMsg(`⚠️ Necesitas ${needEssence} Esencias de ${ELEMENT_META[selectedSpec.element].name} en tu mochila.`);
      return;
    }
    if (needCrown > 0 && (inventory.evo_crown || 0) < needCrown) {
      setBannerMsg('⚠️ Necesitas 1 Corona de Evolución Real para ascender a Etapa 3 Mítica.');
      return;
    }
    if (gold < goldCost) {
      setBannerMsg(`⚠️ Necesitas ${goldCost} Oro para el ritual de evolución.`);
      return;
    }

    const nextSpec = MONSTERS_BY_ID[selectedSpec.evolves_to];
    const oldStats = computeMonsterStats(selectedSpec.id, selectedMonster.level);
    const newLevel = selectedMonster.level + 3;
    const newStats = computeMonsterStats(nextSpec.id, newLevel);

    const deltas: Record<string, number> = { [reqEssenceKey]: -needEssence };
    if (needCrown > 0) deltas.evo_crown = -needCrown;

    onSpendResources(goldCost, 0, deltas);

    const nextRoster = roster.map((m) =>
      m.instanceId === selectedMonster.instanceId
        ? { ...m, speciesId: nextSpec.id, level: newLevel }
        : m
    );
    onUpdateRoster(nextRoster);

    // Launch Full Visual Evolution Ceremony Modal!
    setCeremony({
      oldSpeciesId: selectedSpec.id,
      newSpeciesId: nextSpec.id,
      level: newLevel,
      oldStats,
      newStats,
    });
    setBannerMsg(`🌟 ¡EVOLUCIÓN ÉPICA! ${selectedSpec.name} evolucionó a ${nextSpec.name} (Etapa ${nextSpec.stage})!`);
  };

  const handleSummonEgg = () => {
    const costCrystals = 120;
    if (crystals < costCrystals) {
      setBannerMsg('⚠️ Necesitas 120 Cristales de Maná para invocar un Huevo Astral.');
      return;
    }

    const pool = ALL_MONSTERS.filter((m) => m.stage === 1 || (m.stage === 2 && Math.random() < 0.3));
    const rolled = pool[Math.floor(Math.random() * pool.length)];

    onSpendResources(0, costCrystals);
    soundManager.playSfx('evolve');

    const usedSlots = new Set(roster.map((r) => r.teamSlot).filter(Boolean));
    let assignedSlot: number | null = null;
    for (let s = 1; s <= 8; s++) {
      if (!usedSlots.has(s)) {
        assignedSlot = s;
        break;
      }
    }

    const newMon: OwnedMonster = {
      instanceId: `mon_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      speciesId: rolled.id,
      level: rolled.stage === 2 ? 12 : 5,
      xp: 0,
      teamSlot: assignedSlot,
    };

    onUpdateRoster([...roster, newMon]);
    setSelectedId(newMon.instanceId);
    setBannerMsg(`🥚 ¡INVOCACIÓN EXITOSA! Obtuviste a ${rolled.name} (${rolled.title}) [Etapa ${rolled.stage}]!`);
  };

  return (
    <div className="space-y-4">
      {ceremony && (
        <EvolutionCeremonyModal
          oldSpeciesId={ceremony.oldSpeciesId}
          newSpeciesId={ceremony.newSpeciesId}
          level={ceremony.level}
          oldStats={ceremony.oldStats}
          newStats={ceremony.newStats}
          onClose={() => setCeremony(null)}
        />
      )}

      {/* Top Summoning Banner */}
      <div className="relative rounded-lg overflow-hidden border-2 border-purple-500/70 shadow-xl">
        <img
          src="/assets/scenes/summon_altar_bg.png"
          alt="Summon Altar"
          className="w-full h-36 sm:h-44 object-cover pixel-art"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/60 to-slate-950/90 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-purple-500/20 border border-purple-400/50 text-purple-300 text-[10px] font-pixel mb-1">
              ✨ ALTAR DE INVOCACIÓN & EVOLUCIÓN (3 ETAPAS)
            </div>
            <h2 className="font-pixel text-sm sm:text-base text-white">
              SANTUARIO DE ESCUADRÓN 4v4
            </h2>
            <p className="text-xs text-slate-300 max-w-xl mt-0.5">
              Organiza tus 4 titulares de vanguardia (Slots 1–4) y tus 4 refuerzos de banca (Slots 5–8). Evoluciona cada monstruo con una Ceremonia de Ascensión en vivo.
            </p>
          </div>

          <button
            onClick={handleSummonEgg}
            className="pixel-btn pixel-btn-gold px-4 py-2.5 flex items-center gap-2 shrink-0"
          >
            <img src="/assets/icons/icon_summon_egg.png" alt="Egg" className="w-6 h-6 pixel-art" />
            <div className="text-left">
              <div className="text-[10px]">INVOCAR HUEVO ASTRAL</div>
              <div className="text-[9px] text-amber-950 font-bold">120 Cristales</div>
            </div>
          </button>
        </div>
      </div>

      {bannerMsg && (
        <div className="pixel-panel p-2.5 border-amber-400 bg-amber-950/40 text-amber-200 text-xs font-bold flex items-center justify-between">
          <span>{bannerMsg}</span>
          <button onClick={() => setBannerMsg(null)} className="text-xs text-amber-400 underline ml-2">
            OK
          </button>
        </div>
      )}

      {/* 4v4 Frontline + Bench Visual Slots */}
      <div className="pixel-panel p-3.5">
        <div className="flex items-center justify-between mb-2">
          <span className="font-pixel text-xs text-amber-300">⚔️ FORMACIÓN TÁCTICA 4v4 (TITULARES + BANCA)</span>
          <span className="text-xs text-slate-400">Haz clic en un monstruo abajo para asignarlo</span>
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((slotNum) => {
            const occupant = roster.find((r) => r.teamSlot === slotNum);
            const spec = occupant ? MONSTERS_BY_ID[occupant.speciesId] : null;
            const isFrontline = slotNum <= 4;
            return (
              <div
                key={slotNum}
                onClick={() => occupant && setSelectedId(occupant.instanceId)}
                className={`p-2 rounded border-2 cursor-pointer transition flex flex-col items-center text-center ${
                  isFrontline
                    ? 'bg-amber-950/25 border-amber-500/60 hover:border-amber-400'
                    : 'bg-slate-900/80 border-slate-700 hover:border-sky-400'
                } ${selectedMonster?.instanceId === occupant?.instanceId ? 'ring-2 ring-amber-300' : ''}`}
              >
                <span className="text-[9px] font-pixel text-slate-400 mb-1">
                  {isFrontline ? `TITULAR #${slotNum}` : `BANCA #${slotNum}`}
                </span>
                {occupant && spec ? (
                  <>
                    <img src={spec.sprite} alt={spec.name} className="w-12 h-12 pixel-art" />
                    <span className="text-[10px] font-bold text-white truncate w-full mt-1">
                      {spec.name}
                    </span>
                    <span className="text-[9px] text-amber-300">Nv.{occupant.level} • E{spec.stage}</span>
                  </>
                ) : (
                  <div className="h-16 flex items-center justify-center text-[10px] text-slate-600 font-pixel">
                    VACÍO
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Detailed Monster Inspector + Evolution Workshop */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Roster Grid */}
        <div className="lg:col-span-5 pixel-panel p-3.5">
          <div className="font-pixel text-xs text-sky-300 mb-2.5">
            🐉 TUS MONSTRUOS COLECCIONADOS ({roster.length})
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[380px] overflow-y-auto pr-1">
            {roster.map((mon) => {
              const spec = MONSTERS_BY_ID[mon.speciesId];
              const el = ELEMENT_META[spec.element];
              const isSelected = mon.instanceId === selectedMonster?.instanceId;
              return (
                <button
                  key={mon.instanceId}
                  onClick={() => setSelectedId(mon.instanceId)}
                  className={`p-2 rounded border-2 text-left transition flex flex-col items-center relative ${
                    isSelected
                      ? 'bg-slate-800 border-amber-400 shadow-lg'
                      : 'bg-slate-900/80 border-slate-700 hover:border-slate-500'
                  }`}
                >
                  {mon.teamSlot && (
                    <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 font-pixel text-[8px]">
                      S{mon.teamSlot}
                    </span>
                  )}
                  <img src={el.icon} alt={el.name} className="w-4 h-4 pixel-art absolute top-1 right-1" />
                  <img src={spec.sprite} alt={spec.name} className="w-16 h-16 pixel-art my-1" />
                  <div className="text-xs font-bold text-white truncate w-full text-center">
                    {spec.name}
                  </div>
                  <div className="text-[10px] text-amber-300">
                    Nv.{mon.level} • Etapa {spec.stage}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Monster Evolution & Training Card */}
        {selectedMonster && selectedSpec && selectedStats && (
          <div className="lg:col-span-7 pixel-panel p-4 flex flex-col justify-between">
            <div>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-3">
                  <div className="relative bg-slate-950 p-2 rounded border-2 border-amber-500/60">
                    <img
                      src={selectedSpec.sprite}
                      alt={selectedSpec.name}
                      className="w-24 h-24 pixel-art animate-float"
                    />
                    <span className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-slate-900/90 border border-amber-400 text-amber-300 font-pixel text-[9px]">
                      ETAPA {selectedSpec.stage}/3
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <img
                        src={ELEMENT_META[selectedSpec.element].icon}
                        alt={selectedSpec.element}
                        className="w-5 h-5 pixel-art"
                      />
                      <h3 className="font-pixel text-sm sm:text-base text-amber-300">
                        {selectedSpec.name}
                      </h3>
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-sky-300 font-bold">
                        {selectedSpec.rarity}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-0.5">{selectedSpec.title}</p>
                    <div className="text-xs text-emerald-400 font-bold mt-1">
                      Nivel {selectedMonster.level} • Coste Captura: {selectedSpec.cost}
                    </div>

                    <button
                      onClick={() => onOpenEvolutionSheet(selectedSpec.element)}
                      className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-pixel text-sky-300 hover:text-sky-200 underline"
                    >
                      📜 VER HOJA DE DISEÑO DE EVOLUCIÓN ({ELEMENT_META[selectedSpec.element].name.toUpperCase()})
                    </button>
                  </div>
                </div>

                {/* Slot Assignment Selector */}
                <div className="bg-slate-900/90 p-2 rounded border border-slate-700">
                  <div className="text-[9px] font-pixel text-slate-400 mb-1">ASIGNAR SLOT 4v4:</div>
                  <div className="grid grid-cols-4 gap-1">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                      <button
                        key={s}
                        onClick={() => swapSlot(selectedMonster.instanceId, s)}
                        className={`px-2 py-1 text-[9px] font-pixel rounded border ${
                          selectedMonster.teamSlot === s
                            ? 'bg-amber-500 text-slate-950 border-amber-300'
                            : 'bg-slate-800 text-slate-300 border-slate-600 hover:border-amber-400'
                        }`}
                      >
                        S{s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Stats & Passive */}
              <div className="grid grid-cols-4 gap-2 my-3">
                <div className="bg-slate-900/90 p-2 rounded border border-slate-800 text-center">
                  <div className="text-[9px] text-slate-400 font-pixel">HP MÁX</div>
                  <div className="text-sm font-bold text-emerald-400 mt-0.5">{selectedStats.hp}</div>
                </div>
                <div className="bg-slate-900/90 p-2 rounded border border-slate-800 text-center">
                  <div className="text-[9px] text-slate-400 font-pixel">ATAQUE</div>
                  <div className="text-sm font-bold text-rose-400 mt-0.5">{selectedStats.atk}</div>
                </div>
                <div className="bg-slate-900/90 p-2 rounded border border-slate-800 text-center">
                  <div className="text-[9px] text-slate-400 font-pixel">DEFENSA</div>
                  <div className="text-sm font-bold text-sky-400 mt-0.5">{selectedStats.def}</div>
                </div>
                <div className="bg-slate-900/90 p-2 rounded border border-slate-800 text-center">
                  <div className="text-[9px] text-slate-400 font-pixel">VELOCIDAD</div>
                  <div className="text-sm font-bold text-amber-300 mt-0.5">{selectedStats.spd}</div>
                </div>
              </div>

              {/* Passive & Evolution Preview */}
              <div className="bg-slate-900/80 border border-slate-700 rounded p-2.5 mb-3">
                <div className="text-xs font-bold text-amber-300">
                  🛡️ Pasiva — {selectedSpec.passive_trait.name}:
                </div>
                <div className="text-xs text-slate-300">{selectedSpec.passive_trait.desc}</div>
              </div>

              {/* Next Evolution Stage Preview */}
              {selectedSpec.evolves_to ? (
                (() => {
                  const nextEvo = MONSTERS_BY_ID[selectedSpec.evolves_to];
                  const needEssence = selectedSpec.stage === 1 ? 3 : 6;
                  const needCrown = selectedSpec.stage === 2 ? 1 : 0;
                  return (
                    <div className="bg-gradient-to-r from-indigo-950/80 to-purple-950/80 border-2 border-purple-400/60 rounded p-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={nextEvo.sprite}
                          alt={nextEvo.name}
                          className="w-14 h-14 pixel-art bg-slate-950 rounded p-1 border border-purple-400"
                        />
                        <div>
                          <div className="text-[10px] font-pixel text-purple-300">
                            PRÓXIMA EVOLUCIÓN (ETAPA {nextEvo.stage}):
                          </div>
                          <div className="text-sm font-bold text-white">
                            {nextEvo.name} ({nextEvo.title})
                          </div>
                          <div className="text-[11px] text-amber-300 mt-0.5">
                            Requiere: {needEssence}x Esencia {ELEMENT_META[selectedSpec.element].name}
                            {needCrown ? ' + 1x Corona Real' : ''} + {selectedSpec.stage === 1 ? 600 : 1500} Oro
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={handleEvolveMonster}
                        className="pixel-btn pixel-btn-gold px-3.5 py-2 text-[10px] shrink-0"
                      >
                        👑 EVOLUCIONAR
                      </button>
                    </div>
                  );
                })()
              ) : (
                <div className="bg-amber-950/40 border border-amber-500/60 rounded p-2.5 text-center text-xs text-amber-300 font-pixel">
                  👑 FORMA MÍTICA DEFINITIVA ALCANZADA (ETAPA 3/3)
                </div>
              )}
            </div>

            {/* Bottom Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-800">
              <button
                onClick={handleTrainMonster}
                className="pixel-btn pixel-btn-green px-4 py-2 text-[10px] flex items-center gap-2"
              >
                <img src="/assets/icons/icon_xp_fruit.png" alt="XP" className="w-4 h-4 pixel-art" />
                ENTRENAR (+2 NIVELES) [1 Fruta + 180 Oro]
              </button>

              <button
                onClick={() => onOpenEvolutionSheet(selectedSpec.element)}
                className="pixel-btn pixel-btn-blue px-4 py-2 text-[10px] flex items-center gap-2"
              >
                <img src="/assets/icons/icon_codex.png" alt="Sheet" className="w-4 h-4 pixel-art" />
                HOJA DE DISEÑO COMPLETA
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
