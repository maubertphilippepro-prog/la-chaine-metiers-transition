# Plan 4 — Consignes en langage naturel dans le studio : plan de mise en œuvre

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Depuis l'écran de montage, l'auteur écrit une consigne libre (éventuellement ancrée sur un passage) ; Claude la reformule et la traduit en opérations d'un vocabulaire fermé ; l'auteur accepte ou refuse chaque opération, rien ne change sans son accord.

**Architecture:** Le vocabulaire, la vérification des opérations, l'acceptation et le refus sont des fonctions pures dans `noyau/consignes.ts`, partagées par le serveur et l'interface. Le serveur (`studio/serveur/api.ts`) ajoute `POST`/`PUT /api/tournages/<nom>/consignes` et lit/écrit `consignes.json` ; l'appel à Claude (`studio/serveur/interpretation.ts`, `@anthropic-ai/sdk`, sortie structurée Zod) est injecté dans `ConfigApi` pour les tests. L'interface ajoute un panneau « Consignes » sous l'aperçu et une entrée « Donner une consigne sur ce passage » dans la barre de sélection du texte.

**Tech Stack:** Node 22, TypeScript 5, Vitest 3, React 19.3.0, Vite 7.3.7, `@anthropic-ai/sdk` (nouveau), `zod` (nouveau), `tsx`.

Spec de référence : `docs/superpowers/specs/2026-10-19-consignes-design.md`.

## Global Constraints

- La chaîne s'appelle **« PMT »** (projet personnel). Aucune mention d'organisation (employeur, pôle, client) dans le code, les textes affichés, le prompt ou la documentation.
- Texte visible, noms de domaine et prompt en français ; clés JSON en camelCase ; apostrophe typographique `’` dans les textes affichés.
- Claude n'utilise que le vocabulaire fermé : `couper`, `basculerCoupe`, `deciderLongueur`, `renommerChapitre`, `ajouterChapitre`, `deplacerChapitre`, `fusionnerChapitre`, `modifierTerme`, `ajouterTerme`, `titreVideo`. Ce qu'il ne peut pas traduire va dans `nonRealisable` avec la raison.
- Les passages sont désignés par numéros de mots (`Mot.id`, premier et dernier inclus) ; le studio convertit en temps (début du premier mot, fin du dernier). Un chapitre est désigné par le numéro de son premier mot, jamais par son rang.
- Chaque opération est vérifiée avant d'être montrée (en chaîne, chacune après application des précédentes) et de nouveau au moment de l'acceptation ; un échec à l'acceptation la passe `invalide` avec le problème.
- `consignes.json` vit dans le dossier du tournage, à côté de `montage.json` : absent = aucune consigne ; illisible = erreur explicite (409) à l'ouverture du tournage, sans écraser le fichier. Écriture atomique (`ecrireJson` : fichier temporaire unique puis `rename`).
- Pendant un rendu en cours ou en préparation, `POST` et `PUT` des consignes sont refusés (409), comme le montage.
- Une proposition `en-attente` bloque le rendu (« Consigne : n proposition(s) en attente. ») ; une `invalide` ne bloque pas.
- Modèle : `reglages.modeles.claude` (`claude-opus-5-5`), effort `medium`, repli serveur `fallbacks: "default"` avec l'en-tête `anthropic-beta: server-side-fallback-2026-07-01` (comme le pipeline Python).
- Aucun appel réel à Claude dans les tests automatiques.
- `analyse.json` n'est jamais modifié par le studio ; l'acceptation passe par `modifier()` de `useMontage` (enregistrement de `montage.json` inchangé).
- Le chemin du projet contient « & » : ne jamais utiliser `npx` ; passer par les scripts npm (`npm test -- <fichier>`, `npm run typecheck`).
- Chaque commit se termine par la ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Structure des fichiers

```
noyau/
  edition.ts (+ test)           + ajouterTerme, changerTitre
  consignes.ts (+ test)         vocabulaire, vérification, proposition en chaîne, acceptation, refus, forme de consignes.json
  verifications.ts (+ test)     + propositions en attente
studio/
  commun.ts                     DetailTournage.consignes
  serveur/
    consignes.ts                lecture de consignes.json, DemandeInterpretation, ErreurInterpretation
    interpretation.ts (+ test)  prompt, schéma Zod, appel à Claude
    api.ts (+ test)             routes POST/PUT consignes, consignes dans le détail, blocage du rendu
    principal.ts                branche interpreterConsigne
  src/
    api.ts                      donnerConsigne, enregistrerConsignes
    useConsignes.ts             état et enregistrement de consignes.json
    logique/consignes.ts (+ test)  passage d'une proposition, bilan
    composants/
      PanneauConsignes.tsx      nouveau panneau
      Texte.tsx                 « Donner une consigne sur ce passage »
      EcranMontage.tsx          branchement
      PanneauRendu.tsx          consignes dans les vérifications
    styles.css
docs/studio.md                  section « Consignes »
```

Données de test communes (fixture `fixtures/analyse-exemple.json`, 6 mots) :

| id | texte | debut | fin |
|---|---|---|---|
| 0 | Bonjour | 0.8 | 1.2 |
| 1 | à | 1.25 | 1.35 |
| 2 | tous. | 1.4 | 1.8 |
| 3 | Aujourd'hui, | 3.0 | 3.6 |
| 4 | le | 3.65 | 3.75 |
| 5 | SSO. | 3.8 | 4.3 |

---

### Task 1 : Vocabulaire et vérification des opérations

**Files:**
- Modify: `noyau/edition.ts`
- Modify: `noyau/edition.test.ts`
- Create: `noyau/consignes.ts`
- Test: `noyau/consignes.test.ts`

**Interfaces:**
- Consumes: `couperPassage`, `basculerCoupe`, `deciderLongueur`, `modifierTerme`, `ChangementTerme`, `renommerChapitre`, `deplacerLimite`, `fusionnerChapitre`, `ajouterChapitre` de `noyau/edition.ts` ; `Analyse`, `Coupe`, `Montage`, `Segment`, `StatutTerme`, `PositionEncart` de `noyau/types.ts`.
- Produces (utilisés par les tâches 2 à 6) :
  - `ajouterTerme(m: Montage, terme: string, definition: string, occurrences: number[]): Montage`
  - `changerTitre(m: Montage, titre: string): Montage`
  - `type Operation` (union discriminée sur `type`, voir le code), `type TypeOperation`, `type OperationExpliquee = Operation & { explication: string }`
  - `type EtatProposition = 'en-attente' | 'acceptee' | 'refusee' | 'invalide'`
  - `interface Proposition { operation: Operation; explication: string; etat: EtatProposition; probleme?: string }`
  - `interface Ancrage { premierMot: number; dernierMot: number }`
  - `interface Consigne { id; date; texte; ancrage: Ancrage | null; reformulation; nonRealisable: string[]; propositions: Proposition[] }`
  - `interface FichierConsignes { version: 1; consignes: Consigne[] }`
  - `interface ReponseConsigne { reformulation: string; operations: OperationExpliquee[]; nonRealisable: string[] }`
  - `interface ReglagesConsignes { definitionMaxCaracteres: number }`
  - `type Verification = { montage: Montage } | { probleme: string }`
  - `passageEnTemps(analyse: Analyse, premierMot: number, dernierMot: number): Segment | string`
  - `premierMotDuChapitre(analyse: Analyse, montage: Montage, index: number): number | null`
  - `motsRecouverts(analyse: Analyse, coupe: Coupe): Ancrage | null`
  - `extraitPassage(analyse: Analyse, ancrage: Ancrage, max?: number): string`
  - `verifierOperation(analyse: Analyse, montage: Montage, operation: Operation, reglages: ReglagesConsignes): Verification`

- [ ] **Step 1 : Écrire les tests de `ajouterTerme` et `changerTitre`**

Dans `noyau/edition.test.ts`, ajouter `ajouterTerme, changerTitre` à l'import depuis `./edition` (ordre alphabétique : `ajouterChapitre, ajouterTerme, basculerCoupe, changerTitre, couperPassage, …`), puis à la fin du fichier :

```ts
describe('ajouts des consignes', () => {
  it('ajoute un terme à valider, encart en bas, occurrences triées sans doublon', () => {
    expect(ajouterTerme(base, 'prompt', 'Consigne donnée à une IA.', [5, 1.2, 5]).termes[1]).toEqual({
      terme: 'prompt', definition: 'Consigne donnée à une IA.', occurrences: [1.2, 5], statut: 'a-valider', position: 'bas',
    });
  });
  it('ignore un terme déjà présent, sans tenir compte de la casse', () => {
    expect(ajouterTerme(base, 'sso', 'Autre.', [1])).toBe(base);
  });
  it('change le titre de la vidéo', () => {
    expect(changerTitre(base, 'Nouveau').titre).toBe('Nouveau');
    expect(changerTitre(base, 'Essai')).toBe(base);
  });
});
```

- [ ] **Step 2 : Lancer les tests, vérifier l'échec**

Run: `npm test -- noyau/edition.test.ts`
Expected: FAIL (`ajouterTerme` / `changerTitre` non exportés).

- [ ] **Step 3 : Implémenter dans `noyau/edition.ts`**

Ajouter après `modifierTerme` :

```ts
// Terme ajouté par une consigne : à valider, encart en bas ; ignoré s'il existe déjà (sans tenir compte de la casse).
export function ajouterTerme(m: Montage, terme: string, definition: string, occurrences: number[]): Montage {
  if (m.termes.some(t => t.terme.toLowerCase() === terme.toLowerCase())) return m;
  const triees = [...new Set(occurrences)].sort((a, b) => a - b);
  return { ...m, termes: [...m.termes, { terme, definition, occurrences: triees, statut: 'a-valider', position: 'bas' }] };
}
```

Ajouter à la fin du fichier :

```ts
export function changerTitre(m: Montage, titre: string): Montage {
  return titre === m.titre ? m : { ...m, titre };
}
```

- [ ] **Step 4 : Lancer les tests, vérifier le succès**

Run: `npm test -- noyau/edition.test.ts`
Expected: PASS.

- [ ] **Step 5 : Écrire les tests de `noyau/consignes.ts`**

