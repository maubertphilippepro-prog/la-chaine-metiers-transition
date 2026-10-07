import numpy as np

from mtpipeline.detection import (
    detecter, detecter_hesitations_transcrites, detecter_repetitions, detecter_silences_audio,
    detecter_trous, normaliser, proportion_voisee,
)

TAUX = 16000
CFG = {"silenceMin": 0.7, "hesitationMin": 0.4, "seuilSilenceDb": -40,
       "proportionVoiseeHesitation": 0.3, "repetitionMaxMots": 4, "hesitationTranscriteMin": 0}


def mot(i, texte, debut, fin):
    return {"id": i, "texte": texte, "debut": debut, "fin": fin}


def audio_avec_voix(duree, zones):
    """Silence partout sauf dans les zones (debut, fin) remplies d'un son à -10 dB."""
    audio = np.zeros(int(duree * TAUX), dtype=np.float32)
    for debut, fin in zones:
        t = np.arange(int(debut * TAUX), int(fin * TAUX))
        audio[t] = 0.3 * np.sin(2 * np.pi * 200 * t / TAUX)
    return audio


def test_normaliser():
    assert normaliser("Euh,") == "euh"
    assert normaliser("Aujourd'hui.") == "aujourd'hui"


def test_proportion_voisee():
    audio = audio_avec_voix(2, [(0, 1)])
    assert proportion_voisee(audio, TAUX, 0, 1, -40) > 0.9
    assert proportion_voisee(audio, TAUX, 1, 2, -40) < 0.1


def test_trou_silencieux_long_est_un_silence():
    mots = [mot(0, "a", 0.0, 1.0), mot(1, "b", 2.0, 3.0)]
    audio = audio_avec_voix(3, [(0, 1), (2, 3)])
    assert detecter_trous(mots, audio, TAUX, 3.0, CFG) == [
        {"type": "silence", "debut": 1.0, "fin": 2.0},
    ]


def test_trou_voise_est_une_hesitation():
    mots = [mot(0, "a", 0.0, 1.0), mot(1, "b", 1.6, 3.0)]
    audio = audio_avec_voix(3, [(0, 3)])
    assert detecter_trous(mots, audio, TAUX, 3.0, CFG) == [
        {"type": "hesitation", "debut": 1.0, "fin": 1.6},
    ]


def test_trou_court_ignore():
    mots = [mot(0, "a", 0.0, 1.0), mot(1, "b", 1.3, 3.0)]
    assert detecter_trous(mots, audio_avec_voix(3, [(0, 3)]), TAUX, 3.0, CFG) == []


def test_trous_de_bord_sont_des_silences():
    mots = [mot(0, "a", 1.0, 2.0)]
    audio = audio_avec_voix(4, [(0, 4)])
    assert detecter_trous(mots, audio, TAUX, 4.0, CFG) == [
        {"type": "silence", "debut": 0.0, "fin": 1.0},
        {"type": "silence", "debut": 2.0, "fin": 4.0},
    ]


def test_hesitation_transcrite_seuil_reglable():
    cfg = {**CFG, "hesitationTranscriteMin": 0.4}
    mots = [mot(0, "Euh,", 0.0, 0.6), mot(1, "euh", 1.0, 1.2), mot(2, "bon", 1.3, 1.5)]
    assert detecter_hesitations_transcrites(mots, cfg) == [
        {"type": "hesitation", "debut": 0.0, "fin": 1.0},
    ]


def test_hesitation_transcrite_courte_coupee_par_defaut():
    mots = [mot(0, "alors", 0.0, 0.5), mot(1, "euh,", 0.6, 0.7), mot(2, "bon", 0.9, 1.2)]
    assert detecter_hesitations_transcrites(mots, CFG) == [
        {"type": "hesitation", "debut": 0.5, "fin": 0.9},
    ]


