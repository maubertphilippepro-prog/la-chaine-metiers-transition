"""Insertion d'un rush dans un tournage analysé : la source est reconstruite avec le rush à l'instant T, tout ce qui
suit est décalé de la durée d du rush, puis l'analyse du rush, analysé seul, est fusionnée dans celle du tournage."""
import math
import os
import time
from pathlib import Path

from .audio import SUIVRE_HORODATAGES
from .preparation import _ffmpeg

from .recalage import Decalage, decalage_ponctuel

PRECISION = 4
# Champs d'une opération de consigne qui désignent un mot par son numéro.
CHAMPS_MOT = ("premierMot", "dernierMot", "premierMotChapitre", "nouveauPremierMot")


def decalage_insertion(t: float, d: float) -> Decalage:
    """Ce qui commence en T ou après passe après le rush ; ce qui finit en T ou avant ne bouge pas. Un intervalle à
    cheval sur T est scindé, la partie d'après prenant l'identifiant <id>-suite ; un mot à cheval s'arrête en T."""
    def point(x: float) -> float:
        return x if x < t else round(x + d, PRECISION)

    def intervalles(liste: list[dict]) -> list[dict]:
        resultat = []
        for x in liste:
            if x["fin"] <= t:
                resultat.append(x)
            elif x["debut"] >= t:
                resultat.append({**x, "debut": point(x["debut"]), "fin": point(x["fin"])})
            else:
                resultat.append({**x, "fin": t})
                suite = {**x, "debut": round(t + d, PRECISION), "fin": point(x["fin"])}
                if "id" in x:
                    suite["id"] = f"{x['id']}-suite"
                resultat.append(suite)
        return resultat

    def mots(liste: list[dict]) -> list[dict]:
        return [
            x if x["fin"] <= t else {**x, "fin": t} if x["debut"] < t
            else {**x, "debut": point(x["debut"]), "fin": point(x["fin"])}
            for x in liste
        ]
    return Decalage(point, intervalles, mots)


def renumeroter(mots_tournage: list[dict], mots_rush: list[dict]) -> tuple[list[dict], dict[int, int]]:
    """Mots du tournage (décalés) et du rush (placés) dans l'ordre du temps, numérotés 0, 1, 2… comme le suppose le
    studio ; renvoie aussi la table ancien → nouveau numéro des mots du tournage."""
    tous = sorted(
        [(m["debut"], 0, i, m) for i, m in enumerate(mots_tournage)]
        + [(m["debut"], 1, i, m) for i, m in enumerate(mots_rush)],
        key=lambda x: x[:3],
    )
    mots, table = [], {}
    for _, origine, _, m in tous:
        if origine == 0:
            table[m["id"]] = len(mots)
        mots.append({**m, "id": len(mots)})
    return mots, table


def renumeroter_consignes(fichier: dict, table: dict[int, int]) -> dict:
    """Consignes dont les numéros de mots suivent la renumérotation ; un numéro inconnu est gardé tel quel."""
    def mot(i):
        return table.get(i, i)

    def operation(op: dict) -> dict:
        nouvelle = {**op, **{c: mot(op[c]) for c in CHAMPS_MOT if isinstance(op.get(c), int)}}
        if isinstance(op.get("mots"), list):
            nouvelle["mots"] = [mot(i) for i in op["mots"]]
        return nouvelle

    def consigne(c: dict) -> dict:
        a = c.get("ancrage")
        return {
            **c,
            "ancrage": {**a, "premierMot": mot(a["premierMot"]), "dernierMot": mot(a["dernierMot"])} if a else a,
            "propositions": [{**p, "operation": operation(p["operation"])} for p in c.get("propositions", [])],
        }
    return {**fichier, "consignes": [consigne(c) for c in fichier.get("consignes", [])]}


def placer_rush(analyse: dict, n: int, t: float) -> dict:
    """Mots, détections et suggestions du rush placés à l'instant T de la source, identifiants préfixés r<N>- pour ne
    jamais rencontrer ceux du tournage. Les chapitres suggérés sont ignorés : l'auteur donne le titre du chapitre."""
    dec = decalage_ponctuel(lambda x: round(x + t, PRECISION))

    def prefixer(liste: list[dict]) -> list[dict]:
        return [{**x, "id": f"r{n}-{x['id']}"} for x in liste]

    s = analyse["suggestions"]
    suggestions = None if s is None else {
        "chapitres": [],
        "termes": [{**x, "occurrences": [dec.point(o) for o in x["occurrences"]]} for x in s["termes"]],
        "longueurs": prefixer(dec.intervalles(s["longueurs"])),
        "elements": prefixer(dec.intervalles(s.get("elements", []))),
    }
    return {"mots": dec.mots(analyse["mots"]), "detections": prefixer(dec.intervalles(analyse["detections"])),
            "suggestions": suggestions}


def _debut(x: dict) -> float:
    return x["debut"]


def _fusionner_termes(termes: list[dict], nouveaux: list[dict], convertir) -> list[dict]:
    """Un terme déjà présent (sans tenir compte de la casse) ne reçoit que les nouvelles occurrences."""
    resultat = [dict(t) for t in termes]
    index = {t["terme"].lower(): t for t in resultat}
    for n in nouveaux:
        connu = index.get(n["terme"].lower())
        if connu:
            connu["occurrences"] = sorted(set(connu["occurrences"]) | set(n["occurrences"]))
        else:
            ajout = convertir(n)
            resultat.append(ajout)
            index[n["terme"].lower()] = ajout
    return resultat


