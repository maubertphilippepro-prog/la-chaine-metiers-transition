"""Image réduite pour Claude : JPEG, 800 px au plus sur le grand côté, écrite en base64 sur la sortie standard.

    python reduire_image.py <image>
"""
import base64
import io
import sys

from PIL import Image

COTE_MAX = 800


def reduire(chemin: str) -> str:
    image = Image.open(chemin)
    if image.mode in ("RGBA", "LA", "P"):
        # Logos et poses détourées : fond blanc, comme sur la vignette.
        fond = Image.new("RGB", image.size, (255, 255, 255))
        fond.paste(image.convert("RGBA"), mask=image.convert("RGBA").split()[3])
        image = fond
    image = image.convert("RGB")
    image.thumbnail((COTE_MAX, COTE_MAX))
    tampon = io.BytesIO()
    image.save(tampon, "JPEG", quality=85)
    return base64.b64encode(tampon.getvalue()).decode("ascii")


if __name__ == "__main__":
    sys.stdout.write(reduire(sys.argv[1]))
