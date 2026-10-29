# Classements des vidéos sur le site — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** avant tout relais, chaque vidéo est caractérisée pour chaque type de classement déclaré par le site (« Par outil », « Par thème »…), avec création de valeurs depuis le Studio et « Aucune sélection » consciente pour un type facultatif.

**Architecture:** le site décrit ses types (`GET /api/classifications`) ; le Studio les lit avec les catégories et playlists, stocke les choix dans `VideoPubliee.replit.classements`, refuse le relais tant qu'un type n'est pas décidé, et envoie `classifications` dans le corps de la vidéo. La logique pure vit dans `noyau/classements.ts`.

**Tech Stack:** TypeScript, React, Node `http`, Vitest.

Spec : [docs/superpowers/specs/2026-10-29-classements-site-design.md](../specs/2026-10-29-classements-site-design.md)

## Global Constraints

- Noms de l'API du site en anglais (`key`, `label`, `multiple`, `required`, `values`, `name`, `classifications`) ; tout le code du Studio en français.
- `'aucun'` = case « Aucune sélection » cochée ; refusé pour un type `obligatoire`. Clé absente = pas décidé.
- La clé du type outil est `'outil'` : elle donne aussi `categoryId` (encore requis par le site actuel) et filtre les playlists.
- `playlistId` reste hors classements.
- Tests : `npx vitest run <fichier>` ; avant chaque commit : `npm run typecheck`.
- Commits terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Fichiers

- Créer `noyau/classements.ts` (+ `noyau/classements.test.ts`) : types, `classementsManquants`, `classificationsSite`, `CLE_OUTIL`.
- Modifier `noyau/publication.ts` : `replit.classements` remplace `replit.categorieId`, migration, validation.
- Modifier `noyau/relais.ts` : contrôle et corps du relais.
- Modifier `studio/serveur/site-replit.ts` : lecture des classements, `creerValeur`.
- Modifier `studio/serveur/publication.ts` : relais avec types, route de création de valeur.
- Modifier `studio/src/api.ts`, `studio/src/composants/PanneauSite.tsx` (+ un nouveau `studio/src/composants/ChoixClassement.tsx`).
- Créer `docs/replit-classements.md` : prompt pour l'app Replit. Modifier `docs/studio.md`.

---

### Task 1 : logique des classements (`noyau/classements.ts`)

**Interfaces — Produces:**
```ts
export const CLE_OUTIL = 'outil';
export interface ValeurClassement { id: number; nom: string }
export interface TypeClassement { cle: string; libelle: string; multiple: boolean; obligatoire: boolean; valeurs: ValeurClassement[] }
export type ChoixClassements = Record<string, number[] | 'aucun'>;
export function classementsManquants(types: TypeClassement[], choix: ChoixClassements): string[];
export function classificationsSite(types: TypeClassement[], choix: ChoixClassements): Record<string, number[]>;
```

