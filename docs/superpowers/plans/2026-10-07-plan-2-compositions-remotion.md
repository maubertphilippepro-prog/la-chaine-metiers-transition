# Plan 2 — Compositions Remotion : plan de mise en œuvre

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** À partir d'un tournage analysé (`analyse.json` + `montage.json`, ou un montage par défaut en mode brouillon), produire avec Remotion les vidéos finales : un épisode par chapitre et la vidéo complète, avec générique, encarts de définition, intertitres, logo PMT et carton de fin.

**Architecture:** Toute la logique de décision (segments, découpage par chapitre, placement des encarts, conversion en images) est ajoutée au cœur `noyau/` (TypeScript pur, testé avec Vitest) et produit des objets `DecisionsEpisode` / `DecisionsVideoComplete`. Les compositions Remotion de `remotion/` ne font qu'afficher ces décisions. Des scripts Node (`remotion/scripts/`, exécutés avec `tsx`) chargent un tournage, servent `source.mp4` par un petit serveur HTTP local (requêtes Range + CORS), ouvrent l'aperçu dans Remotion Studio ou lancent les rendus.

**Tech Stack:** Node 22, TypeScript 5, Vitest 3, React 19.3.0, Remotion 4.0.533 (`remotion`, `@remotion/cli`, `@remotion/media`, `@remotion/bundler`, `@remotion/renderer`, `@remotion/google-fonts`), `tsx`, FFmpeg/ffprobe.

Spec de référence : `docs/superpowers/specs/2026-10-06-post-production-design.md` (§3.2, §5, §6, §7 « Rendu »).

## Global Constraints

- La chaîne s'appelle **« PMT »** (projet personnel). Aucune mention d'organisation (employeur, pôle, client) ni de l'ancien nom de la chaîne dans le code, les textes affichés, les prompts ou la documentation. Les fichiers de logo existants de `assets/identite-visuelle/` ne sont plus utilisés (ils restent sur disque).
- Identité : couleurs lues dans `reglages.json` → `charte` (rouge `#E30520`, bleu `#004C99`, bleu-gris `#9AB2C9`, blanc `#FFFFFF`), formes géométriques (bandes, cercles, triangles), police Open Sans (gras pour les titres), logo = texte « PMT » dessiné en React (`LogoPMT`).
- Tout le texte visible et les noms de domaine sont en français ; clés JSON en camelCase.
- `noyau/` reste en secondes ; la conversion secondes → images se fait **uniquement** dans `noyau/images.ts` (`enImages` = `Math.round(secondes * fps)`). Les compositions reçoivent des valeurs en images et ne contiennent **aucune logique de décision**.
- Cadre 1920×1080 ; la cadence vient de `analyse.fps`.
- Durées d'habillage lues dans `reglages.json` → `durees` (générique 4 s, encart 6 s, intertitre 2 s, carton de fin 5 s) ; fondu audio aux raccords `coupe.fonduAudio` (au moins 1 image).
- Encart de définition : en bas à droite (ou en haut à droite si `position: 'haut'`, le logo descend alors), carte blanche avec bande rouge/bleue, terme en gras bleu, définition ≤ 160 caractères ; à la première occurrence conservée du terme dans l'épisode (dans la vidéo complète : première occurrence dans la vidéo) ; reste 6 s.
- Épisode = `Generique` (titre du chapitre) → contenu du chapitre → `CartonFin`. Vidéo complète = `Generique` (titre du montage) → chapitre 1 → `Intertitre` → chapitre 2 → … → `CartonFin`.
- `analyse.json` n'est jamais modifié ; ce plan n'écrit pas `montage.json` (rôle du studio, plan 3). Sans `montage.json`, le rendu exige `--brouillon` (montage par défaut `montageInitial`).
- Rendu : un fichier par épisode (`rendus/episode-NN-<slug>.mp4`) + `rendus/video-complete.mp4` ; l'échec de l'un n'empêche pas les autres ; relance individuelle (`--seul`) ; journal `rendus/journal.txt`.
- Versions exactes : tous les paquets `@remotion/*` et `remotion` en `4.0.533` (identiques entre eux), `react` / `react-dom` / `@types/react` en `19.3.0`.
- Le chemin du projet contient « & » : ne jamais utiliser `npx` ; passer par les scripts npm (`npm test -- <fichier>`, `npm run image -- …`), qui s'exécutent dans Git Bash grâce au `.npmrc`. Python : `cd pipeline; ..\.venv\Scripts\python -m pytest`.
- Toujours `premountFor` sur les `<Sequence>` / `<Series.Sequence>` (règle Remotion).
- Chaque commit se termine par la ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Structure des fichiers

```
reglages.json                         charte : + nomChaine, − chemins de logos
noyau/
  images.ts (+ .test.ts)              secondes → images
  nommage.ts (+ .test.ts)             slug, noms des fichiers de rendu
  decisions.ts (+ .test.ts)           analyse + montage + réglages → décisions de rendu
remotion/
  index.ts                            registerRoot
  Root.tsx                            déclaration des compositions
  charte.ts, police.ts                couleurs/durées, police Open Sans
  apercus.tsx                         cadres d'aperçu (logo, encart)
  exemple.ts                          décisions vides par défaut (Studio)
  calculs.ts (+ .test.ts)             volume aux raccords, décalage du logo
  composants/
    LogoPMT.tsx, Generique.tsx, Intertitre.tsx, CartonFin.tsx, EncartDefinition.tsx
  compositions/
    Enchainement.tsx, VideoMontee.tsx, Episode.tsx, VideoComplete.tsx
  scripts/
    serveur-fichiers.ts (+ .test.ts)  serveur HTTP local (Range, CORS)
    tournage.ts (+ .test.ts)          chargement d'un tournage, statut
    apercu.ts                         ouvre Remotion Studio sur un tournage
    rendu.ts (+ .test.ts)             rendus + journal
    rendu.e2e.test.ts                 rendu réel de bout en bout (lent)
vitest.config.ts, vitest.rendu.config.ts
```

---

### Task 1 : Passage à la chaîne PMT

**Files:**
- Modify: `reglages.json`, `noyau/types.ts`, `noyau/reglages.test.ts`, `pipeline/mtpipeline/suggestions.py`, `pipeline/tests/test_suggestions.py`, `package.json` (+ `package-lock.json`), `docs/obs-configuration.md`, `docs/superpowers/plans/2026-10-06-plan-1-fondations-analyse.md`

**Interfaces:**
- Produces : `Reglages['charte']` = `{ rouge, bleu, bleuGris, blanc, police, nomChaine }` (plus aucune clé `logo…`).

- [ ] **Step 1 : Écrire les tests**

Dans `noyau/reglages.test.ts`, ajouter dans le test existant, après la ligne `expect(r.modeles.claude)…` :

```ts
    expect(r.charte.nomChaine).toBe('PMT');
    expect(Object.keys(r.charte).some(k => k.startsWith('logo'))).toBe(false);
```

Dans `pipeline/tests/test_suggestions.py`, ajouter :

```python
def test_prompt_presente_la_chaine_pmt():
    p = construire_prompt(MOTS, GLOSSAIRE)
    assert "chaîne personnelle « PMT »" in p
    assert "collaborateurs" not in p
    assert "entreprise" not in p
```

- [ ] **Step 2 : Vérifier qu'ils échouent**

Run : `npm test -- noyau/reglages.test.ts` → FAIL (`nomChaine` undefined).
Run : `cd pipeline; ..\.venv\Scripts\python -m pytest tests/test_suggestions.py -k pmt -v` → FAIL.

- [ ] **Step 3 : Modifier `reglages.json`**

Remplacer le bloc `charte` par :

```json
  "charte": {
    "rouge": "#E30520",
    "bleu": "#004C99",
    "bleuGris": "#9AB2C9",
    "blanc": "#FFFFFF",
    "police": "Open Sans",
    "nomChaine": "PMT"
  },
```

- [ ] **Step 4 : Modifier `noyau/types.ts`**

Dans `Reglages`, remplacer le type de `charte` par :

```ts
  charte: {
    rouge: string;
    bleu: string;
    bleuGris: string;
    blanc: string;
    police: string;
    nomChaine: string;
  };
```

- [ ] **Step 5 : Modifier le prompt dans `pipeline/mtpipeline/suggestions.py`**

Dans `construire_prompt`, remplacer la première phrase du prompt (celle qui nomme la chaîne et se termine par « en entreprise. ») par :
`Tu prépares le montage d'une vidéo YouTube de la chaîne personnelle « PMT » : astuces et outils numériques (logiciels, IA, productivité) expliqués simplement à un public non spécialiste.`

Dans le point 2 du prompt, remplacer `qu'un public de collaborateurs non spécialistes ne comprendrait pas forcément` par `qu'un public non spécialiste ne comprendrait pas forcément`.

- [ ] **Step 6 : Nom du paquet et documentation**

- `package.json` : `"name": "chaine-pmt"`, puis `npm install` (met à jour `package-lock.json`).
- `docs/obs-configuration.md` : titre `# Configuration d'OBS Studio pour la chaîne PMT` ; à l'étape 5, la scène s'appelle `« PMT »`.
- `docs/superpowers/plans/2026-10-06-plan-1-fondations-analyse.md` : dans les listings de `package.json`, `reglages.json`, `noyau/types.ts` et du prompt, appliquer les mêmes remplacements que ci-dessus (nom du paquet, bloc `charte` sans logos avec `nomChaine`, première phrase et point 2 du prompt). Ajouter sous le titre la ligne : `> Mise à jour du 2026-10-07 : chaîne renommée PMT (projet personnel), logos remplacés par un logo texte.`

- [ ] **Step 7 : Vérifier**

Run : `npm test`, `npm run typecheck`, `cd pipeline; ..\.venv\Scripts\python -m pytest -q`
Expected : tout PASS.
Run (Git Bash) : `grep -rniE "c[i]cad|ing[eé]rop|m[eé]tiers( et|-| &)|cha[iî]ne M&T" --exclude-dir={node_modules,.venv,.git,donnees,.superpowers,assets} .`
Expected : aucune ligne (les noms de fichiers de `assets/` ne sont pas concernés).

- [ ] **Step 8 : Commit**

```bash
git add reglages.json noyau/types.ts noyau/reglages.test.ts pipeline/mtpipeline/suggestions.py pipeline/tests/test_suggestions.py package.json package-lock.json docs/obs-configuration.md docs/superpowers/plans/2026-10-06-plan-1-fondations-analyse.md
git commit -m "Chaîne renommée PMT : charte sans logos d'organisation, prompt grand public" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2 : Conversion en images et nommage des fichiers

**Files:**
- Create: `noyau/images.ts`, `noyau/nommage.ts`
- Test: `noyau/images.test.ts`

**Interfaces:**
- Consumes : `Segment` (`noyau/types.ts`).
- Produces :
  - `interface SegmentImages { debut: number; fin: number }` (images, `fin` exclue)
  - `enImages(secondes: number, fps: number): number`
  - `segmentsEnImages(segments: Segment[], fps: number): SegmentImages[]` — retire les segments de durée nulle après arrondi
  - `dureeImages(segments: SegmentImages[]): number`
  - `slug(texte: string): string` — sans accents, minuscules, `-` entre mots, 60 caractères max, `sans-titre` si vide
  - `nomFichierEpisode(index: number, titre: string): string` — `episode-01-<slug>.mp4` (index à partir de 0)

- [ ] **Step 1 : Écrire les tests** (`noyau/images.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { dureeImages, enImages, segmentsEnImages } from './images';
import { nomFichierEpisode, slug } from './nommage';

