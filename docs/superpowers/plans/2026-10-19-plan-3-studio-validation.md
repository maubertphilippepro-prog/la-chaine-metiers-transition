# Plan 3 — Studio de validation : plan de mise en œuvre

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une application web locale (`npm run validation`) qui liste les tournages, affiche pour chacun le texte horodaté avec ses coupes, termes et chapitres à côté du lecteur Remotion monté en direct, enregistre chaque décision dans `montage.json`, puis vérifie le montage, met à jour le glossaire et lance les rendus avec suivi de progression.

**Architecture:** Les opérations d'édition, les vérifications avant rendu et la mise à jour du glossaire sont des fonctions pures ajoutées à `noyau/` (testées avec Vitest), partagées entre l'interface et le serveur. Le serveur Node (`studio/serveur/`, exécuté avec `tsx`) sert sur un seul port une petite API JSON (lecture/écriture de `donnees/`, rendu en tâche de fond via `rendreTournage`, relance des suggestions via le pipeline Python) et l'interface Vite + React en mode middleware ; `source.mp4` reste servi par le serveur de fichiers existant (`demarrerServeur`). L'interface (`studio/src/`) calcule les décisions avec `noyau/decisions.ts` et les affiche dans `@remotion/player` avec les compositions `Episode` / `VideoComplete` existantes.

**Tech Stack:** Node 22, TypeScript 5, Vitest 3.2.7, React 19.3.0, Vite 7.3.7, `@vitejs/plugin-react` 5.2.0, Remotion 4.0.533 (`@remotion/player` en plus), `tsx`, Python du `.venv` pour `mtpipeline`.

Spec de référence : `docs/superpowers/specs/2026-10-06-post-production-design.md` (§3.3, §3.4, §4, §7).

## Global Constraints

- La chaîne s'appelle **« PMT »** (projet personnel). Aucune mention d'organisation (employeur, pôle, client) dans le code, les textes affichés ou la documentation.
- Tout le texte visible et les noms de domaine sont en français ; clés JSON en camelCase ; apostrophe typographique `’` dans les textes affichés.
- `analyse.json` n'est **jamais** modifié par le studio. Le studio écrit `montage.json` (à chaque modification), `episode.json` (statut, via `majStatutEpisode`) et `donnees/glossaire.json` (au lancement du rendu). Toutes les écritures passent par un fichier `.tmp` puis `rename`.
- Statuts de `episode.json` : `analyse`, `en-validation`, `valide`, `rendu`, `erreur`. Une modification du montage met le tournage `en-validation` ; le lancement du rendu le met `valide` ; `rendreTournage` le met ensuite `rendu` ou `erreur`.
- Avant rendu (spec §7) : la vidéo complète et chaque chapitre ont un titre ; chaque terme est validé ou écarté ; chaque définition validée est non vide et fait au plus `reglages.definitionMaxCaracteres` (160) caractères ; aucune suggestion de longueur en attente.
- Une suggestion de longueur est **proposée seulement** : `active: false, enAttente: true` jusqu'à ce qu'elle soit acceptée ou refusée. Toute autre coupe reste visible et réversible.
- Toute la logique de décision reste dans `noyau/` ; les composants React ne font qu'afficher et appeler ces fonctions.
- Serveur lié à `127.0.0.1` uniquement, en-tête `Host` vérifié (`127.0.0.1:<port>` ou `localhost:<port>`), noms de tournage refusés s'ils contiennent `/`, `\` ou commencent par `.`.
- Un seul rendu à la fois dans le studio.
- Versions exactes : `@remotion/player` en `4.0.533` (comme tous les `@remotion/*` et `remotion`), `vite` en `7.3.7` (celle que Vitest utilise déjà), `@vitejs/plugin-react` en `5.2.0`, `react` / `react-dom` en `19.3.0`.
- Le chemin du projet contient « & » : ne jamais utiliser `npx` ; passer par les scripts npm (`npm test -- <fichier>`, `npm run typecheck`), qui s'exécutent dans Git Bash grâce au `.npmrc`. Python : `cd pipeline; ..\.venv\Scripts\python -m pytest`.
- Chaque commit se termine par la ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Structure des fichiers

```
noyau/
  types.ts                      Coupe : + enAttente
  montage-initial.ts (+ test)   longueurs en attente, + integrerSuggestions
  edition.ts (+ test)           opérations du studio sur un Montage
  verifications.ts (+ test)     conditions du rendu final
  glossaire.ts (+ test)         mise à jour du glossaire
remotion/scripts/tournage.ts    raisonMontage exporté
studio/
  commun.ts                     types échangés entre serveur et interface
  vite.config.ts, index.html
  serveur/
    suivi-rendu.ts (+ test)     rendu unique en tâche de fond, état interrogeable
    api.ts (+ test)             routes /api/…
    suggestions.ts              relance de « mtpipeline relancer-suggestions »
    principal.ts                serveur de fichiers + API + Vite, port 5180
  src/
    main.tsx, App.tsx, styles.css
    api.ts                      appels à l'API
    useMontage.ts               chargement et enregistrement automatique
    ecoute.tsx                  écoute d'un passage de source.mp4
    logique/
      format.ts (+ test)        horodatage, durée
      texte.ts (+ test)         texte horodaté : mots, trous, chapitres
      apercu.ts (+ test)        instant de la source → image de l'aperçu
      rendu.ts (+ test)         fichier de rendu → cible à relancer
    composants/
      ListeTournages.tsx, EcranMontage.tsx, Texte.tsx, Apercu.tsx,
      PanneauTermes.tsx, PanneauLongueurs.tsx, BandeauSuggestions.tsx, PanneauRendu.tsx
docs/studio.md                  mode d'emploi
```

---

### Task 1 : Opérations de montage dans le noyau

**Files:**
- Modify: `noyau/types.ts` (interface `Coupe`)
- Modify: `noyau/montage-initial.ts`
- Modify: `noyau/montage-initial.test.ts`
- Create: `noyau/edition.ts`
- Test: `noyau/edition.test.ts`

**Interfaces:**
- Consumes: `Montage`, `Coupe`, `Terme`, `Analyse` de `noyau/types.ts`.
- Produces:
  - `Coupe.enAttente?: boolean`
  - `montageInitial(analyse: Analyse, titre: string): Montage` (longueurs avec `enAttente: true`)
  - `integrerSuggestions(montage: Montage, analyse: Analyse): Montage`
  - `basculerCoupe(m: Montage, id: string): Montage`
  - `couperPassage(m: Montage, debut: number, fin: number): Montage`
  - `deciderLongueur(m: Montage, id: string, accepter: boolean): Montage`
  - `type ChangementTerme = Partial<Pick<Terme, 'definition' | 'statut' | 'position'>>`
  - `modifierTerme(m: Montage, terme: string, changement: ChangementTerme): Montage`
  - `renommerChapitre(m: Montage, index: number, titre: string): Montage`
  - `deplacerLimite(m: Montage, index: number, debut: number): Montage`
  - `fusionnerChapitre(m: Montage, index: number): Montage`
  - `ajouterChapitre(m: Montage, debut: number, titre: string): Montage`
  - Règle commune : une opération impossible renvoie **le même objet** `m` (l'interface s'en sert pour ne pas enregistrer).

