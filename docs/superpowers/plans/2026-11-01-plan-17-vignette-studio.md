# Vignette composée dans le studio — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** l'auteur fixe pose, accroche, logos (saisis en texte), captures et consignes ; Claude ne génère qu'à la demande 3 variantes (mise en page + accroches) en voyant les images ; l'auteur repart d'une variante pour itérer.

**Architecture :** une `MiseEnPage` facultative s'ajoute à `Vignette` et `PropositionVignette` (défauts = rendu actuel). Les gabarits Remotion la lisent. Le serveur résout les logos saisis, réduit les images (Pillow) et les envoie à Claude en blocs `image`. Un « tour » (`consignesVignette[i]`) mémorise éléments, base et propositions. Le studio remplace la case « Pour Claude » et le sélecteur de gabarit par un formulaire + bouton « Générer 3 vignettes ».

**Tech Stack :** TypeScript, React 19, Remotion 4, Vitest, SDK Anthropic (`messages.parse` + zod), Python 3 + Pillow.

Spec : [docs/superpowers/specs/2026-11-01-vignette-studio-design.md](../specs/2026-11-01-vignette-studio-design.md)

## Global Constraints

- Code, commentaires, noms et messages en français, dans le style des fichiers voisins (commentaires courts au-dessus des fonctions).
- `MAX_ELEMENTS` = 3 logos et 3 captures au plus ; `MAX_PROPOSITIONS_VIGNETTE` = 3.
- Accroche de 3 à 5 mots ; une variante garde l'accroche de l'auteur telle quelle.
- Recadrage : x, y, largeur, hauteur en % (0–100), largeur et hauteur ≥ 10, x + largeur ≤ 100, y + hauteur ≤ 100.
- Images envoyées à Claude : JPEG, 800 px au plus sur le grand côté ; les SVG ne sont pas envoyés (nom seulement).
- Sans `mise`, le rendu d'une vignette est pixel pour pixel celui d'aujourd'hui.
- Les `publication.json` existants (avec `capturesCandidates`, anciennes consignes) se relisent sans erreur.
- Tests : `npx vitest run <fichier>` ; typage : `npm run typecheck`.

## Carte des fichiers

| Fichier | Rôle |
|---|---|
| `noyau/mise-en-page.ts` (nouveau) | Type `MiseEnPage`, défauts, bornage, validation |
| `noyau/gabarits.ts` | `resoudreLogos` ; suppression de `MAX_CANDIDATES` |
| `noyau/publication.ts` | `mise` dans `Vignette`/`PropositionVignette`/`ProprietesVignette`, tour de vignette, migration |
| `remotion/composants/vignette/*.tsx` | Application de la mise |
| `outils/vignette/reduire_image.py` (nouveau) + `studio/serveur/images.ts` (nouveau) | Réduction d'image pour Claude |
| `studio/serveur/vignette-claude.ts` | Prompt multimodal, schéma, nettoyage |
| `studio/serveur/publication.ts` | Route `vignette/generer` |
| `studio/src/logique/publication.ts`, `studio/src/api.ts` | Formulaire depuis une base, appel |
| `studio/src/composants/FormulaireVignette.tsx` (nouveau, remplace `ConsignesVignette.tsx`) , `ChoixVignette.tsx` | Interface |
| `docs/studio.md` | Documentation |

---

### Task 1 : Mise en page dans le noyau

**Files :**
- Create : `noyau/mise-en-page.ts`, `noyau/mise-en-page.test.ts`
- Modify : `noyau/publication.ts`, `noyau/publication.test.ts`

**Interfaces :**
- Produces :
  ```ts
  export interface Recadrage { x: number; y: number; largeur: number; hauteur: number }
  export interface MiseEnPage {
    cotePose: 'gauche' | 'droite';
    tailleAccroche: 'petite' | 'normale' | 'grande';
    recadrages: (Recadrage | null)[];   // un par capture, même ordre ; null = image entière
    logoVedette: string | null;         // fichier parmi les logos de la vignette
  }
  export const MISE_PAR_DEFAUT: MiseEnPage;
  export function bornerMise(m: Partial<MiseEnPage> | undefined, logos: string[], captures: number): MiseEnPage;
  export function raisonMise(m: unknown): string | null;
  export const cleMise: (m: MiseEnPage | undefined) => string;
  ```
  `Vignette.mise?: MiseEnPage`, `PropositionVignette.mise?: MiseEnPage`, `ProprietesVignette.mise: MiseEnPage` (toujours remplie par `proprietesVignette`, `logoVedette` traduit en indice : `logoVedette: number | null` dans `ProprietesVignette.vedette`).

- [ ] **Step 1 : tests de `mise-en-page.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { bornerMise, cleMise, MISE_PAR_DEFAUT, raisonMise } from './mise-en-page';

describe('bornerMise', () => {
  it('donne les défauts quand rien n’est fourni', () => {
    expect(bornerMise(undefined, [], 0)).toEqual(MISE_PAR_DEFAUT);
  });
  it('ramène un recadrage dans l’image, avec 10 % au moins', () => {
    const m = bornerMise({ recadrages: [{ x: 95, y: -5, largeur: 2, hauteur: 200 }] }, [], 1);
    expect(m.recadrages).toEqual([{ x: 90, y: 0, largeur: 10, hauteur: 100 }]);
  });
  it('aligne les recadrages sur le nombre de captures', () => {
    expect(bornerMise({ recadrages: [null, null, null] }, [], 1).recadrages).toEqual([null]);
    expect(bornerMise({ recadrages: [] }, [], 2).recadrages).toEqual([null, null]);
  });
  it('oublie un logo vedette absent de la vignette et une valeur inconnue', () => {
    const m = bornerMise({ logoVedette: 'word.png', cotePose: 'haut' as never, tailleAccroche: 'grande' }, ['excel.png'], 0);
    expect(m).toMatchObject({ logoVedette: null, cotePose: 'droite', tailleAccroche: 'grande' });
  });
});

describe('raisonMise', () => {
  it('accepte une mise bornée et refuse une forme inattendue', () => {
    expect(raisonMise(MISE_PAR_DEFAUT)).toBeNull();
    expect(raisonMise({ ...MISE_PAR_DEFAUT, recadrages: [{ x: 'a' }] })).toBe('mise invalide');
  });
});

describe('cleMise', () => {
  it('est vide pour la mise par défaut, pour garder les clés des vignettes existantes', () => {
    expect(cleMise(undefined)).toBe('');
    expect(cleMise(MISE_PAR_DEFAUT)).toBe('');
    expect(cleMise({ ...MISE_PAR_DEFAUT, cotePose: 'gauche' })).not.toBe('');
  });
});
```

- [ ] **Step 2 : lancer** `npx vitest run noyau/mise-en-page.test.ts` → échec (module absent).

- [ ] **Step 3 : écrire `noyau/mise-en-page.ts`**

```ts
// Réglages fins d'une vignette, que Claude fait varier d'une proposition à l'autre. Absents, ils valent le rendu
// d'origine des gabarits.

export interface Recadrage { x: number; y: number; largeur: number; hauteur: number }

export interface MiseEnPage {
  cotePose: 'gauche' | 'droite';
  tailleAccroche: 'petite' | 'normale' | 'grande';
  // Un par capture, dans l'ordre ; null : image entière. Zone en % de l'image.
  recadrages: (Recadrage | null)[];
  // Logo mis en avant (plus grand, en premier), parmi ceux de la vignette.
  logoVedette: string | null;
}

export const COTES_POSE = ['gauche', 'droite'] as const;
export const TAILLES_ACCROCHE = ['petite', 'normale', 'grande'] as const;
export const COTE_MIN_RECADRAGE = 10;

export const MISE_PAR_DEFAUT: MiseEnPage = { cotePose: 'droite', tailleAccroche: 'normale', recadrages: [], logoVedette: null };

const borne = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));

function bornerRecadrage(r: Recadrage | null | undefined): Recadrage | null {
  if (!r) return null;
  const largeur = borne(r.largeur, COTE_MIN_RECADRAGE, 100);
  const hauteur = borne(r.hauteur, COTE_MIN_RECADRAGE, 100);
  return { x: borne(r.x, 0, 100 - largeur), y: borne(r.y, 0, 100 - hauteur), largeur, hauteur };
}

// Mise ramenée à ce que la vignette permet : valeurs connues, un recadrage par capture, logo vedette présent.
export function bornerMise(m: Partial<MiseEnPage> | undefined, logos: string[], captures: number): MiseEnPage {
  const recadrages = Array.from({ length: captures }, (_, i) => bornerRecadrage(m?.recadrages?.[i]));
  return {
    cotePose: COTES_POSE.includes(m?.cotePose as never) ? m!.cotePose! : MISE_PAR_DEFAUT.cotePose,
    tailleAccroche: TAILLES_ACCROCHE.includes(m?.tailleAccroche as never) ? m!.tailleAccroche! : MISE_PAR_DEFAUT.tailleAccroche,
    recadrages: recadrages.every(r => r === null) ? [] : recadrages,
    logoVedette: m?.logoVedette && logos.includes(m.logoVedette) ? m.logoVedette : null,
  };
}

const estNombre = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
const estRecadrage = (r: unknown) => r === null
  || (typeof r === 'object' && ['x', 'y', 'largeur', 'hauteur'].every(k => estNombre((r as Record<string, unknown>)[k])));

export function raisonMise(m: unknown): string | null {
  if (typeof m !== 'object' || m === null) return 'mise invalide';
  const v = m as Record<string, unknown>;
  const ok = COTES_POSE.includes(v.cotePose as never) && TAILLES_ACCROCHE.includes(v.tailleAccroche as never)
    && Array.isArray(v.recadrages) && v.recadrages.every(estRecadrage)
    && (v.logoVedette === null || typeof v.logoVedette === 'string');
  return ok ? null : 'mise invalide';
}

// Vide pour la mise par défaut : les vignettes déjà rendues gardent leur clé et ne redeviennent pas « à rendre ».
export function cleMise(m: MiseEnPage | undefined): string {
  if (!m) return '';
  const defaut = m.cotePose === 'droite' && m.tailleAccroche === 'normale' && m.recadrages.every(r => r === null) && m.logoVedette === null;
  return defaut ? '' : JSON.stringify(m);
}
```

