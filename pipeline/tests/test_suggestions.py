from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from mtpipeline.erreurs import ErreurSuggestions
from mtpipeline.suggestions import (
    ChapitreIA, LongueurIA, ReponseIA, TermeIA, construire_prompt, convertir, demander, texte_numerote,
)

MOTS = [{"id": i, "texte": t, "debut": float(i), "fin": i + 0.5}
        for i, t in enumerate(["Bonjour", "le", "SSO", "et", "les", "API", "fin"])]
GLOSSAIRE = {"api": {"terme": "API", "definition": "Interface d'échange entre logiciels."}}


def test_texte_numerote():
    assert texte_numerote(MOTS[:3]) == "0:Bonjour 1:le 2:SSO"


def test_prompt_contient_texte_et_glossaire():
    p = construire_prompt(MOTS, GLOSSAIRE)
    assert "2:SSO" in p
    assert "API" in p and "160" in p


def test_convertir():
    reponse = ReponseIA(
        chapitres=[ChapitreIA(titre="Intro", premier_mot=0), ChapitreIA(titre="API", premier_mot=4)],
        termes=[
            TermeIA(terme="SSO", definition="Authentification unique.", mots=[2]),
            TermeIA(terme="API", definition="Autre définition.", mots=[5, 99]),
            TermeIA(terme="Fantôme", definition="x", mots=[99]),
        ],
        longueurs=[LongueurIA(premier_mot=3, dernier_mot=4, raison="Digression.")],
    )
    assert convertir(reponse, MOTS, GLOSSAIRE) == {
        "chapitres": [{"titre": "Intro", "debut": 0.0}, {"titre": "API", "debut": 4.0}],
        "termes": [
            {"terme": "SSO", "definition": "Authentification unique.", "occurrences": [2.0], "origine": "ia"},
            {"terme": "API", "definition": "Interface d'échange entre logiciels.", "occurrences": [5.0], "origine": "glossaire"},
        ],
        "longueurs": [{"id": "l0", "debut": 3.0, "fin": 4.5, "raison": "Digression."}],
    }


def faux_client(stop_reason="end_turn", parsed=None):
    reponse = SimpleNamespace(stop_reason=stop_reason, parsed_output=parsed)
    return SimpleNamespace(messages=SimpleNamespace(parse=lambda **kw: reponse))


def test_demander_renvoie_la_reponse():
    attendu = ReponseIA(chapitres=[], termes=[], longueurs=[])
    assert demander(MOTS, {}, "claude-opus-5-5", client=faux_client(parsed=attendu)) is attendu


def test_demander_refus():
    with pytest.raises(ErreurSuggestions, match="refus"):
        demander(MOTS, {}, "claude-opus-5-5", client=faux_client(stop_reason="refusal"))


def test_demander_reponse_vide():
    with pytest.raises(ErreurSuggestions):
        demander(MOTS, {}, "claude-opus-5-5", client=faux_client(parsed=None))


def test_demander_sans_cle_api(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    with pytest.raises(ErreurSuggestions, match="Clé API"):
        demander(MOTS, {}, "claude-opus-5-5")


def test_demander_sortie_invalide():
    try:
        ReponseIA.model_validate({})
    except ValidationError as e:
        invalide = e

    def parse(**kw):
        raise invalide

    client = SimpleNamespace(messages=SimpleNamespace(parse=parse))
    with pytest.raises(ErreurSuggestions, match="inexploitable"):
        demander(MOTS, {}, "claude-opus-5-5", client=client)


@pytest.mark.reseau
def test_appel_reel():
    r = demander(MOTS, GLOSSAIRE, "claude-opus-5-5")
    assert isinstance(r, ReponseIA)
