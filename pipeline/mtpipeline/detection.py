import re
from difflib import SequenceMatcher

import numpy as np

HESITATIONS = {"euh", "heu", "hum", "hmm", "euhm"}
REPETITIONS_LEGITIMES = {"nous", "vous", "très", "tout", "si", "bien", "non", "oui"}
# Mots qu'on peut couper avec une hésitation sans perdre de sens.
MOTS_ANODINS = HESITATIONS | {"bon", "ben", "alors", "donc", "là", "et", "voilà", "ok", "hop"}
TRAME = 0.02
# Creux de voix toléré à l'intérieur d'un mot dont on prolonge la fin : la tenue d'une consonne
# comme le « t » final de « sept » dure environ 0,12 s avant son explosion.
CREUX_DANS_MOT = 0.15
# Mots-clés de tournage : « action » ouvre une prise, « coupez » la déclare ratée
# (Whisper l'écrit parfois comme le participe).
ACTION = {"action"}
COUPEZ = {"coupez", "coupé", "coupée", "couper"}


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


def prolonger_mots(mots: list[dict], audio: np.ndarray, taux: int, cfg: dict) -> list[dict]:
    """L'alignement tronque parfois la fin d'un mot (les nombres surtout : « 2027 » calé sur 0,1 s).
    La fin est repoussée tant que la voix continue, sans dépasser le mot suivant ni prolongementMotMax."""
    voise = niveaux_db(audio, taux) > cfg["seuilSilenceDb"]
    creux_max = round(CREUX_DANS_MOT / TRAME)
    resultats = []
    for i, m in enumerate(mots):
        suivant = mots[i + 1]["debut"] if i + 1 < len(mots) else len(voise) * TRAME
        limite = min(suivant, m["fin"] + cfg["prolongementMotMax"])
        fin, creux, t = m["fin"], 0, int(m["fin"] / TRAME)
        while t < len(voise) and t * TRAME < limite and creux < creux_max:
            if voise[t]:
                fin, creux = (t + 1) * TRAME, 0
            else:
                creux += 1
            t += 1
        resultats.append({**m, "fin": max(m["fin"], min(fin, limite))})
    return resultats


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


def detecter_prises(mots: list[dict], duree: float, cfg: dict) -> list[dict]:
    """Chaque « action » est retiré, et une prise ratée (« coupez ») l'est depuis son « action », ou
    à défaut depuis la fin de la prise ratée précédente (ou le début), jusqu'au mot qui suit « coupez ».
    « action » ne compte que prononcé isolé, « coupez » que suivi d'une pause."""
    pause = cfg["pauseMotCle"]

    def suite(i: int) -> float:
        return mots[i + 1]["debut"] if i + 1 < len(mots) else duree

    resultats: list[dict] = []
    debut_prise = 0.0
    for i, m in enumerate(mots):
        n = normaliser(m["texte"])
        pause_avant = m["debut"] - (mots[i - 1]["fin"] if i > 0 else 0.0)
        pause_apres = suite(i) - m["fin"]
        if n in ACTION and pause_avant >= pause and pause_apres >= pause:
            debut_prise = m["debut"]
            resultats.append({"type": "prise", "debut": m["debut"], "fin": suite(i)})
        elif n in COUPEZ and pause_apres >= pause:
            if resultats and resultats[-1]["debut"] == debut_prise:
                resultats.pop()
            resultats.append({"type": "prise", "debut": debut_prise, "fin": suite(i)})
            debut_prise = suite(i)
    return resultats


def detecter(mots: list[dict], audio: np.ndarray, taux: int, duree: float, cfg: dict) -> list[dict]:
    mots = prolonger_mots(mots, audio, taux, cfg)
    toutes = fusionner_silences(
        detecter_trous(mots, audio, taux, duree, cfg)
        + detecter_silences_audio(audio, taux, cfg)
        + detecter_hesitations_transcrites(mots, cfg)
        + detecter_repetitions(mots, cfg["repetitionMaxMots"])
        + detecter_prises(mots, duree, cfg)
    )
    toutes.sort(key=lambda d: d["debut"])
    return [{"id": f"d{i}", **d} for i, d in enumerate(toutes)]


def mots_perdus(avec: str, sans: str) -> str:
    """Mots porteurs de sens entendus dans « avec » (contexte + coupe) et absents de « sans »
    (contexte seul). Les bords sont ignorés : Whisper y perd des mots même sans coupe. Un passage
    seulement reconnu autrement (« NIA préféré » / « nid à préférence ») n'est pas une perte."""
    a, b = avec.split(), sans.split()
    na, nb = [normaliser(m) for m in a], [normaliser(m) for m in b]
    perdus = []
    for op, i1, i2, j1, j2 in SequenceMatcher(None, na, nb, autojunk=False).get_opcodes():
        if op not in ("delete", "replace") or i1 == 0 or i2 == len(a):
            continue
        utiles = [i for i in range(i1, i2) if na[i] and na[i] not in MOTS_ANODINS]
        remplacants = "".join(n for n in nb[j1:j2] if n not in MOTS_ANODINS)
        perdu = "".join(na[i] for i in utiles)
        if utiles and SequenceMatcher(None, perdu, remplacants).ratio() < 0.6:
            perdus += [a[i] for i in utiles]
    return " ".join(perdus)


def paroles_significatives(texte: str) -> bool:
    return any(n not in MOTS_ANODINS for n in map(normaliser, texte.split()) if n)


def marquer_paroles(detections: list[dict], transcrire_extraits) -> list[dict]:
    """Réécoute chaque hésitation : si sa coupe ferait perdre de vrais mots (oubliés par la
    transcription), ils sont notés dans « paroles » et la coupe ne sera pas active par défaut."""
    hesitations = [d for d in detections if d["type"] == "hesitation"]
    if not hesitations:
        return detections
    textes = transcrire_extraits([(d["debut"], d["fin"]) for d in hesitations])
    paroles = {d["id"]: t for d, t in zip(hesitations, textes) if paroles_significatives(t)}
    return [{**d, "paroles": paroles[d["id"]]} if d["id"] in paroles else d for d in detections]