- [ ] **Step 4 : lancer** `npx vitest run noyau/mise-en-page.test.ts` → PASS.

- [ ] **Step 5 : tests de `publication.ts`** (ajouter dans `noyau/publication.test.ts`)

```ts
describe('mise en page des vignettes', () => {
  const vignette = { pose: { source: 'banque' as const, fichier: 'p.jpg' }, accroche: 'A', gabarit: 'demonstration' as const, logos: ['excel.png'], captures: ['c.png'], fichier: null };
  it('garde la clé d’une vignette sans mise et la change avec une mise', () => {
    expect(cleVignette(vignette)).toBe('p.jpg|A|demonstration|excel.png|c.png');
    expect(cleVignette({ ...vignette, mise: { ...MISE_PAR_DEFAUT, cotePose: 'gauche' } })).not.toBe(cleVignette(vignette));
  });
  it('transmet une mise bornée et l’indice du logo vedette à Remotion', () => {
    const props = proprietesVignette({ ...vignette, mise: { ...MISE_PAR_DEFAUT, logoVedette: 'excel.png' } }, { tournage: 't', poses: 'p', logos: 'l' });
    expect(props.mise).toMatchObject({ cotePose: 'droite', tailleAccroche: 'normale' });
    expect(props.vedette).toBe(0);
    expect(proprietesVignette(vignette, { tournage: 't', poses: 'p', logos: 'l' }).vedette).toBeNull();
  });
  it('relit un ancien fichier : capturesCandidates oubliées, consignes complétées', () => {
    const ancien = { version: 2, qualificationParDefaut: QUALIFICATION_PAR_DEFAUT, videos: [{
      ...videoParDefaut('complete', QUALIFICATION_PAR_DEFAUT), capturesCandidates: ['a.png'],
      consignesVignette: [{ texte: 'Plus sobre', compris: 'ok', pasRealisable: [], propositions: [PROPOSITION_ANCIENNE], choisie: null }],
    }] };
    const migre = migrerPublication(ancien) as Publication;
    expect(raisonPublication(migre)).toBeNull();
    expect('capturesCandidates' in migre.videos[0]!).toBe(false);
    expect(migre.videos[0]!.consignesVignette[0]).toMatchObject({ elements: null, base: null, introuvables: [] });
  });
  it('refuse une mise invalide', () => {
    const p = { version: 2, qualificationParDefaut: QUALIFICATION_PAR_DEFAUT, videos: [{ ...videoParDefaut('complete', QUALIFICATION_PAR_DEFAUT), vignette: { ...vignette, mise: { cotePose: 'haut' } } }] };
    expect(raisonPublication(p)).toContain('mise invalide');
  });
});
```

où `PROPOSITION_ANCIENNE = { pose: 'p.jpg', logos: [], captures: [], gabarit: 'classique', accroche: 'A', explication: 'e' }` (constante en tête de fichier). Supprimer les tests existants qui portent sur `capturesCandidates` / `MAX_CANDIDATES`.

- [ ] **Step 6 : lancer** `npx vitest run noyau/publication.test.ts` → échecs attendus.

- [ ] **Step 7 : modifier `noyau/publication.ts`**

1. Importer `bornerMise, cleMise, raisonMise, type MiseEnPage` depuis `./mise-en-page` ; retirer `MAX_CANDIDATES` de l'import.
2. `Vignette` et `PropositionVignette` : ajouter
   ```ts
   // Réglages fins choisis par Claude ; absents, le gabarit tel quel.
   mise?: MiseEnPage;
   ```
3. Remplacer `ConsigneVignette` par :
   ```ts
   // Éléments imposés par l'auteur pour un tour de génération.
   export interface ElementsVignette {
     pose: string;
     accroche: string;
     // Saisie libre des logos (« Excel, Teams »), et les fichiers qui en ont été déduits.
     logosTexte: string;
     logos: string[];
     captures: string[];
   }

   // Un tour : éléments et consignes de l'auteur, variante de départ, réponse de Claude. Les tours d'avant ce
   // formulaire n'ont ni éléments ni base.
   export interface ConsigneVignette {
     // Consignes de l'auteur.
     texte: string;
     elements: ElementsVignette | null;
     base: PropositionVignette | null;
     // Reformulation de Claude (« J’ai compris : … »).
     compris: string;
     pasRealisable: string[];
     // Noms de logos saisis sans correspondance dans la banque.
     introuvables: string[];
     propositions: PropositionVignette[];
     // Indice de la proposition appliquée à la vignette, null tant qu'aucune ne l'est.
     choisie: number | null;
   }
   ```
4. `VideoPubliee` : supprimer `capturesCandidates` (et dans `videoParDefaut`).
5. `cleVignette` :
   ```ts
   const mise = cleMise(v.mise);
   return [v.pose.fichier, v.accroche, v.gabarit, v.logos.join(','), v.captures.join(','), ...(mise ? [mise] : [])].join('|');
   ```
6. `ProprietesVignette` : ajouter `mise: MiseEnPage;` et `// Indice du logo mis en avant dans logoUrls. vedette: number | null;`. Dans `proprietesVignette` :
   ```ts
   const mise = bornerMise(v.mise, v.logos, v.captures.length);
   const vedette = mise.logoVedette ? v.logos.indexOf(mise.logoVedette) : -1;
   return { ...ce qui existe, mise, vedette: vedette >= 0 ? vedette : null };
   ```
7. `completerVideo` : retirer `capturesCandidates` (`const { capturesCandidates: _, ...sans } = v;` puis travailler sur `sans`), et compléter chaque consigne :
   ```ts
   const consignesVignette = Array.isArray(sans.consignesVignette)
     ? sans.consignesVignette.map(c => (estObjet(c) ? { elements: null, base: null, introuvables: [], ...c } : c))
     : sans.consignesVignette;
   return { logiciels: [], consignesVignette: [], ...sans, consignesVignette: consignesVignette ?? [], vignette, replit };
   ```
8. `raisonConsigneVignette` : ajouter les contrôles `listeDeTextes(c.introuvables)`, `c.base === null || valide(c.base)`, `c.elements === null || (estObjet(c.elements) && estNomFichier(c.elements.pose) && estTexte(c.elements.accroche) && estTexte(c.elements.logosTexte) && listeDeFichiers(c.elements.logos, MAX_ELEMENTS) && listeDeFichiers(c.elements.captures, MAX_ELEMENTS))` ; dans `valide(p)`, ajouter `&& (p.mise === undefined || raisonMise(p.mise) === null)`.
9. `raisonVignette` : `if (v.mise !== undefined && raisonMise(v.mise)) return 'vignette : mise invalide';`
10. `raisonPublication` : supprimer la ligne `capturesCandidates`.
11. `noyau/gabarits.ts` : supprimer `MAX_CANDIDATES`.

- [ ] **Step 8 : lancer** `npx vitest run noyau` puis `npm run typecheck`. Les erreurs de typage restantes concernent le studio (`capturesCandidates`, `ConsigneVignette`) : elles seront réglées aux tâches 5 à 7. Les tests `noyau` passent.

