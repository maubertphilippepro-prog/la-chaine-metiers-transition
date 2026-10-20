from pathlib import Path

import pytest
from PIL import Image

from mtpipeline.erreurs import ErreurEntree
from mtpipeline.images import detourer, est_camera, extraire_image, lister_bruts, retirer_fond
from mtpipeline.reglages import charger_reglages


def fond_retire(image):
    resultat = image.convert("RGBA")
    resultat.putalpha(128)
    return resultat


def test_extrait_l_image_a_l_instant_donne(video_test, tmp_path):
    video = video_test("source.mp4", duree=2)
    sortie = tmp_path / "images" / "ecran-1000.png"
    extraire_image(video, 1.0, sortie)
    with Image.open(sortie) as image:
        assert image.size == (1920, 1080)


def test_refuse_un_instant_apres_la_fin(video_test, tmp_path):
    video = video_test("source.mp4", duree=2)
    with pytest.raises(ErreurEntree, match="image"):
        extraire_image(video, 30.0, tmp_path / "x.png")


def test_refuse_un_instant_negatif(video_test, tmp_path):
    with pytest.raises(ErreurEntree, match="instant"):
        extraire_image(video_test("source.mp4"), -1, tmp_path / "x.png")


def test_detoure_en_png_transparent(tmp_path):
    entree = tmp_path / "pose.jpg"
    Image.new("RGB", (300, 400), "red").save(entree)
    sortie = tmp_path / "pose.detoure.png"
    detourer(entree, sortie, fond_retire)
    with Image.open(sortie) as image:
        assert image.mode == "RGBA"
        assert image.size == (300, 400)
        assert image.getpixel((0, 0))[3] == 128


def test_redresse_une_photo_de_telephone(tmp_path):
    entree = tmp_path / "pose.jpg"
    exif = Image.Exif()
    exif[0x0112] = 6  # orientation : pivotée de 90°
    Image.new("RGB", (400, 300), "red").save(entree, exif=exif)
    sortie = tmp_path / "pose.detoure.png"
    detourer(entree, sortie, fond_retire)
    with Image.open(sortie) as image:
        assert image.size == (300, 400)


def test_signale_une_photo_illisible(tmp_path):
    entree = tmp_path / "pose.jpg"
    entree.write_text("pas une image", encoding="utf-8")
    with pytest.raises(ErreurEntree, match="illisible"):
        detourer(entree, tmp_path / "x.png", fond_retire)


def test_reconnait_l_enregistrement_camera():
    assert est_camera(Path("2026-10-20 10-00-00-camera.mp4"))
    assert est_camera(Path("prise-CAMERA.mkv"))
    assert not est_camera(Path("2026-10-20 10-00-00.mp4"))


def test_liste_les_bruts_sans_la_camera(tmp_path):
    for nom in ["b.mp4", "a.webm", "a-camera.mkv", "notes.txt"]:
        (tmp_path / nom).write_text("", encoding="utf-8")
    assert [p.name for p in lister_bruts(tmp_path)] == ["a.webm", "b.mp4"]


@pytest.mark.detourage
def test_detourage_reel(tmp_path):
    entree = tmp_path / "pose.jpg"
    Image.new("RGB", (320, 480), "white").save(entree)
    sortie = tmp_path / "pose.detoure.png"
    detourer(entree, sortie, retirer_fond(charger_reglages()["modeles"]["detourage"]))
    with Image.open(sortie) as image:
        assert image.mode == "RGBA" and image.size == (320, 480)
