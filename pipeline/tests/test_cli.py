import json
import shutil

import pytest

from mtpipeline.cli import analyser, main, relancer_suggestions
from mtpipeline.erreurs import ErreurEntree, ErreurSuggestions
from mtpipeline.reglages import RACINE, charger_reglages
from mtpipeline.suggestions import ChapitreIA, ReponseIA

REGLAGES = charger_reglages()
MOTS = [{"id": 0, "texte": "Bonjour", "debut": 0.2, "fin": 0.6},
        {"id": 1, "texte": "tous", "debut": 1.5, "fin": 1.9}]


def faux_transcrire(chemin, modele):
    faux_transcrire.appels += 1
    return MOTS


def faux_demander(mots, glossaire, modele, **kwargs):
    faux_demander.kwargs = kwargs
    return ReponseIA(chapitres=[ChapitreIA(titre="Intro", premier_mot=0)], termes=[], longueurs=[])


def demander_en_erreur(mots, glossaire, modele, **kwargs):
    raise ErreurSuggestions("API indisponible")


@pytest.fixture(autouse=True)
def sans_whisper(monkeypatch):
    """Les hésitations ne sont jamais réécoutées par le vrai Whisper dans ces tests."""
    monkeypatch.setattr("mtpipeline.cli.transcrire_extraits", lambda audio, intervalles, modele: [""] * len(intervalles))


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
    shutil.move(video_test("petit.mp4", largeur=1280, hauteur=1024), dossier / "bruts" / "petit.mp4")
    with pytest.raises(ErreurEntree):
        analyser(dossier, "Test", REGLAGES, faux_transcrire, faux_demander, tmp_path / "glossaire.json")
    episode = json.loads((dossier / "episode.json").read_text(encoding="utf-8"))
    assert episode["statut"] == "erreur"
    assert "16:9 d'au moins 1280x720" in episode["message"]


def test_echec_extraction_audio_marque_l_episode_en_erreur(tournage, tmp_path, monkeypatch):
    def audio_impossible(chemin):
        raise ErreurEntree("source.mp4 : extraction audio impossible")

    monkeypatch.setattr("mtpipeline.cli.charger_audio", audio_impossible)
    with pytest.raises(ErreurEntree):
        analyser(tournage, "Test", REGLAGES, faux_transcrire, faux_demander, tmp_path / "glossaire.json")
    episode = json.loads((tournage / "episode.json").read_text(encoding="utf-8"))
    assert episode["statut"] == "erreur"
    assert episode["message"] == "source.mp4 : extraction audio impossible"


def test_glossaire_illisible_non_bloquant(tournage, tmp_path):
    glossaire = tmp_path / "glossaire.json"
    glossaire.write_text("{pas du json", encoding="utf-8")
    a = analyser(tournage, "Test", REGLAGES, faux_transcrire, faux_demander, glossaire)
    assert a["suggestions"] is None
    assert a["erreurSuggestions"].startswith("glossaire.json illisible")
    assert not (tournage / "suggestions.json").exists()


def test_dossier_bruts_absent(tmp_path):
    dossier = tmp_path / "vide"
    dossier.mkdir()
    with pytest.raises(ErreurEntree, match="bruts/ introuvable"):
        analyser(dossier, "Test", REGLAGES, faux_transcrire, faux_demander, tmp_path / "glossaire.json")
    episode = json.loads((dossier / "episode.json").read_text(encoding="utf-8"))
    assert episode["statut"] == "erreur"
    assert "bruts/ introuvable" in episode["message"]


def test_relance_sans_analyse_prealable(tmp_path):
    dossier = tmp_path / "vide"
    dossier.mkdir()
    with pytest.raises(ErreurEntree, match="analyse incomplète"):
        relancer_suggestions(dossier, REGLAGES, faux_demander, tmp_path / "glossaire.json")


def test_ecritures_atomiques_sans_fichier_temporaire(tournage, tmp_path):
    analyser(tournage, "Test", REGLAGES, faux_transcrire, faux_demander, tmp_path / "glossaire.json")
    assert list(tournage.glob("*.tmp")) == []


def test_dossier_inexistant_analyser(tmp_path):
    dossier = tmp_path / "inexistant"
    with pytest.raises(ErreurEntree, match="introuvable"):
        analyser(dossier, "Test", REGLAGES, faux_transcrire, faux_demander, tmp_path / "glossaire.json")
    # Vérifier que le dossier n'a pas été créé
    assert not dossier.exists()


