# Plan 16 — Mail de com : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** depuis la carte de publication d'une vidéo Pro rendue, copier la vidéo sur SharePoint, faire rédiger par Claude le mail de com (`mail.md`), le construire en HTML compatible Outlook avec les scripts du skill, puis créer le brouillon Outlook.

**Architecture :** les scripts et la charte du skill sont recopiés dans `outils/mailing/`. La logique pure (URL SharePoint, nom du fichier copié, état) va dans `noyau/mail.ts`. Le serveur ajoute les routes `publication/mail/*` dans `creerApiPublication`, en déléguant à `studio/serveur/mail.ts`. Les effets (copie, Python, PowerShell, Claude) passent par la configuration, comme le reste de la publication, pour être simulés dans les tests. Le studio ajoute `PanneauMail.tsx` sur la carte.

**Tech Stack :** TypeScript, Node (http), React, Vitest, SDK Anthropic ; Python `.venv` (Pillow, pymupdf) ; PowerShell + COM Outlook/Word.

Spec : [docs/superpowers/specs/2026-10-30-mail-de-com-design.md](../specs/2026-10-30-mail-de-com-design.md).

## Contraintes globales

- Panneau visible seulement pour une vidéo `nature: 'pro'` dont le rendu existe ; le serveur refuse aussi (409) sinon.
- Fichier copié : `<nom du tournage>-<fichier rendu>` (ex. `2026-10-27-analyztech-en-mode-projet-video-complete.mp4`).
- URL : `<site>/_layouts/15/stream.aspx?id=` + chemin `/sites/vitrin3/<bibliotheque>/<fichier>` encodé par `encodeURIComponent` puis `-` → `%2D`, `.` → `%2E`.
- Bibliothèque SharePoint : `Chane vido interne` ; dossier local : `C:\Users\pmaubert\INGEROP\Vitrin3 - Chaîne vidéo interne`.
- Dossier du mail : `<tournage>/publication/<complete|episode-NN>/mail/` (`mail.md`, `notes.txt`, `assets/`, `build/`, `etat.json`, `journal.txt`).
- Le studio n'envoie jamais le mail. Une info manquante s'écrit `[À COMPLÉTER]`.
- Écart à la spec, assumé : l'état du mail est dans `mail/etat.json`, pas dans `publication.json` (pas de migration ni de validation de `publication.json` à toucher). La spec est corrigée en Task 7.
- Textes du studio en français, vouvoiement, comme le reste de l'interface.

---

### Task 1 : outils du skill, réglages, dépendance Python

**Files :**
- Create : `outils/mailing/` (copie du zip : `scripts/`, `assets/`, `references/`, `examples/`, sans `evals/` ni `SKILL.md`)
- Modify : `reglages.json`, `noyau/types.ts` (type `Reglages`), `noyau/reglages.test.ts`, `pipeline/requirements.txt`

**Interfaces :**
- Produces : `Reglages['sharepoint']: { dossierLocal: string; site: string; bibliotheque: string }`

- [ ] **Step 1 : test qui échoue** — ajouter dans `noyau/reglages.test.ts`, à la fin du `it` :

```ts
    expect(r.sharepoint).toEqual({
      dossierLocal: 'C:\\Users\\pmaubert\\INGEROP\\Vitrin3 - Chaîne vidéo interne',
      site: 'https://ingeropgroup.sharepoint.com/sites/vitrin3',
      bibliotheque: 'Chane vido interne',
    });
```

- [ ] **Step 2 :** `npx vitest run noyau/reglages.test.ts` → FAIL (`sharepoint` absent / erreur de type).

- [ ] **Step 3 : implémentation**
  - `noyau/types.ts`, dans `Reglages` après `publication` :
    ```ts
      // Dossier OneDrive synchronisé avec la bibliothèque SharePoint des vidéos internes (mail de com).
      sharepoint: { dossierLocal: string; site: string; bibliotheque: string };
    ```
  - `reglages.json`, après le bloc `"publication"` : le bloc `"sharepoint"` des valeurs du test.
  - `pipeline/requirements.txt` : ajouter `pymupdf>=1.24` (rendu Outlook de `screenshot.py`).
  - Copier le skill :
    ```powershell
    $z = "$env:TEMP\mailing-skill"; Expand-Archive sources/mailing-pole-metiers-transition.zip $z -Force
    New-Item -ItemType Directory -Force outils/mailing | Out-Null
    foreach ($d in 'scripts','assets','references','examples') { Copy-Item -Recurse "$z/mailing-pole-metiers-transition/$d" outils/mailing/ }
    .venv\Scripts\python -m pip install "pymupdf>=1.24"
    ```

- [ ] **Step 4 :** `npx vitest run noyau/reglages.test.ts` → PASS ; `npx tsc --noEmit -p .` → aucune erreur.

- [ ] **Step 5 : essai du build tel quel**
  ```powershell
  .venv\Scripts\python outils/mailing/scripts/build_mail.py init $env:TEMP\essai-mail
  .venv\Scripts\python outils/mailing/scripts/build_mail.py build $env:TEMP\essai-mail
  ```
  Attendu : `build/mail.html`, `preview.html`, `manifest.json` créés, sans erreur.

- [ ] **Step 6 : commit** — `git add outils/mailing reglages.json noyau/types.ts noyau/reglages.test.ts pipeline/requirements.txt` ; message « Mail de com : outils du skill et réglages SharePoint ».

---

### Task 2 : logique pure du mail (`noyau/mail.ts`)

**Files :**
- Create : `noyau/mail.ts`, `noyau/mail.test.ts`

**Interfaces :**
- Consumes : `CiblePublication`, `nomCible` de `noyau/publication.ts` ; `Reglages['sharepoint']`.
- Produces :
  ```ts
  export interface EtatMail { urlSharepoint: string | null; copieLe: string | null; redigeLe: string | null; construitLe: string | null; brouillonLe: string | null }
  export const ETAT_MAIL_VIDE: EtatMail;
  export const A_COMPLETER = '[À COMPLÉTER]';
  export function dossierMail(c: CiblePublication): string;           // 'publication/complete/mail'
  export function fichierSharepoint(nomTournage: string, fichierRendu: string): string;
  export function urlSharepoint(s: Reglages['sharepoint'], fichier: string): string;
  export function raisonMail(nature: Nature, rendue: boolean): string | null;
  export function brouillonPossible(e: EtatMail, modifieLe: number | null): boolean; // modifieLe = mtime de mail.md en ms
  ```