describe('images', () => {
  it("arrondit à l'image la plus proche", () => {
    expect(enImages(1.5, 30)).toBe(45);
    expect(enImages(0.016, 30)).toBe(0);
    expect(enImages(0.017, 30)).toBe(1);
  });
  it('convertit les segments et retire ceux de durée nulle', () => {
    expect(segmentsEnImages([{ debut: 0, fin: 2 }, { debut: 3, fin: 3.01 }, { debut: 4, fin: 5.5 }], 30))
      .toEqual([{ debut: 0, fin: 60 }, { debut: 120, fin: 165 }]);
  });
  it('additionne les durées', () => {
    expect(dureeImages([{ debut: 0, fin: 60 }, { debut: 120, fin: 165 }])).toBe(105);
  });
});

describe('nommage', () => {
  it('fabrique un slug sans accents ni ponctuation', () => {
    expect(slug('Windows + V : retrouvez tout votre historique !')).toBe('windows-v-retrouvez-tout-votre-historique');
    expect(slug("Été à l'IA")).toBe('ete-a-l-ia');
  });
  it('limite la longueur et gère le vide', () => {
    expect(slug('a'.repeat(80))).toHaveLength(60);
    expect(slug('!!!')).toBe('sans-titre');
  });
  it("numérote les fichiers d'épisode", () => {
    expect(nomFichierEpisode(0, 'There : exportez en Markdown')).toBe('episode-01-there-exportez-en-markdown.mp4');
    expect(nomFichierEpisode(11, 'X')).toBe('episode-12-x.mp4');
  });
});
```

- [ ] **Step 2 : Vérifier qu'ils échouent**

Run : `npm test -- noyau/images.test.ts` → FAIL (modules introuvables).

- [ ] **Step 3 : Implémenter `noyau/images.ts`**

```ts
import type { Segment } from './types';

// Positions en images ; `fin` est exclue.
export interface SegmentImages {
  debut: number;
  fin: number;
}

export function enImages(secondes: number, fps: number): number {
  return Math.round(secondes * fps);
}

export function segmentsEnImages(segments: Segment[], fps: number): SegmentImages[] {
  return segments
    .map(s => ({ debut: enImages(s.debut, fps), fin: enImages(s.fin, fps) }))
    .filter(s => s.fin > s.debut);
}

export function dureeImages(segments: SegmentImages[]): number {
  return segments.reduce((total, s) => total + (s.fin - s.debut), 0);
}
```

- [ ] **Step 4 : Implémenter `noyau/nommage.ts`**

```ts
export function slug(texte: string): string {
  const brut = texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return brut || 'sans-titre';
}

export function nomFichierEpisode(index: number, titre: string): string {
  return `episode-${String(index + 1).padStart(2, '0')}-${slug(titre)}.mp4`;
}
```

- [ ] **Step 5 : Vérifier que les tests passent**

Run : `npm test -- noyau/images.test.ts` → 6 PASS ; `npm run typecheck` → OK.

- [ ] **Step 6 : Commit**

```bash
git add noyau/images.ts noyau/nommage.ts noyau/images.test.ts
git commit -m "Noyau : conversion en images et nommage des fichiers de rendu" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3 : Décisions de rendu

**Files:**
- Create: `noyau/decisions.ts`
- Test: `noyau/decisions.test.ts`

**Interfaces:**
- Consumes : `calculerSegments` (`noyau/segments.ts`) ; `plagesEpisodes`, `decouperSegments`, `placerEncarts` (`noyau/episodes.ts`) ; `enImages`, `segmentsEnImages`, `dureeImages`, `SegmentImages` (Task 2) ; `Analyse`, `Montage`, `Reglages`, `Terme`, `PositionEncart`.
- Produces :
  - `interface EncartImages { terme: string; definition: string; position: PositionEncart; debut: number; duree: number }` (images, relatives au début de la partie)
  - `interface Partie { titre: string; segments: SegmentImages[]; encarts: EncartImages[]; duree: number }`
  - `interface DureesHabillage { generique: number; intertitre: number; cartonFin: number; fonduAudio: number }` (images)
  - `interface DecisionsEpisode { fps: number; sourceUrl: string; titre: string; partie: Partie; durees: DureesHabillage }`
  - `interface DecisionsVideoComplete { fps: number; sourceUrl: string; titre: string; parties: Partie[]; durees: DureesHabillage }`
  - `dureesHabillage(r: Reglages, fps: number): DureesHabillage`
  - `construirePartie(titre: string, segments: SegmentImages[], termes: Terme[], dureeEncart: number, fps: number): Partie` — `dureeEncart` en images ; un encart qui dépasserait la fin de la partie est avancé ; s'il chevauche alors le précédent, il est retiré ; si la partie est plus courte que l'encart, l'encart est raccourci à la durée de la partie.
  - `decisionsEpisodes(analyse: Analyse, montage: Montage, r: Reglages, sourceUrl: string): DecisionsEpisode[]` — un par chapitre non vide.
  - `decisionsVideoComplete(analyse: Analyse, montage: Montage, r: Reglages, sourceUrl: string): DecisionsVideoComplete` — parties non vides ; un terme n'est défini qu'une fois dans la vidéo.
  - `dureeEpisode(d: DecisionsEpisode): number`, `dureeVideoComplete(d: DecisionsVideoComplete): number` (images).

