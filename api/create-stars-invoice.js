// Vercel Serverless Function: /api/create-stars-invoice
// Creates a verified order in Supabase `payment_orders` BEFORE generating a Telegram Stars (XTR) invoice link.

const SUPABASE_GAME_URL = process.env.VITE_SUPABASE_GAME_URL || 'https://vvvjbicveeiqvhhveuyt.supabase.co';
const SUPABASE_GAME_SERVICE_KEY = process.env.SUPABASE_GAME_SERVICE_ROLE_KEY || process.env.GAME_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_GAME_SUPABASE_ANON_KEY;

const OFFICIAL_STARS_PACKS = {
  stars_starter: {
    title: 'Pack Domador Inicial',
    description: '2,500 Oro + 150 Cristales + 5 Orbes + 1 Corona Real',
    starsAmount: 50,
    rewardGold: 2500,
    rewardCrystals: 150,
    rewardItems: { capture_basic: 5, evo_crown: 1 },
    rewardVip: false,
  },
  stars_vip_pass: {
    title: 'Pase VIP Soberano',
    description: '+25% Producción Ciudadela + 5,000 Oro + 400 Cristales + 2 Orbes Maestros',
    starsAmount: 150,
    rewardGold: 5000,
    rewardCrystals: 400,
    rewardItems: { capture_master: 2, xp_fruit: 10 },
    rewardVip: true,
  },
  stars_mythic_chest: {
    title: 'Cofre de Evolución Mítica',
    description: '12,000 Oro + 1,000 Cristales + 3 Coronas Reales + 10 Esencias',
    starsAmount: 350,
    rewardGold: 12000,
    rewardCrystals: 1000,
    rewardItems: {
      evo_crown: 3,
      elem_fire: 10,
      elem_water: 10,
      elem_earth: 10,
      elem_storm: 10,
      elem_light: 10,
      elem_shadow: 10,
    },
    rewardVip: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return res.status(500).json({ error: 'Missing TELEGRAM_BOT_TOKEN' });
  }

  try {
    const { packId, telegramId, username } = req.body || {};
    const pack = OFFICIAL_STARS_PACKS[packId];
    if (!pack) {
      return res.status(400).json({ error: 'Invalid packId' });
    }

    const orderPayload = `stars_${packId}_${telegramId || 0}_${Date.now()}`;

    // 1. Persist pending order in Supabase `payment_orders` BEFORE creating invoice
    if (SUPABASE_GAME_SERVICE_KEY) {
      await fetch(`${SUPABASE_GAME_URL}/rest/v1/payment_orders`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_GAME_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_GAME_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          order_payload: orderPayload,
          telegram_id: Number(telegramId) || 99001122,
          username: username || 'Commander',
          pack_id: packId,
          stars_amount: pack.starsAmount,
          reward_gold: pack.rewardGold,
          reward_crystals: pack.rewardCrystals,
          reward_items: pack.rewardItems,
          reward_vip: pack.rewardVip,
          status: 'created',
        }),
      });
    }

    // 2. Request official XTR invoice link from Telegram Bot API
    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/createInvoiceLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: pack.title,
        description: pack.description,
        payload: orderPayload,
        provider_token: '', // Empty for Telegram Stars (XTR)
        currency: 'XTR',
        prices: [{ label: pack.title, amount: Number(pack.starsAmount) }],
      }),
    });

    const data = await tgRes.json();
    if (!data.ok) {
      return res.status(400).json({ error: data.description || 'Failed to create invoice link' });
    }

    return res.status(200).json({
      invoiceLink: data.result,
      orderPayload,
      status: 'created',
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
