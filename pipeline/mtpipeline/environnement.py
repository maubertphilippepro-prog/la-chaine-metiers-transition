import os
from pathlib import Path


def charger_env(chemin: Path) -> None:
    """Charge un fichier .env dans os.environ sans écraser les variables déjà définies."""
    if not chemin.exists():
        return
    for ligne in chemin.read_text(encoding="utf-8-sig").splitlines():
        ligne = ligne.strip()
        if not ligne or ligne.startswith("#"):
            continue
        if ligne.startswith("export "):
            ligne = ligne[len("export "):]
        cle, separateur, valeur = ligne.partition("=")
        cle = cle.strip()
        if not separateur or not cle:
            continue
        valeur = valeur.strip()
        if len(valeur) >= 2 and valeur[0] == valeur[-1] and valeur[0] in "'\"":
            valeur = valeur[1:-1]
        os.environ.setdefault(cle, valeur)
