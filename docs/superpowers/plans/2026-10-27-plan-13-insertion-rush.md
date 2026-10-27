# Plan 13 : insérer un rush dans un tournage — plan de mise en œuvre

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** depuis la barre de sélection du texte, l'auteur insère une vidéo tournée à part (un « rush ») avant ou après le passage choisi ; `source.mp4` est reconstruite avec le rush, tout ce qui suit est décalé, et l'analyse du rush (mots, coupes, suggestions) est fusionnée dans le tournage sans perdre le montage ni les consignes.

**Architecture :** côté pipeline, une commande `mtpipeline inserer` analyse le rush seul dans `rushs/<N>/`, sauvegarde le tournage dans `historique/`, reconstruit la source en un passage ffmpeg, puis décale et fusionne tous les JSON en mémoire avant de les remplacer (`source.mp4` en dernier). Les fonctions pures vivent dans `pipeline/mtpipeline/insertion.py` ; le décalage des fichiers est celui du recalage, rendu générique (`Decalage`). Côté serveur, `PUT/POST/GET /api/tournages/<nom>/rush` déposent le rush, lancent l'insertion par `SuiviAnalyse` (un seul travail lourd à la fois) et en donnent l'état. Côté interface, deux boutons de la barre ouvrent un petit formulaire ; pendant l'insertion, l'écran de montage cède la place à un écran d'attente, puis le montage est rechargé.

**Tech Stack :** Python 3 (pytest, ffmpeg), TypeScript, React 19, Node `http`, Vitest.

Spec : [2026-10-27-insertion-rush-design.md](../specs/2026-10-27-insertion-rush-design.md).

## Global Constraints

