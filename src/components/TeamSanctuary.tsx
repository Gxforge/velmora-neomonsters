import React, { useState } from 'react';
import {
  ELEMENT_META,
  getMonsterStatsAtLevel,
  MONSTER_SPECIES,
  OwnedMonster,
  SPECIES_BY_ID,
  STARTER_SPECIES,
} from '../data/monstersData';
import { PlayerProfile } from '../lib/supabase';
import { soundManager } from '../lib/audio';
import { Sparkles, ArrowUp, Zap, Shield, Flame } from 'lucide-react';

interface Props {
  profile: PlayerProfile;
  ownedMonsters: OwnedMonster[];
  onUpdateProfile: (updater: (prev: PlayerProfile) => PlayerProfile) => void;
  onUpdateMonsters: (updater: (prev: OwnedMonster[]) => OwnedMonster[]) => void;
}

export const TeamSanctuary: React.FC<Props> = ({
  profile,
  ownedMonsters,
  onUpdateProfile,
  onUpdateMonsters,
}) => {
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>(
    ownedMonsters[0]?.instanceId || ''
  );
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);

  const selectedMon =
    ownedMonsters.find((m) => m.instanceId === selectedInstanceId) || ownedMonsters[0];
  const species = selectedMon ? SPECIES_BY_ID[selectedMon.speciesId] : null;
  const nextEvolution = species?.evolves_to ? SPECIES_BY_ID[species.evolves_to] : null;

  const notify = (msg: string) => {
    setBannerMsg(msg);
    setTimeout(() => setBannerMsg(null), 3500);
  };

  // Level Up with XP Fruit + Gold
  const handleTrainMonster = () => {
    if (!selectedMon || !species) return;
    const fruitCount = profile.inventory.xp_fruit || 0;
    const goldCost = selectedMon.level * 120;
    if (fruitCount < 1 || profile.gold < goldCost) {
      notify(`⚠️ Necesitas 1 Fruta XP y ${goldCost} Oro para entrenar a ${species.name}.`);
      return;
    }
    soundManager.playSfx('coin');
    onUpdateProfile((prev) => ({
      ...prev,
      gold: prev.gold - goldCost,
      inventory: {
        ...prev.inventory,
        xp_fruit: Math.max(0, (prev.inventory.xp_fruit || 0) - 1),
      },
    }));
    onUpdateMonsters((prev) =>
      prev.map((m) =>
        m.instanceId === selectedMon.instanceId
          ? { ...m, level: m.level + 3, xp: m.xp + 300 }
          : m
      )
    );
    notify(`⬆️ ¡${species.name} subió a Nivel ${selectedMon.level + 3}! Estadísticas incrementadas.`);
  };

  // Evolve Monster (Stage 1 -> Stage 2 -> Stage 3)
  const handleEvolveMonster = () => {
    if (!selectedMon || !species || !nextEvolution) return;
    const reqLevel = species.stage === 1 ? 10 : 20;
    if (selectedMon.level < reqLevel) {
      notify(
        `⚠️ ${species.name} necesita alcanzar el Nivel ${reqLevel} antes de evolucionar a ${nextEvolution.name}.`
      );
      return;
    }

    const cost = species.evolution_cost || {};
    const reqGold = cost.gold || 800;
    const essenceKey = `essence_${species.element}`;
    const reqEssence = cost[essenceKey] || 5;
    const reqCrown = cost.evolution_crown || 1;

    if (
      profile.gold < reqGold ||
      (profile.inventory[essenceKey] || 0) < reqEssence ||
      (profile.inventory.evolution_crown || 0) < reqCrown
    ) {
      notify(
        `⚠️ Materiales insuficientes: Requiere ${reqGold} Oro, ${reqEssence} Esencias de ${ELEMENT_META[species.element].nameEs} y ${reqCrown} Corona(s).`
      );
      return;
    }

    soundManager.playSfx('evolve');
    onUpdateProfile((prev) => ({
      ...prev,
      gold: prev.gold - reqGold,
      inventory: {
        ...prev.inventory,
        [essenceKey]: (prev.inventory[essenceKey] || 0) - reqEssence,
        evolution_crown: (prev.inventory.evolution_crown || 0) - reqCrown,
      },
    }));

    onUpdateMonsters((prev) =>
      prev.map((m) =>
        m.instanceId === selectedMon.instanceId
          ? { ...m, speciesId: nextEvolution.id, level: m.level + 2 }
          : m
      )
    );

    notify(
      `🌟 ¡EVOLUCIÓN COMPLETADA! ¡${species.name} ha evolucionado en ${nextEvolution.name} (${nextEvolution.rarity})!`
    );
  };

  // Assign monster to Frontline Slot 1..4
  const handleAssignSlot = (slot: number | null) => {
    if (!selectedMon) return;
    onUpdateMonsters((prev) =>
      prev.map((m) => {
        if (m.instanceId === selectedMon.instanceId) {
          return { ...m, teamSlot: slot };
        }
        if (slot !== null && m.teamSlot === slot) {
          return { ...m, teamSlot: selectedMon.teamSlot };
        }
        return m;
      })
    );
    notify(
      slot
        ? `✅ Monstruo asignado al Slot Titular #${slot} para combates 4v4.`
        : `Monstruo enviado a la reserva del Santuario.`
    );
  };

  // Summon a new monster at the Altar (to fill 4v4 team)
  const handleSummonPortal = (useCrystals: boolean) => {
    if (useCrystals && profile.velmora_crystals < 45) {
      notify('⚠️ Necesitas 45 Cristales Velmora para abrir el Portal Astral.');
      return;
    }
    if (!useCrystals && profile.gold < 900) {
      notify('⚠️ Necesitas 900 Oro para invocar un compañero elemental.');
      return;
    }

    soundManager.playSfx('evolve');
    const pool = useCrystals
      ? MONSTER_SPECIES.filter((s) => s.stage <= 2)
      : STARTER_SPECIES;
    const picked = pool[Math.floor(Math.random() * pool.length)];

    onUpdateProfile((prev) => ({
      ...prev,
      velmora_crystals: useCrystals ? prev.velmora_crystals - 45 : prev.velmora_crystals,
      gold: !useCrystals ? prev.gold - 900 : prev.gold,
    }));

    // Find first free frontline slot (1..4) or bench (5..8)
    const usedSlots = new Set(ownedMonsters.map((m) => m.teamSlot).filter(Boolean));
    let assignedSlot: number | null = null;
    for (let s = 1; s <= 8; s++) {
      if (!usedSlots.has(s)) {
        assignedSlot = s;
        break;
      }
    }

    const newMon: OwnedMonster = {
      instanceId: `mon_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      speciesId: picked.id,
      level: picked.stage === 2 ? 12 : 5,
      xp: 0,
      teamSlot: assignedSlot,
    };

    onUpdateMonsters((prev) => [...prev, newMon]);
    setSelectedInstanceId(newMon.instanceId);
    notify(
      `🐉 ¡Has invocado a ${picked.name} (${ELEMENT_META[picked.element].nameEs})! Añadido ${
        assignedSlot && assignedSlot <= 4
          ? `al Slot Titular #${assignedSlot} (4v4)`
          : 'a tu Santuario'
      }.`
    );
  };

  return (
    <div className="space-y-4">
      {bannerMsg && (
        <div className="pixel-panel-gold rounded-xl p-3 text-xs font-bold text-amber-200">
          {bannerMsg}
        </div>
      )}

      {/* Summoning Altar Banner */}
      <div className="relative pixel-panel rounded-xl overflow-hidden border-2 border-purple-500/50">
        <img
          src="/assets/scenes/summon_altar_bg.png"
          alt="Altar de Invocación"
          className="w-full h-44 sm:h-52 object-cover pixelated"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/55 to-transparent flex flex-col justify-end p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="px-2 py-0.5 rounded bg-purple-500/25 border border-purple-400/50 text-[10px] font-pixel-title text-purple-200">
                ALTAR DE INVOCACIÓN ELEMENTAL • EXPANDE TU EQUIPO 4v4
              </span>
              <h2 className="text-base sm:text-lg font-bold text-white mt-1">
                Recluta Nuevos Monstruos de los 6 Elementos
              </h2>
              <p className="text-xs text-slate-300">
                Empiezas con tu inicial elegido y puedes invocar o capturar hasta formar tu escuadrón 4v4 perfecto.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleSummonPortal(false)}
                className="pixel-btn px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs flex items-center gap-1.5"
              >
                <img src="/assets/icons/icon_gold.png" className="w-4 h-4 pixelated" alt="" />
                Invocar Inicial (900 Oro)
              </button>
              <button
                onClick={() => handleSummonPortal(true)}
                className="pixel-btn px-3.5 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold text-xs flex items-center gap-1.5"
              >
                <img src="/assets/icons/icon_crystals.png" className="w-4 h-4 pixelated" alt="" />
                Portal Astral (45 Cristales)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Split: Roster List + Selected Monster Inspector & Evolution */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Owned Monsters Roster */}
        <div className="lg:col-span-5 pixel-panel rounded-xl p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="font-pixel-title text-xs text-amber-400">
              TUS MONSTRUOS ({ownedMonsters.length})
            </h3>
            <span className="text-[11px] text-slate-400">Slots 1-4 = Titulares 4v4</span>
          </div>

          <div className="grid grid-cols-2 gap-2 max-h-[380px] overflow-y-auto pr-1">
            {ownedMonsters.map((m) => {
              const sp = SPECIES_BY_ID[m.speciesId];
              if (!sp) return null;
              const elem = ELEMENT_META[sp.element];
              const isSelected = m.instanceId === selectedMon?.instanceId;
              return (
                <button
                  key={m.instanceId}
                  onClick={() => setSelectedInstanceId(m.instanceId)}
                  className={`p-2.5 rounded-lg border-2 text-left transition flex items-center gap-2 ${
                    isSelected
                      ? 'bg-slate-800 border-amber-400 shadow-lg'
                      : 'bg-slate-900/80 border-slate-700 hover:border-slate-500'
                  }`}
                >
                  <img
                    src={`/assets/monsters/${sp.id}.png`}
                    alt={sp.name}
                    className="w-12 h-12 pixelated shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <img src={elem.icon} className="w-3.5 h-3.5 pixelated" alt="" />
                      <span className="font-bold text-xs text-white truncate">{sp.name}</span>
                    </div>
                    <div className="text-[11px] text-amber-300 font-semibold">
                      Nv.{m.level} • Etapa {sp.stage}
                    </div>
                    {m.teamSlot && m.teamSlot <= 4 ? (
                      <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded bg-emerald-500/20 border border-emerald-500/50 text-[10px] font-bold text-emerald-300">
                        TITULAR #{m.teamSlot}
                      </span>
                    ) : (
                      <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded bg-slate-800 text-[10px] text-slate-400">
                        Reserva
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Monster Training & Coherent Evolution Panel */}
        {selectedMon && species && (
          <div className="lg:col-span-7 pixel-panel rounded-xl p-4 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-xl border-2 ${ELEMENT_META[species.element].bgClass} ${
                    ELEMENT_META[species.element].borderClass
                  }`}
                >
                  <img
                    src={`/assets/monsters/${species.id}.png`}
                    alt={species.name}
                    className="w-24 h-24 pixelated"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <img
                      src={ELEMENT_META[species.element].icon}
                      className="w-5 h-5 pixelated"
                      alt=""
                    />
                    <span className="text-xs font-bold uppercase text-amber-400">
                      {ELEMENT_META[species.element].nameEs} • Etapa {species.stage} ({species.rarity})
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-white mt-0.5">
                    {species.name}{' '}
                    <span className="text-sm font-normal text-amber-300">Nv.{selectedMon.level}</span>
                  </h3>
                  <p className="text-xs text-slate-400">{species.title}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[1, 2, 3, 4].map((slot) => (
                      <button
                        key={slot}
                        onClick={() => handleAssignSlot(slot)}
                        className={`px-2 py-1 rounded text-[11px] font-bold border ${
                          selectedMon.teamSlot === slot
                            ? 'bg-emerald-600 border-emerald-300 text-white'
                            : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        Slot #{slot}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Train Button */}
              <button
                onClick={handleTrainMonster}
                className="pixel-btn px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5"
              >
                <ArrowUp className="w-4 h-4" /> Entrenar +3 Nv ({selectedMon.level * 120} Oro + 1 Fruta)
              </button>
            </div>

            {/* Stats Row */}
            {(() => {
              const st = getMonsterStatsAtLevel(species, selectedMon.level);
              return (
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-slate-900/90 border border-slate-700 rounded-lg p-2">
                    <div className="text-[10px] text-slate-400">VIDA (HP)</div>
                    <div className="text-sm font-bold text-emerald-400">{st.hp}</div>
                  </div>
                  <div className="bg-slate-900/90 border border-slate-700 rounded-lg p-2">
                    <div className="text-[10px] text-slate-400">ATAQUE</div>
                    <div className="text-sm font-bold text-rose-400">{st.atk}</div>
                  </div>
                  <div className="bg-slate-900/90 border border-slate-700 rounded-lg p-2">
                    <div className="text-[10px] text-slate-400">DEFENSA</div>
                    <div className="text-sm font-bold text-sky-400">{st.def}</div>
                  </div>
                  <div className="bg-slate-900/90 border border-slate-700 rounded-lg p-2">
                    <div className="text-[10px] text-slate-400">VELOCIDAD</div>
                    <div className="text-sm font-bold text-amber-400">{st.spd}</div>
                  </div>
                </div>
              );
            })()}

            {/* Coherent Evolution Tree Preview (Stage 1 -> Stage 2 -> Stage 3) */}
            <div className="bg-slate-950/90 border border-amber-500/40 rounded-xl p-3.5">
              <div className="flex items-center justify-between mb-2">
                <span className="font-pixel-title text-[11px] text-amber-400">
                  ÁRBOL DE EVOLUCIÓN COHERENTE (ETAPA 1 ➔ 2 ➔ 3)
                </span>
                {nextEvolution ? (
                  <span className="text-xs text-emerald-400 font-bold">
                    Req: Nivel {species.stage === 1 ? 10 : 20}
                  </span>
                ) : (
                  <span className="text-xs text-purple-400 font-bold">
                    ★ ETAPA MÍTICA MÁXIMA ALCANZADA
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 items-center">
                {MONSTER_SPECIES.filter((s) => s.family_id === species.family_id)
                  .sort((a, b) => a.stage - b.stage)
                  .map((evoStage) => {
                    const isCurrent = evoStage.id === species.id;
                    return (
                      <div
                        key={evoStage.id}
                        className={`p-2 rounded-lg border text-center ${
                          isCurrent
                            ? 'bg-amber-500/15 border-amber-400'
                            : 'bg-slate-900/70 border-slate-800 opacity-75'
                        }`}
                      >
                        <img
                          src={`/assets/monsters/${evoStage.id}.png`}
                          alt={evoStage.name}
                          className="w-14 h-14 mx-auto pixelated"
                        />
                        <div className="text-xs font-bold text-white mt-1">{evoStage.name}</div>
                        <div className="text-[10px] text-amber-300">
                          Etapa {evoStage.stage} ({evoStage.rarity})
                        </div>
                      </div>
                    );
                  })}
              </div>

              {nextEvolution && (
                <div className="mt-3 pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-slate-300 flex flex-wrap items-center gap-2">
                    <span>Coste Evolución:</span>
                    <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-amber-300 font-semibold">
                      {species.evolution_cost.gold} Oro
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-sky-300 font-semibold">
                      {species.evolution_cost[`essence_${species.element}`]} Esencias{' '}
                      {ELEMENT_META[species.element].nameEs}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-purple-300 font-semibold">
                      {species.evolution_cost.evolution_crown} Corona(s)
                    </span>
                  </div>

                  <button
                    onClick={handleEvolveMonster}
                    className="pixel-btn px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 text-slate-950 font-bold text-xs"
                  >
                    ✨ EVOLUCIONAR A {nextEvolution.name.toUpperCase()}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
