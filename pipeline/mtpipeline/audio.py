import subprocess
from pathlib import Path

import numpy as np

from .erreurs import ErreurEntree

TAUX = 16000


def _extrait(texte: bytes | None) -> str:
    """Extrait les 3 dernières lignes de stderr (max 300 chars)."""
    try:
        decoded = (texte or b"").decode("utf-8", errors="replace")
        lignes = decoded.strip().splitlines()
        return " / ".join(lignes[-3:])[:300] or "aucun détail"
    except Exception:
        return "aucun détail"


def charger_audio(chemin: Path) -> np.ndarray:
    try:
        brut = subprocess.run(
            ["ffmpeg", "-loglevel", "error", "-i", str(chemin), "-vn", "-ac", "1", "-ar", str(TAUX),
             "-f", "s16le", "-"],
            check=True, capture_output=True,
        ).stdout
    except subprocess.CalledProcessError as e:
        raise ErreurEntree(
            f"{chemin.name} : extraction audio impossible ({_extrait(e.stderr)})"
        ) from e
    except FileNotFoundError as e:
        raise ErreurEntree("ffmpeg introuvable : vérifiez son installation.") from e

    return np.frombuffer(brut, dtype=np.int16).astype(np.float32) / 32768.0
