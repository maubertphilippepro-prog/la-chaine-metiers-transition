import os

from mtpipeline.environnement import charger_env


def test_fichier_absent_sans_erreur(tmp_path):
    charger_env(tmp_path / ".env")


def test_cle_simple(tmp_path, monkeypatch):
    monkeypatch.delenv("MT_TEST_CLE", raising=False)
    fichier = tmp_path / ".env"
    fichier.write_text("MT_TEST_CLE=valeur\n", encoding="utf-8")
    charger_env(fichier)
    assert os.environ["MT_TEST_CLE"] == "valeur"
    monkeypatch.delenv("MT_TEST_CLE", raising=False)


def test_guillemets_export_espaces_commentaires(tmp_path, monkeypatch):
    for nom in ("MT_TEST_A", "MT_TEST_B", "MT_TEST_C"):
        monkeypatch.delenv(nom, raising=False)
    fichier = tmp_path / ".env"
    fichier.write_text(
        '# commentaire\n\nexport MT_TEST_A = "un deux"\n  MT_TEST_B=\'trois\'  \nMT_TEST_C =  quatre \nligne sans egal\n=vide\n',
        encoding="utf-8",
    )
    charger_env(fichier)
    assert os.environ["MT_TEST_A"] == "un deux"
    assert os.environ["MT_TEST_B"] == "trois"
    assert os.environ["MT_TEST_C"] == "quatre"
    for nom in ("MT_TEST_A", "MT_TEST_B", "MT_TEST_C"):
        monkeypatch.delenv(nom, raising=False)


def test_bom_en_debut_de_fichier(tmp_path, monkeypatch):
    monkeypatch.delenv("MT_TEST_BOM", raising=False)
    fichier = tmp_path / ".env"
    fichier.write_bytes(b"\xef\xbb\xbfMT_TEST_BOM=ok\n")
    charger_env(fichier)
    assert os.environ["MT_TEST_BOM"] == "ok"
    monkeypatch.delenv("MT_TEST_BOM", raising=False)


def test_variable_deja_definie_non_ecrasee(tmp_path, monkeypatch):
    monkeypatch.setenv("MT_TEST_CLE", "reelle")
    fichier = tmp_path / ".env"
    fichier.write_text("MT_TEST_CLE=fichier\n", encoding="utf-8")
    charger_env(fichier)
    assert os.environ["MT_TEST_CLE"] == "reelle"


def test_valeur_contenant_egal(tmp_path, monkeypatch):
    monkeypatch.delenv("MT_TEST_EGAL", raising=False)
    fichier = tmp_path / ".env"
    fichier.write_text("MT_TEST_EGAL=a=b==\n", encoding="utf-8")
    charger_env(fichier)
    assert os.environ["MT_TEST_EGAL"] == "a=b=="
    monkeypatch.delenv("MT_TEST_EGAL", raising=False)
