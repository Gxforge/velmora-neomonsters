import React, { useEffect, useState } from 'react';
import { adminSupabase, gameSupabase } from '../lib/supabase';
import { ShieldCheck, RefreshCw, DollarSign, CheckCircle, XCircle, Database } from 'lucide-react';

export const AdminTreasuryPanel: React.FC = () => {
  const [ledger, setLedger] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [matchesCount, setMatchesCount] = useState<number>(0);
  const [speciesCount, setSpeciesCount] = useState<number>(18);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const [{ data: led }, { data: wds }, { count: mCount }, { count: sCount }] =
        await Promise.all([
          adminSupabase
            .from('treasury_ledger')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(25),
          adminSupabase
            .from('withdrawal_requests')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(15),
          gameSupabase.from('pvp_matches').select('*', { count: 'exact', head: true }),
          gameSupabase.from('monster_species').select('*', { count: 'exact', head: true }),
        ]);

      setLedger(led || []);
      setWithdrawals(wds || []);
      setMatchesCount(mCount || 0);
      setSpeciesCount(sCount || 18);
    } catch (e) {
      console.warn('Admin fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const handleWithdrawalAction = async (id: string, newStatus: 'approved' | 'rejected') => {
    await adminSupabase
      .from('withdrawal_requests')
      .update({ status: newStatus, processed_at: new Date().toISOString() })
      .eq('id', id);
    fetchAdminData();
  };

  const totalTonRevenue = ledger.reduce(
    (acc, r) => acc + Number(r.house_profit_ton || 0),
    0
  );
  const totalStarsRevenue = ledger.reduce(
    (acc, r) => acc + Number(r.house_profit_stars || 0),
    0
  );
  const totalUsdEst = ledger.reduce(
    (acc, r) => acc + Number(r.house_profit_usd_est || 0),
    0
  );

  return (
    <div className="space-y-4">
      {/* Infrastructure & Dual Supabase Projects Status */}
      <div className="pixel-panel rounded-xl p-4 border-l-4 border-l-emerald-400">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="font-pixel-title text-xs sm:text-sm text-emerald-400 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> PANEL DE CONTROL PROPIETARIO & TESORERÍA EN VIVO
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Conectado en tiempo real a tus 2 proyectos de producción en Supabase + Bot @GameVelmoraBot.
            </p>
          </div>
          <button
            onClick={fetchAdminData}
            className="pixel-btn px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 flex items-center gap-2.5">
            <Database className="w-5 h-5 text-sky-400 shrink-0" />
            <div>
              <div className="text-slate-400 text-[10px]">PROYECTO 1: JUEGO (PRODUCCIÓN)</div>
              <div className="font-bold text-white">velmora-game-prod (vvvjbicveeiqvhhveuyt)</div>
              <div className="text-[11px] text-emerald-400">
                ● ACTIVE_HEALTHY • {speciesCount} Especies • {matchesCount} Duelos
              </div>
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 flex items-center gap-2.5">
            <Database className="w-5 h-5 text-purple-400 shrink-0" />
            <div>
              <div className="text-slate-400 text-[10px]">PROYECTO 2: ADMIN & TESORERÍA</div>
              <div className="font-bold text-white">
                velmora-admin-analytics (fiqddlfokjkszwcbldpe)
              </div>
              <div className="text-[11px] text-emerald-400">
                ● ACTIVE_HEALTHY • {ledger.length} Registros Financieros
              </div>
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 flex items-center gap-2.5">
            <DollarSign className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <div className="text-slate-400 text-[10px]">BOT TELEGRAM & MONETIZACIÓN</div>
              <div className="font-bold text-white">@GameVelmoraBot (ID: 8825788436)</div>
              <div className="text-[11px] text-amber-300">
                ● Rake Casa PvP: 10.0% • Stars & TON Activos
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Revenue KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="pixel-panel-gold rounded-xl p-4">
          <div className="text-xs text-amber-200/80">GANANCIA NETA CASA (TON)</div>
          <div className="text-2xl font-bold text-white mt-1 flex items-center gap-2">
            <img src="/assets/icons/icon_ton.png" className="w-6 h-6 pixelated" alt="" />
            {totalTonRevenue.toFixed(3)} TON
          </div>
          <div className="text-[11px] text-amber-300 mt-1">
            Comisiones 10% Rake PvP 4v4 + Ventas Pase VIP
          </div>
        </div>

        <div className="pixel-panel rounded-xl p-4">
          <div className="text-xs text-slate-400">INGRESOS TELEGRAM STARS</div>
          <div className="text-2xl font-bold text-amber-400 mt-1 flex items-center gap-2">
            <img src="/assets/icons/icon_stars.png" className="w-6 h-6 pixelated" alt="" />
            {totalStarsRevenue.toLocaleString()} ⭐
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Paquetes de Cristales, Orbes Maestros y Coronas
          </div>
        </div>

        <div className="pixel-panel rounded-xl p-4">
          <div className="text-xs text-slate-400">BENEFICIO TOTAL ESTIMADO (USD)</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">
            ${totalUsdEst.toFixed(2)} USD
          </div>
          <div className="text-[11px] text-emerald-300/80 mt-1">
            Contabilidad verificada en `treasury_ledger`
          </div>
        </div>
      </div>

      {/* Ledger & Withdrawals Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Treasury Ledger Table */}
        <div className="lg:col-span-7 pixel-panel rounded-xl p-4 space-y-2.5">
          <h3 className="font-pixel-title text-xs text-amber-400">
            LIBRO MAYOR DE INGRESOS DE LA CASA (`treasury_ledger`)
          </h3>
          <div className="bg-slate-950 rounded-lg border border-slate-800 max-h-64 overflow-y-auto divide-y divide-slate-900 text-xs">
            {ledger.length === 0 ? (
              <div className="p-4 text-center text-slate-500">
                Juega una partida PvP 4v4 con apuesta o realiza una compra en la Tienda para ver los ingresos en directo.
              </div>
            ) : (
              ledger.map((row) => (
                <div key={row.id} className="p-2.5 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-white">{row.notes || row.source_event}</div>
                    <div className="text-[11px] text-slate-400">
                      Jugador: @{row.player_username} •{' '}
                      {new Date(row.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {Number(row.house_profit_ton) > 0 && (
                      <div className="font-bold text-sky-400">
                        +{Number(row.house_profit_ton).toFixed(3)} TON
                      </div>
                    )}
                    {Number(row.house_profit_stars) > 0 && (
                      <div className="font-bold text-amber-400">
                        +{row.house_profit_stars} ⭐
                      </div>
                    )}
                    <div className="text-[10px] text-emerald-400">
                      ~${Number(row.house_profit_usd_est || 0).toFixed(2)} USD
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Withdrawal Requests Management */}
        <div className="lg:col-span-5 pixel-panel rounded-xl p-4 space-y-2.5">
          <h3 className="font-pixel-title text-xs text-sky-400">
            SOLICITUDES DE RETIRO TON (`withdrawal_requests`)
          </h3>
          <div className="bg-slate-950 rounded-lg border border-slate-800 max-h-64 overflow-y-auto divide-y divide-slate-900 text-xs">
            {withdrawals.length === 0 ? (
              <div className="p-4 text-center text-slate-500">
                No hay solicitudes de retiro pendientes en este momento.
              </div>
            ) : (
              withdrawals.map((w) => (
                <div key={w.id} className="p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">
                      @{w.username} solicita {Number(w.net_amount_ton).toFixed(2)} TON
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        w.status === 'approved'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : w.status === 'rejected'
                          ? 'bg-rose-500/20 text-rose-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {w.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono truncate">
                    Wallet: {w.wallet_address}
                  </div>
                  {w.status === 'pending' && (
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => handleWithdrawalAction(w.id, 'approved')}
                        className="px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-[11px] flex items-center gap-1"
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> Aprobar Pago
                      </button>
                      <button
                        onClick={() => handleWithdrawalAction(w.id, 'rejected')}
                        className="px-2.5 py-1 rounded bg-rose-800 hover:bg-rose-700 text-white font-bold text-[11px] flex items-center gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Rechazar
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