def test_dossier_inexistant_relancer_suggestions(tmp_path):
    dossier = tmp_path / "inexistant"
    with pytest.raises(ErreurEntree, match="introuvable"):
        relancer_suggestions(dossier, REGLAGES, faux_demander, tmp_path / "glossaire.json")
    # Vérifier que le dossier n'a pas été créé
    assert not dossier.exists()


def test_main_entree_invalide_retourne_1(tmp_path, capsys):
    dossier = tmp_path / "vide"
    dossier.mkdir()
    assert main(["analyser", str(dossier), "--titre", "T"]) == 1
    assert "Erreur :" in capsys.readouterr().err


def test_main_dossier_inexistant(tmp_path, capsys):
    dossier = tmp_path / "inexistant"
    assert main(["analyser", str(dossier), "--titre", "T"]) == 1
    assert "Erreur :" in capsys.readouterr().err


def test_episode_existant_complete_sans_perte(tournage, tmp_path):
    (tournage / "episode.json").write_text(
        json.dumps({"version": 1, "titre": "Ancien", "statut": "valide", "message": None, "episodes": [1]}),
        encoding="utf-8",
    )
    analyser(tournage, "Test", REGLAGES, faux_transcrire, faux_demander, tmp_path / "glossaire.json")
    episode = json.loads((tournage / "episode.json").read_text(encoding="utf-8"))
    assert episode["episodes"] == [1]
    assert (episode["titre"], episode["statut"], episode["message"]) == ("Test", "analyse", None)


def test_episode_illisible_remplace(tournage, tmp_path):
    (tournage / "episode.json").write_text("{pas du json", encoding="utf-8")
    analyser(tournage, "Test", REGLAGES, faux_transcrire, faux_demander, tmp_path / "glossaire.json")
    episode = json.loads((tournage / "episode.json").read_text(encoding="utf-8"))
    assert episode == {"version": 1, "titre": "Test", "statut": "analyse", "message": None}


def test_erreur_inattendue_marque_l_episode(tournage, tmp_path):
    def transcrire_en_panne(chemin, modele):
        raise RuntimeError("CUDA out of memory")

    with pytest.raises(RuntimeError):
        analyser(tournage, "Test", REGLAGES, transcrire_en_panne, faux_demander, tmp_path / "glossaire.json")
    episode = json.loads((tournage / "episode.json").read_text(encoding="utf-8"))
    assert episode["statut"] == "erreur"
    assert "CUDA out of memory" in episode["message"]


def test_longueur_de_definition_transmise(tournage, tmp_path):
    analyser(tournage, "Test", REGLAGES, faux_transcrire, faux_demander, tmp_path / "glossaire.json")
    assert faux_demander.kwargs == {"max_caracteres": REGLAGES["definitionMaxCaracteres"]}


def test_analyse_d_un_webm(tmp_path, video_test):
    dossier = tmp_path / "essai"
    (dossier / "bruts").mkdir(parents=True)
    shutil.move(video_test("essai.webm", largeur=1280, hauteur=720), dossier / "bruts" / "essai.webm")
    faux_transcrire.appels = 0
    a = analyser(dossier, "Test", REGLAGES, faux_transcrire, faux_demander, tmp_path / "glossaire.json")
    assert a["mots"] == MOTS
    assert (dossier / "source.mp4").exists()
    assert (dossier / "bruts" / "essai.webm").exists()


def test_hesitation_reecoutee_avec_des_mots_signalee(tournage, tmp_path):
    # Entre « Bonjour » et « tous », la vidéo de test a du son : c'est une hésitation.
    reecoutes = []

    def extraits(audio, intervalles, modele):
        reecoutes.extend(intervalles)
        return ["il y a"] * len(intervalles)

    a = analyser(tournage, "Test", REGLAGES, faux_transcrire, faux_demander, tmp_path / "glossaire.json",
                 extraits_fn=extraits)
    hesitations = [d for d in a["detections"] if d["type"] == "hesitation"]
    assert reecoutes == [(d["debut"], d["fin"]) for d in hesitations]
    assert all(d["paroles"] == "il y a" for d in hesitations)