Créer `noyau/consignes.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import exemple from '../fixtures/analyse-exemple.json';
import {
  extraitPassage, motsRecouverts, passageEnTemps, premierMotDuChapitre, verifierOperation, type Operation,
} from './consignes';
import type { Analyse, Montage } from './types';

const analyse = exemple as Analyse;
const reglages = { definitionMaxCaracteres: 160 };
const base: Montage = {
  version: 1,
  titre: 'Essai',
  coupes: [
    { id: 'd1', type: 'hesitation', debut: 1.8, fin: 3.0, active: true },
    { id: 'l0', type: 'longueur', debut: 3.0, fin: 3.8, active: false, enAttente: true },
  ],
  chapitres: [{ titre: 'Intro', debut: 0 }, { titre: 'Le SSO', debut: 3.0 }],
  termes: [{ terme: 'SSO', definition: 'Déf.', occurrences: [3.8], statut: 'a-valider', position: 'bas' }],
};

const verifier = (op: Operation, m: Montage = base) => verifierOperation(analyse, m, op, reglages);
const montageDe = (op: Operation, m: Montage = base): Montage => {
  const v = verifier(op, m);
  if (!('montage' in v)) throw new Error(v.probleme);
  return v.montage;
};
const probleme = (op: Operation, m: Montage = base) => {
  const v = verifier(op, m);
  return 'probleme' in v ? v.probleme : null;
};

describe('mots et temps', () => {
  it('convertit un passage en temps : début du premier mot, fin du dernier', () => {
    expect(passageEnTemps(analyse, 1, 2)).toEqual({ debut: 1.25, fin: 1.8 });
    expect(passageEnTemps(analyse, 4, 4)).toEqual({ debut: 3.65, fin: 3.75 });
  });
  it('refuse un mot hors de la transcription ou un passage à l’envers', () => {
    expect(passageEnTemps(analyse, 0, 9)).toBe('Le mot 9 n’existe pas dans la transcription.');
    expect(passageEnTemps(analyse, 2, 1)).toBe('Le passage 2 à 1 est à l’envers.');
  });
  it('donne le premier mot de chaque chapitre', () => {
    expect(premierMotDuChapitre(analyse, base, 0)).toBe(0);
    expect(premierMotDuChapitre(analyse, base, 1)).toBe(3);
    expect(premierMotDuChapitre(analyse, base, 2)).toBeNull();
  });
  it('donne les mots recouverts par une coupe', () => {
    expect(motsRecouverts(analyse, base.coupes[1]!)).toEqual({ premierMot: 3, dernierMot: 4 });
    expect(motsRecouverts(analyse, base.coupes[0]!)).toBeNull();
  });
  it('extrait le texte d’un passage, abrégé au-delà de la longueur maximale', () => {
    expect(extraitPassage(analyse, { premierMot: 0, dernierMot: 2 })).toBe('Bonjour à tous.');
    expect(extraitPassage(analyse, { premierMot: 0, dernierMot: 2 }, 10)).toBe('Bonjour à…');
  });
});

describe('coupes', () => {
  it('coupe un passage désigné par ses mots', () => {
    expect(montageDe({ type: 'couper', premierMot: 1, dernierMot: 2 }).coupes[2]).toEqual({
      id: 'm0', type: 'manuelle', debut: 1.25, fin: 1.8, active: true,
    });
    expect(probleme({ type: 'couper', premierMot: 3, dernierMot: 9 })).toBe('Le mot 9 n’existe pas dans la transcription.');
    expect(probleme({ type: 'couper', premierMot: 2, dernierMot: 1 })).toBe('Le passage 2 à 1 est à l’envers.');
  });
  it('rétablit une coupe, sauf inconnue ou longueur en attente', () => {
    expect(montageDe({ type: 'basculerCoupe', idCoupe: 'd1' }).coupes[0]!.active).toBe(false);
    expect(probleme({ type: 'basculerCoupe', idCoupe: 'x' })).toBe('La coupe x n’existe pas.');
    expect(probleme({ type: 'basculerCoupe', idCoupe: 'l0' })).toBe(
      'La coupe l0 est une longueur en attente : il faut l’accepter ou la refuser.',
    );
  });
  it('décide d’une longueur, pas d’une autre coupe', () => {
    expect(montageDe({ type: 'deciderLongueur', idCoupe: 'l0', accepter: true }).coupes[1]).toMatchObject({
      active: true, enAttente: false,
    });
    expect(probleme({ type: 'deciderLongueur', idCoupe: 'd1', accepter: true })).toBe(
      'La coupe d1 n’est pas une longueur proposée.',
    );
    expect(probleme({ type: 'deciderLongueur', idCoupe: 'x', accepter: false })).toBe('La coupe x n’existe pas.');
  });
});

describe('chapitres', () => {
  it('renomme le chapitre désigné par son premier mot', () => {
    expect(montageDe({ type: 'renommerChapitre', premierMotChapitre: 3, titre: 'SSO' }).chapitres[1]).toEqual({
      titre: 'SSO', debut: 3.0,
    });
    expect(probleme({ type: 'renommerChapitre', premierMotChapitre: 4, titre: 'X' })).toBe(
      'Aucun chapitre ne commence au mot 4.',
    );
    expect(probleme({ type: 'renommerChapitre', premierMotChapitre: 3, titre: '  ' })).toBe('Le titre est vide.');
  });
  it('ajoute un chapitre au début d’un mot', () => {
    expect(montageDe({ type: 'ajouterChapitre', premierMot: 5, titre: 'Fin' }).chapitres.map(c => c.debut)).toEqual([0, 3.0, 3.8]);
    expect(probleme({ type: 'ajouterChapitre', premierMot: 3, titre: 'X' })).toBe('Un chapitre commence déjà au mot 3.');
    expect(probleme({ type: 'ajouterChapitre', premierMot: 0, titre: 'X' })).toBe('Un chapitre commence déjà au mot 0.');
    expect(probleme({ type: 'ajouterChapitre', premierMot: 9, titre: 'X' })).toBe('Le mot 9 n’existe pas dans la transcription.');
    expect(probleme({ type: 'ajouterChapitre', premierMot: 5, titre: '' })).toBe('Le titre est vide.');
  });
  it('déplace le début d’un chapitre entre ses voisins, jamais le premier', () => {
    expect(montageDe({ type: 'deplacerChapitre', premierMotChapitre: 3, nouveauPremierMot: 5 }).chapitres[1]!.debut).toBe(3.8);
    expect(probleme({ type: 'deplacerChapitre', premierMotChapitre: 3, nouveauPremierMot: 0 })).toBe(
      'Le chapitre ne peut pas commencer au mot 0 : ce mot n’est pas entre le début du chapitre précédent et le chapitre suivant.',
    );
    expect(probleme({ type: 'deplacerChapitre', premierMotChapitre: 0, nouveauPremierMot: 1 })).toBe(
      'Le premier chapitre ne peut pas être déplacé.',
    );
    expect(probleme({ type: 'deplacerChapitre', premierMotChapitre: 3, nouveauPremierMot: 9 })).toBe(
      'Le mot 9 n’existe pas dans la transcription.',
    );
  });
  it('fusionne un chapitre avec le précédent, jamais le premier', () => {
    expect(montageDe({ type: 'fusionnerChapitre', premierMotChapitre: 3 }).chapitres).toEqual([{ titre: 'Intro', debut: 0 }]);
    expect(probleme({ type: 'fusionnerChapitre', premierMotChapitre: 0 })).toBe('Le premier chapitre ne peut pas être fusionné.');
  });
  it('désigne encore un chapitre par son premier mot après une fusion', () => {
    const trois = montageDe({ type: 'ajouterChapitre', premierMot: 5, titre: 'Fin' });
    const fusionne = montageDe({ type: 'fusionnerChapitre', premierMotChapitre: 3 }, trois);
    expect(montageDe({ type: 'renommerChapitre', premierMotChapitre: 5, titre: 'Conclusion' }, fusionne).chapitres).toEqual([
      { titre: 'Intro', debut: 0 }, { titre: 'Conclusion', debut: 3.8 },
    ]);
    expect(probleme({ type: 'renommerChapitre', premierMotChapitre: 3, titre: 'X' }, fusionne)).toBe(
      'Aucun chapitre ne commence au mot 3.',
    );
  });
});

describe('termes et titre', () => {
  it('modifie un terme existant', () => {
    expect(montageDe({ type: 'modifierTerme', terme: 'SSO', statut: 'valide', definition: 'Nouvelle.' }).termes[0]).toEqual({
      terme: 'SSO', definition: 'Nouvelle.', occurrences: [3.8], statut: 'valide', position: 'bas',
    });
    expect(montageDe({ type: 'modifierTerme', terme: 'SSO', position: 'haut' }).termes[0]!.position).toBe('haut');
    expect(probleme({ type: 'modifierTerme', terme: 'API', statut: 'valide' })).toBe('Le terme « API » n’existe pas.');
    expect(probleme({ type: 'modifierTerme', terme: 'SSO', definition: ' ' })).toBe('La définition est vide.');
    expect(probleme({ type: 'modifierTerme', terme: 'SSO', definition: 'x'.repeat(161) })).toBe(
      'La définition dépasse 160 caractères.',
    );
  });
  it('refuse une opération sans effet', () => {
    expect(probleme({ type: 'modifierTerme', terme: 'SSO', statut: 'a-valider' })).toBe(
      'Cette opération ne changerait rien au montage.',
    );
    expect(probleme({ type: 'titreVideo', titre: 'Essai' })).toBe('Cette opération ne changerait rien au montage.');
  });
  it('ajoute un terme aux mots où il est prononcé', () => {
    expect(montageDe({ type: 'ajouterTerme', terme: 'prompt', definition: 'Consigne.', mots: [5, 1] }).termes[1]).toEqual({
      terme: 'prompt', definition: 'Consigne.', occurrences: [1.25, 3.8], statut: 'a-valider', position: 'bas',
    });
    expect(probleme({ type: 'ajouterTerme', terme: 'sso', definition: 'D.', mots: [5] })).toBe('Le terme « sso » existe déjà.');
    expect(probleme({ type: 'ajouterTerme', terme: ' ', definition: 'D.', mots: [5] })).toBe('Le terme est vide.');
    expect(probleme({ type: 'ajouterTerme', terme: 'IA', definition: '', mots: [5] })).toBe('La définition est vide.');
    expect(probleme({ type: 'ajouterTerme', terme: 'IA', definition: 'D.', mots: [] })).toBe(
      'Aucun mot n’indique où le terme est prononcé.',
    );
    expect(probleme({ type: 'ajouterTerme', terme: 'IA', definition: 'D.', mots: [9] })).toBe(
      'Le mot 9 n’existe pas dans la transcription.',
    );
  });
  it('change le titre de la vidéo', () => {
    expect(montageDe({ type: 'titreVideo', titre: 'Le SSO expliqué' }).titre).toBe('Le SSO expliqué');
    expect(probleme({ type: 'titreVideo', titre: ' ' })).toBe('Le titre est vide.');
  });
  it('ne modifie pas le montage d’origine', () => {
    montageDe({ type: 'couper', premierMot: 1, dernierMot: 2 });
    expect(base.coupes).toHaveLength(2);
  });
});
```

- [ ] **Step 6 : Lancer les tests, vérifier l'échec**

Run: `npm test -- noyau/consignes.test.ts`
Expected: FAIL (module `./consignes` introuvable).

- [ ] **Step 7 : Implémenter `noyau/consignes.ts`**

