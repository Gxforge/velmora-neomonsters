import React, { useEffect, useRef, useState } from 'react';
import {
  ALL_MONSTERS,
  ELEMENT_META,
  MONSTERS_BY_ID,
  OwnedMonster,
  SkillSpec,
  computeMonsterStats,
  getElementMultiplier,
} from '../data/monstersData';
import { soundManager } from '../lib/audio';

type AnimRowName = 'idle' | 'idle_alt' | 'attack' | 'hit' | 'faint' | 'evolve';

const ANIM_ROW_CONFIG: Record<AnimRowName, { row: number; durationMs: number; loop: boolean }> = {
  idle: { row: 0, durationMs: 180, loop: true },
  idle_alt: { row: 1, durationMs: 160, loop: true },
  attack: { row: 2, durationMs: 110, loop: false },
  hit: { row: 3, durationMs: 120, loop: false },
  faint: { row: 4, durationMs: 180, loop: false },
  evolve: { row: 5, durationMs: 150, loop: true },
};

interface CombatUnit {
  uid: string;
  instanceId: string;
  speciesId: string;
  name: string;
  element: 'fire' | 'water' | 'earth' | 'storm' | 'light' | 'shadow';
  stage: 1 | 2 | 3;
  level: number;
  maxHp: number;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  tu: number;
  isPlayer: boolean;
  slotIndex: number;
  skills: SkillSpec[];
  shield: number;
  animState: AnimRowName;
  animStartedAt: number;
}

interface FloatingFx {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  createdAt: number;
}

interface BattleArenaProps {
  playerRoster: OwnedMonster[];
  gold: number;
  tonBalance: number;
  energy: number;
  inventory: Record<string, number>;
  telegramId: number;
  username: string;
  onBattleComplete: (result: {
    won: boolean;
    mode: 'pve' | 'pvp_gold' | 'pvp_ton';
    goldDelta: number;
    tonDelta: number;
    capturedMonster?: OwnedMonster;
    itemDeltas?: Record<string, number>;
    eloDelta: number;
  }) => void;
}

interface PvpRoomTier {
  id: string;
  title: string;
  mode: 'pvp_gold' | 'pvp_ton';
  stakeGold: number;
  stakeTon: number;
  rakePct: number;
  prizeDesc: string;
  badge: string;
}

const PVP_ROOMS: PvpRoomTier[] = [
  {
    id: 'rookie_gold',
    title: 'Arena Bronce (Oro)',
    mode: 'pvp_gold',
    stakeGold: 300,
    stakeTon: 0,
    rakePct: 10,
    prizeDesc: 'Pozo: 600 Oro • Premio Neto: 540 Oro (10% Rake Casa)',
    badge: 'SALA POPULAR',
  },
  {
    id: 'pro_ton',
    title: 'Coliseo Soberano (TON)',
    mode: 'pvp_ton',
    stakeGold: 0,
    stakeTon: 0.5,
    rakePct: 10,
    prizeDesc: 'Pozo: 1.00 TON • Premio Neto: 0.90 TON (0.10 TON Rake)',
    badge: 'APUESTA REAL TON',
  },
  {
    id: 'whale_ton',
    title: 'Cámara Mítica High-Roller',
    mode: 'pvp_ton',
    stakeGold: 0,
    stakeTon: 2.0,
    rakePct: 10,
    prizeDesc: 'Pozo: 4.00 TON • Premio Neto: 3.60 TON (0.40 TON Rake)',
    badge: 'VIP / ÉLITE',
  },
];

