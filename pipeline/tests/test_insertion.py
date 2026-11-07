import json
import os
import shutil

import pytest

from mtpipeline.insertion import (
    chapitres_apres_insertion, construire_source, decalage_insertion, fusionner_analyse, integrer_rush, placer_rush,
    remplacer, renumeroter, renumeroter_consignes,
)
from mtpipeline.cli import analyser, ecrire, inserer, main
from mtpipeline.erreurs import ErreurEntree, ErreurSuggestions
from mtpipeline.preparation import sonder
from mtpipeline.reglages import charger_reglages
from mtpipeline.suggestions import ReponseIA

T, D = 10.0, 5.0


def mot(i, debut, texte="x"):
    return {"id": i, "texte": texte, "debut": debut, "fin": round(debut + 0.3, 4)}


def test_point_avant_apres_et_en_t():
    dec = decalage_insertion(T, D)
    assert dec.point(9.9) == 9.9
    assert dec.point(T) == 15.0
    assert dec.point(12.0) == 17.0


def test_intervalles_avant_apres_et_scinde():
    dec = decalage_insertion(T, D)
    avant = {"id": "m0", "debut": 8.0, "fin": T}
    apres = {"id": "m1", "debut": T, "fin": 11.0}
    cheval = {"id": "e2", "debut": 9.0, "fin": 12.0, "statut": "valide", "nature": "camera"}
    assert dec.intervalles([avant, apres, cheval]) == [
        avant,
        {"id": "m1", "debut": 15.0, "fin": 16.0},
        {"id": "e2", "debut": 9.0, "fin": T, "statut": "valide", "nature": "camera"},
        {"id": "e2-suite", "debut": 15.0, "fin": 17.0, "statut": "valide", "nature": "camera"},
    ]


def test_un_mot_ne_se_scinde_pas():
    dec = decalage_insertion(T, D)
    assert dec.mots([{"id": 0, "texte": "a", "debut": 9.8, "fin": 10.2}, {"id": 1, "texte": "b", "debut": 10.0, "fin": 10.4}]) == [
        {"id": 0, "texte": "a", "debut": 9.8, "fin": T},
        {"id": 1, "texte": "b", "debut": 15.0, "fin": 15.4},
    ]


def test_renumerote_dans_l_ordre_du_temps():
    mots, table = renumeroter([mot(0, 1.0, "a"), mot(1, 15.0, "c")], [mot(0, 11.0, "b")])
    assert [(m["id"], m["texte"]) for m in mots] == [(0, "a"), (1, "b"), (2, "c")]
    assert table == {0: 0, 1: 2}


def test_renumerote_les_consignes():
    fichier = {"version": 1, "consignes": [{
        "id": "c1", "texte": "t", "ancrage": {"premierMot": 0, "dernierMot": 1},
        "propositions": [
            {"operation": {"type": "couper", "premierMot": 0, "dernierMot": 1}, "etat": "en-attente", "explication": "e"},
            {"operation": {"type": "deplacerChapitre", "premierMotChapitre": 1, "nouveauPremierMot": 0}, "etat": "acceptee", "explication": "e"},
            {"operation": {"type": "ajouterTerme", "terme": "x", "definition": "d", "mots": [0, 1]}, "etat": "refusee", "explication": "e"},
            {"operation": {"type": "basculerCoupe", "idCoupe": "d3"}, "etat": "en-attente", "explication": "e"},
        ],
    }, {"id": "c2", "texte": "u", "ancrage": None, "propositions": []}]}
    r = renumeroter_consignes(fichier, {0: 0, 1: 2})
    c1 = r["consignes"][0]
    assert c1["ancrage"] == {"premierMot": 0, "dernierMot": 2}
    assert [p["operation"] for p in c1["propositions"]] == [
        {"type": "couper", "premierMot": 0, "dernierMot": 2},
        {"type": "deplacerChapitre", "premierMotChapitre": 2, "nouveauPremierMot": 0},
        {"type": "ajouterTerme", "terme": "x", "definition": "d", "mots": [0, 2]},
        {"type": "basculerCoupe", "idCoupe": "d3"},
    ]
    assert r["consignes"][1]["ancrage"] is None
    assert fichier["consignes"][0]["ancrage"] == {"premierMot": 0, "dernierMot": 1}


