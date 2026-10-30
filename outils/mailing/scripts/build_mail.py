"""Construit un mail HTML compatible Outlook a partir d'un fichier mail.md.

Usage :
    python build_mail.py init <dossier_comm>     # cree le dossier + mail.md modele
    python build_mail.py build <dossier_comm>    # genere build/ (mail.html, preview.html, images/, manifest.json)

mail.html   : HTML final, images referencees en cid: (pour Outlook)
preview.html: meme HTML, images en chemins relatifs (pour relire dans un navigateur)
manifest.json: objet + liste des images a joindre (cid -> fichier), lu par outlook_draft.ps1
"""
import html
import json
import re
import shutil
import sys
from pathlib import Path

from PIL import Image

SKILL_DIR = Path(__file__).resolve().parent.parent
ASSETS = SKILL_DIR / "assets"

WIDTH = 600          # largeur du mail en px
PAD = 32             # marge interieure du contenu
INNER = WIDTH - 2 * PAD
FONT = "Aptos, 'Segoe UI', Calibri, Arial, sans-serif"
BLUE, RED, GREY = "#004D9B", "#E40521", "#9DB3C9"
TEXT, MUTED = "#333333", "#6b7280"

CALLOUTS = {
    "info":      ("#eef4fb", BLUE,      TEXT),
    "callout":   ("#eef4fb", BLUE,      TEXT),
    "warning":   ("#fff7e6", "#e67e22", "#8a4100"),
    "attention": ("#fff7e6", "#e67e22", "#8a4100"),
    "success":   ("#ecfdf3", "#16a34a", "#14532d"),
    "astuce":    ("#ecfdf3", "#16a34a", "#14532d"),
    "important": ("#fdecee", RED,       "#7f1d1d"),
}

TEMPLATE_MD = """---
objet: Titre de l'objet du mail
preheader: Phrase d'accroche visible dans l'aperçu de la boîte de réception
bandeau_titre: Titre du bandeau
bandeau_sous_titre: avec
bandeau_logo: there
---

## 🎯 Accroche principale

Premier paragraphe : **le message clé** en une ou deux phrases.

- 🎙️ Premier point
- 📷 Deuxième point

[[bouton: 👉 Découvrir | https://exemple.com | Petite légende sous le bouton]]

:::footer
Pour toute question, contactez la cellule QIU.
:::
"""


# ---------------------------------------------------------------- utilitaires

class Ctx:
    def __init__(self, comm: Path):
        self.comm = comm
        self.build = comm / "build"
        self.images = []          # [{cid, file}]
        self._by_src = {}

    def image(self, src: str, display_w: int):
        """Prepare une image (redimensionnee 2x pour ecrans haute densite) et renvoie (cid, w, h)."""
        path = resolve_image(src, self.comm)
        key = (str(path), display_w)
        if key in self._by_src:
            return self._by_src[key]
        im = Image.open(path)
        nat_w, nat_h = im.size
        disp_w = min(display_w, nat_w)
        disp_h = round(nat_h * disp_w / nat_w)
        target_w = min(nat_w, disp_w * 2)
        if target_w < nat_w:
            im = im.resize((target_w, round(nat_h * target_w / nat_w)), Image.LANCZOS)
        stem = re.sub(r"[^a-z0-9]+", "-", path.stem.lower()).strip("-") or "img"
        cid = f"{stem}-{len(self.images) + 1}"
        has_alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
        if path.suffix.lower() in (".jpg", ".jpeg") or (not has_alpha and nat_w * nat_h > 600_000
                                                        and path.suffix.lower() != ".gif"):
            out = self.build / "images" / f"{cid}.jpg"
            im.convert("RGB").save(out, "JPEG", quality=85, optimize=True, progressive=True)
        elif path.suffix.lower() == ".gif":
            out = self.build / "images" / f"{cid}.gif"
            shutil.copy(path, out)  # on garde l'animation telle quelle
        else:
            out = self.build / "images" / f"{cid}.png"
            im.save(out, "PNG", optimize=True)
        self.images.append({"cid": cid, "file": f"images/{out.name}"})
        res = (cid, disp_w, disp_h)
        self._by_src[key] = res
        return res


def resolve_image(src: str, comm: Path) -> Path:
    for cand in (comm / src, comm / "assets" / src, ASSETS / src, ASSETS / "logos" / src,
                 ASSETS / "logos" / f"{src}.png"):
        if cand.is_file():
            return cand
    raise SystemExit(f"Image introuvable : {src} (cherchee dans {comm}, {comm / 'assets'}, {ASSETS})")