```ts
import {
  ajouterChapitre, ajouterTerme, basculerCoupe, changerTitre, couperPassage, deciderLongueur, deplacerLimite,
  fusionnerChapitre, modifierTerme, renommerChapitre, type ChangementTerme,
} from './edition';
import type { Analyse, Coupe, Montage, Mot, PositionEncart, Segment, StatutTerme } from './types';

// Vocabulaire fermé des consignes. Les passages sont désignés par numéros de mots (Mot.id, bornes incluses),
// un chapitre par le numéro de son premier mot, pour rester stable après une fusion ou un ajout.
export type Operation =
  | { type: 'couper'; premierMot: number; dernierMot: number }
  | { type: 'basculerCoupe'; idCoupe: string }
  | { type: 'deciderLongueur'; idCoupe: string; accepter: boolean }
  | { type: 'renommerChapitre'; premierMotChapitre: number; titre: string }
  | { type: 'ajouterChapitre'; premierMot: number; titre: string }
  | { type: 'deplacerChapitre'; premierMotChapitre: number; nouveauPremierMot: number }
  | { type: 'fusionnerChapitre'; premierMotChapitre: number }
  | { type: 'modifierTerme'; terme: string; definition?: string; statut?: StatutTerme; position?: PositionEncart }
  | { type: 'ajouterTerme'; terme: string; definition: string; mots: number[] }
  | { type: 'titreVideo'; titre: string };

export type TypeOperation = Operation['type'];
export type OperationExpliquee = Operation & { explication: string };

export type EtatProposition = 'en-attente' | 'acceptee' | 'refusee' | 'invalide';

export interface Proposition {
  operation: Operation;
  explication: string;
  etat: EtatProposition;
  // Présent quand etat = 'invalide'.
  probleme?: string;
}

export interface Ancrage {
  premierMot: number;
  dernierMot: number;
}

export interface Consigne {
  id: string;
  // ISO 8601
  date: string;
  texte: string;
  ancrage: Ancrage | null;
  reformulation: string;
  nonRealisable: string[];
  propositions: Proposition[];
}

// consignes.json, dans le dossier du tournage.
export interface FichierConsignes {
  version: 1;
  consignes: Consigne[];
}

// Réponse structurée de Claude.
export interface ReponseConsigne {
  reformulation: string;
  operations: OperationExpliquee[];
  nonRealisable: string[];
}

export interface ReglagesConsignes {
  definitionMaxCaracteres: number;
}

export type Verification = { montage: Montage } | { probleme: string };

const TITRE_VIDE = 'Le titre est vide.';
const SANS_EFFET = 'Cette opération ne changerait rien au montage.';
const motInconnu = (id: number) => `Le mot ${id} n’existe pas dans la transcription.`;
const coupeInconnue = (id: string) => `La coupe ${id} n’existe pas.`;
const aucunChapitre = (id: number) => `Aucun chapitre ne commence au mot ${id}.`;

const motDe = (analyse: Analyse, id: number): Mot | undefined => analyse.mots.find(m => m.id === id);

export function passageEnTemps(analyse: Analyse, premierMot: number, dernierMot: number): Segment | string {
  const premier = motDe(analyse, premierMot);
  const dernier = motDe(analyse, dernierMot);
  if (!premier) return motInconnu(premierMot);
  if (!dernier) return motInconnu(dernierMot);
  if (dernierMot < premierMot) return `Le passage ${premierMot} à ${dernierMot} est à l’envers.`;
  return { debut: premier.debut, fin: dernier.fin };
}

// Premier mot qui commence dans le chapitre (comme dans le texte du studio) ; null pour un chapitre sans mot.
export function premierMotDuChapitre(analyse: Analyse, montage: Montage, index: number): number | null {
  const chapitre = montage.chapitres[index];
  if (!chapitre) return null;
  const fin = montage.chapitres[index + 1]?.debut ?? Infinity;
  return analyse.mots.find(m => m.debut >= chapitre.debut && m.debut < fin)?.id ?? null;
}

function indexChapitre(analyse: Analyse, montage: Montage, premierMot: number): number {
  return montage.chapitres.findIndex((_, i) => premierMotDuChapitre(analyse, montage, i) === premierMot);
}

// Mots dont le milieu est dans la coupe, comme dans le texte du studio ; null pour un blanc entre deux mots.
export function motsRecouverts(analyse: Analyse, coupe: Coupe): Ancrage | null {
  const mots = analyse.mots.filter(m => {
    const milieu = (m.debut + m.fin) / 2;
    return milieu >= coupe.debut && milieu <= coupe.fin;
  });
  const premier = mots[0];
  const dernier = mots[mots.length - 1];
  return premier && dernier ? { premierMot: premier.id, dernierMot: dernier.id } : null;
}

// Texte d'un passage, abrégé au-delà de `max` caractères.
export function extraitPassage(analyse: Analyse, ancrage: Ancrage, max = Infinity): string {
  const texte = analyse.mots
    .filter(m => m.id >= ancrage.premierMot && m.id <= ancrage.dernierMot)
    .map(m => m.texte)
    .join(' ');
  return texte.length > max ? `${texte.slice(0, max - 1).trimEnd()}…` : texte;
}

function problemeDefinition(definition: string, max: number): string | null {
  if (!definition.trim()) return 'La définition est vide.';
  if (definition.length > max) return `La définition dépasse ${max} caractères.`;
  return null;
}

// Montage modifié, ou la phrase qui explique pourquoi l'opération est impossible.
function appliquer(analyse: Analyse, m: Montage, op: Operation, r: ReglagesConsignes): Montage | string {
  switch (op.type) {
    case 'couper': {
      const p = passageEnTemps(analyse, op.premierMot, op.dernierMot);
      return typeof p === 'string' ? p : couperPassage(m, p.debut, p.fin);
    }
    case 'basculerCoupe': {
      const coupe = m.coupes.find(c => c.id === op.idCoupe);
      if (!coupe) return coupeInconnue(op.idCoupe);
      if (coupe.enAttente) return `La coupe ${op.idCoupe} est une longueur en attente : il faut l’accepter ou la refuser.`;
      return basculerCoupe(m, op.idCoupe);
    }
    case 'deciderLongueur': {
      const coupe = m.coupes.find(c => c.id === op.idCoupe);
      if (!coupe) return coupeInconnue(op.idCoupe);
      if (coupe.type !== 'longueur') return `La coupe ${op.idCoupe} n’est pas une longueur proposée.`;
      return deciderLongueur(m, op.idCoupe, op.accepter);
    }
    case 'renommerChapitre': {
      if (!op.titre.trim()) return TITRE_VIDE;
      const i = indexChapitre(analyse, m, op.premierMotChapitre);
      return i < 0 ? aucunChapitre(op.premierMotChapitre) : renommerChapitre(m, i, op.titre);
    }
    case 'ajouterChapitre': {
      if (!op.titre.trim()) return TITRE_VIDE;
      const mot = motDe(analyse, op.premierMot);
      if (!mot) return motInconnu(op.premierMot);
      if (indexChapitre(analyse, m, op.premierMot) >= 0) return `Un chapitre commence déjà au mot ${op.premierMot}.`;
      return ajouterChapitre(m, mot.debut, op.titre);
    }
    case 'deplacerChapitre': {
      const i = indexChapitre(analyse, m, op.premierMotChapitre);
      if (i < 0) return aucunChapitre(op.premierMotChapitre);
      if (i === 0) return 'Le premier chapitre ne peut pas être déplacé.';
      const mot = motDe(analyse, op.nouveauPremierMot);
      if (!mot) return motInconnu(op.nouveauPremierMot);
      const precedent = premierMotDuChapitre(analyse, m, i - 1);
      const deplace = precedent !== null && op.nouveauPremierMot > precedent ? deplacerLimite(m, i, mot.debut) : m;
      if (deplace === m) {
        return `Le chapitre ne peut pas commencer au mot ${op.nouveauPremierMot} : ce mot n’est pas entre le début du chapitre précédent et le chapitre suivant.`;
      }
      return deplace;
    }
    case 'fusionnerChapitre': {
      const i = indexChapitre(analyse, m, op.premierMotChapitre);
      if (i < 0) return aucunChapitre(op.premierMotChapitre);
      if (i === 0) return 'Le premier chapitre ne peut pas être fusionné.';
      return fusionnerChapitre(m, i);
    }
    case 'modifierTerme': {
      if (!m.termes.some(t => t.terme === op.terme)) return `Le terme « ${op.terme} » n’existe pas.`;
      const changement: ChangementTerme = {};
      if (op.definition !== undefined) {
        const p = problemeDefinition(op.definition, r.definitionMaxCaracteres);
        if (p) return p;
        changement.definition = op.definition;
      }
      if (op.statut !== undefined) changement.statut = op.statut;
      if (op.position !== undefined) changement.position = op.position;
      return modifierTerme(m, op.terme, changement);
    }
    case 'ajouterTerme': {
      if (!op.terme.trim()) return 'Le terme est vide.';
      if (m.termes.some(t => t.terme.toLowerCase() === op.terme.toLowerCase())) return `Le terme « ${op.terme} » existe déjà.`;
      const p = problemeDefinition(op.definition, r.definitionMaxCaracteres);
      if (p) return p;
      if (op.mots.length === 0) return 'Aucun mot n’indique où le terme est prononcé.';
      const occurrences: number[] = [];
      for (const id of op.mots) {
        const mot = motDe(analyse, id);
        if (!mot) return motInconnu(id);
        occurrences.push(mot.debut);
      }
      return ajouterTerme(m, op.terme, op.definition, occurrences);
    }
    case 'titreVideo':
      return op.titre.trim() ? changerTitre(m, op.titre) : TITRE_VIDE;
  }
}

// Vérifie une opération sur le montage donné : montage modifié, ou problème à afficher.
export function verifierOperation(analyse: Analyse, montage: Montage, operation: Operation, reglages: ReglagesConsignes): Verification {
  const resultat = appliquer(analyse, montage, operation, reglages);
  if (typeof resultat === 'string') return { probleme: resultat };
  if (JSON.stringify(resultat) === JSON.stringify(montage)) return { probleme: SANS_EFFET };
  return { montage: resultat };
}
```

- [ ] **Step 8 : Lancer les tests et la vérification de types**

Run: `npm test -- noyau/consignes.test.ts noyau/edition.test.ts` puis `npm run typecheck`
Expected: PASS ; aucune erreur de type.

- [ ] **Step 9 : Commit**

```bash
git add noyau/edition.ts noyau/edition.test.ts noyau/consignes.ts noyau/consignes.test.ts
git commit -m "Consignes : vocabulaire des opérations et vérification sur le montage

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2 : Propositions en chaîne, acceptation, refus et blocage du rendu

**Files:**
- Modify: `noyau/consignes.ts`
- Modify: `noyau/consignes.test.ts`
- Modify: `noyau/verifications.ts`
- Modify: `noyau/verifications.test.ts`

**Interfaces:**
- Consumes: tout ce que produit la tâche 1.
- Produces :
  - `proposer(analyse: Analyse, montage: Montage, operations: OperationExpliquee[], reglages: ReglagesConsignes): Proposition[]`
  - `accepterPropositions(analyse: Analyse, montage: Montage, consigne: Consigne, indices: number[], reglages: ReglagesConsignes): { montage: Montage; consigne: Consigne }`
  - `refuserPropositions(consigne: Consigne, indices: number[]): Consigne`
  - `indicesEnAttente(consigne: Consigne): number[]`
  - `propositionsEnAttente(consignes: Consigne[]): number`
  - `raisonFichierConsignes(v: unknown): string | null`
  - `verifierAvantRendu(m: Montage, definitionMax: number, consignes?: Consigne[]): string[]` (troisième paramètre ajouté, `[]` par défaut)

- [ ] **Step 1 : Écrire les tests**

Dans `noyau/consignes.test.ts`, compléter l'import depuis `./consignes` :

```ts
import {
  accepterPropositions, extraitPassage, indicesEnAttente, motsRecouverts, passageEnTemps, premierMotDuChapitre,
  propositionsEnAttente, proposer, raisonFichierConsignes, refuserPropositions, verifierOperation,
  type Consigne, type Operation, type OperationExpliquee,
} from './consignes';
```

et ajouter à la fin du fichier :

```ts
const OPERATIONS: OperationExpliquee[] = [
  { type: 'couper', premierMot: 1, dernierMot: 2, explication: 'Coupe « à tous ».' },
  { type: 'basculerCoupe', idCoupe: 'm0', explication: 'Rétablit la coupe qui vient d’être faite.' },
  { type: 'renommerChapitre', premierMotChapitre: 4, titre: 'X', explication: 'Renomme un chapitre.' },
];

const consigneDe = (operations: OperationExpliquee[]): Consigne => ({
  id: 'c1',
  date: '2026-10-19T10:00:00.000Z',
  texte: 'Coupe « à tous »',
  ancrage: null,
  reformulation: 'Couper « à tous ».',
  nonRealisable: [],
  propositions: proposer(analyse, base, operations, reglages),
});

describe('propositions', () => {
  it('vérifie les opérations en chaîne, chacune après les précédentes', () => {
    expect(proposer(analyse, base, OPERATIONS, reglages)).toEqual([
      { operation: { type: 'couper', premierMot: 1, dernierMot: 2 }, explication: 'Coupe « à tous ».', etat: 'en-attente' },
      { operation: { type: 'basculerCoupe', idCoupe: 'm0' }, explication: 'Rétablit la coupe qui vient d’être faite.', etat: 'en-attente' },
      {
        operation: { type: 'renommerChapitre', premierMotChapitre: 4, titre: 'X' },
        explication: 'Renomme un chapitre.',
        etat: 'invalide',
        probleme: 'Aucun chapitre ne commence au mot 4.',
      },
    ]);
  });
  it('n’enchaîne pas sur une opération invalide', () => {
    const p = proposer(analyse, base, [
      { type: 'ajouterChapitre', premierMot: 9, titre: 'X', explication: 'a' },
      { type: 'ajouterChapitre', premierMot: 5, titre: 'Fin', explication: 'b' },
    ], reglages);
    expect(p.map(x => x.etat)).toEqual(['invalide', 'en-attente']);
  });
  it('liste les propositions en attente', () => {
    const c = consigneDe(OPERATIONS);
    expect(indicesEnAttente(c)).toEqual([0, 1]);
    expect(propositionsEnAttente([c, c])).toBe(4);
  });
});

describe('acceptation et refus', () => {
  it('accepte en revérifiant sur le montage du moment', () => {
    const c = consigneDe(OPERATIONS);
    const seule = accepterPropositions(analyse, base, c, [1], reglages);
    expect(seule.montage).toBe(base);
    expect(seule.consigne.propositions[1]).toMatchObject({ etat: 'invalide', probleme: 'La coupe m0 n’existe pas.' });

    const r = accepterPropositions(analyse, base, c, [0], reglages);
    expect(r.montage.coupes.map(x => x.id)).toEqual(['d1', 'l0', 'm0']);
    expect(r.consigne.propositions.map(p => p.etat)).toEqual(['acceptee', 'en-attente', 'invalide']);
    expect(c.propositions[0]!.etat).toBe('en-attente');
  });
  it('accepte tout dans l’ordre', () => {
    const c = consigneDe(OPERATIONS);
    const r = accepterPropositions(analyse, base, c, indicesEnAttente(c), reglages);
    expect(r.montage.coupes.map(x => x.id)).toEqual(['d1', 'l0']);
    expect(r.consigne.propositions.map(p => p.etat)).toEqual(['acceptee', 'acceptee', 'invalide']);
  });
  it('refuse seulement les propositions en attente', () => {
    const c = consigneDe(OPERATIONS);
    expect(refuserPropositions(c, [0, 2]).propositions.map(p => p.etat)).toEqual(['refusee', 'en-attente', 'invalide']);
  });
});

describe('forme de consignes.json', () => {
  it('accepte un fichier valide', () => {
    expect(raisonFichierConsignes({ version: 1, consignes: [consigneDe(OPERATIONS)] })).toBeNull();
    expect(raisonFichierConsignes({ version: 1, consignes: [] })).toBeNull();
  });
  it('explique ce qui ne va pas', () => {
    expect(raisonFichierConsignes([])).toBe('objet attendu');
    expect(raisonFichierConsignes({ version: 2, consignes: [] })).toBe('version 1 attendue');
    expect(raisonFichierConsignes({ version: 1 })).toBe('consignes doit être une liste');
    expect(raisonFichierConsignes({ version: 1, consignes: [{ id: 'c1' }] })).toBe('chaque consigne doit avoir un id, un texte et des propositions');
    const c = consigneDe(OPERATIONS);
    const autre = { ...c, propositions: [{ ...c.propositions[0]!, operation: { type: 'supprimer' } }] };
    expect(raisonFichierConsignes({ version: 1, consignes: [autre] })).toBe('opération inconnue dans la consigne c1');
    const etat = { ...c, propositions: [{ ...c.propositions[0]!, etat: 'peut-etre' }] };
    expect(raisonFichierConsignes({ version: 1, consignes: [etat] })).toBe('état de proposition inconnu dans la consigne c1');
  });
});
```

Dans `noyau/verifications.test.ts`, ajouter l'import `import type { Consigne } from './consignes';` et à la fin du `describe` :

```ts
  it('bloque sur une proposition de consigne en attente, pas sur une invalide', () => {
    const consigne: Consigne = {
      id: 'c1',
      date: '2026-10-19T10:00:00.000Z',
      texte: 'Renomme',
      ancrage: null,
      reformulation: 'Renommer.',
      nonRealisable: [],
      propositions: [
        { operation: { type: 'titreVideo', titre: 'A' }, explication: 'a', etat: 'en-attente' },
        { operation: { type: 'titreVideo', titre: 'B' }, explication: 'b', etat: 'invalide', probleme: 'p' },
        { operation: { type: 'titreVideo', titre: 'C' }, explication: 'c', etat: 'acceptee' },
      ],
    };
    expect(verifierAvantRendu(pret, 160, [consigne])).toEqual(['Consigne : 1 proposition(s) en attente.']);
    expect(verifierAvantRendu(pret, 160, [{ ...consigne, propositions: consigne.propositions.slice(1) }])).toEqual([]);
  });
