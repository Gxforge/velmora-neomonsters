import React, { useEffect, useRef, useState } from 'react';
import {
  ELEMENT_META,
  ElementType,
  getElementMultiplier,
  getMonsterStatsAtLevel,
  MONSTER_SPECIES,
  MonsterSkill,
  OwnedMonster,
  SPECIES_BY_ID,
} from '../data/monstersData';
import { PlayerProfile, recordHouseTreasuryEvent, gameSupabase } from '../lib/supabase';
import { soundManager } from '../lib/audio';
import { Shield, Swords, Sparkles, Trophy, Flame, Coins, RefreshCw } from 'lucide-react';

interface BattleUnit {
  uid: string;
  side: 'player' | 'enemy';
  slotIndex: number; // 0..3 active frontline
  speciesId: string;
  name: string;
  element: ElementType;
  level: number;
  maxHp: number;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  tu: number; // Time Units until next turn (Neo Monsters mechanic)
  shield: number;
  atkBuff: boolean;
  status: 'none' | 'burn' | 'poison' | 'stun';
  passiveName: string;
  skills: MonsterSkill[];
  lungeOffset: number;
  hitFlash: number;
}

interface FloatingText {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  alpha: number;
}

interface ProjectileFx {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  progress: number;
  color: string;
}

interface Props {
  profile: PlayerProfile;
  ownedMonsters: OwnedMonster[];
  onUpdateProfile: (updater: (prev: PlayerProfile) => PlayerProfile) => void;
  onCaptureMonster: (speciesId: string, level: number) => void;
}

const WAGER_ROOMS = [
  {
    id: 'wild_expedition',
    title: 'Expedición Salvaje 4v4 (PvE + Captura)',
    subtitle: 'Captura nuevos monstruos para completar tu equipo 4v4 y gana Oro + Esencias',
    entryTon: 0,
    entryGold: 0,
    potTon: 0,
    winnerTon: 0,
    houseRakeTon: 0,
    rewardGold: 450,
    badge: 'GRATIS • CAPTURA ACTIVA',
    color: 'from-emerald-600 to-teal-800',
  },
  {
    id: 'wager_bronze',
    title: 'Arena Bronce 4v4 (Apuesta TON)',
    subtitle: 'Duelo táctico 4v4 • Bote: 1.00 TON (Comisión Casa 10%: 0.10 TON)',
    entryTon: 0.5,
    entryGold: 0,
    potTon: 1.0,
    winnerTon: 0.9,
    houseRakeTon: 0.1,
    rewardGold: 600,
    badge: 'PREMIO: 0.90 TON',
    color: 'from-sky-600 to-blue-900',
  },
  {
    id: 'wager_elite',
    title: 'Arena Élite 4v4 (Apuesta Alta)',
    subtitle: 'Duelo táctico 4v4 • Bote: 4.00 TON (Comisión Casa 10%: 0.40 TON)',
    entryTon: 2.0,
    entryGold: 0,
    potTon: 4.0,
    winnerTon: 3.6,
    houseRakeTon: 0.4,
    rewardGold: 1500,
    badge: 'PREMIO: 3.60 TON',
    color: 'from-purple-600 to-indigo-950',
  },
  {
    id: 'wager_sovereign',
    title: 'Coliseo Soberano 4v4 (High Roller)',
    subtitle: 'Duelo táctico 4v4 • Bote: 20.00 TON (Comisión Casa 10%: 2.00 TON)',
    entryTon: 10.0,
    entryGold: 0,
    potTon: 20.0,
    winnerTon: 18.0,
    houseRakeTon: 2.0,
    rewardGold: 5000,
    badge: 'PREMIO: 18.00 TON',
    color: 'from-amber-500 to-red-900',
  },
];