export const BattleArena4v4: React.FC<BattleArenaProps> = ({
  playerRoster,
  gold,
  tonBalance,
  energy,
  inventory,
  telegramId,
  username,
  onBattleComplete,
}) => {
  const [inBattle, setInBattle] = useState(false);
  const [battleMode, setBattleMode] = useState<'pve' | 'pvp_gold' | 'pvp_ton'>('pve');
  const [selectedRoom, setSelectedRoom] = useState<PvpRoomTier>(PVP_ROOMS[0]);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [opponentLabel, setOpponentLabel] = useState<string>('IA Salvaje');
  const [openMatches, setOpenMatches] = useState<any[]>([]);
  const [waitingRoom, setWaitingRoom] = useState<any | null>(null);
  const [loadingMatchmaking, setLoadingMatchmaking] = useState(false);

  const [playerFront, setPlayerFront] = useState<CombatUnit[]>([]);
  const [playerBench, setPlayerBench] = useState<CombatUnit[]>([]);
  const [enemyFront, setEnemyFront] = useState<CombatUnit[]>([]);
  const [enemyBench, setEnemyBench] = useState<CombatUnit[]>([]);

  const [selectedTargetUid, setSelectedTargetUid] = useState<string | null>(null);
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [floatingFx, setFloatingFx] = useState<FloatingFx[]>([]);
  const [capturedThisMatch, setCapturedThisMatch] = useState<OwnedMonster | null>(null);
  const [usedItems, setUsedItems] = useState<Record<string, number>>({});
  const [battleOutcome, setBattleOutcome] = useState<'victory' | 'defeat' | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const spritesheetCacheRef = useRef<Record<string, HTMLImageElement>>({});
  const bgImgRef = useRef<HTMLImageElement | null>(null);

  const fetchOpenPvpRooms = async () => {
    try {
      const r = await fetch('/api/pvp-matchmaking');
      const d = await r.json();
      if (Array.isArray(d.matches)) {
        setOpenMatches(d.matches);
      }
    } catch {
      // Ignore offline preview error
    }
  };

  useEffect(() => {
    fetchOpenPvpRooms();
  }, []);

  // Preload arena background and all 18 6x4 Monster Sprite Sheets (/assets/spritesheets/<id>_sheet.png)
  useEffect(() => {
    const bg = new Image();
    bg.src = '/assets/scenes/battle_arena_bg.png';
    bgImgRef.current = bg;

    ALL_MONSTERS.forEach((m) => {
      const sheetImg = new Image();
      sheetImg.src = `/assets/spritesheets/${m.id}_sheet.png`;
      spritesheetCacheRef.current[m.id] = sheetImg;
    });
  }, []);

  const addLog = (msg: string) => {
    setBattleLog((prev) => [msg, ...prev.slice(0, 24)]);
  };

  const spawnFx = (x: number, y: number, text: string, color: string) => {
    setFloatingFx((prev) => [
      ...prev,
      { id: Date.now() + Math.random(), x, y, text, color, createdAt: performance.now() },
    ]);
  };

  const triggerUnitAnim = (uid: string, anim: AnimRowName) => {
    const now = performance.now();
    setPlayerFront((prev) =>
      prev.map((u) => (u.uid === uid ? { ...u, animState: anim, animStartedAt: now } : u))
    );
    setEnemyFront((prev) =>
      prev.map((u) => (u.uid === uid ? { ...u, animState: anim, animStartedAt: now } : u))
    );
  };

  const buildCombatUnit = (
    mon: OwnedMonster,
    isPlayer: boolean,
    slotIndex: number
  ): CombatUnit => {
    const spec = MONSTERS_BY_ID[mon.speciesId] || ALL_MONSTERS[0];
    const st = computeMonsterStats(spec.id, mon.level);
    const initialTu = Math.max(20, Math.round(120 - st.spd * 0.35));
    const shieldVal = spec.element === 'earth' ? Math.round(st.hp * 0.15) : 0;

    return {
      uid: `${isPlayer ? 'P' : 'E'}_${mon.instanceId}_${slotIndex}_${Math.random().toString(36).slice(2, 5)}`,
      instanceId: mon.instanceId,
      speciesId: spec.id,
      name: spec.name,
      element: spec.element,
      stage: spec.stage,
      level: mon.level,
      maxHp: st.hp,
      hp: st.hp,
      atk: st.atk,
      def: st.def,
      spd: st.spd,
      tu: initialTu,
      isPlayer,
      slotIndex,
      skills: spec.skills,
      shield: shieldVal,
      animState: 'idle',
      animStartedAt: performance.now(),
    };
  };

  // Start PvE Wild Expedition (Explicitly vs Wild AI)
  const startPveExpedition = () => {
    if (energy < 10) {
      alert('Necesitas al menos 10 de Energía para iniciar una Expedición PvE.');
      return;
    }
    launchBattleEngine('pve', undefined, null, 'IA Salvaje (Expedición PvE)');
  };

  // Start or Join Real Online PvP Room via /api/pvp-matchmaking
  const handleEnterPvpRoom = async (room: PvpRoomTier) => {
    if (room.mode === 'pvp_gold' && gold < room.stakeGold) {
      alert(`Necesitas ${room.stakeGold} Oro para entrar en ${room.title}.`);
      return;
    }
    if (room.mode === 'pvp_ton' && tonBalance < room.stakeTon) {
      alert(`Necesitas ${room.stakeTon} TON en tu balance interno verificado para entrar en ${room.title}.`);
      return;
    }

    setLoadingMatchmaking(true);
    try {
      const sortedSquad = [...playerRoster]
        .sort((a, b) => (a.teamSlot || 99) - (b.teamSlot || 99))
        .slice(0, 6);

      const res = await fetch('/api/pvp-matchmaking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_or_join',
          roomTier: room.id,
          currency: room.mode === 'pvp_ton' ? 'TON' : 'GOLD',
          stakeAmount: room.mode === 'pvp_ton' ? room.stakeTon : room.stakeGold,
          telegramId,
          username,
          elo: 1000,
          squad: sortedSquad,
        }),
      });
      const data = await res.json();
      await fetchOpenPvpRooms();

      if (data.matched && data.match) {
        // Matched with an existing open player room!
        const oppSquad: OwnedMonster[] = Array.isArray(data.match.host_squad) && data.match.host_squad.length > 0
          ? data.match.host_squad
          : [];
        launchBattleEngine(
          room.mode,
          room,
          data.match.id,
          `Domador Online: @${data.match.host_username} (Match #${String(data.match.id).slice(0, 6)})`,
          oppSquad
        );
      } else if (data.match) {
        // Room created in `pvp_matches` with status = 'open'
        setSelectedRoom(room);
        setWaitingRoom(data.match);
      }
    } catch (e) {
      alert(`Error conectando al servidor de Matchmaking PvP: ${String(e)}`);
    } finally {
      setLoadingMatchmaking(false);
    }
  };

  const handleCancelWaitingRoom = async () => {
    if (!waitingRoom) return;
    try {
      await fetch('/api/pvp-matchmaking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel_room', matchId: waitingRoom.id }),
      });
      setWaitingRoom(null);
      fetchOpenPvpRooms();
    } catch {
      setWaitingRoom(null);
    }
  };

  const launchBattleEngine = (
    mode: 'pve' | 'pvp_gold' | 'pvp_ton',
    room?: PvpRoomTier,
    matchId: string | null = null,
    oppLabel: string = 'IA Salvaje',
    customEnemyRoster?: OwnedMonster[]
  ) => {
    soundManager.playBgm(mode === 'pve' ? 'battle' : 'pvp');
    setBattleMode(mode);
    if (room) setSelectedRoom(room);
    setActiveMatchId(matchId);
    setOpponentLabel(oppLabel);
    setCapturedThisMatch(null);
    setUsedItems({});
    setBattleOutcome(null);
    setWaitingRoom(null);

    const sorted = [...playerRoster].sort((a, b) => (a.teamSlot || 99) - (b.teamSlot || 99));
    const frontRaw = sorted.slice(0, 4);
    const benchRaw = sorted.slice(4, 8);

    const pFront = frontRaw.map((m, idx) => buildCombatUnit(m, true, idx));
    const pBench = benchRaw.map((m, idx) => buildCombatUnit(m, true, idx + 4));

    const avgLv = Math.max(
      3,
      Math.round(frontRaw.reduce((acc, m) => acc + m.level, 0) / Math.max(1, frontRaw.length))
    );

    let eFront: CombatUnit[] = [];
    let eBench: CombatUnit[] = [];

    if (customEnemyRoster && customEnemyRoster.length > 0) {
      eFront = customEnemyRoster.slice(0, 4).map((m, idx) => buildCombatUnit(m, false, idx));
      eBench = customEnemyRoster.slice(4, 6).map((m, idx) => buildCombatUnit(m, false, idx + 4));
    } else {
      const stagePool =
        mode === 'pve'
          ? ALL_MONSTERS.filter((m) => m.stage <= 2)
          : ALL_MONSTERS.filter((m) => m.stage >= (avgLv >= 10 ? 2 : 1));
      const shuffled = [...stagePool].sort(() => Math.random() - 0.5);
      eFront = shuffled.slice(0, 4).map((spec, idx) =>
        buildCombatUnit(
          {
            instanceId: `enemy_${idx}`,
            speciesId: spec.id,
            level: mode === 'pve' ? Math.max(2, avgLv - 1) : avgLv + 1,
            xp: 0,
            teamSlot: idx + 1,
          },
          false,
          idx
        )
      );
      eBench = shuffled.slice(4, 6).map((spec, idx) =>
        buildCombatUnit(
          {
            instanceId: `enemy_bench_${idx}`,
            speciesId: spec.id,
            level: avgLv,
            xp: 0,
            teamSlot: idx + 5,
          },
          false,
          idx + 4
        )
      );
    }

    setPlayerFront(pFront);
    setPlayerBench(pBench);
    setEnemyFront(eFront);
    setEnemyBench(eBench);
    setSelectedTargetUid(eFront[0]?.uid || null);
    setBattleLog([
      mode === 'pve'
        ? `🏕️ ¡Expedición PvE 4v4 iniciada contra ${oppLabel}! Captura monstruos salvajes debilitados con tus Orbes.`
        : `⚔️ ¡Combate PvP (${room?.title}) iniciado contra ${oppLabel}! Pozo en Escrow bloqueado.`,
    ]);
    setInBattle(true);
  };

  // Determine active unit with lowest TU
  const allActiveUnits = [...playerFront, ...enemyFront].filter((u) => u.hp > 0);
  allActiveUnits.sort((a, b) => a.tu - b.tu || b.spd - a.spd);
  const currentTurnUnit = allActiveUnits[0] || null;

  // Execute Enemy Turn automatically
  useEffect(() => {
    if (!inBattle || battleOutcome || !currentTurnUnit) return;
    if (!currentTurnUnit.isPlayer) {
      const timer = setTimeout(() => {
        executeEnemyTurn(currentTurnUnit);
      }, 750);
      return () => clearTimeout(timer);
    }
  }, [inBattle, battleOutcome, currentTurnUnit?.uid, currentTurnUnit?.tu]);

  const advanceTimeUnits = (
    pF: CombatUnit[],
    eF: CombatUnit[],
    actingUid: string,
    tuAdded: number
  ) => {
    const allAlive = [...pF, ...eF].filter((u) => u.hp > 0);
    if (allAlive.length === 0) return { nextPF: pF, nextEF: eF };

    const updatedPF = pF.map((u) =>
      u.uid === actingUid ? { ...u, tu: u.tu + tuAdded } : { ...u }
    );
    const updatedEF = eF.map((u) =>
      u.uid === actingUid ? { ...u, tu: u.tu + tuAdded } : { ...u }
    );

    const minTu = Math.min(
      ...[...updatedPF, ...updatedEF].filter((u) => u.hp > 0).map((u) => u.tu)
    );
    if (minTu > 0 && isFinite(minTu)) {
      updatedPF.forEach((u) => {
        if (u.hp > 0) u.tu = Math.max(0, u.tu - minTu);
      });
      updatedEF.forEach((u) => {
        if (u.hp > 0) u.tu = Math.max(0, u.tu - minTu);
      });
    }
    return { nextPF: updatedPF, nextEF: updatedEF };
  };

  const checkAndHandleReplacements = (
    pF: CombatUnit[],
    pB: CombatUnit[],
    eF: CombatUnit[],
    eB: CombatUnit[]
  ) => {
    const nextPF = [...pF];
    const nextPB = [...pB];
    const nextEF = [...eF];
    const nextEB = [...eB];

    for (let i = 0; i < nextPF.length; i++) {
      if (nextPF[i].hp <= 0 && nextPB.length > 0) {
        const sub = nextPB.shift()!;
        sub.slotIndex = nextPF[i].slotIndex;
        sub.tu = 35;
        sub.animState = 'evolve';
        sub.animStartedAt = performance.now();
        addLog(`🔄 ¡Refuerzo aliado! ${sub.name} entra desde la banca al Slot #${i + 1}.`);
        nextPF[i] = sub;
      }
    }

    for (let i = 0; i < nextEF.length; i++) {
      if (nextEF[i].hp <= 0 && nextEB.length > 0) {
        const sub = nextEB.shift()!;
        sub.slotIndex = nextEF[i].slotIndex;
        sub.tu = 40;
        sub.animState = 'evolve';
        sub.animStartedAt = performance.now();
        addLog(`⚠️ ¡Refuerzo rival! ${sub.name} entra al campo enemigo.`);
        nextEF[i] = sub;
      }
    }

    const playerAlive = nextPF.some((u) => u.hp > 0);
    const enemyAlive = nextEF.some((u) => u.hp > 0);

    setPlayerFront(nextPF);
    setPlayerBench(nextPB);
    setEnemyFront(nextEF);
    setEnemyBench(nextEB);

    const aliveEnemies = nextEF.filter((u) => u.hp > 0);
    if (aliveEnemies.length > 0 && !aliveEnemies.some((e) => e.uid === selectedTargetUid)) {
      setSelectedTargetUid(aliveEnemies[0].uid);
    }

    if (!enemyAlive) {
      finishBattle(true);
    } else if (!playerAlive) {
      finishBattle(false);
    }
  };

  const executePlayerSkill = (skill: SkillSpec) => {
    if (!currentTurnUnit || !currentTurnUnit.isPlayer || battleOutcome) return;

    const pF = playerFront.map((u) => ({ ...u }));
    const eF = enemyFront.map((u) => ({ ...u }));
    const actor = pF.find((u) => u.uid === currentTurnUnit.uid);
    if (!actor) return;

    soundManager.playSfx(skill.is_ultimate ? 'ultimate' : 'attack');
    const now = performance.now();
    actor.animState = 'attack';
    actor.animStartedAt = now;

    if (skill.target === 'self_team') {
      pF.forEach((ally) => {
        if (ally.hp > 0) {
          const heal = Math.round(ally.maxHp * 0.22);
          ally.hp = Math.min(ally.maxHp, ally.hp + heal);
          ally.atk = Math.round(ally.atk * 1.12);
          ally.animState = 'evolve';
          ally.animStartedAt = now;
        }
      });
      spawnFx(210, 220, `+CURA & +ATK`, '#4ade80');
      addLog(`✨ ${actor.name} usó ${skill.name} (+22% HP y +12% ATK al equipo). [+${skill.tu} TU]`);
    } else if (skill.target === 'all_enemies') {
      eF.forEach((foe, idx) => {
        if (foe.hp <= 0) return;
        const mult = getElementMultiplier(actor.element, foe.element);
        const raw = ((actor.atk * skill.power) / Math.max(40, foe.def)) * mult;
        const dmg = Math.max(18, Math.round(raw));
        foe.hp = Math.max(0, foe.hp - dmg);
        foe.animState = foe.hp <= 0 ? 'faint' : 'hit';
        foe.animStartedAt = now;
        spawnFx(590 + idx * 35, 160 + idx * 32, `-${dmg}${mult > 1 ? ' CRIT!' : ''}`, mult > 1 ? '#facc15' : '#f87171');
      });
      addLog(`💥 ¡ULTIMATE 4v4! ${actor.name} desató ${skill.name} contra todo el escuadrón rival! [+${skill.tu} TU]`);
    } else {
      const target =
        eF.find((e) => e.uid === selectedTargetUid && e.hp > 0) ||
        eF.find((e) => e.hp > 0);
      if (!target) return;
      const mult = getElementMultiplier(actor.element, target.element);
      const raw = ((actor.atk * skill.power) / Math.max(40, target.def)) * mult;
      const dmg = Math.max(22, Math.round(raw));
      target.hp = Math.max(0, target.hp - dmg);
      target.animState = target.hp <= 0 ? 'faint' : 'hit';
      target.animStartedAt = now;
      spawnFx(
        590 + target.slotIndex * 35,
        155 + target.slotIndex * 35,
        `-${dmg}${mult > 1 ? ' SUPEREFICAZ!' : ''}`,
        mult > 1 ? '#fde047' : '#fb7185'
      );
      addLog(
        `⚔️ ${actor.name} atacó a ${target.name} con ${skill.name} (-${dmg} HP). [+${skill.tu} TU]`
      );
    }

    const { nextPF, nextEF } = advanceTimeUnits(pF, eF, actor.uid, skill.tu);
    checkAndHandleReplacements(nextPF, playerBench, nextEF, enemyBench);
  };

  const executeEnemyTurn = (enemyActor: CombatUnit) => {
    const pF = playerFront.map((u) => ({ ...u }));
    const eF = enemyFront.map((u) => ({ ...u }));
    const actor = eF.find((u) => u.uid === enemyActor.uid && u.hp > 0);
    if (!actor) return;

    const alivePlayers = pF.filter((u) => u.hp > 0);
    if (alivePlayers.length === 0) return;

    const now = performance.now();
    actor.animState = 'attack';
    actor.animStartedAt = now;

    const skill = actor.skills[Math.floor(Math.random() * 3)] || actor.skills[0];
    const target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];

    soundManager.playSfx('attack');
    const mult = getElementMultiplier(actor.element, target.element);
    const raw = ((actor.atk * skill.power) / Math.max(45, target.def)) * mult;
    const dmg = Math.max(16, Math.round(raw * 0.9));
    target.hp = Math.max(0, target.hp - dmg);
    target.animState = target.hp <= 0 ? 'faint' : 'hit';
    target.animStartedAt = now;

    spawnFx(
      170 + target.slotIndex * 32,
      165 + target.slotIndex * 35,
      `-${dmg}`,
      '#f43f5e'
    );
    addLog(`👹 [Rival] ${actor.name} usó ${skill.name} sobre ${target.name} (-${dmg} HP). [+${skill.tu} TU]`);

    const { nextPF, nextEF } = advanceTimeUnits(pF, eF, actor.uid, skill.tu);
    checkAndHandleReplacements(nextPF, playerBench, nextEF, enemyBench);
  };

  const handleThrowCaptureOrb = (orbType: 'capture_basic' | 'capture_master') => {
    if (battleMode !== 'pve') {
      alert('La captura de monstruos solo está permitida en Expediciones PvE Salvajes.');
      return;
    }
    const available = (inventory[orbType] || 0) + (usedItems[orbType] || 0);
    if (available <= 0) {
      alert('No te quedan Orbes de este tipo en la Mochila.');
      return;
    }

    const target =
      enemyFront.find((e) => e.uid === selectedTargetUid && e.hp > 0) ||
      enemyFront.find((e) => e.hp > 0);
    if (!target) return;

    const nextUsed = { ...usedItems, [orbType]: (usedItems[orbType] || 0) - 1 };
    setUsedItems(nextUsed);

    const hpRatio = target.hp / target.maxHp;
    const chance = orbType === 'capture_master' ? 1.0 : Math.min(0.9, 0.35 + (1 - hpRatio) * 0.6);

    if (Math.random() <= chance) {
      soundManager.playSfx('capture');
      const captured: OwnedMonster = {
        instanceId: `cap_${Date.now()}`,
        speciesId: target.speciesId,
        level: target.level,
        xp: 0,
        teamSlot: null,
      };
      setCapturedThisMatch(captured);
      triggerUnitAnim(target.uid, 'evolve');
      spawnFx(610, 180, '¡CAPTURADO!', '#38bdf8');
      addLog(`🔮 ¡ÉXITO! Has capturado a ${target.name} (Nv.${target.level}) para tu Santuario!`);

      const eF = enemyFront.map((e) => (e.uid === target.uid ? { ...e, hp: 0, animState: 'faint' as AnimRowName } : e));
      checkAndHandleReplacements(playerFront, playerBench, eF, enemyBench);
    } else {
      soundManager.playSfx('attack');
      spawnFx(610, 180, '¡ESCAPÓ DEL ORBE!', '#f97316');
      addLog(`💨 ¡${target.name} rompió el Orbe! Debilita más su HP antes de lanzar.`);
    }
  };

  const finishBattle = async (won: boolean) => {
    setBattleOutcome(won ? 'victory' : 'defeat');
    soundManager.playSfx(won ? 'evolve' : 'attack');

    let goldDelta = 0;
    let tonDelta = 0;
    const eloDelta = won ? 25 : -15;

    if (battleMode === 'pve') {
      goldDelta = won ? 380 : 60;
    } else if (battleMode === 'pvp_gold') {
      const stake = selectedRoom.stakeGold;
      const netWin = Math.round(stake * 2 * (1 - selectedRoom.rakePct / 100)) - stake;
      goldDelta = won ? netWin : -stake;
    } else if (battleMode === 'pvp_ton') {
      const stake = selectedRoom.stakeTon;
      const netWin = Number((stake * 2 * (1 - selectedRoom.rakePct / 100) - stake).toFixed(4));
      tonDelta = won ? netWin : -stake;
    }

    if (activeMatchId && battleMode !== 'pve') {
      try {
        await fetch('/api/pvp-matchmaking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'settle_match',
            matchId: activeMatchId,
            winnerTelegramId: won ? telegramId : 0,
            username,
            combatLog: battleLog.slice(0, 10),
          }),
        });
      } catch {
        // Ignore offline settle error
      }
    }

    onBattleComplete({
      won,
      mode: battleMode,
      goldDelta,
      tonDelta,
      capturedMonster: capturedThisMatch || undefined,
      itemDeltas: usedItems,
      eloDelta,
    });
  };

  // HTML5 Canvas 2D Pixel Art Battle Renderer (Consumes 6x4 Sprite Sheets in /assets/spritesheets/<id>_sheet.png!)
  useEffect(() => {
    if (!inBattle) return;
    let animId: number;

    const renderFrame = (now: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 1. Draw Background Arena
      if (bgImgRef.current && bgImgRef.current.complete) {
        ctx.drawImage(bgImgRef.current, 0, 0, canvas.width, canvas.height);
      } else {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      const activeUid = currentTurnUnit?.uid;

      const drawUnit = (u: CombatUnit, x: number, y: number, flipX: boolean) => {
        // Determine which animation row (0..5) and column (0..3) to slice from the 512x768 Sprite Sheet
        let rowName: AnimRowName = u.animState;
        const cfg = ANIM_ROW_CONFIG[rowName] || ANIM_ROW_CONFIG.idle;
        const elapsed = Math.max(0, now - u.animStartedAt);
        let colIndex = Math.floor(elapsed / cfg.durationMs);

        if (!cfg.loop && colIndex >= 4) {
          if (u.hp <= 0) {
            rowName = 'faint';
            colIndex = 3; // Stay on final defeated spirit frame
          } else {
            rowName = u.uid === activeUid ? 'idle_alt' : 'idle';
            const fallbackCfg = ANIM_ROW_CONFIG[rowName];
            colIndex = Math.floor(now / fallbackCfg.durationMs) % 4;
          }
        } else {
          if (u.hp > 0 && (rowName === 'idle' || rowName === 'idle_alt')) {
            rowName = u.uid === activeUid ? 'idle_alt' : 'idle';
          }
          colIndex = colIndex % 4;
        }

        const activeCfg = ANIM_ROW_CONFIG[rowName];
        const sx = colIndex * 128;
        const sy = activeCfg.row * 128;

        const isTurn = u.uid === activeUid && u.hp > 0;
        const isTarget = !u.isPlayer && u.uid === selectedTargetUid && u.hp > 0;

        // Tactical Pedestal Shadow
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(x, y + 36, 42, 14, 0, 0, Math.PI * 2);
        ctx.fillStyle = isTurn
          ? 'rgba(250, 204, 21, 0.55)'
          : isTarget
          ? 'rgba(244, 63, 94, 0.55)'
          : 'rgba(2, 6, 23, 0.65)';
        ctx.fill();
        if (isTurn || isTarget) {
          ctx.lineWidth = 3;
          ctx.strokeStyle = isTurn ? '#fde047' : '#fb7185';
          ctx.stroke();
        }
        ctx.restore();

        // Draw Monster Frame from 512x768 Sprite Sheet (Cell 128x128)
        const sheetImg = spritesheetCacheRef.current[u.speciesId];
        if (sheetImg && sheetImg.complete && sheetImg.naturalWidth >= 512) {
          ctx.save();
          ctx.translate(x, y - 8);
          if (flipX) ctx.scale(-1, 1);
          ctx.drawImage(sheetImg, sx, sy, 128, 128, -50, -50, 100, 100);
          ctx.restore();
        }

        if (u.hp <= 0) return;

        // HP Bar & TU Badge
        const barW = 86;
        const barH = 8;
        const bx = x - barW / 2;
        const by = y - 62;

        ctx.fillStyle = 'rgba(2, 6, 23, 0.92)';
        ctx.fillRect(bx - 2, by - 16, barW + 4, 28);
        ctx.strokeStyle = isTurn ? '#facc15' : '#475569';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx - 2, by - 16, barW + 4, 28);

        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 10px monospace';
        ctx.fillText(`${u.name.slice(0, 9)} L${u.level}`, bx + 2, by - 5);

        const hpPct = Math.max(0, Math.min(1, u.hp / u.maxHp));
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(bx, by, barW, barH);
        ctx.fillStyle = hpPct > 0.5 ? '#22c55e' : hpPct > 0.25 ? '#eab308' : '#ef4444';
        ctx.fillRect(bx, by, Math.round(barW * hpPct), barH);

        // TU Badge
        ctx.fillStyle = '#0ea5e9';
        ctx.fillRect(bx + barW - 26, by - 15, 26, 12);
        ctx.fillStyle = '#020617';
        ctx.font = 'bold 9px monospace';
        ctx.fillText(`${u.tu}TU`, bx + barW - 24, by - 6);
      };

      const pCoords = [
        [135, 175],
        [230, 225],
        [150, 295],
        [255, 340],
      ];
      const eCoords = [
        [725, 175],
        [630, 225],
        [710, 295],
        [605, 340],
      ];

      // Draw Player 4v4 Frontline (flipped right to face enemies)
      playerFront.forEach((u, idx) => {
        const [px, py] = pCoords[idx] || [160, 220];
        drawUnit(u, px, py, true);
      });

      // Draw Enemy 4v4 Frontline
      enemyFront.forEach((u, idx) => {
        const [ex, ey] = eCoords[idx] || [680, 220];
        drawUnit(u, ex, ey, false);
      });

      // Draw Floating Damage Numbers
      setFloatingFx((prev) =>
        prev.filter((fx) => {
          const age = now - fx.createdAt;
          if (age > 1100) return false;
          ctx.save();
          ctx.font = 'bold 15px monospace';
          ctx.fillStyle = '#020617';
          ctx.fillText(fx.text, fx.x + 2, fx.y - age * 0.03 + 2);
          ctx.fillStyle = fx.color;
          ctx.fillText(fx.text, fx.x, fx.y - age * 0.03);
          ctx.restore();
          return true;
        })
      );

      animId = requestAnimationFrame(renderFrame);
    };

    animId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(animId);
  }, [inBattle, playerFront, enemyFront, currentTurnUnit?.uid, selectedTargetUid]);

  if (!inBattle) {
    return (
      <div className="space-y-4">
        {/* Live PvP Matchmaking Queue Modal (When hosting an open room in `pvp_matches`) */}
        {waitingRoom && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="pixel-panel max-w-md w-full p-5 border-2 border-amber-400 text-center space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-amber-500/20 border border-amber-400 text-amber-300 font-pixel text-[10px]">
                📡 SALA PvP ABIERTA EN SUPABASE (`pvp_matches`)
              </div>
              <h3 className="font-pixel text-sm text-white">{selectedRoom.title}</h3>
              <p className="text-xs text-slate-300">
                Tu sala (<span className="text-amber-300 font-mono">#{String(waitingRoom.id).slice(0, 8)}</span>) está publicada en tiempo real en <span className="text-emerald-400">velmora-game-prod</span>. Otro domador puede unirse desde su cliente, o puedes retar al Escuadrón Sombra clasificado del ranking ahora mismo.
              </p>
              <div className="bg-slate-950 border border-slate-800 rounded p-2.5 text-left text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Anfitrión:</span>
                  <span className="text-white font-bold">@{username}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Apuesta en Escrow:</span>
                  <span className="text-amber-300 font-bold">
                    {selectedRoom.mode === 'pvp_ton' ? `${selectedRoom.stakeTon} TON` : `${selectedRoom.stakeGold} Oro`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Comisión Casa (Rake):</span>
                  <span className="text-emerald-400 font-bold">{selectedRoom.rakePct}%</span>
                </div>
              </div>
              <div className="flex flex-col gap-2 pt-2">
                <button
                  onClick={() =>
                    launchBattleEngine(
                      selectedRoom.mode,
                      selectedRoom,
                      waitingRoom.id,
                      `Escuadrón Clasificado Ranking (#${String(waitingRoom.id).slice(0, 6)})`
                    )
                  }
                  className="pixel-btn pixel-btn-gold w-full py-2.5 text-[10px]"
                >
                  ⚔️ COMBATIR CONTRA ESCUADRÓN CLASIFICADO DEL RANKING
                </button>
                <button
                  onClick={handleCancelWaitingRoom}
                  className="pixel-btn pixel-btn-red w-full py-2 text-[10px]"
                >
                  ✕ CANCELAR SALA ABIERTA (SIN COSTE)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Lobby Header Banner */}
        <div className="relative rounded-lg overflow-hidden border-2 border-amber-500/70 shadow-xl">
          <img
            src="/assets/scenes/battle_arena_bg.png"
            alt="Battle Arena"
            className="w-full h-40 sm:h-48 object-cover pixel-art"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/55 to-slate-950/90 p-4 flex flex-col justify-between">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-amber-500/20 border border-amber-400/50 text-amber-300 text-[10px] font-pixel mb-2">
                ⚡ MOTOR TÁCTICO 4v4 TIME UNITS + SPRITE SHEETS 6×4 REALES
              </div>
              <h2 className="font-pixel text-base sm:text-lg text-white">
                COLISEO DE BATALLA 4v4: PvE SALVAJE & PvP ONLINE
              </h2>
              <p className="text-xs text-slate-300 max-w-2xl mt-1">
                Separación transparente: Explora el modo <strong>PvE Salvaje (contra IA)</strong> para capturar monstruos con tus Orbes, o entra a las <strong>Salas PvP Online sincronizadas en Supabase (`pvp_matches`)</strong> con pozo de apuestas y 10% de rake para la casa.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 mt-3">
              <button
                onClick={startPveExpedition}
                className="pixel-btn pixel-btn-green px-5 py-2.5 flex items-center gap-2 text-xs"
              >
                <img src="/assets/icons/icon_capture_basic.png" alt="Orb" className="w-5 h-5 pixel-art" />
                🏕️ EXPEDICIÓN PvE CONTRA IA SALVAJE (-10 ENERGÍA • CAPTURA ACTIVA)
              </button>
            </div>
          </div>
        </div>

        {/* Real Online PvP Wager Rooms */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PVP_ROOMS.map((room) => (
            <div
              key={room.id}
              className="pixel-panel p-4 flex flex-col justify-between border-2 border-slate-700 hover:border-amber-400 transition"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/50 text-amber-300 font-pixel text-[9px]">
                    {room.badge}
                  </span>
                  <span className="text-xs font-bold text-emerald-400">
                    Rake Casa: {room.rakePct}%
                  </span>
                </div>
                <h3 className="font-pixel text-sm text-white mb-1">{room.title}</h3>
                <p className="text-xs text-slate-300 mb-3">{room.prizeDesc}</p>

                <div className="bg-slate-900/90 border border-slate-800 rounded p-2.5 mb-4 flex items-center justify-between">
                  <span className="text-xs text-slate-400">Entrada en Escrow:</span>
                  <div className="flex items-center gap-1.5 font-pixel text-xs text-amber-300">
                    <img
                      src={
                        room.mode === 'pvp_ton'
                          ? '/assets/icons/icon_ton.png'
                          : '/assets/icons/icon_gold.png'
                      }
                      alt="Currency"
                      className="w-5 h-5 pixel-art"
                    />
                    {room.mode === 'pvp_ton' ? `${room.stakeTon} TON` : `${room.stakeGold} ORO`}
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleEnterPvpRoom(room)}
                disabled={loadingMatchmaking}
                className={`pixel-btn w-full py-2.5 text-[10px] flex items-center justify-center gap-2 ${
                  room.mode === 'pvp_ton' ? 'pixel-btn-blue' : 'pixel-btn-gold'
                }`}
              >
                <img src="/assets/icons/icon_sword_pvp.png" alt="PvP" className="w-4 h-4 pixel-art" />
                {loadingMatchmaking ? 'CONECTANDO...' : 'BUSCAR / CREAR SALA PvP ONLINE'}
              </button>
            </div>
          ))}
        </div>

        {/* Live Supabase `pvp_matches` Feed */}
        <div className="pixel-panel p-3.5">
          <div className="flex items-center justify-between mb-2">
            <span className="font-pixel text-[10px] text-sky-300">
              🌐 REGISTRO EN VIVO DE SALAS PvP ONLINE (`pvp_matches` EN SUPABASE)
            </span>
            <button
              onClick={fetchOpenPvpRooms}
              className="text-[10px] font-pixel text-amber-300 underline"
            >
              🔄 ACTUALIZAR SALAS
            </button>
          </div>
          {openMatches.length === 0 ? (
            <div className="text-xs text-slate-400 py-2">
              No hay salas abiertas esperando retador en este segundo. ¡Crea una sala arriba para publicar tu escuadrón 4v4!
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {openMatches.slice(0, 6).map((m) => (
                <div
                  key={m.id}
                  className="bg-slate-900/90 border border-slate-800 rounded p-2 text-xs flex items-center justify-between"
                >
                  <div>
                    <div className="font-bold text-white">
                      @{m.host_username || 'Commander'} • <span className="text-amber-300">{m.stake_amount} {m.currency}</span>
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Sala: {m.room_tier} • Rake: {m.rake_pct}%
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded font-pixel text-[8px] ${
                      m.status === 'open'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {String(m.status).toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ACTIVE 4v4 BATTLE VIEW
  return (
    <div className="space-y-3">
      {/* Top Turn Queue Bar (Time Units) */}
      <div className="pixel-panel p-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 overflow-x-auto py-1">
          <span className="font-pixel text-[10px] text-amber-300 shrink-0 mr-1">
            ⏱️ COLA DE TURNOS (TU):
          </span>
          {allActiveUnits.map((u, idx) => (
            <div
              key={u.uid}
              onClick={() => !u.isPlayer && setSelectedTargetUid(u.uid)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded border cursor-pointer shrink-0 ${
                idx === 0
                  ? 'bg-amber-500/25 border-amber-400 ring-2 ring-amber-300'
                  : u.isPlayer
                  ? 'bg-emerald-950/50 border-emerald-500/50'
                  : 'bg-rose-950/50 border-rose-500/50'
              }`}
            >
              <img
                src={`/assets/monsters/${u.speciesId}.png`}
                alt={u.name}
                className="w-7 h-7 pixel-art"
              />
              <div>
                <div className="text-[10px] font-bold text-white leading-none">{u.name}</div>
                <div className="text-[9px] text-sky-300 font-mono">{u.tu} TU</div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-amber-300">
            {battleMode === 'pve'
              ? `🏕️ PvE vs ${opponentLabel}`
              : `🏆 PvP: ${selectedRoom.title} vs ${opponentLabel}`}
          </span>
          <button
            onClick={() => finishBattle(false)}
            className="pixel-btn pixel-btn-red px-2.5 py-1 text-[9px]"
          >
            RENDIRSE
          </button>
        </div>
      </div>

      {/* 2D Pixel Art Battle Canvas (860x410) */}
      <div className="relative pixel-panel overflow-hidden border-2 border-amber-500/70">
        <canvas
          ref={canvasRef}
          width={860}
          height={410}
          className="w-full h-[290px] sm:h-[390px] block pixel-art bg-slate-950"
        />

        {/* Bench Reserves Indicator Overlay */}
        <div className="absolute top-2 left-2 bg-slate-950/85 border border-emerald-500/50 px-2.5 py-1 rounded text-[10px] text-emerald-300 font-pixel">
          🛡️ TU BANCA: {playerBench.filter((b) => b.hp > 0).length} REFUERZOS
        </div>
        <div className="absolute top-2 right-2 bg-slate-950/85 border border-rose-500/50 px-2.5 py-1 rounded text-[10px] text-rose-300 font-pixel">
          ⚔️ BANCA RIVAL: {enemyBench.filter((b) => b.hp > 0).length} REFUERZOS
        </div>

        {/* Target Selector Pills for Enemy Frontline */}
        <div className="absolute bottom-2 right-2 flex flex-wrap gap-1.5 bg-slate-950/90 p-1.5 rounded border border-slate-700">
          <span className="text-[9px] font-pixel text-rose-300 self-center px-1">OBJETIVO:</span>
          {enemyFront
            .filter((e) => e.hp > 0)
            .map((e) => (
              <button
                key={e.uid}
                onClick={() => setSelectedTargetUid(e.uid)}
                className={`px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 border ${
                  selectedTargetUid === e.uid
                    ? 'bg-rose-600 text-white border-amber-300'
                    : 'bg-slate-800 text-slate-300 border-slate-600'
                }`}
              >
                <img
                  src={ELEMENT_META[e.element].icon}
                  alt={e.element}
                  className="w-3.5 h-3.5 pixel-art"
                />
                {e.name} ({Math.round((e.hp / e.maxHp) * 100)}%)
              </button>
            ))}
        </div>

        {/* Victory / Defeat Modal Overlay */}
        {battleOutcome && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-20">
            <div className="font-pixel text-xl sm:text-2xl mb-2 text-amber-300">
              {battleOutcome === 'victory' ? '🏆 ¡VICTORIA TÁCTICA 4v4!' : '💀 DERROTA EN LA ARENA'}
            </div>
            <p className="text-sm text-slate-300 max-w-md mb-4">
              {battleOutcome === 'victory'
                ? battleMode === 'pve'
                  ? 'Has dominado la expedición salvaje PvE y recolectado +380 Oro y Esencias.'
                  : `¡Has ganado el pozo de ${selectedRoom.title} tras descontar el ${selectedRoom.rakePct}% de comisión de la casa!`
                : 'Tu escuadrón cayó en combate. Entrena o evoluciona tus monstruos en el Santuario.'}
            </p>
            {capturedThisMatch && (
              <div className="mb-4 p-3 rounded bg-sky-950/80 border-2 border-sky-400 flex items-center gap-3">
                <img
                  src={`/assets/monsters/${capturedThisMatch.speciesId}.png`}
                  alt="Captured"
                  className="w-14 h-14 pixel-art"
                />
                <div className="text-left">
                  <div className="font-pixel text-xs text-sky-300">¡NUEVO MONSTRUO CAPTURADO!</div>
                  <div className="text-sm font-bold text-white">
                    {MONSTERS_BY_ID[capturedThisMatch.speciesId]?.name} (Nv.{capturedThisMatch.level})
                  </div>
                </div>
              </div>
            )}
            <button
              onClick={() => {
                setInBattle(false);
                soundManager.playBgm('citadel');
                fetchOpenPvpRooms();
              }}
              className="pixel-btn pixel-btn-gold px-6 py-3 text-xs"
            >
              VOLVER AL CENTRO DE MANDO
            </button>
          </div>
        )}
      </div>

      {/* Bottom Tactical Command Deck (4 Skills + Capture Orbs + Combat Log) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* 4 Skills of Current Active Player Unit */}
        <div className="lg:col-span-8 pixel-panel p-3">
          {currentTurnUnit && currentTurnUnit.isPlayer ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <img
                    src={`/assets/monsters/${currentTurnUnit.speciesId}.png`}
                    alt={currentTurnUnit.name}
                    className="w-9 h-9 pixel-art bg-slate-900 rounded border border-amber-400"
                  />
                  <div>
                    <div className="font-pixel text-xs text-amber-300">
                      TURNO ACTIVO: {currentTurnUnit.name} (Nv.{currentTurnUnit.level})
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Selecciona una habilidad (cada habilidad suma Time Units y anima el Sprite Sheet 6×4):
                    </div>
                  </div>
                </div>

                {/* Capture Orb Buttons (PvE Only) */}
                {battleMode === 'pve' && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleThrowCaptureOrb('capture_basic')}
                      className="pixel-btn pixel-btn-blue px-2.5 py-1.5 text-[9px] flex items-center gap-1"
                    >
                      <img
                        src="/assets/icons/icon_capture_basic.png"
                        alt="Orb"
                        className="w-4 h-4 pixel-art"
                      />
                      ORBE ({Math.max(0, (inventory.capture_basic || 0) + (usedItems.capture_basic || 0))})
                    </button>
                    <button
                      onClick={() => handleThrowCaptureOrb('capture_master')}
                      className="pixel-btn pixel-btn-gold px-2.5 py-1.5 text-[9px] flex items-center gap-1"
                    >
                      <img
                        src="/assets/icons/icon_capture_master.png"
                        alt="Master"
                        className="w-4 h-4 pixel-art"
                      />
                      MAESTRO ({Math.max(0, (inventory.capture_master || 0) + (usedItems.capture_master || 0))})
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {currentTurnUnit.skills.map((sk, idx) => (
                  <button
                    key={idx}
                    onClick={() => executePlayerSkill(sk)}
                    className={`p-2.5 rounded border-2 text-left transition flex flex-col justify-between ${
                      sk.is_ultimate
                        ? 'bg-gradient-to-br from-amber-950/90 to-rose-950/90 border-amber-400 hover:border-yellow-300'
                        : 'bg-slate-900/90 border-slate-700 hover:border-sky-400'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-pixel text-[10px] text-white truncate">
                          {sk.is_ultimate ? '💥 ' : '⚔️ '}
                          {sk.name}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-tight">{sk.desc}</p>
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-800 text-[10px] font-mono">
                      <span className="text-amber-300">PWR {sk.power || 'BUFF'}</span>
                      <span className="px-1.5 py-0.5 rounded bg-sky-950 text-sky-300 font-bold">
                        +{sk.tu} TU
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="h-28 flex items-center justify-center font-pixel text-xs text-rose-400 animate-pulse">
              ⏳ EJECUTANDO TURNO DEL ESCUADRÓN RIVAL...
            </div>
          )}
        </div>

        {/* Battle Combat Log */}
        <div className="lg:col-span-4 pixel-panel p-3 flex flex-col">
          <div className="font-pixel text-[10px] text-sky-300 mb-1.5">📜 REGISTRO TÁCTICO 4v4</div>
          <div className="flex-1 max-h-32 overflow-y-auto space-y-1 text-[11px] font-mono text-slate-300 pr-1">
            {battleLog.map((entry, i) => (
              <div key={i} className="border-b border-slate-800/80 pb-1">
                {entry}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