def img_tag(ctx, src, w, alt="", style="", fluid=True):
    cid, dw, dh = ctx.image(src, w)
    fl = f"width:100%;max-width:{dw}px;" if fluid else f"width:{dw}px;"
    return (f'<img src="cid:{cid}" width="{dw}" height="{dh}" alt="{html.escape(alt)}" '
            f'style="display:block;{fl}height:auto;border:0;outline:none;text-decoration:none;{style}">')


def inline(text: str) -> str:
    """Markdown inline minimal : **gras**, *italique*, [lien](url), `code`, ==surligne==. HTML brut conserve."""
    # protege les balises HTML brutes
    tags = []
    text = re.sub(r"<[^>]+>", lambda m: tags.append(m.group(0)) or f"\x00{len(tags) - 1}\x00", text)
    text = html.escape(text, quote=False)
    text = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)",
                  lambda m: f'<a href="{m.group(2)}" style="color:{BLUE};text-decoration:underline;">{m.group(1)}</a>',
                  text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<em>\1</em>", text)
    text = re.sub(r"(?<!\w)_(?!\s)(.+?)(?<!\s)_(?!\w)", r"<em>\1</em>", text)
    text = re.sub(r"==(.+?)==", r'<span style="background:#fff3a3;">\1</span>', text)
    text = re.sub(r"`(.+?)`", r'<code style="font-family:Consolas,monospace;background:#f3f4f6;padding:1px 4px;">\1</code>', text)
    return re.sub(r"\x00(\d+)\x00", lambda m: tags[int(m.group(1))], text)


def para_html(lines, size=15, color=TEXT, align="left", margin="0 0 16px 0"):
    body = "<br>".join(inline(l.rstrip()) for l in lines)
    return (f'<p style="margin:{margin};font-family:{FONT};font-size:{size}px;line-height:{round(size * 1.6)}px;mso-line-height-rule:exactly;'
            f'color:{color};text-align:{align};">{body}</p>')


EMOJI_START = re.compile(r"^[←-⯿☀-➿\U0001F000-\U0001FAFF]")


def list_html(items, ordered=False, size=15):
    rows = []
    for i, it in enumerate(items, 1):
        if ordered:
            bullet = f"{i}."
        elif EMOJI_START.match(it):
            bullet = ""
        else:
            bullet = f'<span style="color:{RED};font-weight:bold;">&#8226;</span>'
        bcell = (f'<td valign="top" width="22" style="width:22px;padding:0 0 6px 0;font-family:{FONT};'
                 f'font-size:{size}px;line-height:{round(size * 1.6)}px;mso-line-height-rule:exactly;color:{BLUE};">{bullet}</td>') if bullet else ""
        rows.append(f'<tr>{bcell}<td valign="top" style="padding:0 0 6px 0;font-family:{FONT};'
                    f'font-size:{size}px;line-height:{round(size * 1.6)}px;mso-line-height-rule:exactly;color:{TEXT};">{inline(it)}</td></tr>')
    # Pas de margin sur une table multi-lignes : Word/Outlook l'applique a CHAQUE ligne.
    # L'espacement est porte par une cellule englobante.
    return (f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>'
            f'<td style="padding:0 0 10px 4px;"><table role="presentation" cellpadding="0" cellspacing="0" '
            f'border="0" width="100%">{"".join(rows)}</table></td></tr></table>')


def button_html(label, url, caption="", color=BLUE):
    cap = (f'<p style="margin:8px 0 0 0;font-family:{FONT};font-size:13px;line-height:1.4;color:{MUTED};'
           f'text-align:center;">{inline(caption)}</p>') if caption else ""
    return f'''<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 24px 0;">
<tr><td align="center">
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="{url}" style="height:48px;v-text-anchor:middle;width:300px;" arcsize="15%" stroke="f" fillcolor="{color}"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">{inline(label)}</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><a href="{url}" target="_blank" style="display:inline-block;background:{color};color:#ffffff;font-family:{FONT};font-size:16px;font-weight:bold;line-height:1.2;text-decoration:none;padding:14px 28px;border-radius:8px;mso-hide:all;">{inline(label)}</a><!--<![endif]-->
{cap}
</td></tr></table>'''