export const BattleArena4v4: React.FC<Props> = ({
  profile,
  ownedMonsters,
  onUpdateProfile,
  onCaptureMonster,
}) => {
  const [activeRoom, setActiveRoom] = useState<typeof WAGER_ROOMS[0] | null>(null);
  const [units, setUnits] = useState<BattleUnit[]>([]);
  const [playerBench, setPlayerBench] = useState<BattleUnit[]>([]);
  const [enemyBench, setEnemyBench] = useState<BattleUnit[]>([]);
  const [selectedTargetUid, setSelectedTargetUid] = useState<string | null>(null);
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [winner, setWinner] = useState<'player' | 'enemy' | null>(null);
  const [opponentName, setOpponentName] = useState<string>('Domador Salvaje');
  const [isBusy, setIsBusy] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imagesCacheRef = useRef<Record<string, HTMLImageElement>>({});
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const projectileRef = useRef<ProjectileFx | null>(null);
  const unitsRef = useRef<BattleUnit[]>([]);
  unitsRef.current = units;

  // Preload arena background and monster sprites
  useEffect(() => {
    const urls = ['/assets/scenes/battle_arena_bg.png'];
    MONSTER_SPECIES.forEach((s) => {
      urls.push(`/assets/monsters/${s.id}.png`);
      urls.push(`/assets/monsters/${s.id}_anim.png`);
    });
    urls.forEach((u) => {
      if (!imagesCacheRef.current[u]) {
        const img = new Image();
        img.src = u;
        imagesCacheRef.current[u] = img;
      }
    });
  }, []);

  const addFloatingText = (x: number, y: number, text: string, color: string) => {
    floatingTextsRef.current.push({
      id: Math.random(),
      x,
      y,
      text,
      color,
      alpha: 1.0,
    });
  };

  // Start a 4v4 Battle
  const startBattle = (room: typeof WAGER_ROOMS[0]) => {
    if (room.entryTon > 0 && profile.ton_balance < room.entryTon) {
      alert(`Saldo TON insuficiente (${profile.ton_balance.toFixed(2)} TON). Recarga en la Tienda/Billetera.`);
      return;
    }

    // Deduct entry fee immediately if PvP wager
    if (room.entryTon > 0) {
      onUpdateProfile((prev) => ({
        ...prev,
        ton_balance: Number((prev.ton_balance - room.entryTon).toFixed(4)),
      }));
      soundManager.playBgm('pvp_wager');
    } else {
      soundManager.playBgm('battle_4v4');
    }

    // Build Player Squad (Frontline slots 1..4 + Bench slots 5..8)
    const sortedTeam = [...ownedMonsters]
      .filter((m) => m.teamSlot !== null)
      .sort((a, b) => (a.teamSlot || 99) - (b.teamSlot || 99));

    const effectiveTeam = sortedTeam.length > 0 ? sortedTeam : ownedMonsters.slice(0, 4);

    const buildUnit = (
      speciesId: string,
      level: number,
      side: 'player' | 'enemy',
      slotIndex: number,
      idx: number
    ): BattleUnit => {
      const sp = SPECIES_BY_ID[speciesId] || MONSTER_SPECIES[0];
      const st = getMonsterStatsAtLevel(sp, level);
      const initialTu = Math.max(10, Math.round(120 - st.spd * 0.45 + idx * 12));
      const startShield = sp.element === 'earth' ? Math.round(st.hp * 0.15) : 0;
      return {
        uid: `${side}_${idx}_${speciesId}_${Math.random().toString(36).slice(2, 6)}`,
        side,
        slotIndex,
        speciesId: sp.id,
        name: sp.name,
        element: sp.element,
        level,
        maxHp: st.hp,
        hp: st.hp,
        atk: st.atk,
        def: st.def,
        spd: st.spd,
        tu: initialTu,
        shield: startShield,
        atkBuff: false,
        status: 'none',
        passiveName: sp.passive_trait.name,
        skills: sp.skills,
        lungeOffset: 0,
        hitFlash: 0,
      };
    };

    const pAll = effectiveTeam.map((m, i) =>
      buildUnit(m.speciesId, m.level, 'player', i % 4, i)
    );
    const pFront = pAll.slice(0, 4).map((u, i) => ({ ...u, slotIndex: i }));
    const pRes = pAll.slice(4, 8);

    // Build Enemy 4v4 Squad scaled cleanly to player's team size & level
    const avgLvl = Math.max(
      3,
      Math.round(pFront.reduce((acc, u) => acc + u.level, 0) / Math.max(1, pFront.length))
    );
    const enemyPool =
      room.entryTon >= 2
        ? MONSTER_SPECIES.filter((s) => s.stage >= 2)
        : MONSTER_SPECIES.filter((s) => s.stage <= 2);

    const eFront: BattleUnit[] = [];
    for (let i = 0; i < 4; i++) {
      const pick = enemyPool[Math.floor(Math.random() * enemyPool.length)];
      const eLvl = room.id === 'wild_expedition' ? Math.max(2, avgLvl - 1) : avgLvl;
      eFront.push(buildUnit(pick.id, eLvl, 'enemy', i, i));
    }

    // Normalize TU so lowest is 0
    const allActive = [...pFront, ...eFront];
    const minTu = Math.min(...allActive.map((u) => u.tu));
    allActive.forEach((u) => {
      u.tu = Math.max(0, u.tu - minTu);
    });

    const rivalNames = [
      'Kaelen_TON',
      'Valkyria_99',
      'DrakoMaster',
      'ShadowWhale',
      'NeoTamer_ES',
    ];
    const opp =
      room.id === 'wild_expedition'
        ? 'Manada Elemental Salvaje (4v4)'
        : `Domador @${rivalNames[Math.floor(Math.random() * rivalNames.length)]}`;

    setOpponentName(opp);
    setUnits(allActive);
    setPlayerBench(pRes);
    setEnemyBench([]);
    setSelectedTargetUid(eFront[0]?.uid || null);
    setWinner(null);
    setIsBusy(false);
    setActiveRoom(room);
    setBattleLog([
      `⚔️ ¡Comienza el combate 4v4 en ${room.title} contra ${opp}!`,
      pFront.length < 4 && room.id === 'wild_expedition'
        ? `💡 Consejo: Tienes ${pFront.length}/4 monstruos en campo. ¡Usa tus Orbes de Captura para atrapar monstruos rivales y completar tu escuadrón 4v4!`
        : `⚡ Sistema de Tiempo (TU) activo: El monstruo con 0 TU actúa primero.`,
    ]);
  };

  // Determine active actor (unit with minimum TU)
  const activeActor =
    units.length > 0 && !winner
      ? [...units].sort((a, b) => a.tu - b.tu || b.spd - a.spd)[0]
      : null;

  // Keep valid enemy target selected
  useEffect(() => {
    const enemies = units.filter((u) => u.side === 'enemy' && u.hp > 0);
    if (enemies.length > 0 && (!selectedTargetUid || !enemies.some((e) => e.uid === selectedTargetUid))) {
      setSelectedTargetUid(enemies[0].uid);
    }
  }, [units, selectedTargetUid]);

  // Trigger AI turn automatically when activeActor is an enemy
  useEffect(() => {
    if (!activeRoom || winner || isBusy || !activeActor) return;
    if (activeActor.side === 'enemy') {
      setIsBusy(true);
      const timer = setTimeout(() => {
        executeEnemyTurn(activeActor);
      }, 650);
      return () => clearTimeout(timer);
    }
  }, [activeActor?.uid, activeActor?.tu, winner, isBusy, activeRoom]);

  // Canvas 60FPS 2D Pixel Art Renderer
  useEffect(() => {
    if (!activeRoom) return;
    let animId: number;
    let tick = 0;

    const render = () => {
      tick++;
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = false;
          const W = canvas.width;
          const H = canvas.height;

          // 1. Draw Arena Background
          const bg = imagesCacheRef.current['/assets/scenes/battle_arena_bg.png'];
          if (bg && bg.complete) {
            ctx.drawImage(bg, 0, 0, W, H);
          } else {
            ctx.fillStyle = '#141829';
            ctx.fillRect(0, 0, W, H);
          }

          // Dark vignette overlay for contrast
          ctx.fillStyle = 'rgba(8, 10, 20, 0.28)';
          ctx.fillRect(0, 0, W, H);

          // 2. 4v4 Slot Coordinates on the Colosseum Floor
          const playerCoords = [
            { x: 155, y: 155 },
            { x: 95, y: 205 },
            { x: 175, y: 248 },
            { x: 105, y: 295 },
          ];
          const enemyCoords = [
            { x: W - 155, y: 155 },
            { x: W - 95, y: 205 },
            { x: W - 175, y: 248 },
            { x: W - 105, y: 295 },
          ];

          const frameIdx = Math.floor(tick / 24) % 2; // 2-frame pixel breathing

          // Sort units by Y so front units overlap cleanly
          const currentUnits = [...unitsRef.current].sort((a, b) => a.slotIndex - b.slotIndex);

          currentUnits.forEach((u) => {
            const basePos =
              u.side === 'player'
                ? playerCoords[u.slotIndex % 4]
                : enemyCoords[u.slotIndex % 4];
            const ux = basePos.x + (u.side === 'player' ? u.lungeOffset : -u.lungeOffset);
            const uy = basePos.y;

            const isActor = activeActor?.uid === u.uid;
            const isTarget = selectedTargetUid === u.uid && u.side === 'enemy';

            // Ground Tactical Rune Ring
            ctx.save();
            ctx.beginPath();
            ctx.ellipse(ux, uy + 34, 38, 13, 0, 0, Math.PI * 2);
            if (isActor) {
              ctx.fillStyle = 'rgba(250, 204, 21, 0.38)';
              ctx.strokeStyle = '#facc15';
              ctx.lineWidth = 3;
            } else if (isTarget) {
              ctx.fillStyle = 'rgba(239, 68, 68, 0.32)';
              ctx.strokeStyle = '#ef4444';
              ctx.lineWidth = 2.5;
            } else {
              ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
              ctx.strokeStyle = ELEMENT_META[u.element].color;
              ctx.lineWidth = 1.5;
            }
            ctx.fill();
            ctx.stroke();
            ctx.restore();

            // Draw Monster 2D Pixel Art Sprite (flipped horizontally for player side so both face center!)
            const animImg = imagesCacheRef.current[`/assets/monsters/${u.speciesId}_anim.png`];
            const staticImg = imagesCacheRef.current[`/assets/monsters/${u.speciesId}.png`];
            const spriteSize = 92;

            ctx.save();
            ctx.translate(ux, uy - 8);
            if (u.side === 'player') {
              ctx.scale(-1, 1);
            }
            if (u.hitFlash > 0) {
              ctx.filter = 'brightness(2.5) contrast(1.5)';
            }
            if (animImg && animImg.complete && animImg.naturalWidth >= 384) {
              ctx.drawImage(
                animImg,
                frameIdx * 192,
                0,
                192,
                192,
                -spriteSize / 2,
                -spriteSize / 2,
                spriteSize,
                spriteSize
              );
            } else if (staticImg && staticImg.complete) {
              ctx.drawImage(
                staticImg,
                -spriteSize / 2,
                -spriteSize / 2,
                spriteSize,
                spriteSize
              );
            }
            ctx.restore();

            // Draw Overhead Pixel HUD (Name, Element Dot, HP Bar, Shield Bar, TU Badge)
            const barW = 82;
            const barH = 8;
            const bx = ux - barW / 2;
            const by = uy - 62;

            // Name & Lv
            ctx.font = 'bold 10px monospace';
            ctx.fillStyle = '#090d16';
            ctx.fillRect(bx - 2, by - 14, barW + 4, 26);
            ctx.strokeStyle = isActor ? '#facc15' : ELEMENT_META[u.element].color;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(bx - 2, by - 14, barW + 4, 26);

            ctx.fillStyle = isActor ? '#fde047' : '#f8fafc';
            ctx.textAlign = 'center';
            ctx.fillText(`${u.name.slice(0, 9)} Nv.${u.level}`, ux, by - 4);

            // HP Bar
            const hpPct = Math.max(0, Math.min(1, u.hp / u.maxHp));
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(bx, by, barW, barH);
            ctx.fillStyle =
              hpPct > 0.5 ? '#22c55e' : hpPct > 0.25 ? '#f59e0b' : '#ef4444';
            ctx.fillRect(bx, by, Math.round(barW * hpPct), barH);

            // Shield Overlay
            if (u.shield > 0) {
              const shPct = Math.min(1, u.shield / u.maxHp);
              ctx.fillStyle = '#38bdf8';
              ctx.fillRect(bx, by + barH - 3, Math.round(barW * shPct), 3);
            }

            // Status / Buff tag
            if (u.status !== 'none' || u.atkBuff) {
              ctx.font = 'bold 9px monospace';
              ctx.fillStyle =
                u.status === 'burn'
                  ? '#fb923c'
                  : u.status === 'poison'
                  ? '#c084fc'
                  : u.status === 'stun'
                  ? '#facc15'
                  : '#38bdf8';
              const label =
                u.status !== 'none' ? u.status.toUpperCase() : 'ATK+';
              ctx.fillText(label, ux, by + 20);
            }
          });

          // 3. Projectile FX
          if (projectileRef.current) {
            const p = projectileRef.current;
            p.progress += 0.14;
            const cx = p.fromX + (p.toX - p.fromX) * p.progress;
            const cy = p.fromY + (p.toY - p.fromY) * p.progress;

            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, 12, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();
            ctx.restore();

            if (p.progress >= 1.0) {
              projectileRef.current = null;
            }
          }

          // 4. Floating Damage / Status Texts
          floatingTextsRef.current.forEach((ft) => {
            ctx.save();
            ctx.font = 'bold 13px monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#000000';
            ctx.fillText(ft.text, ft.x + 1, ft.y + 1);
            ctx.fillStyle = ft.color;
            ctx.fillText(ft.text, ft.x, ft.y);
            ctx.restore();
            ft.y -= 0.85;
            ft.alpha -= 0.022;
          });
          floatingTextsRef.current = floatingTextsRef.current.filter((f) => f.alpha > 0);
        }
      }
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [activeRoom, activeActor?.uid, selectedTargetUid]);

  // Handle clicking on Canvas to select Enemy Target
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;

    const W = canvas.width;
    const enemyCoords = [
      { x: W - 155, y: 155 },
      { x: W - 95, y: 205 },
      { x: W - 175, y: 248 },
      { x: W - 105, y: 295 },
    ];

    units
      .filter((u) => u.side === 'enemy')
      .forEach((u) => {
        const pos = enemyCoords[u.slotIndex % 4];
        if (Math.hypot(cx - pos.x, cy - pos.y) < 52) {
          setSelectedTargetUid(u.uid);
        }
      });
  };

  // Advance TU clock so the next readiness unit reaches 0 TU
  const normalizeAndCheckOutcome = (
    updatedUnits: BattleUnit[],
    pBenchCurr: BattleUnit[],
    eBenchCurr: BattleUnit[]
  ) => {
    let survivors = updatedUnits.filter((u) => u.hp > 0);
    let nextPBench = [...pBenchCurr];
    let nextEBench = [...eBenchCurr];

    // Check if any frontline slot (0..3) opened up and bring in reinforcement from bench
    const pSlotsUsed = new Set(
      survivors.filter((u) => u.side === 'player').map((u) => u.slotIndex)
    );
    for (let s = 0; s < 4; s++) {
      if (!pSlotsUsed.has(s) && nextPBench.length > 0) {
        const rein = { ...nextPBench[0], slotIndex: s, tu: 25 };
        nextPBench = nextPBench.slice(1);
        survivors.push(rein);
      }
    }

    const eSlotsUsed = new Set(
      survivors.filter((u) => u.side === 'enemy').map((u) => u.slotIndex)
    );
    for (let s = 0; s < 4; s++) {
      if (!eSlotsUsed.has(s) && nextEBench.length > 0) {
        const rein = { ...nextEBench[0], slotIndex: s, tu: 25 };
        nextEBench = nextEBench.slice(1);
        survivors.push(rein);
      }
    }

    const pAlive = survivors.filter((u) => u.side === 'player');
    const eAlive = survivors.filter((u) => u.side === 'enemy');

    if (eAlive.length === 0) {
      setUnits(survivors);
      handleBattleEnd('player');
      return;
    }
    if (pAlive.length === 0) {
      setUnits(survivors);
      handleBattleEnd('enemy');
      return;
    }

    const minTu = Math.min(...survivors.map((u) => u.tu));
    const normalized = survivors.map((u) => ({
      ...u,
      tu: Math.max(0, u.tu - minTu),
      lungeOffset: 0,
      hitFlash: 0,
    }));

    setPlayerBench(nextPBench);
    setEnemyBench(nextEBench);
    setUnits(normalized);
    setIsBusy(false);
  };

  // Finish battle & distribute TON Wager Payout + 10% House Rake to Admin Supabase
  const handleBattleEnd = async (winSide: 'player' | 'enemy') => {
    setWinner(winSide);
    setIsBusy(false);
    if (!activeRoom) return;

    if (winSide === 'player') {
      soundManager.playSfx('evolve');
      const elems: ElementType[] = ['fire', 'water', 'earth', 'storm', 'light', 'shadow'];
      const randElem = elems[Math.floor(Math.random() * elems.length)];
      const essenceKey = `essence_${randElem}`;

      onUpdateProfile((prev) => ({
        ...prev,
        gold: prev.gold + activeRoom.rewardGold,
        ton_balance: Number((prev.ton_balance + activeRoom.winnerTon).toFixed(4)),
        trophies: prev.trophies + 28,
        wins: prev.wins + 1,
        campaign_stage: prev.campaign_stage + 1,
        inventory: {
          ...prev.inventory,
          [essenceKey]: (prev.inventory[essenceKey] || 0) + 3,
          xp_fruit: (prev.inventory.xp_fruit || 0) + 2,
        },
      }));

      if (activeRoom.entryTon > 0) {
        await recordHouseTreasuryEvent({
          sourceEvent: `pvp_rake_10pct_${activeRoom.id}`,
          playerTelegramId: profile.telegram_id,
          playerUsername: profile.username,
          grossAmount: activeRoom.potTon,
          houseProfitTon: activeRoom.houseRakeTon,
          houseProfitStars: 0,
          currency: 'TON',
          notes: `Victoria 4v4 en ${activeRoom.title}: Premio ${activeRoom.winnerTon} TON | Casa cobra ${activeRoom.houseRakeTon} TON (10% Rake)`,
        });
      }
    } else {
      onUpdateProfile((prev) => ({
        ...prev,
        gold: prev.gold + 100,
        trophies: Math.max(800, prev.trophies - 15),
        losses: prev.losses + 1,
      }));

      if (activeRoom.entryTon > 0) {
        await recordHouseTreasuryEvent({
          sourceEvent: `pvp_rake_10pct_${activeRoom.id}`,
          playerTelegramId: profile.telegram_id,
          playerUsername: profile.username,
          grossAmount: activeRoom.potTon,
          houseProfitTon: activeRoom.houseRakeTon,
          houseProfitStars: 0,
          currency: 'TON',
          notes: `Partida 4v4 finalizada en ${activeRoom.title}: Casa cobra ${activeRoom.houseRakeTon} TON (10% Rake)`,
        });
      }
    }

    // Also record match in Game DB pvp_matches
    try {
      await gameSupabase.from('pvp_matches').insert({
        room_type: activeRoom.id,
        entry_fee_ton: activeRoom.entryTon,
        house_rake_pct: 10.0,
        prize_pool_ton: activeRoom.potTon,
        house_fee_ton: activeRoom.houseRakeTon,
        player1_name: profile.username,
        player2_name: opponentName,
        status: 'completed',
        winner_name: winSide === 'player' ? profile.username : opponentName,
      });
    } catch {
      // Ignore
    }
  };

  // Execute Skill (Player or Enemy)
  const executeSkill = (actor: BattleUnit, skill: MonsterSkill, explicitTargetUid?: string) => {
    if (isBusy && actor.side === 'player') return;
    setIsBusy(true);

    if (skill.tu >= 145) {
      soundManager.playSfx('ultimate');
    } else {
      soundManager.playSfx('attack');
    }

    const W = canvasRef.current?.width || 680;
    const playerCoords = [
      { x: 155, y: 155 },
      { x: 95, y: 205 },
      { x: 175, y: 248 },
      { x: 105, y: 295 },
    ];
    const enemyCoords = [
      { x: W - 155, y: 155 },
      { x: W - 95, y: 205 },
      { x: W - 175, y: 248 },
      { x: W - 105, y: 295 },
    ];

    const getPos = (u: BattleUnit) =>
      u.side === 'player' ? playerCoords[u.slotIndex % 4] : enemyCoords[u.slotIndex % 4];

    const actorPos = getPos(actor);

    // Burn / Poison tick at start of turn
    let selfBurnDmg = 0;
    if (actor.status === 'burn' || actor.status === 'poison') {
      selfBurnDmg = Math.round(actor.maxHp * 0.07);
    }

    const nextUnits = units.map((u) => ({
      ...u,
      lungeOffset: u.uid === actor.uid ? 22 : 0,
    }));

    const actorRef = nextUnits.find((u) => u.uid === actor.uid)!;
    actorRef.hp = Math.max(1, actorRef.hp - selfBurnDmg);
    actorRef.tu += skill.tu;

    let logMsg = `${actor.name} usó ${skill.name} (+${skill.tu} TU).`;

    if (skill.type === 'heal' || skill.type === 'heal_all') {
      const allies = nextUnits.filter((u) => u.side === actor.side && u.hp > 0);
      const targets =
        skill.type === 'heal_all'
          ? allies
          : [allies.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]];
      targets.forEach((t) => {
        if (!t) return;
        const healAmt = Math.round((skill.power / 100) * actor.atk * 1.1);
        t.hp = Math.min(t.maxHp, t.hp + healAmt);
        const pos = getPos(t);
        addFloatingText(pos.x, pos.y - 30, `+${healAmt} HP`, '#4ade80');
      });
      logMsg = `✨ ${actor.name} restauró vida con ${skill.name}!`;
    } else if (skill.type === 'shield' || skill.type === 'shield_all') {
      const allies = nextUnits.filter((u) => u.side === actor.side && u.hp > 0);
      const targets = skill.type === 'shield_all' ? allies : [actorRef];
      targets.forEach((t) => {
        const shAmt = Math.round(t.maxHp * 0.25);
        t.shield += shAmt;
        const pos = getPos(t);
        addFloatingText(pos.x, pos.y - 30, `+${shAmt} ESCUDO`, '#38bdf8');
      });
      logMsg = `🛡️ ${actor.name} desplegó ${skill.name}!`;
    } else if (skill.type.startsWith('buff_')) {
      const allies = nextUnits.filter((u) => u.side === actor.side && u.hp > 0);
      const targets = skill.type === 'buff_team' ? allies : [actorRef];
      targets.forEach((t) => {
        t.atkBuff = true;
        if (skill.type === 'buff_spd' || skill.type === 'buff_team') {
          t.tu = Math.max(0, t.tu - 25);
        }
        const pos = getPos(t);
        addFloatingText(pos.x, pos.y - 30, `ATK/SPD UP!`, '#facc15');
      });
      logMsg = `🔥 ${actor.name} potenció al escuadrón con ${skill.name}!`;
    } else {
      // Offensive attack (single, aoe2, aoe4)
      const opponents = nextUnits.filter((u) => u.side !== actor.side && u.hp > 0);
      let targets: BattleUnit[] = [];
      const primary =
        opponents.find((o) => o.uid === (explicitTargetUid || selectedTargetUid)) ||
        opponents[0];

      if (skill.type === 'single' && primary) {
        targets = [primary];
      } else if (skill.type === 'aoe2') {
        targets = opponents.slice(0, 2);
      } else {
        targets = opponents;
      }

      if (primary) {
        const tPos = getPos(primary);
        projectileRef.current = {
          fromX: actorPos.x,
          fromY: actorPos.y,
          toX: tPos.x,
          toY: tPos.y,
          progress: 0,
          color: ELEMENT_META[actor.element].color,
        };
      }

      targets.forEach((target) => {
        const elemMult = getElementMultiplier(actor.element, target.element);
        const buffMult = actor.atkBuff ? 1.35 : 1.0;
        let bonusMult = 1.0;
        if (skill.effect === 'burn_bonus' && target.status === 'burn') bonusMult = 1.8;
        if (skill.effect === 'poison_bonus' && target.status === 'poison') bonusMult = 1.8;

        const raw =
          ((actor.atk * (skill.power / 100)) / Math.max(40, target.def * 0.55)) *
          95 *
          elemMult *
          buffMult *
          bonusMult;
        let dmg = Math.max(28, Math.round(raw));

        if (target.shield > 0) {
          const absorbed = Math.min(target.shield, dmg);
          target.shield -= absorbed;
          dmg -= absorbed;
        }
        target.hp = Math.max(0, target.hp - dmg);
        target.hitFlash = 1;

        // Apply status effects
        if (skill.effect === 'burn' && target.hp > 0) target.status = 'burn';
        if (skill.effect === 'poison' && target.hp > 0) target.status = 'poison';
        if (skill.effect === 'stun' && target.hp > 0) {
          target.status = 'stun';
          target.tu += 40;
        }
        if (skill.effect === 'slow' && target.hp > 0) {
          target.tu += 30;
        }

        const tPos = getPos(target);
        const tag = elemMult > 1.0 ? `-${dmg} CRÍT!` : `-${dmg}`;
        addFloatingText(
          tPos.x,
          tPos.y - 25,
          tag,
          elemMult > 1.0 ? '#facc15' : '#f87171'
        );
      });

      actorRef.atkBuff = false;
    }

    setUnits(nextUnits);
    setBattleLog((prev) => [logMsg, ...prev.slice(0, 5)]);

    setTimeout(() => {
      normalizeAndCheckOutcome(nextUnits, playerBench, enemyBench);
    }, 520);
  };

  // Enemy AI Turn
  const executeEnemyTurn = (enemyActor: BattleUnit) => {
    const pTargets = unitsRef.current.filter((u) => u.side === 'player' && u.hp > 0);
    if (pTargets.length === 0) return;
    const chosenTarget = pTargets[Math.floor(Math.random() * pTargets.length)];
    const chosenSkill =
      enemyActor.skills[Math.floor(Math.random() * enemyActor.skills.length)] ||
      enemyActor.skills[0];
    executeSkill(enemyActor, chosenSkill, chosenTarget.uid);
  };

  // Throw Capture Orb in Wild Expedition to add monster to 4v4 Team!
  const handleThrowCaptureOrb = (orbType: 'capture_orb_basic' | 'capture_orb_master') => {
    if (!activeRoom || activeRoom.id !== 'wild_expedition') return;
    if ((profile.inventory[orbType] || 0) <= 0) {
      alert('No te quedan Orbes de este tipo en tu Mochila. Forja más en la Ciudadela.');
      return;
    }
    const target = units.find((u) => u.uid === selectedTargetUid && u.side === 'enemy' && u.hp > 0);
    if (!target) return;

    soundManager.playSfx('capture');
    onUpdateProfile((prev) => ({
      ...prev,
      inventory: {
        ...prev.inventory,
        [orbType]: Math.max(0, (prev.inventory[orbType] || 0) - 1),
      },
    }));

    const hpRatio = target.hp / target.maxHp;
    const chance = orbType === 'capture_orb_master' ? 1.0 : Math.min(0.95, 0.55 + (1 - hpRatio) * 0.45);
    const success = Math.random() <= chance;

    const W = canvasRef.current?.width || 680;
    const enemyCoords = [
      { x: W - 155, y: 155 },
      { x: W - 95, y: 205 },
      { x: W - 175, y: 248 },
      { x: W - 105, y: 295 },
    ];
    const tPos = enemyCoords[target.slotIndex % 4];

    if (success) {
      addFloatingText(tPos.x, tPos.y - 30, '🌟 ¡CAPTURADO!', '#38bdf8');
      onCaptureMonster(target.speciesId, target.level);
      setBattleLog((prev) => [
        `🎉 ¡Capturaste a ${target.name} (Nv.${target.level})! Se ha unido a tu equipo 4v4.`,
        ...prev.slice(0, 5),
      ]);
      const updated = units.map((u) => (u.uid === target.uid ? { ...u, hp: 0 } : u));
      setTimeout(() => {
        normalizeAndCheckOutcome(updated, playerBench, enemyBench);
      }, 450);
    } else {
      addFloatingText(tPos.x, tPos.y - 30, '¡ESCAPÓ DEL ORBE!', '#fb923c');
      setBattleLog((prev) => [
        `⚠️ ${target.name} resistió el Orbe. ¡Debilítalo más para asegurar la captura!`,
        ...prev.slice(0, 5),
      ]);
    }
  };

  // Lobby View if no battle active
  if (!activeRoom) {
    const frontlineMonsters = ownedMonsters
      .filter((m) => m.teamSlot && m.teamSlot >= 1 && m.teamSlot <= 4)
      .sort((a, b) => (a.teamSlot || 0) - (b.teamSlot || 0));

    return (
      <div className="space-y-4">
        {/* Current 4v4 Lineup Banner */}
        <div className="pixel-panel rounded-xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="font-pixel-title text-xs sm:text-sm text-amber-400 flex items-center gap-2">
                <Swords className="w-4 h-4" /> ESCUADRÓN TITULAR 4v4 EN CAMPO
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Empiezas con tu inicial elegido y puedes añadir hasta 4 titulares + 4 refuerzos capturando o invocando.
              </p>
            </div>
            <span className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-xs font-bold text-emerald-400">
              {frontlineMonsters.length} / 4 Titulares Listos
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((slot) => {
              const mon = frontlineMonsters.find((m) => m.teamSlot === slot);
              const sp = mon ? SPECIES_BY_ID[mon.speciesId] : null;
              const elem = sp ? ELEMENT_META[sp.element] : null;
              return (
                <div
                  key={slot}
                  className={`rounded-lg p-2 border-2 flex flex-col items-center justify-center min-h-[104px] ${
                    sp
                      ? `${elem?.bgClass} ${elem?.borderClass}`
                      : 'bg-slate-900/60 border-dashed border-slate-700'
                  }`}
                >
                  {sp && mon ? (
                    <>
                      <img
                        src={`/assets/monsters/${sp.id}.png`}
                        alt={sp.name}
                        className="w-14 h-14 pixelated object-contain"
                      />
                      <span className="text-[11px] font-bold text-white truncate max-w-full">
                        {sp.name}
                      </span>
                      <span className="text-[10px] text-amber-300">Nv.{mon.level} • {sp.cost_tu} TU</span>
                    </>
                  ) : (
                    <div className="text-center text-[10px] text-slate-500">
                      <div className="font-bold text-slate-400">SLOT #{slot}</div>
                      <div>Vacío (Captura en PvE)</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Rooms Selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {WAGER_ROOMS.map((room) => (
            <div
              key={room.id}
              className="pixel-panel rounded-xl p-4 flex flex-col justify-between border-l-4 border-l-amber-400"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    {room.badge}
                  </span>
                  {room.entryTon > 0 && (
                    <span className="text-xs font-bold text-sky-400 flex items-center gap-1">
                      <img src="/assets/icons/icon_ton.png" className="w-4 h-4 pixelated" alt="" />
                      Entrada: {room.entryTon} TON
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-base text-white mt-1">{room.title}</h3>
                <p className="text-xs text-slate-300 mt-1">{room.subtitle}</p>
              </div>

              <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-800">
                <div className="text-xs text-slate-400 flex items-center gap-2">
                  <span className="flex items-center gap-1 text-amber-300 font-semibold">
                    <img src="/assets/icons/icon_gold.png" className="w-4 h-4 pixelated" alt="" />
                    +{room.rewardGold} Oro
                  </span>
                  {room.winnerTon > 0 && (
                    <span className="text-emerald-400 font-bold">
                      • Bote Neto: {room.winnerTon} TON
                    </span>
                  )}
                </div>
                <button
                  onClick={() => startBattle(room)}
                  className={`pixel-btn px-4 py-2 rounded-lg text-xs font-bold text-white bg-gradient-to-r ${room.color}`}
                >
                  ⚔️ ENTRAR 4v4
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Active 4v4 Battle View
  const sortedTimeline = [...units].sort((a, b) => a.tu - b.tu || b.spd - a.spd);

  return (
    <div className="space-y-3">
      {/* Top Bar: Match Info & Neo Monsters TU Timeline Queue */}
      <div className="pixel-panel rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 overflow-x-auto py-1">
          <span className="text-[10px] font-pixel-title text-amber-400 uppercase shrink-0">
            COLA TU:
          </span>
          {sortedTimeline.map((u, idx) => (
            <div
              key={u.uid}
              onClick={() => u.side === 'enemy' && setSelectedTargetUid(u.uid)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded border text-xs cursor-pointer shrink-0 ${
                idx === 0
                  ? 'bg-amber-500/25 border-amber-400 text-amber-200 font-bold scale-105'
                  : u.side === 'player'
                  ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-200'
                  : 'bg-rose-950/60 border-rose-700/60 text-rose-200'
              }`}
            >
              <img
                src={`/assets/monsters/${u.speciesId}.png`}
                className="w-6 h-6 pixelated"
                alt=""
              />
              <span>{u.tu} TU</span>
            </div>
          ))}
        </div>

        <button
          onClick={() => setActiveRoom(null)}
          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-600"
        >
          Salir al Lobby
        </button>
      </div>

      {/* 2D Pixel Art Battle Canvas */}
      <div className="relative pixel-panel rounded-xl overflow-hidden border-2 border-amber-500/50">
        <canvas
          ref={canvasRef}
          width={680}
          height={350}
          onClick={handleCanvasClick}
          className="w-full h-[250px] sm:h-[330px] object-cover pixelated cursor-crosshair block"
        />

        {/* Overlay Header inside Arena */}
        <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none">
          <div className="bg-slate-950/85 border border-emerald-500/50 px-2.5 py-1 rounded text-xs">
            <span className="text-emerald-400 font-bold">TÚ: {profile.first_name}</span>
            <span className="text-slate-400 ml-2">
              ({units.filter((u) => u.side === 'player').length} en campo)
            </span>
          </div>
          {activeRoom.potTon > 0 && (
            <div className="bg-amber-950/90 border border-amber-400 px-3 py-1 rounded-full text-xs font-bold text-amber-300">
              💎 BOTE: {activeRoom.potTon.toFixed(2)} TON
            </div>
          )}
          <div className="bg-slate-950/85 border border-rose-500/50 px-2.5 py-1 rounded text-xs">
            <span className="text-rose-400 font-bold">{opponentName}</span>
          </div>
        </div>

        {/* Victory / Defeat Modal Overlay */}
        {winner && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-20">
            <Trophy
              className={`w-14 h-14 mb-2 ${
                winner === 'player' ? 'text-amber-400 animate-bounce' : 'text-rose-500'
              }`}
            />
            <h3 className="font-pixel-title text-lg sm:text-xl text-white mb-1">
              {winner === 'player' ? '¡VICTORIA TÁCTICA 4v4!' : 'DERROTA EN LA ARENA'}
            </h3>
            <p className="text-sm text-slate-300 max-w-md mb-4">
              {winner === 'player'
                ? activeRoom.winnerTon > 0
                  ? `¡Has ganado +${activeRoom.winnerTon.toFixed(2)} TON, +${activeRoom.rewardGold} Oro y +3 Esencias Elementales! (Comisión 10% enviada a Tesorería)`
                  : `¡Has ganado +${activeRoom.rewardGold} Oro, +3 Esencias Elementales y +2 Frutas XP!`
                : 'Entrena y evoluciona a tus monstruos en el Santuario para dominar el Coliseo.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => startBattle(activeRoom)}
                className="pixel-btn px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5"
              >
                <RefreshCw className="w-4 h-4" /> Jugar Revancha
              </button>
              <button
                onClick={() => setActiveRoom(null)}
                className="pixel-btn px-4 py-2.5 rounded-lg bg-slate-800 text-white font-bold text-xs"
              >
                Volver al Lobby
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tactical Command Deck (4 Skills with TU cost + Capture Orbs in Wild Mode) */}
      {activeActor && !winner && (
        <div className="pixel-panel rounded-xl p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2.5">
              <img
                src={`/assets/monsters/${activeActor.speciesId}.png`}
                className="w-11 h-11 pixelated bg-slate-900 rounded-lg border border-amber-500/50 p-0.5"
                alt=""
              />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-white">{activeActor.name}</span>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    {activeActor.side === 'player' ? 'TU TURNO (0 TU)' : 'TURNO RIVAL...'}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Pasiva: <span className="text-slate-200">{activeActor.passiveName}</span> • Toca un enemigo en la arena para fijar blanco
                </p>
              </div>
            </div>

            {/* Capture Orb Buttons in Wild Expedition */}
            {activeRoom.id === 'wild_expedition' && activeActor.side === 'player' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleThrowCaptureOrb('capture_orb_basic')}
                  className="pixel-btn px-2.5 py-1.5 rounded-lg bg-sky-900/90 hover:bg-sky-800 border border-sky-400 text-xs font-bold text-sky-100 flex items-center gap-1.5"
                >
                  <img
                    src="/assets/icons/icon_capture_basic.png"
                    className="w-5 h-5 pixelated"
                    alt=""
                  />
                  Capturar ({profile.inventory.capture_orb_basic || 0})
                </button>
                <button
                  onClick={() => handleThrowCaptureOrb('capture_orb_master')}
                  className="pixel-btn px-2.5 py-1.5 rounded-lg bg-purple-900/90 hover:bg-purple-800 border border-purple-400 text-xs font-bold text-purple-100 flex items-center gap-1.5"
                >
                  <img
                    src="/assets/icons/icon_capture_master.png"
                    className="w-5 h-5 pixelated"
                    alt=""
                  />
                  Orbe Maestro ({profile.inventory.capture_orb_master || 0})
                </button>
              </div>
            )}
          </div>

          {/* 4 Skills Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {activeActor.skills.map((sk, idx) => (
              <button
                key={sk.id}
                disabled={activeActor.side !== 'player' || isBusy}
                onClick={() => executeSkill(activeActor, sk)}
                className={`pixel-btn p-2.5 rounded-lg text-left transition ${
                  idx === 3
                    ? 'bg-gradient-to-br from-amber-700/80 to-red-900/90 border-amber-400'
                    : 'bg-slate-900 hover:bg-slate-800 border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="font-bold text-xs text-white truncate">{sk.name}</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-950 text-[10px] font-mono text-amber-300 shrink-0">
                    +{sk.tu} TU
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 line-clamp-2">{sk.desc}</p>
              </button>
            ))}
          </div>

          {/* Combat Log */}
          <div className="bg-slate-950/90 rounded-lg p-2 border border-slate-800 text-xs space-y-1 max-h-20 overflow-y-auto font-mono">
            {battleLog.map((line, i) => (
              <div key={i} className={i === 0 ? 'text-amber-300 font-bold' : 'text-slate-400'}>
                {line}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
