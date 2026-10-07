# Plan 1 — Fondations et analyse : plan de mise en œuvre

> Mise à jour du 2026-10-07 : chaîne renommée PMT (projet personnel), logos remplacés par un logo texte.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produire, à partir des fichiers OBS d'un tournage, un fichier `analyse.json` (mots horodatés, détections de coupes, suggestions de chapitres/termes/longueurs) et le cœur logique TypeScript qui en déduit les segments conservés, les plages d'épisodes et le placement des encarts.

**Architecture:** Un package Python `mtpipeline` (dans `pipeline/`) exécute l'analyse par étapes mises en cache dans le dossier du tournage. Un module TypeScript `noyau/` (sans dépendance à Remotion ni React) contient toute la logique de temps, partagée plus tard par Remotion (plan 2) et le studio (plan 3). Les deux côtés communiquent uniquement par fichiers JSON dont le format est fixé par `noyau/types.ts` et vérifié par une fixture commune.

**Tech Stack:** Node 22 + TypeScript 5 + Vitest ; Python 3.11 (venv) + whisperX (faster-whisper large-v3 + alignement wav2vec2 français) + PyTorch CUDA + SDK `anthropic` + Pydantic + pytest ; FFmpeg/ffprobe.

Spec de référence : `docs/superpowers/specs/2026-10-06-post-production-design.md`.

## Global Constraints

- Tout le texte visible et les noms de domaine sont en français (`debut`, `fin`, `mots`, `coupes`…). Clés JSON en camelCase.
- Les temps sont en **secondes (nombre flottant)**, relatifs au fichier `source.mp4`.
- Entrée vidéo : format 16:9 d'au moins 1280×720 (mise à l'échelle en 1920×1080), piste audio obligatoire, sinon arrêt avec message explicite.
- Les fichiers bruts (`bruts/`) ne sont jamais modifiés ; `analyse.json` n'est jamais modifié par le studio.
- Seuils par défaut (dans `reglages.json`) : silence > 0,7 s raccourci à 0,3 s ; hésitation > 0,4 s coupée ; marge autour des mots 0,06 s ; fondu audio 0,015 s ; définition ≤ 160 caractères ; encart 6 s.
- Modèle Claude : `claude-opus-5-5`, effort `medium`, fallbacks serveur `"default"` (beta `server-side-fallback-2026-07-01`). Modèle Whisper : `large-v3`, langue `fr`, GPU CUDA.
- Python 3.11 obligatoire pour le venv (3.14 non supporté par PyTorch/whisperX) : `py -3.11`.
- Chaque commit se termine par la ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Structure des fichiers

```
package.json, tsconfig.json         projet TypeScript (racine)
reglages.json                       réglages partagés TS/Python
fixtures/analyse-exemple.json       fixture de contrat analyse.json (TS + Python)
noyau/
  types.ts                          types de données partagés (contrat JSON)
  segments.ts (+ .test.ts)          coupes → segments conservés
  temps.ts (+ .test.ts)             temps source ↔ temps monté
  episodes.ts (+ .test.ts)          plages d'épisodes, découpage, placement des encarts
  montage-initial.ts (+ .test.ts)   analyse → décisions de montage par défaut
pipeline/
  requirements.txt, pytest.ini
  mtpipeline/
    __init__.py
    erreurs.py                      exceptions métier
    reglages.py                     lecture de reglages.json
    preparation.py                  ffprobe, vérifications, concaténation, cadence constante
    audio.py                        extraction audio 16 kHz mono en numpy
    transcription.py                whisperX → liste de mots
    detection.py                    silences, hésitations, répétitions
    glossaire.py                    lecture de glossaire.json
    suggestions.py                  appel Claude (chapitres, termes, longueurs)
    cli.py                          orchestration par étapes avec reprise
  tests/
    conftest.py                     génération de vidéos de test via ffmpeg
    test_*.py
```

---

### Task 1 : Projet TypeScript, types partagés et réglages

**Files:**
- Create: `package.json`, `tsconfig.json`, `reglages.json`, `noyau/types.ts`, `noyau/reglages.test.ts`

**Interfaces:**
- Produces : tous les types de `noyau/types.ts` (utilisés par toutes les tâches TS) ; fichier `reglages.json` (lu par TS et Python).

- [ ] **Step 1 : Créer `package.json`**

```json
{
  "name": "chaine-pmt",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.6.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2 : Créer `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["noyau/**/*.ts"]
}
```

- [ ] **Step 3 : Installer les dépendances**

Run : `npm install`
Expected : `node_modules/` créé, aucune erreur.

- [ ] **Step 4 : Créer `reglages.json`**

```json
{
  "detection": {
    "silenceMin": 0.7,
    "hesitationMin": 0.4,
    "seuilSilenceDb": -40,
    "proportionVoiseeHesitation": 0.3,
    "repetitionMaxMots": 4
  },
  "coupe": {
    "silenceConserve": 0.3,
    "margeMots": 0.06,
    "dureeMinCoupe": 0.1,
    "dureeMinSegment": 0.05,
    "fonduAudio": 0.015
  },
  "durees": {
    "generique": 4,
    "encart": 6,
    "intertitre": 2,
    "cartonFin": 5
  },
  "charte": {
    "rouge": "#E30520",
    "bleu": "#004C99",
    "bleuGris": "#9AB2C9",
    "blanc": "#FFFFFF",
    "police": "Open Sans",
    "nomChaine": "PMT"
  },
  "modeles": {
    "whisper": "large-v3",
    "claude": "claude-opus-5-5"
  },
  "definitionMaxCaracteres": 160
}
```

- [ ] **Step 5 : Créer `noyau/types.ts`**

```ts
// Contrat de données partagé entre le pipeline Python, Remotion et le studio.
// Tous les temps sont en secondes, relatifs à source.mp4.

export interface Mot {
  id: number;
  texte: string;
  debut: number;
  fin: number;
}

export type TypeDetection = 'silence' | 'hesitation' | 'repetition';
export type TypeCoupe = TypeDetection | 'longueur' | 'manuelle';

export interface Detection {
  id: string;
  type: TypeDetection;
  debut: number;
  fin: number;
}

export interface SuggestionChapitre {
  titre: string;
  debut: number;
}

export interface SuggestionTerme {
  terme: string;
  definition: string;
  occurrences: number[];
  origine: 'glossaire' | 'ia';
}

export interface SuggestionLongueur {
  id: string;
  debut: number;
  fin: number;
  raison: string;
}

export interface Suggestions {
  chapitres: SuggestionChapitre[];
  termes: SuggestionTerme[];
  longueurs: SuggestionLongueur[];
}

export interface Analyse {
  version: 1;
  duree: number;
  fps: number;
  mots: Mot[];
  detections: Detection[];
  suggestions: Suggestions | null;
  erreurSuggestions: string | null;
}

export interface Coupe {
  id: string;
  type: TypeCoupe;
  debut: number;
  fin: number;
  active: boolean;
}

export interface Chapitre {
  titre: string;
  debut: number;
}

export type StatutTerme = 'a-valider' | 'valide' | 'ecarte';
export type PositionEncart = 'bas' | 'haut';

export interface Terme {
  terme: string;
  definition: string;
  occurrences: number[];
  statut: StatutTerme;
  position: PositionEncart;
}

export interface Montage {
  version: 1;
  titre: string;
  coupes: Coupe[];
  chapitres: Chapitre[];
  termes: Terme[];
}

export interface Segment {
  debut: number;
  fin: number;
}

export interface ReglagesCoupe {
  silenceConserve: number;
  margeMots: number;
  dureeMinCoupe: number;
  dureeMinSegment: number;
  fonduAudio: number;
}

export interface Reglages {
  detection: {
    silenceMin: number;
    hesitationMin: number;
    seuilSilenceDb: number;
    proportionVoiseeHesitation: number;
    repetitionMaxMots: number;
  };
  coupe: ReglagesCoupe;
  durees: { generique: number; encart: number; intertitre: number; cartonFin: number };
  charte: {
    rouge: string;
    bleu: string;
    bleuGris: string;
    blanc: string;
    police: string;
    nomChaine: string;
  };
  modeles: { whisper: string; claude: string };
  definitionMaxCaracteres: number;
}
```

- [ ] **Step 6 : Écrire le test de conformité des réglages**

`noyau/reglages.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import reglagesJson from '../reglages.json';
import type { Reglages } from './types';

describe('reglages.json', () => {
  it('respecte le type Reglages et les valeurs par défaut de la spec', () => {
    const r: Reglages = reglagesJson;
    expect(r.detection.silenceMin).toBe(0.7);
    expect(r.coupe.silenceConserve).toBe(0.3);
    expect(r.detection.hesitationMin).toBe(0.4);
    expect(r.durees.encart).toBe(6);
    expect(r.definitionMaxCaracteres).toBe(160);
    expect(r.modeles.claude).toBe('claude-opus-5-5');
  });
});
```

- [ ] **Step 7 : Lancer les tests et la vérification de types**

Run : `npm test` puis `npm run typecheck`
Expected : 1 test PASS ; `tsc` sans erreur.

- [ ] **Step 8 : Commit**

```bash
git add package.json package-lock.json tsconfig.json reglages.json noyau/
git commit -m "Projet TypeScript, types partagés et réglages" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2 : Calcul des segments conservés

**Files:**
- Create: `noyau/segments.ts`
- Test: `noyau/segments.test.ts`

**Interfaces:**
- Consumes : `Coupe`, `Segment`, `ReglagesCoupe` (Task 1).
- Produces :
  - `intervalleACouper(coupe: Coupe, r: ReglagesCoupe): Segment | null`
  - `calculerSegments(duree: number, coupes: Coupe[], r: ReglagesCoupe): Segment[]` — segments conservés, triés, sans chevauchement.

Règles : silence → on coupe le trou en gardant `silenceConserve` au total (moitié de chaque côté) ; hésitation → on retire `margeMots` de chaque côté ; repetition/longueur/manuelle → coupe exacte. Coupe plus courte que `dureeMinCoupe` ignorée. Coupes inactives ignorées. Coupes qui se chevauchent fusionnées. Segment conservé plus court que `dureeMinSegment` supprimé.

- [ ] **Step 1 : Écrire les tests**