```

- [ ] **Step 2 : Lancer les tests, vérifier l'échec**

Run: `npm test -- noyau/consignes.test.ts noyau/verifications.test.ts`
Expected: FAIL (`proposer`, `accepterPropositions`… non exportés ; vérification sans consignes).

- [ ] **Step 3 : Implémenter dans `noyau/consignes.ts`**

Ajouter à la fin du fichier :

```ts
// À la réception : chaque opération est vérifiée sur le montage laissé par les précédentes valides.
export function proposer(
  analyse: Analyse, montage: Montage, operations: OperationExpliquee[], reglages: ReglagesConsignes,
): Proposition[] {
  let courant = montage;
  return operations.map(({ explication, ...reste }): Proposition => {
    const operation = reste as Operation;
    const v = verifierOperation(analyse, courant, operation, reglages);
    if ('probleme' in v) return { operation, explication, etat: 'invalide', probleme: v.probleme };
    courant = v.montage;
    return { operation, explication, etat: 'en-attente' };
  });
}

// Applique les propositions désignées, dans l'ordre, en revérifiant chacune sur le montage du moment.
export function accepterPropositions(
  analyse: Analyse, montage: Montage, consigne: Consigne, indices: number[], reglages: ReglagesConsignes,
): { montage: Montage; consigne: Consigne } {
  let courant = montage;
  const propositions = [...consigne.propositions];
  for (const i of indices) {
    const p = propositions[i];
    if (!p || p.etat !== 'en-attente') continue;
    const v = verifierOperation(analyse, courant, p.operation, reglages);
    if ('probleme' in v) {
      propositions[i] = { ...p, etat: 'invalide', probleme: v.probleme };
    } else {
      courant = v.montage;
      propositions[i] = { ...p, etat: 'acceptee' };
    }
  }
  return { montage: courant, consigne: { ...consigne, propositions } };
}

export function refuserPropositions(consigne: Consigne, indices: number[]): Consigne {
  return {
    ...consigne,
    propositions: consigne.propositions.map((p, i): Proposition => (indices.includes(i) && p.etat === 'en-attente' ? { ...p, etat: 'refusee' } : p)),
  };
}

export function indicesEnAttente(consigne: Consigne): number[] {
  return consigne.propositions.flatMap((p, i) => (p.etat === 'en-attente' ? [i] : []));
}

export function propositionsEnAttente(consignes: Consigne[]): number {
  return consignes.reduce((total, c) => total + indicesEnAttente(c).length, 0);
}

const TYPES_OPERATION: Record<TypeOperation, true> = {
  couper: true,
  basculerCoupe: true,
  deciderLongueur: true,
  renommerChapitre: true,
  ajouterChapitre: true,
  deplacerChapitre: true,
  fusionnerChapitre: true,
  modifierTerme: true,
  ajouterTerme: true,
  titreVideo: true,
};
const ETATS: EtatProposition[] = ['en-attente', 'acceptee', 'refusee', 'invalide'];

