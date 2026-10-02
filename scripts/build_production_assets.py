#!/usr/bin/env python3
"""
Velmora: Neo Monsters Arena - Production Asset Pipeline v4.0
1. Extracts & normalizes 18 visually distinct monster creatures (10 bespoke AI 2D pixel art + 8 CC0 RLTiles/DCSS creatures)
2. Compiles 18 Production 6x4 Animation Sprite Sheets (512x768px, 128x128px per frame: idle, idle_alt, attack, hit, faint, evolve)
3. Documents sprite sheet grid specs in public/assets/spritesheets/spritesheet_manifest.json
4. Compiles 6 Separate Evolution Design Sheets (1200x540px) in public/assets/sheets/sheet_<element>.png
"""

import os
import json
import math
from collections import deque
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageEnhance

BASE_DIR = "/home/user/public/assets"
RAW_AI_DIR = "/home/user/scripts/raw_monsters"
DCSS_DIR = "/home/user/scripts/raw_dcss"
MONSTER_DIR = os.path.join(BASE_DIR, "monsters")
SPRITESHEET_DIR = os.path.join(BASE_DIR, "spritesheets")
SHEET_DIR = os.path.join(BASE_DIR, "sheets")
ICON_DIR = os.path.join(BASE_DIR, "icons")

os.makedirs(MONSTER_DIR, exist_ok=True)
os.makedirs(SPRITESHEET_DIR, exist_ok=True)
os.makedirs(SHEET_DIR, exist_ok=True)

FONT_BOLD_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
FONT_REG_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

def get_font(size: int, bold: bool = True):
    path = FONT_BOLD_PATH if bold else FONT_REG_PATH
    if os.path.exists(path):
        return ImageFont.truetype(path, size)
    return ImageFont.load_default()

with open(os.path.join(BASE_DIR, "monsters_catalog.json"), "r", encoding="utf-8") as f:
    MONSTER_CATALOG = json.load(f)

ELEMENT_COLORS = {
    "fire": {"main": (255, 95, 31, 255), "accent": (255, 220, 65, 255), "bg": (42, 16, 20, 255), "name_es": "FUEGO (PYRO)"},
    "water": {"main": (56, 182, 255, 255), "accent": (185, 245, 255, 255), "bg": (14, 28, 48, 255), "name_es": "AGUA (HYDRO)"},
    "earth": {"main": (110, 215, 75, 255), "accent": (240, 196, 65, 255), "bg": (20, 36, 22, 255), "name_es": "TIERRA (TERRA)"},
    "storm": {"main": (255, 215, 0, 255), "accent": (98, 244, 255, 255), "bg": (36, 30, 16, 255), "name_es": "RAYO (VOLT)"},
    "light": {"main": (255, 236, 148, 255), "accent": (120, 215, 255, 255), "bg": (42, 38, 56, 255), "name_es": "LUZ (LUX)"},
    "shadow": {"main": (178, 80, 255, 255), "accent": (255, 52, 118, 255), "bg": (24, 12, 38, 255), "name_es": "OSCURIDAD (UMBRA)"},
}