- [ ] **Step 1 : Écrire les tests** (`noyau/decisions.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import reglagesJson from '../reglages.json';
import {
  construirePartie, decisionsEpisodes, decisionsVideoComplete, dureeEpisode, dureesHabillage, dureeVideoComplete,
} from './decisions';
import type { Analyse, Montage, Reglages, Terme } from './types';

const r: Reglages = {
  ...reglagesJson,
  coupe: { silenceConserve: 0.3, margeMots: 0.06, dureeMinCoupe: 0.1, dureeMinSegment: 0.05, fonduAudio: 0.015 },
  durees: { generique: 4, encart: 6, intertitre: 2, cartonFin: 5 },
};
const FPS = 10;
const analyse: Analyse = {
  version: 1, duree: 20, fps: FPS, mots: [], detections: [], suggestions: null, erreurSuggestions: null,
};
const terme = (p: Partial<Terme>): Terme => ({
  terme: 'API', definition: 'Interface.', occurrences: [], statut: 'valide', position: 'bas', ...p,
});
const montage: Montage = {
  version: 1,
  titre: 'Vidéo test',
  coupes: [{ id: 'm0', type: 'manuelle', debut: 2, fin: 4, active: true }],
  chapitres: [{ titre: 'A', debut: 0 }, { titre: 'B', debut: 10 }],
  termes: [terme({ terme: 'API', occurrences: [5, 15] }), terme({ terme: 'SSO', occurrences: [12] })],
};

describe('dureesHabillage', () => {
  it('convertit les durées des réglages en images, fondu d\'au moins une image', () => {
    expect(dureesHabillage(r, FPS)).toEqual({ generique: 40, intertitre: 20, cartonFin: 50, fonduAudio: 1 });
  });
});

describe('construirePartie', () => {
  it("raccourcit l'encart si la partie est plus courte que lui", () => {
    const p = construirePartie('X', [{ debut: 0, fin: 30 }], [terme({ occurrences: [1] })], 60, FPS);
    expect(p.encarts).toEqual([{ terme: 'API', definition: 'Interface.', position: 'bas', debut: 0, duree: 30 }]);
  });
  it('ignore les termes non validés', () => {
    const p = construirePartie('X', [{ debut: 0, fin: 300 }], [terme({ statut: 'a-valider', occurrences: [1] })], 60, FPS);
    expect(p.encarts).toEqual([]);
  });
});

describe('decisionsEpisodes', () => {
  const [a, b] = decisionsEpisodes(analyse, montage, r, 'http://x/source.mp4');

  it('découpe les segments conservés par chapitre, en images', () => {
    expect(a!.partie.segments).toEqual([{ debut: 0, fin: 20 }, { debut: 40, fin: 100 }]);
    expect(a!.partie.duree).toBe(80);
    expect(b!.partie.segments).toEqual([{ debut: 100, fin: 200 }]);
  });
  it("place chaque terme à sa première occurrence dans l'épisode, sans dépasser la fin", () => {
    // API prononcé à 5 s → 30 images en temps monté, avancé à 20 pour finir avec la partie (80 − 60).
    expect(a!.partie.encarts).toEqual([{ terme: 'API', definition: 'Interface.', position: 'bas', debut: 20, duree: 60 }]);
    // B : SSO à 20 ; API (50, décalé à 80, avancé à 40) chevaucherait SSO → retiré.
    expect(b!.partie.encarts.map(e => [e.terme, e.debut])).toEqual([['SSO', 20]]);
  });
  it('reprend titre, source et durée totale', () => {
    expect(a!.titre).toBe('A');
    expect(a!.sourceUrl).toBe('http://x/source.mp4');
    expect(a!.fps).toBe(10);
    expect(dureeEpisode(a!)).toBe(40 + 80 + 50);
  });
  it('ignore un chapitre entièrement coupé', () => {
    const coupe: Montage = {
      ...montage,
      coupes: [...montage.coupes, { id: 'm1', type: 'manuelle', debut: 10, fin: 20, active: true }],
    };
    expect(decisionsEpisodes(analyse, coupe, r, '').map(e => e.titre)).toEqual(['A']);
  });
});

describe('decisionsVideoComplete', () => {
  const v = decisionsVideoComplete(analyse, montage, r, 'http://x/source.mp4');

  it("ne définit un terme qu'à sa première occurrence dans la vidéo", () => {
    expect(v.parties.map(p => p.encarts.map(e => e.terme))).toEqual([['API'], ['SSO']]);
  });
  it('prend le titre du montage et compte un intertitre entre deux chapitres', () => {
    expect(v.titre).toBe('Vidéo test');
    expect(dureeVideoComplete(v)).toBe(40 + 80 + 20 + 100 + 50);
  });
});
```

- [ ] **Step 2 : Vérifier qu'ils échouent**

Run : `npm test -- noyau/decisions.test.ts` → FAIL (module introuvable).

- [ ] **Step 3 : Implémenter `noyau/decisions.ts`**

```ts
import { decouperSegments, placerEncarts, plagesEpisodes } from './episodes';
import { dureeImages, enImages, segmentsEnImages, type SegmentImages } from './images';
import { calculerSegments } from './segments';
import type { Analyse, Montage, PositionEncart, Reglages, Terme } from './types';

// Toutes les positions et durées sont en images.
export interface EncartImages {
  terme: string;
  definition: string;
  position: PositionEncart;
  debut: number;
  duree: number;
}

export interface Partie {
  titre: string;
  segments: SegmentImages[];
  encarts: EncartImages[];
  duree: number;
}

export interface DureesHabillage {
  generique: number;
  intertitre: number;
  cartonFin: number;
  fonduAudio: number;
}

export interface DecisionsEpisode {
  fps: number;
  sourceUrl: string;
  titre: string;
  partie: Partie;
  durees: DureesHabillage;
}

export interface DecisionsVideoComplete {
  fps: number;
  sourceUrl: string;
  titre: string;
  parties: Partie[];
  durees: DureesHabillage;
}

export function dureesHabillage(r: Reglages, fps: number): DureesHabillage {
  return {
    generique: enImages(r.durees.generique, fps),
    intertitre: enImages(r.durees.intertitre, fps),
    cartonFin: enImages(r.durees.cartonFin, fps),
    fonduAudio: Math.max(1, enImages(r.coupe.fonduAudio, fps)),
  };
}

// Un encart qui dépasserait la fin est avancé ; s'il chevauche alors le précédent, il est retiré.
export function construirePartie(
  titre: string, segments: SegmentImages[], termes: Terme[], dureeEncart: number, fps: number,
): Partie {
  const duree = dureeImages(segments);
  const longueur = Math.min(dureeEncart, duree);
  const termesEnImages = termes.map(t => ({ ...t, occurrences: t.occurrences.map(o => o * fps) }));
  const encarts: EncartImages[] = [];
  if (longueur > 0) {
    for (const e of placerEncarts(termesEnImages, segments, dureeEncart)) {
      const debut = Math.min(Math.round(e.debut), duree - longueur);
      const precedent = encarts[encarts.length - 1];
      if (precedent && debut < precedent.debut + precedent.duree) continue;
      encarts.push({ terme: e.terme, definition: e.definition, position: e.position, debut, duree: longueur });
    }
  }
  return { titre, segments, encarts, duree };
}

function segmentsParChapitre(analyse: Analyse, montage: Montage, r: Reglages) {
  const segments = calculerSegments(analyse.duree, montage.coupes, r.coupe);
  return plagesEpisodes(montage.chapitres, analyse.duree).map(p => ({
    titre: p.titre,
    segments: segmentsEnImages(decouperSegments(segments, p), analyse.fps),
  }));
}

export function decisionsEpisodes(
  analyse: Analyse, montage: Montage, r: Reglages, sourceUrl: string,
): DecisionsEpisode[] {
  const fps = analyse.fps;
  const durees = dureesHabillage(r, fps);
  const dureeEncart = enImages(r.durees.encart, fps);
  return segmentsParChapitre(analyse, montage, r)
    .map(c => construirePartie(c.titre, c.segments, montage.termes, dureeEncart, fps))
    .filter(partie => partie.duree > 0)
    .map(partie => ({ fps, sourceUrl, titre: partie.titre, partie, durees }));
}

export function decisionsVideoComplete(
  analyse: Analyse, montage: Montage, r: Reglages, sourceUrl: string,
): DecisionsVideoComplete {
  const fps = analyse.fps;
  const dureeEncart = enImages(r.durees.encart, fps);
  const dejaDefinis = new Set<string>();
  const parties: Partie[] = [];
  for (const c of segmentsParChapitre(analyse, montage, r)) {
    const termes = montage.termes.filter(t => !dejaDefinis.has(t.terme));
    const partie = construirePartie(c.titre, c.segments, termes, dureeEncart, fps);
    if (partie.duree === 0) continue;
    partie.encarts.forEach(e => dejaDefinis.add(e.terme));
    parties.push(partie);
  }
  return { fps, sourceUrl, titre: montage.titre, parties, durees: dureesHabillage(r, fps) };
}

export function dureeEpisode(d: DecisionsEpisode): number {
  return d.durees.generique + d.partie.duree + d.durees.cartonFin;
}

export function dureeVideoComplete(d: DecisionsVideoComplete): number {
  const contenu = d.parties.reduce((total, p) => total + p.duree, 0);
  const intertitres = Math.max(0, d.parties.length - 1) * d.durees.intertitre;
  return d.durees.generique + contenu + intertitres + d.durees.cartonFin;
}
```

- [ ] **Step 4 : Vérifier que les tests passent**

Run : `npm test -- noyau/decisions.test.ts` → 9 PASS ; `npm test` et `npm run typecheck` → OK.

- [ ] **Step 5 : Commit**

```bash
git add noyau/decisions.ts noyau/decisions.test.ts
git commit -m "Noyau : décisions de rendu par épisode et pour la vidéo complète" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4 : Projet Remotion, charte, police et logo PMT

**Files:**
- Modify: `package.json`, `tsconfig.json`, `.gitignore`
- Create: `vitest.config.ts`, `remotion/index.ts`, `remotion/Root.tsx`, `remotion/charte.ts`, `remotion/police.ts`, `remotion/apercus.tsx`, `remotion/composants/LogoPMT.tsx`

**Interfaces:**
- Produces :
  - `charte` (= `reglages.charte`), `durees` (= `reglages.durees`), `LARGEUR = 1920`, `HAUTEUR = 1080`, `FPS_HABILLAGE = 30`, `NOIR_TEXTE = '#1d1d1b'` (`remotion/charte.ts`)
  - `police: string` (famille Open Sans chargée, `remotion/police.ts`)
  - `LogoPMT: FC<{ taille: number }>`
  - scripts npm `studio` et `image` (`npm run image -- <Composition> <sortie.png> [--frame=N]`)

- [ ] **Step 1 : Dépendances et scripts — `package.json`**

```json
{
  "name": "chaine-pmt",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "studio": "remotion studio remotion/index.ts",
    "image": "remotion still remotion/index.ts"
  },
  "dependencies": {
    "@remotion/bundler": "4.0.533",
    "@remotion/cli": "4.0.533",
    "@remotion/google-fonts": "4.0.533",
    "@remotion/media": "4.0.533",
    "@remotion/renderer": "4.0.533",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "remotion": "4.0.533"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "19.3.0",
    "tsx": "^4.23.0",
    "typescript": "^5.6.0",
    "vitest": "^3.0.0"
  }
}
```

Run : `npm install` → aucune erreur.

- [ ] **Step 2 : `tsconfig.json`, `vitest.config.ts`, `.gitignore`**

`tsconfig.json` :

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
    "jsx": "react-jsx",
    "types": ["node"]
  },
  "include": ["noyau/**/*.ts", "remotion/**/*.ts", "remotion/**/*.tsx", "vitest.config.ts", "vitest.rendu.config.ts"]
}
```

`vitest.config.ts` :

```ts
import { configDefaults, defineConfig } from 'vitest/config';

// Les tests de rendu réel (*.e2e.test.ts) sont lents : ils passent par `npm run test:rendu`.
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, '**/*.e2e.test.ts', '.venv/**'] },
});
```

`.gitignore` : ajouter une ligne `sortie/` (images de vérification).

- [ ] **Step 3 : `remotion/charte.ts` et `remotion/police.ts`**

```ts
import reglagesJson from '../reglages.json';
import type { Reglages } from '../noyau/types';

const reglages: Reglages = reglagesJson;

export const charte = reglages.charte;
export const durees = reglages.durees;
export const LARGEUR = 1920;
export const HAUTEUR = 1080;
// Cadence des compositions d'habillage affichées seules dans le Studio.
export const FPS_HABILLAGE = 30;
export const NOIR_TEXTE = '#1d1d1b';
```

```ts
import { loadFont } from '@remotion/google-fonts/OpenSans';

export const { fontFamily: police } = loadFont('normal', {
  weights: ['400', '700'],
  subsets: ['latin', 'latin-ext'],
});
```

- [ ] **Step 4 : `remotion/composants/LogoPMT.tsx`**

```tsx
import type { FC } from 'react';
import { charte } from '../charte';
import { police } from '../police';

// Carré bleu, bande rouge à gauche, coin bleu-gris, texte « PMT ».
export const LogoPMT: FC<{ taille: number }> = ({ taille }) => (
  <div
    style={{
      width: taille,
      height: taille,
      position: 'relative',
      overflow: 'hidden',
      borderRadius: taille * 0.08,
      backgroundColor: charte.bleu,
    }}
  >
    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: taille * 0.14, backgroundColor: charte.rouge }} />
    <div
      style={{
        position: 'absolute', right: 0, top: 0, width: 0, height: 0,
        borderTop: `${taille * 0.3}px solid ${charte.bleuGris}`,
        borderLeft: `${taille * 0.3}px solid transparent`,
      }}
    />
    <div
      style={{
        position: 'absolute', inset: 0, paddingLeft: taille * 0.14,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: police, fontWeight: 700, fontSize: taille * 0.34, color: charte.blanc,
      }}
    >
      {charte.nomChaine}
    </div>
  </div>
);
```

- [ ] **Step 5 : `remotion/apercus.tsx`, `remotion/Root.tsx`, `remotion/index.ts`**

`remotion/apercus.tsx` :

```tsx
import type { FC } from 'react';
import { AbsoluteFill } from 'remotion';
import { charte } from './charte';
import { LogoPMT } from './composants/LogoPMT';

export const ApercuLogo: FC = () => (
  <AbsoluteFill style={{ backgroundColor: charte.blanc, alignItems: 'center', justifyContent: 'center' }}>
    <LogoPMT taille={400} />
  </AbsoluteFill>
);
```

`remotion/Root.tsx` :

```tsx
import type { FC } from 'react';
import { Folder, Still } from 'remotion';
import { ApercuLogo } from './apercus';

export const RemotionRoot: FC = () => (
  <Folder name="Habillage">
    <Still id="Logo" component={ApercuLogo} width={600} height={600} />
  </Folder>
);
```

`remotion/index.ts` :

```ts
import { registerRoot } from 'remotion';
import { RemotionRoot } from './Root';

registerRoot(RemotionRoot);
```

- [ ] **Step 6 : Vérifier**

Run : `npm run typecheck` → OK ; `npm test` → tous PASS (les tests existants ne changent pas).
Run : `npm run image -- Logo sortie/logo.png` (le premier lancement télécharge Chrome Headless Shell) → `sortie/logo.png` créé.
Ouvrir `sortie/logo.png` (outil Read) : carré bleu, bande rouge à gauche, coin bleu-gris en haut à droite, « PMT » blanc en gras lisible et centré. Si le rendu échoue à cause du « & » du chemin, s'arrêter et signaler l'erreur exacte.

- [ ] **Step 7 : Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore remotion/
git commit -m "Projet Remotion : charte, police Open Sans et logo PMT" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5 : Générique, intertitre et carton de fin

**Files:**
- Create: `remotion/composants/Generique.tsx`, `remotion/composants/Intertitre.tsx`, `remotion/composants/CartonFin.tsx`
- Modify: `remotion/Root.tsx`

**Interfaces:**
- Consumes : `charte`, `durees`, `FPS_HABILLAGE`, `LARGEUR`, `HAUTEUR`, `police`, `LogoPMT` (Task 4) ; `enImages` (Task 2).
- Produces :
  - `Generique: FC<{ titre: string; duree: number }>` (duree en images)
  - `Intertitre: FC<{ titre: string; numero: number; duree: number }>`
  - `CartonFin: FC<{ duree: number }>`
  - compositions Studio `Generique`, `Intertitre`, `CartonFin` (dossier « Habillage »)

