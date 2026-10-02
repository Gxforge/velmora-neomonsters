// Vercel Serverless Function: /api/admin-data
// Protected Backend Endpoint for Owner Treasury Analytics & Withdrawal Management

const SUPABASE_GAME_URL = process.env.VITE_SUPABASE_GAME_URL || 'https://vvvjbicveeiqvhhveuyt.supabase.co';
const SUPABASE_GAME_KEY = process.env.SUPABASE_GAME_SERVICE_ROLE_KEY || process.env.GAME_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_GAME_SUPABASE_ANON_KEY;
const SUPABASE_ADMIN_URL = process.env.VITE_SUPABASE_ADMIN_URL || 'https://fiqddlfokjkszwcbldpe.supabase.co';
const SUPABASE_ADMIN_KEY = process.env.SUPABASE_ADMIN_SERVICE_ROLE_KEY || process.env.ADMIN_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_ADMIN_SUPABASE_ANON_KEY;

const ADMIN_PASSCODE = process.env.ADMIN_MASTER_PASSCODE || 'VELMORA_OWNER_2026';

async function verifyAdminAuth(req) {
  const headerPass = req.headers['x-admin-passcode'] || req.query?.passcode || req.body?.passcode;
  if (headerPass && headerPass === ADMIN_PASSCODE) {
    return { authorized: true, role: 'owner_passcode' };
  }

  const tgId = Number(req.headers['x-telegram-id'] || req.query?.telegramId || req.body?.telegramId);
  if (tgId && SUPABASE_GAME_KEY) {
    const r = await fetch(
      `${SUPABASE_GAME_URL}/rest/v1/player_profiles?telegram_id=eq.${tgId}&select=is_admin`,
      {
        headers: {
          apikey: SUPABASE_GAME_KEY,
          Authorization: `Bearer ${SUPABASE_GAME_KEY}`,
        },
      }
    );
    const rows = await r.json();
    if (rows?.[0]?.is_admin === true) {
      return { authorized: true, role: 'db_admin' };
    }
  }

  return { authorized: false };
}

export default async function handler(req, res) {
  const auth = await verifyAdminAuth(req);
  if (!auth.authorized) {
    return res.status(403).json({
      error: 'Acceso denegado (403): Se requiere clave maestra de propietario o rol is_admin verificado en el servidor.',
    });
  }

  if (!SUPABASE_ADMIN_KEY) {
    return res.status(500).json({ error: 'Missing SUPABASE_ADMIN_SERVICE_ROLE_KEY' });
  }

  if (req.method === 'GET') {
    const [ledRes, wdRes, audRes] = await Promise.all([
      fetch(`${SUPABASE_ADMIN_URL}/rest/v1/treasury_ledger?order=created_at.desc&limit=50`, {
        headers: { apikey: SUPABASE_ADMIN_KEY, Authorization: `Bearer ${SUPABASE_ADMIN_KEY}` },
      }),
      fetch(`${SUPABASE_ADMIN_URL}/rest/v1/withdrawal_requests?order=created_at.desc&limit=30`, {
        headers: { apikey: SUPABASE_ADMIN_KEY, Authorization: `Bearer ${SUPABASE_ADMIN_KEY}` },
      }),
      fetch(`${SUPABASE_ADMIN_URL}/rest/v1/admin_audit_logs?order=created_at.desc&limit=20`, {
        headers: { apikey: SUPABASE_ADMIN_KEY, Authorization: `Bearer ${SUPABASE_ADMIN_KEY}` },
      }),
    ]);

    const [ledger, withdrawals, auditLogs] = await Promise.all([
      ledRes.json(),
      wdRes.json(),
      audRes.json(),
    ]);

    return res.status(200).json({
      authorizedRole: auth.role,
      ledger: Array.isArray(ledger) ? ledger : [],
      withdrawals: Array.isArray(withdrawals) ? withdrawals : [],
      auditLogs: Array.isArray(auditLogs) ? auditLogs : [],
    });
  }

  if (req.method === 'POST') {
    const { action, withdrawalId, txHash, adminTelegramId } = req.body || {};
    if (!withdrawalId) return res.status(400).json({ error: 'Missing withdrawalId' });

    const newStatus = action === 'approve_withdrawal' ? 'approved_paid' : 'rejected';

    // Fetch withdrawal row
    const wRes = await fetch(
      `${SUPABASE_ADMIN_URL}/rest/v1/withdrawal_requests?id=eq.${encodeURIComponent(withdrawalId)}&select=*`,
      {
        headers: { apikey: SUPABASE_ADMIN_KEY, Authorization: `Bearer ${SUPABASE_ADMIN_KEY}` },
      }
    );
    const wRows = await wRes.json();
    const wRow = wRows?.[0];
    if (!wRow) return res.status(404).json({ error: 'Withdrawal request not found' });

    await fetch(`${SUPABASE_ADMIN_URL}/rest/v1/withdrawal_requests?id=eq.${encodeURIComponent(withdrawalId)}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_ADMIN_KEY,
        Authorization: `Bearer ${SUPABASE_ADMIN_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: newStatus,
        tx_hash: txHash || null,
        processed_at: new Date().toISOString(),
      }),
    });

    // Sync status in game DB `blockchain_transactions`
    if (SUPABASE_GAME_KEY && wRow.idempotency_key) {
      await fetch(
        `${SUPABASE_GAME_URL}/rest/v1/blockchain_transactions?idempotency_key=eq.${encodeURIComponent(wRow.idempotency_key)}`,
        {
          method: 'PATCH',
          headers: {
            apikey: SUPABASE_GAME_KEY,
            Authorization: `Bearer ${SUPABASE_GAME_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: newStatus === 'approved_paid' ? 'confirmed' : 'rejected',
            tx_hash: txHash || null,
            verified_at: new Date().toISOString(),
          }),
        }
      );

      // If rejected, refund the locked escrow TON back to the player's internal balance
      if (newStatus === 'rejected') {
        const pRes = await fetch(
          `${SUPABASE_GAME_URL}/rest/v1/player_profiles?telegram_id=eq.${wRow.player_telegram_id}&select=ton_balance`,
          {
            headers: { apikey: SUPABASE_GAME_KEY, Authorization: `Bearer ${SUPABASE_GAME_KEY}` },
          }
        );
        const pRows = await pRes.json();
        const curTon = Number(pRows?.[0]?.ton_balance || 0);
        await fetch(
          `${SUPABASE_GAME_URL}/rest/v1/player_profiles?telegram_id=eq.${wRow.player_telegram_id}`,
          {
            method: 'PATCH',
            headers: {
              apikey: SUPABASE_GAME_KEY,
              Authorization: `Bearer ${SUPABASE_GAME_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              ton_balance: Number((curTon + Number(wRow.requested_ton)).toFixed(4)),
            }),
          }
        );
      }
    }

    // Write immutable audit log
    await fetch(`${SUPABASE_ADMIN_URL}/rest/v1/admin_audit_logs`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ADMIN_KEY,
        Authorization: `Bearer ${SUPABASE_ADMIN_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        admin_telegram_id: Number(adminTelegramId) || 99001122,
        action: newStatus.toUpperCase(),
        target_id: String(withdrawalId),
        metadata: {
          player_telegram_id: wRow.player_telegram_id,
          requested_ton: wRow.requested_ton,
          tx_hash: txHash || null,
        },
      }),
    });

    return res.status(200).json({ ok: true, status: newStatus });
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
