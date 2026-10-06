import json
from pathlib import Path


def charger_glossaire(chemin: Path) -> dict[str, dict]:
    if not chemin.exists():
        return {}
    donnees = json.loads(chemin.read_text(encoding="utf-8"))
    return {t["terme"].lower(): t for t in donnees.get("termes", [])}
