import subprocess
from pathlib import Path

import numpy as np

TAUX = 16000


def charger_audio(chemin: Path) -> np.ndarray:
    brut = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-i", str(chemin), "-vn", "-ac", "1", "-ar", str(TAUX),
         "-f", "s16le", "-"],
        check=True, capture_output=True,
    ).stdout
    return np.frombuffer(brut, dtype=np.int16).astype(np.float32) / 32768.0