- [ ] **Step 1 : `remotion/composants/Generique.tsx`**

```tsx
import type { FC } from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { charte } from '../charte';
import { police } from '../police';
import { LogoPMT } from './LogoPMT';

// Les formes de la charte se construisent, puis le logo et le titre apparaissent.
export const Generique: FC<{ titre: string; duree: number }> = ({ titre, duree }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entree = (delai: number) => spring({ frame: frame - delai, fps, config: { damping: 200 } });
  const sortie = interpolate(frame, [duree - 10, duree], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const bande = entree(0);
  const cercle = entree(8);
  const triangle = entree(16);
  const texte = entree(30);

  return (
    <AbsoluteFill style={{ backgroundColor: charte.blanc, opacity: sortie, fontFamily: police }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 260, backgroundColor: charte.rouge, transform: `translateX(${(bande - 1) * 260}px)` }} />
      <div style={{ position: 'absolute', left: 180, top: 140, width: 220, height: 220, borderRadius: '50%', backgroundColor: charte.bleu, transform: `scale(${cercle})` }} />
      <div
        style={{
          position: 'absolute', right: 0, bottom: 0, width: 0, height: 0,
          borderBottom: `420px solid ${charte.bleuGris}`, borderLeft: '420px solid transparent',
          transform: `translateY(${(1 - triangle) * 420}px)`,
        }}
      />
      <div
        style={{
          position: 'absolute', left: 460, right: 200, top: 0, bottom: 0,
          display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 36,
          opacity: texte, transform: `translateY(${(1 - texte) * 40}px)`,
        }}
      >
        <LogoPMT taille={140} />
        <div style={{ fontSize: 76, fontWeight: 700, color: charte.bleu, lineHeight: 1.15 }}>{titre}</div>
      </div>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2 : `remotion/composants/Intertitre.tsx`**

```tsx
import type { FC } from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { charte } from '../charte';
import { police } from '../police';

export const Intertitre: FC<{ titre: string; numero: number; duree: number }> = ({ titre, numero, duree }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const apparition = spring({ frame, fps, config: { damping: 200 } });
  const sortie = interpolate(frame, [duree - 8, duree], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: charte.bleu, opacity: sortie, fontFamily: police,
        justifyContent: 'center', paddingLeft: 200, paddingRight: 200,
      }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 40 + 120 * apparition, backgroundColor: charte.rouge }} />
      <div style={{ color: charte.bleuGris, fontSize: 40, fontWeight: 700, opacity: apparition }}>Chapitre {numero}</div>
      <div
        style={{
          color: charte.blanc, fontSize: 84, fontWeight: 700, lineHeight: 1.15,
          opacity: apparition, transform: `translateX(${(1 - apparition) * 60}px)`,
        }}
      >
        {titre}
      </div>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 3 : `remotion/composants/CartonFin.tsx`**

```tsx
import type { FC } from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { charte } from '../charte';
import { police } from '../police';
import { LogoPMT } from './LogoPMT';

export const CartonFin: FC<{ duree: number }> = ({ duree }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame, fps, config: { damping: 200 } });
  const texte = spring({ frame: frame - 12, fps, config: { damping: 200 } });
  const sortie = interpolate(frame, [duree - 15, duree], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{ backgroundColor: charte.blanc, opacity: sortie, fontFamily: police, alignItems: 'center', justifyContent: 'center', gap: 40 }}
    >
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 24, backgroundColor: charte.rouge }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 24, height: 12, backgroundColor: charte.bleu }} />
      <div style={{ transform: `scale(${logo})` }}>
        <LogoPMT taille={260} />
      </div>
      <div style={{ opacity: texte, textAlign: 'center' }}>
        <div style={{ fontSize: 64, fontWeight: 700, color: charte.bleu }}>Merci d'avoir regardé !</div>
        <div style={{ fontSize: 44, color: charte.rouge, marginTop: 12 }}>
          Abonnez-vous à {charte.nomChaine} pour ne rien manquer
        </div>
      </div>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 4 : Déclarer les compositions — `remotion/Root.tsx`**

```tsx
import type { FC } from 'react';
import { Composition, Folder, Still } from 'remotion';
import { enImages } from '../noyau/images';
import { ApercuLogo } from './apercus';
import { durees, FPS_HABILLAGE, HAUTEUR, LARGEUR } from './charte';
import { CartonFin } from './composants/CartonFin';
import { Generique } from './composants/Generique';
import { Intertitre } from './composants/Intertitre';

const generique = enImages(durees.generique, FPS_HABILLAGE);
const intertitre = enImages(durees.intertitre, FPS_HABILLAGE);
const cartonFin = enImages(durees.cartonFin, FPS_HABILLAGE);

export const RemotionRoot: FC = () => (
  <Folder name="Habillage">
    <Still id="Logo" component={ApercuLogo} width={600} height={600} />
    <Composition
      id="Generique" component={Generique} durationInFrames={generique} fps={FPS_HABILLAGE} width={LARGEUR} height={HAUTEUR}
      defaultProps={{ titre: 'There : exportez vos documents en Markdown pour l’IA', duree: generique }}
    />
    <Composition
      id="Intertitre" component={Intertitre} durationInFrames={intertitre} fps={FPS_HABILLAGE} width={LARGEUR} height={HAUTEUR}
      defaultProps={{ titre: 'Windows + V : retrouvez tout ce que vous avez copié', numero: 2, duree: intertitre }}
    />
    <Composition
      id="CartonFin" component={CartonFin} durationInFrames={cartonFin} fps={FPS_HABILLAGE} width={LARGEUR} height={HAUTEUR}
      defaultProps={{ duree: cartonFin }}
    />
  </Folder>
);
```

- [ ] **Step 5 : Vérification visuelle**

Run : `npm run typecheck` → OK.
Run :
```bash
npm run image -- Generique sortie/generique-20.png --frame=20
npm run image -- Generique sortie/generique-80.png --frame=80
npm run image -- Intertitre sortie/intertitre.png --frame=40
npm run image -- CartonFin sortie/carton.png --frame=60
```
Ouvrir chaque image (outil Read) et vérifier : image 20 du générique = formes en cours d'apparition, sans texte ; image 80 = bande rouge, cercle bleu, triangle bleu-gris, logo PMT et titre bleu sur deux lignes au plus, rien ne déborde du cadre ; intertitre = fond bleu, « Chapitre 2 » bleu-gris, titre blanc lisible ; carton = logo PMT centré, « Merci d'avoir regardé ! » et invitation à s'abonner, bandes rouge et bleue en bas. Corriger les tailles ou positions qui débordent (en gardant la structure) et le signaler dans le rapport.

- [ ] **Step 6 : Commit**

```bash
git add remotion/
git commit -m "Habillage Remotion : générique, intertitre et carton de fin PMT" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6 : Encart de définition, volume aux raccords et décalage du logo

**Files:**
- Create: `remotion/calculs.ts`, `remotion/composants/EncartDefinition.tsx`
- Test: `remotion/calculs.test.ts`
- Modify: `remotion/apercus.tsx`, `remotion/Root.tsx`

**Interfaces:**
- Consumes : `EncartImages` (Task 3) ; `charte`, `NOIR_TEXTE`, `police` (Task 4).
- Produces :
  - `TRANSITION_LOGO = 10`, `DECALAGE_LOGO = 300`
  - `volumeRaccord(image: number, duree: number, fondu: number): number` — rampe linéaire sur `fondu` images au début et à la fin d'un segment (0,5 sur l'image de raccord quand `fondu = 1`)
  - `decalageLogo(image: number, encarts: EncartImages[]): number` — px vers le bas pendant un encart `haut`, avec transition de `TRANSITION_LOGO` images avant et après
  - `EncartDefinition: FC<{ terme: string; definition: string; position: PositionEncart; duree: number }>`
  - composition Studio `EncartDefinition` (dossier « Habillage »)

