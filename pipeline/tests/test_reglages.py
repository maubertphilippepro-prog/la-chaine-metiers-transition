from mtpipeline.reglages import RACINE, charger_reglages


def test_charge_les_reglages_par_defaut():
    r = charger_reglages()
    assert r["detection"]["silenceMin"] == 0.7
    assert r["modeles"]["whisper"] == "large-v3"


def test_racine_pointe_sur_le_projet():
    assert (RACINE / "reglages.json").exists()
