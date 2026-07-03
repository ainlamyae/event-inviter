"""Generates favicon/apple-touch-icon/social-preview assets for the app.

Run: python generate_icons.py
Produces (in this folder): icon-512.png, favicon-32.png, favicon.png,
apple-touch-icon.png, og-image.png
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
ACCENT = (31, 78, 120)  # #1f4e78, matches --accent in css/style.css
WHITE = (255, 255, 255)

WINDOWS_FONTS = Path("C:/Windows/Fonts")


def font(name, size):
    return ImageFont.truetype(str(WINDOWS_FONTS / name), size)


DATE_RED = (179, 38, 30)  # matches --danger in css/style.css


def build_icon(size):
    # Plain square accent background — OS/browser chrome already masks app
    # icons, and this avoids corner-color artifacts when pasted elsewhere.
    out = Image.new("RGB", (size, size), ACCENT)
    draw = ImageDraw.Draw(out)

    # Envelope (mail) body: white rounded rectangle + a triangular flap
    # outlined in the background color — represents "email".
    margin_x, margin_y = size * 0.16, size * 0.26
    left, top, right, bottom = margin_x, margin_y, size - margin_x, size - margin_y
    corner = size * 0.05

    draw.rounded_rectangle([left, top, right, bottom], radius=corner, fill=WHITE)

    mid_x = (left + right) / 2
    flap_y = top + (bottom - top) * 0.46
    line_w = max(2, round(size * 0.018))
    draw.line([(left + corner * 0.3, top + corner * 0.3), (mid_x, flap_y)], fill=ACCENT, width=line_w)
    draw.line([(right - corner * 0.3, top + corner * 0.3), (mid_x, flap_y)], fill=ACCENT, width=line_w)

    # Calendar badge overlapping the bottom-right corner — represents "event".
    badge = size * 0.42
    bx0, by0 = right - badge * 0.58, bottom - badge * 0.58
    bx1, by1 = bx0 + badge, by0 + badge
    badge_corner = badge * 0.16
    ring = max(2, round(size * 0.014))
    draw.rounded_rectangle([bx0 - ring, by0 - ring, bx1 + ring, by1 + ring], radius=badge_corner + ring, fill=ACCENT)
    draw.rounded_rectangle([bx0, by0, bx1, by1], radius=badge_corner, fill=WHITE)
    bar_h = badge * 0.3
    draw.rounded_rectangle([bx0, by0, bx1, by0 + bar_h], radius=badge_corner, fill=DATE_RED)
    draw.rectangle([bx0, by0 + bar_h - badge_corner, bx1, by0 + bar_h], fill=DATE_RED)
    dot_r = badge * 0.09
    dcx, dcy = (bx0 + bx1) / 2, by0 + bar_h + (by1 - by0 - bar_h) / 2
    draw.ellipse([dcx - dot_r, dcy - dot_r, dcx + dot_r, dcy + dot_r], fill=ACCENT)

    return out


def main():
    icon512 = build_icon(512)
    icon512.save(HERE / "icon-512.png")
    icon512.resize((180, 180), Image.LANCZOS).save(HERE / "apple-touch-icon.png")
    icon512.resize((32, 32), Image.LANCZOS).save(HERE / "favicon-32.png")
    icon512.resize((32, 32), Image.LANCZOS).save(HERE / "favicon.png")

    # Social preview (Open Graph), 1200x630.
    og = Image.new("RGB", (1200, 630), ACCENT)
    draw = ImageDraw.Draw(og)
    small_icon = icon512.resize((260, 260), Image.LANCZOS)
    og.paste(small_icon, (90, 185))

    title_font = font("segoeuib.ttf", 74)
    subtitle_font = font("segoeui.ttf", 28)
    draw.text((410, 240), "Event Inviter", font=title_font, fill=WHITE)
    draw.text((412, 328), "Google Sheets + Gmail powered", font=subtitle_font, fill=(220, 230, 240))
    draw.text((412, 366), "event invitations", font=subtitle_font, fill=(220, 230, 240))
    og.save(HERE / "og-image.png")

    print("Wrote icon-512.png, apple-touch-icon.png, favicon.png, favicon-32.png, og-image.png")


if __name__ == "__main__":
    main()
