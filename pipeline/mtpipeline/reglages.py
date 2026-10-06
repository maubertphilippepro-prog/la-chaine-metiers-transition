import json
from pathlib import Path

RACINE = Path(__file__).resolve().parents[2]


def charger_reglages(chemin: Path | None = None) -> dict:
    chemin = chemin or RACINE / "reglages.json"
    return json.loads(chemin.read_text(encoding="utf-8"))
