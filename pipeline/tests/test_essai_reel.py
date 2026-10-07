import json

import pytest

from mtpipeline.reglages import RACINE

DOSSIER = RACINE / "donnees" / "tournages" / "2026-10-essai"


@pytest.mark.gpu
@pytest.mark.skipif(not (DOSSIER / "analyse.json").exists(), reason="vidéo d'essai absente")
def test_essai_reel_detecte_hesitations_et_silences():
    a = json.loads((DOSSIER / "analyse.json").read_text(encoding="utf-8"))
    types = {d["type"] for d in a["detections"]}
    assert {"silence", "hesitation", "repetition"} <= types
    assert a["suggestions"] is not None
    assert len(a["suggestions"]["chapitres"]) >= 2