ANALYSE_RUSH = {
    "version": 1, "duree": 5.0, "fps": 30.0,
    "mots": [mot(0, 0.5, "b")],
    "detections": [{"id": "d0", "type": "silence", "debut": 0.0, "fin": 0.5},
                   {"id": "d1", "type": "hesitation", "debut": 1.0, "fin": 1.4, "paroles": "bon"}],
    "suggestions": {
        "chapitres": [{"titre": "Ignoré", "debut": 0.5}],
        "termes": [{"terme": "SSO", "definition": "D", "occurrences": [0.5], "origine": "ia"}],
        "longueurs": [{"id": "l0", "debut": 2.0, "fin": 3.0, "raison": "r"}],
        "elements": [{"id": "se0", "nature": "texte", "debut": 0.5, "fin": 0.8, "texte": "x.fr", "raison": "r"},
                     {"id": "se1", "nature": "zoom", "debut": 1.0, "fin": 2.0, "raison": "r"}],
    },
    "erreurSuggestions": None,
}


def test_place_le_rush_et_prefixe_ses_identifiants():
    r = placer_rush(ANALYSE_RUSH, 1, T)
    assert r["mots"][0]["debut"] == 10.5
    assert [d["id"] for d in r["detections"]] == ["r1-d0", "r1-d1"]
    assert r["detections"][0]["debut"] == T
    s = r["suggestions"]
    assert s["chapitres"] == []
    assert s["termes"][0]["occurrences"] == [10.5]
    assert s["longueurs"] == [{"id": "r1-l0", "debut": 12.0, "fin": 13.0, "raison": "r"}]
    assert [e["id"] for e in s["elements"]] == ["r1-se0", "r1-se1"]


def test_rush_sans_suggestions():
    assert placer_rush({**ANALYSE_RUSH, "suggestions": None}, 2, T)["suggestions"] is None


def test_fusionne_l_analyse():
    analyse = {"version": 1, "duree": 20.0, "fps": 30.0, "mots": [mot(0, 1.0, "a"), mot(1, 15.0, "c")],
               "detections": [{"id": "d0", "type": "silence", "debut": 16.0, "fin": 17.0}],
               "suggestions": {"chapitres": [{"titre": "A", "debut": 0}],
                               "termes": [{"terme": "sso", "definition": "Déjà", "occurrences": [1.0], "origine": "glossaire"}],
                               "longueurs": [], "elements": []},
               "erreurSuggestions": None}
    fusion, table = fusionner_analyse(analyse, placer_rush(ANALYSE_RUSH, 1, T), 25.0)
    assert fusion["duree"] == 25.0
    assert [m["texte"] for m in fusion["mots"]] == ["a", "b", "c"]
    assert table == {0: 0, 1: 2}
    assert [d["id"] for d in fusion["detections"]] == ["r1-d0", "r1-d1", "d0"]
    s = fusion["suggestions"]
    assert s["chapitres"] == [{"titre": "A", "debut": 0}]
    assert s["termes"] == [{"terme": "sso", "definition": "Déjà", "occurrences": [1.0, 10.5], "origine": "glossaire"}]
    assert [l["id"] for l in s["longueurs"]] == ["r1-l0"]


def test_suggestions_du_rush_sans_celles_du_tournage():
    analyse = {"version": 1, "duree": 20.0, "fps": 30.0, "mots": [], "detections": [], "suggestions": None,
               "erreurSuggestions": "API indisponible"}
    fusion, _ = fusionner_analyse(analyse, placer_rush(ANALYSE_RUSH, 1, T), 25.0)
    assert [l["id"] for l in fusion["suggestions"]["longueurs"]] == ["r1-l0"]
    assert fusion["erreurSuggestions"] == "API indisponible"


