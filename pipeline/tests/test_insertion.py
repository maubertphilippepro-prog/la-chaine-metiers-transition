from mtpipeline.insertion import (
    chapitres_apres_insertion, decalage_insertion, fusionner_analyse, integrer_rush, placer_rush, renumeroter,
    renumeroter_consignes,
)

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
