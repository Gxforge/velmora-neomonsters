import React, { useEffect, useRef, useState } from 'react';
import {
  ALL_MONSTERS,
  ELEMENT_META,
  ElementType,
} from '../data/monstersData';

interface CodexProps {
  initialElement?: string;
}

export const CodexAndPixelQA: React.FC<CodexProps> = ({ initialElement = 'fire' }) => {
  const [selectedElement, setSelectedElement] = useState<ElementType>(
    (initialElement as ElementType) || 'fire'
  );
  const [inspectSpriteId, setInspectSpriteId] = useState<string>('pyro_1');
  const [selectedAnimRow, setSelectedAnimRow] = useState<number>(0);
  const [zoomScale, setZoomScale] = useState<number>(4);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [hoveredPixel, setHoveredPixel] = useState<{
    x: number;
    y: number;
    rgba: string;
  } | null>(null);
  const [auditReport, setAuditReport] = useState<any | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (initialElement && initialElement in ELEMENT_META) {
      setSelectedElement(initialElement as ElementType);
      const firstOfElem = ALL_MONSTERS.find((m) => m.element === initialElement && m.stage === 1);
      if (firstOfElem) setInspectSpriteId(firstOfElem.id);
    }
  }, [initialElement]);

  useEffect(() => {
    fetch('/assets/pixel_audit_report.json')
      .then((r) => r.json())
      .then((data) => setAuditReport(data))
      .catch(() => {});
  }, []);

  // Live 6x4 Sprite Sheet Animation Preview Canvas
  useEffect(() => {
    const canvas = animPreviewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const sheetImg = new Image();
    sheetImg.src = `/assets/spritesheets/${inspectSpriteId}_sheet.png`;

    let animId = 0;
    const render = (now: number) => {
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Checkerboard
      for (let y = 0; y < canvas.height; y += 16) {
        for (let x = 0; x < canvas.width; x += 16) {
          ctx.fillStyle = (x / 16 + y / 16) % 2 === 0 ? '#0f172a' : '#1e293b';
          ctx.fillRect(x, y, 16, 16);
        }
      }

      if (sheetImg.complete && sheetImg.naturalWidth >= 512) {
        const col = Math.floor(now / 160) % 4;
        ctx.drawImage(
          sheetImg,
          col * 128,
          selectedAnimRow * 128,
          128,
          128,
          16,
          16,
          160,
          160
        );
      }
      animId = requestAnimationFrame(render);
    };
    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [inspectSpriteId, selectedAnimRow]);

  // Draw zoomed pixel-by-pixel inspector canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = `/assets/monsters/${inspectSpriteId}.png`;
    img.onload = () => {
      const w = 48 * zoomScale;
      const h = 48 * zoomScale;
      canvas.width = w;
      canvas.height = h;
      ctx.imageSmoothingEnabled = false;

      for (let py = 0; py < 48; py++) {
        for (let px = 0; px < 48; px++) {
          ctx.fillStyle = (px + py) % 2 === 0 ? '#0f172a' : '#1e293b';
          ctx.fillRect(px * zoomScale, py * zoomScale, zoomScale, zoomScale);
        }
      }

      ctx.drawImage(img, 0, 0, w, h);

      if (showGrid && zoomScale >= 4) {
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
        ctx.lineWidth = 1;
        for (let x = 0; x <= 48; x++) {
          ctx.beginPath();
          ctx.moveTo(x * zoomScale, 0);
          ctx.lineTo(x * zoomScale, h);
          ctx.stroke();
        }
        for (let y = 0; y <= 48; y++) {
          ctx.beginPath();
          ctx.moveTo(0, y * zoomScale);
          ctx.lineTo(w, y * zoomScale);
          ctx.stroke();
        }
      }
    };
  }, [inspectSpriteId, zoomScale, showGrid]);

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = Math.floor(((e.clientX - rect.left) * scaleX) / zoomScale);
    const cy = Math.floor(((e.clientY - rect.top) * scaleY) / zoomScale);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pixel = ctx.getImageData(cx * zoomScale + 1, cy * zoomScale + 1, 1, 1).data;
    setHoveredPixel({
      x: Math.max(0, Math.min(47, cx)),
      y: Math.max(0, Math.min(47, cy)),
      rgba: `rgba(${pixel[0]}, ${pixel[1]}, ${pixel[2]}, ${(pixel[3] / 255).toFixed(2)})`,
    });
  };

  const familyMonsters = ALL_MONSTERS.filter((m) => m.element === selectedElement).sort(
    (a, b) => a.stage - b.stage
  );

  const ANIM_ROW_LABELS = [
    { row: 0, name: 'idle', desc: 'Fila 0: Idle (Respiración + Aura • 180ms)' },
    { row: 1, name: 'idle_alt', desc: 'Fila 1: Idle Alt (Rugido de Combate • 160ms)' },
    { row: 2, name: 'attack', desc: 'Fila 2: Attack (Carga, Embestida y Tajo • 110ms)' },
    { row: 3, name: 'hit', desc: 'Fila 3: Hit (Impacto, Flash y Retroceso • 120ms)' },
    { row: 4, name: 'faint', desc: 'Fila 4: Faint (Caída y Disolución • 180ms)' },
    { row: 5, name: 'evolve', desc: 'Fila 5: Evolve (Vórtice y Ascensión • 150ms)' },
  ];

  return (
    <div className="space-y-4">
      {/* Element Selector Tabs */}
      <div className="pixel-panel p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="font-pixel text-xs sm:text-sm text-amber-300">
              📜 HOJAS DE DISEÑO DE EVOLUCIÓN vs SPRITE SHEETS 6×4 REALES
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              Documentación visual separada: Hojas de Diseño (`1200×540`) en `/assets/sheets/` y Sprite Sheets de Animación (`512×768`, 24 frames `128×128`) en `/assets/spritesheets/`.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(ELEMENT_META) as ElementType[]).map((el) => {
              const meta = ELEMENT_META[el];
              const active = selectedElement === el;
              return (
                <button
                  key={el}
                  onClick={() => {
                    setSelectedElement(el);
                    const first = ALL_MONSTERS.find((m) => m.element === el && m.stage === 1);
                    if (first) setInspectSpriteId(first.id);
                  }}
                  className={`px-2.5 py-1.5 rounded border-2 font-pixel text-[9px] flex items-center gap-1.5 transition ${
                    active
                      ? 'bg-amber-500 text-slate-950 border-amber-200 shadow-lg'
                      : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-amber-400'
                  }`}
                >
                  <img src={meta.icon} alt={meta.name} className="w-4 h-4 pixel-art" />
                  {meta.name.toUpperCase()}
                </button>
              );
            })}
          </div>
        </div>

        {/* Full-Width 1200x540 Evolution Design Sheet Image */}
        <div className="bg-slate-950 p-2 rounded border-2 border-amber-500/60 overflow-x-auto">
          <img
            src={ELEMENT_META[selectedElement].sheet}
            alt={`Evolution Design Sheet ${selectedElement}`}
            className="w-full min-w-[680px] h-auto pixel-art rounded"
          />
        </div>

        {/* Quick Stage Selector under the Sheet */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
          {familyMonsters.map((m) => (
            <div
              key={m.id}
              onClick={() => setInspectSpriteId(m.id)}
              className={`p-3 rounded border-2 cursor-pointer transition flex items-center gap-3 ${
                inspectSpriteId === m.id
                  ? 'bg-slate-800 border-amber-400'
                  : 'bg-slate-900/80 border-slate-700 hover:border-sky-400'
              }`}
            >
              <img src={m.sprite} alt={m.name} className="w-14 h-14 pixel-art bg-slate-950 p-1 rounded" />
              <div>
                <div className="text-[10px] font-pixel text-amber-300">
                  ETAPA {m.stage} • {m.rarity.toUpperCase()}
                </div>
                <div className="text-sm font-bold text-white">{m.name}</div>
                <div className="text-xs text-slate-400">{m.title}</div>
                <div className="text-[10px] text-sky-300 mt-1 underline">
                  Inspeccionar Sprite Sheet 6×4 →
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Real 6x4 Sprite Sheet Viewer + Pixel-by-Pixel QA Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Production 6x4 Sprite Sheet & Live Row Animator */}
        <div className="lg:col-span-7 pixel-panel p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-pixel text-xs text-sky-300">
                🎞️ SPRITE SHEET DE PRODUCCIÓN 6×4 (`/assets/spritesheets/{inspectSpriteId}_sheet.png`)
              </div>
              <div className="text-[11px] text-slate-400">
                Cuadrícula nativa: 4 columnas × 6 filas = 24 frames distintos (`128×128 px` por celda, total `512×768 px`)
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
            {/* Live Animated Frame Preview + Row Selector */}
            <div className="sm:col-span-5 space-y-2">
              <div className="bg-slate-950 border-2 border-amber-400 rounded p-2 flex flex-col items-center">
                <div className="text-[9px] font-pixel text-amber-300 mb-1">
                  PREVIEW EN VIVO (FILA {selectedAnimRow})
                </div>
                <canvas
                  ref={animPreviewCanvasRef}
                  width={192}
                  height={192}
                  className="w-36 h-36 pixel-art rounded border border-slate-800"
                />
              </div>

              <div className="space-y-1">
                {ANIM_ROW_LABELS.map((r) => (
                  <button
                    key={r.row}
                    onClick={() => setSelectedAnimRow(r.row)}
                    className={`w-full text-left px-2.5 py-1.5 rounded border text-[10px] font-mono transition ${
                      selectedAnimRow === r.row
                        ? 'bg-amber-500 text-slate-950 font-bold border-amber-300'
                        : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-sky-400'
                    }`}
                  >
                    {r.desc}
                  </button>
                ))}
              </div>
            </div>

            {/* Full 512x768 Sprite Sheet Grid Image */}
            <div className="sm:col-span-7 bg-slate-950 border-2 border-slate-700 rounded p-2 flex flex-col items-center">
              <div className="text-[9px] font-pixel text-slate-400 mb-1">
                HOJA DE SPRITES COMPLETA (512×768 PX • 24 CELDAS)
              </div>
              <img
                src={`/assets/spritesheets/${inspectSpriteId}_sheet.png`}
                alt={`${inspectSpriteId} spritesheet`}
                className="w-full max-w-[280px] h-auto pixel-art border border-slate-800 rounded"
              />
            </div>
          </div>
        </div>

        {/* Pixel-by-Pixel Canvas & Algorithmic QA Metrics */}
        <div className="lg:col-span-5 pixel-panel p-4 flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="font-pixel text-xs text-emerald-400">
                🔍 AUDITORÍA ALGORÍTMICA & PÍXEL POR PÍXEL
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setShowGrid((g) => !g)}
                  className="pixel-btn pixel-btn-slate px-2 py-1 text-[9px]"
                >
                  {showGrid ? 'GRID ON' : 'GRID OFF'}
                </button>
                {[4, 6].map((z) => (
                  <button
                    key={z}
                    onClick={() => setZoomScale(z)}
                    className={`pixel-btn px-2 py-1 text-[9px] ${
                      zoomScale === z ? 'pixel-btn-gold' : 'pixel-btn-slate'
                    }`}
                  >
                    {z}x
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded p-2 flex flex-col items-center">
              <canvas
                ref={canvasRef}
                onMouseMove={handleCanvasMouseMove}
                className="pixel-art cursor-crosshair border border-amber-500/40 max-w-full"
              />
              <div className="mt-1.5 text-[10px] font-mono text-slate-300">
                {hoveredPixel
                  ? `Píxel (${hoveredPixel.x}, ${hoveredPixel.y}) • ${hoveredPixel.rgba}`
                  : 'Pasa el cursor para inspeccionar coordenadas RGBA'}
              </div>
            </div>
          </div>

          {auditReport && (
            <div className="bg-slate-900/90 border border-slate-700 rounded p-3 space-y-2 text-xs">
              <div className="font-pixel text-[10px] text-amber-300">
                RESULTADOS REALES (`pixel_audit_report.json`):
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-950 p-2 rounded border border-slate-800">
                  <div className="text-[9px] text-slate-400">ACTIVOS AUDITADOS</div>
                  <div className="font-pixel text-xs text-emerald-400 mt-0.5">
                    {auditReport.total_assets_inspected} ARCHIVOS
                  </div>
                </div>
                <div className="bg-slate-950 p-2 rounded border border-slate-800">
                  <div className="text-[9px] text-slate-400">SILUETA IoU MEDIA (153 PARES)</div>
                  <div className="font-pixel text-xs text-sky-300 mt-0.5">
                    {auditReport.cross_species_uniqueness?.mean_silhouette_iou} (MÁX {auditReport.cross_species_uniqueness?.max_silhouette_iou})
                  </div>
                </div>
                <div className="bg-slate-950 p-2 rounded border border-slate-800">
                  <div className="text-[9px] text-slate-400">SPRITESHEETS 6×4</div>
                  <div className="font-pixel text-xs text-amber-300 mt-0.5">
                    18 SHEETS (432 FRAMES)
                  </div>
                </div>
                <div className="bg-slate-950 p-2 rounded border border-slate-800">
                  <div className="text-[9px] text-slate-400">ICONOS / AUDIO CC0</div>
                  <div className="font-pixel text-xs text-purple-300 mt-0.5">
                    24 ICONOS + 8 PISTAS
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