def test_hesitation_transcrite_entre_deux_mots():
    mots = [mot(0, "alors", 0.0, 0.5), mot(1, "euh", 0.7, 1.3), mot(2, "bon", 1.5, 1.8)]
    assert detecter_hesitations_transcrites(mots, CFG) == [
        {"type": "hesitation", "debut": 0.5, "fin": 1.5},
    ]


def test_hesitation_transcrite_premier_et_dernier_mot():
    mots = [mot(0, "euh", 0.2, 0.8), mot(1, "bon", 1.0, 1.3), mot(2, "heu", 1.5, 2.0)]
    assert detecter_hesitations_transcrites(mots, CFG) == [
        {"type": "hesitation", "debut": 0.2, "fin": 1.0},
        {"type": "hesitation", "debut": 1.3, "fin": 2.0},
    ]


def test_repetition_de_plusieurs_mots():
    mots = [mot(0, "on", 0, .2), mot(1, "va", .2, .4), mot(2, "on", .5, .7),
            mot(3, "va", .7, .9), mot(4, "voir", .9, 1.2)]
    assert detecter_repetitions(mots, 4) == [{"type": "repetition", "debut": 0, "fin": .5}]


def test_repetition_legitime_ignoree():
    mots = [mot(0, "nous", 0, .2), mot(1, "nous", .2, .4), mot(2, "sommes", .4, .8)]
    assert detecter_repetitions(mots, 4) == []


def test_ponctuation_seule_jamais_repetee():
    mots = [mot(0, "…", 0, .2), mot(1, "…", .2, .4), mot(2, "bonjour", .4, .8)]
    assert detecter_repetitions(mots, 4) == []


def test_begaiement_detecte():
    mots = [mot(0, "le", 0, .1), mot(1, "le", .2, .3), mot(2, "SSO", .3, .8)]
    assert detecter_repetitions(mots, 4) == [{"type": "repetition", "debut": 0, "fin": .2}]


def test_detecter_trie_et_numerote():
    mots = [mot(0, "le", 0.0, 0.1), mot(1, "le", 0.2, 0.3), mot(2, "SSO", 0.3, 1.0), mot(3, "fin", 2.0, 2.5)]
    audio = audio_avec_voix(2.5, [(0, 1), (2, 2.5)])
    d = detecter(mots, audio, TAUX, 2.5, CFG)
    assert [(x["id"], x["type"]) for x in d] == [("d0", "repetition"), ("d1", "silence")]


def test_silences_audio_longs_detectes():
    audio = audio_avec_voix(3, [(0, 1), (2.5, 3)])
    d = detecter_silences_audio(audio, TAUX, CFG)
    assert len(d) == 1 and d[0]["type"] == "silence"
    assert abs(d[0]["debut"] - 1.0) <= 0.02 and abs(d[0]["fin"] - 2.5) <= 0.02


def test_silence_audio_trop_court_ignore():
    audio = audio_avec_voix(3, [(0, 1), (1.5, 3)])
    assert detecter_silences_audio(audio, TAUX, CFG) == []


def test_silence_a_l_interieur_d_un_mot_etire():
    mots = [mot(0, "long", 0.0, 3.0)]
    audio = audio_avec_voix(3, [(0, 1), (2.5, 3)])
    d = detecter(mots, audio, TAUX, 3.0, CFG)
    assert len(d) == 1 and d[0]["type"] == "silence"
    assert abs(d[0]["debut"] - 1.0) <= 0.02 and abs(d[0]["fin"] - 2.5) <= 0.02


def test_silences_chevauchants_fusionnes():
    mots = [mot(0, "a", 0.0, 1.0), mot(1, "b", 2.0, 3.0)]
    audio = audio_avec_voix(3, [(0, 1), (2, 3)])
    d = detecter(mots, audio, TAUX, 3.0, CFG)
    assert len(d) == 1 and d[0]["type"] == "silence"
    assert abs(d[0]["debut"] - 1.0) <= 0.02 and abs(d[0]["fin"] - 2.0) <= 0.02
