import argparse
import json
import os
import sys
from pathlib import Path

from .audio import TAUX, charger_audio
from .detection import detecter
from .erreurs import ErreurEntree, ErreurSuggestions
from .glossaire import charger_glossaire
from .preparation import preparer
from .reglages import RACINE, charger_reglages
from .suggestions import convertir, demander
from .transcription import transcrire

EXTENSIONS = {".mp4", ".mkv", ".mov"}


def lire(chemin: Path):
    return json.loads(chemin.read_text(encoding="utf-8"))


def ecrire(chemin: Path, donnees) -> None:
    temporaire = chemin.with_suffix(chemin.suffix + ".tmp")
    temporaire.write_text(json.dumps(donnees, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporaire, chemin)


def ecrire_episode(dossier: Path, titre: str, statut: str, message: str | None) -> None:
    ecrire(dossier / "episode.json", {"version": 1, "titre": titre, "statut": statut, "message": message})


def etape_suggestions(dossier: Path, mots: list[dict], reglages: dict, demander_fn, glossaire_chemin: Path):
    fichier = dossier / "suggestions.json"
    if fichier.exists():
        return lire(fichier), None
    try:
        glossaire = charger_glossaire(glossaire_chemin)
    except (ValueError, KeyError, TypeError, AttributeError, OSError) as e:
        return None, f"glossaire.json illisible : {e!r}"
    try:
        reponse = demander_fn(mots, glossaire, reglages["modeles"]["claude"])
    except ErreurSuggestions as e:
        return None, str(e)
    suggestions = convertir(reponse, mots, glossaire)
    ecrire(fichier, suggestions)
    return suggestions, None


def assembler(dossier: Path, suggestions, erreur) -> dict:
    preparation = lire(dossier / "preparation.json")
    analyse = {
        "version": 1,
        "duree": preparation["duree"],
        "fps": preparation["fps"],
        "mots": lire(dossier / "transcription.json"),
        "detections": lire(dossier / "detections.json"),
        "suggestions": suggestions,
        "erreurSuggestions": erreur,
    }
    ecrire(dossier / "analyse.json", analyse)
    return analyse


def analyser(dossier: Path, titre: str, reglages: dict, transcrire_fn=transcrire, demander_fn=demander,
             glossaire_chemin: Path | None = None) -> dict:
    if not dossier.is_dir():
        raise ErreurEntree(f"Dossier de tournage introuvable : {dossier}")
    glossaire_chemin = glossaire_chemin or RACINE / "donnees" / "glossaire.json"
    source = dossier / "source.mp4"
    try:
        if not (dossier / "preparation.json").exists():
            if not (dossier / "bruts").is_dir():
                raise ErreurEntree(f"Dossier bruts/ introuvable dans {dossier}.")
            bruts = sorted(p for p in (dossier / "bruts").iterdir() if p.suffix.lower() in EXTENSIONS)
            ecrire(dossier / "preparation.json", preparer(bruts, source))

        if not (dossier / "transcription.json").exists():
            ecrire(dossier / "transcription.json", transcrire_fn(source, reglages["modeles"]["whisper"]))
        mots = lire(dossier / "transcription.json")

        if not (dossier / "detections.json").exists():
            duree = lire(dossier / "preparation.json")["duree"]
            ecrire(dossier / "detections.json",
                   detecter(mots, charger_audio(source), TAUX, duree, reglages["detection"]))
    except ErreurEntree as e:
        ecrire_episode(dossier, titre, "erreur", str(e))
        raise

    suggestions, erreur = etape_suggestions(dossier, mots, reglages, demander_fn, glossaire_chemin)
    analyse = assembler(dossier, suggestions, erreur)
    ecrire_episode(dossier, titre, "analyse", None)
    return analyse


def relancer_suggestions(dossier: Path, reglages: dict, demander_fn=demander,
                         glossaire_chemin: Path | None = None) -> dict:
    if not dossier.is_dir():
        raise ErreurEntree(f"Dossier de tournage introuvable : {dossier}")
    glossaire_chemin = glossaire_chemin or RACINE / "donnees" / "glossaire.json"
    if not all((dossier / f).exists() for f in ("preparation.json", "transcription.json", "detections.json")):
        raise ErreurEntree(f"{dossier} : analyse incomplète, lancez d'abord « analyser ».")
    (dossier / "suggestions.json").unlink(missing_ok=True)
    mots = lire(dossier / "transcription.json")
    suggestions, erreur = etape_suggestions(dossier, mots, reglages, demander_fn, glossaire_chemin)
    return assembler(dossier, suggestions, erreur)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="mtpipeline", description="Analyse d'un tournage.")
    sous = parser.add_subparsers(dest="commande", required=True)
    p_analyser = sous.add_parser("analyser", help="Analyser un dossier de tournage.")
    p_analyser.add_argument("dossier", type=Path)
    p_analyser.add_argument("--titre", required=True)
    p_relancer = sous.add_parser("relancer-suggestions", help="Relancer uniquement les suggestions Claude.")
    p_relancer.add_argument("dossier", type=Path)
    args = parser.parse_args(argv)

    reglages = charger_reglages()
    try:
        if args.commande == "analyser":
            analyse = analyser(args.dossier, args.titre, reglages)
        else:
            analyse = relancer_suggestions(args.dossier, reglages)
    except ErreurEntree as e:
        print(f"Erreur : {e}", file=sys.stderr)
        return 1

    print(f"{len(analyse['mots'])} mots, {len(analyse['detections'])} coupes détectées.")
    if analyse["erreurSuggestions"]:
        print(f"Suggestions indisponibles : {analyse['erreurSuggestions']}", file=sys.stderr)
    else:
        s = analyse["suggestions"]
        print(f"{len(s['chapitres'])} chapitres, {len(s['termes'])} termes, {len(s['longueurs'])} longueurs proposés.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