def video_html(ctx, label, url, thumb=""):
    if thumb:
        pic = f'<a href="{url}" target="_blank" style="text-decoration:none;">{img_tag(ctx, thumb, INNER, label, "border-radius:6px;")}</a>'
        return (f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 8px 0;">'
                f'<tr><td align="center">{pic}</td></tr></table>' + button_html("▶️ " + label, url))
    return f'''<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 24px 0;">
<tr><td align="center" bgcolor="{BLUE}" style="background:{BLUE};border-radius:8px;padding:36px 20px;">
<a href="{url}" target="_blank" style="color:#ffffff;text-decoration:none;font-family:{FONT};">
<span style="font-size:40px;line-height:1;">▶️</span><br>
<span style="font-size:16px;font-weight:bold;line-height:2.4;color:#ffffff;">{inline(label)}</span></a>
</td></tr></table>'''


def callout_html(ctx, kind, title, inner_lines):
    bg, border, color = CALLOUTS.get(kind, CALLOUTS["info"])
    inner = render_blocks(ctx, inner_lines, INNER - 40, nested=True)
    head = (f'<p style="margin:0 0 8px 0;font-family:{FONT};font-size:16px;font-weight:bold;line-height:1.4;'
            f'color:{border};">{inline(title)}</p>') if title else ""
    inner = inner.replace(f"color:{TEXT};", f"color:{color};")
    return f'''<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 24px 0;">
<tr><td bgcolor="{bg}" style="background:{bg};border-left:5px solid {border};border-radius:6px;padding:18px 20px 4px 20px;">
{head}{inner}
</td></tr></table>'''


def columns_html(ctx, parts):
    n = len(parts)
    col_w = (INNER - 20 * (n - 1)) // n
    cells, ghost = [], []
    for i, part in enumerate(parts):
        content = render_blocks(ctx, part, col_w, nested=True)
        gap = "" if i == n - 1 else "padding-right:20px;"
        ghost.append((col_w, gap))
        # Les div inline-block ne servent qu'aux clients modernes (empilement mobile) ;
        # Outlook/Word ne voit que les cellules de la table fantome.
        cells.append(f'<!--[if !mso]><!--><div class="col" style="display:inline-block;vertical-align:top;'
                     f'width:100%;max-width:{col_w}px;font-size:15px;"><!--<![endif]-->'
                     f'{content}<!--[if !mso]><!--></div><!--<![endif]-->')
    out = '<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><![endif]-->'
    for (w, gap), cell in zip(ghost, cells):
        out += f'<!--[if mso]><td valign="top" width="{w}" style="{gap}"><![endif]-->{cell}<!--[if mso]></td><![endif]-->'
        if gap:
            out += '<!--[if !mso]><!--><span class="gap" style="display:inline-block;width:16px;"></span><!--<![endif]-->'
    out += '<!--[if mso]></tr></table><![endif]-->'
    return (f'<!--[if !mso]><!--><div style="font-size:0;text-align:left;"><!--<![endif]-->{out}'
            f'<!--[if !mso]><!--></div><!--<![endif]-->')


TABLE_TAG = re.compile(r"<table\b[^>]*>|</table>")
MARGIN_DECL = re.compile(r"margin:(\d+)(?:px)? 0 (\d+)(?:px)? 0;")


def margins_to_padding(src: str) -> str:
    """Outlook/Word gere mal la marge d'une <table> (ignoree, ou appliquee a chaque ligne).
    On transforme chaque table a marge verticale en table enveloppe dont la cellule porte un padding."""
    out, stack, pos = [], [], 0
    for m in TABLE_TAG.finditer(src):
        out.append(src[pos:m.start()])
        tag = m.group(0)
        if tag == "</table>":
            out.append("</table></td></tr></table>" if stack.pop() else tag)
        else:
            mm = MARGIN_DECL.search(tag)
            if mm:
                top, bottom = mm.groups()
                inner = MARGIN_DECL.sub("", tag).replace(' style=""', "")
                out.append(f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">'
                           f'<tr><td style="padding:{top}px 0 {bottom}px 0;">{inner}')
            else:
                out.append(tag)
            stack.append(bool(mm))
        pos = m.end()
    out.append(src[pos:])
    return "".join(out)


# ---------------------------------------------------------------- parseur de blocs