MOTS = [mot(0, 1.0), mot(1, 5.0), mot(2, 10.5), mot(3, 20.0)]
CHAPITRES = [{"titre": "Intro", "debut": 0}, {"titre": "Suite", "debut": 20.0}]


def test_t_au_milieu_d_un_chapitre():
    assert chapitres_apres_insertion(CHAPITRES, MOTS, T, D, "Rush") == [
        {"titre": "Intro", "debut": 0}, {"titre": "Rush", "debut": T},
        {"titre": "Intro", "debut": 15.0}, {"titre": "Suite", "debut": 25.0},
    ]


def test_t_juste_avant_un_chapitre():
    # « Insérer avant » le premier mot de « Suite » : T est la fin du mot d'avant, aucun mot d'Intro ne suit.
    assert chapitres_apres_insertion(CHAPITRES, MOTS, 10.8, D, "Rush") == [
        {"titre": "Intro", "debut": 0}, {"titre": "Rush", "debut": 10.8}, {"titre": "Suite", "debut": 25.0},
    ]


def test_t_en_debut_de_chapitre():
    assert chapitres_apres_insertion(CHAPITRES, MOTS, 20.0, D, "Rush") == [
        {"titre": "Intro", "debut": 0}, {"titre": "Rush", "debut": 20.0}, {"titre": "Suite", "debut": 25.0},
    ]


def test_t_zero():
    assert chapitres_apres_insertion(CHAPITRES, MOTS, 0, D, "Rush") == [
        {"titre": "Rush", "debut": 0}, {"titre": "Intro", "debut": D}, {"titre": "Suite", "debut": 25.0},
    ]


def test_t_fin():
    assert chapitres_apres_insertion(CHAPITRES, MOTS, 20.3, D, "Outro") == [
        {"titre": "Intro", "debut": 0}, {"titre": "Suite", "debut": 20.0}, {"titre": "Outro", "debut": 20.3},
    ]


def test_integre_le_rush_au_montage():
    montage = {"version": 1, "titre": "T",
               "coupes": [{"id": "m0", "type": "manuelle", "debut": 1.0, "fin": 1.3, "active": True}],
               "chapitres": [{"titre": "Intro", "debut": 0}],
               "termes": [{"terme": "SSO", "definition": "Validée", "occurrences": [1.0], "statut": "valide", "position": "haut"}],
               "elements": []}
    chapitres = [{"titre": "Intro", "debut": 0}, {"titre": "Rush", "debut": T}]
    m = integrer_rush(montage, placer_rush(ANALYSE_RUSH, 1, T), chapitres)
    assert m["coupes"][1:] == [
        {"id": "r1-d0", "type": "silence", "debut": 10.0, "fin": 10.5, "active": True},
        {"id": "r1-d1", "type": "hesitation", "debut": 11.0, "fin": 11.4, "active": False},
        {"id": "r1-l0", "type": "longueur", "debut": 12.0, "fin": 13.0, "active": False, "enAttente": True},
    ]
    assert m["chapitres"] == chapitres
    assert m["termes"] == [{"terme": "SSO", "definition": "Validée", "occurrences": [1.0, 10.5], "statut": "valide", "position": "haut"}]
    assert m["elements"] == [
        {"id": "r1-se0", "debut": 10.5, "fin": 10.8, "statut": "a-valider", "nature": "texte", "texte": "x.fr", "position": "haut-gauche"},
        {"id": "r1-se1", "debut": 11.0, "fin": 12.0, "statut": "a-valider", "nature": "zoom", "zone": None},
    ]


def test_terme_nouveau_du_rush():
    montage = {"version": 1, "titre": "T", "coupes": [], "chapitres": [], "termes": []}
    m = integrer_rush(montage, placer_rush(ANALYSE_RUSH, 1, T), [])
    assert m["termes"] == [{"terme": "SSO", "definition": "D", "occurrences": [10.5], "statut": "a-valider", "position": "bas"}]
    assert len(m["elements"]) == 2