- [ ] **Step 1 : Écrire les tests de `edition.ts`** (`noyau/edition.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import {
  ajouterChapitre, basculerCoupe, couperPassage, deciderLongueur, deplacerLimite, fusionnerChapitre, modifierTerme,
  renommerChapitre,
} from './edition';
import type { Montage } from './types';

const base: Montage = {
  version: 1,
  titre: 'Essai',
  coupes: [
    { id: 'd0', type: 'silence', debut: 0, fin: 0.8, active: true },
    { id: 'l0', type: 'longueur', debut: 10, fin: 20, active: false, enAttente: true },
  ],
  chapitres: [{ titre: 'Intro', debut: 0 }, { titre: 'Suite', debut: 5 }, { titre: 'Fin', debut: 12 }],
  termes: [{ terme: 'SSO', definition: 'Déf.', occurrences: [3.8], statut: 'a-valider', position: 'bas' }],
};

describe('coupes', () => {
  it('rétablit puis recoupe un passage détecté sans modifier l’original', () => {
    const r = basculerCoupe(base, 'd0');
    expect(r.coupes[0]!.active).toBe(false);
    expect(basculerCoupe(r, 'd0').coupes[0]!.active).toBe(true);
    expect(base.coupes[0]!.active).toBe(true);
  });
  it('ne bascule pas une longueur en attente ni une coupe inconnue', () => {
    expect(basculerCoupe(base, 'l0')).toBe(base);
    expect(basculerCoupe(base, 'x')).toBe(base);
  });
  it('ajoute des coupes manuelles numérotées et supprime celle qu’on rétablit', () => {
    const a = couperPassage(couperPassage(base, 1, 2), 3, 4);
    expect(a.coupes.slice(2)).toEqual([
      { id: 'm0', type: 'manuelle', debut: 1, fin: 2, active: true },
      { id: 'm1', type: 'manuelle', debut: 3, fin: 4, active: true },
    ]);
    expect(basculerCoupe(a, 'm0').coupes.map(c => c.id)).toEqual(['d0', 'l0', 'm1']);
  });
  it('ignore un passage vide', () => {
    expect(couperPassage(base, 2, 2)).toBe(base);
  });
  it('accepte ou refuse une longueur', () => {
    expect(deciderLongueur(base, 'l0', true).coupes[1]).toMatchObject({ active: true, enAttente: false });
    expect(deciderLongueur(base, 'l0', false).coupes[1]).toMatchObject({ active: false, enAttente: false });
    expect(deciderLongueur(base, 'd0', true)).toBe(base);
  });
});

describe('termes', () => {
  it('modifie statut, définition et position', () => {
    const r = modifierTerme(base, 'SSO', { statut: 'valide', definition: 'Nouvelle.', position: 'haut' });
    expect(r.termes[0]).toEqual({ terme: 'SSO', definition: 'Nouvelle.', occurrences: [3.8], statut: 'valide', position: 'haut' });
    expect(modifierTerme(base, 'API', { statut: 'valide' })).toBe(base);
  });
});

describe('chapitres', () => {
  it('renomme', () => {
    expect(renommerChapitre(base, 1, 'Milieu').chapitres[1]).toEqual({ titre: 'Milieu', debut: 5 });
    expect(renommerChapitre(base, 5, 'X')).toBe(base);
  });
  it('déplace une limite entre ses voisines seulement', () => {
    expect(deplacerLimite(base, 1, 7).chapitres[1]!.debut).toBe(7);
    expect(deplacerLimite(base, 1, 12)).toBe(base);
    expect(deplacerLimite(base, 1, 0)).toBe(base);
    expect(deplacerLimite(base, 0, 1)).toBe(base);
    expect(deplacerLimite(base, 2, 30).chapitres[2]!.debut).toBe(30);
  });
  it('fusionne avec le précédent', () => {
    expect(fusionnerChapitre(base, 1).chapitres).toEqual([{ titre: 'Intro', debut: 0 }, { titre: 'Fin', debut: 12 }]);
    expect(fusionnerChapitre(base, 0)).toBe(base);
    expect(fusionnerChapitre(base, 3)).toBe(base);
  });
  it('ajoute un chapitre à sa place', () => {
    expect(ajouterChapitre(base, 8, 'Nouveau').chapitres.map(c => c.debut)).toEqual([0, 5, 8, 12]);
    expect(ajouterChapitre(base, 5, 'Doublon')).toBe(base);
    expect(ajouterChapitre(base, 0, 'Début')).toBe(base);
  });
});
```

- [ ] **Step 2 : Ajouter les tests de `integrerSuggestions` et adapter le test des longueurs** (`noyau/montage-initial.test.ts`)

Remplacer l'import par :

```ts
import { integrerSuggestions, montageInitial } from './montage-initial';
```

Dans le test « active les détections et ajoute les longueurs inactives », la troisième coupe attendue devient :

```ts
      { id: 'l0', type: 'longueur', debut: 10, fin: 20, active: false, enAttente: true },
```

Ajouter à la fin du fichier :

```ts
describe('integrerSuggestions', () => {
  it('ajoute longueurs, termes et chapitres à un montage fait sans suggestions', () => {
    const sans = montageInitial({ ...analyse, suggestions: null }, 'Titre');
    const decide = { ...sans, coupes: sans.coupes.map(c => ({ ...c, active: false })) };
    const r = integrerSuggestions(decide, analyse);
    expect(r.coupes.map(c => [c.id, c.active])).toEqual([['d0', false], ['d1', false], ['l0', false]]);
    expect(r.coupes[2]!.enAttente).toBe(true);
    expect(r.chapitres).toEqual([{ titre: 'Introduction', debut: 0 }, { titre: 'Le SSO', debut: 3 }]);
    expect(r.termes.map(t => t.terme)).toEqual(['SSO', 'API']);
  });
  it('garde les décisions déjà prises', () => {
    const m = montageInitial(analyse, 'T');
    const modifie = {
      ...m,
      chapitres: [{ titre: 'A', debut: 0 }, { titre: 'B', debut: 2 }],
      termes: [{ ...m.termes[0]!, statut: 'ecarte' as const }],
    };
    const r = integrerSuggestions(modifie, analyse);
    expect(r.chapitres).toEqual(modifie.chapitres);
    expect(r.coupes).toHaveLength(3);
    expect(r.termes.map(t => [t.terme, t.statut])).toEqual([['SSO', 'ecarte'], ['API', 'valide']]);
  });
});
```

- [ ] **Step 3 : Vérifier qu'ils échouent**

Run: `npm test -- noyau/edition.test.ts noyau/montage-initial.test.ts`
Expected: FAIL (`./edition` introuvable, `integrerSuggestions` non exporté, `enAttente` absent).

- [ ] **Step 4 : Ajouter `enAttente` à `Coupe`** (`noyau/types.ts`)

```ts
export interface Coupe {
  id: string;
  type: TypeCoupe;
  debut: number;
  fin: number;
  active: boolean;
  // Suggestion de longueur pas encore acceptée ni refusée.
  enAttente?: boolean;
}
```

- [ ] **Step 5 : Réécrire `noyau/montage-initial.ts`**

```ts
import type { Analyse, Chapitre, Coupe, Montage, Terme } from './types';

function coupesLongueur(analyse: Analyse): Coupe[] {
  return (analyse.suggestions?.longueurs ?? []).map(l => ({
    id: l.id, type: 'longueur' as const, debut: l.debut, fin: l.fin, active: false, enAttente: true,
  }));
}

function chapitresSuggeres(analyse: Analyse, titre: string): Chapitre[] {
  const s = analyse.suggestions;
  return s && s.chapitres.length > 0
    ? [...s.chapitres].sort((a, b) => a.debut - b.debut).map((c, i) => ({ titre: c.titre, debut: i === 0 ? 0 : c.debut }))
    : [{ titre, debut: 0 }];
}

function termesSuggeres(analyse: Analyse): Terme[] {
  return (analyse.suggestions?.termes ?? []).map(t => ({
    terme: t.terme,
    definition: t.definition,
    occurrences: [...t.occurrences],
    statut: t.origine === 'glossaire' ? 'valide' : 'a-valider',
    position: 'bas',
  }));
}

export function montageInitial(analyse: Analyse, titre: string): Montage {
  const coupes: Coupe[] = [
    ...analyse.detections.map(d => ({ id: d.id, type: d.type, debut: d.debut, fin: d.fin, active: !d.paroles })),
    ...coupesLongueur(analyse),
  ];
  return { version: 1, titre, coupes, chapitres: chapitresSuggeres(analyse, titre), termes: termesSuggeres(analyse) };
}

// Après une relance des suggestions : ajoute ce qui manque sans toucher aux décisions déjà prises.
// Les chapitres proposés ne remplacent qu'un montage resté à un seul chapitre.
export function integrerSuggestions(montage: Montage, analyse: Analyse): Montage {
  const ids = new Set(montage.coupes.map(c => c.id));
  const connus = new Set(montage.termes.map(t => t.terme.toLowerCase()));
  const seul = montage.chapitres.length === 1 ? montage.chapitres[0] : undefined;
  return {
    ...montage,
    coupes: [...montage.coupes, ...coupesLongueur(analyse).filter(c => !ids.has(c.id))],
    chapitres: seul ? chapitresSuggeres(analyse, seul.titre) : montage.chapitres,
    termes: [...montage.termes, ...termesSuggeres(analyse).filter(t => !connus.has(t.terme.toLowerCase()))],
  };
}
```

- [ ] **Step 6 : Implémenter `noyau/edition.ts`**

```ts
import type { Montage, Terme } from './types';

// Opérations du studio : chacune renvoie un nouveau montage sans modifier l'original.
// Une opération impossible renvoie le même objet, ce qui évite un enregistrement inutile.

// Rétablit un passage coupé ou le recoupe ; une coupe manuelle rétablie disparaît.
export function basculerCoupe(m: Montage, id: string): Montage {
  const coupe = m.coupes.find(c => c.id === id);
  if (!coupe || coupe.enAttente) return m;
  if (coupe.type === 'manuelle' && coupe.active) return { ...m, coupes: m.coupes.filter(c => c.id !== id) };
  return { ...m, coupes: m.coupes.map(c => (c.id === id ? { ...c, active: !c.active } : c)) };
}

export function couperPassage(m: Montage, debut: number, fin: number): Montage {
  if (!(fin > debut)) return m;
  const numeros = m.coupes
    .filter(c => c.type === 'manuelle')
    .map(c => Number(c.id.slice(1)))
    .filter(n => Number.isInteger(n));
  const id = `m${numeros.length > 0 ? Math.max(...numeros) + 1 : 0}`;
  return { ...m, coupes: [...m.coupes, { id, type: 'manuelle', debut, fin, active: true }] };
}

export function deciderLongueur(m: Montage, id: string, accepter: boolean): Montage {
  if (!m.coupes.some(c => c.id === id && c.type === 'longueur')) return m;
  return { ...m, coupes: m.coupes.map(c => (c.id === id ? { ...c, active: accepter, enAttente: false } : c)) };
}

export type ChangementTerme = Partial<Pick<Terme, 'definition' | 'statut' | 'position'>>;

export function modifierTerme(m: Montage, terme: string, changement: ChangementTerme): Montage {
  if (!m.termes.some(t => t.terme === terme)) return m;
  return { ...m, termes: m.termes.map(t => (t.terme === terme ? { ...t, ...changement } : t)) };
}

// Les chapitres sont triés par début et le premier commence à 0.
export function renommerChapitre(m: Montage, index: number, titre: string): Montage {
  if (!m.chapitres[index]) return m;
  return { ...m, chapitres: m.chapitres.map((c, i) => (i === index ? { ...c, titre } : c)) };
}

// Le premier chapitre reste à 0 ; une autre limite ne peut pas atteindre ses voisines.
export function deplacerLimite(m: Montage, index: number, debut: number): Montage {
  const precedent = m.chapitres[index - 1];
  const suivant = m.chapitres[index + 1];
  if (!precedent || !m.chapitres[index]) return m;
  if (debut <= precedent.debut || (suivant && debut >= suivant.debut)) return m;
  return { ...m, chapitres: m.chapitres.map((c, i) => (i === index ? { ...c, debut } : c)) };
}

// Le chapitre rejoint le précédent.
export function fusionnerChapitre(m: Montage, index: number): Montage {
  if (index <= 0 || index >= m.chapitres.length) return m;
  return { ...m, chapitres: m.chapitres.filter((_, i) => i !== index) };
}

export function ajouterChapitre(m: Montage, debut: number, titre: string): Montage {
  if (debut <= 0 || m.chapitres.some(c => c.debut === debut)) return m;
  return { ...m, chapitres: [...m.chapitres, { titre, debut }].sort((a, b) => a.debut - b.debut) };
}
```

- [ ] **Step 7 : Vérifier**

Run: `npm test` puis `npm run typecheck`
Expected: tous les tests PASS (y compris `noyau/edition.test.ts`, `noyau/montage-initial.test.ts`, `remotion/scripts/tournage.test.ts`), typecheck sans erreur.

- [ ] **Step 8 : Commit**

```bash
git add noyau/types.ts noyau/montage-initial.ts noyau/montage-initial.test.ts noyau/edition.ts noyau/edition.test.ts
git commit -m "Opérations de montage du studio, longueurs en attente, intégration des suggestions relancées

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2 : Vérifications avant rendu et glossaire

**Files:**
- Create: `noyau/verifications.ts`, `noyau/glossaire.ts`
- Test: `noyau/verifications.test.ts`, `noyau/glossaire.test.ts`

**Interfaces:**
- Consumes: `Montage`, `Terme` (`noyau/types.ts`), `Coupe.enAttente` (Task 1).
- Produces:
  - `verifierAvantRendu(m: Montage, definitionMax: number): string[]` (phrases affichées telles quelles, dans l'ordre : titre, chapitres, termes, longueurs)
  - `interface EntreeGlossaire { terme: string; definition: string }`, `interface Glossaire { termes: EntreeGlossaire[] }`
  - `majGlossaire(g: Glossaire, termes: Terme[]): Glossaire`

- [ ] **Step 1 : Écrire les tests** (`noyau/verifications.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import type { Montage } from './types';
import { verifierAvantRendu } from './verifications';

const pret: Montage = {
  version: 1,
  titre: 'Essai',
  coupes: [{ id: 'l0', type: 'longueur', debut: 1, fin: 2, active: true, enAttente: false }],
  chapitres: [{ titre: 'Intro', debut: 0 }],
  termes: [
    { terme: 'SSO', definition: 'Déf.', occurrences: [], statut: 'valide', position: 'bas' },
    { terme: 'API', definition: '', occurrences: [], statut: 'ecarte', position: 'bas' },
  ],
};

describe('verifierAvantRendu', () => {
  it('accepte un montage prêt', () => {
    expect(verifierAvantRendu(pret, 160)).toEqual([]);
  });
  it('liste chaque problème', () => {
    const terme = pret.termes[0]!;
    const m: Montage = {
      ...pret,
      titre: ' ',
      chapitres: [{ titre: 'Intro', debut: 0 }, { titre: '', debut: 5 }],
      coupes: [...pret.coupes, { id: 'l1', type: 'longueur', debut: 3, fin: 4, active: false, enAttente: true }],
      termes: [
        { ...terme, definition: 'x'.repeat(161) },
        { ...terme, terme: 'IA', definition: ' ' },
        { ...terme, terme: 'Web', statut: 'a-valider' },
      ],
    };
    expect(verifierAvantRendu(m, 160)).toEqual([
      'La vidéo complète n’a pas de titre.',
      'Le chapitre 2 n’a pas de titre.',
      'La définition de « SSO » dépasse 160 caractères.',
      'La définition de « IA » est vide.',
      'Le terme « Web » n’est ni validé ni écarté.',
      '1 suggestion(s) de longueur en attente.',
    ]);
  });
});
```

(`noyau/glossaire.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { majGlossaire } from './glossaire';
import type { Terme } from './types';

describe('majGlossaire', () => {
  it('ajoute les termes validés et met à jour les définitions sans tenir compte de la casse', () => {
    const g = { termes: [{ terme: 'sso', definition: 'Ancienne.' }, { terme: 'API', definition: 'Interface.' }] };
    const termes: Terme[] = [
      { terme: 'SSO', definition: 'Nouvelle.', occurrences: [], statut: 'valide', position: 'bas' },
      { terme: 'IA', definition: 'Intelligence artificielle.', occurrences: [], statut: 'valide', position: 'haut' },
      { terme: 'Web', definition: 'Écarté.', occurrences: [], statut: 'ecarte', position: 'bas' },
    ];
    expect(majGlossaire(g, termes)).toEqual({
      termes: [
        { terme: 'sso', definition: 'Nouvelle.' },
        { terme: 'API', definition: 'Interface.' },
        { terme: 'IA', definition: 'Intelligence artificielle.' },
      ],
    });
    expect(g.termes[0]!.definition).toBe('Ancienne.');
  });
});
```

- [ ] **Step 2 : Vérifier qu'ils échouent**

Run: `npm test -- noyau/verifications.test.ts noyau/glossaire.test.ts`
Expected: FAIL (modules introuvables).

- [ ] **Step 3 : Implémenter `noyau/verifications.ts`**

```ts
import type { Montage } from './types';

// Conditions du rendu final (spec §7) : chaque problème est une phrase affichée telle quelle.
export function verifierAvantRendu(m: Montage, definitionMax: number): string[] {
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
  return problemes;
}
```

- [ ] **Step 4 : Implémenter `noyau/glossaire.ts`**

```ts
import type { Terme } from './types';

export interface EntreeGlossaire {
  terme: string;
  definition: string;
}

export interface Glossaire {
  termes: EntreeGlossaire[];
}

// Les termes validés sont ajoutés ou mis à jour, sans tenir compte de la casse comme le pipeline.
export function majGlossaire(g: Glossaire, termes: Terme[]): Glossaire {
  const entrees = g.termes.map(e => ({ ...e }));
  for (const t of termes) {
    if (t.statut !== 'valide') continue;
    const existante = entrees.find(e => e.terme.toLowerCase() === t.terme.toLowerCase());
    if (existante) existante.definition = t.definition;
    else entrees.push({ terme: t.terme, definition: t.definition });
  }
  return { ...g, termes: entrees };
}
```

- [ ] **Step 5 : Vérifier que les tests passent**

Run: `npm test -- noyau/verifications.test.ts noyau/glossaire.test.ts`
Expected: PASS.

- [ ] **Step 6 : Commit**

```bash
git add noyau/verifications.ts noyau/verifications.test.ts noyau/glossaire.ts noyau/glossaire.test.ts
git commit -m "Vérifications avant rendu et mise à jour du glossaire

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3 : Suivi d'un rendu en tâche de fond

**Files:**
- Create: `studio/commun.ts`, `studio/serveur/suivi-rendu.ts`
- Modify: `tsconfig.json` (inclure `studio/`)
- Test: `studio/serveur/suivi-rendu.test.ts`

**Interfaces:**
- Consumes: `ResultatRendu` (`remotion/scripts/rendu.ts`), `Analyse`, `Montage`, `Reglages`, `StatutEpisode` (`noyau/types.ts`).
- Produces (`studio/commun.ts`) :
  - `interface ResumeTournage { nom: string; titre: string; statut: StatutEpisode | null; message: string | null; analyseFaite: boolean }`
  - `interface DetailTournage extends ResumeTournage { analyse: Analyse; montage: Montage; montageEnregistre: boolean; reglages: Reglages; sourceUrl: string }`
  - `interface EtatRendu { nom: string | null; enCours: boolean; fichier: string | null; progression: number; resultats: ResultatRendu[]; erreur: string | null }` — `fichier` et `resultats[].fichier` sont des noms de fichier seuls (`episode-01-intro.mp4`), jamais des chemins.
- Produces (`studio/serveur/suivi-rendu.ts`) :
  - `type TravailRendu = (onProgression: (fichier: string, progression: number) => void) => Promise<ResultatRendu[]>`
  - `class SuiviRendu { etat(): EtatRendu; lancer(nom: string, travail: TravailRendu): boolean; attendre(): Promise<void> }` — `lancer` renvoie `false` si un rendu est en cours ; `etat()` renvoie une copie.

- [ ] **Step 1 : Inclure `studio/` dans `tsconfig.json`**

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
  "include": [
    "noyau/**/*.ts", "remotion/**/*.ts", "remotion/**/*.tsx", "studio/**/*.ts", "studio/**/*.tsx",
    "vitest.config.ts", "vitest.rendu.config.ts"
  ]
}
```

- [ ] **Step 2 : Écrire `studio/commun.ts`**

```ts
import type { Analyse, Montage, Reglages, StatutEpisode } from '../noyau/types';
import type { ResultatRendu } from '../remotion/scripts/rendu';

// Données échangées entre le serveur du studio et l'interface.

export interface ResumeTournage {
  nom: string;
  titre: string;
  statut: StatutEpisode | null;
  message: string | null;
  analyseFaite: boolean;
}

export interface DetailTournage extends ResumeTournage {
  analyse: Analyse;
  // montage.json, ou le montage par défaut tant qu'il n'a jamais été enregistré.
  montage: Montage;
  montageEnregistre: boolean;
  reglages: Reglages;
  sourceUrl: string;
}

