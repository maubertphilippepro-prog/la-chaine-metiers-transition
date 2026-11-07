"""Captures de controle de preview.html :
  - apercu-bureau.png : navigateur, largeur 680px
  - apercu-mobile.png : navigateur, largeur 375px (smartphone)
  - apercu-outlook-N.png : rendu par le moteur de Word = celui d'Outlook classique (pages)

Usage : python screenshot.py <dossier_comm> [--no-outlook]
"""
import subprocess
import sys
from pathlib import Path

BROWSERS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]


def browser_shots(build: Path):
    exe = next((b for b in BROWSERS if Path(b).is_file()), None)
    if not exe:
        print("Ni Chrome ni Edge trouves : captures navigateur ignorees.")
        return
    # Chrome headless impose une largeur de fenetre minimale : on passe par une iframe
    # de la largeur voulue pour obtenir un vrai viewport mobile.
    for name, width in (("bureau", 680), ("mobile", 375)):
        wrapper = build / f"_frame-{name}.html"
        wrapper.write_text(f'<!DOCTYPE html><body style="margin:0"><iframe src="preview.html" '
                           f'style="border:0;width:{width}px;height:3000px"></iframe></body>', encoding="utf-8")
        out = build / f"apercu-{name}.png"
        subprocess.run([exe, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                        "--allow-file-access-from-files", f"--window-size={max(width, 700)},3000",
                        f"--screenshot={out}", wrapper.as_uri()],
                       check=True, capture_output=True, timeout=60)
        wrapper.unlink()
        crop_blank(out, width)
        print(out)


def crop_blank(png: Path, width: int):
    """Coupe le bas vide de la capture (fond gris uniforme)."""
    from PIL import Image
    im = Image.open(png).convert("RGB")
    im = im.crop((0, 0, min(width, im.width), im.height))
    bg = im.getpixel((im.width - 1, im.height - 1))
    y = im.height - 1
    while y > 0 and all(im.getpixel((x, y)) == bg for x in range(0, im.width, 7)):
        y -= 1
    im.crop((0, 0, im.width, min(im.height, y + 30))).save(png)


def outlook_shots(build: Path):
    pdf = build / "_word.pdf"
    ps = (f"$w=New-Object -ComObject Word.Application;$w.Visible=$false;"
          f"$d=$w.Documents.Open('{build / 'preview.html'}',$false,$true);"
          f"$d.ExportAsFixedFormat('{pdf}',17);$d.Close(0);$w.Quit()")
    try:
        subprocess.run(["powershell", "-NoProfile", "-Command", ps], check=True, capture_output=True, timeout=120)
        import pymupdf
    except Exception as e:  # Word absent, pymupdf absent...
        print(f"Rendu Outlook/Word ignore : {e}")
        return
    doc = pymupdf.open(pdf)
    for i, page in enumerate(doc, 1):
        out = build / f"apercu-outlook-{i}.png"
        page.get_pixmap(dpi=80).save(out)
        print(out)
    doc.close()
    pdf.unlink()


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    build = Path(sys.argv[1]).resolve() / "build"
    for old in build.glob("apercu-*.png"):
        old.unlink()
    browser_shots(build)
    if "--no-outlook" not in sys.argv:
        outlook_shots(build)
