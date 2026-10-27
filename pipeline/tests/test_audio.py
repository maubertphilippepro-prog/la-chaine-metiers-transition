import subprocess

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


def test_charger_audio_suit_les_horodatages(tmp_path):
    """Un trou dans les horodatages de l'audio (enregistrement .webm) reste du silence : sans cela,
    les temps des mots prendraient de l'avance sur la vidéo, d'autant plus que l'on avance."""
    son = tmp_path / "son.mka"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
                    "-af", r"asetpts=PTS+gte(T\,1)*0.5/TB", "-c:a", "libopus", str(son)], check=True)
    video = tmp_path / "trou.mkv"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=30:duration=3.5",
                    "-i", str(son), "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "ultrafast",
                    "-c:a", "copy", str(video)], check=True)
    audio = charger_audio(video)
    assert len(audio) / TAUX == pytest.approx(3.5, abs=0.05)
    # Le son reprend à 1,5 s, après une demi-seconde de silence.
    assert np.abs(audio[int(1.1 * TAUX):int(1.4 * TAUX)]).max() < 0.01
    assert np.abs(audio[int(1.6 * TAUX):int(1.9 * TAUX)]).max() > 0.05
