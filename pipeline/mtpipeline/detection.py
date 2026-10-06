import re

import numpy as np

HESITATIONS = {"euh", "heu", "hum", "hmm", "euhm"}
REPETITIONS_LEGITIMES = {"nous", "vous", "très", "tout", "si", "bien", "non", "oui"}
TRAME = 0.02


def normaliser(texte: str) -> str:
    return re.sub(r"[^\w']", "", texte.lower())


def proportion_voisee(audio: np.ndarray, taux: int, debut: float, fin: float, seuil_db: float) -> float:
    extrait = audio[int(debut * taux):int(fin * taux)]
    taille = int(TRAME * taux)
    nb = len(extrait) // taille
    if nb == 0:
        return 0.0
    trames = extrait[:nb * taille].reshape(nb, taille)
    rms = np.sqrt(np.mean(trames ** 2, axis=1))
    db = 20 * np.log10(np.maximum(rms, 1e-10))
    return float(np.mean(db > seuil_db))


def detecter_trous(mots: list[dict], audio: np.ndarray, taux: int, duree: float, cfg: dict) -> list[dict]:
    if not mots:
        return [{"type": "silence", "debut": 0.0, "fin": duree}] if duree >= cfg["silenceMin"] else []
    trous = [(0.0, mots[0]["debut"], True)]
    trous += [(a["fin"], b["debut"], False) for a, b in zip(mots, mots[1:])]
    trous.append((mots[-1]["fin"], duree, True))

    resultats = []
    for debut, fin, bord in trous:
        longueur = fin - debut
        if not bord and longueur >= cfg["hesitationMin"]:
            voix = proportion_voisee(audio, taux, debut, fin, cfg["seuilSilenceDb"])
            if voix >= cfg["proportionVoiseeHesitation"]:
                resultats.append({"type": "hesitation", "debut": debut, "fin": fin})
                continue
        if longueur >= cfg["silenceMin"]:
            resultats.append({"type": "silence", "debut": debut, "fin": fin})
    return resultats


def detecter_hesitations_transcrites(mots: list[dict], cfg: dict) -> list[dict]:
    return [
        {"type": "hesitation", "debut": m["debut"], "fin": m["fin"]}
        for m in mots
        if normaliser(m["texte"]) in HESITATIONS and m["fin"] - m["debut"] >= cfg["hesitationMin"]
    ]


def detecter_repetitions(mots: list[dict], max_mots: int) -> list[dict]:
    textes = [normaliser(m["texte"]) for m in mots]
    resultats = []
    i = 0
    while i < len(mots):
        trouve = 0
        for n in range(max_mots, 0, -1):
            if i + 2 * n > len(mots):
                continue
            if textes[i:i + n] == textes[i + n:i + 2 * n]:
                if n == 1 and textes[i] in REPETITIONS_LEGITIMES:
                    continue
                trouve = n
                break
        if trouve:
            resultats.append({"type": "repetition", "debut": mots[i]["debut"], "fin": mots[i + trouve]["debut"]})
            i += trouve
        else:
            i += 1
    return resultats


def detecter(mots: list[dict], audio: np.ndarray, taux: int, duree: float, cfg: dict) -> list[dict]:
    toutes = (
        detecter_trous(mots, audio, taux, duree, cfg)
        + detecter_hesitations_transcrites(mots, cfg)
        + detecter_repetitions(mots, cfg["repetitionMaxMots"])
    )
    toutes.sort(key=lambda d: d["debut"])
    return [{"id": f"d{i}", **d} for i, d in enumerate(toutes)]
