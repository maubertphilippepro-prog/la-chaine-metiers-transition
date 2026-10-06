import os

import anthropic
from pydantic import BaseModel, ValidationError

from .erreurs import ErreurSuggestions


class ChapitreIA(BaseModel):
    titre: str
    premier_mot: int


class TermeIA(BaseModel):
    terme: str
    definition: str
    mots: list[int]


class LongueurIA(BaseModel):
    premier_mot: int
    dernier_mot: int
    raison: str


class ReponseIA(BaseModel):
    chapitres: list[ChapitreIA]
    termes: list[TermeIA]
    longueurs: list[LongueurIA]


def texte_numerote(mots: list[dict]) -> str:
    lignes = []
    for i in range(0, len(mots), 30):
        lignes.append(" ".join(f"{m['id']}:{m['texte']}" for m in mots[i:i + 30]))
    return "\n".join(lignes)


def construire_prompt(mots: list[dict], glossaire: dict[str, dict]) -> str:
    connus = ", ".join(sorted(t["terme"] for t in glossaire.values())) or "(aucun)"
    return f"""Tu prépares le montage d'une vidéo YouTube de la chaîne « Métiers et Transition », consacrée à l'innovation et aux outils numériques en entreprise. La vidéo est un tournage face caméra, non scripté, en français. Chaque chapitre deviendra un épisode autonome publié séparément.

Voici la transcription. Chaque mot est précédé de son numéro (numéro:mot).

<transcription>
{texte_numerote(mots)}
</transcription>

Propose :

1. **chapitres** : le découpage en chapitres, aux changements de sujet. Chaque chapitre doit pouvoir être regardé seul ; vise des chapitres de 3 à 8 minutes quand le contenu le permet. Pour chacun : un titre court et accrocheur (60 caractères maximum) et le numéro du premier mot.

2. **termes** : les termes techniques ou anglicismes qu'un public de collaborateurs non spécialistes ne comprendrait pas forcément. Pour chacun : le terme tel qu'il doit s'afficher, une définition claire en une ou deux phrases (160 caractères maximum), et les numéros de tous les mots où il est prononcé. Ces termes sont déjà dans le glossaire, reprends-les s'ils apparaissent (leur définition sera reprise du glossaire) : {connus}.

3. **longueurs** : les passages qui pourraient être coupés sans perte (digressions, redites, explications qui tournent en rond). Pour chacun : premier et dernier numéro de mot, et la raison en une phrase. Sois sélectif : ces passages ne sont que des propositions que l'auteur validera.
"""


def demander(mots: list[dict], glossaire: dict[str, dict], modele: str, client=None) -> ReponseIA:
    if client is None:
        if not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")):
            raise ErreurSuggestions(
                "Clé API Claude absente : définissez la variable d'environnement ANTHROPIC_API_KEY."
            )
        client = anthropic.Anthropic()
    try:
        reponse = client.messages.parse(
            model=modele,
            max_tokens=16000,
            output_config={"effort": "medium"},
            messages=[{"role": "user", "content": construire_prompt(mots, glossaire)}],
            output_format=ReponseIA,
            extra_headers={"anthropic-beta": "server-side-fallback-2026-07-01"},
            extra_body={"fallbacks": "default"},
        )
    except anthropic.APIConnectionError as e:
        raise ErreurSuggestions(f"Connexion à l'API Claude impossible : {e}") from e
    except anthropic.RateLimitError as e:
        raise ErreurSuggestions("Limite de requêtes de l'API Claude atteinte, réessayez plus tard.") from e
    except anthropic.APIStatusError as e:
        raise ErreurSuggestions(f"Erreur de l'API Claude ({e.status_code}) : {e.message}") from e
    except (ValidationError, ValueError) as e:
        raise ErreurSuggestions(f"Réponse de Claude inexploitable : {e}") from e
    if reponse.stop_reason == "refusal":
        raise ErreurSuggestions("Claude a refusé de traiter cette transcription.")
    if reponse.parsed_output is None:
        raise ErreurSuggestions(f"Réponse de Claude inexploitable (arrêt : {reponse.stop_reason}).")
    return reponse.parsed_output


def convertir(reponse: ReponseIA, mots: list[dict], glossaire: dict[str, dict]) -> dict:
    def valide(i: int) -> bool:
        return 0 <= i < len(mots)

    chapitres = sorted(
        ({"titre": c.titre, "debut": mots[c.premier_mot]["debut"]} for c in reponse.chapitres if valide(c.premier_mot)),
        key=lambda c: c["debut"],
    )

    termes = []
    for t in reponse.termes:
        occurrences = sorted(mots[i]["debut"] for i in t.mots if valide(i))
        if not occurrences:
            continue
        connu = glossaire.get(t.terme.lower())
        termes.append({
            "terme": connu["terme"] if connu else t.terme,
            "definition": connu["definition"] if connu else t.definition,
            "occurrences": occurrences,
            "origine": "glossaire" if connu else "ia",
        })

    longueurs = []
    for l in reponse.longueurs:
        if valide(l.premier_mot) and valide(l.dernier_mot) and l.premier_mot <= l.dernier_mot:
            longueurs.append({
                "id": f"l{len(longueurs)}",
                "debut": mots[l.premier_mot]["debut"],
                "fin": mots[l.dernier_mot]["fin"],
                "raison": l.raison,
            })

    return {"chapitres": chapitres, "termes": termes, "longueurs": longueurs}