- [ ] **Step 1 : tests qui échouent** — `noyau/mail.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { brouillonPossible, dossierMail, ETAT_MAIL_VIDE, fichierSharepoint, raisonMail, urlSharepoint } from './mail';

const SP = { dossierLocal: 'C:\\x', site: 'https://ingeropgroup.sharepoint.com/sites/vitrin3', bibliotheque: 'Chane vido interne' };

describe('mail de com', () => {
  it('nomme le dossier du mail par vidéo', () => {
    expect(dossierMail('complete')).toBe('publication/complete/mail');
    expect(dossierMail(2)).toBe('publication/episode-02/mail');
  });
  it('préfixe le fichier copié par le nom du tournage', () => {
    expect(fichierSharepoint('2026-10-27-analyztech-en-mode-projet', 'video-complete.mp4'))
      .toBe('2026-10-27-analyztech-en-mode-projet-video-complete.mp4');
  });
  it('calcule l’URL Stream comme celle copiée dans SharePoint', () => {
    expect(urlSharepoint(SP, '2026-10-27-analyztech-en-mode-projet-video-complete.mp4')).toBe(
      'https://ingeropgroup.sharepoint.com/sites/vitrin3/_layouts/15/stream.aspx?id='
      + '%2Fsites%2Fvitrin3%2FChane%20vido%20interne%2F2026%2D10%2D27%2Danalyztech%2Den%2Dmode%2Dprojet%2Dvideo%2Dcomplete%2Emp4',
    );
  });
  it('n’ouvre le mail qu’aux vidéos Pro rendues', () => {
    expect(raisonMail('pro', true)).toBeNull();
    expect(raisonMail('perso', true)).toContain('Pro');
    expect(raisonMail('pro', false)).toContain('rendu');
  });
  it('n’autorise le brouillon qu’après un build plus récent que mail.md', () => {
    const construit = { ...ETAT_MAIL_VIDE, construitLe: '2026-10-30T10:00:00.000Z' };
    expect(brouillonPossible(ETAT_MAIL_VIDE, 0)).toBe(false);
    expect(brouillonPossible(construit, Date.parse('2026-10-30T09:59:00Z'))).toBe(true);
    expect(brouillonPossible(construit, Date.parse('2026-10-30T10:01:00Z'))).toBe(false);
    expect(brouillonPossible(construit, null)).toBe(false);
  });
});
```

- [ ] **Step 2 :** `npx vitest run noyau/mail.test.ts` → FAIL (module absent).

- [ ] **Step 3 : implémentation** — `noyau/mail.ts` :

```ts
import { nomCible, type CiblePublication } from './publication';
import type { Nature } from './qualification';
import type { Reglages } from './types';

// Suivi du mail de com d'une vidéo, dans publication/<cible>/mail/etat.json.
export interface EtatMail {
  urlSharepoint: string | null;
  copieLe: string | null;
  redigeLe: string | null;
  construitLe: string | null;
  brouillonLe: string | null;
}

export const ETAT_MAIL_VIDE: EtatMail = { urlSharepoint: null, copieLe: null, redigeLe: null, construitLe: null, brouillonLe: null };

export const A_COMPLETER = '[À COMPLÉTER]';

export const dossierMail = (c: CiblePublication) => `publication/${nomCible(c)}/mail`;

export const fichierSharepoint = (nomTournage: string, fichierRendu: string) => `${nomTournage}-${fichierRendu}`;

// Adresse de lecture Stream, de la forme copiée dans la barre d'adresse : chemin entièrement encodé, « - » et « . » compris.
export function urlSharepoint(s: Reglages['sharepoint'], fichier: string): string {
  const cheminSite = new URL(s.site).pathname.replace(/\/$/, '');
  const id = encodeURIComponent(`${cheminSite}/${s.bibliotheque}/${fichier}`).replace(/-/g, '%2D').replace(/\./g, '%2E');
  return `${s.site.replace(/\/$/, '')}/_layouts/15/stream.aspx?id=${id}`;
}

export function raisonMail(nature: Nature, rendue: boolean): string | null {
  if (nature !== 'pro') return 'Le mail de com est réservé aux vidéos Pro.';
  if (!rendue) return 'Le rendu de la vidéo est absent.';
  return null;
}

export function brouillonPossible(e: EtatMail, modifieLe: number | null): boolean {
  return e.construitLe !== null && modifieLe !== null && modifieLe <= Date.parse(e.construitLe);
}
```

- [ ] **Step 4 :** `npx vitest run noyau/mail.test.ts` → PASS.
- [ ] **Step 5 : commit** — « Mail de com : URL SharePoint et état du mail ».

---

### Task 3 : rédaction du mail par Claude (`studio/serveur/mail-claude.ts`)

**Files :**
- Create : `studio/serveur/mail-claude.ts`, `studio/serveur/mail-claude.test.ts`

**Interfaces :**
- Consumes : `verifierCleClaude`, `traduireErreurClaude` (`./claude`), `ErreurInterpretation` (`./consignes`), `A_COMPLETER`.
- Produces :
  ```ts
  export interface DemandeMail {
    titreVideo: string; description: string; texte: string; chapitres: string[];
    notes: string; images: string[]; vignette: string | null; urlVideo: string;
    logosBandeau: string[]; charte: string; syntaxe: string; exemple: string; modele: string;
  }
  export type RedigerMail = (d: DemandeMail) => Promise<string>;   // contenu de mail.md
  export function construirePromptMail(d: DemandeMail): string;
  export function extraireMail(reponse: string): string;
  export async function redigerMail(d: DemandeMail, client?: Anthropic): Promise<string>;
  ```

- [ ] **Step 1 : tests qui échouent** — `studio/serveur/mail-claude.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { construirePromptMail, extraireMail, type DemandeMail } from './mail-claude';

const D: DemandeMail = {
  titreVideo: 'AnalyzTech en mode projet', description: 'Desc publiée', texte: 'Bonjour, aujourd’hui on ouvre AnalyzTech.',
  chapitres: ['Intro', 'Le tableau'], notes: 'Inviter à tester avant le 15/11', images: ['capture.png'], vignette: 'vignette.jpg',
  urlVideo: 'https://sp/stream.aspx?id=x', logosBandeau: ['analyztech', 'there'],
  charte: 'CHARTE', syntaxe: 'SYNTAXE', exemple: 'EXEMPLE', modele: 'claude-opus-5-5',
};

describe('prompt du mail de com', () => {
  it('donne la transcription, les notes, la charte, la syntaxe et l’exemple', () => {
    const p = construirePromptMail(D);
    for (const t of [D.texte, D.notes, 'CHARTE', 'SYNTAXE', 'EXEMPLE', 'capture.png', '- Intro']) expect(p).toContain(t);
  });
  it('impose le bloc vidéo vers SharePoint avec la vignette', () => {
    expect(construirePromptMail(D)).toContain('[[video: AnalyzTech en mode projet | https://sp/stream.aspx?id=x | vignette.jpg]]');
    expect(construirePromptMail({ ...D, vignette: null })).toContain('[[video: AnalyzTech en mode projet | https://sp/stream.aspx?id=x]]');
  });
  it('demande [À COMPLÉTER] plutôt qu’une info inventée et limite les logos du bandeau', () => {
    const p = construirePromptMail(D);
    expect(p).toContain('[À COMPLÉTER]');
    expect(p).toContain('analyztech, there');
  });
  it('retire une éventuelle clôture de code autour de mail.md', () => {
    expect(extraireMail('```markdown\n---\nobjet: X\n---\nCorps\n```')).toBe('---\nobjet: X\n---\nCorps\n');
    expect(extraireMail('---\nobjet: X\n---\nCorps')).toBe('---\nobjet: X\n---\nCorps\n');
  });
});
```

