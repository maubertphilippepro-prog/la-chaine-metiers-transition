# Plan 10 : vignettes variées (logos, captures, gabarits) — plan de mise en œuvre

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** l'auteur pose sur la vignette jusqu'à 3 logos de logiciels (banque `donnees/logos/`) et jusqu'à 3 captures (dossier `captures/` du tournage, ou glisser-déposer), puis choisit parmi 3 ou 4 gabarits proposés en aperçu.

**Architecture :** règles pures dans le noyau (`noyau/gabarits.ts` : gabarits compatibles, gabarit retenu, logos suggérés ; `noyau/publication.ts` : modèle de vignette, migration, propriétés de la composition). Côté Remotion, des briques partagées (`remotion/composants/vignette/briques.tsx`) et un composant par gabarit ; `Vignette` aiguille selon `gabarit`. Le serveur du studio liste logos et captures, reçoit les dépôts, vérifie les fichiers avant rendu et validation ; le panneau Vignette du studio affiche un aperçu par gabarit compatible.

**Tech Stack :** TypeScript, React 19, Remotion 4.0.533 (`@remotion/player` pour les aperçus, `@remotion/renderer` pour le JPEG), Node `http`, Vitest.

Spec : [2026-10-23-vignettes-gabarits-design.md](../specs/2026-10-23-vignettes-gabarits-design.md).

## Global Constraints

