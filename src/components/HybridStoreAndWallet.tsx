import React, { useEffect, useState } from 'react';
import { recordTreasuryRevenue } from '../lib/supabase';
import { soundManager } from '../lib/audio';

interface StorePack {
  id: string;
  title: string;
  subtitle: string;
  currency: 'STARS' | 'TON';
  price: number;
  goldBonus: number;
  crystalBonus: number;
  itemRewards: Record<string, number>;
  vipUnlock?: boolean;
  badge: string;
}

const STORE_PACKS: StorePack[] = [
  {
    id: 'stars_starter',
    title: 'Pack Domador Inicial',
    subtitle: '2,500 Oro + 150 Cristales + 5 Orbes + 1 Corona Real',
    currency: 'STARS',
    price: 50,
    goldBonus: 2500,
    crystalBonus: 150,
    itemRewards: { capture_basic: 5, evo_crown: 1 },
    badge: 'MÁS VENDIDO ⭐',
  },
  {
    id: 'stars_vip_pass',
    title: 'Pase VIP Soberano',
    subtitle: '+25% Producción Ciudadela + 5,000 Oro + 400 Cristales + 2 Orbes Maestros',
    currency: 'STARS',
    price: 150,
    goldBonus: 5000,
    crystalBonus: 400,
    itemRewards: { capture_master: 2, xp_fruit: 10 },
    vipUnlock: true,
    badge: 'VIP MENSUAL 👑',
  },
  {
    id: 'stars_mythic_chest',
    title: 'Cofre de Evolución Mítica',
    subtitle: '12,000 Oro + 1,000 Cristales + 3 Coronas Reales + 10 Esencias de cada Elemento',
    currency: 'STARS',
    price: 350,
    goldBonus: 12000,
    crystalBonus: 1000,
    itemRewards: {
      evo_crown: 3,
      elem_fire: 10,
      elem_water: 10,
      elem_earth: 10,
      elem_storm: 10,
      elem_light: 10,
      elem_shadow: 10,
    },
    badge: 'OFERTA ÉPICA 🔥',
  },
  {
    id: 'ton_arena_chest',
    title: 'Bóveda de Liquidez TON',
    subtitle: '8,000 Oro + 600 Cristales + 2 Orbes Maestros (Pago con Saldo Interno TON)',
    currency: 'TON',
    price: 1.5,
    goldBonus: 8000,
    crystalBonus: 600,
    itemRewards: { capture_master: 2, evo_crown: 2 },
    badge: 'WEB3 TON 💎',
  },
];

interface HybridStoreProps {
  telegramId: number;
  username: string;
  gold: number;
  crystals: number;
  tonBalance: number;
  vipTier: number;
  onPurchaseSuccess: (
    goldDelta: number,
    crystalDelta: number,
    tonDelta: number,
    itemDeltas: Record<string, number>,
    unlockVip?: boolean
  ) => void;
}