function estObjet(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// Contrôle de forme de consignes.json (lecture et enregistrement depuis le studio).
export function raisonFichierConsignes(v: unknown): string | null {
  if (!estObjet(v)) return 'objet attendu';
  if (v.version !== 1) return 'version 1 attendue';
  if (!Array.isArray(v.consignes)) return 'consignes doit être une liste';
  for (const c of v.consignes) {
    if (!estObjet(c) || typeof c.id !== 'string' || typeof c.texte !== 'string' || !Array.isArray(c.propositions)) {
      return 'chaque consigne doit avoir un id, un texte et des propositions';
    }
    for (const p of c.propositions) {
      const type = estObjet(p) && estObjet(p.operation) ? p.operation.type : undefined;
      if (typeof type !== 'string' || !Object.hasOwn(TYPES_OPERATION, type)) return `opération inconnue dans la consigne ${c.id}`;
      if (!ETATS.includes((p as Record<string, unknown>).etat as EtatProposition)) {
        return `état de proposition inconnu dans la consigne ${c.id}`;
      }
    }
  }
  return null;
}
```

- [ ] **Step 4 : Implémenter dans `noyau/verifications.ts`**

Remplacer le fichier par :

```ts
import { propositionsEnAttente, type Consigne } from './consignes';
import type { Montage } from './types';

// Conditions du rendu final (spec §7) : chaque problème est une phrase affichée telle quelle.
export function verifierAvantRendu(m: Montage, definitionMax: number, consignes: Consigne[] = []): string[] {
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
  const propositions = propositionsEnAttente(consignes);
  if (propositions > 0) problemes.push(`Consigne : ${propositions} proposition(s) en attente.`);
  return problemes;
}
```

- [ ] **Step 5 : Lancer les tests et la vérification de types**

Run: `npm test -- noyau/` puis `npm run typecheck`
Expected: PASS ; aucune erreur de type. (Si `Object.hasOwn` n'est pas reconnu par la cible ES2022, il l'est : ES2022 l'inclut.)

- [ ] **Step 6 : Commit**

```bash
git add noyau/consignes.ts noyau/consignes.test.ts noyau/verifications.ts noyau/verifications.test.ts
git commit -m "Consignes : propositions vérifiées en chaîne, acceptation, refus, blocage du rendu

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3 : Routes des consignes dans le serveur du studio

**Files:**
- Create: `studio/serveur/consignes.ts`
- Modify: `studio/commun.ts`
- Modify: `studio/serveur/api.ts`
- Modify: `studio/serveur/api.test.ts`

**Interfaces:**
- Consumes: `proposer`, `passageEnTemps`, `raisonFichierConsignes`, `Ancrage`, `Consigne`, `FichierConsignes`, `ReponseConsigne` (`noyau/consignes.ts`) ; `verifierAvantRendu(m, max, consignes)` (`noyau/verifications.ts`).
- Produces :
  - `studio/serveur/consignes.ts` : `interface DemandeInterpretation { analyse: Analyse; montage: Montage; texte: string; ancrage: Ancrage | null; definitionMax: number; modele: string }`, `type InterpreterConsigne = (d: DemandeInterpretation) => Promise<ReponseConsigne>`, `class ErreurInterpretation extends Error { statut: 500 | 503 }`, `lireConsignes(dossier: string): Promise<FichierConsignes>`
  - `ConfigApi.interpreterConsigne: InterpreterConsigne`
  - `DetailTournage.consignes: FichierConsignes`
  - `POST /api/tournages/<nom>/consignes` corps `{ texte: string, ancrage: Ancrage | null }` → 200 `Consigne`
  - `PUT /api/tournages/<nom>/consignes` corps `FichierConsignes` → 200 `{ ok: true }`

- [ ] **Step 1 : Créer `studio/serveur/consignes.ts`**

```ts
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { raisonFichierConsignes, type Ancrage, type FichierConsignes, type ReponseConsigne } from '../../noyau/consignes';
import type { Analyse, Montage } from '../../noyau/types';

// Ce qu'il faut à Claude pour interpréter une consigne.
export interface DemandeInterpretation {
  analyse: Analyse;
  montage: Montage;
  texte: string;
  ancrage: Ancrage | null;
  definitionMax: number;
  modele: string;
}

export type InterpreterConsigne = (d: DemandeInterpretation) => Promise<ReponseConsigne>;

// Échec de l'appel à Claude, avec le statut HTTP renvoyé au studio (503 : réessayer plus tard).
export class ErreurInterpretation extends Error {
  constructor(readonly statut: 500 | 503, message: string) {
    super(message);
  }
}

// Absent : aucune consigne. Illisible ou invalide : erreur, et le fichier n'est pas touché.
export async function lireConsignes(dossier: string): Promise<FichierConsignes> {
  const chemin = path.join(dossier, 'consignes.json');
  if (!existsSync(chemin)) return { version: 1, consignes: [] };
  const libelle = `${path.basename(dossier)}/consignes.json`;
  let valeur: unknown;
  try {
    valeur = JSON.parse(await readFile(chemin, 'utf-8'));
  } catch (e) {
    throw new Error(`${libelle} illisible : ${e instanceof Error ? e.message : String(e)}`);
  }
  const probleme = raisonFichierConsignes(valeur);
  if (probleme) throw new Error(`${libelle} invalide : ${probleme}`);
  return valeur as FichierConsignes;
}
```

- [ ] **Step 2 : Ajouter les consignes au détail dans `studio/commun.ts`**

Ajouter l'import `import type { FichierConsignes } from '../noyau/consignes';` et, dans `DetailTournage`, après `montageEnregistre: boolean;` :

```ts
  // consignes.json, ou aucune consigne tant qu'il n'existe pas.
  consignes: FichierConsignes;
```

- [ ] **Step 3 : Écrire les tests de l'API**

Dans `studio/serveur/api.test.ts` :

1. Ajouter les imports :

```ts
import type { FichierConsignes, ReponseConsigne } from '../../noyau/consignes';
import { ErreurInterpretation } from './consignes';
```

2. Après `const EN_VALIDATION = …`, ajouter :

```ts
const REPONSE: ReponseConsigne = {
  reformulation: 'Couper la salutation.',
  operations: [
    { type: 'couper', premierMot: 0, dernierMot: 2, explication: 'Coupe « Bonjour à tous. ».' },
    { type: 'renommerChapitre', premierMotChapitre: 4, titre: 'X', explication: 'Renomme un chapitre.' },
  ],
  nonRealisable: ['Ajouter une musique : aucune opération ne le permet.'],
};
const EN_ATTENTE: FichierConsignes = {
  version: 1,
  consignes: [{
    id: 'c1',
    date: '2026-10-19T10:00:00.000Z',
    texte: 'Coupe la salutation',
    ancrage: null,
    reformulation: 'Couper la salutation.',
    nonRealisable: [],
    propositions: [{ operation: { type: 'couper', premierMot: 0, dernierMot: 2 }, explication: 'Coupe.', etat: 'en-attente' }],
  }],
};
```

3. Après `const demanderRendu = …`, ajouter :

```ts
const donnerConsigne = (nom: string, corps: unknown) =>
  fetch(`${url}/api/tournages/${nom}/consignes`, { method: 'POST', headers: json, body: JSON.stringify(corps) });
const envoyerConsignes = (nom: string, fichier: unknown) =>
  fetch(`${url}/api/tournages/${nom}/consignes`, { method: 'PUT', headers: json, body: JSON.stringify(fichier) });
```

4. Dans `beforeEach`, ajouter à `config` après `relancerSuggestions` :

```ts
    interpreterConsigne: vi.fn<ConfigApi['interpreterConsigne']>(async () => REPONSE),
```

5. Dans `describe('détail d’un tournage')`, dans le premier test, ajouter :

```ts
    expect(d.consignes).toEqual({ version: 1, consignes: [] });
```

et ajouter les tests :

```ts
  it('renvoie les consignes enregistrées', async () => {
    await tournage('a', { 'analyse.json': exemple, 'consignes.json': EN_ATTENTE });
    expect((await (await fetch(`${url}/api/tournages/a`)).json()).consignes).toEqual(EN_ATTENTE);
  });
  it('signale un consignes.json illisible sans le réécrire', async () => {
    const d = await tournage('a', { 'analyse.json': exemple });
    await writeFile(path.join(d, 'consignes.json'), '{ pas du json', 'utf-8');
    const r = await fetch(`${url}/api/tournages/a`);
    expect(r.status).toBe(409);
    expect((await r.json()).erreur).toContain('a/consignes.json illisible');
    expect((await donnerConsigne('a', { texte: 'Coupe', ancrage: null })).status).toBe(409);
    expect(config.interpreterConsigne).not.toHaveBeenCalled();
    expect(await readFile(path.join(d, 'consignes.json'), 'utf-8')).toBe('{ pas du json');
  });
```

6. Dans `describe('rendu')`, ajouter :

```ts
  it('refuse le rendu tant qu’une proposition de consigne est en attente', async () => {
    await tournage('a', { 'analyse.json': exemple, 'montage.json': MONTAGE_PRET, 'consignes.json': EN_ATTENTE });
    const r = await demanderRendu('a', 'tout');
    expect(r.status).toBe(422);
    expect((await r.json()).problemes).toEqual(['Consigne : 1 proposition(s) en attente.']);
  });
```

7. À la fin du fichier, ajouter :

```ts
describe('consignes', () => {
  it('interprète une consigne, vérifie les propositions et l’enregistre', async () => {
    const d = await tournage('a', { 'analyse.json': exemple });
    const r = await donnerConsigne('a', { texte: '  Coupe la salutation ', ancrage: { premierMot: 0, dernierMot: 2 } });
    expect(r.status).toBe(200);
    const consigne = await r.json();
    expect(consigne).toMatchObject({
      texte: 'Coupe la salutation',
      ancrage: { premierMot: 0, dernierMot: 2 },
      reformulation: 'Couper la salutation.',
      nonRealisable: ['Ajouter une musique : aucune opération ne le permet.'],
      propositions: [
        { operation: { type: 'couper', premierMot: 0, dernierMot: 2 }, explication: 'Coupe « Bonjour à tous. ».', etat: 'en-attente' },
        {
          operation: { type: 'renommerChapitre', premierMotChapitre: 4, titre: 'X' },
          explication: 'Renomme un chapitre.',
          etat: 'invalide',
          probleme: 'Aucun chapitre ne commence au mot 4.',
        },
      ],
    });
    expect(typeof consigne.id).toBe('string');
    expect(Number.isNaN(Date.parse(consigne.date))).toBe(false);
    expect(await lire(path.join(d, 'consignes.json'))).toEqual({ version: 1, consignes: [consigne] });
    expect(config.interpreterConsigne).toHaveBeenCalledWith(expect.objectContaining({
      texte: 'Coupe la salutation',
      ancrage: { premierMot: 0, dernierMot: 2 },
      definitionMax: 160,
      modele: 'claude-opus-5-5',
    }));
    const demande = vi.mocked(config.interpreterConsigne).mock.calls[0]![0];
    expect(demande.analyse.mots).toHaveLength(6);
    expect(demande.montage.chapitres[0]).toEqual({ titre: 'Introduction', debut: 0 });
  });
  it('ajoute la consigne à celles déjà enregistrées', async () => {
    const d = await tournage('a', { 'analyse.json': exemple, 'consignes.json': EN_ATTENTE });
    expect((await donnerConsigne('a', { texte: 'Coupe', ancrage: null })).status).toBe(200);
    expect((await lire(path.join(d, 'consignes.json'))).consignes.map((c: { texte: string }) => c.texte)).toEqual([
      'Coupe la salutation', 'Coupe',
    ]);
  });
  it('refuse une consigne vide ou un ancrage hors de la transcription', async () => {
    await tournage('a', { 'analyse.json': exemple });
    expect((await donnerConsigne('a', { texte: '  ', ancrage: null })).status).toBe(400);
    const r = await donnerConsigne('a', { texte: 'Coupe', ancrage: { premierMot: 0, dernierMot: 99 } });
    expect(r.status).toBe(400);
    expect((await r.json()).erreur).toContain('Le mot 99 n’existe pas');
    expect((await donnerConsigne('a', { texte: 'Coupe', ancrage: { premierMot: 'a' } })).status).toBe(400);
    expect(config.interpreterConsigne).not.toHaveBeenCalled();
  });
  it('signale l’échec de Claude sans rien enregistrer', async () => {
    const d = await tournage('a', { 'analyse.json': exemple });
    vi.mocked(config.interpreterConsigne).mockRejectedValueOnce(
      new ErreurInterpretation(503, 'Limite de requêtes de l’API Claude atteinte, réessayez plus tard.'),
    );
    const r = await donnerConsigne('a', { texte: 'Coupe', ancrage: null });
    expect(r.status).toBe(503);
    expect((await r.json()).erreur).toBe('Limite de requêtes de l’API Claude atteinte, réessayez plus tard.');
    vi.mocked(config.interpreterConsigne).mockRejectedValueOnce(new Error('panne'));
    const r2 = await donnerConsigne('a', { texte: 'Coupe', ancrage: null });
    expect(r2.status).toBe(500);
    expect((await r2.json()).erreur).toContain('panne');
    await expect(readFile(path.join(d, 'consignes.json'), 'utf-8')).rejects.toThrow();
  });
  it('enregistre les consignes après une acceptation ou un refus', async () => {
    const d = await tournage('a', { 'analyse.json': exemple });
    expect((await envoyerConsignes('a', EN_ATTENTE)).status).toBe(200);
    expect(await lire(path.join(d, 'consignes.json'))).toEqual(EN_ATTENTE);
    const r = await envoyerConsignes('a', { version: 1 });
    expect(r.status).toBe(400);
    expect((await r.json()).erreur).toContain('consignes doit être une liste');
  });
  it('refuse les consignes pendant un rendu', async () => {
    let finir!: () => void;
    vi.mocked(config.rendre).mockImplementationOnce(() => new Promise(r => { finir = () => r([]); }));
    await tournage('a', { 'analyse.json': exemple, 'montage.json': MONTAGE_PRET });
    expect((await demanderRendu('a', 'tout')).status).toBe(202);
    expect((await donnerConsigne('a', { texte: 'Coupe', ancrage: null })).status).toBe(409);
    expect((await envoyerConsignes('a', EN_ATTENTE)).status).toBe(409);
    expect(config.interpreterConsigne).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(finir).toBeTypeOf('function'));
    finir();
  });
});
```

- [ ] **Step 4 : Lancer les tests, vérifier l'échec**

Run: `npm test -- studio/serveur/api.test.ts`
Expected: FAIL (route inconnue 404, `consignes` absent du détail, rendu non bloqué).

- [ ] **Step 5 : Implémenter dans `studio/serveur/api.ts`**

1. Imports : ajouter

```ts
import { passageEnTemps, proposer, raisonFichierConsignes, type Ancrage, type Consigne, type FichierConsignes, type ReponseConsigne } from '../../noyau/consignes';
import { ErreurInterpretation, lireConsignes, type InterpreterConsigne } from './consignes';
```

2. Dans `ConfigApi`, après `relancerSuggestions` :

```ts
  // Appel à Claude, injecté pour les tests.
  interpreterConsigne: InterpreterConsigne;
```

3. Après `lireCible`, ajouter :

```ts
function lireDemandeConsigne(corps: unknown): { texte: string; ancrage: Ancrage | null } {
  const c = corps && typeof corps === 'object' ? (corps as Record<string, unknown>) : {};
  const texte = typeof c.texte === 'string' ? c.texte.trim() : '';
  if (!texte) throw new ErreurHttp(400, 'La consigne est vide.');
  if (c.ancrage === null || c.ancrage === undefined) return { texte, ancrage: null };
  const a = typeof c.ancrage === 'object' ? (c.ancrage as Record<string, unknown>) : {};
  if (!Number.isInteger(a.premierMot) || !Number.isInteger(a.dernierMot)) {
    throw new ErreurHttp(400, 'ancrage attendu : { premierMot, dernierMot } ou null.');
  }
  return { texte, ancrage: { premierMot: a.premierMot as number, dernierMot: a.dernierMot as number } };
}
```

4. Dans `creerApi`, après la fonction `charger`, ajouter :

```ts
  async function consignesDe(dossier: string): Promise<FichierConsignes> {
    try {
      return await lireConsignes(dossier);
    } catch (e) {
      throw new ErreurHttp(409, message(e));
    }
  }
```

5. Dans `detail`, après `montageEnregistre: …,` ajouter `consignes: await consignesDe(dossier),`.

6. Après `enregistrerMontage`, ajouter :

```ts
  // Claude traduit la consigne ; les propositions sont vérifiées en chaîne sur le montage enregistré.
  async function donnerConsigne(req: IncomingMessage, dossier: string): Promise<Consigne> {
    verifierMontageModifiable(dossier);
    const { texte, ancrage } = lireDemandeConsigne(await lireCorps(req));
    const t = await charger(dossier, true);
    if (ancrage) {
      const passage = passageEnTemps(t.analyse, ancrage.premierMot, ancrage.dernierMot);
      if (typeof passage === 'string') throw new ErreurHttp(400, `ancrage invalide : ${passage}`);
    }
    await consignesDe(dossier);
    let reponse: ReponseConsigne;
    try {
      reponse = await c.interpreterConsigne({
        analyse: t.analyse,
        montage: t.montage,
        texte,
        ancrage,
        definitionMax: t.reglages.definitionMaxCaracteres,
        modele: t.reglages.modeles.claude,
      });
    } catch (e) {
      if (e instanceof ErreurInterpretation) throw new ErreurHttp(e.statut, e.message);
      throw new ErreurHttp(500, `Interprétation de la consigne impossible : ${message(e)}`);
    }
    verifierMontageModifiable(dossier);
    const consigne: Consigne = {
      id: randomUUID(),
      date: new Date().toISOString(),
      texte,
      ancrage,
      reformulation: reponse.reformulation,
      nonRealisable: reponse.nonRealisable,
      propositions: proposer(t.analyse, t.montage, reponse.operations, t.reglages),
    };
    // Relu après l'appel : une acceptation a pu être enregistrée entre-temps.
    const fichier = await consignesDe(dossier);
    await ecrireJson(path.join(dossier, 'consignes.json'), { ...fichier, consignes: [...fichier.consignes, consigne] });
    return consigne;
  }

  async function enregistrerConsignes(req: IncomingMessage, dossier: string): Promise<void> {
    verifierMontageModifiable(dossier);
    const fichier = await lireCorps(req);
    verifierMontageModifiable(dossier);
    const probleme = raisonFichierConsignes(fichier);
    if (probleme) throw new ErreurHttp(400, `consignes invalides : ${probleme}`);
    await ecrireJson(path.join(dossier, 'consignes.json'), fichier);
  }
```

7. Dans `lancerRendu`, remplacer la ligne `const problemes = verifierAvantRendu(…)` par :

```ts
      const { consignes } = await consignesDe(dossier);
      const problemes = verifierAvantRendu(t.montage, t.reglages.definitionMaxCaracteres, consignes);
```

8. Dans `traiter`, remplacer l'expression régulière par :

```ts
      const route = /^\/api\/tournages\/([^/]+)(?:\/(montage|rendu|suggestions|consignes))?$/.exec(chemin);
```

et ajouter avant `} else if (nom && action === 'rendu' …` :

```ts
      } else if (nom && action === 'consignes' && req.method === 'POST') {
        repondre(res, 200, await donnerConsigne(req, dossierDe(nom)));
      } else if (nom && action === 'consignes' && req.method === 'PUT') {
        await enregistrerConsignes(req, dossierDe(nom));
        repondre(res, 200, { ok: true });
```

9. Dans `studio/serveur/principal.ts`, provisoirement (remplacé à la tâche 4), ajouter à la configuration de `creerApi` après `relancerSuggestions,` :

```ts
    interpreterConsigne: async () => { throw new Error('Interprétation des consignes pas encore branchée.'); },
```

- [ ] **Step 6 : Lancer les tests et la vérification de types**

Run: `npm test -- studio/serveur/api.test.ts` puis `npm run typecheck`
Expected: PASS ; aucune erreur de type.

- [ ] **Step 7 : Commit**

```bash
git add studio/commun.ts studio/serveur/consignes.ts studio/serveur/api.ts studio/serveur/api.test.ts studio/serveur/principal.ts
git commit -m "Studio : routes des consignes, consignes.json dans le détail, rendu bloqué par une proposition en attente

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4 : Interprétation par Claude

**Files:**
- Modify: `package.json`, `package-lock.json` (dépendances)
- Create: `studio/serveur/interpretation.ts`
- Test: `studio/serveur/interpretation.test.ts` (+ `studio/serveur/__snapshots__/interpretation.test.ts.snap` créé par Vitest)
- Modify: `studio/serveur/principal.ts`

**Interfaces:**
- Consumes: `DemandeInterpretation`, `ErreurInterpretation` (`studio/serveur/consignes.ts`) ; `motsRecouverts`, `premierMotDuChapitre`, `extraitPassage`, `ReponseConsigne` (`noyau/consignes.ts`).
- Produces :
  - `construirePrompt(d: DemandeInterpretation): string`
  - `interpreterConsigne(d: DemandeInterpretation, client?: Anthropic): Promise<ReponseConsigne>` — lève `ErreurInterpretation` (500 : clé absente, refus, réponse inexploitable, autre erreur de l'API ; 503 : connexion impossible, limite de requêtes, erreur 5xx de l'API).

- [ ] **Step 1 : Installer les dépendances**

Run: `npm install --save-exact @anthropic-ai/sdk zod`
Expected: `package.json` gagne `"@anthropic-ai/sdk": "<version exacte>"` et `"zod": "<version exacte>"` dans `dependencies`. Vérifier que `node_modules/@anthropic-ai/sdk/helpers/zod.d.ts` (ou `helpers/zod.d.mts`) existe : `ls node_modules/@anthropic-ai/sdk/helpers`.

- [ ] **Step 2 : Écrire les tests**

Créer `studio/serveur/interpretation.test.ts` :

```ts
import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import exemple from '../../fixtures/analyse-exemple.json';
import type { ReponseConsigne } from '../../noyau/consignes';
import { montageInitial } from '../../noyau/montage-initial';
import type { Analyse } from '../../noyau/types';
import type { DemandeInterpretation } from './consignes';
import { construirePrompt, interpreterConsigne } from './interpretation';

const analyse = exemple as Analyse;
const demande: DemandeInterpretation = {
  analyse,
  montage: montageInitial(analyse, 'Essai'),
  texte: 'Coupe la salutation',
  ancrage: { premierMot: 0, dernierMot: 2 },
  definitionMax: 160,
  modele: 'claude-opus-5-5',
};
const REPONSE: ReponseConsigne = {
  reformulation: 'Couper la salutation.',
  operations: [{ type: 'couper', premierMot: 0, dernierMot: 2, explication: 'Coupe « Bonjour à tous. ».' }],
  nonRealisable: [],
};

// Faux client : seul messages.parse est appelé.
function client(parse: (...args: unknown[]) => Promise<unknown>) {
  const fonction = vi.fn(parse);
  return { client: { messages: { parse: fonction } } as unknown as Anthropic, parse: fonction };
}

describe('construirePrompt', () => {
  it('donne la transcription numérotée, l’état du montage, la consigne et le passage', () => {
    const prompt = construirePrompt(demande);
    expect(prompt).toContain("0:Bonjour 1:à 2:tous. 3:Aujourd'hui, 4:le 5:SSO.");
    expect(prompt).toContain('Titre de la vidéo : Essai');
    expect(prompt).toContain('- d1 · hesitation · appliquée · aucun mot (blanc entre deux mots)');
    expect(prompt).toContain('- l0 · longueur · longueur en attente · aucun mot (blanc entre deux mots)');
    expect(prompt).toContain('- mot 3 · Le SSO');
    expect(prompt).toContain('- SSO · a-valider · bas · Authentification unique');
    expect(prompt).toContain('Coupe la salutation');
    expect(prompt).toContain('mots 0 à 2 (« Bonjour à tous. »)');
    expect(prompt).toContain('160 caractères');
    expect(prompt).toMatchSnapshot();
  });
  it('n’indique pas de passage sans ancrage', () => {
    expect(construirePrompt({ ...demande, ancrage: null })).not.toContain('Passage sélectionné');
  });
});

describe('interpreterConsigne', () => {
  it('renvoie la réponse structurée de Claude', async () => {
    const { client: c, parse } = client(async () => ({ stop_reason: 'end_turn', parsed_output: REPONSE }));
    expect(await interpreterConsigne(demande, c)).toEqual(REPONSE);
    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-opus-5-5', fallbacks: 'default' }),
      { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } },
    );
  });
  it('signale un refus de Claude', async () => {
    const { client: c } = client(async () => ({ stop_reason: 'refusal', parsed_output: null }));
    await expect(interpreterConsigne(demande, c)).rejects.toMatchObject({
      statut: 500, message: 'Claude a refusé de traiter cette consigne.',
    });
  });
  it('signale une réponse inexploitable', async () => {
    const { client: c } = client(async () => ({ stop_reason: 'max_tokens', parsed_output: null }));
    await expect(interpreterConsigne(demande, c)).rejects.toMatchObject({
      statut: 500, message: 'Réponse de Claude inexploitable (arrêt : max_tokens).',
    });
  });
  it('signale une connexion impossible comme une erreur passagère', async () => {
    const { client: c } = client(async () => { throw new Anthropic.APIConnectionError({ message: 'réseau coupé' }); });
    await expect(interpreterConsigne(demande, c)).rejects.toMatchObject({ statut: 503 });
  });
});
```

- [ ] **Step 3 : Lancer les tests, vérifier l'échec**

Run: `npm test -- studio/serveur/interpretation.test.ts`
Expected: FAIL (module `./interpretation` introuvable).

- [ ] **Step 4 : Implémenter `studio/serveur/interpretation.ts`**

```ts
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { extraitPassage, motsRecouverts, premierMotDuChapitre, type ReponseConsigne } from '../../noyau/consignes';
import type { Coupe, Mot } from '../../noyau/types';
import { ErreurInterpretation, type DemandeInterpretation } from './consignes';