- [ ] **Step 9 : commit**

```bash
git add noyau
git commit -m "Vignette : mise en page facultative et tours de génération dans le noyau"
```

---

### Task 2 : Remotion applique la mise

**Files :**
- Modify : `remotion/composants/vignette/briques.tsx`, `Classique.tsx`, `Demonstration.tsx`, `Mosaique.tsx`, `Vitrine.tsx`
- Test : `remotion/composants/vignette/mise.test.ts` (nouveau)

**Interfaces :**
- Consumes : `ProprietesVignette.mise`, `ProprietesVignette.vedette` (tâche 1).
- Produces (dans `briques.tsx`) :
  ```ts
  export const FACTEURS_ACCROCHE: Record<MiseEnPage['tailleAccroche'], number>; // petite 0.8, normale 1, grande 1.2
  export function styleRecadrage(r: Recadrage | null): CSSProperties;           // {} pour null
  export function miroir(style: CSSProperties, cote: MiseEnPage['cotePose']): CSSProperties; // échange left/right si 'gauche'
  export function ordreVedette<T>(liste: T[], vedette: number | null): T[];      // vedette en tête
  ```

- [ ] **Step 1 : tests**

```ts
import { describe, expect, it } from 'vitest';
import { miroir, ordreVedette, styleRecadrage } from './briques';

describe('briques de mise en page', () => {
  it('ne touche à rien par défaut', () => {
    expect(styleRecadrage(null)).toEqual({});
    expect(miroir({ right: 0, maxWidth: '55%' }, 'droite')).toEqual({ right: 0, maxWidth: '55%' });
    expect(ordreVedette(['a', 'b'], null)).toEqual(['a', 'b']);
  });
  it('zoome sur la zone recadrée', () => {
    // Zone de 50 % en largeur et hauteur à partir du milieu : image doublée, décalée de moitié.
    expect(styleRecadrage({ x: 50, y: 50, largeur: 50, hauteur: 50 })).toEqual({
      width: '200%', height: '200%', maxWidth: 'none', left: '-100%', top: '-100%', position: 'absolute', objectFit: 'cover',
    });
  });
  it('passe la pose à gauche et met le logo vedette en tête', () => {
    expect(miroir({ right: 0, objectPosition: 'right bottom' }, 'gauche')).toEqual({ left: 0, objectPosition: 'left bottom' });
    expect(ordreVedette(['a', 'b', 'c'], 2)).toEqual(['c', 'a', 'b']);
  });
});
```

- [ ] **Step 2 : lancer** `npx vitest run remotion/composants/vignette/mise.test.ts` → échec.

- [ ] **Step 3 : ajouter dans `briques.tsx`**

```ts
import type { MiseEnPage, Recadrage } from '../../../noyau/mise-en-page';

export const FACTEURS_ACCROCHE: Record<MiseEnPage['tailleAccroche'], number> = { petite: 0.8, normale: 1, grande: 1.2 };

// Zone de l'image gardée : l'image est agrandie puis décalée dans son cadre (overflow caché).
export function styleRecadrage(r: Recadrage | null): CSSProperties {
  if (!r) return {};
  return {
    width: `${10000 / r.largeur}%`, height: `${10000 / r.hauteur}%`, maxWidth: 'none',
    left: `${-(r.x * 100) / r.largeur}%`, top: `${-(r.y * 100) / r.hauteur}%`, position: 'absolute', objectFit: 'cover',
  };
}

// Pose à gauche : la place prévue à droite passe à gauche.
export function miroir(style: CSSProperties, cote: MiseEnPage['cotePose']): CSSProperties {
  if (cote === 'droite') return style;
  const { left, right, objectPosition, ...reste } = style;
  return {
    ...reste,
    ...(right !== undefined ? { left: right } : {}),
    ...(left !== undefined ? { right: left } : {}),
    ...(typeof objectPosition === 'string' ? { objectPosition: objectPosition.replace('right', 'left') } : {}),
  };
}

export function ordreVedette<T>(liste: T[], vedette: number | null): T[] {
  if (vedette === null || !liste[vedette]) return liste;
  return [liste[vedette]!, ...liste.filter((_, i) => i !== vedette)];
}
```

Modifier `CarteCapture` pour accepter `recadrage?: Recadrage | null` : le cadre intérieur devient
```tsx
<div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', borderRadius: 8 }}>
  <Img src={url} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain', ...styleRecadrage(recadrage ?? null) }} />
</div>
```
Modifier `Accroche` et `Bandeau` pour accepter `facteur = 1` et multiplier la taille calculée : `Math.min(tailleMax, tailleAccroche(texte, largeur)) * facteur`.

- [ ] **Step 4 : appliquer dans les gabarits** (même schéma pour les 4 ; exemple `Demonstration.tsx`)

```tsx
export const Demonstration: FC<ProprietesVignette> = ({ poseUrl, logoUrls, captureUrls, accroche, mise, vedette }) => {
  const g = mise.cotePose === 'gauche';
  const logos = ordreVedette(logoUrls, vedette);
  return (
    <>
      <Fond />
      <BandeRouge />
      {captureUrls[0] && <CarteCapture url={captureUrls[0]} recadrage={mise.recadrages[0]} largeur={700} hauteur={394} angle={-3} style={g ? { right: 70, top: 120 } : { left: 70, top: 120 }} />}
      <Pose url={poseUrl} style={miroir({ right: 0, maxWidth: '45%', objectPosition: 'right bottom' }, mise.cotePose)} />
      {logos[0] && <TuileLogo url={logos[0]} taille={vedette !== null ? 190 : 150} angle={-10} style={g ? { right: 30, top: 70 } : { left: 30, top: 70 }} />}
      <div style={{ position: 'absolute', ...(g ? { right: 240 } : { left: 240 }), top: 28 }}>
        <LogoMT hauteur={64} />
      </div>
      <div style={{ position: 'absolute', ...(g ? { right: 70 } : { left: 70 }), bottom: 40, width: 760 }}>
        <Bandeau texte={accroche} largeur={760} tailleMax={64} facteur={FACTEURS_ACCROCHE[mise.tailleAccroche]} />
      </div>
    </>
  );
};
```
Règle commune : tout ce qui est placé par `left` passe en `right` (et inversement) quand `g` ; la pose passe par `miroir` ; `BandeRouge` reste à gauche ; la tuile vedette grandit de 25 % (Vitrine : 170 → 212 pour la première ; Mosaïque : 120 → 150). Vitrine : la pose reste centrée, `cotePose` inverse seulement l'ordre des places des logos (`g ? [...PLACES_LOGOS].reverse()` avec `left`/`right` échangés via `miroir(place, 'gauche')`). Mosaïque : captures avec `recadrage={mise.recadrages[i]}` et places miroir. Classique : pose et accroche miroir, facteur d'accroche.

- [ ] **Step 5 : vérifier la non-régression du rendu**

Run : `npx vitest run remotion/composants/vignette/mise.test.ts` → PASS. Puis `npm run test:rendu` : les rendus e2e de vignette (props sans mise → `MISE_PAR_DEFAUT` via `proprietesVignette`) doivent être identiques. Ajouter `mise: MISE_PAR_DEFAUT, vedette: null` à la constante `PROPS` de `remotion/scripts/vignette.test.ts` et aux props par défaut dans `remotion/Root.tsx`. Ensuite `npm run image -- Vignette scratch.jpg --props='{"gabarit":"demonstration",...,"mise":{"cotePose":"gauche","tailleAccroche":"grande","recadrages":[{"x":20,"y":20,"largeur":50,"hauteur":50}],"logoVedette":null},"vedette":null}'` et regarder l'image.

- [ ] **Step 6 : commit**

```bash
git add remotion
git commit -m "Vignette : les gabarits appliquent côté de la pose, taille d'accroche, recadrages et logo vedette"
```

---

### Task 3 : Résolution des logos saisis

**Files :**
- Modify : `noyau/gabarits.ts`
- Test : `noyau/gabarits.test.ts` (créer s'il n'existe pas)

**Interfaces :**
- Produces : `export function resoudreLogos(texte: string, banque: string[]): { logos: string[]; introuvables: string[]; ambigus: string[] }` — noms séparés par virgules, points-virgules ou retours à la ligne ; correspondance exacte sur la clé normalisée (fonction `cle` existante) d'abord, sinon unique fichier dont la clé *contient* le nom ; plusieurs candidats → `ambigus` ; rien → `introuvables`. `logos` dédoublonnés, `MAX_ELEMENTS` au plus.

- [ ] **Step 1 : tests**

