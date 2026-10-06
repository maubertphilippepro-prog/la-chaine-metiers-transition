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