@pytest.mark.parametrize("t", [0.0, 1.0, 2.0])
def test_construire_source(video_test, tmp_path, t):
    source = video_test("source.mp4", duree=2)
    rush = video_test("rush.mp4", duree=1)
    sortie = tmp_path / "nouvelle.mp4"
    construire_source(source, rush, t, 2.0, 1.0, 30.0, sortie)
    info = sonder(sortie)
    assert info["duree"] == pytest.approx(3.0, abs=0.1)
    assert (info["largeur"], info["hauteur"], info["fps"], info["audio"]) == (1920, 1080, 30.0, True)


def test_remplacer_reessaie_quand_le_fichier_est_tenu(tmp_path, monkeypatch):
    nouveau, cible = tmp_path / "nouveau", tmp_path / "cible"
    nouveau.write_text("nouveau")
    cible.write_text("ancien")
    vrai = os.replace
    essais = []

    def replace(a, b):
        essais.append(a)
        if len(essais) < 3:
            raise PermissionError("tenu par le lecteur")
        vrai(a, b)
    monkeypatch.setattr("mtpipeline.insertion.os.replace", replace)
    remplacer(nouveau, cible, attente=0)
    assert cible.read_text() == "nouveau"
    assert len(essais) == 3


REGLAGES = charger_reglages()
MOTS_SOURCE = [{"id": 0, "texte": "Bonjour", "debut": 0.2, "fin": 0.6}, {"id": 1, "texte": "tous", "debut": 1.5, "fin": 1.9}]
MOTS_RUSH = [{"id": 0, "texte": "oubli", "debut": 0.1, "fin": 0.5}, {"id": 1, "texte": "réparé", "debut": 0.6, "fin": 0.9}]


def lire(chemin):
    return json.loads(chemin.read_text(encoding="utf-8"))


def faux_transcrire(chemin, modele):
    return MOTS_RUSH if "rushs" in str(chemin) else MOTS_SOURCE


def sans_suggestions(mots, glossaire, modele, **kwargs):
    return ReponseIA(chapitres=[], termes=[], longueurs=[], elements=[])


@pytest.fixture(autouse=True)
def sans_whisper(monkeypatch):
    monkeypatch.setattr("mtpipeline.cli.transcrire_extraits", lambda audio, intervalles, modele: [""] * len(intervalles))


@pytest.fixture
def tournage_analyse(tmp_path, video_test):
    dossier = tmp_path / "2026-10-27-test"
    (dossier / "bruts").mkdir(parents=True)
    shutil.move(video_test("prise1.mp4"), dossier / "bruts" / "prise1.mp4")
    analyser(dossier, "Test", REGLAGES, faux_transcrire, sans_suggestions, tmp_path / "glossaire.json")
    ecrire(dossier / "montage.json", {"version": 1, "titre": "Test", "coupes": [],
                                      "chapitres": [{"titre": "Intro", "debut": 0}], "termes": [], "elements": []})
    ecrire(dossier / "consignes.json", {"version": 1, "consignes": [{
        "id": "c1", "date": "2026-10-27T10:00:00Z", "texte": "x", "ancrage": {"premierMot": 1, "dernierMot": 1},
        "reformulation": "", "nonRealisable": [], "propositions": []}]})
    (dossier / "rushs").mkdir()
    return dossier


@pytest.fixture
def rush(video_test, tournage_analyse):
    chemin = tournage_analyse / "rushs" / "oubli.mp4"
    shutil.move(video_test("oubli.mp4", duree=1), chemin)
    return chemin


def contenu(dossier):
    return {f.name: f.read_bytes() for f in dossier.iterdir() if f.is_file()}