- [ ] **Step 2 :** `npx vitest run studio/serveur/mail-claude.test.ts` → FAIL.

- [ ] **Step 3 : implémentation** — `studio/serveur/mail-claude.ts` :

```ts
import Anthropic from '@anthropic-ai/sdk';
import { A_COMPLETER } from '../../noyau/mail';
import { traduireErreurClaude, verifierCleClaude } from './claude';
import { ErreurInterpretation } from './consignes';

// Ce qu'il faut à Claude pour écrire le mail de com d'une vidéo Pro, au format mail.md du skill de mailing.
export interface DemandeMail {
  titreVideo: string;
  description: string;
  // Paroles conservées dans la vidéo montée.
  texte: string;
  chapitres: string[];
  notes: string;
  // Images déposées dans assets/ du mail, et vignette rendue copiée à côté (null si absente).
  images: string[];
  vignette: string | null;
  urlVideo: string;
  logosBandeau: string[];
  // references/redaction.md, references/syntaxe.md et examples/exemple-fico-there.md du skill.
  charte: string;
  syntaxe: string;
  exemple: string;
  modele: string;
}

export type RedigerMail = (d: DemandeMail) => Promise<string>;

export function construirePromptMail(d: DemandeMail): string {
  const video = d.vignette ? `[[video: ${d.titreVideo} | ${d.urlVideo} | ${d.vignette}]]` : `[[video: ${d.titreVideo} | ${d.urlVideo}]]`;
  const chapitres = d.chapitres.length > 0 ? `\nChapitres :\n${d.chapitres.map(c => `- ${c}`).join('\n')}\n` : '';
  const images = d.images.length > 0 ? d.images.join(', ') : 'aucune';
  return `Tu rédiges, pour le Pôle Métiers & Transition (cellule QIU), le mail de com interne qui annonce une vidéo aux collaborateurs CICAD. Le mail s'écrit dans le format mail.md décrit plus bas ; l'auteur le relira avant envoi.

Vidéo : ${d.titreVideo}
Description publiée : ${d.description || '(aucune)'}
${chapitres}
<transcription>
${d.texte}
</transcription>

<notes_de_l_auteur>
${d.notes || '(aucune)'}
</notes_de_l_auteur>

Images disponibles (à citer par leur nom seul) : ${images}
Logos produit possibles pour bandeau_logo : ${d.logosBandeau.join(', ') || 'aucun'} (n'en mets pas d'autre).

Règles :
- Le mail renvoie vers la vidéo par ce bloc, à reprendre tel quel : ${video}
- N'invente ni date, ni lien, ni nom : si une info utile manque, écris ${A_COMPLETER} à sa place.
- Suis la charte et la syntaxe ci-dessous ; l'exemple montre un mail validé.

<charte>
${d.charte}
</charte>

<syntaxe>
${d.syntaxe}
</syntaxe>

<exemple>
${d.exemple}
</exemple>

Réponds uniquement par le contenu complet de mail.md, en-tête compris, sans commentaire.
`;
}

// Le contenu de mail.md, sans la clôture de code que Claude ajoute parfois ; une seule fin de ligne finale.
export function extraireMail(reponse: string): string {
  const cloture = /^\s*```[a-z]*\n([\s\S]*?)\n```\s*$/.exec(reponse);
  return `${(cloture ? cloture[1]! : reponse).trim()}\n`;
}

export async function redigerMail(d: DemandeMail, client?: Anthropic): Promise<string> {
  verifierCleClaude(client);
  let reponse;
  try {
    reponse = await (client ?? new Anthropic()).messages.create(
      {
        model: d.modele,
        max_tokens: 8000,
        output_config: { effort: 'medium' },
        messages: [{ role: 'user', content: construirePromptMail(d) }],
        fallbacks: 'default',
      },
      { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } },
    );
  } catch (e) {
    throw traduireErreurClaude(e);
  }
  if (reponse.stop_reason === 'refusal') throw new ErreurInterpretation(500, 'Claude a refusé de rédiger ce mail.');
  const texte = reponse.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('');
  if (!texte.includes('objet:')) throw new ErreurInterpretation(500, `Réponse de Claude inexploitable (arrêt : ${reponse.stop_reason}).`);
  return extraireMail(texte);
}
```

Si `tsc` refuse `output_config` ou `fallbacks` sur `messages.create`, les passer comme dans `redaction.ts` (même version du SDK) ; ne pas les retirer.

- [ ] **Step 4 :** `npx vitest run studio/serveur/mail-claude.test.ts` → PASS ; `npx tsc --noEmit -p .` → OK.
- [ ] **Step 5 : commit** — « Mail de com : rédaction par Claude ».

---

### Task 4 : outils système (`studio/serveur/mail-outils.ts`)

**Files :**
- Create : `studio/serveur/mail-outils.ts`, `studio/serveur/mail-outils.test.ts`

**Interfaces :**
- Produces :
  ```ts
  export const DOSSIER_MAILING: string;                                   // <RACINE>/outils/mailing
  export async function copierSiDifferent(source: string, cible: string): Promise<boolean>; // true si copié
  export function construireMail(dossierMail: string): Promise<string>;   // build_mail.py build + screenshot.py ; renvoie la sortie
  export function creerBrouillon(dossierBuild: string): Promise<string>;  // outlook_draft.ps1 ; renvoie la sortie
  ```

- [ ] **Step 1 : test qui échoue** — `studio/serveur/mail-outils.test.ts` :

```ts
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { copierSiDifferent } from './mail-outils';

describe('copie vers SharePoint', () => {
  it('copie, puis ne recopie pas un fichier de même taille', async () => {
    const d = await mkdtemp(path.join(os.tmpdir(), 'pmt-mail-'));
    const source = path.join(d, 'a.mp4');
    const cible = path.join(d, 'sp', 'b.mp4');
    await writeFile(source, 'video');
    expect(await copierSiDifferent(source, cible)).toBe(true);
    expect(await readFile(cible, 'utf-8')).toBe('video');
    expect(await copierSiDifferent(source, cible)).toBe(false);
    await writeFile(source, 'video plus longue');
    expect(await copierSiDifferent(source, cible)).toBe(true);
  });
});
```

- [ ] **Step 2 :** `npx vitest run studio/serveur/mail-outils.test.ts` → FAIL.

- [ ] **Step 3 : implémentation** — `studio/serveur/mail-outils.ts` :