- [ ] **Step 1 : test qui échoue** — `noyau/classements.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { classementsManquants, classificationsSite, type TypeClassement } from './classements';

const TYPES: TypeClassement[] = [
  { cle: 'outil', libelle: 'Par outil', multiple: false, obligatoire: true, valeurs: [{ id: 1, nom: 'Delos' }, { id: 2, nom: 'Excel' }] },
  { cle: 'theme', libelle: 'Par thème', multiple: true, obligatoire: false, valeurs: [{ id: 5, nom: 'vibe-coding' }, { id: 6, nom: 'en vrac' }] },
];

describe('classementsManquants', () => {
  it('accepte une valeur par type, ou Aucune sélection sur un type facultatif', () => {
    expect(classementsManquants(TYPES, { outil: [1], theme: [5, 6] })).toEqual([]);
    expect(classementsManquants(TYPES, { outil: [1], theme: 'aucun' })).toEqual([]);
  });
  it('signale un type non décidé ou vide', () => {
    expect(classementsManquants(TYPES, { outil: [1] })).toEqual(['Par thème : choisissez une valeur ou cochez Aucune sélection.']);
    expect(classementsManquants(TYPES, { outil: [], theme: [] })).toEqual([
      'Par outil : choisissez une valeur.',
      'Par thème : choisissez une valeur ou cochez Aucune sélection.',
    ]);
  });
  it('refuse Aucune sélection sur un type obligatoire, plusieurs valeurs sur un type simple, une valeur inconnue', () => {
    expect(classementsManquants(TYPES, { outil: 'aucun', theme: 'aucun' })).toEqual(['Par outil : choisissez une valeur.']);
    expect(classementsManquants(TYPES, { outil: [1, 2], theme: 'aucun' })).toEqual(['Par outil : une seule valeur possible.']);
    expect(classementsManquants(TYPES, { outil: [99], theme: 'aucun' })).toEqual(['Par outil : valeur inconnue du site, choisissez-en une autre.']);
  });
});

describe('classificationsSite', () => {
  it('envoie les valeurs de chaque type du site, Aucune sélection en liste vide', () => {
    expect(classificationsSite(TYPES, { outil: [1], theme: 'aucun', ancien: [3] })).toEqual({ outil: [1], theme: [] });
  });
});
```

- [ ] **Step 2 :** `npx vitest run noyau/classements.test.ts` → FAIL (module introuvable).

- [ ] **Step 3 : implémentation** — `noyau/classements.ts`

```ts
// Classements du site (par outil, par thème…) : le site déclare ses types et leurs valeurs, le studio y range chaque vidéo.
export const CLE_OUTIL = 'outil';

export interface ValeurClassement { id: number; nom: string }
export interface TypeClassement { cle: string; libelle: string; multiple: boolean; obligatoire: boolean; valeurs: ValeurClassement[] }
// 'aucun' : « Aucune sélection » cochée sciemment ; clé absente : pas encore décidé.
export type ChoixClassements = Record<string, number[] | 'aucun'>;

export function classementsManquants(types: TypeClassement[], choix: ChoixClassements): string[] {
  return types.flatMap(t => {
    const c = choix[t.cle];
    const aucunPossible = !t.obligatoire && c === 'aucun';
    if (aucunPossible) return [];
    if (c === undefined || c === 'aucun' || c.length === 0) {
      return [`${t.libelle} : choisissez une valeur${t.obligatoire ? '' : ' ou cochez Aucune sélection'}.`];
    }
    if (!t.multiple && c.length > 1) return [`${t.libelle} : une seule valeur possible.`];
    if (c.some(id => !t.valeurs.some(v => v.id === id))) return [`${t.libelle} : valeur inconnue du site, choisissez-en une autre.`];
    return [];
  });
}

// Corps `classifications` du site : seuls ses types actuels, Aucune sélection en liste vide.
export function classificationsSite(types: TypeClassement[], choix: ChoixClassements): Record<string, number[]> {
  return Object.fromEntries(types.map(t => {
    const c = choix[t.cle];
    return [t.cle, Array.isArray(c) ? c : []];
  }));
}
```

- [ ] **Step 4 :** `npx vitest run noyau/classements.test.ts` → PASS.
- [ ] **Step 5 : commit** `git add noyau/classements.ts noyau/classements.test.ts` ; message « Noyau : classements du site, contrôle et corps envoyé ».

---

### Task 2 : `replit.classements` dans la publication (`noyau/publication.ts`)

**Interfaces — Consumes:** `ChoixClassements`, `CLE_OUTIL` (Task 1). **Produces:** `VideoPubliee['replit'] = { id: number | null; classements: ChoixClassements; playlistId: number | null }` ; `categorieId` disparaît.

- [ ] **Step 1 : tests qui échouent** — dans `noyau/publication.test.ts`, ajouter :

