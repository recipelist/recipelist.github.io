# Raster icon drawn from the same mark as favicon.svg and the .brand-logo in
# index.html: a pot with a rising curl of steam.
#
# The mark is redrawn here rather than converted, because no SVG rasteriser is
# installed and depending on one would make the icon unbuildable on a machine
# without it. Geometry is given in favicon.svg's own 40x40 viewBox and scaled
# per size, so the two stay comparable by reading them side by side.
#
# **Keep the three copies in step**: favicon.svg, the .brand-logo inline SVG in
# index.html, and this file. If the mark changes, change all three and re-run.
#
#     python tools/make-icon.py            # writes assets/icon-512.png
#     python tools/make-icon.py 192 512    # any sizes you like
import os
import sys
import math
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
ASSETS = os.path.join(ROOT, "assets")

BG = (20, 17, 14, 255)          # --bg in dark mode
BROWN = (210, 166, 121, 255)    # --accent in dark mode, the light brown
SS = 8                          # supersample factor, for clean edges

VIEW = 40.0                     # favicon.svg's viewBox
STROKE = 3.0                    # its stroke-width
RADIUS = 9.0                    # its rounded-rect corner


def arc_points(cx, cy, r, a0, a1, n=24):
    """Points along an arc, angles in degrees, y growing downwards."""
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
             cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / n)))
            for i in range(n + 1)]


def bezier_points(p0, p1, p2, p3, n=24):
    """Points along a cubic bezier, matching the SVG's c command."""
    out = []
    for i in range(n + 1):
        t = i / n
        m = 1 - t
        out.append((m * m * m * p0[0] + 3 * m * m * t * p1[0] + 3 * m * t * t * p2[0] + t * t * t * p3[0],
                    m * m * m * p0[1] + 3 * m * m * t * p1[1] + 3 * m * t * t * p2[1] + t * t * t * p3[1]))
    return out


# M9 18 h22 v8 a6 6 0 0 1 -6 6 H15 a6 6 0 0 1 -6 -6 z
POT = ([(9, 18), (31, 18), (31, 26)]
       + arc_points(25, 26, 6, 0, 90)
       + [(15, 32)]
       + arc_points(15, 26, 6, 90, 180)
       + [(9, 18)])

# M9 22 H6   M31 22 h3
HANDLES = [[(9, 22), (6, 22)], [(31, 22), (34, 22)]]

# M20 14 c3 -2 3 -4 0 -6
STEAM = bezier_points((20, 14), (23, 12), (23, 10), (20, 8))


def draw(size):
    """The mark at `size` px, drawn large and downsampled."""
    px = size * SS
    scale = px / VIEW
    img = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    d.rounded_rectangle([0, 0, px - 1, px - 1], radius=RADIUS * scale, fill=BG)

    w = max(1, round(STROKE * scale))
    r = w / 2.0

    def stroke(pts):
        """One path, drawn the way SVG's stroke-linejoin/linecap: round would.

        Pillow has neither round joins nor round caps: `joint="curve"` leaves a
        notch on a sharp corner, and consecutive thick segments do not quite
        meet on the outside of a bend, which shows as a hairline crack once the
        supersample is scaled down. Dropping a disc on every vertex fills both,
        and on the two ends it doubles as the cap.
        """
        scaled = [(x * scale, y * scale) for x, y in pts]
        d.line(scaled, fill=BROWN, width=w)
        for x, y in scaled:
            d.ellipse([x - r, y - r, x + r, y + r], fill=BROWN)

    stroke(POT)
    for seg in HANDLES:
        stroke(seg)
    stroke(STEAM)

    return img.resize((size, size), Image.LANCZOS)


def main():
    sizes = [int(a) for a in sys.argv[1:]] or [512]
    os.makedirs(ASSETS, exist_ok=True)
    for size in sizes:
        path = os.path.join(ASSETS, "icon-%d.png" % size)
        draw(size).save(path)
        print("wrote %s (%dx%d)" % (os.path.relpath(path, ROOT), size, size))


if __name__ == "__main__":
    main()