// Même présentation que le pipeline (suggestions.py) : « numéro:mot », 30 mots par ligne.
function texteNumerote(mots: Mot[]): string {
  const lignes: string[] = [];
  for (let i = 0; i < mots.length; i += 30) lignes.push(mots.slice(i, i + 30).map(m => `${m.id}:${m.texte}`).join(' '));
  return lignes.join('\n');
}

const etatCoupe = (c: Coupe) => (c.enAttente ? 'longueur en attente' : c.active ? 'appliquée' : 'rétablie');
const liste = (lignes: string[], vide: string) => (lignes.length > 0 ? lignes.join('\n') : vide);

function decrireMontage({ analyse, montage }: DemandeInterpretation): string {
  const coupes = montage.coupes.map(c => {
    const mots = motsRecouverts(analyse, c);
    const ou = mots ? `mots ${mots.premierMot} à ${mots.dernierMot}` : 'aucun mot (blanc entre deux mots)';
    return `- ${c.id} · ${c.type} · ${etatCoupe(c)} · ${ou}`;
  });
  const chapitres = montage.chapitres.map((c, i) => {
    const premier = premierMotDuChapitre(analyse, montage, i);
    return `- ${premier === null ? 'aucun mot' : `mot ${premier}`} · ${c.titre}`;
  });
  const termes = montage.termes.map(t => `- ${t.terme} · ${t.statut} · ${t.position} · ${t.definition}`);
  return `Titre de la vidéo : ${montage.titre}

Coupes (id · type · état · mots recouverts) :
${liste(coupes, '(aucune)')}

Chapitres (premier mot · titre) :
${liste(chapitres, '(aucun)')}

Termes à définir (terme · statut · position de l'encart · définition) :
${liste(termes, '(aucun)')}`;
}

export function construirePrompt(d: DemandeInterpretation): string {
  const passage = d.ancrage
    ? `\nPassage sélectionné par l'auteur, auquel la consigne s'applique : mots ${d.ancrage.premierMot} à ${d.ancrage.dernierMot} (« ${extraitPassage(d.analyse, d.ancrage)} »).\n`
    : '';
  return `Tu aides l'auteur de la chaîne YouTube personnelle « PMT » (astuces et outils numériques expliqués simplement) à monter un tournage face caméra, non scripté, en français. Il te donne une consigne de montage ; tu la traduis en opérations d'un vocabulaire fermé. Rien n'est appliqué sans son accord : il acceptera ou refusera chaque opération.

Voici la transcription. Chaque mot est précédé de son numéro (numéro:mot).

<transcription>
${texteNumerote(d.analyse.mots)}
</transcription>

Voici l'état actuel du montage.

<montage>
${decrireMontage(d)}
</montage>

<consigne>
${d.texte}
</consigne>
${passage}
Opérations possibles. Les passages sont désignés par les numéros de leur premier et de leur dernier mot (inclus) ; un chapitre par le numéro de son premier mot, tel qu'indiqué dans le montage ci-dessus.
- couper : couper le passage premierMot à dernierMot.
- basculerCoupe : rétablir une coupe appliquée, ou réappliquer une coupe rétablie (idCoupe). Pas pour une longueur en attente.
- deciderLongueur : accepter (couper, accepter = true) ou refuser (garder, accepter = false) une longueur en attente (idCoupe).
- renommerChapitre : changer le titre du chapitre qui commence au mot premierMotChapitre.
- ajouterChapitre : commencer un nouveau chapitre au mot premierMot, avec un titre.
- deplacerChapitre : faire commencer le chapitre premierMotChapitre au mot nouveauPremierMot, entre le début du chapitre précédent et le chapitre suivant. Pas le premier chapitre.
- fusionnerChapitre : fusionner le chapitre premierMotChapitre avec le précédent. Pas le premier chapitre.
- modifierTerme : changer la définition, le statut (a-valider, valide, ecarte) ou la position de l'encart (bas, haut) d'un terme existant ; ne donne que les champs à changer.
- ajouterTerme : ajouter un terme à définir, avec sa définition et les numéros de tous les mots où il est prononcé.
- titreVideo : changer le titre de la vidéo complète.

Une définition fait au plus ${d.definitionMax} caractères, en une ou deux phrases claires pour un public non spécialiste. Un titre de chapitre est court (60 caractères au plus).

Réponds avec :
- reformulation : ce que tu as compris de la consigne, en une ou deux phrases ; elle sera affichée après « J'ai compris : ».
- operations : les opérations, dans l'ordre où les appliquer, chacune avec une explication d'une phrase pour l'auteur. Chaque opération s'applique au montage laissé par les précédentes.
- nonRealisable : ce que la consigne demande et qu'aucune opération ne permet, chaque fois avec la raison. N'invente pas d'opération et n'approche pas silencieusement : si une partie de la consigne ne peut pas être faite exactement, mets-la ici.
`;
}

const explication = z.string();
const SchemaOperation = z.discriminatedUnion('type', [
  z.object({ type: z.literal('couper'), premierMot: z.number().int(), dernierMot: z.number().int(), explication }),
  z.object({ type: z.literal('basculerCoupe'), idCoupe: z.string(), explication }),
  z.object({ type: z.literal('deciderLongueur'), idCoupe: z.string(), accepter: z.boolean(), explication }),
  z.object({ type: z.literal('renommerChapitre'), premierMotChapitre: z.number().int(), titre: z.string(), explication }),
  z.object({ type: z.literal('ajouterChapitre'), premierMot: z.number().int(), titre: z.string(), explication }),
  z.object({
    type: z.literal('deplacerChapitre'), premierMotChapitre: z.number().int(), nouveauPremierMot: z.number().int(), explication,
  }),
  z.object({ type: z.literal('fusionnerChapitre'), premierMotChapitre: z.number().int(), explication }),
  z.object({
    type: z.literal('modifierTerme'),
    terme: z.string(),
    definition: z.string().optional(),
    statut: z.enum(['a-valider', 'valide', 'ecarte']).optional(),
    position: z.enum(['bas', 'haut']).optional(),
    explication,
  }),
  z.object({ type: z.literal('ajouterTerme'), terme: z.string(), definition: z.string(), mots: z.array(z.number().int()), explication }),
  z.object({ type: z.literal('titreVideo'), titre: z.string(), explication }),
]);
const SchemaReponse = z.object({
  reformulation: z.string(),
  operations: z.array(SchemaOperation),
  nonRealisable: z.array(z.string()),
});

// Sortie structurée, effort moyen et repli serveur en cas de refus, comme le pipeline.
export async function interpreterConsigne(d: DemandeInterpretation, client?: Anthropic): Promise<ReponseConsigne> {
  if (!client && !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new ErreurInterpretation(500, 'Clé API Claude absente : définissez la variable d’environnement ANTHROPIC_API_KEY.');
  }
  let reponse;
  try {
    reponse = await (client ?? new Anthropic()).messages.parse(
      {
        model: d.modele,
        max_tokens: 16000,
        output_config: { effort: 'medium', format: zodOutputFormat(SchemaReponse) },
        messages: [{ role: 'user', content: construirePrompt(d) }],
        // @ts-expect-error repli serveur (bêta server-side-fallback-2026-07-01) pas encore typé par le SDK
        fallbacks: 'default',
      },
      { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } },
    );
  } catch (e) {
    if (e instanceof Anthropic.APIConnectionError) {
      throw new ErreurInterpretation(503, `Connexion à l’API Claude impossible : ${e.message}`);
    }
    if (e instanceof Anthropic.RateLimitError) {
      throw new ErreurInterpretation(503, 'Limite de requêtes de l’API Claude atteinte, réessayez plus tard.');
    }
    if (e instanceof Anthropic.APIError) {
      const statut = e.status !== undefined && e.status >= 500 ? 503 : 500;
      throw new ErreurInterpretation(statut, `Erreur de l’API Claude (${e.status ?? 'sans statut'}) : ${e.message}`);
    }
    if (e instanceof Anthropic.AnthropicError) throw new ErreurInterpretation(500, `Réponse de Claude inexploitable : ${e.message}`);
    throw e;
  }
  if (reponse.stop_reason === 'refusal') throw new ErreurInterpretation(500, 'Claude a refusé de traiter cette consigne.');
  if (!reponse.parsed_output) {
    throw new ErreurInterpretation(500, `Réponse de Claude inexploitable (arrêt : ${reponse.stop_reason}).`);
  }
  return reponse.parsed_output;
}
```

Notes pour l'implémenteur :
- Si `npm run typecheck` signale « Unused '@ts-expect-error' directive », le SDK installé type déjà `fallbacks` : supprimer la ligne de commentaire.
- Si le type de `reponse.parsed_output` n'est pas assignable à `ReponseConsigne` (champs optionnels de `modifierTerme`), corriger le schéma Zod, pas le type du noyau.
- Si `Anthropic.AnthropicError` n'est pas exposé sur la classe par défaut, l'importer nommément : `import Anthropic, { AnthropicError } from '@anthropic-ai/sdk';`.
- Si le constructeur de `APIConnectionError` diffère dans la version installée, adapter l'appel dans le test d'après l'erreur de typage.

- [ ] **Step 5 : Lancer les tests, vérifier le succès et relire l'instantané**

Run: `npm test -- studio/serveur/interpretation.test.ts` puis `npm run typecheck`
Expected: PASS (l'instantané est créé au premier passage) ; aucune erreur de type. Ouvrir `studio/serveur/__snapshots__/interpretation.test.ts.snap` et relire le prompt : transcription, montage, consigne, passage, vocabulaire, consignes de réponse.

- [ ] **Step 6 : Brancher l'interprétation dans `studio/serveur/principal.ts`**

Ajouter l'import `import { interpreterConsigne } from './interpretation';` et remplacer la ligne provisoire de la tâche 3 par :

```ts
    interpreterConsigne: d => interpreterConsigne(d),