```ts
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { RACINE } from '../../remotion/scripts/tournage';

// Scripts et charte du skill de mailing du Pôle, recopiés dans le projet.
export const DOSSIER_MAILING = path.join(RACINE, 'outils', 'mailing');

// Copie dans le dossier OneDrive, sauf si un fichier de même taille y est déjà (vidéo déjà envoyée).
export async function copierSiDifferent(source: string, cible: string): Promise<boolean> {
  if (existsSync(cible) && (await stat(cible)).size === (await stat(source)).size) return false;
  await mkdir(path.dirname(cible), { recursive: true });
  await copyFile(source, cible);
  return true;
}

// Lance un programme ; résout sa sortie standard, l'erreur reprend sa sortie d'erreur.
function executer(programme: string, args: string[]): Promise<string> {
  return new Promise((resoudre, rejeter) => {
    const processus = spawn(programme, args, { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    let sortie = '';
    let erreurs = '';
    processus.stdout.on('data', (d: Buffer) => { sortie += d.toString('utf-8'); });
    processus.stderr.on('data', (d: Buffer) => { erreurs += d.toString('utf-8'); });
    processus.on('error', rejeter);
    processus.on('close', code => (code === 0 ? resoudre(sortie) : rejeter(new Error(erreurs.trim() || sortie.trim() || `code de sortie ${code}`))));
  });
}

const python = path.join(RACINE, '.venv', 'Scripts', 'python.exe');
const script = (nom: string) => path.join(DOSSIER_MAILING, 'scripts', nom);

export async function construireMail(dossierMail: string): Promise<string> {
  const build = await executer(python, [script('build_mail.py'), 'build', dossierMail]);
  const captures = await executer(python, [script('screenshot.py'), dossierMail]);
  return `${build}${captures}`;
}

export const creerBrouillon = (dossierBuild: string) =>
  executer('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script('outlook_draft.ps1'), '-BuildDir', dossierBuild]);
```

- [ ] **Step 4 :** `npx vitest run studio/serveur/mail-outils.test.ts` → PASS.
- [ ] **Step 5 : commit** — « Mail de com : copie SharePoint et lancement des scripts ».

---

### Task 5 : routes du serveur

**Files :**
- Create : `studio/serveur/mail.ts`, `studio/serveur/mail.test.ts`
- Modify : `studio/serveur/publication.ts` (config, regex de route, aiguillage), `studio/serveur/principal.ts`, `studio/serveur/publication.test.ts` (config de test : ajouter `mail`), `studio/commun.ts`

**Interfaces :**
- Consumes : Task 2 (`noyau/mail.ts`), Task 3 (`RedigerMail`, `DemandeMail`), Task 4.
- Produces :
  - `studio/commun.ts` :
    ```ts
    export interface DetailMail {
      etat: EtatMail;
      texte: string;          // mail.md, '' si absent
      notes: string;
      images: string[];       // fichiers de assets/ hors vignette.jpg
      apercus: string[];      // build/apercu-*.png, triés
      urlBuild: string;       // URL servie du dossier build/ (preview.html, apercus)
      aCompleter: boolean;    // mail.md contient [À COMPLÉTER]
      brouillonPossible: boolean;
    }
    ```
  - `ConfigPublication.mail: OutilsMail` avec
    ```ts
    export interface OutilsMail {
      sharepoint: Reglages['sharepoint'];
      copier: (source: string, cible: string) => Promise<boolean>;
      rediger: RedigerMail;
      construire: (dossierMail: string) => Promise<string>;
      brouillon: (dossierBuild: string) => Promise<string>;
      lireReference: (relatif: string) => Promise<string>;   // fichier de outils/mailing/
      logosBandeau: () => Promise<string[]>;                // noms (sans .png) de outils/mailing/assets/logos
    }
    ```
  - Routes (toutes avec `{ cible }` dans le corps ou `?cible=` en GET) :
    - `GET  /api/tournages/:nom/publication/mail?cible=complete` → `DetailMail`
    - `POST .../publication/mail/copie` → `DetailMail`
    - `PUT  .../publication/mail` `{ cible, texte?, notes? }` → `DetailMail` (enregistre mail.md et/ou notes.txt)
    - `POST .../publication/mail/images?cible=…&fichier=…` (octets) → `DetailMail`
    - `POST .../publication/mail/redaction` → `DetailMail`
    - `POST .../publication/mail/construire` → `DetailMail`
    - `POST .../publication/mail/brouillon` → `DetailMail`

- [ ] **Step 1 : tests qui échouent** — `studio/serveur/mail.test.ts`. Reprendre l'en-tête de `publication.test.ts` (même `MONTAGE`, `RENDU`, fonction `tournage`, même `config` dans `beforeEach`, copiés tels quels) et compléter `config` par :

```ts
    mail: {
      sharepoint: { dossierLocal: path.join(racine, 'sharepoint'), site: 'https://sp.example/sites/vitrin3', bibliotheque: 'Bib' },
      copier: vi.fn(async () => true),
      rediger: vi.fn(async () => '---\nobjet: Essai\n---\n## Titre\n\n[À COMPLÉTER]\n'),
      construire: vi.fn(async (dossier: string) => {
        await mkdir(path.join(dossier, 'build'), { recursive: true });
        await writeFile(path.join(dossier, 'build', 'apercu-bureau.png'), 'png');
        return 'ok';
      }),
      brouillon: vi.fn(async () => 'Brouillon Outlook cree'),
      lireReference: vi.fn(async (r: string) => `contenu de ${r}`),
      logosBandeau: vi.fn(async () => ['there']),
    },
```

Puis :

