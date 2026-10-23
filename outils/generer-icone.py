"""Génère outils/metiers-transition.ico : le symbole du logo public/logo/metiers-transition.svg, sans le texte
(illisible en 16 px). Lancé une fois ; l'icône est versionnée."""
from pathlib import Path

from PIL import Image, ImageDraw

ICI = Path(__file__).resolve().parent
COTE = 1024  # dessiné en grand puis réduit : bords lissés
TAILLES = [16, 24, 32, 48, 64, 128, 256]
# Couleurs du symbole, reprises du svg imbriqué de metiers-transition.svg (repère 24 × 32).
ROUGE, BLEU, BLEU_GRIS = "#D40025", "#0F3285", "#7B9DC4"


def dessiner() -> Image.Image:
    image = Image.new("RGBA", (COTE, COTE), (0, 0, 0, 0))
    d = ImageDraw.Draw(image)
    echelle = COTE / 32
    gauche = (COTE - 24 * echelle) / 2

    def pt(x: float, y: float) -> tuple[float, float]:
        return gauche + x * echelle, y * echelle

    d.rectangle([pt(0, 0), pt(24, 32)], fill=ROUGE)
    d.rectangle([pt(0, 0), pt(3, 32)], fill=BLEU)
    d.rectangle([pt(21, 0), pt(24, 32)], fill=BLEU)
    d.polygon([pt(3, 2), pt(21, 14), pt(3, 24)], fill=BLEU_GRIS)
    d.polygon([pt(3, 20), pt(21, 27), pt(3, 31)], fill=BLEU)
    return image.resize((256, 256), Image.LANCZOS)


if __name__ == "__main__":
    dessiner().save(ICI / "metiers-transition.ico", sizes=[(t, t) for t in TAILLES])