```

- [ ] **Step 7 : Lancer toute la suite et la vérification de types**

Run: `npm test` puis `npm run typecheck`
Expected: PASS ; aucune erreur de type.

- [ ] **Step 8 : Commit**

```bash
git add package.json package-lock.json studio/serveur/interpretation.ts studio/serveur/interpretation.test.ts studio/serveur/__snapshots__ studio/serveur/principal.ts
git commit -m "Studio : interprétation des consignes par Claude, sortie structurée et repli serveur

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5 : Logique et état des consignes côté interface

**Files:**
- Create: `studio/src/logique/consignes.ts`
- Test: `studio/src/logique/consignes.test.ts`
- Modify: `studio/src/api.ts`
- Create: `studio/src/useConsignes.ts`

**Interfaces:**
- Consumes: `passageEnTemps`, `Consigne`, `Operation`, `Ancrage`, `FichierConsignes` (`noyau/consignes.ts`) ; routes de la tâche 3.
- Produces :
  - `passageDeProposition(analyse: Analyse, montage: Montage, operation: Operation): Segment | null`
  - `bilan(consigne: Consigne): string`
  - `api.donnerConsigne(nom: string, texte: string, ancrage: Ancrage | null): Promise<Consigne>`
  - `api.enregistrerConsignes(nom: string, fichier: FichierConsignes): Promise<void>`
  - `useConsignes(nom: string, initial: FichierConsignes | null): { fichier: FichierConsignes | null; erreur: string | null; ajouter: (c: Consigne) => void; enregistrer: (f: FichierConsignes) => void }`

- [ ] **Step 1 : Écrire les tests**

Créer `studio/src/logique/consignes.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import exemple from '../../../fixtures/analyse-exemple.json';
import type { Consigne, EtatProposition } from '../../../noyau/consignes';
import type { Analyse, Montage } from '../../../noyau/types';
import { bilan, passageDeProposition } from './consignes';

const analyse = exemple as Analyse;
const montage: Montage = {
  version: 1,
  titre: 'Essai',
  coupes: [{ id: 'l0', type: 'longueur', debut: 10, fin: 20, active: false, enAttente: true }],
  chapitres: [{ titre: 'Intro', debut: 0 }],
  termes: [],
};

const consigne = (etats: EtatProposition[]): Consigne => ({
  id: 'c1',
  date: '2026-10-19T10:00:00.000Z',
  texte: 'T',
  ancrage: null,
  reformulation: 'R',
  nonRealisable: [],
  propositions: etats.map(etat => ({ operation: { type: 'titreVideo', titre: 'X' }, explication: 'e', etat })),
});

describe('passageDeProposition', () => {
  it('donne le passage d’une coupe à faire ou d’une coupe existante', () => {
    expect(passageDeProposition(analyse, montage, { type: 'couper', premierMot: 1, dernierMot: 2 })).toEqual({ debut: 1.25, fin: 1.8 });
    expect(passageDeProposition(analyse, montage, { type: 'deciderLongueur', idCoupe: 'l0', accepter: true })).toEqual({ debut: 10, fin: 20 });
    expect(passageDeProposition(analyse, montage, { type: 'basculerCoupe', idCoupe: 'x' })).toBeNull();
    expect(passageDeProposition(analyse, montage, { type: 'couper', premierMot: 1, dernierMot: 99 })).toBeNull();
  });
  it('ne donne pas de passage pour les autres opérations', () => {
    expect(passageDeProposition(analyse, montage, { type: 'titreVideo', titre: 'X' })).toBeNull();
  });
});

describe('bilan', () => {
  it('compte les propositions par état, accordé', () => {
    expect(bilan(consigne(['acceptee', 'acceptee', 'refusee']))).toBe('2 acceptées, 1 refusée');
    expect(bilan(consigne(['en-attente', 'invalide', 'invalide']))).toBe('1 en attente, 2 invalides');
    expect(bilan(consigne([]))).toBe('aucune opération');
  });
});
```

- [ ] **Step 2 : Lancer les tests, vérifier l'échec**

Run: `npm test -- studio/src/logique/consignes.test.ts`
Expected: FAIL (module `./consignes` introuvable).

- [ ] **Step 3 : Implémenter `studio/src/logique/consignes.ts`**

```ts
import { passageEnTemps, type Consigne, type EtatProposition, type Operation } from '../../../noyau/consignes';
import type { Analyse, Montage, Segment } from '../../../noyau/types';

// Passage à écouter pour une proposition qui coupe un passage ou décide d'une coupe existante.
export function passageDeProposition(analyse: Analyse, montage: Montage, operation: Operation): Segment | null {
  if (operation.type === 'couper') {
    const p = passageEnTemps(analyse, operation.premierMot, operation.dernierMot);
    return typeof p === 'string' ? null : p;
  }
  if (operation.type === 'basculerCoupe' || operation.type === 'deciderLongueur') {
    const coupe = montage.coupes.find(c => c.id === operation.idCoupe);
    return coupe ? { debut: coupe.debut, fin: coupe.fin } : null;
  }
  return null;
}

const ACCORDS: [EtatProposition, string, string][] = [
  ['en-attente', 'en attente', 'en attente'],
  ['acceptee', 'acceptée', 'acceptées'],
  ['refusee', 'refusée', 'refusées'],
  ['invalide', 'invalide', 'invalides'],
];

// « 2 acceptées, 1 refusée » pour la liste des consignes précédentes.
export function bilan(consigne: Consigne): string {
  const parties = ACCORDS.flatMap(([etat, un, plusieurs]) => {
    const n = consigne.propositions.filter(p => p.etat === etat).length;
    return n === 0 ? [] : [`${n} ${n === 1 ? un : plusieurs}`];
  });
  return parties.length > 0 ? parties.join(', ') : 'aucune opération';
}
```

- [ ] **Step 4 : Lancer les tests, vérifier le succès**

Run: `npm test -- studio/src/logique/consignes.test.ts`
Expected: PASS.

- [ ] **Step 5 : Ajouter les appels dans `studio/src/api.ts`**

Ajouter l'import `import type { Ancrage, Consigne, FichierConsignes } from '../../noyau/consignes';` et, dans l'objet `api`, après `relancerSuggestions` :

```ts
  donnerConsigne: (nom: string, texte: string, ancrage: Ancrage | null) =>
    appeler<Consigne>(`${chemin(nom)}/consignes`, enJson('POST', { texte, ancrage })),
  enregistrerConsignes: async (nom: string, fichier: FichierConsignes) => {
    await appeler<{ ok: true }>(`${chemin(nom)}/consignes`, enJson('PUT', fichier));
  },
```

- [ ] **Step 6 : Créer `studio/src/useConsignes.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Consigne, FichierConsignes } from '../../noyau/consignes';
import { api } from './api';

// Consignes du tournage. Une consigne interprétée est déjà enregistrée par le serveur ;
// chaque acceptation ou refus réenregistre consignes.json, dans l'ordre des décisions.
export function useConsignes(nom: string, initial: FichierConsignes | null) {
  const [fichier, setFichier] = useState<FichierConsignes | null>(initial);
  const [erreur, setErreur] = useState<string | null>(null);
  const file = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    setFichier(initial);
    setErreur(null);
  }, [initial]);

  const ajouter = useCallback((c: Consigne) => {
    setFichier(f => (f ? { ...f, consignes: [...f.consignes, c] } : f));
  }, []);

  const enregistrer = useCallback((suivant: FichierConsignes) => {
    setFichier(suivant);
    setErreur(null);
    file.current = file.current
      .then(() => api.enregistrerConsignes(nom, suivant))
      .catch((e: unknown) => setErreur(`Échec de l’enregistrement des consignes : ${e instanceof Error ? e.message : String(e)}`));
  }, [nom]);

  return { fichier, erreur, ajouter, enregistrer };
}
```

- [ ] **Step 7 : Vérification de types**

Run: `npm run typecheck`
Expected: aucune erreur.

- [ ] **Step 8 : Commit**

