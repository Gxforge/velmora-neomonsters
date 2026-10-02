import React, { useEffect, useRef, useState } from 'react';
import { ELEMENT_META, MONSTERS_BY_ID } from '../data/monstersData';
import { soundManager } from '../lib/audio';

interface EvolutionCeremonyProps {
  oldSpeciesId: string;
  newSpeciesId: string;
  level: number;
  oldStats: { hp: number; atk: number; def: number; spd: number };
  newStats: { hp: number; atk: number; def: number; spd: number };
  onClose: () => void;
}

export const EvolutionCeremonyModal: React.FC<EvolutionCeremonyProps> = ({
  oldSpeciesId,
  newSpeciesId,
  level,
  oldStats,
  newStats,
  onClose,
}) => {
  const oldSpec = MONSTERS_BY_ID[oldSpeciesId];
  const newSpec = MONSTERS_BY_ID[newSpeciesId];
  const elemMeta = ELEMENT_META[newSpec.element];

  const [phase, setPhase] = useState<'charging' | 'metamorphosis' | 'ascended'>('charging');
  const [showDesignSheet, setShowDesignSheet] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    soundManager.playSfx('evolve');
    const t1 = setTimeout(() => {
      setPhase('metamorphosis');
      soundManager.playSfx('ultimate');
    }, 1700);
    const t2 = setTimeout(() => {
      setPhase('ascended');
      soundManager.playSfx('evolve');
    }, 3400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const oldSheet = new Image();
    oldSheet.src = `/assets/spritesheets/${oldSpeciesId}_sheet.png`;
    const newSheet = new Image();
    newSheet.src = `/assets/spritesheets/${newSpeciesId}_sheet.png`;
    const bgImg = new Image();
    bgImg.src = '/assets/scenes/summon_altar_bg.png';

    let animId = 0;
    const startTime = performance.now();

    const render = (now: number) => {
      const elapsed = now - startTime;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (bgImg.complete && bgImg.naturalWidth > 0) {
        ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(6, 9, 20, 0.62)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else {
        ctx.fillStyle = '#090d1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      const cx = canvas.width / 2;
      const cy = canvas.height / 2 + 10;

      // Rotating arcane evolution rings
      const numRings = phase === 'metamorphosis' ? 4 : 2;
      for (let r = 0; r < numRings; r++) {
        ctx.save();
        ctx.strokeStyle = r % 2 === 0 ? elemMeta.color : '#fde047';
        ctx.lineWidth = phase === 'metamorphosis' ? 3 : 2;
        ctx.beginPath();
        const radX = 75 + r * 28 + Math.sin(elapsed / 200 + r) * 8;
        const radY = 28 + r * 12;
        ctx.ellipse(cx, cy + 58, radX, radY, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Draw current monster frame from real 6x4 Sprite Sheet (128x128 per cell)
      const frameCol = Math.floor(elapsed / 150) % 4;
      const drawSize = 184;

      if (phase === 'charging') {
        // Row 5 (evolve) frames 0..1 on old monster sheet
        const col = Math.floor(elapsed / 200) % 2;
        if (oldSheet.complete && oldSheet.naturalWidth > 0) {
          ctx.drawImage(oldSheet, col * 128, 5 * 128, 128, 128, cx - drawSize / 2, cy - drawSize / 2, drawSize, drawSize);
        }
      } else if (phase === 'metamorphosis') {
        // Rapid alternation between oldSheet Row 5 (frames 2..3) and newSheet Row 5 (frames 2..3) + energy rays
        for (let i = 0; i < 12; i++) {
          const ang = (elapsed / 300) + (i * Math.PI) / 6;
          ctx.strokeStyle = i % 2 === 0 ? '#fde047' : elemMeta.color;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(ang) * 160, cy + Math.sin(ang) * 140);
          ctx.stroke();
        }
        const useNew = Math.floor(elapsed / 120) % 2 === 0;
        const activeSheet = useNew ? newSheet : oldSheet;
        const col = 2 + (Math.floor(elapsed / 140) % 2);
        if (activeSheet.complete && activeSheet.naturalWidth > 0) {
          ctx.drawImage(activeSheet, col * 128, 5 * 128, 128, 128, cx - drawSize / 2, cy - drawSize / 2 - 8, drawSize, drawSize);
        }
      } else {
        // Ascended: Row 1 (idle_alt battle roar) on new monster sheet
        if (newSheet.complete && newSheet.naturalWidth > 0) {
          ctx.drawImage(newSheet, frameCol * 128, 1 * 128, 128, 128, cx - drawSize / 2, cy - drawSize / 2 - 4, drawSize, drawSize);
        }
      }

      // Floating pixel particles
      for (let p = 0; p < 18; p++) {
        const px = ((p * 53 + Math.floor(elapsed / 18)) % (canvas.width - 40)) + 20;
        const py = canvas.height - (((p * 41 + Math.floor(elapsed / 12)) % (canvas.height - 30)) + 15);
        ctx.fillStyle = p % 2 === 0 ? '#fde047' : elemMeta.color;
        ctx.fillRect(px, py, 4, 4);
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [oldSpeciesId, newSpeciesId, phase, elemMeta.color]);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-3 overflow-y-auto">
      <div className="pixel-panel max-w-2xl w-full p-4 sm:p-5 border-2 border-amber-400 shadow-2xl">
        <div className="flex items-center justify-between border-b-2 border-slate-800 pb-3 mb-3">
          <div className="flex items-center gap-2.5">
            <img src="/assets/icons/icon_evo_crown.png" alt="Evo" className="w-8 h-8 pixel-art" />
            <div>
              <div className="font-pixel text-xs sm:text-sm text-amber-300">
                {phase === 'charging' && '⚡ CANALIZANDO ESENCIA ELEMENTAL...'}
                {phase === 'metamorphosis' && '✨ ¡METAMORFOSIS EN CURSO! ✨'}
                {phase === 'ascended' && `👑 ¡ASCENSIÓN COMPLETADA: ETAPA ${newSpec.stage}!`}
              </div>
              <div className="text-xs text-slate-300">
                {oldSpec.name} (Etapa {oldSpec.stage}) ➔ <span className="text-amber-300 font-bold">{newSpec.name} (Etapa {newSpec.stage} • {newSpec.rarity})</span>
              </div>
            </div>
          </div>
          {phase === 'ascended' && (
            <button onClick={onClose} className="pixel-btn pixel-btn-slate px-3 py-1.5 text-[10px]">
              ✕ CERRAR
            </button>
          )}
        </div>

        {/* Live Sprite-Sheet Ceremony Canvas */}
        <div className="relative rounded border-2 border-amber-500/60 overflow-hidden bg-slate-950 mb-3">
          <canvas ref={canvasRef} width={560} height={260} className="w-full h-[220px] sm:h-[250px] block pixel-art" />
          <div className="absolute top-2 left-2 bg-slate-950/85 border border-slate-700 px-2.5 py-1 rounded text-[10px] font-mono text-slate-300">
            SPRITESHEET: <span className="text-amber-300">/assets/spritesheets/{phase === 'ascended' ? newSpeciesId : oldSpeciesId}_sheet.png</span>
          </div>
          <div className="absolute bottom-2 inset-x-2 flex items-center justify-between bg-slate-950/90 border border-amber-500/40 px-3 py-1.5 rounded">
            <div className="flex items-center gap-2">
              <img src={`/assets/monsters/${oldSpeciesId}.png`} alt={oldSpec.name} className="w-9 h-9 pixel-art bg-slate-900 rounded border border-slate-700" />
              <span className="text-xs text-slate-400 line-through">{oldSpec.name}</span>
              <span className="text-amber-400 font-pixel text-xs">➔</span>
              <img src={`/assets/monsters/${newSpeciesId}.png`} alt={newSpec.name} className="w-10 h-10 pixel-art bg-slate-900 rounded border border-amber-400" />
              <div>
                <div className="font-pixel text-[11px] text-amber-300">{newSpec.name}</div>
                <div className="text-[10px] text-slate-300">{newSpec.title} • Nv.{level}</div>
              </div>
            </div>
            <span className="text-[10px] font-pixel px-2 py-1 rounded bg-amber-500/20 border border-amber-400 text-amber-300">
              {newSpec.rarity.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Stat Comparison & New Passive / Ultimate */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div className="bg-slate-900/90 border border-slate-700 rounded p-3">
            <div className="font-pixel text-[10px] text-emerald-400 mb-2">INCREMENTO DE ATRIBUTOS (NV.{level})</div>
            <div className="space-y-1.5 text-xs">
              {[
                { label: 'HP MÁX', oldV: oldStats.hp, newV: newStats.hp, color: 'text-emerald-400' },
                { label: 'ATAQUE', oldV: oldStats.atk, newV: newStats.atk, color: 'text-rose-400' },
                { label: 'DEFENSA', oldV: oldStats.def, newV: newStats.def, color: 'text-sky-400' },
                { label: 'VELOCIDAD', oldV: oldStats.spd, newV: newStats.spd, color: 'text-amber-300' },
              ].map((st) => {
                const diff = st.newV - st.oldV;
                return (
                  <div key={st.label} className="flex items-center justify-between bg-slate-950/80 px-2.5 py-1 rounded border border-slate-800">
                    <span className="text-slate-400 font-bold">{st.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">{st.oldV}</span>
                      <span className="text-slate-500">➔</span>
                      <span className={`font-bold ${st.color}`}>{st.newV}</span>
                      <span className="text-[10px] font-pixel text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-500/40">
                        +{diff}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-700 rounded p-3 flex flex-col justify-between">
            <div>
              <div className="font-pixel text-[10px] text-amber-300 mb-1.5">NUEVA PASIVA & ULTIMATE DESBLOQUEADA</div>
              <div className="bg-slate-950/90 border border-amber-500/30 rounded p-2 mb-2">
                <div className="text-xs font-bold text-amber-300">🛡️ Pasiva: {newSpec.passive_trait.name}</div>
                <div className="text-[11px] text-slate-300 mt-0.5">{newSpec.passive_trait.desc}</div>
              </div>
              <div className="bg-slate-950/90 border border-rose-500/30 rounded p-2">
                <div className="text-xs font-bold text-rose-300">
                  💥 Ultimate: {newSpec.skills[3].name} ({newSpec.skills[3].tu} TU)
                </div>
                <div className="text-[11px] text-slate-300 mt-0.5">
                  Poder {newSpec.skills[3].power} • {newSpec.skills[3].desc}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Option to inspect full 3-Stage Evolution Design Sheet directly inside Ceremony */}
        {showDesignSheet && (
          <div className="mb-3 bg-slate-950 border-2 border-amber-500/60 rounded p-2">
            <div className="text-[10px] font-pixel text-amber-300 mb-1">
              HOJA DE DISEÑO OFICIAL ({elemMeta.name}): ETAPA 1 ➔ ETAPA 2 ➔ ETAPA 3
            </div>
            <img
              src={newSpec.design_sheet}
              alt="Evolution Design Sheet"
              className="w-full h-auto pixel-art rounded border border-slate-800"
            />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
          <button
            onClick={() => setShowDesignSheet((v) => !v)}
            className="pixel-btn pixel-btn-blue px-3 py-2 text-[10px]"
          >
            {showDesignSheet ? '🔼 OCULTAR HOJA DE EVOLUCIÓN' : '📜 VER HOJA DE DISEÑO DE EVOLUCIÓN'}
          </button>

          <button
            onClick={onClose}
            disabled={phase !== 'ascended'}
            className={`pixel-btn px-5 py-2 text-[11px] ${
              phase === 'ascended' ? 'pixel-btn-gold' : 'pixel-btn-slate opacity-50'
            }`}
          >
            {phase === 'ascended' ? '👑 ¡CONTINUAR CON EL NUEVO MONSTRUO!' : 'EVOLUCIONANDO...'}
          </button>
        </div>
      </div>
    </div>
  );
};
