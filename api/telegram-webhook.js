// Vercel Serverless Function: Telegram Bot Webhook for @GameVelmoraBot
export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      bot: '@GameVelmoraBot',
      service: 'Velmora: Neo Monsters Arena 4v4 Webhook Active',
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const appUrl = process.env.PUBLIC_APP_URL || `https://${req.headers.host}`;
  const update = req.body || {};

  try {
    // 1. Handle Telegram Stars Pre-Checkout Query
    if (update.pre_checkout_query && token) {
      await fetch(`https://api.telegram.org/bot${token}/answerPreCheckoutQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pre_checkout_query_id: update.pre_checkout_query.id,
          ok: true,
        }),
      });
      return res.status(200).json({ ok: true });
    }

    // 2. Handle Commands (/start, /jugar, /arena, /referidos)
    if (update.message && update.message.chat && token) {
      const chatId = update.message.chat.id;
      const text = (update.message.text || '').trim();
      const firstName = update.message.from?.first_name || 'Domador';
      const userId = update.message.from?.id || '';

      let refParam = '';
      if (text.startsWith('/start ')) {
        refParam = text.split(' ')[1] || '';
      }

      const launchUrl = refParam ? `${appUrl}?ref=${encodeURIComponent(refParam)}` : appUrl;
      const myRefLink = `https://t.me/GameVelmoraBot?start=REF_${userId}`;

      const welcomeMsg =
        `⚔️ *¡Bienvenido a VELMORA: NEO MONSTERS ARENA 4v4, ${firstName}!* 🐉\n\n` +
        `🔥💧🌿⚡✨🌑 *6 Elementos • 18 Evoluciones Pixel Art 2D • Duelos 4v4 por Unidad de Tiempo (TU)*\n\n` +
        `🏆 *Gana Dinero Real (TON / USDT):*\n` +
        `• Elige tu monstruo inicial entre los *6 Elementos*.\n` +
        `• Gestiona tu *Ciudadela* (Mina de Oro, Reactor de Esencia, Santuario y Forja).\n` +
        `• Evoluciona a tu equipo de *Etapa 1 ➔ Etapa 2 ➔ Etapa 3 Mítico*.\n` +
        `• Compite en la *Arena PvP 4v4 con Apuestas en TON* y llévate el bote.\n\n` +
        `🎁 *Tu enlace de referido (Gana 20% de comisión):*\n\`${myRefLink}\``;

      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: welcomeMsg,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '🎮 JUGAR VELMORA 4v4 ARENA',
                  web_app: { url: launchUrl },
                },
              ],
              [
                {
                  text: '🤝 Compartir con Amigos (+20% TON)',
                  url: `https://t.me/share/url?url=${encodeURIComponent(myRefLink)}&text=${encodeURIComponent('¡Únete a Velmora: Neo Monsters 4v4 en Telegram y compite por premios reales en TON!')}`,
                },
              ],
            ],
          },
        }),
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(200).json({ ok: true, warning: String(err) });
  }
}