```ts
import { describe, expect, it } from 'vitest';
import { calculerSegments, intervalleACouper } from './segments';
import type { Coupe, ReglagesCoupe } from './types';

const r: ReglagesCoupe = {
  silenceConserve: 0.3,
  margeMots: 0.06,
  dureeMinCoupe: 0.1,
  dureeMinSegment: 0.05,
  fonduAudio: 0.015,
};

const coupe = (p: Partial<Coupe>): Coupe => ({
  id: 'c', type: 'manuelle', debut: 0, fin: 0, active: true, ...p,
});

const arrondir = (s: { debut: number; fin: number }[]) =>
  s.map(x => ({ debut: +x.debut.toFixed(3), fin: +x.fin.toFixed(3) }));

describe('intervalleACouper', () => {
  it('garde silenceConserve au total autour d\'un silence', () => {
    expect(intervalleACouper(coupe({ type: 'silence', debut: 2, fin: 3 }), r))
      .toEqual({ debut: 2.15, fin: 2.85 });
  });
  it('retire la marge de chaque côté d\'une hésitation', () => {
    const i = intervalleACouper(coupe({ type: 'hesitation', debut: 5, fin: 5.5 }), r)!;
    expect(+i.debut.toFixed(3)).toBe(5.06);
    expect(+i.fin.toFixed(3)).toBe(5.44);
  });
  it('coupe exactement une répétition', () => {
    expect(intervalleACouper(coupe({ type: 'repetition', debut: 1, fin: 1.8 }), r))
      .toEqual({ debut: 1, fin: 1.8 });
  });
  it('ignore une coupe devenue trop courte', () => {
    expect(intervalleACouper(coupe({ type: 'silence', debut: 2, fin: 2.35 }), r)).toBeNull();
  });
});

describe('calculerSegments', () => {
  it('sans coupe, renvoie toute la durée', () => {
    expect(calculerSegments(10, [], r)).toEqual([{ debut: 0, fin: 10 }]);
  });
  it('ignore les coupes inactives', () => {
    expect(calculerSegments(10, [coupe({ debut: 2, fin: 4, active: false })], r))
      .toEqual([{ debut: 0, fin: 10 }]);
  });
  it('fusionne les coupes qui se chevauchent', () => {
    const s = calculerSegments(10, [
      coupe({ id: 'a', debut: 2, fin: 4 }),
      coupe({ id: 'b', debut: 3, fin: 5 }),
    ], r);
    expect(s).toEqual([{ debut: 0, fin: 2 }, { debut: 5, fin: 10 }]);
  });
  it('trie les coupes et borne à la durée', () => {
    const s = calculerSegments(10, [
      coupe({ id: 'b', debut: 8, fin: 12 }),
      coupe({ id: 'a', debut: 1, fin: 2 }),
    ], r);
    expect(s).toEqual([{ debut: 0, fin: 1 }, { debut: 2, fin: 8 }]);
  });
  it('supprime les segments conservés trop courts', () => {
    const s = calculerSegments(10, [
      coupe({ id: 'a', debut: 2, fin: 4 }),
      coupe({ id: 'b', debut: 4.02, fin: 6 }),
    ], r);
    expect(s).toEqual([{ debut: 0, fin: 2 }, { debut: 6, fin: 10 }]);
  });
  it('combine silence et hésitation', () => {
    const s = calculerSegments(10, [
      coupe({ id: 's', type: 'silence', debut: 2, fin: 3 }),
      coupe({ id: 'h', type: 'hesitation', debut: 6, fin: 6.6 }),
    ], r);
    expect(arrondir(s)).toEqual([
      { debut: 0, fin: 2.15 },
      { debut: 2.85, fin: 6.06 },
      { debut: 6.54, fin: 10 },
    ]);
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

Run : `npx vitest run noyau/segments.test.ts`
Expected : FAIL (module `./segments` introuvable).

- [ ] **Step 3 : Implémenter `noyau/segments.ts`**

```ts
import type { Coupe, ReglagesCoupe, Segment } from './types';

export function intervalleACouper(coupe: Coupe, r: ReglagesCoupe): Segment | null {
  let debut = coupe.debut;
  let fin = coupe.fin;
  if (coupe.type === 'silence') {
    debut += r.silenceConserve / 2;
    fin -= r.silenceConserve / 2;
  } else if (coupe.type === 'hesitation') {
    debut += r.margeMots;
    fin -= r.margeMots;
  }
  if (fin - debut < r.dureeMinCoupe) return null;
  return { debut, fin };
}

export function calculerSegments(duree: number, coupes: Coupe[], r: ReglagesCoupe): Segment[] {
  const intervalles = coupes
    .filter(c => c.active)
    .map(c => intervalleACouper(c, r))
    .filter((i): i is Segment => i !== null)
    .map(i => ({ debut: Math.max(0, i.debut), fin: Math.min(duree, i.fin) }))
    .filter(i => i.fin > i.debut)
    .sort((a, b) => a.debut - b.debut);

  const fusionnes: Segment[] = [];
  for (const i of intervalles) {
    const dernier = fusionnes[fusionnes.length - 1];
    if (dernier && i.debut <= dernier.fin) dernier.fin = Math.max(dernier.fin, i.fin);
    else fusionnes.push({ ...i });
  }

  const segments: Segment[] = [];
  let curseur = 0;
  for (const i of fusionnes) {
    if (i.debut - curseur >= r.dureeMinSegment) segments.push({ debut: curseur, fin: i.debut });
    curseur = i.fin;
  }
  if (duree - curseur >= r.dureeMinSegment) segments.push({ debut: curseur, fin: duree });
  return segments;
}
```

- [ ] **Step 4 : Vérifier que les tests passent**

Run : `npx vitest run noyau/segments.test.ts`
Expected : 10 tests PASS.

- [ ] **Step 5 : Commit**

```bash
git add noyau/segments.ts noyau/segments.test.ts
git commit -m "Calcul des segments conservés à partir des coupes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3 : Correspondance temps source ↔ temps monté

**Files:**
- Create: `noyau/temps.ts`
- Test: `noyau/temps.test.ts`

**Interfaces:**
- Consumes : `Segment` (Task 1).
- Produces :
  - `dureeMontee(segments: Segment[]): number`
  - `sourceVersMonte(t: number, segments: Segment[]): number | null` — si `t` tombe dans une coupe, renvoie le temps monté du début du segment suivant ; `null` si `t` est après le dernier segment.
  - `monteVersSource(t: number, segments: Segment[]): number | null` — inverse ; `null` si hors durée montée.

- [ ] **Step 1 : Écrire les tests**

```ts
import { describe, expect, it } from 'vitest';
import { dureeMontee, monteVersSource, sourceVersMonte } from './temps';

const segments = [
  { debut: 0, fin: 2 },
  { debut: 5, fin: 10 },
];

describe('temps', () => {
  it('calcule la durée montée', () => {
    expect(dureeMontee(segments)).toBe(7);
  });
  it('convertit un temps conservé', () => {
    expect(sourceVersMonte(1, segments)).toBe(1);
    expect(sourceVersMonte(6, segments)).toBe(3);
  });
  it('envoie un temps coupé au début du segment suivant', () => {
    expect(sourceVersMonte(3, segments)).toBe(2);
  });
  it('renvoie null après le dernier segment', () => {
    expect(sourceVersMonte(11, segments)).toBeNull();
  });
  it('convertit dans l\'autre sens', () => {
    expect(monteVersSource(1, segments)).toBe(1);
    expect(monteVersSource(3, segments)).toBe(6);
    expect(monteVersSource(8, segments)).toBeNull();
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

Run : `npx vitest run noyau/temps.test.ts`
Expected : FAIL (module `./temps` introuvable).

- [ ] **Step 3 : Implémenter `noyau/temps.ts`**

```ts
import type { Segment } from './types';

export function dureeMontee(segments: Segment[]): number {
  return segments.reduce((total, s) => total + (s.fin - s.debut), 0);
}

export function sourceVersMonte(t: number, segments: Segment[]): number | null {
  let cumul = 0;
  for (const s of segments) {
    if (t < s.debut) return cumul;
    if (t <= s.fin) return cumul + (t - s.debut);
    cumul += s.fin - s.debut;
  }
  return null;
}

export function monteVersSource(t: number, segments: Segment[]): number | null {
  let cumul = 0;
  for (const s of segments) {
    const longueur = s.fin - s.debut;
    if (t <= cumul + longueur) return s.debut + (t - cumul);
    cumul += longueur;
  }
  return null;
}
```

- [ ] **Step 4 : Vérifier que les tests passent**

Run : `npx vitest run noyau/temps.test.ts`
Expected : 5 tests PASS.

- [ ] **Step 5 : Commit**

```bash
git add noyau/temps.ts noyau/temps.test.ts
git commit -m "Correspondance entre temps source et temps monté" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4 : Plages d'épisodes et placement des encarts

**Files:**
- Create: `noyau/episodes.ts`
- Test: `noyau/episodes.test.ts`

**Interfaces:**
- Consumes : `Chapitre`, `Segment`, `Terme`, `PositionEncart` (Task 1) ; `sourceVersMonte` (Task 3).
- Produces :
  - `interface Plage { titre: string; debut: number; fin: number }`
  - `plagesEpisodes(chapitres: Chapitre[], duree: number): Plage[]` — triées ; chaque plage va du début de son chapitre au début du suivant (ou à `duree`).
  - `decouperSegments(segments: Segment[], plage: { debut: number; fin: number }): Segment[]` — intersection des segments avec la plage.
  - `interface EncartPlace { terme: string; definition: string; position: PositionEncart; debut: number }` — `debut` en temps monté, relatif aux segments passés.
  - `placerEncarts(termes: Terme[], segments: Segment[], dureeEncart: number): EncartPlace[]` — seulement les termes `valide`, à leur première occurrence conservée dans les segments ; si deux encarts se chevauchent, le suivant est décalé à la fin du précédent.

Pour un épisode : `placerEncarts(termes, decouperSegments(segments, plage), r.durees.encart)`. Pour la vidéo complète : `placerEncarts(termes, segments, r.durees.encart)` (première occurrence dans toute la vidéo).

- [ ] **Step 1 : Écrire les tests**

