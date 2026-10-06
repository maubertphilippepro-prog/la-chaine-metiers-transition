import json
import shutil

import pytest

from mtpipeline.cli import analyser, relancer_suggestions
from mtpipeline.erreurs import ErreurEntree, ErreurSuggestions
from mtpipeline.reglages import RACINE, charger_reglages
from mtpipeline.suggestions import ChapitreIA, ReponseIA

REGLAGES = charger_reglages()
MOTS = [{"id": 0, "texte": "Bonjour", "debut": 0.2, "fin": 0.6},
        {"id": 1, "texte": "tous", "debut": 1.5, "fin": 1.9}]


def faux_transcrire(chemin, modele):
    faux_transcrire.appels += 1
    return MOTS


def faux_demander(mots, glossaire, modele):
    return ReponseIA(chapitres=[ChapitreIA(titre="Intro", premier_mot=0)], termes=[], longueurs=[])


def demander_en_erreur(mots, glossaire, modele):
    raise ErreurSuggestions("API indisponible")


@pytest.fixture
def tournage(tmp_path, video_test):
    dossier = tmp_path / "2026-10-06-test"
    (dossier / "bruts").mkdir(parents=True)
    shutil.move(video_test("prise1.mp4"), dossier / "bruts" / "prise1.mp4")
    faux_transcrire.appels = 0
    return dossier


def test_analyse_complete(tournage, tmp_path):
    a = analyser(tournage, "Test", REGLAGES, faux_transcrire, faux_demander, tmp_path / "glossaire.json")
    assert a["mots"] == MOTS
    assert a["suggestions"]["chapitres"] == [{"titre": "Intro", "debut": 0.2}]
    assert a["erreurSuggestions"] is None
    for f in ["source.mp4", "transcription.json", "detections.json", "analyse.json", "episode.json"]:
        assert (tournage / f).exists(), f
    episode = json.loads((tournage / "episode.json").read_text(encoding="utf-8"))
    assert episode == {"version": 1, "titre": "Test", "statut": "analyse", "message": None}


def test_format_conforme_a_la_fixture(tournage, tmp_path):
    a = analyser(tournage, "Test", REGLAGES, faux_transcrire, faux_demander, tmp_path / "glossaire.json")
    fixture = json.loads((RACINE / "fixtures" / "analyse-exemple.json").read_text(encoding="utf-8"))
    assert set(a) == set(fixture)
    assert set(a["suggestions"]) == set(fixture["suggestions"])
    assert set(a["detections"][0]) == set(fixture["detections"][0])


def test_reprise_sans_retranscrire(tournage, tmp_path):
    analyser(tournage, "Test", REGLAGES, faux_transcrire, faux_demander, tmp_path / "glossaire.json")
    analyser(tournage, "Test", REGLAGES, faux_transcrire, faux_demander, tmp_path / "glossaire.json")
    assert faux_transcrire.appels == 1


def test_echec_claude_non_bloquant_puis_relance(tournage, tmp_path):
    a = analyser(tournage, "Test", REGLAGES, faux_transcrire, demander_en_erreur, tmp_path / "glossaire.json")
    assert a["suggestions"] is None
    assert a["erreurSuggestions"] == "API indisponible"
    b = relancer_suggestions(tournage, REGLAGES, faux_demander, tmp_path / "glossaire.json")
    assert b["suggestions"]["chapitres"][0]["titre"] == "Intro"
    assert b["erreurSuggestions"] is None


def test_entree_invalide_marque_l_episode_en_erreur(tmp_path, video_test):
    dossier = tmp_path / "mauvais"
    (dossier / "bruts").mkdir(parents=True)
    shutil.move(video_test("petit.mp4", largeur=1280, hauteur=720), dossier / "bruts" / "petit.mp4")
    with pytest.raises(ErreurEntree):
        analyser(dossier, "Test", REGLAGES, faux_transcrire, faux_demander, tmp_path / "glossaire.json")
    episode = json.loads((dossier / "episode.json").read_text(encoding="utf-8"))
    assert episode["statut"] == "erreur"
    assert "1920x1080" in episode["message"]