```ts
import { describe, expect, it } from 'vitest';
import { resoudreLogos } from './gabarits';

const BANQUE = ['Excel.png', 'Microsoft Teams.svg', 'SharePoint.png', 'Power BI.png', 'Power Automate.png'];

describe('resoudreLogos', () => {
  it('trouve par nom exact, sans casse ni accents', () => {
    expect(resoudreLogos('excel, sharepoint', BANQUE)).toEqual({ logos: ['Excel.png', 'SharePoint.png'], introuvables: [], ambigus: [] });
  });
  it('trouve par morceau de nom quand il est unique', () => {
    expect(resoudreLogos('Teams', BANQUE).logos).toEqual(['Microsoft Teams.svg']);
  });
  it('signale les noms ambigus et introuvables', () => {
    expect(resoudreLogos('Power; Word\nExcel', BANQUE)).toEqual({ logos: ['Excel.png'], introuvables: ['Word'], ambigus: ['Power'] });
  });
  it('garde 3 logos au plus, sans doublon', () => {
    expect(resoudreLogos('Excel, excel, Teams, SharePoint, Power BI', BANQUE).logos).toHaveLength(3);
  });
});
```

- [ ] **Step 2 : lancer** `npx vitest run noyau/gabarits.test.ts` → échec.

- [ ] **Step 3 : implémenter**

```ts
// Logos saisis en texte libre (« Excel, Teams ») retrouvés dans la banque. Un nom qui désigne plusieurs fichiers est
// laissé à Claude, qui voit les logos.
export function resoudreLogos(texte: string, banque: string[]): { logos: string[]; introuvables: string[]; ambigus: string[] } {
  const logos: string[] = [];
  const introuvables: string[] = [];
  const ambigus: string[] = [];
  const cles = banque.map(f => ({ f, k: cle(f.replace(/\.[^.]+$/, '')) }));
  for (const nom of texte.split(/[,;\n]/).map(n => n.trim()).filter(n => n !== '')) {
    const k = cle(nom);
    const exact = cles.find(c => c.k === k);
    const partiels = cles.filter(c => c.k.includes(k));
    const trouve = exact?.f ?? (partiels.length === 1 ? partiels[0]!.f : undefined);
    if (trouve) { if (!logos.includes(trouve)) logos.push(trouve); }
    else if (partiels.length > 1) ambigus.push(nom);
    else introuvables.push(nom);
  }
  return { logos: logos.slice(0, MAX_ELEMENTS), introuvables, ambigus };
}
```

- [ ] **Step 4 : lancer** → PASS.

- [ ] **Step 5 : commit** `git add noyau/gabarits.ts noyau/gabarits.test.ts && git commit -m "Vignette : logos retrouvés dans la banque d'après une saisie libre"`

---

### Task 4 : Images réduites pour Claude

**Files :**
- Create : `outils/vignette/reduire_image.py`, `studio/serveur/images.ts`, `studio/serveur/images.test.ts`

**Interfaces :**
- Produces :
  ```ts
  export interface ImageClaude { nom: string; media_type: 'image/jpeg'; data: string } // base64
  export type ReduireImage = (chemin: string) => Promise<ImageClaude | null>;          // null : SVG ou illisible
  export const reduireImage: ReduireImage;
  export const COTE_MAX_IMAGE_CLAUDE = 800;
  ```

- [ ] **Step 1 : script Python**

```python
"""Image réduite pour Claude : JPEG, 800 px au plus sur le grand côté, écrite en base64 sur la sortie standard.

    python reduire_image.py <image>
"""
import base64
import io
import sys

from PIL import Image

COTE_MAX = 800


def reduire(chemin: str) -> str:
    image = Image.open(chemin)
    if image.mode in ("RGBA", "LA", "P"):
        # Logos et poses détourées : fond blanc, comme sur la vignette.
        fond = Image.new("RGB", image.size, (255, 255, 255))
        fond.paste(image.convert("RGBA"), mask=image.convert("RGBA").split()[3])
        image = fond
    image = image.convert("RGB")
    image.thumbnail((COTE_MAX, COTE_MAX))
    tampon = io.BytesIO()
    image.save(tampon, "JPEG", quality=85)
    return base64.b64encode(tampon.getvalue()).decode("ascii")


if __name__ == "__main__":
    sys.stdout.write(reduire(sys.argv[1]))
```

- [ ] **Step 2 : test** (`studio/serveur/images.test.ts`, exécute vraiment Python ; produire une image avec le même Pillow)

```ts
import { execFileSync } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { reduireImage } from './images';

describe('reduireImage', () => {
  it('réduit une grande image en JPEG base64', async () => {
    const dossier = await mkdtemp(path.join(os.tmpdir(), 'pmt-image-'));
    const source = path.join(dossier, 'grande.png');
    execFileSync('python', ['-c', `from PIL import Image; Image.new("RGBA", (2000, 1000), (255, 0, 0, 128)).save(r"${source}")`]);
    const image = await reduireImage(source);
    expect(image?.media_type).toBe('image/jpeg');
    expect(image?.nom).toBe('grande.png');
    const octets = Buffer.from(image!.data, 'base64');
    expect(octets.subarray(0, 2).toString('hex')).toBe('ffd8');
  });
  it('ignore les SVG', async () => {
    expect(await reduireImage('logo.svg')).toBeNull();
  });
});
```

- [ ] **Step 3 : lancer** `npx vitest run studio/serveur/images.test.ts` → échec.

- [ ] **Step 4 : `studio/serveur/images.ts`** (calqué sur `mail-outils.ts` pour l'exécution Python ; lire `executer` et `python` là-bas et les réutiliser s'ils sont exportés, sinon `execFile` de `node:child_process` promisifié)

```ts
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

export const COTE_MAX_IMAGE_CLAUDE = 800;

export interface ImageClaude { nom: string; media_type: 'image/jpeg'; data: string }
export type ReduireImage = (chemin: string) => Promise<ImageClaude | null>;

const SCRIPT = path.resolve(import.meta.dirname, '../../outils/vignette/reduire_image.py');

// Les SVG ne passent pas (Claude ne les lit pas) : Claude n'en voit que le nom. Une image illisible non plus.
export const reduireImage: ReduireImage = async chemin => {
  if (path.extname(chemin).toLowerCase() === '.svg') return null;
  try {
    const { stdout } = await promisify(execFile)('python', [SCRIPT, chemin], { maxBuffer: 20 * 1024 * 1024 });
    return { nom: path.basename(chemin), media_type: 'image/jpeg', data: stdout.trim() };
  } catch {
    return null;
  }
};
```

- [ ] **Step 5 : lancer** → PASS. **Step 6 : commit** `git add outils/vignette studio/serveur/images.ts studio/serveur/images.test.ts && git commit -m "Vignette : images réduites en JPEG pour Claude"`

---

### Task 5 : Génération par Claude

**Files :**
- Modify : `studio/serveur/vignette-claude.ts`, `studio/serveur/vignette-claude.test.ts`

**Interfaces :**
- Consumes : `ImageClaude` (tâche 4), `MiseEnPage`, `bornerMise` (tâche 1), `ElementsVignette` (tâche 1).
- Produces :
  ```ts
  export interface DemandeVignette {
    elements: ElementsVignette;            // pose, accroche, logosTexte, logos (résolus), captures
    ambigus: string[];                     // noms de logos à trancher par Claude
    logosBanque: string[];                 // noms de tous les logos, pour les ambigus
    consignes: string;
    base: PropositionVignette | null;
    titre: string; description: string;
    images: { pose: ImageClaude | null; logos: ImageClaude[]; captures: ImageClaude[] };
    dejaUtilises: Gabarit[];
    qualification: Qualification;
    modele: string;
  }
  export interface ReponseVignette { compris: string; pasRealisable: string[]; logosAjoutes: string[]; propositions: PropositionVignette[] }
  export function construireMessageVignette(d: DemandeVignette): Anthropic.ContentBlockParam[];
  export function nettoyerPropositionsVignette(propositions: PropositionVignette[], e: ElementsVignette, dejaUtilises: Gabarit[]): PropositionVignette[];
  export async function proposerVignettes(d: DemandeVignette, client?: Anthropic): Promise<ReponseVignette>;
  ```
  `ElementsDisponibles` et `construirePromptVignette` disparaissent.

- [ ] **Step 1 : réécrire les tests** (remplacer les blocs `construirePromptVignette` et `nettoyerPropositionsVignette` ; garder ceux de `proposerVignettes` en adaptant `demande`)

