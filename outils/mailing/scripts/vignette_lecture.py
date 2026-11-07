"""Copie de la vignette d'une vidéo avec un bouton de lecture au centre, pour montrer qu'elle est cliquable.

    python vignette_lecture.py <vignette source> <vignette du mail>
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

# Dessin à 4x puis réduction : bords du cercle et du triangle lissés.
ECHELLE = 4


def ajouter_lecture(source: Path, cible: Path) -> None:
    image = Image.open(source).convert("RGB")
    l, h = image.size
    rayon = round(min(l, h) * 0.14)
    calque = Image.new("RGBA", (l * ECHELLE, h * ECHELLE), (0, 0, 0, 0))
    d = ImageDraw.Draw(calque)
    cx, cy, r = l * ECHELLE // 2, h * ECHELLE // 2, rayon * ECHELLE
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(0, 0, 0, 150), outline=(255, 255, 255, 235), width=max(ECHELLE, r // 14))
    t = r * 0.45
    # Triangle décalé vers la droite pour paraître centré à l'œil.
    d.polygon([(cx - t * 0.7, cy - t), (cx - t * 0.7, cy + t), (cx + t * 1.05, cy)], fill=(255, 255, 255, 245))
    calque = calque.resize((l, h), Image.LANCZOS)
    image.paste(calque, (0, 0), calque)
    cible.parent.mkdir(parents=True, exist_ok=True)
    image.save(cible, "JPEG", quality=90)


if __name__ == "__main__":
    ajouter_lecture(Path(sys.argv[1]), Path(sys.argv[2]))