# Mapping of the 18 monsters to their raw source files & provenance
RAW_SOURCES = {
    "pyro_1": ("ai", f"{RAW_AI_DIR}/pyro_1.png"),
    "pyro_2": ("ai", f"{RAW_AI_DIR}/pyro_2.png"),
    "pyro_3": ("ai", f"{RAW_AI_DIR}/pyro_3.png"),
    "hydro_1": ("ai", f"{RAW_AI_DIR}/hydro_1.png"),
    "hydro_2": ("ai", f"{RAW_AI_DIR}/hydro_2.png"),
    "hydro_3": ("ai", f"{RAW_AI_DIR}/hydro_3.png"),
    "terra_1": ("ai", f"{RAW_AI_DIR}/terra_1.png"),
    "terra_2": ("ai", f"{RAW_AI_DIR}/terra_2.png"),
    "terra_3": ("ai", f"{RAW_AI_DIR}/terra_3.png"),
    "volt_1": ("ai", f"{RAW_AI_DIR}/volt_1.png"),
    "volt_2": ("dcss", f"{DCSS_DIR}/volt_2.png"),              # raiju.png
    "volt_3": ("dcss", f"{DCSS_DIR}/volt_3.png"),              # storm_dragon.png
    "lux_1": ("dcss", f"{DCSS_DIR}/bennu.png"),                # bennu.png
    "lux_2": ("dcss", f"{DCSS_DIR}/lux_2.png"),                # daeva.png
    "lux_3": ("dcss", f"{DCSS_DIR}/lux_3.png"),                # seraph.png
    "umbra_1": ("dcss", f"{DCSS_DIR}/umbra_1.png"),            # shadow_imp.png
    "umbra_2": ("dcss", f"{DCSS_DIR}/umbra_2.png"),            # reaper.png
    "umbra_3": ("dcss", f"{DCSS_DIR}/herald_of_the_abyss.png") # herald_of_the_abyss.png
}

def extract_clean_transparent_sprite(src_type: str, path: str, target_size: int = 192) -> Image.Image:
    """
    Removes solid black/white background via corner flood-fill (for AI renders)
    or preserves native alpha (for DCSS CC0 sprites), crops tight bounding box,
    and centers with crisp Nearest-Neighbor pixel scaling.
    """
    img = Image.open(path).convert("RGBA")
    if src_type == "ai":
        # Downsample first to 96x96 crisp pixel grid so pixel size is uniform & sharp
        arr = np.array(img)
        h, w, _ = arr.shape
        # Sample corner color
        corners = [arr[0, 0, :3], arr[0, w - 1, :3], arr[h - 1, 0, :3], arr[h - 1, w - 1, :3]]
        bg_rgb = np.median(corners, axis=0)

        # Flood fill from border pixels that match background color within tolerance
        tol = 38.0
        dist = np.linalg.norm(arr[:, :, :3].astype(np.float32) - bg_rgb, axis=2)
        bg_candidate = dist < tol

        visited = np.zeros((h, w), dtype=bool)
        q = deque()
        for x in range(w):
            if bg_candidate[0, x]:
                visited[0, x] = True
                q.append((x, 0))
            if bg_candidate[h - 1, x]:
                visited[h - 1, x] = True
                q.append((x, h - 1))
        for y in range(h):
            if bg_candidate[y, 0] and not visited[y, 0]:
                visited[y, 0] = True
                q.append((0, y))
            if bg_candidate[y, w - 1] and not visited[y, w - 1]:
                visited[y, w - 1] = True
                q.append((w - 1, y))

        while q:
            cx, cy = q.popleft()
            for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nx, ny = cx + dx, cy + dy
                if 0 <= nx < w and 0 <= ny < h and not visited[ny, nx] and bg_candidate[ny, nx]:
                    visited[ny, nx] = True
                    q.append((nx, ny))

        arr[visited, 3] = 0
        img = Image.fromarray(arr, mode="RGBA")

    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)

    # Quantize to 64x64 pixel-art grid then upscale via Nearest-Neighbor to target_size
    cw, ch = img.size
    scale = min(56.0 / max(1, cw), 56.0 / max(1, ch))
    nw = max(16, int(round(cw * scale)))
    nh = max(16, int(round(ch * scale)))
    small = img.resize((nw, nh), resample=Image.NEAREST)

    canvas64 = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    ox = (64 - nw) // 2
    oy = (64 - nh) // 2
    canvas64.paste(small, (ox, oy), small)

    # Ensure binary alpha (0 or 255)
    a64 = np.array(canvas64)
    a64[a64[:, :, 3] < 110, 3] = 0
    a64[a64[:, :, 3] >= 110, 3] = 255
    clean64 = Image.fromarray(a64, mode="RGBA")
    return clean64.resize((target_size, target_size), resample=Image.NEAREST)


