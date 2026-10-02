-- ============================================================================
-- VELMORA: NEO MONSTERS ARENA — GAME PRODUCTION SCHEMA MIGRATION
-- Target Project: velmora-game-prod (vvvjbicveeiqvhhveuyt)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. PLAYER PROFILES
CREATE TABLE IF NOT EXISTS public.player_profiles (
  telegram_id BIGINT PRIMARY KEY,
  username TEXT NOT NULL,
  starter_element TEXT NOT NULL DEFAULT 'fire' CHECK (starter_element IN ('fire','water','earth','storm','light','shadow')),
  gold BIGINT NOT NULL DEFAULT 1500 CHECK (gold >= 0),
  crystals BIGINT NOT NULL DEFAULT 200 CHECK (crystals >= 0),
  energy INT NOT NULL DEFAULT 100 CHECK (energy >= 0),
  ton_balance NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK (ton_balance >= 0),
  ton_wallet_address TEXT,
  vip_tier INT NOT NULL DEFAULT 0,
  pvp_elo INT NOT NULL DEFAULT 1000,
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  referred_by BIGINT,
  referral_earnings_ton NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
  buildings JSONB NOT NULL DEFAULT '{"gold_mine":1,"essence_reactor":1,"sanctuary_vats":1,"relic_forge":1}'::jsonb,
  inventory JSONB NOT NULL DEFAULT '{"elem_fire":5,"elem_water":5,"elem_earth":5,"elem_storm":5,"elem_light":3,"elem_shadow":3,"capture_basic":5,"capture_master":1,"xp_fruit":5,"evo_crown":1}'::jsonb,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.player_profiles ADD COLUMN IF NOT EXISTS ton_wallet_address TEXT;
ALTER TABLE public.player_profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. PLAYER MONSTERS (4v4 Frontline + Bench Squad)
CREATE TABLE IF NOT EXISTS public.player_monsters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_telegram_id BIGINT NOT NULL REFERENCES public.player_profiles(telegram_id) ON DELETE CASCADE,
  species_id TEXT NOT NULL,
  element TEXT NOT NULL CHECK (element IN ('fire','water','earth','storm','light','shadow')),
  stage INT NOT NULL DEFAULT 1 CHECK (stage BETWEEN 1 AND 3),
  level INT NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 100),
  xp INT NOT NULL DEFAULT 0 CHECK (xp >= 0),
  team_slot INT CHECK (team_slot IS NULL OR (team_slot BETWEEN 1 AND 8)),
  hp INT NOT NULL,
  atk INT NOT NULL,
  def INT NOT NULL,
  spd INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.player_monsters ADD COLUMN IF NOT EXISTS owner_telegram_id BIGINT;
CREATE INDEX IF NOT EXISTS idx_player_monsters_owner ON public.player_monsters(owner_telegram_id);

-- 3. PVP MATCHES (Real Online Matchmaking & Wager Escrow)
CREATE TABLE IF NOT EXISTS public.pvp_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_tier TEXT NOT NULL DEFAULT 'rookie_gold',
  currency TEXT NOT NULL DEFAULT 'GOLD' CHECK (currency IN ('GOLD', 'TON')),
  stake_amount NUMERIC(18, 4) NOT NULL CHECK (stake_amount > 0),
  rake_pct NUMERIC(5, 2) NOT NULL DEFAULT 10.00,
  host_telegram_id BIGINT NOT NULL,
  host_username TEXT NOT NULL DEFAULT 'Commander',
  host_elo INT NOT NULL DEFAULT 1000,
  host_squad JSONB NOT NULL DEFAULT '[]'::jsonb,
  challenger_telegram_id BIGINT,
  challenger_username TEXT,
  challenger_squad JSONB DEFAULT '[]'::jsonb,
  winner_telegram_id BIGINT,
  house_rake_amount NUMERIC(18, 4) NOT NULL DEFAULT 0,
  winner_payout NUMERIC(18, 4) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  combat_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.pvp_matches ADD COLUMN IF NOT EXISTS room_tier TEXT NOT NULL DEFAULT 'rookie_gold';
ALTER TABLE public.pvp_matches ADD COLUMN IF NOT EXISTS host_username TEXT NOT NULL DEFAULT 'Commander';
ALTER TABLE public.pvp_matches ADD COLUMN IF NOT EXISTS host_elo INT NOT NULL DEFAULT 1000;
ALTER TABLE public.pvp_matches ADD COLUMN IF NOT EXISTS host_squad JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.pvp_matches ADD COLUMN IF NOT EXISTS challenger_username TEXT;
ALTER TABLE public.pvp_matches ADD COLUMN IF NOT EXISTS challenger_squad JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.pvp_matches ADD COLUMN IF NOT EXISTS winner_payout NUMERIC(18, 4) NOT NULL DEFAULT 0;
ALTER TABLE public.pvp_matches ADD COLUMN IF NOT EXISTS combat_log JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.pvp_matches ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_pvp_matches_status ON public.pvp_matches(status, room_tier);

-- 4. BLOCKCHAIN TRANSACTIONS (Real TON Deposit/Withdrawal Verification & Idempotency)
CREATE TABLE IF NOT EXISTS public.blockchain_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT NOT NULL,
  username TEXT NOT NULL,
  tx_type TEXT NOT NULL CHECK (tx_type IN ('DEPOSIT', 'WITHDRAWAL')),
  wallet_address TEXT NOT NULL,
  tx_hash TEXT UNIQUE,
  idempotency_key TEXT UNIQUE NOT NULL,
  gross_amount_ton NUMERIC(18, 4) NOT NULL CHECK (gross_amount_ton > 0),
  fee_amount_ton NUMERIC(18, 4) NOT NULL DEFAULT 0,
  net_amount_ton NUMERIC(18, 4) NOT NULL CHECK (net_amount_ton > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed', 'rejected')),
  verification_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_blockchain_tx_user ON public.blockchain_transactions(telegram_id, created_at DESC);

-- 5. PAYMENT ORDERS (Telegram Stars Invoice -> PreCheckout -> SuccessfulPayment Lifecycle)
CREATE TABLE IF NOT EXISTS public.payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_payload TEXT UNIQUE NOT NULL,
  telegram_id BIGINT NOT NULL,
  username TEXT NOT NULL,
  pack_id TEXT NOT NULL,
  stars_amount INT NOT NULL CHECK (stars_amount > 0),
  reward_gold BIGINT NOT NULL DEFAULT 0,
  reward_crystals BIGINT NOT NULL DEFAULT 0,
  reward_items JSONB NOT NULL DEFAULT '{}'::jsonb,
  reward_vip BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'pre_checkout_approved', 'paid_and_delivered', 'failed')),
  telegram_payment_charge_id TEXT UNIQUE,
  provider_payment_charge_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_user ON public.payment_orders(telegram_id, status);

-- 6. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.player_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_monsters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pvp_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blockchain_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public access profiles" ON public.player_profiles;
CREATE POLICY "Public access profiles" ON public.player_profiles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public access monsters" ON public.player_monsters;
CREATE POLICY "Public access monsters" ON public.player_monsters FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read pvp_matches" ON public.pvp_matches;
CREATE POLICY "Public read pvp_matches" ON public.pvp_matches FOR SELECT USING (true);

DROP POLICY IF EXISTS "Read own blockchain_transactions" ON public.blockchain_transactions;
CREATE POLICY "Read own blockchain_transactions" ON public.blockchain_transactions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Read own payment_orders" ON public.payment_orders;
CREATE POLICY "Read own payment_orders" ON public.payment_orders FOR SELECT USING (true);