```ts
const qualifier = async (nom: string, nature: 'pro' | 'perso') => {
  const p = await lirePublication(nom);
  await envoyer(nom, { ...p, videos: p.videos.map(v => ({ ...v, nature })) });
};
const mail = (nom: string, quoi: string, corps: unknown) => action(nom, `mail/${quoi}`, corps);
const detailMail = async (nom: string) => (await fetch(`${url}/api/tournages/${nom}/publication/mail?cible=complete`)).json();

describe('mail de com', () => {
  it('est refusé pour une vidéo Perso', async () => {
    await tournage('a');
    await qualifier('a', 'perso');
    const r = await mail('a', 'copie', { cible: 'complete' });
    expect(r.status).toBe(409);
    expect((await r.json()).erreur).toContain('Pro');
  });
  it('copie la vidéo sous le nom du tournage et enregistre l’URL', async () => {
    await tournage('a');
    await qualifier('a', 'pro');
    await mkdir(path.join(racine, 'sharepoint'));
    const d = await (await mail('a', 'copie', { cible: 'complete' })).json();
    expect(config.mail.copier).toHaveBeenCalledWith(
      path.join(racine, 'tournages', 'a', 'rendus', 'video-complete.mp4'), path.join(racine, 'sharepoint', 'a-video-complete.mp4'),
    );
    expect(d.etat.urlSharepoint).toContain('/_layouts/15/stream.aspx?id=%2Fsites%2Fvitrin3%2FBib%2Fa%2Dvideo%2Dcomplete%2Emp4');
    expect(d.etat.copieLe).not.toBeNull();
  });
  it('signale un dossier OneDrive absent', async () => {
    await tournage('a');
    await qualifier('a', 'pro');
    const r = await mail('a', 'copie', { cible: 'complete' });
    expect(r.status).toBe(409);
    expect((await r.json()).erreur).toContain('OneDrive');
  });
  it('refuse la rédaction avant la copie, puis écrit mail.md avec la vignette et les notes', async () => {
    await tournage('a');
    await qualifier('a', 'pro');
    expect((await mail('a', 'redaction', { cible: 'complete' })).status).toBe(409);
    await mkdir(path.join(racine, 'sharepoint'));
    await mail('a', 'copie', { cible: 'complete' });
    await fetch(`${url}/api/tournages/a/publication/mail`, { method: 'PUT', headers: json, body: JSON.stringify({ cible: 'complete', notes: 'Tester avant le 15' }) });
    const d = await (await mail('a', 'redaction', { cible: 'complete' })).json();
    const demande = vi.mocked(config.mail.rediger).mock.calls[0]![0];
    expect(demande.notes).toBe('Tester avant le 15');
    expect(demande.texte.length).toBeGreaterThan(0);
    expect(demande.urlVideo).toBe(d.etat.urlSharepoint);
    expect(demande.charte).toBe('contenu de references/redaction.md');
    expect(d.texte).toContain('objet: Essai');
    expect(d.aCompleter).toBe(true);
  });
  it('construit puis autorise le brouillon, que toute modification de mail.md rebloque', async () => {
    await tournage('a');
    await qualifier('a', 'pro');
    const corps = { cible: 'complete', texte: '---\nobjet: X\n---\nCorps\n' };
    await fetch(`${url}/api/tournages/a/publication/mail`, { method: 'PUT', headers: json, body: JSON.stringify(corps) });
    expect((await mail('a', 'brouillon', { cible: 'complete' })).status).toBe(409);
    const d = await (await mail('a', 'construire', { cible: 'complete' })).json();
    expect(d.apercus).toEqual(['apercu-bureau.png']);
    expect(d.brouillonPossible).toBe(true);
    const b = await (await mail('a', 'brouillon', { cible: 'complete' })).json();
    expect(b.etat.brouillonLe).not.toBeNull();
    await new Promise(r => setTimeout(r, 20));
    await fetch(`${url}/api/tournages/a/publication/mail`, { method: 'PUT', headers: json, body: JSON.stringify({ ...corps, texte: 'autre' }) });
    expect((await detailMail('a')).brouillonPossible).toBe(false);
  });
  it('rapporte l’échec du build et le journalise', async () => {
    await tournage('a');
    await qualifier('a', 'pro');
    vi.mocked(config.mail.construire).mockRejectedValueOnce(new Error('PIL absent'));
    const r = await mail('a', 'construire', { cible: 'complete' });
    expect(r.status).toBe(500);
    expect((await r.json()).erreur).toContain('PIL absent');
    expect(await readFile(path.join(racine, 'tournages', 'a', 'publication', 'complete', 'mail', 'journal.txt'), 'utf-8')).toContain('PIL absent');
  });
});
```

- [ ] **Step 2 :** `npx vitest run studio/serveur/mail.test.ts` → FAIL (`mail` absent de la config / routes 404).

- [ ] **Step 3 : implémentation `studio/serveur/mail.ts`**