```ts
const IMAGE = (nom: string): ImageClaude => ({ nom, media_type: 'image/jpeg', data: 'AAAA' });
const ELEMENTS: ElementsVignette = { pose: 'surpris.jpg', accroche: 'Planning sans effort', logosTexte: 'Excel, Power', logos: ['excel.png'], captures: ['planning.png', 'tableau.png'] };
const PROPOSITION: PropositionVignette = {
  pose: 'surpris.jpg', logos: ['excel.png'], captures: ['planning.png', 'tableau.png'], gabarit: 'mosaique', accroche: 'Planning sans effort', explication: 'Le planning en grand.',
  mise: { cotePose: 'gauche', tailleAccroche: 'grande', recadrages: [{ x: 10, y: 10, largeur: 50, hauteur: 50 }, null], logoVedette: null },
};
const demande: DemandeVignette = {
  elements: ELEMENTS, ambigus: ['Power'], logosBanque: ['excel.png', 'Power BI.png', 'Power Automate.png'], consignes: 'Zoome sur le bouton Partager',
  base: null, titre: 'Le planning Excel', description: 'Un planning partagé.',
  images: { pose: IMAGE('surpris.detoure.png'), logos: [IMAGE('excel.png')], captures: [IMAGE('planning.png'), IMAGE('tableau.png')] },
  dejaUtilises: ['vitrine'], qualification: { nature: 'perso', confidentielle: false }, modele: 'claude-opus-5-5',
};
const texte = (blocs: Anthropic.ContentBlockParam[]) => blocs.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('\n');

describe('construireMessageVignette', () => {
  it('légende chaque image puis l’envoie', () => {
    const blocs = construireMessageVignette(demande);
    const i = blocs.findIndex(b => b.type === 'text' && (b as { text: string }).text.includes('Capture planning.png'));
    expect(blocs[i + 1]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } });
    expect(blocs.filter(b => b.type === 'image')).toHaveLength(4);
  });
  it('impose les éléments et demande 3 variantes dont une avec l’accroche telle quelle', () => {
    const t = texte(construireMessageVignette(demande));
    expect(t).toContain('« Planning sans effort »');
    expect(t).toContain('exactement 3');
    expect(t).toContain('<consignes>\nZoome sur le bouton Partager\n</consignes>');
    expect(t).toMatch(/Power.*Power BI\.png.*Power Automate\.png/s);
    expect(t).toMatch(/- vitrine .*déjà pris/);
  });
  it('demande de rester proche de la base quand il y en a une', () => {
    expect(texte(construireMessageVignette(demande))).not.toContain('Variante de départ');
    const t = texte(construireMessageVignette({ ...demande, base: PROPOSITION }));
    expect(t).toContain('Variante de départ');
    expect(t).toContain('"cotePose":"gauche"');
  });
});

describe('nettoyerPropositionsVignette', () => {
  it('rétablit les éléments imposés et borne la mise', () => {
    const [p] = nettoyerPropositionsVignette([{ ...PROPOSITION, pose: 'autre.jpg', captures: ['planning.png'], mise: { ...PROPOSITION.mise!, recadrages: [{ x: 99, y: 0, largeur: 5, hauteur: 50 }] } }], ELEMENTS, []);
    expect(p!.pose).toBe('surpris.jpg');
    expect(p!.captures).toEqual(['planning.png', 'tableau.png']);
    expect(p!.mise!.recadrages[0]).toEqual({ x: 90, y: 0, largeur: 10, hauteur: 50 });
  });
  it('accepte les logos ajoutés pour un nom ambigu', () => {
    const [p] = nettoyerPropositionsVignette([{ ...PROPOSITION, logos: ['excel.png', 'Power BI.png'] }], { ...ELEMENTS, logos: ['excel.png', 'Power BI.png'] }, []);
    expect(p!.logos).toEqual(['excel.png', 'Power BI.png']);
  });
  it('remplace un gabarit impossible, reprend l’accroche de l’auteur si vide, fusionne les doublons', () => {
    const r = nettoyerPropositionsVignette([
      { ...PROPOSITION, gabarit: 'mosaique', captures: [] , accroche: '' },
      { ...PROPOSITION, accroche: 'Autre accroche' },
      { ...PROPOSITION, accroche: 'Autre accroche' },
    ], { ...ELEMENTS, captures: [] }, []);
    expect(r[0]!.gabarit).toBe('vitrine');
    expect(r[0]!.accroche).toBe('Planning sans effort');
    expect(r).toHaveLength(2);
  });
});
```

- [ ] **Step 2 : lancer** `npx vitest run studio/serveur/vignette-claude.test.ts` → échecs.

- [ ] **Step 3 : réécrire `vignette-claude.ts`** (garder imports, `traduireErreurClaude`, `verifierCleClaude`, `consigneDeTon`, `ErreurInterpretation`)

```ts
const image = (i: ImageClaude): Anthropic.ImageBlockParam => ({ type: 'image', source: { type: 'base64', media_type: i.media_type, data: i.data } });
const legende = (text: string): Anthropic.TextBlockParam => ({ type: 'text', text });

const decrire = (p: PropositionVignette) => `gabarit ${p.gabarit}, accroche « ${p.accroche} », logos : ${p.logos.join(', ') || 'aucun'}, `
  + `captures : ${p.captures.join(', ') || 'aucune'}, mise : ${JSON.stringify(p.mise ?? MISE_PAR_DEFAUT)}`;

// Consignes, éléments imposés et images légendées une à une, pour que Claude sache à quel fichier chaque image correspond.
export function construireMessageVignette(d: DemandeVignette): Anthropic.ContentBlockParam[] {
  const e = d.elements;
  const gabarits = GABARITS.map(g => `- ${g} (${LIBELLES_GABARIT[g]}) : ${DESCRIPTIONS_GABARIT[g]}`
    + (d.dejaUtilises.includes(g) ? ' — déjà pris par une autre vidéo de la publication, à éviter si possible' : '')).join('\n');
  const ambigus = d.ambigus.length > 0
    ? `\nNoms de logos à trancher : ${d.ambigus.join(', ')}. Logos de la banque : ${d.logosBanque.join(', ')}. Choisis le fichier voulu pour chacun (logosAjoutes), ${MAX_ELEMENTS} logos au total au plus.\n`
    : '';
  const base = d.base ? `\nVariante de départ retenue par l’auteur : ${decrire(d.base)}. Reste proche d’elle, en appliquant les éléments et consignes ci-dessous.\n` : '';
  const blocs: Anthropic.ContentBlockParam[] = [legende(`Tu composes la vignette d’une vidéo de la chaîne YouTube « PMT » (astuces et outils numériques expliqués simplement à un public non spécialiste). L’auteur a choisi les éléments ; tu proposes exactement 3 variantes de mise en page.

Titre : ${d.titre}
Description :
${d.description}

Éléments imposés (ne les change pas) :
- pose : ${e.pose}
- accroche de l’auteur : « ${e.accroche} »
- logos : ${e.logos.join(', ') || 'aucun'}
- captures, dans l’ordre : ${e.captures.join(', ') || 'aucune'}
${ambigus}${base}
Gabarits :
${gabarits}

Mise en page de chaque variante :
- cotePose : gauche ou droite ;
- tailleAccroche : petite, normale ou grande ;
- recadrages : un par capture, dans l’ordre, zone gardée en % de l’image (x, y, largeur, hauteur, 10 % au moins), ou null pour l’image entière — sers-t’en pour montrer ce qui compte dans la capture ;
- logoVedette : un des logos à mettre en avant, ou null.

Voici les images.`)];
  if (d.images.pose) blocs.push(legende(`Pose ${e.pose} (détourée) :`), image(d.images.pose));
  for (const i of d.images.logos) blocs.push(legende(`Logo ${i.nom} :`), image(i));
  for (const i of d.images.captures) blocs.push(legende(`Capture ${i.nom} :`), image(i));
  blocs.push(legende(`<consignes>
${d.consignes || '(aucune)'}
</consignes>

Règles : le fond est toujours celui de la charte ; un gabarit seulement si sa condition est remplie ; une des 3 variantes garde l’accroche de l’auteur mot pour mot, les autres la reformulent en 3 à 5 mots, percutants et lisibles en petit.
${consigneDeTon(d.qualification)}