IMG_RE = re.compile(r'^\[?!\[([^\]]*)\]\(([^)\s]+)\)(?:\]\(([^)\s]+)\))?\s*(\{[^}]*\})?\s*$')
DIRECTIVE_RE = re.compile(r"^\[\[\s*(\w+)\s*:\s*(.+?)\s*\]\]$")


def parse_attrs(s):
    return dict(re.findall(r"(\w+)=([^\s}]+)", s or ""))


def render_blocks(ctx, lines, avail_w=INNER, nested=False):
    out, i, para = [], 0, []

    def flush():
        if para:
            out.append(para_html(para))
            para.clear()

    while i < len(lines):
        line = lines[i]
        s = line.strip()

        if not s:
            flush(); i += 1; continue

        # bloc :::type titre ... :::
        m = re.match(r"^:::\s*(\w+)\s*(.*)$", s)
        if m:
            flush()
            kind, title = m.group(1).lower(), m.group(2)
            depth, j, inner = 1, i + 1, []
            while j < len(lines):
                t = lines[j].strip()
                if re.match(r"^:::\s*\w+", t):
                    depth += 1
                elif t == ":::":
                    depth -= 1
                    if depth == 0:
                        break
                inner.append(lines[j]); j += 1
            i = j + 1
            if kind in ("colonnes", "columns"):
                parts, cur = [], []
                for l in inner:
                    if l.strip() == "|||":
                        parts.append(cur); cur = []
                    else:
                        cur.append(l)
                parts.append(cur)
                out.append(columns_html(ctx, parts))
            elif kind in ("footer", "pied"):
                txt = [l for l in inner]
                blocks, cur = [], []
                for l in txt + [""]:
                    if l.strip():
                        cur.append(l)
                    elif cur:
                        blocks.append(para_html(cur, 13, MUTED, "center", "0 0 8px 0")); cur = []
                out.append(f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" '
                           f'style="margin:16px 0 0 0;border-top:1px solid #e5e7eb;"><tr><td style="padding-top:20px;">'
                           f'{"".join(blocks)}</td></tr></table>')
            elif kind in ("centre", "center"):
                blocks, cur = [], []
                for l in inner + [""]:
                    if l.strip():
                        cur.append(l)
                    elif cur:
                        blocks.append(para_html(cur, align="center")); cur = []
                out.append("".join(blocks))
            else:
                out.append(callout_html(ctx, kind, title, inner))
            continue

        # titres
        m = re.match(r"^(#{1,3})\s+(.*)$", s)
        if m:
            flush()
            lvl = len(m.group(1))
            size = {1: 26, 2: 22, 3: 18}[lvl]
            col = BLUE if lvl < 3 else BLUE
            out.append(f'<h{lvl} style="margin:8px 0 12px 0;font-family:{FONT};font-size:{size}px;line-height:1.3;'
                       f'font-weight:bold;color:{col};">{inline(m.group(2))}</h{lvl}>')
            i += 1; continue

        # separateur
        if re.match(r"^(-{3,}|\*{3,})$", s):
            flush()
            out.append('<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" '
                       'style="margin:8px 0 24px 0;"><tr><td style="border-top:1px solid #e5e7eb;font-size:0;'
                       'line-height:0;height:1px;">&nbsp;</td></tr></table>')
            i += 1; continue

        # image seule sur sa ligne
        m = IMG_RE.match(s)
        if m:
            flush()
            alt, src, link, attrs = m.group(1), m.group(2), m.group(3), parse_attrs(m.group(4))
            w = avail_w
            if "width" in attrs:
                v = attrs["width"]
                w = round(avail_w * int(v[:-1]) / 100) if v.endswith("%") else min(int(v.rstrip("px")), avail_w)
            align = attrs.get("align", "center")
            tag = img_tag(ctx, src, w, alt, "margin:0 auto;" if align == "center" else "")
            if link:
                tag = f'<a href="{link}" target="_blank">{tag}</a>'
            cap = ""
            if i + 1 < len(lines) and re.match(r"^_.+_$", lines[i + 1].strip()):
                cap = (f'<p style="margin:6px 0 0 0;font-family:{FONT};font-size:13px;line-height:1.4;'
                       f'color:{MUTED};text-align:center;font-style:italic;">{inline(lines[i + 1].strip()[1:-1])}</p>')
                i += 1
            out.append(f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" '
                       f'style="margin:8px 0 20px 0;"><tr><td align="{align}">{tag}{cap}</td></tr></table>')
            i += 1; continue

        # directives [[bouton: ...]] [[video: ...]]
        m = DIRECTIVE_RE.match(s)
        if m:
            flush()
            kind = m.group(1).lower()
            args = [a.strip() for a in m.group(2).split("|")]
            if kind in ("bouton", "button"):
                color = {"rouge": RED, "red": RED}.get(args[3].lower(), args[3]) if len(args) > 3 and args[3] else BLUE
                out.append(button_html(args[0], args[1], args[2] if len(args) > 2 else "", color))
            elif kind == "video":
                out.append(video_html(ctx, args[0], args[1], args[2] if len(args) > 2 else ""))
            elif kind in ("espace", "spacer"):
                h = int(args[0]) if args and args[0].isdigit() else 16
                out.append(f'<div style="height:{h}px;line-height:{h}px;font-size:0;">&nbsp;</div>')
            else:
                raise SystemExit(f"Directive inconnue : [[{kind}: ...]]")
            i += 1; continue

        # listes
        if re.match(r"^([-*•])\s+", s) or re.match(r"^\d+[.)]\s+", s):
            flush()
            ordered = bool(re.match(r"^\d+[.)]\s+", s))
            items = []
            while i < len(lines):
                t = lines[i].strip()
                mm = re.match(r"^(?:[-*•]|\d+[.)])\s+(.*)$", t)
                if mm:
                    items.append(mm.group(1))
                elif t and items and lines[i].startswith(("  ", "\t")):
                    items[-1] += " " + t
                else:
                    break
                i += 1
            out.append(list_html(items, ordered))
            continue

        # HTML brut (ligne commencant par une balise bloc)
        if re.match(r"^<(table|div|p|center|!--)", s, re.I):
            flush()
            out.append(line); i += 1; continue

        para.append(line); i += 1

    flush()
    return "\n".join(out)