```ts
import { existsSync } from 'node:fs';
import { appendFile, copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import path from 'node:path';
import {
  A_COMPLETER, brouillonPossible, dossierMail, ETAT_MAIL_VIDE, fichierSharepoint, raisonMail, urlSharepoint, type EtatMail,
} from '../../noyau/mail';
import { fichierVignette, type CiblePublication, type VideoPubliee } from '../../noyau/publication';
import type { Reglages } from '../../noyau/types';
import type { DetailMail, VideoDisponible } from '../commun';
import { ErreurInterpretation } from './consignes';
import { ecrireJson, ErreurHttp, message } from './http';
import type { RedigerMail } from './mail-claude';

export interface OutilsMail {
  sharepoint: Reglages['sharepoint'];
  copier: (source: string, cible: string) => Promise<boolean>;
  rediger: RedigerMail;
  construire: (dossierMail: string) => Promise<string>;
  brouillon: (dossierBuild: string) => Promise<string>;
  lireReference: (relatif: string) => Promise<string>;
  logosBandeau: () => Promise<string[]>;
}

// Ce que le serveur de publication sait de la vidéo visée.
export interface VideoMail {
  dossierTournage: string;
  urlTournage: string;
  cible: CiblePublication;
  video: VideoPubliee;
  disponible: VideoDisponible;
  // Paroles conservées et titres d'épisodes (vidéo complète), calculés par le serveur de publication.
  texte: string;
  chapitres: string[];
  modele: string;
}

const VIGNETTE = 'vignette.jpg';
const IMAGES = new Set(['.png', '.jpg', '.jpeg', '.gif']);

export function creerMail(o: OutilsMail) {
  const enCours = new Set<string>();
  const dossier = (v: VideoMail) => path.join(v.dossierTournage, ...dossierMail(v.cible).split('/'));
  const lire = async (f: string) => (existsSync(f) ? readFile(f, 'utf-8') : '');

  async function etat(v: VideoMail): Promise<EtatMail> {
    const texte = await lire(path.join(dossier(v), 'etat.json'));
    return texte ? { ...ETAT_MAIL_VIDE, ...(JSON.parse(texte) as Partial<EtatMail>) } : ETAT_MAIL_VIDE;
  }
  const noter = async (v: VideoMail, changement: Partial<EtatMail>) => {
    await mkdir(dossier(v), { recursive: true });
    await ecrireJson(path.join(dossier(v), 'etat.json'), { ...(await etat(v)), ...changement });
  };
  const journaliser = async (v: VideoMail, texte: string) => {
    await mkdir(dossier(v), { recursive: true });
    await appendFile(path.join(dossier(v), 'journal.txt'), `${new Date().toISOString()} ${texte.trim()}\n`, 'utf-8');
  };

  function verifier(v: VideoMail): void {
    const raison = raisonMail(v.video.nature, v.disponible.rendue);
    if (raison) throw new ErreurHttp(409, raison);
  }

  // Une action longue à la fois par vidéo ; l'échec est journalisé puis rendu au studio.
  async function exclusif(v: VideoMail, etape: string, action: () => Promise<void>): Promise<void> {
    const cle = `${v.dossierTournage}|${v.cible}`;
    if (enCours.has(cle)) throw new ErreurHttp(409, 'Une action est déjà en cours sur ce mail.');
    enCours.add(cle);
    try {
      await action();
    } catch (e) {
      if (e instanceof ErreurHttp) throw e;
      await journaliser(v, `${etape} : ${message(e)}`);
      if (e instanceof ErreurInterpretation) throw new ErreurHttp(e.statut, e.message);
      throw new ErreurHttp(500, `${etape} impossible : ${message(e)}`);
    } finally {
      enCours.delete(cle);
    }
  }

  async function detail(v: VideoMail): Promise<DetailMail> {
    const d = dossier(v);
    const texte = await lire(path.join(d, 'mail.md'));
    const fichiers = async (sous: string) => (existsSync(path.join(d, sous)) ? (await readdir(path.join(d, sous))).sort() : []);
    const e = await etat(v);
    const md = path.join(d, 'mail.md');
    return {
      etat: e,
      texte,
      notes: await lire(path.join(d, 'notes.txt')),
      images: (await fichiers('assets')).filter(f => f !== VIGNETTE && IMAGES.has(path.extname(f).toLowerCase())),
      apercus: (await fichiers('build')).filter(f => /^apercu-.*\.png$/.test(f)),
      urlBuild: `${v.urlTournage}/${dossierMail(v.cible)}/build`,
      aCompleter: texte.includes(A_COMPLETER),
      brouillonPossible: brouillonPossible(e, existsSync(md) ? (await stat(md)).mtimeMs : null),
    };
  }

  async function copier(v: VideoMail): Promise<DetailMail> {
    verifier(v);
    if (!existsSync(o.sharepoint.dossierLocal)) {
      throw new ErreurHttp(409, `Dossier OneDrive introuvable : ${o.sharepoint.dossierLocal}. Vérifiez la synchronisation de Vitrin3.`);
    }
    const fichier = fichierSharepoint(path.basename(v.dossierTournage), v.disponible.fichier);
    await exclusif(v, 'Copie sur SharePoint', async () => {
      await o.copier(path.join(v.dossierTournage, 'rendus', v.disponible.fichier), path.join(o.sharepoint.dossierLocal, fichier));
      await noter(v, { urlSharepoint: urlSharepoint(o.sharepoint, fichier), copieLe: new Date().toISOString() });
    });
    return detail(v);
  }

  async function enregistrer(v: VideoMail, corps: Record<string, unknown>): Promise<DetailMail> {
    verifier(v);
    await mkdir(dossier(v), { recursive: true });
    if (typeof corps.texte === 'string') await writeFile(path.join(dossier(v), 'mail.md'), corps.texte, 'utf-8');
    if (typeof corps.notes === 'string') await writeFile(path.join(dossier(v), 'notes.txt'), corps.notes, 'utf-8');
    return detail(v);
  }

  async function deposerImage(v: VideoMail, fichier: string, octets: Buffer): Promise<DetailMail> {
    verifier(v);
    const nom = path.basename(fichier).replace(/\s+/g, '-');
    if (!IMAGES.has(path.extname(nom).toLowerCase()) || nom === VIGNETTE) throw new ErreurHttp(400, 'Image attendue : PNG, JPEG ou GIF.');
    await mkdir(path.join(dossier(v), 'assets'), { recursive: true });
    await writeFile(path.join(dossier(v), 'assets', nom), octets);
    return detail(v);
  }

  async function rediger(v: VideoMail): Promise<DetailMail> {
    verifier(v);
    const e = await etat(v);
    if (!e.urlSharepoint) throw new ErreurHttp(409, 'Copiez d’abord la vidéo sur SharePoint : le mail a besoin de son adresse.');
    await exclusif(v, 'Rédaction', async () => {
      const assets = path.join(dossier(v), 'assets');
      await mkdir(assets, { recursive: true });
      const source = path.join(v.dossierTournage, fichierVignette(v.cible));
      const vignette = existsSync(source) ? (await copyFile(source, path.join(assets, VIGNETTE)), VIGNETTE) : null;
      const d = await detail(v);
      const texte = await o.rediger({
        titreVideo: v.video.titre || v.disponible.titre,
        description: v.video.description,
        texte: v.texte,
        chapitres: v.chapitres,
        notes: d.notes,
        images: d.images,
        vignette,
        urlVideo: e.urlSharepoint!,
        logosBandeau: await o.logosBandeau(),
        charte: await o.lireReference('references/redaction.md'),
        syntaxe: await o.lireReference('references/syntaxe.md'),
        exemple: await o.lireReference('examples/exemple-fico-there.md'),
        modele: v.modele,
      });
      await writeFile(path.join(dossier(v), 'mail.md'), texte, 'utf-8');
      await noter(v, { redigeLe: new Date().toISOString() });
    });
    return detail(v);
  }

  async function construire(v: VideoMail): Promise<DetailMail> {
    verifier(v);
    if (!existsSync(path.join(dossier(v), 'mail.md'))) throw new ErreurHttp(409, 'Rien à construire : mail.md est vide.');
    await exclusif(v, 'Construction', async () => {
      const debut = new Date().toISOString();
      await journaliser(v, await o.construire(dossier(v)));
      await noter(v, { construitLe: debut });
    });
    return detail(v);
  }

  async function brouillon(v: VideoMail): Promise<DetailMail> {
    verifier(v);
    if (!(await detail(v)).brouillonPossible) throw new ErreurHttp(409, 'Construisez d’abord le mail : le texte a changé depuis le dernier aperçu.');
    await exclusif(v, 'Brouillon Outlook', async () => {
      await journaliser(v, await o.brouillon(path.join(dossier(v), 'build')));
      await noter(v, { brouillonLe: new Date().toISOString() });
    });
    return detail(v);
  }

  return { detail, copier, enregistrer, deposerImage, rediger, construire, brouillon };
}
```

Note : `construitLe` prend l'heure du **début** du build, pour qu'une modification de `mail.md` pendant le build rebloque le brouillon.

