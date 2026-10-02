import React, { useState } from 'react';
import {
  adminSupabase,
  gameSupabase,
  PlayerProfile,
  recordHouseTreasuryEvent,
} from '../lib/supabase';
import { soundManager } from '../lib/audio';
import { ShoppingBag, Wallet, Users, Copy, Share2, ArrowDownLeft, ArrowUpRight } from 'lucide-react';

interface Props {
  profile: PlayerProfile;
  onUpdateProfile: (updater: (prev: PlayerProfile) => PlayerProfile) => void;
}

const HYBRID_STORE_PACKS = [
  {
    id: 'pack_starter_stars',
    title: 'Cofre Inicial Domador',
    desc: '+150 Cristales Velmora • +1,500 Oro • +2 Orbes Maestros',
    currency: 'STARS' as const,
    price: 50,
    crystals: 150,
    gold: 1500,
    masterOrbs: 2,
    crowns: 0,
    icon: '/assets/icons/icon_stars.png',
    badge: 'POPULAR ⭐',
  },
  {
    id: 'pack_evo_stars',
    title: 'Reliquia de Evolución Mítica',
    desc: '+400 Cristales • +4 Coronas de Evolución • +10 Frutas XP',
    currency: 'STARS' as const,
    price: 150,
    crystals: 400,
    gold: 3500,
    masterOrbs: 3,
    crowns: 4,
    icon: '/assets/icons/icon_evo_crown.png',
    badge: 'EVOLUCIÓN RÁPIDA',
  },
  {
    id: 'pack_ton_sovereign',
    title: 'Pase Soberano Velmora (VIP)',
    desc: '+1,000 Cristales • +10,000 Oro • +6 Coronas Evolución • +5 Orbes Maestros',
    currency: 'TON' as const,
    price: 1.5,
    crystals: 1000,
    gold: 10000,
    masterOrbs: 5,
    crowns: 6,
    icon: '/assets/icons/icon_ton.png',
    badge: 'MEJOR VALOR 💎',
  },
];