```ts
import { describe, expect, it } from 'vitest';
import { decouperSegments, placerEncarts, plagesEpisodes } from './episodes';
import type { Terme } from './types';

const terme = (p: Partial<Terme>): Terme => ({
  terme: 'API', definition: 'Interface de programmation.', occurrences: [],
  statut: 'valide', position: 'bas', ...p,
});

describe('plagesEpisodes', () => {
  it('découpe la durée selon les chapitres triés', () => {
    expect(plagesEpisodes([
      { titre: 'B', debut: 40 },
      { titre: 'A', debut: 0 },
    ], 100)).toEqual([
      { titre: 'A', debut: 0, fin: 40 },
      { titre: 'B', debut: 40, fin: 100 },
    ]);
  });
});

describe('decouperSegments', () => {
  it('garde l\'intersection avec la plage', () => {
    expect(decouperSegments(
      [{ debut: 0, fin: 10 }, { debut: 20, fin: 50 }, { debut: 60, fin: 70 }],
      { debut: 5, fin: 30 },
    )).toEqual([{ debut: 5, fin: 10 }, { debut: 20, fin: 30 }]);
  });
});

describe('placerEncarts', () => {
  const segments = [{ debut: 0, fin: 10 }, { debut: 20, fin: 40 }];

  it('place un terme validé à sa première occurrence conservée', () => {
    expect(placerEncarts([terme({ occurrences: [25, 30] })], segments, 6))
      .toEqual([{ terme: 'API', definition: 'Interface de programmation.', position: 'bas', debut: 15 }]);
  });
  it('ignore les occurrences coupées ou hors segments', () => {
    expect(placerEncarts([terme({ occurrences: [15, 35] })], segments, 6)[0]!.debut).toBe(25);
  });
  it('ignore les termes non validés', () => {
    expect(placerEncarts([
      terme({ statut: 'a-valider', occurrences: [1] }),
      terme({ statut: 'ecarte', occurrences: [2] }),
    ], segments, 6)).toEqual([]);
  });
  it('ignore un terme sans occurrence conservée', () => {
    expect(placerEncarts([terme({ occurrences: [15] })], segments, 6)).toEqual([]);
  });
  it('décale un encart qui chevaucherait le précédent', () => {
    const e = placerEncarts([
      terme({ terme: 'API', occurrences: [1] }),
      terme({ terme: 'SSO', occurrences: [3] }),
    ], segments, 6);
    expect(e.map(x => [x.terme, x.debut])).toEqual([['API', 1], ['SSO', 7]]);
  });
});
```

- [ ] **Step 2 : Vérifier que les tests échouent**

Run : `npx vitest run noyau/episodes.test.ts`
Expected : FAIL (module `./episodes` introuvable).

- [ ] **Step 3 : Implémenter `noyau/episodes.ts`**

```ts
import { sourceVersMonte } from './temps';
import type { Chapitre, PositionEncart, Segment, Terme } from './types';

export interface Plage {
  titre: string;
  debut: number;
  fin: number;
}

export interface EncartPlace {
  terme: string;
  definition: string;
  position: PositionEncart;
  debut: number;
}

export function plagesEpisodes(chapitres: Chapitre[], duree: number): Plage[] {
  const tries = [...chapitres].sort((a, b) => a.debut - b.debut);
  return tries.map((c, i) => ({
    titre: c.titre,
    debut: c.debut,
    fin: tries[i + 1]?.debut ?? duree,
  }));
}

export function decouperSegments(segments: Segment[], plage: { debut: number; fin: number }): Segment[] {
  return segments
    .map(s => ({ debut: Math.max(s.debut, plage.debut), fin: Math.min(s.fin, plage.fin) }))
    .filter(s => s.fin > s.debut);
}

function estConserve(t: number, segments: Segment[]): boolean {
  return segments.some(s => t >= s.debut && t <= s.fin);
}

export function placerEncarts(termes: Terme[], segments: Segment[], dureeEncart: number): EncartPlace[] {
  const places: EncartPlace[] = [];
  for (const t of termes) {
    if (t.statut !== 'valide') continue;
    const occurrence = [...t.occurrences].sort((a, b) => a - b).find(o => estConserve(o, segments));
    if (occurrence === undefined) continue;
    const debut = sourceVersMonte(occurrence, segments);
    if (debut === null) continue;
    places.push({ terme: t.terme, definition: t.definition, position: t.position, debut });
  }
  places.sort((a, b) => a.debut - b.debut);
  for (let i = 1; i < places.length; i++) {
    const precedent = places[i - 1]!;
    const courant = places[i]!;
    courant.debut = Math.max(courant.debut, precedent.debut + dureeEncart);
  }
  return places;
}
```

- [ ] **Step 4 : Vérifier que les tests passent**

Run : `npx vitest run noyau/episodes.test.ts`
Expected : 7 tests PASS.

- [ ] **Step 5 : Commit**

```bash
git add noyau/episodes.ts noyau/episodes.test.ts
git commit -m "Plages d'épisodes et placement des encarts de définition" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5 : Montage initial et fixture de contrat

**Files:**
- Create: `fixtures/analyse-exemple.json`, `noyau/montage-initial.ts`
- Test: `noyau/montage-initial.test.ts`

**Interfaces:**
- Consumes : `Analyse`, `Montage`, `Coupe`, `Terme` (Task 1).
- Produces :
  - `montageInitial(analyse: Analyse, titre: string): Montage` — détections → coupes actives ; longueurs → coupes `longueur` inactives (même `id`) ; chapitres suggérés (le premier forcé à `debut: 0`) ou un chapitre unique `{ titre, debut: 0 }` ; termes `origine: 'glossaire'` → `valide`, `origine: 'ia'` → `a-valider`, position `bas`.
  - `fixtures/analyse-exemple.json` : exemple de référence du format `analyse.json`, réutilisé par le test Python de la Task 12.

- [ ] **Step 1 : Créer `fixtures/analyse-exemple.json`**

```json
{
  "version": 1,
  "duree": 30.0,
  "fps": 30,
  "mots": [
    { "id": 0, "texte": "Bonjour", "debut": 0.8, "fin": 1.2 },
    { "id": 1, "texte": "à", "debut": 1.25, "fin": 1.35 },
    { "id": 2, "texte": "tous.", "debut": 1.4, "fin": 1.8 },
    { "id": 3, "texte": "Aujourd'hui,", "debut": 3.0, "fin": 3.6 },
    { "id": 4, "texte": "le", "debut": 3.65, "fin": 3.75 },
    { "id": 5, "texte": "SSO.", "debut": 3.8, "fin": 4.3 }
  ],
  "detections": [
    { "id": "d0", "type": "silence", "debut": 0.0, "fin": 0.8 },
    { "id": "d1", "type": "hesitation", "debut": 1.8, "fin": 3.0 }
  ],
  "suggestions": {
    "chapitres": [
      { "titre": "Introduction", "debut": 0.8 },
      { "titre": "Le SSO", "debut": 3.0 }
    ],
    "termes": [
      { "terme": "SSO", "definition": "Authentification unique : un seul identifiant pour plusieurs applications.", "occurrences": [3.8], "origine": "ia" },
      { "terme": "API", "definition": "Interface qui permet à deux logiciels d'échanger des données.", "occurrences": [], "origine": "glossaire" }
    ],
    "longueurs": [
      { "id": "l0", "debut": 10.0, "fin": 20.0, "raison": "Digression sans lien avec le sujet." }
    ]
  },
  "erreurSuggestions": null
}
```

- [ ] **Step 2 : Écrire les tests**

```ts
import { describe, expect, it } from 'vitest';
import exemple from '../fixtures/analyse-exemple.json';
import { montageInitial } from './montage-initial';
import type { Analyse } from './types';

const analyse = exemple as Analyse;

describe('montageInitial', () => {
  const m = montageInitial(analyse, 'Épisode test');

  it('active les détections et ajoute les longueurs inactives', () => {
    expect(m.coupes).toEqual([
      { id: 'd0', type: 'silence', debut: 0, fin: 0.8, active: true },
      { id: 'd1', type: 'hesitation', debut: 1.8, fin: 3, active: true },
      { id: 'l0', type: 'longueur', debut: 10, fin: 20, active: false },
    ]);
  });
  it('force le premier chapitre à 0', () => {
    expect(m.chapitres).toEqual([
      { titre: 'Introduction', debut: 0 },
      { titre: 'Le SSO', debut: 3 },
    ]);
  });
  it('valide d\'office les termes du glossaire', () => {
    expect(m.termes.map(t => [t.terme, t.statut, t.position])).toEqual([
      ['SSO', 'a-valider', 'bas'],
      ['API', 'valide', 'bas'],
    ]);
  });
  it('crée un chapitre unique sans suggestions', () => {
    const sans = montageInitial({ ...analyse, suggestions: null }, 'Titre');
    expect(sans.chapitres).toEqual([{ titre: 'Titre', debut: 0 }]);
    expect(sans.termes).toEqual([]);
    expect(sans.coupes).toHaveLength(2);
  });
});
```

- [ ] **Step 3 : Vérifier que les tests échouent**

Run : `npx vitest run noyau/montage-initial.test.ts`
Expected : FAIL (module `./montage-initial` introuvable).

- [ ] **Step 4 : Implémenter `noyau/montage-initial.ts`**

```ts
import type { Analyse, Chapitre, Coupe, Montage, Terme } from './types';

export function montageInitial(analyse: Analyse, titre: string): Montage {
  const s = analyse.suggestions;

  const coupes: Coupe[] = [
    ...analyse.detections.map(d => ({ id: d.id, type: d.type, debut: d.debut, fin: d.fin, active: true })),
    ...(s?.longueurs ?? []).map(l => ({
      id: l.id, type: 'longueur' as const, debut: l.debut, fin: l.fin, active: false,
    })),
  ];

  const chapitres: Chapitre[] = s && s.chapitres.length > 0
    ? [...s.chapitres].sort((a, b) => a.debut - b.debut).map((c, i) => ({ titre: c.titre, debut: i === 0 ? 0 : c.debut }))
    : [{ titre, debut: 0 }];

  const termes: Terme[] = (s?.termes ?? []).map(t => ({
    terme: t.terme,
    definition: t.definition,
    occurrences: t.occurrences,
    statut: t.origine === 'glossaire' ? 'valide' : 'a-valider',
    position: 'bas',
  }));

  return { version: 1, titre, coupes, chapitres, termes };
}
```

- [ ] **Step 5 : Vérifier que tous les tests TS passent**

Run : `npm test` puis `npm run typecheck`
Expected : tous les tests PASS ; `tsc` sans erreur.

- [ ] **Step 6 : Commit**

```bash
git add fixtures/ noyau/montage-initial.ts noyau/montage-initial.test.ts
git commit -m "Montage initial à partir de l'analyse et fixture de contrat" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6 : Environnement Python, réglages et erreurs

**Files:**
- Create: `pipeline/requirements.txt`, `pipeline/pytest.ini`, `pipeline/mtpipeline/__init__.py`, `pipeline/mtpipeline/erreurs.py`, `pipeline/mtpipeline/reglages.py`, `pipeline/tests/test_reglages.py`

**Interfaces:**
- Produces :
  - `class ErreurEntree(Exception)` — fichier d'entrée invalide (message en français).
  - `class ErreurSuggestions(Exception)` — échec de l'appel Claude.
  - `RACINE: Path` — racine du projet.
  - `charger_reglages(chemin: Path | None = None) -> dict` — lit `reglages.json` (racine par défaut).

- [ ] **Step 1 : Créer le venv Python 3.11**

