# Plan 11 : lanceur sur le bureau et nouveau tournage depuis le studio — plan de mise en œuvre

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** une icône « Métiers & Transition » sur le bureau ouvre le studio (en le démarrant au besoin), et un bouton « Nouveau tournage » crée le dossier, reçoit la vidéo exportée de Clipchamp et lance l'analyse, suivie dans la liste des tournages.

**Architecture :** deux scripts PowerShell dans `outils/` (lanceur et installation du raccourci) et une icône générée une fois par un script Python (Pillow). Côté serveur du studio, un module `studio/serveur/nouveau-tournage.ts` (nom du dossier, création, dépôt de la vidéo en flux, étape d'analyse déduite des fichiers) et un suivi `SuiviAnalyse` (une analyse à la fois, sur le modèle de `SuiviRendu`) ; l'analyse appelle `mtpipeline analyser` par `lancerPipeline`, sans toucher au pipeline. Côté interface, une logique pure (`studio/src/logique/nouveau-tournage.ts`), un encadré `NouveauTournage` et la liste des tournages enrichie (étape en cours, « Analyser », « Relancer l'analyse », rafraîchissement toutes les 3 s).

**Tech Stack :** TypeScript, React 19, Node `http` et `stream/promises`, Vitest ; Windows PowerShell 5.1 (`powershell.exe`) pour le lanceur ; Python 3.11 + Pillow 12 (`.venv`) pour l'icône.

Spec : [2026-10-23-lanceur-nouveau-tournage-design.md](../specs/2026-10-23-lanceur-nouveau-tournage-design.md).

## Global Constraints

- Tout en français : identifiants, commentaires, messages, libellés (style du code existant : `ErreurHttp`, `raisonX`, `lireX`).
- Adresse du studio : `http://127.0.0.1:5180`. Racine des tournages : `donnees/tournages/`.
- Extensions vidéo acceptées : `.mp4`, `.mkv`, `.mov`, `.webm` (celles du pipeline, `pipeline/mtpipeline/images.py`). Un fichier dont le nom se termine par `-camera` est l'enregistrement webcam : il sert aux vignettes et ne compte pas comme vidéo du montage.
- Nom du dossier : `<AAAA-MM-JJ>-<titre simplifié>` (minuscules, sans accents, mots séparés par des tirets, 50 caractères au plus pour le titre simplifié) ; `-2`, `-3`… si le nom est pris.
- Une seule analyse à la fois ; refus : 409 « Une analyse est déjà en cours : <titre> ».
- Libellés d'étape : « Préparation de la vidéo », « Transcription », « Repérage des coupes », « Suggestions de Claude ». Rafraîchissement de la liste : toutes les 3 s tant qu'une analyse est en cours.
- Le pipeline Python n'est pas modifié.
- Scripts `.ps1` : lus par Windows PowerShell 5.1, donc **enregistrés en UTF-8 avec BOM** (sinon les accents sont lus de travers).
- Commandes : `npm test` (tests rapides), `npm run typecheck`.
- Fin de chaque message de commit : ligne vide puis `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Messages de commit en français, au style du dépôt (« Studio : … », « Outils : … », « Documentation : … »).

## Fichiers

| Fichier | Rôle |
|---|---|
| `outils/generer-icone.py` (créé) | Dessine le symbole du logo et écrit l'icône multi-tailles |
| `outils/metiers-transition.ico` (créé, versionné) | Icône du raccourci, 16 à 256 px |
| `outils/lanceur.ps1` (créé) | Ouvre le studio, en le démarrant dans une fenêtre réduite s'il ne répond pas |
| `outils/installer-raccourci.ps1` (créé) | Crée le raccourci du bureau, lancé une fois |
| `studio/commun.ts` (modifié) | `EXTENSIONS_VIDEO`, `EtapeAnalyse`, champs ajoutés à `ResumeTournage` |
| `studio/serveur/nouveau-tournage.ts` (créé) | Titre simplifié, création du dossier, vidéos de `bruts/`, dépôt en flux, étape d'analyse |
| `studio/serveur/nouveau-tournage.test.ts` (créé) | Tests unitaires du module |
| `studio/serveur/suivi-analyse.ts` (créé) | `SuiviAnalyse` : l'analyse en cours et son erreur |
| `studio/serveur/pipeline.ts` (modifié) | `analyserTournage` |
| `studio/serveur/api.ts` (modifié) | Routes `POST /api/tournages`, `PUT …/video`, `POST …/analyse` ; résumé enrichi |
| `studio/serveur/api.test.ts` (modifié) | Tests des routes |
| `studio/serveur/principal.ts` (modifié) | Branche le suivi et l'analyse ; pas de délai maximal pour une requête |
| `studio/src/logique/nouveau-tournage.ts` (créé) | Validation du fichier, libellés d'étape, date du jour, titre proposé, état d'un tournage dans la liste |
| `studio/src/logique/nouveau-tournage.test.ts` (créé) | Tests unitaires |
| `studio/src/api.ts` (modifié) | `creerTournage`, `deposerVideo` (XHR avec progression), `analyser` |
| `studio/src/composants/NouveauTournage.tsx` (créé) | Encadré « Nouveau tournage » |
| `studio/src/composants/ListeTournages.tsx` (modifié) | Bouton, encadré, étape en cours, « Analyser », « Relancer l'analyse », rafraîchissement |
| `studio/src/styles.css` (modifié) | Styles de l'encadré |
| `docs/studio.md` (modifié) | Section « Lancer » |

---

### Task 1 : icône du raccourci

**Files:**
- Create: `outils/generer-icone.py`
- Create: `outils/metiers-transition.ico` (généré)

**Interfaces:**
- Produces : `outils/metiers-transition.ico`, utilisé par la tâche 2.

Le logo (`public/logo/metiers-transition.svg`, 116 × 36) associe un symbole géométrique (un `<svg>` imbriqué, repère 24 × 32 : rectangles et triangles) et le texte « Métiers & Transition ». Le texte serait illisible en 16 px : l'icône reprend le symbole seul, centré sur un carré transparent. Il est dessiné directement avec Pillow (déjà dans `.venv`) d'après les coordonnées du SVG, sans outil de conversion SVG.

- [ ] **Step 1 : écrire le script**

`outils/generer-icone.py` :

```python
"""Génère outils/metiers-transition.ico : le symbole du logo public/logo/metiers-transition.svg, sans le texte
(illisible en 16 px). Lancé une fois ; l'icône est versionnée."""
from pathlib import Path

from PIL import Image, ImageDraw

ICI = Path(__file__).resolve().parent
COTE = 1024  # dessiné en grand puis réduit : bords lissés
TAILLES = [16, 24, 32, 48, 64, 128, 256]
# Couleurs du symbole, reprises du svg imbriqué de metiers-transition.svg (repère 24 × 32).
ROUGE, BLEU, BLEU_GRIS = "#D40025", "#0F3285", "#7B9DC4"


def dessiner() -> Image.Image:
    image = Image.new("RGBA", (COTE, COTE), (0, 0, 0, 0))
    d = ImageDraw.Draw(image)
    echelle = COTE / 32
    gauche = (COTE - 24 * echelle) / 2

    def pt(x: float, y: float) -> tuple[float, float]:
        return gauche + x * echelle, y * echelle

    d.rectangle([pt(0, 0), pt(24, 32)], fill=ROUGE)
    d.rectangle([pt(0, 0), pt(3, 32)], fill=BLEU)
    d.rectangle([pt(21, 0), pt(24, 32)], fill=BLEU)
    d.polygon([pt(3, 2), pt(21, 14), pt(3, 24)], fill=BLEU_GRIS)
    d.polygon([pt(3, 20), pt(21, 27), pt(3, 31)], fill=BLEU)
    return image.resize((256, 256), Image.LANCZOS)


if __name__ == "__main__":
    dessiner().save(ICI / "metiers-transition.ico", sizes=[(t, t) for t in TAILLES])
```

- [ ] **Step 2 : générer l'icône et la vérifier**

Run :
```
.venv\Scripts\python outils\generer-icone.py
.venv\Scripts\python -c "from PIL import Image; im = Image.open('outils/metiers-transition.ico'); print(sorted(im.info['sizes']))"
```
Expected : `[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]`.

Ouvrir `outils/metiers-transition.ico` (Read sur une copie PNG si besoin : `.venv\Scripts\python -c "from PIL import Image; Image.open('outils/metiers-transition.ico').save('<scratchpad>/icone.png')"`) et vérifier : rectangle rouge bordé de bleu à gauche et à droite, triangle bleu-gris en haut, triangle bleu en bas, fond transparent de chaque côté.

- [ ] **Step 3 : commit**

```bash
git add outils/generer-icone.py outils/metiers-transition.ico
git commit -m "Outils : icône Métiers & Transition du raccourci, tirée du symbole du logo"
```

---

### Task 2 : lanceur et raccourci du bureau

**Files:**
- Create: `outils/lanceur.ps1`
- Create: `outils/installer-raccourci.ps1`

**Interfaces:**
- Consumes : `outils/metiers-transition.ico` (tâche 1), `npm run validation` (existant).

Le lanceur tient en un seul script : sans paramètre, il ouvre le studio (en le démarrant au besoin) ; avec `-Serveur`, il est la fenêtre réduite du studio. « Le studio répond » se vérifie par une connexion TCP sur `127.0.0.1:5180` : le serveur n'écoute qu'une fois Vite prêt (`principal.ts`), et une connexion directe évite le proxy de l'entreprise qu'emprunterait `Invoke-WebRequest`.

- [ ] **Step 1 : écrire `outils/lanceur.ps1`**

```powershell
# Ouvre le studio Métiers & Transition dans le navigateur, en le démarrant s'il ne répond pas.
# Avec -Serveur : fenêtre réduite du studio ; la fermer arrête le studio (et l'analyse en cours).
param([switch]$Serveur)

$adresse = 'http://127.0.0.1:5180'
$projet = Split-Path -Parent $PSScriptRoot
$journal = Join-Path $env:TEMP 'studio-metiers-transition.log'

if ($Serveur) {
  $Host.UI.RawUI.WindowTitle = 'Studio M&T — ne pas fermer'
  Set-Location -LiteralPath $projet
  # Par cmd : la sortie d'erreur de node va dans le journal sans devenir une erreur PowerShell.
  cmd /c 'npm run validation 2>&1' | Tee-Object -FilePath $journal
  exit
}

function Test-Studio {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $client.Connect('127.0.0.1', 5180)
    return $true
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

if (-not (Test-Studio)) {
  Remove-Item -LiteralPath $journal -ErrorAction SilentlyContinue
  $processus = Start-Process powershell.exe -WindowStyle Minimized -PassThru -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-Serveur')
  $limite = (Get-Date).AddSeconds(30)
  while (-not (Test-Studio)) {
    if ($processus.HasExited -or (Get-Date) -gt $limite) {
      Add-Type -AssemblyName PresentationFramework
      $fin = (Get-Content -LiteralPath $journal -Tail 15 -ErrorAction SilentlyContinue) -join "`n"
      if (-not $fin) { $fin = '(journal vide)' }
      [System.Windows.MessageBox]::Show("Le studio n'a pas démarré.`n`n$fin", 'Métiers & Transition', 'OK', 'Error') | Out-Null
      exit 1
    }
    Start-Sleep -Milliseconds 500
  }
}
Start-Process $adresse
```

- [ ] **Step 2 : écrire `outils/installer-raccourci.ps1`**

```powershell
# Crée sur le bureau le raccourci « Métiers & Transition » vers le lanceur du studio. À lancer une fois :
#   powershell -ExecutionPolicy Bypass -File outils\installer-raccourci.ps1
$projet = Split-Path -Parent $PSScriptRoot
$bureau = [Environment]::GetFolderPath('Desktop')
$chemin = Join-Path $bureau 'Métiers & Transition.lnk'

$raccourci = (New-Object -ComObject WScript.Shell).CreateShortcut($chemin)
$raccourci.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$raccourci.Arguments = "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$projet\outils\lanceur.ps1`""
$raccourci.WorkingDirectory = $projet
$raccourci.IconLocation = "$projet\outils\metiers-transition.ico,0"
$raccourci.WindowStyle = 7  # réduite : la console du lanceur ne fait que passer
$raccourci.Save()
Write-Host "Raccourci créé : $chemin"
```

- [ ] **Step 3 : enregistrer les deux scripts en UTF-8 avec BOM**

Run (PowerShell 7) :
```
foreach ($f in 'outils/lanceur.ps1', 'outils/installer-raccourci.ps1') { Set-Content $f (Get-Content -Raw $f) -Encoding utf8BOM -NoNewline }
```
Vérifier : `Format-Hex outils/lanceur.ps1 -Count 3` affiche `EF BB BF`.

- [ ] **Step 4 : vérifier la syntaxe sous Windows PowerShell 5.1**

Run :
```
powershell.exe -NoProfile -Command "foreach ($f in 'outils\lanceur.ps1','outils\installer-raccourci.ps1') { $e = $null; [void][System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path $f), [ref]$null, [ref]$e); \"$f : $($e.Count) erreur(s)\" }"
```
Expected : `0 erreur(s)` pour chacun.

- [ ] **Step 5 : essai du lanceur**

1. Studio arrêté (aucun processus n'écoute sur 5180 : `Test-NetConnection 127.0.0.1 -Port 5180 -InformationLevel Quiet` renvoie `False`).
2. Run : `powershell.exe -ExecutionPolicy Bypass -File outils\lanceur.ps1`. Expected : une fenêtre réduite « Studio M&T — ne pas fermer » apparaît dans la barre des tâches, puis le navigateur par défaut ouvre `http://127.0.0.1:5180` (liste des tournages).
3. Relancer la même commande : seul un nouvel onglet s'ouvre, aucune seconde fenêtre.
4. Fermer la fenêtre réduite : le port 5180 ne répond plus.

- [ ] **Step 6 : commit**

```bash
git add outils/lanceur.ps1 outils/installer-raccourci.ps1
git commit -m "Outils : lanceur du studio et raccourci du bureau"
```

---

### Task 3 : serveur — création d'un tournage

**Files:**
- Create: `studio/serveur/nouveau-tournage.ts`
- Create: `studio/serveur/nouveau-tournage.test.ts`
- Modify: `studio/serveur/api.ts` (routeur, fin du fichier)
- Test: `studio/serveur/api.test.ts`

**Interfaces:**
- Produces :
  - `simplifierTitre(titre: string): string`
  - `creerTournage(racine: string, corps: unknown): Promise<string>` — renvoie le nom du dossier ; `ErreurHttp(400)` si titre vide ou date invalide.
  - Route `POST /api/tournages` `{ titre, date }` → `201 { nom }`.

- [ ] **Step 1 : tests unitaires qui échouent**

`studio/serveur/nouveau-tournage.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { simplifierTitre } from './nouveau-tournage';

describe('titre simplifié', () => {
  it('retire accents et ponctuation, en minuscules séparées par des tirets', () => {
    expect(simplifierTitre('Métiers & Transition : l’été !')).toBe('metiers-transition-l-ete');
    expect(simplifierTitre('  Manœuvre  ÉCLAIR  ')).toBe('manoeuvre-eclair');
  });
  it('garde 50 caractères au plus, sans tiret final', () => {
    expect(simplifierTitre(`${'a'.repeat(30)} ${'b'.repeat(30)}`)).toBe(`${'a'.repeat(30)}-${'b'.repeat(19)}`);
    expect(simplifierTitre(`${'a'.repeat(49)} b`)).toBe('a'.repeat(49));
  });
  it('se rabat sur « tournage » sans lettre ni chiffre', () => {
    expect(simplifierTitre('?!')).toBe('tournage');
  });
});
```

Dans `studio/serveur/api.test.ts`, ajouter `existsSync` aux imports (`import { existsSync } from 'node:fs';`), la fonction d'envoi à côté des autres (après `envoyerConsignes`) et un bloc `describe` après `liste des tournages` :

```ts
const creerTournage = (corps: unknown) =>
  fetch(`${url}/api/tournages`, { method: 'POST', headers: json, body: JSON.stringify(corps) });
```

```ts
describe('nouveau tournage', () => {
  it('crée le dossier et bruts/ sous le titre simplifié, et garde le titre dans episode.json', async () => {
    const r = await creerTournage({ titre: 'Métiers & Transition : l’été !', date: '2026-10-23' });
    expect(r.status).toBe(201);
    const { nom } = await r.json();
    expect(nom).toBe('2026-10-23-metiers-transition-l-ete');
    const dossier = path.join(config.racineTournages, nom);
    expect(existsSync(path.join(dossier, 'bruts'))).toBe(true);
    expect(await lire(path.join(dossier, 'episode.json'))).toEqual({ version: 1, titre: 'Métiers & Transition : l’été !', statut: null, message: null });
  });
  it('ajoute -2, -3 quand le nom est pris', async () => {
    await tournage('2026-10-23-essai', {});
    expect((await (await creerTournage({ titre: 'Essai', date: '2026-10-23' })).json()).nom).toBe('2026-10-23-essai-2');
    expect((await (await creerTournage({ titre: 'Essai', date: '2026-10-23' })).json()).nom).toBe('2026-10-23-essai-3');
  });
  it('refuse un titre vide ou une date invalide', async () => {
    expect((await creerTournage({ titre: '  ', date: '2026-10-23' })).status).toBe(400);
    expect((await creerTournage({ titre: 'Essai', date: '23/10/2026' })).status).toBe(400);
    expect((await creerTournage({ titre: 'Essai', date: '2026-13-01' })).status).toBe(400);
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npx vitest run studio/serveur/nouveau-tournage.test.ts studio/serveur/api.test.ts`
Expected : FAIL (module `./nouveau-tournage` introuvable).

- [ ] **Step 3 : implémenter**

`studio/serveur/nouveau-tournage.ts` :

```ts
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { ecrireJson, ErreurHttp } from './http';

const LONGUEUR_MAX = 50;

// « Métiers & Transition : l’été ! » → « metiers-transition-l-ete ».
export function simplifierTitre(titre: string): string {
  const simple = titre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return simple.slice(0, LONGUEUR_MAX).replace(/-+$/, '') || 'tournage';
}

function lireDemandeCreation(corps: unknown): { titre: string; date: string } {
  const c = corps && typeof corps === 'object' ? (corps as Record<string, unknown>) : {};
  const titre = typeof c.titre === 'string' ? c.titre.trim() : '';
  if (!titre) throw new ErreurHttp(400, 'Le titre est vide.');
  const date = typeof c.date === 'string' ? c.date : '';
  const jour = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(jour.getTime()) || jour.toISOString().slice(0, 10) !== date) {
    throw new ErreurHttp(400, 'date attendue : AAAA-MM-JJ.');
  }
  return { titre, date };
}

// Crée <date>-<titre simplifié>/bruts/ (suffixe -2, -3… si le nom est pris) ; renvoie le nom du dossier.
export async function creerTournage(racine: string, corps: unknown): Promise<string> {
  const { titre, date } = lireDemandeCreation(corps);
  const base = `${date}-${simplifierTitre(titre)}`;
  await mkdir(racine, { recursive: true });
  for (let n = 1; ; n++) {
    const nom = n === 1 ? base : `${base}-${n}`;
    const dossier = path.join(racine, nom);
    try {
      await mkdir(dossier);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST') continue;
      throw e;
    }
    await mkdir(path.join(dossier, 'bruts'));
    // Le titre reste disponible pour « Analyser » si l’envoi de la vidéo échoue.
    await ecrireJson(path.join(dossier, 'episode.json'), { version: 1, titre, statut: null, message: null });
    return nom;
  }
}
```

Dans `studio/serveur/api.ts`, importer `import { creerTournage } from './nouveau-tournage';` et ajouter la branche juste après celle du `GET /api/tournages` :

```ts
      } else if (chemin === '/api/tournages' && req.method === 'POST') {
        repondre(res, 201, { nom: await creerTournage(c.racineTournages, await lireCorps(req)) });
```

- [ ] **Step 4 : vérifier**

Run : `npx vitest run studio/serveur/nouveau-tournage.test.ts studio/serveur/api.test.ts` puis `npm run typecheck`
Expected : PASS, aucune erreur de type.

- [ ] **Step 5 : commit**

```bash
git add studio/serveur/nouveau-tournage.ts studio/serveur/nouveau-tournage.test.ts studio/serveur/api.ts studio/serveur/api.test.ts
git commit -m "Studio : création d'un tournage sous le titre simplifié"
```

---

### Task 4 : serveur — dépôt de la vidéo en flux

**Files:**
- Modify: `studio/commun.ts` (`ResumeTournage`)
- Modify: `studio/serveur/nouveau-tournage.ts`
- Modify: `studio/serveur/api.ts` (`resume`, routeur)
- Modify: `studio/serveur/principal.ts`
- Test: `studio/serveur/api.test.ts`

**Interfaces:**
- Consumes : `nouveau-tournage.ts` (tâche 3).
- Produces :
  - `EXTENSIONS_VIDEO: string[]` dans `studio/commun.ts` (`['.mp4', '.mkv', '.mov', '.webm']`).
  - `ResumeTournage.videoPresente: boolean`.
  - `videosBrutes(dossier: string): Promise<string[]>` — vidéos du montage dans `bruts/` (hors `-camera`).
  - `deposerVideo(req: IncomingMessage, dossier: string): Promise<string>` — renvoie le nom du fichier écrit.
  - Route `PUT /api/tournages/<nom>/video?fichier=<nom>` → `200 { fichier }`.

- [ ] **Step 1 : tests qui échouent**

Dans `studio/serveur/api.test.ts` : compléter les imports (`import { existsSync, readdirSync } from 'node:fs';`), ajouter après `creerTournage` :

```ts
const envoyerVideo = (nom: string, fichier: string, contenu: string) =>
  fetch(`${url}/api/tournages/${nom}/video?fichier=${encodeURIComponent(fichier)}`, { method: 'PUT', body: contenu });
```

Mettre à jour l'attendu du test « liste les tournages… » :

```ts
      { nom: '2026-10-02-b', titre: '2026-10-02-b', statut: null, message: null, analyseFaite: false, videoPresente: false },
      { nom: '2026-10-01-a', titre: 'A', statut: 'analyse', message: null, analyseFaite: true, videoPresente: false },
```

Et ajouter le bloc :

```ts
describe('dépôt de la vidéo', () => {
  it('écrit la vidéo dans bruts/ et la signale dans la liste', async () => {
    const d = await tournage('a', {});
    const r = await envoyerVideo('a', 'Film Clipchamp.mp4', 'contenu vidéo');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ fichier: 'Film Clipchamp.mp4' });
    expect(await readFile(path.join(d, 'bruts', 'Film Clipchamp.mp4'), 'utf-8')).toBe('contenu vidéo');
    expect((await (await fetch(`${url}/api/tournages`)).json())[0].videoPresente).toBe(true);
  });
  it('ne compte pas l’enregistrement de la webcam comme vidéo du montage', async () => {
    const d = await tournage('a', {});
    await mkdir(path.join(d, 'bruts'));
    await writeFile(path.join(d, 'bruts', 'film-camera.mkv'), 'webcam');
    expect((await (await fetch(`${url}/api/tournages`)).json())[0].videoPresente).toBe(false);
    expect((await envoyerVideo('a', 'film.mkv', 'x')).status).toBe(200);
  });
  it('refuse un fichier non vidéo, un chemin ou une vidéo vide', async () => {
    const d = await tournage('a', {});
    expect((await envoyerVideo('a', 'notes.txt', 'x')).status).toBe(400);
    expect((await envoyerVideo('a', '..\\film.mp4', 'x')).status).toBe(400);
    expect((await envoyerVideo('a', 'film-camera.mp4', 'x')).status).toBe(400);
    expect((await envoyerVideo('a', 'film.mp4', '')).status).toBe(400);
    expect(readdirSync(path.join(d, 'bruts'))).toEqual([]);
  });
  it('refuse une seconde vidéo', async () => {
    await tournage('a', {});
    await envoyerVideo('a', 'film.mp4', 'x');
    const r = await envoyerVideo('a', 'autre.mov', 'y');
    expect(r.status).toBe(409);
    expect((await r.json()).erreur).toBe('Ce tournage a déjà une vidéo dans bruts/.');
  });
  it('supprime le fichier partiel d’un envoi interrompu', async () => {
    const d = await tournage('a', {});
    const partiel = path.join(d, 'bruts', 'film.mp4.partiel');
    const req = http.request(`${url}/api/tournages/a/video?fichier=film.mp4`, { method: 'PUT' });
    req.on('error', () => undefined);
    req.write(Buffer.alloc(1000));
    await vi.waitFor(() => expect(existsSync(partiel)).toBe(true));
    req.destroy();
    await vi.waitFor(() => expect(readdirSync(path.join(d, 'bruts'))).toEqual([]));
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npx vitest run studio/serveur/api.test.ts`
Expected : FAIL (`videoPresente` absent, route `video` inconnue : 404).

- [ ] **Step 3 : implémenter**

Dans `studio/commun.ts`, après le commentaire d'en-tête :

```ts
// Vidéos que le pipeline sait lire (pipeline/mtpipeline/images.py).
export const EXTENSIONS_VIDEO = ['.mp4', '.mkv', '.mov', '.webm'];
```

et dans `ResumeTournage`, après `analyseFaite: boolean;` :

```ts
  // Une vidéo du montage dans bruts/ (l'enregistrement « -camera » ne compte pas).
  videoPresente: boolean;
```

Dans `studio/serveur/nouveau-tournage.ts`, compléter les imports :

```ts
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { EXTENSIONS_VIDEO } from '../commun';
import { ecrireJson, ErreurHttp, message } from './http';
```

et ajouter à la fin :

```ts
// L'enregistrement de la webcam (« -camera », plugin OBS Source Record) sert aux vignettes, pas au montage.
const estVideoMontage = (fichier: string) =>
  EXTENSIONS_VIDEO.includes(path.extname(fichier).toLowerCase()) && !path.parse(fichier).name.toLowerCase().endsWith('-camera');

export async function videosBrutes(dossier: string): Promise<string[]> {
  const bruts = path.join(dossier, 'bruts');
  return existsSync(bruts) ? (await readdir(bruts)).filter(estVideoMontage) : [];
}

// Vidéo envoyée par le studio, écrite en flux dans bruts/ ; un envoi interrompu ne laisse rien.
export async function deposerVideo(req: IncomingMessage, dossier: string): Promise<string> {
  const fichier = new URL(req.url ?? '/', 'http://local').searchParams.get('fichier') ?? '';
  if (!fichier || path.basename(fichier) !== fichier || fichier.startsWith('.') || !estVideoMontage(fichier)) {
    throw new ErreurHttp(400, `fichier attendu : une vidéo ${EXTENSIONS_VIDEO.join(', ')} (hors enregistrement « -camera »), sans chemin.`);
  }
  if ((await videosBrutes(dossier)).length > 0) throw new ErreurHttp(409, 'Ce tournage a déjà une vidéo dans bruts/.');
  const bruts = path.join(dossier, 'bruts');
  await mkdir(bruts, { recursive: true });
  const partiel = path.join(bruts, `${fichier}.partiel`);
  try {
    await pipeline(req, createWriteStream(partiel));
  } catch (e) {
    await rm(partiel, { force: true });
    throw new ErreurHttp(500, `Envoi de la vidéo interrompu : ${message(e)}`);
  }
  if ((await stat(partiel)).size === 0) {
    await rm(partiel, { force: true });
    throw new ErreurHttp(400, 'Vidéo vide.');
  }
  await rename(partiel, path.join(bruts, fichier));
  return fichier;
}
```

Dans `studio/serveur/api.ts` :
- importer `deposerVideo, videosBrutes` depuis `./nouveau-tournage` ;
- dans `resume`, ajouter `videoPresente: (await videosBrutes(dossier)).length > 0` à l'objet renvoyé ;
- dans le routeur, élargir la route : `(?:\/(montage|rendu|suggestions|consignes|video))?` ;
- ajouter la branche avant le `else` final :

```ts
      } else if (nom && action === 'video' && req.method === 'PUT') {
        repondre(res, 200, { fichier: await deposerVideo(req, dossierDe(nom)) });
```

Dans `studio/serveur/principal.ts`, après `const serveur = http.createServer();` :

```ts
  // Une longue vidéo peut mettre plus que les 5 minutes accordées par défaut à une requête.
  serveur.requestTimeout = 0;
```

- [ ] **Step 4 : vérifier**

Run : `npx vitest run studio/serveur` puis `npm run typecheck`
Expected : PASS. Si `typecheck` signale un `ResumeTournage` construit ailleurs sans `videoPresente`, le compléter.

- [ ] **Step 5 : commit**

```bash
git add studio/commun.ts studio/serveur/nouveau-tournage.ts studio/serveur/api.ts studio/serveur/api.test.ts studio/serveur/principal.ts
git commit -m "Studio : dépôt de la vidéo d'un tournage en flux dans bruts/"
```

---

### Task 5 : serveur — analyse lancée et suivie

**Files:**
- Create: `studio/serveur/suivi-analyse.ts`
- Modify: `studio/commun.ts`
- Modify: `studio/serveur/nouveau-tournage.ts`
- Modify: `studio/serveur/pipeline.ts`
- Modify: `studio/serveur/api.ts`
- Modify: `studio/serveur/principal.ts`
- Test: `studio/serveur/nouveau-tournage.test.ts`, `studio/serveur/api.test.ts`

**Interfaces:**
- Consumes : `videosBrutes` (tâche 4).
- Produces :
  - `type EtapeAnalyse = 'preparation' | 'transcription' | 'detections' | 'suggestions'` dans `studio/commun.ts`.
  - `ResumeTournage.analyseEnCours: boolean`, `ResumeTournage.etapeAnalyse: EtapeAnalyse`.
  - `etapeAnalyse(dossier: string): EtapeAnalyse` dans `nouveau-tournage.ts`.
  - `class SuiviAnalyse { etat(): EtatAnalyse; lancer(nom: string, titre: string, travail: () => Promise<void>): boolean; attendre(): Promise<void> }`, `interface EtatAnalyse { nom: string | null; titre: string | null; debut: string | null; enCours: boolean; erreur: string | null }`.
  - `ConfigApi.suiviAnalyse: SuiviAnalyse`, `ConfigApi.analyser: (dossier: string, titre: string) => Promise<void>`.
  - `analyserTournage(dossier: string, titre: string): Promise<void>` dans `pipeline.ts`.
  - Route `POST /api/tournages/<nom>/analyse` `{ titre }` → `202 { ok: true }`.

- [ ] **Step 1 : tests qui échouent**

Dans `studio/serveur/nouveau-tournage.test.ts`, compléter les imports et ajouter :

```ts
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { etapeAnalyse, simplifierTitre } from './nouveau-tournage';
```

```ts
describe('étape de l’analyse', () => {
  it('se déduit du dernier fichier écrit par le pipeline', async () => {
    const d = await mkdtemp(path.join(os.tmpdir(), 'pmt-etape-'));
    expect(etapeAnalyse(d)).toBe('preparation');
    await writeFile(path.join(d, 'preparation.json'), '{}');
    expect(etapeAnalyse(d)).toBe('transcription');
    await writeFile(path.join(d, 'transcription.json'), '[]');
    expect(etapeAnalyse(d)).toBe('detections');
    await writeFile(path.join(d, 'detections.json'), '[]');
    expect(etapeAnalyse(d)).toBe('suggestions');
  });
});
```

Dans `studio/serveur/api.test.ts` :
- importer `import { SuiviAnalyse } from './suivi-analyse';` ;
- dans `beforeEach`, ajouter à `config` :

```ts
    suiviAnalyse: new SuiviAnalyse(),
    analyser: vi.fn<ConfigApi['analyser']>(async () => undefined),
```

- dans `afterEach`, avant la fermeture du serveur : `await config.suiviAnalyse.attendre();` ;
- mettre à jour l'attendu de « liste les tournages… » :

```ts
      { nom: '2026-10-02-b', titre: '2026-10-02-b', statut: null, message: null, analyseFaite: false, videoPresente: false, analyseEnCours: false, etapeAnalyse: 'preparation' },
      { nom: '2026-10-01-a', titre: 'A', statut: 'analyse', message: null, analyseFaite: true, videoPresente: false, analyseEnCours: false, etapeAnalyse: 'preparation' },
```

- ajouter après `envoyerVideo` :

```ts
const demanderAnalyse = (nom: string, titre: string) =>
  fetch(`${url}/api/tournages/${nom}/analyse`, { method: 'POST', headers: json, body: JSON.stringify({ titre }) });

async function avecVideo(nom: string, fichiers: Record<string, unknown> = {}): Promise<string> {
  const dossier = await tournage(nom, fichiers);
  await mkdir(path.join(dossier, 'bruts'));
  await writeFile(path.join(dossier, 'bruts', 'film.mp4'), 'x');
  return dossier;
}

// Analyse simulée qui ne se termine qu'à l'appel de la fonction renvoyée.
function analyseBloquee(): () => void {
  let finir = () => {};
  vi.mocked(config.analyser).mockImplementation(() => new Promise<void>(r => { finir = r; }));
  return () => finir();
}
```

- ajouter le bloc :

```ts
describe('analyse', () => {
  it('lance l’analyse en arrière-plan et la montre en cours dans la liste', async () => {
    const d = await avecVideo('a', { 'preparation.json': {} });
    const finir = analyseBloquee();
    const r = await demanderAnalyse('a', 'Mon titre');
    expect(r.status).toBe(202);
    expect(config.analyser).toHaveBeenCalledWith(d, 'Mon titre');
    expect((await (await fetch(`${url}/api/tournages`)).json())[0]).toMatchObject({ analyseEnCours: true, etapeAnalyse: 'transcription', videoPresente: true });
    finir();
    await config.suiviAnalyse.attendre();
    expect((await (await fetch(`${url}/api/tournages`)).json())[0].analyseEnCours).toBe(false);
  });
  it('refuse une deuxième analyse pendant la première', async () => {
    await avecVideo('a');
    await avecVideo('b');
    const finir = analyseBloquee();
    await demanderAnalyse('a', 'Premier');
    const r = await demanderAnalyse('b', 'Second');
    expect(r.status).toBe(409);
    expect((await r.json()).erreur).toBe('Une analyse est déjà en cours : Premier');
    expect(config.analyser).toHaveBeenCalledTimes(1);
    finir();
  });
  it('refuse sans titre ou sans vidéo', async () => {
    await avecVideo('a');
    await tournage('b', {});
    expect((await demanderAnalyse('a', ' ')).status).toBe(400);
    expect((await demanderAnalyse('b', 'Titre')).status).toBe(409);
    expect(config.analyser).not.toHaveBeenCalled();
  });
  it('garde l’erreur du pipeline et la reporte dans episode.json', async () => {
    const d = await avecVideo('a');
    vi.mocked(config.analyser).mockRejectedValue(new Error('python.exe introuvable'));
    await demanderAnalyse('a', 'Titre');
    await config.suiviAnalyse.attendre();
    expect(config.suiviAnalyse.etat()).toMatchObject({ enCours: false, nom: 'a', titre: 'Titre', erreur: 'python.exe introuvable' });
    expect(await lire(path.join(d, 'episode.json'))).toMatchObject({ statut: 'erreur', message: 'python.exe introuvable' });
  });
  it('laisse le message écrit par le pipeline', async () => {
    const d = await avecVideo('a');
    vi.mocked(config.analyser).mockImplementation(async dossier => {
      await writeFile(path.join(dossier, 'episode.json'), JSON.stringify({ version: 1, titre: 'Titre', statut: 'erreur', message: 'Aucune vidéo lisible.' }));
      throw new Error('Erreur : Aucune vidéo lisible.\nTraceback…');
    });
    await demanderAnalyse('a', 'Titre');
    await config.suiviAnalyse.attendre();
    expect((await lire(path.join(d, 'episode.json'))).message).toBe('Aucune vidéo lisible.');
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npx vitest run studio/serveur`
Expected : FAIL (`./suivi-analyse` introuvable, `etapeAnalyse` non exportée).

- [ ] **Step 3 : implémenter**

`studio/commun.ts`, après `EXTENSIONS_VIDEO` :

```ts
// Étape de l'analyse en cours, déduite des fichiers déjà écrits par le pipeline.
export type EtapeAnalyse = 'preparation' | 'transcription' | 'detections' | 'suggestions';
```

et dans `ResumeTournage`, après `videoPresente` :

```ts
  analyseEnCours: boolean;
  etapeAnalyse: EtapeAnalyse;
```

`studio/serveur/nouveau-tournage.ts` : importer `type EtapeAnalyse` avec `EXTENSIONS_VIDEO` et ajouter à la fin :

```ts
// Le pipeline écrit un fichier par étape finie ; l'étape en cours est la suivante.
export function etapeAnalyse(dossier: string): EtapeAnalyse {
  const present = (fichier: string) => existsSync(path.join(dossier, fichier));
  if (present('detections.json')) return 'suggestions';
  if (present('transcription.json')) return 'detections';
  if (present('preparation.json')) return 'transcription';
  return 'preparation';
}
```

`studio/serveur/suivi-analyse.ts` :

```ts
import { message } from './http';

export interface EtatAnalyse {
  nom: string | null;
  titre: string | null;
  debut: string | null;
  enCours: boolean;
  erreur: string | null;
}

// Une seule analyse à la fois ; la liste des tournages en montre l'avancement.
export class SuiviAnalyse {
  private courant: EtatAnalyse = { nom: null, titre: null, debut: null, enCours: false, erreur: null };
  private promesse: Promise<void> = Promise.resolve();

  etat(): EtatAnalyse {
    return { ...this.courant };
  }

  lancer(nom: string, titre: string, travail: () => Promise<void>): boolean {
    if (this.courant.enCours) return false;
    const etat: EtatAnalyse = { nom, titre, debut: new Date().toISOString(), enCours: true, erreur: null };
    this.courant = etat;
    let analyse: Promise<void>;
    try {
      analyse = travail();
    } catch (e) {
      analyse = Promise.reject(e);
    }
    this.promesse = analyse
      .catch(e => {
        etat.erreur = message(e);
      })
      .finally(() => {
        etat.enCours = false;
      });
    return true;
  }

  // Attend la fin de l'analyse en cours (tests).
  attendre(): Promise<void> {
    return this.promesse;
  }
}
```

`studio/serveur/pipeline.ts`, à la fin :

```ts
export const analyserTournage = (dossier: string, titre: string) => lancerPipeline(['analyser', dossier, '--titre', titre]);
```

`studio/serveur/api.ts` :
- importer `etapeAnalyse` avec `deposerVideo, videosBrutes`, et `import type { SuiviAnalyse } from './suivi-analyse';` ;
- dans `ConfigApi`, après `relancerSuggestions` :

```ts
  suiviAnalyse: SuiviAnalyse;
  // « mtpipeline analyser », injecté pour les tests.
  analyser: (dossier: string, titre: string) => Promise<void>;
```

- déplacer `resume` à l'intérieur de `creerApi` (juste après `dossierDe`), puisqu'il lit le suivi :

```ts
  async function resume(dossier: string): Promise<ResumeTournage> {
    const nom = path.basename(dossier);
    const e = await lireEpisode(dossier);
    const analyse = c.suiviAnalyse.etat();
    return {
      nom,
      titre: e.titre ?? nom,
      statut: e.statut,
      message: e.message,
      analyseFaite: existsSync(path.join(dossier, 'analyse.json')),
      videoPresente: (await videosBrutes(dossier)).length > 0,
      analyseEnCours: analyse.enCours && analyse.nom === nom,
      etapeAnalyse: etapeAnalyse(dossier),
    };
  }
```

  (supprimer la version au niveau du module) ;
- ajouter, après `lancerRendu` :

```ts
  async function lancerAnalyse(req: IncomingMessage, dossier: string): Promise<void> {
    const corps = await lireCorps(req);
    const titre = corps && typeof corps === 'object' && typeof (corps as Record<string, unknown>).titre === 'string'
      ? ((corps as Record<string, unknown>).titre as string).trim()
      : '';
    if (!titre) throw new ErreurHttp(400, 'Le titre est vide.');
    if ((await videosBrutes(dossier)).length === 0) throw new ErreurHttp(409, 'Aucune vidéo dans bruts/ : déposez-la avant d’analyser.');
    const lancee = c.suiviAnalyse.lancer(path.basename(dossier), titre, async () => {
      try {
        await c.analyser(dossier, titre);
      } catch (e) {
        // Le pipeline note lui-même ses erreurs ; un échec avant (Python introuvable…) est reporté ici.
        if ((await lireEpisode(dossier)).statut !== 'erreur') await majStatutEpisode(dossier, 'erreur', message(e));
        throw e;
      }
    });
    if (!lancee) throw new ErreurHttp(409, `Une analyse est déjà en cours : ${c.suiviAnalyse.etat().titre}`);
  }
```

- élargir la route : `(?:\/(montage|rendu|suggestions|consignes|video|analyse))?` et ajouter la branche :

```ts
      } else if (nom && action === 'analyse' && req.method === 'POST') {
        await lancerAnalyse(req, dossierDe(nom));
        repondre(res, 202, { ok: true });
```

`studio/serveur/principal.ts` : importer `analyserTournage` avec `detourerImage, extraireImage` et `import { SuiviAnalyse } from './suivi-analyse';`, puis dans `creerApi({ … })`, après `relancerSuggestions,` :

```ts
    suiviAnalyse: new SuiviAnalyse(),
    analyser: analyserTournage,
```

- [ ] **Step 4 : vérifier**

Run : `npx vitest run studio/serveur` puis `npm run typecheck`
Expected : PASS, aucune erreur de type.

- [ ] **Step 5 : commit**

```bash
git add studio/commun.ts studio/serveur/suivi-analyse.ts studio/serveur/nouveau-tournage.ts studio/serveur/nouveau-tournage.test.ts studio/serveur/pipeline.ts studio/serveur/api.ts studio/serveur/api.test.ts studio/serveur/principal.ts
git commit -m "Studio : analyse d'un tournage lancée depuis le studio et suivie par étape"
```

---

### Task 6 : interface — logique pure et appels au serveur

**Files:**
- Create: `studio/src/logique/nouveau-tournage.ts`
- Create: `studio/src/logique/nouveau-tournage.test.ts`
- Modify: `studio/src/api.ts`

**Interfaces:**
- Consumes : `EXTENSIONS_VIDEO`, `EtapeAnalyse`, `ResumeTournage` (tâches 4 et 5) ; routes des tâches 3 à 5.
- Produces :
  - `LIBELLES_ETAPE: Record<EtapeAnalyse, string>`
  - `raisonFichierVideo(nom: string): string | null`
  - `aujourdhui(d?: Date): string` (AAAA-MM-JJ, heure locale)
  - `titreParDefaut(t: Pick<ResumeTournage, 'nom' | 'titre'>): string`
  - `type EtatTournage = 'en-cours' | 'analyse' | 'erreur' | 'a-analyser' | 'video-manquante'`, `etatTournage(t: ResumeTournage): EtatTournage`
  - `api.creerTournage(titre: string, date: string): Promise<{ nom: string }>`
  - `api.deposerVideo(nom: string, fichier: File, onProgression: (part: number) => void): Promise<void>` (part entre 0 et 1)
  - `api.analyser(nom: string, titre: string): Promise<void>`

- [ ] **Step 1 : tests qui échouent**

`studio/src/logique/nouveau-tournage.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import type { ResumeTournage } from '../../commun';
import { aujourdhui, etatTournage, LIBELLES_ETAPE, raisonFichierVideo, titreParDefaut } from './nouveau-tournage';

const TOURNAGE: ResumeTournage = {
  nom: '2026-10-23-essai',
  titre: '2026-10-23-essai',
  statut: null,
  message: null,
  analyseFaite: false,
  videoPresente: false,
  analyseEnCours: false,
  etapeAnalyse: 'preparation',
};

describe('nouveau tournage', () => {
  it('accepte les vidéos du pipeline, quelle que soit la casse', () => {
    expect(raisonFichierVideo('Export Clipchamp.MP4')).toBeNull();
    expect(raisonFichierVideo('film.webm')).toBeNull();
  });
  it('refuse un autre fichier en le nommant', () => {
    expect(raisonFichierVideo('notes.txt')).toBe('« notes.txt » n’est pas une vidéo .mp4, .mkv, .mov ou .webm.');
    expect(raisonFichierVideo('sans-extension')).toBe('« sans-extension » n’est pas une vidéo .mp4, .mkv, .mov ou .webm.');
  });
  it('date du jour en heure locale', () => {
    expect(aujourdhui(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
  it('propose le titre d’episode.json, sinon le nom du dossier sans la date', () => {
    expect(titreParDefaut({ nom: '2026-10-23-essai', titre: 'Mon essai' })).toBe('Mon essai');
    expect(titreParDefaut({ nom: '2026-10-23-essai', titre: '2026-10-23-essai' })).toBe('essai');
  });
  it('nomme chaque étape', () => {
    expect(Object.values(LIBELLES_ETAPE)).toEqual(['Préparation de la vidéo', 'Transcription', 'Repérage des coupes', 'Suggestions de Claude']);
  });
  it('déduit ce que la liste montre', () => {
    expect(etatTournage(TOURNAGE)).toBe('video-manquante');
    expect(etatTournage({ ...TOURNAGE, videoPresente: true })).toBe('a-analyser');
    expect(etatTournage({ ...TOURNAGE, videoPresente: true, statut: 'erreur' })).toBe('erreur');
    expect(etatTournage({ ...TOURNAGE, videoPresente: true, statut: 'erreur', analyseEnCours: true })).toBe('en-cours');
    // Un rendu en échec garde le tournage ouvrable, comme aujourd'hui.
    expect(etatTournage({ ...TOURNAGE, analyseFaite: true, statut: 'erreur' })).toBe('analyse');
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npx vitest run studio/src/logique/nouveau-tournage.test.ts`
Expected : FAIL (module introuvable).

- [ ] **Step 3 : implémenter**

`studio/src/logique/nouveau-tournage.ts` :

```ts
import { EXTENSIONS_VIDEO, type EtapeAnalyse, type ResumeTournage } from '../../commun';

export const LIBELLES_ETAPE: Record<EtapeAnalyse, string> = {
  preparation: 'Préparation de la vidéo',
  transcription: 'Transcription',
  detections: 'Repérage des coupes',
  suggestions: 'Suggestions de Claude',
};

const LISTE_EXTENSIONS = `${EXTENSIONS_VIDEO.slice(0, -1).join(', ')} ou ${EXTENSIONS_VIDEO[EXTENSIONS_VIDEO.length - 1]}`;

// Message de refus, ou null pour une vidéo que le pipeline sait lire.
export function raisonFichierVideo(nom: string): string | null {
  const point = nom.lastIndexOf('.');
  const extension = point >= 0 ? nom.slice(point).toLowerCase() : '';
  return EXTENSIONS_VIDEO.includes(extension) ? null : `« ${nom} » n’est pas une vidéo ${LISTE_EXTENSIONS}.`;
}

// Date du jour en heure locale, au format AAAA-MM-JJ.
export function aujourdhui(d: Date = new Date()): string {
  const deux = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;
}

// Titre proposé pour « Analyser » : celui d'episode.json, sinon le nom du dossier sans la date.
export const titreParDefaut = (t: Pick<ResumeTournage, 'nom' | 'titre'>) =>
  t.titre !== t.nom ? t.titre : t.nom.replace(/^\d{4}-\d{2}-\d{2}-/, '');

export type EtatTournage = 'en-cours' | 'analyse' | 'erreur' | 'a-analyser' | 'video-manquante';

// Ce que la liste montre d'un tournage. Un tournage analysé garde le comportement actuel, même après un rendu en échec.
export function etatTournage(t: ResumeTournage): EtatTournage {
  if (t.analyseEnCours) return 'en-cours';
  if (t.analyseFaite) return 'analyse';
  if (t.statut === 'erreur') return 'erreur';
  return t.videoPresente ? 'a-analyser' : 'video-manquante';
}
```

`studio/src/api.ts`, dans l'objet `api`, après `tournage` :

```ts
  creerTournage: (titre: string, date: string) => appeler<{ nom: string }>('/api/tournages', enJson('POST', { titre, date })),
  // XMLHttpRequest plutôt que fetch : lui seul donne la progression de l'envoi.
  deposerVideo: (nom: string, fichier: File, onProgression: (part: number) => void) => new Promise<void>((resoudre, rejeter) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `${chemin(nom)}/video?fichier=${encodeURIComponent(fichier.name)}`);
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgression(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resoudre();
        return;
      }
      let erreur = `Erreur ${xhr.status}`;
      try {
        erreur = (JSON.parse(xhr.responseText) as { erreur?: string }).erreur ?? erreur;
      } catch {
        // corps non JSON : le statut suffit
      }
      rejeter(new ErreurApi(xhr.status, erreur, []));
    };
    xhr.onerror = () => rejeter(new ErreurApi(0, 'Envoi de la vidéo interrompu : le studio est-il toujours ouvert ?', []));
    xhr.send(fichier);
  }),
  analyser: async (nom: string, titre: string) => {
    await appeler<{ ok: true }>(`${chemin(nom)}/analyse`, enJson('POST', { titre }));
  },
```

- [ ] **Step 4 : vérifier**

Run : `npx vitest run studio/src/logique/nouveau-tournage.test.ts` puis `npm run typecheck`
Expected : PASS.

- [ ] **Step 5 : commit**

```bash
git add studio/src/logique/nouveau-tournage.ts studio/src/logique/nouveau-tournage.test.ts studio/src/api.ts
git commit -m "Studio : logique et appels du nouveau tournage côté interface"
```

---

### Task 7 : interface — encadré « Nouveau tournage » et liste suivie

**Files:**
- Create: `studio/src/composants/NouveauTournage.tsx`
- Modify: `studio/src/composants/ListeTournages.tsx`
- Modify: `studio/src/styles.css`

**Interfaces:**
- Consumes : tout ce que produit la tâche 6 ; `Attente` (`studio/src/composants/Attente.tsx`).
- Produces : `NouveauTournage: FC<{ onFermer: () => void; onChangement: () => void }>`.

L'encadré retient le tournage créé et la vidéo déjà envoyée : après un échec, « Créer et analyser » reprend à l'étape qui a échoué au lieu de créer un second dossier.

- [ ] **Step 1 : écrire `studio/src/composants/NouveauTournage.tsx`**

```tsx
import { type FC, useRef, useState } from 'react';
import { EXTENSIONS_VIDEO } from '../../commun';
import { api } from '../api';
import { aujourdhui, raisonFichierVideo } from '../logique/nouveau-tournage';
import { Attente } from './Attente';

// Encadré « Nouveau tournage » : crée le dossier, envoie la vidéo dans bruts/ puis lance l'analyse.
export const NouveauTournage: FC<{ onFermer: () => void; onChangement: () => void }> = ({ onFermer, onChangement }) => {
  const [video, setVideo] = useState<File | null>(null);
  const [titre, setTitre] = useState('');
  const [date, setDate] = useState(() => aujourdhui());
  const [depot, setDepot] = useState(false);
  const [progression, setProgression] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  // Étapes déjà faites, gardées pour reprendre après un échec.
  const [cree, setCree] = useState<{ nom: string; videoEnvoyee: boolean } | null>(null);
  const choix = useRef<HTMLInputElement>(null);
  const enCours = progression !== null;

  function choisir(fichiers: File[]) {
    const f = fichiers[0];
    if (!f || enCours) return;
    const raison = raisonFichierVideo(f.name);
    setErreur(raison);
    setVideo(raison ? null : f);
  }

  async function creer() {
    if (!video) return;
    setErreur(null);
    setProgression(0);
    try {
      let etat = cree;
      if (!etat) {
        etat = { nom: (await api.creerTournage(titre.trim(), date)).nom, videoEnvoyee: false };
        setCree(etat);
      }
      if (!etat.videoEnvoyee) {
        await api.deposerVideo(etat.nom, video, setProgression);
        etat = { ...etat, videoEnvoyee: true };
        setCree(etat);
      }
      await api.analyser(etat.nom, titre.trim());
      onChangement();
      onFermer();
    } catch (e) {
      setErreur((e as Error).message);
      setProgression(null);
      onChangement();
    }
  }

  return (
    <div className="encadre">
      <h2>Nouveau tournage</h2>
      <div
        className={depot ? 'depot actif' : 'depot'}
        onDragOver={e => { e.preventDefault(); setDepot(true); }}
        onDragLeave={() => setDepot(false)}
        onDrop={e => { e.preventDefault(); setDepot(false); choisir([...e.dataTransfer.files]); }}
      >
        {video ? <strong>{video.name}</strong> : 'Glissez ici la vidéo exportée de Clipchamp'}
        {' '}
        <button onClick={() => choix.current?.click()} disabled={enCours || cree?.videoEnvoyee}>Choisir un fichier</button>
        <input
          ref={choix}
          type="file"
          accept={EXTENSIONS_VIDEO.join(',')}
          hidden
          onChange={e => { choisir([...(e.target.files ?? [])]); e.target.value = ''; }}
        />
      </div>
      <div className="champs">
        <label>
          Titre <input value={titre} onChange={e => setTitre(e.target.value)} disabled={enCours} size={50} />
        </label>
        <label>
          Date <input type="date" value={date} onChange={e => setDate(e.target.value)} disabled={enCours || cree !== null} />
        </label>
      </div>
      {progression !== null && progression < 1 && (
        <p><progress value={progression} max={1} /> Envoi de la vidéo : {Math.round(progression * 100)} %</p>
      )}
      {progression === 1 && <p><Attente libelle="Lancement de l’analyse…" /></p>}
      {erreur && <p className="alerte">{erreur}</p>}
      <div className="actions">
        <button className="principal" onClick={() => void creer()} disabled={!video || !titre.trim() || !date || enCours}>
          Créer et analyser
        </button>
        <button onClick={onFermer} disabled={enCours}>Fermer</button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2 : réécrire `studio/src/composants/ListeTournages.tsx`**

```tsx
import { type FC, useCallback, useEffect, useState } from 'react';
import type { StatutEpisode } from '../../../noyau/types';
import type { ResumeTournage } from '../../commun';
import { api } from '../api';
import { etatTournage, LIBELLES_ETAPE, titreParDefaut } from '../logique/nouveau-tournage';
import { Attente } from './Attente';
import { NouveauTournage } from './NouveauTournage';

export const LIBELLES_STATUT: Record<StatutEpisode, string> = {
  analyse: 'Analysé',
  'en-validation': 'En validation',
  valide: 'Validé',
  rendu: 'Rendu',
  erreur: 'Erreur',
};

const RAFRAICHISSEMENT_MS = 3000;

export const ListeTournages: FC = () => {
  const [tournages, setTournages] = useState<ResumeTournage[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [nouveau, setNouveau] = useState(false);
  // Titre saisi pour « Analyser », par tournage.
  const [titres, setTitres] = useState<Record<string, string>>({});
  const [lancement, setLancement] = useState(false);

  const charger = useCallback(() => {
    api.tournages().then(setTournages, (e: Error) => setErreur(e.message));
  }, []);
  useEffect(charger, [charger]);

  const analyseEnCours = tournages?.some(t => t.analyseEnCours) ?? false;
  useEffect(() => {
    if (!analyseEnCours) return;
    const minuterie = setInterval(charger, RAFRAICHISSEMENT_MS);
    return () => clearInterval(minuterie);
  }, [analyseEnCours, charger]);

  async function analyser(nom: string, titre: string) {
    setErreur(null);
    setLancement(true);
    try {
      await api.analyser(nom, titre);
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setLancement(false);
      charger();
    }
  }

  const bloque = analyseEnCours || lancement;

  return (
    <div className="page">
      <h1>Tournages</h1>
      <div className="actions">
        <button className="principal" onClick={() => setNouveau(true)} disabled={nouveau}>Nouveau tournage</button>
      </div>
      {nouveau && <NouveauTournage onFermer={() => setNouveau(false)} onChangement={charger} />}
      {erreur && <p className="alerte">{erreur}</p>}
      {tournages?.length === 0 && <p>Aucun tournage dans donnees/tournages/.</p>}
      {tournages && tournages.length > 0 && (
        <table className="liste">
          <thead>
            <tr><th>Tournage</th><th>Statut</th><th>Message</th></tr>
          </thead>
          <tbody>
            {tournages.map(t => {
              const etat = etatTournage(t);
              const titre = titres[t.nom] ?? titreParDefaut(t);
              return (
                <tr key={t.nom}>
                  <td>
                    {t.analyseFaite ? <a href={`#/${encodeURIComponent(t.nom)}`}>{t.titre}</a> : t.titre}
                    <div className="discret">{t.nom}</div>
                  </td>
                  <td>
                    {etat === 'en-cours' && <Attente libelle={LIBELLES_ETAPE[t.etapeAnalyse]} />}
                    {(etat === 'analyse' || etat === 'erreur') && t.statut && (
                      <span className={`statut statut-${t.statut}`}>{LIBELLES_STATUT[t.statut]}</span>
                    )}
                    {etat === 'analyse' && !t.statut && <span className="discret">Non analysé</span>}
                    {etat === 'a-analyser' && <span className="discret">Non analysé</span>}
                    {etat === 'video-manquante' && <span className="discret">Vidéo manquante</span>}
                  </td>
                  <td className="discret">
                    {etat !== 'en-cours' && (t.message ?? '')}
                    {etat === 'erreur' && (
                      <div className="actions">
                        <button onClick={() => void analyser(t.nom, titreParDefaut(t))} disabled={bloque}>Relancer l’analyse</button>
                      </div>
                    )}
                    {etat === 'a-analyser' && (
                      <div className="actions">
                        <input
                          value={titre}
                          onChange={e => setTitres({ ...titres, [t.nom]: e.target.value })}
                          aria-label={`Titre de ${t.nom}`}
                          size={30}
                        />
                        <button onClick={() => void analyser(t.nom, titre.trim())} disabled={bloque || !titre.trim()}>Analyser</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};
```

- [ ] **Step 3 : styles**

Ajouter à la fin de `studio/src/styles.css` :

```css
.encadre { background: white; border: 1px solid var(--bleu-gris); border-radius: 6px; padding: 12px 16px; margin: 12px 0; }
.encadre h2 { margin-top: 0; color: var(--bleu); font-size: 18px; }
.champs { display: flex; gap: 16px; flex-wrap: wrap; margin: 8px 0; }
.champs input { font: inherit; }
```

- [ ] **Step 4 : vérifier**

Run : `npm test` puis `npm run typecheck`
Expected : tous les tests passent, aucune erreur de type.

Puis dans le navigateur (studio lancé par `npm run validation`, page `http://127.0.0.1:5180`) :
1. « Nouveau tournage » ouvre l'encadré ; « Créer et analyser » reste désactivé sans vidéo ni titre.
2. Glisser un `.txt` : message « « x.txt » n’est pas une vidéo .mp4, .mkv, .mov ou .webm. », rien n'est envoyé (aucun nouveau dossier dans `donnees/tournages/`).
3. Glisser une vidéo courte, saisir un titre, « Créer et analyser » : barre de progression, puis l'encadré se ferme et la ligne du tournage montre le sablier avec l'étape, qui change sans recharger la page.
4. Pendant l'analyse, les boutons « Analyser » / « Relancer l'analyse » des autres lignes sont désactivés.

- [ ] **Step 5 : commit**

```bash
git add studio/src/composants/NouveauTournage.tsx studio/src/composants/ListeTournages.tsx studio/src/styles.css
git commit -m "Studio : nouveau tournage depuis la liste, analyse suivie par étape"
```

---

### Task 8 : documentation et essai réel

**Files:**
- Modify: `docs/studio.md` (section « Lancer »)

- [ ] **Step 1 : réécrire la section « Lancer » de `docs/studio.md`**

Remplacer les deux points numérotés de la section par :

```markdown
1. Une fois : `powershell -ExecutionPolicy Bypass -File outils\installer-raccourci.ps1` crée sur le bureau le raccourci « Métiers & Transition ».
2. Double-clic sur le raccourci : le studio démarre dans une fenêtre réduite « Studio M&T — ne pas fermer » et s'ouvre dans le navigateur par défaut (http://127.0.0.1:5180) ; s'il tourne déjà, seule la page s'ouvre. Fermer cette fenêtre arrête le studio et l'analyse en cours. Sans le raccourci : `npm run validation` à la racine du projet. Ouvrir le studio dans Chrome ou Edge : le navigateur intégré de VS Code ne décode pas le son AAC de `source.mp4`, l’aperçu n’y fait entendre que le jingle et le tapis.
3. **Nouveau tournage** (page Tournages) : glisser la vidéo exportée de Clipchamp (`.mp4`, `.mkv`, `.mov` ou `.webm`), saisir le titre, « Créer et analyser ». Le studio crée `donnees/tournages/<date>-<titre>/bruts/`, y copie la vidéo et lance l'analyse ; la liste en montre l'étape (préparation, transcription, repérage des coupes, suggestions de Claude). Une seule analyse à la fois. Une analyse interrompue (studio fermé) reprend à « Analyser » sans refaire les étapes finies ; une analyse en échec affiche son message et « Relancer l'analyse ».

L'icône `outils/metiers-transition.ico` se régénère par `.venv\Scripts\python outils\generer-icone.py`. L'analyse reste possible en ligne de commande : `cd pipeline; ..\.venv\Scripts\python -m mtpipeline.cli analyser ..\donnees\tournages\<dossier> --titre "<titre>"`.
```

- [ ] **Step 2 : vérification complète**

Run : `npm test` puis `npm run typecheck`
Expected : tout passe.

- [ ] **Step 3 : commit**

```bash
git add docs/studio.md
git commit -m "Documentation : lanceur du bureau et nouveau tournage depuis le studio"
```

- [ ] **Step 4 : essai réel (avec l'auteur)**

1. `powershell -ExecutionPolicy Bypass -File outils\installer-raccourci.ps1` : le raccourci « Métiers & Transition » apparaît sur le bureau avec l'icône.
2. Studio arrêté, double-clic : fenêtre réduite « Studio M&T — ne pas fermer », puis le studio s'ouvre dans le navigateur.
3. Studio lancé, double-clic : seul un onglet s'ouvre.
4. Nouveau tournage avec une vidéo Clipchamp courte : progression de l'envoi, étapes successives dans la liste, puis « Analysé » et titre cliquable ouvrant l'écran de montage.
5. Fermer la fenêtre réduite pendant une analyse, relancer par le raccourci : la ligne montre « Analyser » avec le titre prérempli ; l'analyse reprend sans refaire les étapes finies.
```
