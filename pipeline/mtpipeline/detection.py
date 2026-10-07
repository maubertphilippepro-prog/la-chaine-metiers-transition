import re

import numpy as np

HESITATIONS = {"euh", "heu", "hum", "hmm", "euhm"}
REPETITIONS_LEGITIMES = {"nous", "vous", "très", "tout", "si", "bien", "non", "oui"}
TRAME = 0.02


def normaliser(texte: str) -> str:
    return re.sub(r"[^\w']", "", texte.lower())


def niveaux_db(audio: np.ndarray, taux: int) -> np.ndarray:
    taille = int(TRAME * taux)
    nb = len(audio) // taille
    if nb == 0:
        return np.array([])
    trames = audio[:nb * taille].reshape(nb, taille)
    rms = np.sqrt(np.mean(trames ** 2, axis=1))
    return 20 * np.log10(np.maximum(rms, 1e-10))


def proportion_voisee(audio: np.ndarray, taux: int, debut: float, fin: float, seuil_db: float) -> float:
    db = niveaux_db(audio[int(debut * taux):int(fin * taux)], taux)
    return float(np.mean(db > seuil_db)) if len(db) else 0.0


def detecter_silences_audio(audio: np.ndarray, taux: int, cfg: dict) -> list[dict]:
    """Suites de trames sous le seuil, d'au moins silenceMin secondes (indépendamment des mots)."""
    sous_seuil = niveaux_db(audio, taux) < cfg["seuilSilenceDb"]
    bornes = np.flatnonzero(np.diff(np.concatenate(([0], sous_seuil.astype(int), [0]))))
    return [
        {"type": "silence", "debut": float(d * TRAME), "fin": float(f * TRAME)}
        for d, f in zip(bornes[::2], bornes[1::2])
        if (f - d) * TRAME >= cfg["silenceMin"]
    ]


def fusionner_silences(detections: list[dict]) -> list[dict]:
    """Union des silences qui se chevauchent ou se touchent ; les autres types restent tels quels."""
    fusion = []
    for d in sorted((d for d in detections if d["type"] == "silence"), key=lambda d: d["debut"]):
        if fusion and d["debut"] <= fusion[-1]["fin"]:
            fusion[-1] = {**fusion[-1], "fin": max(fusion[-1]["fin"], d["fin"])}
        else:
            fusion.append(d)
    return fusion + [d for d in detections if d["type"] != "silence"]


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
    """Couvre le « euh » et les blancs qui l'entourent, jusqu'aux mots voisins."""
    return [
        {
            "type": "hesitation",
            "debut": mots[i - 1]["fin"] if i > 0 else m["debut"],
            "fin": mots[i + 1]["debut"] if i + 1 < len(mots) else m["fin"],
        }
        for i, m in enumerate(mots)
        if normaliser(m["texte"]) in HESITATIONS and m["fin"] - m["debut"] >= cfg["hesitationTranscriteMin"]
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
            if "" in textes[i:i + n]:
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
    toutes = fusionner_silences(
        detecter_trous(mots, audio, taux, duree, cfg)
        + detecter_silences_audio(audio, taux, cfg)
        + detecter_hesitations_transcrites(mots, cfg)
        + detecter_repetitions(mots, cfg["repetitionMaxMots"])
    )
    toutes.sort(key=lambda d: d["debut"])
    return [{"id": f"d{i}", **d} for i, d in enumerate(toutes)]