Réponds avec :
- compris : ta reformulation des consignes, en une phrase.
- pasRealisable : ce que les consignes demandent et qu’aucune variante ne peut faire, avec la raison ; liste vide sinon.
- logosAjoutes : les fichiers choisis pour les noms à trancher ; liste vide sinon.
- propositions : exactement 3 variantes (pose, logos, captures, gabarit, accroche, mise, explication d’une phrase).`));
  return blocs;
}

const SchemaRecadrage = z.object({ x: z.number(), y: z.number(), largeur: z.number(), hauteur: z.number() });
const SchemaVignette = z.object({
  compris: z.string(),
  pasRealisable: z.array(z.string()),
  logosAjoutes: z.array(z.string()),
  propositions: z.array(z.object({
    pose: z.string(), logos: z.array(z.string()), captures: z.array(z.string()), gabarit: z.enum(GABARITS), accroche: z.string(), explication: z.string(),
    mise: z.object({
      cotePose: z.enum(COTES_POSE), tailleAccroche: z.enum(TAILLES_ACCROCHE),
      recadrages: z.array(SchemaRecadrage.nullable()), logoVedette: z.string().nullable(),
    }),
  })),
}) satisfies z.ZodType<ReponseVignette>;

const cle = (p: PropositionVignette) => [p.gabarit, p.accroche, JSON.stringify(p.mise)].join('|');

// Éléments de l'auteur rétablis (Claude ne choisit que la mise en page et l'accroche), mise bornée, gabarit possible,
// doublons fusionnés.
export function nettoyerPropositionsVignette(propositions: PropositionVignette[], e: ElementsVignette, dejaUtilises: Gabarit[]): PropositionVignette[] {
  const compatibles = gabaritsCompatibles({ logos: e.logos.length, captures: e.captures.length }, dejaUtilises);
  const resultat: PropositionVignette[] = [];
  for (const p of propositions) {
    const propre: PropositionVignette = {
      pose: e.pose, logos: e.logos, captures: e.captures,
      gabarit: gabaritRetenu(p.gabarit, compatibles),
      accroche: p.accroche.trim() || e.accroche.trim(),
      explication: p.explication.trim(),
      mise: bornerMise(p.mise, e.logos, e.captures.length),
    };
    if (propre.accroche && !resultat.some(r => cle(r) === cle(propre))) resultat.push(propre);
  }
  return resultat.slice(0, MAX_PROPOSITIONS_VIGNETTE);
}
```

`proposerVignettes` : identique à l'existant, avec `messages: [{ role: 'user', content: construireMessageVignette(d) }]`. Les logos ajoutés sont intégrés par l'appelant (tâche 6) avant le nettoyage.

- [ ] **Step 4 : lancer** → PASS. **Step 5 : commit** `git add studio/serveur/vignette-claude.ts studio/serveur/vignette-claude.test.ts && git commit -m "Vignette : Claude voit les images et propose 3 mises en page des éléments imposés"`

---

### Task 6 : Route `vignette/generer`

**Files :**
- Modify : `studio/serveur/publication.ts`, `studio/serveur/principal.ts`, `studio/serveur/publication.test.ts`

**Interfaces :**
- Consumes : `resoudreLogos` (3), `ReduireImage` (4), `proposerVignettes`, `nettoyerPropositionsVignette` (5).
- Produces : `POST <tournage>/publication/vignette/generer` avec le corps `{ cible, pose, accroche, logosTexte, captures: string[], consignes, base: { consigne: number, proposition: number } | null }` → `Publication`, avec un tour ajouté à `consignesVignette`. La config du serveur gagne `reduireImage: ReduireImage`. L'ancienne route `vignette/consigne` est supprimée.

- [ ] **Step 1 : tests** (remplacer le bloc des tests `consigne` dans `publication.test.ts` ; ajouter `reduireImage: vi.fn(async (c: string) => ({ nom: path.basename(c), media_type: 'image/jpeg' as const, data: 'AAAA' }))` à la config de test, et `REPONSE_VIGNETTE` avec `logosAjoutes: []` et une proposition à `mise`)

```ts
const generer = (corps: unknown) => fetch(`${base}/publication/vignette/generer`, { method: 'POST', body: JSON.stringify(corps) });
const CORPS = { cible: 'complete', pose: 'surpris.jpg', accroche: 'Planning sans effort', logosTexte: 'excel, word', captures: ['b.png'], consignes: ' Zoome ', base: null };

it('génère 3 variantes à partir des éléments du formulaire', async () => {
  await preparer();
  const r = await generer(CORPS);
  expect(r.status).toBe(200);
  expect(config.proposerVignettes).toHaveBeenCalledWith(expect.objectContaining({
    elements: { pose: 'surpris.jpg', accroche: 'Planning sans effort', logosTexte: 'excel, word', logos: ['excel.png'], captures: ['b.png'] },
    consignes: 'Zoome', base: null, ambigus: [],
  }));
  expect(config.reduireImage).toHaveBeenCalledWith(expect.stringMatching(/surpris\.detoure\.png$/));
  const tour = ((await r.json()) as Publication).videos[0]!.consignesVignette.at(-1)!;
  expect(tour).toMatchObject({ texte: 'Zoome', introuvables: ['word'], base: null, choisie: null });
  expect(tour.elements!.logos).toEqual(['excel.png']);
});
it('passe la variante de départ', async () => {
  await preparer();
  await generer(CORPS);
  await generer({ ...CORPS, base: { consigne: 0, proposition: 0 } });
  expect(config.proposerVignettes).toHaveBeenLastCalledWith(expect.objectContaining({ base: expect.objectContaining({ gabarit: expect.any(String) }) }));
});
it('refuse une pose ou une capture inconnue et une accroche vide', async () => {
  await preparer();
  expect((await generer({ ...CORPS, pose: 'x.jpg' })).status).toBe(400);
  expect((await generer({ ...CORPS, captures: ['absente.png'] })).status).toBe(400);
  expect((await generer({ ...CORPS, accroche: ' ' })).status).toBe(400);
});
```

(`preparer()` doit créer `surpris.detoure.png` dans la banque de poses de test ; l'ajouter s'il ne le fait pas.)

- [ ] **Step 2 : lancer** `npx vitest run studio/serveur/publication.test.ts` → échecs.

- [ ] **Step 3 : implémenter** (remplace `consigneVignette`)

```ts
// Formulaire de vignette : éléments imposés par l'auteur, consignes, variante de départ. Claude propose 3 mises en page,
// ajoutées en un nouveau tour ; la vignette ne change que quand l'auteur en retient une.
async function genererVignette(req: IncomingMessage, ctx: Contexte): Promise<Publication> {
  const corps = objet(await lireCorps(req));
  const cible = lireCible(corps, ctx.cibles);
  const texte = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const pose = texte(corps.pose);
  const accroche = texte(corps.accroche);
  const logosTexte = texte(corps.logosTexte);
  const consignes = texte(corps.consignes);
  const choisies = Array.isArray(corps.captures) ? corps.captures.filter((f): f is string => typeof f === 'string') : [];
  if (!(await photosBanque()).includes(pose)) throw new ErreurHttp(400, 'Pose inconnue.');
  if (!accroche) throw new ErreurHttp(400, 'Accroche vide.');
  const toutes = await captures(ctx.dossier);
  if (choisies.length > MAX_ELEMENTS || choisies.some(f => !toutes.includes(f))) throw new ErreurHttp(400, `Captures invalides (${MAX_ELEMENTS} au plus, prises dans captures/).`);
  const enCours = `${ctx.dossier}|${cible}`;
  if (consignesEnCours.has(enCours)) throw new ErreurHttp(409, 'Une génération est déjà en cours pour cette vignette.');
  consignesEnCours.add(enCours);
  try {
    const video = videoDe(ctx.publication, cible);
    const refBase = objet(corps.base);
    const base = corps.base ? video.consignesVignette[refBase.consigne as number]?.propositions[refBase.proposition as number] ?? null : null;
    const banque = await banqueLogos();
    const resolus = resoudreLogos(logosTexte, banque);
    const lire = async (dossier: string, fichiers: string[]) =>
      (await Promise.all(fichiers.map(f => c.reduireImage(path.join(dossier, f))))).filter((i): i is ImageClaude => i !== null);
    const images = {
      pose: await c.reduireImage(path.join(c.cheminPoses, poseDetouree(pose))),
      logos: await lire(c.cheminLogos, resolus.logos),
      captures: await lire(path.join(ctx.dossier, DOSSIER_CAPTURES), choisies),
    };
    const dejaUtilises = gabaritsAutres(ctx.publication, cible);
    let reponse: ReponseVignette;
    try {
      reponse = await c.proposerVignettes({
        elements: { pose, accroche, logosTexte, logos: resolus.logos, captures: choisies },
        ambigus: resolus.ambigus, logosBanque: banque, consignes, base,
        titre: video.titre || ctx.videos.find(v => v.cible === cible)!.titre, description: video.description,
        images, dejaUtilises,
        qualification: { nature: video.nature, confidentielle: video.confidentielle },
        modele: ctx.tournage.reglages.modeles.claude,
      });
    } catch (e) {
      if (e instanceof ErreurInterpretation) throw new ErreurHttp(e.statut, e.message);
      throw new ErreurHttp(500, `Génération de vignette impossible : ${message(e)}`);
    }
    // Logos tranchés par Claude pour les noms ambigus, s'ils sont bien dans la banque.
    const ajoutes = reponse.logosAjoutes.filter(f => banque.includes(f) && !resolus.logos.includes(f));
    const elements = { pose, accroche, logosTexte, logos: [...resolus.logos, ...ajoutes].slice(0, MAX_ELEMENTS), captures: choisies };
    const propositions = nettoyerPropositionsVignette(reponse.propositions, elements, dejaUtilises);
    if (propositions.length === 0) throw new ErreurHttp(422, 'Claude n’a proposé aucune vignette utilisable.');
    const nonTranches = resolus.ambigus.filter(n => !ajoutes.some(f => f.toLowerCase().includes(n.toLowerCase())));
    const tour: ConsigneVignette = {
      texte: consignes, elements, base,
      compris: reponse.compris.trim(),
      pasRealisable: [
        ...reponse.pasRealisable.map(t => t.trim()).filter(t => t !== ''),
        ...(propositions.length < MAX_PROPOSITIONS_VIGNETTE ? [`${propositions.length} variante(s) seulement après vérification`] : []),
      ],
      introuvables: [...resolus.introuvables, ...nonTranches],
      propositions, choisie: null,
    };
    const actuelle = await relire(ctx);
    const p = modifierVideo(actuelle, cible, { consignesVignette: [...videoDe(actuelle, cible).consignesVignette, tour] });
    await ecrirePublication(ctx.dossier, p);
    return p;
  } finally {
    consignesEnCours.delete(enCours);
  }
}
```

