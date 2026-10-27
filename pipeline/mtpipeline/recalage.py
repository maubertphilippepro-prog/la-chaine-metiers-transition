"""Recalage d'un tournage analysé avant que l'audio ne suive ses horodatages (voir audio.SUIVRE_HORODATAGES).

Ces analyses ont été faites sur l'audio décodé bout à bout : chaque trou de la piste audio avançait tout ce qui
suit. Le recalage convertit tous les temps vers l'horloge de la source, sans nouvelle transcription ni nouvel
encodage ; les identifiants ne changent pas, si bien que le montage et les consignes restent valables.
"""
import json
import shutil
import subprocess
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


def _intervalles(liste: list[dict], f) -> None:
    for x in liste:
        x["debut"] = f(x["debut"])
        x["fin"] = f(x["fin"])


def _suggestions(s: dict | None, f) -> None:
    if not s:
        return
    for c in s.get("chapitres", []):
        c["debut"] = f(c["debut"])
    for t in s.get("termes", []):
        t["occurrences"] = [f(o) for o in t["occurrences"]]
    _intervalles(s.get("longueurs", []), f)
    _intervalles(s.get("elements", []), f)


def _montage(m: dict, f) -> None:
    _intervalles(m["coupes"], f)
    for c in m["chapitres"]:
        c["debut"] = f(c["debut"])
    for t in m["termes"]:
        t["occurrences"] = [f(o) for o in t["occurrences"]]
    _intervalles(m.get("elements", []), f)


def _lire(chemin: Path):
    return json.loads(chemin.read_text(encoding="utf-8"))


def decaler_tournage(dossier: Path, f: Callable[[float], float], ecrire) -> None:
    """Applique f à tous les temps des fichiers d'analyse et du montage (s'ils existent), puis à analyse.json."""
    def transformer(nom: str, action) -> None:
        chemin = dossier / nom
        if chemin.exists():
            donnees = _lire(chemin)
            action(donnees)
            ecrire(chemin, donnees)

    transformer("transcription.json", lambda mots: _intervalles(mots, f))
    transformer("detections.json", lambda d: _intervalles(d, f))
    transformer("suggestions.json", lambda s: _suggestions(s, f))
    transformer("montage.json", lambda m: _montage(m, f))

    def analyse(a: dict) -> None:
        _intervalles(a["mots"], f)
        _intervalles(a["detections"], f)
        _suggestions(a["suggestions"], f)
    transformer("analyse.json", analyse)


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

    decaler_tournage(dossier, fonction_recalage(contigu, reel, preparation["duree"]), ecrire)
    ecrire(preparation_chemin, {**preparation, MARQUE: True})
    return f"Temps recalés (jusqu'à {ecart:+.3f} s en fin de vidéo). Sauvegarde : {sauvegarde}"
