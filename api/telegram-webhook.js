// Vercel Serverless Function: /api/telegram-webhook
// Handles @GameVelmoraBot commands (/start, /play, /wallet) AND full Telegram Stars payment lifecycle:
// createInvoiceLink -> pre_checkout_query -> answerPreCheckoutQuery -> successful_payment -> credit player_profiles & treasury_ledger

const SUPABASE_GAME_URL = process.env.VITE_SUPABASE_GAME_URL || 'https://vvvjbicveeiqvhhveuyt.supabase.co';
const SUPABASE_GAME_KEY = process.env.SUPABASE_GAME_SERVICE_ROLE_KEY || process.env.GAME_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_GAME_SUPABASE_ANON_KEY;
const SUPABASE_ADMIN_URL = process.env.VITE_SUPABASE_ADMIN_URL || 'https://fiqddlfokjkszwcbldpe.supabase.co';
const SUPABASE_ADMIN_KEY = process.env.SUPABASE_ADMIN_SERVICE_ROLE_KEY || process.env.ADMIN_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_ADMIN_SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  // Allow GET ?orderPayload=... for frontend polling of verified `paid_and_delivered` status
  if (req.method === 'GET') {
    const { orderPayload } = req.query || {};
    if (orderPayload && SUPABASE_GAME_KEY) {
      const r = await fetch(
        `${SUPABASE_GAME_URL}/rest/v1/payment_orders?order_payload=eq.${encodeURIComponent(orderPayload)}&select=*`,
        {
          headers: {
            apikey: SUPABASE_GAME_KEY,
            Authorization: `Bearer ${SUPABASE_GAME_KEY}`,
          },
        }
      );
      const rows = await r.json();
      return res.status(200).json({ order: rows?.[0] || null });
    }
    return res.status(200).json({ status: 'ok', bot: '@GameVelmoraBot', service: 'Velmora Telegram Webhook' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const appUrl = process.env.PUBLIC_WEBAPP_URL || 'https://velmora-neomonsters.vercel.app';

  try {
    const update = req.body || {};

    // 1. Handle Telegram Stars Pre-Checkout Query (Verify order exists & amount matches)
    if (update.pre_checkout_query && botToken) {
      const pq = update.pre_checkout_query;
      let ok = true;
      let errorMessage = undefined;

      if (SUPABASE_GAME_KEY) {
        const ordRes = await fetch(
          `${SUPABASE_GAME_URL}/rest/v1/payment_orders?order_payload=eq.${encodeURIComponent(pq.invoice_payload)}&select=*`,
          {
            headers: {
              apikey: SUPABASE_GAME_KEY,
              Authorization: `Bearer ${SUPABASE_GAME_KEY}`,
            },
          }
        );
        const orders = await ordRes.json();
        const order = orders?.[0];

        if (!order) {
          ok = false;
          errorMessage = 'Orden de pago no encontrada.';
        } else if (order.status === 'paid_and_delivered') {
          ok = false;
          errorMessage = 'Esta orden ya fue procesada y entregada.';
        } else if (Number(order.stars_amount) !== Number(pq.total_amount)) {
          ok = false;
          errorMessage = 'El importe de Stars no coincide con la orden.';
        } else {
          await fetch(
            `${SUPABASE_GAME_URL}/rest/v1/payment_orders?id=eq.${order.id}`,
            {
              method: 'PATCH',
              headers: {
                apikey: SUPABASE_GAME_KEY,
                Authorization: `Bearer ${SUPABASE_GAME_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ status: 'pre_checkout_approved' }),
            }
          );
        }
      }

      await fetch(`https://api.telegram.org/bot${botToken}/answerPreCheckoutQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pre_checkout_query_id: pq.id,
          ok,
          ...(errorMessage ? { error_message: errorMessage } : {}),
        }),
      });
      return res.status(200).json({ ok: true });
    }

    // 2. Handle Telegram Stars Successful Payment (Idempotent Delivery + Treasury Ledger)
    if (update.message?.successful_payment && SUPABASE_GAME_KEY) {
      const sp = update.message.successful_payment;
      const payload = sp.invoice_payload;
      const chargeId = sp.telegram_payment_charge_id;

      const ordRes = await fetch(
        `${SUPABASE_GAME_URL}/rest/v1/payment_orders?order_payload=eq.${encodeURIComponent(payload)}&select=*`,
        {
          headers: {
            apikey: SUPABASE_GAME_KEY,
            Authorization: `Bearer ${SUPABASE_GAME_KEY}`,
          },
        }
      );
      const orders = await ordRes.json();
      const order = orders?.[0];

      if (order && order.status !== 'paid_and_delivered' && Number(order.stars_amount) === Number(sp.total_amount)) {
        // Mark order paid_and_delivered first (idempotency guard)
        await fetch(`${SUPABASE_GAME_URL}/rest/v1/payment_orders?id=eq.${order.id}`, {
          method: 'PATCH',
          headers: {
            apikey: SUPABASE_GAME_KEY,
            Authorization: `Bearer ${SUPABASE_GAME_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: 'paid_and_delivered',
            telegram_payment_charge_id: chargeId,
            provider_payment_charge_id: sp.provider_payment_charge_id || '',
            paid_at: new Date().toISOString(),
          }),
        });

        // Fetch player profile and credit items
        const profRes = await fetch(
          `${SUPABASE_GAME_URL}/rest/v1/player_profiles?telegram_id=eq.${order.telegram_id}&select=*`,
          {
            headers: {
              apikey: SUPABASE_GAME_KEY,
              Authorization: `Bearer ${SUPABASE_GAME_KEY}`,
            },
          }
        );
        const profs = await profRes.json();
        const prof = profs?.[0];
        if (prof) {
          const nextInventory = { ...(prof.inventory || {}) };
          const rewardItems = order.reward_items || {};
          for (const [k, v] of Object.entries(rewardItems)) {
            nextInventory[k] = Number(nextInventory[k] || 0) + Number(v);
          }
          await fetch(`${SUPABASE_GAME_URL}/rest/v1/player_profiles?telegram_id=eq.${order.telegram_id}`, {
            method: 'PATCH',
            headers: {
              apikey: SUPABASE_GAME_KEY,
              Authorization: `Bearer ${SUPABASE_GAME_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              gold: Number(prof.gold || 0) + Number(order.reward_gold || 0),
              crystals: Number(prof.crystals || 0) + Number(order.reward_crystals || 0),
              vip_tier: order.reward_vip ? Math.max(1, Number(prof.vip_tier || 0)) : prof.vip_tier,
              inventory: nextInventory,
              updated_at: new Date().toISOString(),
            }),
          });
        }

        // Record in Admin Treasury Ledger
        if (SUPABASE_ADMIN_KEY) {
          await fetch(`${SUPABASE_ADMIN_URL}/rest/v1/treasury_ledger`, {
            method: 'POST',
            headers: {
              apikey: SUPABASE_ADMIN_KEY,
              Authorization: `Bearer ${SUPABASE_ADMIN_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              tx_type: 'STARS_PURCHASE',
              player_telegram_id: order.telegram_id,
              player_username: order.username,
              currency: 'STARS',
              gross_amount: order.stars_amount,
              house_commission_amount: order.stars_amount,
              usd_equivalent: Number((order.stars_amount * 0.02).toFixed(2)),
              reference_note: `Verified Telegram Stars Payment (${order.pack_id}) charge=${chargeId}`,
              external_tx_id: chargeId,
            }),
          });
        }
      }
      return res.status(200).json({ ok: true });
    }

    // 3. Handle Text Commands (/start, /play, /wallet)
    const msg = update.message;
    if (msg && msg.text && botToken) {
      const chatId = msg.chat.id;
      const text = msg.text.trim();
      const firstName = msg.from?.first_name || 'Domador';

      if (text.startsWith('/start')) {
        const parts = text.split(' ');
        const refParam = parts[1] || '';
        const launchUrl = refParam ? `${appUrl}?startapp=${encodeURIComponent(refParam)}` : appUrl;

        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text:
              `⚔️ *¡Bienvenido a Velmora: Neo Monsters Arena, ${firstName}!* 🐉\n\n` +
              `🔥 *6 Elementos Iniciales*: Fuego, Agua, Tierra, Rayo, Luz y Oscuridad.\n` +
              `⚡ *Batallas Tácticas 4v4 (Time Units)*: Forma tu escuadrón titular de 4 monstruos + banca.\n` +
              `🏰 *Ciudadela & Mochila 2D Pixel Art*: Construye minas, forja Orbes de Captura y evoluciona tus monstruos hasta su Etapa 3 Mítica.\n` +
              `💎 *Salas PvP Online con Apuestas TON & Oro*: Compite contra otros domadores y gana premios reales.`,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '🎮 JUGAR VELMORA 4v4 AHORA',
                    web_app: { url: launchUrl },
                  },
                ],
              ],
            },
          }),
        });
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(200).json({ ok: true, warning: String(err) });
  }
}