Routage : remplacer la ligne `vignette/consigne` par `else if (action === 'vignette/generer' && req.method === 'POST') repondre(res, 200, await genererVignette(req, ctx));`. Ajouter `reduireImage: ReduireImage;` à l'interface de config (à côté de `proposerVignettes`) et `reduireImage` dans `principal.ts` (import depuis `./images`). Retirer les usages de `capturesCandidates` et les imports devenus inutiles (`ElementsDisponibles`, `MAX_CANDIDATES`).

- [ ] **Step 4 : lancer** `npx vitest run studio/serveur` → PASS. **Step 5 : commit** `git add studio/serveur && git commit -m "Vignette : route de génération à partir du formulaire"`

---

### Task 7 : Interface du studio

**Files :**
- Create : `studio/src/composants/FormulaireVignette.tsx`
- Delete : `studio/src/composants/ConsignesVignette.tsx`
- Modify : `studio/src/composants/ChoixVignette.tsx`, `studio/src/logique/publication.ts`, `studio/src/logique/publication.test.ts`, `studio/src/api.ts`, `studio/src/styles.css`

**Interfaces :**
- Consumes : route `vignette/generer` (6), `ConsigneVignette`/`ElementsVignette` (1).
- Produces :
  ```ts
  // logique/publication.ts
  export interface Formulaire { pose: string; accroche: string; logosTexte: string; captures: string[]; consignes: string; base: { consigne: number; proposition: number } | null }
  export function formulaireDepuisBase(v: VideoPubliee, consigne: number, proposition: number): Formulaire;
  export function formulaireInitial(v: VideoPubliee, premierePose: string | undefined, complete: Vignette | null): Formulaire;
  // api.ts
  genererVignette: (nom: string, cible: CiblePublication, f: Formulaire) => Promise<Publication>;
  ```
  `vignetteDepuisProposition` recopie `mise` ; `appliquerProposition` est inchangé dans sa signature.

- [ ] **Step 1 : tests de logique** (ajouter à `studio/src/logique/publication.test.ts` ; supprimer ceux qui citent `capturesCandidates`)

```ts
describe('formulaire de vignette', () => {
  const tour: ConsigneVignette = {
    texte: 'Zoome', elements: { pose: 'p.jpg', accroche: 'A', logosTexte: 'Excel, Power', logos: ['excel.png', 'Power BI.png'], captures: ['c.png'] },
    base: null, compris: '', pasRealisable: [], introuvables: [], choisie: null,
    propositions: [{ pose: 'p.jpg', logos: ['excel.png', 'Power BI.png'], captures: ['c.png'], gabarit: 'demonstration', accroche: 'B', explication: '', mise: MISE_PAR_DEFAUT }],
  };
  const v = { ...videoParDefaut('complete', QUALIFICATION_PAR_DEFAUT), accroches: ['Rédigée'], consignesVignette: [tour] };
  it('repart d’une variante : ses éléments, son accroche, consignes vides', () => {
    expect(formulaireDepuisBase(v, 0, 0)).toEqual({
      pose: 'p.jpg', accroche: 'B', logosTexte: 'Excel, Power', captures: ['c.png'], consignes: '', base: { consigne: 0, proposition: 0 },
    });
  });
  it('part de la vignette actuelle, sinon de la complète, sinon des valeurs rédigées', () => {
    expect(formulaireInitial({ ...v, consignesVignette: [] }, 'premiere.jpg', null)).toEqual({
      pose: 'premiere.jpg', accroche: 'Rédigée', logosTexte: '', captures: [], consignes: '', base: null,
    });
  });
  it('garde la mise en appliquant une variante', () => {
    expect(vignetteDepuisProposition(tour.propositions[0]!, null).mise).toEqual(MISE_PAR_DEFAUT);
  });
});
```

- [ ] **Step 2 : lancer** `npx vitest run studio/src/logique/publication.test.ts` → échec.

- [ ] **Step 3 : logique**

```ts
export interface Formulaire {
  pose: string; accroche: string; logosTexte: string; captures: string[]; consignes: string;
  base: { consigne: number; proposition: number } | null;
}

// Logos en texte : la saisie du tour si elle existe, sinon les noms de fichiers sans extension.
const texteLogos = (logos: string[]) => logos.map(f => f.replace(/\.[^.]+$/, '')).join(', ');

// Repartir d'une variante : ses éléments et son accroche ; les consignes sont à réécrire.
export function formulaireDepuisBase(v: VideoPubliee, consigne: number, proposition: number): Formulaire {
  const tour = v.consignesVignette[consigne]!;
  const p = tour.propositions[proposition]!;
  return {
    pose: p.pose, accroche: p.accroche, logosTexte: tour.elements?.logosTexte ?? texteLogos(p.logos),
    captures: p.captures, consignes: '', base: { consigne, proposition },
  };
}

// Formulaire d'une vignette pas encore générée : la vignette actuelle, sinon la pose de la vidéo complète, les logiciels
// cités et la première accroche rédigée.
export function formulaireInitial(v: VideoPubliee, premierePose: string | undefined, complete: Vignette | null): Formulaire {
  const vi = v.vignette;
  return {
    pose: basePose(vi, complete, premierePose)?.fichier ?? '',
    accroche: vi?.accroche ?? v.accroches[0] ?? '',
    logosTexte: vi ? texteLogos(vi.logos) : v.logiciels.join(', '),
    captures: vi?.captures ?? [], consignes: '', base: null,
  };
}
```

Dans le test, `logiciels` vaut `[]` par défaut, d'où `logosTexte: ''`. `vignetteDepuisProposition` : ajouter `...(p.mise ? { mise: p.mise } : {})`. `api.ts` : remplacer `consigneVignette` par
```ts
genererVignette: (nom: string, cible: CiblePublication, f: Formulaire) =>
  appeler<Publication>(`${chemin(nom)}/publication/vignette/generer`, enJson('POST', { cible, ...f })),
```