def build_monster_spritesheet(base_128: Image.Image, element: str) -> Image.Image:
    """
    Builds a 4-column x 6-row (512x768px) production sprite sheet where each cell is 128x128px.
    Rows:
      0: idle (4 distinct breathing & aura frames)
      1: idle_alt (4 distinct battle-ready / taunt frames)
      2: attack (4 distinct wind-up, lunge, slash-burst, recovery frames)
      3: hit (4 distinct recoil, damage flash, stagger, guard frames)
      4: faint (4 distinct collapse, darken, pixel-dissolve, spirit-orb frames)
      5: evolve (4 distinct levitate, rune-vortex, prismatic-burst, ascension frames)
    """
    CELL = 128
    COLS, ROWS = 4, 6
    sheet = Image.new("RGBA", (CELL * COLS, CELL * ROWS), (0, 0, 0, 0))
    ecol = ELEMENT_COLORS[element]["main"]
    acol = ELEMENT_COLORS[element]["accent"]

    # Helper to tint image
    def tint_sprite(spr: Image.Image, r_mul: float, g_mul: float, b_mul: float, a_mul: float = 1.0) -> Image.Image:
        arr = np.array(spr).astype(np.float32)
        arr[:, :, 0] = np.clip(arr[:, :, 0] * r_mul, 0, 255)
        arr[:, :, 1] = np.clip(arr[:, :, 1] * g_mul, 0, 255)
        arr[:, :, 2] = np.clip(arr[:, :, 2] * b_mul, 0, 255)
        arr[:, :, 3] = np.clip(arr[:, :, 3] * a_mul, 0, 255)
        return Image.fromarray(arr.astype(np.uint8), mode="RGBA")

    # ROW 0: IDLE (4 distinct frames)
    idle_specs = [
        (1.0, 1.0, 0, 0, 0),       # f0: base stance
        (1.02, 1.04, 0, -4, 1),    # f1: inhale lift + spark 1
        (1.04, 1.07, 0, -7, 2),    # f2: peak breath lift + aura pulse
        (1.03, 0.96, 0, 3, 3),     # f3: exhale crouch
    ]
    for c, (sx, sy, dx, dy, spark_mode) in enumerate(idle_specs):
        cell = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
        d = ImageDraw.Draw(cell)
        w2, h2 = int(CELL * sx), int(CELL * sy)
        warped = base_128.resize((w2, h2), resample=Image.NEAREST)
        px = (CELL - w2) // 2 + dx
        py = (CELL - h2) // 2 + dy
        cell.paste(warped, (px, py), warped)
        # Elemental breathing sparks (distinct per frame)
        if spark_mode > 0:
            for i in range(spark_mode * 2):
                ang = (i * 1.57) + spark_mode * 0.6
                rx = int(64 + math.cos(ang) * 46)
                ry = int(64 + math.sin(ang) * 42)
                d.rectangle([rx - 2, ry - 2, rx + 2, ry + 2], fill=acol if i % 2 == 0 else ecol)
        sheet.paste(cell, (c * CELL, 0 * CELL))

    # ROW 1: IDLE_ALT (4 distinct alert/roar frames)
    alt_specs = [
        (-6, 1.0, -4, -2, 1),
        (0, 1.10, 0, -8, 2),
        (7, 1.05, 5, -4, 3),
        (0, 0.98, 0, 2, 4),
    ]
    for c, (rot, sc, dx, dy, ring_r) in enumerate(alt_specs):
        cell = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
        d = ImageDraw.Draw(cell)
        # Ground elemental ring
        d.ellipse([24 - ring_r * 2, 102 - ring_r, 104 + ring_r * 2, 120 + ring_r], outline=ecol, width=2)
        w2 = int(CELL * sc)
        s_img = base_128.resize((w2, w2), resample=Image.NEAREST).rotate(rot, resample=Image.NEAREST)
        cell.paste(s_img, ((CELL - w2) // 2 + dx, (CELL - w2) // 2 + dy), s_img)
        sheet.paste(cell, (c * CELL, 1 * CELL))

    # ROW 2: ATTACK (4 distinct wind-up, lunge, impact slash, recovery frames)
    atk_specs = [
        (-14, 4, -8, 0.94, "charge"),
        (14, -6, 10, 1.06, "lunge"),
        (22, -4, 14, 1.10, "slash"),
        (6, 2, 4, 1.0, "recover"),
    ]
    for c, (dx, dy, rot, sc, phase) in enumerate(atk_specs):
        cell = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
        d = ImageDraw.Draw(cell)
        w2 = int(CELL * sc)
        s_img = base_128.resize((w2, w2), resample=Image.NEAREST).rotate(rot, resample=Image.NEAREST)
        cell.paste(s_img, ((CELL - w2) // 2 + dx, (CELL - w2) // 2 + dy), s_img)
        if phase == "charge":
            d.ellipse([10, 48, 34, 72], fill=ecol, outline=acol, width=2)
        elif phase == "lunge":
            d.polygon([(88, 24), (122, 60), (88, 96), (102, 60)], fill=acol)
        elif phase == "slash":
            # Prominent pixel slash arc + impact burst
            d.arc([64, 12, 124, 116], start=290, end=70, fill=acol, width=6)
            d.arc([56, 18, 118, 110], start=290, end=70, fill=ecol, width=4)
            d.polygon([(108, 35), (125, 64), (108, 93), (116, 64)], fill=(255, 255, 255, 255))
        elif phase == "recover":
            for ky in (36, 64, 88):
                d.rectangle([96, ky, 104, ky + 6], fill=ecol)
        sheet.paste(cell, (c * CELL, 2 * CELL))

    # ROW 3: HIT (4 distinct damage recoil frames)
    hit_specs = [
        (-10, -2, 8, (2.2, 0.7, 0.7, 1.0), True),
        (-18, -6, 16, (2.5, 2.5, 2.5, 1.0), True),
        (-12, 4, 10, (1.8, 0.5, 0.5, 0.75), False),
        (-4, 0, 3, (1.2, 0.9, 0.9, 1.0), False),
    ]
    for c, (dx, dy, rot, tint, burst) in enumerate(hit_specs):
        cell = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
        d = ImageDraw.Draw(cell)
        t_img = tint_sprite(base_128, *tint).rotate(rot, resample=Image.NEAREST)
        cell.paste(t_img, (dx, dy), t_img)
        if burst:
            # Impact cross-flash on chest
            d.line([(44, 44), (84, 84)], fill=(255, 255, 120, 255), width=4)
            d.line([(84, 44), (44, 84)], fill=(255, 80, 80, 255), width=4)
        sheet.paste(cell, (c * CELL, 3 * CELL))

    # ROW 4: FAINT / DEFEAT (4 distinct collapse & dissolve frames)
    faint_specs = [
        (0, 10, -18, 0.92, (0.65, 0.65, 0.75, 0.95), 0),
        (-6, 22, -45, 0.85, (0.50, 0.50, 0.65, 0.80), 6),
        (-10, 32, -75, 0.75, (0.40, 0.40, 0.60, 0.50), 14),
        (0, 40, -90, 0.60, (0.30, 0.30, 0.50, 0.22), 20),
    ]
    for c, (dx, dy, rot, sc, tint, wisps) in enumerate(faint_specs):
        cell = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
        d = ImageDraw.Draw(cell)
        w2 = int(CELL * sc)
        f_img = tint_sprite(base_128, *tint).resize((w2, w2), resample=Image.NEAREST).rotate(rot, resample=Image.NEAREST)
        cell.paste(f_img, ((CELL - w2) // 2 + dx, (CELL - w2) // 2 + dy), f_img)
        for w_idx in range(wisps):
            wx = 30 + (w_idx * 17) % 68
            wy = 95 - (w_idx * 13) % 70
            d.rectangle([wx, wy, wx + 4, wy + 4], fill=acol if w_idx % 2 == 0 else ecol)
        if c == 3:
            # Defeated spirit core crystal
            d.polygon([(64, 72), (78, 92), (64, 112), (50, 92)], fill=ecol, outline=acol)
        sheet.paste(cell, (c * CELL, 4 * CELL))

    # ROW 5: EVOLVE (4 distinct metamorphosis & ascension frames)
    evo_specs = [
        (1.0, -6, (1.3, 1.2, 1.0, 1.0), 1),
        (1.08, -10, (1.8, 1.7, 1.2, 1.0), 2),
        (1.16, -14, (2.5, 2.4, 1.8, 1.0), 3),
        (1.22, -16, (3.0, 3.0, 2.6, 1.0), 4),
    ]
    for c, (sc, dy, tint, stage_fx) in enumerate(evo_specs):
        cell = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
        d = ImageDraw.Draw(cell)
        # Radiant evolution mandala rings behind monster
        for r_idx in range(stage_fx):
            rad = 28 + r_idx * 12
            d.ellipse([64 - rad, 64 - rad, 64 + rad, 64 + rad], outline=acol if r_idx % 2 == 0 else ecol, width=2)
        if stage_fx >= 3:
            for ray in range(8):
                ang = ray * (math.pi / 4) + stage_fx * 0.2
                x2 = int(64 + math.cos(ang) * 58)
                y2 = int(64 + math.sin(ang) * 58)
                d.line([(64, 64), (x2, y2)], fill=acol, width=3)
        w2 = min(CELL, int(CELL * sc))
        e_img = tint_sprite(base_128, *tint).resize((w2, w2), resample=Image.NEAREST)
        cell.paste(e_img, ((CELL - w2) // 2, (CELL - w2) // 2 + dy), e_img)
        sheet.paste(cell, (c * CELL, 5 * CELL))

    return sheet


def build_all_assets():
    manifest = {
        "schema_version": "2.0",
        "native_frame_width": 128,
        "native_frame_height": 128,
        "sheet_width": 512,
        "sheet_height": 768,
        "columns": 4,
        "rows": 6,
        "animations": {
            "idle": {"row": 0, "frames": [0, 1, 2, 3], "frame_duration_ms": 180, "loop": True},
            "idle_alt": {"row": 1, "frames": [0, 1, 2, 3], "frame_duration_ms": 160, "loop": True},
            "attack": {"row": 2, "frames": [0, 1, 2, 3], "frame_duration_ms": 110, "loop": False},
            "hit": {"row": 3, "frames": [0, 1, 2, 3], "frame_duration_ms": 120, "loop": False},
            "faint": {"row": 4, "frames": [0, 1, 2, 3], "frame_duration_ms": 180, "loop": False},
            "evolve": {"row": 5, "frames": [0, 1, 2, 3], "frame_duration_ms": 150, "loop": True}
        },
        "sheets": {}
    }

    for m in MONSTER_CATALOG:
        mid = m["id"]
        elem = m["element"]
        src_type, raw_path = RAW_SOURCES[mid]
        sprite_192 = extract_clean_transparent_sprite(src_type, raw_path, target_size=192)
        sprite_128 = sprite_192.resize((128, 128), resample=Image.NEAREST)

        # Save standalone portrait sprite
        sprite_192.save(os.path.join(MONSTER_DIR, f"{mid}.png"), "PNG")

        # Build & save 6x4 production animation sprite sheet
        sheet_img = build_monster_spritesheet(sprite_128, elem)
        sheet_rel = f"/assets/spritesheets/{mid}_sheet.png"
        sheet_img.save(os.path.join(SPRITESHEET_DIR, f"{mid}_sheet.png"), "PNG")

        # Also update legacy 2-frame _anim.png from row 0 frames 0 & 2 for backwards compatibility
        anim2 = Image.new("RGBA", (384, 192), (0, 0, 0, 0))
        f0 = sheet_img.crop((0, 0, 128, 128)).resize((192, 192), resample=Image.NEAREST)
        f2 = sheet_img.crop((256, 0, 384, 128)).resize((192, 192), resample=Image.NEAREST)
        anim2.paste(f0, (0, 0))
        anim2.paste(f2, (192, 0))
        anim2.save(os.path.join(MONSTER_DIR, f"{mid}_anim.png"), "PNG")

        manifest["sheets"][mid] = {
            "species_id": mid,
            "name": m["name"],
            "element": elem,
            "stage": m["stage"],
            "file": sheet_rel,
            "frame_size": [128, 128],
            "grid": [4, 6]
        }
        print(f"Built monster {mid} ({m['name']}) -> portrait 192x192 & spritesheet 512x768 (24 frames)")

    with open(os.path.join(SPRITESHEET_DIR, "spritesheet_manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    # Now rebuild the 6 Separate Evolution Design Presentation Sheets (1200x540) using the NEW final monster artwork!
    f_title = get_font(15, bold=True)
    f_sub = get_font(11, bold=True)
    f_card_h = get_font(13, bold=True)
    f_body = get_font(10, bold=False)
    f_small = get_font(10, bold=True)

    for elem, pal in ELEMENT_COLORS.items():
        stages = [m for m in MONSTER_CATALOG if m["element"] == elem]
        stages.sort(key=lambda x: x["stage"])

        W, H = 1200, 540
        sheet = Image.new("RGBA", (W, H), (12, 15, 24, 255))
        draw = ImageDraw.Draw(sheet)

        for gx in range(0, W, 24):
            draw.line([(gx, 0), (gx, H)], fill=(22, 26, 40, 255), width=1)
        for gy in range(0, H, 24):
            draw.line([(0, gy), (W, gy)], fill=(22, 26, 40, 255), width=1)

        draw.rectangle([4, 4, W - 5, H - 5], outline=pal["main"], width=3)
        draw.rectangle([18, 18, W - 19, 76], fill=pal["bg"], outline=pal["accent"], width=2)
        draw.text((32, 25), f"HOJA DE EVOLUCIÓN OFICIAL — ELEMENTO: {pal['name_es']}", fill=(255, 255, 255, 255), font=f_title)
        draw.text((32, 48), "DOCUMENTACIÓN VISUAL DE EVOLUCIÓN: ETAPA 1 (INICIAL) ➔ ETAPA 2 (ÉPICO) ➔ ETAPA 3 (MÍTICO) | SPRITESHEETS SEPARADOS EN /assets/spritesheets/", fill=pal["accent"], font=f_small)

        card_w = 330
        card_h = 425
        positions = [32, 435, 838]

        for idx, m in enumerate(stages):
            cx = positions[idx]
            cy = 92
            draw.rectangle([cx, cy, cx + card_w, cy + card_h], fill=(18, 22, 36, 255), outline=pal["main"], width=2)
            draw.rectangle([cx + 4, cy + 4, cx + card_w - 4, cy + 44], fill=pal["bg"], outline=pal["main"], width=1)

            stage_label = f"ETAPA {m['stage']} ({m['rarity'].upper()})"
            draw.text((cx + 12, cy + 8), f"{stage_label}: {m['name'].upper()}", fill=pal["accent"], font=f_card_h)
            draw.text((cx + 12, cy + 25), m["title"], fill=(210, 220, 240, 255), font=f_body)

            ped_x = cx + 14
            ped_y = cy + 52
            draw.rectangle([ped_x, ped_y, ped_x + 196, ped_y + 196], fill=(10, 12, 20, 255), outline=pal["main"], width=2)
            sprite = Image.open(os.path.join(MONSTER_DIR, f"{m['id']}.png")).convert("RGBA")
            sheet.paste(sprite, (ped_x + 2, ped_y + 2), sprite)

            # Mini preview of Attack & Evolve frames from the monster's real spritesheet
            ss = Image.open(os.path.join(SPRITESHEET_DIR, f"{m['id']}_sheet.png")).convert("RGBA")
            atk_frame = ss.crop((256, 256, 384, 384)).resize((88, 88), resample=Image.NEAREST)
            evo_frame = ss.crop((256, 640, 384, 768)).resize((88, 88), resample=Image.NEAREST)

            zx = ped_x + 204
            draw.rectangle([zx, ped_y, zx + 92, ped_y + 92], fill=(10, 12, 20, 255), outline=pal["accent"], width=1)
            sheet.paste(atk_frame, (zx + 2, ped_y + 2), atk_frame)
            draw.text((zx + 4, ped_y + 76), "FRAME ATAQUE", fill=pal["accent"], font=f_small)

            draw.rectangle([zx, ped_y + 102, zx + 92, ped_y + 194], fill=(10, 12, 20, 255), outline=pal["main"], width=1)
            sheet.paste(evo_frame, (zx + 2, ped_y + 104), evo_frame)
            draw.text((zx + 4, ped_y + 178), "FRAME EVOL.", fill=(120, 255, 160, 255), font=f_small)

            stats_y = ped_y + 206
            stats = [
                ("HP", m["base_hp"], 1700, (90, 230, 120, 255)),
                ("ATK", m["base_atk"], 400, (255, 100, 80, 255)),
                ("DEF", m["base_def"], 400, (90, 180, 255, 255)),
                ("SPD", m["base_spd"], 260, (255, 215, 70, 255)),
            ]
            for s_idx, (sname, sval, smax, scol) in enumerate(stats):
                sy = stats_y + s_idx * 22
                draw.text((cx + 14, sy), f"{sname}: {sval}", fill=(230, 235, 245, 255), font=f_sub)
                bar_x = cx + 98
                bar_w = 212
                draw.rectangle([bar_x, sy + 2, bar_x + bar_w, sy + 15], fill=(32, 38, 56, 255), outline=(60, 70, 95, 255))
                fill_w = int(bar_w * min(1.0, sval / smax))
                draw.rectangle([bar_x + 1, sy + 3, bar_x + fill_w, sy + 14], fill=scol)

            sk_y = stats_y + 92
            draw.rectangle([cx + 12, sk_y, cx + card_w - 12, cy + card_h - 10], fill=(14, 18, 30, 255), outline=pal["main"])
            draw.text((cx + 18, sk_y + 6), f"PASIVA: {m['passive_trait']['name']}", fill=pal["accent"], font=f_sub)
            draw.text((cx + 18, sk_y + 23), m['passive_trait']['desc'], fill=(195, 205, 225, 255), font=f_body)
            draw.text((cx + 18, sk_y + 41), f"ULTIMATE: {m['skills'][3]['name']} ({m['skills'][3]['tu']} TU)", fill=pal["main"], font=f_small)

            if idx < 2:
                ax = cx + card_w + 8
                ay = cy + 190
                draw.rectangle([ax, ay, ax + 56, ay + 44], fill=pal["bg"], outline=pal["accent"], width=2)
                draw.text((ax + 8, ay + 6), "EVOL.", fill=pal["accent"], font=f_sub)
                draw.text((ax + 12, ay + 23), "--->", fill=(255, 255, 255, 255), font=f_sub)

        sheet.save(os.path.join(SHEET_DIR, f"sheet_{elem}.png"), "PNG")
        print(f"Built Evolution Design Sheet: sheet_{elem}.png")

if __name__ == "__main__":
    build_all_assets()