- [ ] **Step 1 : Écrire les tests** (`remotion/calculs.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import type { EncartImages } from '../noyau/decisions';
import { DECALAGE_LOGO, decalageLogo, volumeRaccord } from './calculs';

describe('volumeRaccord', () => {
  it('atténue la première et la dernière image avec un fondu d\'une image', () => {
    expect(volumeRaccord(0, 30, 1)).toBe(0.5);
    expect(volumeRaccord(15, 30, 1)).toBe(1);
    expect(volumeRaccord(29, 30, 1)).toBe(0.5);
  });
  it('fait une rampe sur plusieurs images', () => {
    expect(volumeRaccord(0, 30, 2)).toBe(0.25);
    expect(volumeRaccord(1, 30, 2)).toBe(0.75);
    expect(volumeRaccord(2, 30, 2)).toBe(1);
  });
});

describe('decalageLogo', () => {
  const encart = (p: Partial<EncartImages>): EncartImages => ({
    terme: 'API', definition: 'x', position: 'haut', debut: 100, duree: 60, ...p,
  });
  it('descend le logo pendant un encart en haut, avec transitions', () => {
    const e = [encart({})];
    expect(decalageLogo(85, e)).toBe(0);
    expect(decalageLogo(95, e)).toBe(DECALAGE_LOGO / 2);
    expect(decalageLogo(120, e)).toBe(DECALAGE_LOGO);
    expect(decalageLogo(165, e)).toBe(DECALAGE_LOGO / 2);
    expect(decalageLogo(175, e)).toBe(0);
  });
  it('ne bouge pas pour un encart en bas', () => {
    expect(decalageLogo(120, [encart({ position: 'bas' })])).toBe(0);
  });
});
```

- [ ] **Step 2 : Vérifier qu'ils échouent**

Run : `npm test -- remotion/calculs.test.ts` → FAIL (module introuvable).

- [ ] **Step 3 : Implémenter `remotion/calculs.ts`**

```ts
import type { EncartImages } from '../noyau/decisions';

export const TRANSITION_LOGO = 10;
export const DECALAGE_LOGO = 300;

// Micro-fondu aux raccords pour éviter les clics : rampe sur `fondu` images à chaque extrémité.
export function volumeRaccord(image: number, duree: number, fondu: number): number {
  const entree = (image + 0.5) / fondu;
  const sortie = (duree - image - 0.5) / fondu;
  return Math.max(0, Math.min(1, entree, sortie));
}

// Le logo (en haut à droite) descend sous un encart affiché en haut.
export function decalageLogo(image: number, encarts: EncartImages[]): number {
  let facteur = 0;
  for (const e of encarts) {
    if (e.position !== 'haut') continue;
    const montee = (image - (e.debut - TRANSITION_LOGO)) / TRANSITION_LOGO;
    const descente = (e.debut + e.duree + TRANSITION_LOGO - image) / TRANSITION_LOGO;
    facteur = Math.max(facteur, Math.max(0, Math.min(1, montee, descente)));
  }
  return facteur * DECALAGE_LOGO;
}
```

- [ ] **Step 4 : Vérifier que les tests passent**

Run : `npm test -- remotion/calculs.test.ts` → 4 PASS.

- [ ] **Step 5 : `remotion/composants/EncartDefinition.tsx`**

```tsx
import type { FC } from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { PositionEncart } from '../../noyau/types';
import { charte, NOIR_TEXTE } from '../charte';
import { police } from '../police';

type Proprietes = { terme: string; definition: string; position: PositionEncart; duree: number };

export const EncartDefinition: FC<Proprietes> = ({ terme, definition, position, duree }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entree = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 15 });
  const sortie = interpolate(frame, [duree - 12, duree], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const visible = Math.min(entree, sortie);
  const ancrage = position === 'haut' ? { top: 48 } : { bottom: 48 };

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute', right: 48, ...ancrage, width: 720,
          display: 'flex', overflow: 'hidden', borderRadius: 12,
          backgroundColor: charte.blanc, boxShadow: '0 12px 40px rgba(0, 0, 0, 0.25)',
          fontFamily: police, opacity: visible, transform: `translateX(${(1 - visible) * 120}px)`,
        }}
      >
        <div style={{ width: 14, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, backgroundColor: charte.rouge }} />
          <div style={{ flex: 1, backgroundColor: charte.bleu }} />
        </div>
        <div style={{ padding: '22px 28px' }}>
          <div style={{ fontSize: 38, fontWeight: 700, color: charte.bleu }}>{terme}</div>
          <div style={{ fontSize: 28, color: NOIR_TEXTE, lineHeight: 1.3, marginTop: 6 }}>{definition}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 6 : Aperçu dans le Studio**

Dans `remotion/apercus.tsx`, ajouter (en gardant `ApercuLogo`) :

```tsx
import type { PositionEncart } from '../noyau/types';
import { EncartDefinition } from './composants/EncartDefinition';

// Fond bleu-gris pour simuler la vidéo derrière l'encart.
export const ApercuEncart: FC<{ terme: string; definition: string; position: PositionEncart; duree: number }> = props => (
  <AbsoluteFill style={{ backgroundColor: charte.bleuGris }}>
    <EncartDefinition {...props} />
  </AbsoluteFill>
);
```

Dans `remotion/Root.tsx`, importer `ApercuEncart` et ajouter dans le dossier « Habillage », avec `const encart = enImages(durees.encart, FPS_HABILLAGE);` en tête de fichier :

```tsx
    <Composition
      id="EncartDefinition" component={ApercuEncart} durationInFrames={encart} fps={FPS_HABILLAGE} width={LARGEUR} height={HAUTEUR}
      defaultProps={{
        terme: 'Markdown',
        definition: 'Format de texte simple qui utilise des symboles (#, *, |…) pour indiquer la mise en forme : titres, gras, tableaux.',
        position: 'bas' as const,
        duree: encart,
      }}
    />
```

- [ ] **Step 7 : Vérification visuelle**

Run : `npm run typecheck` → OK ; `npm run image -- EncartDefinition sortie/encart.png --frame=60`.
Ouvrir `sortie/encart.png` : carte blanche en bas à droite, bande rouge (haut) / bleue (bas) à gauche, « Markdown » en gras bleu, définition sur deux ou trois lignes lisibles, rien ne sort du cadre.

- [ ] **Step 8 : Commit**

```bash
git add remotion/
git commit -m "Encart de définition, volume aux raccords et décalage du logo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7 : Serveur de fichiers local

**Files:**
- Create: `remotion/scripts/serveur-fichiers.ts`
- Test: `remotion/scripts/serveur-fichiers.test.ts`

**Interfaces:**
- Produces :
  - `interface ServeurFichiers { url: string; fermer(): Promise<void> }`
  - `cheminDemande(racine: string, urlDemandee: string): string | null` — `null` si le chemin sort de `racine`
  - `lirePlage(entete: string | undefined, taille: number): { debut: number; fin: number } | null | 'invalide'`
  - `demarrerServeur(racine: string, port?: number): Promise<ServeurFichiers>` — écoute sur `127.0.0.1` (port 0 = libre), GET/HEAD/OPTIONS, réponses 200/206/404/405/416, en-têtes CORS.

- [ ] **Step 1 : Écrire les tests** (`remotion/scripts/serveur-fichiers.test.ts`)

```ts
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cheminDemande, demarrerServeur, lirePlage, type ServeurFichiers } from './serveur-fichiers';

describe('cheminDemande', () => {
  it('refuse de sortir de la racine', () => {
    const racine = path.resolve('/racine');
    expect(cheminDemande(racine, '/..%2fsecret')).toBeNull();
    expect(cheminDemande(racine, '/a%20b/video.mp4')).toBe(path.join(racine, 'a b', 'video.mp4'));
  });
});

describe('lirePlage', () => {
  it('lit les plages HTTP', () => {
    expect(lirePlage(undefined, 1000)).toBeNull();
    expect(lirePlage('bytes=100-199', 1000)).toEqual({ debut: 100, fin: 199 });
    expect(lirePlage('bytes=900-', 1000)).toEqual({ debut: 900, fin: 999 });
    expect(lirePlage('bytes=-100', 1000)).toEqual({ debut: 900, fin: 999 });
    expect(lirePlage('bytes=2000-', 1000)).toBe('invalide');
    expect(lirePlage('octets=1-2', 1000)).toBe('invalide');
  });
});

describe('demarrerServeur', () => {
  let serveur: ServeurFichiers;
  const contenu = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256));

  beforeAll(async () => {
    const racine = await mkdtemp(path.join(os.tmpdir(), 'pmt-serveur-'));
    await mkdir(path.join(racine, 'a b'));
    await writeFile(path.join(racine, 'a b', 'video.mp4'), contenu);
    serveur = await demarrerServeur(racine);
  });
  afterAll(() => serveur.fermer());

  it('sert un fichier entier avec CORS', async () => {
    const r = await fetch(`${serveur.url}/a%20b/video.mp4`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('video/mp4');
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
    expect(Buffer.from(await r.arrayBuffer())).toEqual(contenu);
  });
  it('sert une plage', async () => {
    const r = await fetch(`${serveur.url}/a%20b/video.mp4`, { headers: { Range: 'bytes=100-199' } });
    expect(r.status).toBe(206);
    expect(r.headers.get('content-range')).toBe('bytes 100-199/1000');
    expect(Buffer.from(await r.arrayBuffer())).toEqual(contenu.subarray(100, 200));
  });
  it('refuse une plage impossible', async () => {
    const r = await fetch(`${serveur.url}/a%20b/video.mp4`, { headers: { Range: 'bytes=5000-' } });
    expect(r.status).toBe(416);
  });
  it('répond 404 pour un fichier absent et HEAD sans corps', async () => {
    expect((await fetch(`${serveur.url}/absent.mp4`)).status).toBe(404);
    const h = await fetch(`${serveur.url}/a%20b/video.mp4`, { method: 'HEAD' });
    expect(h.status).toBe(200);
    expect(h.headers.get('content-length')).toBe('1000');
    expect((await h.arrayBuffer()).byteLength).toBe(0);
  });
});
```

- [ ] **Step 2 : Vérifier qu'ils échouent**

Run : `npm test -- remotion/scripts/serveur-fichiers.test.ts` → FAIL (module introuvable).

- [ ] **Step 3 : Implémenter `remotion/scripts/serveur-fichiers.ts`**

```ts
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

// Sert source.mp4 au lecteur Remotion (Studio et rendu) : plages HTTP pour la lecture vidéo, CORS pour le Studio.
export interface ServeurFichiers {
  url: string;
  fermer(): Promise<void>;
}

const TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.json': 'application/json',
  '.png': 'image/png',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Range',
  'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
};

export function cheminDemande(racine: string, urlDemandee: string): string | null {
  const base = path.resolve(racine);
  let relatif: string;
  try {
    relatif = decodeURIComponent(new URL(urlDemandee, 'http://local').pathname);
  } catch {
    return null;
  }
  const chemin = path.resolve(base, `.${relatif}`);
  return chemin.startsWith(base + path.sep) ? chemin : null;
}

export function lirePlage(entete: string | undefined, taille: number): { debut: number; fin: number } | null | 'invalide' {
  if (!entete) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(entete.trim());
  if (!m || (m[1] === '' && m[2] === '')) return 'invalide';
  let debut: number;
  let fin: number;
  if (m[1] === '') {
    debut = Math.max(0, taille - Number(m[2]));
    fin = taille - 1;
  } else {
    debut = Number(m[1]);
    fin = m[2] === '' ? taille - 1 : Math.min(Number(m[2]), taille - 1);
  }
  return debut >= taille || debut > fin ? 'invalide' : { debut, fin };
}

export function demarrerServeur(racine: string, port = 0): Promise<ServeurFichiers> {
  const serveur = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS).end();
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, CORS).end();
      return;
    }
    const chemin = cheminDemande(racine, req.url ?? '/');
    const infos = chemin ? await stat(chemin).catch(() => null) : null;
    if (!chemin || !infos?.isFile()) {
      res.writeHead(404, CORS).end();
      return;
    }
    const plage = lirePlage(req.headers.range, infos.size);
    if (plage === 'invalide') {
      res.writeHead(416, { ...CORS, 'Content-Range': `bytes */${infos.size}` }).end();
      return;
    }
    const { debut, fin } = plage ?? { debut: 0, fin: infos.size - 1 };
    res.writeHead(plage ? 206 : 200, {
      ...CORS,
      'Content-Type': TYPES[path.extname(chemin).toLowerCase()] ?? 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Content-Length': Math.max(0, fin - debut + 1),
      ...(plage ? { 'Content-Range': `bytes ${debut}-${fin}/${infos.size}` } : {}),
    });
    if (req.method === 'HEAD' || infos.size === 0) {
      res.end();
      return;
    }
    createReadStream(chemin, { start: debut, end: fin }).pipe(res);
  });

  return new Promise((resolve, reject) => {
    serveur.once('error', reject);
    serveur.listen(port, '127.0.0.1', () => {
      const { port: reel } = serveur.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${reel}`,
        fermer: () =>
          new Promise<void>(fini => {
            serveur.closeAllConnections();
            serveur.close(() => fini());
          }),
      });
    });
  });
}
```

- [ ] **Step 4 : Vérifier que les tests passent**

Run : `npm test -- remotion/scripts/serveur-fichiers.test.ts` → 6 PASS ; `npm run typecheck` → OK.

- [ ] **Step 5 : Commit**

```bash
git add remotion/scripts/serveur-fichiers.ts remotion/scripts/serveur-fichiers.test.ts
git commit -m "Serveur de fichiers local avec plages HTTP pour la lecture de source.mp4" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8 : Vidéo montée, épisode et vidéo complète

**Files:**
- Create: `remotion/compositions/Enchainement.tsx`, `remotion/compositions/VideoMontee.tsx`, `remotion/compositions/Episode.tsx`, `remotion/compositions/VideoComplete.tsx`, `remotion/exemple.ts`
- Modify: `remotion/Root.tsx`

