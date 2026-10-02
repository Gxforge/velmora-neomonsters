import catalogJson from '../../public/assets/monsters_catalog.json';

export type ElementType = 'fire' | 'water' | 'earth' | 'storm' | 'light' | 'shadow';

export interface MonsterSkill {
  id: string;
  name: string;
  tu: number;
  power: number;
  type:
    | 'single'
    | 'aoe2'
    | 'aoe4'
    | 'heal'
    | 'heal_all'
    | 'shield'
    | 'shield_all'
    | 'buff_atk'
    | 'buff_spd'
    | 'buff_team';
  element: ElementType;
  effect?: 'burn' | 'poison' | 'stun' | 'slow' | 'burn_bonus' | 'poison_bonus';
  desc: string;
  target: 'single_enemy' | 'all_enemies' | 'self_team';
  is_ultimate?: boolean;
}

export type SkillSpec = MonsterSkill;

export interface MonsterSpecies {
  id: string;
  element: ElementType;
  stage: 1 | 2 | 3;
  family_id: string;
  name: string;
  title: string;
  rarity: 'Inicial' | 'Épico' | 'Mítico';
  base_hp: number;
  base_atk: number;
  base_def: number;
  base_spd: number;
  cost_tu: number;
  cost: number;
  sprite: string;
  spritesheet: string;
  design_sheet: string;
  evolves_to: string | null;
  evolution_cost: Record<string, number>;
  passive_trait: { name: string; desc: string };
  skills: MonsterSkill[];
}

export interface OwnedMonster {
  instanceId: string;
  speciesId: string;
  level: number;
  xp: number;
  teamSlot: number | null; // 1..4 frontline 4v4, 5..8 bench reinforcements, null sanctuary
}

export const ELEMENT_META: Record<
  ElementType,
  {
    name: string;
    nameEs: string;
    code: string;
    color: string;
    bgClass: string;
    borderClass: string;
    icon: string;
    sheet: string;
    sheetUrl: string;
    strongAgainst: ElementType;
    weakAgainst: ElementType;
  }
> = {
  fire: {
    name: 'Fuego',
    nameEs: 'Fuego',
    code: 'PYRO',
    color: '#FF5F1F',
    bgClass: 'bg-orange-950/80',
    borderClass: 'border-orange-500',
    icon: '/assets/icons/icon_elem_fire.png',
    sheet: '/assets/sheets/sheet_fire.png',
    sheetUrl: '/assets/sheets/sheet_fire.png',
    strongAgainst: 'earth',
    weakAgainst: 'water',
  },
  water: {
    name: 'Agua',
    nameEs: 'Agua',
    code: 'HYDRO',
    color: '#38B6FF',
    bgClass: 'bg-sky-950/80',
    borderClass: 'border-sky-400',
    icon: '/assets/icons/icon_elem_water.png',
    sheet: '/assets/sheets/sheet_water.png',
    sheetUrl: '/assets/sheets/sheet_water.png',
    strongAgainst: 'fire',
    weakAgainst: 'storm',
  },
  earth: {
    name: 'Tierra',
    nameEs: 'Tierra',
    code: 'TERRA',
    color: '#6ED74B',
    bgClass: 'bg-emerald-950/80',
    borderClass: 'border-emerald-400',
    icon: '/assets/icons/icon_elem_earth.png',
    sheet: '/assets/sheets/sheet_earth.png',
    sheetUrl: '/assets/sheets/sheet_earth.png',
    strongAgainst: 'storm',
    weakAgainst: 'fire',
  },
  storm: {
    name: 'Rayo',
    nameEs: 'Rayo',
    code: 'VOLT',
    color: '#FFD700',
    bgClass: 'bg-amber-950/80',
    borderClass: 'border-amber-400',
    icon: '/assets/icons/icon_elem_storm.png',
    sheet: '/assets/sheets/sheet_storm.png',
    sheetUrl: '/assets/sheets/sheet_storm.png',
    strongAgainst: 'water',
    weakAgainst: 'earth',
  },
  light: {
    name: 'Luz',
    nameEs: 'Luz',
    code: 'LUX',
    color: '#FFEC94',
    bgClass: 'bg-yellow-950/80',
    borderClass: 'border-yellow-300',
    icon: '/assets/icons/icon_elem_light.png',
    sheet: '/assets/sheets/sheet_light.png',
    sheetUrl: '/assets/sheets/sheet_light.png',
    strongAgainst: 'shadow',
    weakAgainst: 'shadow',
  },
  shadow: {
    name: 'Oscuridad',
    nameEs: 'Oscuridad',
    code: 'UMBRA',
    color: '#B250FF',
    bgClass: 'bg-purple-950/80',
    borderClass: 'border-purple-400',
    icon: '/assets/icons/icon_elem_shadow.png',
    sheet: '/assets/sheets/sheet_shadow.png',
    sheetUrl: '/assets/sheets/sheet_shadow.png',
    strongAgainst: 'light',
    weakAgainst: 'light',
  },
};