Run (PowerShell, à la racine du projet) :
```powershell
py -3.11 -m venv .venv
.venv\Scripts\python -m pip install --upgrade pip
```
Expected : `.venv/` créé (déjà ignoré par `.gitignore`).

- [ ] **Step 2 : Installer PyTorch CUDA puis les dépendances**

`pipeline/requirements.txt` :
```
whisperx>=3.3
anthropic>=0.70
pydantic>=2.7
numpy>=1.26
pytest>=8.0
```

Run :
```powershell
.venv\Scripts\python -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu128
.venv\Scripts\python -m pip install -r pipeline\requirements.txt
.venv\Scripts\python -c "import torch, whisperx; print(torch.__version__, torch.cuda.is_available())"
```
Expected : la dernière commande affiche une version de torch et `True`.
Si elle affiche `False` : whisperX a remplacé torch par une version CPU. Réinstaller torch CUDA par-dessus avec `--force-reinstall --no-deps` en reprenant la même version que celle affichée (`pip install torch==<version> torchaudio==<version> --index-url https://download.pytorch.org/whl/cu128 --force-reinstall --no-deps`), puis relancer la vérification.

- [ ] **Step 3 : Créer `pipeline/pytest.ini`**

```ini
[pytest]
pythonpath = .
testpaths = tests
markers =
    gpu: test nécessitant le GPU et les modèles Whisper (lent)
    reseau: test appelant l'API Claude (payant)
addopts = -m "not gpu and not reseau"
```

- [ ] **Step 4 : Écrire le test**

`pipeline/tests/test_reglages.py` :
```python
from mtpipeline.reglages import RACINE, charger_reglages


def test_charge_les_reglages_par_defaut():
    r = charger_reglages()
    assert r["detection"]["silenceMin"] == 0.7
    assert r["modeles"]["whisper"] == "large-v3"


def test_racine_pointe_sur_le_projet():
    assert (RACINE / "reglages.json").exists()
```

- [ ] **Step 5 : Vérifier que le test échoue**

Run : `cd pipeline; ..\.venv\Scripts\python -m pytest tests/test_reglages.py -v`
Expected : FAIL (`ModuleNotFoundError: mtpipeline`).

- [ ] **Step 6 : Implémenter**

`pipeline/mtpipeline/__init__.py` : fichier vide.

`pipeline/mtpipeline/erreurs.py` :
```python
class ErreurEntree(Exception):
    """Fichier d'entrée invalide (format, résolution, audio)."""


class ErreurSuggestions(Exception):
    """Échec de la génération des suggestions par Claude."""
```

`pipeline/mtpipeline/reglages.py` :
```python
import json
from pathlib import Path

RACINE = Path(__file__).resolve().parents[2]


def charger_reglages(chemin: Path | None = None) -> dict:
    chemin = chemin or RACINE / "reglages.json"
    return json.loads(chemin.read_text(encoding="utf-8"))
```

- [ ] **Step 7 : Vérifier que les tests passent**

Run : `cd pipeline; ..\.venv\Scripts\python -m pytest -v`
Expected : 2 tests PASS.

- [ ] **Step 8 : Commit**

```bash
git add pipeline/
git commit -m "Environnement Python du pipeline, réglages et erreurs" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7 : Préparation de la vidéo (vérification, concaténation, cadence constante)

**Files:**
- Create: `pipeline/mtpipeline/preparation.py`, `pipeline/tests/conftest.py`
- Test: `pipeline/tests/test_preparation.py`

**Interfaces:**
- Consumes : `ErreurEntree` (Task 6).
- Produces :
  - `sonder(chemin: Path) -> dict` → `{"largeur": int, "hauteur": int, "fps": float, "fpsMoyen": float, "duree": float, "audio": bool}`
  - `verifier(info: dict, nom: str) -> None` — lève `ErreurEntree` si pas 1920×1080 ou pas d'audio.
  - `est_cadence_variable(info: dict) -> bool`
  - `preparer(bruts: list[Path], sortie: Path) -> dict` — produit `sortie` (copie si un seul fichier à cadence constante, sinon concaténation + ré-encodage à cadence constante) et renvoie `sonder(sortie)`.
  - Fixture pytest `video_test(tmp_path)` : fabrique `creer(nom, largeur=1920, hauteur=1080, duree=2, audio=True) -> Path`.

- [ ] **Step 1 : Créer `pipeline/tests/conftest.py`**

```python
import subprocess
from pathlib import Path

import pytest


@pytest.fixture
def video_test(tmp_path: Path):
    def creer(nom: str, largeur: int = 1920, hauteur: int = 1080, duree: float = 2, audio: bool = True) -> Path:
        chemin = tmp_path / nom
        cmd = ["ffmpeg", "-y", "-loglevel", "error",
               "-f", "lavfi", "-i", f"testsrc=size={largeur}x{hauteur}:rate=30:duration={duree}"]
        if audio:
            cmd += ["-f", "lavfi", "-i", f"sine=frequency=440:duration={duree}"]
        cmd += ["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p"]
        if audio:
            cmd += ["-c:a", "aac", "-shortest"]
        cmd.append(str(chemin))
        subprocess.run(cmd, check=True)
        return chemin
    return creer
```

- [ ] **Step 2 : Écrire les tests**

`pipeline/tests/test_preparation.py` :
```python
import pytest

from mtpipeline.erreurs import ErreurEntree
from mtpipeline.preparation import est_cadence_variable, preparer, sonder, verifier


def test_sonder(video_test):
    info = sonder(video_test("a.mp4"))
    assert (info["largeur"], info["hauteur"]) == (1920, 1080)
    assert info["fps"] == pytest.approx(30)
    assert info["duree"] == pytest.approx(2, abs=0.1)
    assert info["audio"] is True


def test_refuse_mauvaise_resolution(video_test):
    info = sonder(video_test("petit.mp4", largeur=1280, hauteur=720))
    with pytest.raises(ErreurEntree, match="1920x1080"):
        verifier(info, "petit.mp4")


def test_refuse_sans_audio(video_test):
    info = sonder(video_test("muet.mp4", audio=False))
    with pytest.raises(ErreurEntree, match="audio"):
        verifier(info, "muet.mp4")


def test_cadence_variable():
    assert est_cadence_variable({"fps": 30.0, "fpsMoyen": 29.2}) is True
    assert est_cadence_variable({"fps": 30.0, "fpsMoyen": 30.0}) is False


def test_preparer_un_seul_fichier(video_test, tmp_path):
    info = preparer([video_test("a.mp4")], tmp_path / "source.mp4")
    assert (tmp_path / "source.mp4").exists()
    assert info["duree"] == pytest.approx(2, abs=0.1)


def test_preparer_concatene(video_test, tmp_path):
    info = preparer([video_test("a.mp4"), video_test("b.mp4")], tmp_path / "source.mp4")
    assert info["duree"] == pytest.approx(4, abs=0.2)
    assert info["fps"] == pytest.approx(30)
```

- [ ] **Step 3 : Vérifier que les tests échouent**

Run : `cd pipeline; ..\.venv\Scripts\python -m pytest tests/test_preparation.py -v`
Expected : FAIL (`ModuleNotFoundError: mtpipeline.preparation`).

- [ ] **Step 4 : Implémenter `pipeline/mtpipeline/preparation.py`**

```python
import json
import shutil
import subprocess
import tempfile
from fractions import Fraction
from pathlib import Path

from .erreurs import ErreurEntree


def sonder(chemin: Path) -> dict:
    sortie = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(chemin)],
        check=True, capture_output=True, text=True,
    ).stdout
    donnees = json.loads(sortie)
    video = next((s for s in donnees["streams"] if s["codec_type"] == "video"), None)
    if video is None:
        raise ErreurEntree(f"{chemin.name} : aucune piste vidéo.")
    return {
        "largeur": int(video["width"]),
        "hauteur": int(video["height"]),
        "fps": float(Fraction(video["r_frame_rate"])),
        "fpsMoyen": float(Fraction(video["avg_frame_rate"])) if video["avg_frame_rate"] != "0/0" else 0.0,
        "duree": float(donnees["format"]["duration"]),
        "audio": any(s["codec_type"] == "audio" for s in donnees["streams"]),
    }


def verifier(info: dict, nom: str) -> None:
    if (info["largeur"], info["hauteur"]) != (1920, 1080):
        raise ErreurEntree(
            f"{nom} : résolution {info['largeur']}x{info['hauteur']}, 1920x1080 attendu. "
            "Vérifiez la résolution de sortie dans OBS."
        )
    if not info["audio"]:
        raise ErreurEntree(f"{nom} : aucune piste audio. Vérifiez le micro dans OBS.")


def est_cadence_variable(info: dict) -> bool:
    return abs(info["fps"] - info["fpsMoyen"]) > 0.01


def preparer(bruts: list[Path], sortie: Path) -> dict:
    if not bruts:
        raise ErreurEntree("Aucun fichier vidéo dans bruts/.")
    infos = [sonder(b) for b in bruts]
    for b, info in zip(bruts, infos):
        verifier(info, b.name)

    if len(bruts) == 1 and not est_cadence_variable(infos[0]):
        shutil.copyfile(bruts[0], sortie)
        return sonder(sortie)

    fps = round(infos[0]["fps"])
    with tempfile.TemporaryDirectory() as dossier:
        liste = Path(dossier) / "liste.txt"
        liste.write_text(
            "".join(f"file '{b.resolve().as_posix()}'\n" for b in bruts), encoding="utf-8"
        )
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(liste),
             "-vf", f"fps={fps}", "-c:v", "libx264", "-preset", "fast", "-crf", "18",
             "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", str(sortie)],
            check=True,
        )
    return sonder(sortie)
```

- [ ] **Step 5 : Vérifier que les tests passent**

Run : `cd pipeline; ..\.venv\Scripts\python -m pytest tests/test_preparation.py -v`
Expected : 6 tests PASS.

- [ ] **Step 6 : Commit**

```bash
git add pipeline/mtpipeline/preparation.py pipeline/tests/conftest.py pipeline/tests/test_preparation.py
git commit -m "Préparation de la vidéo source : vérifications, concaténation, cadence constante" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8 : Extraction audio et transcription mot à mot

**Files:**
- Create: `pipeline/mtpipeline/audio.py`, `pipeline/mtpipeline/transcription.py`
- Test: `pipeline/tests/test_audio.py`, `pipeline/tests/test_transcription.py`

