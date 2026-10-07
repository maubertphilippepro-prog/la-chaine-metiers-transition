import json
import shutil
import subprocess
import tempfile
from fractions import Fraction
from pathlib import Path

from .erreurs import ErreurEntree


INTROUVABLE = "ffmpeg/ffprobe introuvable : vérifiez son installation."


def _executer(cmd: list[str]) -> str:
    try:
        return subprocess.run(
            cmd, check=True, capture_output=True, text=True, encoding="utf-8", errors="replace",
        ).stdout
    except FileNotFoundError as e:
        raise ErreurEntree(INTROUVABLE) from e


def sonder(chemin: Path) -> dict:
    try:
        sortie = _executer(
            ["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(chemin)]
        )
    except subprocess.CalledProcessError as e:
        raise ErreurEntree(f"{chemin.name} : fichier vidéo illisible ({_extrait(e.stderr)}).") from e
    donnees = json.loads(sortie)
    video = next((s for s in donnees.get("streams", []) if s.get("codec_type") == "video"), None)
    if video is None:
        raise ErreurEntree(f"{chemin.name} : aucune piste vidéo.")
    try:
        fps = float(Fraction(video["r_frame_rate"]))
        if fps <= 0:
            raise ZeroDivisionError
        return {
            "largeur": int(video["width"]),
            "hauteur": int(video["height"]),
            "fps": fps,
            "fpsMoyen": float(Fraction(video["avg_frame_rate"])) if video["avg_frame_rate"] != "0/0" else 0.0,
            "duree": float(donnees["format"]["duration"]),
            "audio": any(s.get("codec_type") == "audio" for s in donnees["streams"]),
        }
    except (KeyError, ValueError, ZeroDivisionError) as e:
        raise ErreurEntree(f"{chemin.name} : métadonnées vidéo incomplètes ou invalides (durée ou cadence).") from e


def _extrait(texte: str | None) -> str:
    lignes = (texte or "").strip().splitlines()
    return " / ".join(lignes[-3:])[:300] or "aucun détail"


def verifier(info: dict, nom: str) -> None:
    if info["largeur"] * 9 != info["hauteur"] * 16 or info["hauteur"] < 720:
        raise ErreurEntree(
            f"{nom} : résolution {info['largeur']}x{info['hauteur']}, format 16:9 d'au moins 1280x720 attendu. "
            "Vérifiez la résolution de sortie dans OBS."
        )
    if not info["audio"]:
        raise ErreurEntree(f"{nom} : aucune piste audio. Vérifiez le micro dans OBS.")


def est_cadence_variable(info: dict) -> bool:
    return abs(info["fps"] - info["fpsMoyen"]) > 0.01


def cadence_cible(info: dict) -> int:
    if est_cadence_variable(info) and info["fpsMoyen"] > 0:
        return round(info["fpsMoyen"])
    return round(info["fps"])


def _echapper(chemin: Path) -> str:
    return chemin.resolve().as_posix().replace("'", "'\\''")


def preparer(bruts: list[Path], sortie: Path) -> dict:
    if not bruts:
        raise ErreurEntree("Aucun fichier vidéo dans bruts/.")
    infos = [sonder(b) for b in bruts]
    for b, info in zip(bruts, infos):
        verifier(info, b.name)

    pleine_hd = (infos[0]["largeur"], infos[0]["hauteur"]) == (1920, 1080)
    if len(bruts) == 1 and pleine_hd and not est_cadence_variable(infos[0]):
        if bruts[0].suffix.lower() == ".mp4":
            try:
                shutil.copyfile(bruts[0], sortie)
            except OSError as e:
                raise ErreurEntree(f"{bruts[0].name} : copie impossible vers {sortie.name} ({e}).") from e
        else:
            _ffmpeg(["-i", str(bruts[0]), "-c", "copy", "-movflags", "+faststart", str(sortie)])
        return sonder(sortie)

    fps = cadence_cible(infos[0])
    with tempfile.TemporaryDirectory() as dossier:
        liste = Path(dossier) / "liste.txt"
        liste.write_text(
            "".join(f"file '{_echapper(b)}'\n" for b in bruts), encoding="utf-8"
        )
        _ffmpeg(["-f", "concat", "-safe", "0", "-i", str(liste),
                 "-vf", f"scale=1920:1080:flags=lanczos,fps={fps}", "-c:v", "libx264", "-preset", "fast", "-crf", "18",
                 "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", str(sortie)])
    return sonder(sortie)


def _ffmpeg(args: list[str]) -> None:
    try:
        _executer(["ffmpeg", "-y", "-loglevel", "error", *args])
    except subprocess.CalledProcessError as e:
        raise ErreurEntree(f"ffmpeg a échoué lors de la préparation de la vidéo : {_extrait(e.stderr)}") from e
