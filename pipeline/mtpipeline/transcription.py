from pathlib import Path

from .audio import charger_audio

# Pousse Whisper à transcrire les hésitations au lieu de les effacer.
PROMPT_HESITATIONS = "Euh, alors, hum, bon, du coup, euh, voilà, on va voir, euh, comment ça marche."


def mots_depuis_segments(segments: list[dict]) -> list[dict]:
    bruts = [m for s in segments for m in s.get("words", [])]
    mots = []
    for i, m in enumerate(bruts):
        debut = m.get("start")
        fin = m.get("end")
        if debut is None or fin is None:
            precedent = mots[-1]["fin"] if mots else 0.0
            suivant = next((b["start"] for b in bruts[i + 1:] if b.get("start") is not None), precedent)
            debut, fin = precedent, suivant
        mots.append({"id": i, "texte": m["word"].strip(), "debut": float(debut), "fin": float(fin)})
    return mots


def transcrire(chemin_audio: Path, modele: str, appareil: str = "cuda") -> list[dict]:
    import whisperx  # import tardif : lourd, et inutile pour les tests unitaires

    audio = charger_audio(chemin_audio)
    asr = whisperx.load_model(
        modele, appareil, compute_type="float16", language="fr",
        asr_options={"initial_prompt": PROMPT_HESITATIONS},
    )
    resultat = asr.transcribe(audio, batch_size=8, language="fr")
    del asr

    modele_alignement, metadonnees = whisperx.load_align_model(language_code="fr", device=appareil)
    aligne = whisperx.align(
        resultat["segments"], modele_alignement, metadonnees, audio, appareil,
        return_char_alignments=False,
    )
    return mots_depuis_segments(aligne["segments"])
