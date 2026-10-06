import json
import shutil
import subprocess
import tempfile
from fractions import Fraction
from pathlib import Path

from .erreurs import ErreurEntree


def sonder(chemin: Path) -> dict:
    sortie = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(chemin)],
        check=True, capture_output=True, text=True,
    ).stdout
    donnees = json.loads(sortie)
    video = next((s for s in donnees["streams"] if s["codec_type"] == "video"), None)
    if video is None:
        raise ErreurEntree(f"{chemin.name} : aucune piste vidéo.")
    return {
        "largeur": int(video["width"]),
        "hauteur": int(video["height"]),
        "fps": float(Fraction(video["r_frame_rate"])),
        "fpsMoyen": float(Fraction(video["avg_frame_rate"])) if video["avg_frame_rate"] != "0/0" else 0.0,
        "duree": float(donnees["format"]["duration"]),
        "audio": any(s["codec_type"] == "audio" for s in donnees["streams"]),
    }


def verifier(info: dict, nom: str) -> None:
    if (info["largeur"], info["hauteur"]) != (1920, 1080):
        raise ErreurEntree(
            f"{nom} : résolution {info['largeur']}x{info['hauteur']}, 1920x1080 attendu. "
            "Vérifiez la résolution de sortie dans OBS."
        )
    if not info["audio"]:
        raise ErreurEntree(f"{nom} : aucune piste audio. Vérifiez le micro dans OBS.")


def est_cadence_variable(info: dict) -> bool:
    return abs(info["fps"] - info["fpsMoyen"]) > 0.01


def preparer(bruts: list[Path], sortie: Path) -> dict:
    if not bruts:
        raise ErreurEntree("Aucun fichier vidéo dans bruts/.")
    infos = [sonder(b) for b in bruts]
    for b, info in zip(bruts, infos):
        verifier(info, b.name)

    if len(bruts) == 1 and not est_cadence_variable(infos[0]):
        shutil.copyfile(bruts[0], sortie)
        return sonder(sortie)

    fps = round(infos[0]["fps"])
    with tempfile.TemporaryDirectory() as dossier:
        liste = Path(dossier) / "liste.txt"
        liste.write_text(
            "".join(f"file '{b.resolve().as_posix()}'\n" for b in bruts), encoding="utf-8"
        )
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(liste),
             "-vf", f"fps={fps}", "-c:v", "libx264", "-preset", "fast", "-crf", "18",
             "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", str(sortie)],
            check=True,
        )
    return sonder(sortie)