export const HybridStoreAndWallet: React.FC<HybridStoreProps> = ({
  telegramId,
  username,
  tonBalance,
  vipTier,
  onPurchaseSuccess,
}) => {
  const [walletAddress, setWalletAddress] = useState('UQDr9_VelmoraCommanderWallet889900112233445566');
  const [depositAmount, setDepositAmount] = useState('2.0');
  const [depositTxHash, setDepositTxHash] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('1.0');
  const [treasuryWallet, setTreasuryWallet] = useState('UQVelmoraTreasuryMasterVault99887766554433221100');
  const [txHistory, setTxHistory] = useState<any[]>([]);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const referralLink = `https://t.me/GameVelmoraBot?start=ref_${telegramId}`;

  const fetchBlockchainHistory = async () => {
    try {
      const r = await fetch(`/api/ton-wallet?telegramId=${telegramId}`);
      const d = await r.json();
      if (d.treasuryWallet) setTreasuryWallet(d.treasuryWallet);
      if (Array.isArray(d.transactions)) setTxHistory(d.transactions);
    } catch {
      // Ignore offline preview error
    }
  };

  useEffect(() => {
    fetchBlockchainHistory();
  }, [telegramId]);

  const handleBuyPack = async (pack: StorePack) => {
    setLoadingId(pack.id);
    setStatusMsg(null);

    try {
      if (pack.currency === 'STARS') {
        // 1. Create order in Supabase `payment_orders` + generate XTR invoice link
        const resp = await fetch('/api/create-stars-invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            packId: pack.id,
            telegramId,
            username,
          }),
        });
        const data = await resp.json();

        const tgWebApp = (window as any)?.Telegram?.WebApp;
        if (data?.invoiceLink && tgWebApp?.openInvoice) {
          tgWebApp.openInvoice(data.invoiceLink, async (status: string) => {
            if (status === 'paid') {
              // Verify backend webhook processed `successful_payment` before syncing UI!
              const verifyRes = await fetch(
                `/api/telegram-webhook?orderPayload=${encodeURIComponent(data.orderPayload)}`
              );
              const verifyData = await verifyRes.json();
              if (verifyData?.order?.status === 'paid_and_delivered') {
                soundManager.playSfx('evolve');
                onPurchaseSuccess(
                  pack.goldBonus,
                  pack.crystalBonus,
                  0,
                  pack.itemRewards,
                  pack.vipUnlock
                );
                setStatusMsg(
                  `✅ ¡Pago verificado por Webhook (successful_payment)! Recibiste ${pack.title}.`
                );
              } else {
                setStatusMsg(
                  `⏳ Pago enviado. Esperando confirmación final del webhook successful_payment (Orden: ${data.orderPayload}).`
                );
              }
            } else {
              setStatusMsg('⚠️ Pago con Telegram Stars cancelado por el usuario.');
            }
          });
        } else if (data?.invoiceLink) {
          window.open(data.invoiceLink, '_blank');
          setStatusMsg(
            `🔗 Factura oficial XTR generada (${data.orderPayload}). Ábrela en Telegram (@GameVelmoraBot): los ítems se acreditarán automáticamente cuando el servidor reciba y valide 'successful_payment'.`
          );
        } else {
          setStatusMsg(`⚠️ Error al crear factura Stars: ${data?.error || 'Desconocido'}`);
        }
      } else {
        // Purchase with Verified Internal TON Balance
        if (tonBalance < pack.price) {
          setStatusMsg(
            `⚠️ Necesitas ${pack.price} TON en tu Balance Interno Verificado para comprar ${pack.title}.`
          );
          setLoadingId(null);
          return;
        }
        soundManager.playSfx('evolve');
        onPurchaseSuccess(
          pack.goldBonus,
          pack.crystalBonus,
          -pack.price,
          pack.itemRewards,
          pack.vipUnlock
        );
        await recordTreasuryRevenue({
          tx_type: 'TON_PURCHASE',
          player_telegram_id: telegramId,
          player_username: username,
          currency: 'TON',
          gross_amount: pack.price,
          house_commission_amount: pack.price,
          usd_equivalent: Number((pack.price * 5.25).toFixed(2)),
          reference_note: `Compra Tienda TON (Saldo Interno): ${pack.title}`,
        });
        setStatusMsg(`💎 ¡Compra completada con Saldo Interno TON! Has recibido ${pack.title}.`);
      }
    } catch (e) {
      setStatusMsg(`⚠️ Error de red: ${String(e)}`);
    } finally {
      setLoadingId(null);
    }
  };

  const handleBindWallet = async () => {
    try {
      const r = await fetch('/api/ton-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bind_wallet',
          telegramId,
          username,
          walletAddress,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setStatusMsg(`⚠️ ${d.error}`);
      } else {
        soundManager.playSfx('coin');
        setStatusMsg(`✅ Billetera TON externa vinculada en servidor: ${d.walletAddress}`);
      }
    } catch (e) {
      setStatusMsg(`⚠️ Error al vincular billetera: ${String(e)}`);
    }
  };

  const handleVerifyTonDeposit = async () => {
    const amt = parseFloat(depositAmount);
    if (isNaN(amt) || amt < 0.2) {
      setStatusMsg('⚠️ El depósito mínimo a verificar es de 0.20 TON.');
      return;
    }
    if (!depositTxHash || depositTxHash.trim().length < 16) {
      setStatusMsg(
        '⚠️ Ingresa el Hash (TxHash / BOC) real de tu transferencia en la red TON para verificarla en el servidor.'
      );
      return;
    }

    setLoadingId('verify_deposit');
    try {
      const r = await fetch('/api/ton-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify_deposit',
          telegramId,
          username,
          walletAddress,
          txHash: depositTxHash.trim(),
          amountTon: amt,
          idempotencyKey: `dep_${telegramId}_${depositTxHash.trim()}`,
        }),
      });
      const d = await r.json();
      await fetchBlockchainHistory();

      if (!r.ok) {
        setStatusMsg(`⚠️ ${d.error}`);
      } else if (d.credited) {
        soundManager.playSfx('coin');
        onPurchaseSuccess(0, 0, amt, {});
        setStatusMsg(`✅ ${d.message}`);
      } else {
        setStatusMsg(`⏳ ${d.message}`);
      }
    } catch (e) {
      setStatusMsg(`⚠️ Error verificando depósito: ${String(e)}`);
    } finally {
      setLoadingId(null);
    }
  };

  const handleWithdrawTon = async () => {
    const amt = parseFloat(withdrawAmount);
    if (isNaN(amt) || amt < 1.0) {
      setStatusMsg('⚠️ El retiro mínimo es de 1.00 TON.');
      return;
    }
    if (tonBalance < amt) {
      setStatusMsg('⚠️ No tienes suficiente saldo TON interno verificado.');
      return;
    }

    setLoadingId('withdraw_ton');
    try {
      const r = await fetch('/api/ton-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'request_withdrawal',
          telegramId,
          username,
          walletAddress,
          amountTon: amt,
          idempotencyKey: `wd_${telegramId}_${Date.now()}`,
        }),
      });
      const d = await r.json();
      await fetchBlockchainHistory();

      if (!r.ok) {
        setStatusMsg(`⚠️ ${d.error}`);
      } else {
        soundManager.playSfx('coin');
        onPurchaseSuccess(0, 0, -amt, {});
        setStatusMsg(`✅ ${d.message}`);
      }
    } catch (e) {
      setStatusMsg(`⚠️ Error procesando retiro: ${String(e)}`);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {statusMsg && (
        <div className="pixel-panel p-3 border-emerald-400 bg-emerald-950/40 text-emerald-200 text-xs font-bold flex items-center justify-between">
          <span>{statusMsg}</span>
          <button onClick={() => setStatusMsg(null)} className="underline ml-2">
            OK
          </button>
        </div>
      )}

      {/* Store Packs Grid */}
      <div className="pixel-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="font-pixel text-sm sm:text-base text-amber-300">
              🛒 TIENDA HÍBRIDA OFICIAL (TELEGRAM STARS ⭐ & TON 💎)
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              Los pagos con Telegram Stars pasan por validación completa de Webhook (`createInvoiceLink` ➔ `pre_checkout_query` ➔ `successful_payment`).
            </p>
          </div>
          <div className="px-3 py-1.5 rounded bg-slate-900 border border-amber-500/50 text-xs font-pixel text-amber-300">
            ESTADO VIP: {vipTier > 0 ? '👑 SOBERANO ACTIVO (+25%)' : 'ESTÁNDAR'}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {STORE_PACKS.map((pack) => (
            <div
              key={pack.id}
              className="bg-slate-900/90 border-2 border-slate-700 hover:border-amber-400 rounded p-3.5 flex flex-col justify-between transition"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 text-amber-300 font-pixel text-[9px]">
                    {pack.badge}
                  </span>
                  <div className="flex items-center gap-1 font-pixel text-xs text-white">
                    <img
                      src={
                        pack.currency === 'STARS'
                          ? '/assets/icons/icon_stars.png'
                          : '/assets/icons/icon_ton.png'
                      }
                      alt={pack.currency}
                      className="w-5 h-5 pixel-art"
                    />
                    {pack.price} {pack.currency}
                  </div>
                </div>
                <h3 className="font-pixel text-xs sm:text-sm text-white">{pack.title}</h3>
                <p className="text-xs text-slate-300 mt-1">{pack.subtitle}</p>
              </div>

              <button
                onClick={() => handleBuyPack(pack)}
                disabled={loadingId === pack.id}
                className={`pixel-btn w-full py-2.5 mt-3 text-[10px] flex items-center justify-center gap-2 ${
                  pack.currency === 'STARS' ? 'pixel-btn-gold' : 'pixel-btn-blue'
                }`}
              >
                <img
                  src={
                    pack.currency === 'STARS'
                      ? '/assets/icons/icon_stars.png'
                      : '/assets/icons/icon_ton.png'
                  }
                  alt="Buy"
                  className="w-4 h-4 pixel-art"
                />
                {loadingId === pack.id
                  ? 'CREANDO ORDEN SEGURA...'
                  : `COMPRAR CON ${pack.price} ${pack.currency}`}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* TON Web3 Wallet Verification + Referral Center */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Verified TON Wallet Deposit & Withdrawal */}
        <div className="pixel-panel p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src="/assets/icons/icon_ton.png" alt="TON" className="w-8 h-8 pixel-art" />
              <div>
                <h3 className="font-pixel text-xs text-sky-300">
                  BÓVEDA TON (VERIFICACIÓN ON-CHAIN & ESCROW)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Separación estricta entre Saldo Interno del Juego y Blockchain TON
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[9px] font-pixel text-slate-400">SALDO INTERNO VERIFICADO</div>
              <div className="font-pixel text-sm text-sky-300">{tonBalance.toFixed(2)} TON</div>
            </div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded p-2.5 text-[11px] text-slate-300">
            <div>
              <span className="text-slate-400">Bóveda Tesorería Destino:</span>{' '}
              <span className="font-mono text-amber-300 break-all">{treasuryWallet}</span>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-pixel text-slate-400 mb-1">
              TU DIRECCIÓN DE BILLETERA EXTERNA TON (UQ... / EQ...):
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white font-mono"
              />
              <button
                onClick={handleBindWallet}
                className="pixel-btn pixel-btn-slate px-3 py-1.5 text-[9px] shrink-0"
              >
                VINCULAR
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="bg-slate-900/90 p-2.5 rounded border border-slate-800 space-y-1.5">
              <div className="text-[10px] font-pixel text-emerald-400">
                VERIFICAR DEPÓSITO ON-CHAIN
              </div>
              <input
                type="number"
                step="0.5"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="Monto TON"
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white"
              />
              <input
                type="text"
                value={depositTxHash}
                onChange={(e) => setDepositTxHash(e.target.value)}
                placeholder="Pega TxHash / BOC de la red TON..."
                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[11px] text-amber-200 font-mono"
              />
              <button
                onClick={handleVerifyTonDeposit}
                disabled={loadingId === 'verify_deposit'}
                className="pixel-btn pixel-btn-green w-full py-2 text-[9px]"
              >
                {loadingId === 'verify_deposit' ? 'VERIFICANDO...' : '🔍 VERIFICAR HASH EN SERVIDOR'}
              </button>
            </div>

            <div className="bg-slate-900/90 p-2.5 rounded border border-slate-800 flex flex-col justify-between space-y-1.5">
              <div>
                <div className="text-[10px] font-pixel text-amber-300">
                  SOLICITAR RETIRO (5% FEE)
                </div>
                <input
                  type="number"
                  step="0.5"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white mt-1.5"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  El monto se descuenta en escrow y pasa a revisión del Tesoro.
                </p>
              </div>
              <button
                onClick={handleWithdrawTon}
                disabled={loadingId === 'withdraw_ton'}
                className="pixel-btn pixel-btn-gold w-full py-2 text-[9px]"
              >
                {loadingId === 'withdraw_ton' ? 'PROCESANDO...' : '📤 SOLICITAR RETIRO EN ESCROW'}
              </button>
            </div>
          </div>

          {/* Blockchain Transactions Log */}
          <div className="pt-2 border-t border-slate-800">
            <div className="text-[10px] font-pixel text-slate-400 mb-1.5">
              HISTORIAL DE TRANSACCIONES (`blockchain_transactions` — IDEMPOTENTE):
            </div>
            {txHistory.length === 0 ? (
              <div className="text-[11px] text-slate-500">
                Sin transacciones registradas todavía.
              </div>
            ) : (
              <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                {txHistory.map((tx) => (
                  <div
                    key={tx.id}
                    className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[10px] flex items-center justify-between"
                  >
                    <div>
                      <span className="font-bold text-white">{tx.tx_type}</span>{' '}
                      <span className="text-sky-300">{tx.gross_amount_ton} TON</span>
                      {tx.tx_hash && (
                        <span className="text-slate-500 font-mono ml-1">
                          ({String(tx.tx_hash).slice(0, 10)}...)
                        </span>
                      )}
                    </div>
                    <span
                      className={`px-1.5 py-0.5 rounded font-pixel text-[8px] ${
                        tx.status === 'confirmed'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                          : tx.status === 'pending'
                          ? 'bg-amber-950 text-amber-300 border border-amber-500/40'
                          : 'bg-rose-950 text-rose-300 border border-rose-500/40'
                      }`}
                    >
                      {String(tx.status).toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Telegram Viral Referral Program */}
        <div className="pixel-panel p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <img src="/assets/icons/icon_gold.png" alt="Ref" className="w-8 h-8 pixel-art" />
              <div>
                <h3 className="font-pixel text-xs text-amber-300">
                  PROGRAMA DE EMBAJADORES & REFERIDOS (@GameVelmoraBot)
                </h3>
                <p className="text-xs text-slate-400">
                  Gana el 15% de comisión en Oro y TON por las compras de tus invitados
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 mb-3">
              Comparte tu enlace oficial de comandante en grupos de Telegram. Cada amigo que inicie el juego con tu link recibe <strong>+500 Oro</strong> y tú recibes recompensas vitalicias.
            </p>

            <div className="bg-slate-950 border border-slate-700 rounded p-2.5 text-xs font-mono text-sky-300 break-all mb-3">
              {referralLink}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(referralLink);
                setStatusMsg('📋 ¡Enlace de referido copiado al portapapeles!');
              }}
              className="pixel-btn pixel-btn-blue flex-1 py-2.5 text-[10px]"
            >
              📋 COPIAR LINK DE INVITACIÓN
            </button>
            <a
              href={`https://t.me/share/url?url=${encodeURIComponent(
                referralLink
              )}&text=${encodeURIComponent(
                '🐉 ¡Únete a mi escuadrón 4v4 en Velmora: Neo Monsters Arena y gana TON y Oro!'
              )}`}
              target="_blank"
              rel="noreferrer"
              className="pixel-btn pixel-btn-gold px-4 py-2.5 text-[10px] flex items-center"
            >
              🚀 COMPARTIR EN TELEGRAM
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
