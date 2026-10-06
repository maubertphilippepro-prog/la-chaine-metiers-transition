import json

from mtpipeline.glossaire import charger_glossaire


def test_glossaire_absent(tmp_path):
    assert charger_glossaire(tmp_path / "glossaire.json") == {}


def test_glossaire_indexe_en_minuscules(tmp_path):
    chemin = tmp_path / "glossaire.json"
    chemin.write_text(json.dumps({"termes": [{"terme": "SSO", "definition": "Authentification unique."}]}), encoding="utf-8")
    assert charger_glossaire(chemin) == {"sso": {"terme": "SSO", "definition": "Authentification unique."}}