export const MONSTER_SPECIES: MonsterSpecies[] = (catalogJson as any[]).map((raw) => {
  const el = raw.element as ElementType;
  const skills: MonsterSkill[] = (raw.skills || []).map((sk: any, idx: number) => {
    const isBuffOrHeal =
      sk.type === 'heal' ||
      sk.type === 'heal_all' ||
      sk.type === 'shield' ||
      sk.type === 'shield_all' ||
      sk.type === 'buff_atk' ||
      sk.type === 'buff_spd' ||
      sk.type === 'buff_team';
    const isAoe = sk.type === 'aoe2' || sk.type === 'aoe4' || idx === 3;
    return {
      ...sk,
      target: isBuffOrHeal ? 'self_team' : isAoe ? 'all_enemies' : 'single_enemy',
      is_ultimate: idx === 3,
    };
  });

  return {
    ...raw,
    cost: raw.cost_tu || raw.stage * 10,
    sprite: `/assets/monsters/${raw.id}.png`,
    spritesheet: `/assets/spritesheets/${raw.id}_sheet.png`,
    design_sheet: `/assets/sheets/sheet_${el}.png`,
    skills,
  };
});

export const ALL_MONSTERS: MonsterSpecies[] = MONSTER_SPECIES;

export const SPECIES_BY_ID: Record<string, MonsterSpecies> = Object.fromEntries(
  MONSTER_SPECIES.map((m) => [m.id, m])
);

export const MONSTERS_BY_ID: Record<string, MonsterSpecies> = SPECIES_BY_ID;

export function getElementMultiplier(attacker: ElementType, defender: ElementType): number {
  if (ELEMENT_META[attacker].strongAgainst === defender) return 1.5;
  if (attacker === 'fire' && defender === 'water') return 0.75;
  if (attacker === 'water' && defender === 'storm') return 0.75;
  if (attacker === 'storm' && defender === 'earth') return 0.75;
  if (attacker === 'earth' && defender === 'fire') return 0.75;
  return 1.0;
}

export function getMonsterStatsAtLevel(species: MonsterSpecies, level: number) {
  const mult = 1 + (level - 1) * 0.06;
  return {
    hp: Math.round(species.base_hp * mult),
    atk: Math.round(species.base_atk * mult),
    def: Math.round(species.base_def * mult),
    spd: Math.round(species.base_spd * (1 + (level - 1) * 0.025)),
  };
}

export function computeMonsterStats(speciesId: string, level: number) {
  const sp = SPECIES_BY_ID[speciesId] || MONSTER_SPECIES[0];
  return getMonsterStatsAtLevel(sp, level);
}

export interface BackpackItemMeta {
  key: string;
  name: string;
  category: 'Esencia Elemental' | 'Captura' | 'Evolución & XP';
  icon: string;
  desc: string;
}

export const BACKPACK_ITEMS_META: BackpackItemMeta[] = [
  {
    key: 'elem_fire',
    name: 'Esencia de Fuego (Pyro)',
    category: 'Esencia Elemental',
    icon: '/assets/icons/icon_elem_fire.png',
    desc: 'Material cristalizado para evolucionar monstruos de elemento Fuego.',
  },
  {
    key: 'elem_water',
    name: 'Esencia de Agua (Hydro)',
    category: 'Esencia Elemental',
    icon: '/assets/icons/icon_elem_water.png',
    desc: 'Material abisal para evolucionar monstruos de elemento Agua.',
  },
  {
    key: 'elem_earth',
    name: 'Esencia de Tierra (Terra)',
    category: 'Esencia Elemental',
    icon: '/assets/icons/icon_elem_earth.png',
    desc: 'Cuarzo ancestral para evolucionar monstruos de elemento Tierra.',
  },
  {
    key: 'elem_storm',
    name: 'Esencia de Rayo (Volt)',
    category: 'Esencia Elemental',
    icon: '/assets/icons/icon_elem_storm.png',
    desc: 'Núcleo voltaico para evolucionar monstruos de elemento Rayo.',
  },
  {
    key: 'elem_light',
    name: 'Esencia de Luz (Lux)',
    category: 'Esencia Elemental',
    icon: '/assets/icons/icon_elem_light.png',
    desc: 'Fragmento astral para evolucionar monstruos de elemento Luz.',
  },
  {
    key: 'elem_shadow',
    name: 'Esencia de Oscuridad (Umbra)',
    category: 'Esencia Elemental',
    icon: '/assets/icons/icon_elem_shadow.png',
    desc: 'Reliquia del eclipse para evolucionar monstruos de elemento Oscuridad.',
  },
  {
    key: 'capture_basic',
    name: 'Orbe de Captura Elemental',
    category: 'Captura',
    icon: '/assets/icons/icon_capture_basic.png',
    desc: 'Permite capturar monstruos salvajes debilitados en combates 4v4 PvE (60% base).',
  },
  {
    key: 'capture_master',
    name: 'Orbe Maestro Soberano',
    category: 'Captura',
    icon: '/assets/icons/icon_capture_master.png',
    desc: 'Orbe supremo con 100% de probabilidad de captura instantánea en expediciones PvE.',
  },
  {
    key: 'xp_fruit',
    name: 'Fruta Astral de XP',
    category: 'Evolución & XP',
    icon: '/assets/icons/icon_xp_fruit.png',
    desc: 'Sube niveles instantáneamente a cualquier monstruo de tu equipo.',
  },
  {
    key: 'evo_crown',
    name: 'Corona de Evolución Real',
    category: 'Evolución & XP',
    icon: '/assets/icons/icon_evo_crown.png',
    desc: 'Reliquia imprescindible para desbloquear la Etapa 3 (Mítico).',
  },
];

export const STARTER_SPECIES: MonsterSpecies[] = MONSTER_SPECIES.filter((m) => m.stage === 1);
