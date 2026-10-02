// Vercel Serverless Function: /api/pvp-matchmaking
// Real Online PvP Matchmaking Queue, Squad Snapshot Sync & Wager Escrow Settlement

const SUPABASE_GAME_URL = process.env.VITE_SUPABASE_GAME_URL || 'https://vvvjbicveeiqvhhveuyt.supabase.co';
const SUPABASE_GAME_KEY = process.env.SUPABASE_GAME_SERVICE_ROLE_KEY || process.env.GAME_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_GAME_SUPABASE_ANON_KEY;
const SUPABASE_ADMIN_URL = process.env.VITE_SUPABASE_ADMIN_URL || 'https://fiqddlfokjkszwcbldpe.supabase.co';
const SUPABASE_ADMIN_KEY = process.env.SUPABASE_ADMIN_SERVICE_ROLE_KEY || process.env.ADMIN_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_ADMIN_SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  if (!SUPABASE_GAME_KEY) {
    return res.status(500).json({ error: 'Missing Supabase Game Key' });
  }

  if (req.method === 'GET') {
    const r = await fetch(
      `${SUPABASE_GAME_URL}/rest/v1/pvp_matches?order=created_at.desc&limit=15`,
      {
        headers: {
          apikey: SUPABASE_GAME_KEY,
          Authorization: `Bearer ${SUPABASE_GAME_KEY}`,
        },
      }
    );
    const matches = await r.json();
    return res.status(200).json({ matches: Array.isArray(matches) ? matches : [] });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { action, roomTier, currency, stakeAmount, telegramId, username, elo, squad, matchId, winnerTelegramId, combatLog } =
      req.body || {};

    if (action === 'create_or_join') {
      const tgId = Number(telegramId);
      // 1. Check if there is an open room in this tier hosted by another player
      const openRes = await fetch(
        `${SUPABASE_GAME_URL}/rest/v1/pvp_matches?status=eq.open&room_tier=eq.${encodeURIComponent(roomTier)}&host_telegram_id=neq.${tgId}&order=created_at.asc&limit=1`,
        {
          headers: {
            apikey: SUPABASE_GAME_KEY,
            Authorization: `Bearer ${SUPABASE_GAME_KEY}`,
          },
        }
      );
      const openRooms = await openRes.json();

      if (Array.isArray(openRooms) && openRooms.length > 0) {
        const room = openRooms[0];
        const updRes = await fetch(`${SUPABASE_GAME_URL}/rest/v1/pvp_matches?id=eq.${room.id}`, {
          method: 'PATCH',
          headers: {
            apikey: SUPABASE_GAME_KEY,
            Authorization: `Bearer ${SUPABASE_GAME_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
          body: JSON.stringify({
            challenger_telegram_id: tgId,
            challenger_username: username || 'Commander',
            challenger_squad: squad || [],
            status: 'in_progress',
          }),
        });
        const updated = await updRes.json();
        return res.status(200).json({
          matched: true,
          role: 'challenger',
          match: updated?.[0] || room,
        });
      }

      // 2. Otherwise create a new open room in Supabase `pvp_matches` with the player's squad snapshot
      const createRes = await fetch(`${SUPABASE_GAME_URL}/rest/v1/pvp_matches`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_GAME_KEY,
          Authorization: `Bearer ${SUPABASE_GAME_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          room_tier: roomTier || 'rookie_gold',
          currency: currency || 'GOLD',
          stake_amount: Number(stakeAmount) || 300,
          rake_pct: 10.0,
          host_telegram_id: tgId,
          host_username: username || 'Commander',
          host_elo: Number(elo) || 1000,
          host_squad: squad || [],
          status: 'open',
        }),
      });
      const created = await createRes.json();
      return res.status(200).json({
        matched: false,
        role: 'host',
        match: created?.[0] || null,
      });
    }

    if (action === 'cancel_room') {
      if (!matchId) return res.status(400).json({ error: 'Missing matchId' });
      await fetch(`${SUPABASE_GAME_URL}/rest/v1/pvp_matches?id=eq.${encodeURIComponent(matchId)}&status=eq.open`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_GAME_KEY,
          Authorization: `Bearer ${SUPABASE_GAME_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'cancelled', completed_at: new Date().toISOString() }),
      });
      return res.status(200).json({ ok: true });
    }

    if (action === 'settle_match') {
      if (!matchId) return res.status(400).json({ error: 'Missing matchId' });
      const mRes = await fetch(`${SUPABASE_GAME_URL}/rest/v1/pvp_matches?id=eq.${encodeURIComponent(matchId)}&select=*`, {
        headers: {
          apikey: SUPABASE_GAME_KEY,
          Authorization: `Bearer ${SUPABASE_GAME_KEY}`,
        },
      });
      const matches = await mRes.json();
      const match = matches?.[0];
      if (!match) return res.status(404).json({ error: 'Match not found' });
      if (match.status === 'completed') {
        return res.status(200).json({ match, alreadySettled: true });
      }

      const totalPot = Number(match.stake_amount) * 2;
      const rakeAmount = Number((totalPot * (Number(match.rake_pct || 10) / 100)).toFixed(4));
      const payout = Number((totalPot - rakeAmount).toFixed(4));

      const updRes = await fetch(`${SUPABASE_GAME_URL}/rest/v1/pvp_matches?id=eq.${encodeURIComponent(matchId)}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_GAME_KEY,
          Authorization: `Bearer ${SUPABASE_GAME_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          winner_telegram_id: Number(winnerTelegramId),
          house_rake_amount: rakeAmount,
          winner_payout: payout,
          status: 'completed',
          combat_log: combatLog || [],
          completed_at: new Date().toISOString(),
        }),
      });
      const settled = await updRes.json();

      if (SUPABASE_ADMIN_KEY) {
        const usdEq = match.currency === 'TON' ? rakeAmount * 5.25 : rakeAmount * 0.001;
        await fetch(`${SUPABASE_ADMIN_URL}/rest/v1/treasury_ledger`, {
          method: 'POST',
          headers: {
            apikey: SUPABASE_ADMIN_KEY,
            Authorization: `Bearer ${SUPABASE_ADMIN_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tx_type: 'PVP_RAKE',
            player_telegram_id: Number(winnerTelegramId) || match.host_telegram_id,
            player_username: username || match.host_username,
            currency: match.currency,
            gross_amount: totalPot,
            house_commission_amount: rakeAmount,
            usd_equivalent: Number(usdEq.toFixed(4)),
            reference_note: `PvP Online Match #${String(matchId).slice(0, 8)} (${match.room_tier}) — 10% House Rake`,
            external_tx_id: `pvp_${matchId}`,
          }),
        });
      }

      return res.status(200).json({
        match: settled?.[0] || match,
        rakeAmount,
        winnerPayout: payout,
      });
    }

    return res.status(400).json({ error: 'Unsupported action' });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