**Interfaces:**
- Produces :
  - `TAUX = 16000`
  - `charger_audio(chemin: Path) -> numpy.ndarray` — float32 mono 16 kHz, valeurs dans [-1, 1].
  - `PROMPT_HESITATIONS: str`
  - `mots_depuis_segments(segments: list[dict]) -> list[dict]` — aplatit la sortie alignée de whisperX en `[{"id", "texte", "debut", "fin"}]` ; les mots sans horodatage (nombres, sigles non alignés) reçoivent `debut` = fin du mot précédent et `fin` = début du mot suivant.
  - `transcrire(chemin_audio: Path, modele: str, appareil: str = "cuda") -> list[dict]` — même format.

- [ ] **Step 1 : Écrire les tests**

`pipeline/tests/test_audio.py` :
```python
import numpy as np
import pytest

from mtpipeline.audio import TAUX, charger_audio


def test_charger_audio(video_test):
    audio = charger_audio(video_test("a.mp4", duree=2))
    assert audio.dtype == np.float32
    assert len(audio) / TAUX == pytest.approx(2, abs=0.1)
    assert 0.05 < np.abs(audio).max() <= 1.0
```

`pipeline/tests/test_transcription.py` :
```python
import pytest

from mtpipeline.transcription import mots_depuis_segments


def test_aplatit_les_segments():
    segments = [
        {"words": [{"word": "Bonjour", "start": 0.5, "end": 0.9}, {"word": "à", "start": 0.95, "end": 1.0}]},
        {"words": [{"word": "tous.", "start": 1.1, "end": 1.5}]},
    ]
    assert mots_depuis_segments(segments) == [
        {"id": 0, "texte": "Bonjour", "debut": 0.5, "fin": 0.9},
        {"id": 1, "texte": "à", "debut": 0.95, "fin": 1.0},
        {"id": 2, "texte": "tous.", "debut": 1.1, "fin": 1.5},
    ]


def test_complete_les_mots_sans_horodatage():
    segments = [{"words": [
        {"word": "version", "start": 1.0, "end": 1.4},
        {"word": "365"},
        {"word": "disponible", "start": 2.0, "end": 2.6},
    ]}]
    mots = mots_depuis_segments(segments)
    assert mots[1] == {"id": 1, "texte": "365", "debut": 1.4, "fin": 2.0}


def test_mot_sans_horodatage_en_fin():
    mots = mots_depuis_segments([{"words": [{"word": "fin", "start": 1.0, "end": 1.2}, {"word": "2026"}]}])
    assert mots[1]["debut"] == 1.2 and mots[1]["fin"] == 1.2


@pytest.mark.gpu
def test_transcription_reelle(video_test):
    from mtpipeline.transcription import transcrire
    mots = transcrire(video_test("a.mp4"), "large-v3")
    assert isinstance(mots, list)
```

- [ ] **Step 2 : Vérifier que les tests échouent**

Run : `cd pipeline; ..\.venv\Scripts\python -m pytest tests/test_audio.py tests/test_transcription.py -v`
Expected : FAIL (modules introuvables).

- [ ] **Step 3 : Implémenter `pipeline/mtpipeline/audio.py`**

```python
import subprocess
from pathlib import Path

import numpy as np

TAUX = 16000


def charger_audio(chemin: Path) -> np.ndarray:
    brut = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-i", str(chemin), "-vn", "-ac", "1", "-ar", str(TAUX),
         "-f", "s16le", "-"],
        check=True, capture_output=True,
    ).stdout
    return np.frombuffer(brut, dtype=np.int16).astype(np.float32) / 32768.0
```

- [ ] **Step 4 : Implémenter `pipeline/mtpipeline/transcription.py`**

```python
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
```

- [ ] **Step 5 : Vérifier que les tests rapides passent**

Run : `cd pipeline; ..\.venv\Scripts\python -m pytest tests/test_audio.py tests/test_transcription.py -v`
Expected : 4 PASS, 1 deselected (gpu).

- [ ] **Step 6 : Vérifier le test GPU (télécharge les modèles au premier lancement, ~3 Go)**

