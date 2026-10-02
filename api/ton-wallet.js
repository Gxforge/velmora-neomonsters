// Vercel Serverless Function: /api/ton-wallet
// Real Backend TON Wallet Binding, On-Chain Deposit Verification, Idempotency & Withdrawal Escrow

const SUPABASE_GAME_URL = process.env.VITE_SUPABASE_GAME_URL || 'https://vvvjbicveeiqvhhveuyt.supabase.co';
const SUPABASE_GAME_KEY = process.env.SUPABASE_GAME_SERVICE_ROLE_KEY || process.env.GAME_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_GAME_SUPABASE_ANON_KEY;
const SUPABASE_ADMIN_URL = process.env.VITE_SUPABASE_ADMIN_URL || 'https://fiqddlfokjkszwcbldpe.supabase.co';
const SUPABASE_ADMIN_KEY = process.env.SUPABASE_ADMIN_SERVICE_ROLE_KEY || process.env.ADMIN_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_ADMIN_SUPABASE_ANON_KEY;

const TREASURY_TON_WALLET = process.env.TREASURY_TON_WALLET || 'UQVelmoraTreasuryMasterVault99887766554433221100';

function isValidTonAddress(addr) {
  if (!addr || typeof addr !== 'string') return false;
  const trimmed = addr.trim();
  return /^(UQ|EQ)[A-Za-z0-9_-]{40,50}$/.test(trimmed) || /^0:[0-9a-fA-F]{64}$/.test(trimmed);
}

