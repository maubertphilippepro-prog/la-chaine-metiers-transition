"""Recalage d'un tournage analysé avant que l'audio ne suive ses horodatages (voir audio.SUIVRE_HORODATAGES).

Ces analyses ont été faites sur l'audio décodé bout à bout : chaque trou de la piste audio avançait tout ce qui
suit. Le recalage convertit tous les temps vers l'horloge de la source, sans nouvelle transcription ni nouvel
encodage ; les identifiants ne changent pas, si bien que le montage et les consignes restent valables.
"""
import json
import shutil
import subprocess
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Callable

import numpy as np

from .erreurs import ErreurEntree

# Fichiers sauvegardés avant le recalage ; source.mp4 n'est pas modifié.
FICHIERS = ("preparation.json", "transcription.json", "detections.json", "suggestions.json",
            "analyse.json", "montage.json")
# Marque, dans preparation.json, une analyse dont les temps suivent déjà l'horloge de la source.
MARQUE = "audioHorodate"
ECART_NEGLIGEABLE = 0.05


def table_recalage(source: Path) -> tuple[np.ndarray, np.ndarray]:
    """Pour chaque trame audio : sa position dans l'audio décodé bout à bout, et son horodatage réel."""
    def sonder(entrees: str) -> str:
        try:
            return subprocess.run(
                ["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", entrees, "-of", "csv=p=0",
                 str(source)],
                check=True, capture_output=True, text=True,
            ).stdout
        except (OSError, subprocess.CalledProcessError) as e:
            raise ErreurEntree(f"{source.name} : lecture des trames audio impossible ({e}).") from e

    try:
        taux = int(sonder("stream=sample_rate").strip().strip(","))
    except ValueError as e:
        raise ErreurEntree(f"{source.name} : aucune piste audio.") from e
    trames = []
    for ligne in sonder("frame=pts_time,nb_samples").splitlines():
        champs = [c for c in ligne.strip().split(",") if c]
        if len(champs) == 2 and "N/A" not in champs:
            trames.append((float(champs[0]), int(champs[1]) / taux))
    if not trames:
        raise ErreurEntree(f"{source.name} : aucune trame audio.")
    trames.sort()
    reel = np.array([p for p, _ in trames])
    contigu = np.concatenate([[0.0], np.cumsum([d for _, d in trames])[:-1]])
    return contigu, reel


def fonction_recalage(contigu: np.ndarray, reel: np.ndarray, duree: float) -> Callable[[float], float]:
    """Temps de l'ancienne analyse → temps de la source. 0 reste 0 (début de la vidéo, premier chapitre) ;
    au-delà de la dernière trame, le dernier écart s'applique ; rien ne dépasse la durée."""
    dernier_ecart = float(reel[-1] - contigu[-1])

    def f(t: float) -> float:
        if t <= 0:
            return t
        r = float(np.interp(t, contigu, reel)) if t <= contigu[-1] else t + dernier_ecart
        return round(min(r, duree), 4)
    return f


def ecart_final(contigu: np.ndarray, reel: np.ndarray) -> float:
    return float(reel[-1] - contigu[-1])


@dataclass(frozen=True)
class Decalage:
    """Comment changent les temps d'un tournage : instants (débuts de chapitre, occurrences de termes), listes
    d'intervalles (coupes, détections, longueurs, éléments) et mots."""
    point: Callable[[float], float]
    intervalles: Callable[[list[dict]], list[dict]]
    mots: Callable[[list[dict]], list[dict]]


def decalage_ponctuel(f: Callable[[float], float]) -> Decalage:
    """f appliquée à chaque instant et à chaque borne d'intervalle."""
    def intervalles(liste: list[dict]) -> list[dict]:
        return [{**x, "debut": f(x["debut"]), "fin": f(x["fin"])} for x in liste]
    return Decalage(f, intervalles, intervalles)


def _termes(termes: list[dict], dec: Decalage) -> list[dict]:
    return [{**t, "occurrences": [dec.point(o) for o in t["occurrences"]]} for t in termes]


