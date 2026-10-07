import subprocess
from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def env_reel_neutralise(monkeypatch):
    """Empêche cli.main() de charger le vrai .env dans os.environ pendant les tests."""
    monkeypatch.setattr("mtpipeline.cli.charger_env", lambda chemin: None)


@pytest.fixture
def video_test(tmp_path: Path):
    def creer(nom: str, largeur: int = 1920, hauteur: int = 1080, duree: float = 2, audio: bool = True) -> Path:
        chemin = tmp_path / nom
        cmd = ["ffmpeg", "-y", "-loglevel", "error",
               "-f", "lavfi", "-i", f"testsrc=size={largeur}x{hauteur}:rate=30:duration={duree}"]
        if audio:
            cmd += ["-f", "lavfi", "-i", f"sine=frequency=440:duration={duree}"]
        webm = chemin.suffix == ".webm"
        if webm:
            cmd += ["-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "8", "-pix_fmt", "yuv420p"]
        else:
            cmd += ["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p"]
        if audio:
            cmd += ["-c:a", "libopus" if webm else "aac", "-shortest"]
        cmd.append(str(chemin))
        subprocess.run(cmd, check=True)
        return chemin
    return creer