def test_inserer_un_rush(tournage_analyse, rush, tmp_path):
    compte_rendu = inserer(tournage_analyse, rush, 1.0, "Oubli", REGLAGES, faux_transcrire, sans_suggestions,
                           tmp_path / "glossaire.json")
    assert "inséré" in compte_rendu
    d = sonder(tournage_analyse / "rushs" / "1" / "source.mp4")["duree"]
    assert sonder(tournage_analyse / "source.mp4")["duree"] == pytest.approx(2.0 + d, abs=0.1)
    analyse = lire(tournage_analyse / "analyse.json")
    assert [(m["id"], m["texte"]) for m in analyse["mots"]] == [(0, "Bonjour"), (1, "oubli"), (2, "réparé"), (3, "tous")]
    assert analyse["mots"][1]["debut"] == pytest.approx(1.1)
    assert analyse["mots"][3]["debut"] == pytest.approx(1.5 + d, abs=0.001)
    assert lire(tournage_analyse / "transcription.json") == analyse["mots"]
    assert [c["titre"] for c in lire(tournage_analyse / "montage.json")["chapitres"]] == ["Intro", "Oubli", "Intro"]
    assert lire(tournage_analyse / "consignes.json")["consignes"][0]["ancrage"] == {"premierMot": 3, "dernierMot": 3}
    preparation = lire(tournage_analyse / "preparation.json")
    assert preparation["duree"] == analyse["duree"]
    assert preparation["rushs"][0] | {"duree": None} == {"numero": 1, "fichier": "oubli.mp4", "a": 1.0, "duree": None,
                                                        "titre": "Oubli", "erreurSuggestions": None}
    assert (tournage_analyse / "rushs" / "1" / "oubli.mp4").exists()
    sauvegarde, = (tournage_analyse / "historique").iterdir()
    assert sauvegarde.name.endswith("-rush-1")
    assert {"source.mp4", "montage.json", "consignes.json", "analyse.json"} <= {f.name for f in sauvegarde.iterdir()}


def test_rush_sans_audio_laisse_le_tournage_intact(tournage_analyse, video_test, tmp_path):
    muet = tournage_analyse / "rushs" / "muet.mp4"
    shutil.move(video_test("muet.mp4", audio=False), muet)
    avant = contenu(tournage_analyse)
    with pytest.raises(ErreurEntree, match="aucune piste audio"):
        inserer(tournage_analyse, muet, 1.0, "Oubli", REGLAGES, faux_transcrire, sans_suggestions, tmp_path / "glossaire.json")
    assert contenu(tournage_analyse) == avant
    assert not (tournage_analyse / "historique").exists()


def test_echec_des_suggestions_non_bloquant(tournage_analyse, rush, tmp_path):
    def en_erreur(mots, glossaire, modele, **kwargs):
        raise ErreurSuggestions("API indisponible")
    assert "API indisponible" in inserer(tournage_analyse, rush, 1.0, "Oubli", REGLAGES, faux_transcrire, en_erreur,
                                         tmp_path / "glossaire.json")
    assert lire(tournage_analyse / "preparation.json")["rushs"][0]["erreurSuggestions"] == "API indisponible"


def test_refuse_un_instant_hors_de_la_video(tournage_analyse, rush, tmp_path):
    with pytest.raises(ErreurEntree, match="hors de la vidéo"):
        inserer(tournage_analyse, rush, 99.0, "X", REGLAGES, faux_transcrire, sans_suggestions, tmp_path / "glossaire.json")


def test_refuse_un_tournage_non_analyse(tmp_path, video_test):
    with pytest.raises(ErreurEntree, match="pas encore analysé"):
        inserer(tmp_path, video_test("r.mp4"), 0, "X", REGLAGES)


def test_commande_inserer(tournage_analyse, rush, monkeypatch, capsys):
    monkeypatch.setattr("mtpipeline.cli.transcrire", faux_transcrire)
    monkeypatch.setattr("mtpipeline.cli.demander", sans_suggestions)
    assert main(["inserer", str(tournage_analyse), str(rush), "--a", "1.0", "--titre", "Oubli"]) == 0
    assert "inséré" in capsys.readouterr().out
