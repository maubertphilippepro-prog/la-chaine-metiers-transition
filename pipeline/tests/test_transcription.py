import pytest

from mtpipeline.transcription import mots_depuis_segments


def test_aplatit_les_segments():
    segments = [
        {"words": [{"word": "Bonjour", "start": 0.5, "end": 0.9}, {"word": "à", "start": 0.95, "end": 1.0}]},
        {"words": [{"word": "tous.", "start": 1.1, "end": 1.5}]},
    ]
    assert mots_depuis_segments(segments) == [
        {"id": 0, "texte": "Bonjour", "debut": 0.5, "fin": 0.9},
        {"id": 1, "texte": "à", "debut": 0.95, "fin": 1.0},
        {"id": 2, "texte": "tous.", "debut": 1.1, "fin": 1.5},
    ]


def test_complete_les_mots_sans_horodatage():
    segments = [{"words": [
        {"word": "version", "start": 1.0, "end": 1.4},
        {"word": "365"},
        {"word": "disponible", "start": 2.0, "end": 2.6},
    ]}]
    mots = mots_depuis_segments(segments)
    assert mots[1] == {"id": 1, "texte": "365", "debut": 1.4, "fin": 2.0}


def test_mot_sans_horodatage_en_fin():
    mots = mots_depuis_segments([{"words": [{"word": "fin", "start": 1.0, "end": 1.2}, {"word": "2026"}]}])
    assert mots[1]["debut"] == 1.2 and mots[1]["fin"] == 1.2


@pytest.mark.gpu
def test_transcription_reelle(video_test):
    from mtpipeline.transcription import transcrire
    mots = transcrire(video_test("a.mp4"), "large-v3")
    assert isinstance(mots, list)