```bash
git add studio/src/logique/consignes.ts studio/src/logique/consignes.test.ts studio/src/api.ts studio/src/useConsignes.ts
git commit -m "Studio : passage et bilan des propositions, appels et état des consignes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6 : Panneau « Consignes », ancrage depuis le texte, mode d'emploi

**Files:**
- Create: `studio/src/composants/PanneauConsignes.tsx`
- Modify: `studio/src/composants/Texte.tsx`
- Modify: `studio/src/composants/EcranMontage.tsx`
- Modify: `studio/src/composants/PanneauRendu.tsx`
- Modify: `studio/src/styles.css`
- Modify: `docs/studio.md`

**Interfaces:**
- Consumes: `accepterPropositions`, `refuserPropositions`, `indicesEnAttente`, `extraitPassage`, `Ancrage`, `Consigne`, `EtatProposition`, `FichierConsignes`, `ReglagesConsignes` (`noyau/consignes.ts`) ; `passageDeProposition`, `bilan` (`studio/src/logique/consignes.ts`) ; `api.donnerConsigne` ; `useConsignes` ; `verifierAvantRendu(m, max, consignes)`.
- Produces : `PanneauConsignes` ; prop `consignerPassage: (a: Ancrage) => void` de `Texte` ; prop `consignes: Consigne[]` de `PanneauRendu`.

- [ ] **Step 1 : Créer `studio/src/composants/PanneauConsignes.tsx`**

```tsx
import { type FC, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import {
  accepterPropositions, extraitPassage, indicesEnAttente, refuserPropositions,
  type Ancrage, type Consigne, type EtatProposition, type FichierConsignes, type ReglagesConsignes,
} from '../../../noyau/consignes';
import type { Analyse, Montage } from '../../../noyau/types';
import { api } from '../api';
import { bilan, passageDeProposition } from '../logique/consignes';
import type { EtatEnregistrement } from '../useMontage';

interface Props {
  nom: string;
  analyse: Analyse;
  montage: Montage;
  reglages: ReglagesConsignes;
  enregistrement: EtatEnregistrement;
  fichier: FichierConsignes;
  erreurEnregistrement: string | null;
  ajouter: (c: Consigne) => void;
  enregistrer: (f: FichierConsignes) => void;
  ancrage: Ancrage | null;
  onAncrage: (a: Ancrage | null) => void;
  modifier: (f: (m: Montage) => Montage) => void;
  ecouter: (debut: number, fin: number) => void;
  lireDansApercu: (t: number) => void;
}

const LIBELLES_ETAT: Record<EtatProposition, string> = {
  'en-attente': 'en attente',
  acceptee: 'acceptée',
  refusee: 'refusée',
  invalide: 'invalide',
};
const EXTRAIT_MAX = 60;

const dateCourte = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

// Consigne libre traduite par Claude en propositions : rien ne change tant que l'auteur n'a pas accepté.
export const PanneauConsignes: FC<Props> = props => {
  const { nom, analyse, montage, reglages, enregistrement, fichier, ancrage, onAncrage } = props;
  const [texte, setTexte] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouvertes, setOuvertes] = useState<string[]>([]);
  const zone = useRef<HTMLTextAreaElement>(null);
  const pret = enregistrement === 'a-jour';

  useEffect(() => {
    if (ancrage) zone.current?.focus();
  }, [ancrage]);

  // Le serveur vérifie les propositions sur montage.json : on attend qu'il soit à jour.
  const envoyer = async () => {
    if (!texte.trim() || envoi || !pret) return;
    setEnvoi(true);
    setErreur(null);
    try {
      props.ajouter(await api.donnerConsigne(nom, texte, ancrage));
      setTexte('');
      onAncrage(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setEnvoi(false);
    }
  };

  const touche = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      void envoyer();
    }
  };

  // Pas de décision pendant un envoi : le serveur ajoute la nouvelle consigne au fichier.
  const decider = (consigne: Consigne, indices: number[], accepter: boolean) => {
    const r = accepter
      ? accepterPropositions(analyse, montage, consigne, indices, reglages)
      : { montage, consigne: refuserPropositions(consigne, indices) };
    if (r.montage !== montage) props.modifier(() => r.montage);
    props.enregistrer({ ...fichier, consignes: fichier.consignes.map(c => (c.id === consigne.id ? r.consigne : c)) });
  };

  const detail = (c: Consigne) => {
    const enAttente = indicesEnAttente(c);
    return (
      <div className="consigne">
        <div><strong>{c.texte}</strong></div>
        {c.ancrage && <div className="discret">Sur : « {extraitPassage(analyse, c.ancrage, EXTRAIT_MAX)} »</div>}
        <div className="reformulation">J’ai compris : {c.reformulation}</div>
        {c.nonRealisable.length > 0 && (
          <div className="alerte">
            Pas réalisable :
            <ul>{c.nonRealisable.map(n => <li key={n}>{n}</li>)}</ul>
          </div>
        )}
        {c.propositions.length === 0 && <p className="discret">Aucune opération proposée.</p>}
        {c.propositions.map((p, i) => {
          const passage = p.etat === 'en-attente' ? passageDeProposition(analyse, montage, p.operation) : null;
          return (
            <div key={i} className={p.etat === 'en-attente' ? 'fiche' : 'fiche proposition-traitee'}>
              <div>{p.explication}</div>
              {p.etat === 'en-attente' ? (
                <div className="actions">
                  <button disabled={envoi} onClick={() => decider(c, [i], true)}>Accepter</button>
                  <button disabled={envoi} onClick={() => decider(c, [i], false)}>Refuser</button>
                  {passage && (
                    <>
                      <button onClick={() => props.ecouter(passage.debut, passage.fin)}>Écouter</button>
                      <button onClick={() => props.lireDansApercu(passage.debut)}>Voir dans l’aperçu</button>
                    </>
                  )}
                </div>
              ) : (
                <div className="discret">{LIBELLES_ETAT[p.etat]}{p.probleme ? ` : ${p.probleme}` : ''}</div>
              )}
            </div>
          );
        })}
        {enAttente.length > 1 && (
          <div className="actions">
            <button disabled={envoi} onClick={() => decider(c, enAttente, true)}>Tout accepter</button>
            <button disabled={envoi} onClick={() => decider(c, enAttente, false)}>Tout refuser</button>
          </div>
        )}
      </div>
    );
  };

  const derniere = fichier.consignes[fichier.consignes.length - 1];
  const precedentes = fichier.consignes.slice(0, -1).reverse();
  return (
    <section className="panneau">
      <h3>Consignes</h3>
      {ancrage && (
        <div className="etiquette">
          Sur : « {extraitPassage(analyse, ancrage, EXTRAIT_MAX)} »{' '}
          <button aria-label="Retirer le passage" onClick={() => onAncrage(null)}>✕</button>
        </div>
      )}
      <textarea
        ref={zone}
        rows={3}
        className="zone-consigne"
        value={texte}
        placeholder="Par exemple : coupe tout le passage sur Excel"
        aria-label="Consigne"
        onChange={e => setTexte(e.target.value)}
        onKeyDown={touche}
      />
      <div className="actions">
        <button className="principal" disabled={envoi || !texte.trim() || !pret} onClick={() => void envoyer()}>
          Envoyer
        </button>
        {envoi && <span className="discret">Claude interprète la consigne…</span>}
        {!envoi && !pret && <span className="discret">En attente de l’enregistrement du montage…</span>}
        {!envoi && pret && <span className="discret">Ctrl+Entrée</span>}
      </div>
      {erreur && <p className="alerte">{erreur}</p>}
      {props.erreurEnregistrement && <p className="alerte">{props.erreurEnregistrement}</p>}
      {derniere && detail(derniere)}
      {precedentes.length > 0 && (
        <details>
          <summary>Consignes précédentes ({precedentes.length})</summary>
          {precedentes.map(c => {
            const ouverte = ouvertes.includes(c.id);
            return (
              <div key={c.id} className="fiche">
                <button
                  className="lien"
                  onClick={() => setOuvertes(o => (ouverte ? o.filter(id => id !== c.id) : [...o, c.id]))}
                >
                  {indicesEnAttente(c).length > 0 && <span className="pastille" title="Propositions en attente" />}
                  {dateCourte(c.date)} · {c.texte} · <span className="discret">{bilan(c)}</span>
                </button>
                {ouverte && detail(c)}
              </div>
            );
          })}
        </details>
      )}
    </section>
  );
};
```

- [ ] **Step 2 : Ajouter l'entrée au menu du texte dans `studio/src/composants/Texte.tsx`**

1. Ajouter l'import `import type { Ancrage } from '../../../noyau/consignes';`.
2. Dans `Props`, après `lireDansApercu` : `consignerPassage: (a: Ancrage) => void;`.
3. Dans la signature : `export const Texte: FC<Props> = ({ analyse, montage, modifier, ecouter, lireDansApercu, consignerPassage }) => {`.
4. Dans la barre de sélection, après le bouton « Nouveau chapitre ici » :

```tsx
            <button
              onClick={() => {
                const premier = analyse.mots[choix.rangs[0]];
                const dernier = analyse.mots[choix.rangs[1]];
                if (premier && dernier) consignerPassage({ premierMot: premier.id, dernierMot: dernier.id });
              }}
            >
              Donner une consigne sur ce passage
            </button>
```

- [ ] **Step 3 : Prendre les consignes en compte dans `studio/src/composants/PanneauRendu.tsx`**

1. Ajouter l'import `import type { Consigne } from '../../../noyau/consignes';`.
2. Dans `Props`, après `definitionMax: number;` : `consignes: Consigne[];`.
3. Signature : `({ nom, montage, definitionMax, consignes, enregistrement })`.
4. Remplacer la ligne `const problemes = useMemo(…)` par :

```tsx
  const problemes = useMemo(
    () => verifierAvantRendu(montage, definitionMax, consignes),
    [montage, definitionMax, consignes],
  );
```

- [ ] **Step 4 : Brancher le panneau dans `studio/src/composants/EcranMontage.tsx`**

1. Imports : ajouter

```tsx
import type { Ancrage } from '../../../noyau/consignes';
import { useConsignes } from '../useConsignes';
import { PanneauConsignes } from './PanneauConsignes';
```

2. Après `const [demande, setDemande] = …`, ajouter :

```tsx
  const consignes = useConsignes(nom, detail?.consignes ?? null);
  const [ancrage, setAncrage] = useState<Ancrage | null>(null);
```

3. Remplacer la condition de chargement par :

```tsx
  if (!detail || !montage || !decisions || !consignes.fichier) return <div className="page">Chargement…</div>;
```

4. Dans `<Texte … />`, ajouter la prop `consignerPassage={setAncrage}`.
5. Juste après `<Apercu … />`, insérer :

```tsx
        <PanneauConsignes
          nom={nom}
          analyse={detail.analyse}
          montage={montage}
          reglages={detail.reglages}
          enregistrement={enregistrement}
          fichier={consignes.fichier}
          erreurEnregistrement={consignes.erreur}
          ajouter={consignes.ajouter}
          enregistrer={consignes.enregistrer}
          ancrage={ancrage}
          onAncrage={setAncrage}
          modifier={modifier}
          ecouter={ecouter}
          lireDansApercu={lireDansApercu}
        />
```

6. Dans `<PanneauRendu … />`, ajouter `consignes={consignes.fichier.consignes}`.

- [ ] **Step 5 : Ajouter les styles dans `studio/src/styles.css`**

À la fin du fichier :

```css
.zone-consigne { width: 100%; box-sizing: border-box; font: inherit; font-size: 14px; margin-bottom: 6px; }
.etiquette { display: inline-flex; gap: 6px; align-items: center; background: #eef3f8; border-radius: 12px; padding: 2px 4px 2px 10px; margin-bottom: 6px; font-size: 13px; }
.consigne { border-top: 1px solid #e5e7eb; margin-top: 8px; padding-top: 8px; display: grid; gap: 6px; }
.reformulation { font-style: italic; }
.proposition-traitee { opacity: 0.55; }
.pastille { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--rouge); margin-right: 6px; }
button.lien { background: none; border: none; padding: 0; text-align: left; cursor: pointer; font: inherit; color: inherit; }
```

- [ ] **Step 6 : Écrire la section du mode d'emploi dans `docs/studio.md`**

1. Dans « Écran de montage », dans la puce « Cliquer un mot ou sélectionner un passage à la souris », ajouter « , y donner une consigne » : « …le couper, l'écouter, le lire dans l'aperçu, y commencer un nouveau chapitre, y donner une consigne. »
2. Après la section « Écran de montage » (avant « Rendu »), ajouter :

```markdown
## Consignes

Le panneau **Consignes** (sous l’aperçu) accepte une consigne écrite librement : « coupe tout le passage sur Excel », « renomme le chapitre 2 en … », « ajoute une définition pour prompt ». Pour viser un passage, le sélectionner dans le texte puis choisir « Donner une consigne sur ce passage ».

- « Envoyer » (ou Ctrl+Entrée) : Claude reformule la consigne (« J’ai compris : … ») et la traduit en opérations du studio (couper, rétablir une coupe, décider d’une longueur, renommer, ajouter, déplacer ou fusionner un chapitre, modifier ou ajouter un terme, changer le titre). Ce qu’aucune opération ne permet est listé dans « Pas réalisable ».
- Rien ne change tant qu’une proposition n’est pas acceptée. Chacune peut être acceptée ou refusée, écoutée et vue dans l’aperçu quand elle porte sur un passage ; « Tout accepter » et « Tout refuser » traitent toutes celles en attente.
- Une proposition qui ne s’applique plus au montage (par exemple parce qu’une autre a été refusée) passe « invalide » avec la raison ; elle ne bloque pas le rendu. Une proposition en attente bloque « Valider et lancer le rendu ».
- Les consignes précédentes restent consultables (pastille rouge : propositions encore en attente).

Les consignes sont enregistrées dans `consignes.json`, à côté de `montage.json`. L’appel à Claude demande la variable d’environnement `ANTHROPIC_API_KEY`, comme l’analyse ; le modèle est celui de `reglages.json` (`modeles.claude`).
```

3. Dans « Rendu », remplacer « …et aucune longueur n'est en attente. » par « …aucune longueur n'est en attente et aucune proposition de consigne n'attend de décision. »

- [ ] **Step 7 : Lancer toute la suite et la vérification de types**

Run: `npm test` puis `npm run typecheck`
Expected: PASS ; aucune erreur de type.

- [ ] **Step 8 : Essai manuel dans le studio (avec un vrai appel à Claude)**

Prérequis : `ANTHROPIC_API_KEY` définie, un tournage analysé dans `donnees/tournages/`.

Run: `npm run validation`, puis ouvrir http://127.0.0.1:5180 dans Chrome ou Edge, ouvrir le tournage.

Vérifier :
1. Le panneau « Consignes » est sous l'aperçu ; « Envoyer » est désactivé tant que la zone est vide.
2. Sélectionner un passage dans le texte → « Donner une consigne sur ce passage » → l'étiquette « Sur : "…" ✕ » apparaît, la zone de texte prend le focus ; ✕ la retire.
3. Envoyer « coupe ce passage » (ancrée) : « Claude interprète la consigne… » puis « J'ai compris : … » et une proposition `couper` ; Écouter et Voir dans l'aperçu fonctionnent ; le texte n'est pas barré avant l'acceptation.
4. Accepter : le passage est barré, « Enregistré » s'affiche, `consignes.json` contient la proposition `acceptee`.
5. Envoyer « renomme le premier chapitre en Bienvenue et ajoute une musique de fond » : une proposition `renommerChapitre` et « Pas réalisable » pour la musique ; « Valider et lancer le rendu » liste « Consigne : 1 proposition(s) en attente. » ; Refuser la fait disparaître de la liste.
6. Envoyer une deuxième consigne : la première passe dans « Consignes précédentes (1) » avec son bilan.
7. Sans clé (`ANTHROPIC_API_KEY` vide, studio relancé) : message « Clé API Claude absente… », le texte reste dans la zone, `consignes.json` inchangé.

Noter tout écart et le corriger avant de valider.

- [ ] **Step 9 : Commit**

```bash
git add studio/src/composants/PanneauConsignes.tsx studio/src/composants/Texte.tsx studio/src/composants/EcranMontage.tsx studio/src/composants/PanneauRendu.tsx studio/src/styles.css docs/studio.md
git commit -m "Studio : panneau des consignes, consigne sur un passage, mode d'emploi

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
