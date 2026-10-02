-- ============================================================================
-- VELMORA: NEO MONSTERS ARENA — ADMIN & TREASURY ANALYTICS SCHEMA MIGRATION
-- Target Project: velmora-admin-analytics (fiqddlfokjkszwcbldpe)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. TREASURY LEDGER (Owner Revenue: PvP Rake, Stars Packs, TON Packs, Withdrawal Fees)
CREATE TABLE IF NOT EXISTS public.treasury_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_type TEXT NOT NULL CHECK (tx_type IN ('PVP_RAKE', 'STARS_PURCHASE', 'TON_PURCHASE', 'WITHDRAWAL_FEE', 'REFERRAL_PAYOUT')),
  player_telegram_id BIGINT NOT NULL,
  player_username TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('TON', 'STARS', 'GOLD')),
  gross_amount NUMERIC(18, 4) NOT NULL,
  house_commission_amount NUMERIC(18, 4) NOT NULL,
  usd_equivalent NUMERIC(18, 4) NOT NULL,
  reference_note TEXT,
  external_tx_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.treasury_ledger ADD COLUMN IF NOT EXISTS external_tx_id TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_treasury_ledger_created ON public.treasury_ledger(created_at DESC);

-- 2. WITHDRAWAL REQUESTS (TON Payout Queue with Backend Verification)
CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_telegram_id BIGINT NOT NULL,
  player_username TEXT NOT NULL,
  ton_wallet_address TEXT NOT NULL,
  requested_ton NUMERIC(18, 4) NOT NULL CHECK (requested_ton > 0),
  fee_ton NUMERIC(18, 4) NOT NULL DEFAULT 0,
  net_ton NUMERIC(18, 4) NOT NULL CHECK (net_ton > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved_paid', 'rejected')),
  tx_hash TEXT,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

ALTER TABLE public.withdrawal_requests ADD COLUMN IF NOT EXISTS tx_hash TEXT;
ALTER TABLE public.withdrawal_requests ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;
ALTER TABLE public.withdrawal_requests ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

-- 3. ADMIN AUDIT LOGS (Immutable Security Trail of Admin Actions)
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_telegram_id BIGINT NOT NULL,
  action TEXT NOT NULL,
  target_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. DAILY KPI SNAPSHOTS
CREATE TABLE IF NOT EXISTS public.daily_kpi_snapshots (
  snapshot_date DATE PRIMARY KEY DEFAULT CURRENT_DATE,
  dau INT NOT NULL DEFAULT 0,
  total_pvp_matches INT NOT NULL DEFAULT 0,
  total_rake_ton NUMERIC(18, 4) NOT NULL DEFAULT 0,
  total_stars_revenue INT NOT NULL DEFAULT 0,
  total_ton_purchases NUMERIC(18, 4) NOT NULL DEFAULT 0,
  net_owner_profit_usd NUMERIC(18, 2) NOT NULL DEFAULT 0
);

-- 5. STRICT ROW LEVEL SECURITY (Only Backend Service Role Can Mutate Admin Data)
ALTER TABLE public.treasury_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_kpi_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public access ledger" ON public.treasury_ledger;
DROP POLICY IF EXISTS "Public access withdrawals" ON public.withdrawal_requests;
DROP POLICY IF EXISTS "Public access kpi" ON public.daily_kpi_snapshots;

-- Read-only select for authenticated/verified API queries; writes restricted to service_role
DROP POLICY IF EXISTS "Read ledger via backend" ON public.treasury_ledger;
CREATE POLICY "Read ledger via backend" ON public.treasury_ledger FOR SELECT USING (true);

DROP POLICY IF EXISTS "Read withdrawals via backend" ON public.withdrawal_requests;
CREATE POLICY "Read withdrawals via backend" ON public.withdrawal_requests FOR SELECT USING (true);
