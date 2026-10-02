# 🐉 Velmora: Neo Monsters Arena 4v4 — Telegram Mini App RPG

Juego de estrategia táctica **4v4 por Unidad de Tiempo (TU)** estilo *Neo Monsters* con **Gestión de Recursos en la Ciudadela**, **6 Elementos**, **18 Evoluciones en 2D Pixel Art**, **Música Chiptune 16-Bit original** y **Monetización Híbrida de Dinero Real (Salas de Apuestas PvP en TON con 10% Rake para la Casa + Tienda Telegram Stars & TON + Referidos Virales)**.

---

## 🏗️ Infraestructura en Producción Configurada

1. **Repositorio GitHub**: [`https://github.com/Gxforge/velmora-neomonsters`](https://github.com/Gxforge/velmora-neomonsters)
2. **Proyecto Supabase #1 (Juego en Producción)**:
   - **Nombre**: `velmora-game-prod`
   - **Ref**: `vvvjbicveeiqvhhveuyt`
   - **URL**: `https://vvvjbicveeiqvhhveuyt.supabase.co`
   - **Tablas**: `monster_species` (18 especies pobladas), `players`, `player_monsters`, `pvp_matches`, `transactions` (con políticas RLS activas).
3. **Proyecto Supabase #2 (Panel Admin, Tesorería & Analíticas Financieras)**:
   - **Nombre**: `velmora-admin-analytics`
   - **Ref**: `fiqddlfokjkszwcbldpe`
   - **URL**: `https://fiqddlfokjkszwcbldpe.supabase.co`
   - **Tablas**: `treasury_ledger` (contabilidad en vivo de comisiones 10% Rake y compras en tienda), `withdrawal_requests`, `game_config_settings`, `admin_audit_logs`.
4. **Bot de Telegram Oficial**:
   - **Bot**: [`@GameVelmoraBot`](https://t.me/GameVelmoraBot) (`@Velmora`)
   - **Webhook Serverless**: `/api/telegram-webhook` + Botón de Menú directo a la Mini App.

---

## 🎨 Arte 2D Pixel Art & Auditoría Pixel a Pixel

- **6 Elementos**: Fuego (`Pyro`), Agua (`Hydro`), Tierra (`Terra`), Rayo (`Volt`), Luz (`Lux`) y Oscuridad (`Umbra`).
- **6 Hojas Oficiales de Diseño Evolutivo (`public/assets/sheets/sheet_*.png`)**:
  - Fuego: `Ignisaur` ➔ `Pyrodrake` ➔ `Vulcanorex`
  - Agua: `Aquafin` ➔ `Tidevyrm` ➔ `Abyssalord`
  - Tierra: `Bramblecub` ➔ `Craghorn` ➔ `Gaiawarden`
  - Rayo: `Sparklynx` ➔ `Thunderfang` ➔ `Tempestarch`
  - Luz: `Lumipup` ➔ `Seraphwing` ➔ `Solariarch`
  - Oscuridad: `Shadeimp` ➔ `Voidstalker` ➔ `Netherbane`
- **Auditoría Automática Pixel a Pixel (`public/assets/pixel_audit_report.json`)**:
  - 70 archivos PNG verificados (`10,400,640` píxeles inspeccionados, `0` píxeles huérfanos, componente conexo `1/1` verificado por BFS).
- **Audio Chiptune 16-Bit (`public/assets/audio/*.wav`)**:
  - Pistas sintetizadas: `bgm_citadel.wav`, `bgm_battle_4v4.wav`, `bgm_pvp_wager.wav` + 5 efectos de sonido retro (`sfx_attack.wav`, `sfx_ultimate.wav`, `sfx_evolve.wav`, `sfx_capture.wav`, `sfx_coin.wav`).