Run : `cd pipeline; ..\.venv\Scripts\python -m pytest tests/test_transcription.py -m gpu -v`
Expected : 1 PASS (la vidéo de test ne contient qu'un bip : la liste peut être vide, l'important est l'absence d'erreur CUDA ou d'import).

- [ ] **Step 7 : Commit**

```bash
git add pipeline/mtpipeline/audio.py pipeline/mtpipeline/transcription.py pipeline/tests/test_audio.py pipeline/tests/test_transcription.py
git commit -m "Extraction audio et transcription mot à mot avec whisperX" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9 : Détection des silences, hésitations et répétitions

**Files:**
- Create: `pipeline/mtpipeline/detection.py`
- Test: `pipeline/tests/test_detection.py`

**Interfaces:**
- Consumes : liste de mots (Task 8), `TAUX` (Task 8), `reglages["detection"]` (Task 6).
- Produces :
  - `normaliser(texte: str) -> str` — minuscules, sans ponctuation.
  - `proportion_voisee(audio, taux, debut, fin, seuil_db) -> float` — part des trames de 20 ms au-dessus du seuil.
  - `detecter_trous(mots, audio, taux, duree, cfg) -> list[dict]` — trous entre mots (et avant le premier / après le dernier) : `hesitation` si voisé et ≥ `hesitationMin`, sinon `silence` si ≥ `silenceMin`. Les trous de bord sont toujours des silences.
  - `detecter_hesitations_transcrites(mots, cfg) -> list[dict]` — mots « euh/heu/hum/hmm/euhm » d'une durée ≥ `hesitationMin`.
  - `detecter_repetitions(mots, max_mots) -> list[dict]` — séquence de n mots (1 ≤ n ≤ max_mots) immédiatement répétée ; coupe de la première occurrence ; répétitions d'un seul mot ignorées pour les mots de `REPETITIONS_LEGITIMES`.
  - `detecter(mots, audio, taux, duree, cfg) -> list[dict]` — tout, trié par `debut`, ids `d0`, `d1`…

Format d'une détection : `{"id": str, "type": "silence"|"hesitation"|"repetition", "debut": float, "fin": float}`.

- [ ] **Step 1 : Écrire les tests**

`pipeline/tests/test_detection.py` :
```python
import numpy as np

from mtpipeline.detection import (
    detecter, detecter_hesitations_transcrites, detecter_repetitions, detecter_trous,
    normaliser, proportion_voisee,
)

TAUX = 16000
CFG = {"silenceMin": 0.7, "hesitationMin": 0.4, "seuilSilenceDb": -40,
       "proportionVoiseeHesitation": 0.3, "repetitionMaxMots": 4}


def mot(i, texte, debut, fin):
    return {"id": i, "texte": texte, "debut": debut, "fin": fin}


def audio_avec_voix(duree, zones):
    """Silence partout sauf dans les zones (debut, fin) remplies d'un son à -10 dB."""
    audio = np.zeros(int(duree * TAUX), dtype=np.float32)
    for debut, fin in zones:
        t = np.arange(int(debut * TAUX), int(fin * TAUX))
        audio[t] = 0.3 * np.sin(2 * np.pi * 200 * t / TAUX)
    return audio


def test_normaliser():
    assert normaliser("Euh,") == "euh"
    assert normaliser("Aujourd'hui.") == "aujourd'hui"


def test_proportion_voisee():
    audio = audio_avec_voix(2, [(0, 1)])
    assert proportion_voisee(audio, TAUX, 0, 1, -40) > 0.9
    assert proportion_voisee(audio, TAUX, 1, 2, -40) < 0.1


def test_trou_silencieux_long_est_un_silence():
    mots = [mot(0, "a", 0.0, 1.0), mot(1, "b", 2.0, 3.0)]
    audio = audio_avec_voix(3, [(0, 1), (2, 3)])
    assert detecter_trous(mots, audio, TAUX, 3.0, CFG) == [
        {"type": "silence", "debut": 1.0, "fin": 2.0},
    ]


def test_trou_voise_est_une_hesitation():
    mots = [mot(0, "a", 0.0, 1.0), mot(1, "b", 1.6, 3.0)]
    audio = audio_avec_voix(3, [(0, 3)])
    assert detecter_trous(mots, audio, TAUX, 3.0, CFG) == [
        {"type": "hesitation", "debut": 1.0, "fin": 1.6},
    ]


def test_trou_court_ignore():
    mots = [mot(0, "a", 0.0, 1.0), mot(1, "b", 1.3, 3.0)]
    assert detecter_trous(mots, audio_avec_voix(3, [(0, 3)]), TAUX, 3.0, CFG) == []


def test_trous_de_bord_sont_des_silences():
    mots = [mot(0, "a", 1.0, 2.0)]
    audio = audio_avec_voix(4, [(0, 4)])
    assert detecter_trous(mots, audio, TAUX, 4.0, CFG) == [
        {"type": "silence", "debut": 0.0, "fin": 1.0},
        {"type": "silence", "debut": 2.0, "fin": 4.0},
    ]


def test_hesitation_transcrite_longue_seulement():
    mots = [mot(0, "Euh,", 0.0, 0.6), mot(1, "euh", 1.0, 1.2), mot(2, "bon", 1.3, 1.5)]
    assert detecter_hesitations_transcrites(mots, CFG) == [
        {"type": "hesitation", "debut": 0.0, "fin": 0.6},
    ]


def test_repetition_de_plusieurs_mots():
    mots = [mot(0, "on", 0, .2), mot(1, "va", .2, .4), mot(2, "on", .5, .7),
            mot(3, "va", .7, .9), mot(4, "voir", .9, 1.2)]
    assert detecter_repetitions(mots, 4) == [{"type": "repetition", "debut": 0, "fin": .5}]


def test_repetition_legitime_ignoree():
    mots = [mot(0, "nous", 0, .2), mot(1, "nous", .2, .4), mot(2, "sommes", .4, .8)]
    assert detecter_repetitions(mots, 4) == []


def test_begaiement_detecte():
    mots = [mot(0, "le", 0, .1), mot(1, "le", .2, .3), mot(2, "SSO", .3, .8)]
    assert detecter_repetitions(mots, 4) == [{"type": "repetition", "debut": 0, "fin": .2}]


def test_detecter_trie_et_numerote():
    mots = [mot(0, "le", 0.0, 0.1), mot(1, "le", 0.2, 0.3), mot(2, "SSO", 0.3, 1.0), mot(3, "fin", 2.0, 2.5)]
    audio = audio_avec_voix(2.5, [(0, 1), (2, 2.5)])
    d = detecter(mots, audio, TAUX, 2.5, CFG)
    assert [(x["id"], x["type"]) for x in d] == [("d0", "repetition"), ("d1", "silence")]
```

- [ ] **Step 2 : Vérifier que les tests échouent**

Run : `cd pipeline; ..\.venv\Scripts\python -m pytest tests/test_detection.py -v`
Expected : FAIL (`ModuleNotFoundError: mtpipeline.detection`).

- [ ] **Step 3 : Implémenter `pipeline/mtpipeline/detection.py`**

```python
import re

import numpy as np

HESITATIONS = {"euh", "heu", "hum", "hmm", "euhm"}
REPETITIONS_LEGITIMES = {"nous", "vous", "très", "tout", "si", "bien", "non", "oui"}
TRAME = 0.02


def normaliser(texte: str) -> str:
    return re.sub(r"[^\w']", "", texte.lower())


def proportion_voisee(audio: np.ndarray, taux: int, debut: float, fin: float, seuil_db: float) -> float:
    extrait = audio[int(debut * taux):int(fin * taux)]
    taille = int(TRAME * taux)
    nb = len(extrait) // taille
    if nb == 0:
        return 0.0
    trames = extrait[:nb * taille].reshape(nb, taille)
    rms = np.sqrt(np.mean(trames ** 2, axis=1))
    db = 20 * np.log10(np.maximum(rms, 1e-10))
    return float(np.mean(db > seuil_db))


def detecter_trous(mots: list[dict], audio: np.ndarray, taux: int, duree: float, cfg: dict) -> list[dict]:
    if not mots:
        return [{"type": "silence", "debut": 0.0, "fin": duree}] if duree >= cfg["silenceMin"] else []
    trous = [(0.0, mots[0]["debut"], True)]
    trous += [(a["fin"], b["debut"], False) for a, b in zip(mots, mots[1:])]
    trous.append((mots[-1]["fin"], duree, True))

    resultats = []
    for debut, fin, bord in trous:
        longueur = fin - debut
        if not bord and longueur >= cfg["hesitationMin"]:
            voix = proportion_voisee(audio, taux, debut, fin, cfg["seuilSilenceDb"])
            if voix >= cfg["proportionVoiseeHesitation"]:
                resultats.append({"type": "hesitation", "debut": debut, "fin": fin})
                continue
        if longueur >= cfg["silenceMin"]:
            resultats.append({"type": "silence", "debut": debut, "fin": fin})
    return resultats


def detecter_hesitations_transcrites(mots: list[dict], cfg: dict) -> list[dict]:
    return [
        {"type": "hesitation", "debut": m["debut"], "fin": m["fin"]}
        for m in mots
        if normaliser(m["texte"]) in HESITATIONS and m["fin"] - m["debut"] >= cfg["hesitationMin"]
    ]


def detecter_repetitions(mots: list[dict], max_mots: int) -> list[dict]:
    textes = [normaliser(m["texte"]) for m in mots]
    resultats = []
    i = 0
    while i < len(mots):
        trouve = 0
        for n in range(max_mots, 0, -1):
            if i + 2 * n > len(mots):
                continue
            if textes[i:i + n] == textes[i + n:i + 2 * n]:
                if n == 1 and textes[i] in REPETITIONS_LEGITIMES:
                    continue
                trouve = n
                break
        if trouve:
            resultats.append({"type": "repetition", "debut": mots[i]["debut"], "fin": mots[i + trouve]["debut"]})
            i += trouve
        else:
            i += 1
    return resultats


def detecter(mots: list[dict], audio: np.ndarray, taux: int, duree: float, cfg: dict) -> list[dict]:
    toutes = (
        detecter_trous(mots, audio, taux, duree, cfg)
        + detecter_hesitations_transcrites(mots, cfg)
        + detecter_repetitions(mots, cfg["repetitionMaxMots"])
    )
    toutes.sort(key=lambda d: d["debut"])
    return [{"id": f"d{i}", **d} for i, d in enumerate(toutes)]
```

- [ ] **Step 4 : Vérifier que les tests passent**

Run : `cd pipeline; ..\.venv\Scripts\python -m pytest tests/test_detection.py -v`
Expected : 11 tests PASS.

- [ ] **Step 5 : Commit**

```bash
git add pipeline/mtpipeline/detection.py pipeline/tests/test_detection.py
git commit -m "Détection des silences, hésitations et répétitions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10 : Glossaire et suggestions Claude

**Files:**
- Create: `pipeline/mtpipeline/glossaire.py`, `pipeline/mtpipeline/suggestions.py`
- Test: `pipeline/tests/test_glossaire.py`, `pipeline/tests/test_suggestions.py`

**Interfaces:**
- Consumes : liste de mots (Task 8), `ErreurSuggestions` (Task 6).
- Produces :
  - Format `donnees/glossaire.json` : `{"termes": [{"terme": str, "definition": str}]}`.
  - `charger_glossaire(chemin: Path) -> dict[str, dict]` — clé = terme en minuscules ; fichier absent → `{}`.
  - Modèles Pydantic `ChapitreIA`, `TermeIA`, `LongueurIA`, `ReponseIA`.
  - `texte_numerote(mots) -> str` — `"0:Bonjour 1:à 2:tous."`, retour à la ligne tous les 30 mots.
  - `construire_prompt(mots, glossaire) -> str`
  - `demander(mots, glossaire, modele, client=None) -> ReponseIA` — lève `ErreurSuggestions`.
  - `convertir(reponse: ReponseIA, mots, glossaire) -> dict` — format `Suggestions` de `noyau/types.ts` (temps en secondes ; définition du glossaire prioritaire, `origine` = `glossaire` ou `ia` ; ids de mots hors limites ignorés ; ids de longueurs `l0`, `l1`…).

- [ ] **Step 1 : Écrire les tests**

`pipeline/tests/test_glossaire.py` :
```python
import json

from mtpipeline.glossaire import charger_glossaire


def test_glossaire_absent(tmp_path):
    assert charger_glossaire(tmp_path / "glossaire.json") == {}


def test_glossaire_indexe_en_minuscules(tmp_path):
    chemin = tmp_path / "glossaire.json"
    chemin.write_text(json.dumps({"termes": [{"terme": "SSO", "definition": "Authentification unique."}]}), encoding="utf-8")
    assert charger_glossaire(chemin) == {"sso": {"terme": "SSO", "definition": "Authentification unique."}}
```

`pipeline/tests/test_suggestions.py` :
```python
from types import SimpleNamespace

import pytest

from mtpipeline.erreurs import ErreurSuggestions
from mtpipeline.suggestions import (
    ChapitreIA, LongueurIA, ReponseIA, TermeIA, construire_prompt, convertir, demander, texte_numerote,
)

MOTS = [{"id": i, "texte": t, "debut": float(i), "fin": i + 0.5}
        for i, t in enumerate(["Bonjour", "le", "SSO", "et", "les", "API", "fin"])]
GLOSSAIRE = {"api": {"terme": "API", "definition": "Interface d'échange entre logiciels."}}


def test_texte_numerote():
    assert texte_numerote(MOTS[:3]) == "0:Bonjour 1:le 2:SSO"


def test_prompt_contient_texte_et_glossaire():
    p = construire_prompt(MOTS, GLOSSAIRE)
    assert "2:SSO" in p
    assert "API" in p and "160" in p


def test_convertir():
    reponse = ReponseIA(
        chapitres=[ChapitreIA(titre="Intro", premier_mot=0), ChapitreIA(titre="API", premier_mot=4)],
        termes=[
            TermeIA(terme="SSO", definition="Authentification unique.", mots=[2]),
            TermeIA(terme="API", definition="Autre définition.", mots=[5, 99]),
            TermeIA(terme="Fantôme", definition="x", mots=[99]),
        ],
        longueurs=[LongueurIA(premier_mot=3, dernier_mot=4, raison="Digression.")],
    )
    assert convertir(reponse, MOTS, GLOSSAIRE) == {
        "chapitres": [{"titre": "Intro", "debut": 0.0}, {"titre": "API", "debut": 4.0}],
        "termes": [
            {"terme": "SSO", "definition": "Authentification unique.", "occurrences": [2.0], "origine": "ia"},
            {"terme": "API", "definition": "Interface d'échange entre logiciels.", "occurrences": [5.0], "origine": "glossaire"},
        ],
        "longueurs": [{"id": "l0", "debut": 3.0, "fin": 4.5, "raison": "Digression."}],
    }


def faux_client(stop_reason="end_turn", parsed=None):
    reponse = SimpleNamespace(stop_reason=stop_reason, parsed_output=parsed)
    return SimpleNamespace(messages=SimpleNamespace(parse=lambda **kw: reponse))


def test_demander_renvoie_la_reponse():
    attendu = ReponseIA(chapitres=[], termes=[], longueurs=[])
    assert demander(MOTS, {}, "claude-opus-5-5", client=faux_client(parsed=attendu)) is attendu


def test_demander_refus():
    with pytest.raises(ErreurSuggestions, match="refus"):
        demander(MOTS, {}, "claude-opus-5-5", client=faux_client(stop_reason="refusal"))


def test_demander_reponse_vide():
    with pytest.raises(ErreurSuggestions):
        demander(MOTS, {}, "claude-opus-5-5", client=faux_client(parsed=None))


@pytest.mark.reseau
def test_appel_reel():
    r = demander(MOTS, GLOSSAIRE, "claude-opus-5-5")
    assert isinstance(r, ReponseIA)
```

- [ ] **Step 2 : Vérifier que les tests échouent**

Run : `cd pipeline; ..\.venv\Scripts\python -m pytest tests/test_glossaire.py tests/test_suggestions.py -v`
Expected : FAIL (modules introuvables).

- [ ] **Step 3 : Implémenter `pipeline/mtpipeline/glossaire.py`**

```python
import json
from pathlib import Path


def charger_glossaire(chemin: Path) -> dict[str, dict]:
    if not chemin.exists():
        return {}
    donnees = json.loads(chemin.read_text(encoding="utf-8"))
    return {t["terme"].lower(): t for t in donnees.get("termes", [])}
```

- [ ] **Step 4 : Implémenter `pipeline/mtpipeline/suggestions.py`**

```python
import anthropic
from pydantic import BaseModel

from .erreurs import ErreurSuggestions


class ChapitreIA(BaseModel):
    titre: str
    premier_mot: int


class TermeIA(BaseModel):
    terme: str
    definition: str
    mots: list[int]


class LongueurIA(BaseModel):
    premier_mot: int
    dernier_mot: int
    raison: str


class ReponseIA(BaseModel):
    chapitres: list[ChapitreIA]
    termes: list[TermeIA]
    longueurs: list[LongueurIA]


def texte_numerote(mots: list[dict]) -> str:
    lignes = []
    for i in range(0, len(mots), 30):
        lignes.append(" ".join(f"{m['id']}:{m['texte']}" for m in mots[i:i + 30]))
    return "\n".join(lignes)


def construire_prompt(mots: list[dict], glossaire: dict[str, dict]) -> str:
    connus = ", ".join(sorted(t["terme"] for t in glossaire.values())) or "(aucun)"
    return f"""Tu prépares le montage d'une vidéo YouTube de la chaîne personnelle « PMT » : astuces et outils numériques (logiciels, IA, productivité) expliqués simplement à un public non spécialiste. La vidéo est un tournage face caméra, non scripté, en français. Chaque chapitre deviendra un épisode autonome publié séparément.

Voici la transcription. Chaque mot est précédé de son numéro (numéro:mot).

<transcription>
{texte_numerote(mots)}
</transcription>

Propose :

1. **chapitres** : le découpage en chapitres, aux changements de sujet. Chaque chapitre doit pouvoir être regardé seul ; vise des chapitres de 3 à 8 minutes quand le contenu le permet. Pour chacun : un titre court et accrocheur (60 caractères maximum) et le numéro du premier mot.

2. **termes** : les termes techniques ou anglicismes qu'un public non spécialiste ne comprendrait pas forcément. Pour chacun : le terme tel qu'il doit s'afficher, une définition claire en une ou deux phrases (160 caractères maximum), et les numéros de tous les mots où il est prononcé. Ces termes sont déjà dans le glossaire, reprends-les s'ils apparaissent (leur définition sera reprise du glossaire) : {connus}.

3. **longueurs** : les passages qui pourraient être coupés sans perte (digressions, redites, explications qui tournent en rond). Pour chacun : premier et dernier numéro de mot, et la raison en une phrase. Sois sélectif : ces passages ne sont que des propositions que l'auteur validera.
"""


def demander(mots: list[dict], glossaire: dict[str, dict], modele: str, client=None) -> ReponseIA:
    client = client or anthropic.Anthropic()
    try:
        reponse = client.messages.parse(
            model=modele,
            max_tokens=16000,
            output_config={"effort": "medium"},
            messages=[{"role": "user", "content": construire_prompt(mots, glossaire)}],
            output_format=ReponseIA,
            extra_headers={"anthropic-beta": "server-side-fallback-2026-07-01"},
            extra_body={"fallbacks": "default"},
        )
    except anthropic.APIConnectionError as e:
        raise ErreurSuggestions(f"Connexion à l'API Claude impossible : {e}") from e
    except anthropic.RateLimitError as e:
        raise ErreurSuggestions("Limite de requêtes de l'API Claude atteinte, réessayez plus tard.") from e
    except anthropic.APIStatusError as e:
        raise ErreurSuggestions(f"Erreur de l'API Claude ({e.status_code}) : {e.message}") from e
    if reponse.stop_reason == "refusal":
        raise ErreurSuggestions("Claude a refusé de traiter cette transcription.")
    if reponse.parsed_output is None:
        raise ErreurSuggestions(f"Réponse de Claude inexploitable (arrêt : {reponse.stop_reason}).")
    return reponse.parsed_output


def convertir(reponse: ReponseIA, mots: list[dict], glossaire: dict[str, dict]) -> dict:
    def valide(i: int) -> bool:
        return 0 <= i < len(mots)

    chapitres = sorted(
        ({"titre": c.titre, "debut": mots[c.premier_mot]["debut"]} for c in reponse.chapitres if valide(c.premier_mot)),
        key=lambda c: c["debut"],
    )

    termes = []
    for t in reponse.termes:
        occurrences = sorted(mots[i]["debut"] for i in t.mots if valide(i))
        if not occurrences:
            continue
        connu = glossaire.get(t.terme.lower())
        termes.append({
            "terme": connu["terme"] if connu else t.terme,
            "definition": connu["definition"] if connu else t.definition,
            "occurrences": occurrences,
            "origine": "glossaire" if connu else "ia",
        })

    longueurs = []
    for l in reponse.longueurs:
        if valide(l.premier_mot) and valide(l.dernier_mot) and l.premier_mot <= l.dernier_mot:
            longueurs.append({
                "id": f"l{len(longueurs)}",
                "debut": mots[l.premier_mot]["debut"],
                "fin": mots[l.dernier_mot]["fin"],
                "raison": l.raison,
            })

    return {"chapitres": chapitres, "termes": termes, "longueurs": longueurs}
```

- [ ] **Step 5 : Vérifier que les tests passent**

Run : `cd pipeline; ..\.venv\Scripts\python -m pytest tests/test_glossaire.py tests/test_suggestions.py -v`
Expected : 8 PASS, 1 deselected (reseau).

- [ ] **Step 6 : Vérifier l'appel réel (nécessite une clé API ; coût < 0,01 €)**

Run : `cd pipeline; ..\.venv\Scripts\python -m pytest tests/test_suggestions.py -m reseau -v`
Expected : 1 PASS. Si l'API renvoie une erreur 400 sur `fallbacks` ou `output_config`, retirer `extra_headers` et `extra_body` et relancer ; noter l'écart dans le commit.

- [ ] **Step 7 : Commit**

```bash
git add pipeline/mtpipeline/glossaire.py pipeline/mtpipeline/suggestions.py pipeline/tests/test_glossaire.py pipeline/tests/test_suggestions.py
git commit -m "Glossaire et suggestions Claude (chapitres, termes, longueurs)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11 : Orchestration par étapes avec reprise (CLI)

**Files:**
- Create: `pipeline/mtpipeline/cli.py`
- Test: `pipeline/tests/test_cli.py`

**Interfaces:**
- Consumes : `preparer`, `sonder` (Task 7) ; `charger_audio`, `TAUX`, `transcrire` (Task 8) ; `detecter` (Task 9) ; `charger_glossaire`, `demander`, `convertir` (Task 10) ; `charger_reglages`, `RACINE`, erreurs (Task 6).
- Produces :
  - `analyser(dossier: Path, titre: str, reglages: dict, transcrire_fn=transcrire, demander_fn=demander, glossaire_chemin: Path | None = None) -> dict` — renvoie le contenu d'`analyse.json`.
  - `relancer_suggestions(dossier, reglages, demander_fn=demander, glossaire_chemin=None) -> dict`
  - Fichiers produits dans le dossier du tournage : `source.mp4`, `preparation.json`, `transcription.json`, `detections.json`, `suggestions.json` (si succès), `analyse.json`, `episode.json` (`{"version": 1, "titre": str, "statut": "analyse"|"erreur", "message": str|null}`).
  - Commandes :
    - `python -m mtpipeline.cli analyser <dossier> --titre "<titre>"`
    - `python -m mtpipeline.cli relancer-suggestions <dossier>`

Règle de reprise : une étape n'est exécutée que si son fichier résultat n'existe pas. Un échec de Claude n'arrête pas l'analyse : `suggestions` = `null` et `erreurSuggestions` = message.

- [ ] **Step 1 : Écrire les tests**

`pipeline/tests/test_cli.py` :
```python
import json
import shutil

import pytest

from mtpipeline.cli import analyser, relancer_suggestions
from mtpipeline.erreurs import ErreurEntree, ErreurSuggestions
from mtpipeline.reglages import RACINE, charger_reglages
from mtpipeline.suggestions import ChapitreIA, ReponseIA

REGLAGES = charger_reglages()
MOTS = [{"id": 0, "texte": "Bonjour", "debut": 0.2, "fin": 0.6},
        {"id": 1, "texte": "tous", "debut": 1.5, "fin": 1.9}]


def faux_transcrire(chemin, modele):
    faux_transcrire.appels += 1
    return MOTS


def faux_demander(mots, glossaire, modele):
    return ReponseIA(chapitres=[ChapitreIA(titre="Intro", premier_mot=0)], termes=[], longueurs=[])


def demander_en_erreur(mots, glossaire, modele):
    raise ErreurSuggestions("API indisponible")


@pytest.fixture
def tournage(tmp_path, video_test):
    dossier = tmp_path / "2026-10-06-test"
    (dossier / "bruts").mkdir(parents=True)
    shutil.move(video_test("prise1.mp4"), dossier / "bruts" / "prise1.mp4")
    faux_transcrire.appels = 0
    return dossier


def test_analyse_complete(tournage, tmp_path):
    a = analyser(tournage, "Test", REGLAGES, faux_transcrire, faux_demander, tmp_path / "glossaire.json")
    assert a["mots"] == MOTS
    assert a["suggestions"]["chapitres"] == [{"titre": "Intro", "debut": 0.2}]
    assert a["erreurSuggestions"] is None
    for f in ["source.mp4", "transcription.json", "detections.json", "analyse.json", "episode.json"]:
        assert (tournage / f).exists(), f
    episode = json.loads((tournage / "episode.json").read_text(encoding="utf-8"))
    assert episode == {"version": 1, "titre": "Test", "statut": "analyse", "message": None}


def test_format_conforme_a_la_fixture(tournage, tmp_path):
    a = analyser(tournage, "Test", REGLAGES, faux_transcrire, faux_demander, tmp_path / "glossaire.json")
    fixture = json.loads((RACINE / "fixtures" / "analyse-exemple.json").read_text(encoding="utf-8"))
    assert set(a) == set(fixture)
    assert set(a["suggestions"]) == set(fixture["suggestions"])
    assert set(a["detections"][0]) == set(fixture["detections"][0])


def test_reprise_sans_retranscrire(tournage, tmp_path):
    analyser(tournage, "Test", REGLAGES, faux_transcrire, faux_demander, tmp_path / "glossaire.json")
    analyser(tournage, "Test", REGLAGES, faux_transcrire, faux_demander, tmp_path / "glossaire.json")
    assert faux_transcrire.appels == 1


def test_echec_claude_non_bloquant_puis_relance(tournage, tmp_path):
    a = analyser(tournage, "Test", REGLAGES, faux_transcrire, demander_en_erreur, tmp_path / "glossaire.json")
    assert a["suggestions"] is None
    assert a["erreurSuggestions"] == "API indisponible"
    b = relancer_suggestions(tournage, REGLAGES, faux_demander, tmp_path / "glossaire.json")
    assert b["suggestions"]["chapitres"][0]["titre"] == "Intro"
    assert b["erreurSuggestions"] is None


def test_entree_invalide_marque_l_episode_en_erreur(tmp_path, video_test):
    dossier = tmp_path / "mauvais"
    (dossier / "bruts").mkdir(parents=True)
    shutil.move(video_test("petit.mp4", largeur=1280, hauteur=720), dossier / "bruts" / "petit.mp4")
    with pytest.raises(ErreurEntree):
        analyser(dossier, "Test", REGLAGES, faux_transcrire, faux_demander, tmp_path / "glossaire.json")
    episode = json.loads((dossier / "episode.json").read_text(encoding="utf-8"))
    assert episode["statut"] == "erreur"
    assert "1920x1080" in episode["message"]
```

- [ ] **Step 2 : Vérifier que les tests échouent**

Run : `cd pipeline; ..\.venv\Scripts\python -m pytest tests/test_cli.py -v`
Expected : FAIL (`ModuleNotFoundError: mtpipeline.cli`).

- [ ] **Step 3 : Implémenter `pipeline/mtpipeline/cli.py`**

```python
import argparse
import json
import sys
from pathlib import Path

from .audio import TAUX, charger_audio
from .detection import detecter
from .erreurs import ErreurEntree, ErreurSuggestions
from .glossaire import charger_glossaire
from .preparation import preparer
from .reglages import RACINE, charger_reglages
from .suggestions import convertir, demander
from .transcription import transcrire

EXTENSIONS = {".mp4", ".mkv", ".mov"}


def lire(chemin: Path):
    return json.loads(chemin.read_text(encoding="utf-8"))


def ecrire(chemin: Path, donnees) -> None:
    chemin.write_text(json.dumps(donnees, ensure_ascii=False, indent=2), encoding="utf-8")


def ecrire_episode(dossier: Path, titre: str, statut: str, message: str | None) -> None:
    ecrire(dossier / "episode.json", {"version": 1, "titre": titre, "statut": statut, "message": message})


def etape_suggestions(dossier: Path, mots: list[dict], reglages: dict, demander_fn, glossaire_chemin: Path):
    fichier = dossier / "suggestions.json"
    if fichier.exists():
        return lire(fichier), None
    glossaire = charger_glossaire(glossaire_chemin)
    try:
        reponse = demander_fn(mots, glossaire, reglages["modeles"]["claude"])
    except ErreurSuggestions as e:
        return None, str(e)
    suggestions = convertir(reponse, mots, glossaire)
    ecrire(fichier, suggestions)
    return suggestions, None


def assembler(dossier: Path, suggestions, erreur) -> dict:
    preparation = lire(dossier / "preparation.json")
    analyse = {
        "version": 1,
        "duree": preparation["duree"],
        "fps": preparation["fps"],
        "mots": lire(dossier / "transcription.json"),
        "detections": lire(dossier / "detections.json"),
        "suggestions": suggestions,
        "erreurSuggestions": erreur,
    }
    ecrire(dossier / "analyse.json", analyse)
    return analyse


def analyser(dossier: Path, titre: str, reglages: dict, transcrire_fn=transcrire, demander_fn=demander,
             glossaire_chemin: Path | None = None) -> dict:
    glossaire_chemin = glossaire_chemin or RACINE / "donnees" / "glossaire.json"
    source = dossier / "source.mp4"
    try:
        if not (dossier / "preparation.json").exists():
            bruts = sorted(p for p in (dossier / "bruts").iterdir() if p.suffix.lower() in EXTENSIONS)
            ecrire(dossier / "preparation.json", preparer(bruts, source))
    except ErreurEntree as e:
        ecrire_episode(dossier, titre, "erreur", str(e))
        raise

    if not (dossier / "transcription.json").exists():
        ecrire(dossier / "transcription.json", transcrire_fn(source, reglages["modeles"]["whisper"]))
    mots = lire(dossier / "transcription.json")

    if not (dossier / "detections.json").exists():
        duree = lire(dossier / "preparation.json")["duree"]
        ecrire(dossier / "detections.json",
               detecter(mots, charger_audio(source), TAUX, duree, reglages["detection"]))

    suggestions, erreur = etape_suggestions(dossier, mots, reglages, demander_fn, glossaire_chemin)
    analyse = assembler(dossier, suggestions, erreur)
    ecrire_episode(dossier, titre, "analyse", None)
    return analyse


def relancer_suggestions(dossier: Path, reglages: dict, demander_fn=demander,
                         glossaire_chemin: Path | None = None) -> dict:
    glossaire_chemin = glossaire_chemin or RACINE / "donnees" / "glossaire.json"
    (dossier / "suggestions.json").unlink(missing_ok=True)
    mots = lire(dossier / "transcription.json")
    suggestions, erreur = etape_suggestions(dossier, mots, reglages, demander_fn, glossaire_chemin)
    return assembler(dossier, suggestions, erreur)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="mtpipeline", description="Analyse d'un tournage.")
    sous = parser.add_subparsers(dest="commande", required=True)
    p_analyser = sous.add_parser("analyser", help="Analyser un dossier de tournage.")
    p_analyser.add_argument("dossier", type=Path)
    p_analyser.add_argument("--titre", required=True)
    p_relancer = sous.add_parser("relancer-suggestions", help="Relancer uniquement les suggestions Claude.")
    p_relancer.add_argument("dossier", type=Path)
    args = parser.parse_args(argv)

    reglages = charger_reglages()
    try:
        if args.commande == "analyser":
            analyse = analyser(args.dossier, args.titre, reglages)
        else:
            analyse = relancer_suggestions(args.dossier, reglages)
    except ErreurEntree as e:
        print(f"Erreur : {e}", file=sys.stderr)
        return 1

    print(f"{len(analyse['mots'])} mots, {len(analyse['detections'])} coupes détectées.")
    if analyse["erreurSuggestions"]:
        print(f"Suggestions indisponibles : {analyse['erreurSuggestions']}", file=sys.stderr)
    else:
        s = analyse["suggestions"]
        print(f"{len(s['chapitres'])} chapitres, {len(s['termes'])} termes, {len(s['longueurs'])} longueurs proposés.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4 : Vérifier que tous les tests Python passent**

Run : `cd pipeline; ..\.venv\Scripts\python -m pytest -v`
Expected : tous PASS (les tests `gpu` et `reseau` sont désélectionnés).

- [ ] **Step 5 : Commit**

```bash
git add pipeline/mtpipeline/cli.py pipeline/tests/test_cli.py
git commit -m "Orchestration de l'analyse par étapes avec reprise" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12 : Essai réel et calibrage des seuils

Cette tâche nécessite l'utilisateur : installation d'OBS, enregistrement d'une vidéo d'essai, relecture des résultats.

**Files:**
- Create: `docs/obs-configuration.md`, `pipeline/tests/test_essai_reel.py`
- Modify (si le calibrage l'exige) : `reglages.json`

**Interfaces:**
- Consumes : `analyser` (Task 11).

- [ ] **Step 1 : Rédiger `docs/obs-configuration.md`**

```markdown
# Configuration d'OBS Studio pour la chaîne

1. Télécharger OBS Studio sur https://obsproject.com (seul site officiel).
2. Paramètres → Vidéo : résolution de base et de sortie **1920x1080**, **30 images/s** (valeur commune, pas « fractionnelle »).
3. Paramètres → Sortie → Enregistrement : format **MP4** (ou MKV avec remuxage automatique en MP4), encodeur **NVIDIA NVENC H.264**, contrôle du débit **CQP 20**.
4. Paramètres → Audio : micro configuré, échantillonnage 48 kHz.
5. Scène « Chaîne M&T » :
   - Source « Capture d'écran » en plein cadre (1920x1080).
   - Source « Périphérique de capture vidéo » (webcam) redimensionnée à environ 480x270, placée **en bas à gauche** avec une marge de 24 px.
   - Verrouiller les deux sources (icône cadenas) pour que la mise en page ne bouge plus.
6. Chemin d'enregistrement : `donnees/tournages/<AAAA-MM-JJ>-<sujet>/bruts/` (créer le dossier avant de tourner).
```

- [ ] **Step 2 : Enregistrer la vidéo d'essai (utilisateur)**

Demander à l'utilisateur d'enregistrer 2 à 3 minutes dans les conditions réelles, en parlant de deux sujets distincts, en employant au moins deux termes techniques et en laissant volontairement quelques « euh » longs, une phrase reprise (« on va… on va voir ») et une pause de plus d'une seconde. Fichier déposé dans `donnees/tournages/2026-10-essai/bruts/`.

- [ ] **Step 3 : Lancer l'analyse réelle**

Run : `cd pipeline; ..\.venv\Scripts\python -m mtpipeline.cli analyser ..\donnees\tournages\2026-10-essai --titre "Essai"`
Expected : message du type `412 mots, 37 coupes détectées.` puis `2 chapitres, 3 termes, 1 longueurs proposés.`

- [ ] **Step 4 : Relire les détections avec l'utilisateur**

Afficher chaque détection avec le texte qui l'entoure :

Run :
```powershell
cd pipeline; ..\.venv\Scripts\python -c "import json; a=json.load(open('../donnees/tournages/2026-10-essai/analyse.json',encoding='utf-8')); m=a['mots']; [print(d['type'].ljust(11), f\"{d['debut']:7.2f}-{d['fin']:7.2f}\", ' '.join(x['texte'] for x in m if d['debut']-2<x['debut']<d['fin']+2)) for d in a['detections']]"
```
Pour chaque détection, l'utilisateur indique si la coupe est juste, superflue (seuil trop bas) ou si une hésitation a été manquée (seuil trop haut). Ajuster `hesitationMin`, `silenceMin`, `proportionVoiseeHesitation` ou `seuilSilenceDb` dans `reglages.json`, supprimer `detections.json` et `analyse.json`, relancer le Step 3 (la transcription n'est pas refaite).

- [ ] **Step 5 : Figer l'essai en test de non-régression**

`pipeline/tests/test_essai_reel.py` :
```python
import json

import pytest

from mtpipeline.reglages import RACINE

DOSSIER = RACINE / "donnees" / "tournages" / "2026-10-essai"


@pytest.mark.gpu
@pytest.mark.skipif(not (DOSSIER / "analyse.json").exists(), reason="vidéo d'essai absente")
def test_essai_reel_detecte_hesitations_et_silences():
    a = json.loads((DOSSIER / "analyse.json").read_text(encoding="utf-8"))
    types = {d["type"] for d in a["detections"]}
    assert {"silence", "hesitation", "repetition"} <= types
    assert a["suggestions"] is not None
    assert len(a["suggestions"]["chapitres"]) >= 2
```

Run : `cd pipeline; ..\.venv\Scripts\python -m pytest tests/test_essai_reel.py -m gpu -v`
Expected : 1 PASS.

- [ ] **Step 6 : Commit**

```bash
git add docs/obs-configuration.md pipeline/tests/test_essai_reel.py reglages.json
git commit -m "Configuration OBS, essai réel et calibrage des seuils" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Suite

- **Plan 2 — Compositions Remotion** : `VideoMontee` (segments + fondus audio + logo + encarts via `noyau/`), `Generique`, `EncartDefinition`, `Intertitre`, `CartonFin`, `Episode`, `VideoComplete`, script de rendu par épisode.
- **Plan 3 — Studio de validation** : serveur local, liste des tournages, montage par le texte avec lecteur Remotion, enregistrement automatique de `montage.json`, mise à jour du glossaire, vérifications et lancement des rendus.
