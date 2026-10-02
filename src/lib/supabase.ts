import { createClient } from '@supabase/supabase-js';
import { OwnedMonster } from '../data/monstersData';

const GAME_SUPABASE_URL =
  import.meta.env.VITE_GAME_SUPABASE_URL || 'https://vvvjbicveeiqvhhveuyt.supabase.co';
const GAME_SUPABASE_ANON_KEY =
  import.meta.env.VITE_GAME_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ2dmpiaWN2ZWVpcXZoaHZldXl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4OTk3NTAsImV4cCI6MjEwNjQ3NTc1MH0.rYd9JvJeah9DIrhIiyjrCdzPBexKFzvLxhyqLcYN3xw';

const ADMIN_SUPABASE_URL =
  import.meta.env.VITE_ADMIN_SUPABASE_URL || 'https://fiqddlfokjkszwcbldpe.supabase.co';
const ADMIN_SUPABASE_ANON_KEY =
  import.meta.env.VITE_ADMIN_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpcWRkbGZva2prc3p3Y2JsZHBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4OTk3NzUsImV4cCI6MjEwNjQ3NTc3NX0.pVuj667SRs3i86p597CsFdlYBa4d7c9bdrm-CorlcHE';

export const gameSupabase = createClient(GAME_SUPABASE_URL, GAME_SUPABASE_ANON_KEY);
export const adminSupabase = createClient(ADMIN_SUPABASE_URL, ADMIN_SUPABASE_ANON_KEY);

export interface PlayerProfile {
  id: string;
  telegram_id: number;
  username: string;
  first_name: string;
  starter_chosen: string | null;
  gold: number;
  velmora_crystals: number;
  ton_balance: number;
  stars_balance: number;
  energy: number;
  max_energy: number;
  trophies: number;
  wins: number;
  losses: number;
  campaign_stage: number;
  referral_code: string;
  referral_count: number;
  referral_earnings_ton: number;
  base_buildings: {
    gold_mine: { level: number; last_collected: number; rate_per_hour: number };
    essence_reactor: { level: number; last_collected: number; rate_per_hour: number };
    elemental_sanctuary: { level: number; capacity: number };
    capture_forge: { level: number; orbs_stored: number };
  };
  inventory: Record<string, number>;
}

export function getTelegramUserContext(): {
  telegramId: number;
  username: string;
  firstName: string;
  isTelegramMiniApp: boolean;
} {
  const tg = (window as any).Telegram?.WebApp;
  if (tg && tg.initDataUnsafe?.user) {
    tg.ready?.();
    tg.expand?.();
    const u = tg.initDataUnsafe.user;
    return {
      telegramId: Number(u.id),
      username: u.username || `domador_${u.id}`,
      firstName: u.first_name || 'Domador',
      isTelegramMiniApp: true,
    };
  }

  let storedId = localStorage.getItem('velmora_tg_id');
  if (!storedId) {
    storedId = String(77000000 + Math.floor(Math.random() * 900000));
    localStorage.setItem('velmora_tg_id', storedId);
  }
  return {
    telegramId: Number(storedId),
    username: 'Gxforge_Domador',
    firstName: 'Comandante Velmora',
    isTelegramMiniApp: false,
  };
}

export async function recordTreasuryRevenue(params: {
  tx_type: string;
  player_telegram_id: number;
  player_username: string;
  currency: 'TON' | 'STARS' | 'GOLD';
  gross_amount: number;
  house_commission_amount: number;
  usd_equivalent: number;
  reference_note: string;
}) {
  try {
    await adminSupabase.from('treasury_ledger').insert(params);
  } catch (e) {
    console.warn('Treasury revenue log warning:', e);
  }
}

export async function recordHouseTreasuryEvent(params: {
  sourceEvent: string;
  playerTelegramId: number;
  playerUsername: string;
  grossAmount: number;
  houseProfitTon: number;
  houseProfitStars: number;
  currency: 'TON' | 'STARS';
  notes: string;
}) {
  const usdEst =
    params.houseProfitTon * 5.4 + params.houseProfitStars * 0.015;
  try {
    await adminSupabase.from('treasury_ledger').insert({
      source_event: params.sourceEvent,
      player_telegram_id: params.playerTelegramId,
      player_username: params.playerUsername,
      gross_amount: params.grossAmount,
      house_profit_ton: params.houseProfitTon,
      house_profit_stars: params.houseProfitStars,
      house_profit_usd_est: Number(usdEst.toFixed(4)),
      currency: params.currency,
      notes: params.notes,
    });
  } catch (e) {
    console.warn('Treasury ledger log warning:', e);
  }
}

export async function syncMonstersToSupabase(playerId: string, monsters: OwnedMonster[]) {
  if (!playerId || playerId.startsWith('local-')) return;
  try {
    await gameSupabase.from('player_monsters').delete().eq('player_id', playerId);
    if (monsters.length > 0) {
      const rows = monsters.map((m, idx) => ({
        player_id: playerId,
        species_id: m.speciesId,
        level: m.level,
        xp: m.xp,
        stage: m.speciesId.endsWith('_3') ? 3 : m.speciesId.endsWith('_2') ? 2 : 1,
        team_slot: m.teamSlot,
        is_starter: idx === 0,
      }));
      await gameSupabase.from('player_monsters').insert(rows);
    }
  } catch (e) {
    console.warn('Monster sync warning:', e);
  }
}
