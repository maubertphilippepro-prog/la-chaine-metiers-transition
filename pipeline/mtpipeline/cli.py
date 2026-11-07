import argparse
import json
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path
from typing import Callable

from .audio import TAUX, charger_audio
from .detection import detecter, marquer_paroles
from .environnement import charger_env
from .erreurs import ErreurEntree, ErreurSuggestions
from .glossaire import charger_glossaire
from .images import detourer, extraire_image, lister_bruts, retirer_fond
from .insertion import (
    chapitres_apres_insertion, construire_source, decalage_insertion, fusionner_analyse, integrer_rush, placer_rush,
    remplacer, renumeroter_consignes,
)
from .preparation import preparer, sonder
from .recalage import FICHIERS_DECALES, MARQUE, decaler_donnees, recaler
from .reglages import RACINE, charger_reglages
from .suggestions import convertir, demander
from .transcription import transcrire, transcrire_extraits


def lire(chemin: Path):
    return json.loads(chemin.read_text(encoding="utf-8"))


def ecrire(chemin: Path, donnees) -> None:
    temporaire = chemin.with_suffix(chemin.suffix + ".tmp")
    temporaire.write_text(json.dumps(donnees, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporaire, chemin)


def ecrire_episode(dossier: Path, titre: str, statut: str, message: str | None) -> None:
    """Met à jour episode.json en conservant les champs ajoutés par ailleurs (studio)."""
    fichier = dossier / "episode.json"
    try:
        episode = lire(fichier) if fichier.exists() else {}
    except (OSError, ValueError):
        episode = {}
    if not isinstance(episode, dict):
        episode = {}
    ecrire(fichier, {**episode, "version": 1, "titre": titre, "statut": statut, "message": message})


def etape_suggestions(dossier: Path, mots: list[dict], reglages: dict, demander_fn, glossaire_chemin: Path):
    fichier = dossier / "suggestions.json"
    if fichier.exists():
        return lire(fichier), None
    try:
        glossaire = charger_glossaire(glossaire_chemin)
    except (ValueError, KeyError, TypeError, AttributeError, OSError) as e:
        return None, f"glossaire.json illisible : {e!r}"
    texte_max = reglages["elements"]["texteMaxCaracteres"]
    try:
        reponse = demander_fn(mots, glossaire, reglages["modeles"]["claude"],
                              max_caracteres=reglages["definitionMaxCaracteres"], texte_max=texte_max)
    except ErreurSuggestions as e:
        return None, str(e)
    suggestions = convertir(reponse, mots, glossaire, texte_max=texte_max)
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


def etapes_analyse(dossier: Path, preparer_source: Callable[[Path], dict], reglages: dict, transcrire_fn,
                   extraits_fn) -> list[dict]:
    """Préparation de dossier/source.mp4, transcription et repérage des coupes ; une étape dont le fichier existe
    est sautée. Renvoie les mots."""
    source = dossier / "source.mp4"
    if not (dossier / "preparation.json").exists():
        ecrire(dossier / "preparation.json", preparer_source(source))

    if not (dossier / "transcription.json").exists():
        ecrire(dossier / "transcription.json", transcrire_fn(source, reglages["modeles"]["whisper"]))
        ecrire(dossier / "preparation.json", {**lire(dossier / "preparation.json"), MARQUE: True})
    mots = lire(dossier / "transcription.json")

    if not (dossier / "detections.json").exists():
        duree = lire(dossier / "preparation.json")["duree"]
        audio = charger_audio(source)
        extraits_fn = extraits_fn or transcrire_extraits
        detections = marquer_paroles(
            detecter(mots, audio, TAUX, duree, reglages["detection"]),
            lambda intervalles: extraits_fn(audio, intervalles, reglages["modeles"]["whisper"]),
        )
        ecrire(dossier / "detections.json", detections)
    return mots


def analyser(dossier: Path, titre: str, reglages: dict, transcrire_fn=transcrire, demander_fn=demander,
             glossaire_chemin: Path | None = None, extraits_fn=None) -> dict:
    if not dossier.is_dir():
        raise ErreurEntree(f"Dossier de tournage introuvable : {dossier}")
    glossaire_chemin = glossaire_chemin or RACINE / "donnees" / "glossaire.json"
    def preparer_bruts(source: Path) -> dict:
        if not (dossier / "bruts").is_dir():
            raise ErreurEntree(f"Dossier bruts/ introuvable dans {dossier}.")
        return preparer(lister_bruts(dossier / "bruts"), source)

    try:
        mots = etapes_analyse(dossier, preparer_bruts, reglages, transcrire_fn, extraits_fn)
    except ErreurEntree as e:
        ecrire_episode(dossier, titre, "erreur", str(e))
        raise
    except Exception as e:
        ecrire_episode(dossier, titre, "erreur", f"Erreur inattendue pendant l'analyse : {type(e).__name__} : {e}")
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


def inserer(dossier: Path, rush: Path, t: float, titre: str, reglages: dict, transcrire_fn=None, demander_fn=None,
            glossaire_chemin: Path | None = None, extraits_fn=None) -> str:
    """Insère le rush à l'instant t de la source ; renvoie le compte rendu. Tout est préparé à côté (rushs/<N>/,
    historique/) : les fichiers du tournage ne sont remplacés qu'à la fin, source.mp4 en dernier."""
    if not (dossier / "analyse.json").exists():
        raise ErreurEntree(f"{dossier} : tournage pas encore analysé.")
    if not (dossier / "montage.json").exists():
        raise ErreurEntree(f"{dossier} : montage.json absent, ouvrez le tournage dans le studio avant d'insérer un rush.")
    if not rush.is_file():
        raise ErreurEntree(f"Rush introuvable : {rush}")
    preparation = lire(dossier / "preparation.json")
    duree_source = preparation["duree"]
    if not 0 <= t <= duree_source:
        raise ErreurEntree(f"Instant d'insertion {t} s hors de la vidéo (0 à {duree_source:.2f} s).")
    glossaire_chemin = glossaire_chemin or RACINE / "donnees" / "glossaire.json"
    rushs = preparation.get("rushs", [])
    n = len(rushs) + 1

    # 1. Analyse du rush seul ; un dossier laissé par une insertion interrompue est refait.
    travail = dossier / "rushs" / str(n)
    if travail.exists():
        shutil.rmtree(travail)
    travail.mkdir(parents=True)
    mots_rush = etapes_analyse(travail, lambda sortie: preparer([rush], sortie, fps=preparation["fps"]), reglages,
                               transcrire_fn or transcrire, extraits_fn)
    suggestions, erreur = etape_suggestions(travail, mots_rush, reglages, demander_fn or demander, glossaire_chemin)
    analyse_rush = assembler(travail, suggestions, erreur)
    d = analyse_rush["duree"]

    # 2. Sauvegarde du tournage.
    sauvegarde = dossier / "historique" / f"{datetime.now():%Y%m%d-%H%M%S}-rush-{n}"
    sauvegarde.mkdir(parents=True)
    shutil.copy2(dossier / "source.mp4", sauvegarde / "source.mp4")
    for fichier in dossier.glob("*.json"):
        shutil.copy2(fichier, sauvegarde / fichier.name)

    # 3. Nouvelle source, à côté.
    nouvelle = travail / "nouvelle-source.mp4"
    construire_source(dossier / "source.mp4", travail / "source.mp4", t, duree_source, d, preparation["fps"], nouvelle)
    duree = sonder(nouvelle)["duree"]

    # 4 à 6. Décalage et fusion, en mémoire.
    lus = {nom: lire(dossier / nom) for nom in FICHIERS_DECALES if (dossier / nom).exists()}
    decales = decaler_donnees(lus, decalage_insertion(t, d))
    place = placer_rush(analyse_rush, n, t)
    analyse, table = fusionner_analyse(decales["analyse.json"], place, duree)
    chapitres = chapitres_apres_insertion(lus["montage.json"]["chapitres"], lus["analyse.json"]["mots"], t, d, titre)
    a_ecrire = {
        "transcription.json": analyse["mots"],
        "detections.json": analyse["detections"],
        "analyse.json": analyse,
        "montage.json": integrer_rush(decales["montage.json"], place, chapitres),
        "preparation.json": {**preparation, "duree": duree, MARQUE: True, "rushs": rushs + [
            {"numero": n, "fichier": rush.name, "a": t, "duree": d, "titre": titre, "erreurSuggestions": erreur}]},
    }
    if analyse["suggestions"] is not None:
        a_ecrire["suggestions.json"] = analyse["suggestions"]
    if (dossier / "consignes.json").exists():
        a_ecrire["consignes.json"] = renumeroter_consignes(lire(dossier / "consignes.json"), table)

    # 7. Remplacement : les JSON, puis source.mp4 en dernier.
    try:
        for nom, donnees in a_ecrire.items():
            ecrire(dossier / nom, donnees)
        remplacer(nouvelle, dossier / "source.mp4")
    except OSError as e:
        raise ErreurEntree(f"Insertion interrompue pendant l'écriture du tournage ({e}) : "
                           f"remettez à la main les fichiers de {sauvegarde}.") from e
    try:
        shutil.move(rush, travail / rush.name)
    except OSError:
        pass  # le rush reste dans rushs/ : sans conséquence
    compte_rendu = f"Rush de {d:.1f} s inséré à {t:.2f} s ({len(place['mots'])} mots). Sauvegarde : {sauvegarde}"
    return compte_rendu + (f"\nSuggestions indisponibles pour le rush : {erreur}" if erreur else "")


def main(argv: list[str] | None = None) -> int:
    charger_env(RACINE / ".env")
    parser = argparse.ArgumentParser(prog="mtpipeline", description="Analyse d'un tournage.")
    sous = parser.add_subparsers(dest="commande", required=True)
    p_analyser = sous.add_parser("analyser", help="Analyser un dossier de tournage.")
    p_analyser.add_argument("dossier", type=Path)
    p_analyser.add_argument("--titre", required=True)
    p_relancer = sous.add_parser("relancer-suggestions", help="Relancer uniquement les suggestions Claude.")
    p_relancer.add_argument("dossier", type=Path)
    p_recaler = sous.add_parser("recaler", help="Recaler les temps d'une analyse faite sur l'audio bout à bout.")
    p_recaler.add_argument("dossier", type=Path)
    p_inserer = sous.add_parser("inserer", help="Insérer un rush dans un tournage analysé.")
    p_inserer.add_argument("dossier", type=Path)
    p_inserer.add_argument("rush", type=Path)
    p_inserer.add_argument("--a", type=float, required=True, dest="instant", help="Instant d'insertion (s).")
    p_inserer.add_argument("--titre", default="Nouveau chapitre")
    p_image = sous.add_parser("image", help="Extraire l'image d'une vidéo à un instant donné (PNG).")
    p_image.add_argument("video", type=Path)
    p_image.add_argument("instant", type=float)
    p_image.add_argument("sortie", type=Path)
    p_detourer = sous.add_parser("detourer", help="Détourer une photo (PNG transparent).")
    p_detourer.add_argument("entree", type=Path)
    p_detourer.add_argument("sortie", type=Path)
    args = parser.parse_args(argv)

    reglages = charger_reglages()
    try:
        if args.commande == "image":
            extraire_image(args.video, args.instant, args.sortie)
            return 0
        if args.commande == "detourer":
            detourer(args.entree, args.sortie, retirer_fond(reglages["modeles"]["detourage"]))
            return 0
        if args.commande == "recaler":
            print(recaler(args.dossier, ecrire))
            return 0
        if args.commande == "inserer":
            print(inserer(args.dossier, args.rush, args.instant, args.titre, reglages))
            return 0
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
        print(f"{len(s['chapitres'])} chapitres, {len(s['termes'])} termes, {len(s['longueurs'])} longueurs, "
              f"{len(s.get('elements', []))} éléments à l'écran proposés.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