# ---------------------------------------------------------------- bandeau + page

def banner_html(ctx, meta):
    title = meta.get("bandeau_titre") or meta.get("objet", "")
    sub = meta.get("bandeau_sous_titre", "")
    logo = meta.get("bandeau_logo", "")
    rows = [f'<tr><td style="padding:0;">{img_tag(ctx, "strip.png", WIDTH, "")}</td></tr>']
    rows.append(f'<tr><td align="center" class="px" style="padding:22px {PAD}px 6px {PAD}px;font-family:{FONT};'
                f'font-size:30px;line-height:1.2;font-weight:bold;color:{BLUE};">{inline(title)}</td></tr>')
    if sub or logo:
        cells = ""
        if sub:
            cells += (f'<td valign="middle" style="font-family:{FONT};font-size:22px;line-height:1.3;color:{BLUE};'
                      f'padding:0 {10 if logo else 0}px 0 0;">{inline(sub)}</td>')
        if logo:
            path = resolve_image(logo, ctx.comm)
            lw, lh = Image.open(path).size
            target_h = int(meta.get("bandeau_logo_hauteur", 34))
            w = round(lw * target_h / lh)
            cid, dw, dh = ctx.image(logo, w)
            cells += (f'<td valign="middle"><img src="cid:{cid}" width="{dw}" height="{dh}" alt="" '
                      f'style="display:block;width:{dw}px;height:{dh}px;border:0;"></td>')
        rows.append(f'<tr><td align="center" style="padding:2px {PAD}px 4px {PAD}px;">'
                    f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">'
                    f'<tr>{cells}</tr></table></td></tr>')
    if meta.get("bandeau_accroche"):
        rows.append(f'<tr><td align="center" class="px" style="padding:6px {PAD}px 0 {PAD}px;font-family:{FONT};'
                    f'font-size:19px;line-height:1.35;color:{BLUE};">{inline(meta["bandeau_accroche"])}</td></tr>')
    pole = img_tag(ctx, "logo-pole-mt.png", 120, "Pôle Métiers & Transition", fluid=False)
    cicad = img_tag(ctx, "logo-cicad.png", 88, "Cicad", fluid=False)
    rows.append(f'<tr><td style="padding:10px 18px 16px 18px;"><table role="presentation" cellpadding="0" '
                f'cellspacing="0" border="0" width="100%"><tr><td align="left" valign="bottom">{pole}</td>'
                f'<td align="right" valign="bottom">{cicad}</td></tr></table></td></tr>')
    rows.append(f'<tr><td style="padding:0 {PAD}px;"><table role="presentation" cellpadding="0" cellspacing="0" '
                f'border="0" width="100%"><tr><td style="border-top:3px solid {RED};font-size:0;line-height:0;'
                f'height:3px;">&nbsp;</td></tr></table></td></tr>')
    return "\n".join(rows)