// Les fichiers sont désignés par leur nom seul (episode-01-intro.mp4).
export interface EtatRendu {
  nom: string | null;
  enCours: boolean;
  fichier: string | null;
  progression: number;
  resultats: ResultatRendu[];
  erreur: string | null;
}
```

- [ ] **Step 3 : Écrire les tests** (`studio/serveur/suivi-rendu.test.ts`)

```ts
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SuiviRendu } from './suivi-rendu';

describe('SuiviRendu', () => {
  it('suit la progression puis garde les résultats sans les chemins complets', async () => {
    const suivi = new SuiviRendu();
    let finir!: () => void;
    const fichier = path.join('donnees', 'tournages', 'a', 'rendus', 'episode-01-intro.mp4');
    const lance = suivi.lancer('a', async onProgression => {
      onProgression(fichier, 0.5);
      await new Promise<void>(r => { finir = r; });
      return [{ fichier, ok: false, message: 'boum' }];
    });
    expect(lance).toBe(true);
    expect(suivi.etat()).toMatchObject({ nom: 'a', enCours: true, fichier: 'episode-01-intro.mp4', progression: 0.5 });
    expect(suivi.lancer('b', async () => [])).toBe(false);
    finir();
    await suivi.attendre();
    expect(suivi.etat()).toMatchObject({
      nom: 'a', enCours: false, erreur: null,
      resultats: [{ fichier: 'episode-01-intro.mp4', ok: false, message: 'boum' }],
    });
  });
  it('garde l’erreur d’un rendu qui échoue avant de commencer et accepte un nouveau rendu', async () => {
    const suivi = new SuiviRendu();
    suivi.lancer('a', async () => { throw new Error('montage.json absent'); });
    await suivi.attendre();
    expect(suivi.etat()).toMatchObject({ enCours: false, erreur: 'montage.json absent' });
    expect(suivi.lancer('a', async () => [])).toBe(true);
  });
  it('renvoie une copie de son état', () => {
    const suivi = new SuiviRendu();
    suivi.etat().resultats.push({ fichier: 'x', ok: true, message: null });
    expect(suivi.etat().resultats).toEqual([]);
  });
});
```

- [ ] **Step 4 : Vérifier qu'ils échouent**

Run: `npm test -- studio/serveur/suivi-rendu.test.ts`
Expected: FAIL (`./suivi-rendu` introuvable).

- [ ] **Step 5 : Implémenter `studio/serveur/suivi-rendu.ts`**

```ts
import path from 'node:path';
import type { ResultatRendu } from '../../remotion/scripts/rendu';
import type { EtatRendu } from '../commun';

export type TravailRendu = (onProgression: (fichier: string, progression: number) => void) => Promise<ResultatRendu[]>;

// Un seul rendu à la fois ; l'interface interroge l'état régulièrement.
export class SuiviRendu {
  private courant: EtatRendu = { nom: null, enCours: false, fichier: null, progression: 0, resultats: [], erreur: null };
  private promesse: Promise<void> = Promise.resolve();

  etat(): EtatRendu {
    return structuredClone(this.courant);
  }

  lancer(nom: string, travail: TravailRendu): boolean {
    if (this.courant.enCours) return false;
    const etat: EtatRendu = { nom, enCours: true, fichier: null, progression: 0, resultats: [], erreur: null };
    this.courant = etat;
    let rendu: Promise<ResultatRendu[]>;
    try {
      rendu = travail((fichier, progression) => {
        etat.fichier = path.basename(fichier);
        etat.progression = progression;
      });
    } catch (e) {
      rendu = Promise.reject(e);
    }
    this.promesse = rendu
      .then(resultats => {
        etat.resultats = resultats.map(r => ({ ...r, fichier: path.basename(r.fichier) }));
      })
      .catch(e => {
        etat.erreur = e instanceof Error ? e.message : String(e);
      })
      .finally(() => {
        etat.enCours = false;
      });
    return true;
  }

  // Attend la fin du rendu en cours (tests, arrêt du serveur).
  attendre(): Promise<void> {
    return this.promesse;
  }
}
```

- [ ] **Step 6 : Vérifier**

Run: `npm test -- studio/serveur/suivi-rendu.test.ts` puis `npm run typecheck`
Expected: PASS, typecheck sans erreur.

- [ ] **Step 7 : Commit**

```bash
git add tsconfig.json studio/commun.ts studio/serveur/suivi-rendu.ts studio/serveur/suivi-rendu.test.ts
git commit -m "Studio : types partagés et suivi d'un rendu en tâche de fond

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4 : API du studio

**Files:**
- Modify: `remotion/scripts/tournage.ts` (exporter `raisonMontage`)
- Create: `studio/serveur/api.ts`, `studio/serveur/suggestions.ts`
- Test: `studio/serveur/api.test.ts`

**Interfaces:**
- Consumes: `chargerTournage`, `majStatutEpisode`, `urlSource`, `raisonMontage` (`remotion/scripts/tournage.ts`) ; `Cible`, `ResultatRendu` (`remotion/scripts/rendu.ts`) ; `verifierAvantRendu`, `majGlossaire`, `Glossaire` (Task 2) ; `SuiviRendu` (Task 3) ; `ResumeTournage`, `DetailTournage` (Task 3).
- Produces :
  - `interface ConfigApi { racineTournages: string; cheminGlossaire: string; urlFichiers: string; suivi: SuiviRendu; rendre: (dossier: string, cible: Cible, onProgression: (fichier: string, progression: number) => void) => Promise<ResultatRendu[]>; relancerSuggestions: (dossier: string) => Promise<void> }`
  - `creerApi(c: ConfigApi): (req: IncomingMessage, res: ServerResponse) => Promise<boolean>` — renvoie `false` pour tout chemin hors `/api/`.
  - `relancerSuggestions(dossier: string): Promise<void>` (`studio/serveur/suggestions.ts`)
  - Routes (réponses JSON ; erreurs `{ erreur: string, problemes?: string[] }`) :

