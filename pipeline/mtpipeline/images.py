"""Images de la publication : enregistrements caméra, images extraites d'une vidéo, photos détourées."""
import os
import subprocess
from pathlib import Path
from typing import Callable

from PIL import Image, ImageOps, UnidentifiedImageError

from .erreurs import ErreurEntree
from .preparation import _executer, _extrait

EXTENSIONS = {".mp4", ".mkv", ".mov", ".webm"}
SUFFIXE_CAMERA = "-camera"

Retirer = Callable[[Image.Image], Image.Image]


def est_camera(chemin: Path) -> bool:
    """Enregistrement de la webcam seule (plugin OBS Source Record) : sert aux vignettes, pas au montage."""
    return chemin.stem.lower().endswith(SUFFIXE_CAMERA)


def lister_bruts(dossier: Path) -> list[Path]:
    return sorted(p for p in dossier.iterdir() if p.suffix.lower() in EXTENSIONS and not est_camera(p))


def extraire_image(video: Path, instant: float, sortie: Path) -> None:
    if instant < 0:
        raise ErreurEntree(f"instant négatif : {instant}.")
    sortie.parent.mkdir(parents=True, exist_ok=True)
    try:
        _executer(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{instant:.3f}", "-i", str(video),
                   "-frames:v", "1", str(sortie)])
    except subprocess.CalledProcessError as e:
        raise ErreurEntree(f"{video.name} : image à {instant:.3f} s impossible à extraire ({_extrait(e.stderr)}).") from e
    if not sortie.exists():
        raise ErreurEntree(f"{video.name} : aucune image à {instant:.3f} s (au-delà de la fin ?).")


def retirer_fond(modele: str) -> Retirer:
    """Détourage par rembg, exécuté localement ; le modèle est téléchargé au premier usage."""
    try:
        from rembg import new_session, remove
        session = new_session(modele)
    except Exception as e:  # import ou téléchargement du modèle
        raise ErreurEntree(f"Détourage indisponible ({modele}) : {e}") from e
    return lambda image: remove(image, session=session)


def detourer(entree: Path, sortie: Path, retirer: Retirer) -> None:
    try:
        with Image.open(entree) as image:
            # Une photo de téléphone porte son orientation dans l'EXIF : on la redresse avant de détourer.
            source = ImageOps.exif_transpose(image).convert("RGB")
    except (OSError, UnidentifiedImageError, ValueError) as e:
        raise ErreurEntree(f"{entree.name} : image illisible ({e}).") from e
    resultat = retirer(source).convert("RGBA")
    sortie.parent.mkdir(parents=True, exist_ok=True)
    temporaire = sortie.with_name(sortie.name + ".tmp")
    resultat.save(temporaire, format="PNG")
    os.replace(temporaire, sortie)