```ts
describe('classements du site', () => {
  const avecReplit = (replit: unknown) => ({
    version: 2, qualificationParDefaut: { nature: 'pro', confidentielle: false },
    videos: [{ ...videoParDefaut('complete', { nature: 'pro', confidentielle: false }), replit }],
  });
  it('reprend l’ancienne catégorie comme outil', () => {
    const p = migrerPublication(avecReplit({ id: 42, categorieId: 3, playlistId: null })) as Publication;
    expect(p.videos[0]!.replit).toEqual({ id: 42, classements: { outil: [3] }, playlistId: null });
    const sans = migrerPublication(avecReplit({ id: null, categorieId: null, playlistId: null })) as Publication;
    expect(sans.videos[0]!.replit).toEqual({ id: null, classements: {}, playlistId: null });
  });
  it('valide les classements', () => {
    expect(raisonPublication(avecReplit({ id: null, classements: { outil: [1], theme: 'aucun' }, playlistId: null }))).toBeNull();
    expect(raisonPublication(avecReplit({ id: null, classements: { theme: ['x'] }, playlistId: null })))
      .toBe('videos[0] : classements du site invalides');
  });
});
```
(importer `migrerPublication`, `raisonPublication`, `videoParDefaut`, `type Publication` s'ils ne le sont pas déjà.)

- [ ] **Step 2 :** `npx vitest run noyau/publication.test.ts` → FAIL.

- [ ] **Step 3 : implémentation** dans `noyau/publication.ts` :
  - import : `import type { ChoixClassements } from './classements';`
  - ligne 66 : `replit: { id: number | null; classements: ChoixClassements; playlistId: number | null };`
  - `videoParDefaut` : `replit: { id: null, classements: {}, playlistId: null },`
  - dans `completerVideo`, avant le `return` :
    ```ts
    // Avant les classements, l’outil était la seule catégorie du site.
    let replit = v.replit;
    if (estObjet(replit) && !('classements' in replit)) {
      const { categorieId, ...reste } = replit;
      replit = { ...reste, classements: typeof categorieId === 'number' ? { outil: [categorieId] } : {} };
    }
    return { logiciels: [], capturesCandidates: [], consignesVignette: [], ...v, vignette, replit };
    ```
  - ajouter près de `estId` :
    ```ts
    const estChoixClassements = (c: unknown) => estObjet(c)
      && Object.values(c).every(x => x === 'aucun' || (Array.isArray(x) && x.every(id => Number.isInteger(id))));
    ```
  - ligne 265 remplacée par :
    ```ts
    if (!estId(v.replit.id) || !estId(v.replit.playlistId)) return `${ou} : identifiants du site invalides`;
    if (!estChoixClassements(v.replit.classements)) return `${ou} : classements du site invalides`;
    ```
- [ ] **Step 4 : `noyau/relais.ts` `enregistrerRetrait`** : un retrait garde les choix de l'auteur et n'efface que l'identifiant : `replit: { ...v.replit, id: null }`. Mettre le commentaire à jour : « Vidéo retirée du site : plus d’identifiant, et le statut d’avant le relais. »
- [ ] **Step 5 : fixtures.** Remplacer partout `categorieId: N` → `classements: { outil: [N] }` et `categorieId: null` → `classements: {}` dans `replit: {…}` : `noyau/relais.test.ts`, `noyau/publication.test.ts`, `noyau/youtube.test.ts`, `studio/src/logique/publication.test.ts`, `studio/serveur/publication.test.ts`. Vérifier avec `Grep categorieId` (seuls restent `site-replit.ts` playlists et `PanneauSite.tsx`, traités plus loin). Adapter l'attente de `enregistrerRetrait` dans `noyau/relais.test.ts` ligne 103 : `replit: { id: null, classements: { outil: [3] }, playlistId: 7 }` ; et dans `studio/serveur/publication.test.ts` l. 525 en conséquence.
- [ ] **Step 6 :** `npx vitest run noyau` → seuls échouent les tests de `relais.ts` sur la catégorie (traités en Task 3) ; `npm run typecheck` signalera `relais.ts` et `PanneauSite.tsx` : normal, corrigés en Tasks 3 et 6. Ne pas commiter avant la Task 3 (commit commun).

---

### Task 3 : contrôle et corps du relais (`noyau/relais.ts`)

**Interfaces — Consumes:** Task 1, Task 2. **Produces:** `EtatRelais` gagne `classements: TypeClassement[] | null` (null = site injoignable) ; `corpsRelais(v, { dureeSecondes, fichier, thumbnailObject, classements: TypeClassement[] })` ; `CorpsVideoSite` gagne `classifications: Record<string, number[]>`.

- [ ] **Step 1 : tests** dans `noyau/relais.test.ts` :
  - en tête : `import type { TypeClassement } from './classements';` et
    ```ts
    const TYPES: TypeClassement[] = [
      { cle: 'outil', libelle: 'Par outil', multiple: false, obligatoire: true, valeurs: [{ id: 3, nom: 'Delos' }] },
      { cle: 'theme', libelle: 'Par thème', multiple: true, obligatoire: false, valeurs: [{ id: 5, nom: 'vibe-coding' }] },
    ];
    ```
  - fixture `video` : `replit: { id: null, classements: { outil: [3], theme: 'aucun' }, playlistId: 7 }` ; `ETAT` gagne `classements: TYPES`.
  - remplacer le test « exige la catégorie » par :
    ```ts
    it('reprend les contrôles avant envoi, exige chaque classement et un site configuré', () => {
      expect(problemesRelais(video({ statut: 'a-preparer', replit: { id: null, classements: { outil: [3] }, playlistId: null } }), 'Desc', R, {
        rendu: { fichier: 'video-complete.mp4', present: false }, octetsVignette: 1000, siteConfigure: false, classements: TYPES,
      })).toEqual([
        'Vidéo pas encore validée pour la publication.',
        'Rendu absent : video-complete.mp4.',
        'Par thème : choisissez une valeur ou cochez Aucune sélection.',
        'Site non configuré : renseignez REPLIT_SITE_URL et REPLIT_API_KEY dans .env, puis relancez le studio.',
      ]);
    });
    it('refuse le relais sans les classements du site', () => {
      expect(problemesRelais(video(), 'Desc', R, { ...ETAT, classements: null }))
        .toEqual(['Site injoignable : classements indisponibles, réessayez dans un instant.']);
    });
    ```
  - test de `corpsRelais` : passer `classements: TYPES` et attendre `categoryId: 3, classifications: { outil: [3], theme: [] }` ; le test « catégorie manquante » attend `toThrow('Outil du site manquant.')` avec `classements: {}`.
- [ ] **Step 2 :** `npx vitest run noyau/relais.test.ts` → FAIL.
- [ ] **Step 3 : implémentation** :
  ```ts
  import { CLE_OUTIL, classementsManquants, classificationsSite, type TypeClassement } from './classements';
  // CorpsVideoSite : ajouter
  classifications: Record<string, number[]>;
  // EtatRelais :
  export type EtatRelais = Parameters<typeof problemesDiffusion>[3] & { siteConfigure: boolean; classements: TypeClassement[] | null };
  // problemesRelais : remplacer la ligne de catégorie par
  if (etat.classements === null) problemes.push('Site injoignable : classements indisponibles, réessayez dans un instant.');
  else problemes.push(...classementsManquants(etat.classements, v.replit.classements));
  // corpsRelais : o gagne classements: TypeClassement[] ; en tête
  const outil = v.replit.classements[CLE_OUTIL];
  if (!Array.isArray(outil) || outil.length !== 1) throw new Error('Outil du site manquant.');
  // dans l’objet : categoryId: outil[0]!, classifications: classificationsSite(o.classements, v.replit.classements),
  ```
- [ ] **Step 4 :** `npx vitest run noyau` → PASS.
- [ ] **Step 5 : commit** (Tasks 2 et 3 + fixtures) : « Publication : classements du site à la place de la catégorie, exigés avant le relais ».

---

### Task 4 : lecture des classements et création de valeur (`studio/serveur/site-replit.ts`)

**Interfaces — Consumes:** `TypeClassement`, `ValeurClassement`. **Produces:** `ReferencesSite.classements: TypeClassement[]` ; `ClientSite.creerValeur(cle: string, nom: string): Promise<ValeurClassement>`.

- [ ] **Step 1 : tests** dans `site-replit.test.ts` :
  - `lireReferencesSite` : le faux `fetch` répond aussi à `/api/classifications` :
    ```ts
    const recuperer = vi.fn(async (url: string) => reponse(
      url.endsWith('/api/categories') ? [{ id: 1, name: 'IA & outils numériques' }, { id: 'x' }]
      : url.endsWith('/api/classifications') ? [
        { key: 'theme', label: 'Par thème', multiple: true, required: false, values: [{ id: 5, name: 'vibe-coding' }, { id: 'y' }] },
        { key: 'cassé' },
      ]
      : [{ id: 7, name: 'Bureautique', categoryId: 1 }]));
    // attendu en plus :
    classements: [{ cle: 'theme', libelle: 'Par thème', multiple: true, obligatoire: false, valeurs: [{ id: 5, nom: 'vibe-coding' }] }],
    ```
  - `creerClientSite` :
    ```ts
    it('crée une valeur de classement, ou reprend celle qui existe déjà', async () => {
      reponse = r => (r.chemin === '/api/classifications/theme/values' ? [201, { id: 9, name: 'IA' }] : [404, { error: 'Unknown classification' }]);
      expect(await site().creerValeur('theme', 'IA')).toEqual({ id: 9, nom: 'IA' });
      expect(requetes[0]).toMatchObject({ methode: 'POST', chemin: '/api/classifications/theme/values' });
      expect(requetes[0]!.entetes['x-api-key']).toBe('cle-secrete');
      expect(JSON.parse(requetes[0]!.corps.toString())).toEqual({ name: 'IA' });
      reponse = () => [200, { id: 5, name: 'vibe-coding' }];
      expect(await site().creerValeur('theme', 'Vibe-Coding')).toEqual({ id: 5, nom: 'vibe-coding' });
      reponse = () => [404, { error: 'Unknown classification' }];
      await expect(site().creerValeur('nope', 'x')).rejects.toThrow('Création de valeur refusée par le site (404 : Unknown classification) ; rien n’est perdu.');
    });
    ```
- [ ] **Step 2 :** `npx vitest run studio/serveur/site-replit.test.ts` → FAIL.
- [ ] **Step 3 : implémentation** :
  ```ts
  import type { TypeClassement, ValeurClassement } from '../../noyau/classements';
  export interface ReferencesSite {
    categories: { id: number; nom: string }[];
    playlists: { id: number; nom: string; categorieId: number }[];
    classements: TypeClassement[];
  }
  const versValeurs = (v: unknown): ValeurClassement[] => (Array.isArray(v) ? v : []).filter(estObjet)
    .filter(x => typeof x.id === 'number' && typeof x.name === 'string').map(x => ({ id: x.id as number, nom: x.name as string }));
  ```
  - dans `lireReferencesSite` : routes `['categories', 'playlists', 'classifications']`, déstructurer `[categories, playlists, classifications]`, exiger `Array.isArray(classifications)`, et ajouter :
    ```ts
    classements: classifications.filter(estObjet)
      .filter(t => typeof t.key === 'string' && typeof t.label === 'string' && typeof t.multiple === 'boolean' && typeof t.required === 'boolean')
      .map(t => ({ cle: t.key as string, libelle: t.label as string, multiple: t.multiple as boolean, obligatoire: t.required as boolean, valeurs: versValeurs(t.values) })),
    ```
  - `ClientSite` : `creerValeur: (cle: string, nom: string) => Promise<ValeurClassement>;`
  - implémentation :
    ```ts
    async creerValeur(cle, nom) {
      const { statut, json } = await appeler(`/api/classifications/${encodeURIComponent(cle)}/values`, 'POST', { name: nom }, 'rien n’est perdu');
      // 200 : une valeur du même nom existait déjà, le site la renvoie.
      if ((statut !== 200 && statut !== 201) || typeof json.id !== 'number' || typeof json.name !== 'string') {
        throw refus('Création de valeur', statut, json, 'rien n’est perdu');
      }
      return { id: json.id, nom: json.name };
    },
    ```
    (`refus` dit « …refusée par le site (404 : …) ; rien n’est perdu. »)
- [ ] **Step 4 :** test → PASS. Ajouter `creerValeur: vi.fn(async (_c: string, nom: string) => ({ id: 99, nom }))` au faux `site` de `studio/serveur/publication.test.ts` et `classements: [...]` (outil `{ id: 1 }` + thème) au `SITE` de ce fichier.
- [ ] **Step 5 : commit** « Site : lecture des classements et création de valeur ».

---

### Task 5 : relais avec les types et route de création (`studio/serveur/publication.ts`, `studio/src/api.ts`)

**Interfaces — Consumes:** Tasks 3, 4. **Produces:** `POST /api/site/classements/{cle}/valeurs` `{ nom }` → `200 ValeurClassement` ; client `api.creerValeurClassement(cle: string, nom: string): Promise<ValeurClassement>`.

- [ ] **Step 1 : tests** dans `studio/serveur/publication.test.ts` :
  - dans le describe du relais, avec un SITE dont le thème est facultatif et une vidéo `classements: { outil: [1] }` :
    ```ts
    it('refuse le relais tant qu’un classement n’est pas décidé', async () => {
      // préparer comme le test « Choisissez la catégorie » existant, avec replit: { id: null, classements: { outil: [1] }, playlistId: null }
      expect((await (await relayer()).json()).problemes).toEqual(['Par thème : choisissez une valeur ou cochez Aucune sélection.']);
    });
    it('relaie avec les classements du site', async () => {
      // vidéo prête avec classements: { outil: [1], theme: 'aucun' }
      await relayer();
      expect(config.site!.enregistrerVideo).toHaveBeenCalledWith(null, expect.objectContaining({ categoryId: 1, classifications: { outil: [1], theme: [] } }));
    });
    ```
    Remplacer l'ancien test attendant `['Choisissez la catégorie du site.']` par le premier ci-dessus ; mettre `theme: 'aucun'` dans `SITE_CHOISI` (l. 316).
  - nouveau describe :
    ```ts
    describe('valeurs de classement', () => {
      const creer = (cle: string, corps: unknown) =>
        fetch(`${url}/api/site/classements/${cle}/valeurs`, { method: 'POST', headers: json, body: JSON.stringify(corps) });
      it('crée la valeur sur le site', async () => {
        const r = await creer('theme', { nom: ' IA ' });
        expect(r.status).toBe(200);
        expect(await r.json()).toEqual({ id: 99, nom: 'IA' });
        expect(config.site!.creerValeur).toHaveBeenCalledWith('theme', 'IA');
      });
      it('refuse un nom vide, et sans site configuré', async () => {
        expect((await creer('theme', { nom: '  ' })).status).toBe(400);
      });
    });
    ```
- [ ] **Step 2 :** `npx vitest run studio/serveur/publication.test.ts` → FAIL.
- [ ] **Step 3 : implémentation** :
  - `relayer` : avant `problemesRelais`, `const references = await c.lireSite(c.urlSite);` ; ajouter `classements: references?.classements ?? null` à l'état ; passer `classements: references!.classements` à `corpsRelais` (garanti non nul quand `problemes` est vide).
  - nouvelle fonction :
    ```ts
    async function creerValeurClassement(req: IncomingMessage, cle: string): Promise<ValeurClassement> {
      const nom = objet(await lireCorps(req)).nom;
      if (typeof nom !== 'string' || nom.trim() === '') throw new ErreurHttp(400, 'nom attendu : texte non vide.');
      if (!c.site) throw new ErreurHttp(422, 'Site non configuré : renseignez REPLIT_SITE_URL et REPLIT_API_KEY dans .env, puis relancez le studio.');
      try {
        return await c.site.creerValeur(cle, nom.trim());
      } catch (e) {
        throw new ErreurHttp(502, message(e));
      }
    }
    ```
  - dans `traiter`, avant `if (!route && chemin !== '/api/poses')` :
    ```ts
    const valeur = /^\/api\/site\/classements\/([^/]+)\/valeurs$/.exec(chemin);
    if (valeur) {
      try {
        if (req.method !== 'POST') throw new ErreurHttp(405, 'Méthode non permise.');
        repondre(res, 200, await creerValeurClassement(req, decodeURIComponent(valeur[1]!)));
      } catch (e) {
        repondreErreur(res, e);
      }
      return true;
    }
    ```
  - `studio/src/api.ts` : `creerValeurClassement: (cle: string, nom: string) => appeler<ValeurClassement>(`/api/site/classements/${encodeURIComponent(cle)}/valeurs`, enJson('POST', { nom })),` (+ import du type).
- [ ] **Step 4 :** `npx vitest run studio/serveur` → PASS.
- [ ] **Step 5 : commit** « Studio : relais avec les classements, route de création de valeur ».

---

### Task 6 : interface (`ChoixClassement.tsx`, `PanneauSite.tsx`)

**Interfaces — Consumes:** `TypeClassement`, `ChoixClassements`, `classementsManquants`, `api.creerValeurClassement`.

- [ ] **Step 1 : composant** `studio/src/composants/ChoixClassement.tsx` :

```tsx
import { type FC, useState } from 'react';
import type { TypeClassement, ValeurClassement } from '../../../noyau/classements';
import { api } from '../api';

interface Props {
  type: TypeClassement;
  choix: number[] | 'aucun' | undefined;
  changer: (choix: number[] | 'aucun' | undefined) => void;
  ajouterValeur: (cle: string, v: ValeurClassement) => void;
}

// Un type de classement du site : valeurs existantes, création d’une valeur, « Aucune sélection » si le type est facultatif.
export const ChoixClassement: FC<Props> = ({ type: t, choix, changer, ajouterValeur }) => {
  const [nouveau, setNouveau] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const choisies = Array.isArray(choix) ? choix : [];
  const connue = (id: number) => t.valeurs.some(v => v.id === id);

  const creer = async () => {
    if (!nouveau?.trim()) return;
    setOccupe(true);
    setErreur(null);
    try {
      const v = await api.creerValeurClassement(t.cle, nouveau);
      ajouterValeur(t.cle, v);
      changer(t.multiple ? [...new Set([...choisies, v.id])] : [v.id]);
      setNouveau(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setOccupe(false);
    }
  };

  return (
    <fieldset className="classement">
      <legend>{t.libelle}</legend>
      <select
        multiple={t.multiple}
        value={t.multiple ? choisies.map(String) : String(choisies[0] ?? '')}
        onChange={e => {
          const ids = [...e.target.selectedOptions].map(o => Number(o.value)).filter(connue);
          changer(ids.length > 0 ? ids : undefined);
        }}
      >
        {!t.multiple && <option value="">—</option>}
        {t.valeurs.map(v => <option key={v.id} value={v.id}>{v.nom}</option>)}
      </select>
      {nouveau === null
        ? <button type="button" onClick={() => setNouveau('')}>+ Créer…</button>
        : (
          <span>
            <input autoFocus value={nouveau} onChange={e => setNouveau(e.target.value)} placeholder={`Nouvelle valeur « ${t.libelle} »`} />
            <button type="button" disabled={occupe || !nouveau.trim()} onClick={() => void creer()}>Créer</button>
            <button type="button" onClick={() => setNouveau(null)}>Annuler</button>
          </span>
        )}
      {!t.obligatoire && (
        <label>
          <input type="checkbox" checked={choix === 'aucun'} onChange={e => changer(e.target.checked ? 'aucun' : undefined)} />
          {' '}Aucune sélection
        </label>
      )}
      {erreur && <p className="alerte">{erreur}</p>}
    </fieldset>
  );
};
```

- [ ] **Step 2 : `PanneauSite.tsx`** :
  - nouvelles props : `ajouterValeur: (cle: string, v: ValeurClassement) => void` (le parent `EcranPublication.tsx` ajoute la valeur à `detail.site.classements[cle].valeurs` dans son état).
  - remplacer le bloc `<select>` Catégorie par :
    ```tsx
    {site.classements.map(t => (
      <ChoixClassement
        key={t.cle} type={t} choix={v.replit.classements[t.cle]} ajouterValeur={ajouterValeur}
        changer={choix => {
          const { [t.cle]: _, ...autres } = v.replit.classements;
          const classements = choix === undefined ? autres : { ...autres, [t.cle]: choix };
          // Changer d’outil vide la playlist, qui en dépend.
          const playlistId = t.cle === CLE_OUTIL ? null : v.replit.playlistId;
          changer({ replit: { ...v.replit, classements, playlistId } });
        }}
      />
    ))}
    ```
  - filtre des playlists : `const outil = v.replit.classements[CLE_OUTIL]; const idOutil = Array.isArray(outil) ? outil[0] : undefined;` puis `p => idOutil === undefined || p.categorieId === idOutil`.
  - `const manquants = site ? classementsManquants(site.classements, v.replit.classements) : [];` ; bouton Relayer `disabled={occupe || manquants.length > 0}` ; sous les actions : `{manquants.length > 0 && <ul className="discret">{manquants.map(m => <li key={m}>{m}</li>)}</ul>}`.
- [ ] **Step 3 :** `EcranPublication.tsx` : passer `ajouterValeur` qui met à jour l'état local du détail :
  ```ts
  const ajouterValeur = (cle: string, valeur: ValeurClassement) => setDetail(d => d && d.site ? {
    ...d, site: { ...d.site, classements: d.site.classements.map(t => (t.cle === cle && !t.valeurs.some(x => x.id === valeur.id) ? { ...t, valeurs: [...t.valeurs, valeur] } : t)) },
  } : d);
  ```
  (adapter au nom réel du setter de l'état du détail dans ce fichier.)
- [ ] **Step 4 :** `npm run typecheck` et `npm test` → PASS ; vérifier à la main dans le Studio (`/run`) : blocs Par outil / Par thème, création d'une valeur, case Aucune sélection, bouton Relayer bloqué puis débloqué.
- [ ] **Step 5 : commit** « Studio : choix des classements du site dans le panneau Replit ».

---

### Task 7 : prompt Replit et documentation

- [ ] **Step 1 :** créer `docs/replit-classements.md` contenant le prompt à envoyer à l'app Replit, repris de la section 1 de la spec (routes, codes 200/201/404/400, validation `multiple`/`required`, outil ↔ `categoryId`, table des thèmes alimentant la rubrique « Par thème » avec reprise des trois thèmes actuels et des vidéos déjà taguées, `classifications` dans les réponses vidéo, mise à jour d'`openapi.yaml` puis codegen).
- [ ] **Step 2 :** `docs/studio.md` : paragraphe « Classements du site » (où se choisissent les classements, Aucune sélection, création de valeur, refus du relais).
- [ ] **Step 3 : commit** « Docs : classements du site et prompt Replit ».
- [ ] **Step 4 :** soumettre le prompt à l'auteur avant tout envoi à Replit (`update_app_using_prompt`) — action extérieure, à confirmer.