PAGE = """<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>{title}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<style>table,td,p,a,li,h1,h2,h3,span{{font-family:Aptos,Calibri,Arial,sans-serif !important;}}</style><![endif]-->
<style>
  body{{margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}}
  img{{-ms-interpolation-mode:bicubic;}}
  a{{color:{blue};}}
  @media screen and (max-width:620px){{
    .container{{width:100% !important;}}
    .px{{padding-left:18px !important;padding-right:18px !important;}}
    .col{{max-width:100% !important;display:block !important;}}
    .gap{{display:none !important;}}
  }}
</style>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">{preheader}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#f3f4f6" style="background:#f3f4f6;">
<tr><td align="center" style="padding:20px 8px;">
<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="{width}" align="center"><tr><td><![endif]-->
<table role="presentation" class="container" cellpadding="0" cellspacing="0" border="0" width="{width}" bgcolor="#ffffff" style="width:100%;max-width:{width}px;background:#ffffff;">
{banner}
<tr><td class="px" style="padding:28px {pad}px 28px {pad}px;">
{body}
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>
"""


def parse_md(text):
    text = text.replace("\r\n", "\n").lstrip("﻿")
    meta = {}
    if text.startswith("---\n"):
        end = text.find("\n---", 4)
        for line in text[4:end].splitlines():
            if ":" in line and not line.strip().startswith("#"):
                k, v = line.split(":", 1)
                meta[k.strip().lower()] = v.strip().strip('"').strip("'")
        text = text[end + 4:].lstrip("\n")
    return meta, text.split("\n")


def build(comm: Path):
    md = comm / "mail.md"
    if not md.is_file():
        raise SystemExit(f"{md} introuvable. Lance d'abord : build_mail.py init {comm}")
    meta, lines = parse_md(md.read_text(encoding="utf-8"))
    ctx = Ctx(comm)
    if ctx.build.exists():
        shutil.rmtree(ctx.build)
    (ctx.build / "images").mkdir(parents=True)

    banner = banner_html(ctx, meta) if meta.get("bandeau", "oui").lower() not in ("non", "no", "false") else ""
    body = margins_to_padding(render_blocks(ctx, lines))
    subject = meta.get("objet") or meta.get("subject") or meta.get("bandeau_titre", "")
    page = PAGE.format(title=html.escape(subject), preheader=html.escape(meta.get("preheader", "")),
                       banner=banner, body=body, width=WIDTH, pad=PAD, blue=BLUE)

    (ctx.build / "mail.html").write_text(page, encoding="utf-8")
    preview = page
    for im in ctx.images:
        preview = preview.replace(f'src="cid:{im["cid"]}"', f'src="{im["file"]}"')
    (ctx.build / "preview.html").write_text(preview, encoding="utf-8")
    manifest = {"subject": subject, "to": meta.get("a", ""), "cc": meta.get("cc", ""),
                "bcc": meta.get("cci", ""), "html": "mail.html", "images": ctx.images}
    (ctx.build / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    total = sum((ctx.build / im["file"]).stat().st_size for im in ctx.images)
    print(f"OK  objet : {subject}")
    print(f"    {len(ctx.images)} images, {total / 1024:.0f} Ko au total")
    if total > 3 * 1024 * 1024:
        print("    ATTENTION : mail > 3 Mo, reduire/compresser les images.")
    print(f"    apercu  : {ctx.build / 'preview.html'}")
    print(f"    outlook : {ctx.build / 'manifest.json'}")


def init(comm: Path):
    (comm / "assets").mkdir(parents=True, exist_ok=True)
    md = comm / "mail.md"
    if md.exists():
        print(f"{md} existe deja, rien a faire.")
    else:
        md.write_text(TEMPLATE_MD, encoding="utf-8")
        print(f"Cree : {md}\nDepose les images dans : {comm / 'assets'}")


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in ("init", "build"):
        print(__doc__); sys.exit(1)
    sys.stdout.reconfigure(encoding="utf-8")
    {"init": init, "build": build}[sys.argv[1]](Path(sys.argv[2]).resolve())