- [ ] **Step 4 : brancher dans `studio/serveur/publication.ts`**
  - `import { creerMail, type OutilsMail, type VideoMail } from './mail';` ; `import { chapitresYoutube, ... texteConserve }` déjà là.
  - `ConfigPublication` : ajouter `mail: OutilsMail;` (commentaire : « Mail de com : copie SharePoint, rédaction, scripts du skill de mailing. »).
  - Dans `creerApiPublication`, après `urlTournage` : `const mail = creerMail(c.mail);` et :
    ```ts
    // La vidéo visée par une route du mail, avec ses paroles conservées.
    function videoMail(ctx: Contexte, cible: CiblePublication): VideoMail {
      return {
        dossierTournage: ctx.dossier,
        urlTournage: urlTournage(ctx.dossier),
        cible,
        video: videoDe(ctx.publication, cible),
        disponible: ctx.videos.find(v => v.cible === cible)!,
        texte: texteConserve(ctx.tournage.analyse.mots, ctx.segments(cible)),
        chapitres: cible === 'complete' ? ctx.videos.filter(v => v.cible !== 'complete').map(v => v.titre) : [],
        modele: ctx.tournage.reglages.modeles.claude,
      };
    }
    ```
  - Regex de route : ajouter `mail(?:\/(?:copie|images|redaction|construire|brouillon))?` dans le groupe des actions :
    `(redaction|vignette\/consigne|vignette|captures|valider|relais|site\/retirer|youtube\/(?:preparer|ouvrir|envoi|verifier)|mail(?:\/(?:copie|images|redaction|construire|brouillon))?)`
  - Aiguillage, avant le `else repondre(res, 404 …)` :
    ```ts
      else if (action?.startsWith('mail')) {
        const parametres = new URL(req.url ?? '/', 'http://local').searchParams;
        if (req.method === 'GET' && action === 'mail') {
          repondre(res, 200, await mail.detail(videoMail(ctx, lireCible({ cible: lireCibleTexte(parametres.get('cible')) }, ctx.cibles))));
        } else if (req.method === 'POST' && action === 'mail/images') {
          const v = videoMail(ctx, lireCible({ cible: lireCibleTexte(parametres.get('cible')) }, ctx.cibles));
          repondre(res, 200, await mail.deposerImage(v, parametres.get('fichier') ?? '', await lireOctets(req)));
        } else {
          const corps = objet(await lireCorps(req));
          const v = videoMail(ctx, lireCible(corps, ctx.cibles));
          if (req.method === 'PUT' && action === 'mail') repondre(res, 200, await mail.enregistrer(v, corps));
          else if (req.method === 'POST' && action === 'mail/copie') repondre(res, 200, await mail.copier(v));
          else if (req.method === 'POST' && action === 'mail/redaction') repondre(res, 200, await mail.rediger(v));
          else if (req.method === 'POST' && action === 'mail/construire') repondre(res, 200, await mail.construire(v));
          else if (req.method === 'POST' && action === 'mail/brouillon') repondre(res, 200, await mail.brouillon(v));
          else repondre(res, 404, { erreur: 'Route inconnue.' });
        }
      }
    ```
    avec, au niveau du module : `const lireCibleTexte = (t: string | null): unknown => (t === null ? null : t === 'complete' ? t : Number(t));`
  - `studio/commun.ts` : ajouter `DetailMail` (Interfaces ci-dessus), avec `import type { EtatMail } from '../noyau/mail';`.
  - `studio/serveur/publication.test.ts` : ajouter à `config` le même bloc `mail` qu'en Step 1 (les tests existants n'y touchent pas).
  - `studio/serveur/principal.ts` :
    ```ts
    import { readdir, readFile } from 'node:fs/promises';
    import reglages from '../../reglages.json';   // si l'import JSON n'est pas déjà utilisé côté serveur, lire le fichier comme chargerTournage
    import { redigerMail } from './mail-claude';
    import { construireMail, copierSiDifferent, creerBrouillon, DOSSIER_MAILING } from './mail-outils';
    ...
        mail: {
          sharepoint: reglages.sharepoint,
          copier: copierSiDifferent,
          rediger: d => redigerMail(d),
          construire: construireMail,
          brouillon: creerBrouillon,
          lireReference: r => readFile(path.join(DOSSIER_MAILING, r), 'utf-8'),
          logosBandeau: async () => (await readdir(path.join(DOSSIER_MAILING, 'assets', 'logos'))).filter(f => f.endsWith('.png')).map(f => f.slice(0, -4)),
        },
    ```
    Les fichiers du mail sont déjà servis : `urlFichiers` sert tout le dossier du tournage, donc `build/preview.html` et ses images.

- [ ] **Step 5 :** `npx vitest run studio/serveur` → PASS (anciens et nouveaux) ; `npx tsc --noEmit -p .` → OK.
- [ ] **Step 6 : commit** — « Mail de com : routes du serveur ».

---

### Task 6 : panneau du studio

**Files :**
- Create : `studio/src/composants/PanneauMail.tsx`
- Modify : `studio/src/api.ts`, `studio/src/composants/CartePublication.tsx`, `studio/src/styles.css`

**Interfaces :**
- Consumes : routes et `DetailMail` de la Task 5 ; `raisonMail` (Task 2) ; `Attente`.

- [ ] **Step 1 : client API** — dans `studio/src/api.ts`, importer `DetailMail` et ajouter à `api` :

```ts
  mail: (nom: string, cible: CiblePublication) => appeler<DetailMail>(`${chemin(nom)}/publication/mail?cible=${cible}`),
  enregistrerMail: (nom: string, cible: CiblePublication, champs: { texte?: string; notes?: string }) =>
    appeler<DetailMail>(`${chemin(nom)}/publication/mail`, enJson('PUT', { cible, ...champs })),
  actionMail: (nom: string, cible: CiblePublication, quoi: 'copie' | 'redaction' | 'construire' | 'brouillon') =>
    appeler<DetailMail>(`${chemin(nom)}/publication/mail/${quoi}`, enJson('POST', { cible })),
  deposerImageMail: (nom: string, cible: CiblePublication, fichier: string, contenu: Blob) => appeler<DetailMail>(
    `${chemin(nom)}/publication/mail/images?cible=${cible}&fichier=${encodeURIComponent(fichier)}`,
    { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: contenu },
  ),
```

- [ ] **Step 2 : composant** — `studio/src/composants/PanneauMail.tsx` :