| Méthode | Chemin | Réponse |
|---|---|---|
| GET | `/api/tournages` | `ResumeTournage[]`, du nom le plus grand au plus petit |
| GET | `/api/tournages/:nom` | `DetailTournage` ; 404 inconnu ; 409 si `chargerTournage` échoue (pas d'analyse…) |
| PUT | `/api/tournages/:nom/montage` | `{ ok: true }` ; 400 montage invalide ; 409 rendu de ce tournage en cours |
| POST | `/api/tournages/:nom/suggestions` | `DetailTournage` relu ; 500 si la relance échoue |
| POST | `/api/tournages/:nom/rendu` corps `{ cible }` | 202 `EtatRendu` ; 400 cible ; 409 rendu en cours ou `montage.json` absent ; 422 `problemes` |
| GET | `/api/rendu` | `EtatRendu` |

- [ ] **Step 1 : Exporter `raisonMontage`** (`remotion/scripts/tournage.ts`)

Remplacer `function raisonMontage(m: unknown): string | null {` par :

```ts
export function raisonMontage(m: unknown): string | null {
```

- [ ] **Step 2 : Écrire les tests** (`studio/serveur/api.test.ts`)

```ts
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import exemple from '../../fixtures/analyse-exemple.json';
import { creerApi, type ConfigApi } from './api';
import { SuiviRendu } from './suivi-rendu';

const MONTAGE_PRET = {
  version: 1,
  titre: 'Essai',
  coupes: [],
  chapitres: [{ titre: 'Intro', debut: 0 }],
  termes: [{ terme: 'SSO', definition: 'Authentification unique.', occurrences: [3.8], statut: 'valide', position: 'bas' }],
};
const EN_VALIDATION = { version: 1, titre: 'A', statut: 'en-validation', message: null };

let racine: string;
let url: string;
let serveur: http.Server;
let config: ConfigApi;

async function tournage(nom: string, fichiers: Record<string, unknown>): Promise<string> {
  const dossier = path.join(racine, 'tournages', nom);
  await mkdir(dossier, { recursive: true });
  for (const [fichier, contenu] of Object.entries(fichiers)) {
    await writeFile(path.join(dossier, fichier), JSON.stringify(contenu), 'utf-8');
  }
  return dossier;
}

const lire = async (chemin: string) => JSON.parse(await readFile(chemin, 'utf-8'));
const json = { 'Content-Type': 'application/json' };
const envoyerMontage = (nom: string, montage: unknown) =>
  fetch(`${url}/api/tournages/${nom}/montage`, { method: 'PUT', headers: json, body: JSON.stringify(montage) });
const demanderRendu = (nom: string, cible: unknown) =>
  fetch(`${url}/api/tournages/${nom}/rendu`, { method: 'POST', headers: json, body: JSON.stringify({ cible }) });

beforeEach(async () => {
  racine = await mkdtemp(path.join(os.tmpdir(), 'pmt-studio-'));
  await mkdir(path.join(racine, 'tournages'));
  config = {
    racineTournages: path.join(racine, 'tournages'),
    cheminGlossaire: path.join(racine, 'glossaire.json'),
    urlFichiers: 'http://127.0.0.1:9999',
    suivi: new SuiviRendu(),
    rendre: vi.fn<ConfigApi['rendre']>(async dossier => [
      { fichier: path.join(dossier, 'rendus', 'video-complete.mp4'), ok: true, message: null },
    ]),
    relancerSuggestions: vi.fn<ConfigApi['relancerSuggestions']>(async () => undefined),
  };
  const api = creerApi(config);
  serveur = http.createServer(async (req, res) => {
    if (!(await api(req, res))) res.writeHead(418).end();
  });
  await new Promise<void>(r => serveur.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await config.suivi.attendre();
  await new Promise<void>(r => serveur.close(() => r()));
});

describe('liste des tournages', () => {
  it('liste les tournages du plus récent au plus ancien avec leur statut', async () => {
    await tournage('2026-10-01-a', { 'analyse.json': exemple, 'episode.json': { version: 1, titre: 'A', statut: 'analyse', message: null } });
    await tournage('2026-10-02-b', {});
    expect(await (await fetch(`${url}/api/tournages`)).json()).toEqual([
      { nom: '2026-10-02-b', titre: '2026-10-02-b', statut: null, message: null, analyseFaite: false },
      { nom: '2026-10-01-a', titre: 'A', statut: 'analyse', message: null, analyseFaite: true },
    ]);
  });
  it('laisse passer les requêtes hors API', async () => {
    expect((await fetch(`${url}/index.html`)).status).toBe(418);
  });
});

describe('détail d’un tournage', () => {
  it('propose le montage par défaut tant que montage.json est absent', async () => {
    await tournage('a', { 'analyse.json': exemple });
    const d = await (await fetch(`${url}/api/tournages/a`)).json();
    expect(d.montageEnregistre).toBe(false);
    expect(d.montage.chapitres[0]).toEqual({ titre: 'Introduction', debut: 0 });
    expect(d.analyse.mots).toHaveLength(6);
    expect(d.sourceUrl).toBe('http://127.0.0.1:9999/a/source.mp4');
    expect(d.reglages.definitionMaxCaracteres).toBe(160);
  });
  it('refuse un tournage inconnu ou un nom qui sort du dossier', async () => {
    expect((await fetch(`${url}/api/tournages/inconnu`)).status).toBe(404);
    expect((await fetch(`${url}/api/tournages/..%5Cautre`)).status).toBe(404);
  });
  it('signale un tournage pas encore analysé', async () => {
    await tournage('b', {});
    const r = await fetch(`${url}/api/tournages/b`);
    expect(r.status).toBe(409);
    expect((await r.json()).erreur).toContain('analyse.json absent');
  });
});

describe('enregistrement du montage', () => {
  it('écrit montage.json et passe le tournage en validation', async () => {
    const d = await tournage('a', { 'analyse.json': exemple, 'episode.json': { version: 1, titre: 'A', statut: 'analyse', message: null } });
    expect((await envoyerMontage('a', MONTAGE_PRET)).status).toBe(200);
    expect(await lire(path.join(d, 'montage.json'))).toEqual(MONTAGE_PRET);
    expect(await lire(path.join(d, 'episode.json'))).toEqual(EN_VALIDATION);
    expect((await (await fetch(`${url}/api/tournages/a`)).json()).montageEnregistre).toBe(true);
  });
  it('refuse un montage invalide', async () => {
    await tournage('a', { 'analyse.json': exemple });
    const r = await envoyerMontage('a', { version: 1, titre: 'x' });
    expect(r.status).toBe(400);
    expect((await r.json()).erreur).toContain('coupes doit être une liste');
  });
});

describe('rendu', () => {
  it('exige un montage enregistré', async () => {
    await tournage('a', { 'analyse.json': exemple });
    const r = await demanderRendu('a', 'tout');
    expect(r.status).toBe(409);
    expect((await r.json()).erreur).toContain('montage.json absent');
  });
  it('liste ce qui empêche le rendu', async () => {
    await tournage('a', { 'analyse.json': exemple, 'montage.json': { ...MONTAGE_PRET, chapitres: [{ titre: ' ', debut: 0 }] } });
    const r = await demanderRendu('a', 'tout');
    expect(r.status).toBe(422);
    expect((await r.json()).problemes).toEqual(['Le chapitre 1 n’a pas de titre.']);
    expect(config.rendre).not.toHaveBeenCalled();
  });
  it('refuse une cible inconnue', async () => {
    await tournage('a', { 'analyse.json': exemple, 'montage.json': MONTAGE_PRET });
    expect((await demanderRendu('a', 0)).status).toBe(400);
  });
  it('met à jour le glossaire, valide le tournage et lance le rendu', async () => {
    await writeFile(config.cheminGlossaire, JSON.stringify({
      termes: [{ terme: 'sso', definition: 'Ancienne.' }, { terme: 'API', definition: 'Interface.' }],
    }));
    const d = await tournage('a', { 'analyse.json': exemple, 'montage.json': MONTAGE_PRET, 'episode.json': EN_VALIDATION });
    const r = await demanderRendu('a', 2);
    expect(r.status).toBe(202);
    expect(config.rendre).toHaveBeenCalledWith(d, 2, expect.any(Function));
    expect(await lire(config.cheminGlossaire)).toEqual({
      termes: [{ terme: 'sso', definition: 'Authentification unique.' }, { terme: 'API', definition: 'Interface.' }],
    });
    expect((await lire(path.join(d, 'episode.json'))).statut).toBe('valide');
    await config.suivi.attendre();
    expect(await (await fetch(`${url}/api/rendu`)).json()).toMatchObject({
      nom: 'a', enCours: false, resultats: [{ fichier: 'video-complete.mp4', ok: true, message: null }],
    });
  });
  it('refuse un second rendu et toute modification du montage pendant le rendu', async () => {
    let finir!: () => void;
    vi.mocked(config.rendre).mockImplementationOnce(() => new Promise(r => { finir = () => r([]); }));
    await tournage('a', { 'analyse.json': exemple, 'montage.json': MONTAGE_PRET });
    expect((await demanderRendu('a', 'tout')).status).toBe(202);
    expect((await envoyerMontage('a', MONTAGE_PRET)).status).toBe(409);
    expect((await demanderRendu('a', 'tout')).status).toBe(409);
    await vi.waitFor(() => expect(finir).toBeTypeOf('function'));
    finir();
  });
});

describe('relance des suggestions', () => {
  it('relance puis renvoie le tournage relu', async () => {
    const d = await tournage('a', { 'analyse.json': { ...exemple, suggestions: null, erreurSuggestions: 'API indisponible' } });
    vi.mocked(config.relancerSuggestions).mockImplementationOnce(async dossier => {
      await writeFile(path.join(dossier, 'analyse.json'), JSON.stringify(exemple));
    });
    const r = await fetch(`${url}/api/tournages/a/suggestions`, { method: 'POST' });
    expect(r.status).toBe(200);
    expect((await r.json()).analyse.erreurSuggestions).toBeNull();
    expect(config.relancerSuggestions).toHaveBeenCalledWith(d);
  });
  it('signale l’échec de la relance', async () => {
    await tournage('a', { 'analyse.json': exemple });
    vi.mocked(config.relancerSuggestions).mockRejectedValueOnce(new Error('python introuvable'));
    const r = await fetch(`${url}/api/tournages/a/suggestions`, { method: 'POST' });
    expect(r.status).toBe(500);
    expect((await r.json()).erreur).toContain('python introuvable');
  });
});
```

- [ ] **Step 3 : Vérifier qu'ils échouent**

Run: `npm test -- studio/serveur/api.test.ts`
Expected: FAIL (`./api` introuvable).

- [ ] **Step 4 : Implémenter `studio/serveur/api.ts`**

```ts
import { existsSync, statSync } from 'node:fs';
import { readdir, readFile, rename, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { majGlossaire, type Glossaire } from '../../noyau/glossaire';
import type { StatutEpisode } from '../../noyau/types';
import { verifierAvantRendu } from '../../noyau/verifications';
import type { Cible, ResultatRendu } from '../../remotion/scripts/rendu';
import { chargerTournage, majStatutEpisode, raisonMontage, urlSource, type Tournage } from '../../remotion/scripts/tournage';
import type { DetailTournage, EtatRendu, ResumeTournage } from '../commun';
import type { SuiviRendu } from './suivi-rendu';

export interface ConfigApi {
  racineTournages: string;
  cheminGlossaire: string;
  // Serveur de fichiers qui sert source.mp4 au lecteur.
  urlFichiers: string;
  suivi: SuiviRendu;
  rendre: (dossier: string, cible: Cible, onProgression: (fichier: string, progression: number) => void) => Promise<ResultatRendu[]>;
  relancerSuggestions: (dossier: string) => Promise<void>;
}

class ErreurHttp extends Error {
  constructor(readonly statut: number, message: string, readonly problemes?: string[]) {
    super(message);
  }
}

const STATUTS: StatutEpisode[] = ['analyse', 'en-validation', 'valide', 'rendu', 'erreur'];
const TAILLE_MAX = 50_000_000;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function repondre(res: ServerResponse, statut: number, corps: unknown): void {
  res.writeHead(statut, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(corps));
}

async function lireCorps(req: IncomingMessage): Promise<unknown> {
  const morceaux: Buffer[] = [];
  let taille = 0;
  for await (const morceau of req as AsyncIterable<Buffer>) {
    taille += morceau.length;
    if (taille > TAILLE_MAX) throw new ErreurHttp(413, 'Requête trop volumineuse.');
    morceaux.push(morceau);
  }
  try {
    return JSON.parse(Buffer.concat(morceaux).toString('utf-8'));
  } catch {
    throw new ErreurHttp(400, 'JSON invalide.');
  }
}

async function ecrireJson(chemin: string, valeur: unknown): Promise<void> {
  const temporaire = `${chemin}.tmp`;
  await writeFile(temporaire, JSON.stringify(valeur, null, 2), 'utf-8');
  await rename(temporaire, chemin);
}

async function lireEpisode(dossier: string): Promise<{ titre: string | null; statut: StatutEpisode | null; message: string | null }> {
  try {
    const lu: unknown = JSON.parse(await readFile(path.join(dossier, 'episode.json'), 'utf-8'));
    if (lu && typeof lu === 'object' && !Array.isArray(lu)) {
      const e = lu as Record<string, unknown>;
      return {
        titre: typeof e.titre === 'string' ? e.titre : null,
        statut: STATUTS.includes(e.statut as StatutEpisode) ? (e.statut as StatutEpisode) : null,
        message: typeof e.message === 'string' ? e.message : null,
      };
    }
  } catch {
    // absent ou illisible : tournage sans statut
  }
  return { titre: null, statut: null, message: null };
}

async function resume(dossier: string): Promise<ResumeTournage> {
  const nom = path.basename(dossier);
  const e = await lireEpisode(dossier);
  return { nom, titre: e.titre ?? nom, statut: e.statut, message: e.message, analyseFaite: existsSync(path.join(dossier, 'analyse.json')) };
}

async function lireGlossaire(chemin: string): Promise<Glossaire> {
  if (!existsSync(chemin)) return { termes: [] };
  try {
    const g: unknown = JSON.parse(await readFile(chemin, 'utf-8'));
    if (g && typeof g === 'object' && Array.isArray((g as Glossaire).termes)) return g as Glossaire;
  } catch {
    // signalé ci-dessous
  }
  throw new ErreurHttp(500, 'glossaire.json illisible : corrigez-le avant de lancer le rendu.');
}

function lireCible(corps: unknown): Cible {
  const v = corps && typeof corps === 'object' ? (corps as Record<string, unknown>).cible : undefined;
  if (v === 'tout' || v === 'complete') return v;
  if (typeof v === 'number' && Number.isInteger(v) && v >= 1) return v;
  throw new ErreurHttp(400, 'cible attendue : « tout », « complete » ou un numéro d’épisode.');
}

export function creerApi(c: ConfigApi): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  function dossierDe(nomEncode: string): string {
    let nom: string;
    try {
      nom = decodeURIComponent(nomEncode);
    } catch {
      throw new ErreurHttp(404, 'Tournage introuvable.');
    }
    const dossier = path.join(c.racineTournages, nom);
    if (nom.startsWith('.') || /[\\/]/.test(nom) || !statSync(dossier, { throwIfNoEntry: false })?.isDirectory()) {
      throw new ErreurHttp(404, `Tournage introuvable : ${nom}`);
    }
    return dossier;
  }

  async function charger(dossier: string, brouillon: boolean): Promise<Tournage> {
    try {
      return await chargerTournage(dossier, { brouillon });
    } catch (e) {
      throw new ErreurHttp(409, message(e));
    }
  }

  async function detail(dossier: string): Promise<DetailTournage> {
    const t = await charger(dossier, true);
    return {
      ...(await resume(dossier)),
      analyse: t.analyse,
      montage: t.montage,
      montageEnregistre: existsSync(path.join(dossier, 'montage.json')),
      reglages: t.reglages,
      sourceUrl: urlSource(c.urlFichiers, t.nom),
    };
  }

  async function enregistrerMontage(req: IncomingMessage, dossier: string): Promise<void> {
    const etat = c.suivi.etat();
    if (etat.enCours && etat.nom === path.basename(dossier)) {
      throw new ErreurHttp(409, 'Rendu en cours : le montage ne peut pas être modifié.');
    }
    const montage = await lireCorps(req);
    const probleme = raisonMontage(montage);
    if (probleme) throw new ErreurHttp(400, `montage invalide : ${probleme}`);
    await ecrireJson(path.join(dossier, 'montage.json'), montage);
    if ((await lireEpisode(dossier)).statut !== 'en-validation') await majStatutEpisode(dossier, 'en-validation', null);
  }

  async function lancerRendu(req: IncomingMessage, dossier: string): Promise<EtatRendu> {
    const cible = lireCible(await lireCorps(req));
    if (c.suivi.etat().enCours) throw new ErreurHttp(409, 'Un rendu est déjà en cours.');
    const t = await charger(dossier, false);
    const problemes = verifierAvantRendu(t.montage, t.reglages.definitionMaxCaracteres);
    if (problemes.length > 0) throw new ErreurHttp(422, 'Le montage n’est pas prêt pour le rendu.', problemes);
    await ecrireJson(c.cheminGlossaire, majGlossaire(await lireGlossaire(c.cheminGlossaire), t.montage.termes));
    await majStatutEpisode(dossier, 'valide', null);
    c.suivi.lancer(t.nom, onProgression => c.rendre(dossier, cible, onProgression));
    return c.suivi.etat();
  }

  return async function traiter(req, res) {
    const chemin = new URL(req.url ?? '/', 'http://local').pathname;
    if (!chemin.startsWith('/api/')) return false;
    try {
      const route = /^\/api\/tournages\/([^/]+)(?:\/(montage|rendu|suggestions))?$/.exec(chemin);
      const nom = route?.[1];
      const action = route?.[2];
      if (chemin === '/api/tournages' && req.method === 'GET') {
        const entrees = existsSync(c.racineTournages) ? await readdir(c.racineTournages, { withFileTypes: true }) : [];
        const noms = entrees.filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => e.name).sort().reverse();
        repondre(res, 200, await Promise.all(noms.map(n => resume(path.join(c.racineTournages, n)))));
      } else if (chemin === '/api/rendu' && req.method === 'GET') {
        repondre(res, 200, c.suivi.etat());
      } else if (nom && !action && req.method === 'GET') {
        repondre(res, 200, await detail(dossierDe(nom)));
      } else if (nom && action === 'montage' && req.method === 'PUT') {
        await enregistrerMontage(req, dossierDe(nom));
        repondre(res, 200, { ok: true });
      } else if (nom && action === 'rendu' && req.method === 'POST') {
        repondre(res, 202, await lancerRendu(req, dossierDe(nom)));
      } else if (nom && action === 'suggestions' && req.method === 'POST') {
        const dossier = dossierDe(nom);
        try {
          await c.relancerSuggestions(dossier);
        } catch (e) {
          throw new ErreurHttp(500, `Relance des suggestions impossible : ${message(e)}`);
        }
        repondre(res, 200, await detail(dossier));
      } else {
        repondre(res, 404, { erreur: 'Route inconnue.' });
      }
    } catch (e) {
      if (e instanceof ErreurHttp) repondre(res, e.statut, { erreur: e.message, ...(e.problemes ? { problemes: e.problemes } : {}) });
      else repondre(res, 500, { erreur: message(e) });
    }
    return true;
  };
}
```

- [ ] **Step 5 : Implémenter `studio/serveur/suggestions.ts`**

```ts
import { spawn } from 'node:child_process';
import path from 'node:path';
import { RACINE } from '../../remotion/scripts/tournage';

// Lance « mtpipeline relancer-suggestions » avec le Python de .venv ; l'erreur reprend sa sortie d'erreur.
// Une API Claude indisponible n'est pas un échec : analyse.json garde alors erreurSuggestions.
export function relancerSuggestions(dossier: string): Promise<void> {
  const python = path.join(RACINE, '.venv', 'Scripts', 'python.exe');
  return new Promise((resoudre, rejeter) => {
    const processus = spawn(python, ['-m', 'mtpipeline.cli', 'relancer-suggestions', dossier], {
      cwd: path.join(RACINE, 'pipeline'),
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
    let erreurs = '';
    processus.stderr.on('data', (d: Buffer) => { erreurs += d.toString('utf-8'); });
    processus.on('error', rejeter);
    processus.on('exit', code => (code === 0 ? resoudre() : rejeter(new Error(erreurs.trim() || `code de sortie ${code}`))));
  });
}
```

- [ ] **Step 6 : Vérifier**

Run: `npm test` puis `npm run typecheck`
Expected: tous les tests PASS, typecheck sans erreur.

- [ ] **Step 7 : Commit**

```bash
git add remotion/scripts/tournage.ts studio/serveur/api.ts studio/serveur/api.test.ts studio/serveur/suggestions.ts
git commit -m "Studio : API des tournages, du montage, du rendu et de la relance des suggestions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5 : Serveur principal, Vite et liste des tournages

**Files:**
- Modify: `package.json` (dépendances, script `validation`), `tsconfig.json` (`types`)
- Create: `studio/vite.config.ts`, `studio/index.html`, `studio/serveur/principal.ts`
- Create: `studio/src/main.tsx`, `studio/src/App.tsx`, `studio/src/api.ts`, `studio/src/styles.css`, `studio/src/composants/ListeTournages.tsx`

**Interfaces:**
- Consumes: `creerApi`, `relancerSuggestions` (Task 4) ; `SuiviRendu` (Task 3) ; `rendreTournage` (`remotion/scripts/rendu.ts`) ; `demarrerServeur` (`remotion/scripts/serveur-fichiers.ts`) ; `RACINE` (`remotion/scripts/tournage.ts`).
- Produces (`studio/src/api.ts`) :
  - `class ErreurApi extends Error { statut: number; problemes: string[] }`
  - `api.tournages(): Promise<ResumeTournage[]>`
  - `api.tournage(nom: string): Promise<DetailTournage>`
  - `api.enregistrer(nom: string, montage: Montage): Promise<void>`
  - `api.relancerSuggestions(nom: string): Promise<DetailTournage>`
  - `api.rendre(nom: string, cible: Cible): Promise<EtatRendu>`
  - `api.etatRendu(): Promise<EtatRendu>`
- Produces : `npm run validation` sert le studio sur `http://127.0.0.1:5180` ; routage par ancre (`#/` = liste, `#/<nom encodé>` = écran de montage, ajouté en Task 7).

- [ ] **Step 1 : Installer les dépendances**

Run :
```bash
npm install --save-exact @remotion/player@4.0.533
npm install --save-dev --save-exact vite@7.3.7 @vitejs/plugin-react@5.2.0
```
Expected : `package.json` contient `"@remotion/player": "4.0.533"` dans `dependencies`, `"vite": "7.3.7"` et `"@vitejs/plugin-react": "5.2.0"` dans `devDependencies` ; `npm ls vite` ne montre qu'une version 7.3.7.

Ajouter le script dans `package.json` → `scripts` :

```json
    "validation": "tsx studio/serveur/principal.ts",
```

- [ ] **Step 2 : Types Vite pour l'interface** (`tsconfig.json`)

Remplacer `"types": ["node"]` par :

```json
    "types": ["node", "vite/client"]
```

- [ ] **Step 3 : `studio/vite.config.ts`**

```ts
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const studio = path.dirname(fileURLToPath(import.meta.url));
const racine = path.resolve(studio, '..');

// L'interface importe noyau/, remotion/ et reglages.json hors de studio/ ; public/ fournit le jingle et le tapis.
export default defineConfig({
  root: studio,
  publicDir: path.join(racine, 'public'),
  plugins: [react()],
  server: { fs: { allow: [racine] } },
});
```

- [ ] **Step 4 : `studio/index.html`**

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Studio PMT</title>
  </head>
  <body>
    <div id="racine"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5 : `studio/serveur/principal.ts`**

```ts
import http from 'node:http';
import path from 'node:path';
import { createServer as creerVite } from 'vite';
import { rendreTournage } from '../../remotion/scripts/rendu';
import { demarrerServeur } from '../../remotion/scripts/serveur-fichiers';
import { RACINE } from '../../remotion/scripts/tournage';
import { creerApi } from './api';
import { relancerSuggestions } from './suggestions';
import { SuiviRendu } from './suivi-rendu';

const PORT = 5180;

async function main(): Promise<void> {
  const racineTournages = path.join(RACINE, 'donnees', 'tournages');
  const fichiers = await demarrerServeur(racineTournages);
  const api = creerApi({
    racineTournages,
    cheminGlossaire: path.join(RACINE, 'donnees', 'glossaire.json'),
    urlFichiers: fichiers.url,
    suivi: new SuiviRendu(),
    rendre: (dossier, cible, onProgression) => rendreTournage(dossier, { brouillon: false, cible, onProgression }),
    relancerSuggestions,
  });

  const serveur = http.createServer();
  const vite = await creerVite({
    configFile: path.join(RACINE, 'studio', 'vite.config.ts'),
    server: { middlewareMode: true, hmr: { server: serveur } },
    appType: 'spa',
  });
  serveur.on('request', async (req, res) => {
    // Refuse une page d'un autre site qui viserait le studio par un nom de domaine pointant vers 127.0.0.1.
    if (req.headers.host !== `127.0.0.1:${PORT}` && req.headers.host !== `localhost:${PORT}`) {
      res.writeHead(403).end();
      return;
    }
    if (await api(req, res)) return;
    vite.middlewares(req, res);
  });
  serveur.listen(PORT, '127.0.0.1', () => console.log(`Studio de validation : http://127.0.0.1:${PORT}`));
}

