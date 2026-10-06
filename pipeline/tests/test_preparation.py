import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

from mtpipeline.erreurs import ErreurEntree
from mtpipeline.preparation import est_cadence_variable, preparer, sonder, verifier


def test_sonder(video_test):
    info = sonder(video_test("a.mp4"))
    assert (info["largeur"], info["hauteur"]) == (1920, 1080)
    assert info["fps"] == pytest.approx(30)
    assert info["duree"] == pytest.approx(2, abs=0.1)
    assert info["audio"] is True


def test_refuse_mauvaise_resolution(video_test):
    info = sonder(video_test("petit.mp4", largeur=1280, hauteur=720))
    with pytest.raises(ErreurEntree, match="1920x1080"):
        verifier(info, "petit.mp4")


def test_refuse_sans_audio(video_test):
    info = sonder(video_test("muet.mp4", audio=False))
    with pytest.raises(ErreurEntree, match="audio"):
        verifier(info, "muet.mp4")


def test_cadence_variable():
    assert est_cadence_variable({"fps": 30.0, "fpsMoyen": 29.2}) is True
    assert est_cadence_variable({"fps": 30.0, "fpsMoyen": 30.0}) is False


def test_preparer_un_seul_fichier(video_test, tmp_path):
    info = preparer([video_test("a.mp4")], tmp_path / "source.mp4")
    assert (tmp_path / "source.mp4").exists()
    assert info["duree"] == pytest.approx(2, abs=0.1)


def test_preparer_concatene(video_test, tmp_path):
    info = preparer([video_test("a.mp4"), video_test("b.mp4")], tmp_path / "source.mp4")
    assert info["duree"] == pytest.approx(4, abs=0.2)
    assert info["fps"] == pytest.approx(30)


def test_preparer_chemin_avec_apostrophe(video_test, tmp_path):
    dossier = tmp_path / "l'atelier & test"
    dossier.mkdir()
    bruts = []
    for nom in ("a.mp4", "b.mp4"):
        cible = dossier / nom
        shutil.move(video_test(nom), cible)
        bruts.append(cible)
    info = preparer(bruts, tmp_path / "source.mp4")
    assert info["duree"] == pytest.approx(4, abs=0.2)


def test_sonder_fichier_corrompu(tmp_path):
    fichier = tmp_path / "corrompu.mp4"
    fichier.write_bytes(os.urandom(2048))
    with pytest.raises(ErreurEntree, match="corrompu.mp4"):
        sonder(fichier)


def _fausse_sonde(monkeypatch, donnees):
    resultat = subprocess.CompletedProcess([], 0, stdout=json.dumps(donnees), stderr="")
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: resultat)


def _flux(**extra):
    return {"codec_type": "video", "width": 1920, "height": 1080,
            "r_frame_rate": "30/1", "avg_frame_rate": "30/1", **extra}


def test_sonder_sans_duree(monkeypatch):
    _fausse_sonde(monkeypatch, {"streams": [_flux()], "format": {}})
    with pytest.raises(ErreurEntree, match="x.mp4"):
        sonder(Path("x.mp4"))


def test_sonder_cadence_nulle(monkeypatch):
    _fausse_sonde(monkeypatch, {"streams": [_flux(r_frame_rate="0/0")], "format": {"duration": "2"}})
    with pytest.raises(ErreurEntree, match="x.mp4"):
        sonder(Path("x.mp4"))


def test_preparer_ffmpeg_echoue(video_test, tmp_path):
    inexistant = tmp_path / "absent" / "source.mp4"
    with pytest.raises(ErreurEntree, match="ffmpeg"):
        preparer([video_test("a.mp4"), video_test("b.mp4")], inexistant)


def test_sonder_nom_accentue(video_test):
    info = sonder(video_test("é_vidéo àccentuée.mp4"))
    assert info["largeur"] == 1920


def test_preparer_mkv_remuxe_en_mp4(video_test, tmp_path):
    sortie = tmp_path / "source.mp4"
    info = preparer([video_test("a.mkv")], sortie)
    format_conteneur = json.loads(subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", str(sortie)],
        check=True, capture_output=True, text=True,
    ).stdout)["format"]["format_name"]
    assert "mp4" in format_conteneur
    assert info["duree"] == pytest.approx(2, abs=0.1)


def test_ffmpeg_introuvable(monkeypatch):
    def absent(*a, **k):
        raise FileNotFoundError("ffprobe")
    monkeypatch.setattr(subprocess, "run", absent)
    with pytest.raises(ErreurEntree, match="introuvable"):
        sonder(Path("x.mp4"))


def test_copie_impossible(video_test, tmp_path, monkeypatch):
    def refus(*a, **k):
        raise PermissionError("accès refusé")
    monkeypatch.setattr(shutil, "copyfile", refus)
    with pytest.raises(ErreurEntree, match="a.mp4"):
        preparer([video_test("a.mp4")], tmp_path / "source.mp4")