**Interfaces:**
- Consumes : `DecisionsEpisode`, `DecisionsVideoComplete`, `Partie`, `EncartImages`, `dureesHabillage`, `dureeEpisode`, `dureeVideoComplete` (Task 3) ; `volumeRaccord`, `decalageLogo` (Task 6) ; `Generique`, `Intertitre`, `CartonFin` (Task 5) ; `EncartDefinition` (Task 6) ; `LogoPMT` (Task 4) ; `<Video>` de `@remotion/media` (props `src`, `trimBefore`, `trimAfter` en images, `volume` fonction de l'image, `style`).
- Produces :
  - `type ProprietesEpisode = { decisions: DecisionsEpisode }`, `Episode: FC<ProprietesEpisode>`
  - `type ProprietesVideoComplete = { decisions: DecisionsVideoComplete }`, `VideoComplete: FC<ProprietesVideoComplete>`
  - compositions `Episode` et `VideoComplete` (1920×1080, durée et cadence calculées depuis les props), identifiants utilisés par le rendu (Task 10)
  - `exempleEpisode`, `exempleVideoComplete` (décisions sans vidéo, pour le Studio)

- [ ] **Step 1 : Vérifier l'API de `<Video>`**

Ouvrir les déclarations de type de `@remotion/media` dans `node_modules/@remotion/media/dist/` et confirmer que `Video` accepte `src: string`, `trimBefore?: number`, `trimAfter?: number` (en images), `volume?: number | ((frame: number) => number)` et `style`. Si un nom diffère, s'arrêter et signaler (NEEDS_CONTEXT) avec la signature réelle.

- [ ] **Step 2 : `remotion/compositions/Enchainement.tsx`**

```tsx
import type { FC, ReactNode } from 'react';
import { Series } from 'remotion';

export interface Morceau {
  cle: string;
  duree: number;
  contenu: ReactNode;
}

// Enchaîne les morceaux bout à bout ; un morceau vide est ignoré.
export const Enchainement: FC<{ morceaux: Morceau[]; premount: number }> = ({ morceaux, premount }) => (
  <Series>
    {morceaux
      .filter(m => m.duree > 0)
      .map(m => (
        <Series.Sequence key={m.cle} durationInFrames={m.duree} premountFor={premount}>
          {m.contenu}
        </Series.Sequence>
      ))}
  </Series>
);
```

- [ ] **Step 3 : `remotion/compositions/VideoMontee.tsx`**

```tsx
import { Video } from '@remotion/media';
import type { FC } from 'react';
import { AbsoluteFill, Sequence, Series, useCurrentFrame, useVideoConfig } from 'remotion';
import type { EncartImages, Partie } from '../../noyau/decisions';
import { decalageLogo, volumeRaccord } from '../calculs';
import { EncartDefinition } from '../composants/EncartDefinition';
import { LogoPMT } from '../composants/LogoPMT';

const LogoCoin: FC<{ encarts: EncartImages[] }> = ({ encarts }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', top: 40, right: 40, transform: `translateY(${decalageLogo(frame, encarts)}px)` }}>
      <LogoPMT taille={110} />
    </div>
  );
};

// Segments conservés de source.mp4 bout à bout (jump cuts), logo en continu, encarts aux temps décidés.
export const VideoMontee: FC<{ partie: Partie; sourceUrl: string; fondu: number }> = ({ partie, sourceUrl, fondu }) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      <Series>
        {partie.segments.map(s => (
          <Series.Sequence key={s.debut} durationInFrames={s.fin - s.debut} premountFor={fps}>
            <Video
              src={sourceUrl}
              trimBefore={s.debut}
              trimAfter={s.fin}
              volume={f => volumeRaccord(f, s.fin - s.debut, fondu)}
              style={{ width: '100%', height: '100%' }}
            />
          </Series.Sequence>
        ))}
      </Series>
      {partie.encarts.map(e => (
        <Sequence key={e.terme} from={e.debut} durationInFrames={e.duree} premountFor={fps}>
          <EncartDefinition terme={e.terme} definition={e.definition} position={e.position} duree={e.duree} />
        </Sequence>
      ))}
      <LogoCoin encarts={partie.encarts} />
    </AbsoluteFill>
  );
};
```

- [ ] **Step 4 : `remotion/compositions/Episode.tsx` et `VideoComplete.tsx`**

```tsx
import type { FC } from 'react';
import type { DecisionsEpisode } from '../../noyau/decisions';
import { CartonFin } from '../composants/CartonFin';
import { Generique } from '../composants/Generique';
import { Enchainement } from './Enchainement';
import { VideoMontee } from './VideoMontee';

export type ProprietesEpisode = { decisions: DecisionsEpisode };

// Générique (titre du chapitre) → contenu du chapitre → carton de fin.
export const Episode: FC<ProprietesEpisode> = ({ decisions: d }) => (
  <Enchainement
    premount={d.fps}
    morceaux={[
      { cle: 'generique', duree: d.durees.generique, contenu: <Generique titre={d.titre} duree={d.durees.generique} /> },
      { cle: 'contenu', duree: d.partie.duree, contenu: <VideoMontee partie={d.partie} sourceUrl={d.sourceUrl} fondu={d.durees.fonduAudio} /> },
      { cle: 'carton', duree: d.durees.cartonFin, contenu: <CartonFin duree={d.durees.cartonFin} /> },
    ]}
  />
);
```

```tsx
import type { FC } from 'react';
import type { DecisionsVideoComplete } from '../../noyau/decisions';
import { CartonFin } from '../composants/CartonFin';
import { Generique } from '../composants/Generique';
import { Intertitre } from '../composants/Intertitre';
import { Enchainement, type Morceau } from './Enchainement';
import { VideoMontee } from './VideoMontee';

export type ProprietesVideoComplete = { decisions: DecisionsVideoComplete };

// Générique (titre du montage) → chapitre 1 → intertitre → chapitre 2 → … → carton de fin.
export const VideoComplete: FC<ProprietesVideoComplete> = ({ decisions: d }) => {
  const morceaux: Morceau[] = [
    { cle: 'generique', duree: d.durees.generique, contenu: <Generique titre={d.titre} duree={d.durees.generique} /> },
  ];
  d.parties.forEach((p, i) => {
    if (i > 0) {
      morceaux.push({
        cle: `intertitre-${i}`, duree: d.durees.intertitre,
        contenu: <Intertitre titre={p.titre} numero={i + 1} duree={d.durees.intertitre} />,
      });
    }
    morceaux.push({
      cle: `partie-${i}`, duree: p.duree,
      contenu: <VideoMontee partie={p} sourceUrl={d.sourceUrl} fondu={d.durees.fonduAudio} />,
    });
  });
  morceaux.push({ cle: 'carton', duree: d.durees.cartonFin, contenu: <CartonFin duree={d.durees.cartonFin} /> });
  return <Enchainement morceaux={morceaux} premount={d.fps} />;
};
```

- [ ] **Step 5 : `remotion/exemple.ts`**

```ts
import reglagesJson from '../reglages.json';
import { dureesHabillage, type DecisionsEpisode, type DecisionsVideoComplete } from '../noyau/decisions';
import type { Reglages } from '../noyau/types';
import { FPS_HABILLAGE } from './charte';

// Décisions sans vidéo : le Studio affiche l'habillage seul tant qu'aucun tournage n'est chargé (voir `npm run apercu`).
const reglages: Reglages = reglagesJson;
const durees = dureesHabillage(reglages, FPS_HABILLAGE);

export const exempleEpisode: DecisionsEpisode = {
  fps: FPS_HABILLAGE,
  sourceUrl: '',
  titre: "Titre de l'épisode",
  partie: { titre: '', segments: [], encarts: [], duree: 0 },
  durees,
};

export const exempleVideoComplete: DecisionsVideoComplete = {
  fps: FPS_HABILLAGE,
  sourceUrl: '',
  titre: 'Titre de la vidéo',
  parties: [],
  durees,
};
```

- [ ] **Step 6 : Déclarer les compositions — `remotion/Root.tsx`**

Envelopper le contenu existant dans un fragment et ajouter, hors du dossier « Habillage » (imports à compléter : `CalculateMetadataFunction` de `remotion`, `dureeEpisode`, `dureeVideoComplete` de `../noyau/decisions`, `Episode`, `ProprietesEpisode`, `VideoComplete`, `ProprietesVideoComplete`, `exempleEpisode`, `exempleVideoComplete`) :

```tsx
const metaEpisode: CalculateMetadataFunction<ProprietesEpisode> = ({ props }) => ({
  durationInFrames: Math.max(1, dureeEpisode(props.decisions)),
  fps: props.decisions.fps,
});

const metaVideoComplete: CalculateMetadataFunction<ProprietesVideoComplete> = ({ props }) => ({
  durationInFrames: Math.max(1, dureeVideoComplete(props.decisions)),
  fps: props.decisions.fps,
});
```

```tsx
    <Folder name="Rendus">
      <Composition
        id="Episode" component={Episode} durationInFrames={1} fps={FPS_HABILLAGE} width={LARGEUR} height={HAUTEUR}
        defaultProps={{ decisions: exempleEpisode }} calculateMetadata={metaEpisode}
      />
      <Composition
        id="VideoComplete" component={VideoComplete} durationInFrames={1} fps={FPS_HABILLAGE} width={LARGEUR} height={HAUTEUR}
        defaultProps={{ decisions: exempleVideoComplete }} calculateMetadata={metaVideoComplete}
      />
    </Folder>
```

- [ ] **Step 7 : Vérifier**

Run : `npm run typecheck` → OK ; `npm test` → tous PASS.
Run : `npm run image -- Episode sortie/episode-exemple.png --frame=90` et `npm run image -- VideoComplete sortie/complete-exemple.png --frame=150`.
Ouvrir les images : générique avec « Titre de l'épisode » ; carton de fin pour la vidéo complète (image 150 = après les 120 images du générique). Le rendu avec une vraie vidéo est vérifié à la Task 10.

- [ ] **Step 8 : Commit**

```bash
git add remotion/
git commit -m "Compositions Episode et VideoComplete : segments montés, logo, encarts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9 : Chargement d'un tournage et aperçu dans le Studio

**Files:**
- Create: `remotion/scripts/tournage.ts`, `remotion/scripts/apercu.ts`
- Test: `remotion/scripts/tournage.test.ts`
- Modify: `package.json` (script `apercu`)

**Interfaces:**
- Consumes : `montageInitial` (`noyau/montage-initial.ts`) ; `decisionsEpisodes`, `decisionsVideoComplete` (Task 3) ; `demarrerServeur` (Task 7) ; types `Analyse`, `Montage`, `Reglages`, `StatutEpisode`.
- Produces :
  - `RACINE: string` (racine du projet)
  - `interface Tournage { dossier: string; nom: string; titre: string; analyse: Analyse; montage: Montage; reglages: Reglages }`
  - `chargerTournage(dossier: string, options: { brouillon: boolean }): Promise<Tournage>` — erreur en français si `analyse.json` manque ; `montage.json` s'il existe ; sinon `montageInitial(analyse, titre)` en brouillon, erreur sinon. `titre` = `episode.json`.titre ou nom du dossier.
  - `majStatutEpisode(dossier: string, statut: StatutEpisode, message: string | null): Promise<void>` — fusion avec le contenu existant d'`episode.json`, écriture atomique.
  - `urlSource(urlServeur: string, nom: string): string` — `<url>/<nom encodé>/source.mp4` (le serveur sert le dossier parent du tournage).
  - commande `npm run apercu -- <dossier> [complete|<numéro>]`

- [ ] **Step 1 : Écrire les tests** (`remotion/scripts/tournage.test.ts`)

```ts
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import exemple from '../../fixtures/analyse-exemple.json';
import { chargerTournage, majStatutEpisode, urlSource } from './tournage';

async function tournage(fichiers: Record<string, unknown>): Promise<string> {
  const dossier = path.join(await mkdtemp(path.join(os.tmpdir(), 'pmt-tournage-')), '2026-10-07-essai');
  await mkdir(dossier);
  for (const [nom, contenu] of Object.entries(fichiers)) {
    await writeFile(path.join(dossier, nom), JSON.stringify(contenu), 'utf-8');
  }
  return dossier;
}

describe('chargerTournage', () => {
  it("exige l'analyse", async () => {
    await expect(chargerTournage(await tournage({}), { brouillon: true })).rejects.toThrow('analyse.json absent');
  });
  it('exige montage.json hors brouillon', async () => {
    const d = await tournage({ 'analyse.json': exemple });
    await expect(chargerTournage(d, { brouillon: false })).rejects.toThrow('--brouillon');
  });
  it('construit le montage par défaut en brouillon, avec le titre de episode.json', async () => {
    const d = await tournage({ 'analyse.json': exemple, 'episode.json': { version: 1, titre: 'Essai', statut: 'analyse', message: null } });
    const t = await chargerTournage(d, { brouillon: true });
    expect(t.nom).toBe('2026-10-07-essai');
    expect(t.titre).toBe('Essai');
    expect(t.montage.titre).toBe('Essai');
    expect(t.montage.chapitres[0]).toEqual({ titre: 'Introduction', debut: 0 });
    expect(t.reglages.charte.nomChaine).toBe('PMT');
  });
  it('reprend montage.json quand il existe', async () => {
    const montage = { version: 1, titre: 'Validé', coupes: [], chapitres: [{ titre: 'Seul', debut: 0 }], termes: [] };
    const t = await chargerTournage(await tournage({ 'analyse.json': exemple, 'montage.json': montage }), { brouillon: false });
    expect(t.montage.titre).toBe('Validé');
    expect(t.titre).toBe('2026-10-07-essai');
  });
});

describe('majStatutEpisode', () => {
  it('met à jour le statut en gardant les autres champs', async () => {
    const d = await tournage({ 'episode.json': { version: 1, titre: 'Essai', statut: 'analyse', message: null, episodes: [1] } });
    await majStatutEpisode(d, 'rendu', null);
    expect(JSON.parse(await readFile(path.join(d, 'episode.json'), 'utf-8')))
      .toEqual({ version: 1, titre: 'Essai', statut: 'rendu', message: null, episodes: [1] });
  });
});

describe('urlSource', () => {
  it('encode le nom du dossier', () => {
    expect(urlSource('http://127.0.0.1:5000', 'mon essai')).toBe('http://127.0.0.1:5000/mon%20essai/source.mp4');
  });
});
```

- [ ] **Step 2 : Vérifier qu'ils échouent**

Run : `npm test -- remotion/scripts/tournage.test.ts` → FAIL (module introuvable).

- [ ] **Step 3 : Implémenter `remotion/scripts/tournage.ts`**

```ts
import { existsSync } from 'node:fs';
import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { montageInitial } from '../../noyau/montage-initial';
import type { Analyse, Montage, Reglages, StatutEpisode } from '../../noyau/types';

export const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export interface Tournage {
  dossier: string;
  nom: string;
  titre: string;
  analyse: Analyse;
  montage: Montage;
  reglages: Reglages;
}

async function lireJson<T>(chemin: string): Promise<T> {
  return JSON.parse(await readFile(chemin, 'utf-8')) as T;
}

export async function chargerTournage(dossier: string, options: { brouillon: boolean }): Promise<Tournage> {
  const nom = path.basename(dossier);
  const cheminAnalyse = path.join(dossier, 'analyse.json');
  if (!existsSync(cheminAnalyse)) throw new Error(`${nom} : analyse.json absent, lancez d'abord l'analyse.`);
  const analyse = await lireJson<Analyse>(cheminAnalyse);

  const cheminEpisode = path.join(dossier, 'episode.json');
  const episode = existsSync(cheminEpisode) ? await lireJson<{ titre?: string }>(cheminEpisode) : {};
  const titre = episode.titre ?? nom;

  const cheminMontage = path.join(dossier, 'montage.json');
  let montage: Montage;
  if (existsSync(cheminMontage)) montage = await lireJson<Montage>(cheminMontage);
  else if (options.brouillon) montage = montageInitial(analyse, titre);
  else throw new Error(`${nom} : montage.json absent. Validez le tournage dans le studio, ou utilisez --brouillon.`);

  const reglages = await lireJson<Reglages>(path.join(RACINE, 'reglages.json'));
  return { dossier, nom, titre, analyse, montage, reglages };
}

export async function majStatutEpisode(dossier: string, statut: StatutEpisode, message: string | null): Promise<void> {
  const chemin = path.join(dossier, 'episode.json');
  let episode: Record<string, unknown> = {};
  try {
    const lu: unknown = JSON.parse(await readFile(chemin, 'utf-8'));
    if (lu && typeof lu === 'object' && !Array.isArray(lu)) episode = lu as Record<string, unknown>;
  } catch {
    // absent ou illisible : on repart d'un épisode vide
  }
  const temporaire = `${chemin}.tmp`;
  await writeFile(temporaire, JSON.stringify({ ...episode, version: 1, statut, message }, null, 2), 'utf-8');
  await rename(temporaire, chemin);
}

export function urlSource(urlServeur: string, nom: string): string {
  return `${urlServeur}/${encodeURIComponent(nom)}/source.mp4`;
}
```

- [ ] **Step 4 : Vérifier que les tests passent**

Run : `npm test -- remotion/scripts/tournage.test.ts` → 6 PASS.

- [ ] **Step 5 : `remotion/scripts/apercu.ts` et script npm**

```ts
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { decisionsEpisodes, decisionsVideoComplete } from '../../noyau/decisions';
import { demarrerServeur } from './serveur-fichiers';
import { chargerTournage, RACINE, urlSource } from './tournage';

// Usage : npm run apercu -- <dossier du tournage> [complete|<numéro d'épisode>]
async function main(): Promise<void> {
  const [dossierArg, choix = '1'] = process.argv.slice(2);
  if (!dossierArg) {
    console.error("Usage : npm run apercu -- <dossier du tournage> [complete|<numéro d'épisode>]");
    process.exit(1);
  }
  const dossier = path.resolve(dossierArg);
  const t = await chargerTournage(dossier, { brouillon: true });
  const serveur = await demarrerServeur(path.dirname(dossier));
  const source = urlSource(serveur.url, t.nom);

  let composition: string;
  let props: Record<string, unknown>;
  if (choix === 'complete') {
    composition = 'VideoComplete';
    props = { decisions: decisionsVideoComplete(t.analyse, t.montage, t.reglages, source) };
  } else {
    const episodes = decisionsEpisodes(t.analyse, t.montage, t.reglages, source);
    const decisions = episodes[Number(choix) - 1];
    if (!decisions) {
      console.error(`Épisode ${choix} introuvable (${episodes.length} épisode(s)).`);
      await serveur.fermer();
      process.exit(1);
    }
    composition = 'Episode';
    props = { decisions };
  }

  const fichierProps = path.join(os.tmpdir(), `pmt-apercu-${process.pid}.json`);
  await writeFile(fichierProps, JSON.stringify(props), 'utf-8');
  console.log(`source.mp4 servi sur ${serveur.url}. Dans Remotion Studio, ouvrez la composition « ${composition} ».`);

  const cli = path.join(RACINE, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
  const studio = spawn(process.execPath, [cli, 'studio', path.join(RACINE, 'remotion', 'index.ts'), `--props=${fichierProps}`], {
    stdio: 'inherit',
    cwd: RACINE,
  });
  studio.on('exit', async code => {
    await serveur.fermer();
    process.exit(code ?? 0);
  });
}

main().catch(e => {
  console.error(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
```

Dans `package.json`, ajouter le script `"apercu": "tsx remotion/scripts/apercu.ts"`.
Vérifier que `node_modules/@remotion/cli/remotion-cli.js` existe (sinon, lire le champ `bin` de `node_modules/@remotion/cli/package.json` et utiliser ce fichier).

- [ ] **Step 6 : Vérifier**

Run : `npm run typecheck` → OK ; `npm test` → tous PASS.
Run : `npm run apercu -- donnees/tournages/2026-10-essai 1` (le dossier d'essai existe sur cette machine). Expected : le message « source.mp4 servi sur http://127.0.0.1:… », puis le Studio démarre sans erreur. Arrêter avec Ctrl+C après le démarrage (ne pas laisser tourner). Si le dossier d'essai est absent, noter que cette vérification est sautée.

- [ ] **Step 7 : Commit**

```bash
git add remotion/scripts/tournage.ts remotion/scripts/tournage.test.ts remotion/scripts/apercu.ts package.json
git commit -m "Chargement d'un tournage et aperçu dans Remotion Studio" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10 : Rendu des épisodes et de la vidéo complète

**Files:**
- Create: `remotion/scripts/rendu.ts`, `vitest.rendu.config.ts`
- Test: `remotion/scripts/rendu.test.ts`, `remotion/scripts/rendu.e2e.test.ts`
- Modify: `package.json` (scripts `rendu`, `test:rendu`)

**Interfaces:**
- Consumes : `chargerTournage`, `majStatutEpisode`, `urlSource`, `RACINE` (Task 9) ; `demarrerServeur` (Task 7) ; `decisionsEpisodes`, `decisionsVideoComplete`, `dureeEpisode` (Task 3) ; `nomFichierEpisode` (Task 2) ; compositions `Episode` / `VideoComplete` (Task 8) ; `bundle` (`@remotion/bundler`), `ensureBrowser`, `selectComposition`, `renderMedia` (`@remotion/renderer`).
- Produces :
  - `type Cible = 'tout' | 'complete' | number`
  - `interface ResultatRendu { fichier: string; ok: boolean; message: string | null }`
  - `lireArguments(args: string[]): { dossier: string; brouillon: boolean; cible: Cible }` — lève une `Error` en français si les arguments sont invalides
  - `rendreTournage(dossier: string, options: { brouillon: boolean; cible: Cible }): Promise<ResultatRendu[]>` — un rendu par cible, échecs isolés, journal `rendus/journal.txt` ; statut `rendu` dans `episode.json` seulement si tout a réussi, hors brouillon, cible `tout`.
  - commandes `npm run rendu -- <dossier> [--brouillon] [--seul <numéro>|complete]` et `npm run test:rendu`

- [ ] **Step 1 : Écrire les tests rapides** (`remotion/scripts/rendu.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { lireArguments } from './rendu';

describe('lireArguments', () => {
  it('lit le dossier et les options', () => {
    expect(lireArguments(['donnees/tournages/x'])).toEqual({ dossier: 'donnees/tournages/x', brouillon: false, cible: 'tout' });
    expect(lireArguments(['x', '--brouillon', '--seul', '2'])).toEqual({ dossier: 'x', brouillon: true, cible: 2 });
    expect(lireArguments(['--seul', 'complete', 'x'])).toEqual({ dossier: 'x', brouillon: false, cible: 'complete' });
  });
  it('refuse les arguments invalides', () => {
    expect(() => lireArguments([])).toThrow('Usage');
    expect(() => lireArguments(['x', '--seul', '0'])).toThrow('--seul');
    expect(() => lireArguments(['x', '--seul'])).toThrow('--seul');
    expect(() => lireArguments(['x', '--inconnu'])).toThrow('--inconnu');
  });
});
```

- [ ] **Step 2 : Vérifier qu'ils échouent**

Run : `npm test -- remotion/scripts/rendu.test.ts` → FAIL (module introuvable).

- [ ] **Step 3 : Implémenter `remotion/scripts/rendu.ts`**

```ts
import { bundle } from '@remotion/bundler';
import { ensureBrowser, renderMedia, selectComposition } from '@remotion/renderer';
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decisionsEpisodes, decisionsVideoComplete } from '../../noyau/decisions';
import { nomFichierEpisode } from '../../noyau/nommage';
import { demarrerServeur } from './serveur-fichiers';
import { chargerTournage, majStatutEpisode, RACINE, urlSource } from './tournage';

export type Cible = 'tout' | 'complete' | number;

export interface ResultatRendu {
  fichier: string;
  ok: boolean;
  message: string | null;
}

const USAGE = 'Usage : npm run rendu -- <dossier du tournage> [--brouillon] [--seul <numéro>|complete]';

export function lireArguments(args: string[]): { dossier: string; brouillon: boolean; cible: Cible } {
  let dossier: string | undefined;
  let brouillon = false;
  let cible: Cible = 'tout';
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '--brouillon') brouillon = true;
    else if (a === '--seul') {
      const valeur = args[++i];
      if (valeur === 'complete') cible = 'complete';
      else if (valeur !== undefined && /^[1-9]\d*$/.test(valeur)) cible = Number(valeur);
      else throw new Error(`--seul attend un numéro d'épisode (1, 2…) ou « complete ». ${USAGE}`);
    } else if (a.startsWith('--')) throw new Error(`Option inconnue : ${a}. ${USAGE}`);
    else dossier = a;
  }
  if (!dossier) throw new Error(USAGE);
  return { dossier, brouillon, cible };
}

interface Travail {
  fichier: string;
  composition: 'Episode' | 'VideoComplete';
  props: Record<string, unknown>;
}

export async function rendreTournage(dossier: string, options: { brouillon: boolean; cible: Cible }): Promise<ResultatRendu[]> {
  const t = await chargerTournage(dossier, { brouillon: options.brouillon });
  const sortie = path.join(dossier, 'rendus');
  await mkdir(sortie, { recursive: true });
  const noter = (ligne: string) => appendFile(path.join(sortie, 'journal.txt'), `${new Date().toISOString()} ${ligne}\n`, 'utf-8');

  const serveur = await demarrerServeur(path.dirname(dossier));
  const resultats: ResultatRendu[] = [];
  try {
    const source = urlSource(serveur.url, t.nom);
    const episodes = decisionsEpisodes(t.analyse, t.montage, t.reglages, source);
    const travaux: Travail[] = [];
    episodes.forEach((decisions, i) => {
      if (options.cible === 'tout' || options.cible === i + 1) {
        travaux.push({ fichier: nomFichierEpisode(i, decisions.titre), composition: 'Episode', props: { decisions } });
      }
    });
    if (options.cible === 'tout' || options.cible === 'complete') {
      travaux.push({
        fichier: 'video-complete.mp4',
        composition: 'VideoComplete',
        props: { decisions: decisionsVideoComplete(t.analyse, t.montage, t.reglages, source) },
      });
    }
    if (travaux.length === 0) throw new Error(`Rien à rendre pour « ${options.cible} » : ${episodes.length} épisode(s).`);

    await ensureBrowser();
    const serveUrl = await bundle({ entryPoint: path.join(RACINE, 'remotion', 'index.ts') });
    for (const travail of travaux) {
      const fichier = path.join(sortie, travail.fichier);
      await noter(`début ${travail.fichier}${options.brouillon ? ' (brouillon)' : ''}`);
      try {
        const composition = await selectComposition({ serveUrl, id: travail.composition, inputProps: travail.props });
        await renderMedia({
          composition,
          serveUrl,
          codec: 'h264',
          outputLocation: fichier,
          inputProps: travail.props,
          onProgress: ({ progress }) => process.stdout.write(`\r${travail.fichier} : ${Math.round(progress * 100)} %`),
        });
        process.stdout.write('\n');
        await noter(`ok ${travail.fichier}`);
        resultats.push({ fichier, ok: true, message: null });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await noter(`échec ${travail.fichier} : ${message}`);
        resultats.push({ fichier, ok: false, message });
      }
    }
  } finally {
    await serveur.fermer();
  }

  if (!options.brouillon && options.cible === 'tout' && resultats.every(r => r.ok)) {
    await majStatutEpisode(dossier, 'rendu', null);
  }
  return resultats;
}

async function main(): Promise<void> {
  const { dossier, brouillon, cible } = lireArguments(process.argv.slice(2));
  const resultats = await rendreTournage(path.resolve(dossier), { brouillon, cible });
  for (const r of resultats) console.log(`${r.ok ? 'OK    ' : 'ÉCHEC '} ${path.basename(r.fichier)}${r.message ? ` : ${r.message}` : ''}`);
  process.exit(resultats.every(r => r.ok) ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => {
    console.error(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
```

Dans `package.json`, ajouter les scripts `"rendu": "tsx remotion/scripts/rendu.ts"` et `"test:rendu": "vitest run --config vitest.rendu.config.ts"`.

- [ ] **Step 4 : Vérifier que les tests rapides passent**

Run : `npm test -- remotion/scripts/rendu.test.ts` → 2 PASS ; `npm run typecheck` → OK.

- [ ] **Step 5 : Test de bout en bout — `vitest.rendu.config.ts` et `remotion/scripts/rendu.e2e.test.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['remotion/**/*.e2e.test.ts'], testTimeout: 900_000, hookTimeout: 900_000 },
});
```

```ts
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import reglagesJson from '../../reglages.json';
import { decisionsEpisodes, dureeEpisode } from '../../noyau/decisions';
import { montageInitial } from '../../noyau/montage-initial';
import type { Analyse, Reglages } from '../../noyau/types';
import { rendreTournage } from './rendu';

function dureeVideo(fichier: string): number {
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', fichier], { encoding: 'utf-8' }));
}

it("rend les épisodes et la vidéo complète d'un tournage en brouillon", async () => {
  const dossier = path.join(await mkdtemp(path.join(os.tmpdir(), 'pmt-rendu-')), '2026-10-07-test');
  await mkdir(dossier);
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'testsrc=size=1920x1080:rate=30:duration=8',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
    path.join(dossier, 'source.mp4'),
  ]);
  const analyse: Analyse = {
    version: 1, duree: 8, fps: 30, mots: [],
    detections: [{ id: 'd0', type: 'silence', debut: 2, fin: 4 }],
    suggestions: {
      chapitres: [{ titre: 'Introduction', debut: 0 }, { titre: 'Suite', debut: 5 }],
      termes: [{ terme: 'API', definition: "Interface d'échange entre logiciels.", occurrences: [1], origine: 'glossaire' }],
      longueurs: [],
    },
    erreurSuggestions: null,
  };
  await writeFile(path.join(dossier, 'analyse.json'), JSON.stringify(analyse), 'utf-8');
  await writeFile(path.join(dossier, 'episode.json'), JSON.stringify({ version: 1, titre: 'Essai de rendu', statut: 'analyse', message: null }), 'utf-8');

  const resultats = await rendreTournage(dossier, { brouillon: true, cible: 'tout' });

  expect(resultats.map(r => [path.basename(r.fichier), r.ok, r.message])).toEqual([
    ['episode-01-introduction.mp4', true, null],
    ['episode-02-suite.mp4', true, null],
    ['video-complete.mp4', true, null],
  ]);
  const reglages: Reglages = reglagesJson;
  const attendu = decisionsEpisodes(analyse, montageInitial(analyse, 'Essai de rendu'), reglages, '')[0]!;
  expect(dureeVideo(resultats[0]!.fichier)).toBeCloseTo(dureeEpisode(attendu) / 30, 0);
  expect(await readFile(path.join(dossier, 'rendus', 'journal.txt'), 'utf-8')).toContain('ok video-complete.mp4');
  expect(JSON.parse(await readFile(path.join(dossier, 'episode.json'), 'utf-8')).statut).toBe('analyse');
  console.log(`Rendus de test dans ${path.join(dossier, 'rendus')}`);
});
```

- [ ] **Step 6 : Lancer le test de bout en bout**

Run : `npm run test:rendu` (plusieurs minutes ; le premier lancement télécharge Chrome Headless Shell) → 1 PASS.
Puis extraire une image de l'épisode 1 pendant l'encart « API » (vers 5 s : le chapitre ne dure que 3,3 s, l'encart est donc raccourci et commence dès la fin du générique de 4 s) et une image du carton de fin :
```bash
ffmpeg -y -loglevel error -ss 5 -i "<dossier rendus affiché>/episode-01-introduction.mp4" -frames:v 1 sortie/e2e-encart.png
ffmpeg -y -loglevel error -sseof -2 -i "<dossier rendus affiché>/episode-01-introduction.mp4" -frames:v 1 sortie/e2e-carton.png
```
Ouvrir les images : mire de test plein cadre avec logo PMT en haut à droite et encart « API » en bas à droite ; carton de fin PMT. Signaler toute anomalie (vidéo noire, logo absent, encart mal placé).

- [ ] **Step 7 : Rendu réel de l'essai (si `donnees/tournages/2026-10-essai/analyse.json` existe)**

Run : `npm run rendu -- donnees/tournages/2026-10-essai --brouillon --seul 1` → `OK episode-01-….mp4`.
Extraire et ouvrir trois images (2 s, 20 s, fin − 2 s) avec `ffmpeg -ss`/`-sseof` comme ci-dessus : générique avec le titre du premier chapitre, enregistrement d'écran plein cadre avec logo PMT, carton de fin. Noter dans le rapport la durée du fichier (`ffprobe`). Si le dossier d'essai est absent, noter que cette étape est sautée.

- [ ] **Step 8 : Vérification finale et commit**

Run : `npm test`, `npm run typecheck`, `cd pipeline; ..\.venv\Scripts\python -m pytest -q` → tout PASS.

```bash
git add remotion/scripts/rendu.ts remotion/scripts/rendu.test.ts remotion/scripts/rendu.e2e.test.ts vitest.rendu.config.ts package.json
git commit -m "Rendu des épisodes et de la vidéo complète avec journal et relance individuelle" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Suite

- **Plan 3 — Studio de validation** : serveur local (réutilise `remotion/scripts/serveur-fichiers.ts` et `tournage.ts`), liste des tournages, montage par le texte avec `@remotion/player` affichant `Episode` / `VideoComplete` à partir des mêmes décisions (`noyau/decisions.ts`), enregistrement automatique de `montage.json`, mise à jour du glossaire, vérifications avant rendu et lancement de `rendreTournage`.