- Tout en français : identifiants, commentaires, messages, libellés (style du code existant : `ErreurEntree`, `ErreurHttp`, `raisonX`).
- `source.mp4` reste l'unique vidéo du tournage ; le montage reste dans l'ordre de la source.
- Le rush est déposé dans `rushs/` du tournage, jamais dans `bruts/` ; un nom pris reçoit `-2`, `-3`… Le dossier de travail est `rushs/<N>/` (N = 1 pour le premier rush inséré, d'après `preparation.json` → `rushs`) ; il est vidé au début d'une insertion et gardé à la fin, avec le fichier du rush.
- Règle de décalage (précise la fonction f de la spec) : un instant t < T ne bouge pas, un instant t ≥ T devient t + d (un chapitre ou un mot qui commence en T passe après le rush) ; un intervalle qui finit en T ou avant ne bouge pas, un intervalle qui commence en T ou après est décalé, un intervalle à cheval sur T est scindé (partie d'avant : même `id`, partie d'après : `<id>-suite`). Un mot n'est jamais scindé : à cheval sur T, il s'arrête en T. Arrondi à 4 décimales comme le recalage.
- Identifiants du rush préfixés `r<N>-` (détections, longueurs, éléments suggérés). Mots renumérotés 0, 1, 2… dans l'ordre du temps ; la table ancien → nouveau est appliquée aux consignes (`ancrage`, `premierMot`, `dernierMot`, `premierMotChapitre`, `nouveauPremierMot`, `mots`).
- Chapitres : un chapitre en T au titre donné (par défaut « Nouveau chapitre ») ; si des mots du chapitre coupé suivent T (avant le chapitre suivant), un chapitre en T + d reprend son titre. Les suggestions de chapitres du rush sont ignorées.
- Sûreté : rien n'est écrit dans le tournage avant la fin (hors `historique/` et `rushs/`) ; JSON puis `source.mp4` en dernier, chacun par écriture puis renommage. Un échec de la préparation du rush laisse le tournage intact.
- Refus 409 : analyse en cours (de n'importe quel tournage), rendu ou envoi de vidéo sur ce tournage, tournage non analysé, T hors de [0, durée].
- Statut : « validé » ou « rendu » → « en validation » après une insertion réussie. `publication.json` et `rendus/` ne sont pas touchés.
- Libellés : « Insérer un rush avant », « Insérer un rush après », « Insérer », « Annuler », « Insertion d’un rush » ; étapes : préparation, transcription, repérage des coupes, suggestions, « Reconstruction de la vidéo ».
- Commandes : `npm test`, `npm run typecheck` (depuis la racine) ; `..\.venv\Scripts\python -m pytest` (depuis `pipeline/`, Git Bash : `../.venv/Scripts/python.exe -m pytest`).
- Fin de chaque message de commit : ligne vide puis `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Messages en français, au style du dépôt (« Pipeline : … », « Studio : … », « Documentation : … »).

## Fichiers

| Fichier | Rôle |
|---|---|
| `pipeline/mtpipeline/recalage.py` (modifié) | `Decalage`, `decalage_ponctuel`, `decaler_donnees` (en mémoire), `FICHIERS_DECALES` |
| `pipeline/mtpipeline/insertion.py` (créé) | Fonctions pures de l'insertion, reconstruction de la source, `remplacer` |
| `pipeline/mtpipeline/preparation.py` (modifié) | `preparer(..., fps=None)` : cadence imposée |
| `pipeline/mtpipeline/cli.py` (modifié) | `etapes_analyse`, `inserer`, commande `inserer` |
| `pipeline/tests/test_recalage.py` (modifié) | Test de `decaler_donnees` |
| `pipeline/tests/test_insertion.py` (créé) | Tests des fonctions pures, de ffmpeg et de la commande |
| `pipeline/tests/test_preparation.py` (modifié) | Cadence imposée |
| `studio/commun.ts` (modifié) | `EtapeInsertion`, `EtatInsertion`, `insertionEnCours`, `publicationEngagee` |
| `studio/serveur/suivi-analyse.ts` (modifié) | Nature du travail, avertissement |
| `studio/serveur/nouveau-tournage.ts` (modifié) | `nomVideoDemande`, `avecEnvoi`, `ecrireEnFlux` |
| `studio/serveur/rush.ts` (créé) | Dépôt du rush, demande, étape, avertissement, publication engagée |
| `studio/serveur/api.ts` (modifié) | Routes `rush`, garde pendant l'insertion |
| `studio/serveur/pipeline.ts`, `principal.ts` (modifiés) | `insererRush` |
| `studio/serveur/api.test.ts` (modifié) | Tests des routes |
| `studio/src/logique/rush.ts` (créé) + test | Point d'insertion, rappel, message de fin, libellés |
| `studio/src/api.ts` (modifié) | `deposerRush`, `insererRush`, `etatInsertion` |
| `studio/src/useMontage.ts` (modifié) | `enregistrerMaintenant` |
| `studio/src/composants/FormulaireRush.tsx` (créé) | Formulaire dans la barre |
| `studio/src/composants/AttenteInsertion.tsx` (créé) | Écran d'attente |
| `studio/src/composants/Texte.tsx`, `EcranMontage.tsx`, `LigneTournage.tsx` (modifiés) | Boutons, enchaînement, libellé de la liste |
| `docs/studio.md` (modifié) | Insérer un rush |

---

### Task 1 : recalage — décalage en mémoire, générique

**Files:**
- Modify: `pipeline/mtpipeline/recalage.py`
- Test: `pipeline/tests/test_recalage.py`

**Interfaces:**
- Produces :
  - `Decalage(point: Callable[[float], float], intervalles: Callable[[list[dict]], list[dict]], mots: Callable[[list[dict]], list[dict]])` (dataclass figée).
  - `decalage_ponctuel(f: Callable[[float], float]) -> Decalage`.
  - `decaler_donnees(donnees: dict[str, object], dec: Decalage) -> dict[str, object]` : copie, l'original n'est pas modifié ; clés = noms de fichier (`transcription.json`, `detections.json`, `suggestions.json`, `montage.json`, `analyse.json`), les autres clés sont rendues telles quelles.
  - `FICHIERS_DECALES: tuple[str, ...]`.
  - `decaler_tournage(dossier: Path, dec: Decalage, ecrire) -> None` (signature changée : reçoit un `Decalage`).

- [ ] **Step 1 : test qui échoue**

Dans `pipeline/tests/test_recalage.py`, compléter l'import :

```python
from mtpipeline.recalage import MARQUE, decalage_ponctuel, decaler_donnees, fonction_recalage, recaler, table_recalage
```

et ajouter :

```python
def test_decaler_donnees_ne_modifie_pas_l_original():
    montage = {"coupes": [{"id": "m0", "debut": 1.0, "fin": 2.0}], "chapitres": [{"titre": "A", "debut": 1.0}], "termes": []}
    lus = {"montage.json": montage, "episode.json": {"titre": "T"}}
    r = decaler_donnees(lus, decalage_ponctuel(lambda t: t + 1))
    assert r["montage.json"]["coupes"][0] == {"id": "m0", "debut": 2.0, "fin": 3.0}
    assert r["montage.json"]["chapitres"] == [{"titre": "A", "debut": 2.0}]
    assert "elements" not in r["montage.json"]
    assert r["episode.json"] == {"titre": "T"}
    assert montage["coupes"][0]["debut"] == 1.0
```

- [ ] **Step 2 : vérifier l'échec**

Run (depuis `pipeline/`) : `../.venv/Scripts/python.exe -m pytest tests/test_recalage.py -v`
Expected : erreur d'import (`decalage_ponctuel`).

- [ ] **Step 3 : implémentation**

Dans `pipeline/mtpipeline/recalage.py`, ajouter `from dataclasses import dataclass` et remplacer `_intervalles`, `_suggestions`, `_montage` et `decaler_tournage` par :

```python
@dataclass(frozen=True)
class Decalage:
    """Comment changent les temps d'un tournage : instants (débuts de chapitre, occurrences de termes), listes
    d'intervalles (coupes, détections, longueurs, éléments) et mots."""
    point: Callable[[float], float]
    intervalles: Callable[[list[dict]], list[dict]]
    mots: Callable[[list[dict]], list[dict]]


def decalage_ponctuel(f: Callable[[float], float]) -> Decalage:
    """f appliquée à chaque instant et à chaque borne d'intervalle."""
    def intervalles(liste: list[dict]) -> list[dict]:
        return [{**x, "debut": f(x["debut"]), "fin": f(x["fin"])} for x in liste]
    return Decalage(f, intervalles, intervalles)


def _termes(termes: list[dict], dec: Decalage) -> list[dict]:
    return [{**t, "occurrences": [dec.point(o) for o in t["occurrences"]]} for t in termes]


def _chapitres(chapitres: list[dict], dec: Decalage) -> list[dict]:
    return [{**c, "debut": dec.point(c["debut"])} for c in chapitres]


def _suggestions(s: dict | None, dec: Decalage) -> dict | None:
    if not s:
        return s
    return {
        **s,
        "chapitres": _chapitres(s.get("chapitres", []), dec),
        "termes": _termes(s.get("termes", []), dec),
        "longueurs": dec.intervalles(s.get("longueurs", [])),
        # Absent dans une analyse faite avant les éléments à l'écran.
        **({"elements": dec.intervalles(s["elements"])} if "elements" in s else {}),
    }


def _montage(m: dict, dec: Decalage) -> dict:
    return {
        **m,
        "coupes": dec.intervalles(m["coupes"]),
        "chapitres": _chapitres(m["chapitres"], dec),
        "termes": _termes(m["termes"], dec),
        **({"elements": dec.intervalles(m["elements"])} if "elements" in m else {}),
    }


# Fichiers dont les temps suivent la source.
FICHIERS_DECALES = ("transcription.json", "detections.json", "suggestions.json", "montage.json", "analyse.json")


def decaler_donnees(donnees: dict, dec: Decalage) -> dict:
    """Copie de donnees (nom de fichier → contenu) où tous les temps sont passés par dec ; les autres fichiers
    sont rendus tels quels."""
    transformations = {
        "transcription.json": dec.mots,
        "detections.json": dec.intervalles,
        "suggestions.json": lambda s: _suggestions(s, dec),
        "montage.json": lambda m: _montage(m, dec),
        "analyse.json": lambda a: {
            **a,
            "mots": dec.mots(a["mots"]),
            "detections": dec.intervalles(a["detections"]),
            "suggestions": _suggestions(a["suggestions"], dec),
        },
    }
    return {nom: transformations[nom](contenu) if nom in transformations else contenu for nom, contenu in donnees.items()}


def _lire(chemin: Path):
    return json.loads(chemin.read_text(encoding="utf-8"))


def decaler_tournage(dossier: Path, dec: Decalage, ecrire) -> None:
    """Applique dec à tous les temps des fichiers d'analyse et du montage qui existent."""
    lus = {nom: _lire(dossier / nom) for nom in FICHIERS_DECALES if (dossier / nom).exists()}
    for nom, contenu in decaler_donnees(lus, dec).items():
        ecrire(dossier / nom, contenu)
```

(Garder `_lire` une seule fois dans le fichier.) Dans `recaler`, remplacer l'appel par :

```python
    decaler_tournage(dossier, decalage_ponctuel(fonction_recalage(contigu, reel, preparation["duree"])), ecrire)
```

- [ ] **Step 4 : vérifier**

Run : `../.venv/Scripts/python.exe -m pytest tests/test_recalage.py -v`
Expected : tous PASS (dont `test_recaler_tournage`, inchangé).

- [ ] **Step 5 : commit**

```bash
git add pipeline/mtpipeline/recalage.py pipeline/tests/test_recalage.py
git commit -m "Pipeline : décalage des temps d'un tournage en mémoire, réutilisable hors recalage"
```

---

### Task 2 : pipeline — fonctions pures de l'insertion

**Files:**
- Create: `pipeline/mtpipeline/insertion.py`
- Test: `pipeline/tests/test_insertion.py`

**Interfaces:**
- Consumes : `Decalage`, `decalage_ponctuel` (Task 1).
- Produces (dans `mtpipeline.insertion`) :
  - `decalage_insertion(t: float, d: float) -> Decalage`
  - `renumeroter(mots_tournage: list[dict], mots_rush: list[dict]) -> tuple[list[dict], dict[int, int]]`
  - `renumeroter_consignes(fichier: dict, table: dict[int, int]) -> dict`
  - `placer_rush(analyse: dict, n: int, t: float) -> dict` → `{"mots", "detections", "suggestions"}`
  - `fusionner_analyse(analyse: dict, rush: dict, duree: float) -> tuple[dict, dict[int, int]]`
  - `chapitres_apres_insertion(chapitres: list[dict], mots: list[dict], t: float, d: float, titre: str) -> list[dict]`
  - `integrer_rush(montage: dict, rush: dict, chapitres: list[dict]) -> dict`

- [ ] **Step 1 : tests qui échouent**

Créer `pipeline/tests/test_insertion.py` :

```python
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
```

- [ ] **Step 2 : vérifier l'échec**

Run : `../.venv/Scripts/python.exe -m pytest tests/test_insertion.py -v`
Expected : `ModuleNotFoundError: mtpipeline.insertion`.

- [ ] **Step 3 : implémentation**

Créer `pipeline/mtpipeline/insertion.py` :

```python
"""Insertion d'un rush dans un tournage analysé : la source est reconstruite avec le rush à l'instant T, tout ce qui
suit est décalé de la durée d du rush, puis l'analyse du rush, analysé seul, est fusionnée dans celle du tournage."""
import math

from .recalage import Decalage, decalage_ponctuel

PRECISION = 4
# Champs d'une opération de consigne qui désignent un mot par son numéro.
CHAMPS_MOT = ("premierMot", "dernierMot", "premierMotChapitre", "nouveauPremierMot")


def decalage_insertion(t: float, d: float) -> Decalage:
    """Ce qui commence en T ou après passe après le rush ; ce qui finit en T ou avant ne bouge pas. Un intervalle à
    cheval sur T est scindé, la partie d'après prenant l'identifiant <id>-suite ; un mot à cheval s'arrête en T."""
    def point(x: float) -> float:
        return x if x < t else round(x + d, PRECISION)

    def intervalles(liste: list[dict]) -> list[dict]:
        resultat = []
        for x in liste:
            if x["fin"] <= t:
                resultat.append(x)
            elif x["debut"] >= t:
                resultat.append({**x, "debut": point(x["debut"]), "fin": point(x["fin"])})
            else:
                resultat.append({**x, "fin": t})
                suite = {**x, "debut": round(t + d, PRECISION), "fin": point(x["fin"])}
                if "id" in x:
                    suite["id"] = f"{x['id']}-suite"
                resultat.append(suite)
        return resultat

    def mots(liste: list[dict]) -> list[dict]:
        return [
            x if x["fin"] <= t else {**x, "fin": t} if x["debut"] < t
            else {**x, "debut": point(x["debut"]), "fin": point(x["fin"])}
            for x in liste
        ]
    return Decalage(point, intervalles, mots)


def renumeroter(mots_tournage: list[dict], mots_rush: list[dict]) -> tuple[list[dict], dict[int, int]]:
    """Mots du tournage (décalés) et du rush (placés) dans l'ordre du temps, numérotés 0, 1, 2… comme le suppose le
    studio ; renvoie aussi la table ancien → nouveau numéro des mots du tournage."""
    tous = sorted(
        [(m["debut"], 0, i, m) for i, m in enumerate(mots_tournage)]
        + [(m["debut"], 1, i, m) for i, m in enumerate(mots_rush)],
        key=lambda x: x[:3],
    )
    mots, table = [], {}
    for _, origine, _, m in tous:
        if origine == 0:
            table[m["id"]] = len(mots)
        mots.append({**m, "id": len(mots)})
    return mots, table


def renumeroter_consignes(fichier: dict, table: dict[int, int]) -> dict:
    """Consignes dont les numéros de mots suivent la renumérotation ; un numéro inconnu est gardé tel quel."""
    def mot(i):
        return table.get(i, i)

    def operation(op: dict) -> dict:
        nouvelle = {**op, **{c: mot(op[c]) for c in CHAMPS_MOT if isinstance(op.get(c), int)}}
        if isinstance(op.get("mots"), list):
            nouvelle["mots"] = [mot(i) for i in op["mots"]]
        return nouvelle

    def consigne(c: dict) -> dict:
        a = c.get("ancrage")
        return {
            **c,
            "ancrage": {**a, "premierMot": mot(a["premierMot"]), "dernierMot": mot(a["dernierMot"])} if a else a,
            "propositions": [{**p, "operation": operation(p["operation"])} for p in c.get("propositions", [])],
        }
    return {**fichier, "consignes": [consigne(c) for c in fichier.get("consignes", [])]}


def placer_rush(analyse: dict, n: int, t: float) -> dict:
    """Mots, détections et suggestions du rush placés à l'instant T de la source, identifiants préfixés r<N>- pour ne
    jamais rencontrer ceux du tournage. Les chapitres suggérés sont ignorés : l'auteur donne le titre du chapitre."""
    dec = decalage_ponctuel(lambda x: round(x + t, PRECISION))

    def prefixer(liste: list[dict]) -> list[dict]:
        return [{**x, "id": f"r{n}-{x['id']}"} for x in liste]

    s = analyse["suggestions"]
    suggestions = None if s is None else {
        "chapitres": [],
        "termes": [{**x, "occurrences": [dec.point(o) for o in x["occurrences"]]} for x in s["termes"]],
        "longueurs": prefixer(dec.intervalles(s["longueurs"])),
        "elements": prefixer(dec.intervalles(s.get("elements", []))),
    }
    return {"mots": dec.mots(analyse["mots"]), "detections": prefixer(dec.intervalles(analyse["detections"])),
            "suggestions": suggestions}


def _debut(x: dict) -> float:
    return x["debut"]


def _fusionner_termes(termes: list[dict], nouveaux: list[dict], convertir) -> list[dict]:
    """Un terme déjà présent (sans tenir compte de la casse) ne reçoit que les nouvelles occurrences."""
    resultat = [dict(t) for t in termes]
    index = {t["terme"].lower(): t for t in resultat}
    for n in nouveaux:
        connu = index.get(n["terme"].lower())
        if connu:
            connu["occurrences"] = sorted(set(connu["occurrences"]) | set(n["occurrences"]))
        else:
            ajout = convertir(n)
            resultat.append(ajout)
            index[n["terme"].lower()] = ajout
    return resultat


def _fusionner_suggestions(tournage: dict | None, rush: dict | None) -> dict | None:
    if rush is None:
        return tournage
    base = tournage or {"chapitres": [], "termes": [], "longueurs": [], "elements": []}
    return {
        **base,
        "termes": _fusionner_termes(base["termes"], rush["termes"], dict),
        "longueurs": sorted(base["longueurs"] + rush["longueurs"], key=_debut),
        "elements": sorted(base.get("elements", []) + rush["elements"], key=_debut),
    }


def fusionner_analyse(analyse: dict, rush: dict, duree: float) -> tuple[dict, dict[int, int]]:
    """Analyse du tournage (déjà décalée) complétée par le rush placé ; renvoie aussi la table des numéros de mots."""
    mots, table = renumeroter(analyse["mots"], rush["mots"])
    return {
        **analyse,
        "duree": duree,
        "mots": mots,
        "detections": sorted(analyse["detections"] + rush["detections"], key=_debut),
        "suggestions": _fusionner_suggestions(analyse["suggestions"], rush["suggestions"]),
    }, table


def chapitres_apres_insertion(chapitres: list[dict], mots: list[dict], t: float, d: float, titre: str) -> list[dict]:
    """Chapitres d'avant l'insertion une fois le rush inséré en T : un chapitre en T au titre donné et, si des mots du
    chapitre coupé suivent T, sa suite en T + d sous le même titre. Un chapitre qui commence en T passe après le rush."""
    tries = sorted(chapitres, key=_debut)
    suivant = next((c["debut"] for c in tries if c["debut"] >= t), math.inf)
    coupe = next((c for c in reversed(tries) if c["debut"] < t), None)
    milieu = coupe is not None and any(t <= m["debut"] < suivant for m in mots)
    decales = [c if c["debut"] < t else {**c, "debut": round(c["debut"] + d, PRECISION)} for c in tries]
    ajouts = [{"titre": titre, "debut": t}]
    if milieu:
        ajouts.append({"titre": coupe["titre"], "debut": round(t + d, PRECISION)})
    return sorted(decales + ajouts, key=_debut)


def integrer_rush(montage: dict, rush: dict, chapitres: list[dict]) -> dict:
    """Montage (déjà décalé) complété par le rush placé, comme un montage initial : détections actives sauf
    hésitations à paroles, longueurs en attente, termes (un terme connu ne reçoit que les nouvelles occurrences),
    éléments à valider ; les chapitres sont ceux donnés."""
    s = rush["suggestions"] or {"termes": [], "longueurs": [], "elements": []}
    coupes = [{"id": d["id"], "type": d["type"], "debut": d["debut"], "fin": d["fin"], "active": not d.get("paroles")}
              for d in rush["detections"]]
    coupes += [{"id": l["id"], "type": "longueur", "debut": l["debut"], "fin": l["fin"], "active": False, "enAttente": True}
               for l in s["longueurs"]]

    def terme(t: dict) -> dict:
        return {"terme": t["terme"], "definition": t["definition"], "occurrences": list(t["occurrences"]),
                "statut": "valide" if t["origine"] == "glossaire" else "a-valider", "position": "bas"}

    def element(e: dict) -> dict:
        commun = {"id": e["id"], "debut": e["debut"], "fin": e["fin"], "statut": "a-valider"}
        if e["nature"] == "texte":
            return {**commun, "nature": "texte", "texte": e.get("texte", ""), "position": "haut-gauche"}
        return {**commun, "nature": e["nature"], "zone": None}

    return {
        **montage,
        "coupes": montage["coupes"] + coupes,
        "chapitres": chapitres,
        "termes": _fusionner_termes(montage["termes"], s["termes"], terme),
        "elements": montage.get("elements", []) + [element(e) for e in s["elements"]],
    }
```

- [ ] **Step 4 : vérifier**

Run : `../.venv/Scripts/python.exe -m pytest tests/test_insertion.py -v`
Expected : tous PASS.

- [ ] **Step 5 : commit**

```bash
git add pipeline/mtpipeline/insertion.py pipeline/tests/test_insertion.py
git commit -m "Pipeline : décalage, renumérotation et fusion de l'analyse d'un rush inséré"
```

---

### Task 3 : pipeline — préparation à la cadence de la source et reconstruction de la vidéo

**Files:**
- Modify: `pipeline/mtpipeline/preparation.py`, `pipeline/mtpipeline/insertion.py`
- Test: `pipeline/tests/test_preparation.py`, `pipeline/tests/test_insertion.py`

**Interfaces:**
- Produces :
  - `preparer(bruts: list[Path], sortie: Path, fps: float | None = None) -> dict`
  - `construire_source(source: Path, rush: Path, t: float, duree_source: float, duree_rush: float, fps: float, sortie: Path) -> None` (dans `insertion.py`)
  - `remplacer(temporaire: Path, cible: Path, essais: int = 10, attente: float = 0.5) -> None` (dans `insertion.py`)

- [ ] **Step 1 : tests qui échouent**

Dans `pipeline/tests/test_preparation.py`, ajouter :

```python
def test_preparer_a_la_cadence_imposee(video_test, tmp_path):
    info = preparer([video_test("rush.mp4")], tmp_path / "sortie.mp4", fps=25.0)
    assert info["fps"] == 25.0
```

Dans `pipeline/tests/test_insertion.py`, compléter les imports :

```python
import os

import pytest

from mtpipeline.insertion import (
    chapitres_apres_insertion, construire_source, decalage_insertion, fusionner_analyse, integrer_rush, placer_rush,
    remplacer, renumeroter, renumeroter_consignes,
)
from mtpipeline.preparation import sonder
```

et ajouter :

```python
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
```

- [ ] **Step 2 : vérifier l'échec**

Run : `../.venv/Scripts/python.exe -m pytest tests/test_preparation.py tests/test_insertion.py -v`
Expected : `TypeError` (argument `fps`) et `ImportError` (`construire_source`).

- [ ] **Step 3 : implémentation**

Dans `pipeline/mtpipeline/preparation.py`, changer `preparer` :

```python
def preparer(bruts: list[Path], sortie: Path, fps: float | None = None) -> dict:
    """Prépare source.mp4 en 1920×1080. `fps` impose la cadence (rush inséré : celle de la source du tournage)."""
    if not bruts:
        raise ErreurEntree("Aucun fichier vidéo dans bruts/.")
    infos = [sonder(b) for b in bruts]
    for b, info in zip(bruts, infos):
        verifier(info, b.name)

    pleine_hd = (infos[0]["largeur"], infos[0]["hauteur"]) == (1920, 1080)
    meme_cadence = fps is None or abs(infos[0]["fps"] - fps) < 0.01
    if len(bruts) == 1 and pleine_hd and not est_cadence_variable(infos[0]) and meme_cadence:
        if bruts[0].suffix.lower() == ".mp4":
            try:
                shutil.copyfile(bruts[0], sortie)
            except OSError as e:
                raise ErreurEntree(f"{bruts[0].name} : copie impossible vers {sortie.name} ({e}).") from e
        else:
            _ffmpeg(["-i", str(bruts[0]), "-c", "copy", "-movflags", "+faststart", str(sortie)])
        return sonder(sortie)

    cadence = cadence_cible(infos[0]) if fps is None else f"{fps:g}"
    with tempfile.TemporaryDirectory() as dossier:
        liste = Path(dossier) / "liste.txt"
        liste.write_text(
            "".join(f"file '{_echapper(b)}'\n" for b in bruts), encoding="utf-8"
        )
        _ffmpeg(["-f", "concat", "-safe", "0", "-i", str(liste),
                 "-vf", f"scale=1920:1080:flags=lanczos,fps={cadence}", "-c:v", "libx264", "-preset", "fast", "-crf", "18",
                 "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", str(sortie)])
    return sonder(sortie)
```

Dans `pipeline/mtpipeline/insertion.py`, ajouter en tête :

```python
import os
import time
from pathlib import Path

from .audio import SUIVRE_HORODATAGES
from .preparation import _ffmpeg
```

et à la fin :

```python
def construire_source(source: Path, rush: Path, t: float, duree_source: float, duree_rush: float, fps: float,
                      sortie: Path) -> None:
    """source[0, T] + rush + source[T, fin] en un seul passage ffmpeg, réencodée comme dans la préparation. La source
    est ouverte deux fois (une entrée par morceau) ; l'audio suit ses horodatages, comme pour l'analyse, et chaque
    morceau dure exactement sa part (silence ajouté ou fin coupée)."""
    morceaux = [m for m in [(0, 0.0, t), (1, 0.0, duree_rush), (2, t, duree_source)] if m[2] - m[1] > 0]
    filtres = []
    for k, (entree, debut, fin) in enumerate(morceaux):
        longueur = fin - debut
        filtres.append(f"[{entree}:v]trim=start={debut}:end={fin},setpts=PTS-STARTPTS,"
                       f"scale=1920:1080:flags=lanczos,setsar=1,format=yuv420p[v{k}]")
        filtres.append(f"[{entree}:a]{SUIVRE_HORODATAGES},atrim=start={debut}:end={fin},asetpts=PTS-STARTPTS,"
                       f"aformat=sample_rates=48000:channel_layouts=stereo,apad=whole_dur={longueur},"
                       f"atrim=end={longueur}[a{k}]")
    entrees = "".join(f"[v{k}][a{k}]" for k in range(len(morceaux)))
    filtres.append(f"{entrees}concat=n={len(morceaux)}:v=1:a=1[cv][a]")
    # fps comble les trous d'images entre morceaux en répétant la dernière.
    filtres.append(f"[cv]fps={fps:g}[v]")
    _ffmpeg(["-i", str(source), "-i", str(rush), "-i", str(source), "-filter_complex", ";".join(filtres),
             "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
             "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", str(sortie)])


def remplacer(temporaire: Path, cible: Path, essais: int = 10, attente: float = 0.5) -> None:
    """os.replace, réessayé un moment : sous Windows, le lecteur du studio peut tenir la vidéo ouverte un instant."""
    for i in range(essais):
        try:
            os.replace(temporaire, cible)
            return
        except PermissionError:
            if i == essais - 1:
                raise
            time.sleep(attente)
```

- [ ] **Step 4 : vérifier**

Run : `../.venv/Scripts/python.exe -m pytest tests/test_preparation.py tests/test_insertion.py -v`
Expected : tous PASS (la préparation existante aussi).

- [ ] **Step 5 : commit**

```bash
git add pipeline/mtpipeline/preparation.py pipeline/mtpipeline/insertion.py pipeline/tests/test_preparation.py pipeline/tests/test_insertion.py
git commit -m "Pipeline : préparation à une cadence imposée, reconstruction de la source avec un rush"
```

---

### Task 4 : pipeline — commande `inserer`

**Files:**
- Modify: `pipeline/mtpipeline/cli.py`
- Test: `pipeline/tests/test_insertion.py`

**Interfaces:**
- Consumes : Tasks 1 à 3.
- Produces :
  - `etapes_analyse(dossier: Path, preparer_source: Callable[[Path], dict], reglages: dict, transcrire_fn, extraits_fn) -> list[dict]` (mots).
  - `inserer(dossier: Path, rush: Path, t: float, titre: str, reglages: dict, transcrire_fn=None, demander_fn=None, glossaire_chemin: Path | None = None, extraits_fn=None) -> str` (compte rendu).
  - Commande : `mtpipeline inserer <dossier> <rush> --a <t> [--titre "<titre>"]` (titre par défaut « Nouveau chapitre »).
  - `preparation.json` gagne `rushs: [{"numero", "fichier", "a", "duree", "titre", "erreurSuggestions"}]` ; le serveur (Task 5) lit sa longueur et le dernier `erreurSuggestions`.
  - Le rush analysé seul écrit `rushs/<N>/preparation.json`, `transcription.json`, `detections.json`, `suggestions.json` (si Claude a répondu) puis `analyse.json` : le serveur en déduit l'étape (Task 5).

- [ ] **Step 1 : tests qui échouent**

Dans `pipeline/tests/test_insertion.py`, ajouter les imports :

```python
import json
import shutil

from mtpipeline.cli import analyser, ecrire, inserer, main
from mtpipeline.erreurs import ErreurEntree, ErreurSuggestions
from mtpipeline.reglages import charger_reglages
from mtpipeline.suggestions import ReponseIA
```

et à la fin :

```python
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
```

- [ ] **Step 2 : vérifier l'échec**

Run : `../.venv/Scripts/python.exe -m pytest tests/test_insertion.py -v`
Expected : `ImportError: cannot import name 'inserer'`.

- [ ] **Step 3 : implémentation**

Dans `pipeline/mtpipeline/cli.py` :

1. Imports à ajouter :

```python
import shutil
from datetime import datetime
from typing import Callable

from .insertion import (
    chapitres_apres_insertion, construire_source, decalage_insertion, fusionner_analyse, integrer_rush, placer_rush,
    remplacer, renumeroter_consignes,
)
from .preparation import preparer, sonder
from .recalage import FICHIERS_DECALES, MARQUE, decaler_donnees, recaler
```

2. Extraire les trois premières étapes d'`analyser` :

```python
def etapes_analyse(dossier: Path, preparer_source: Callable[[Path], dict], reglages: dict, transcrire_fn,
                   extraits_fn) -> list[dict]:
    """Préparation de dossier/source.mp4, transcription et repérage des coupes ; une étape dont le fichier existe
    est sautée. Renvoie les mots."""
    source = dossier / "source.mp4"
    if not (dossier / "preparation.json").exists():
        ecrire(dossier / "preparation.json", preparer_source(source))

    if not (dossier / "transcription.json").exists():
        ecrire(dossier / "transcription.json", transcrire_fn(source, reglages["modeles"]["whisper"]))
        ecrire(dossier / "preparation.json", {**lire(dossier / "preparation.json"), MARQUE: True})
    mots = lire(dossier / "transcription.json")

    if not (dossier / "detections.json").exists():
        duree = lire(dossier / "preparation.json")["duree"]
        audio = charger_audio(source)
        extraits_fn = extraits_fn or transcrire_extraits
        detections = marquer_paroles(
            detecter(mots, audio, TAUX, duree, reglages["detection"]),
            lambda intervalles: extraits_fn(audio, intervalles, reglages["modeles"]["whisper"]),
        )
        ecrire(dossier / "detections.json", detections)
    return mots
```

et réécrire le `try` d'`analyser` :

```python
    def preparer_bruts(source: Path) -> dict:
        if not (dossier / "bruts").is_dir():
            raise ErreurEntree(f"Dossier bruts/ introuvable dans {dossier}.")
        return preparer(lister_bruts(dossier / "bruts"), source)

    try:
        mots = etapes_analyse(dossier, preparer_bruts, reglages, transcrire_fn, extraits_fn)
    except ErreurEntree as e:
        # … inchangé …
```

(La ligne `source = dossier / "source.mp4"` d'`analyser` disparaît.)

3. Ajouter `inserer` après `relancer_suggestions` :

```python
def inserer(dossier: Path, rush: Path, t: float, titre: str, reglages: dict, transcrire_fn=None, demander_fn=None,
            glossaire_chemin: Path | None = None, extraits_fn=None) -> str:
    """Insère le rush à l'instant t de la source ; renvoie le compte rendu. Tout est préparé à côté (rushs/<N>/,
    historique/) : les fichiers du tournage ne sont remplacés qu'à la fin, source.mp4 en dernier."""
    if not (dossier / "analyse.json").exists():
        raise ErreurEntree(f"{dossier} : tournage pas encore analysé.")
    if not (dossier / "montage.json").exists():
        raise ErreurEntree(f"{dossier} : montage.json absent, ouvrez le tournage dans le studio avant d'insérer un rush.")
    if not rush.is_file():
        raise ErreurEntree(f"Rush introuvable : {rush}")
    preparation = lire(dossier / "preparation.json")
    duree_source = preparation["duree"]
    if not 0 <= t <= duree_source:
        raise ErreurEntree(f"Instant d'insertion {t} s hors de la vidéo (0 à {duree_source:.2f} s).")
    glossaire_chemin = glossaire_chemin or RACINE / "donnees" / "glossaire.json"
    rushs = preparation.get("rushs", [])
    n = len(rushs) + 1

    # 1. Analyse du rush seul ; un dossier laissé par une insertion interrompue est refait.
    travail = dossier / "rushs" / str(n)
    if travail.exists():
        shutil.rmtree(travail)
    travail.mkdir(parents=True)
    mots_rush = etapes_analyse(travail, lambda sortie: preparer([rush], sortie, fps=preparation["fps"]), reglages,
                               transcrire_fn or transcrire, extraits_fn)
    suggestions, erreur = etape_suggestions(travail, mots_rush, reglages, demander_fn or demander, glossaire_chemin)
    analyse_rush = assembler(travail, suggestions, erreur)
    d = analyse_rush["duree"]

    # 2. Sauvegarde du tournage.
    sauvegarde = dossier / "historique" / f"{datetime.now():%Y%m%d-%H%M%S}-rush-{n}"
    sauvegarde.mkdir(parents=True)
    shutil.copy2(dossier / "source.mp4", sauvegarde / "source.mp4")
    for fichier in dossier.glob("*.json"):
        shutil.copy2(fichier, sauvegarde / fichier.name)

    # 3. Nouvelle source, à côté.
    nouvelle = travail / "nouvelle-source.mp4"
    construire_source(dossier / "source.mp4", travail / "source.mp4", t, duree_source, d, preparation["fps"], nouvelle)
    duree = sonder(nouvelle)["duree"]

    # 4 à 6. Décalage et fusion, en mémoire.
    lus = {nom: lire(dossier / nom) for nom in FICHIERS_DECALES if (dossier / nom).exists()}
    decales = decaler_donnees(lus, decalage_insertion(t, d))
    place = placer_rush(analyse_rush, n, t)
    analyse, table = fusionner_analyse(decales["analyse.json"], place, duree)
    chapitres = chapitres_apres_insertion(lus["montage.json"]["chapitres"], lus["analyse.json"]["mots"], t, d, titre)
    a_ecrire = {
        "transcription.json": analyse["mots"],
        "detections.json": analyse["detections"],
        "analyse.json": analyse,
        "montage.json": integrer_rush(decales["montage.json"], place, chapitres),
        "preparation.json": {**preparation, "duree": duree, MARQUE: True, "rushs": rushs + [
            {"numero": n, "fichier": rush.name, "a": t, "duree": d, "titre": titre, "erreurSuggestions": erreur}]},
    }
    if analyse["suggestions"] is not None:
        a_ecrire["suggestions.json"] = analyse["suggestions"]
    if (dossier / "consignes.json").exists():
        a_ecrire["consignes.json"] = renumeroter_consignes(lire(dossier / "consignes.json"), table)

    # 7. Remplacement : les JSON, puis source.mp4 en dernier.
    try:
        for nom, donnees in a_ecrire.items():
            ecrire(dossier / nom, donnees)
        remplacer(nouvelle, dossier / "source.mp4")
    except OSError as e:
        raise ErreurEntree(f"Insertion interrompue pendant l'écriture du tournage ({e}) : "
                           f"remettez à la main les fichiers de {sauvegarde}.") from e
    try:
        shutil.move(rush, travail / rush.name)
    except OSError:
        pass  # le rush reste dans rushs/ : sans conséquence
    compte_rendu = f"Rush de {d:.1f} s inséré à {t:.2f} s ({len(place['mots'])} mots). Sauvegarde : {sauvegarde}"
    return compte_rendu + (f"\nSuggestions indisponibles pour le rush : {erreur}" if erreur else "")
```

4. Dans `main`, ajouter le sous-parseur après `recaler` :

```python
    p_inserer = sous.add_parser("inserer", help="Insérer un rush dans un tournage analysé.")
    p_inserer.add_argument("dossier", type=Path)
    p_inserer.add_argument("rush", type=Path)
    p_inserer.add_argument("--a", type=float, required=True, dest="instant", help="Instant d'insertion (s).")
    p_inserer.add_argument("--titre", default="Nouveau chapitre")
```

et, dans le `try`, après le cas `recaler` :

```python
        if args.commande == "inserer":
            print(inserer(args.dossier, args.rush, args.instant, args.titre, reglages))
            return 0
```

- [ ] **Step 4 : vérifier**

Run : `../.venv/Scripts/python.exe -m pytest -v`
Expected : toute la suite PASS (`test_cli.py` inchangé compris).

- [ ] **Step 5 : commit**

```bash
git add pipeline/mtpipeline/cli.py pipeline/tests/test_insertion.py
git commit -m "Pipeline : commande inserer (rush analysé seul, sauvegarde, source reconstruite, montage décalé)"
```

---

### Task 5 : serveur — dépôt du rush, lancement et suivi de l'insertion

**Files:**
- Create: `studio/serveur/rush.ts`
- Modify: `studio/commun.ts`, `studio/serveur/suivi-analyse.ts`, `studio/serveur/nouveau-tournage.ts`, `studio/serveur/api.ts`, `studio/serveur/pipeline.ts`, `studio/serveur/principal.ts`
- Test: `studio/serveur/api.test.ts`

**Interfaces:**
- Consumes : la commande `inserer` et `preparation.json` → `rushs` (Task 4).
- Produces :
  - `commun.ts` : `type EtapeInsertion = EtapeAnalyse | 'reconstruction'` ; `interface EtatInsertion { enCours: boolean; etape: EtapeInsertion | null; erreur: string | null; avertissement: string | null }` ; `ResumeTournage.insertionEnCours: boolean` ; `DetailTournage.publicationEngagee: boolean`.
  - `SuiviAnalyse.lancer(nom, titre, travail: () => Promise<string | null | void>, nature: NatureTravail = 'analyse')` ; `EtatAnalyse.nature: NatureTravail | null`, `EtatAnalyse.avertissement: string | null` ; `type NatureTravail = 'analyse' | 'rush'`.
  - `ConfigApi.inserer: (dossier: string, rush: string, t: number, titre: string) => Promise<void>`.
  - Routes : `PUT /api/tournages/<nom>/rush?fichier=…` → `200 { fichier }` ; `POST /api/tournages/<nom>/rush` `{ fichier, t, titre }` → `202 { ok: true }` ; `GET /api/tournages/<nom>/rush` → `200 EtatInsertion`.

- [ ] **Step 1 : tests qui échouent**

Dans `studio/serveur/api.test.ts` :

- dans `beforeEach`, ajouter à `config` : `inserer: vi.fn<ConfigApi['inserer']>(async () => undefined),` ;
- dans le test « liste les tournages du plus récent au plus ancien… », ajouter `insertionEnCours: false` aux deux résumés attendus ;
- ajouter, après les autres aides :

```ts
const deposerRush = (nom: string, fichier: string, contenu: string) =>
  fetch(`${url}/api/tournages/${nom}/rush?fichier=${encodeURIComponent(fichier)}`, { method: 'PUT', body: contenu });
const demanderInsertion = (nom: string, corps: unknown) =>
  fetch(`${url}/api/tournages/${nom}/rush`, { method: 'POST', headers: json, body: JSON.stringify(corps) });
const etatInsertion = async (nom: string) => (await fetch(`${url}/api/tournages/${nom}/rush`)).json();
const INSERTION = { fichier: 'oubli.mp4', t: 1, titre: 'R' };

async function avecRush(nom: string, fichiers: Record<string, unknown> = {}): Promise<string> {
  const dossier = await tournage(nom, { 'analyse.json': exemple, 'montage.json': MONTAGE_PRET, ...fichiers });
  await mkdir(path.join(dossier, 'rushs'));
  await writeFile(path.join(dossier, 'rushs', 'oubli.mp4'), 'x');
  return dossier;
}

// Insertion simulée qui ne se termine qu'à l'appel de la fonction renvoyée.
function insertionBloquee(): () => void {
  let finir = () => {};
  vi.mocked(config.inserer).mockImplementation(() => new Promise<void>(r => { finir = r; }));
  return () => finir();
}
```

- et le bloc :

```ts
describe('insertion d’un rush', () => {
  it('dépose le rush dans rushs/ et ajoute -2 quand le nom est pris', async () => {
    const dossier = await tournage('a', { 'analyse.json': exemple });
    expect(await (await deposerRush('a', 'oubli.mp4', 'x')).json()).toEqual({ fichier: 'oubli.mp4' });
    expect(await (await deposerRush('a', 'oubli.mp4', 'y')).json()).toEqual({ fichier: 'oubli-2.mp4' });
    expect(await readFile(path.join(dossier, 'rushs', 'oubli-2.mp4'), 'utf-8')).toBe('y');
    expect(existsSync(path.join(dossier, 'bruts'))).toBe(false);
  });

  it('refuse un rush non vidéo ou l’enregistrement de la webcam', async () => {
    await tournage('a', { 'analyse.json': exemple });
    expect((await deposerRush('a', 'notes.txt', 'x')).status).toBe(400);
    expect((await deposerRush('a', 'oubli-camera.mp4', 'x')).status).toBe(400);
  });

  it('lance l’insertion, la montre en cours, bloque le montage, puis repasse un tournage rendu en validation', async () => {
    const dossier = await avecRush('a', { 'episode.json': { version: 1, titre: 'A', statut: 'rendu', message: null } });
    const finir = insertionBloquee();
    expect((await demanderInsertion('a', { fichier: 'oubli.mp4', t: 2.5, titre: ' Intro bis ' })).status).toBe(202);
    expect(config.inserer).toHaveBeenCalledWith(dossier, path.join(dossier, 'rushs', 'oubli.mp4'), 2.5, 'Intro bis');
    expect(await etatInsertion('a')).toEqual({ enCours: true, etape: 'preparation', erreur: null, avertissement: null });
    const [resume] = await (await fetch(`${url}/api/tournages`)).json();
    expect(resume).toMatchObject({ analyseEnCours: true, insertionEnCours: true });
    expect((await envoyerMontage('a', MONTAGE_PRET)).status).toBe(409);
    finir();
    await config.suiviAnalyse.attendre();
    expect(await etatInsertion('a')).toEqual({ enCours: false, etape: null, erreur: null, avertissement: null });
    expect((await lire(path.join(dossier, 'episode.json'))).statut).toBe('en-validation');
  });

  it('remonte l’avertissement des suggestions du rush, titre par défaut', async () => {
    const dossier = await avecRush('a');
    vi.mocked(config.inserer).mockImplementation(async () => {
      await writeFile(path.join(dossier, 'preparation.json'), JSON.stringify({
        duree: 40, fps: 30, rushs: [{ numero: 1, erreurSuggestions: 'API indisponible' }],
      }));
    });
    await demanderInsertion('a', { fichier: 'oubli.mp4', t: 0, titre: '' });
    await config.suiviAnalyse.attendre();
    expect(await etatInsertion('a')).toMatchObject({ enCours: false, avertissement: 'API indisponible' });
    expect(config.inserer).toHaveBeenCalledWith(dossier, expect.any(String), 0, 'Nouveau chapitre');
  });

  it('écrit le montage par défaut s’il n’a jamais été enregistré', async () => {
    const dossier = await tournage('a', { 'analyse.json': exemple });
    await mkdir(path.join(dossier, 'rushs'));
    await writeFile(path.join(dossier, 'rushs', 'oubli.mp4'), 'x');
    expect((await demanderInsertion('a', INSERTION)).status).toBe(202);
    expect((await lire(path.join(dossier, 'montage.json'))).chapitres.length).toBeGreaterThan(0);
  });

  it('reporte l’échec de l’insertion sans changer le statut', async () => {
    const dossier = await avecRush('a', { 'episode.json': EN_VALIDATION });
    vi.mocked(config.inserer).mockRejectedValue(new Error('muet.mp4 : aucune piste audio.'));
    await demanderInsertion('a', INSERTION);
    await config.suiviAnalyse.attendre();
    expect(await etatInsertion('a')).toMatchObject({ enCours: false, erreur: 'muet.mp4 : aucune piste audio.' });
    expect(await lire(path.join(dossier, 'episode.json'))).toEqual(EN_VALIDATION);
  });

  it('refuse un tournage non analysé, un instant hors de la vidéo ou pendant une analyse', async () => {
    await avecRush('a');
    await tournage('b', {});
    expect((await demanderInsertion('b', INSERTION)).status).toBe(409);
    expect((await demanderInsertion('a', { ...INSERTION, t: 31 })).status).toBe(409);
    expect((await demanderInsertion('a', { ...INSERTION, t: -1 })).status).toBe(409);
    await avecVideo('c');
    const finir = analyseBloquee();
    await demanderAnalyse('c', 'C');
    expect((await demanderInsertion('a', INSERTION)).status).toBe(409);
    finir();
  });

  it('refuse pendant un rendu de ce tournage', async () => {
    await avecRush('a');
    let finir = () => {};
    vi.mocked(config.rendre).mockImplementation(() => new Promise(r => { finir = () => r([]); }));
    expect((await demanderRendu('a', 'complete')).status).toBe(202);
    expect((await demanderInsertion('a', INSERTION)).status).toBe(409);
    finir();
  });

  it('signale dans le détail une publication déjà engagée', async () => {
    await tournage('a', { 'analyse.json': exemple, 'publication.json': { version: 2, videos: [{ statut: 'prete' }] } });
    await tournage('b', { 'analyse.json': exemple });
    expect((await (await fetch(`${url}/api/tournages/a`)).json()).publicationEngagee).toBe(true);
    expect((await (await fetch(`${url}/api/tournages/b`)).json()).publicationEngagee).toBe(false);
  });
});
```

(Si `demanderRendu('a', 'complete')` ne renvoie pas 202 avec `MONTAGE_PRET`, reprendre la préparation du test existant « refuse un second rendu et toute modification du montage pendant le rendu ».)

- [ ] **Step 2 : vérifier l'échec**

Run : `npm test -- studio/serveur/api.test.ts`
Expected : erreurs de type sur `inserer`, puis 404 sur `/rush`.

- [ ] **Step 3 : implémentation**

**`studio/commun.ts`** — après `EtapeAnalyse` :

```ts
// Étape de l'insertion d'un rush : celles de l'analyse du rush seul, puis la reconstruction de la vidéo.
export type EtapeInsertion = EtapeAnalyse | 'reconstruction';

export interface EtatInsertion {
  enCours: boolean;
  etape: EtapeInsertion | null;
  erreur: string | null;
  // Rush inséré sans suggestions de Claude : la raison.
  avertissement: string | null;
}
```

Dans `ResumeTournage`, après `analyseEnCours` : `insertionEnCours: boolean;`. Dans `DetailTournage`, après `montageEnregistre` :

```ts
  // Une vidéo est déjà prête ou envoyée : une insertion obligera à refaire sa publication.
  publicationEngagee: boolean;
```

**`studio/serveur/suivi-analyse.ts`** :

```ts
import { message } from './http';

export type NatureTravail = 'analyse' | 'rush';

export interface EtatAnalyse {
  nom: string | null;
  titre: string | null;
  debut: string | null;
  nature: NatureTravail | null;
  enCours: boolean;
  erreur: string | null;
  avertissement: string | null;
}

// Un seul travail lourd à la fois (analyse ou insertion d'un rush) ; la liste des tournages en montre l'avancement.
export class SuiviAnalyse {
  private courant: EtatAnalyse = { nom: null, titre: null, debut: null, nature: null, enCours: false, erreur: null, avertissement: null };
  private promesse: Promise<void> = Promise.resolve();

  etat(): EtatAnalyse {
    return { ...this.courant };
  }

  // Le travail peut rendre un avertissement (succès incomplet).
  lancer(nom: string, titre: string, travail: () => Promise<string | null | void>, nature: NatureTravail = 'analyse'): boolean {
    if (this.courant.enCours) return false;
    const etat: EtatAnalyse = { nom, titre, debut: new Date().toISOString(), nature, enCours: true, erreur: null, avertissement: null };
    this.courant = etat;
    let analyse: Promise<string | null | void>;
    try {
      analyse = travail();
    } catch (e) {
      analyse = Promise.reject(e);
    }
    this.promesse = analyse
      .then(avertissement => {
        etat.avertissement = avertissement ?? null;
      })
      .catch(e => {
        etat.erreur = message(e);
      })
      .finally(() => {
        etat.enCours = false;
      });
    return true;
  }

  // Attend la fin du travail en cours (tests).
  attendre(): Promise<void> {
    return this.promesse;
  }
}
```

**`studio/serveur/nouveau-tournage.ts`** — remplacer `deposerVideo` par ces quatre fonctions (le reste du fichier ne change pas) :

```ts
// Nom de la vidéo envoyée (?fichier=…) : sans chemin, accepté par Windows, hors enregistrement « -camera ».
export function nomVideoDemande(req: IncomingMessage): string {
  const fichier = new URL(req.url ?? '/', 'http://local').searchParams.get('fichier') ?? '';
  if (
    !fichier || path.basename(fichier) !== fichier || fichier.includes('\\') || fichier.startsWith('.') ||
    NOM_WINDOWS_INVALIDE.test(fichier) || !estVideoMontage(fichier)
  ) {
    throw new ErreurHttp(400, `fichier attendu : une vidéo ${EXTENSIONS_VIDEO.join(', ')} (hors enregistrement « -camera »), sans chemin.`);
  }
  return fichier;
}

// Un seul envoi à la fois par tournage.
export async function avecEnvoi<T>(dossier: string, f: () => Promise<T>): Promise<T> {
  if (envoisEnCours.has(dossier)) throw new ErreurHttp(409, 'Une vidéo est déjà en cours d’envoi pour ce tournage.');
  envoisEnCours.add(dossier);
  try {
    return await f();
  } finally {
    envoisEnCours.delete(dossier);
  }
}

// Écrit le corps de la requête dans <cible>/<fichier> par un .partiel ; un envoi interrompu ou vide ne laisse rien.
export async function ecrireEnFlux(req: IncomingMessage, cible: string, fichier: string): Promise<void> {
  await mkdir(cible, { recursive: true });
  const partiel = path.join(cible, `${fichier}.partiel`);
  // Un échec du nettoyage ne doit pas masquer l’erreur d’origine.
  const nettoyer = () => rm(partiel, { force: true }).catch(() => undefined);
  try {
    await pipeline(req, createWriteStream(partiel));
  } catch (e) {
    await nettoyer();
    throw new ErreurHttp(500, `Envoi de la vidéo interrompu : ${message(e)}`);
  }
  if ((await stat(partiel)).size === 0) {
    await nettoyer();
    throw new ErreurHttp(400, 'Vidéo vide.');
  }
  await rename(partiel, path.join(cible, fichier));
}

// Vidéo envoyée par le studio, écrite en flux dans bruts/.
export async function deposerVideo(req: IncomingMessage, dossier: string): Promise<string> {
  const fichier = nomVideoDemande(req);
  return avecEnvoi(dossier, async () => {
    if ((await videosBrutes(dossier)).length > 0) throw new ErreurHttp(409, 'Ce tournage a déjà une vidéo dans bruts/.');
    await ecrireEnFlux(req, path.join(dossier, 'bruts'), fichier);
    return fichier;
  });
}
```

**`studio/serveur/rush.ts`** (créé) :

```ts
import { existsSync, readFileSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import path from 'node:path';
import type { EtapeInsertion } from '../commun';
import { ErreurHttp } from './http';
import { avecEnvoi, ecrireEnFlux, etapeAnalyse, nomVideoDemande } from './nouveau-tournage';

// Rushs déposés, et dossiers de travail rushs/<N>/ du pipeline.
export const DOSSIER_RUSHS = 'rushs';
export const TITRE_RUSH_PAR_DEFAUT = 'Nouveau chapitre';

export interface DemandeRush {
  fichier: string;
  t: number;
  titre: string;
}

// Rush envoyé par le studio, écrit en flux dans rushs/ (jamais dans bruts/, que la préparation concatène) ;
// un nom déjà pris reçoit -2, -3…
export async function deposerRush(req: IncomingMessage, dossier: string): Promise<string> {
  const fichier = nomVideoDemande(req);
  return avecEnvoi(dossier, async () => {
    const rushs = path.join(dossier, DOSSIER_RUSHS);
    const { name, ext } = path.parse(fichier);
    let nom = fichier;
    for (let n = 2; existsSync(path.join(rushs, nom)); n++) nom = `${name}-${n}${ext}`;
    await ecrireEnFlux(req, rushs, nom);
    return nom;
  });
}

export function lireDemandeRush(corps: unknown, duree: number): DemandeRush {
  const c = corps && typeof corps === 'object' ? (corps as Record<string, unknown>) : {};
  const fichier = typeof c.fichier === 'string' ? c.fichier : '';
  if (!fichier || path.basename(fichier) !== fichier || fichier.startsWith('.')) {
    throw new ErreurHttp(400, 'fichier attendu : le nom du rush déposé dans rushs/.');
  }
  if (typeof c.t !== 'number' || !Number.isFinite(c.t)) throw new ErreurHttp(400, 't attendu : un instant en secondes.');
  if (c.t < 0 || c.t > duree) throw new ErreurHttp(409, `L’instant ${c.t} s sort de la vidéo (0 à ${duree} s).`);
  const titre = typeof c.titre === 'string' && c.titre.trim() ? c.titre.trim() : TITRE_RUSH_PAR_DEFAUT;
  return { fichier, t: c.t, titre };
}

function rushsInseres(dossier: string): Record<string, unknown>[] {
  try {
    const p = JSON.parse(readFileSync(path.join(dossier, 'preparation.json'), 'utf-8')) as { rushs?: unknown };
    return Array.isArray(p.rushs) ? (p.rushs as Record<string, unknown>[]) : [];
  } catch {
    return [];
  }
}

// Le pipeline analyse le rush dans rushs/<N>/ (N : rang de l'insertion en cours) ; son analyse.json écrit,
// il reconstruit la vidéo.
export function etapeInsertion(dossier: string): EtapeInsertion {
  const travail = path.join(dossier, DOSSIER_RUSHS, String(rushsInseres(dossier).length + 1));
  return existsSync(path.join(travail, 'analyse.json')) ? 'reconstruction' : etapeAnalyse(travail);
}

// Raison pour laquelle le dernier rush inséré n'a pas de suggestions de Claude, ou null.
export function avertissementInsertion(dossier: string): string | null {
  const erreur = rushsInseres(dossier).at(-1)?.erreurSuggestions;
  return typeof erreur === 'string' ? erreur : null;
}

const STATUTS_ENGAGES = ['prete', 'envoyee-youtube', 'relayee'];

// Une vidéo du tournage est déjà prête ou envoyée (publication.json lu sans le valider).
export function publicationEngagee(dossier: string): boolean {
  try {
    const p = JSON.parse(readFileSync(path.join(dossier, 'publication.json'), 'utf-8')) as { videos?: unknown };
    return Array.isArray(p.videos) && p.videos.some(v => STATUTS_ENGAGES.includes((v as { statut?: string })?.statut ?? ''));
  } catch {
    return false;
  }
}
```

**`studio/serveur/api.ts`** :

- imports : ajouter `EtatInsertion` à l'import de `../commun` ; `import { avertissementInsertion, deposerRush, DOSSIER_RUSHS, etapeInsertion, lireDemandeRush, publicationEngagee } from './rush';`.
- `ConfigApi`, après `analyser` :

```ts
  // « mtpipeline inserer », injecté pour les tests.
  inserer: (dossier: string, rush: string, t: number, titre: string) => Promise<void>;
```

- dans `resume`, après `analyseEnCours` : `insertionEnCours: analyse.enCours && analyse.nom === nom && analyse.nature === 'rush',` ;
- dans `detail`, après `montageEnregistre` : `publicationEngagee: publicationEngagee(dossier),` ;
- ajouter avant `verifierMontageModifiable`, et l'appeler en première ligne de `verifierMontageModifiable` et de `lancerRendu` (dans `lancerRendu`, après `lireCible`) :

```ts
  function verifierSansInsertion(dossier: string): void {
    const e = c.suiviAnalyse.etat();
    if (e.enCours && e.nature === 'rush' && e.nom === path.basename(dossier)) {
      throw new ErreurHttp(409, 'Insertion d’un rush en cours : le montage ne peut pas être modifié.');
    }
  }
```

- ajouter après `lancerAnalyse` :

```ts
  async function lancerInsertion(req: IncomingMessage, dossier: string): Promise<void> {
    const nom = path.basename(dossier);
    const corps = await lireCorps(req);
    const analyse = c.suiviAnalyse.etat();
    if (analyse.enCours) throw new ErreurHttp(409, `Une analyse est déjà en cours : ${analyse.titre}`);
    const rendu = c.suivi.etat();
    if ((rendu.enCours && rendu.nom === nom) || enPreparation === nom) {
      throw new ErreurHttp(409, 'Rendu en cours sur ce tournage : attendez sa fin avant d’insérer un rush.');
    }
    if (envoiEnCours(dossier)) throw new ErreurHttp(409, 'Vidéo en cours d’envoi sur ce tournage : attendez sa fin.');
    if (!existsSync(path.join(dossier, 'analyse.json'))) throw new ErreurHttp(409, 'Ce tournage n’est pas encore analysé.');
    const t = await charger(dossier, true);
    const demande = lireDemandeRush(corps, t.analyse.duree);
    const rush = path.join(dossier, DOSSIER_RUSHS, demande.fichier);
    if (!existsSync(rush)) throw new ErreurHttp(400, `Rush introuvable dans rushs/ : ${demande.fichier}`);
    // Le pipeline décale le montage enregistré : celui par défaut est écrit s'il ne l'a jamais été.
    if (!existsSync(path.join(dossier, 'montage.json'))) await ecrireJson(path.join(dossier, 'montage.json'), t.montage);
    const lancee = c.suiviAnalyse.lancer(nom, t.titre, async () => {
      await c.inserer(dossier, rush, demande.t, demande.titre);
      // Les rendus ne correspondent plus au montage.
      const { statut } = await lireEpisode(dossier);
      if (statut === 'valide' || statut === 'rendu') await majStatutEpisode(dossier, 'en-validation', null);
      return avertissementInsertion(dossier);
    }, 'rush');
    if (!lancee) throw new ErreurHttp(409, `Une analyse est déjà en cours : ${c.suiviAnalyse.etat().titre}`);
  }

  function etatInsertion(dossier: string): EtatInsertion {
    const e = c.suiviAnalyse.etat();
    if (e.nature !== 'rush' || e.nom !== path.basename(dossier)) return { enCours: false, etape: null, erreur: null, avertissement: null };
    return { enCours: e.enCours, etape: e.enCours ? etapeInsertion(dossier) : null, erreur: e.erreur, avertissement: e.avertissement };
  }
```

- dans `traiter` : ajouter `rush` à l'expression des actions (`(montage|rendu|suggestions|consignes|video|analyse|rush)`) et, avant le `else` final :

```ts
      } else if (nom && action === 'rush' && req.method === 'PUT') {
        const dossier = dossierDe(nom);
        if (!existsSync(path.join(dossier, 'analyse.json'))) throw new ErreurHttp(409, 'Ce tournage n’est pas encore analysé.');
        repondre(res, 200, { fichier: await deposerRush(req, dossier) });
      } else if (nom && action === 'rush' && req.method === 'POST') {
        await lancerInsertion(req, dossierDe(nom));
        repondre(res, 202, { ok: true });
      } else if (nom && action === 'rush' && req.method === 'GET') {
        repondre(res, 200, etatInsertion(dossierDe(nom)));
```

**`studio/serveur/pipeline.ts`** — ajouter :

```ts
export const insererRush = (dossier: string, rush: string, t: number, titre: string) =>
  lancerPipeline(['inserer', dossier, rush, '--a', String(t), '--titre', titre]);
```

**`studio/serveur/principal.ts`** — importer `insererRush` et ajouter `inserer: insererRush,` après `analyser: analyserTournage,`.

- [ ] **Step 4 : vérifier**

Run : `npm test -- studio/serveur` puis `npm run typecheck`
Expected : PASS. Le typecheck signale les objets `ResumeTournage` construits dans `studio/src/logique/nouveau-tournage.test.ts` : y ajouter `insertionEnCours: false` et relancer jusqu'à zéro erreur.

- [ ] **Step 5 : commit**

```bash
git add studio/commun.ts studio/serveur studio/src/logique/nouveau-tournage.test.ts
git commit -m "Studio : dépôt d'un rush, lancement et suivi de son insertion"
```

---

### Task 6 : studio — point d'insertion et appels à l'API

**Files:**
- Create: `studio/src/logique/rush.ts`, `studio/src/logique/rush.test.ts`
- Modify: `studio/src/api.ts`

**Interfaces:**
- Consumes : `EtatInsertion`, `EtapeInsertion` (Task 5), `LIBELLES_ETAPE` (`logique/nouveau-tournage.ts`), `horodatage` (`logique/format.ts`).
- Produces :
  - `type SensInsertion = 'avant' | 'apres'` ; `interface PointInsertion { t: number; rangAvant: number | null }` (rang dans `analyse.mots` du mot qui précède le rush).
  - `pointInsertion(mots: Mot[], rangs: [number, number], sens: SensInsertion): PointInsertion`
  - `rappelInsertion(mots: Mot[], p: PointInsertion): string`
  - `messageFinInsertion(e: EtatInsertion): string | null`
  - `LIBELLES_INSERTION: Record<EtapeInsertion, string>`
  - `api.deposerRush(nom, fichier: File, onProgression): Promise<{ fichier: string }>`, `api.insererRush(nom, fichier: string, t: number, titre: string): Promise<void>`, `api.etatInsertion(nom): Promise<EtatInsertion>`.

- [ ] **Step 1 : tests qui échouent**

Créer `studio/src/logique/rush.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import type { Mot } from '../../../noyau/types';
import { messageFinInsertion, pointInsertion, rappelInsertion } from './rush';

const mots: Mot[] = [
  { id: 0, texte: 'Bonjour', debut: 0.2, fin: 0.6 },
  { id: 1, texte: 'à', debut: 0.7, fin: 0.8 },
  { id: 2, texte: 'tous', debut: 0.9, fin: 1.2 },
  { id: 3, texte: 'aujourd’hui', debut: 154.0, fin: 154.6 },
];

describe('pointInsertion', () => {
  it('avant : fin du mot qui précède la sélection', () => {
    expect(pointInsertion(mots, [2, 3], 'avant')).toEqual({ t: 0.8, rangAvant: 1 });
  });
  it('avant le premier mot : début de la vidéo', () => {
    expect(pointInsertion(mots, [0, 1], 'avant')).toEqual({ t: 0, rangAvant: null });
  });
  it('après : fin du dernier mot choisi, jusqu’au dernier mot du texte', () => {
    expect(pointInsertion(mots, [1, 3], 'apres')).toEqual({ t: 154.6, rangAvant: 3 });
  });
});

describe('rappelInsertion', () => {
  it('donne l’instant et les derniers mots avant le rush', () => {
    expect(rappelInsertion(mots, { t: 154.6, rangAvant: 3 })).toBe('Insertion à 2:34, après « … à tous aujourd’hui ». Comptez quelques minutes.');
  });
  it('au début de la vidéo', () => {
    expect(rappelInsertion(mots, { t: 0, rangAvant: null })).toBe('Insertion au début de la vidéo. Comptez quelques minutes.');
  });
});

describe('messageFinInsertion', () => {
  const fin = { enCours: false, etape: null, erreur: null, avertissement: null };
  it('rien à dire après un succès', () => expect(messageFinInsertion(fin)).toBeNull());
  it('donne l’échec', () => {
    expect(messageFinInsertion({ ...fin, erreur: 'muet.mp4 : aucune piste audio.' })).toBe('Insertion impossible : muet.mp4 : aucune piste audio.');
  });
  it('signale un rush inséré sans suggestions', () => {
    expect(messageFinInsertion({ ...fin, avertissement: 'API indisponible' })).toBe('Rush inséré sans suggestions de Claude : API indisponible');
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npm test -- studio/src/logique/rush.test.ts`
Expected : FAIL (module `./rush` introuvable).

- [ ] **Step 3 : implémentation**

Créer `studio/src/logique/rush.ts` :

```ts
import type { Mot } from '../../../noyau/types';
import type { EtapeInsertion, EtatInsertion } from '../../commun';
import { horodatage } from './format';
import { LIBELLES_ETAPE } from './nouveau-tournage';

export type SensInsertion = 'avant' | 'apres';

// t : instant de la source où le rush s'insère ; rangAvant : rang (dans analyse.mots) du mot qui le précède.
export interface PointInsertion {
  t: number;
  rangAvant: number | null;
}

export const LIBELLES_INSERTION: Record<EtapeInsertion, string> = {
  ...LIBELLES_ETAPE,
  reconstruction: 'Reconstruction de la vidéo',
};

const MOTS_DU_RAPPEL = 3;

// « Avant » : fin du mot qui précède la sélection (0 si elle commence au premier mot) ; « après » : fin de son dernier mot.
export function pointInsertion(mots: Mot[], rangs: [number, number], sens: SensInsertion): PointInsertion {
  const rang = sens === 'avant' ? rangs[0] - 1 : rangs[1];
  const mot = mots[rang];
  return mot ? { t: mot.fin, rangAvant: rang } : { t: 0, rangAvant: null };
}

export function rappelInsertion(mots: Mot[], p: PointInsertion): string {
  if (p.rangAvant === null) return 'Insertion au début de la vidéo. Comptez quelques minutes.';
  const extrait = mots.slice(Math.max(0, p.rangAvant - MOTS_DU_RAPPEL + 1), p.rangAvant + 1).map(m => m.texte).join(' ');
  return `Insertion à ${horodatage(p.t)}, après « … ${extrait} ». Comptez quelques minutes.`;
}

export function messageFinInsertion(e: EtatInsertion): string | null {
  if (e.erreur) return `Insertion impossible : ${e.erreur}`;
  if (e.avertissement) return `Rush inséré sans suggestions de Claude : ${e.avertissement}`;
  return null;
}
```

Dans `studio/src/api.ts` : ajouter `EtatInsertion` à l'import de `../commun`, puis, avant `export const api`, extraire l'envoi XHR :

```ts
// XMLHttpRequest plutôt que fetch : lui seul donne la progression de l'envoi.
function envoyerFichier<T>(url: string, fichier: File, onProgression: (part: number) => void): Promise<T> {
  return new Promise<T>((resoudre, rejeter) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgression(e.loaded / e.total); };
    xhr.onload = () => {
      let corps: unknown = {};
      try {
        corps = JSON.parse(xhr.responseText);
      } catch {
        // corps non JSON : le statut suffit
      }
      if (xhr.status >= 200 && xhr.status < 300) resoudre(corps as T);
      else rejeter(new ErreurApi(xhr.status, (corps as { erreur?: string }).erreur ?? `Erreur ${xhr.status}`, []));
    };
    xhr.onerror = () => rejeter(new ErreurApi(0, 'Envoi de la vidéo interrompu : studio fermé, disque plein ou fichier refusé.', []));
    xhr.send(fichier);
  });
}
```

Remplacer `deposerVideo` et ajouter les trois appels :

```ts
  deposerVideo: async (nom: string, fichier: File, onProgression: (part: number) => void) => {
    await envoyerFichier(`${chemin(nom)}/video?fichier=${encodeURIComponent(fichier.name)}`, fichier, onProgression);
  },
  deposerRush: (nom: string, fichier: File, onProgression: (part: number) => void) =>
    envoyerFichier<{ fichier: string }>(`${chemin(nom)}/rush?fichier=${encodeURIComponent(fichier.name)}`, fichier, onProgression),
  insererRush: async (nom: string, fichier: string, t: number, titre: string) => {
    await appeler<{ ok: true }>(`${chemin(nom)}/rush`, enJson('POST', { fichier, t, titre }));
  },
  etatInsertion: (nom: string) => appeler<EtatInsertion>(`${chemin(nom)}/rush`),
```

- [ ] **Step 4 : vérifier**

Run : `npm test -- studio/src` puis `npm run typecheck`
Expected : PASS, zéro erreur.

- [ ] **Step 5 : commit**

```bash
git add studio/src/logique/rush.ts studio/src/logique/rush.test.ts studio/src/api.ts
git commit -m "Studio : point d'insertion d'un rush et appels à l'API"
```

---

### Task 7 : studio — formulaire dans la barre, écran d'attente, rechargement

**Files:**
- Create: `studio/src/composants/FormulaireRush.tsx`, `studio/src/composants/AttenteInsertion.tsx`
- Modify: `studio/src/useMontage.ts`, `studio/src/composants/Texte.tsx`, `studio/src/composants/EcranMontage.tsx`, `studio/src/composants/LigneTournage.tsx`

**Interfaces:**
- Consumes : Task 6 ; `raisonFichierVideo` (`logique/nouveau-tournage.ts`) ; `DetailTournage.insertionEnCours`, `publicationEngagee` (Task 5).
- Produces :
  - `useMontage(nom)` renvoie en plus `enregistrerMaintenant: () => Promise<void>` (envoie tout de suite la dernière modification ; rejette si son enregistrement échoue).
  - `Texte` reçoit `insererRush: (t: number, fichier: File, titre: string, onProgression: (p: number) => void) => Promise<void>` et `publicationEngagee: boolean`.

- [ ] **Step 1 : `useMontage` — enregistrement immédiat**

Dans `studio/src/useMontage.ts`, ajouter `useCallback` est déjà importé ; remplacer l'effet d'enregistrement par :

```ts
  const enAttente = useRef<{ montage: Montage; version: number } | null>(null);
  const dernierEnvoi = useRef<Promise<void>>(Promise.resolve());

  const envoyer = useCallback(() => {
    const a = enAttente.current;
    if (!a) return;
    enAttente.current = null;
    const envoi = file.current.then(() => api.enregistrer(nom, a.montage));
    dernierEnvoi.current = envoi;
    file.current = envoi.then(
      () => { if (a.version === version.current) setEnregistrement('a-jour'); },
      () => setEnregistrement('erreur'),
    );
  }, [nom]);

  useEffect(() => {
    if (!montage || montage === charge.current) return;
    enAttente.current = { montage, version: ++version.current };
    setEnregistrement('en-attente');
    window.clearTimeout(minuteur.current);
    minuteur.current = window.setTimeout(envoyer, DELAI_ENREGISTREMENT);
  }, [montage, envoyer]);

  // Avant une insertion : enregistre tout de suite la dernière modification ; échoue si son enregistrement échoue.
  const enregistrerMaintenant = useCallback(async () => {
    window.clearTimeout(minuteur.current);
    envoyer();
    await dernierEnvoi.current;
  }, [envoyer]);
```

et ajouter `enregistrerMaintenant` à l'objet renvoyé.

- [ ] **Step 2 : `FormulaireRush`**

Créer `studio/src/composants/FormulaireRush.tsx` :

```tsx
import { type FC, useRef, useState } from 'react';
import { EXTENSIONS_VIDEO } from '../../commun';
import { raisonFichierVideo } from '../logique/nouveau-tournage';
import { Attente } from './Attente';

interface Props {
  rappel: string;
  publicationEngagee: boolean;
  // Enregistre le montage, envoie le rush puis lance l'insertion ; l'écran d'attente prend ensuite le relais.
  inserer: (fichier: File, titre: string, onProgression: (part: number) => void) => Promise<void>;
  onAnnuler: () => void;
}

// Petit formulaire de la barre de sélection : fichier du rush (choisi ou glissé) et titre de son chapitre.
export const FormulaireRush: FC<Props> = ({ rappel, publicationEngagee, inserer, onAnnuler }) => {
  const [video, setVideo] = useState<File | null>(null);
  const [titre, setTitre] = useState('Nouveau chapitre');
  const [depot, setDepot] = useState(false);
  const [progression, setProgression] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const choix = useRef<HTMLInputElement>(null);
  const enCours = progression !== null;

  function choisir(fichiers: File[]) {
    const f = fichiers[0];
    if (!f || enCours) return;
    const raison = raisonFichierVideo(f.name);
    setErreur(raison);
    setVideo(raison ? null : f);
  }

  async function lancer() {
    if (!video) return;
    setErreur(null);
    setProgression(0);
    try {
      await inserer(video, titre.trim(), setProgression);
    } catch (e) {
      setErreur((e as Error).message);
      setProgression(null);
    }
  }

  return (
    <span
      className={depot ? 'depot actif' : 'depot'}
      onDragOver={e => { e.preventDefault(); setDepot(true); }}
      onDragLeave={() => setDepot(false)}
      onDrop={e => { e.preventDefault(); setDepot(false); choisir([...e.dataTransfer.files]); }}
    >
      {video ? <strong>{video.name}</strong> : 'Glissez ici le rush'}
      {' '}
      <button onClick={() => choix.current?.click()} disabled={enCours}>Choisir un fichier</button>
      <input
        ref={choix}
        type="file"
        accept={EXTENSIONS_VIDEO.join(',')}
        hidden
        onChange={e => { choisir([...(e.target.files ?? [])]); e.target.value = ''; }}
      />
      <input value={titre} onChange={e => setTitre(e.target.value)} aria-label="Titre du chapitre du rush" disabled={enCours} size={30} />
      <span className="discret">{rappel}</span>
      {publicationEngagee && (
        <span className="trop-long">Une vidéo de ce tournage est déjà prête ou envoyée : sa publication devra être refaite.</span>
      )}
      {progression !== null && progression < 1 && (
        <span><progress value={progression} max={1} /> Envoi du rush : {Math.round(progression * 100)} %</span>
      )}
      {progression === 1 && <Attente libelle="Lancement de l’insertion…" />}
      {erreur && <span className="alerte">{erreur}</span>}
      <button className="principal" onClick={() => void lancer()} disabled={!video || enCours}>Insérer</button>
      <button onClick={onAnnuler} disabled={enCours}>Annuler</button>
    </span>
  );
};
```

- [ ] **Step 3 : boutons dans `Texte`**

Dans `studio/src/composants/Texte.tsx` :

- imports : `import { pointInsertion, rappelInsertion, type SensInsertion } from '../logique/rush';` et `import { FormulaireRush } from './FormulaireRush';` ;
- `Props`, à la fin :

```ts
  // Insère un rush à l'instant t de la source (voir EcranMontage).
  insererRush: (t: number, fichier: File, titre: string, onProgression: (part: number) => void) => Promise<void>;
  publicationEngagee: boolean;
```

- déstructurer `insererRush, publicationEngagee` avec les autres props ;
- état : `const [sens, setSens] = useState<SensInsertion | null>(null);` et, dans l'effet sur `ancrage`, ajouter `setSens(null);` ;
- dans la barre, après le bouton « Caméra en grand » :

```tsx
            <button onClick={() => setSens('avant')}>Insérer un rush avant</button>
            <button onClick={() => setSens('apres')}>Insérer un rush après</button>
            {sens && (() => {
              const p = pointInsertion(analyse.mots, choix.rangs, sens);
              return (
                <FormulaireRush
                  key={sens}
                  rappel={rappelInsertion(analyse.mots, p)}
                  publicationEngagee={publicationEngagee}
                  inserer={(fichier, titre, onProgression) => insererRush(p.t, fichier, titre, onProgression)}
                  onAnnuler={() => setSens(null)}
                />
              );
            })()}
```

- [ ] **Step 4 : écran d'attente**

Créer `studio/src/composants/AttenteInsertion.tsx` :

```tsx
import { type FC, useEffect, useRef, useState } from 'react';
import type { EtatInsertion } from '../../commun';
import { api } from '../api';
import { LIBELLES_INSERTION } from '../logique/rush';
import { Attente } from './Attente';

const INTERVALLE_MS = 2000;

// Remplace l'écran de montage pendant l'insertion d'un rush : aucune modification n'est possible.
export const AttenteInsertion: FC<{ nom: string; onFin: (e: EtatInsertion) => void }> = ({ nom, onFin }) => {
  const [etat, setEtat] = useState<EtatInsertion | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const fin = useRef(onFin);
  fin.current = onFin;

  useEffect(() => {
    let actif = true;
    let minuterie: number | undefined;
    const suivre = async () => {
      try {
        const e = await api.etatInsertion(nom);
        if (!actif) return;
        setErreur(null);
        if (!e.enCours) {
          fin.current(e);
          return;
        }
        setEtat(e);
      } catch (e) {
        if (!actif) return;
        setErreur((e as Error).message);
      }
      minuterie = window.setTimeout(() => void suivre(), INTERVALLE_MS);
    };
    void suivre();
    return () => {
      actif = false;
      window.clearTimeout(minuterie);
    };
  }, [nom]);

  return (
    <div className="page">
      <h1>Insertion d’un rush</h1>
      <p><Attente libelle={etat?.etape ? LIBELLES_INSERTION[etat.etape] : 'Lancement…'} /></p>
      <p className="discret">Le montage sera rechargé à la fin. Aucune modification n’est possible pendant ce temps.</p>
      {erreur && <p className="alerte">{erreur}</p>}
    </div>
  );
};
```

- [ ] **Step 5 : enchaînement dans `EcranMontage`**

Dans `studio/src/composants/EcranMontage.tsx` :

- imports : `useEffect` dans l'import de `react` ; `import type { EtatInsertion } from '../../commun';` ; `import { api } from '../api';` ; `import { messageFinInsertion } from '../logique/rush';` ; `import { AttenteInsertion } from './AttenteInsertion';` ;
- renommer le composant actuel `export const EcranMontage: FC<{ nom: string }> = ({ nom }) => {` en :

```tsx
// Retour d'une insertion : instant où caler l'aperçu (null après un échec) et message à montrer.
interface RetourInsertion {
  t: number | null;
  message: string | null;
}

const EditionMontage: FC<{ nom: string; retour: RetourInsertion | null; onInsertion: (t: number | null) => void }> = ({ nom, retour, onInsertion }) => {
```

- y récupérer `enregistrerMaintenant` : `const { detail, montage, erreur, enregistrement, modifier, remplacerDetail, enregistrerMaintenant } = useMontage(nom);` ;
- ajouter, juste avant `if (erreur) {` :

```tsx
  // Studio rouvert pendant une insertion : l'écran d'attente reprend.
  useEffect(() => {
    if (detail?.insertionEnCours) onInsertion(null);
  }, [detail, onInsertion]);

  // Après une insertion réussie, l'aperçu se cale sur le début du rush.
  const [aCaler, setACaler] = useState<number | null>(retour?.t ?? null);
  useEffect(() => {
    if (aCaler === null || !decisions || !detail) return;
    const p = positionDansParties(decisions.complete.parties, aCaler, detail.analyse.fps);
    if (p) setDemande({ image: imageVideoComplete(decisions.complete, p), jeton: Date.now(), mode: 'caler' });
    setACaler(null);
  }, [aCaler, decisions, detail]);
```

- ajouter, après `creerElement` :

```tsx
  const insererRush = async (t: number, fichier: File, titre: string, onProgression: (part: number) => void) => {
    try {
      await enregistrerMaintenant();
    } catch {
      throw new Error('Le montage n’a pas pu être enregistré : insertion non lancée.');
    }
    const { fichier: depose } = await api.deposerRush(nom, fichier, onProgression);
    await api.insererRush(nom, depose, t, titre);
    onInsertion(t);
  };
```

- dans l'en-tête, après l'état d'enregistrement : `{retour?.message && <span className="alerte">{retour.message}</span>}` ;
- passer à `<Texte … />` : `insererRush={insererRush}` et `publicationEngagee={detail.publicationEngagee}` ;
- à la fin du fichier, le nouvel `EcranMontage` :

```tsx
// Écran de montage ; pendant l'insertion d'un rush, l'écran d'attente, puis le montage rechargé.
export const EcranMontage: FC<{ nom: string }> = ({ nom }) => {
  const [insertion, setInsertion] = useState<{ t: number | null } | null>(null);
  const [retour, setRetour] = useState<RetourInsertion | null>(null);
  const [generation, setGeneration] = useState(0);
  const onInsertion = useCallback((t: number | null) => setInsertion({ t }), []);

  if (insertion) {
    return (
      <AttenteInsertion
        nom={nom}
        onFin={(e: EtatInsertion) => {
          setRetour({ t: e.erreur ? null : insertion.t, message: messageFinInsertion(e) });
          setInsertion(null);
          setGeneration(g => g + 1);
        }}
      />
    );
  }
  return <EditionMontage key={generation} nom={nom} retour={retour} onInsertion={onInsertion} />;
};
```

(ajouter `useCallback` à l'import de `react`).

- [ ] **Step 6 : libellé de la liste**

Dans `studio/src/composants/LigneTournage.tsx`, remplacer :

```tsx
        {etat === 'en-cours' && <Attente libelle={LIBELLES_ETAPE[t.etapeAnalyse]} />}
```

par :

```tsx
        {etat === 'en-cours' && <Attente libelle={t.insertionEnCours ? 'Insertion d’un rush' : LIBELLES_ETAPE[t.etapeAnalyse]} />}
```

- [ ] **Step 7 : vérifier**

Run : `npm run typecheck` puis `npm test`
Expected : zéro erreur, tous les tests PASS.

Puis lancer le studio (`npm run validation`), ouvrir un tournage analysé, sélectionner un mot : les deux boutons apparaissent ; « Insérer un rush avant » sur le premier mot affiche « Insertion au début de la vidéo. Comptez quelques minutes. » ; un fichier `.txt` est refusé dans le formulaire ; « Annuler » ferme le formulaire. (L'insertion réelle est vérifiée en Task 8.)

- [ ] **Step 8 : commit**

```bash
git add studio/src
git commit -m "Studio : insertion d'un rush depuis la barre de sélection, écran d'attente et montage rechargé"
```

---

### Task 8 : documentation et essai réel

**Files:**
- Modify: `docs/studio.md`

- [ ] **Step 1 : documentation**

Dans `docs/studio.md`, section « Écran de montage », après la puce sur la sélection de mots, ajouter :

```markdown
  - « Insérer un rush avant » ou « après » le passage choisi : une vidéo tournée à part (chapitre oublié, intro ou outro à refaire) est insérée à cet endroit, avec son propre chapitre. Le rush est analysé seul (transcription, coupes, suggestions), `source.mp4` est reconstruite et tout ce qui suit est décalé : coupes, chapitres, termes, éléments et consignes sont gardés. Comptez quelques minutes, pendant lesquelles le montage ne peut pas être modifié. Pour refaire une intro, insérez la nouvelle avant le premier mot, puis coupez l’ancienne. Un tournage validé ou rendu repasse « en validation » ; une vidéo déjà prête ou envoyée devra être republiée. L’état d’avant est copié dans `historique/<date>-rush-<N>/` ; il n’y a pas d’annulation dans le studio.
```

et, après le paragraphe sur `recaler` (section « Lancer »), ajouter :

```markdown
La même insertion se lance à la main, depuis `pipeline` : `..\.venv\Scripts\python -m mtpipeline.cli inserer ..\donnees\tournages\<dossier> <rush.mp4> --a <secondes> --titre "<titre du chapitre>"`.
```

- [ ] **Step 2 : essai réel**

Sur `donnees/tournages/2026-10-essai` (studio lancé par `npm run validation`) :

1. Sélectionner un mot au milieu d'un chapitre, « Insérer un rush après », déposer un rush d'environ une minute, titre « Essai rush », « Insérer ». L'écran d'attente montre les étapes jusqu'à « Reconstruction de la vidéo ».
2. Au rechargement, vérifier : le texte du rush apparaît à sa place avec ses coupes ; le chapitre « Essai rush » et la suite du chapitre coupé existent ; les coupes et éléments d'après sont décalés (écouter une coupe d'après le rush) ; les consignes ancrées après le rush visent toujours les bons mots ; l'aperçu est calé sur le début du rush.
3. Lancer un rendu d'un épisode concerné et le regarder autour du rush.
4. Insérer une intro (« Insérer un rush avant » sur le premier mot), puis couper l'ancienne intro à la souris ; vérifier le premier chapitre et l'aperçu.
5. Vérifier la présence de `historique/<date>-rush-1/` et `-rush-2/`, et de `rushs/1/`, `rushs/2/` avec les fichiers des rushs.

Noter tout écart et le corriger avant de conclure.

- [ ] **Step 3 : commit**

```bash
git add docs/studio.md
git commit -m "Documentation : insertion d'un rush"
```