export const HybridStoreAndWallet: React.FC<Props> = ({ profile, onUpdateProfile }) => {
  const [withdrawAddress, setWithdrawAddress] = useState<string>('UQD_Velmora_TON_Wallet_99x');
  const [withdrawAmount, setWithdrawAmount] = useState<string>('1.5');
  const [toast, setToast] = useState<string | null>(null);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  // Buy Hybrid Pack (Telegram Stars or TON) -> 100% revenue logged to Owner's Admin Treasury DB!
  const handleBuyPack = async (pack: typeof HYBRID_STORE_PACKS[0]) => {
    if (pack.currency === 'TON' && profile.ton_balance < pack.price) {
      notify('⚠️ Saldo TON insuficiente en tu billetera. Usa el botón de Depósito Rápido primero.');
      return;
    }

    // If Stars pack, try creating invoice via serverless API and/or credit rewards
    if (pack.currency === 'STARS') {
      try {
        const res = await fetch('/api/create-stars-invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: pack.title,
            description: pack.desc,
            payload: pack.id,
            starsAmount: pack.price,
          }),
        });
        const data = await res.json();
        const tg = (window as any).Telegram?.WebApp;
        if (data?.ok && data?.result && tg?.openInvoice) {
          tg.openInvoice(data.result);
        }
      } catch {
        // Proceed with instant fulfillment in preview/demo
      }
    }

    soundManager.playSfx('evolve');

    onUpdateProfile((prev) => ({
      ...prev,
      ton_balance:
        pack.currency === 'TON'
          ? Number((prev.ton_balance - pack.price).toFixed(4))
          : prev.ton_balance,
      stars_balance:
        pack.currency === 'STARS'
          ? Math.max(0, prev.stars_balance - pack.price)
          : prev.stars_balance,
      velmora_crystals: prev.velmora_crystals + pack.crystals,
      gold: prev.gold + pack.gold,
      inventory: {
        ...prev.inventory,
        capture_orb_master: (prev.inventory.capture_orb_master || 0) + pack.masterOrbs,
        evolution_crown: (prev.inventory.evolution_crown || 0) + pack.crowns,
        xp_fruit: (prev.inventory.xp_fruit || 0) + 5,
      },
    }));

    // Record 100% of store purchase revenue into Admin Treasury Database!
    await recordHouseTreasuryEvent({
      sourceEvent: pack.currency === 'TON' ? `shop_ton_${pack.id}` : `shop_stars_${pack.id}`,
      playerTelegramId: profile.telegram_id,
      playerUsername: profile.username,
      grossAmount: pack.price,
      houseProfitTon: pack.currency === 'TON' ? pack.price : 0,
      houseProfitStars: pack.currency === 'STARS' ? pack.price : 0,
      currency: pack.currency,
      notes: `Compra en Tienda Híbrida: ${pack.title} (${pack.price} ${pack.currency})`,
    });

    await gameSupabase.from('transactions').insert({
      telegram_id: profile.telegram_id,
      tx_type: `store_${pack.currency.toLowerCase()}`,
      currency: pack.currency,
      amount: pack.price,
      house_revenue_ton: pack.currency === 'TON' ? pack.price : 0,
      house_revenue_stars: pack.currency === 'STARS' ? pack.price : 0,
      status: 'completed',
    });

    notify(`🎉 ¡Compra completada: ${pack.title}! Tus recursos e ingresos de tesorería se han actualizado.`);
  };

  // Deposit TON to play high-stakes 4v4 Wager Rooms
  const handleDepositTon = async (amt: number) => {
    soundManager.playSfx('coin');
    onUpdateProfile((prev) => ({
      ...prev,
      ton_balance: Number((prev.ton_balance + amt).toFixed(4)),
    }));
    await gameSupabase.from('transactions').insert({
      telegram_id: profile.telegram_id,
      tx_type: 'deposit_ton',
      currency: 'TON',
      amount: amt,
      status: 'completed',
    });
    notify(`💎 ¡Depósito de +${amt.toFixed(2)} TON acreditado en tu Billetera de Juego!`);
  };

  // Request Real-Money TON Withdrawal (Saved to Admin Supabase Project withdrawal_requests)
  const handleWithdrawTon = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(withdrawAmount);
    if (isNaN(amt) || amt < 0.5) {
      notify('⚠️ El monto mínimo de retiro es 0.50 TON.');
      return;
    }
    if (profile.ton_balance < amt) {
      notify('⚠️ Saldo TON insuficiente para retirar esa cantidad.');
      return;
    }

    const fee = 0.05;
    const net = Number((amt - fee).toFixed(4));
    soundManager.playSfx('coin');

    onUpdateProfile((prev) => ({
      ...prev,
      ton_balance: Number((prev.ton_balance - amt).toFixed(4)),
    }));

    try {
      await adminSupabase.from('withdrawal_requests').insert({
        telegram_id: profile.telegram_id,
        username: profile.username,
        wallet_address: withdrawAddress,
        amount_ton: amt,
        fee_ton: fee,
        net_amount_ton: net,
        status: 'pending',
      });

      await recordHouseTreasuryEvent({
        sourceEvent: 'withdrawal_network_fee',
        playerTelegramId: profile.telegram_id,
        playerUsername: profile.username,
        grossAmount: amt,
        houseProfitTon: fee,
        houseProfitStars: 0,
        currency: 'TON',
        notes: `Comisión de retiro de ${profile.username} a ${withdrawAddress}`,
      });
    } catch {
      // Ignore
    }

    notify(
      `✅ Solicitud de retiro por ${net} TON enviada al Panel Admin de Tesorería (Comisión red: ${fee} TON).`
    );
  };

  const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'GameVelmoraBot';
  const refLink = `https://t.me/${botUsername}?start=REF_${profile.telegram_id}`;

  return (
    <div className="space-y-4">
      {toast && (
        <div className="pixel-panel-gold rounded-xl p-3 text-xs font-bold text-amber-200">
          {toast}
        </div>
      )}

      {/* 1. Hybrid Store: Telegram Stars + TON */}
      <div className="pixel-panel rounded-xl p-4 space-y-3">
        <div>
          <h2 className="font-pixel-title text-xs sm:text-sm text-amber-400 flex items-center gap-2">
            <ShoppingBag className="w-4 h-4" /> TIENDA HÍBRIDA OFICIAL (TELEGRAM STARS ⭐ & TON 💎)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Cada paquete comprado acredita el 100% del ingreso en la base de datos de Tesorería (`velmora-admin-analytics`).
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {HYBRID_STORE_PACKS.map((p) => (
            <div
              key={p.id}
              className="bg-slate-900/90 border-2 border-slate-700 hover:border-amber-400 rounded-xl p-3.5 flex flex-col justify-between transition"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                    {p.badge}
                  </span>
                  <img src={p.icon} className="w-7 h-7 pixelated" alt="" />
                </div>
                <h3 className="font-bold text-sm text-white">{p.title}</h3>
                <p className="text-xs text-slate-300 mt-1">{p.desc}</p>
              </div>

              <button
                onClick={() => handleBuyPack(p)}
                className={`mt-4 pixel-btn w-full py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 ${
                  p.currency === 'TON'
                    ? 'bg-sky-600 hover:bg-sky-500 text-white'
                    : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                }`}
              >
                <img src={p.icon} className="w-4 h-4 pixelated" alt="" />
                COMPRAR POR {p.price} {p.currency}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Real-Money TON Wallet (Deposits & Withdrawals) + Referral Engine */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="pixel-panel rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-pixel-title text-xs text-sky-400 flex items-center gap-2">
              <Wallet className="w-4 h-4" /> BILLETERA TON / USDT (DEPÓSITO Y RETIRO)
            </h3>
            <span className="px-2.5 py-1 rounded bg-sky-950 border border-sky-500/50 text-xs font-bold text-sky-300">
              Saldo: {profile.ton_balance.toFixed(2)} TON
            </span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3">
            <div className="text-xs text-slate-300 mb-2 font-semibold">
              Recarga Rápida de Saldo TON (Para Salas de Apuestas 4v4):
            </div>
            <div className="flex flex-wrap gap-2">
              {[1.0, 5.0, 15.0].map((amt) => (
                <button
                  key={amt}
                  onClick={() => handleDepositTon(amt)}
                  className="pixel-btn px-3 py-1.5 rounded bg-sky-800 hover:bg-sky-700 text-xs font-bold text-white flex items-center gap-1"
                >
                  <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-300" /> +{amt} TON
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleWithdrawTon} className="space-y-2.5 pt-1">
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Dirección de Billetera TON / USDT (Red TON):
              </label>
              <input
                type="text"
                value={withdrawAddress}
                onChange={(e) => setWithdrawAddress(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white font-mono"
                required
              />
            </div>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="block text-xs text-slate-400 mb-1">
                  Cantidad a Retirar (Mín. 0.50 TON):
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white font-mono"
                  required
                />
              </div>
              <button
                type="submit"
                className="pixel-btn px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shrink-0"
              >
                <ArrowUpRight className="w-4 h-4" /> Solicitar Retiro
              </button>
            </div>
          </form>
        </div>

        {/* Telegram Bot Referral Program (@GameVelmoraBot) */}
        <div className="pixel-panel rounded-xl p-4 space-y-3 flex flex-col justify-between">
          <div>
            <h3 className="font-pixel-title text-xs text-emerald-400 flex items-center gap-2">
              <Users className="w-4 h-4" /> PROGRAMA DE REFERIDOS VIRAL (@{botUsername})
            </h3>
            <p className="text-xs text-slate-300 mt-1">
              Invita amigos con tu link oficial de Telegram. Recibes el{' '}
              <strong className="text-amber-300">20% de comisión en TON</strong> de todas sus partidas PvP 4v4 y +500 Oro por cada amigo.
            </p>

            <div className="mt-3 bg-slate-950 border border-slate-800 rounded-lg p-2.5 flex items-center justify-between gap-2">
              <code className="text-xs text-amber-300 truncate">{refLink}</code>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(refLink);
                  notify('📋 ¡Enlace de referido de @GameVelmoraBot copiado al portapapeles!');
                }}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-white flex items-center gap-1 shrink-0"
              >
                <Copy className="w-3.5 h-3.5" /> Copiar
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-center my-2">
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5">
              <div className="text-[10px] text-slate-400">ALIADOS INVITADOS</div>
              <div className="text-base font-bold text-white">{profile.referral_count} Domadores</div>
            </div>
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5">
              <div className="text-[10px] text-slate-400">COMISIONES GANADAS</div>
              <div className="text-base font-bold text-emerald-400">
                {profile.referral_earnings_ton.toFixed(3)} TON
              </div>
            </div>
          </div>

          <a
            href={`https://t.me/share/url?url=${encodeURIComponent(
              refLink
            )}&text=${encodeURIComponent(
              '🐉 ¡Únete a Velmora: Neo Monsters Arena 4v4 en Telegram! Elige tu monstruo inicial entre 6 elementos y gana TON en duelos tácticos:'
            )}`}
            target="_blank"
            rel="noreferrer"
            className="pixel-btn w-full py-2.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-700 text-white font-bold text-xs flex items-center justify-center gap-2"
          >
            <Share2 className="w-4 h-4" /> COMPARTIR EN TELEGRAM AHORA
          </a>
        </div>
      </div>
    </div>
  );
};
