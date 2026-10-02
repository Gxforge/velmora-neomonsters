import React, { useState } from 'react';
import { BACKPACK_ITEMS_META, ELEMENT_META, ElementType } from '../data/monstersData';
import { PlayerProfile } from '../lib/supabase';
import { soundManager } from '../lib/audio';
import { Hammer, Package, Sparkles, ArrowUpCircle } from 'lucide-react';

interface Props {
  profile: PlayerProfile;
  onUpdateProfile: (updater: (prev: PlayerProfile) => PlayerProfile) => void;
}

export const CitadelHub: React.FC<Props> = ({ profile, onUpdateProfile }) => {
  const [statusToast, setStatusToast] = useState<string | null>(null);

  const notify = (msg: string) => {
    setStatusToast(msg);
    setTimeout(() => setStatusToast(null), 3200);
  };

  const handleCollectResources = () => {
    soundManager.playSfx('coin');
    const mineLv = profile.base_buildings?.gold_mine?.level || 1;
    const reactorLv = profile.base_buildings?.essence_reactor?.level || 1;
    const goldGain = 320 * mineLv;
    const essenceGain = 2 * reactorLv;

    const elems: ElementType[] = ['fire', 'water', 'earth', 'storm', 'light', 'shadow'];
    const pickedElem = elems[Math.floor(Math.random() * elems.length)];
    const essenceKey = `essence_${pickedElem}`;

    onUpdateProfile((prev) => ({
      ...prev,
      gold: prev.gold + goldGain,
      inventory: {
        ...prev.inventory,
        [essenceKey]: (prev.inventory[essenceKey] || 0) + essenceGain,
      },
    }));

    notify(
      `💰 ¡Recolectaste +${goldGain} Oro de la Mina y +${essenceGain} Esencias de ${ELEMENT_META[pickedElem].nameEs} del Reactor!`
    );
  };

  const handleUpgradeBuilding = (
    bKey: 'gold_mine' | 'essence_reactor' | 'elemental_sanctuary' | 'capture_forge',
    label: string
  ) => {
    const currentLv = (profile.base_buildings as any)?.[bKey]?.level || 1;
    const costGold = currentLv * 900;
    if (profile.gold < costGold) {
      notify(`⚠️ Necesitas ${costGold} Oro para mejorar ${label} a Nivel ${currentLv + 1}.`);
      return;
    }
    soundManager.playSfx('evolve');
    onUpdateProfile((prev) => ({
      ...prev,
      gold: prev.gold - costGold,
      base_buildings: {
        ...prev.base_buildings,
        [bKey]: {
          ...(prev.base_buildings as any)[bKey],
          level: currentLv + 1,
        },
      },
    }));
    notify(`🏰 ¡${label} mejorado a Nivel ${currentLv + 1}! Producción aumentada.`);
  };

  const handleCraftItem = (
    itemKey: string,
    itemName: string,
    goldCost: number,
    crystalCost: number,
    qty: number
  ) => {
    if (profile.gold < goldCost || profile.velmora_crystals < crystalCost) {
      notify('⚠️ Recursos insuficientes para fabricar este objeto en la Forja.');
      return;
    }
    soundManager.playSfx('coin');
    onUpdateProfile((prev) => ({
      ...prev,
      gold: prev.gold - goldCost,
      velmora_crystals: prev.velmora_crystals - crystalCost,
      inventory: {
        ...prev.inventory,
        [itemKey]: (prev.inventory[itemKey] || 0) + qty,
      },
    }));
    notify(`⚒️ ¡Fabricaste +${qty} ${itemName} y se guardó en tu Mochila!`);
  };

  const buildings = [
    {
      key: 'gold_mine' as const,
      name: 'Mina de Oro Imperial',
      icon: '/assets/icons/icon_bldg_mine.png',
      level: profile.base_buildings?.gold_mine?.level || 1,
      desc: 'Extrae lingotes de oro puro para entrenar y evolucionar tu equipo 4v4.',
      stat: `+${(profile.base_buildings?.gold_mine?.level || 1) * 320} Oro / ciclo`,
    },
    {
      key: 'essence_reactor' as const,
      name: 'Reactor de Esencia Elemental',
      icon: '/assets/icons/icon_bldg_reactor.png',
      level: profile.base_buildings?.essence_reactor?.level || 1,
      desc: 'Sintetiza Esencias de los 6 Elementos (Fuego, Agua, Tierra, Rayo, Luz, Oscuridad).',
      stat: `+${(profile.base_buildings?.essence_reactor?.level || 1) * 2} Esencias / ciclo`,
    },
    {
      key: 'elemental_sanctuary' as const,
      name: 'Santuario de Crianza 4v4',
      icon: '/assets/icons/icon_bldg_sanctuary.png',
      level: profile.base_buildings?.elemental_sanctuary?.level || 1,
      desc: 'Aumenta la reserva de monstruos y potencia la regeneración de energía.',
      stat: `Capacidad: ${12 + (profile.base_buildings?.elemental_sanctuary?.level || 1) * 4} Monstruos`,
    },
    {
      key: 'capture_forge' as const,
      name: 'Forja de Orbes y Coronas',
      icon: '/assets/icons/icon_bldg_forge.png',
      level: profile.base_buildings?.capture_forge?.level || 1,
      desc: 'Permite forjar Orbes de Captura, Frutas XP y Coronas de Evolución.',
      stat: `Descuento Forja: ${(profile.base_buildings?.capture_forge?.level || 1) * 5}%`,
    },
  ];

  return (
    <div className="space-y-4">
      {statusToast && (
        <div className="pixel-panel-gold rounded-xl p-3 text-xs font-bold text-amber-200 flex items-center justify-between animate-pulse">
          <span>{statusToast}</span>
        </div>
      )}

      {/* Citadel Hero Scene with Collect Action */}
      <div className="relative pixel-panel rounded-xl overflow-hidden border-2 border-amber-500/40">
        <img
          src="/assets/scenes/citadel_hub_bg.png"
          alt="Ciudadela de Velmora"
          className="w-full h-48 sm:h-60 object-cover pixelated"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/45 to-transparent flex flex-col justify-end p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/50 text-[10px] font-pixel-title text-amber-300">
                GESTIÓN DE RECURSOS • CIUDADELA DE VELMORA
              </span>
              <h2 className="text-lg sm:text-xl font-bold text-white mt-1">
                Bastión Estratégico & Mochila de Materiales
              </h2>
              <p className="text-xs text-slate-300">
                Recolecta Oro y Esencias de los 6 Elementos para evolucionar tus monstruos a Etapa 2 y Etapa 3.
              </p>
            </div>

            <button
              onClick={handleCollectResources}
              className="pixel-btn px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-slate-950 font-bold text-xs flex items-center gap-2"
            >
              <img src="/assets/icons/icon_gold.png" className="w-5 h-5 pixelated" alt="" />
              RECOLECTAR COSECHA AHORA
            </button>
          </div>
        </div>
      </div>

      {/* 4 Upgradable Buildings Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {buildings.map((b) => {
          const upgradeCost = b.level * 900;
          return (
            <div key={b.key} className="pixel-panel rounded-xl p-3.5 flex flex-col justify-between">
              <div className="flex items-start gap-3">
                <img
                  src={b.icon}
                  alt={b.name}
                  className="w-14 h-14 pixelated bg-slate-900 rounded-lg border border-slate-700 p-1 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <h3 className="font-bold text-sm text-white truncate">{b.name}</h3>
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[11px] font-bold">
                      Nv.{b.level}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{b.desc}</p>
                  <div className="text-xs font-bold text-emerald-400 mt-1.5">{b.stat}</div>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  Coste mejora:
                  <strong className="text-amber-300">{upgradeCost} Oro</strong>
                </span>
                <button
                  onClick={() => handleUpgradeBuilding(b.key, b.name)}
                  className="pixel-btn px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-amber-300 flex items-center gap-1"
                >
                  <ArrowUpCircle className="w-3.5 h-3.5" /> Mejorar Nv.{b.level + 1}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Crafting Forge Workshop */}
      <div className="pixel-panel rounded-xl p-4">
        <h3 className="font-pixel-title text-xs text-amber-400 flex items-center gap-2 mb-3">
          <Hammer className="w-4 h-4" /> TALLER DE FORJA: FABRICAR ORBES Y RELIQUIAS EVOLUTIVAS
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="bg-slate-900/90 border border-slate-700 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <img
                src="/assets/icons/icon_capture_basic.png"
                className="w-10 h-10 pixelated"
                alt=""
              />
              <div>
                <div className="text-xs font-bold text-white">x3 Orbes de Captura</div>
                <div className="text-[11px] text-amber-300">Coste: 450 Oro</div>
              </div>
            </div>
            <button
              onClick={() =>
                handleCraftItem('capture_orb_basic', 'Orbes de Captura', 450, 0, 3)
              }
              className="pixel-btn px-3 py-1.5 rounded bg-sky-700 hover:bg-sky-600 text-xs font-bold text-white"
            >
              Forjar
            </button>
          </div>

          <div className="bg-slate-900/90 border border-slate-700 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <img src="/assets/icons/icon_xp_fruit.png" className="w-10 h-10 pixelated" alt="" />
              <div>
                <div className="text-xs font-bold text-white">x5 Frutas Astrales XP</div>
                <div className="text-[11px] text-amber-300">Coste: 600 Oro</div>
              </div>
            </div>
            <button
              onClick={() => handleCraftItem('xp_fruit', 'Frutas XP', 600, 0, 5)}
              className="pixel-btn px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-xs font-bold text-white"
            >
              Forjar
            </button>
          </div>

          <div className="bg-slate-900/90 border border-slate-700 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <img src="/assets/icons/icon_evo_crown.png" className="w-10 h-10 pixelated" alt="" />
              <div>
                <div className="text-xs font-bold text-white">x1 Corona Evolución</div>
                <div className="text-[11px] text-sky-300">Coste: 35 Cristales</div>
              </div>
            </div>
            <button
              onClick={() =>
                handleCraftItem('evolution_crown', 'Corona de Evolución', 0, 35, 1)
              }
              className="pixel-btn px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-xs font-bold text-slate-950"
            >
              Forjar
            </button>
          </div>
        </div>
      </div>

      {/* 2D Pixel Art Backpack Inventory */}
      <div className="pixel-panel rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <img
              src="/assets/icons/icon_backpack.png"
              className="w-9 h-9 pixelated"
              alt="Mochila"
            />
            <div>
              <h3 className="font-pixel-title text-xs text-amber-400">
                MOCHILA PIXEL ART 2D • MATERIALES Y ESENCIAS ELEMENTALES
              </h3>
              <p className="text-xs text-slate-400">
                Todos los iconos han sido diseñados en 2D Pixel Art y auditados pixel a pixel.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded bg-slate-800 text-xs text-slate-300 font-mono">
            {BACKPACK_ITEMS_META.length} Tipos de Materiales
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {BACKPACK_ITEMS_META.map((item) => {
            const count = profile.inventory?.[item.key] || 0;
            return (
              <div
                key={item.key}
                className="bg-slate-900/90 border border-slate-700/80 rounded-lg p-2.5 flex flex-col items-center text-center hover:border-amber-500/60 transition"
              >
                <div className="relative">
                  <img src={item.icon} alt={item.name} className="w-12 h-12 pixelated" />
                  <span className="absolute -bottom-1 -right-2 px-1.5 py-0.2 rounded bg-slate-950 border border-amber-400/60 text-[11px] font-mono font-bold text-amber-300">
                    x{count}
                  </span>
                </div>
                <div className="text-xs font-bold text-white mt-2 line-clamp-1">{item.name}</div>
                <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-2">{item.desc}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