main().catch(e => {
  console.error(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
```

- [ ] **Step 6 : `studio/src/api.ts`**

```ts
import type { Montage } from '../../noyau/types';
import type { Cible } from '../../remotion/scripts/rendu';
import type { DetailTournage, EtatRendu, ResumeTournage } from '../commun';

export class ErreurApi extends Error {
  constructor(readonly statut: number, message: string, readonly problemes: string[]) {
    super(message);
  }
}

async function appeler<T>(url: string, init?: RequestInit): Promise<T> {
  const reponse = await fetch(url, init);
  const corps: unknown = await reponse.json().catch(() => ({}));
  if (!reponse.ok) {
    const c = corps as { erreur?: string; problemes?: string[] };
    throw new ErreurApi(reponse.status, c.erreur ?? `Erreur ${reponse.status}`, c.problemes ?? []);
  }
  return corps as T;
}

const enJson = (methode: string, corps: unknown): RequestInit => ({
  method: methode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(corps),
});

const chemin = (nom: string) => `/api/tournages/${encodeURIComponent(nom)}`;

export const api = {
  tournages: () => appeler<ResumeTournage[]>('/api/tournages'),
  tournage: (nom: string) => appeler<DetailTournage>(chemin(nom)),
  enregistrer: async (nom: string, montage: Montage) => {
    await appeler<{ ok: true }>(`${chemin(nom)}/montage`, enJson('PUT', montage));
  },
  relancerSuggestions: (nom: string) => appeler<DetailTournage>(`${chemin(nom)}/suggestions`, { method: 'POST' }),
  rendre: (nom: string, cible: Cible) => appeler<EtatRendu>(`${chemin(nom)}/rendu`, enJson('POST', { cible })),
  etatRendu: () => appeler<EtatRendu>('/api/rendu'),
};
```

- [ ] **Step 7 : `studio/src/styles.css`**

```css
:root {
  --rouge: #e30520;
  --bleu: #004c99;
  --bleu-gris: #9ab2c9;
  --fond: #f4f6f9;
  --texte: #1d1d1b;
  --discret: #6b7280;
  font-family: 'Open Sans', system-ui, sans-serif;
  color: var(--texte);
  background: var(--fond);
}
body { margin: 0; }
a { color: var(--bleu); }
button {
  font: inherit; font-size: 14px; cursor: pointer; border: 1px solid var(--bleu); background: white;
  color: var(--bleu); border-radius: 4px; padding: 2px 8px;
}
button:disabled { opacity: 0.4; cursor: default; }
button.principal { background: var(--bleu); color: white; padding: 6px 12px; }
.discret { color: var(--discret); font-size: 13px; }
.alerte { background: #fde2e4; color: #8b0010; padding: 8px 12px; border-radius: 6px; }
.page { max-width: 960px; margin: 0 auto; padding: 24px 16px; }
.page h1 { color: var(--bleu); border-bottom: 3px solid var(--rouge); padding-bottom: 8px; }
.liste { width: 100%; border-collapse: collapse; background: white; }
.liste th, .liste td { padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: left; }
.statut { font-size: 12px; padding: 2px 8px; border-radius: 10px; background: var(--bleu-gris); color: white; white-space: nowrap; }
.statut-erreur { background: var(--rouge); }
.statut-rendu, .statut-valide { background: var(--bleu); }

.montage { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); height: 100vh; }
.entete { grid-column: 1 / 3; display: flex; gap: 12px; align-items: center; padding: 8px 16px; background: white; border-bottom: 3px solid var(--rouge); }
.entete input { font: inherit; font-size: 18px; font-weight: 700; flex: 1; border: none; color: var(--bleu); }
.texte { overflow-y: auto; padding: 0 24px 24px; line-height: 1.9; background: white; }
.cote { overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 16px; }
.barre-selection { position: sticky; top: 0; z-index: 1; background: #eef3f8; padding: 6px 8px; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; min-height: 32px; }
.chapitre { display: flex; gap: 8px; align-items: center; margin-top: 24px; border-top: 2px solid var(--bleu); padding-top: 8px; }
.chapitre input { font: inherit; font-weight: 700; color: var(--bleu); font-size: 16px; flex: 1; border: none; border-bottom: 1px dashed var(--bleu-gris); }
.mot { cursor: pointer; border-radius: 2px; }
.mot:hover, .trou:hover { background: #eef3f8; }
.terme { background: #fde68a; }
.choisi { outline: 2px solid var(--bleu); }
.trou { font-size: 12px; padding: 0 4px; margin: 0 2px; border-radius: 8px; border: 1px solid currentColor; cursor: pointer; }
.coupe-active { text-decoration: line-through; opacity: 0.55; }
.coupe-attente { background: #fde2e4; }
.coupe-retablie { text-decoration: underline dotted; }
.type-silence { color: #9ca3af; }
.type-hesitation { color: #d97706; }
.type-repetition { color: #7c3aed; }
.type-prise { color: #be123c; }
.type-longueur { color: var(--rouge); }
.type-manuelle { color: var(--bleu); }

.panneau { background: white; padding: 12px; border-radius: 6px; }
.panneau h3 { margin: 0 0 8px; color: var(--bleu); font-size: 15px; }
.vues { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.vues button.actif { background: var(--bleu); color: white; }
.fiche { border-top: 1px solid #e5e7eb; padding: 8px 0; display: grid; gap: 4px; }
.fiche textarea { width: 100%; box-sizing: border-box; font: inherit; font-size: 14px; }
.actions { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.trop-long { color: var(--rouge); font-size: 13px; }
```

- [ ] **Step 8 : `studio/src/composants/ListeTournages.tsx`**

```tsx
import { type FC, useEffect, useState } from 'react';
import type { StatutEpisode } from '../../../noyau/types';
import type { ResumeTournage } from '../../commun';
import { api } from '../api';

export const LIBELLES_STATUT: Record<StatutEpisode, string> = {
  analyse: 'Analysé',
  'en-validation': 'En validation',
  valide: 'Validé',
  rendu: 'Rendu',
  erreur: 'Erreur',
};

export const ListeTournages: FC = () => {
  const [tournages, setTournages] = useState<ResumeTournage[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    api.tournages().then(setTournages, (e: Error) => setErreur(e.message));
  }, []);

  return (
    <div className="page">
      <h1>Tournages</h1>
      {erreur && <p className="alerte">{erreur}</p>}
      {tournages?.length === 0 && <p>Aucun tournage dans donnees/tournages/.</p>}
      {tournages && tournages.length > 0 && (
        <table className="liste">
          <thead>
            <tr><th>Tournage</th><th>Statut</th><th>Message</th></tr>
          </thead>
          <tbody>
            {tournages.map(t => (
              <tr key={t.nom}>
                <td>
                  {t.analyseFaite ? <a href={`#/${encodeURIComponent(t.nom)}`}>{t.titre}</a> : t.titre}
                  <div className="discret">{t.nom}</div>
                </td>
                <td>
                  {t.statut
                    ? <span className={`statut statut-${t.statut}`}>{LIBELLES_STATUT[t.statut]}</span>
                    : <span className="discret">Non analysé</span>}
                </td>
                <td className="discret">{t.message ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
```

- [ ] **Step 9 : `studio/src/App.tsx` et `studio/src/main.tsx`**

```tsx
// studio/src/App.tsx
import { type FC } from 'react';
import { ListeTournages } from './composants/ListeTournages';

export const App: FC = () => <ListeTournages />;
```

```tsx
// studio/src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('racine')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 10 : Vérifier**

Run: `npm run typecheck` puis `npm test`
Expected: sans erreur, tous les tests PASS.

Run (en arrière-plan) : `npm run validation`
Expected : la console affiche `Studio de validation : http://127.0.0.1:5180`. Ouvrir cette adresse : la page « Tournages » liste `2026-10-essai` (titre « Essai », statut « Analysé ») avec un lien. `curl -s -H "Host: exemple.com:5180" http://127.0.0.1:5180/api/tournages -o /dev/null -w "%{http_code}"` affiche `403`. Arrêter le serveur.

- [ ] **Step 11 : Commit**

```bash
git add package.json package-lock.json tsconfig.json studio/vite.config.ts studio/index.html studio/serveur/principal.ts studio/src
git commit -m "Studio : serveur principal avec Vite, liste des tournages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6 : Logique d'affichage du texte et de l'aperçu

**Files:**
- Create: `studio/src/logique/format.ts`, `studio/src/logique/texte.ts`, `studio/src/logique/apercu.ts`, `studio/src/logique/rendu.ts`
- Test: `studio/src/logique/format.test.ts`, `studio/src/logique/texte.test.ts`, `studio/src/logique/apercu.test.ts`, `studio/src/logique/rendu.test.ts`

**Interfaces:**
- Consumes: `Analyse`, `Montage`, `Coupe`, `Mot` (`noyau/types.ts`) ; `Partie`, `DecisionsEpisode`, `DecisionsVideoComplete` (`noyau/decisions.ts`) ; `sourceVersMonte` (`noyau/temps.ts`) ; `Cible` (`remotion/scripts/rendu.ts`).
- Produces :
  - `horodatage(t: number): string` (`65.4` → `'1:05'`), `duree(t: number): string` (`0.84` → `'0,8 s'`)
  - `type ElementTexte = { genre: 'mot'; mot: Mot; coupe: Coupe | null; terme: string | null } | { genre: 'trou'; coupe: Coupe }`
  - `interface BlocChapitre { index: number; titre: string; debut: number; elements: ElementTexte[] }` — `index` = position du chapitre dans `montage.chapitres`
  - `construireTexte(analyse: Analyse, montage: Montage): BlocChapitre[]` (blocs triés par début)
  - `interface Position { partie: number; image: number }`
  - `positionDansParties(parties: Partie[], t: number, fps: number): Position | null`
  - `imageVideoComplete(d: DecisionsVideoComplete, p: Position): number`, `imageEpisode(d: DecisionsEpisode, p: Position): number`
  - `cibleDuFichier(fichier: string): Cible | null`

Règles : un mot appartient à une coupe si son milieu est dans `[debut, fin]` ; si plusieurs coupes le couvrent, on affiche d'abord une coupe active, puis une en attente, puis une rétablie. Une coupe qui ne couvre le milieu d'aucun mot (silence, hésitation) devient un « trou » placé à son début. Un mot est surligné comme terme si son début est une occurrence (à la milliseconde) d'un terme non écarté.

- [ ] **Step 1 : Écrire les tests**

`studio/src/logique/format.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { duree, horodatage } from './format';

describe('format', () => {
  it('horodate en minutes et secondes', () => {
    expect(horodatage(3.9)).toBe('0:03');
    expect(horodatage(65.4)).toBe('1:05');
    expect(horodatage(3725)).toBe('62:05');
  });
  it('écrit une durée au dixième avec une virgule', () => {
    expect(duree(0.84)).toBe('0,8 s');
    expect(duree(12)).toBe('12,0 s');
  });
});
```

`studio/src/logique/texte.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import exemple from '../../../fixtures/analyse-exemple.json';
import type { Analyse, Montage } from '../../../noyau/types';
import { construireTexte, type ElementTexte } from './texte';

const analyse = exemple as Analyse;
const resume = (e: ElementTexte) =>
  e.genre === 'trou'
    ? `<${e.coupe.id}>`
    : `${e.mot.texte}${e.coupe ? `[${e.coupe.id}]` : ''}${e.terme ? `{${e.terme}}` : ''}`;

describe('construireTexte', () => {
  it('range mots et trous par chapitre, avec coupes et termes', () => {
    const montage: Montage = {
      version: 1,
      titre: 'T',
      coupes: [
        { id: 'd0', type: 'silence', debut: 0, fin: 0.8, active: true },
        { id: 'd1', type: 'hesitation', debut: 1.8, fin: 3.0, active: false },
        { id: 'm0', type: 'manuelle', debut: 1.2, fin: 1.85, active: true },
        { id: 'l0', type: 'longueur', debut: 3.0, fin: 3.8, active: false, enAttente: true },
      ],
      chapitres: [{ titre: 'Le SSO', debut: 3 }, { titre: 'Intro', debut: 0 }],
      termes: [{ terme: 'SSO', definition: 'D', occurrences: [3.8], statut: 'valide', position: 'bas' }],
    };
    expect(construireTexte(analyse, montage).map(b => [b.index, b.titre, b.debut, b.elements.map(resume)])).toEqual([
      [1, 'Intro', 0, ['<d0>', 'Bonjour', 'à[m0]', 'tous.[m0]', '<d1>']],
      [0, 'Le SSO', 3, ["Aujourd'hui,[l0]", 'le[l0]', 'SSO.{SSO}']],
    ]);
  });
  it('affiche la coupe active avant une coupe rétablie et ne surligne pas un terme écarté', () => {
    const montage: Montage = {
      version: 1,
      titre: 'T',
      coupes: [
        { id: 'r', type: 'repetition', debut: 0.8, fin: 1.2, active: false },
        { id: 'a', type: 'manuelle', debut: 0.8, fin: 1.2, active: true },
      ],
      chapitres: [{ titre: 'Seul', debut: 0 }],
      termes: [{ terme: 'SSO', definition: 'D', occurrences: [3.8], statut: 'ecarte', position: 'bas' }],
    };
    const [bloc] = construireTexte(analyse, montage);
    expect(bloc!.elements.map(resume)).toEqual(['Bonjour[a]', 'à', 'tous.', "Aujourd'hui,", 'le', 'SSO.']);
  });
});
```

`studio/src/logique/apercu.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import type { DecisionsEpisode, DecisionsVideoComplete, Partie } from '../../../noyau/decisions';
import { dureeImages, type SegmentImages } from '../../../noyau/images';
import { imageEpisode, imageVideoComplete, positionDansParties } from './apercu';

const partie = (segments: SegmentImages[]): Partie => ({
  titre: 't', segments, encarts: [], encartsRetires: [], duree: dureeImages(segments),
});
// À 30 images/s : la partie 1 garde 0–1 s et 2–3 s de la source, la partie 2 garde 4–5 s.
const p1 = partie([{ debut: 0, fin: 30 }, { debut: 60, fin: 90 }]);
const p2 = partie([{ debut: 120, fin: 150 }]);
const durees = { generique: 120, intertitre: 60, cartonFin: 150, fonduAudio: 1 };

describe('positionDansParties', () => {
  it('trouve la partie et l’image où l’on entend un instant de la source', () => {
    expect(positionDansParties([p1, p2], 0.5, 30)).toEqual({ partie: 0, image: 15 });
    expect(positionDansParties([p1, p2], 2.5, 30)).toEqual({ partie: 0, image: 45 });
    expect(positionDansParties([p1, p2], 4.5, 30)).toEqual({ partie: 1, image: 15 });
  });
  it('renvoie la suite conservée pour un instant coupé, null après la fin', () => {
    expect(positionDansParties([p1, p2], 1.5, 30)).toEqual({ partie: 0, image: 30 });
    expect(positionDansParties([p1, p2], 3.5, 30)).toEqual({ partie: 1, image: 0 });
    expect(positionDansParties([p1, p2], 6, 30)).toBeNull();
  });
});

describe('images de l’aperçu', () => {
  it('ajoute générique, parties précédentes et intertitres dans la vidéo complète', () => {
    const d: DecisionsVideoComplete = { fps: 30, sourceUrl: '', titre: 'T', parties: [p1, p2], durees };
    expect(imageVideoComplete(d, { partie: 0, image: 15 })).toBe(135);
    expect(imageVideoComplete(d, { partie: 1, image: 15 })).toBe(120 + 60 + 60 + 15);
  });
  it('ajoute le générique dans un épisode', () => {
    const d: DecisionsEpisode = { fps: 30, sourceUrl: '', titre: 'T', partie: p2, durees };
    expect(imageEpisode(d, { partie: 1, image: 15 })).toBe(135);
  });
});
```

`studio/src/logique/rendu.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { cibleDuFichier } from './rendu';

describe('cibleDuFichier', () => {
  it('retrouve l’épisode ou la vidéo complète à relancer', () => {
    expect(cibleDuFichier('episode-02-windows-v.mp4')).toBe(2);
    expect(cibleDuFichier('video-complete.mp4')).toBe('complete');
    expect(cibleDuFichier('journal.txt')).toBeNull();
  });
});
```

- [ ] **Step 2 : Vérifier qu'ils échouent**

Run: `npm test -- studio/src/logique`
Expected: FAIL (modules introuvables).

- [ ] **Step 3 : Implémenter `studio/src/logique/format.ts`**

```ts
export function horodatage(t: number): string {
  const secondes = Math.floor(t);
  return `${Math.floor(secondes / 60)}:${String(secondes % 60).padStart(2, '0')}`;
}

export function duree(t: number): string {
  return `${t.toFixed(1).replace('.', ',')} s`;
}
```

- [ ] **Step 4 : Implémenter `studio/src/logique/texte.ts`**

```ts
import type { Analyse, Coupe, Montage, Mot } from '../../../noyau/types';

export type ElementTexte =
  | { genre: 'mot'; mot: Mot; coupe: Coupe | null; terme: string | null }
  | { genre: 'trou'; coupe: Coupe };

// `index` est la position du chapitre dans montage.chapitres (pour les opérations d'édition).
export interface BlocChapitre {
  index: number;
  titre: string;
  debut: number;
  elements: ElementTexte[];
}

// Quand plusieurs coupes couvrent un mot : appliquée, puis en attente, puis rétablie.
function rang(c: Coupe): number {
  return c.active ? 0 : c.enAttente ? 1 : 2;
}

const milieu = (m: Mot) => (m.debut + m.fin) / 2;
const couvre = (c: Coupe, t: number) => t >= c.debut && t <= c.fin;
const cle = (t: number) => Math.round(t * 1000);

export function construireTexte(analyse: Analyse, montage: Montage): BlocChapitre[] {
  const coupes = [...montage.coupes].sort((a, b) => rang(a) - rang(b));
  const termes = new Map<number, string>();
  for (const t of montage.termes) {
    if (t.statut === 'ecarte') continue;
    for (const o of t.occurrences) termes.set(cle(o), t.terme);
  }

  const places: { t: number; element: ElementTexte }[] = analyse.mots.map(mot => ({
    t: mot.debut,
    element: {
      genre: 'mot',
      mot,
      coupe: coupes.find(c => couvre(c, milieu(mot))) ?? null,
      terme: termes.get(cle(mot.debut)) ?? null,
    },
  }));
  for (const coupe of montage.coupes) {
    if (!analyse.mots.some(m => couvre(coupe, milieu(m)))) places.push({ t: coupe.debut, element: { genre: 'trou', coupe } });
  }
  places.sort((a, b) => a.t - b.t);

  const chapitres = montage.chapitres.map((c, index) => ({ ...c, index })).sort((a, b) => a.debut - b.debut);
  return chapitres.map((c, i) => {
    const fin = chapitres[i + 1]?.debut ?? Infinity;
    return {
      index: c.index,
      titre: c.titre,
      debut: c.debut,
      elements: places.filter(p => p.t >= c.debut && p.t < fin).map(p => p.element),
    };
  });
}
```

Note : le premier chapitre commence à 0, donc tout élément y trouve sa place. Si un `montage.json` ancien avait un premier chapitre après 0, les éléments antérieurs n'apparaîtraient pas : ce cas ne se produit pas, `montageInitial` et `deplacerLimite` gardent le premier chapitre à 0.

- [ ] **Step 5 : Implémenter `studio/src/logique/apercu.ts`**

```ts
import type { DecisionsEpisode, DecisionsVideoComplete, Partie } from '../../../noyau/decisions';
import { sourceVersMonte } from '../../../noyau/temps';

export interface Position {
  partie: number;
  image: number;
}

// Partie et image (dans la partie) où l'on entend l'instant t de la source ; un instant coupé
// donne la suite conservée, null s'il n'y a plus rien après.
export function positionDansParties(parties: Partie[], t: number, fps: number): Position | null {
  const image = t * fps;
  for (let i = 0; i < parties.length; i++) {
    const segments = parties[i]!.segments;
    const dernier = segments[segments.length - 1];
    if (dernier && image < dernier.fin) return { partie: i, image: Math.floor(sourceVersMonte(image, segments) ?? 0) };
  }
  return null;
}

export function imageVideoComplete(d: DecisionsVideoComplete, p: Position): number {
  let image = d.durees.generique;
  for (let i = 0; i < p.partie; i++) image += d.parties[i]!.duree + d.durees.intertitre;
  return image + p.image;
}

export function imageEpisode(d: DecisionsEpisode, p: Position): number {
  return d.durees.generique + p.image;
}
```

- [ ] **Step 6 : Implémenter `studio/src/logique/rendu.ts`**

```ts
import type { Cible } from '../../../remotion/scripts/rendu';

// Cible à relancer pour un fichier de rendu : episode-02-….mp4 → 2, video-complete.mp4 → complete.
export function cibleDuFichier(fichier: string): Cible | null {
  if (fichier === 'video-complete.mp4') return 'complete';
  const m = /^episode-(\d+)-/.exec(fichier);
  return m ? Number(m[1]) : null;
}
```

- [ ] **Step 7 : Vérifier que les tests passent**

Run: `npm test -- studio/src/logique` puis `npm run typecheck`
Expected: PASS, typecheck sans erreur.

- [ ] **Step 8 : Commit**

```bash
git add studio/src/logique
git commit -m "Studio : texte horodaté par chapitre, positions dans l'aperçu, cibles de relance

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7 : Écran de montage — texte, aperçu, écoute et enregistrement automatique

**Files:**
- Create: `studio/src/useMontage.ts`, `studio/src/ecoute.tsx`
- Create: `studio/src/composants/Texte.tsx`, `studio/src/composants/Apercu.tsx`, `studio/src/composants/EcranMontage.tsx`
- Modify: `studio/src/App.tsx`

**Interfaces:**
- Consumes: `api`, `ErreurApi` (Task 5) ; `construireTexte`, `ElementTexte`, `horodatage`, `duree`, `positionDansParties`, `imageVideoComplete`, `imageEpisode` (Task 6) ; opérations de `noyau/edition.ts` et `integrerSuggestions` (Task 1) ; `decisionsEpisodes`, `decisionsVideoComplete`, `dureeEpisode`, `dureeVideoComplete` (`noyau/decisions.ts`) ; `Episode`, `VideoComplete` (`remotion/compositions/`) ; `LARGEUR`, `HAUTEUR` (`remotion/charte.ts`).
- Produces :
  - `type EtatEnregistrement = 'a-jour' | 'en-attente' | 'erreur'`
  - `useMontage(nom: string): { detail: DetailTournage | null; montage: Montage | null; erreur: string | null; enregistrement: EtatEnregistrement; modifier: (f: (m: Montage) => Montage) => void; remplacerDetail: (d: DetailTournage) => void }`
  - `useEcoute(sourceUrl: string | null): { ecouter: (debut: number, fin: number) => void; audio: ReactNode }`
  - `type Vue = 'complete' | number` (index d'épisode) ; `interface DemandeLecture { image: number; jeton: number }`
  - `EcranMontage: FC<{ nom: string }>` — en Task 8 et 9, des panneaux sont ajoutés dans son `<aside className="cote">`.

- [ ] **Step 1 : `studio/src/useMontage.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { integrerSuggestions } from '../../noyau/montage-initial';
import type { Montage } from '../../noyau/types';
import type { DetailTournage } from '../commun';
import { api } from './api';

export type EtatEnregistrement = 'a-jour' | 'en-attente' | 'erreur';

const DELAI_ENREGISTREMENT = 400;

// Charge un tournage et enregistre montage.json peu après chaque modification, dans l'ordre des modifications.
export function useMontage(nom: string) {
  const [detail, setDetail] = useState<DetailTournage | null>(null);
  const [montage, setMontage] = useState<Montage | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistrement, setEnregistrement] = useState<EtatEnregistrement>('a-jour');
  const charge = useRef<Montage | null>(null);
  const minuteur = useRef<number | undefined>(undefined);
  const version = useRef(0);
  const file = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    setDetail(null);
    setMontage(null);
    setErreur(null);
    api.tournage(nom).then(
      d => {
        charge.current = d.montage;
        setDetail(d);
        setMontage(d.montage);
      },
      (e: Error) => setErreur(e.message),
    );
  }, [nom]);

  useEffect(() => {
    if (!montage || montage === charge.current) return;
    const v = ++version.current;
    setEnregistrement('en-attente');
    window.clearTimeout(minuteur.current);
    minuteur.current = window.setTimeout(() => {
      file.current = file.current
        .then(() => api.enregistrer(nom, montage))
        .then(
          () => { if (v === version.current) setEnregistrement('a-jour'); },
          () => setEnregistrement('erreur'),
        );
    }, DELAI_ENREGISTREMENT);
  }, [montage, nom]);

  useEffect(() => {
    if (enregistrement === 'a-jour') return;
    const prevenir = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', prevenir);
    return () => window.removeEventListener('beforeunload', prevenir);
  }, [enregistrement]);

  const modifier = useCallback((f: (m: Montage) => Montage) => {
    setMontage(m => (m ? f(m) : m));
  }, []);

  // Après une relance des suggestions : nouvelle analyse, montage complété sans perdre les décisions.
  const remplacerDetail = useCallback((d: DetailTournage) => {
    setDetail(d);
    setMontage(m => (m ? integrerSuggestions(m, d.analyse) : d.montage));
  }, []);

  return { detail, montage, erreur, enregistrement, modifier, remplacerDetail };
}
```

- [ ] **Step 2 : `studio/src/ecoute.tsx`**

```tsx
import { type ReactNode, useCallback, useRef } from 'react';

const MARGE = 0.3;

// Écoute d'un passage de source.mp4 (coupé ou non) avant de décider, sans passer par l'aperçu monté.
export function useEcoute(sourceUrl: string | null): { ecouter: (debut: number, fin: number) => void; audio: ReactNode } {
  const ref = useRef<HTMLAudioElement>(null);
  const arret = useRef(0);

  const ecouter = useCallback((debut: number, fin: number) => {
    const a = ref.current;
    if (!a) return;
    arret.current = fin + MARGE;
    a.currentTime = Math.max(0, debut - MARGE);
    void a.play();
  }, []);

  const audio = sourceUrl ? (
    <audio
      ref={ref}
      src={sourceUrl}
      preload="metadata"
      onTimeUpdate={e => {
        if (e.currentTarget.currentTime >= arret.current) e.currentTarget.pause();
      }}
    />
  ) : null;

  return { ecouter, audio };
}
```

- [ ] **Step 3 : `studio/src/composants/Apercu.tsx`**

```tsx
import { Player, type PlayerRef } from '@remotion/player';
import { type FC, useEffect, useRef } from 'react';
import { dureeEpisode, dureeVideoComplete, type DecisionsEpisode, type DecisionsVideoComplete } from '../../../noyau/decisions';
import { HAUTEUR, LARGEUR } from '../../../remotion/charte';
import { Episode } from '../../../remotion/compositions/Episode';
import { VideoComplete } from '../../../remotion/compositions/VideoComplete';

export type Vue = 'complete' | number;

// Le jeton change à chaque demande, même pour la même image.
export interface DemandeLecture {
  image: number;
  jeton: number;
}

interface Props {
  episodes: DecisionsEpisode[];
  complete: DecisionsVideoComplete;
  vue: Vue;
  onVue: (vue: Vue) => void;
  demande: DemandeLecture | null;
}

// Lecteur Remotion sur les compositions de rendu, recalculé à chaque modification du montage.
export const Apercu: FC<Props> = ({ episodes, complete, vue, onVue, demande }) => {
  const ref = useRef<PlayerRef>(null);
  useEffect(() => {
    if (!demande || !ref.current) return;
    ref.current.seekTo(demande.image);
    ref.current.play();
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
    </section>
  );
};
```

- [ ] **Step 4 : `studio/src/composants/Texte.tsx`**

```tsx
import { type FC, type MouseEvent, useMemo, useState } from 'react';
import {
  ajouterChapitre, basculerCoupe, couperPassage, deplacerLimite, fusionnerChapitre, renommerChapitre,
} from '../../../noyau/edition';
import type { Analyse, Coupe, Montage, TypeCoupe } from '../../../noyau/types';
import { duree, horodatage } from '../logique/format';
import { construireTexte, type ElementTexte } from '../logique/texte';

type Choix = { genre: 'mots'; debut: number; fin: number; rangs: [number, number] } | { genre: 'coupe'; id: string };

interface Props {
  analyse: Analyse;
  montage: Montage;
  modifier: (f: (m: Montage) => Montage) => void;
  ecouter: (debut: number, fin: number) => void;
  lireDansApercu: (t: number) => void;
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
export const Texte: FC<Props> = ({ analyse, montage, modifier, ecouter, lireDansApercu }) => {
  const blocs = useMemo(() => construireTexte(analyse, montage), [analyse, montage]);
  const rangs = useMemo(() => new Map(analyse.mots.map((m, i) => [m.id, i])), [analyse]);
  const coupesDesMots = useMemo(() => {
    const carte = new Map<number, Coupe | null>();
    for (const b of blocs) for (const e of b.elements) if (e.genre === 'mot') carte.set(e.mot.id, e.coupe);
    return carte;
  }, [blocs]);
  const [choix, setChoix] = useState<Choix | null>(null);
  const coupe = choix?.genre === 'coupe' ? montage.coupes.find(c => c.id === choix.id) ?? null : null;
  const paroles = coupe ? analyse.detections.find(d => d.id === coupe.id)?.paroles : undefined;

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
        title={e.terme ?? undefined}
        className={['mot', classeCoupe(e.coupe), e.terme ? 'terme' : '', estChoisi(e) ? 'choisi' : ''].join(' ')}
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
      <div onMouseUp={choisir}>
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
            <p>{b.elements.map(rendreElement)}</p>
          </section>
        ))}
      </div>
    </>
  );
};
```

- [ ] **Step 5 : `studio/src/composants/EcranMontage.tsx`**

```tsx
import { type FC, useMemo, useState } from 'react';
import { decisionsEpisodes, decisionsVideoComplete } from '../../../noyau/decisions';
import { useEcoute } from '../ecoute';
import { imageEpisode, imageVideoComplete, positionDansParties } from '../logique/apercu';
import { type EtatEnregistrement, useMontage } from '../useMontage';
import { Apercu, type DemandeLecture, type Vue } from './Apercu';
import { Texte } from './Texte';

const LIBELLES_ENREGISTREMENT: Record<EtatEnregistrement, string> = {
  'a-jour': 'Enregistré',
  'en-attente': 'Enregistrement…',
  erreur: 'Échec de l’enregistrement : la prochaine modification réessaiera',
};

export const EcranMontage: FC<{ nom: string }> = ({ nom }) => {
  const { detail, montage, erreur, enregistrement, modifier } = useMontage(nom);
  const { ecouter, audio } = useEcoute(detail?.sourceUrl ?? null);
  const [vue, setVue] = useState<Vue>('complete');
  const [demande, setDemande] = useState<DemandeLecture | null>(null);
  const decisions = useMemo(
    () => (detail && montage
      ? {
        episodes: decisionsEpisodes(detail.analyse, montage, detail.reglages, detail.sourceUrl),
        complete: decisionsVideoComplete(detail.analyse, montage, detail.reglages, detail.sourceUrl),
      }
      : null),
    [detail, montage],
  );

  if (erreur) {
    return (
      <div className="page">
        <a href="#/">← Tournages</a>
        <p className="alerte">{erreur}</p>
      </div>
    );
  }
  if (!detail || !montage || !decisions) return <div className="page">Chargement…</div>;

  const lireDansApercu = (t: number) => {
    const fps = detail.analyse.fps;
    if (vue === 'complete') {
      const p = positionDansParties(decisions.complete.parties, t, fps);
      if (p) setDemande({ image: imageVideoComplete(decisions.complete, p), jeton: Date.now() });
      return;
    }
    const p = positionDansParties(decisions.episodes.map(e => e.partie), t, fps);
    const episode = p ? decisions.episodes[p.partie] : undefined;
    if (p && episode) {
      setVue(p.partie);
      setDemande({ image: imageEpisode(episode, p), jeton: Date.now() });
    }
  };

  return (
    <div className="montage">
      <header className="entete">
        <a href="#/">← Tournages</a>
        <input
          value={montage.titre}
          aria-label="Titre de la vidéo complète"
          onChange={e => { const titre = e.target.value; modifier(m => ({ ...m, titre })); }}
        />
        <span className="discret">{LIBELLES_ENREGISTREMENT[enregistrement]}</span>
      </header>
      <main className="texte">
        <Texte analyse={detail.analyse} montage={montage} modifier={modifier} ecouter={ecouter} lireDansApercu={lireDansApercu} />
      </main>
      <aside className="cote">
        <Apercu episodes={decisions.episodes} complete={decisions.complete} vue={vue} onVue={setVue} demande={demande} />
      </aside>
      {audio}
    </div>
  );
};
```

- [ ] **Step 6 : Routage dans `studio/src/App.tsx`**

```tsx
import { type FC, useEffect, useState } from 'react';
import { EcranMontage } from './composants/EcranMontage';
import { ListeTournages } from './composants/ListeTournages';

// #/ : liste des tournages ; #/<nom> : écran de montage.
const tournageDeLAncre = () => decodeURIComponent(window.location.hash.replace(/^#\/?/, ''));

export const App: FC = () => {
  const [nom, setNom] = useState(tournageDeLAncre);
  useEffect(() => {
    const suivre = () => setNom(tournageDeLAncre());
    window.addEventListener('hashchange', suivre);
    return () => window.removeEventListener('hashchange', suivre);
  }, []);
  return nom ? <EcranMontage key={nom} nom={nom} /> : <ListeTournages />;
};
```

- [ ] **Step 7 : Vérifier**

Run: `npm run typecheck` puis `npm test`
Expected: sans erreur, tous les tests PASS.

Vérification dans le navigateur (avec le skill `playwright-skill` ou `webapp-testing`, ou à la main) : `npm run validation`, ouvrir `http://127.0.0.1:5180/#/2026-10-essai`.
Expected :
1. Le texte s'affiche en deux chapitres (« Windows + V… », « There… »), avec les silences et hésitations sous forme de pastilles barrées, les termes (« Windows + V », « Markdown »…) surlignés, les longueurs proposées sur fond rose.
2. L'aperçu « Vidéo complète » joue le générique puis la vidéo montée (si l'image reste noire : ouvrir la console du navigateur, vérifier que `source.mp4` est servi en 206 par le serveur de fichiers).
3. Clic sur une pastille d'hésitation → « Rétablir » → la pastille n'est plus barrée, l'en-tête passe à « Enregistrement… » puis « Enregistré » ; `donnees/tournages/2026-10-essai/montage.json` existe et `episode.json` a le statut `en-validation`. La durée de l'aperçu augmente.
4. « Écouter le passage » joue le passage coupé seul.
5. Sélection de quelques mots à la souris → « Couper » → ils sont barrés (bleu, « coupe manuelle ») ; clic dessus → « Rétablir » les fait disparaître de la liste des coupes.
6. « Lire dans l’aperçu » sur un mot du chapitre 2 positionne le lecteur sur ce mot (après l'intertitre).
7. Renommer un chapitre dans son champ → le titre change dans l'aperçu (intertitre, bouton d'épisode).
8. Recharger la page : les modifications sont toujours là (lues depuis `montage.json`).

Arrêter le serveur. Restaurer l'état du tournage d'essai pour la suite : `rm donnees/tournages/2026-10-essai/montage.json` et remettre `"statut": "analyse"` dans son `episode.json` (ce dossier n'est pas suivi par git).

- [ ] **Step 8 : Commit**

```bash
git add studio/src
git commit -m "Studio : écran de montage avec texte horodaté, aperçu Remotion, écoute et enregistrement automatique

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8 : Termes, longueurs proposées et relance des suggestions

**Files:**
- Create: `studio/src/composants/PanneauTermes.tsx`, `studio/src/composants/PanneauLongueurs.tsx`, `studio/src/composants/BandeauSuggestions.tsx`
- Modify: `studio/src/composants/EcranMontage.tsx`

**Interfaces:**
- Consumes: `modifierTerme`, `deciderLongueur`, `basculerCoupe` (Task 1) ; `api.relancerSuggestions` (Task 5) ; `useMontage().remplacerDetail` (Task 7) ; `horodatage`, `duree` (Task 6).
- Produces :
  - `PanneauTermes: FC<{ termes: Terme[]; definitionMax: number; modifier; ecouter; lireDansApercu }>`
  - `PanneauLongueurs: FC<{ coupes: Coupe[]; suggestions: SuggestionLongueur[]; modifier; ecouter; lireDansApercu }>`
  - `BandeauSuggestions: FC<{ nom: string; erreur: string; onRelance: (d: DetailTournage) => void }>`

- [ ] **Step 1 : `studio/src/composants/PanneauTermes.tsx`**

```tsx
import type { FC } from 'react';
import { modifierTerme, type ChangementTerme } from '../../../noyau/edition';
import type { Montage, StatutTerme, Terme } from '../../../noyau/types';

interface Props {
  termes: Terme[];
  definitionMax: number;
  modifier: (f: (m: Montage) => Montage) => void;
  ecouter: (debut: number, fin: number) => void;
  lireDansApercu: (t: number) => void;
}

const LIBELLES: Record<StatutTerme, string> = { 'a-valider': 'à valider', valide: 'validé', ecarte: 'écarté' };
const ECOUTE_TERME = 3;

export const PanneauTermes: FC<Props> = ({ termes, definitionMax, modifier, ecouter, lireDansApercu }) => (
  <section className="panneau">
    <h3>Termes ({termes.filter(t => t.statut === 'a-valider').length} à valider)</h3>
    {termes.length === 0 && <p className="discret">Aucun terme proposé.</p>}
    {termes.map(t => {
      const premiere = t.occurrences.length > 0 ? Math.min(...t.occurrences) : null;
      const changer = (changement: ChangementTerme) => modifier(m => modifierTerme(m, t.terme, changement));
      return (
        <div key={t.terme} className="fiche">
          <div>
            <strong>{t.terme}</strong> · <span className={t.statut === 'a-valider' ? 'trop-long' : 'discret'}>{LIBELLES[t.statut]}</span>
            <span className="discret"> · {t.occurrences.length} occurrence(s)</span>
          </div>
          <textarea
            rows={2}
            value={t.definition}
            aria-label={`Définition de ${t.terme}`}
            onChange={e => changer({ definition: e.target.value })}
          />
          <div className={t.definition.length > definitionMax ? 'trop-long' : 'discret'}>
            {t.definition.length} / {definitionMax} caractères
          </div>
          <div className="actions">
            <button disabled={t.statut === 'valide'} onClick={() => changer({ statut: 'valide' })}>Valider</button>
            <button disabled={t.statut === 'ecarte'} onClick={() => changer({ statut: 'ecarte' })}>Écarter</button>
            <label>
              <input
                type="checkbox"
                checked={t.position === 'haut'}
                onChange={e => changer({ position: e.target.checked ? 'haut' : 'bas' })}
              />{' '}
              Encart en haut
            </label>
            {premiere !== null && (
              <>
                <button onClick={() => ecouter(premiere, premiere + ECOUTE_TERME)}>Écouter</button>
                <button onClick={() => lireDansApercu(premiere)}>Lire</button>
              </>
            )}
          </div>
        </div>
      );
    })}
  </section>
);
```

- [ ] **Step 2 : `studio/src/composants/PanneauLongueurs.tsx`**

```tsx
import type { FC } from 'react';
import { basculerCoupe, deciderLongueur } from '../../../noyau/edition';
import type { Coupe, Montage, SuggestionLongueur } from '../../../noyau/types';
import { duree, horodatage } from '../logique/format';

interface Props {
  coupes: Coupe[];
  suggestions: SuggestionLongueur[];
  modifier: (f: (m: Montage) => Montage) => void;
  ecouter: (debut: number, fin: number) => void;
  lireDansApercu: (t: number) => void;
}

// Passages trop longs proposés par Claude : rien n'est coupé tant qu'ils ne sont pas acceptés.
export const PanneauLongueurs: FC<Props> = ({ coupes, suggestions, modifier, ecouter, lireDansApercu }) => {
  const longueurs = coupes.filter(c => c.type === 'longueur');
  if (longueurs.length === 0) return null;
  return (
    <section className="panneau">
      <h3>Longueurs proposées ({longueurs.filter(c => c.enAttente).length} en attente)</h3>
      {longueurs.map(c => (
        <div key={c.id} className="fiche">
          <div>
            {horodatage(c.debut)} · {duree(c.fin - c.debut)} ·{' '}
            <strong>{c.enAttente ? 'en attente' : c.active ? 'coupé' : 'gardé'}</strong>
          </div>
          <div className="discret">{suggestions.find(s => s.id === c.id)?.raison}</div>
          <div className="actions">
            {c.enAttente ? (
              <>
                <button onClick={() => modifier(m => deciderLongueur(m, c.id, true))}>Couper</button>
                <button onClick={() => modifier(m => deciderLongueur(m, c.id, false))}>Garder</button>
              </>
            ) : (
              <button onClick={() => modifier(m => basculerCoupe(m, c.id))}>{c.active ? 'Garder finalement' : 'Couper finalement'}</button>
            )}
            <button onClick={() => ecouter(c.debut, c.fin)}>Écouter</button>
            <button onClick={() => lireDansApercu(c.debut)}>Lire</button>
          </div>
        </div>
      ))}
    </section>
  );
};
```

- [ ] **Step 3 : `studio/src/composants/BandeauSuggestions.tsx`**

```tsx
import { type FC, useState } from 'react';
import type { DetailTournage } from '../../commun';
import { api } from '../api';

// Affiché quand l'analyse s'est terminée sans les suggestions de Claude (spec §7).
export const BandeauSuggestions: FC<{ nom: string; erreur: string; onRelance: (d: DetailTournage) => void }> = ({ nom, erreur, onRelance }) => {
  const [enCours, setEnCours] = useState(false);
  const [echec, setEchec] = useState<string | null>(null);
  const relancer = () => {
    setEnCours(true);
    setEchec(null);
    api.relancerSuggestions(nom)
      .then(onRelance, (e: Error) => setEchec(e.message))
      .finally(() => setEnCours(false));
  };
  return (
    <section className="alerte">
      <div>Suggestions de Claude indisponibles : {erreur}</div>
      <div className="actions">
        <button disabled={enCours} onClick={relancer}>{enCours ? 'Relance en cours…' : 'Relancer les suggestions'}</button>
        {echec && <span>{echec}</span>}
      </div>
    </section>
  );
};
```

- [ ] **Step 4 : Ajouter les panneaux à `studio/src/composants/EcranMontage.tsx`**

Ajouter les imports :

```tsx
import { BandeauSuggestions } from './BandeauSuggestions';
import { PanneauLongueurs } from './PanneauLongueurs';
import { PanneauTermes } from './PanneauTermes';
```

Récupérer `remplacerDetail` :

```tsx
  const { detail, montage, erreur, enregistrement, modifier, remplacerDetail } = useMontage(nom);
```

Remplacer le contenu de `<aside className="cote">` par :

```tsx
      <aside className="cote">
        {detail.analyse.erreurSuggestions && (
          <BandeauSuggestions nom={nom} erreur={detail.analyse.erreurSuggestions} onRelance={remplacerDetail} />
        )}
        <Apercu episodes={decisions.episodes} complete={decisions.complete} vue={vue} onVue={setVue} demande={demande} />
        <PanneauLongueurs
          coupes={montage.coupes}
          suggestions={detail.analyse.suggestions?.longueurs ?? []}
          modifier={modifier}
          ecouter={ecouter}
          lireDansApercu={lireDansApercu}
        />
        <PanneauTermes
          termes={montage.termes}
          definitionMax={detail.reglages.definitionMaxCaracteres}
          modifier={modifier}
          ecouter={ecouter}
          lireDansApercu={lireDansApercu}
        />
      </aside>
```

- [ ] **Step 5 : Vérifier**

Run: `npm run typecheck` puis `npm test`
Expected: sans erreur, tous les tests PASS.

Dans le navigateur (`npm run validation`, `http://127.0.0.1:5180/#/2026-10-essai`) :
1. « Termes » liste les termes ; « Valider » sur « Presse-papier » → statut « validé », son encart apparaît dans l'aperçu à sa première occurrence ; « Encart en haut » le place en haut à droite.
2. Allonger une définition au-delà de 160 caractères → compteur rouge.
3. « Écarter » un terme → il n'est plus surligné dans le texte.
4. S'il y a des longueurs proposées : « Couper » → le passage est barré dans le texte et retiré de l'aperçu ; « Garder finalement » le rétablit.
5. Bandeau de relance : copier le dossier d'essai vers `donnees/tournages/2026-10-essai-sans/`, y supprimer `suggestions.json`, `montage.json` et mettre `"suggestions": null, "erreurSuggestions": "test"` dans son `analyse.json` ; ouvrir `#/2026-10-essai-sans` → le bandeau s'affiche ; « Relancer les suggestions » (clé API dans `.env`) → les chapitres et termes proposés apparaissent, le bandeau disparaît. Supprimer ensuite `2026-10-essai-sans/`.

Remettre le tournage d'essai dans son état initial (supprimer `montage.json`, statut `analyse`).

- [ ] **Step 6 : Commit**

```bash
git add studio/src/composants
git commit -m "Studio : validation des termes, décisions sur les longueurs, relance des suggestions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9 : Rendu depuis le studio et mode d'emploi

**Files:**
- Create: `studio/src/composants/PanneauRendu.tsx`, `docs/studio.md`
- Modify: `studio/src/composants/EcranMontage.tsx`

**Interfaces:**
- Consumes: `verifierAvantRendu` (Task 2) ; `api.enregistrer`, `api.rendre`, `api.etatRendu`, `ErreurApi` (Task 5) ; `cibleDuFichier` (Task 6) ; `EtatEnregistrement` (Task 7) ; `EtatRendu` (Task 3).
- Produces : `PanneauRendu: FC<{ nom: string; montage: Montage; definitionMax: number; enregistrement: EtatEnregistrement }>`.

- [ ] **Step 1 : `studio/src/composants/PanneauRendu.tsx`**

```tsx
import { type FC, useEffect, useMemo, useState } from 'react';
import type { Montage } from '../../../noyau/types';
import { verifierAvantRendu } from '../../../noyau/verifications';
import type { Cible } from '../../../remotion/scripts/rendu';
import type { EtatRendu } from '../../commun';
import { api, ErreurApi } from '../api';
import { cibleDuFichier } from '../logique/rendu';
import type { EtatEnregistrement } from '../useMontage';

interface Props {
  nom: string;
  montage: Montage;
  definitionMax: number;
  enregistrement: EtatEnregistrement;
}

const INTERVALLE_SUIVI = 1000;

// Vérifications, puis rendu de la vidéo complète et de chaque épisode avec suivi ; relance d'un rendu en échec.
export const PanneauRendu: FC<Props> = ({ nom, montage, definitionMax, enregistrement }) => {
  const [etat, setEtat] = useState<EtatRendu | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [problemesServeur, setProblemesServeur] = useState<string[]>([]);
  const problemes = useMemo(() => verifierAvantRendu(montage, definitionMax), [montage, definitionMax]);
  const enCours = etat?.enCours ?? false;

  useEffect(() => {
    api.etatRendu().then(setEtat, () => undefined);
  }, []);
  useEffect(() => {
    if (!enCours) return;
    const minuteur = window.setInterval(() => api.etatRendu().then(setEtat, () => undefined), INTERVALLE_SUIVI);
    return () => window.clearInterval(minuteur);
  }, [enCours]);

  const lancer = async (cible: Cible) => {
    setErreur(null);
    setProblemesServeur([]);
    try {
      // Le serveur rend montage.json : on s'assure qu'il contient la dernière version.
      await api.enregistrer(nom, montage);
      setEtat(await api.rendre(nom, cible));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
      if (e instanceof ErreurApi) setProblemesServeur(e.problemes);
    }
  };

  const ici = etat?.nom === nom ? etat : null;
  return (
    <section className="panneau">
      <h3>Rendu</h3>
      {problemes.length > 0 && (
        <>
          <p className="discret">À régler avant le rendu :</p>
          <ul>{problemes.map(p => <li key={p}>{p}</li>)}</ul>
        </>
      )}
      <button
        className="principal"
        disabled={problemes.length > 0 || enCours || enregistrement === 'en-attente'}
        onClick={() => void lancer('tout')}
      >
        Valider et lancer le rendu
      </button>
      {enCours && !ici && <p className="discret">Rendu en cours pour « {etat?.nom} ».</p>}
      {erreur && <p className="alerte">{erreur}</p>}
      {problemesServeur.length > 0 && <ul>{problemesServeur.map(p => <li key={p}>{p}</li>)}</ul>}
      {ici?.enCours && (
        <p>
          {ici.fichier ?? 'Préparation…'} : {Math.round(ici.progression * 100)} %
        </p>
      )}
      {ici?.erreur && <p className="alerte">{ici.erreur}</p>}
      {ici && !ici.enCours && ici.resultats.map(r => {
        const cible = cibleDuFichier(r.fichier);
        return (
          <div key={r.fichier} className="actions">
            <span className={r.ok ? '' : 'trop-long'}>{r.ok ? '✓' : '✗'} {r.fichier}{r.message ? ` : ${r.message}` : ''}</span>
            {!r.ok && cible !== null && <button onClick={() => void lancer(cible)}>Relancer</button>}
          </div>
        );
      })}
      {ici && !ici.enCours && ici.resultats.length > 0 && (
        <p className="discret">Fichiers dans donnees/tournages/{nom}/rendus/ (journal : journal.txt).</p>
      )}
    </section>
  );
};
```

- [ ] **Step 2 : Ajouter le panneau à `studio/src/composants/EcranMontage.tsx`**

Ajouter l'import :

```tsx
import { PanneauRendu } from './PanneauRendu';
```

Dans `<aside className="cote">`, juste après l'`<Apercu … />`, ajouter :

```tsx
        <PanneauRendu
          nom={nom}
          montage={montage}
          definitionMax={detail.reglages.definitionMaxCaracteres}
          enregistrement={enregistrement}
        />
```

- [ ] **Step 3 : `docs/studio.md`**

```markdown
# Studio de validation

Le studio sert à relire un tournage analysé, corriger les décisions de montage et lancer les rendus.

## Lancer

1. Analyser le tournage (voir le pipeline) : `cd pipeline; ..\.venv\Scripts\python -m mtpipeline.cli analyser ..\donnees\tournages\<dossier> --titre "<titre>"`.
2. À la racine du projet : `npm run validation`, puis ouvrir http://127.0.0.1:5180.

## Écran de montage

- **Texte** (à gauche) : les passages coupés sont barrés, avec une couleur par type (silence, hésitation, répétition, prise ratée, longueur, coupe manuelle). Les termes à définir sont surlignés en jaune, les longueurs proposées sur fond rose.
  - Cliquer un passage coupé : le rétablir (ou le recouper), l'écouter seul, le retrouver dans l'aperçu.
  - Cliquer un mot ou sélectionner un passage à la souris : le couper, l'écouter, le lire dans l'aperçu, y commencer un nouveau chapitre.
  - Chaque chapitre a son titre modifiable, « Commencer ici » (déplace son début sur le passage choisi) et « Fusionner avec le précédent ».
- **Aperçu** (à droite) : la vidéo complète ou chaque épisode, avec habillage, recalculés à chaque modification.
- **Longueurs proposées** : rien n'est coupé tant que la suggestion n'est pas acceptée (« Couper ») ou refusée (« Garder »).
- **Termes** : valider, écarter, corriger la définition (160 caractères au plus), placer l'encart en haut.

Chaque modification est enregistrée dans `montage.json` ; `analyse.json` n'est jamais modifié.

## Rendu

« Valider et lancer le rendu » est disponible quand la vidéo et chaque chapitre ont un titre, chaque terme est validé ou écarté et aucune longueur n'est en attente. Le studio ajoute alors les définitions validées à `donnees/glossaire.json`, passe le tournage au statut « Validé » et rend la vidéo complète et chaque épisode dans `rendus/`. Un rendu en échec peut être relancé seul ; le détail est dans `rendus/journal.txt`.
```

- [ ] **Step 4 : Vérifier**

Run: `npm run typecheck`, `npm test`, puis `cd pipeline; ..\.venv\Scripts\python -m pytest`
Expected: sans erreur, tous les tests PASS (aucun changement Python attendu).

Vérification de bout en bout dans le navigateur (`npm run validation`, `http://127.0.0.1:5180/#/2026-10-essai`) :
1. Le panneau « Rendu » liste les points à régler (termes à valider, longueurs en attente) et le bouton est désactivé.
2. Valider ou écarter chaque terme, décider chaque longueur : la liste se vide, le bouton s'active.
3. « Valider et lancer le rendu » : `donnees/glossaire.json` contient les termes validés ; `episode.json` passe à `valide` ; la progression s'affiche fichier par fichier ; à la fin, chaque fichier est marqué ✓, `episode.json` est à `rendu` et la liste des tournages affiche « Rendu ».
4. Ouvrir un épisode rendu dans `rendus/` : générique, contenu monté avec les coupes décidées, encarts, carton de fin.
5. Modifier une coupe après le rendu : le statut repasse à « En validation ».

Ne pas restaurer cet état : il correspond à une validation réelle du tournage d'essai. Si `glossaire.json` a reçu des définitions de test, les corriger à la main.

- [ ] **Step 5 : Commit**

```bash
git add studio/src/composants docs/studio.md
git commit -m "Studio : rendu avec vérifications, suivi et relance, mode d'emploi

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
