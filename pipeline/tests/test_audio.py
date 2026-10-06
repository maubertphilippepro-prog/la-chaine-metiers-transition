import numpy as np
import pytest

from mtpipeline.audio import TAUX, charger_audio
from mtpipeline.erreurs import ErreurEntree


def test_charger_audio(video_test):
    audio = charger_audio(video_test("a.mp4", duree=2))
    assert audio.dtype == np.float32
    assert len(audio) / TAUX == pytest.approx(2, abs=0.1)
    assert 0.05 < np.abs(audio).max() <= 1.0


def test_charger_audio_file_corrupted(tmp_path):
    """Fichier corrompé → ErreurEntree avec le nom du fichier."""
    chemin = tmp_path / "corrompu.mp4"
    chemin.write_bytes(b"random garbage data not a valid mp4")

    with pytest.raises(ErreurEntree) as exc_info:
        charger_audio(chemin)

    assert "corrompu.mp4" in str(exc_info.value)
