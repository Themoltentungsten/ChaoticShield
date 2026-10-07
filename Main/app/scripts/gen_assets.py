"""Generate local assets for ChaoticShield (gold & black theme):
- public/tiles/tile-XX.png  — DriftWall background tiles (cipher noise + scenes)
- public/idcards/*.png      — ID card faces for the Lanyard 3D cards
"""
import math
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
TILES = ROOT / "public" / "tiles"
CARDS = ROOT / "public" / "idcards"
TILES.mkdir(parents=True, exist_ok=True)
CARDS.mkdir(parents=True, exist_ok=True)

rng = np.random.default_rng(42)
random.seed(42)

# ── DriftWall tiles ──────────────────────────────────────────────────────────
def noise_tile(path, tint):
    px = rng.integers(0, 256, size=(400, 600, 3), dtype=np.uint8).astype(np.float32)
    tint_arr = np.array(tint, dtype=np.float32) / 255.0
    # keep the dark end warm/black rather than grey
    px = px * 0.5 + tint_arr * 255 * 0.5
    px = px * np.array([0.95, 0.9, 0.75], dtype=np.float32)
    Image.fromarray(np.clip(px, 0, 255).astype(np.uint8)).save(path)

def scene_tile(path, sky, sun, ground, seed):
    r = random.Random(seed)
    w, h = 600, 400
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / h
        c = tuple(int(sky[i] * (1 - t * 0.55)) for i in range(3))
        d.line([(0, y), (w, y)], fill=c)
    d.ellipse([w * 0.68, h * 0.12, w * 0.68 + 90, h * 0.12 + 90], fill=sun)
    base = h * 0.62
    pts = [(x, base + 26 * math.sin(x / 55 + seed) + 12 * math.sin(x / 17)) for x in range(0, w + 1, 4)]
    d.polygon(pts + [(w, h), (0, h)], fill=ground)
    for _ in range(7):
        x0 = r.randint(0, w - 70)
        y0 = r.randint(int(h * 0.55), int(h * 0.8))
        d.rectangle([x0, y0, x0 + r.randint(28, 66), y0 + r.randint(18, 40)], fill=tuple(max(0, g - 30) for g in ground))
    img.save(path)

# gold / bronze / champagne noise tiles on black
tints = [(212, 175, 55), (166, 125, 34), (240, 212, 113), (133, 96, 29), (229, 186, 60), (107, 84, 26)]
for i, t in enumerate(tints):
    noise_tile(TILES / f"tile-{i:02d}.png", t)

# dusk scenes with golden suns
scenes = [
    ((70, 45, 20), (240, 190, 80), (40, 30, 14)),
    ((52, 36, 44), (230, 150, 70), (36, 26, 30)),
    ((38, 30, 12), (212, 175, 55), (30, 24, 12)),
    ((60, 40, 34), (220, 170, 90), (34, 24, 18)),
    ((46, 34, 16), (235, 195, 95), (32, 24, 12)),
    ((55, 44, 30), (245, 205, 110), (36, 28, 18)),
]
for i, (sky, sun, ground) in enumerate(scenes):
    scene_tile(TILES / f"tile-{6 + i:02d}.png", sky, sun, ground, seed=i * 3 + 1)

# ── Lanyard ID cards ─────────────────────────────────────────────────────────
def font(size, bold=True):
    candidates = [
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
    ]
    for c in candidates:
        if Path(c).exists():
            return ImageFont.truetype(c, size)
    return ImageFont.load_default()

PEOPLE = [
    ("yash", "YASH KUMAR RAUT", "2301020847", "Lead Developer", (212, 175, 55)),
    ("rishu", "RISHU MEHTA", "2301020752", "ML & Evaluation", (240, 212, 113)),
    ("suman", "SUMAN KUMAR", "2301020176", "Cryptanalysis", (188, 148, 44)),
]

W, H = 800, 1000
for slug, name, roll, role, accent in PEOPLE:
    img = Image.new("RGB", (W, H), (11, 9, 6))
    d = ImageDraw.Draw(img)
    # header band
    d.rectangle([0, 0, W, 150], fill=accent)
    d.text((40, 46), "CHAOTICSHIELD", font=font(52), fill=(15, 12, 6))
    d.text((40, 104), "PROJECT TEAM ID", font=font(26, bold=False), fill=(58, 44, 18))
    # avatar placeholder (initials disc)
    initials = "".join(p[0] for p in name.split()[:2])
    cx, cy, rad = W // 2, 360, 130
    d.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill=(26, 22, 13), outline=accent, width=6)
    f_init = font(96)
    bb = d.textbbox((0, 0), initials, font=f_init)
    d.text((cx - (bb[2] - bb[0]) / 2, cy - (bb[3] - bb[1]) / 2 - 8), initials, font=f_init, fill=accent)
    # name / role / roll no
    f_name = font(48)
    bb = d.textbbox((0, 0), name, font=f_name)
    d.text(((W - (bb[2] - bb[0])) / 2, 545), name, font=f_name, fill=(244, 236, 214))
    f_role = font(30, bold=False)
    bb = d.textbbox((0, 0), role, font=f_role)
    d.text(((W - (bb[2] - bb[0])) / 2, 615), role, font=f_role, fill=(168, 152, 108))
    d.line([(120, 690), (W - 120, 690)], fill=(58, 47, 22), width=2)
    f_small = font(28, bold=False)
    d.text((120, 730), "ROLL NO", font=f_small, fill=(128, 108, 62))
    d.text((120, 770), roll, font=font(36), fill=(236, 222, 178))
    d.text((120, 840), "C.V. RAMAN GLOBAL UNIVERSITY", font=f_small, fill=(128, 108, 62))
    d.text((120, 878), "DEPT. OF COMPUTER SCIENCE & ENGINEERING", font=f_small, fill=(128, 108, 62))
    d.rectangle([0, H - 26, W, H], fill=accent)
    img.save(CARDS / f"{slug}.png")

print("tiles:", len(list(TILES.glob('*.png'))), "| idcards:", len(list(CARDS.glob('*.png'))))
