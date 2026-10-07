import os

from mtpipeline import cli
from mtpipeline.environnement import charger_env


def _nettoyer_a_la_fin(monkeypatch, *noms):
    """Garantit que les clés factices seront retirées de os.environ au teardown."""
    for nom in noms:
        monkeypatch.setenv(nom, "x")
        monkeypatch.delenv(nom)


def test_fichier_absent_sans_erreur(tmp_path):
    avant = dict(os.environ)
    charger_env(tmp_path / ".env")
    assert dict(os.environ) == avant


def test_cle_simple(tmp_path, monkeypatch):
    _nettoyer_a_la_fin(monkeypatch, "MT_TEST_CLE")
    fichier = tmp_path / ".env"
    fichier.write_text("MT_TEST_CLE=valeur\n", encoding="utf-8")
    charger_env(fichier)
    assert os.environ["MT_TEST_CLE"] == "valeur"


def test_guillemets_export_espaces_commentaires(tmp_path, monkeypatch):
    _nettoyer_a_la_fin(monkeypatch, "MT_TEST_A", "MT_TEST_B", "MT_TEST_C")
    fichier = tmp_path / ".env"
    fichier.write_text(
        '# commentaire\n\nexport MT_TEST_A = "un deux"\n  MT_TEST_B=\'trois\'  \nMT_TEST_C =  quatre \nligne sans egal\n=vide\n',
        encoding="utf-8",
    )
    charger_env(fichier)
    assert os.environ["MT_TEST_A"] == "un deux"
    assert os.environ["MT_TEST_B"] == "trois"
    assert os.environ["MT_TEST_C"] == "quatre"


def test_bom_en_debut_de_fichier(tmp_path, monkeypatch):
    _nettoyer_a_la_fin(monkeypatch, "MT_TEST_BOM")
    fichier = tmp_path / ".env"
    fichier.write_bytes(b"\xef\xbb\xbfMT_TEST_BOM=ok\n")
    charger_env(fichier)
    assert os.environ["MT_TEST_BOM"] == "ok"


def test_variable_deja_definie_non_ecrasee(tmp_path, monkeypatch):
    monkeypatch.setenv("MT_TEST_CLE", "reelle")
    fichier = tmp_path / ".env"
    fichier.write_text("MT_TEST_CLE=fichier\n", encoding="utf-8")
    charger_env(fichier)
    assert os.environ["MT_TEST_CLE"] == "reelle"


def test_valeur_contenant_egal(tmp_path, monkeypatch):
    _nettoyer_a_la_fin(monkeypatch, "MT_TEST_EGAL")
    fichier = tmp_path / ".env"
    fichier.write_text("MT_TEST_EGAL=a=b==\n", encoding="utf-8")
    charger_env(fichier)
    assert os.environ["MT_TEST_EGAL"] == "a=b=="


def test_cli_ne_charge_pas_le_env_reel_pendant_les_tests(tmp_path):
    fichier = tmp_path / ".env"
    fichier.write_text("MT_TEST_ISOLE=1\n", encoding="utf-8")
    cli.charger_env(fichier)
    assert "MT_TEST_ISOLE" not in os.environ
