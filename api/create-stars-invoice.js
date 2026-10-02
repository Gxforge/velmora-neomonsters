// Vercel Serverless Function: Generate Telegram Stars (XTR) Invoice Link
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const { title, description, payload, starsAmount } = req.body || {};

  if (!token) {
    return res.status(200).json({
      ok: false,
      simulated: true,
      message: 'Telegram Bot Token not set in environment; using instant WebApp checkout.',
    });
  }

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${token}/createInvoiceLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title || 'Paquete Velmora',
        description: description || 'Cristales y Recursos para Velmora: Neo Monsters 4v4',
        payload: payload || 'velmora_pack_1',
        provider_token: '', // Empty string required for Telegram Stars (XTR)
        currency: 'XTR',
        prices: [{ label: title || 'Paquete Velmora', amount: Number(starsAmount || 50) }],
      }),
    });
    const data = await tgRes.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(200).json({ ok: false, error: String(err) });
  }
}