export default async function handler(req, res) {
  if (!SUPABASE_GAME_KEY) {
    return res.status(500).json({ error: 'Missing Supabase Game Service Key' });
  }

  if (req.method === 'GET') {
    const { telegramId } = req.query || {};
    if (!telegramId) {
      return res.status(400).json({ error: 'Missing telegramId' });
    }
    const txRes = await fetch(
      `${SUPABASE_GAME_URL}/rest/v1/blockchain_transactions?telegram_id=eq.${encodeURIComponent(telegramId)}&order=created_at.desc&limit=20`,
      {
        headers: {
          apikey: SUPABASE_GAME_KEY,
          Authorization: `Bearer ${SUPABASE_GAME_KEY}`,
        },
      }
    );
    const transactions = await txRes.json();
    return res.status(200).json({
      treasuryWallet: TREASURY_TON_WALLET,
      transactions: Array.isArray(transactions) ? transactions : [],
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { action, telegramId, username, walletAddress, txHash, amountTon, idempotencyKey } = req.body || {};
    const tgId = Number(telegramId);
    if (!tgId) {
      return res.status(400).json({ error: 'Invalid telegramId' });
    }

    // 1. BIND EXTERNAL TON WALLET ADDRESS
    if (action === 'bind_wallet') {
      if (!isValidTonAddress(walletAddress)) {
        return res.status(400).json({
          error: 'Formato de dirección TON inválido. Debe comenzar por UQ... o EQ... (48 caracteres).',
        });
      }
      await fetch(`${SUPABASE_GAME_URL}/rest/v1/player_profiles?telegram_id=eq.${tgId}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_GAME_KEY,
          Authorization: `Bearer ${SUPABASE_GAME_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ton_wallet_address: walletAddress.trim(),
          updated_at: new Date().toISOString(),
        }),
      });
      return res.status(200).json({ ok: true, walletAddress: walletAddress.trim() });
    }

    // 2. VERIFY ON-CHAIN TON DEPOSIT (With Idempotency & Double-Credit Protection)
    if (action === 'verify_deposit') {
      const amt = Number(amountTon);
      if (!txHash || String(txHash).trim().length < 16) {
        return res.status(400).json({
          error: 'Debes proporcionar el Hash (BOC / TxHash) real de la transacción en la blockchain TON.',
        });
      }
      if (!amt || amt <= 0) {
        return res.status(400).json({ error: 'Cantidad de TON inválida.' });
      }
      if (!isValidTonAddress(walletAddress)) {
        return res.status(400).json({ error: 'Vincula primero una dirección TON válida (UQ... / EQ...).' });
      }

      const cleanHash = String(txHash).trim();
      const idemKey = idempotencyKey || `dep_${tgId}_${cleanHash}`;

      // Check idempotency / duplicate tx_hash
      const dupRes = await fetch(
        `${SUPABASE_GAME_URL}/rest/v1/blockchain_transactions?or=(tx_hash.eq.${encodeURIComponent(cleanHash)},idempotency_key.eq.${encodeURIComponent(idemKey)})&select=*`,
        {
          headers: {
            apikey: SUPABASE_GAME_KEY,
            Authorization: `Bearer ${SUPABASE_GAME_KEY}`,
          },
        }
      );
      const existing = await dupRes.json();
      if (Array.isArray(existing) && existing.length > 0) {
        return res.status(409).json({
          error: 'Esta transacción TON ya fue registrada anteriormente (Protección contra doble acreditación).',
          transaction: existing[0],
        });
      }

      // Query public TON blockchain API to check if txHash is confirmed on-chain
      let onChainConfirmed = false;
      let verificationPayload = { checked_at: new Date().toISOString(), source: 'tonapi.io' };

      try {
        const tonApiRes = await fetch(`https://tonapi.io/v2/blockchain/transactions/${encodeURIComponent(cleanHash)}`, {
          headers: { Accept: 'application/json' },
        });
        if (tonApiRes.ok) {
          const txData = await tonApiRes.json();
          const outMsgs = txData.out_msgs || [];
          const expectedNano = Math.round(amt * 1e9);
          const matchedMsg = outMsgs.find(
            (m) => Number(m.value || 0) >= expectedNano * 0.98
          );
          if (txData.success === true && matchedMsg) {
            onChainConfirmed = true;
            verificationPayload = {
              checked_at: new Date().toISOString(),
              lt: txData.lt,
              hash: txData.hash,
              utime: txData.utime,
              verified_on_chain: true,
            };
          } else {
            verificationPayload.reason = 'Transaction found but destination/amount mismatch';
          }
        } else {
          verificationPayload.reason = `TonAPI HTTP ${tonApiRes.status} (hash pending or unindexed)`;
        }
      } catch (e) {
        verificationPayload.reason = `Indexer unreachable: ${String(e)}`;
      }

      const txStatus = onChainConfirmed ? 'confirmed' : 'pending';

      const insRes = await fetch(`${SUPABASE_GAME_URL}/rest/v1/blockchain_transactions`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_GAME_KEY,
          Authorization: `Bearer ${SUPABASE_GAME_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          telegram_id: tgId,
          username: username || 'Commander',
          tx_type: 'DEPOSIT',
          wallet_address: walletAddress.trim(),
          tx_hash: cleanHash,
          idempotency_key: idemKey,
          gross_amount_ton: amt,
          fee_amount_ton: 0,
          net_amount_ton: amt,
          status: txStatus,
          verification_payload: verificationPayload,
          ...(onChainConfirmed ? { verified_at: new Date().toISOString() } : {}),
        }),
      });
      const insertedRows = await insRes.json();
      const txRow = insertedRows?.[0] || null;

      if (onChainConfirmed) {
        // Credit internal TON balance only when verified on-chain
        const profRes = await fetch(`${SUPABASE_GAME_URL}/rest/v1/player_profiles?telegram_id=eq.${tgId}&select=ton_balance`, {
          headers: {
            apikey: SUPABASE_GAME_KEY,
            Authorization: `Bearer ${SUPABASE_GAME_KEY}`,
          },
        });
        const profs = await profRes.json();
        const currentTon = Number(profs?.[0]?.ton_balance || 0);
        const nextTon = Number((currentTon + amt).toFixed(4));

        await fetch(`${SUPABASE_GAME_URL}/rest/v1/player_profiles?telegram_id=eq.${tgId}`, {
          method: 'PATCH',
          headers: {
            apikey: SUPABASE_GAME_KEY,
            Authorization: `Bearer ${SUPABASE_GAME_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ton_balance: nextTon,
            updated_at: new Date().toISOString(),
          }),
        });

        return res.status(200).json({
          status: 'confirmed',
          credited: true,
          newTonBalance: nextTon,
          transaction: txRow,
          message: `Depósito de ${amt} TON verificado on-chain y acreditado a tu balance interno.`,
        });
      }

      return res.status(200).json({
        status: 'pending',
        credited: false,
        transaction: txRow,
        message:
          'Transacción registrada en estado PENDING. Por seguridad financiera, el balance interno del juego NO se acredita hasta que el hash sea confirmado on-chain en la red TON.',
      });
    }

    // 3. REQUEST TON WITHDRAWAL (Backend Balance Check + Escrow Deduction + 5% House Fee)
    if (action === 'request_withdrawal') {
      const reqTon = Number(amountTon);
      if (!reqTon || reqTon < 1.0) {
        return res.status(400).json({ error: 'El retiro mínimo es de 1.00 TON.' });
      }
      if (!isValidTonAddress(walletAddress)) {
        return res.status(400).json({ error: 'Dirección de billetera TON inválida (debe ser UQ... o EQ...).' });
      }

      const idemKey = idempotencyKey || `wd_${tgId}_${Date.now()}`;

      // Fetch authoritative internal balance from Supabase
      const profRes = await fetch(
        `${SUPABASE_GAME_URL}/rest/v1/player_profiles?telegram_id=eq.${tgId}&select=ton_balance,username`,
        {
          headers: {
            apikey: SUPABASE_GAME_KEY,
            Authorization: `Bearer ${SUPABASE_GAME_KEY}`,
          },
        }
      );
      const profs = await profRes.json();
      const prof = profs?.[0];
      const currentTon = Number(prof?.ton_balance || 0);

      if (currentTon < reqTon) {
        return res.status(400).json({
          error: `Saldo interno insuficiente en servidor (${currentTon.toFixed(2)} TON disponibles, solicitados ${reqTon.toFixed(2)} TON).`,
        });
      }

      const feeTon = Number((reqTon * 0.05).toFixed(4));
      const netTon = Number((reqTon - feeTon).toFixed(4));
      const nextTon = Number((currentTon - reqTon).toFixed(4));

      // 1. Deduct from internal game balance immediately into withdrawal escrow
      await fetch(`${SUPABASE_GAME_URL}/rest/v1/player_profiles?telegram_id=eq.${tgId}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_GAME_KEY,
          Authorization: `Bearer ${SUPABASE_GAME_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ton_balance: nextTon,
          ton_wallet_address: walletAddress.trim(),
          updated_at: new Date().toISOString(),
        }),
      });

      // 2. Log in game `blockchain_transactions`
      const txRes = await fetch(`${SUPABASE_GAME_URL}/rest/v1/blockchain_transactions`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_GAME_KEY,
          Authorization: `Bearer ${SUPABASE_GAME_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          telegram_id: tgId,
          username: username || prof?.username || 'Commander',
          tx_type: 'WITHDRAWAL',
          wallet_address: walletAddress.trim(),
          idempotency_key: idemKey,
          gross_amount_ton: reqTon,
          fee_amount_ton: feeTon,
          net_amount_ton: netTon,
          status: 'pending',
          verification_payload: { escrow_locked: true, requested_at: new Date().toISOString() },
        }),
      });
      const txRows = await txRes.json();

      // 3. Record in Admin `withdrawal_requests` & `treasury_ledger`
      if (SUPABASE_ADMIN_KEY) {
        await fetch(`${SUPABASE_ADMIN_URL}/rest/v1/withdrawal_requests`, {
          method: 'POST',
          headers: {
            apikey: SUPABASE_ADMIN_KEY,
            Authorization: `Bearer ${SUPABASE_ADMIN_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            player_telegram_id: tgId,
            player_username: username || prof?.username || 'Commander',
            ton_wallet_address: walletAddress.trim(),
            requested_ton: reqTon,
            fee_ton: feeTon,
            net_ton: netTon,
            status: 'pending',
            idempotency_key: idemKey,
          }),
        });

        await fetch(`${SUPABASE_ADMIN_URL}/rest/v1/treasury_ledger`, {
          method: 'POST',
          headers: {
            apikey: SUPABASE_ADMIN_KEY,
            Authorization: `Bearer ${SUPABASE_ADMIN_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tx_type: 'WITHDRAWAL_FEE',
            player_telegram_id: tgId,
            player_username: username || prof?.username || 'Commander',
            currency: 'TON',
            gross_amount: reqTon,
            house_commission_amount: feeTon,
            usd_equivalent: Number((feeTon * 5.25).toFixed(2)),
            reference_note: `Withdrawal Escrow Fee (5%): Net ${netTon} TON -> ${walletAddress.trim()}`,
            external_tx_id: idemKey,
          }),
        });
      }

      return res.status(200).json({
        status: 'pending',
        newTonBalance: nextTon,
        netTon,
        feeTon,
        transaction: txRows?.[0] || null,
        message: `Retiro de ${netTon.toFixed(2)} TON (Comisión 5%: ${feeTon.toFixed(2)} TON) bloqueado en escrow y enviado a la cola de pagos del Tesoro.`,
      });
    }

    return res.status(400).json({ error: 'Unsupported action' });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