def _fusionner_suggestions(tournage: dict | None, rush: dict | None) -> dict | None:
    if rush is None:
        return tournage
    base = tournage or {"chapitres": [], "termes": [], "longueurs": [], "elements": []}
    return {
        **base,
        "termes": _fusionner_termes(base["termes"], rush["termes"], dict),
        "longueurs": sorted(base["longueurs"] + rush["longueurs"], key=_debut),
        "elements": sorted(base.get("elements", []) + rush["elements"], key=_debut),
    }


def fusionner_analyse(analyse: dict, rush: dict, duree: float) -> tuple[dict, dict[int, int]]:
    """Analyse du tournage (déjà décalée) complétée par le rush placé ; renvoie aussi la table des numéros de mots."""
    mots, table = renumeroter(analyse["mots"], rush["mots"])
    return {
        **analyse,
        "duree": duree,
        "mots": mots,
        "detections": sorted(analyse["detections"] + rush["detections"], key=_debut),
        "suggestions": _fusionner_suggestions(analyse["suggestions"], rush["suggestions"]),
    }, table


def chapitres_apres_insertion(chapitres: list[dict], mots: list[dict], t: float, d: float, titre: str) -> list[dict]:
    """Chapitres d'avant l'insertion une fois le rush inséré en T : un chapitre en T au titre donné et, si des mots du
    chapitre coupé suivent T, sa suite en T + d sous le même titre. Un chapitre qui commence en T passe après le rush."""
    tries = sorted(chapitres, key=_debut)
    suivant = next((c["debut"] for c in tries if c["debut"] >= t), math.inf)
    coupe = next((c for c in reversed(tries) if c["debut"] < t), None)
    milieu = coupe is not None and any(t <= m["debut"] < suivant for m in mots)
    decales = [c if c["debut"] < t else {**c, "debut": round(c["debut"] + d, PRECISION)} for c in tries]
    ajouts = [{"titre": titre, "debut": t}]
    if milieu:
        ajouts.append({"titre": coupe["titre"], "debut": round(t + d, PRECISION)})
    return sorted(decales + ajouts, key=_debut)


def integrer_rush(montage: dict, rush: dict, chapitres: list[dict]) -> dict:
    """Montage (déjà décalé) complété par le rush placé, comme un montage initial : détections actives sauf
    hésitations à paroles, longueurs en attente, termes (un terme connu ne reçoit que les nouvelles occurrences),
    éléments à valider ; les chapitres sont ceux donnés."""
    s = rush["suggestions"] or {"termes": [], "longueurs": [], "elements": []}
    coupes = [{"id": d["id"], "type": d["type"], "debut": d["debut"], "fin": d["fin"], "active": not d.get("paroles")}
              for d in rush["detections"]]
    coupes += [{"id": l["id"], "type": "longueur", "debut": l["debut"], "fin": l["fin"], "active": False, "enAttente": True}
               for l in s["longueurs"]]

    def terme(t: dict) -> dict:
        return {"terme": t["terme"], "definition": t["definition"], "occurrences": list(t["occurrences"]),
                "statut": "valide" if t["origine"] == "glossaire" else "a-valider", "position": "bas"}

    def element(e: dict) -> dict:
        commun = {"id": e["id"], "debut": e["debut"], "fin": e["fin"], "statut": "a-valider"}
        if e["nature"] == "texte":
            return {**commun, "nature": "texte", "texte": e.get("texte", ""), "position": "haut-gauche"}
        return {**commun, "nature": e["nature"], "zone": None}

    return {
        **montage,
        "coupes": montage["coupes"] + coupes,
        "chapitres": chapitres,
        "termes": _fusionner_termes(montage["termes"], s["termes"], terme),
        "elements": montage.get("elements", []) + [element(e) for e in s["elements"]],
    }


def construire_source(source: Path, rush: Path, t: float, duree_source: float, duree_rush: float, fps: float,
                      sortie: Path) -> None:
    """source[0, T] + rush + source[T, fin] en un seul passage ffmpeg, réencodée comme dans la préparation. La source
    est ouverte deux fois (une entrée par morceau) ; l'audio suit ses horodatages, comme pour l'analyse, et chaque
    morceau dure exactement sa part (silence ajouté ou fin coupée)."""
    morceaux = [m for m in [(0, 0.0, t), (1, 0.0, duree_rush), (2, t, duree_source)] if m[2] - m[1] > 0]
    filtres = []
    for k, (entree, debut, fin) in enumerate(morceaux):
        longueur = fin - debut
        filtres.append(f"[{entree}:v]trim=start={debut}:end={fin},setpts=PTS-STARTPTS,"
                       f"scale=1920:1080:flags=lanczos,setsar=1,format=yuv420p[v{k}]")
        filtres.append(f"[{entree}:a]{SUIVRE_HORODATAGES},atrim=start={debut}:end={fin},asetpts=PTS-STARTPTS,"
                       f"aformat=sample_rates=48000:channel_layouts=stereo,apad=whole_dur={longueur},"
                       f"atrim=end={longueur}[a{k}]")
    entrees = "".join(f"[v{k}][a{k}]" for k in range(len(morceaux)))
    filtres.append(f"{entrees}concat=n={len(morceaux)}:v=1:a=1[cv][a]")
    # fps comble les trous d'images entre morceaux en répétant la dernière.
    filtres.append(f"[cv]fps={fps:g}[v]")
    _ffmpeg(["-i", str(source), "-i", str(rush), "-i", str(source), "-filter_complex", ";".join(filtres),
             "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
             "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", str(sortie)])


def remplacer(temporaire: Path, cible: Path, essais: int = 10, attente: float = 0.5) -> None:
    """os.replace, réessayé un moment : sous Windows, le lecteur du studio peut tenir la vidéo ouverte un instant."""
    for i in range(essais):
        try:
            os.replace(temporaire, cible)
            return
        except PermissionError:
            if i == essais - 1:
                raise
            time.sleep(attente)