- Tout en français : identifiants, commentaires, messages, libellés (style du code existant : `ErreurHttp`, `raisonX`, `problemesX`).
- Identité visuelle : logo Métiers & Transition (`LogoMT`), couleurs `charte` de `reglages.json` (rouge `#E30520`, bleu `#004C99`, bleu-gris `#9AB2C9`, blanc), police Open Sans 800 en capitales pour l'accroche. Ne jamais réintroduire le logo texte « PMT ».
- Vignette : 1280×720, JPEG ≤ `reglages.publication.vignetteOctetsMax` (2 Mo).
- 3 logos et 3 captures au plus (`MAX_ELEMENTS = 3`).
- Logos : `.png` ou `.svg` dans `donnees/logos/`. Captures : `.png`, `.jpg` ou `.jpeg` dans `<tournage>/captures/`.
- Positions et angles fixes par gabarit : aucun tirage au sort.
- Une vignette déjà enregistrée sans les nouveaux champs se lit en gabarit `classique`, sans logo ni capture ; `publication.json` reste en version 2.
- Commandes : `npm test` (tests rapides), `npm run typecheck`, `npm run test:rendu` (rendu réel, lent : ffmpeg et Chrome de Remotion).
- Fin de chaque message de commit : ligne vide puis `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Messages de commit en français, au style du dépôt (« Studio : … », « Noyau : … », « Vignette : … »).

## Fichiers

| Fichier | Rôle |
|---|---|
| `noyau/gabarits.ts` (créé) | Liste des gabarits, conditions, ordre de proposition, gabarit retenu, logos suggérés |
| `noyau/publication.ts` | `Vignette` (+ gabarit, logos, captures), `VideoPubliee.logiciels`, migration, validation, `cleVignette`, `proprietesVignette` (remplace `urlsVignette`) |
| `studio/serveur/redaction.ts` | Champ `logiciels` demandé à Claude |
| `studio/serveur/http.ts` | `lireOctets` (corps binaire) |
| `studio/serveur/publication.ts` | Banque de logos, captures (liste, dépôt), contrôles des fichiers, suggestion de logos à la rédaction |
| `studio/serveur/principal.ts` | Serveur de fichiers de `donnees/logos/` |
| `studio/commun.ts` | `DetailPublication` : `urlLogos`, `logos`, `captures` ; type `Logo` |
| `remotion/calculs.ts` | `tailleAccroche(texte, largeur)` |
| `remotion/composants/vignette/*.tsx` (créés) | Dimensions, briques, un composant par gabarit |
| `remotion/composants/Vignette.tsx` | Aiguillage vers le gabarit |
| `studio/src/logique/publication.ts` | `basculer`, `gabaritsAutres` |
| `studio/src/api.ts`, `studio/src/composants/ChoixVignette.tsx`, `CartePublication.tsx`, `EcranPublication.tsx`, `styles.css` | Panneau Vignette |
| `docs/studio.md`, `.gitignore` | Documentation, banque de logos ignorée par git |

---

### Task 1 : règles des gabarits (noyau)

**Files :**
- Create : `noyau/gabarits.ts`
- Test : `noyau/gabarits.test.ts`

**Interfaces :**
- Produces :
  - `GABARITS: readonly ['vitrine', 'demonstration', 'mosaique', 'classique']`, `type Gabarit`
  - `MAX_ELEMENTS = 3`
  - `LIBELLES_GABARIT: Record<Gabarit, string>`
  - `gabaritsCompatibles(e: { logos: number; captures: number }, dejaUtilises: Gabarit[]): Gabarit[]`
  - `gabaritRetenu(actuel: Gabarit | null, compatibles: Gabarit[]): Gabarit`
  - `logosSuggeres(logiciels: string[], banque: string[]): string[]`

- [ ] **Step 1 : écrire les tests**

`noyau/gabarits.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { gabaritRetenu, gabaritsCompatibles, logosSuggeres } from './gabarits';

describe('gabaritsCompatibles', () => {
  it('ne propose que le classique sans logo ni capture', () => {
    expect(gabaritsCompatibles({ logos: 0, captures: 0 }, [])).toEqual(['classique']);
  });
  it('propose la vitrine dès un logo, la démonstration dès une capture, la mosaïque dès deux', () => {
    expect(gabaritsCompatibles({ logos: 1, captures: 0 }, [])).toEqual(['vitrine', 'classique']);
    expect(gabaritsCompatibles({ logos: 0, captures: 1 }, [])).toEqual(['demonstration', 'classique']);
    expect(gabaritsCompatibles({ logos: 2, captures: 2 }, [])).toEqual(['vitrine', 'demonstration', 'mosaique', 'classique']);
  });
  it('relègue en fin de liste les gabarits déjà pris par les autres vidéos', () => {
    expect(gabaritsCompatibles({ logos: 2, captures: 2 }, ['vitrine', 'mosaique'])).toEqual(['demonstration', 'classique', 'vitrine', 'mosaique']);
  });
});

describe('gabaritRetenu', () => {
  it('garde le gabarit choisi tant qu’il reste possible, sinon prend le premier proposé', () => {
    expect(gabaritRetenu('mosaique', ['vitrine', 'mosaique', 'classique'])).toBe('mosaique');
    expect(gabaritRetenu('mosaique', ['vitrine', 'classique'])).toBe('vitrine');
    expect(gabaritRetenu(null, ['demonstration', 'classique'])).toBe('demonstration');
    expect(gabaritRetenu(null, [])).toBe('classique');
  });
});

describe('logosSuggeres', () => {
  const banque = ['chatgpt.svg', 'excel.png', 'microsoft-teams.png', 'notion.png', 'power-bi.svg'];
  it('associe les logiciels cités aux logos, sans casse, accents, espaces, points ni tirets', () => {
    expect(logosSuggeres(['ChatGPT', 'Microsoft Teams'], banque)).toEqual(['chatgpt.svg', 'microsoft-teams.png']);
    expect(logosSuggeres(['Power BI', 'Éxcel'], banque)).toEqual(['power-bi.svg', 'excel.png']);
  });
  it('ignore les logiciels sans logo et les doublons, et s’arrête à trois', () => {
    expect(logosSuggeres(['Word', 'excel', 'Excel'], banque)).toEqual(['excel.png']);
    expect(logosSuggeres(['excel', 'notion', 'chatgpt', 'power bi'], banque)).toEqual(['excel.png', 'notion.png', 'chatgpt.svg']);
  });
});
```

- [ ] **Step 2 : vérifier que les tests échouent**

Run : `npx vitest run noyau/gabarits.test.ts`
Expected : FAIL, « Failed to resolve import "./gabarits" ».

- [ ] **Step 3 : écrire `noyau/gabarits.ts`**

```ts
// Mises en page de la vignette, et règles pour les proposer à l'auteur.

// Ordre de proposition : les gabarits les plus riches d'abord.
export const GABARITS = ['vitrine', 'demonstration', 'mosaique', 'classique'] as const;
export type Gabarit = (typeof GABARITS)[number];

// Logos et captures posés sur une vignette, au plus.
export const MAX_ELEMENTS = 3;

export const LIBELLES_GABARIT: Record<Gabarit, string> = {
  vitrine: 'Vitrine', demonstration: 'Démonstration', mosaique: 'Mosaïque', classique: 'Classique',
};

const CONDITIONS: Record<Gabarit, (e: { logos: number; captures: number }) => boolean> = {
  vitrine: e => e.logos >= 1,
  demonstration: e => e.captures >= 1,
  mosaique: e => e.captures >= 2,
  classique: () => true,
};

// Gabarits possibles avec ces éléments ; ceux déjà pris par les autres vidéos de la publication passent en fin de liste.
export function gabaritsCompatibles(e: { logos: number; captures: number }, dejaUtilises: Gabarit[]): Gabarit[] {
  const possibles = GABARITS.filter(g => CONDITIONS[g](e));
  return [...possibles.filter(g => !dejaUtilises.includes(g)), ...possibles.filter(g => dejaUtilises.includes(g))];
}

// Le gabarit choisi tant qu'il reste possible, sinon le premier proposé.
export function gabaritRetenu(actuel: Gabarit | null, compatibles: Gabarit[]): Gabarit {
  return actuel && compatibles.includes(actuel) ? actuel : (compatibles[0] ?? 'classique');
}

const cle = (t: string) => t.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[\s_.-]+/g, '');

// Logos de la banque dont le nom (sans extension) est celui d'un logiciel cité, dans l'ordre de citation.
export function logosSuggeres(logiciels: string[], banque: string[]): string[] {
  const resultat: string[] = [];
  for (const logiciel of logiciels) {
    const logo = banque.find(f => cle(f.replace(/\.[^.]+$/, '')) === cle(logiciel));
    if (logo && !resultat.includes(logo)) resultat.push(logo);
  }
  return resultat.slice(0, MAX_ELEMENTS);
}
```

- [ ] **Step 4 : vérifier que les tests passent**

Run : `npx vitest run noyau/gabarits.test.ts`
Expected : PASS (6 tests).

- [ ] **Step 5 : commit**

```bash
git add noyau/gabarits.ts noyau/gabarits.test.ts
git commit -m "Noyau : gabarits de vignette compatibles, gabarit retenu et logos suggérés

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2 : modèle de vignette, migration et propriétés de la composition

Ajoute gabarit, logos et captures à la vignette, `logiciels` à la vidéo publiée, et l'adresse de la banque de logos de bout en bout. Le rendu ne change pas encore (le composant Remotion ignore les nouveaux champs jusqu'à la Task 5).

**Files :**
- Modify : `noyau/publication.ts`, `noyau/publication.test.ts`, `noyau/relais.test.ts`, `noyau/youtube.test.ts`
- Modify : `remotion/composants/Vignette.tsx`, `remotion/Root.tsx`, `remotion/scripts/vignette.test.ts`, `remotion/scripts/vignette.e2e.test.ts`
- Modify : `studio/commun.ts`, `studio/serveur/publication.ts`, `studio/serveur/publication.test.ts`, `studio/serveur/principal.ts`
- Modify : `studio/src/composants/ChoixVignette.tsx`, `studio/src/logique/publication.test.ts`
- Modify : `.gitignore`

**Interfaces :**
- Consumes : `Gabarit`, `GABARITS`, `MAX_ELEMENTS` (Task 1).
- Produces :
  - `interface Vignette { pose; fond; accroche; gabarit: Gabarit; logos: string[]; captures: string[]; fichier }`
  - `VideoPubliee.logiciels: string[]`
  - `BasesImages { tournage: string; poses: string; logos: string }`
  - `DOSSIER_CAPTURES = 'captures'`
  - `type ProprietesVignette = { gabarit: Gabarit; fondUrl: string | null; poseUrl: string | null; logoUrls: string[]; captureUrls: string[]; accroche: string }` (exporté par `noyau/publication.ts`, réexporté par `remotion/composants/Vignette.tsx`)
  - `proprietesVignette(v: Vignette, b: BasesImages): ProprietesVignette` (remplace `urlsVignette`, supprimé)
  - `ConfigPublication.cheminLogos: string`, `ConfigPublication.urlLogos: string`, `DetailPublication.urlLogos: string`

- [ ] **Step 1 : écrire les tests du noyau**

Dans `noyau/publication.test.ts` :

1. Remplacer `urlsVignette` par `proprietesVignette` dans l'import.
2. Compléter `VIGNETTE` :

```ts
const VIGNETTE: Vignette = {
  pose: { source: 'banque', fichier: 'surpris.jpg' },
  fond: { source: 'ecran', instant: 12.3456 },
  accroche: 'Le presse-papiers caché',
  gabarit: 'classique',
  logos: [],
  captures: [],
  fichier: 'rendus/vignettes/complete.jpg',
};
```

3. Remplacer le test « donne les adresses des images d’une vignette » par :

```ts
  it('donne les propriétés de la composition : adresses des images et accroche nettoyée', () => {
    const bases = { tournage: 'http://f/essai', poses: 'http://p', logos: 'http://l' };
    expect(proprietesVignette({ ...VIGNETTE, accroche: ' Le presse-papiers caché ' }, bases)).toEqual({
      gabarit: 'classique',
      poseUrl: 'http://p/surpris.detoure.png',
      fondUrl: 'http://f/essai/publication/images/ecran-12346.png',
      logoUrls: [],
      captureUrls: [],
      accroche: 'Le presse-papiers caché',
    });
    const riche = proprietesVignette({
      ...VIGNETTE, gabarit: 'mosaique', pose: { source: 'camera', instant: 2 }, fond: { source: 'charte' },
      logos: ['power bi.svg'], captures: ['étape 1.png', 'b.jpg'],
    }, bases);
    expect(riche).toMatchObject({
      gabarit: 'mosaique',
      poseUrl: 'http://f/essai/publication/images/camera-2000.detoure.png',
      fondUrl: null,
      logoUrls: ['http://l/power%20bi.svg'],
      captureUrls: ['http://f/essai/captures/%C3%A9tape%201.png', 'http://f/essai/captures/b.jpg'],
    });
  });
```

4. Ajouter dans `describe('raisonPublication', …)` :

```ts
  it('refuse un gabarit inconnu, trop de logos ou un nom de fichier avec un chemin', () => {
    const avec = (changement: Partial<Vignette>) => ({ ...prete(), videos: [{ ...prete().videos[0]!, vignette: { ...VIGNETTE, ...changement } }] });
    expect(raisonPublication(avec({ gabarit: 'autre' as never }))).toBe('videos[0] : vignette : gabarit invalide');
    expect(raisonPublication(avec({ logos: ['a.png', 'b.png', 'c.png', 'd.png'] }))).toBe('videos[0] : vignette : logos invalides');
    expect(raisonPublication(avec({ captures: ['../x.png'] }))).toBe('videos[0] : vignette : captures invalides');
    expect(raisonPublication(avec({ logos: ['excel.png'], captures: ['a.png', 'b.png'] }))).toBeNull();
  });
  it('exige la liste des logiciels', () => {
    const { logiciels: _, ...sans } = prete().videos[0]!;
    expect(raisonPublication({ ...prete(), videos: [sans] })).toBe('videos[0] : logiciels doit être une liste de textes');
  });
```

5. Ajouter dans `describe('appliquerModifications', …)` (à côté du test qui compare `cleVignette`) :

```ts
  it('distingue deux vignettes par le gabarit, les logos et les captures', () => {
    expect(cleVignette(VIGNETTE)).not.toBe(cleVignette({ ...VIGNETTE, gabarit: 'vitrine' }));
    expect(cleVignette(VIGNETTE)).not.toBe(cleVignette({ ...VIGNETTE, logos: ['excel.png'] }));
    expect(cleVignette(VIGNETTE)).not.toBe(cleVignette({ ...VIGNETTE, captures: ['a.png'] }));
  });
```

6. Ajouter dans `describe('migrerPublication', …)` :

```ts
  it('complète une version 2 écrite avant les vignettes variées', () => {
    const { gabarit: _g, logos: _l, captures: _c, ...ancienne } = VIGNETTE;
    const { logiciels: _, ...video } = { ...videoParDefaut('complete', PERSO), vignette: ancienne };
    const p = migrerPublication({ version: 2, qualificationParDefaut: PERSO, videos: [video, { ...videoParDefaut(1, PERSO), logiciels: ['Excel'] }] }) as Publication;
    expect(p.videos[0]!.logiciels).toEqual([]);
    expect(p.videos[0]!.vignette).toEqual({ ...ancienne, gabarit: 'classique', logos: [], captures: [] });
    expect(p.videos[1]!.logiciels).toEqual(['Excel']);
    expect(p.videos[1]!.vignette).toBeNull();
    expect(raisonPublication(p)).toBeNull();
  });
```

Le test existant `expect(migrerPublication(v2)).toBe(v2)` (ligne ~170) ne tient plus : la migration renvoie désormais un nouvel objet. Le remplacer par `expect(migrerPublication(v2)).toEqual(v2);`.

- [ ] **Step 2 : vérifier que les tests échouent**

Run : `npx vitest run noyau/publication.test.ts`
Expected : FAIL (`proprietesVignette` n'existe pas).

- [ ] **Step 3 : modifier `noyau/publication.ts`**

Import en tête :

```ts
import { GABARITS, MAX_ELEMENTS, type Gabarit } from './gabarits';
```

Types :

```ts
export interface Vignette {
  pose: PoseVignette;
  fond: FondVignette;
  accroche: string;
  gabarit: Gabarit;
  // Fichiers de donnees/logos/ et de captures/ du tournage, dans l'ordre choisi ; 3 au plus.
  logos: string[];
  captures: string[];
  // rendus/vignettes/<cible>.jpg une fois rendue ; null tant qu'elle ne l'est pas.
  fichier: string | null;
}
```

Dans `VideoPubliee`, après `accroches: string[];` :

```ts
  // Logiciels et services cités dans la vidéo, d'après la rédaction : servent à pré-cocher les logos.
  logiciels: string[];
```

`BasesImages` :

```ts
// Adresses (sans barre finale) qui servent le dossier du tournage, la banque de poses et celle de logos.
export interface BasesImages {
  tournage: string;
  poses: string;
  logos: string;
}
```

Dans `videoParDefaut`, après `accroches: [],` : `logiciels: [],`.

`cleVignette` :

```ts
// Ce qui distingue deux vignettes à l'image : pose, fond, accroche, gabarit, logos et captures (pas le fichier rendu).
export function cleVignette(v: Vignette | null): string {
  if (!v) return '';
  const pose = v.pose.source === 'banque' ? `banque:${v.pose.fichier}` : `camera:${v.pose.instant}`;
  const fond = v.fond.source === 'ecran' ? `ecran:${v.fond.instant}` : 'charte';
  return [pose, fond, v.accroche, v.gabarit, v.logos.join(','), v.captures.join(',')].join('|');
}
```

Migration : renommer la fonction actuelle en `migrerVersion1` (non exportée, corps inchangé, commentaire inchangé) et ajouter :

```ts
// Champs venus après la version 2 (vignettes variées), absents des fichiers plus anciens.
function completerVideo(v: unknown): unknown {
  if (!estObjet(v)) return v;
  const vignette = estObjet(v.vignette) ? { gabarit: 'classique', logos: [], captures: [], ...v.vignette } : v.vignette;
  return { logiciels: [], ...v, vignette };
}

// publication.json tel que lu sur le disque ou reçu du studio, mis à la forme actuelle.
export function migrerPublication(valeur: unknown): unknown {
  const v2 = migrerVersion1(valeur);
  if (!estObjet(v2) || v2.version !== 2 || !Array.isArray(v2.videos)) return v2;
  return { ...v2, videos: v2.videos.map(completerVideo) };
}
```

Validation, dans `raisonVignette`, avant la ligne `if (v.fichier !== null …)` :

```ts
  if (!GABARITS.includes(v.gabarit as Gabarit)) return 'vignette : gabarit invalide';
  for (const champ of ['logos', 'captures']) {
    const liste = v[champ];
    const valide = Array.isArray(liste) && liste.length <= MAX_ELEMENTS
      && liste.every(f => estTexte(f) && f !== '' && !/[\\/]/.test(f));
    if (!valide) return `vignette : ${champ} invalides`;
  }
```

Dans `raisonPublication`, la liste des champs textes devient `['variantesTitre', 'tags', 'accroches', 'logiciels']`.

Propriétés de la composition : remplacer `urlsVignette` par :

```ts
export const DOSSIER_CAPTURES = 'captures';

// Ce que la composition Remotion « Vignette » reçoit : gabarit, adresses HTTP des images, accroche.
export type ProprietesVignette = {
  gabarit: Gabarit;
  // Image du partage d'écran, ou null pour le fond de la charte.
  fondUrl: string | null;
  // Pose détourée (PNG transparent).
  poseUrl: string | null;
  logoUrls: string[];
  captureUrls: string[];
  accroche: string;
};

export function proprietesVignette(v: Vignette, b: BasesImages): ProprietesVignette {
  return {
    gabarit: v.gabarit,
    poseUrl: v.pose.source === 'banque'
      ? `${b.poses}/${encodeURIComponent(poseDetouree(v.pose.fichier))}`
      : `${b.tournage}/${imageCamera(v.pose.instant).detouree}`,
    fondUrl: v.fond.source === 'ecran' ? `${b.tournage}/${imageEcran(v.fond.instant)}` : null,
    logoUrls: v.logos.map(f => `${b.logos}/${encodeURIComponent(f)}`),
    captureUrls: v.captures.map(f => `${b.tournage}/${DOSSIER_CAPTURES}/${encodeURIComponent(f)}`),
    accroche: v.accroche.trim(),
  };
}
```

(`ProprietesVignette` est un alias `type`, pas une `interface` : Remotion exige des propriétés compatibles avec `Record<string, unknown>`.)

- [ ] **Step 4 : vérifier les tests du noyau**

Run : `npx vitest run noyau/publication.test.ts`
Expected : PASS.

- [ ] **Step 5 : brancher le reste (composition, serveur, studio)**

`remotion/composants/Vignette.tsx` : supprimer la définition locale de `ProprietesVignette` et la remplacer par

```ts
import type { ProprietesVignette } from '../../noyau/publication';

export type { ProprietesVignette };
```

Le composant garde son rendu actuel (il ne lit que `fondUrl`, `poseUrl`, `accroche`).

`remotion/Root.tsx`, `defaultProps` de la Still `Vignette` :

```tsx
        defaultProps={{ gabarit: 'classique', fondUrl: null, poseUrl: null, logoUrls: [], captureUrls: [], accroche: 'Windows + V : le presse-papiers caché' }}
```

`remotion/scripts/vignette.test.ts` :

```ts
const PROPS: ProprietesVignette = { gabarit: 'classique', fondUrl: null, poseUrl: null, logoUrls: [], captureUrls: [], accroche: 'Essai' };
```

avec `import type { ProprietesVignette } from '../composants/Vignette';`.

`remotion/scripts/vignette.e2e.test.ts` : ajouter `gabarit: 'classique', logoUrls: [], captureUrls: [],` aux propriétés passées à `rendreVignette` (le test est réécrit à la Task 5).

`studio/commun.ts`, dans `DetailPublication`, après `urlPoses: string;` : `urlLogos: string;`.

`studio/serveur/publication.ts` :
- import : remplacer `urlsVignette` par `proprietesVignette` ; supprimer `import type { ProprietesVignette } from '../../remotion/composants/Vignette';` et importer `type ProprietesVignette` depuis `'../../noyau/publication'`.
- `ConfigPublication` : après `cheminPoses: string;` ajouter `cheminLogos: string;` ; le commentaire « Serveurs de fichiers » devient « Serveurs de fichiers : dossiers de tournage, banque de poses, banque de logos. » et `urlLogos: string;` s'ajoute après `urlPoses: string;`.
- `detail()` : après `urlPoses: c.urlPoses,` ajouter `urlLogos: c.urlLogos,`.
- `enregistrer()` : la lecture du corps devient

```ts
    // Le studio peut envoyer une vignette d'avant les gabarits : elle est complétée comme à la lecture du fichier.
    const corps = migrerPublication(await lireCorps(req));
```

- `vignette()` : remplacer le bloc `const urls = …; await c.rendreVignette({ … }, …)` par

```ts
      const bases = { tournage: urlTournage(ctx.dossier), poses: c.urlPoses, logos: c.urlLogos };
      await c.rendreVignette(proprietesVignette(v, bases), path.join(ctx.dossier, chemin), ctx.tournage.reglages.publication.vignetteOctetsMax);
```

`studio/serveur/principal.ts`, après le serveur de poses :

```ts
  // Banque de logos de logiciels, servie à part comme celle des poses.
  const cheminLogos = path.join(RACINE, 'donnees', 'logos');
  await mkdir(cheminLogos, { recursive: true });
  const serveurLogos = await demarrerServeur(cheminLogos);
```

et dans `creerApiPublication({ … })` : `cheminLogos,` après `cheminPoses,`, `urlLogos: serveurLogos.url,` après `urlPoses: serveurPoses.url,`.

`studio/serveur/publication.test.ts` :
- `beforeEach` : `await mkdir(path.join(racine, 'logos'));` et, dans `config`, `cheminLogos: path.join(racine, 'logos'),` et `urlLogos: 'http://127.0.0.1:9997',`.
- test « rend la vignette avec les adresses de ses images » : la première valeur attendue devient
  `{ gabarit: 'classique', fondUrl: null, poseUrl: 'http://127.0.0.1:9998/surpris.detoure.png', logoUrls: [], captureUrls: [], accroche: 'Un seul mot de passe' }`.
- Les vignettes littérales de ce fichier (sans gabarit) restent telles quelles : elles vérifient que le PUT complète une vignette ancienne.

`studio/src/composants/ChoixVignette.tsx` :
- imports : remplacer `urlsVignette` par `proprietesVignette` ;
- `const bases = { tournage: detail.urlTournage, poses: detail.urlPoses, logos: detail.urlLogos };`
- dans `composer`, l'objet `vignette` reçoit, après `accroche`, les champs `gabarit: vignette?.gabarit ?? 'classique', logos: vignette?.logos ?? [], captures: vignette?.captures ?? [],` (remplacés à la Task 6) ;
- `const urls = vignette ? urlsVignette(vignette, bases) : null;` est supprimé ; les conditions `vignette && urls` deviennent `vignette` ; le `Thumbnail` reçoit `inputProps={proprietesVignette(vignette, bases)}`.

Fixtures : ajouter `gabarit: 'classique', logos: [], captures: [],` aux vignettes littérales de `noyau/relais.test.ts` (ligne ~20), `noyau/youtube.test.ts` (ligne ~24) et `studio/src/logique/publication.test.ts` (`complete` et `propre`, lignes ~57-58).

`.gitignore` : ajouter la ligne `donnees/logos/` sous `donnees/poses/`.

- [ ] **Step 6 : vérifier types et tests**

Run : `npm run typecheck && npm test`
Expected : aucune erreur de type ; tous les tests passent.

- [ ] **Step 7 : commit**

```bash
git add -A noyau remotion studio .gitignore
git commit -m "Noyau : vignette avec gabarit, logos et captures, complétée à la lecture des anciennes publications

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3 : la rédaction cite les logiciels

**Files :**
- Modify : `studio/serveur/redaction.ts`, `studio/serveur/redaction.test.ts`, `studio/serveur/publication.test.ts` (fixture `PROPOSITION`)

**Interfaces :**
- Produces : `PropositionRedaction.logiciels: string[]` (nettoyé : sans blancs, sans doublons à la casse près, 10 au plus). Comme `rediger()` étale la proposition dans la vidéo, `VideoPubliee.logiciels` est rempli sans autre changement.

- [ ] **Step 1 : écrire les tests**

`studio/serveur/redaction.test.ts` : ajouter à `PROPOSITION` `logiciels: [' Excel ', 'excel', '', 'Teams'],`, et dans le test `nettoyerProposition` la valeur attendue reçoit `logiciels: ['Excel', 'Teams'],`. Dans le premier test de `construirePromptRedaction`, ajouter :

```ts
    expect(prompt).toContain('- logiciels :');
```

`studio/serveur/publication.test.ts` : `PROPOSITION` reçoit `logiciels: ['Excel'],`.

- [ ] **Step 2 : vérifier l'échec**

Run : `npx vitest run studio/serveur/redaction.test.ts`
Expected : FAIL (`logiciels` absent du résultat et du prompt).

- [ ] **Step 3 : implémenter**

Dans `redaction.ts` :
- `PropositionRedaction` : `logiciels: string[];` après `accroches`.
- Prompt, après la ligne `- accroches : …` :

```
- logiciels : les logiciels, applications et services en ligne nommés dans la vidéo, chacun sous son nom usuel (« Excel », « ChatGPT », « Microsoft Teams »), du plus présent au moins présent ; liste vide s’il n’y en a pas.
```

- `SchemaRedaction` : `logiciels: z.array(z.string()),`.
- `nettoyerProposition` : extraire le filtre des doublons en fonction locale et l'appliquer aussi aux logiciels :

```ts
// Sans blancs ni doublons (à la casse près), dans l'ordre d'origine.
function uniques(textes: string[]): string[] {
  const vus = new Set<string>();
  return nonVides(textes).filter(t => {
    const cle = t.toLowerCase();
    if (vus.has(cle)) return false;
    vus.add(cle);
    return true;
  });
}

export function nettoyerProposition(p: PropositionRedaction): PropositionRedaction {
  return {
    titre: p.titre.trim(),
    variantesTitre: nonVides(p.variantesTitre).slice(0, 2),
    description: p.description.trim(),
    tags: uniques(p.tags),
    accroches: nonVides(p.accroches).slice(0, 3),
    logiciels: uniques(p.logiciels).slice(0, 10),
  };
}
```

- [ ] **Step 4 : vérifier**

Run : `npm run typecheck && npx vitest run studio/serveur`
Expected : PASS.

- [ ] **Step 5 : commit**

```bash
git add studio/serveur/redaction.ts studio/serveur/redaction.test.ts studio/serveur/publication.test.ts
git commit -m "Studio : la rédaction relève les logiciels cités dans la vidéo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4 : serveur — logos, captures et contrôles

**Files :**
- Modify : `studio/serveur/http.ts`, `studio/serveur/publication.ts`, `studio/commun.ts`
- Test : `studio/serveur/publication.test.ts`

**Interfaces :**
- Consumes : `logosSuggeres`, `MAX_ELEMENTS` (Task 1) ; `DOSSIER_CAPTURES`, `Vignette` (Task 2) ; `PropositionRedaction.logiciels` (Task 3).
- Produces :
  - `lireOctets(req): Promise<Buffer>` dans `http.ts`
  - `interface Logo { fichier: string; url: string }` et `DetailPublication.logos: Logo[]`, `DetailPublication.captures: string[]` dans `commun.ts`
  - `GET /api/tournages/:nom/publication/captures` → `string[]`
  - `POST /api/tournages/:nom/publication/captures?fichier=<nom>` (corps : octets de l'image) → `{ fichier: string; captures: string[] }`
  - rendu de vignette : 409 « Image de la vignette absente : logo excel.png. » si un logo ou une capture manque
  - validation : problème « Vignette : logo excel.png introuvable. » / « Vignette : capture a.png introuvable. »
  - rédaction : si la vignette existe et n'a aucun logo, ses logos deviennent `logosSuggeres(proposition.logiciels, banque)`

- [ ] **Step 1 : écrire les tests**

Dans `studio/serveur/publication.test.ts` :

Dans `describe('détail de la publication', …)` :

```ts
  it('liste la banque de logos et les captures du tournage', async () => {
    const dossier = await tournage('a');
    await writeFile(path.join(racine, 'logos', 'excel.png'), 'png');
    await writeFile(path.join(racine, 'logos', 'notes.txt'), '');
    await mkdir(path.join(dossier, 'captures'));
    await writeFile(path.join(dossier, 'captures', 'b.jpg'), 'jpg');
    await writeFile(path.join(dossier, 'captures', 'a.png'), 'png');
    const d = await (await fetch(`${url}/api/tournages/a/publication`)).json();
    expect(d.urlLogos).toBe('http://127.0.0.1:9997');
    expect(d.logos).toEqual([{ fichier: 'excel.png', url: 'http://127.0.0.1:9997/excel.png' }]);
    expect(d.captures).toEqual(['a.png', 'b.jpg']);
    expect(await (await fetch(`${url}/api/tournages/a/publication/captures`)).json()).toEqual(['a.png', 'b.jpg']);
  });
```

Nouveau bloc :

```ts
describe('dépôt de captures', () => {
  const deposer = (fichier: string, contenu = 'png') =>
    fetch(`${url}/api/tournages/a/publication/captures?fichier=${encodeURIComponent(fichier)}`, { method: 'POST', body: contenu });
  it('copie l’image dans captures/ sans écraser un fichier du même nom', async () => {
    const dossier = await tournage('a');
    expect(await (await deposer('étape 1.png')).json()).toEqual({ fichier: 'étape 1.png', captures: ['étape 1.png'] });
    expect(await (await deposer('étape 1.png', 'autre')).json()).toEqual({ fichier: 'étape 1-2.png', captures: ['étape 1-2.png', 'étape 1.png'] });
    expect(await readFile(path.join(dossier, 'captures', 'étape 1.png'), 'utf-8')).toBe('png');
  });
  it('refuse un autre format, un chemin ou une image vide', async () => {
    await tournage('a');
    expect((await deposer('notes.txt')).status).toBe(400);
    expect((await deposer('../x.png')).status).toBe(400);
    expect((await deposer('x.png', '')).status).toBe(400);
  });
});
```

Dans `describe('rédaction', …)` :

```ts
  it('pré-coche les logos des logiciels cités quand la vignette n’en a aucun', async () => {
    await tournage('a');
    await writeFile(path.join(racine, 'logos', 'excel.png'), 'png');
    const p = await lirePublication('a');
    const vignette = { pose: { source: 'banque', fichier: 'surpris.jpg' }, fond: { source: 'charte' }, accroche: 'Ancienne', fichier: null };
    await envoyer('a', { ...p, videos: p.videos.map(v => (v.cible === 'complete' ? { ...v, vignette } : v)) });
    const r = await action('a', 'redaction', { cible: 'complete' });
    const video = ((await r.json()) as Publication).videos[0]!;
    expect(video.logiciels).toEqual(['Excel']);
    expect(video.vignette).toMatchObject({ logos: ['excel.png'], gabarit: 'classique' });
  });
```

Dans `describe('vignette et validation', …)` :

```ts
  it('passe logos et captures à la composition', async () => {
    const dossier = await preparer();
    await writeFile(path.join(racine, 'logos', 'excel.png'), 'png');
    await mkdir(path.join(dossier, 'captures'));
    await writeFile(path.join(dossier, 'captures', 'a.png'), 'png');
    const p = await lirePublication('a');
    await envoyer('a', { ...p, videos: p.videos.map(v => (v.cible === 'complete'
      ? { ...v, vignette: { ...v.vignette!, gabarit: 'demonstration', logos: ['excel.png'], captures: ['a.png'] } }
      : v)) });
    expect((await action('a', 'vignette', { cible: 'complete' })).status).toBe(200);
    expect(vi.mocked(config.rendreVignette).mock.calls[0]![0]).toMatchObject({
      gabarit: 'demonstration', logoUrls: ['http://127.0.0.1:9997/excel.png'], captureUrls: ['http://127.0.0.1:9999/a/captures/a.png'],
    });
  });
  it('refuse le rendu et la validation quand un logo ou une capture a disparu', async () => {
    await preparer();
    const p = await lirePublication('a');
    await envoyer('a', { ...p, videos: p.videos.map(v => (v.cible === 'complete'
      ? { ...v, vignette: { ...v.vignette!, logos: ['excel.png'], captures: ['a.png'] } }
      : v)) });
    const rendu = await action('a', 'vignette', { cible: 'complete' });
    expect(rendu.status).toBe(409);
    expect((await rendu.json()).erreur).toBe('Image de la vignette absente : logo excel.png, capture a.png.');
    const refus = await action('a', 'valider', { cible: 'complete' });
    expect((await refus.json()).problemes).toEqual([
      'Vignette à rendre.', 'Vignette : logo excel.png introuvable.', 'Vignette : capture a.png introuvable.',
    ]);
  });
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npx vitest run studio/serveur/publication.test.ts`
Expected : FAIL sur les nouveaux tests (`logos` absent du détail, route `captures` inconnue → 404, etc.).

- [ ] **Step 3 : `lireOctets` dans `http.ts`**

```ts
// Corps brut de la requête (image déposée), limité comme un corps JSON.
export async function lireOctets(req: IncomingMessage): Promise<Buffer> {
  const morceaux: Buffer[] = [];
  let taille = 0;
  for await (const morceau of req as AsyncIterable<Buffer>) {
    taille += morceau.length;
    if (taille > TAILLE_MAX) throw new ErreurHttp(413, 'Requête trop volumineuse.');
    morceaux.push(morceau);
  }
  return Buffer.concat(morceaux);
}

export async function lireCorps(req: IncomingMessage): Promise<unknown> {
  const octets = await lireOctets(req);
  try {
    return JSON.parse(octets.toString('utf-8'));
  } catch {
    throw new ErreurHttp(400, 'JSON invalide.');
  }
}
```

- [ ] **Step 4 : `commun.ts`**

```ts
export interface Logo { fichier: string; url: string }
```

et dans `DetailPublication`, après `urlLogos: string;` :

```ts
  logos: Logo[];            // banque donnees/logos/
  captures: string[];       // fichiers de captures/ du tournage
```

- [ ] **Step 5 : `studio/serveur/publication.ts`**

Imports : ajouter `mkdir, writeFile` à `node:fs/promises` ; `lireOctets` à `./http` ; `DOSSIER_CAPTURES, type Vignette` à l'import de `../../noyau/publication` ; `import { logosSuggeres } from '../../noyau/gabarits';` ; `Logo` à l'import de `../commun`.

Constantes et fonctions de module, après `EXTENSIONS_PHOTO` :

```ts
const EXTENSIONS_LOGO = new Set(['.png', '.svg']);
const EXTENSIONS_CAPTURE = new Set(['.png', '.jpg', '.jpeg']);

async function listerImages(dossier: string, extensions: Set<string>): Promise<string[]> {
  if (!existsSync(dossier)) return [];
  return (await readdir(dossier)).filter(f => extensions.has(path.extname(f).toLowerCase())).sort();
}
```

Dans `creerApiPublication`, après `urlTournage` :

```ts
  const banqueLogos = () => listerImages(c.cheminLogos, EXTENSIONS_LOGO);
  const captures = (dossier: string) => listerImages(path.join(dossier, DOSSIER_CAPTURES), EXTENSIONS_CAPTURE);
  // Logos et captures de la vignette qui ne sont plus sur le disque, nommés pour l'auteur.
  const elementsAbsents = (v: Vignette, dossier: string) => [
    ...v.logos.filter(f => !existsSync(path.join(c.cheminLogos, f))).map(f => `logo ${f}`),
    ...v.captures.filter(f => !existsSync(path.join(dossier, DOSSIER_CAPTURES, f))).map(f => `capture ${f}`),
  ];
```

`detail()`, après `urlLogos: c.urlLogos,` :

```ts
      logos: (await banqueLogos()).map((f): Logo => ({ fichier: f, url: `${c.urlLogos}/${encodeURIComponent(f)}` })),
      captures: await captures(ctx.dossier),
```

`rediger()`, remplacer les trois lignes qui calculent `vignette`, `accroche` et `changement` par :

```ts
    // La première accroche va dans la vignette déjà composée ; les autres restent à essayer. Une vignette sans logo
    // reçoit ceux des logiciels cités.
    const vignette = videoDe(actuelle, cible).vignette;
    const accroche = proposition.accroches[0] ?? vignette?.accroche ?? '';
    const logos = vignette && vignette.logos.length === 0 ? logosSuggeres(proposition.logiciels, await banqueLogos()) : vignette?.logos ?? [];
    const changement = vignette ? { ...proposition, vignette: { ...vignette, accroche, logos } } : proposition;
```

`vignette()`, juste après la vérification `images.every(…)` :

```ts
    const absents = elementsAbsents(v, ctx.dossier);
    if (absents.length > 0) throw new ErreurHttp(409, `Image de la vignette absente : ${absents.join(', ')}.`);
```

`valider()`, après le calcul de `problemes` (avant `if (!disponible.rendue)`) :

```ts
    if (video.vignette) problemes.push(...elementsAbsents(video.vignette, ctx.dossier).map(a => `Vignette : ${a} introuvable.`));
```

Dépôt, nouvelle fonction dans `creerApiPublication` :

```ts
  // Capture glissée dans le studio : copiée dans captures/, sous un nom libre (suffixe -2, -3… si le nom est pris).
  async function deposerCapture(req: IncomingMessage, ctx: Contexte): Promise<{ fichier: string; captures: string[] }> {
    const demande = new URL(req.url ?? '/', 'http://local').searchParams.get('fichier') ?? '';
    const extension = path.extname(demande).toLowerCase();
    if (!demande || path.basename(demande) !== demande || demande.startsWith('.') || !EXTENSIONS_CAPTURE.has(extension)) {
      throw new ErreurHttp(400, 'fichier attendu : une image PNG ou JPEG, sans chemin.');
    }
    const octets = await lireOctets(req);
    if (octets.length === 0) throw new ErreurHttp(400, 'Image vide.');
    const dossier = path.join(ctx.dossier, DOSSIER_CAPTURES);
    await mkdir(dossier, { recursive: true });
    const base = demande.slice(0, -extension.length);
    let fichier = demande;
    for (let n = 2; existsSync(path.join(dossier, fichier)); n++) fichier = `${base}-${n}${path.extname(demande)}`;
    await writeFile(path.join(dossier, fichier), octets);
    return { fichier, captures: await captures(ctx.dossier) };
  }
```

Routage : ajouter `captures` à l'alternative de l'expression régulière (`(redaction|image|vignette|captures|valider|relais|…)`) et, dans `traiter` :

```ts
      else if (action === 'captures' && req.method === 'GET') repondre(res, 200, await captures(ctx.dossier));
      else if (action === 'captures' && req.method === 'POST') repondre(res, 200, await deposerCapture(req, ctx));
```

- [ ] **Step 6 : vérifier**

Run : `npm run typecheck && npx vitest run studio/serveur`
Expected : PASS.

- [ ] **Step 7 : commit**

```bash
git add studio/serveur/http.ts studio/serveur/publication.ts studio/serveur/publication.test.ts studio/commun.ts
git commit -m "Studio : banque de logos, dépôt de captures et contrôle des fichiers de la vignette

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5 : composition — briques et quatre gabarits

Le gabarit `classique` reproduit exactement la vignette actuelle ; les trois autres sont nouveaux.

**Files :**
- Modify : `remotion/calculs.ts`, `remotion/calculs.test.ts`
- Create : `remotion/composants/vignette/dimensions.ts`, `briques.tsx`, `Classique.tsx`, `Vitrine.tsx`, `Demonstration.tsx`, `Mosaique.tsx`
- Modify : `remotion/composants/Vignette.tsx`, `remotion/scripts/vignette.e2e.test.ts`

**Interfaces :**
- Consumes : `ProprietesVignette`, `Gabarit`, `GABARITS` (Tasks 1-2).
- Produces : `tailleAccroche(texte: string, largeur = 640): number` ; `Vignette` aiguille selon `props.gabarit` ; `LARGEUR_VIGNETTE`, `HAUTEUR_VIGNETTE` toujours exportés par `Vignette.tsx`.

- [ ] **Step 1 : test de `tailleAccroche`**

Dans `remotion/calculs.test.ts`, ajouter au `describe('tailleAccroche', …)` existant :

```ts
  it('réduit la taille pour que le mot le plus long tienne dans la largeur donnée', () => {
    expect(tailleAccroche('Presse-papiers')).toBe(67);          // 640 / (0,68 × 14)
    expect(tailleAccroche('Presse-papiers', 400)).toBe(42);     // 400 / (0,68 × 14)
    expect(tailleAccroche('Un mot', 400)).toBe(120);
  });
```

Run : `npx vitest run remotion/calculs.test.ts` → FAIL sur la deuxième attente (67 au lieu de 42).

- [ ] **Step 2 : `tailleAccroche` avec largeur**

```ts
// Taille de l'accroche de la vignette (gras, capitales, colonne de `largeur` px) : plus grande quand elle est courte,
// et assez petite pour que son mot le plus long tienne sur une ligne (une capitale grasse fait environ 0,68 em).
export function tailleAccroche(texte: string, largeur = 640): number {
  const longueur = texte.trim().length;
  const base = longueur <= 20 ? 120 : longueur <= 30 ? 100 : 84;
  const plusLongMot = Math.max(1, ...texte.split(/\s+/).map(m => m.length));
  return Math.min(base, Math.floor(largeur / (0.68 * plusLongMot)));
}
```

Run : `npx vitest run remotion/calculs.test.ts` → PASS.

- [ ] **Step 3 : `remotion/composants/vignette/dimensions.ts`**

```ts
export const LARGEUR_VIGNETTE = 1280;
export const HAUTEUR_VIGNETTE = 720;
```

- [ ] **Step 4 : `remotion/composants/vignette/briques.tsx`**

```tsx
import type { CSSProperties, FC } from 'react';
import { AbsoluteFill, Img } from 'remotion';
import { tailleAccroche } from '../../calculs';
import { charte } from '../../charte';
import { HAUTEUR_VIGNETTE, LARGEUR_VIGNETTE } from './dimensions';

// Fond : écran flouté et assombri, sinon formes de la charte sur blanc.
export const Fond: FC<{ url: string | null }> = ({ url }) => (url ? (
  <>
    <Img
      src={url}
      style={{ position: 'absolute', left: -20, top: -20, width: LARGEUR_VIGNETTE + 40, height: HAUTEUR_VIGNETTE + 40, objectFit: 'cover', filter: 'blur(6px)' }}
    />
    <AbsoluteFill style={{ backgroundColor: 'rgba(0, 28, 64, 0.55)' }} />
  </>
) : (
  <>
    <div style={{ position: 'absolute', right: -120, top: -120, width: 520, height: 520, borderRadius: '50%', backgroundColor: charte.bleuGris, opacity: 0.6 }} />
    <div style={{ position: 'absolute', right: 0, bottom: 0, width: 0, height: 0, borderBottom: `320px solid ${charte.bleu}`, borderLeft: '320px solid transparent' }} />
  </>
));

// Fond sombre de la vitrine : dégradé bleu et formes de la charte, pour que les tuiles blanches ressortent.
export const FondDegrade: FC = () => (
  <>
    <AbsoluteFill style={{ background: `linear-gradient(135deg, ${charte.bleu} 0%, #00264d 100%)` }} />
    <div style={{ position: 'absolute', left: -160, bottom: -220, width: 620, height: 620, borderRadius: '50%', backgroundColor: charte.bleuGris, opacity: 0.25 }} />
    <div style={{ position: 'absolute', right: -100, top: -140, width: 420, height: 420, borderRadius: '50%', border: `40px solid ${charte.rouge}`, opacity: 0.35 }} />
  </>
);

export const BandeRouge: FC = () => (
  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 28, backgroundColor: charte.rouge }} />
);

// Pose détourée, posée sur le bas de la vignette ; `style` la place.
export const Pose: FC<{ url: string | null; style: CSSProperties }> = ({ url, style }) => (url
  ? <Img src={url} style={{ position: 'absolute', bottom: 0, height: '100%', objectFit: 'contain', ...style }} />
  : null);

// Accroche en capitales : blanche et ombrée sur un fond sombre, bleue avec un halo blanc sur la charte
// (elle reste lisible là où la pose passe dessous).
export const Accroche: FC<{ texte: string; largeur: number; sombre: boolean; tailleMax?: number }> = ({ texte, largeur, sombre, tailleMax = Infinity }) => (
  <div
    style={{
      fontSize: Math.min(tailleMax, tailleAccroche(texte, largeur)), fontWeight: 800, lineHeight: 1.05, textTransform: 'uppercase',
      color: sombre ? charte.blanc : charte.bleu,
      textShadow: sombre
        ? '0 4px 18px rgba(0, 0, 0, 0.6)'
        : '0 0 4px rgba(255, 255, 255, 1), 0 0 10px rgba(255, 255, 255, 1), 0 0 22px rgba(255, 255, 255, 0.9)',
    }}
  >
    {texte}
  </div>
);

// Accroche en bandeau rouge, texte blanc : lisible sur n'importe quel fond.
export const Bandeau: FC<{ texte: string; largeur: number; tailleMax: number }> = ({ texte, largeur, tailleMax }) => (
  <div
    style={{
      display: 'inline-block', maxWidth: largeur, padding: '10px 26px', backgroundColor: charte.rouge, color: charte.blanc,
      fontSize: Math.min(tailleMax, tailleAccroche(texte, largeur - 52)), fontWeight: 800, lineHeight: 1.05, textTransform: 'uppercase',
      boxShadow: '0 10px 30px rgba(0, 0, 0, 0.35)',
    }}
  >
    {texte}
  </div>
);

// Logo de logiciel en tuile : carré blanc arrondi, ombré, légèrement penché ; `style` le place.
export const TuileLogo: FC<{ url: string; taille: number; angle: number; style: CSSProperties }> = ({ url, taille, angle, style }) => (
  <div
    style={{
      position: 'absolute', width: taille, height: taille, borderRadius: taille * 0.22, backgroundColor: charte.blanc,
      boxShadow: '0 14px 32px rgba(0, 0, 0, 0.35)', transform: `rotate(${angle}deg)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', ...style,
    }}
  >
    <Img src={url} style={{ width: '72%', height: '72%', objectFit: 'contain' }} />
  </div>
);

// Capture nette en carte : cadre blanc, coins arrondis, ombre, légère inclinaison ; `style` la place.
export const CarteCapture: FC<{ url: string; largeur: number; hauteur: number; angle: number; style: CSSProperties }> = ({
  url, largeur, hauteur, angle, style,
}) => (
  <div
    style={{
      position: 'absolute', width: largeur, height: hauteur, padding: 8, boxSizing: 'border-box', backgroundColor: charte.blanc,
      borderRadius: 14, boxShadow: '0 18px 40px rgba(0, 0, 0, 0.4)', transform: `rotate(${angle}deg)`, ...style,
    }}
  >
    <Img src={url} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
  </div>
);
```

- [ ] **Step 5 : les quatre gabarits**

`remotion/composants/vignette/Classique.tsx` (la mise en page actuelle, à l'identique) :

```tsx
import type { FC } from 'react';
import type { ProprietesVignette } from '../../../noyau/publication';
import { LogoMT } from '../LogoMT';
import { Accroche, BandeRouge, Fond, Pose } from './briques';

// Bande rouge, logo en haut à gauche (sur plaque blanche quand le fond est l'écran), accroche à gauche, pose en grand à droite.
export const Classique: FC<ProprietesVignette> = ({ fondUrl, poseUrl, accroche }) => (
  <>
    <Fond url={fondUrl} />
    <BandeRouge />
    <Pose url={poseUrl} style={{ right: 0, maxWidth: '55%', objectPosition: 'right bottom' }} />
    <div style={{ position: 'absolute', left: 64, top: 40 }}>
      <LogoMT hauteur={fondUrl ? 88 : 72} plaque={fondUrl !== null} />
    </div>
    <div style={{ position: 'absolute', left: 64, top: 150, bottom: 60, width: 640, display: 'flex', alignItems: 'center' }}>
      <Accroche texte={accroche} largeur={640} sombre={fondUrl !== null} />
    </div>
  </>
);
```

`remotion/composants/vignette/Vitrine.tsx` :

```tsx
import type { FC } from 'react';
import type { ProprietesVignette } from '../../../noyau/publication';
import { LogoMT } from '../LogoMT';
import { Bandeau, FondDegrade, Pose, TuileLogo } from './briques';

// Places des tuiles autour de la tête : gauche, droite haut, droite bas.
const PLACES_LOGOS = [
  { place: { left: 110, top: 140 }, angle: -8 },
  { place: { right: 110, top: 110 }, angle: 7 },
  { place: { right: 210, top: 340 }, angle: -4 },
];

// Pose au centre sur fond dégradé, logos flottant autour de la tête, accroche en bandeau en bas. Le fond choisi est ignoré.
export const Vitrine: FC<ProprietesVignette> = ({ poseUrl, logoUrls, accroche }) => (
  <>
    <FondDegrade />
    <Pose url={poseUrl} style={{ left: '50%', transform: 'translateX(-50%)', height: '94%' }} />
    {logoUrls.slice(0, PLACES_LOGOS.length).map((url, i) => (
      <TuileLogo key={url} url={url} taille={170} angle={PLACES_LOGOS[i]!.angle} style={PLACES_LOGOS[i]!.place} />
    ))}
    <div style={{ position: 'absolute', left: 40, top: 30 }}>
      <LogoMT hauteur={64} plaque />
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 44, display: 'flex', justifyContent: 'center' }}>
      <Bandeau texte={accroche} largeur={1000} tailleMax={72} />
    </div>
  </>
);
```

`remotion/composants/vignette/Demonstration.tsx` :

```tsx
import type { FC } from 'react';
import type { ProprietesVignette } from '../../../noyau/publication';
import { LogoMT } from '../LogoMT';
import { Bandeau, BandeRouge, CarteCapture, Fond, Pose, TuileLogo } from './briques';

// Première capture en grande carte à gauche, premier logo épinglé dans son coin, pose à droite, accroche en bandeau dessous.
export const Demonstration: FC<ProprietesVignette> = ({ fondUrl, poseUrl, logoUrls, captureUrls, accroche }) => (
  <>
    <Fond url={fondUrl} />
    <BandeRouge />
    {captureUrls[0] && <CarteCapture url={captureUrls[0]} largeur={700} hauteur={394} angle={-3} style={{ left: 70, top: 120 }} />}
    <Pose url={poseUrl} style={{ right: 0, maxWidth: '45%', objectPosition: 'right bottom' }} />
    {logoUrls[0] && <TuileLogo url={logoUrls[0]} taille={150} angle={-10} style={{ left: 30, top: 70 }} />}
    <div style={{ position: 'absolute', left: 240, top: 28 }}>
      <LogoMT hauteur={64} plaque={fondUrl !== null} />
    </div>
    <div style={{ position: 'absolute', left: 70, bottom: 40, width: 760 }}>
      <Bandeau texte={accroche} largeur={760} tailleMax={64} />
    </div>
  </>
);
```

`remotion/composants/vignette/Mosaique.tsx` :

```tsx
import type { FC } from 'react';
import type { ProprietesVignette } from '../../../noyau/publication';
import { LogoMT } from '../LogoMT';
import { Accroche, BandeRouge, CarteCapture, Fond, Pose, TuileLogo } from './briques';

// Captures en éventail sous l'accroche.
const PLACES_CAPTURES = [
  { place: { left: 40, top: 250 }, angle: -6 },
  { place: { left: 380, top: 300 }, angle: 5 },
  { place: { left: 230, top: 450 }, angle: -2 },
];

// Accroche en haut à gauche, 2 ou 3 captures en éventail dessous, pose à droite, premier logo en tuile.
export const Mosaique: FC<ProprietesVignette> = ({ fondUrl, poseUrl, logoUrls, captureUrls, accroche }) => (
  <>
    <Fond url={fondUrl} />
    <BandeRouge />
    {captureUrls.slice(0, PLACES_CAPTURES.length).map((url, i) => (
      <CarteCapture key={url} url={url} largeur={400} hauteur={225} angle={PLACES_CAPTURES[i]!.angle} style={PLACES_CAPTURES[i]!.place} />
    ))}
    <Pose url={poseUrl} style={{ right: 0, maxWidth: '42%', objectPosition: 'right bottom' }} />
    {logoUrls[0] && <TuileLogo url={logoUrls[0]} taille={120} angle={8} style={{ left: 640, top: 230 }} />}
    <div style={{ position: 'absolute', left: 64, top: 36, width: 700, height: 190, display: 'flex', alignItems: 'center' }}>
      <Accroche texte={accroche} largeur={700} sombre={fondUrl !== null} tailleMax={80} />
    </div>
    <div style={{ position: 'absolute', left: 64, bottom: 24 }}>
      <LogoMT hauteur={52} plaque={fondUrl !== null} />
    </div>
  </>
);
```

- [ ] **Step 6 : aiguillage dans `remotion/composants/Vignette.tsx`**

Remplacer tout le fichier par :

```tsx
import type { FC } from 'react';
import { AbsoluteFill } from 'remotion';
import type { Gabarit } from '../../noyau/gabarits';
import type { ProprietesVignette } from '../../noyau/publication';
import { charte } from '../charte';
import { police } from '../police';
import { Classique } from './vignette/Classique';
import { Demonstration } from './vignette/Demonstration';
import { Mosaique } from './vignette/Mosaique';
import { Vitrine } from './vignette/Vitrine';

export { HAUTEUR_VIGNETTE, LARGEUR_VIGNETTE } from './vignette/dimensions';
export type { ProprietesVignette };

const MISES_EN_PAGE: Record<Gabarit, FC<ProprietesVignette>> = {
  classique: Classique, vitrine: Vitrine, demonstration: Demonstration, mosaique: Mosaique,
};

// Vignette 1280×720 : le gabarit choisi place pose, fond, accroche, logos et captures.
export const Vignette: FC<ProprietesVignette> = props => {
  const MiseEnPage = MISES_EN_PAGE[props.gabarit];
  return (
    <AbsoluteFill style={{ backgroundColor: charte.blanc, fontFamily: police, overflow: 'hidden' }}>
      <MiseEnPage {...props} />
    </AbsoluteFill>
  );
};
```

- [ ] **Step 7 : test de rendu réel, un par gabarit**

Remplacer `remotion/scripts/vignette.e2e.test.ts` par :

```ts
import { execFileSync } from 'node:child_process';
import { mkdtemp, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { GABARITS } from '../../noyau/gabarits';
import { demarrerServeur } from './serveur-fichiers';
import { rendreVignette } from './vignette';

let dossier: string;
let serveur: Awaited<ReturnType<typeof demarrerServeur>>;

beforeAll(async () => {
  dossier = await mkdtemp(path.join(os.tmpdir(), 'pmt-vignette-'));
  const ffmpeg = (...args: string[]) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
  ffmpeg('-f', 'lavfi', '-i', 'testsrc=size=1920x1080', '-frames:v', '1', path.join(dossier, 'fond.png'));
  ffmpeg('-f', 'lavfi', '-i', 'color=c=red:s=600x900', '-frames:v', '1', path.join(dossier, 'pose.png'));
  ffmpeg('-f', 'lavfi', '-i', 'color=c=green:s=256x256', '-frames:v', '1', path.join(dossier, 'logo.png'));
  ffmpeg('-f', 'lavfi', '-i', 'testsrc2=size=1280x720', '-frames:v', '1', path.join(dossier, 'capture.png'));
  serveur = await demarrerServeur(dossier);
});

afterAll(async () => {
  await serveur.fermer();
});

it.each(GABARITS)('rend le gabarit %s en JPEG 1280×720 de moins de 2 Mo, avec trois logos et trois captures', async gabarit => {
  const sortie = path.join(dossier, 'vignettes', `${gabarit}.jpg`);
  const trois = (f: string) => [1, 2, 3].map(n => `${serveur.url}/${f}?n=${n}`);
  const resultat = await rendreVignette({
    gabarit, fondUrl: `${serveur.url}/fond.png`, poseUrl: `${serveur.url}/pose.png`,
    logoUrls: trois('logo.png'), captureUrls: trois('capture.png'), accroche: 'Le presse-papiers caché',
  }, sortie, 2_000_000);
  expect(resultat.octets).toBeLessThanOrEqual(2_000_000);
  expect((await stat(sortie)).size).toBe(resultat.octets);
  const dimensions = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', sortie], { encoding: 'utf-8' });
  expect(dimensions.trim()).toBe('1280,720');
});

it('rend le classique sans fond, sans logo ni capture', async () => {
  const sortie = path.join(dossier, 'vignettes', 'nu.jpg');
  const resultat = await rendreVignette({
    gabarit: 'classique', fondUrl: null, poseUrl: `${serveur.url}/pose.png`, logoUrls: [], captureUrls: [], accroche: 'Essai',
  }, sortie, 2_000_000);
  expect(resultat.octets).toBeGreaterThan(0);
});
```

(Le serveur de fichiers ne lit que le chemin de l'URL : `?n=1`, `?n=2`… servent le même fichier sous trois adresses distinctes, ce qui évite des clés React en double.)

- [ ] **Step 8 : vérifier**

Run : `npm run typecheck && npm test && npm run test:rendu`
Expected : tout passe ; `test:rendu` rend 5 vignettes.

Puis contrôle visuel : ouvrir les JPEG produits (chemins `…/pmt-vignette-*/vignettes/*.jpg` dans le dossier temporaire) avec l'outil Read et vérifier qu'aucun texte n'est coupé, que le logo M&T ne chevauche pas une tuile et que le classique est identique à l'ancienne vignette. Ajuster les positions si besoin, dans le gabarit concerné seulement.

- [ ] **Step 9 : commit**

```bash
git add remotion
git commit -m "Vignette : briques partagées et quatre gabarits (classique, vitrine, démonstration, mosaïque)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6 : panneau Vignette du studio

**Files :**
- Modify : `studio/src/logique/publication.ts`, `studio/src/logique/publication.test.ts`
- Modify : `studio/src/api.ts`, `studio/src/composants/ChoixVignette.tsx`, `studio/src/composants/CartePublication.tsx`, `studio/src/composants/EcranPublication.tsx`, `studio/src/styles.css`

**Interfaces :**
- Consumes : `gabaritsCompatibles`, `gabaritRetenu`, `logosSuggeres`, `LIBELLES_GABARIT`, `MAX_ELEMENTS`, `Gabarit` (Task 1) ; `proprietesVignette`, `DOSSIER_CAPTURES` (Task 2) ; `DetailPublication.logos`, `DetailPublication.captures`, routes `captures` (Task 4) ; `Vignette` composition (Task 5).
- Produces :
  - `basculer(liste: string[], fichier: string): string[]`
  - `gabaritsAutres(p: Publication, cible: CiblePublication): Gabarit[]`
  - `api.captures(nom)`, `api.deposerCapture(nom, fichier, contenu: Blob)`
  - prop `gabaritsAutres: Gabarit[]` sur `CartePublication` et `ChoixVignette`

- [ ] **Step 1 : tests de la logique**

Dans `studio/src/logique/publication.test.ts` (ajouter `basculer, gabaritsAutres` à l'import de `./publication`, et `videoParDefaut` depuis `../../../noyau/publication` s'il n'y est pas) :

```ts
describe('basculer', () => {
  it('coche dans l’ordre des clics, décoche, et s’arrête à trois', () => {
    expect(basculer([], 'a')).toEqual(['a']);
    expect(basculer(['a', 'b'], 'a')).toEqual(['b']);
    expect(basculer(['a', 'b', 'c'], 'd')).toEqual(['a', 'b', 'c']);
  });
});

describe('gabaritsAutres', () => {
  it('donne les gabarits des autres vidéos qui ont une vignette', () => {
    const q = { nature: 'perso' as const, confidentielle: false };
    const vignette = (gabarit: 'vitrine' | 'mosaique') => ({
      pose: { source: 'banque' as const, fichier: 'a.jpg' }, fond: { source: 'charte' as const }, accroche: '', gabarit, logos: [], captures: [], fichier: null,
    });
    const p = {
      version: 2 as const, qualificationParDefaut: q,
      videos: [
        { ...videoParDefaut('complete', q), vignette: vignette('vitrine') },
        { ...videoParDefaut(1, q), vignette: vignette('mosaique') },
        videoParDefaut(2, q),
      ],
    };
    expect(gabaritsAutres(p, 1)).toEqual(['vitrine']);
    expect(gabaritsAutres(p, 2)).toEqual(['vitrine', 'mosaique']);
  });
});
```

Run : `npx vitest run studio/src/logique/publication.test.ts` → FAIL (fonctions absentes).

- [ ] **Step 2 : implémenter la logique**

Dans `studio/src/logique/publication.ts` (imports : `MAX_ELEMENTS, type Gabarit` depuis `'../../../noyau/gabarits'`) :

```ts
// Logo ou capture coché ou décoché ; au plus MAX_ELEMENTS, dans l'ordre des clics.
export function basculer(liste: string[], fichier: string): string[] {
  if (liste.includes(fichier)) return liste.filter(f => f !== fichier);
  return liste.length < MAX_ELEMENTS ? [...liste, fichier] : liste;
}

// Gabarits pris par les autres vidéos de la publication : proposés en dernier, pour varier.
export const gabaritsAutres = (p: Publication, cible: CiblePublication): Gabarit[] =>
  p.videos.flatMap(v => (v.cible !== cible && v.vignette ? [v.vignette.gabarit] : []));
```

Run : `npx vitest run studio/src/logique/publication.test.ts` → PASS.

- [ ] **Step 3 : API du client**

Dans `studio/src/api.ts`, après `rendreVignette` :

```ts
  captures: (nom: string) => appeler<string[]>(`${chemin(nom)}/publication/captures`),
  deposerCapture: (nom: string, fichier: string, contenu: Blob) => appeler<{ fichier: string; captures: string[] }>(
    `${chemin(nom)}/publication/captures?fichier=${encodeURIComponent(fichier)}`,
    { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: contenu },
  ),
```

- [ ] **Step 4 : faire passer les gabarits des autres vidéos**

`EcranPublication.tsx` : importer `gabaritsAutres` depuis `'../logique/publication'` et passer à `CartePublication` la prop `gabaritsAutres={gabaritsAutres(publication, v.cible)}`.

`CartePublication.tsx` : ajouter à `Props` `gabaritsAutres: Gabarit[];` (import `type Gabarit` depuis `'../../../noyau/gabarits'`), la déstructurer et la passer à `<ChoixVignette … gabaritsAutres={gabaritsAutres} />`.

- [ ] **Step 5 : `ChoixVignette.tsx`**

Imports à ajouter / modifier :

```ts
import { gabaritRetenu, gabaritsCompatibles, LIBELLES_GABARIT, logosSuggeres, MAX_ELEMENTS, type Gabarit } from '../../../noyau/gabarits';
import { cleVignette, DOSSIER_CAPTURES, proprietesVignette, type Publication, type Vignette, type VideoPubliee } from '../../../noyau/publication';
import { basculer, baseVignette } from '../logique/publication';
```

Props : ajouter `gabaritsAutres: Gabarit[];` (commentaire : `// Gabarits des autres vidéos de la publication, proposés en dernier.`) et la déstructurer.

État, après `tirage` :

```ts
  const [captures, setCaptures] = useState(detail.captures);
  const [depot, setDepot] = useState(false);
```

`composer` devient :

```ts
  const composer = (c: Partial<Omit<Vignette, 'fichier'>>) => {
    const base = baseVignette(vignette, complete, poses[0]?.fichier);
    const pose = c.pose ?? base.pose;
    if (!pose) {
      setErreur('Aucune pose : ajoutez des photos dans donnees/poses/ ou utilisez la caméra séparée.');
      return;
    }
    setErreur(null);
    // Une vignette neuve reçoit les logos des logiciels cités ; le gabarit suit les éléments choisis.
    const logos = c.logos ?? vignette?.logos ?? logosSuggeres(v.logiciels, detail.logos.map(l => l.fichier));
    const choisies = c.captures ?? vignette?.captures ?? [];
    const compatibles = gabaritsCompatibles({ logos: logos.length, captures: choisies.length }, gabaritsAutres);
    changer({
      vignette: {
        pose,
        fond: c.fond ?? base.fond,
        accroche: c.accroche ?? vignette?.accroche ?? v.accroches[0] ?? '',
        gabarit: gabaritRetenu(c.gabarit ?? vignette?.gabarit ?? null, compatibles),
        logos,
        captures: choisies,
        fichier: vignette?.fichier ?? null,
      },
    });
  };
```

Dépôt :

```ts
  const deposer = async (fichiers: File[]) => {
    setErreur(null);
    try {
      for (const f of fichiers) setCaptures((await api.deposerCapture(nom, f.name, f)).captures);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  };
  const actualiser = async () => {
    try {
      setCaptures(await api.captures(nom));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  };
```

Calculs pour l'affichage (remplacent `const urls = …`) :

```ts
  const proposes = vignette
    ? gabaritsCompatibles({ logos: vignette.logos.length, captures: vignette.captures.length }, gabaritsAutres)
    : [];
  const urlCapture = (f: string) => `${detail.urlTournage}/${DOSSIER_CAPTURES}/${encodeURIComponent(f)}`;
```

JSX : après le bloc des accroches proposées, insérer :

```tsx
      <div className="actions">
        <span>Logos ({vignette?.logos.length ?? 0}/{MAX_ELEMENTS}) :</span>
        {detail.logos.length === 0 && <span className="discret">Banque vide : déposez des PNG ou SVG dans donnees/logos/ (nom du fichier = nom du logiciel).</span>}
        {detail.logos.map(l => (
          <button
            key={l.fichier}
            className={vignette?.logos.includes(l.fichier) ? 'pose choisie' : 'pose'}
            title={l.fichier}
            onClick={() => composer({ logos: basculer(vignette?.logos ?? [], l.fichier) })}
          >
            <img src={l.url} alt={l.fichier} />
          </button>
        ))}
      </div>
      <div className="actions">
        <span>Captures ({vignette?.captures.length ?? 0}/{MAX_ELEMENTS}) :</span>
        {captures.map(f => (
          <button
            key={f}
            className={vignette?.captures.includes(f) ? 'pose choisie' : 'pose'}
            title={f}
            onClick={() => composer({ captures: basculer(vignette?.captures ?? [], f) })}
          >
            <img src={urlCapture(f)} alt={f} />
          </button>
        ))}
        <button onClick={() => void actualiser()}>Actualiser</button>
      </div>
      <div
        className={depot ? 'depot actif' : 'depot'}
        onDragOver={e => { e.preventDefault(); setDepot(true); }}
        onDragLeave={() => setDepot(false)}
        onDrop={e => { e.preventDefault(); setDepot(false); void deposer([...e.dataTransfer.files]); }}
      >
        Glissez ici des captures (PNG ou JPEG), ou déposez-les dans captures/ du tournage puis « Actualiser ».
      </div>
      {vignette && (
        <>
          <p className="discret">Gabarit : cliquez sur un aperçu.</p>
          <div className="gabarits">
            {proposes.map(g => (
              <button key={g} className={g === vignette.gabarit ? 'gabarit choisi' : 'gabarit'} onClick={() => composer({ gabarit: g })}>
                <Thumbnail
                  component={CompositionVignette}
                  compositionWidth={LARGEUR_VIGNETTE}
                  compositionHeight={HAUTEUR_VIGNETTE}
                  frameToDisplay={0}
                  durationInFrames={1}
                  fps={30}
                  inputProps={proprietesVignette({ ...vignette, gabarit: g }, bases)}
                  style={{ width: '100%' }}
                />
                <span>{LIBELLES_GABARIT[g]}</span>
              </button>
            ))}
          </div>
        </>
      )}
```

Le bloc « Aperçu / Rendu » existant reste (l'aperçu montre le gabarit retenu). Le texte d'aide sous « Rendre la vignette » devient : « À refaire après chaque changement de pose, de fond, d’accroche, de logos, de captures ou de gabarit, avant de valider. »

- [ ] **Step 6 : styles**

Dans `studio/src/styles.css`, après `.vignette-rendue` :

```css
.depot { border: 2px dashed #9ab2c9; border-radius: 6px; padding: 0.75rem; margin: 0.5rem 0; text-align: center; color: #4b5563; }
.depot.actif { border-color: #004c99; background: #eef4fb; }
.gabarits { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
.gabarit { padding: 2px; border: 3px solid transparent; background: none; text-align: left; cursor: pointer; }
.gabarit.choisi { border-color: #004c99; }
```

- [ ] **Step 7 : vérifier**

Run : `npm run typecheck && npm test`
Expected : PASS.

Essai réel (skill `run` ou `npm run validation`, puis http://127.0.0.1:5180) sur un tournage rendu (par exemple `zz-essai-plan7`) :
1. déposer deux PNG dans `donnees/logos/` (ex. `excel.png`, `chatgpt.svg`) ;
2. ouvrir la publication : les logos apparaissent ; une vignette neuve pré-coche ceux des logiciels cités ;
3. glisser deux captures sur la zone : elles s'ajoutent ; les cocher ;
4. vérifier que Vitrine, Démonstration, Mosaïque et Classique s'affichent en aperçu et qu'un clic change l'aperçu retenu ;
5. « Rendre la vignette » : le JPEG rendu correspond à l'aperçu ;
6. décocher une capture alors que Mosaïque est retenu : le gabarit passe au premier proposé.

- [ ] **Step 8 : commit**

```bash
git add studio/src
git commit -m "Studio : logos, captures et choix du gabarit de la vignette sur aperçus

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7 : documentation

**Files :**
- Modify : `docs/studio.md`

- [ ] **Step 1 : mettre à jour la puce « Vignette »** (ligne ~56) :

```markdown
- **Vignette** : choisir une pose (photo de `donnees/poses/`, détourée automatiquement, ou caméra séparée à l’image affichée dans le lecteur), un fond (formes de la charte, ou écran à l’image affichée) et une accroche. On peut y ajouter jusqu’à 3 **logos** de logiciels, pris dans `donnees/logos/` (PNG ou SVG ; le nom du fichier est celui du logiciel, `excel.png`), et jusqu’à 3 **captures** déposées dans `captures/` du tournage ou glissées sur le panneau. Les logos des logiciels cités par la rédaction sont pré-cochés. Le studio propose alors les gabarits possibles en aperçu — *Classique* (accroche à gauche, pose à droite), *Vitrine* (logos autour de la tête, dès un logo), *Démonstration* (une capture en grand, dès une capture), *Mosaïque* (captures en éventail, dès deux) — en mettant en dernier ceux déjà pris par les autres vidéos du tournage ; un clic choisit. « Rendre la vignette » produit le JPEG 1280×720 dans `rendus/vignettes/`. Un logo ou une capture disparus du disque bloquent le rendu et la validation.
```

- [ ] **Step 2 : commit**

```bash
git add docs/studio.md
git commit -m "Documentation : logos, captures et gabarits de la vignette

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
