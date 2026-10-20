# Plan 5 — Éléments à l'écran : plan de mise en œuvre

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pendant un passage choisi, l'auteur peut zoomer sur une zone du partage d'écran, mettre une zone en avant, incruster un texte court ou passer la caméra en grand ; ces éléments se créent depuis le texte, par une consigne ou par une suggestion de l'analyse, se retouchent dans un panneau dédié et apparaissent dans l'aperçu et le rendu.

**Architecture:** Les éléments vivent dans `montage.json` (`elements`, temps de la source). Les règles (forme, durée à l'écran, chevauchements) sont une seule fonction pure du noyau (`noyau/elements.ts`), utilisée par la vérification des consignes, par les retouches directes du studio et par le contrôle avant rendu. `noyau/decisions.ts` place les éléments validés en images dans chaque partie, comme les encarts. Côté Remotion, `Cadrage` agit sur la couche vidéo (zoom, caméra en grand, vignette reposée pendant un zoom) et `Incrustation` pose mise en avant et texte au-dessus. Le studio ajoute quatre entrées au menu du texte sélectionné, un calque de tracé de zone sur l'aperçu et un panneau « Éléments à l'écran ». Le pipeline Python ajoute une rubrique `elements` aux suggestions de Claude.

**Tech Stack:** Node 22, TypeScript 5 (`strict`, `noUncheckedIndexedAccess`), Vitest 3, React 19.3.0, Vite 7.3.7, Remotion 4.0.533 (`@remotion/media`, `@remotion/player`), `@anthropic-ai/sdk` + `zod` ; Python 3.11 + Pydantic + pytest.

Spec de référence : `docs/superpowers/specs/2026-10-20-elements-ecran-design.md`.

## Global Constraints

- La chaîne s'appelle **« PMT »** (projet personnel). Aucune mention d'organisation (employeur, pôle, client) dans le code, les textes affichés, les prompts ou la documentation.
- Texte visible, noms de domaine et prompts en français ; clés JSON en camelCase ; apostrophe typographique `’` dans les textes affichés et les messages de problème.
- Temps des éléments en secondes de `source.mp4`, comme les coupes et les chapitres ; un élément créé à partir de mots prend le début du premier mot et la fin du dernier.
- Zones en pixels de la source (1920×1080). **Claude ne fournit jamais de zone** (ni dans les consignes, ni dans les suggestions) : elle se trace toujours à la souris.
- Ids uniques dans le montage : `e0`, `e1`… pour les éléments créés dans le studio (y compris par une consigne), `se0`, `se1`… pour les suggestions de l'analyse.
- Un montage enregistré sans `elements` est lu comme une liste vide ; une analyse sans `suggestions.elements` aussi. La version des fichiers reste 1.
- Réglages : `camera: { x: 24, y: 786, largeur: 480, hauteur: 270 }` ; `elements: { texteMaxCaracteres: 40, dureeMin: 1, zoomLargeurMin: 480 }`.
- Règles : au moins `dureeMin` à l'écran une fois les coupes retirées ; texte non vide et d'au plus `texteMaxCaracteres` ; zone dans l'image, et pour un zoom en 16:9 (à un pixel près) et d'au moins `zoomLargeurMin` de large ; pas deux cadres (zoom ou caméra) en même temps ; pas de mise en avant pendant un zoom ou la caméra ; pas deux textes à la même position en même temps ; pas de texte `haut-droite` pendant un encart de définition en haut. Chevauchements jugés entre éléments `valide` ou `a-valider`, sur les temps de la source. Les éléments `ecarte` sont ignorés partout.
- Un élément `a-valider` bloque le rendu ; un élément `a-valider` sans zone ne peut pas être accepté.
- La frise, le logo et les encarts de définition restent au-dessus de tout.
- Aucun appel réel à Claude dans les tests automatiques.
- Le chemin du projet contient « & » : ne jamais utiliser `npx` ; passer par les scripts npm (`npm test -- <fichier>`, `npm run typecheck`, `npm run studio`). Côté Python : `cd pipeline; ..\.venv\Scripts\python -m pytest <fichiers> -q`.
- Chaque commit se termine par la ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Structure des fichiers

```
reglages.json                   + camera, elements
noyau/
  types.ts                      Zone, ElementEcran, SuggestionElement ; Montage.elements ; Reglages.camera / elements
  temps.ts (+ test)             + plageMontee
  edition.ts (+ test)           + prochainIdElement, ajouterElement, modifierElement, supprimerElement
  elements.ts (+ test)          NOUVEAU : règles (problemesElements, problemeDe), libellés, dimensions de la source
  verifications.ts (+ test)     nouvelle signature, éléments à valider et en défaut
  decisions.ts (+ test)         Partie.elements, placerElements
  montage-initial.ts (+ test)   éléments suggérés
  consignes.ts (+ test)         ajouterElement, modifierElement, supprimerElement, zone à tracer
remotion/
  charte.ts                     + camera
  calculs.ts (+ test)           progressionElement, transformationZoom, transformationCamera
  composants/
    CoucheVideo.tsx             NOUVEAU (extrait de VideoMontee)
    CameraEnGrand.tsx           NOUVEAU
    Cadrage.tsx                 NOUVEAU : zoom, caméra en grand, vignette reposée
    MiseEnAvant.tsx             NOUVEAU
    TexteIncruste.tsx           NOUVEAU
    Incrustation.tsx            NOUVEAU : aiguillage mise en avant / texte
  compositions/VideoMontee.tsx  branchement
  apercus.tsx, Root.tsx         une composition de démonstration par nature
  exemple.ts                    Partie.elements
  scripts/tournage.ts (+ test)  lecture tolérante de montage.json
studio/
  serveur/consignes.ts          DemandeInterpretation.texteMax
  serveur/interpretation.ts (+ test, snapshot)  éléments dans le prompt et le schéma
  serveur/api.ts (+ test)       nouvelle vérification avant rendu, texteMax
  src/logique/zone.ts (+ test)        NOUVEAU : conversion des coordonnées, rectangle 16:9
  src/logique/elements.ts (+ test)    NOUVEAU : éléments affichés, texte prérempli
  src/logique/texte.ts (+ test)       repères des éléments
  src/logique/consignes.ts (+ test)   passage des opérations sur les éléments, demandeUneZone
  src/composants/
    TraceurZone.tsx             NOUVEAU : calque de tracé sur l'aperçu
    ChoixPosition.tsx           NOUVEAU
    PanneauElements.tsx         NOUVEAU
    Apercu.tsx, Texte.tsx, EcranMontage.tsx, PanneauConsignes.tsx, PanneauRendu.tsx
  src/styles.css
pipeline/
  mtpipeline/suggestions.py, mtpipeline/cli.py
  tests/test_suggestions.py, tests/test_cli.py
docs/studio.md                  section « Éléments à l’écran »
```

Données de test communes (fixture `fixtures/analyse-exemple.json`, durée 30 s, 30 images/s, 6 mots) :

| id | texte | debut | fin |
|---|---|---|---|
| 0 | Bonjour | 0.8 | 1.2 |
| 1 | à | 1.25 | 1.35 |
| 2 | tous. | 1.4 | 1.8 |
| 3 | Aujourd'hui, | 3.0 | 3.6 |
| 4 | le | 3.65 | 3.75 |
| 5 | SSO. | 3.8 | 4.3 |

Avec la coupe `{ id: 'd1', type: 'hesitation', debut: 1.8, fin: 3.0, active: true }` et les réglages de `reglages.json` (`margeMots` 0,06), la partie coupée va de 1,86 à 2,94 : les segments conservés sont `[0, 1.86]` et `[2.94, 30]`. Les mots 3 à 5 (3,0 à 4,3) restent 1,3 s à l'écran ; le mot 4 seul, 0,1 s.

---

### Task 1 : Données — types, réglages, lecture tolérante, éléments suggérés

**Files:**
- Modify: `noyau/types.ts`
- Modify: `reglages.json`
- Modify: `noyau/reglages.test.ts`
- Modify: `remotion/scripts/tournage.ts`
- Modify: `remotion/scripts/tournage.test.ts`
- Modify: `noyau/montage-initial.ts`
- Modify: `noyau/montage-initial.test.ts`
- Modify (littéraux de test typés `Montage`) : `noyau/consignes.test.ts`, `noyau/decisions.test.ts`, `noyau/edition.test.ts`, `noyau/verifications.test.ts`, `studio/src/logique/consignes.test.ts`, `studio/src/logique/texte.test.ts`

**Interfaces:**
- Consumes: rien de nouveau.
- Produces (utilisés par toutes les tâches suivantes) :
  - `interface Zone { x: number; y: number; largeur: number; hauteur: number }`
  - `type NatureElement = 'zoom' | 'miseEnAvant' | 'texte' | 'camera'`
  - `type PositionTexte = 'haut-gauche' | 'haut-droite' | 'centre' | 'bas-centre'`
  - `type StatutElement = 'a-valider' | 'valide' | 'ecarte'`
  - `type ElementEcran = { id: string; debut: number; fin: number; statut: StatutElement } & ({ nature: 'zoom'; zone: Zone | null } | { nature: 'miseEnAvant'; zone: Zone | null } | { nature: 'texte'; texte: string; position: PositionTexte } | { nature: 'camera' })`
  - `interface SuggestionElement { id: string; nature: 'zoom' | 'miseEnAvant' | 'texte'; debut: number; fin: number; texte?: string; raison: string }`
  - `Suggestions.elements?: SuggestionElement[]` ; `Montage.elements: ElementEcran[]` ; `Reglages.camera: Zone` ; `Reglages.elements: { texteMaxCaracteres: number; dureeMin: number; zoomLargeurMin: number }`
  - `raisonMontage` accepte `elements` absent ou liste ; `chargerTournage` complète un montage sans `elements` par `[]`.
  - `montageInitial` et `integrerSuggestions` reprennent `analyse.suggestions.elements`.

> Le nom `ElementEcran` évite de masquer le type DOM `Element`, utilisé dans `studio/src/composants/Texte.tsx`.

- [ ] **Step 1 : Écrire les tests qui échouent**

Dans `noyau/reglages.test.ts`, à la fin du `it` existant, ajouter :

```ts
    expect(r.camera).toEqual({ x: 24, y: 786, largeur: 480, hauteur: 270 });
    expect(r.elements).toEqual({ texteMaxCaracteres: 40, dureeMin: 1, zoomLargeurMin: 480 });
```

Dans `remotion/scripts/tournage.test.ts` :

1. Dans `it('refuse un montage.json invalide', …)`, ajouter à la liste des cas, après `[{ ...valide, termes: 'x' }, 'termes'],` :

```ts
      [{ ...valide, elements: {} }, 'elements'],
```

2. Après `it('reprend montage.json quand il existe', …)`, ajouter :

```ts
  it('lit un montage enregistré sans éléments à l’écran comme une liste vide', async () => {
    const montage = { version: 1, titre: 'Validé', coupes: [], chapitres: [{ titre: 'Seul', debut: 0 }], termes: [] };
    const t = await chargerTournage(await tournage({ 'analyse.json': exemple, 'montage.json': montage }), { brouillon: false });
    expect(t.montage.elements).toEqual([]);
  });
```

À la fin de `noyau/montage-initial.test.ts`, ajouter :

```ts
describe('éléments suggérés', () => {
  const avecElements: Analyse = {
    ...analyse,
    suggestions: {
      ...analyse.suggestions!,
      elements: [
        { id: 'se0', nature: 'texte', debut: 3.0, fin: 4.3, texte: 'SSO', raison: 'Sigle prononcé.' },
        { id: 'se1', nature: 'zoom', debut: 0.8, fin: 1.8, raison: 'Désigne l’écran.' },
      ],
    },
  };

  it('transforme chaque suggestion en élément à valider', () => {
    expect(montageInitial(avecElements, 'T').elements).toEqual([
      { id: 'se0', debut: 3.0, fin: 4.3, statut: 'a-valider', nature: 'texte', texte: 'SSO', position: 'haut-gauche' },
      { id: 'se1', debut: 0.8, fin: 1.8, statut: 'a-valider', nature: 'zoom', zone: null },
    ]);
  });
  it('lit une analyse sans suggestions d’éléments comme une liste vide', () => {
    expect(montageInitial(analyse, 'T').elements).toEqual([]);
    expect(montageInitial({ ...analyse, suggestions: null }, 'T').elements).toEqual([]);
  });
  it('ajoute les suggestions d’éléments absentes sans toucher aux autres', () => {
    const m = {
      ...montageInitial(analyse, 'T'),
      elements: [{ id: 'se0', debut: 3.0, fin: 4.3, statut: 'ecarte' as const, nature: 'camera' as const }],
    };
    expect(integrerSuggestions(m, avecElements).elements.map(e => [e.id, e.statut])).toEqual([
      ['se0', 'ecarte'], ['se1', 'a-valider'],
    ]);
  });
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- noyau/reglages.test.ts remotion/scripts/tournage.test.ts noyau/montage-initial.test.ts`
Expected: FAIL (`r.camera` indéfini, `elements` non contrôlé, `montageInitial(...).elements` indéfini).

- [ ] **Step 3 : Ajouter les types dans `noyau/types.ts`**

1. Après `interface Suggestions { … }` (avant), insérer :

```ts
// Rectangle en pixels de source.mp4 (1920×1080).
export interface Zone {
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
}

export type NatureElement = 'zoom' | 'miseEnAvant' | 'texte' | 'camera';
export type PositionTexte = 'haut-gauche' | 'haut-droite' | 'centre' | 'bas-centre';
export type StatutElement = 'a-valider' | 'valide' | 'ecarte';

// Élément posé sur la vidéo pendant un passage de la source.
// `zone: null` n'existe que pour une suggestion de l'analyse pas encore complétée.
export type ElementEcran = { id: string; debut: number; fin: number; statut: StatutElement } & (
  | { nature: 'zoom'; zone: Zone | null }
  | { nature: 'miseEnAvant'; zone: Zone | null }
  | { nature: 'texte'; texte: string; position: PositionTexte }
  | { nature: 'camera' }
);

// Suggestion de l'analyse ; sa raison reste lisible dans le studio par l'id.
export interface SuggestionElement {
  id: string;
  nature: 'zoom' | 'miseEnAvant' | 'texte';
  debut: number;
  fin: number;
  texte?: string;
  raison: string;
}
```

2. Remplacer l'interface `Suggestions` par :

```ts
export interface Suggestions {
  chapitres: SuggestionChapitre[];
  termes: SuggestionTerme[];
  longueurs: SuggestionLongueur[];
  // Absent dans une analyse faite avant les éléments à l'écran : aucune suggestion.
  elements?: SuggestionElement[];
}
```

3. Remplacer l'interface `Montage` par :

```ts
export interface Montage {
  version: 1;
  titre: string;
  coupes: Coupe[];
  chapitres: Chapitre[];
  termes: Terme[];
  elements: ElementEcran[];
}
```

4. Dans `Reglages`, après la ligne `audio: { … };`, ajouter :

```ts
  // Position de la vignette caméra dans la source, en pixels.
  camera: Zone;
  elements: { texteMaxCaracteres: number; dureeMin: number; zoomLargeurMin: number };
```

- [ ] **Step 4 : Ajouter les réglages dans `reglages.json`**

Après le bloc `"audio": { … }` (en ajoutant la virgule qui manque après son accolade fermante), ajouter :

```json
  "camera": { "x": 24, "y": 786, "largeur": 480, "hauteur": 270 },
  "elements": {
    "texteMaxCaracteres": 40,
    "dureeMin": 1,
    "zoomLargeurMin": 480
  }
```

- [ ] **Step 5 : Lecture tolérante dans `remotion/scripts/tournage.ts`**

1. Remplacer `raisonMontage` par :

```ts
export function raisonMontage(m: unknown): string | null {
  if (!estObjet(m)) return 'objet attendu';
  if (m.version !== 1) return 'version 1 attendue';
  if (typeof m.titre !== 'string') return 'titre doit être un texte';
  for (const champ of ['coupes', 'chapitres', 'termes']) {
    if (!Array.isArray(m[champ])) return `${champ} doit être une liste`;
  }
  // Absent dans un montage enregistré avant les éléments à l'écran.
  if (m.elements !== undefined && !Array.isArray(m.elements)) return 'elements doit être une liste';
  return null;
}
```

2. Dans `chargerTournage`, remplacer la ligne :

```ts
  if (existsSync(cheminMontage)) montage = await lireValide<Montage>(cheminMontage, `${nom}/montage.json`, raisonMontage);
```

par :

```ts
  if (existsSync(cheminMontage)) {
    const lu = await lireValide<Montage>(cheminMontage, `${nom}/montage.json`, raisonMontage);
    montage = { ...lu, elements: lu.elements ?? [] };
  }
```

- [ ] **Step 6 : Éléments suggérés dans `noyau/montage-initial.ts`**

1. Remplacer l'import par :

```ts
import type { Analyse, Chapitre, Coupe, ElementEcran, Montage, Terme } from './types';
```

2. Après `termesSuggeres`, ajouter :

```ts
// Chaque suggestion devient un élément à valider : texte en haut à gauche, zone à tracer.
function elementsSuggeres(analyse: Analyse): ElementEcran[] {
  return (analyse.suggestions?.elements ?? []).map((s): ElementEcran => {
    const commun = { id: s.id, debut: s.debut, fin: s.fin, statut: 'a-valider' as const };
    return s.nature === 'texte'
      ? { ...commun, nature: 'texte', texte: s.texte ?? '', position: 'haut-gauche' }
      : { ...commun, nature: s.nature, zone: null };
  });
}
```

3. Remplacer la ligne `return { version: 1, titre, coupes, … };` de `montageInitial` par :

```ts
  return {
    version: 1,
    titre,
    coupes,
    chapitres: chapitresSuggeres(analyse, titre),
    termes: termesSuggeres(analyse),
    elements: elementsSuggeres(analyse),
  };
```

4. Dans `integrerSuggestions`, après `const seul = …;`, ajouter :

```ts
  const idsElements = new Set(montage.elements.map(e => e.id));
```

et dans l'objet renvoyé, après la ligne `termes: …,`, ajouter :

```ts
    elements: [...montage.elements, ...elementsSuggeres(analyse).filter(e => !idsElements.has(e.id))],
```

- [ ] **Step 7 : Compléter les littéraux `Montage` des tests existants**

Ajouter la ligne `elements: [],` juste après la ligne `termes: …` (ou le tableau `termes: [ … ],`) de chacun de ces littéraux typés `Montage` :
- `noyau/consignes.test.ts` : `const base: Montage = { … }`
- `noyau/decisions.test.ts` : `const montage: Montage = { … }`
- `noyau/edition.test.ts` : `const base: Montage = { … }`
- `noyau/verifications.test.ts` : `const pret: Montage = { … }`
- `studio/src/logique/consignes.test.ts` : `const montage: Montage = { … }`
- `studio/src/logique/texte.test.ts` : les deux `const montage: Montage = { … }`

- [ ] **Step 8 : Lancer les tests et la vérification de types**

Run: `npm test` puis `npm run typecheck`
Expected: PASS ; aucune erreur de type.

- [ ] **Step 9 : Commit**

```bash
git add noyau/types.ts reglages.json noyau/reglages.test.ts remotion/scripts/tournage.ts remotion/scripts/tournage.test.ts noyau/montage-initial.ts noyau/montage-initial.test.ts noyau/consignes.test.ts noyau/decisions.test.ts noyau/edition.test.ts noyau/verifications.test.ts studio/src/logique/consignes.test.ts studio/src/logique/texte.test.ts
git commit -m "Éléments à l'écran : types, réglages, lecture d'un montage sans éléments, suggestions reprises

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2 : Passage monté d'un intervalle et édition des éléments

**Files:**
- Modify: `noyau/temps.ts`
- Modify: `noyau/temps.test.ts`
- Modify: `noyau/edition.ts`
- Modify: `noyau/edition.test.ts`

**Interfaces:**
- Consumes: `Segment`, `Montage`, `ElementEcran`, `StatutElement`, `PositionTexte`, `Zone` (`noyau/types.ts`).
- Produces :
  - `plageMontee(debut: number, fin: number, segments: Segment[]): Segment | null` — valable en secondes comme en images (`SegmentImages` a la même forme).
  - `type NouvelElement` (un `ElementEcran` sans `id`)
  - `prochainIdElement(m: Montage): string`
  - `ajouterElement(m: Montage, e: NouvelElement): Montage`
  - `type ChangementElement = Partial<{ debut: number; fin: number; statut: StatutElement; texte: string; position: PositionTexte; zone: Zone }>`
  - `modifierElement(m: Montage, id: string, c: ChangementElement): Montage`
  - `supprimerElement(m: Montage, id: string): Montage`

- [ ] **Step 1 : Écrire les tests qui échouent**

Dans `noyau/temps.test.ts`, ajouter `plageMontee` à l'import depuis `./temps`, puis à la fin du fichier :

```ts
describe('plageMontee', () => {
  const segments = [{ debut: 0, fin: 2 }, { debut: 4, fin: 10 }];

  it('retire les morceaux coupés et met bout à bout les morceaux conservés', () => {
    expect(plageMontee(1, 5, segments)).toEqual({ debut: 1, fin: 3 });
    expect(plageMontee(5, 20, segments)).toEqual({ debut: 3, fin: 8 });
  });
  it('renvoie null pour un passage entièrement coupé', () => {
    expect(plageMontee(2.5, 3.5, segments)).toBeNull();
  });
});
```

Dans `noyau/edition.test.ts`, ajouter `ajouterElement, modifierElement, prochainIdElement, supprimerElement` à l'import depuis `./edition`, puis à la fin du fichier :

```ts
describe('éléments à l’écran', () => {
  const avec: Montage = {
    ...base,
    elements: [{ id: 'se0', debut: 1, fin: 3, statut: 'a-valider', nature: 'zoom', zone: null }],
  };

  it('numérote les éléments créés dans le studio e0, e1…', () => {
    expect(prochainIdElement(base)).toBe('e0');
    const m = ajouterElement(avec, { debut: 4, fin: 6, statut: 'valide', nature: 'camera' });
    expect(m.elements[1]).toEqual({ id: 'e0', debut: 4, fin: 6, statut: 'valide', nature: 'camera' });
    expect(prochainIdElement(m)).toBe('e1');
    const plus = { ...m, elements: [...m.elements, { id: 'e7', debut: 0, fin: 1, statut: 'valide' as const, nature: 'camera' as const }] };
    expect(prochainIdElement(plus)).toBe('e8');
  });
  it('modifie un élément sans toucher aux champs d’une autre nature', () => {
    const zone = { x: 0, y: 0, largeur: 480, hauteur: 270 };
    const m = modifierElement(avec, 'se0', { zone, texte: 'ignoré', statut: 'valide' });
    expect(m.elements[0]).toEqual({ id: 'se0', debut: 1, fin: 3, statut: 'valide', nature: 'zoom', zone });
    expect(modifierElement(avec, 'x', { statut: 'valide' })).toBe(avec);
    expect(avec.elements[0]!.statut).toBe('a-valider');
  });
  it('supprime un élément', () => {
    expect(supprimerElement(avec, 'se0').elements).toEqual([]);
    expect(supprimerElement(avec, 'x')).toBe(avec);
  });
});
```

(Si `Montage` n'est pas encore importé dans `noyau/edition.test.ts`, l'ajouter : `import type { Montage } from './types';`.)

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- noyau/temps.test.ts noyau/edition.test.ts`
Expected: FAIL (`plageMontee`, `ajouterElement`… ne sont pas exportés).

- [ ] **Step 3 : Ajouter `plageMontee` à la fin de `noyau/temps.ts`**

```ts
// Passage [debut, fin] de la source vu dans le montage : les morceaux coupés sont retirés, les autres
// mis bout à bout en une seule plage ; null s'il est entièrement coupé. Segments triés, en secondes ou en images.
export function plageMontee(debut: number, fin: number, segments: Segment[]): Segment | null {
  let cumul = 0;
  let plage: Segment | null = null;
  for (const s of segments) {
    const a = Math.max(debut, s.debut);
    const b = Math.min(fin, s.fin);
    if (b > a) plage = { debut: plage ? plage.debut : cumul + (a - s.debut), fin: cumul + (b - s.debut) };
    cumul += s.fin - s.debut;
  }
  return plage;
}
```

- [ ] **Step 4 : Ajouter l'édition des éléments dans `noyau/edition.ts`**

1. Remplacer l'import par :

```ts
import type { ElementEcran, Montage, PositionTexte, StatutElement, Terme, Zone } from './types';
```

2. À la fin du fichier, ajouter :

```ts
type SansId<T> = T extends unknown ? Omit<T, 'id'> : never;
export type NouvelElement = SansId<ElementEcran>;

export type ChangementElement = Partial<{
  debut: number;
  fin: number;
  statut: StatutElement;
  texte: string;
  position: PositionTexte;
  zone: Zone;
}>;

// Les champs qui ne concernent pas la nature de l'élément sont ignorés. Les clés sont toujours
// rangées dans le même ordre, pour que la comparaison « sans effet » des consignes reste fiable.
function changer(e: ElementEcran, c: ChangementElement): ElementEcran {
  const commun = { id: e.id, debut: c.debut ?? e.debut, fin: c.fin ?? e.fin, statut: c.statut ?? e.statut };
  switch (e.nature) {
    case 'texte':
      return { ...commun, nature: e.nature, texte: c.texte ?? e.texte, position: c.position ?? e.position };
    case 'zoom':
    case 'miseEnAvant':
      return { ...commun, nature: e.nature, zone: c.zone ?? e.zone };
    case 'camera':
      return { ...commun, nature: e.nature };
  }
}

// Élément créé dans le studio (directement ou par une consigne) : e0, e1…
export function prochainIdElement(m: Montage): string {
  const numeros = m.elements
    .map(e => /^e(\d+)$/.exec(e.id)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number);
  return `e${numeros.length > 0 ? Math.max(...numeros) + 1 : 0}`;
}

export function ajouterElement(m: Montage, e: NouvelElement): Montage {
  return { ...m, elements: [...m.elements, changer({ id: prochainIdElement(m), ...e }, {})] };
}

export function modifierElement(m: Montage, id: string, c: ChangementElement): Montage {
  if (!m.elements.some(e => e.id === id)) return m;
  return { ...m, elements: m.elements.map(e => (e.id === id ? changer(e, c) : e)) };
}

export function supprimerElement(m: Montage, id: string): Montage {
  if (!m.elements.some(e => e.id === id)) return m;
  return { ...m, elements: m.elements.filter(e => e.id !== id) };
}
```

- [ ] **Step 5 : Lancer les tests**

Run: `npm test -- noyau/temps.test.ts noyau/edition.test.ts` puis `npm run typecheck`
Expected: PASS ; aucune erreur de type.

- [ ] **Step 6 : Commit**

```bash
git add noyau/temps.ts noyau/temps.test.ts noyau/edition.ts noyau/edition.test.ts
git commit -m "Noyau : passage monté d'un intervalle, ajout, modification et suppression d'éléments

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3 : Règles des éléments et contrôle avant rendu

**Files:**
- Create: `noyau/elements.ts`
- Test: `noyau/elements.test.ts`
- Modify: `noyau/verifications.ts`
- Modify: `noyau/verifications.test.ts`
- Modify: `studio/serveur/api.ts`
- Modify: `studio/serveur/api.test.ts`
- Modify: `studio/src/composants/PanneauRendu.tsx`
- Modify: `studio/src/composants/EcranMontage.tsx`

**Interfaces:**
- Consumes: `plageMontee`, `monteVersSource` (`noyau/temps.ts`) ; `calculerSegments` (`noyau/segments.ts`) ; `decouperSegments`, `placerEncarts`, `plagesEpisodes` (`noyau/episodes.ts`).
- Produces :
  - `LARGEUR_SOURCE = 1920`, `HAUTEUR_SOURCE = 1080`
  - `LIBELLES_NATURE: Record<NatureElement, string>`
  - `ZONE_A_TRACER = 'La zone est à tracer.'`
  - `type ReglagesElements = Pick<Reglages, 'elements' | 'coupe' | 'durees'>`
  - `interface ProblemeElement { id: string; probleme: string }`
  - `problemesElements(analyse: Analyse, montage: Montage, r: ReglagesElements): ProblemeElement[]`
  - `problemeDe(analyse: Analyse, montage: Montage, id: string, r: ReglagesElements): string | null`
  - `type ReglagesRendu = Pick<Reglages, 'definitionMaxCaracteres'> & ReglagesElements`
  - `verifierAvantRendu(analyse: Analyse, m: Montage, r: ReglagesRendu, consignes: Consigne[] = []): string[]` (nouvelle signature)
  - `PanneauRendu` : props `analyse: Analyse` et `reglages: ReglagesRendu` à la place de `definitionMax`.

- [ ] **Step 1 : Écrire les tests des règles — `noyau/elements.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import exemple from '../fixtures/analyse-exemple.json';
import reglagesJson from '../reglages.json';
import { problemeDe, problemesElements } from './elements';
import type { Analyse, ElementEcran, Montage, PositionTexte, Reglages, Terme, Zone } from './types';

const analyse = exemple as Analyse;
const r: Reglages = reglagesJson;
const ZONE: Zone = { x: 480, y: 270, largeur: 960, hauteur: 540 };
// Coupe 1,86–2,94 : segments [0, 1.86] et [2.94, 30].
const montage = (elements: ElementEcran[], termes: Terme[] = []): Montage => ({
  version: 1,
  titre: 'Essai',
  coupes: [{ id: 'd1', type: 'hesitation', debut: 1.8, fin: 3.0, active: true }],
  chapitres: [{ titre: 'Intro', debut: 0 }, { titre: 'Le SSO', debut: 3.0 }],
  termes,
  elements,
});
const texte = (id: string, debut: number, fin: number, position: PositionTexte = 'haut-gauche', contenu = 'Windows + V'): ElementEcran => ({
  id, debut, fin, statut: 'valide', nature: 'texte', texte: contenu, position,
});
const zoom = (id: string, debut: number, fin: number, zone: Zone | null = ZONE): ElementEcran => ({
  id, debut, fin, statut: 'valide', nature: 'zoom', zone,
});
const miseEnAvant = (id: string, debut: number, fin: number, zone: Zone = ZONE): ElementEcran => ({
  id, debut, fin, statut: 'valide', nature: 'miseEnAvant', zone,
});
const camera = (id: string, debut: number, fin: number): ElementEcran => ({ id, debut, fin, statut: 'valide', nature: 'camera' });
const problemes = (m: Montage) => problemesElements(analyse, m, r).map(p => `${p.id} : ${p.probleme}`);

describe('problemesElements', () => {
  it('accepte des éléments qui respectent les règles', () => {
    expect(problemes(montage([
      zoom('e0', 3.0, 4.3), texte('e1', 3.0, 4.3), camera('e2', 10, 12), miseEnAvant('e3', 20, 22),
    ]))).toEqual([]);
  });
  it('compte la durée à l’écran une fois les coupes retirées', () => {
    expect(problemes(montage([
      texte('e0', 1.9, 2.9), texte('e1', 3.0, 3.5, 'centre'), texte('e2', 1.0, 3.4, 'bas-centre'), texte('e3', 5, 5, 'haut-droite'),
    ]))).toEqual([
      'e0 : Le passage est entièrement coupé.',
      'e1 : Moins de 1 s à l’écran une fois les coupes retirées.',
      'e3 : Le passage est vide.',
    ]);
  });
  it('contrôle le texte et la zone', () => {
    expect(problemes(montage([
      texte('e0', 3, 5, 'haut-gauche', ' '),
      texte('e1', 6, 8, 'haut-gauche', 'x'.repeat(41)),
      zoom('e2', 9, 11, { x: 0, y: 0, largeur: 960, hauteur: 600 }),
      zoom('e3', 12, 14, { x: 0, y: 0, largeur: 400, hauteur: 225 }),
      miseEnAvant('e4', 15, 17, { x: 1800, y: 0, largeur: 300, hauteur: 100 }),
      zoom('e5', 18, 20, { x: 1, y: 1, largeur: 960, hauteur: 541 }),
    ]))).toEqual([
      'e0 : Le texte est vide.',
      'e1 : Le texte dépasse 40 caractères.',
      'e2 : La zone d’un zoom doit être en 16:9.',
      'e3 : La zone d’un zoom doit faire au moins 480 pixels de large.',
      'e4 : La zone sort de l’image.',
    ]);
  });
  it('exige une zone pour un zoom validé, pas pour une suggestion à valider', () => {
    const suggestion: ElementEcran = { ...zoom('se0', 10, 12, null), statut: 'a-valider' };
    expect(problemes(montage([zoom('e0', 3, 5, null), suggestion]))).toEqual(['e0 : La zone est à tracer.']);
  });
  it('refuse deux cadres en même temps, pour chacun des deux', () => {
    expect(problemes(montage([zoom('e0', 10, 14), camera('e1', 12, 16)]))).toEqual([
      'e0 : Chevauche la caméra en grand e1 : un seul zoom ou caméra en grand à la fois.',
      'e1 : Chevauche le zoom e0 : un seul zoom ou caméra en grand à la fois.',
    ]);
    expect(problemes(montage([zoom('e0', 10, 12), zoom('e1', 12, 14)]))).toEqual([]);
  });
  it('refuse une mise en avant pendant un zoom ou la caméra en grand', () => {
    expect(problemes(montage([miseEnAvant('e0', 10, 14), zoom('e1', 12, 16)]))).toEqual([
      'e0 : Une mise en avant ne peut pas avoir lieu pendant le zoom e1.',
      'e1 : Chevauche la mise en avant e0, qui ne correspondrait plus à l’image.',
    ]);
  });
  it('refuse deux textes à la même position en même temps', () => {
    expect(problemes(montage([texte('e0', 10, 14), texte('e1', 12, 16), texte('e2', 12, 16, 'centre')]))).toEqual([
      'e0 : Chevauche le texte e1, à la même position.',
      'e1 : Chevauche le texte e0, à la même position.',
    ]);
  });
  it('compte les éléments à valider, ignore les écartés', () => {
    const aValider: ElementEcran = { ...camera('se0', 12, 16), statut: 'a-valider' };
    const ecarte: ElementEcran = { ...camera('se1', 12, 16), statut: 'ecarte' };
    expect(problemes(montage([zoom('e0', 10, 14), ecarte]))).toEqual([]);
    expect(problemes(montage([zoom('e0', 10, 14), aValider]))).toHaveLength(2);
  });
  it('refuse un texte en haut à droite pendant un encart de définition en haut', () => {
    // Encart de SSO : prononcé à 3,8 s, affiché 6 s → source 3,8 à 9,8.
    const sso: Terme = { terme: 'SSO', definition: 'Déf.', occurrences: [3.8], statut: 'valide', position: 'haut' };
    expect(problemes(montage([texte('e0', 3.0, 4.3, 'haut-droite')], [sso]))).toEqual([
      'e0 : Un texte en haut à droite ne peut pas paraître pendant l’encart « SSO ».',
    ]);
    expect(problemes(montage([texte('e0', 3.0, 4.3, 'haut-droite')], [{ ...sso, position: 'bas' }]))).toEqual([]);
    expect(problemes(montage([texte('e0', 12, 14, 'haut-droite')], [sso]))).toEqual([]);
  });
});

describe('problemeDe', () => {
  it('donne le premier problème de l’élément, ou null', () => {
    const m = montage([zoom('e0', 10, 14), camera('e1', 12, 16), texte('e2', 20, 22)]);
    expect(problemeDe(analyse, m, 'e1', r)).toBe('Chevauche le zoom e0 : un seul zoom ou caméra en grand à la fois.');
    expect(problemeDe(analyse, m, 'e2', r)).toBeNull();
    expect(problemeDe(analyse, m, 'x', r)).toBeNull();
  });
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- noyau/elements.test.ts`
Expected: FAIL (module `./elements` introuvable).

- [ ] **Step 3 : Créer `noyau/elements.ts`**

```ts
import { decouperSegments, placerEncarts, plagesEpisodes } from './episodes';
import { calculerSegments } from './segments';
import { monteVersSource, plageMontee } from './temps';
import type { Analyse, ElementEcran, Montage, NatureElement, Reglages, Segment, Zone } from './types';

// Dimensions de source.mp4, auxquelles se rapportent les zones.
export const LARGEUR_SOURCE = 1920;
export const HAUTEUR_SOURCE = 1080;

export const LIBELLES_NATURE: Record<NatureElement, string> = {
  zoom: 'zoom',
  miseEnAvant: 'mise en avant',
  texte: 'texte incrusté',
  camera: 'caméra en grand',
};

export const ZONE_A_TRACER = 'La zone est à tracer.';

export type ReglagesElements = Pick<Reglages, 'elements' | 'coupe' | 'durees'>;

export interface ProblemeElement {
  id: string;
  probleme: string;
}

const DESIGNATIONS: Record<NatureElement, string> = {
  zoom: 'le zoom',
  miseEnAvant: 'la mise en avant',
  texte: 'le texte',
  camera: 'la caméra en grand',
};

const designation = (e: ElementEcran) => `${DESIGNATIONS[e.nature]} ${e.id}`;
const chevauche = (a: Segment, b: Segment) => a.debut < b.fin && b.debut < a.fin;
const estCadre = (e: ElementEcran) => e.nature === 'zoom' || e.nature === 'camera';

function problemeZone(zone: Zone, zoom: boolean, r: Reglages['elements']): string | null {
  const { x, y, largeur, hauteur } = zone;
  if (!(largeur > 0 && hauteur > 0) || x < 0 || y < 0 || x + largeur > LARGEUR_SOURCE || y + hauteur > HAUTEUR_SOURCE) {
    return 'La zone sort de l’image.';
  }
  if (zoom && Math.abs(hauteur - (largeur * 9) / 16) > 1) return 'La zone d’un zoom doit être en 16:9.';
  if (zoom && largeur < r.zoomLargeurMin) return `La zone d’un zoom doit faire au moins ${r.zoomLargeurMin} pixels de large.`;
  return null;
}

function problemeForme(e: ElementEcran, r: Reglages['elements']): string | null {
  if (!(e.fin > e.debut)) return 'Le passage est vide.';
  if (e.nature === 'texte') {
    if (!e.texte.trim()) return 'Le texte est vide.';
    if (e.texte.length > r.texteMaxCaracteres) return `Le texte dépasse ${r.texteMaxCaracteres} caractères.`;
  }
  if (e.nature === 'zoom' || e.nature === 'miseEnAvant') {
    // Une suggestion à valider peut attendre sa zone ; un élément validé, non.
    if (e.zone === null) return e.statut === 'valide' ? ZONE_A_TRACER : null;
    return problemeZone(e.zone, e.nature === 'zoom', r);
  }
  return null;
}

function problemeDuree(e: ElementEcran, segments: Segment[], dureeMin: number): string | null {
  const plage = plageMontee(e.debut, e.fin, segments);
  if (!plage) return 'Le passage est entièrement coupé.';
  if (plage.fin - plage.debut < dureeMin) return `Moins de ${dureeMin} s à l’écran une fois les coupes retirées.`;
  return null;
}

// Problème de `a` quand il chevauche `b`, ou null si les deux peuvent coexister.
function conflit(a: ElementEcran, b: ElementEcran): string | null {
  if (estCadre(a) && estCadre(b)) return `Chevauche ${designation(b)} : un seul zoom ou caméra en grand à la fois.`;
  if (a.nature === 'miseEnAvant' && estCadre(b)) return `Une mise en avant ne peut pas avoir lieu pendant ${designation(b)}.`;
  if (estCadre(a) && b.nature === 'miseEnAvant') return `Chevauche ${designation(b)}, qui ne correspondrait plus à l’image.`;
  if (a.nature === 'texte' && b.nature === 'texte' && a.position === b.position) {
    return `Chevauche ${designation(b)}, à la même position.`;
  }
  return null;
}

// Passages de la source couverts par un encart de définition placé en haut, d'après le placement des épisodes.
function encartsEnHaut(analyse: Analyse, montage: Montage, segments: Segment[], dureeEncart: number) {
  const encarts: { terme: string; passage: Segment }[] = [];
  for (const plage of plagesEpisodes(montage.chapitres, analyse.duree)) {
    const morceaux = decouperSegments(segments, plage);
    const derniere = morceaux[morceaux.length - 1];
    if (!derniere) continue;
    for (const e of placerEncarts(montage.termes, morceaux, dureeEncart)) {
      if (e.position !== 'haut') continue;
      const debut = monteVersSource(e.debut, morceaux);
      const fin = monteVersSource(e.debut + dureeEncart, morceaux) ?? derniere.fin;
      if (debut !== null) encarts.push({ terme: e.terme, passage: { debut, fin } });
    }
  }
  return encarts;
}

// Problèmes de chaque élément non écarté : forme, durée à l'écran, chevauchements. Un problème entre deux
// éléments est rapporté pour chacun d'eux. Fonction unique, utilisée par les consignes, les retouches du studio
// et le contrôle avant rendu.
export function problemesElements(analyse: Analyse, montage: Montage, r: ReglagesElements): ProblemeElement[] {
  const segments = calculerSegments(analyse.duree, montage.coupes, r.coupe);
  const actifs = montage.elements.filter(e => e.statut !== 'ecarte');
  const encarts = actifs.some(e => e.nature === 'texte' && e.position === 'haut-droite')
    ? encartsEnHaut(analyse, montage, segments, r.durees.encart)
    : [];
  const problemes: ProblemeElement[] = [];
  for (const e of actifs) {
    const forme = problemeForme(e, r.elements);
    if (forme) {
      problemes.push({ id: e.id, probleme: forme });
      continue;
    }
    const duree = problemeDuree(e, segments, r.elements.dureeMin);
    if (duree) problemes.push({ id: e.id, probleme: duree });
    for (const autre of actifs) {
      if (autre === e || !chevauche(e, autre)) continue;
      const p = conflit(e, autre);
      if (p) problemes.push({ id: e.id, probleme: p });
    }
    if (e.nature === 'texte' && e.position === 'haut-droite') {
      const encart = encarts.find(x => chevauche(e, x.passage));
      if (encart) {
        problemes.push({ id: e.id, probleme: `Un texte en haut à droite ne peut pas paraître pendant l’encart « ${encart.terme} ».` });
      }
    }
  }
  return problemes;
}

// Premier problème de l'élément désigné (après une création ou une retouche), ou null.
export function problemeDe(analyse: Analyse, montage: Montage, id: string, r: ReglagesElements): string | null {
  return problemesElements(analyse, montage, r).find(p => p.id === id)?.probleme ?? null;
}
```

- [ ] **Step 4 : Lancer les tests des règles**

Run: `npm test -- noyau/elements.test.ts`
Expected: PASS.

- [ ] **Step 5 : Écrire les tests du contrôle avant rendu**

Dans `noyau/verifications.test.ts` :

1. Remplacer les imports par :

```ts
import { describe, expect, it } from 'vitest';
import exemple from '../fixtures/analyse-exemple.json';
import reglagesJson from '../reglages.json';
import type { Consigne } from './consignes';
import type { Analyse, Montage, Reglages } from './types';
import { verifierAvantRendu } from './verifications';

const analyse = exemple as Analyse;
const reglages: Reglages = reglagesJson;
```

2. Remplacer chaque appel `verifierAvantRendu(X, 160)` par `verifierAvantRendu(analyse, X, reglages)` et chaque appel `verifierAvantRendu(X, 160, [Y])` par `verifierAvantRendu(analyse, X, reglages, [Y])` (les attentes ne changent pas).

3. À la fin du `describe`, ajouter :

```ts
  it('bloque sur les éléments à l’écran à valider ou en défaut', () => {
    // pret coupe 1 à 2 s : un texte de 3,0 à 3,5 ne reste que 0,5 s.
    const m: Montage = {
      ...pret,
      elements: [
        { id: 'se0', debut: 3.0, fin: 4.3, statut: 'a-valider', nature: 'zoom', zone: null },
        { id: 'e0', debut: 3.0, fin: 3.5, statut: 'valide', nature: 'texte', texte: 'Windows + V', position: 'centre' },
        { id: 'e1', debut: 10, fin: 12, statut: 'ecarte', nature: 'camera' },
      ],
    };
    expect(verifierAvantRendu(analyse, m, reglages)).toEqual([
      '1 élément(s) à l’écran à valider.',
      'Élément se0 : La zone est à tracer.',
      'Élément e0 : Moins de 1 s à l’écran une fois les coupes retirées.',
    ]);
  });
```

Dans `studio/serveur/api.test.ts`, dans `describe('rendu', …)`, après le premier `it`, ajouter :

```ts
  it('refuse le rendu tant qu’un élément à l’écran est à valider', async () => {
    const elements = [{ id: 'se0', debut: 3.0, fin: 4.3, statut: 'a-valider', nature: 'texte', texte: 'SSO', position: 'haut-gauche' }];
    await tournage('a', { 'analyse.json': exemple, 'montage.json': { ...MONTAGE_PRET, elements } });
    const r = await demanderRendu('a', 'tout');
    expect(r.status).toBe(422);
    expect((await r.json()).problemes).toEqual(['1 élément(s) à l’écran à valider.']);
  });
```

- [ ] **Step 6 : Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- noyau/verifications.test.ts studio/serveur/api.test.ts`
Expected: FAIL (ancienne signature, éléments non contrôlés).

- [ ] **Step 7 : Réécrire `noyau/verifications.ts`**

```ts
import { propositionsEnAttente, type Consigne } from './consignes';
import { problemesElements, ZONE_A_TRACER, type ReglagesElements } from './elements';
import type { Analyse, Montage, Reglages } from './types';

export type ReglagesRendu = Pick<Reglages, 'definitionMaxCaracteres'> & ReglagesElements;

// Conditions du rendu final (spec §7) : chaque problème est une phrase affichée telle quelle.
export function verifierAvantRendu(analyse: Analyse, m: Montage, r: ReglagesRendu, consignes: Consigne[] = []): string[] {
  const definitionMax = r.definitionMaxCaracteres;
  const problemes: string[] = [];
  if (!m.titre.trim()) problemes.push('La vidéo complète n’a pas de titre.');
  m.chapitres.forEach((c, i) => {
    if (!c.titre.trim()) problemes.push(`Le chapitre ${i + 1} n’a pas de titre.`);
  });
  for (const t of m.termes) {
    if (t.statut === 'a-valider') problemes.push(`Le terme « ${t.terme} » n’est ni validé ni écarté.`);
    else if (t.statut === 'valide' && !t.definition.trim()) problemes.push(`La définition de « ${t.terme} » est vide.`);
    else if (t.statut === 'valide' && t.definition.length > definitionMax) {
      problemes.push(`La définition de « ${t.terme} » dépasse ${definitionMax} caractères.`);
    }
  }
  const enAttente = m.coupes.filter(c => c.enAttente).length;
  if (enAttente > 0) problemes.push(`${enAttente} suggestion(s) de longueur en attente.`);
  const aValider = m.elements.filter(e => e.statut === 'a-valider');
  if (aValider.length > 0) problemes.push(`${aValider.length} élément(s) à l’écran à valider.`);
  for (const e of aValider) {
    if ((e.nature === 'zoom' || e.nature === 'miseEnAvant') && e.zone === null) problemes.push(`Élément ${e.id} : ${ZONE_A_TRACER}`);
  }
  for (const p of problemesElements(analyse, m, r)) problemes.push(`Élément ${p.id} : ${p.probleme}`);
  const propositions = propositionsEnAttente(consignes);
  if (propositions > 0) problemes.push(`Consigne : ${propositions} proposition(s) en attente.`);
  return problemes;
}
```

- [ ] **Step 8 : Brancher la nouvelle signature**

1. `studio/serveur/api.ts`, dans `lancerRendu`, remplacer :

```ts
      const problemes = verifierAvantRendu(t.montage, t.reglages.definitionMaxCaracteres, consignes);
```

par :

```ts
      const problemes = verifierAvantRendu(t.analyse, t.montage, t.reglages, consignes);
```

2. `studio/src/composants/PanneauRendu.tsx` :
   - remplacer les imports de types par :

```ts
import type { Consigne } from '../../../noyau/consignes';
import type { Analyse, Montage } from '../../../noyau/types';
import { verifierAvantRendu, type ReglagesRendu } from '../../../noyau/verifications';
```

   - dans `interface Props`, remplacer `definitionMax: number;` par :

```ts
  analyse: Analyse;
  reglages: ReglagesRendu;
```

   - remplacer la signature du composant et le calcul des problèmes par :

```tsx
export const PanneauRendu: FC<Props> = ({ nom, analyse, montage, reglages, consignes, enregistrement }) => {
  const [etat, setEtat] = useState<EtatRendu | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [problemesServeur, setProblemesServeur] = useState<string[]>([]);
  const problemes = useMemo(
    () => verifierAvantRendu(analyse, montage, reglages, consignes),
    [analyse, montage, reglages, consignes],
  );
```

3. `studio/src/composants/EcranMontage.tsx`, dans `<PanneauRendu … />`, remplacer `definitionMax={detail.reglages.definitionMaxCaracteres}` par :

```tsx
          analyse={detail.analyse}
          reglages={detail.reglages}
```

- [ ] **Step 9 : Lancer toute la suite et la vérification de types**

Run: `npm test` puis `npm run typecheck`
Expected: PASS ; aucune erreur de type.

- [ ] **Step 10 : Commit**

```bash
git add noyau/elements.ts noyau/elements.test.ts noyau/verifications.ts noyau/verifications.test.ts studio/serveur/api.ts studio/serveur/api.test.ts studio/src/composants/PanneauRendu.tsx studio/src/composants/EcranMontage.tsx
git commit -m "Noyau : règles des éléments à l'écran, contrôle avant rendu

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4 : Éléments dans les décisions de rendu

**Files:**
- Modify: `noyau/decisions.ts`
- Modify: `noyau/decisions.test.ts`
- Modify: `remotion/exemple.ts`
- Modify: `studio/src/logique/apercu.test.ts`

**Interfaces:**
- Consumes: `plageMontee` ; `versImages`, `SegmentImages` (`noyau/images.ts`).
- Produces :
  - `type ElementImages = { id: string; debut: number; duree: number } & ({ nature: 'zoom'; zone: Zone } | { nature: 'miseEnAvant'; zone: Zone } | { nature: 'texte'; texte: string; position: PositionTexte } | { nature: 'camera' })` — positions et durées en images dans la partie.
  - `Partie.elements: ElementImages[]` (triés par début)
  - `placerElements(elements: ElementEcran[], segments: SegmentImages[], fps: number): ElementImages[]`
  - `construirePartie(titre, segments, termes, dureeEncart, fps, elements: ElementEcran[] = [])`

- [ ] **Step 1 : Écrire les tests qui échouent**

À la fin de `noyau/decisions.test.ts`, ajouter (et ajouter `Zone` à l'import de types) :

```ts
describe('éléments à l’écran', () => {
  const ZONE: Zone = { x: 480, y: 270, largeur: 960, hauteur: 540 };
  // Coupe 2–4 s ; chapitre A : images 0–20 et 40–100 ; chapitre B : 100–200.
  const avecElements: Montage = {
    ...montage,
    elements: [
      { id: 'e0', debut: 1, fin: 5, statut: 'valide', nature: 'texte', texte: 'Windows + V', position: 'haut-gauche' },
      { id: 'e1', debut: 8, fin: 12, statut: 'valide', nature: 'zoom', zone: ZONE },
      { id: 'e2', debut: 2.5, fin: 3.5, statut: 'valide', nature: 'camera' },
      { id: 'e3', debut: 6, fin: 7, statut: 'a-valider', nature: 'camera' },
      { id: 'e4', debut: 15, fin: 16, statut: 'valide', nature: 'miseEnAvant', zone: null },
    ],
  };

  it('place les éléments validés en images, coupes retirées et morceaux contigus fusionnés', () => {
    const [a, b] = decisionsEpisodes(analyse, avecElements, r, '');
    expect(a!.partie.elements).toEqual([
      { id: 'e0', debut: 10, duree: 20, nature: 'texte', texte: 'Windows + V', position: 'haut-gauche' },
      { id: 'e1', debut: 60, duree: 20, nature: 'zoom', zone: ZONE },
    ]);
    expect(b!.partie.elements).toEqual([{ id: 'e1', debut: 0, duree: 20, nature: 'zoom', zone: ZONE }]);
  });
  it('les reprend dans chaque partie de la vidéo complète', () => {
    const v = decisionsVideoComplete(analyse, avecElements, r, '');
    expect(v.parties.map(p => p.elements.map(e => e.id))).toEqual([['e0', 'e1'], ['e1']]);
  });
  it('n’en met aucun dans une partie construite sans éléments', () => {
    expect(construirePartie('X', [{ debut: 0, fin: 30 }], [], 60, FPS).elements).toEqual([]);
  });
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- noyau/decisions.test.ts`
Expected: FAIL (`partie.elements` indéfini).

- [ ] **Step 3 : Modifier `noyau/decisions.ts`**

1. Remplacer les imports par :

```ts
import { decouperSegments, placerEncarts, plagesEpisodes } from './episodes';
import { dureeImages, enImages, segmentsEnImages, versImages, type SegmentImages } from './images';
import { calculerSegments } from './segments';
import { plageMontee } from './temps';
import type { Analyse, ElementEcran, Montage, PositionEncart, PositionTexte, Reglages, Terme, Zone } from './types';
```

2. Après `interface EncartImages { … }`, ajouter :

```ts
// Élément validé, placé dans la partie.
export type ElementImages = { id: string; debut: number; duree: number } & (
  | { nature: 'zoom'; zone: Zone }
  | { nature: 'miseEnAvant'; zone: Zone }
  | { nature: 'texte'; texte: string; position: PositionTexte }
  | { nature: 'camera' }
);
```

3. Dans `interface Partie`, après `encartsRetires: string[];`, ajouter :

```ts
  // Éléments à l'écran validés, triés par début.
  elements: ElementImages[];
```

4. Avant `construirePartie`, ajouter :

```ts
// Les morceaux coupés d'un élément sont retirés ; ceux qui restent sont contigus dans la partie et forment
// une seule plage, si bien qu'un zoom reste stable à travers les jump cuts.
export function placerElements(elements: ElementEcran[], segments: SegmentImages[], fps: number): ElementImages[] {
  const places: ElementImages[] = [];
  for (const e of elements) {
    if (e.statut !== 'valide') continue;
    const plage = plageMontee(versImages(e.debut, fps), versImages(e.fin, fps), segments);
    if (!plage) continue;
    const debut = Math.round(plage.debut);
    const duree = Math.round(plage.fin) - debut;
    if (duree <= 0) continue;
    const place = { id: e.id, debut, duree };
    if (e.nature === 'texte') places.push({ ...place, nature: e.nature, texte: e.texte, position: e.position });
    else if (e.nature === 'camera') places.push({ ...place, nature: e.nature });
    else if (e.zone) places.push({ ...place, nature: e.nature, zone: e.zone });
  }
  return places.sort((a, b) => a.debut - b.debut);
}
```

5. Remplacer la signature de `construirePartie` par :

```ts
export function construirePartie(
  titre: string, segments: SegmentImages[], termes: Terme[], dureeEncart: number, fps: number, elements: ElementEcran[] = [],
): Partie {
```

et sa dernière ligne par :

```ts
  return { titre, segments, encarts, encartsRetires, elements: placerElements(elements, segments, fps), duree };
```

6. Dans `decisionsEpisodes`, remplacer `.map(c => construirePartie(c.titre, c.segments, montage.termes, dureeEncart, fps))` par :

```ts
    .map(c => construirePartie(c.titre, c.segments, montage.termes, dureeEncart, fps, montage.elements))
```

7. Dans `decisionsVideoComplete`, remplacer `const partie = construirePartie(c.titre, c.segments, termes, dureeEncart, fps);` par :

```ts
    const partie = construirePartie(c.titre, c.segments, termes, dureeEncart, fps, montage.elements);
```

- [ ] **Step 4 : Compléter les littéraux `Partie`**

1. `remotion/exemple.ts` : remplacer la ligne `partie: { … }` par :

```ts
  partie: { titre: '', segments: [], encarts: [], encartsRetires: [], elements: [], duree: 0 },
```

2. `studio/src/logique/apercu.test.ts` : dans la fonction `partie`, remplacer `encarts: [], encartsRetires: [],` par `encarts: [], encartsRetires: [], elements: [],`.

- [ ] **Step 5 : Lancer les tests et la vérification de types**

Run: `npm test` puis `npm run typecheck`
Expected: PASS ; aucune erreur de type.

- [ ] **Step 6 : Commit**

```bash
git add noyau/decisions.ts noyau/decisions.test.ts remotion/exemple.ts studio/src/logique/apercu.test.ts
git commit -m "Noyau : éléments validés placés en images dans chaque partie

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5 : Opérations des consignes sur les éléments

**Files:**
- Modify: `noyau/consignes.ts`
- Modify: `noyau/consignes.test.ts`
- Modify: `studio/serveur/api.test.ts`

**Interfaces:**
- Consumes: `ajouterElement`, `modifierElement`, `supprimerElement`, `prochainIdElement`, `ChangementElement`, `NouvelElement` (`noyau/edition.ts`) ; `problemeDe`, `LARGEUR_SOURCE`, `HAUTEUR_SOURCE`, `ReglagesElements` (`noyau/elements.ts`).
- Produces :
  - `Operation` gagne `ajouterElement`, `modifierElement`, `supprimerElement` (formes exactes ci-dessous).
  - `type ReglagesConsignes = Pick<Reglages, 'definitionMaxCaracteres'> & ReglagesElements` (un `Reglages` complet convient).
  - `motsRecouverts(analyse: Analyse, passage: Segment): Ancrage | null` (paramètre élargi de `Coupe` à `Segment`).
  - `zoneATracer(op: Operation): boolean`
  - `tracerZoneProposition(consigne: Consigne, indice: number, zone: Zone): Consigne`
  - `accepterPropositions` laisse en attente une proposition dont la zone reste à tracer.

- [ ] **Step 1 : Écrire les tests qui échouent**

Dans `noyau/consignes.test.ts` :

1. Ajouter aux imports :

```ts
import reglagesJson from '../reglages.json';
```

ajouter `tracerZoneProposition, zoneATracer` à l'import depuis `./consignes`, et remplacer l'import de types par :

```ts
import type { Analyse, Montage, Reglages, Zone } from './types';
```

2. Remplacer `const reglages = { definitionMaxCaracteres: 160 };` par :

```ts
const reglages: Reglages = reglagesJson;
```

3. À la fin du fichier, ajouter :

```ts
describe('éléments à l’écran', () => {
  const ZONE: Zone = { x: 480, y: 270, largeur: 960, hauteur: 540 };
  const avecTexte: Montage = {
    ...base,
    elements: [{ id: 'se0', debut: 3.0, fin: 4.3, statut: 'a-valider', nature: 'texte', texte: 'SSO', position: 'haut-gauche' }],
  };

  it('ajoute un élément validé sur un passage, texte en haut à gauche par défaut', () => {
    expect(montageDe({ type: 'ajouterElement', nature: 'texte', premierMot: 3, dernierMot: 5, texte: 'sso.example.com' }).elements).toEqual([
      { id: 'e0', debut: 3.0, fin: 4.3, statut: 'valide', nature: 'texte', texte: 'sso.example.com', position: 'haut-gauche' },
    ]);
    expect(montageDe({ type: 'ajouterElement', nature: 'camera', premierMot: 3, dernierMot: 5 }, avecTexte).elements[1]).toEqual({
      id: 'e0', debut: 3.0, fin: 4.3, statut: 'valide', nature: 'camera',
    });
  });
  it('refuse un élément mal formé ou contraire aux règles', () => {
    expect(probleme({ type: 'ajouterElement', nature: 'texte', premierMot: 3, dernierMot: 5 })).toBe('Le texte à incruster manque.');
    expect(probleme({ type: 'ajouterElement', nature: 'texte', premierMot: 3, dernierMot: 5, texte: 'x'.repeat(41) })).toBe(
      'Le texte dépasse 40 caractères.',
    );
    expect(probleme({ type: 'ajouterElement', nature: 'camera', premierMot: 3, dernierMot: 5, position: 'centre' })).toBe(
      'Le texte et la position ne concernent qu’un texte incrusté.',
    );
    expect(probleme({ type: 'ajouterElement', nature: 'texte', premierMot: 3, dernierMot: 5, texte: 'A', zone: ZONE })).toBe(
      'Une zone ne concerne qu’un zoom ou une mise en avant.',
    );
    expect(probleme({ type: 'ajouterElement', nature: 'camera', premierMot: 4, dernierMot: 4 })).toBe(
      'Moins de 1 s à l’écran une fois les coupes retirées.',
    );
    expect(probleme({ type: 'ajouterElement', nature: 'texte', premierMot: 3, dernierMot: 5, texte: 'A' }, avecTexte)).toBe(
      'Chevauche le texte se0, à la même position.',
    );
    expect(probleme({ type: 'ajouterElement', nature: 'zoom', premierMot: 3, dernierMot: 9 })).toBe(
      'Le mot 9 n’existe pas dans la transcription.',
    );
  });
  it('laisse tracer la zone d’un zoom proposé avant de l’accepter', () => {
    const c = consigneDe([{ type: 'ajouterElement', nature: 'zoom', premierMot: 3, dernierMot: 5, explication: 'Zoome sur le bouton.' }]);
    expect(c.propositions[0]!.etat).toBe('en-attente');
    expect(zoneATracer(c.propositions[0]!.operation)).toBe(true);
    const sansZone = accepterPropositions(analyse, base, c, [0], reglages);
    expect(sansZone.montage).toBe(base);
    expect(sansZone.consigne.propositions[0]!.etat).toBe('en-attente');

    const tracee = tracerZoneProposition(c, 0, ZONE);
    expect(zoneATracer(tracee.propositions[0]!.operation)).toBe(false);
    const r = accepterPropositions(analyse, base, tracee, [0], reglages);
    expect(r.consigne.propositions[0]!.etat).toBe('acceptee');
    expect(r.montage.elements).toEqual([{ id: 'e0', debut: 3.0, fin: 4.3, statut: 'valide', nature: 'zoom', zone: ZONE }]);
  });
  it('revérifie la zone tracée à l’acceptation', () => {
    const c = consigneDe([{ type: 'ajouterElement', nature: 'zoom', premierMot: 3, dernierMot: 5, explication: 'z' }]);
    const tracee = tracerZoneProposition(c, 0, { x: 0, y: 0, largeur: 400, hauteur: 225 });
    expect(accepterPropositions(analyse, base, tracee, [0], reglages).consigne.propositions[0]).toMatchObject({
      etat: 'invalide', probleme: 'La zone d’un zoom doit faire au moins 480 pixels de large.',
    });
  });
  it('modifie un élément : statut, texte, position, passage', () => {
    expect(montageDe({ type: 'modifierElement', idElement: 'se0', statut: 'valide' }, avecTexte).elements[0]!.statut).toBe('valide');
    expect(montageDe({ type: 'modifierElement', idElement: 'se0', texte: 'Windows + V', position: 'centre' }, avecTexte).elements[0])
      .toMatchObject({ texte: 'Windows + V', position: 'centre' });
    expect(montageDe({ type: 'modifierElement', idElement: 'se0', premierMot: 0, dernierMot: 5 }, avecTexte).elements[0])
      .toMatchObject({ debut: 0.8, fin: 4.3 });
    expect(probleme({ type: 'modifierElement', idElement: 'se0', premierMot: 0 }, avecTexte)).toBe(
      'Il faut donner le premier et le dernier mot du nouveau passage.',
    );
    expect(probleme({ type: 'modifierElement', idElement: 'x', statut: 'valide' })).toBe('L’élément x n’existe pas.');
    expect(probleme({ type: 'modifierElement', idElement: 'se0', zone: ZONE }, avecTexte)).toBe(
      'Une zone ne concerne qu’un zoom ou une mise en avant.',
    );
    expect(probleme({ type: 'modifierElement', idElement: 'se0', statut: 'a-valider' }, avecTexte)).toBe(
      'Cette opération ne changerait rien au montage.',
    );
  });
  it('refuse d’accepter une suggestion de zoom sans zone, pas de l’écarter', () => {
    const m: Montage = { ...base, elements: [{ id: 'se1', debut: 3.0, fin: 4.3, statut: 'a-valider', nature: 'zoom', zone: null }] };
    expect(probleme({ type: 'modifierElement', idElement: 'se1', statut: 'valide' }, m)).toBe('La zone est à tracer.');
    expect(montageDe({ type: 'modifierElement', idElement: 'se1', statut: 'ecarte' }, m).elements[0]!.statut).toBe('ecarte');
  });
  it('supprime un élément', () => {
    expect(montageDe({ type: 'supprimerElement', idElement: 'se0' }, avecTexte).elements).toEqual([]);
    expect(probleme({ type: 'supprimerElement', idElement: 'x' })).toBe('L’élément x n’existe pas.');
  });
  it('contrôle la forme des opérations sur les éléments dans consignes.json', () => {
    const avec = (operation: unknown) => raisonFichierConsignes({
      version: 1,
      consignes: [{ ...consigneDe([]), propositions: [{ operation, explication: 'e', etat: 'en-attente' }] }],
    });
    expect(avec({ type: 'ajouterElement', nature: 'zoom', premierMot: 3, dernierMot: 5, zone: ZONE })).toBeNull();
    expect(avec({ type: 'modifierElement', idElement: 'se0', statut: 'valide', position: 'centre' })).toBeNull();
    expect(avec({ type: 'supprimerElement', idElement: 'se0' })).toBeNull();
    expect(avec({ type: 'ajouterElement', nature: 'zoom', premierMot: 3, dernierMot: 5, zone: { x: 'a' } })).toBe(
      'champ zone invalide dans la consigne c1',
    );
    expect(avec({ type: 'ajouterElement', nature: 'son', premierMot: 3, dernierMot: 5 })).toBe('champ nature invalide dans la consigne c1');
    expect(avec({ type: 'modifierElement', idElement: 'se0', position: 'bas' })).toBe('champ position invalide dans la consigne c1');
  });
});
```

Dans `studio/serveur/api.test.ts`, dans `describe('consignes', …)`, ajouter :

```ts
  it('enregistre une proposition dont la zone a été tracée, refuse une zone mal formée', async () => {
    await tournage('a', { 'analyse.json': exemple });
    const avec = (zone: unknown) => ({
      version: 1,
      consignes: [{
        ...EN_ATTENTE.consignes[0]!,
        propositions: [{
          operation: { type: 'ajouterElement', nature: 'zoom', premierMot: 3, dernierMot: 5, zone },
          explication: 'Zoome sur le bouton.',
          etat: 'en-attente',
        }],
      }],
    });
    expect((await envoyerConsignes('a', avec({ x: 480, y: 270, largeur: 960, hauteur: 540 }))).status).toBe(200);
    const r = await envoyerConsignes('a', avec({ x: 'a' }));
    expect(r.status).toBe(400);
    expect((await r.json()).erreur).toBe('consignes invalides : champ zone invalide dans la consigne c1');
  });
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- noyau/consignes.test.ts studio/serveur/api.test.ts`
Expected: FAIL (opérations inconnues, `zoneATracer` non exporté).

- [ ] **Step 3 : Modifier `noyau/consignes.ts`**

1. Remplacer les imports par :

```ts
import {
  ajouterChapitre, ajouterElement, ajouterTerme, basculerCoupe, changerTitre, couperPassage, deciderLongueur, deplacerLimite,
  fusionnerChapitre, modifierElement, modifierTerme, prochainIdElement, renommerChapitre, supprimerElement,
  type ChangementElement, type ChangementTerme, type NouvelElement,
} from './edition';
import { HAUTEUR_SOURCE, LARGEUR_SOURCE, problemeDe, type ReglagesElements } from './elements';
import type {
  Analyse, Montage, Mot, NatureElement, PositionEncart, PositionTexte, Reglages, Segment, StatutElement, StatutTerme, Zone,
} from './types';
```

2. Dans le type `Operation`, avant `| { type: 'titreVideo'; titre: string };`, ajouter :

```ts
  | {
    type: 'ajouterElement'; nature: NatureElement; premierMot: number; dernierMot: number;
    texte?: string; position?: PositionTexte; zone?: Zone;
  }
  | {
    type: 'modifierElement'; idElement: string; premierMot?: number; dernierMot?: number;
    texte?: string; position?: PositionTexte; zone?: Zone; statut?: StatutElement;
  }
  | { type: 'supprimerElement'; idElement: string }
```

et compléter le commentaire au-dessus du type par une ligne :

```ts
// La zone d'un élément n'est jamais fournie par Claude : le studio la remplit quand l'auteur la trace.
```

3. Remplacer `interface ReglagesConsignes { … }` par :

```ts
export type ReglagesConsignes = Pick<Reglages, 'definitionMaxCaracteres'> & ReglagesElements;
```

4. Après `const aucunChapitre = …;`, ajouter :

```ts
const elementInconnu = (id: string) => `L’élément ${id} n’existe pas.`;
const TEXTE_HORS_TEXTE = 'Le texte et la position ne concernent qu’un texte incrusté.';
const ZONE_HORS_CADRE = 'Une zone ne concerne qu’un zoom ou une mise en avant.';
// Zone provisoire d'un zoom proposé sans zone : l'image entière, pour vérifier le reste de l'opération.
const IMAGE_ENTIERE: Zone = { x: 0, y: 0, largeur: LARGEUR_SOURCE, hauteur: HAUTEUR_SOURCE };
```

5. Remplacer la signature de `motsRecouverts` par (le corps ne change pas) :

```ts
export function motsRecouverts(analyse: Analyse, passage: Segment): Ancrage | null {
```

et dans son corps remplacer `coupe.debut` / `coupe.fin` par `passage.debut` / `passage.fin`. Mettre à jour son commentaire : « Mots dont le milieu est dans le passage (coupe ou élément), comme dans le texte du studio ; null pour un blanc entre deux mots. »

6. Après `problemeDefinition`, ajouter :

```ts
type OperationAjout = Extract<Operation, { type: 'ajouterElement' }>;

function nouvelElement(op: OperationAjout, passage: Segment): NouvelElement | string {
  if (op.nature !== 'texte' && (op.texte !== undefined || op.position !== undefined)) return TEXTE_HORS_TEXTE;
  if (op.nature !== 'zoom' && op.nature !== 'miseEnAvant' && op.zone !== undefined) return ZONE_HORS_CADRE;
  const commun = { debut: passage.debut, fin: passage.fin, statut: 'valide' as const };
  switch (op.nature) {
    case 'texte':
      if (op.texte === undefined) return 'Le texte à incruster manque.';
      return { ...commun, nature: op.nature, texte: op.texte, position: op.position ?? 'haut-gauche' };
    case 'zoom':
    case 'miseEnAvant':
      return { ...commun, nature: op.nature, zone: op.zone ?? IMAGE_ENTIERE };
    case 'camera':
      return { ...commun, nature: op.nature };
  }
}

// Proposition d'un zoom ou d'une mise en avant dont l'auteur doit encore tracer la zone.
export function zoneATracer(op: Operation): boolean {
  return op.type === 'ajouterElement' && (op.nature === 'zoom' || op.nature === 'miseEnAvant') && op.zone === undefined;
}

// Enregistre la zone tracée dans la proposition ; elle sera revérifiée à l'acceptation.
export function tracerZoneProposition(consigne: Consigne, indice: number, zone: Zone): Consigne {
  return {
    ...consigne,
    propositions: consigne.propositions.map((p, i): Proposition => (
      i === indice && p.etat === 'en-attente' && p.operation.type === 'ajouterElement'
        ? { ...p, operation: { ...p.operation, zone } }
        : p
    )),
  };
}
```

7. Dans `appliquer`, avant `case 'titreVideo':`, ajouter :

```ts
    case 'ajouterElement': {
      const p = passageEnTemps(analyse, op.premierMot, op.dernierMot);
      if (typeof p === 'string') return p;
      const nouvel = nouvelElement(op, p);
      if (typeof nouvel === 'string') return nouvel;
      const suivant = ajouterElement(m, nouvel);
      return problemeDe(analyse, suivant, prochainIdElement(m), r) ?? suivant;
    }
    case 'modifierElement': {
      const e = m.elements.find(x => x.id === op.idElement);
      if (!e) return elementInconnu(op.idElement);
      if (e.nature !== 'texte' && (op.texte !== undefined || op.position !== undefined)) return TEXTE_HORS_TEXTE;
      if (e.nature !== 'zoom' && e.nature !== 'miseEnAvant' && op.zone !== undefined) return ZONE_HORS_CADRE;
      const changement: ChangementElement = {};
      if (op.premierMot !== undefined || op.dernierMot !== undefined) {
        if (op.premierMot === undefined || op.dernierMot === undefined) {
          return 'Il faut donner le premier et le dernier mot du nouveau passage.';
        }
        const p = passageEnTemps(analyse, op.premierMot, op.dernierMot);
        if (typeof p === 'string') return p;
        changement.debut = p.debut;
        changement.fin = p.fin;
      }
      if (op.texte !== undefined) changement.texte = op.texte;
      if (op.position !== undefined) changement.position = op.position;
      if (op.zone !== undefined) changement.zone = op.zone;
      if (op.statut !== undefined) changement.statut = op.statut;
      const suivant = modifierElement(m, op.idElement, changement);
      return problemeDe(analyse, suivant, op.idElement, r) ?? suivant;
    }
    case 'supprimerElement':
      return m.elements.some(e => e.id === op.idElement) ? supprimerElement(m, op.idElement) : elementInconnu(op.idElement);
```

8. Dans `accepterPropositions`, remplacer `if (!p || p.etat !== 'en-attente') continue;` par :

```ts
    // Une zone encore à tracer laisse la proposition en attente.
    if (!p || p.etat !== 'en-attente' || zoneATracer(p.operation)) continue;
```

9. Contrôle de forme :
   - remplacer `type GenreChamp = …;` par :

```ts
type GenreChamp = 'entier' | 'texte' | 'booleen' | 'entiers' | 'zone' | readonly string[];
```

   - après `const POSITIONS_ENCART …;`, ajouter :

```ts
const NATURES_ELEMENT: readonly string[] = ['zoom', 'miseEnAvant', 'texte', 'camera'];
const POSITIONS_TEXTE: readonly string[] = ['haut-gauche', 'haut-droite', 'centre', 'bas-centre'];
const STATUTS_ELEMENT: readonly string[] = ['a-valider', 'valide', 'ecarte'];
```

   - dans `CHAMPS_OPERATION`, avant `titreVideo: …`, ajouter :

```ts
  ajouterElement: {
    nature: { genre: NATURES_ELEMENT },
    premierMot: { genre: 'entier' },
    dernierMot: { genre: 'entier' },
    texte: { genre: 'texte', facultatif: true },
    position: { genre: POSITIONS_TEXTE, facultatif: true },
    zone: { genre: 'zone', facultatif: true },
  },
  modifierElement: {
    idElement: { genre: 'texte' },
    premierMot: { genre: 'entier', facultatif: true },
    dernierMot: { genre: 'entier', facultatif: true },
    texte: { genre: 'texte', facultatif: true },
    position: { genre: POSITIONS_TEXTE, facultatif: true },
    zone: { genre: 'zone', facultatif: true },
    statut: { genre: STATUTS_ELEMENT, facultatif: true },
  },
  supprimerElement: { idElement: { genre: 'texte' } },
```

   - dans `valeurConforme`, ajouter le cas :

```ts
    case 'zone':
      return estObjet(v) && ['x', 'y', 'largeur', 'hauteur'].every(k => typeof v[k] === 'number' && Number.isFinite(v[k]));
```

- [ ] **Step 4 : Lancer les tests et la vérification de types**

Run: `npm test` puis `npm run typecheck`
Expected: PASS ; aucune erreur de type (`studio/serveur/api.ts` passe déjà `t.reglages`, un `Reglages` complet, à `proposer`).

- [ ] **Step 5 : Commit**

```bash
git add noyau/consignes.ts noyau/consignes.test.ts studio/serveur/api.test.ts
git commit -m "Consignes : ajout, modification et suppression d'éléments à l'écran, zone tracée dans la proposition

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6 : Éléments dans le prompt d'interprétation et le schéma de Claude

**Files:**
- Modify: `studio/serveur/consignes.ts`
- Modify: `studio/serveur/interpretation.ts`
- Modify: `studio/serveur/interpretation.test.ts`
- Modify: `studio/serveur/__snapshots__/interpretation.test.ts.snap` (régénéré)
- Modify: `studio/serveur/api.ts`
- Modify: `studio/serveur/api.test.ts`

**Interfaces:**
- Consumes: `motsRecouverts(analyse, passage: Segment)` ; `Operation` étendu (tâche 5).
- Produces : `DemandeInterpretation.texteMax: number` ; prompt avec la rubrique « Éléments à l'écran » et les trois opérations ; schéma Zod sans champ `zone`.

- [ ] **Step 1 : Écrire les tests qui échouent**

Dans `studio/serveur/interpretation.test.ts` :

1. Remplacer la constante `demande` par :

```ts
const demande: DemandeInterpretation = {
  analyse,
  montage: {
    ...montageInitial(analyse, 'Essai'),
    elements: [{ id: 'e0', debut: 3.0, fin: 4.3, statut: 'valide', nature: 'texte', texte: 'sso.example.com', position: 'haut-gauche' }],
  },
  texte: 'Coupe la salutation',
  ancrage: { premierMot: 0, dernierMot: 2 },
  definitionMax: 160,
  texteMax: 40,
  modele: 'claude-opus-5-5',
};
```

2. Dans `it('donne la transcription numérotée, …')`, avant `expect(prompt).toMatchSnapshot();`, ajouter :

```ts
    expect(prompt).toContain('- e0 · texte · valide · mots 3 à 5 · « sso.example.com » · haut-gauche');
    expect(prompt).toContain('- ajouterElement : ');
    expect(prompt).toContain('ne donne jamais de zone');
    expect(prompt).toContain('40 caractères');
```

3. Ajouter un test :

```ts
  it('indique l’absence d’élément', () => {
    expect(construirePrompt({ ...demande, montage: montageInitial(analyse, 'Essai') })).toContain(
      'Éléments à l\'écran (id · nature · statut · mots couverts · texte · position) :\n(aucun)',
    );
  });
```

Dans `studio/serveur/api.test.ts`, dans `it('interprète une consigne, …')`, ajouter `texteMax: 40,` dans l'objet passé à `expect.objectContaining({ … })`, après `definitionMax: 160,`.

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- studio/serveur/interpretation.test.ts studio/serveur/api.test.ts`
Expected: FAIL (ligne d'élément absente, `texteMax` non transmis).

- [ ] **Step 3 : Ajouter `texteMax` à `DemandeInterpretation`**

Dans `studio/serveur/consignes.ts`, après `definitionMax: number;`, ajouter :

```ts
  texteMax: number;
```

Dans `studio/serveur/api.ts`, dans l'appel `c.interpreterConsigne({ … })`, après `definitionMax: t.reglages.definitionMaxCaracteres,`, ajouter :

```ts
        texteMax: t.reglages.elements.texteMaxCaracteres,
```

- [ ] **Step 4 : Modifier `studio/serveur/interpretation.ts`**

1. Dans `decrireMontage`, après la constante `termes`, ajouter :

```ts
  const elements = montage.elements.map(e => {
    const mots = motsRecouverts(analyse, e);
    const ou = mots ? `mots ${mots.premierMot} à ${mots.dernierMot}` : 'aucun mot';
    const texte = e.nature === 'texte' ? ` · « ${e.texte} » · ${e.position}` : '';
    return `- ${e.id} · ${e.nature} · ${e.statut} · ${ou}${texte}`;
  });
```

et à la fin du gabarit renvoyé, après la rubrique des termes, ajouter :

```ts

Éléments à l'écran (id · nature · statut · mots couverts · texte · position) :
${liste(elements, '(aucun)')}
```

(le gabarit se termine donc par `${liste(termes, '(aucun)')}` suivi d'une ligne vide puis de ces deux lignes, avant le backtick fermant).

2. Dans `construirePrompt`, dans la liste des opérations, après la ligne `- ajouterTerme : …`, ajouter :

```
- ajouterElement : poser un élément sur la vidéo pendant le passage premierMot à dernierMot. nature : zoom (agrandir une zone de l'écran partagé), miseEnAvant (assombrir l'image autour d'une zone), texte (incruster un texte court : URL, nom d'outil, raccourci clavier, chiffre clé ; donne texte, et position parmi haut-gauche, haut-droite, centre, bas-centre si l'auteur la précise), camera (passer la caméra en grand pour un aparté face caméra). Tu ne vois pas l'image : ne donne jamais de zone, l'auteur la tracera lui-même.
- modifierElement : changer le passage (premierMot et dernierMot ensemble), le texte, la position ou le statut (a-valider, valide, ecarte) d'un élément existant (idElement) ; ne donne que les champs à changer. Accepter un élément suggéré : statut = valide.
- supprimerElement : retirer un élément (idElement).
```

3. Remplacer la phrase `Une définition fait au plus ${d.definitionMax} caractères, … (60 caractères au plus).` par :

```
Une définition fait au plus ${d.definitionMax} caractères, en une ou deux phrases claires pour un public non spécialiste. Un titre de chapitre est court (60 caractères au plus). Un texte incrusté fait au plus ${d.texteMax} caractères. Un seul zoom ou caméra en grand à la fois ; pas de mise en avant pendant un zoom ou la caméra en grand ; deux textes affichés en même temps sont à des positions différentes.
```

4. Dans le schéma, avant `const SchemaOperation`, ajouter :

```ts
const positionTexte = z.enum(['haut-gauche', 'haut-droite', 'centre', 'bas-centre']);
```

et dans `z.discriminatedUnion('type', [ … ])`, avant l'objet `titreVideo`, ajouter :

```ts
  z.object({
    type: z.literal('ajouterElement'),
    nature: z.enum(['zoom', 'miseEnAvant', 'texte', 'camera']),
    premierMot: z.number().int(),
    dernierMot: z.number().int(),
    texte: z.string().optional(),
    position: positionTexte.optional(),
    explication,
  }),
  z.object({
    type: z.literal('modifierElement'),
    idElement: z.string(),
    premierMot: z.number().int().optional(),
    dernierMot: z.number().int().optional(),
    texte: z.string().optional(),
    position: positionTexte.optional(),
    statut: z.enum(['a-valider', 'valide', 'ecarte']).optional(),
    explication,
  }),
  z.object({ type: z.literal('supprimerElement'), idElement: z.string(), explication }),
```

- [ ] **Step 5 : Régénérer l'instantané du prompt et le relire**

Run: `npm test -- studio/serveur/interpretation.test.ts -u`
Expected: PASS, « 1 snapshot updated ». Ouvrir `studio/serveur/__snapshots__/interpretation.test.ts.snap` (`git diff`) : seuls doivent apparaître la rubrique « Éléments à l'écran » avec la ligne `e0`, les trois opérations et la phrase sur les textes incrustés.

- [ ] **Step 6 : Lancer toute la suite et la vérification de types**

Run: `npm test` puis `npm run typecheck`
Expected: PASS ; aucune erreur de type.

- [ ] **Step 7 : Commit**

```bash
git add studio/serveur/consignes.ts studio/serveur/interpretation.ts studio/serveur/interpretation.test.ts studio/serveur/__snapshots__/interpretation.test.ts.snap studio/serveur/api.ts studio/serveur/api.test.ts
git commit -m "Consignes : éléments à l'écran dans le prompt et le schéma de Claude

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7 : Suggestions d'éléments par l'analyse (pipeline)

**Files:**
- Modify: `pipeline/mtpipeline/suggestions.py`
- Modify: `pipeline/mtpipeline/cli.py`
- Modify: `pipeline/tests/test_suggestions.py`
- Modify: `pipeline/tests/test_cli.py`

**Interfaces:**
- Consumes: `reglages["elements"]["texteMaxCaracteres"]` (tâche 1).
- Produces : `analyse.json` → `suggestions.elements: [{ id: "se0", nature, debut, fin, texte?, raison }]`, lu par `montageInitial` (tâche 1).

- [ ] **Step 1 : Écrire les tests qui échouent**

Dans `pipeline/tests/test_suggestions.py` :

1. Remplacer l'import depuis `mtpipeline.suggestions` par :

```python
from mtpipeline.suggestions import (
    ChapitreIA, ElementIA, LongueurIA, ReponseIA, TermeIA, construire_prompt, convertir, demander, texte_numerote,
)
```

2. Dans `test_convertir`, ajouter `elements=[],` dans `ReponseIA(…)` après `longueurs=[…],`, et ajouter `"elements": [],` à la fin du dictionnaire attendu.

3. Dans `test_demander_renvoie_la_reponse`, remplacer la création de `attendu` par :

```python
    attendu = ReponseIA(chapitres=[], termes=[], longueurs=[], elements=[])
```

4. À la fin du fichier, ajouter :

```python
def test_convertir_elements():
    reponse = ReponseIA(chapitres=[], termes=[], longueurs=[], elements=[
        ElementIA(nature="texte", premier_mot=5, dernier_mot=5,
                  texte="api.example.com/v2/documentation/complete", raison="URL prononcée."),
        ElementIA(nature="zoom", premier_mot=3, dernier_mot=4, raison="Désigne un bouton."),
        ElementIA(nature="miseEnAvant", premier_mot=4, dernier_mot=99, raison="Mot inconnu."),
        ElementIA(nature="texte", premier_mot=2, dernier_mot=1, texte="SSO", raison="À l'envers."),
        ElementIA(nature="texte", premier_mot=2, dernier_mot=2, texte="  ", raison="Texte vide."),
    ])
    assert convertir(reponse, MOTS, {}, texte_max=20)["elements"] == [
        {"id": "se0", "nature": "texte", "debut": 5.0, "fin": 5.5, "texte": "api.example.com/v2/d", "raison": "URL prononcée."},
        {"id": "se1", "nature": "zoom", "debut": 3.0, "fin": 4.5, "raison": "Désigne un bouton."},
    ]


def test_prompt_demande_les_elements_sans_zone():
    p = construire_prompt(MOTS, GLOSSAIRE, texte_max=35)
    assert "4. **elements**" in p
    assert "35 caractères maximum" in p
    assert "Tu ne vois pas l'image" in p
    assert "Sois très sélectif" in p
```

Dans `pipeline/tests/test_cli.py` :

1. Dans `faux_demander`, remplacer la ligne `return ReponseIA(…)` par :

```python
    return ReponseIA(chapitres=[ChapitreIA(titre="Intro", premier_mot=0)], termes=[], longueurs=[], elements=[])
```

2. Dans `test_longueur_de_definition_transmise`, remplacer l'assertion par :

```python
    assert faux_demander.kwargs == {
        "max_caracteres": REGLAGES["definitionMaxCaracteres"],
        "texte_max": REGLAGES["elements"]["texteMaxCaracteres"],
    }
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run: `cd pipeline; ..\.venv\Scripts\python -m pytest tests/test_suggestions.py tests/test_cli.py -q`
Expected: FAIL (`ElementIA` introuvable).

- [ ] **Step 3 : Modifier `pipeline/mtpipeline/suggestions.py`**

1. Après `import os`, ajouter :

```python
from typing import Literal
```

2. Après `class LongueurIA`, ajouter :

```python
class ElementIA(BaseModel):
    nature: Literal["zoom", "miseEnAvant", "texte"]
    premier_mot: int
    dernier_mot: int
    texte: str | None = None
    raison: str
```

et ajouter le champ `elements: list[ElementIA]` à `ReponseIA`, après `longueurs`.

3. Remplacer la signature de `construire_prompt` par :

```python
def construire_prompt(mots: list[dict], glossaire: dict[str, dict], *, max_caracteres: int = 160,
                      texte_max: int = 40) -> str:
```

et ajouter à la fin du gabarit, après le paragraphe 3 (« longueurs »), avant les `"""` fermants :

```
4. **elements** : ce qu'il serait utile de poser sur la vidéo. Sois très sélectif : seulement quand cela aide vraiment à suivre.
   - textes à incruster (nature « texte ») : les URL, noms d'outils, raccourcis clavier et chiffres clés prononcés. Pour chacun : premier et dernier numéro de mot du passage où il est prononcé, le texte à afficher ({texte_max} caractères maximum) et la raison en une phrase.
   - moments à zoomer (nature « zoom ») ou à mettre en avant (nature « miseEnAvant ») : quand l'auteur désigne un endroit de l'écran (« cliquez ici », « en haut à droite, vous voyez… »). Pour chacun : premier et dernier numéro de mot et la raison en une phrase. Tu ne vois pas l'image : l'auteur tracera lui-même la zone.
```

4. Remplacer la signature de `demander` par :

```python
def demander(mots: list[dict], glossaire: dict[str, dict], modele: str, client=None,
             *, max_caracteres: int = 160, texte_max: int = 40) -> ReponseIA:
```

et dans l'appel `client.messages.parse(…)`, remplacer le contenu du message par :

```python
            messages=[{"role": "user", "content": construire_prompt(
                mots, glossaire, max_caracteres=max_caracteres, texte_max=texte_max)}],
```

5. Remplacer la signature de `convertir` par :

```python
def convertir(reponse: ReponseIA, mots: list[dict], glossaire: dict[str, dict], *, texte_max: int = 40) -> dict:
```

et remplacer sa dernière ligne `return {…}` par :

```python
    # La caméra en grand n'est jamais suggérée ; un texte trop long est tronqué, un texte vide écarté.
    elements = []
    for e in reponse.elements:
        if not (valide(e.premier_mot) and valide(e.dernier_mot) and e.premier_mot <= e.dernier_mot):
            continue
        element = {
            "id": f"se{len(elements)}",
            "nature": e.nature,
            "debut": mots[e.premier_mot]["debut"],
            "fin": mots[e.dernier_mot]["fin"],
            "raison": e.raison,
        }
        if e.nature == "texte":
            texte = (e.texte or "").strip()[:texte_max].rstrip()
            if not texte:
                continue
            element["texte"] = texte
        elements.append(element)

    return {"chapitres": chapitres, "termes": termes, "longueurs": longueurs, "elements": elements}
```

- [ ] **Step 4 : Modifier `pipeline/mtpipeline/cli.py`**

1. Dans `etape_suggestions`, remplacer l'appel à `demander_fn` et la ligne `suggestions = convertir(…)` par :

```python
    texte_max = reglages["elements"]["texteMaxCaracteres"]
    try:
        reponse = demander_fn(mots, glossaire, reglages["modeles"]["claude"],
                              max_caracteres=reglages["definitionMaxCaracteres"], texte_max=texte_max)
    except ErreurSuggestions as e:
        return None, str(e)
    suggestions = convertir(reponse, mots, glossaire, texte_max=texte_max)
```

2. Dans `main`, remplacer la ligne qui affiche le nombre de suggestions par :

```python
        print(f"{len(s['chapitres'])} chapitres, {len(s['termes'])} termes, {len(s['longueurs'])} longueurs, "
              f"{len(s.get('elements', []))} éléments à l'écran proposés.")
```

(`s.get` : un `suggestions.json` produit avant cette version n'a pas de rubrique `elements`.)

- [ ] **Step 5 : Lancer les tests du pipeline**

Run: `cd pipeline; ..\.venv\Scripts\python -m pytest -q`
Expected: PASS (les tests `gpu` et `reseau` restent désélectionnés).

- [ ] **Step 6 : Commit**

```bash
git add pipeline/mtpipeline/suggestions.py pipeline/mtpipeline/cli.py pipeline/tests/test_suggestions.py pipeline/tests/test_cli.py
git commit -m "Pipeline : suggestions de textes à incruster et de moments à zoomer ou mettre en avant

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8 : Calculs du zoom et de la caméra en grand

**Files:**
- Modify: `remotion/charte.ts`
- Modify: `remotion/calculs.ts`
- Modify: `remotion/calculs.test.ts`

**Interfaces:**
- Consumes: `Zone` ; `LARGEUR`, `HAUTEUR` (`remotion/charte.ts`).
- Produces :
  - `camera: Zone` exporté par `remotion/charte.ts`
  - `progressionElement(image: number, duree: number, transition: number): number` — 0 → 1 sur `transition` images à l'entrée, 1 → 0 à la sortie, adouci.
  - `interface Transformation { echelle: number; x: number; y: number }` — à appliquer avec `transform-origin: 0 0` et `translate(x, y) scale(echelle)`.
  - `transformationZoom(zone: Zone, progression: number): Transformation`
  - `transformationCamera(vignette: Zone, progression: number): Transformation`

- [ ] **Step 1 : Écrire les tests qui échouent**

Dans `remotion/calculs.test.ts`, remplacer l'import par :

```ts
import { describe, expect, it } from 'vitest';
import { progressionElement, transformationCamera, transformationZoom, volumeRaccord, volumeTapis, type Transformation } from './calculs';
```

puis à la fin du fichier :

```ts
const proche = (t: Transformation, attendu: Transformation) => {
  expect(t.echelle).toBeCloseTo(attendu.echelle);
  expect(t.x).toBeCloseTo(attendu.x);
  expect(t.y).toBeCloseTo(attendu.y);
};

describe('progressionElement', () => {
  it('monte puis descend sur la durée de transition, adoucie', () => {
    expect(progressionElement(0, 100, 15)).toBe(0);
    expect(progressionElement(7.5, 100, 15)).toBeCloseTo(0.5);
    expect(progressionElement(3, 100, 15)).toBeLessThan(0.2);
    expect(progressionElement(50, 100, 15)).toBe(1);
    expect(progressionElement(100, 100, 15)).toBe(0);
  });
  it('raccourcit la transition d’un élément bref', () => {
    expect(progressionElement(5, 10, 15)).toBe(1);
  });
});

describe('transformationZoom', () => {
  const zone = { x: 960, y: 540, largeur: 960, hauteur: 540 };
  it('va de l’image entière à la zone en plein cadre', () => {
    proche(transformationZoom(zone, 0), { echelle: 1, x: 0, y: 0 });
    proche(transformationZoom(zone, 1), { echelle: 2, x: -1920, y: -1080 });
    proche(transformationZoom(zone, 0.5), { echelle: 4 / 3, x: -640, y: -360 });
  });
});

describe('transformationCamera', () => {
  const vignette = { x: 24, y: 786, largeur: 480, hauteur: 270 };
  it('agrandit la vignette deux fois et la centre', () => {
    proche(transformationCamera(vignette, 0), { echelle: 1, x: 0, y: 0 });
    // Coin haut gauche de la vignette : 24 × 2 + 432 = 480 ; 786 × 2 − 1302 = 270 (960×540 centré).
    proche(transformationCamera(vignette, 1), { echelle: 2, x: 432, y: -1302 });
  });
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- remotion/calculs.test.ts`
Expected: FAIL (fonctions non exportées).

- [ ] **Step 3 : Exporter la position de la caméra**

Dans `remotion/charte.ts`, après `export const audio = reglages.audio;`, ajouter :

```ts
// Vignette caméra dans la source, d'après la scène OBS.
export const camera = reglages.camera;
```

- [ ] **Step 4 : Ajouter les calculs à la fin de `remotion/calculs.ts`**

Ajouter en tête de fichier :

```ts
import type { Zone } from '../noyau/types';
import { HAUTEUR, LARGEUR } from './charte';
```

puis à la fin :

```ts
// Avancement d'un élément : 0 → 1 sur `transition` images à l'entrée, 1 → 0 à la sortie, adouci (smoothstep).
export function progressionElement(image: number, duree: number, transition: number): number {
  const t = Math.min(transition, duree / 2);
  if (t <= 0) return 1;
  const lineaire = Math.max(0, Math.min(1, image / t, (duree - image) / t));
  return lineaire * lineaire * (3 - 2 * lineaire);
}

// À appliquer avec transform-origin en haut à gauche : translate(x, y) scale(echelle).
export interface Transformation {
  echelle: number;
  x: number;
  y: number;
}

// Le cadre visible passe de l'image entière à la zone (16:9), qui finit en plein cadre.
export function transformationZoom(zone: Zone, progression: number): Transformation {
  const largeurVisible = LARGEUR + (zone.largeur - LARGEUR) * progression;
  const echelle = LARGEUR / largeurVisible;
  return { echelle, x: -zone.x * progression * echelle, y: -zone.y * progression * echelle };
}

// La vignette caméra grandit jusqu'à deux fois sa taille, centrée dans l'image.
export function transformationCamera(vignette: Zone, progression: number): Transformation {
  const echelle = 1 + progression;
  const cibleX = (LARGEUR - 2 * vignette.largeur) / 2;
  const cibleY = (HAUTEUR - 2 * vignette.hauteur) / 2;
  const x = vignette.x + (cibleX - vignette.x) * progression;
  const y = vignette.y + (cibleY - vignette.y) * progression;
  return { echelle, x: x - vignette.x * echelle, y: y - vignette.y * echelle };
}
```

- [ ] **Step 5 : Lancer les tests**

Run: `npm test -- remotion/calculs.test.ts` puis `npm run typecheck`
Expected: PASS ; aucune erreur de type.

- [ ] **Step 6 : Commit**

```bash
git add remotion/charte.ts remotion/calculs.ts remotion/calculs.test.ts
git commit -m "Remotion : progression des éléments, transformation du zoom et de la caméra en grand

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9 : Composants Remotion et compositions de démonstration

**Files:**
- Create: `remotion/composants/CoucheVideo.tsx`
- Create: `remotion/composants/CameraEnGrand.tsx`
- Create: `remotion/composants/Cadrage.tsx`
- Create: `remotion/composants/MiseEnAvant.tsx`
- Create: `remotion/composants/TexteIncruste.tsx`
- Create: `remotion/composants/Incrustation.tsx`
- Modify: `remotion/compositions/VideoMontee.tsx`
- Modify: `remotion/apercus.tsx`
- Modify: `remotion/Root.tsx`

**Interfaces:**
- Consumes: `ElementImages`, `Partie` (`noyau/decisions.ts`) ; `progressionElement`, `transformationZoom`, `transformationCamera`, `Transformation`, `volumeRaccord` (`remotion/calculs.ts`) ; `camera`, `charte`, `LARGEUR`, `HAUTEUR`, `FRISE`, `HAUTEUR_LOGO_VIDEO`, `FPS_HABILLAGE` (`remotion/charte.ts`) ; `police` (`remotion/police.ts`).
- Produces :
  - `CoucheVideo: FC<{ segments: SegmentImages[]; sourceUrl: string; fondu: number; muette?: boolean }>`
  - `Cadrage: FC<{ elements: ElementImages[]; couche: (muette: boolean) => ReactNode }>`
  - `CameraEnGrand: FC<{ duree: number; children: ReactNode }>`, `TRANSITION_CAMERA`, `DECOUPE_CAMERA`, `enCss(t: Transformation): string`
  - `MiseEnAvant: FC<{ zone: Zone; duree: number }>`, `TexteIncruste: FC<{ texte: string; position: PositionTexte; duree: number }>`, `Incrustation: FC<{ element: ElementImages }>`
  - `elementDemo(nature: NatureElement, duree: number): ElementImages`, `ApercuElement: FC<{ element: ElementImages }>` ; compositions `Element-zoom`, `Element-miseEnAvant`, `Element-texte`, `Element-camera`.

La vérification de cette tâche est visuelle (Remotion Studio) : ces composants ne contiennent pas de logique hors de `calculs.ts`, déjà testée.

- [ ] **Step 1 : Créer `remotion/composants/CoucheVideo.tsx`** (extrait de `VideoMontee`)

```tsx
import { Video } from '@remotion/media';
import type { FC } from 'react';
import { AbsoluteFill, Series, useVideoConfig } from 'remotion';
import type { SegmentImages } from '../../noyau/images';
import { volumeRaccord } from '../calculs';

// Segments conservés de source.mp4 bout à bout (jump cuts), plein cadre. Une copie muette sert à redessiner
// la vignette caméra par-dessus un zoom ou à l'agrandir.
export const CoucheVideo: FC<{ segments: SegmentImages[]; sourceUrl: string; fondu: number; muette?: boolean }> = ({
  segments, sourceUrl, fondu, muette = false,
}) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      <Series>
        {segments.map(s => (
          <Series.Sequence key={s.debut} durationInFrames={s.fin - s.debut} premountFor={fps}>
            <Video
              src={sourceUrl}
              trimBefore={s.debut}
              trimAfter={s.fin}
              volume={muette ? 0 : f => volumeRaccord(f, s.fin - s.debut, fondu)}
              objectFit="cover"
              style={{ width: '100%', height: '100%' }}
            />
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2 : Créer `remotion/composants/CameraEnGrand.tsx`**

```tsx
import type { FC, ReactNode } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { progressionElement, transformationCamera, type Transformation } from '../calculs';
import { camera, HAUTEUR, LARGEUR } from '../charte';

// Transition de la caméra en grand, en secondes.
export const TRANSITION_CAMERA = 0.4;
const VOILE = 0.5;

// Découpe de la vignette caméra dans l'image plein cadre (clip-path, avant transformation).
export const DECOUPE_CAMERA =
  `inset(${camera.y}px ${LARGEUR - camera.x - camera.largeur}px ${HAUTEUR - camera.y - camera.hauteur}px ${camera.x}px)`;

export const enCss = (t: Transformation) => `translate(${t.x}px, ${t.y}px) scale(${t.echelle})`;

// Aparté face caméra : l'écran derrière s'assombrit (le flou est posé par Cadrage) et la vignette, découpée
// dans la copie de la couche vidéo reçue en enfant, passe à deux fois sa taille au centre.
export const CameraEnGrand: FC<{ duree: number; children: ReactNode }> = ({ duree, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = progressionElement(frame, duree, TRANSITION_CAMERA * fps);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ backgroundColor: `rgba(0, 0, 0, ${VOILE * p})` }} />
      <AbsoluteFill style={{ transformOrigin: '0 0', transform: enCss(transformationCamera(camera, p)), clipPath: DECOUPE_CAMERA }}>
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 3 : Créer `remotion/composants/Cadrage.tsx`**

```tsx
import type { FC, ReactNode } from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import type { ElementImages } from '../../noyau/decisions';
import { progressionElement, transformationZoom } from '../calculs';
import { CameraEnGrand, DECOUPE_CAMERA, enCss, TRANSITION_CAMERA } from './CameraEnGrand';

// Transition du zoom, en secondes ; flou maximal de l'écran derrière la caméra en grand, en pixels.
const TRANSITION_ZOOM = 0.5;
const FLOU = 16;

type Zoom = Extract<ElementImages, { nature: 'zoom' }>;
type Camera = Extract<ElementImages, { nature: 'camera' }>;
const actif = (e: ElementImages, frame: number) => frame >= e.debut && frame < e.debut + e.duree;

// Zoom et caméra en grand appliqués à la couche vidéo. La couche est redessinée (muette) pour la vignette caméra :
// reposée à sa place pendant un zoom, agrandie pendant la caméra en grand. Chaque copie est montée un peu avant
// l'élément (premount) et remise à l'heure de la partie par une séquence décalée de -debut.
export const Cadrage: FC<{ elements: ElementImages[]; couche: (muette: boolean) => ReactNode }> = ({ elements, couche }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const zooms = elements.filter((e): e is Zoom => e.nature === 'zoom');
  const cameras = elements.filter((e): e is Camera => e.nature === 'camera');
  const zoom = zooms.find(e => actif(e, frame));
  const cameraActive = cameras.find(e => actif(e, frame));
  const transformation = zoom
    ? transformationZoom(zoom.zone, progressionElement(frame - zoom.debut, zoom.duree, TRANSITION_ZOOM * fps))
    : null;
  const flou = cameraActive ? progressionElement(frame - cameraActive.debut, cameraActive.duree, TRANSITION_CAMERA * fps) : 0;

  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: 'black' }}>
      <AbsoluteFill
        style={{
          transformOrigin: '0 0',
          transform: transformation ? enCss(transformation) : undefined,
          filter: flou > 0 ? `blur(${FLOU * flou}px)` : undefined,
        }}
      >
        {couche(false)}
      </AbsoluteFill>
      {zooms.map(e => (
        <Sequence key={e.id} from={e.debut} durationInFrames={e.duree} premountFor={fps}>
          <AbsoluteFill style={{ clipPath: DECOUPE_CAMERA }}>
            <Sequence from={-e.debut}>{couche(true)}</Sequence>
          </AbsoluteFill>
        </Sequence>
      ))}
      {cameras.map(e => (
        <Sequence key={e.id} from={e.debut} durationInFrames={e.duree} premountFor={fps}>
          <CameraEnGrand duree={e.duree}>
            <Sequence from={-e.debut}>{couche(true)}</Sequence>
          </CameraEnGrand>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
```

- [ ] **Step 4 : Créer `remotion/composants/MiseEnAvant.tsx`**

```tsx
import type { FC } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import type { Zone } from '../../noyau/types';
import { progressionElement } from '../calculs';
import { charte, HAUTEUR, LARGEUR } from '../charte';

const FONDU = 12;

// Hors de la zone, l'image s'assombrit (voile noir à 60 %) ; la zone reçoit un cadre rouge. Fondu d'entrée et de sortie.
export const MiseEnAvant: FC<{ zone: Zone; duree: number }> = ({ zone, duree }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity: progressionElement(frame, duree, FONDU) }}>
      <div
        style={{
          position: 'absolute', left: zone.x, top: zone.y, width: zone.largeur, height: zone.hauteur, borderRadius: 4,
          boxShadow: `0 0 0 ${LARGEUR + HAUTEUR}px rgba(0, 0, 0, 0.6)`, outline: `6px solid ${charte.rouge}`,
        }}
      />
    </AbsoluteFill>
  );
};
```

- [ ] **Step 5 : Créer `remotion/composants/TexteIncruste.tsx`**

```tsx
import type { CSSProperties, FC } from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { PositionTexte } from '../../noyau/types';
import { charte, FRISE } from '../charte';
import { police } from '../police';

// Les coins bas sont exclus : vignette caméra à gauche, logo à droite.
const ANCRAGES: Record<PositionTexte, CSSProperties> = {
  'haut-gauche': { top: 48, left: 48 },
  'haut-droite': { top: 48, right: 48 },
  centre: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
  'bas-centre': { bottom: FRISE + 48, left: '50%', transform: 'translateX(-50%)' },
};

// Étiquette au fond bleu, texte blanc, filet rouge à gauche ; entrée et sortie comme les encarts.
export const TexteIncruste: FC<{ texte: string; position: PositionTexte; duree: number }> = ({ texte, position, duree }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entree = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 15 });
  const sortie = interpolate(frame, [duree - 12, duree], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const visible = Math.min(entree, sortie);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', ...ANCRAGES[position] }}>
        <div
          style={{
            display: 'flex', overflow: 'hidden', borderRadius: 10, backgroundColor: charte.bleu,
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.25)', opacity: visible, transform: `translateY(${(1 - visible) * 30}px)`,
          }}
        >
          <div style={{ width: 12, flexShrink: 0, backgroundColor: charte.rouge }} />
          <div style={{ padding: '16px 28px', fontFamily: police, fontSize: 36, fontWeight: 700, color: charte.blanc, whiteSpace: 'nowrap' }}>
            {texte}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 6 : Créer `remotion/composants/Incrustation.tsx`**

```tsx
import type { FC } from 'react';
import type { ElementImages } from '../../noyau/decisions';
import { MiseEnAvant } from './MiseEnAvant';
import { TexteIncruste } from './TexteIncruste';

// Ce qui se pose au-dessus de la vidéo ; le zoom et la caméra en grand agissent sur la vidéo elle-même (Cadrage).
export const Incrustation: FC<{ element: ElementImages }> = ({ element: e }) => {
  if (e.nature === 'miseEnAvant') return <MiseEnAvant zone={e.zone} duree={e.duree} />;
  if (e.nature === 'texte') return <TexteIncruste texte={e.texte} position={e.position} duree={e.duree} />;
  return null;
};
```

- [ ] **Step 7 : Réécrire `remotion/compositions/VideoMontee.tsx`**

```tsx
import type { FC } from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import type { Partie } from '../../noyau/decisions';
import { FRISE, HAUTEUR_LOGO_VIDEO } from '../charte';
import { Cadrage } from '../composants/Cadrage';
import { CoucheVideo } from '../composants/CoucheVideo';
import { EncartDefinition } from '../composants/EncartDefinition';
import { Frise } from '../composants/Frise';
import { Incrustation } from '../composants/Incrustation';
import { LogoPMT } from '../composants/LogoPMT';

// Segments conservés de source.mp4 bout à bout (jump cuts) plein cadre, cadrés par les zooms et la caméra en grand ;
// mises en avant et textes incrustés au-dessus ; frise en bas, encarts aux temps décidés, logo collé au coin bas droit.
export const VideoMontee: FC<{ partie: Partie; sourceUrl: string; fondu: number }> = ({ partie, sourceUrl, fondu }) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <Cadrage
        elements={partie.elements}
        couche={muette => <CoucheVideo segments={partie.segments} sourceUrl={sourceUrl} fondu={fondu} muette={muette} />}
      />
      {partie.elements.map(e => (
        <Sequence key={e.id} from={e.debut} durationInFrames={e.duree} premountFor={fps}>
          <Incrustation element={e} />
        </Sequence>
      ))}
      <Frise epaisseur={FRISE} />
      {partie.encarts.map(e => (
        <Sequence key={`${e.terme}-${e.debut}`} from={e.debut} durationInFrames={e.duree} premountFor={fps}>
          <EncartDefinition terme={e.terme} definition={e.definition} position={e.position} duree={e.duree} />
        </Sequence>
      ))}
      <div style={{ position: 'absolute', right: 0, bottom: 0 }}>
        <LogoPMT hauteur={HAUTEUR_LOGO_VIDEO} arrondi={false} />
      </div>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 8 : Ajouter les démonstrations à `remotion/apercus.tsx`**

Remplacer les imports par :

```tsx
import type { FC } from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import type { ElementImages } from '../noyau/decisions';
import type { NatureElement, PositionEncart, Zone } from '../noyau/types';
import { camera, charte } from './charte';
import { Cadrage } from './composants/Cadrage';
import { EncartDefinition } from './composants/EncartDefinition';
import { Incrustation } from './composants/Incrustation';
import { LogoPMT } from './composants/LogoPMT';
import { police } from './police';
```

puis à la fin du fichier :

```tsx
const ZONE_DEMO: Zone = { x: 960, y: 405, largeur: 640, hauteur: 360 };

// Image fixe qui imite un partage d'écran : quadrillage, zone visée en bleu-gris, vignette caméra à sa place.
const FausseSource: FC = () => (
  <AbsoluteFill
    style={{
      backgroundColor: charte.blanc,
      backgroundImage: 'linear-gradient(#d5dde8 2px, transparent 2px), linear-gradient(90deg, #d5dde8 2px, transparent 2px)',
      backgroundSize: '120px 120px',
    }}
  >
    <div style={{ position: 'absolute', left: ZONE_DEMO.x, top: ZONE_DEMO.y, width: ZONE_DEMO.largeur, height: ZONE_DEMO.hauteur, backgroundColor: charte.bleuGris }} />
    <div
      style={{
        position: 'absolute', left: camera.x, top: camera.y, width: camera.largeur, height: camera.hauteur,
        backgroundColor: charte.bleu, color: charte.blanc, fontFamily: police, fontSize: 40,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      Caméra
    </div>
  </AbsoluteFill>
);

export function elementDemo(nature: NatureElement, duree: number): ElementImages {
  const place = { id: 'demo', debut: 0, duree };
  switch (nature) {
    case 'zoom': return { ...place, nature, zone: ZONE_DEMO };
    case 'miseEnAvant': return { ...place, nature, zone: ZONE_DEMO };
    case 'texte': return { ...place, nature, texte: 'Windows + V', position: 'haut-gauche' };
    case 'camera': return { ...place, nature };
  }
}

// Un élément seul sur la fausse source, avec le même cadrage que VideoMontee.
export const ApercuElement: FC<{ element: ElementImages }> = ({ element }) => (
  <AbsoluteFill>
    <Cadrage elements={[element]} couche={() => <FausseSource />} />
    <Sequence from={element.debut} durationInFrames={element.duree}>
      <Incrustation element={element} />
    </Sequence>
  </AbsoluteFill>
);
```

- [ ] **Step 9 : Déclarer les compositions dans `remotion/Root.tsx`**

1. Remplacer `import { ApercuEncart, ApercuLogo } from './apercus';` par :

```tsx
import { ApercuElement, ApercuEncart, ApercuLogo, elementDemo } from './apercus';
```

2. Après `const encart = …;`, ajouter :

```tsx
const demo = enImages(4, FPS_HABILLAGE);
const NATURES = ['zoom', 'miseEnAvant', 'texte', 'camera'] as const;
```

3. Après le `</Folder>` du dossier « Habillage », ajouter :

```tsx
    <Folder name="Elements-ecran">
      {NATURES.map(n => (
        <Composition
          key={n} id={`Element-${n}`} component={ApercuElement} durationInFrames={demo} fps={FPS_HABILLAGE}
          width={LARGEUR} height={HAUTEUR} defaultProps={{ element: elementDemo(n, demo) }}
        />
      ))}
    </Folder>
```

- [ ] **Step 10 : Lancer la suite et la vérification de types**

Run: `npm test` puis `npm run typecheck`
Expected: PASS ; aucune erreur de type.

- [ ] **Step 11 : Vérification visuelle dans Remotion Studio**

Run: `npm run studio`, puis ouvrir le dossier « Elements-ecran ».

Vérifier, image par image au début et à la fin de chaque composition :
1. `Element-zoom` : la zone bleu-gris grandit jusqu'au plein cadre en ~0,5 s, sans à-coup, et revient à la fin ; la vignette « Caméra » reste en bas à gauche, à sa taille, par-dessus le zoom.
2. `Element-miseEnAvant` : fondu du voile noir hors de la zone, cadre rouge autour de la zone bleu-gris.
3. `Element-texte` : étiquette bleue « Windows + V », filet rouge à gauche, en haut à gauche ; entrée et sortie comme l'encart de `EncartDefinition`. Changer `position` dans les props (Studio) pour les trois autres positions : `bas-centre` ne touche pas la vignette caméra.
4. `Element-camera` : la vignette passe à 960×540 au centre en ~0,4 s, le fond se floute et s'assombrit, puis tout revient.

Noter tout écart et le corriger avant de valider.

- [ ] **Step 12 : Commit**

```bash
git add remotion/composants/CoucheVideo.tsx remotion/composants/CameraEnGrand.tsx remotion/composants/Cadrage.tsx remotion/composants/MiseEnAvant.tsx remotion/composants/TexteIncruste.tsx remotion/composants/Incrustation.tsx remotion/compositions/VideoMontee.tsx remotion/apercus.tsx remotion/Root.tsx
git commit -m "Remotion : zoom, mise en avant, texte incrusté et caméra en grand, démonstrations dans le Studio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10 : Logique du studio — zone, repères, éléments affichés, propositions

**Files:**
- Create: `studio/src/logique/zone.ts`
- Test: `studio/src/logique/zone.test.ts`
- Create: `studio/src/logique/elements.ts`
- Test: `studio/src/logique/elements.test.ts`
- Modify: `studio/src/logique/texte.ts`
- Modify: `studio/src/logique/texte.test.ts`
- Modify: `studio/src/logique/consignes.ts`
- Modify: `studio/src/logique/consignes.test.ts`

**Interfaces:**
- Consumes: `LARGEUR_SOURCE`, `HAUTEUR_SOURCE` (`noyau/elements.ts`) ; `extraitPassage`, `passageEnTemps`, `Ancrage`, `Operation` (`noyau/consignes.ts`).
- Produces :
  - `interface Point { x: number; y: number }` ; `interface Cadre { left: number; top: number; width: number; height: number }`
  - `versSource(clientX: number, clientY: number, cadre: Cadre): Point`
  - `rectangleTrace(depart: Point, arrivee: Point, zoom: boolean, largeurMin: number): Zone`
  - `elementsAffiches(m: Montage): ElementEcran[]` ; `textePrerempli(analyse: Analyse, ancrage: Ancrage, max: number): string`
  - `ElementTexte` (genre `mot`) gagne `reperes: NatureElement[]`
  - `passageDeProposition` couvre `ajouterElement`, `modifierElement`, `supprimerElement` ; `demandeUneZone(operation: Operation): boolean`

- [ ] **Step 1 : Écrire les tests qui échouent**

`studio/src/logique/zone.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { rectangleTrace, versSource } from './zone';

describe('versSource', () => {
  const cadre = { left: 100, top: 50, width: 960, height: 540 };
  it('convertit un point de l’aperçu en pixels de la source', () => {
    expect(versSource(580, 320, cadre)).toEqual({ x: 960, y: 540 });
  });
  it('borne le point à l’image', () => {
    expect(versSource(0, 0, cadre)).toEqual({ x: 0, y: 0 });
    expect(versSource(2000, 2000, cadre)).toEqual({ x: 1920, y: 1080 });
  });
});

describe('rectangleTrace', () => {
  it('trace un rectangle libre pour une mise en avant', () => {
    expect(rectangleTrace({ x: 100, y: 200 }, { x: 50, y: 400 }, false, 480)).toEqual({ x: 50, y: 200, largeur: 50, hauteur: 200 });
  });
  it('garde le 16:9 pour un zoom, en suivant le geste le plus ample', () => {
    expect(rectangleTrace({ x: 100, y: 100 }, { x: 900, y: 200 }, true, 480)).toEqual({ x: 100, y: 100, largeur: 800, hauteur: 450 });
    expect(rectangleTrace({ x: 100, y: 100 }, { x: 200, y: 550 }, true, 480)).toEqual({ x: 100, y: 100, largeur: 800, hauteur: 450 });
  });
  it('ne descend pas sous la largeur minimale', () => {
    expect(rectangleTrace({ x: 100, y: 100 }, { x: 110, y: 105 }, true, 480)).toEqual({ x: 100, y: 100, largeur: 480, hauteur: 270 });
  });
  it('part vers le haut et la gauche quand le geste y va', () => {
    expect(rectangleTrace({ x: 1000, y: 600 }, { x: 200, y: 500 }, true, 480)).toEqual({ x: 200, y: 150, largeur: 800, hauteur: 450 });
  });
  it('ramène le zoom dans l’image', () => {
    expect(rectangleTrace({ x: 1800, y: 1000 }, { x: 1900, y: 1050 }, true, 480)).toEqual({ x: 1440, y: 810, largeur: 480, hauteur: 270 });
  });
});
```

`studio/src/logique/elements.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import exemple from '../../../fixtures/analyse-exemple.json';
import type { Analyse, Montage } from '../../../noyau/types';
import { elementsAffiches, textePrerempli } from './elements';

const analyse = exemple as Analyse;

describe('elementsAffiches', () => {
  it('garde les éléments non écartés, par ordre d’apparition', () => {
    const m: Montage = {
      version: 1, titre: 'T', coupes: [], chapitres: [{ titre: 'Intro', debut: 0 }], termes: [],
      elements: [
        { id: 'e1', debut: 10, fin: 12, statut: 'valide', nature: 'camera' },
        { id: 'se0', debut: 2, fin: 4, statut: 'a-valider', nature: 'zoom', zone: null },
        { id: 'se1', debut: 1, fin: 3, statut: 'ecarte', nature: 'camera' },
      ],
    };
    expect(elementsAffiches(m).map(e => e.id)).toEqual(['se0', 'e1']);
    expect(m.elements.map(e => e.id)).toEqual(['e1', 'se0', 'se1']);
  });
});

describe('textePrerempli', () => {
  it('reprend les mots sélectionnés, coupés à la longueur maximale', () => {
    expect(textePrerempli(analyse, { premierMot: 0, dernierMot: 2 }, 40)).toBe('Bonjour à tous.');
    expect(textePrerempli(analyse, { premierMot: 0, dernierMot: 2 }, 9)).toBe('Bonjour à');
    expect(textePrerempli(analyse, { premierMot: 0, dernierMot: 2 }, 8)).toBe('Bonjour');
  });
});
```

Dans `studio/src/logique/texte.test.ts`, à la fin du `describe`, ajouter :

```ts
  it('repère les passages couverts par un élément non écarté', () => {
    const montage: Montage = {
      version: 1, titre: 'T', coupes: [], chapitres: [{ titre: 'Intro', debut: 0 }], termes: [],
      elements: [
        { id: 'e0', debut: 3.0, fin: 4.3, statut: 'valide', nature: 'texte', texte: 'SSO', position: 'centre' },
        { id: 'e1', debut: 3.6, fin: 3.8, statut: 'a-valider', nature: 'zoom', zone: null },
        { id: 'e2', debut: 0.8, fin: 1.8, statut: 'ecarte', nature: 'camera' },
      ],
    };
    const mots = construireTexte(analyse, montage)[0]!.elements.flatMap(e => (e.genre === 'mot' ? [[e.mot.texte, e.reperes]] : []));
    expect(mots).toEqual([
      ['Bonjour', []], ['à', []], ['tous.', []], ["Aujourd'hui,", ['texte']], ['le', ['texte', 'zoom']], ['SSO.', ['texte']],
    ]);
  });
```

Dans `studio/src/logique/consignes.test.ts` :

1. Ajouter `demandeUneZone` à l'import depuis `./consignes`.
2. Dans le littéral `montage`, remplacer `elements: [],` par :

```ts
  elements: [{ id: 'e0', debut: 3.0, fin: 4.3, statut: 'valide', nature: 'camera' }],
```

3. À la fin du fichier, ajouter :

```ts
describe('propositions sur les éléments à l’écran', () => {
  it('donne le passage à écouter', () => {
    expect(passageDeProposition(analyse, montage, { type: 'ajouterElement', nature: 'texte', premierMot: 3, dernierMot: 5, texte: 'A' }))
      .toEqual({ debut: 3.0, fin: 4.3 });
    expect(passageDeProposition(analyse, montage, { type: 'modifierElement', idElement: 'e0', statut: 'ecarte' }))
      .toEqual({ debut: 3.0, fin: 4.3 });
    expect(passageDeProposition(analyse, montage, { type: 'modifierElement', idElement: 'e0', premierMot: 0, dernierMot: 2 }))
      .toEqual({ debut: 0.8, fin: 1.8 });
    expect(passageDeProposition(analyse, montage, { type: 'supprimerElement', idElement: 'x' })).toBeNull();
  });
  it('repère les propositions qui demandent une zone', () => {
    expect(demandeUneZone({ type: 'ajouterElement', nature: 'zoom', premierMot: 3, dernierMot: 5 })).toBe(true);
    expect(demandeUneZone({ type: 'ajouterElement', nature: 'texte', premierMot: 3, dernierMot: 5, texte: 'A' })).toBe(false);
    expect(demandeUneZone({ type: 'couper', premierMot: 0, dernierMot: 2 })).toBe(false);
  });
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- studio/src/logique`
Expected: FAIL (modules `./zone` et `./elements` introuvables, `reperes` absent, `demandeUneZone` non exporté).

- [ ] **Step 3 : Créer `studio/src/logique/zone.ts`**

```ts
import { HAUTEUR_SOURCE, LARGEUR_SOURCE } from '../../../noyau/elements';
import type { Zone } from '../../../noyau/types';

export interface Point {
  x: number;
  y: number;
}

// Rectangle de l'aperçu à l'écran (getBoundingClientRect).
export interface Cadre {
  left: number;
  top: number;
  width: number;
  height: number;
}

const borne = (v: number, max: number) => Math.min(max, Math.max(0, v));

// Point de l'aperçu (coordonnées de la page) en pixels de la source, borné à l'image.
export function versSource(clientX: number, clientY: number, cadre: Cadre): Point {
  return {
    x: borne(((clientX - cadre.left) / cadre.width) * LARGEUR_SOURCE, LARGEUR_SOURCE),
    y: borne(((clientY - cadre.top) / cadre.height) * HAUTEUR_SOURCE, HAUTEUR_SOURCE),
  };
}

// Rectangle tiré de `depart` vers `arrivee`, en pixels entiers. Pour un zoom : 16:9, au moins `largeurMin`
// de large, la largeur suivant le geste le plus ample, ancré au départ dans le sens du geste puis ramené dans l'image.
export function rectangleTrace(depart: Point, arrivee: Point, zoom: boolean, largeurMin: number): Zone {
  if (!zoom) {
    const x = Math.round(Math.min(depart.x, arrivee.x));
    const y = Math.round(Math.min(depart.y, arrivee.y));
    return {
      x,
      y,
      largeur: Math.round(Math.max(depart.x, arrivee.x)) - x,
      hauteur: Math.round(Math.max(depart.y, arrivee.y)) - y,
    };
  }
  const dx = arrivee.x - depart.x;
  const dy = arrivee.y - depart.y;
  const largeur = Math.round(Math.min(LARGEUR_SOURCE, Math.max(Math.abs(dx), (Math.abs(dy) * 16) / 9, largeurMin)));
  const hauteur = Math.round((largeur * 9) / 16);
  const x0 = dx < 0 ? depart.x - largeur : depart.x;
  const y0 = dy < 0 ? depart.y - hauteur : depart.y;
  return {
    x: Math.round(Math.min(Math.max(0, x0), LARGEUR_SOURCE - largeur)),
    y: Math.round(Math.min(Math.max(0, y0), HAUTEUR_SOURCE - hauteur)),
    largeur,
    hauteur,
  };
}
```

- [ ] **Step 4 : Créer `studio/src/logique/elements.ts`**

```ts
import { extraitPassage, type Ancrage } from '../../../noyau/consignes';
import type { Analyse, ElementEcran, Montage } from '../../../noyau/types';

// Éléments du panneau : non écartés, par ordre d'apparition.
export function elementsAffiches(m: Montage): ElementEcran[] {
  return m.elements.filter(e => e.statut !== 'ecarte').sort((a, b) => a.debut - b.debut);
}

// Texte proposé pour un texte incrusté : les mots sélectionnés, coupés à la longueur maximale.
export function textePrerempli(analyse: Analyse, ancrage: Ancrage, max: number): string {
  return extraitPassage(analyse, ancrage).slice(0, max).trimEnd();
}
```

- [ ] **Step 5 : Repères dans `studio/src/logique/texte.ts`**

1. Remplacer l'import par :

```ts
import type { Analyse, Coupe, Montage, Mot, NatureElement } from '../../../noyau/types';
```

2. Remplacer le type `ElementTexte` par :

```ts
export type ElementTexte =
  | { genre: 'mot'; mot: Mot; coupe: Coupe | null; terme: string | null; reperes: NatureElement[] }
  | { genre: 'trou'; coupe: Coupe };
```

3. Remplacer `const couvre = (c: Coupe, t: number) => t >= c.debut && t <= c.fin;` par :

```ts
const couvre = (p: { debut: number; fin: number }, t: number) => t >= p.debut && t <= p.fin;
```

4. Dans `construireTexte`, après la boucle qui remplit `termes`, ajouter :

```ts
  // Repères des éléments non écartés : natures des éléments qui couvrent le milieu du mot.
  const elements = montage.elements.filter(e => e.statut !== 'ecarte');
```

et dans l'objet `element` de chaque mot, après `terme: termes.get(cle(mot.debut)) ?? null,`, ajouter :

```ts
      reperes: [...new Set(elements.filter(e => couvre(e, milieu(mot))).map(e => e.nature))],
```

- [ ] **Step 6 : Propositions sur les éléments dans `studio/src/logique/consignes.ts`**

Remplacer `passageDeProposition` par :

```ts
function passage(analyse: Analyse, premierMot: number, dernierMot: number): Segment | null {
  const p = passageEnTemps(analyse, premierMot, dernierMot);
  return typeof p === 'string' ? null : p;
}

// Passage à écouter pour une proposition qui porte sur un passage, une coupe ou un élément existant.
export function passageDeProposition(analyse: Analyse, montage: Montage, operation: Operation): Segment | null {
  switch (operation.type) {
    case 'couper':
    case 'ajouterElement':
      return passage(analyse, operation.premierMot, operation.dernierMot);
    case 'basculerCoupe':
    case 'deciderLongueur': {
      const coupe = montage.coupes.find(c => c.id === operation.idCoupe);
      return coupe ? { debut: coupe.debut, fin: coupe.fin } : null;
    }
    case 'modifierElement':
    case 'supprimerElement': {
      if (operation.type === 'modifierElement' && operation.premierMot !== undefined && operation.dernierMot !== undefined) {
        return passage(analyse, operation.premierMot, operation.dernierMot);
      }
      const e = montage.elements.find(x => x.id === operation.idElement);
      return e ? { debut: e.debut, fin: e.fin } : null;
    }
    default:
      return null;
  }
}

// Proposition de zoom ou de mise en avant : la zone se trace dans l'aperçu.
export function demandeUneZone(operation: Operation): boolean {
  return operation.type === 'ajouterElement' && (operation.nature === 'zoom' || operation.nature === 'miseEnAvant');
}
```

- [ ] **Step 7 : Lancer les tests et la vérification de types**

Run: `npm test` puis `npm run typecheck`
Expected: PASS ; aucune erreur de type.

- [ ] **Step 8 : Commit**

```bash
git add studio/src/logique/zone.ts studio/src/logique/zone.test.ts studio/src/logique/elements.ts studio/src/logique/elements.test.ts studio/src/logique/texte.ts studio/src/logique/texte.test.ts studio/src/logique/consignes.ts studio/src/logique/consignes.test.ts
git commit -m "Studio : conversion des coordonnées, rectangle 16:9, repères et passages des éléments

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11 : Création depuis le texte et tracé de la zone dans l'aperçu

**Files:**
- Create: `studio/src/composants/TraceurZone.tsx`
- Create: `studio/src/composants/ChoixPosition.tsx`
- Modify: `studio/src/composants/Apercu.tsx`
- Modify: `studio/src/composants/Texte.tsx`
- Modify: `studio/src/composants/EcranMontage.tsx`
- Modify: `studio/src/styles.css`

**Interfaces:**
- Consumes: `rectangleTrace`, `versSource`, `Point` (`studio/src/logique/zone.ts`) ; `textePrerempli` ; `LIBELLES_NATURE`, `problemeDe`, `LARGEUR_SOURCE`, `HAUTEUR_SOURCE` ; `ajouterElement`, `modifierElement`, `prochainIdElement`, `NouvelElement` ; `passageEnTemps`.
- Produces :
  - `type CibleDessin = { genre: 'nouveau'; fin: number } | { genre: 'element'; id: string } | { genre: 'proposition'; idConsigne: string; indice: number }`
  - `interface Dessin { nature: 'zoom' | 'miseEnAvant'; debut: number; cible: CibleDessin }`
  - `TraceurZone: FC<{ dessin: Dessin; largeurMin: number; valider: (zone: Zone) => string | null; onFin: () => void }>`
  - `ChoixPosition: FC<{ valeur: PositionTexte; onChange: (p: PositionTexte) => void }>`
  - `DemandeLecture.pause?: boolean` ; `Apercu` : props `dessin`, `largeurMin`, `validerDessin`, `onFinDessin`
  - `Texte` : props `texteMax`, `surSelection`, `creerElement` ; `interface SaisieTexte { texte: string; position: PositionTexte }`
  - Dans `EcranMontage` (utilisés par la tâche 12) : `retoucher(id, f): string | null`, `tracer(d: Dessin)`, `validerDessin(d, zone)`, état `selection: Ancrage | null`.

- [ ] **Step 1 : Créer `studio/src/composants/ChoixPosition.tsx`**

```tsx
import type { FC } from 'react';
import type { PositionTexte } from '../../../noyau/types';

export const LIBELLES_POSITION: Record<PositionTexte, string> = {
  'haut-gauche': 'En haut à gauche',
  'haut-droite': 'En haut à droite',
  centre: 'Au centre',
  'bas-centre': 'En bas au centre',
};

const POSITIONS = Object.keys(LIBELLES_POSITION) as PositionTexte[];

export const ChoixPosition: FC<{ valeur: PositionTexte; onChange: (p: PositionTexte) => void }> = ({ valeur, onChange }) => (
  <select value={valeur} aria-label="Position du texte" onChange={e => onChange(e.target.value as PositionTexte)}>
    {POSITIONS.map(p => <option key={p} value={p}>{LIBELLES_POSITION[p]}</option>)}
  </select>
);
```

- [ ] **Step 2 : Créer `studio/src/composants/TraceurZone.tsx`**

```tsx
import { type FC, type PointerEvent, useRef, useState } from 'react';
import { HAUTEUR_SOURCE, LARGEUR_SOURCE } from '../../../noyau/elements';
import type { Zone } from '../../../noyau/types';
import { rectangleTrace, versSource, type Point } from '../logique/zone';

// Ce que la zone tracée complète : un élément à créer, un élément existant ou une proposition de consigne.
export type CibleDessin =
  | { genre: 'nouveau'; fin: number }
  | { genre: 'element'; id: string }
  | { genre: 'proposition'; idConsigne: string; indice: number };

export interface Dessin {
  nature: 'zoom' | 'miseEnAvant';
  // Instant de la source où l'aperçu est mis en pause.
  debut: number;
  cible: CibleDessin;
}

interface Props {
  dessin: Dessin;
  largeurMin: number;
  // Renvoie le problème qui empêche d'enregistrer la zone, ou null.
  valider: (zone: Zone) => string | null;
  onFin: () => void;
}

const enPourcent = (v: number, total: number) => `${(v / total) * 100}%`;

// Calque posé sur l'aperçu en pause : l'auteur tire un rectangle à la souris (16:9 pour un zoom).
export const TraceurZone: FC<Props> = ({ dessin, largeurMin, valider, onFin }) => {
  const calque = useRef<HTMLDivElement>(null);
  const [depart, setDepart] = useState<Point | null>(null);
  const [zone, setZone] = useState<Zone | null>(null);
  const [probleme, setProbleme] = useState<string | null>(null);
  const zoom = dessin.nature === 'zoom';

  const point = (e: PointerEvent): Point | null => {
    const cadre = calque.current?.getBoundingClientRect();
    return cadre ? versSource(e.clientX, e.clientY, cadre) : null;
  };
  const commencer = (e: PointerEvent<HTMLDivElement>) => {
    const p = point(e);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDepart(p);
    setZone(rectangleTrace(p, p, zoom, largeurMin));
    setProbleme(null);
  };
  const deplacer = (e: PointerEvent) => {
    const p = point(e);
    if (depart && p) setZone(rectangleTrace(depart, p, zoom, largeurMin));
  };
  const enregistrer = () => {
    if (!zone) return;
    const p = valider(zone);
    if (p) setProbleme(p);
    else onFin();
  };

  return (
    <div ref={calque} className="traceur" onPointerDown={commencer} onPointerMove={deplacer} onPointerUp={() => setDepart(null)}>
      {zone && (
        <div
          className="traceur-zone"
          style={{
            left: enPourcent(zone.x, LARGEUR_SOURCE),
            top: enPourcent(zone.y, HAUTEUR_SOURCE),
            width: enPourcent(zone.largeur, LARGEUR_SOURCE),
            height: enPourcent(zone.hauteur, HAUTEUR_SOURCE),
          }}
        />
      )}
      <div className="traceur-barre" onPointerDown={e => e.stopPropagation()}>
        <span>{zoom ? 'Tracez la zone à agrandir (16:9).' : 'Tracez la zone à mettre en avant.'}</span>
        <button className="principal" disabled={!zone || zone.largeur === 0 || zone.hauteur === 0} onClick={enregistrer}>
          Valider
        </button>
        <button onClick={onFin}>Annuler</button>
        {probleme && <span className="trop-long">{probleme}</span>}
      </div>
    </div>
  );
};
```

- [ ] **Step 3 : Réécrire `studio/src/composants/Apercu.tsx`**

```tsx
import { Player, type PlayerRef } from '@remotion/player';
import { type FC, useEffect, useRef } from 'react';
import { dureeEpisode, dureeVideoComplete, type DecisionsEpisode, type DecisionsVideoComplete } from '../../../noyau/decisions';
import type { Zone } from '../../../noyau/types';
import { HAUTEUR, LARGEUR } from '../../../remotion/charte';
import { Episode } from '../../../remotion/compositions/Episode';
import { VideoComplete } from '../../../remotion/compositions/VideoComplete';
import { type Dessin, TraceurZone } from './TraceurZone';

export type Vue = 'complete' | number;

// Le jeton change à chaque demande, même pour la même image ; `pause` arrête l'aperçu sur l'image (tracé d'une zone).
export interface DemandeLecture {
  image: number;
  jeton: number;
  pause?: boolean;
}

interface Props {
  episodes: DecisionsEpisode[];
  complete: DecisionsVideoComplete;
  vue: Vue;
  onVue: (vue: Vue) => void;
  demande: DemandeLecture | null;
  dessin: Dessin | null;
  largeurMin: number;
  validerDessin: (zone: Zone) => string | null;
  onFinDessin: () => void;
}

// Lecteur Remotion sur les compositions de rendu, recalculé à chaque modification du montage.
export const Apercu: FC<Props> = ({ episodes, complete, vue, onVue, demande, dessin, largeurMin, validerDessin, onFinDessin }) => {
  const ref = useRef<PlayerRef>(null);
  useEffect(() => {
    if (!demande || !ref.current) return;
    ref.current.seekTo(demande.image);
    if (demande.pause) ref.current.pause();
    else ref.current.play();
  }, [demande]);

  const episode = typeof vue === 'number' ? episodes[vue] : undefined;
  const style = { width: '100%' };
  return (
    <section className="panneau">
      <div className="vues">
        <button className={episode ? '' : 'actif'} onClick={() => onVue('complete')}>Vidéo complète</button>
        {episodes.map((e, i) => (
          <button key={i} className={episode && vue === i ? 'actif' : ''} onClick={() => onVue(i)}>
            {i + 1}. {e.titre}
          </button>
        ))}
      </div>
      <div className="cadre-apercu">
        {episode ? (
          <Player
            key={`episode-${vue}`}
            ref={ref}
            component={Episode}
            inputProps={{ decisions: episode }}
            durationInFrames={Math.max(1, dureeEpisode(episode))}
            fps={episode.fps}
            compositionWidth={LARGEUR}
            compositionHeight={HAUTEUR}
            controls
            style={style}
          />
        ) : (
          <Player
            key="complete"
            ref={ref}
            component={VideoComplete}
            inputProps={{ decisions: complete }}
            durationInFrames={Math.max(1, dureeVideoComplete(complete))}
            fps={complete.fps}
            compositionWidth={LARGEUR}
            compositionHeight={HAUTEUR}
            controls
            style={style}
          />
        )}
        {dessin && (
          <TraceurZone key={JSON.stringify(dessin)} dessin={dessin} largeurMin={largeurMin} valider={validerDessin} onFin={onFinDessin} />
        )}
      </div>
    </section>
  );
};
```

- [ ] **Step 4 : Réécrire `studio/src/composants/Texte.tsx`**

```tsx
import { type FC, type MouseEvent, useEffect, useMemo, useState } from 'react';
import {
  ajouterChapitre, basculerCoupe, couperPassage, deplacerLimite, fusionnerChapitre, renommerChapitre,
} from '../../../noyau/edition';
import type { Ancrage } from '../../../noyau/consignes';
import { LIBELLES_NATURE } from '../../../noyau/elements';
import type { Analyse, Coupe, Montage, NatureElement, PositionTexte, TypeCoupe } from '../../../noyau/types';
import { textePrerempli } from '../logique/elements';
import { duree, horodatage } from '../logique/format';
import { construireTexte, type ElementTexte } from '../logique/texte';
import { ChoixPosition } from './ChoixPosition';

type Choix = { genre: 'mots'; debut: number; fin: number; rangs: [number, number] } | { genre: 'coupe'; id: string };

export interface SaisieTexte {
  texte: string;
  position: PositionTexte;
}

interface Props {
  analyse: Analyse;
  montage: Montage;
  texteMax: number;
  modifier: (f: (m: Montage) => Montage) => void;
  ecouter: (debut: number, fin: number) => void;
  lireDansApercu: (t: number) => void;
  consignerPassage: (a: Ancrage) => void;
  // Passage de mots choisi (ou null), pour « Recaler sur la sélection ».
  surSelection: (a: Ancrage | null) => void;
  // Crée un élément sur le passage ; renvoie le problème qui l'empêche, ou null.
  creerElement: (nature: NatureElement, a: Ancrage, saisie?: SaisieTexte) => string | null;
}

export const LIBELLES_COUPE: Record<TypeCoupe, string> = {
  silence: 'silence',
  hesitation: 'hésitation',
  repetition: 'répétition',
  prise: 'prise ratée',
  longueur: 'longueur',
  manuelle: 'coupe manuelle',
};

function classeCoupe(c: Coupe | null): string {
  if (!c) return '';
  return `${c.active ? 'coupe-active' : c.enAttente ? 'coupe-attente' : 'coupe-retablie'} type-${c.type}`;
}

// Texte horodaté : clic sur un mot ou un trou pour le choisir, glisser pour choisir un passage.
export const Texte: FC<Props> = props => {
  const { analyse, montage, texteMax, modifier, ecouter, lireDansApercu, consignerPassage, surSelection, creerElement } = props;
  const blocs = useMemo(() => construireTexte(analyse, montage), [analyse, montage]);
  const rangs = useMemo(() => new Map(analyse.mots.map((m, i) => [m.id, i])), [analyse]);
  const coupesDesMots = useMemo(() => {
    const carte = new Map<number, Coupe | null>();
    for (const b of blocs) for (const e of b.elements) if (e.genre === 'mot') carte.set(e.mot.id, e.coupe);
    return carte;
  }, [blocs]);
  const [choix, setChoix] = useState<Choix | null>(null);
  const [saisie, setSaisie] = useState<SaisieTexte | null>(null);
  const [alerte, setAlerte] = useState<string | null>(null);
  const coupe = choix?.genre === 'coupe' ? montage.coupes.find(c => c.id === choix.id) ?? null : null;
  const paroles = coupe ? analyse.detections.find(d => d.id === coupe.id)?.paroles : undefined;
  const ancrage = useMemo((): Ancrage | null => {
    if (choix?.genre !== 'mots') return null;
    const premier = analyse.mots[choix.rangs[0]];
    const dernier = analyse.mots[choix.rangs[1]];
    return premier && dernier ? { premierMot: premier.id, dernierMot: dernier.id } : null;
  }, [choix, analyse]);

  useEffect(() => {
    surSelection(ancrage);
    setSaisie(null);
    setAlerte(null);
  }, [ancrage, surSelection]);

  const choisirMots = (r1: number, r2: number) => {
    const [a, b] = r1 <= r2 ? [r1, r2] : [r2, r1];
    const premier = analyse.mots[a];
    const dernier = analyse.mots[b];
    if (premier && dernier) setChoix({ genre: 'mots', debut: premier.debut, fin: dernier.fin, rangs: [a, b] });
  };

  const choisir = (e: MouseEvent) => {
    const element = (n: Node | null) =>
      (n instanceof Element ? n : n?.parentElement)?.closest<HTMLElement>('[data-mot],[data-coupe]') ?? null;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) {
      const a = rangs.get(Number(element(selection.anchorNode)?.dataset.mot));
      const b = rangs.get(Number(element(selection.focusNode)?.dataset.mot));
      if (a !== undefined && b !== undefined) {
        choisirMots(a, b);
        return;
      }
    }
    const cible = element(e.target as Node);
    if (!cible) {
      setChoix(null);
    } else if (cible.dataset.coupe !== undefined) {
      setChoix({ genre: 'coupe', id: cible.dataset.coupe });
    } else {
      const id = Number(cible.dataset.mot);
      const c = coupesDesMots.get(id);
      const r = rangs.get(id);
      if (c) setChoix({ genre: 'coupe', id: c.id });
      else if (r !== undefined) choisirMots(r, r);
    }
  };

  const creer = (nature: NatureElement, s?: SaisieTexte) => {
    if (!ancrage) return;
    const probleme = creerElement(nature, ancrage, s);
    setAlerte(probleme);
    if (!probleme) setSaisie(null);
  };

  const estChoisi = (e: ElementTexte) => {
    if (choix?.genre === 'coupe') return (e.genre === 'trou' ? e.coupe.id : e.coupe?.id) === choix.id;
    if (choix?.genre === 'mots' && e.genre === 'mot') {
      const r = rangs.get(e.mot.id) ?? -1;
      return r >= choix.rangs[0] && r <= choix.rangs[1];
    }
    return false;
  };

  const rendreElement = (e: ElementTexte) =>
    e.genre === 'mot' ? (
      <span
        key={`m${e.mot.id}`}
        data-mot={e.mot.id}
        title={[e.terme, ...e.reperes.map(n => LIBELLES_NATURE[n])].filter(Boolean).join(' · ') || undefined}
        className={[
          'mot', classeCoupe(e.coupe), e.terme ? 'terme' : '', e.reperes[0] ? `repere repere-${e.reperes[0]}` : '',
          estChoisi(e) ? 'choisi' : '',
        ].join(' ')}
      >
        {e.mot.texte}{' '}
      </span>
    ) : (
      <span
        key={`c${e.coupe.id}`}
        data-coupe={e.coupe.id}
        className={['trou', classeCoupe(e.coupe), estChoisi(e) ? 'choisi' : ''].join(' ')}
      >
        {LIBELLES_COUPE[e.coupe.type]} {duree(e.coupe.fin - e.coupe.debut)}
      </span>
    );

  return (
    <>
      <div className="barre-selection">
        {!choix && <span className="discret">Cliquez un mot ou un passage coupé, ou sélectionnez un passage.</span>}
        {choix?.genre === 'mots' && (
          <>
            <span>{horodatage(choix.debut)} · {duree(choix.fin - choix.debut)}</span>
            <button onClick={() => { modifier(m => couperPassage(m, choix.debut, choix.fin)); setChoix(null); }}>Couper</button>
            <button onClick={() => ecouter(choix.debut, choix.fin)}>Écouter</button>
            <button onClick={() => lireDansApercu(choix.debut)}>Lire dans l’aperçu</button>
            <button onClick={() => modifier(m => ajouterChapitre(m, choix.debut, 'Nouveau chapitre'))}>Nouveau chapitre ici</button>
            <button onClick={() => { if (ancrage) consignerPassage(ancrage); }}>Donner une consigne sur ce passage</button>
            <button onClick={() => creer('zoom')}>Zoomer ici</button>
            <button onClick={() => creer('miseEnAvant')}>Mettre en avant</button>
            <button
              onClick={() => { if (ancrage) setSaisie({ texte: textePrerempli(analyse, ancrage, texteMax), position: 'haut-gauche' }); }}
            >
              Ajouter un texte
            </button>
            <button onClick={() => creer('camera')}>Caméra en grand</button>
            {saisie && (
              <span className="actions">
                <input
                  value={saisie.texte}
                  maxLength={texteMax}
                  aria-label="Texte à incruster"
                  onChange={e => setSaisie({ ...saisie, texte: e.target.value })}
                />
                <ChoixPosition valeur={saisie.position} onChange={position => setSaisie({ ...saisie, position })} />
                <button className="principal" onClick={() => creer('texte', saisie)}>Ajouter</button>
                <button onClick={() => setSaisie(null)}>Annuler</button>
              </span>
            )}
            {alerte && <span className="trop-long">{alerte}</span>}
          </>
        )}
        {coupe && (
          <>
            <span className={`type-${coupe.type}`}>{LIBELLES_COUPE[coupe.type]} · {duree(coupe.fin - coupe.debut)}</span>
            {paroles && <em>entendu : « {paroles} »</em>}
            {coupe.enAttente
              ? <span className="discret">à décider dans « Longueurs proposées »</span>
              : <button onClick={() => modifier(m => basculerCoupe(m, coupe.id))}>{coupe.active ? 'Rétablir' : 'Couper'}</button>}
            <button onClick={() => ecouter(coupe.debut, coupe.fin)}>Écouter le passage</button>
            <button onClick={() => lireDansApercu(coupe.debut)}>Lire dans l’aperçu</button>
          </>
        )}
      </div>
      <div>
        {blocs.map(b => (
          <section key={b.index}>
            <div className="chapitre">
              <span className="discret">{horodatage(b.debut)}</span>
              <input
                value={b.titre}
                aria-label={`Titre du chapitre ${b.index + 1}`}
                onChange={e => { const titre = e.target.value; modifier(m => renommerChapitre(m, b.index, titre)); }}
              />
              {b.debut > 0 && (
                <>
                  <button
                    disabled={choix?.genre !== 'mots'}
                    title="Fait commencer ce chapitre au passage choisi"
                    onClick={() => { if (choix?.genre === 'mots') modifier(m => deplacerLimite(m, b.index, choix.debut)); }}
                  >
                    Commencer ici
                  </button>
                  <button onClick={() => modifier(m => fusionnerChapitre(m, b.index))}>Fusionner avec le précédent</button>
                </>
              )}
            </div>
            <p onMouseUp={choisir}>{b.elements.map(rendreElement)}</p>
          </section>
        ))}
      </div>
    </>
  );
};
```

- [ ] **Step 5 : Brancher dans `studio/src/composants/EcranMontage.tsx`**

1. Remplacer les imports par :

```tsx
import { type FC, useMemo, useState } from 'react';
import { decisionsEpisodes, decisionsVideoComplete } from '../../../noyau/decisions';
import { passageEnTemps, tracerZoneProposition, type Ancrage } from '../../../noyau/consignes';
import { ajouterElement, modifierElement, prochainIdElement, type NouvelElement } from '../../../noyau/edition';
import { problemeDe } from '../../../noyau/elements';
import type { Montage, NatureElement, Zone } from '../../../noyau/types';
import { useEcoute } from '../ecoute';
import { imageEpisode, imageVideoComplete, positionDansParties } from '../logique/apercu';
import { useConsignes } from '../useConsignes';
import { type EtatEnregistrement, useMontage } from '../useMontage';
import { Apercu, type DemandeLecture, type Vue } from './Apercu';
import { BandeauSuggestions } from './BandeauSuggestions';
import { PanneauConsignes } from './PanneauConsignes';
import { PanneauLongueurs } from './PanneauLongueurs';
import { PanneauRendu } from './PanneauRendu';
import { PanneauTermes } from './PanneauTermes';
import { Texte, type SaisieTexte } from './Texte';
import type { Dessin } from './TraceurZone';
```

2. Remplacer les déclarations d'état et le `useMemo` des décisions (de `const [ancrage, setAncrage] = …` jusqu'à la fin du `useMemo`) par :

```tsx
  const [ancrage, setAncrage] = useState<Ancrage | null>(null);
  const [selection, setSelection] = useState<Ancrage | null>(null);
  const [dessin, setDessin] = useState<Dessin | null>(null);
  // Pendant le retracé d'une zone, l'aperçu montre l'image sans cet élément.
  const montageApercu = useMemo(() => {
    const cible = dessin?.cible;
    return montage && cible?.genre === 'element'
      ? { ...montage, elements: montage.elements.filter(e => e.id !== cible.id) }
      : montage;
  }, [montage, dessin]);
  const decisions = useMemo(
    () => (detail && montageApercu
      ? {
        episodes: decisionsEpisodes(detail.analyse, montageApercu, detail.reglages, detail.sourceUrl),
        complete: decisionsVideoComplete(detail.analyse, montageApercu, detail.reglages, detail.sourceUrl),
      }
      : null),
    [detail, montageApercu],
  );
```

3. Remplacer la fonction `lireDansApercu` par :

```tsx
  const lireDansApercu = (t: number, pause = false) => {
    const fps = detail.analyse.fps;
    const jeton = Date.now();
    if (vue === 'complete') {
      const p = positionDansParties(decisions.complete.parties, t, fps);
      if (p) setDemande({ image: imageVideoComplete(decisions.complete, p), jeton, pause });
      return;
    }
    const p = positionDansParties(decisions.episodes.map(e => e.partie), t, fps);
    const episode = p ? decisions.episodes[p.partie] : undefined;
    if (p && episode) {
      setVue(p.partie);
      setDemande({ image: imageEpisode(episode, p), jeton, pause });
    }
  };

  // Une création ou une retouche d'élément n'est enregistrée que si l'élément touché respecte les règles.
  const retoucher = (id: string, f: (m: Montage) => Montage): string | null => {
    const suivant = f(montage);
    if (suivant === montage) return null;
    const probleme = problemeDe(detail.analyse, suivant, id, detail.reglages);
    if (probleme) return probleme;
    modifier(() => suivant);
    return null;
  };
  const creer = (e: NouvelElement) => retoucher(prochainIdElement(montage), m => ajouterElement(m, e));

  const tracer = (d: Dessin) => {
    setDessin(d);
    lireDansApercu(d.debut, true);
  };

  const creerElement = (nature: NatureElement, a: Ancrage, saisie?: SaisieTexte): string | null => {
    const p = passageEnTemps(detail.analyse, a.premierMot, a.dernierMot);
    if (typeof p === 'string') return p;
    const commun = { debut: p.debut, fin: p.fin, statut: 'valide' as const };
    switch (nature) {
      case 'camera':
        return creer({ ...commun, nature });
      case 'texte':
        return saisie ? creer({ ...commun, nature, ...saisie }) : null;
      case 'zoom':
      case 'miseEnAvant':
        tracer({ nature, debut: p.debut, cible: { genre: 'nouveau', fin: p.fin } });
        return null;
    }
  };

  const fichierConsignes = consignes.fichier;
  const validerDessin = (d: Dessin, zone: Zone): string | null => {
    const cible = d.cible;
    switch (cible.genre) {
      case 'nouveau':
        return creer({ debut: d.debut, fin: cible.fin, statut: 'valide', nature: d.nature, zone });
      case 'element':
        return retoucher(cible.id, m => modifierElement(m, cible.id, { zone }));
      case 'proposition':
        consignes.enregistrer({
          ...fichierConsignes,
          consignes: fichierConsignes.consignes.map(c => (c.id === cible.idConsigne ? tracerZoneProposition(c, cible.indice, zone) : c)),
        });
        return null;
    }
  };
```

4. Dans `<Texte … />`, ajouter les props :

```tsx
          texteMax={detail.reglages.elements.texteMaxCaracteres}
          surSelection={setSelection}
          creerElement={creerElement}
```

5. Dans `<Apercu … />`, ajouter les props :

```tsx
          dessin={dessin}
          largeurMin={detail.reglages.elements.zoomLargeurMin}
          validerDessin={zone => (dessin ? validerDessin(dessin, zone) : null)}
          onFinDessin={() => setDessin(null)}
```

(`selection` et `tracer` servent aussi au panneau des éléments, tâche 12.)

- [ ] **Step 6 : Ajouter les styles à la fin de `studio/src/styles.css`**

```css
.repere { box-shadow: inset 0 -3px 0 var(--couleur-repere); }
.repere-zoom { --couleur-repere: #0ea5e9; }
.repere-miseEnAvant { --couleur-repere: #f59e0b; }
.repere-texte { --couleur-repere: #10b981; }
.repere-camera { --couleur-repere: #8b5cf6; }
.cadre-apercu { position: relative; }
.traceur { position: absolute; inset: 0; cursor: crosshair; background: rgba(0, 0, 0, 0.15); touch-action: none; }
.traceur-zone { position: absolute; border: 2px solid var(--rouge); background: rgba(255, 255, 255, 0.15); pointer-events: none; }
.traceur-barre { position: absolute; top: 6px; left: 6px; right: 6px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; background: rgba(255, 255, 255, 0.92); padding: 4px 8px; border-radius: 6px; cursor: default; font-size: 13px; }
```

- [ ] **Step 7 : Lancer la suite et la vérification de types**

Run: `npm test` puis `npm run typecheck`
Expected: PASS ; aucune erreur de type.

- [ ] **Step 8 : Essai rapide dans le studio**

Run: `npm run validation`, ouvrir http://127.0.0.1:5180 dans Chrome ou Edge, ouvrir un tournage analysé.

Vérifier :
1. Sélectionner un passage de plus d'une seconde : « Zoomer ici », « Mettre en avant », « Ajouter un texte », « Caméra en grand » apparaissent.
2. « Caméra en grand » : le passage est souligné en violet, l'aperçu montre la vignette agrandie à cet endroit.
3. « Ajouter un texte » : champ prérempli avec les mots (40 caractères au plus) et position ; « Ajouter » souligne le passage en vert ; un second texte à la même position sur le même passage affiche « Chevauche le texte e… » sans rien créer.
4. « Zoomer ici » : l'aperçu se met en pause au début du passage, le calque de tracé s'affiche ; le rectangle reste en 16:9 et ne descend pas sous 480 px de source ; « Annuler » ne crée rien ; « Valider » crée le zoom, visible dans l'aperçu.
5. Un mot seul (moins d'une seconde) → « Caméra en grand » affiche « Moins de 1 s à l’écran… » et ne crée rien.

- [ ] **Step 9 : Commit**

```bash
git add studio/src/composants/TraceurZone.tsx studio/src/composants/ChoixPosition.tsx studio/src/composants/Apercu.tsx studio/src/composants/Texte.tsx studio/src/composants/EcranMontage.tsx studio/src/styles.css
git commit -m "Studio : éléments créés depuis le texte, tracé de la zone dans l'aperçu, repères

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12 : Panneau « Éléments à l'écran », zone des propositions, mode d'emploi

**Files:**
- Create: `studio/src/composants/PanneauElements.tsx`
- Modify: `studio/src/composants/PanneauConsignes.tsx`
- Modify: `studio/src/composants/EcranMontage.tsx`
- Modify: `docs/studio.md`

**Interfaces:**
- Consumes: `problemesElements`, `LIBELLES_NATURE` (`noyau/elements.ts`) ; `modifierElement`, `supprimerElement`, `ChangementElement` ; `motsRecouverts`, `extraitPassage`, `passageEnTemps`, `zoneATracer`, `Operation` ; `elementsAffiches` ; `demandeUneZone` ; `ChoixPosition` ; `horodatage` ; `retoucher`, `tracer`, `selection` d'`EcranMontage` (tâche 11).
- Produces : `PanneauElements` ; prop `tracerProposition: (idConsigne: string, indice: number, operation: Operation) => void` de `PanneauConsignes`.

- [ ] **Step 1 : Créer `studio/src/composants/PanneauElements.tsx`**

```tsx
import { type FC, useEffect, useMemo, useState } from 'react';
import { extraitPassage, motsRecouverts, passageEnTemps, type Ancrage } from '../../../noyau/consignes';
import { modifierElement, supprimerElement, type ChangementElement } from '../../../noyau/edition';
import { LIBELLES_NATURE, problemesElements, type ReglagesElements } from '../../../noyau/elements';
import type { Analyse, ElementEcran, Montage, StatutElement } from '../../../noyau/types';
import { elementsAffiches } from '../logique/elements';
import { horodatage } from '../logique/format';
import { ChoixPosition } from './ChoixPosition';

interface Props {
  analyse: Analyse;
  montage: Montage;
  reglages: ReglagesElements;
  selection: Ancrage | null;
  // Applique la retouche si l'élément respecte les règles ; renvoie sinon le problème.
  retoucher: (id: string, f: (m: Montage) => Montage) => string | null;
  tracer: (e: ElementEcran) => void;
  ecouter: (debut: number, fin: number) => void;
  lireDansApercu: (t: number) => void;
}

const LIBELLES_STATUT: Record<StatutElement, string> = { 'a-valider': 'à valider', valide: 'validé', ecarte: 'écarté' };
const EXTRAIT_MAX = 50;

type ElementTexteIncruste = Extract<ElementEcran, { nature: 'texte' }>;

// Le texte n'est appliqué qu'en quittant le champ (ou avec Entrée) : un champ vidé pour être retapé n'est pas refusé.
const EditionTexte: FC<{ element: ElementTexteIncruste; max: number; changer: (c: ChangementElement) => void }> = ({
  element, max, changer,
}) => {
  const [brouillon, setBrouillon] = useState(element.texte);
  useEffect(() => setBrouillon(element.texte), [element.texte]);
  const appliquer = () => {
    if (brouillon !== element.texte) changer({ texte: brouillon });
  };
  return (
    <div className="actions">
      <input
        value={brouillon}
        maxLength={max}
        aria-label={`Texte de l’élément ${element.id}`}
        onChange={e => setBrouillon(e.target.value)}
        onBlur={appliquer}
        onKeyDown={e => { if (e.key === 'Enter') appliquer(); }}
      />
      <ChoixPosition valeur={element.position} onChange={position => changer({ position })} />
    </div>
  );
};

// Éléments non écartés, par ordre d'apparition ; chaque retouche passe par les règles.
export const PanneauElements: FC<Props> = props => {
  const { analyse, montage, reglages, selection } = props;
  const [refus, setRefus] = useState<{ id: string; probleme: string } | null>(null);
  const problemes = useMemo(() => problemesElements(analyse, montage, reglages), [analyse, montage, reglages]);
  const raisons = useMemo(
    () => new Map((analyse.suggestions?.elements ?? []).map(s => [s.id, s.raison])),
    [analyse],
  );
  const affiches = elementsAffiches(montage);
  const aValider = affiches.filter(e => e.statut === 'a-valider').length;

  const agir = (id: string, f: (m: Montage) => Montage) => {
    const probleme = props.retoucher(id, f);
    setRefus(probleme ? { id, probleme } : null);
  };

  return (
    <section className="panneau">
      <h3>Éléments à l’écran ({aValider} à valider)</h3>
      {affiches.length === 0 && (
        <p className="discret">Aucun élément. Sélectionnez un passage dans le texte pour zoomer, mettre en avant, incruster un texte ou passer la caméra en grand.</p>
      )}
      {affiches.map(e => {
        const mots = motsRecouverts(analyse, e);
        const raison = raisons.get(e.id);
        const aZone = e.nature === 'zoom' || e.nature === 'miseEnAvant';
        const sansZone = aZone && e.zone === null;
        const changer = (c: ChangementElement) => agir(e.id, m => modifierElement(m, e.id, c));
        const recaler = () => {
          if (!selection) return;
          const p = passageEnTemps(analyse, selection.premierMot, selection.dernierMot);
          if (typeof p === 'string') setRefus({ id: e.id, probleme: p });
          else changer({ debut: p.debut, fin: p.fin });
        };
        return (
          <div key={e.id} className="fiche">
            <div>
              <strong>{LIBELLES_NATURE[e.nature]}</strong>
              {' · '}
              <span className={e.statut === 'a-valider' ? 'trop-long' : 'discret'}>{LIBELLES_STATUT[e.statut]}</span>
              <span className="discret">
                {' · '}{horodatage(e.debut)} · {mots ? `« ${extraitPassage(analyse, mots, EXTRAIT_MAX)} »` : 'aucun mot'}
              </span>
            </div>
            {raison && <div className="discret">Suggéré : {raison}</div>}
            {sansZone && <div className="trop-long">Zone à tracer.</div>}
            {problemes.filter(p => p.id === e.id).map(p => <div key={p.probleme} className="trop-long">{p.probleme}</div>)}
            {e.nature === 'texte' && <EditionTexte element={e} max={reglages.elements.texteMaxCaracteres} changer={changer} />}
            {refus?.id === e.id && <div className="alerte">{refus.probleme}</div>}
            <div className="actions">
              {e.statut === 'a-valider' && (
                <>
                  <button disabled={sansZone} title={sansZone ? 'Tracez d’abord la zone' : undefined} onClick={() => changer({ statut: 'valide' })}>
                    Accepter
                  </button>
                  <button onClick={() => changer({ statut: 'ecarte' })}>Écarter</button>
                </>
              )}
              {aZone && <button onClick={() => props.tracer(e)}>{sansZone ? 'Tracer' : 'Retracer'}</button>}
              <button onClick={() => props.ecouter(e.debut, e.fin)}>Écouter</button>
              <button onClick={() => props.lireDansApercu(e.debut)}>Voir dans l’aperçu</button>
              <button disabled={!selection} title="Reprend le passage sélectionné dans le texte" onClick={recaler}>
                Recaler sur la sélection
              </button>
              <button onClick={() => agir(e.id, m => supprimerElement(m, e.id))}>Supprimer</button>
            </div>
          </div>
        );
      })}
    </section>
  );
};
```

- [ ] **Step 2 : Zone des propositions dans `studio/src/composants/PanneauConsignes.tsx`**

1. Remplacer l'import depuis `noyau/consignes` par :

```tsx
import {
  accepterPropositions, extraitPassage, indicesEnAttente, refuserPropositions, zoneATracer,
  type Ancrage, type Consigne, type EtatProposition, type FichierConsignes, type Operation, type ReglagesConsignes,
} from '../../../noyau/consignes';
```

et l'import depuis `../logique/consignes` par :

```tsx
import { bilan, demandeUneZone, passageDeProposition } from '../logique/consignes';
```

2. Dans `interface Props`, après `lireDansApercu: (t: number) => void;`, ajouter :

```tsx
  // Ouvre le tracé de la zone d'une proposition de zoom ou de mise en avant.
  tracerProposition: (idConsigne: string, indice: number, operation: Operation) => void;
```

3. Dans le rendu d'une proposition en attente, remplacer le bloc `<div className="actions"> … </div>` (celui qui contient « Accepter », « Refuser », « Écouter », « Voir dans l’aperçu ») par :

```tsx
                <div className="actions">
                  <button disabled={envoi || zoneATracer(p.operation)} onClick={() => decider(c, [i], true)}>Accepter</button>
                  <button disabled={envoi} onClick={() => decider(c, [i], false)}>Refuser</button>
                  {demandeUneZone(p.operation) && (
                    <button disabled={envoi} onClick={() => props.tracerProposition(c.id, i, p.operation)}>
                      {zoneATracer(p.operation) ? 'Tracer dans l’aperçu' : 'Retracer'}
                    </button>
                  )}
                  {zoneATracer(p.operation) && <span className="trop-long">Zone à tracer</span>}
                  {passage && (
                    <>
                      <button onClick={() => props.ecouter(passage.debut, passage.fin)}>Écouter</button>
                      <button onClick={() => props.lireDansApercu(passage.debut)}>Voir dans l’aperçu</button>
                    </>
                  )}
                </div>
```

(« Tout accepter » appelle `accepterPropositions`, qui laisse en attente une proposition dont la zone manque.)

- [ ] **Step 3 : Brancher dans `studio/src/composants/EcranMontage.tsx`**

1. Ajouter aux imports :

```tsx
import { PanneauElements } from './PanneauElements';
```

remplacer `import { passageEnTemps, tracerZoneProposition, type Ancrage } from '../../../noyau/consignes';` par :

```tsx
import { passageEnTemps, tracerZoneProposition, type Ancrage, type Operation } from '../../../noyau/consignes';
```

et remplacer `import type { Montage, NatureElement, Zone } from '../../../noyau/types';` par :

```tsx
import type { ElementEcran, Montage, NatureElement, Zone } from '../../../noyau/types';
```

2. Après la fonction `creerElement`, ajouter :

```tsx
  const tracerElement = (e: ElementEcran) => {
    if (e.nature === 'zoom' || e.nature === 'miseEnAvant') tracer({ nature: e.nature, debut: e.debut, cible: { genre: 'element', id: e.id } });
  };

  const tracerProposition = (idConsigne: string, indice: number, op: Operation) => {
    if (op.type !== 'ajouterElement' || (op.nature !== 'zoom' && op.nature !== 'miseEnAvant')) return;
    const p = passageEnTemps(detail.analyse, op.premierMot, op.dernierMot);
    if (typeof p !== 'string') tracer({ nature: op.nature, debut: p.debut, cible: { genre: 'proposition', idConsigne, indice } });
  };
```

3. Dans `<PanneauConsignes … />`, ajouter la prop `tracerProposition={tracerProposition}`.

4. Juste après `<PanneauConsignes … />`, insérer :

```tsx
        <PanneauElements
          analyse={detail.analyse}
          montage={montage}
          reglages={detail.reglages}
          selection={selection}
          retoucher={retoucher}
          tracer={tracerElement}
          ecouter={ecouter}
          lireDansApercu={lireDansApercu}
        />
```

- [ ] **Step 4 : Mode d'emploi dans `docs/studio.md`**

1. Dans « Écran de montage », remplacer la puce « Cliquer un mot ou sélectionner un passage à la souris : … » par :

```markdown
  - Cliquer un mot ou sélectionner un passage à la souris : le couper, l'écouter, le lire dans l'aperçu, y commencer un nouveau chapitre, y donner une consigne, y poser un élément à l’écran.
```

2. Dans « Consignes », dans la liste des opérations entre parenthèses, remplacer « modifier ou ajouter un terme, changer le titre » par « modifier ou ajouter un terme, changer le titre, poser, modifier ou retirer un élément à l’écran ».

3. Après la section « Consignes » (avant « Rendu »), ajouter :

```markdown
## Éléments à l’écran

Quatre éléments peuvent être posés sur la vidéo pendant un passage : un **zoom** sur une zone du partage d’écran, une **mise en avant** (le reste de l’image s’assombrit, la zone reçoit un cadre rouge), un **texte incrusté** court (URL, nom d’outil, raccourci clavier, chiffre clé ; 40 caractères au plus) et la **caméra en grand** (la vignette passe au centre, deux fois plus grande, l’écran derrière est flouté).

- **Depuis le texte** : sélectionner un passage, puis « Zoomer ici », « Mettre en avant », « Ajouter un texte » (prérempli avec les mots sélectionnés, position au choix) ou « Caméra en grand ». L’élément est créé directement, validé.
- **Tracer une zone** : pour un zoom ou une mise en avant, l’aperçu se met en pause au début du passage ; tirer un rectangle à la souris (en 16:9 pour un zoom, 480 pixels de large au moins), puis « Valider » ou « Annuler ».
- **Par une consigne** : « zoome ici », « affiche l’URL », « accepte les textes suggérés »… Claude ne voit pas l’image : une proposition de zoom ou de mise en avant affiche « Zone à tracer » ; « Tracer dans l’aperçu » ouvre le tracé, et « Accepter » n’est possible qu’une fois la zone tracée.
- **Suggestions de l’analyse** : Claude propose les textes à incruster et les moments où l’auteur désigne l’écran. Elles arrivent « à valider », avec leur raison ; une suggestion de zoom ou de mise en avant attend sa zone.

Le panneau **Éléments à l’écran** liste les éléments par ordre d’apparition : écouter, voir dans l’aperçu, accepter ou écarter une suggestion, tracer ou retracer la zone, modifier le texte et sa position, « Recaler sur la sélection » (reprend le passage sélectionné dans le texte), supprimer. Dans le texte, un soulignement de couleur repère les passages couverts (bleu : zoom, orange : mise en avant, vert : texte, violet : caméra), avec la nature au survol.

Règles vérifiées à chaque création ou retouche (un refus s’affiche sans rien modifier) : au moins 1 s à l’écran une fois les coupes retirées ; un seul zoom ou caméra en grand à la fois ; pas de mise en avant pendant un zoom ou la caméra en grand ; deux textes simultanés à des positions différentes ; pas de texte en haut à droite pendant un encart de définition placé en haut. Les textes ne se placent pas dans les coins bas (vignette caméra à gauche, logo à droite). La position de la vignette caméra dans la source se règle dans `reglages.json` (`camera`).
```

4. Dans « Rendu », remplacer « …aucune longueur n'est en attente et aucune proposition de consigne n'attend de décision. » par « …aucune longueur n'est en attente, aucune proposition de consigne n'attend de décision et aucun élément à l’écran n’est à valider ni en défaut. »

- [ ] **Step 5 : Lancer toute la suite et la vérification de types**

Run: `npm test` puis `npm run typecheck`, puis `cd pipeline; ..\.venv\Scripts\python -m pytest -q`
Expected: PASS ; aucune erreur de type.

- [ ] **Step 6 : Essai manuel complet sur le tournage d'essai (avec de vrais appels à Claude)**

Prérequis : `ANTHROPIC_API_KEY` définie (variable d’environnement ou `.env`), le tournage d'essai analysé dans `donnees/tournages/<dossier>`.

1. **Suggestions** : `cd pipeline; ..\.venv\Scripts\python -m mtpipeline.cli relancer-suggestions ..\donnees\tournages\<dossier>` ; la sortie compte « … éléments à l'écran proposés ». `analyse.json` contient `suggestions.elements` (ids `se0`…, pas de caméra, textes de 40 caractères au plus). Le studio ne reprend les suggestions que dans le montage initial : renommer `montage.json` en `montage.avant.json` le temps de l'essai (le remettre ensuite).
2. Run: `npm run validation`, ouvrir http://127.0.0.1:5180 dans Chrome ou Edge, ouvrir le tournage. Le panneau « Éléments à l’écran (n à valider) » liste les suggestions avec « Suggéré : … » ; « Valider et lancer le rendu » liste « n élément(s) à l’écran à valider. » et, pour un zoom suggéré, « Élément se… : La zone est à tracer. ».
3. Sur une suggestion de zoom : « Accepter » est grisé ; « Tracer » ouvre le tracé sur l'image sans l'élément ; après « Valider », « Accepter » passe l'élément en validé et le zoom apparaît dans l'aperçu, stable à travers les jump cuts, la vignette caméra reposée par-dessus.
4. Sur une suggestion de texte : modifier le texte (appliqué en quittant le champ) et la position ; « Écarter » la retire de la liste et du soulignement.
5. **Consigne** : sélectionner un passage, « Donner une consigne sur ce passage », envoyer « zoome ici » : la proposition affiche « Zone à tracer » et « Accepter » grisé ; « Tracer dans l’aperçu » → tracer → « Valider » ; « Retracer » remplace « Tracer dans l’aperçu » ; « Accepter » crée l'élément `e…`. Envoyer « affiche l’URL en haut à droite » (sur un passage où une URL est prononcée) puis « accepte les textes suggérés » : propositions `ajouterElement` texte et `modifierElement` statut `valide` ; accepter.
6. **Retouches** : « Recaler sur la sélection » après avoir sélectionné un autre passage ; un recalage sur un passage déjà couvert par un zoom, pour une caméra en grand, affiche le chevauchement et ne change rien ; « Supprimer » retire l'élément.
7. **Rendu** : régler les éléments restants, lancer le rendu ; dans `rendus/`, vérifier dans la vidéo complète et un épisode le zoom, la mise en avant, le texte, la caméra en grand, avec frise, logo et encarts au-dessus.
8. Remettre `montage.avant.json` en `montage.json` si besoin.

Noter tout écart et le corriger avant de valider.

- [ ] **Step 7 : Commit**

```bash
git add studio/src/composants/PanneauElements.tsx studio/src/composants/PanneauConsignes.tsx studio/src/composants/EcranMontage.tsx docs/studio.md
git commit -m "Studio : panneau des éléments à l'écran, zone des propositions, mode d'emploi

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Correspondance avec la spec

| Spec | Tâche |
|---|---|
| `montage.json` : `elements`, ids, lecture sans le champ | 1, 2 |
| `reglages.json` : `camera`, bornes `elements` | 1 |
| `analyse.json` : `suggestions.elements`, montage initial | 1, 7 |
| Rendu de chaque nature, frise/logo/encarts au-dessus | 8, 9 |
| Règles (fonction unique) | 3 ; utilisées en 3 (avant rendu), 5 (consignes), 11–12 (retouches) |
| Consignes : trois opérations, zone jamais fournie par Claude, « Zone à tracer », forme de `consignes.json`, prompt | 5, 6, 12 |
| Suggestions de l'analyse (prompt, `convertir`) | 7 |
| Studio : menu du texte, dessin de la zone | 11 |
| Studio : panneau, repères, contrôle avant rendu, mode d'emploi | 3, 10, 11, 12 |
| Remotion : décisions, `VideoMontee`, composants, calculs, démonstrations | 4, 8, 9 |
| Tests noyau, calculs, pipeline, studio, vérification visuelle, essai manuel | 1–12 |

Le compte des éléments à valider apparaît dans le titre du panneau « Éléments à l’écran » et dans les vérifications du rendu ; le bandeau des suggestions (`BandeauSuggestions`), qui ne s'affiche qu'en cas d'échec de Claude, n'est pas modifié.