- [ ] **Step 4 : `FormulaireVignette.tsx`** (reprend le rendu en aperçus de l'ancien `ConsignesVignette.tsx`)

```tsx
import { Thumbnail } from '@remotion/player';
import { type FC, useState } from 'react';
import { LIBELLES_GABARIT, MAX_ELEMENTS } from '../../../noyau/gabarits';
import { DOSSIER_CAPTURES, proprietesVignette, type BasesImages, type ConsigneVignette, type Publication, type Vignette, type VideoPubliee } from '../../../noyau/publication';
import { HAUTEUR_VIGNETTE, LARGEUR_VIGNETTE, Vignette as CompositionVignette } from '../../../remotion/composants/Vignette';
import type { DetailPublication, Pose } from '../../commun';
import { api } from '../api';
import { appliquerProposition, basculer, formulaireDepuisBase, formulaireInitial, vignetteDepuisProposition, type Formulaire } from '../logique/publication';
import { Attente } from './Attente';

export const GENERATION_VIGNETTE = 'Claude génère 3 vignettes…';

interface Props {
  nom: string;
  video: VideoPubliee;
  detail: DetailPublication;
  poses: Pose[];
  captures: string[];
  complete: Vignette | null;
  bases: BasesImages;
  changer: (c: Partial<VideoPubliee>) => void;
  lancer: (libelle: string, action: () => Promise<Publication>) => Promise<void>;
  occupe: string | null;
}

const apercu = (v: Vignette, bases: BasesImages) => (
  <Thumbnail component={CompositionVignette} compositionWidth={LARGEUR_VIGNETTE} compositionHeight={HAUTEUR_VIGNETTE}
    frameToDisplay={0} durationInFrames={1} fps={30} inputProps={proprietesVignette(v, bases)} style={{ width: '100%' }} />
);

// L'auteur fixe pose, accroche, logos, captures et consignes ; Claude ne génère qu'au clic. Une variante choisie devient
// la base du tour suivant et remplit le formulaire.
export const FormulaireVignette: FC<Props> = ({ nom, video: v, detail, poses, captures, complete, bases, changer, lancer, occupe }) => {
  const [f, setF] = useState<Formulaire>(() => formulaireInitial(v, poses[0]?.fichier, complete));
  const [historique, setHistorique] = useState(false);
  const modifier = (c: Partial<Formulaire>) => setF(a => ({ ...a, ...c }));
  const urlCapture = (fichier: string) => `${detail.urlTournage}/${DOSSIER_CAPTURES}/${encodeURIComponent(fichier)}`;
  const base = f.base && v.consignesVignette[f.base.consigne]?.propositions[f.base.proposition];
  const dernier = v.consignesVignette.at(-1);

  const generer = () => {
    if (occupe || !f.pose || !f.accroche.trim()) return;
    void lancer(GENERATION_VIGNETTE, () => api.genererVignette(nom, v.cible, f));
  };
  // Retenir une variante l'applique à la vignette et en fait la base du prochain tour.
  const retenir = (i: number, j: number) => {
    changer(appliquerProposition(v, i, j));
    setF(formulaireDepuisBase(v, i, j));
  };

  const tour = (c: ConsigneVignette, i: number) => (
    <div key={i} className="consigne">
      {c.texte && <div><strong>{c.texte}</strong></div>}
      {c.compris && <div className="reformulation">J’ai compris : {c.compris}</div>}
      {c.introuvables.length > 0 && <div className="alerte">Logos introuvables dans la banque : {c.introuvables.join(', ')}</div>}
      {c.pasRealisable.length > 0 && <div className="alerte">Pas réalisable :<ul>{c.pasRealisable.map((n, k) => <li key={k}>{n}</li>)}</ul></div>}
      <div className="gabarits">
        {c.propositions.map((p, j) => (
          <button key={j} className={c.choisie === j ? 'gabarit choisi' : 'gabarit'} disabled={!!occupe} onClick={() => retenir(i, j)}>
            {apercu(vignetteDepuisProposition(p, null), bases)}
            <span>{LIBELLES_GABARIT[p.gabarit]}{c.choisie === j ? ' · retenue' : ''} — « {p.accroche} » — {p.explication}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="consignes-vignette">
      <div className="actions">
        <span>Pose :</span>
        {poses.map(p => (
          <button key={p.fichier} className={f.pose === p.fichier ? 'pose choisie' : 'pose'} title={p.fichier} onClick={() => modifier({ pose: p.fichier })}>
            <img src={p.url} alt={p.fichier} />
          </button>
        ))}
      </div>
      <label>
        Accroche (3 à 5 mots)
        <input value={f.accroche} onChange={e => modifier({ accroche: e.target.value })} />
      </label>
      {v.accroches.length > 0 && (
        <div className="actions">
          <span className="discret">Accroches rédigées :</span>
          {v.accroches.map(a => <button key={a} className={a === f.accroche ? 'choisi' : undefined} onClick={() => modifier({ accroche: a })}>{a}</button>)}
        </div>
      )}
      <label>
        Logos (noms séparés par des virgules, cherchés dans la banque)
        <input value={f.logosTexte} placeholder="Excel, Teams, SharePoint" onChange={e => modifier({ logosTexte: e.target.value })} />
      </label>
      <div className="actions">
        <span>Captures ({f.captures.length}/{MAX_ELEMENTS}) :</span>
        {captures.map(c => (
          <button key={c} className={f.captures.includes(c) ? 'pose choisie' : 'pose'} title={c} onClick={() => modifier({ captures: basculer(f.captures, c) })}>
            <img src={urlCapture(c)} alt={c} />
          </button>
        ))}
      </div>
      <label>
        Consignes
        <textarea className="zone-consigne" rows={2} value={f.consignes} placeholder="Zoome sur le bouton Partager, ton plus léger…" onChange={e => modifier({ consignes: e.target.value })} />
      </label>
      {base && (
        <div className="base-vignette">
          <p className="discret">Variante de départ <button onClick={() => modifier({ base: null })}>Repartir de zéro</button></p>
          {apercu(vignetteDepuisProposition(base, null), bases)}
        </div>
      )}
      <div className="actions">
        <button disabled={!!occupe || !f.pose || !f.accroche.trim()} onClick={generer}>Générer 3 vignettes</button>
        {occupe === GENERATION_VIGNETTE && <Attente libelle={GENERATION_VIGNETTE} />}
      </div>
      {dernier && tour(dernier, v.consignesVignette.length - 1)}
      {v.consignesVignette.length > 1 && (
        <details onToggle={e => setHistorique(e.currentTarget.open)}>
          <summary>Tours précédents ({v.consignesVignette.length - 1})</summary>
          {historique && v.consignesVignette.slice(0, -1).map((c, i) => ({ c, i })).reverse().map(({ c, i }) => tour(c, i))}
        </details>
      )}
    </div>
  );
};
```

Les anciens tours (sans `elements`) s'affichent et se retiennent normalement (`formulaireDepuisBase` retombe sur les noms de fichiers).

- [ ] **Step 5 : `ChoixVignette.tsx`** — supprimer : la rangée des poses, le champ et les boutons d'accroche, la rangée des logos, la case « Pour Claude » et `candidates`, le bloc « Gabarit : cliquez sur un aperçu », la fonction `composer` et les imports devenus inutiles (`gabaritRetenu`, `gabaritsCompatibles`, `logosSuggeres`, `MAX_CANDIDATES`, `basePose`, `ConsignesVignette`). Garder : dépôt et actualisation des captures (la rangée de captures n'est plus affichée ici, elle l'est dans le formulaire ; passer `captures` au formulaire), aperçu/rendu, bouton « Rendre la vignette ». Insérer à la place de `<ConsignesVignette … />` :

```tsx
<FormulaireVignette nom={nom} video={v} detail={detail} poses={poses} captures={captures} complete={complete} bases={bases} changer={changer} lancer={lancer} occupe={occupe} />
```

La prop `gabaritsAutres` de `ChoixVignette` n'est plus utilisée : la retirer et la retirer de l'appelant (`CartePublication.tsx`). Le message « Aucune pose » reste : l'afficher quand `poses.length === 0`. Ajouter dans `styles.css` : `.base-vignette { max-width: 320px; }`.

- [ ] **Step 6 : vérifier** `npx vitest run` → tout passe ; `npm run typecheck` → aucune erreur.

- [ ] **Step 7 : essai réel** — lancer le studio (`npm run validation`), ouvrir une publication, remplir le formulaire avec 2 captures et « Excel, Teams », générer, vérifier les 3 aperçus (mise différente, une accroche identique à la saisie), retenir une variante, constater le formulaire rempli et la base affichée, changer un logo, regénérer, puis « Rendre la vignette ».

- [ ] **Step 8 : commit**

```bash
git add studio/src
git rm studio/src/composants/ConsignesVignette.tsx
git commit -m "Vignette : formulaire du studio, 3 variantes générées au clic, itération depuis une variante"
```

---

### Task 8 : Documentation

**Files :** Modify : `docs/studio.md`

- [ ] **Step 1 :** remplacer la section de la vignette (chercher « Pour Claude » et « consigne ») par : le formulaire (pose, accroche, logos en texte, captures, consignes), le bouton « Générer 3 vignettes », la mise en page variée par Claude (côté de la pose, taille d'accroche, recadrages, logo vedette), le choix d'une variante qui devient la base, l'historique des tours, et le rendu inchangé. Mentionner que les logos SVG ne sont vus que par leur nom.
- [ ] **Step 2 : commit** `git add docs/studio.md && git commit -m "Documentation : nouvelle génération de vignette"`
