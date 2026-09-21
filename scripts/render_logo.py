from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

root = Path(__file__).resolve().parents[1]
font_path = root / '.local' / 'Pretendard-SemiBold.ttf'
# Match Eternal Beam brand: Pretendard 600, uppercase, open tracking.
font = ImageFont.truetype(str(font_path), 96)
text = 'SOUL TRACE'

# Measure tight bbox then pad.
probe = Image.new('RGBA', (1, 1), (0, 0, 0, 0))
draw = ImageDraw.Draw(probe)
# letter-spacing ≈ 0.12em via manual advance
spacing = int(96 * 0.08)
x = 0
glyphs = []
for ch in text:
    bbox = draw.textbbox((0, 0), ch, font=font)
    w = bbox[2] - bbox[0]
    glyphs.append((ch, x - bbox[0], -bbox[1], w, bbox[3] - bbox[1]))
    x += w + (0 if ch == ' ' else spacing)
# last char shouldn't add trailing spacing after end — already included between chars only
# Recompute without trailing spacing after final glyph:
total_w = glyphs[-1][1] + glyphs[-1][3]
total_h = max(g[4] for g in glyphs)

pad_x, pad_y = 12, 10
img = Image.new('RGBA', (total_w + pad_x * 2, total_h + pad_y * 2), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)
# Warm near-black like Eternal Beam ink (#2D2926 / #111)
color = (45, 41, 38, 255)
for ch, gx, gy, gw, gh in glyphs:
    draw.text((pad_x + gx, pad_y + gy), ch, font=font, fill=color)

out = root / 'assets' / 'soul-trace-logo.png'
img.save(out, optimize=True)
print('saved', img.size, out)
