import json
import subprocess

import numpy as np
import pytest

from mtpipeline.cli import ecrire, main
from mtpipeline.erreurs import ErreurEntree
from mtpipeline.recalage import MARQUE, fonction_recalage, recaler, table_recalage


def lire(chemin):
    return json.loads(chemin.read_text(encoding="utf-8"))


@pytest.fixture
def source_trouee(tmp_path):
    """3 s de son dont les horodatages sautent de 0,5 s à 1 s : 3,5 s de vidéo."""
    son = tmp_path / "son.mka"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
                    "-af", r"asetpts=PTS+gte(T\,1)*0.5/TB", "-c:a", "libopus", str(son)], check=True)
    video = tmp_path / "source.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=30:duration=3.5",
                    "-i", str(son), "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "ultrafast",
                    "-c:a", "copy", "-f", "matroska", str(video)], check=True)
    return video


def test_table_recalage(source_trouee):
    contigu, reel = table_recalage(source_trouee)
    f = fonction_recalage(contigu, reel, 3.5)
    assert f(0) == 0
    assert f(0.5) == pytest.approx(0.5, abs=0.03)
    assert f(2.0) == pytest.approx(2.5, abs=0.03)
    assert f(10) == 3.5


def test_fonction_recalage_extrapole_le_dernier_ecart():
    f = fonction_recalage(np.array([0.0, 1.0, 2.0]), np.array([0.0, 1.0, 2.5]), 100)
    assert f(1.5) == pytest.approx(1.75)
    assert f(3.0) == pytest.approx(3.5)


@pytest.fixture
def tournage(tmp_path, source_trouee):
    dossier = tmp_path / "t"
    dossier.mkdir()
    source_trouee.rename(dossier / "source.mp4")
    mots = [{"id": 0, "texte": "a", "debut": 0.2, "fin": 0.4}, {"id": 1, "texte": "b", "debut": 2.0, "fin": 2.2}]
    detections = [{"id": "s0", "type": "silence", "debut": 0.0, "fin": 0.2}, {"id": "s1", "type": "silence", "debut": 1.5, "fin": 2.0}]
    suggestions = {"chapitres": [{"titre": "A", "debut": 0}], "termes": [{"terme": "b", "definition": "d", "occurrences": [2.0], "origine": "ia"}],
                   "longueurs": [], "elements": [{"id": "se0", "nature": "texte", "debut": 2.0, "fin": 2.2, "texte": "b", "raison": "r"}]}
    ecrire(dossier / "preparation.json", {"duree": 3.5, "fps": 30.0})
    ecrire(dossier / "transcription.json", mots)
    ecrire(dossier / "detections.json", detections)
    ecrire(dossier / "suggestions.json", suggestions)
    ecrire(dossier / "analyse.json", {"version": 1, "duree": 3.5, "fps": 30.0, "mots": mots, "detections": detections,
                                      "suggestions": suggestions, "erreurSuggestions": None})
    ecrire(dossier / "montage.json", {
        "version": 1, "titre": "T",
        "coupes": [{"id": "m0", "type": "manuelle", "debut": 2.0, "fin": 2.2, "active": True}],
        "chapitres": [{"titre": "A", "debut": 0}, {"titre": "B", "debut": 2.0}],
        "termes": [{"terme": "b", "definition": "d", "occurrences": [2.0], "statut": "valide", "position": "bas"}],
        "elements": [{"id": "e0", "debut": 0.2, "fin": 2.2, "statut": "valide", "nature": "camera"}],
    })
    return dossier


def test_recaler_tournage(tournage):
    print(recaler(tournage, ecrire))
    mots = lire(tournage / "transcription.json")
    assert mots[1]["debut"] == pytest.approx(2.5, abs=0.03)
    assert mots[0]["debut"] == pytest.approx(0.2, abs=0.03)
    m = lire(tournage / "montage.json")
    assert m["chapitres"][0]["debut"] == 0
    assert m["chapitres"][1]["debut"] == mots[1]["debut"]
    assert m["coupes"][0]["debut"] == mots[1]["debut"]
    assert m["termes"][0]["occurrences"] == [mots[1]["debut"]]
    assert m["elements"][0]["fin"] == mots[1]["fin"]
    assert lire(tournage / "detections.json")[0]["debut"] == 0
    a = lire(tournage / "analyse.json")
    assert a["mots"] == mots
    assert a["suggestions"]["elements"][0]["debut"] == mots[1]["debut"]
    assert a["duree"] == 3.5
    assert lire(tournage / "preparation.json")[MARQUE] is True
    sauvegardes = list((tournage / "historique").iterdir())
    assert lire(sauvegardes[0] / "transcription.json")[1]["debut"] == 2.0


def test_recaler_deux_fois_ne_fait_rien(tournage):
    recaler(tournage, ecrire)
    avant = lire(tournage / "transcription.json")
    assert "Déjà recalé" in recaler(tournage, ecrire)
    assert lire(tournage / "transcription.json") == avant


def test_recaler_analyse_incomplete(tmp_path):
    with pytest.raises(ErreurEntree, match="incomplète"):
        recaler(tmp_path, ecrire)


def test_commande_recaler(tournage, capsys):
    assert main(["recaler", str(tournage)]) == 0
    assert "recalés" in capsys.readouterr().out