```tsx
import { type FC, useEffect, useState } from 'react';
import type { CiblePublication } from '../../../noyau/publication';
import type { DetailMail } from '../../commun';
import { api } from '../api';
import { Attente } from './Attente';

interface Props {
  nom: string;
  cible: CiblePublication;
}

const COPIE = 'Copie sur SharePoint…';
const REDACTION = 'Rédaction par Claude…';
const CONSTRUCTION = 'Construction et aperçus…';
const BROUILLON = 'Création du brouillon…';

// Mail de com d'une vidéo Pro : copie SharePoint, rédaction par Claude, relecture, aperçus, brouillon Outlook.
export const PanneauMail: FC<Props> = ({ nom, cible }) => {
  const [d, setD] = useState<DetailMail | null>(null);
  const [texte, setTexte] = useState('');
  const [notes, setNotes] = useState('');
  const [occupe, setOccupe] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);
  // Change à chaque build : force le rechargement des aperçus servis sous le même nom.
  const [version, setVersion] = useState(0);

  const recevoir = (n: DetailMail) => { setD(n); setTexte(n.texte); setNotes(n.notes); };
  useEffect(() => { api.mail(nom, cible).then(recevoir).catch(e => setErreur(String(e))); }, [nom, cible]);

  const lancer = async (libelle: string | null, action: () => Promise<DetailMail>) => {
    setOccupe(libelle);
    setErreur(null);
    try {
      const n = await action();
      if (libelle) recevoir(n); else setD(n);
      if (libelle === CONSTRUCTION) setVersion(Date.now());
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setOccupe(null);
    }
  };
  if (!d) return erreur ? <p className="alerte">{erreur}</p> : null;

  const e = d.etat;
  const bouton = (libelle: string, quoi: 'copie' | 'redaction' | 'construire' | 'brouillon', texteBouton: string, actif = true) => (
    <div className="actions">
      <button disabled={!!occupe || !actif} onClick={() => void lancer(libelle, () => api.actionMail(nom, cible, quoi))}>{texteBouton}</button>
      {occupe === libelle && <Attente libelle={libelle} />}
    </div>
  );
  const deposer = (fichiers: FileList | null) => {
    for (const f of Array.from(fichiers ?? [])) void lancer(null, () => api.deposerImageMail(nom, cible, f.name, f));
  };

  return (
    <section className="panneau panneau-mail">
      <h4>Mail de com</h4>
      {bouton(COPIE, 'copie', e.copieLe ? 'Recopier sur SharePoint' : 'Copier sur SharePoint')}
      {e.urlSharepoint && (
        <p className="discret">
          Adresse de la vidéo : <a href={e.urlSharepoint} target="_blank" rel="noreferrer">SharePoint</a>{' '}
          <button className="lien" onClick={() => void navigator.clipboard.writeText(e.urlSharepoint!).then(() => setCopie(true))}>
            {copie ? 'Copiée' : 'Copier'}
          </button>
        </p>
      )}
      <label>
        Notes pour Claude (ce qu’on attend du lecteur, liens, contexte)
        <textarea rows={3} value={notes} onChange={ev => setNotes(ev.target.value)}
          onBlur={() => notes !== d.notes && void lancer(null, () => api.enregistrerMail(nom, cible, { notes }))} />
      </label>
      <label>
        Images du mail {d.images.length > 0 && <span className="discret">({d.images.join(', ')})</span>}
        <input type="file" accept=".png,.jpg,.jpeg,.gif" multiple onChange={ev => deposer(ev.target.files)} />
      </label>
      {bouton(REDACTION, 'redaction', d.texte ? 'Réécrire avec Claude' : 'Rédiger avec Claude', !!e.urlSharepoint)}
      {!e.urlSharepoint && <p className="discret">La rédaction attend la copie sur SharePoint.</p>}
      {(d.texte || texte) && (
        <>
          <label>
            mail.md
            <textarea className="mail-md" rows={18} value={texte} onChange={ev => setTexte(ev.target.value)}
              onBlur={() => texte !== d.texte && void lancer(null, () => api.enregistrerMail(nom, cible, { texte }))} />
          </label>
          {d.aCompleter && <p className="alerte">Le texte contient encore [À COMPLÉTER].</p>}
          {bouton(CONSTRUCTION, 'construire', 'Construire et voir les aperçus', texte === d.texte)}
        </>
      )}
      {d.apercus.length > 0 && (
        <>
          <p><a href={`${d.urlBuild}/preview.html`} target="_blank" rel="noreferrer">Ouvrir l’aperçu dans le navigateur</a></p>
          <div className="apercus-mail">
            {d.apercus.map(a => <img key={a} src={`${d.urlBuild}/${a}?v=${version}`} alt={a} title={a} />)}
          </div>
        </>
      )}
      {bouton(BROUILLON, 'brouillon', 'Créer le brouillon Outlook', d.brouillonPossible)}
      {e.brouillonLe && <p className="discret">Brouillon créé le {new Date(e.brouillonLe).toLocaleString('fr-FR')}. Un nouveau clic en crée un autre ; l’ancien reste dans Brouillons.</p>}
      {erreur && <p className="alerte">{erreur}</p>}
    </section>
  );
};
```

- [ ] **Step 3 : carte** — dans `CartePublication.tsx`, importer `PanneauMail` et `raisonMail` (`../../../noyau/mail`), puis juste après le bloc `PanneauSite` (toujours dans `v.publier &&`) :

```tsx
          {raisonMail(v.nature, disponible.rendue) === null && <PanneauMail key={`mail-${v.cible}`} nom={nom} cible={v.cible} />}
```

- [ ] **Step 4 : styles** — `studio/src/styles.css` :

```css
.panneau-mail .mail-md { font-family: Consolas, monospace; font-size: 0.85rem; }
.apercus-mail { display: flex; gap: 0.5rem; overflow-x: auto; }
.apercus-mail img { max-height: 420px; border: 1px solid var(--bordure, #ccc); }
```

(Remplacer `--bordure` par la variable de bordure déjà utilisée dans `styles.css` si elle porte un autre nom.)

- [ ] **Step 5 :** `npx tsc --noEmit -p .` → OK ; `npx vitest run` → tout PASS.
- [ ] **Step 6 : vérification dans le studio** — `npm run validation`, ouvrir la publication d'un tournage rendu : le panneau apparaît pour une vidéo Pro, disparaît en Perso. Les boutons suivent l'ordre : rédaction grisée avant la copie, construction grisée tant que le texte n'est pas enregistré (sortie du champ), brouillon grisé avant un build.
- [ ] **Step 7 : commit** — « Mail de com : panneau du studio ».

---

### Task 7 : documentation, spec, essai réel

**Files :**
- Modify : `docs/studio.md`, `docs/superpowers/specs/2026-10-30-mail-de-com-design.md`

- [ ] **Step 1 : `docs/studio.md`** — après le paragraphe « Classements du site », ajouter :

```markdown
- **Mail de com** (vidéo Pro rendue) : annonce de la vidéo aux collaborateurs CICAD, avec la charte du Pôle Métiers & Transition (scripts et références dans `outils/mailing/`). « Copier sur SharePoint » copie le rendu dans le dossier OneDrive de `reglages.json` (`sharepoint.dossierLocal`) sous le nom `<tournage>-<fichier>.mp4` (pas de nouvelle copie si la taille est identique) et calcule l'adresse Stream de la vidéo. Les notes et les images déposées guident « Rédiger avec Claude », qui écrit `mail.md` à partir des paroles conservées, avec la vignette rendue comme image cliquable vers la vidéo ; une info manquante est laissée en `[À COMPLÉTER]`. Le texte se corrige dans le panneau ; « Construire et voir les aperçus » produit le HTML et les captures bureau, mobile et Outlook (Word). « Créer le brouillon Outlook » (Outlook classique) l'enregistre dans Brouillons et l'ouvre, sans jamais l'envoyer ; il faut un build fait depuis la dernière modification du texte. Tout est dans `publication/<complete|episode-NN>/mail/` du tournage, les erreurs des scripts dans `journal.txt`.
```

- [ ] **Step 2 : spec** — dans la section Stockage, remplacer la phrase sur `publication.json` par : « L'état (URL SharePoint, dates de copie, rédaction, construction, brouillon) est dans `mail/etat.json` ; `publication.json` n'est pas modifié. »

- [ ] **Step 3 : essai réel** (avec l'auteur) sur `2026-10-27-analyztech-en-mode-projet`, vidéo complète en Pro : copie (fichier présent dans OneDrive, URL qui ouvre la vidéo dans Stream), rédaction, build, contrôle des trois aperçus, brouillon envoyé à l'auteur seul en test et lu sur téléphone.

- [ ] **Step 4 : commit** — « Docs : mail de com ».