def _chapitres(chapitres: list[dict], dec: Decalage) -> list[dict]:
    return [{**c, "debut": dec.point(c["debut"])} for c in chapitres]


def _suggestions(s: dict | None, dec: Decalage) -> dict | None:
    if not s:
        return s
    return {
        **s,
        "chapitres": _chapitres(s.get("chapitres", []), dec),
        "termes": _termes(s.get("termes", []), dec),
        "longueurs": dec.intervalles(s.get("longueurs", [])),
        # Absent dans une analyse faite avant les éléments à l'écran.
        **({"elements": dec.intervalles(s["elements"])} if "elements" in s else {}),
    }


def _montage(m: dict, dec: Decalage) -> dict:
    return {
        **m,
        "coupes": dec.intervalles(m["coupes"]),
        "chapitres": _chapitres(m["chapitres"], dec),
        "termes": _termes(m["termes"], dec),
        **({"elements": dec.intervalles(m["elements"])} if "elements" in m else {}),
    }


# Fichiers dont les temps suivent la source.
FICHIERS_DECALES = ("transcription.json", "detections.json", "suggestions.json", "montage.json", "analyse.json")


def decaler_donnees(donnees: dict, dec: Decalage) -> dict:
    """Copie de donnees (nom de fichier → contenu) où tous les temps sont passés par dec ; les autres fichiers
    sont rendus tels quels."""
    transformations = {
        "transcription.json": dec.mots,
        "detections.json": dec.intervalles,
        "suggestions.json": lambda s: _suggestions(s, dec),
        "montage.json": lambda m: _montage(m, dec),
        "analyse.json": lambda a: {
            **a,
            "mots": dec.mots(a["mots"]),
            "detections": dec.intervalles(a["detections"]),
            "suggestions": _suggestions(a["suggestions"], dec),
        },
    }
    return {nom: transformations[nom](contenu) if nom in transformations else contenu for nom, contenu in donnees.items()}


def _lire(chemin: Path):
    return json.loads(chemin.read_text(encoding="utf-8"))


def decaler_tournage(dossier: Path, dec: Decalage, ecrire) -> None:
    """Applique dec à tous les temps des fichiers d'analyse et du montage qui existent."""
    lus = {nom: _lire(dossier / nom) for nom in FICHIERS_DECALES if (dossier / nom).exists()}
    for nom, contenu in decaler_donnees(lus, dec).items():
        ecrire(dossier / nom, contenu)


def recaler(dossier: Path, ecrire) -> str:
    """Recale le tournage ; renvoie le compte rendu. Ne fait rien si c'est inutile ou déjà fait."""
    preparation_chemin = dossier / "preparation.json"
    if not preparation_chemin.exists() or not (dossier / "transcription.json").exists():
        raise ErreurEntree(f"{dossier} : analyse incomplète, rien à recaler.")
    preparation = _lire(preparation_chemin)
    if preparation.get(MARQUE):
        return "Déjà recalé : les temps suivent l'horloge de la source."
    contigu, reel = table_recalage(dossier / "source.mp4")
    ecart = ecart_final(contigu, reel)
    if abs(ecart) < ECART_NEGLIGEABLE:
        ecrire(preparation_chemin, {**preparation, MARQUE: True})
        return f"Écart de {ecart:.3f} s en fin de vidéo : aucun recalage nécessaire."

    sauvegarde = dossier / "historique" / f"{datetime.now():%Y%m%d-%H%M%S}-recalage"
    sauvegarde.mkdir(parents=True)
    for nom in FICHIERS:
        if (dossier / nom).exists():
            shutil.copy2(dossier / nom, sauvegarde / nom)

    decaler_tournage(dossier, decalage_ponctuel(fonction_recalage(contigu, reel, preparation["duree"])), ecrire)
    ecrire(preparation_chemin, {**preparation, MARQUE: True})
    return f"Temps recalés (jusqu'à {ecart:+.3f} s en fin de vidéo). Sauvegarde : {sauvegarde}"
