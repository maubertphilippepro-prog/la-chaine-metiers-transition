from pathlib import Path

import numpy as np

from .audio import TAUX, charger_audio
from .detection import mots_perdus

# Pousse Whisper à transcrire les hésitations au lieu de les effacer.
PROMPT_HESITATIONS = "Euh, alors, hum, bon, du coup, euh, voilà, on va voir, euh, comment ça marche."
# Contextes entendus autour de chaque coupe : seul, un extrait très court fait inventer des phrases,
# et la reconnaissance varie avec la longueur du contexte, d'où deux écoutes.
CONTEXTES_EXTRAIT = (1.5, 2.5)


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


def transcrire_extraits(audio: np.ndarray, intervalles: list[tuple[float, float]], modele: str,
                        appareil: str = "cuda") -> list[str]:
    """Pour chaque intervalle, les mots que sa coupe ferait perdre : le contexte est transcrit
    avec puis sans l'intervalle, et on garde ce qui disparaît. Texte vide si rien ne se perd."""
    import torch  # noqa: F401 — charge les DLL CUDA dont faster-whisper a besoin
    from faster_whisper import WhisperModel

    asr = WhisperModel(modele, device=appareil, compute_type="float16")

    def texte(extrait: np.ndarray) -> str:
        segments, _ = asr.transcribe(extrait, language="fr", initial_prompt=PROMPT_HESITATIONS)
        return " ".join(s.text.strip() for s in segments)

    def perdus(debut: float, fin: float, contexte: float) -> str:
        avant = audio[int(max(0.0, debut - contexte) * TAUX):int(debut * TAUX)]
        coupe = audio[int(debut * TAUX):int(fin * TAUX)]
        apres = audio[int(fin * TAUX):int((fin + contexte) * TAUX)]
        return mots_perdus(texte(np.concatenate([avant, coupe, apres])), texte(np.concatenate([avant, apres])))

    return [" / ".join(filter(None, (perdus(debut, fin, c) for c in CONTEXTES_EXTRAIT))) for debut, fin in intervalles]
