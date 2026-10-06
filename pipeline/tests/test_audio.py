import numpy as np
import pytest

from mtpipeline.audio import TAUX, charger_audio


def test_charger_audio(video_test):
    audio = charger_audio(video_test("a.mp4", duree=2))
    assert audio.dtype == np.float32
    assert len(audio) / TAUX == pytest.approx(2, abs=0.1)
    assert 0.05 < np.abs(audio).max() <= 1.0
