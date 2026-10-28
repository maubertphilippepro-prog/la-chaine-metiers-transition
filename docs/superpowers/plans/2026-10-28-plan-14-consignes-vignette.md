# Plan 14 — Consignes à Claude pour la vignette — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplifier la vignette (fond de la charte et pose de la banque seulement), ajouter les captures candidates, puis laisser l'auteur écrire une consigne libre à laquelle Claude répond par 2 ou 3 compositions à choisir en aperçu.

**Architecture:** Le noyau (`noyau/publication.ts`, `noyau/gabarits.ts`) porte les types, la lecture et les vérifications. Un nouveau module serveur `studio/serveur/vignette-claude.ts` construit le prompt, appelle Claude (même appel que la rédaction) et nettoie les propositions ; une route `POST …/publication/vignette/consigne` l'utilise. Côté studio, un composant `ConsignesVignette` affiche consignes et aperçus (`Thumbnail` Remotion), et l'application d'une proposition est une fonction pure de `studio/src/logique/publication.ts`.

**Tech Stack:** TypeScript, React 19, Remotion (`@remotion/player` Thumbnail), Node http, `@anthropic-ai/sdk` 0.135 + zod 4, Vitest.

Spec : [2026-10-28-consignes-vignette-design.md](../specs/2026-10-28-consignes-vignette-design.md).

## Global Constraints

- Tout le code, les noms, les commentaires et les textes d'interface sont en français, dans le style du code voisin (commentaires courts au-dessus des fonctions, apostrophes typographiques `’` dans les textes affichés comme le code voisin).
- `publication.json` reste en **version 2**.
- Le fond est toujours celui de la charte ; la pose vient toujours de `donnees/poses/` : `PoseVignette` = `{ source: 'banque'; fichier: string }`.
- À la lecture, un champ `fond` de vignette est ignoré ; une pose `camera` rend la publication invalide avec le message `vignette : pose caméra plus prise en charge, choisissez une pose de la banque` (préfixé par `videos[i] : ` comme les autres raisons).
- `capturesCandidates` : **5 au plus** (`MAX_CANDIDATES = 5`), dans l'ordre de choix ; une candidate disparue du disque est ignorée (ne bloque ni rendu ni validation).
- La vignette garde **3 logos et 3 captures au plus** (`MAX_ELEMENTS = 3`, inchangé) ; les gabarits ne changent pas.
- Une `ConsigneVignette` a **1 à 3** propositions (`MAX_PROPOSITIONS_VIGNETTE = 3`) ; `choisie` est `null` ou un indice valide.
- Route : `POST /api/tournages/<nom>/publication/vignette/consigne` avec `{ cible, texte }` ; texte vide → 400 ; aucune proposition valable → 422 `Claude n’a proposé aucune composition utilisable.`, rien n'est enregistré ; erreur de Claude → rien n'est enregistré.
- Appel Claude : modèle de `reglages.modeles.claude`, `effort: 'medium'`, `fallbacks: 'default'` avec l'en-tête `anthropic-beta: server-side-fallback-2026-07-01`, clé `ANTHROPIC_API_KEY` — exactement comme `redigerPublication`.
- Une seule consigne en cours à la fois par vidéo (bouton désactivé et sablier pendant l'appel).
- Commandes : `npx vitest run` (tests unitaires), `npx tsc --noEmit` (types), `npm run test:rendu` (rendus Remotion réels, demande ffmpeg). Lancer depuis la racine du dépôt.
- Messages de commit dans le style du dépôt (`Studio : …`, `Vignette : …`) terminés par la ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## File Structure

| Fichier | Rôle dans ce plan |
|---|---|
| `noyau/publication.ts` | Types `Vignette` sans fond, `PoseVignette` banque seule, `PropositionVignette`, `ConsigneVignette`, champs `capturesCandidates` / `consignesVignette`, lecture et vérifications, `gabaritsAutres` (déplacé ici) |
| `noyau/gabarits.ts` | `MAX_CANDIDATES`, `DESCRIPTIONS_GABARIT` |
| `remotion/composants/vignette/*.tsx`, `remotion/Root.tsx` | Gabarits sans `fondUrl` |
| `studio/serveur/publication.ts` | Retrait image écran / caméra ; route de consigne |
| `studio/serveur/vignette-claude.ts` (nouveau) | Prompt, appel Claude, nettoyage des propositions |
| `studio/serveur/redaction.ts` | `consigneDeTon` partagée |
| `studio/serveur/pipeline.ts`, `principal.ts` | Retrait `extraireImage`, ajout `proposerVignettes` |
| `studio/commun.ts` | `DetailPublication` sans `camera` ni `sourceUrl` |
| `studio/src/logique/publication.ts` | `basePose`, `basculer(…, max)`, `vignetteDepuisProposition`, `appliquerProposition` |
| `studio/src/composants/ChoixVignette.tsx` | Sans fond ni caméra ; case « Pour Claude » ; intègre `ConsignesVignette` |
| `studio/src/composants/ConsignesVignette.tsx` (nouveau) | Champ de consigne, réponses de Claude en aperçu |
| `studio/src/composants/EcranPublication.tsx`, `CartePublication.tsx` | Retrait du lecteur de la source et de `instant` |
| `studio/src/api.ts` | Retrait `image`, ajout `consigneVignette` |
| `docs/studio.md` | Section Vignette |

---

### Task 1: Fin du fond écran et de la pose caméra

**Files:**
- Modify: `noyau/publication.ts`, `noyau/publication.test.ts`
- Modify: `remotion/composants/vignette/briques.tsx`, `Classique.tsx`, `Demonstration.tsx`, `Mosaique.tsx`, `Vitrine.tsx`, `remotion/Root.tsx`, `remotion/scripts/vignette.test.ts`, `remotion/scripts/vignette.e2e.test.ts`
- Modify: `studio/serveur/publication.ts`, `studio/serveur/publication.test.ts`, `studio/serveur/pipeline.ts`, `studio/serveur/principal.ts`, `studio/commun.ts`
- Modify: `studio/src/api.ts`, `studio/src/logique/publication.ts`, `studio/src/logique/publication.test.ts`, `studio/src/composants/ChoixVignette.tsx`, `studio/src/composants/CartePublication.tsx`, `studio/src/composants/EcranPublication.tsx`
- Modify: `docs/studio.md`

**Interfaces:**
- Produces: `PoseVignette = { source: 'banque'; fichier: string }` ; `Vignette` sans `fond` ; `ProprietesVignette` sans `fondUrl` ; `basePose(vignette, complete, premierePose): PoseVignette | null` (remplace `baseVignette`) ; helper interne `estNomFichier` dans `noyau/publication.ts` ; `ChoixVignette` et `CartePublication` sans prop `instant` ; `DetailPublication` sans `camera` ni `sourceUrl`.
- Disparaissent : `FondVignette`, `imageEcran`, `imageCamera`, `fichierCamera`, la route `POST …/publication/image`, `ConfigPublication.extraireImage`, `extraireImage` de `pipeline.ts`, `api.image`, `baseVignette`. (La commande Python `mtpipeline image` reste, hors périmètre.)

- [ ] **Step 1: Tests du noyau (rouges)**

Dans `noyau/publication.test.ts` :

1. Retirer `imageCamera, imageEcran` de l'import, et `fond: { source: 'ecran', instant: 12.3456 },` de la constante `VIGNETTE`.
2. Dans `it('range les images de travail par instant en millisecondes'` : ne garder que la ligne `poseDetouree` et renommer le test `'nomme la pose détourée'`.
3. Remplacer le test `'donne les propriétés de la composition : adresses des images et accroche nettoyée'` par :

```ts
  it('donne les propriétés de la composition : adresses des images et accroche nettoyée', () => {
    const bases = { tournage: 'http://f/essai', poses: 'http://p', logos: 'http://l' };
    expect(proprietesVignette({ ...VIGNETTE, accroche: ' Le presse-papiers caché ' }, bases)).toEqual({
      gabarit: 'classique',
      poseUrl: 'http://p/surpris.detoure.png',
      logoUrls: [],
      captureUrls: [],
      accroche: 'Le presse-papiers caché',
    });
    const riche = proprietesVignette({
      ...VIGNETTE, gabarit: 'mosaique', pose: { source: 'banque', fichier: 'ému.jpg' },
      logos: ['power bi.svg'], captures: ['étape 1.png', 'b.jpg'],
    }, bases);
    expect(riche).toEqual({
      gabarit: 'mosaique',
      poseUrl: 'http://p/%C3%A9mu.detoure.png',
      logoUrls: ['http://l/power%20bi.svg'],
      captureUrls: ['http://f/essai/captures/%C3%A9tape%201.png', 'http://f/essai/captures/b.jpg'],
      accroche: 'Le presse-papiers caché',
    });
  });
```

4. Dans le test `'compare les vignettes sur la pose, le fond et l’accroche'` : renommer en `'compare les vignettes sur la pose et l’accroche'` et remplacer la ligne `fond: { source: 'charte' }` par :

```ts
    expect(cleVignette(VIGNETTE)).not.toBe(cleVignette({ ...VIGNETTE, pose: { source: 'banque', fichier: 'autre.jpg' } }));
    expect(cleVignette(VIGNETTE)).not.toBe(cleVignette({ ...VIGNETTE, accroche: 'Autre' }));
```

5. Ajouter dans `describe('migrerPublication'` :

```ts
  it('ignore le fond d’une vignette d’avant', () => {
    const video = { ...videoParDefaut('complete', PERSO), vignette: { ...VIGNETTE, fond: { source: 'ecran', instant: 3 } } };
    const p = migrerPublication({ version: 2, qualificationParDefaut: PERSO, videos: [video] }) as Publication;
    expect(p.videos[0]!.vignette).toEqual(VIGNETTE);
    expect(raisonPublication(p)).toBeNull();
  });
```

6. Ajouter dans `describe('raisonPublication'` :

```ts
  it('refuse une pose caméra, plus prise en charge', () => {
    const v = { ...prete().videos[0]!, vignette: { ...VIGNETTE, pose: { source: 'camera', instant: 2 } } };
    expect(raisonPublication({ ...prete(), videos: [v] }))
      .toBe('videos[0] : vignette : pose caméra plus prise en charge, choisissez une pose de la banque');
  });
```

7. Chercher toute autre occurrence de `fond` ou `camera` dans le fichier (`grep -n "fond\|camera" noyau/publication.test.ts`) et la retirer de la même façon (un test qui vérifiait `fond` invalide disparaît).

Run: `npx vitest run noyau/publication.test.ts`
Expected: FAIL (fond encore lu, `fondUrl` encore produit, pose caméra acceptée).

- [ ] **Step 2: Noyau**

Dans `noyau/publication.ts` :

```ts
// Pose prise dans donnees/poses/ ; la forme { source, fichier } est celle des fichiers déjà enregistrés.
export type PoseVignette = { source: 'banque'; fichier: string };

export interface Vignette {
  pose: PoseVignette;
  accroche: string;
  gabarit: Gabarit;
  // Fichiers de donnees/logos/ et de captures/ du tournage, dans l'ordre choisi ; 3 au plus.
  logos: string[];
  captures: string[];
  // rendus/vignettes/<cible>.jpg une fois rendue ; null tant qu'elle ne l'est pas.
  fichier: string | null;
}
```

Supprimer `FondVignette`, `estInstant`, `ms`, `imageEcran`, `imageCamera`.

```ts
// Ce qui distingue deux vignettes à l'image : pose, accroche, gabarit, logos et captures (pas le fichier rendu).
export function cleVignette(v: Vignette | null): string {
  if (!v) return '';
  return [v.pose.fichier, v.accroche, v.gabarit, v.logos.join(','), v.captures.join(',')].join('|');
}
```

```ts
// Champs venus après la version 2 (vignettes variées), absents des fichiers plus anciens. Le fond (charte ou écran),
// abandonné depuis, est ignoré.
function completerVideo(v: unknown): unknown {
  if (!estObjet(v)) return v;
  let vignette = v.vignette;
  if (estObjet(vignette)) {
    const { fond: _, ...reste } = vignette;
    vignette = { gabarit: 'classique', logos: [], captures: [], ...reste };
  }
  return { logiciels: [], ...v, vignette };
}
```

```ts
const estNomFichier = (f: unknown) => estTexte(f) && f !== '' && !/[\\/]/.test(f);

function raisonVignette(v: unknown): string | null {
  if (v === null) return null;
  if (!estObjet(v) || !estObjet(v.pose)) return 'vignette : pose attendue';
  if (v.pose.source === 'camera') return 'vignette : pose caméra plus prise en charge, choisissez une pose de la banque';
  if (v.pose.source !== 'banque' || !estNomFichier(v.pose.fichier)) return 'vignette : pose invalide';
  if (!estTexte(v.accroche)) return 'vignette : accroche attendue';
  if (!GABARITS.includes(v.gabarit as Gabarit)) return 'vignette : gabarit invalide';
  for (const champ of ['logos', 'captures']) {
    const liste = v[champ];
    if (!(Array.isArray(liste) && liste.length <= MAX_ELEMENTS && liste.every(estNomFichier))) return `vignette : ${champ} invalides`;
  }
  if (v.fichier !== null && !estTexte(v.fichier)) return 'vignette : fichier invalide';
  return null;
}
```

```ts
// Ce que la composition Remotion « Vignette » reçoit : gabarit, adresses HTTP des images, accroche.
export type ProprietesVignette = {
  gabarit: Gabarit;
  // Pose détourée (PNG transparent).
  poseUrl: string | null;
  logoUrls: string[];
  captureUrls: string[];
  accroche: string;
};

export function proprietesVignette(v: Vignette, b: BasesImages): ProprietesVignette {
  return {
    gabarit: v.gabarit,
    poseUrl: `${b.poses}/${encodeURIComponent(poseDetouree(v.pose.fichier))}`,
    logoUrls: v.logos.map(f => `${b.logos}/${encodeURIComponent(f)}`),
    captureUrls: v.captures.map(f => `${b.tournage}/${DOSSIER_CAPTURES}/${encodeURIComponent(f)}`),
    accroche: v.accroche.trim(),
  };
}
```

Run: `npx vitest run noyau/publication.test.ts`
Expected: PASS.

- [ ] **Step 3: Gabarits Remotion sans fond écran**

`remotion/composants/vignette/briques.tsx` — remplacer `Fond` et `Accroche` :

```tsx
// Fond de la charte : formes sur blanc.
export const Fond: FC = () => (
  <>
    <div style={{ position: 'absolute', right: -120, top: -120, width: 520, height: 520, borderRadius: '50%', backgroundColor: charte.bleuGris, opacity: 0.6 }} />
    <div style={{ position: 'absolute', right: 0, bottom: 0, width: 0, height: 0, borderBottom: `320px solid ${charte.bleu}`, borderLeft: '320px solid transparent' }} />
  </>
);
```

```tsx
// Accroche en capitales, bleue avec un halo blanc (elle reste lisible là où la pose passe dessous).
export const Accroche: FC<{ texte: string; largeur: number; tailleMax?: number }> = ({ texte, largeur, tailleMax = Infinity }) => (
  <div
    style={{
      fontSize: Math.min(tailleMax, tailleAccroche(texte, largeur)), fontWeight: 800, lineHeight: 1.05, textTransform: 'uppercase',
      color: charte.bleu,
      textShadow: '0 0 4px rgba(255, 255, 255, 1), 0 0 10px rgba(255, 255, 255, 1), 0 0 22px rgba(255, 255, 255, 0.9)',
    }}
  >
    {texte}
  </div>
);
```

Retirer l'import `HAUTEUR_VIGNETTE, LARGEUR_VIGNETTE` de `briques.tsx` s'il n'est plus utilisé, et `Img`/`AbsoluteFill` seulement s'ils ne servent plus ailleurs dans le fichier (`FondDegrade`, `Pose`, `TuileLogo`, `CarteCapture` les utilisent : vérifier avec `npx tsc --noEmit`).

`Classique.tsx` :

```tsx
// Bande rouge, logo en haut à gauche, accroche à gauche, pose en grand à droite.
export const Classique: FC<ProprietesVignette> = ({ poseUrl, accroche }) => (
  <>
    <Fond />
    <BandeRouge />
    <Pose url={poseUrl} style={{ right: 0, maxWidth: '55%', objectPosition: 'right bottom' }} />
    <div style={{ position: 'absolute', left: 64, top: 40 }}>
      <LogoMT hauteur={72} />
    </div>
    <div style={{ position: 'absolute', left: 64, top: 150, bottom: 60, width: 640, display: 'flex', alignItems: 'center' }}>
      <Accroche texte={accroche} largeur={640} />
    </div>
  </>
);
```

`Demonstration.tsx` : retirer `fondUrl` des props, `<Fond url={fondUrl} />` → `<Fond />`, `<LogoMT hauteur={64} plaque={fondUrl !== null} />` → `<LogoMT hauteur={64} />`.

`Mosaique.tsx` : retirer `fondUrl` des props, `<Fond />`, `<Accroche texte={accroche} largeur={700} tailleMax={80} />`, `<LogoMT hauteur={52} />`.

`Vitrine.tsx` : retirer la phrase « Le fond choisi est ignoré. » du commentaire.

`remotion/Root.tsx` ligne des `defaultProps` : retirer `fondUrl: null, `.

`remotion/scripts/vignette.test.ts` : retirer `fondUrl: null, ` de `PROPS`.

`remotion/scripts/vignette.e2e.test.ts` : supprimer la ligne `ffmpeg(... 'testsrc=size=1920x1080' ... 'fond.png')`, retirer `fondUrl: \`${serveur.url}/fond.png\`, ` et `fondUrl: null, ` des appels, et renommer le second test `'rend le classique sans logo ni capture'`.

- [ ] **Step 4: Tests serveur (rouges)**

Dans `studio/serveur/publication.test.ts` :

1. Retirer `extraireImage: vi.fn(...)` (les 4 lignes) de `config`.
2. Dans `'liste les vidéos rendues et une publication par défaut'` : retirer `expect(d.sourceUrl)...` et `expect(d.camera).toBeNull();`, ajouter `expect(d).not.toHaveProperty('camera');` et `expect(d).not.toHaveProperty('sourceUrl');`.
3. Supprimer le test `'repère un enregistrement caméra séparé…'` et tout le `describe('images', …)`.
4. Retirer `fond: { source: 'charte' }, ` de chaque vignette littérale du fichier.
5. Dans `'rend la vignette avec les adresses de ses images'` : retirer `fondUrl: null, ` de l'objet attendu.
6. Ajouter dans `describe('enregistrement'` :

```ts
  it('ignore le fond d’une vignette envoyée par un ancien studio', async () => {
    const dossier = await tournage('a');
    const p = await lirePublication('a');
    const vignette = { pose: { source: 'banque', fichier: 'surpris.jpg' }, fond: { source: 'ecran', instant: 2 }, accroche: 'A', fichier: null };
    expect((await envoyer('a', { ...p, videos: p.videos.map(v => (v.cible === 'complete' ? { ...v, vignette } : v)) })).status).toBe(200);
    const enregistree = JSON.parse(await readFile(path.join(dossier, 'publication.json'), 'utf-8')) as Publication;
    expect(enregistree.videos[0]!.vignette).not.toHaveProperty('fond');
  });
  it('refuse de lire une publication dont la vignette a une pose caméra', async () => {
    const dossier = await tournage('a');
    const p = await lirePublication('a');
    const vignette = { pose: { source: 'camera', instant: 2 }, accroche: 'A', gabarit: 'classique', logos: [], captures: [], fichier: null };
    await writeFile(path.join(dossier, 'publication.json'), JSON.stringify({ ...p, videos: p.videos.map(v => (v.cible === 'complete' ? { ...v, vignette } : v)) }));
    const r = await fetch(`${url}/api/tournages/a/publication`);
    expect(r.status).toBe(409);
    expect((await r.json()).erreur).toContain('pose caméra plus prise en charge, choisissez une pose de la banque');
  });
  it('ne connaît plus la route des images', async () => {
    await tournage('a');
    // Hors de l'expression des routes : l'API de publication laisse passer, le serveur de test répond 418.
    expect((await action('a', 'image', { source: 'ecran', instant: 1 })).status).toBe(418);
  });
```

Run: `npx vitest run studio/serveur/publication.test.ts`
Expected: FAIL (`camera`, `sourceUrl` et `fondUrl` encore produits).

- [ ] **Step 5: Serveur**

`studio/serveur/publication.ts` :
- Import du noyau : retirer `imageCamera, imageEcran`. Retirer `urlSource` de l'import de `../../remotion/scripts/tournage` s'il ne sert plus.
- `ConfigPublication` : supprimer `extraireImage`.
- Supprimer `EXTENSIONS_VIDEO`, `estCamera`, `fichierCamera`, `executerPipeline`, `image`.
- `detail()` : supprimer les lignes `sourceUrl: …` et `camera: …`.
- `vignette()` : remplacer le début par

```ts
    if (!v) throw new ErreurHttp(422, 'Composez d’abord la vignette : pose et accroche.');
    if (!v.accroche.trim()) throw new ErreurHttp(422, 'Accroche vide.');
    if (!existsSync(path.join(c.cheminPoses, poseDetouree(v.pose.fichier)))) {
      throw new ErreurHttp(409, 'Image de la vignette absente : choisissez de nouveau la pose.');
    }
```

- Expression des routes : retirer `image|` ; retirer la ligne `else if (action === 'image' …`.

`studio/serveur/pipeline.ts` : supprimer la ligne `export const extraireImage = …`.
`studio/serveur/principal.ts` : retirer `extraireImage` de l'import et la ligne `extraireImage,` de la configuration.
`studio/commun.ts` : dans `DetailPublication`, supprimer `sourceUrl: string;` et `camera: string | null; …`. (Ne pas toucher aux autres interfaces qui ont un `sourceUrl`.)

Run: `npx vitest run studio/serveur/publication.test.ts`
Expected: PASS.

- [ ] **Step 6: Logique du studio**

Dans `studio/src/logique/publication.test.ts`, remplacer `describe('baseVignette', …)` par :

```ts
describe('basePose', () => {
  const complete = { pose: { source: 'banque' as const, fichier: 'c.jpg' }, accroche: 'Titre', gabarit: 'classique' as const, logos: [], captures: [], fichier: 'x.jpg' };
  const propre = { pose: { source: 'banque' as const, fichier: 'a.jpg' }, accroche: '', gabarit: 'classique' as const, logos: [], captures: [], fichier: null };
  it('garde la pose de l’épisode quand il a une vignette', () => {
    expect(basePose(propre, complete, 'b.jpg')).toEqual(propre.pose);
  });
  it('reprend la pose de la vidéo complète', () => {
    expect(basePose(null, complete, 'b.jpg')).toEqual(complete.pose);
  });
  it('retombe sur la première pose de la banque, sinon aucune', () => {
    expect(basePose(null, null, 'b.jpg')).toEqual({ source: 'banque', fichier: 'b.jpg' });
    expect(basePose(null, null, undefined)).toBeNull();
  });
});
```

Mettre à jour l'import (`basePose` au lieu de `baseVignette`) et retirer `fond: { source: 'charte' as const }, ` de la vignette littérale de `describe('gabaritsAutres'`.

Dans `studio/src/logique/publication.ts`, remplacer `baseVignette` par :

```ts
// Pose de départ d’une vignette : la sienne, sinon celle de la vidéo complète, sinon la première pose de la banque.
export function basePose(vignette: Vignette | null, complete: Vignette | null, premierePose: string | undefined): PoseVignette | null {
  const source = vignette ?? complete;
  if (source) return source.pose;
  return premierePose ? { source: 'banque', fichier: premierePose } : null;
}
```

et retirer `FondVignette` de l'import.

Run: `npx vitest run studio/src/logique/publication.test.ts`
Expected: PASS.

- [ ] **Step 7: Composants du studio**

`studio/src/api.ts` : supprimer `image: …` (2 lignes).

`studio/src/composants/ChoixVignette.tsx` :
- Props : supprimer `instant` et son commentaire ; supprimer `arrondi`, l'état `extraction`, la fonction `prendre`, le bouton « Caméra à l’image affichée », toute la rangée `<div className="actions"><span>Fond :</span>…</div>` et la ligne `{extraction && <p><Attente libelle="Extraction de l’image…" /></p>}`.
- Commentaire du composant : `// Pose de la banque, accroche, logos et captures ; aperçu immédiat, puis rendu en JPEG par le serveur.`
- Commentaire de la prop `complete` : `// Vignette de la vidéo complète : pose de départ des épisodes.`
- `composer` :

```tsx
  const composer = (c: Partial<Omit<Vignette, 'fichier'>>) => {
    const pose = c.pose ?? basePose(vignette, complete, poses[0]?.fichier);
    if (!pose) {
      setErreur('Aucune pose : ajoutez des photos dans donnees/poses/.');
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
        accroche: c.accroche ?? vignette?.accroche ?? v.accroches[0] ?? '',
        gabarit: gabaritRetenu(c.gabarit ?? vignette?.gabarit ?? null, compatibles),
        logos,
        captures: choisies,
        fichier: vignette?.fichier ?? null,
      },
    });
  };
```

- Import : `basePose` au lieu de `baseVignette`.
- Texte d'aide en bas : `À refaire après chaque changement de pose, d’accroche, de logos, de captures ou de gabarit, avant de valider.`

`studio/src/composants/CartePublication.tsx` : supprimer la prop `instant` (interface, déstructuration, et `instant={instant}` passé à `ChoixVignette`).

`studio/src/composants/EcranPublication.tsx` : supprimer `sourceAbsente`, `lecteur`, `instant`, le `<h3>Images pour les vignettes</h3>`, son paragraphe, le `<video …>` et l'alerte `sourceAbsente` ; retirer `instant={instant}` passé à `CartePublication` et `useRef` de l'import. Commentaire du composant : `// Une carte par vidéo rendue.`

Run: `npx tsc --noEmit`
Expected: aucune erreur. Puis `grep -rn "fondUrl\|imageEcran\|imageCamera\|fichierCamera\|extraireImage\|baseVignette\|FondVignette" noyau remotion studio --include=*.ts --include=*.tsx` → aucune ligne.

- [ ] **Step 8: Documentation**

Dans `docs/studio.md`, section Publication, puce **Vignette**, remplacer le début

`choisir une pose (photo de \`donnees/poses/\`, détourée automatiquement, ou caméra séparée à l’image affichée dans le lecteur), un fond (formes de la charte, ou écran à l’image affichée) et une accroche.`

par

`choisir une pose (photo de \`donnees/poses/\`, détourée automatiquement) et une accroche ; le fond est toujours celui de la charte.`

Chercher (`grep -n "image affichée\|Images pour les vignettes\|caméra séparée" docs/*.md`) toute autre mention du fond écran, de la pose caméra ou du lecteur de la source dans la documentation et la retirer.

- [ ] **Step 9: Vérification complète et commit**

Run: `npx vitest run` → tous verts. `npx tsc --noEmit` → 0 erreur. `npm run test:rendu` → tous verts (rendus réels des 4 gabarits sans fond écran).

```bash
git add -A noyau remotion studio docs/studio.md
git commit -m "Vignette : fond de la charte et pose de la banque seulement (fin du fond écran et de la pose caméra)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Données des consignes et captures candidates

**Files:**
- Modify: `noyau/gabarits.ts`, `noyau/publication.ts`, `noyau/publication.test.ts`
- Modify: `studio/src/logique/publication.ts`, `studio/src/logique/publication.test.ts`, `studio/src/composants/ChoixVignette.tsx`, `studio/src/styles.css`
- Modify: `docs/studio.md`

**Interfaces:**
- Consumes (Task 1) : `estNomFichier` (interne à `noyau/publication.ts`), `Vignette` sans fond.
- Produces :
  - `noyau/gabarits.ts` : `export const MAX_CANDIDATES = 5;`
  - `noyau/publication.ts` : `export const MAX_PROPOSITIONS_VIGNETTE = 3;`, `export interface PropositionVignette { pose: string; logos: string[]; captures: string[]; gabarit: Gabarit; accroche: string; explication: string }`, `export interface ConsigneVignette { texte: string; compris: string; pasRealisable: string[]; propositions: PropositionVignette[]; choisie: number | null }`, `VideoPubliee.capturesCandidates: string[]`, `VideoPubliee.consignesVignette: ConsigneVignette[]`.
  - `studio/src/logique/publication.ts` : `basculer(liste: string[], fichier: string, max = MAX_ELEMENTS): string[]`.

- [ ] **Step 1: Tests du noyau (rouges)**

Dans `noyau/publication.test.ts`, ajouter `type ConsigneVignette` à l'import et :

```ts
const CONSIGNE: ConsigneVignette = {
  texte: 'Mets en avant le planning',
  compris: 'Le planning au premier plan.',
  pasRealisable: [],
  propositions: [{ pose: 'surpris.jpg', logos: ['excel.png'], captures: ['planning.png'], gabarit: 'demonstration', accroche: 'Planning sans effort', explication: 'La capture du planning en grand.' }],
  choisie: 0,
};

describe('captures candidates et consignes de vignette', () => {
  const avec = (changement: object) => ({ ...prete(), videos: [{ ...prete().videos[0]!, ...changement }] });
  it('part de listes vides, y compris à la lecture d’un fichier qui ne les a pas', () => {
    expect(videoParDefaut('complete', PERSO)).toMatchObject({ capturesCandidates: [], consignesVignette: [] });
    const { capturesCandidates: _, consignesVignette: __, ...ancienne } = prete().videos[0]!;
    const p = migrerPublication({ ...prete(), videos: [ancienne] }) as Publication;
    expect(p.videos[0]).toMatchObject({ capturesCandidates: [], consignesVignette: [] });
  });
  it('accepte 5 candidates et une consigne bien formée', () => {
    expect(raisonPublication(avec({ capturesCandidates: ['a.png', 'b.png', 'c.png', 'd.png', 'e.png'], consignesVignette: [CONSIGNE] }))).toBeNull();
    expect(raisonPublication(avec({ consignesVignette: [{ ...CONSIGNE, choisie: null }] }))).toBeNull();
  });
  it('refuse plus de 5 candidates ou un nom avec un chemin', () => {
    expect(raisonPublication(avec({ capturesCandidates: ['a', 'b', 'c', 'd', 'e', 'f'].map(f => `${f}.png`) })))
      .toBe('videos[0] : capturesCandidates invalides (5 au plus)');
    expect(raisonPublication(avec({ capturesCandidates: ['../a.png'] }))).toBe('videos[0] : capturesCandidates invalides (5 au plus)');
  });
  it('refuse une consigne mal formée', () => {
    const p = CONSIGNE.propositions[0]!;
    expect(raisonPublication(avec({ consignesVignette: 'non' }))).toBe('videos[0] : consignesVignette doit être une liste');
    expect(raisonPublication(avec({ consignesVignette: [{ ...CONSIGNE, compris: 3 }] })))
      .toBe('videos[0] : consignesVignette[0] : texte, compris et pasRealisable attendus');
    expect(raisonPublication(avec({ consignesVignette: [{ ...CONSIGNE, propositions: [], choisie: null }] })))
      .toBe('videos[0] : consignesVignette[0] : 1 à 3 propositions attendues');
    expect(raisonPublication(avec({ consignesVignette: [{ ...CONSIGNE, propositions: [p, p, p, p] }] })))
      .toBe('videos[0] : consignesVignette[0] : 1 à 3 propositions attendues');
    expect(raisonPublication(avec({ consignesVignette: [{ ...CONSIGNE, propositions: [{ ...p, gabarit: 'autre' }] }] })))
      .toBe('videos[0] : consignesVignette[0] : proposition invalide');
    expect(raisonPublication(avec({ consignesVignette: [{ ...CONSIGNE, propositions: [{ ...p, logos: ['a', 'b', 'c', 'd'] }] }] })))
      .toBe('videos[0] : consignesVignette[0] : proposition invalide');
    expect(raisonPublication(avec({ consignesVignette: [{ ...CONSIGNE, choisie: 1 }] })))
      .toBe('videos[0] : consignesVignette[0] : choisie invalide');
  });
});
```

Run: `npx vitest run noyau/publication.test.ts`
Expected: FAIL.

- [ ] **Step 2: Noyau**

`noyau/gabarits.ts`, sous `MAX_ELEMENTS` :

```ts
// Captures qu'on peut proposer à Claude pour les compositions d'une vignette, au plus.
export const MAX_CANDIDATES = 5;
```

`noyau/publication.ts` : importer `MAX_CANDIDATES` ; après `Vignette` :

```ts
// Composition proposée par Claude en réponse à une consigne : fichiers de donnees/poses/, donnees/logos/ et captures/.
export interface PropositionVignette {
  pose: string;
  logos: string[];
  captures: string[];
  gabarit: Gabarit;
  accroche: string;
  // Une phrase : ce qui distingue cette composition.
  explication: string;
}

export interface ConsigneVignette {
  texte: string;
  // Reformulation de Claude (« J’ai compris : … »).
  compris: string;
  pasRealisable: string[];
  propositions: PropositionVignette[];
  // Indice de la proposition appliquée à la vignette, null tant qu'aucune ne l'est.
  choisie: number | null;
}

export const MAX_PROPOSITIONS_VIGNETTE = 3;
```

Dans `VideoPubliee`, après `vignette` :

```ts
  // Captures de captures/ proposées à Claude pour les consignes de vignette, dans l'ordre de choix ; 5 au plus.
  capturesCandidates: string[];
  consignesVignette: ConsigneVignette[];
```

`videoParDefaut` : ajouter `capturesCandidates: [],` et `consignesVignette: [],` après `vignette: null,`.

`completerVideo` : `return { logiciels: [], capturesCandidates: [], consignesVignette: [], ...v, vignette };`

Vérifications, à côté de `estNomFichier` :

```ts
const listeDeFichiers = (v: unknown, max: number) => Array.isArray(v) && v.length <= max && v.every(estNomFichier);

function raisonConsigneVignette(c: unknown): string | null {
  if (!estObjet(c) || !estTexte(c.texte) || !estTexte(c.compris) || !listeDeTextes(c.pasRealisable)) {
    return 'texte, compris et pasRealisable attendus';
  }
  const propositions = c.propositions;
  if (!Array.isArray(propositions) || propositions.length < 1 || propositions.length > MAX_PROPOSITIONS_VIGNETTE) {
    return `1 à ${MAX_PROPOSITIONS_VIGNETTE} propositions attendues`;
  }
  const valide = (p: unknown) => estObjet(p) && estNomFichier(p.pose) && listeDeFichiers(p.logos, MAX_ELEMENTS)
    && listeDeFichiers(p.captures, MAX_ELEMENTS) && GABARITS.includes(p.gabarit as Gabarit) && estTexte(p.accroche) && estTexte(p.explication);
  if (!propositions.every(valide)) return 'proposition invalide';
  const choisie = c.choisie;
  if (choisie !== null && !(Number.isInteger(choisie) && (choisie as number) >= 0 && (choisie as number) < propositions.length)) return 'choisie invalide';
  return null;
}
```

Dans `raisonVignette`, la boucle `logos`/`captures` devient `if (!listeDeFichiers(v[champ], MAX_ELEMENTS)) return \`vignette : ${champ} invalides\`;`.

Dans `raisonPublication`, après la vérification de la vignette :

```ts
    if (!listeDeFichiers(v.capturesCandidates, MAX_CANDIDATES)) return `${ou} : capturesCandidates invalides (${MAX_CANDIDATES} au plus)`;
    if (!Array.isArray(v.consignesVignette)) return `${ou} : consignesVignette doit être une liste`;
    for (const [j, c] of v.consignesVignette.entries()) {
      const raison = raisonConsigneVignette(c);
      if (raison) return `${ou} : consignesVignette[${j}] : ${raison}`;
    }
```

Run: `npx vitest run noyau` → PASS. `npx tsc --noEmit` → corriger toute construction littérale de `VideoPubliee` signalée (elles doivent partir de `videoParDefaut`).

- [ ] **Step 3: `basculer` avec un maximum (test rouge puis code)**

Dans `studio/src/logique/publication.test.ts`, `describe('basculer'`, ajouter :

```ts
  it('accepte un autre maximum', () => {
    expect(basculer(['a', 'b', 'c', 'd'], 'e', 5)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(basculer(['a', 'b', 'c', 'd', 'e'], 'f', 5)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
```

Run: `npx vitest run studio/src/logique/publication.test.ts` → FAIL.

Dans `studio/src/logique/publication.ts` :

```ts
// Logo ou capture coché ou décoché ; au plus `max`, dans l'ordre des clics.
export function basculer(liste: string[], fichier: string, max = MAX_ELEMENTS): string[] {
  if (liste.includes(fichier)) return liste.filter(f => f !== fichier);
  return liste.length < max ? [...liste, fichier] : liste;
}
```

Run: même commande → PASS.

- [ ] **Step 4: Case « Pour Claude » dans le panneau Vignette**

Dans `studio/src/composants/ChoixVignette.tsx`, importer `MAX_CANDIDATES` depuis `noyau/gabarits`. Avant le `return` :

```tsx
  // Candidates encore sur le disque : une capture disparue est ignorée.
  const candidates = v.capturesCandidates.filter(f => captures.includes(f));
```

Remplacer la rangée des captures par :

```tsx
      <div className="actions">
        <span>Captures ({vignette?.captures.length ?? 0}/{MAX_ELEMENTS}) · pour Claude {candidates.length}/{MAX_CANDIDATES} :</span>
        {captures.map(f => (
          <div key={f} className="capture-candidate">
            <button
              className={vignette?.captures.includes(f) ? 'pose choisie' : 'pose'}
              title={f}
              onClick={() => composer({ captures: basculer(vignette?.captures ?? [], f) })}
            >
              <img src={urlCapture(f)} alt={f} />
            </button>
            <label className="discret">
              <input
                type="checkbox"
                checked={candidates.includes(f)}
                disabled={!candidates.includes(f) && candidates.length >= MAX_CANDIDATES}
                onChange={() => changer({ capturesCandidates: basculer(candidates, f, MAX_CANDIDATES) })}
              />
              {' '}Pour Claude
            </label>
          </div>
        ))}
        <button onClick={() => void actualiser()}>Actualiser</button>
      </div>
```

`studio/src/styles.css`, près de `.gabarits` :

```css
.capture-candidate { display: inline-flex; flex-direction: column; align-items: center; gap: 2px; }
```

- [ ] **Step 5: Documentation**

Dans `docs/studio.md`, puce **Vignette**, après la phrase qui se termine par `glissées sur le panneau.`, ajouter :

` La case « Pour Claude » sous une capture la propose à Claude pour les consignes de vignette (5 au plus) ; une capture proposée qui a disparu du disque est ignorée.`

- [ ] **Step 6: Vérification et commit**

Run: `npx vitest run` → vert ; `npx tsc --noEmit` → 0 erreur.

```bash
git add -A noyau studio docs/studio.md
git commit -m "Vignette : captures candidates pour Claude, données des consignes de vignette

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Prompt, appel et nettoyage des propositions de vignette

**Files:**
- Modify: `noyau/gabarits.ts`, `noyau/gabarits.test.ts`
- Modify: `studio/serveur/redaction.ts`
- Create: `studio/serveur/vignette-claude.ts`, `studio/serveur/vignette-claude.test.ts`

**Interfaces:**
- Consumes (Task 2) : `PropositionVignette`, `ConsigneVignette`, `MAX_PROPOSITIONS_VIGNETTE` de `noyau/publication.ts` ; `MAX_ELEMENTS`, `GABARITS`, `LIBELLES_GABARIT`, `gabaritsCompatibles`, `gabaritRetenu` de `noyau/gabarits.ts`.
- Produces :
  - `noyau/gabarits.ts` : `export const DESCRIPTIONS_GABARIT: Record<Gabarit, string>`.
  - `studio/serveur/redaction.ts` : `export const consigneDeTon = (q: Qualification) => string` (utilisée par `construirePromptRedaction`, texte inchangé).
  - `studio/serveur/vignette-claude.ts` : `ElementsDisponibles`, `DemandeVignette`, `ReponseVignette`, `type ProposerVignettes = (d: DemandeVignette) => Promise<ReponseVignette>`, `construirePromptVignette(d): string`, `nettoyerPropositionsVignette(propositions, disponibles, actuelle, dejaUtilises): PropositionVignette[]`, `proposerVignettes(d, client?): Promise<ReponseVignette>`.

- [ ] **Step 1: Descriptions des gabarits**

Test dans `noyau/gabarits.test.ts` :

```ts
describe('DESCRIPTIONS_GABARIT', () => {
  it('décrit chaque gabarit avec sa condition', () => {
    expect(Object.keys(DESCRIPTIONS_GABARIT).sort()).toEqual([...GABARITS].sort());
    expect(DESCRIPTIONS_GABARIT.mosaique).toContain('dès deux captures');
  });
});
```

(ajouter `DESCRIPTIONS_GABARIT` et `GABARITS` à l'import si besoin). Run `npx vitest run noyau/gabarits.test.ts` → FAIL. Puis dans `noyau/gabarits.ts`, après `LIBELLES_GABARIT` :

```ts
// Ce que montre chaque gabarit et quand il est possible, pour Claude.
export const DESCRIPTIONS_GABARIT: Record<Gabarit, string> = {
  vitrine: 'pose au centre sur fond bleu dégradé, jusqu’à trois logos autour de la tête, accroche en bandeau rouge en bas ; possible dès un logo',
  demonstration: 'première capture en grande carte à gauche, premier logo épinglé dans son coin, pose à droite, accroche en bandeau dessous ; possible dès une capture',
  mosaique: 'accroche en haut à gauche, deux ou trois captures en éventail dessous, premier logo en tuile, pose à droite ; possible dès deux captures',
  classique: 'accroche en grand à gauche, pose en grand à droite, sans logo ni capture ; toujours possible',
};
```

Run → PASS.

- [ ] **Step 2: Ton partagé avec la rédaction**

Dans `studio/serveur/redaction.ts`, avant `construirePromptRedaction` :

```ts
// Ton des textes selon la diffusion : tout ce qui part sur YouTube, même privé, ne cite aucune organisation.
export const consigneDeTon = (q: Qualification) => (diffusion(q).youtube === 'aucun'
  ? 'Cette vidéo est destinée à un usage interne : ton sobre et professionnel.'
  : 'Cette vidéo part sur YouTube : ne mentionne aucun employeur, client ni organisation, même si la transcription en cite.');
```

et dans `construirePromptRedaction`, `const ton = consigneDeTon(d.qualification);`.

Run: `npx vitest run studio/serveur/redaction.test.ts` → PASS (comportement inchangé).

- [ ] **Step 3: Tests de `vignette-claude` (rouges)**

Créer `studio/serveur/vignette-claude.test.ts` :

```ts
import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import type { ConsigneVignette, PropositionVignette, Vignette } from '../../noyau/publication';
import { ErreurInterpretation } from './consignes';
import {
  construirePromptVignette, nettoyerPropositionsVignette, proposerVignettes, type DemandeVignette, type ElementsDisponibles,
} from './vignette-claude';

const DISPONIBLES: ElementsDisponibles = {
  poses: ['surpris.jpg', 'souriant.jpg'],
  logos: ['excel.png', 'teams.svg'],
  captures: ['planning.png', 'tableau.png'],
  accroches: ['Planning sans effort', 'Excel en 2 clics'],
};
const ACTUELLE: Vignette = {
  pose: { source: 'banque', fichier: 'souriant.jpg' }, accroche: 'Accroche actuelle', gabarit: 'classique', logos: [], captures: [], fichier: null,
};
const PROPOSITION: PropositionVignette = {
  pose: 'surpris.jpg', logos: ['excel.png'], captures: ['planning.png'], gabarit: 'demonstration', accroche: 'Planning en un clin d’œil', explication: 'Le planning en grand.',
};
const PRECEDENTE: ConsigneVignette = {
  texte: 'Plus sobre', compris: 'Moins d’éléments.', pasRealisable: [], propositions: [{ ...PROPOSITION, gabarit: 'classique', logos: [], captures: [] }], choisie: 0,
};
const demande: DemandeVignette = {
  consigne: 'Mets en avant le planning, ton plus léger',
  titre: 'Le planning Excel', description: 'Un planning partagé.', logiciels: ['Excel'],
  disponibles: DISPONIBLES, actuelle: ACTUELLE, dejaUtilises: ['vitrine'], precedentes: [PRECEDENTE],
  qualification: { nature: 'perso', confidentielle: false }, modele: 'claude-opus-5-5',
};

function client(parse: (...args: unknown[]) => Promise<unknown>) {
  const fonction = vi.fn(parse);
  return { client: { messages: { parse: fonction } } as unknown as Anthropic, parse: fonction };
}

describe('construirePromptVignette', () => {
  it('donne la consigne, les textes et les noms de fichiers proposables', () => {
    const prompt = construirePromptVignette(demande);
    expect(prompt).toContain('<consigne>\nMets en avant le planning, ton plus léger\n</consigne>');
    expect(prompt).toContain('Titre : Le planning Excel');
    expect(prompt).toContain('- Planning sans effort');
    expect(prompt).toContain('- Excel');
    expect(prompt).toContain('- surpris.jpg');
    expect(prompt).toContain('- teams.svg');
    expect(prompt).toContain('- planning.png\n- tableau.png');
    expect(prompt).toContain('noms de fichiers');
  });
  it('décrit la composition actuelle et les gabarits, en signalant ceux déjà pris', () => {
    const prompt = construirePromptVignette(demande);
    expect(prompt).toContain('Composition actuelle : pose souriant.jpg, gabarit classique, accroche « Accroche actuelle »');
    expect(prompt).toMatch(/- vitrine \(Vitrine\) : .*possible dès un logo — déjà pris par une autre vidéo/);
    expect(prompt).not.toMatch(/- classique .*déjà pris/);
    expect(construirePromptVignette({ ...demande, actuelle: null })).toContain('Pas encore de composition.');
  });
  it('rappelle les consignes précédentes et la proposition retenue', () => {
    const prompt = construirePromptVignette(demande);
    expect(prompt).toContain('- « Plus sobre » (retenue : pose surpris.jpg, gabarit classique');
    expect(construirePromptVignette({ ...demande, precedentes: [{ ...PRECEDENTE, choisie: null }] })).toContain('aucune proposition retenue');
    expect(construirePromptVignette({ ...demande, precedentes: [] })).not.toContain('Consignes précédentes');
  });
  it('donne les règles et le ton selon la diffusion', () => {
    const prompt = construirePromptVignette(demande);
    expect(prompt).toContain('3 logos et 3 captures au plus');
    expect(prompt).toContain('3 à 5 mots');
    expect(prompt).toContain('ne mentionne aucun employeur');
    expect(construirePromptVignette({ ...demande, qualification: { nature: 'pro', confidentielle: true } })).toContain('usage interne');
  });
});

describe('nettoyerPropositionsVignette', () => {
  const nettoyer = (p: Partial<PropositionVignette>[], actuelle: Vignette | null = ACTUELLE) =>
    nettoyerPropositionsVignette(p.map(x => ({ ...PROPOSITION, ...x })), DISPONIBLES, actuelle, ['vitrine']);
  it('garde une proposition valable telle quelle, sans blancs', () => {
    expect(nettoyer([{ accroche: ' Planning en un clin d’œil ', explication: ' Le planning en grand. ' }])).toEqual([PROPOSITION]);
  });
  it('retire fichiers inconnus et doublons, et garde 3 éléments au plus', () => {
    const [p] = nettoyer([{ logos: ['excel.png', 'inconnu.png', 'excel.png', 'teams.svg'], captures: ['planning.png', 'hors-liste.png'] }]);
    expect(p).toMatchObject({ logos: ['excel.png', 'teams.svg'], captures: ['planning.png'] });
    const plusieurs = nettoyerPropositionsVignette(
      [{ ...PROPOSITION, logos: ['a.png', 'b.png', 'c.png', 'd.png'] }],
      { ...DISPONIBLES, logos: ['a.png', 'b.png', 'c.png', 'd.png'] }, ACTUELLE, [],
    );
    expect(plusieurs[0]!.logos).toEqual(['a.png', 'b.png', 'c.png']);
  });
  it('corrige un gabarit impossible avec les éléments retenus, en évitant ceux déjà pris', () => {
    expect(nettoyer([{ gabarit: 'mosaique', captures: ['planning.png'] }])[0]!.gabarit).toBe('demonstration');
    expect(nettoyer([{ gabarit: 'mosaique', captures: [], logos: ['excel.png'] }])[0]!.gabarit).toBe('classique');
  });
  it('remplace une pose inconnue par celle de la composition actuelle, sinon la première de la banque', () => {
    expect(nettoyer([{ pose: 'inconnue.jpg' }])[0]!.pose).toBe('souriant.jpg');
    expect(nettoyer([{ pose: 'inconnue.jpg' }], null)[0]!.pose).toBe('surpris.jpg');
  });
  it('remplace une accroche vide par l’actuelle, sinon la première rédigée', () => {
    expect(nettoyer([{ accroche: '  ' }])[0]!.accroche).toBe('Accroche actuelle');
    expect(nettoyer([{ accroche: '' }], null)[0]!.accroche).toBe('Planning sans effort');
  });
  it('fusionne les propositions identiques après nettoyage et en garde 3 au plus', () => {
    expect(nettoyer([{}, { logos: ['excel.png', 'inconnu.png'], explication: 'Autre' }])).toHaveLength(1);
    const quatre = nettoyer([{ accroche: 'Un' }, { accroche: 'Deux' }, { accroche: 'Trois' }, { accroche: 'Quatre' }]);
    expect(quatre.map(p => p.accroche)).toEqual(['Un', 'Deux', 'Trois']);
  });
  it('ne garde rien sans pose ni accroche possibles', () => {
    expect(nettoyerPropositionsVignette([PROPOSITION], { ...DISPONIBLES, poses: [] }, null, [])).toEqual([]);
    expect(nettoyerPropositionsVignette([{ ...PROPOSITION, accroche: '' }], { ...DISPONIBLES, accroches: [] }, null, [])).toEqual([]);
  });
});

describe('proposerVignettes', () => {
  const REPONSE = { compris: 'Le planning en avant.', pasRealisable: [], propositions: [PROPOSITION] };
  it('appelle Claude en sortie structurée, effort moyen, avec repli serveur', async () => {
    const { client: c, parse } = client(async () => ({ stop_reason: 'end_turn', parsed_output: REPONSE }));
    expect(await proposerVignettes(demande, c)).toEqual(REPONSE);
    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-opus-5-5', fallbacks: 'default', output_config: expect.objectContaining({ effort: 'medium' }) }),
      { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } },
    );
  });
  it('signale un refus ou une réponse inexploitable', async () => {
    await expect(proposerVignettes(demande, client(async () => ({ stop_reason: 'refusal', parsed_output: null })).client)).rejects.toThrow(ErreurInterpretation);
    await expect(proposerVignettes(demande, client(async () => ({ stop_reason: 'max_tokens', parsed_output: null })).client))
      .rejects.toThrow('inexploitable');
  });
  it('traduit une erreur de connexion en 503', async () => {
    const { client: c } = client(async () => { throw new Anthropic.APIConnectionError({ message: 'hors ligne' }); });
    await expect(proposerVignettes(demande, c)).rejects.toMatchObject({ statut: 503 });
  });
});
```

Run: `npx vitest run studio/serveur/vignette-claude.test.ts` → FAIL (module absent).

- [ ] **Step 4: Module `vignette-claude.ts`**

Créer `studio/serveur/vignette-claude.ts` :

```ts
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { DESCRIPTIONS_GABARIT, GABARITS, gabaritRetenu, gabaritsCompatibles, LIBELLES_GABARIT, MAX_ELEMENTS, type Gabarit } from '../../noyau/gabarits';
import { MAX_PROPOSITIONS_VIGNETTE, type ConsigneVignette, type PropositionVignette, type Vignette } from '../../noyau/publication';
import type { Qualification } from '../../noyau/qualification';
import { traduireErreurClaude, verifierCleClaude } from './claude';
import { ErreurInterpretation } from './consignes';
import { consigneDeTon } from './redaction';

// Fichiers que Claude peut citer (il n'en voit que les noms) et accroches de repli.
export interface ElementsDisponibles {
  poses: string[];
  logos: string[];
  // Captures proposables : les candidates cochées par l'auteur, sinon toutes celles du dossier.
  captures: string[];
  // Accroches déjà rédigées.
  accroches: string[];
}

// Ce qu'il faut à Claude pour proposer des compositions de vignette d'après une consigne.
export interface DemandeVignette {
  consigne: string;
  titre: string;
  description: string;
  logiciels: string[];
  disponibles: ElementsDisponibles;
  actuelle: Vignette | null;
  // Gabarits pris par les autres vidéos de la publication : à éviter si possible.
  dejaUtilises: Gabarit[];
  precedentes: ConsigneVignette[];
  qualification: Qualification;
  modele: string;
}

export interface ReponseVignette {
  compris: string;
  pasRealisable: string[];
  propositions: PropositionVignette[];
}

export type ProposerVignettes = (d: DemandeVignette) => Promise<ReponseVignette>;

const liste = (titre: string, elements: string[]) =>
  (elements.length > 0 ? `${titre} :\n${elements.map(e => `- ${e}`).join('\n')}` : `${titre} : aucun`);

const decrire = (c: { pose: string; gabarit: Gabarit; accroche: string; logos: string[]; captures: string[] }) =>
  `pose ${c.pose}, gabarit ${c.gabarit}, accroche « ${c.accroche} », logos : ${c.logos.join(', ') || 'aucun'}, captures : ${c.captures.join(', ') || 'aucune'}`;

export function construirePromptVignette(d: DemandeVignette): string {
  const actuelle = d.actuelle ? `Composition actuelle : ${decrire({ ...d.actuelle, pose: d.actuelle.pose.fichier })}` : 'Pas encore de composition.';
  const gabarits = GABARITS.map(g => `- ${g} (${LIBELLES_GABARIT[g]}) : ${DESCRIPTIONS_GABARIT[g]}`
    + (d.dejaUtilises.includes(g) ? ' — déjà pris par une autre vidéo de la publication, à éviter si possible' : '')).join('\n');
  const precedentes = d.precedentes.length > 0
    ? `\nConsignes précédentes pour cette vignette, de la plus ancienne à la plus récente :\n${d.precedentes.map(c => {
      const retenue = c.choisie === null ? 'aucune proposition retenue' : `retenue : ${decrire(c.propositions[c.choisie]!)}`;
      return `- « ${c.texte} » (${retenue})`;
    }).join('\n')}\n`
    : '';
  return `Tu aides l’auteur de la chaîne YouTube « PMT » (astuces et outils numériques expliqués simplement à un public non spécialiste) à composer la vignette d’une vidéo. Il te donne une consigne ; propose 2 ou 3 compositions complètes, il choisira en aperçu.

Titre : ${d.titre}
Description :
${d.description}

${liste('Accroches déjà rédigées', d.disponibles.accroches)}
${liste('Logiciels cités', d.logiciels)}

Tu ne vois pas les images, seulement leurs noms de fichiers : choisis d’après les noms.
${liste('Poses (photos de l’auteur)', d.disponibles.poses)}
${liste('Logos', d.disponibles.logos)}
${liste('Captures', d.disponibles.captures)}

${actuelle}

Gabarits :
${gabarits}
${precedentes}
<consigne>
${d.consigne}
</consigne>

Règles : le fond est toujours celui de la charte de la chaîne ; ${MAX_ELEMENTS} logos et ${MAX_ELEMENTS} captures au plus, pris dans les listes ci-dessus sous leur nom exact ; un gabarit seulement si sa condition est remplie ; l’accroche fait 3 à 5 mots, percutante et lisible en petit.
${consigneDeTon(d.qualification)}

Réponds avec :
- compris : ta reformulation de la consigne, en une phrase.
- pasRealisable : ce que la consigne demande et qu’aucune composition ne peut faire, chaque fois avec la raison (« un fond vert — le fond est toujours celui de la charte ») ; liste vide sinon.
- propositions : 2 ou 3 compositions différentes, chacune avec pose, logos, captures, gabarit, accroche et explication (une phrase qui dit ce qui la distingue).
`;
}

const SchemaVignette = z.object({
  compris: z.string(),
  pasRealisable: z.array(z.string()),
  propositions: z.array(z.object({
    pose: z.string(),
    logos: z.array(z.string()),
    captures: z.array(z.string()),
    gabarit: z.enum(GABARITS),
    accroche: z.string(),
    explication: z.string(),
  })),
});

const cle = (p: PropositionVignette) => [p.pose, p.gabarit, p.accroche, p.logos.join(','), p.captures.join(',')].join('|');

// Fichiers connus seulement, sans doublon, MAX_ELEMENTS au plus.
const connus = (fichiers: string[], disponibles: string[]) =>
  [...new Set(fichiers.map(f => f.trim()))].filter(f => disponibles.includes(f)).slice(0, MAX_ELEMENTS);

// Propositions ramenées à ce que la banque et le tournage permettent ; une proposition sans pose ni accroche possible
// est écartée, celles devenues identiques sont fusionnées.
export function nettoyerPropositionsVignette(
  propositions: PropositionVignette[], d: ElementsDisponibles, actuelle: Vignette | null, dejaUtilises: Gabarit[],
): PropositionVignette[] {
  const poseActuelle = actuelle && d.poses.includes(actuelle.pose.fichier) ? actuelle.pose.fichier : undefined;
  const resultat: PropositionVignette[] = [];
  for (const p of propositions) {
    const pose = d.poses.includes(p.pose.trim()) ? p.pose.trim() : (poseActuelle ?? d.poses[0]);
    const accroche = p.accroche.trim() || actuelle?.accroche.trim() || d.accroches[0]?.trim() || '';
    if (!pose || !accroche) continue;
    const logos = connus(p.logos, d.logos);
    const captures = connus(p.captures, d.captures);
    const gabarit = gabaritRetenu(p.gabarit, gabaritsCompatibles({ logos: logos.length, captures: captures.length }, dejaUtilises));
    const propre = { pose, logos, captures, gabarit, accroche, explication: p.explication.trim() };
    if (!resultat.some(r => cle(r) === cle(propre))) resultat.push(propre);
  }
  return resultat.slice(0, MAX_PROPOSITIONS_VIGNETTE);
}

// Même appel que la rédaction : sortie structurée, effort moyen, repli serveur. L'appelant nettoie les propositions.
export async function proposerVignettes(d: DemandeVignette, client?: Anthropic): Promise<ReponseVignette> {
  verifierCleClaude(client);
  let reponse;
  try {
    reponse = await (client ?? new Anthropic()).messages.parse(
      {
        model: d.modele,
        max_tokens: 8000,
        output_config: { effort: 'medium', format: zodOutputFormat(SchemaVignette) },
        messages: [{ role: 'user', content: construirePromptVignette(d) }],
        fallbacks: 'default',
      },
      { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } },
    );
  } catch (e) {
    throw traduireErreurClaude(e);
  }
  if (reponse.stop_reason === 'refusal') throw new ErreurInterpretation(500, 'Claude a refusé de proposer une vignette pour cette consigne.');
  if (!reponse.parsed_output) throw new ErreurInterpretation(500, `Réponse de Claude inexploitable (arrêt : ${reponse.stop_reason}).`);
  return reponse.parsed_output;
}
```

Si `z.enum(GABARITS)` ne passe pas le typage (tableau `readonly`), utiliser `z.enum([...GABARITS] as [Gabarit, ...Gabarit[]])`.

Run: `npx vitest run studio/serveur/vignette-claude.test.ts` → PASS. `npx tsc --noEmit` → 0 erreur.

Attendu du test « corrige un gabarit impossible » : avec 1 logo et 1 capture, `gabaritsCompatibles` donne `['demonstration', 'classique', 'vitrine']` (vitrine déjà pris, en dernier) ; avec 1 logo et 0 capture, `['classique', 'vitrine']`. Si un attendu du test ne correspond pas à `gabaritsCompatibles` tel qu'il est, c'est le test qu'il faut corriger (signaler l'écart dans le rapport), pas `gabaritsCompatibles`.

- [ ] **Step 5: Commit**

```bash
git add noyau/gabarits.ts noyau/gabarits.test.ts studio/serveur/redaction.ts studio/serveur/vignette-claude.ts studio/serveur/vignette-claude.test.ts
git commit -m "Studio : prompt, appel à Claude et nettoyage des propositions de vignette

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Route `POST …/publication/vignette/consigne`

**Files:**
- Modify: `noyau/publication.ts`, `noyau/publication.test.ts` (déplacement de `gabaritsAutres`)
- Modify: `studio/src/logique/publication.ts`, `studio/src/logique/publication.test.ts`, `studio/src/composants/EcranPublication.tsx` (import de `gabaritsAutres`)
- Modify: `studio/serveur/publication.ts`, `studio/serveur/publication.test.ts`, `studio/serveur/principal.ts`

**Interfaces:**
- Consumes (Task 3) : `type ProposerVignettes`, `nettoyerPropositionsVignette`, `proposerVignettes` de `studio/serveur/vignette-claude.ts`.
- Produces : `ConfigPublication.proposerVignettes: ProposerVignettes` ; `gabaritsAutres(p: Publication, cible: CiblePublication): Gabarit[]` exporté par `noyau/publication.ts` (et plus par `studio/src/logique/publication.ts`) ; la route renvoie la `Publication` enregistrée.

- [ ] **Step 1: Déplacer `gabaritsAutres` dans le noyau**

Couper `gabaritsAutres` (et son commentaire) de `studio/src/logique/publication.ts` et le coller à la fin de `noyau/publication.ts` (même code). Déplacer de même `describe('gabaritsAutres', …)` de `studio/src/logique/publication.test.ts` vers `noyau/publication.test.ts`, en adaptant les imports. Dans `studio/src/composants/EcranPublication.tsx`, importer `gabaritsAutres` depuis `'../../../noyau/publication'`. Retirer de `studio/src/logique/publication.ts` les imports devenus inutiles.

Run: `npx vitest run noyau studio/src` → PASS ; `npx tsc --noEmit` → 0 erreur.

- [ ] **Step 2: Tests de la route (rouges)**

Dans `studio/serveur/publication.test.ts` :

En tête :

```ts
const PROPOSITION_VIGNETTE = {
  pose: 'surpris.jpg', logos: ['excel.png', 'inconnu.png'], captures: ['a.png', 'b.png'], gabarit: 'mosaique', accroche: 'Planning facile', explication: 'Les captures en éventail.',
};
const REPONSE_VIGNETTE = { compris: 'Le planning en avant.', pasRealisable: [' Un fond vert — le fond est celui de la charte ', ''], propositions: [PROPOSITION_VIGNETTE] };
```

Dans `config` : `proposerVignettes: vi.fn(async () => REPONSE_VIGNETTE),` (après `rediger`).

Nouveau `describe` :

```ts
describe('consigne pour la vignette', () => {
  async function preparer() {
    const dossier = await tournage('a');
    await writeFile(path.join(racine, 'poses', 'surpris.jpg'), 'jpg');
    await writeFile(path.join(racine, 'poses', 'surpris.detoure.png'), 'png');
    await writeFile(path.join(racine, 'logos', 'excel.png'), 'png');
    await mkdir(path.join(dossier, 'captures'));
    await writeFile(path.join(dossier, 'captures', 'a.png'), 'png');
    await writeFile(path.join(dossier, 'captures', 'b.png'), 'png');
    return dossier;
  }
  const consigne = (corps: unknown) => action('a', 'vignette/consigne', corps);

  it('envoie à Claude les captures candidates, nettoie et ajoute la consigne', async () => {
    const dossier = await preparer();
    const p = await lirePublication('a');
    await envoyer('a', { ...p, videos: p.videos.map(v => (v.cible === 'complete' ? { ...v, titre: 'Planning', capturesCandidates: ['b.png', 'disparue.png'] } : v)) });
    const r = await consigne({ cible: 'complete', texte: ' Mets en avant le planning ' });
    expect(r.status).toBe(200);
    expect(config.proposerVignettes).toHaveBeenCalledWith(expect.objectContaining({
      consigne: 'Mets en avant le planning',
      titre: 'Planning',
      disponibles: { poses: ['surpris.jpg'], logos: ['excel.png'], captures: ['b.png'], accroches: [] },
      actuelle: null,
      dejaUtilises: [],
      precedentes: [],
      qualification: { nature: 'perso', confidentielle: false },
    }));
    const attendue = {
      texte: 'Mets en avant le planning',
      compris: 'Le planning en avant.',
      pasRealisable: ['Un fond vert — le fond est celui de la charte'],
      // 1 logo, 1 capture proposable : la mosaïque est impossible, la vitrine vient en premier (aucun gabarit pris).
      propositions: [{ ...PROPOSITION_VIGNETTE, logos: ['excel.png'], captures: ['b.png'], gabarit: 'vitrine' }],
      choisie: null,
    };
    expect(((await r.json()) as Publication).videos[0]!.consignesVignette).toEqual([attendue]);
    const enregistree = JSON.parse(await readFile(path.join(dossier, 'publication.json'), 'utf-8')) as Publication;
    expect(enregistree.videos[0]!.consignesVignette).toEqual([attendue]);
  });
  it('propose toutes les captures du dossier quand aucune candidate n’est cochée', async () => {
    await preparer();
    await consigne({ cible: 'complete', texte: 'Plus de captures' });
    expect(vi.mocked(config.proposerVignettes).mock.calls[0]![0].disponibles.captures).toEqual(['a.png', 'b.png']);
  });
  it('ajoute la consigne suivante après les précédentes, qu’il transmet à Claude', async () => {
    await preparer();
    await consigne({ cible: 'complete', texte: 'Première' });
    const r = await consigne({ cible: 'complete', texte: 'Seconde' });
    expect(vi.mocked(config.proposerVignettes).mock.calls[1]![0].precedentes.map(c => c.texte)).toEqual(['Première']);
    expect(((await r.json()) as Publication).videos[0]!.consignesVignette.map(c => c.texte)).toEqual(['Première', 'Seconde']);
  });
  it('refuse une consigne vide sans appeler Claude', async () => {
    await preparer();
    expect((await consigne({ cible: 'complete', texte: '  ' })).status).toBe(400);
    expect((await consigne({ cible: 'complete' })).status).toBe(400);
    expect(config.proposerVignettes).not.toHaveBeenCalled();
  });
  it('n’enregistre rien quand Claude échoue', async () => {
    const dossier = await preparer();
    vi.mocked(config.proposerVignettes).mockRejectedValueOnce(new ErreurInterpretation(503, 'Connexion à l’API Claude impossible : hors ligne'));
    const r = await consigne({ cible: 'complete', texte: 'Mets en avant le planning' });
    expect(r.status).toBe(503);
    expect((await r.json()).erreur).toContain('Connexion à l’API Claude impossible');
    expect(existsSync(path.join(dossier, 'publication.json'))).toBe(false);
  });
  it('n’enregistre rien quand aucune proposition n’est utilisable', async () => {
    const dossier = await preparer();
    await rm(path.join(racine, 'poses', 'surpris.jpg'));
    const r = await consigne({ cible: 'complete', texte: 'Mets en avant le planning' });
    expect(r.status).toBe(422);
    expect((await r.json()).erreur).toBe('Claude n’a proposé aucune composition utilisable.');
    expect(existsSync(path.join(dossier, 'publication.json'))).toBe(false);
  });
});
```

Importer `ErreurInterpretation` depuis `'./consignes'` en tête du fichier de test. Si `publication.json` existe déjà avant l'appel dans un de ces deux derniers tests (parce qu'un `PUT` a eu lieu), comparer son contenu avant et après au lieu de tester son absence.

Run: `npx vitest run studio/serveur/publication.test.ts` → FAIL (route inconnue, `proposerVignettes` absent de `ConfigPublication`).

- [ ] **Step 3: Route**

Dans `studio/serveur/publication.ts` :

- Imports : ajouter `gabaritsAutres, type ConsigneVignette` à l'import de `../../noyau/publication` ; `import { nettoyerPropositionsVignette, type ProposerVignettes } from './vignette-claude';`.
- `ConfigPublication`, après `rediger: Rediger;` : `proposerVignettes: ProposerVignettes;`.
- Dans `creerApiPublication`, après `let relaisEnCours = false;` :

```ts
  // Une consigne de vignette à la fois par vidéo (« dossier|cible »).
  const consignesEnCours = new Set<string>();
```

- Extraire la liste des photos de `calculerPoses` :

```ts
  // Photos de donnees/poses/, sans leurs versions détourées.
  async function photosBanque(): Promise<string[]> {
    const fichiers = existsSync(c.cheminPoses) ? await readdir(c.cheminPoses) : [];
    return fichiers.filter(f => EXTENSIONS_PHOTO.has(path.extname(f).toLowerCase()) && !f.toLowerCase().endsWith('.detoure.png')).sort();
  }
```

et dans `calculerPoses`, remplacer les lignes `fichiers`/`photos` par `const photos = await photosBanque();`.

- Après `rediger` :

```ts
  // Consigne libre pour la vignette : Claude propose des compositions, nettoyées puis ajoutées à l'historique de la vidéo.
  // La vignette elle-même ne change pas : l'auteur applique une proposition depuis le studio.
  async function consigneVignette(req: IncomingMessage, ctx: Contexte): Promise<Publication> {
    const corps = await lireCorps(req);
    const cible = lireCible(corps, ctx.cibles);
    const brut = objet(corps).texte;
    const texte = typeof brut === 'string' ? brut.trim() : '';
    if (!texte) throw new ErreurHttp(400, 'Consigne vide.');
    const enCours = `${ctx.dossier}|${cible}`;
    if (consignesEnCours.has(enCours)) throw new ErreurHttp(409, 'Une consigne est déjà en cours pour cette vignette.');
    consignesEnCours.add(enCours);
    try {
      const video = videoDe(ctx.publication, cible);
      const toutes = await captures(ctx.dossier);
      const candidates = video.capturesCandidates.filter(f => toutes.includes(f));
      const disponibles = {
        poses: await photosBanque(), logos: await banqueLogos(), captures: candidates.length > 0 ? candidates : toutes, accroches: video.accroches,
      };
      const dejaUtilises = gabaritsAutres(ctx.publication, cible);
      let reponse;
      try {
        reponse = await c.proposerVignettes({
          consigne: texte,
          titre: video.titre || ctx.videos.find(v => v.cible === cible)!.titre,
          description: video.description,
          logiciels: video.logiciels,
          disponibles,
          actuelle: video.vignette,
          dejaUtilises,
          precedentes: video.consignesVignette,
          qualification: { nature: video.nature, confidentielle: video.confidentielle },
          modele: ctx.tournage.reglages.modeles.claude,
        });
      } catch (e) {
        if (e instanceof ErreurInterpretation) throw new ErreurHttp(e.statut, e.message);
        throw new ErreurHttp(500, `Proposition de vignette impossible : ${message(e)}`);
      }
      const propositions = nettoyerPropositionsVignette(reponse.propositions, disponibles, video.vignette, dejaUtilises);
      if (propositions.length === 0) throw new ErreurHttp(422, 'Claude n’a proposé aucune composition utilisable.');
      const nouvelle: ConsigneVignette = {
        texte,
        compris: reponse.compris.trim(),
        pasRealisable: reponse.pasRealisable.map(t => t.trim()).filter(t => t !== ''),
        propositions,
        choisie: null,
      };
      const actuelle = await relire(ctx);
      const p = modifierVideo(actuelle, cible, { consignesVignette: [...videoDe(actuelle, cible).consignesVignette, nouvelle] });
      await ecrirePublication(ctx.dossier, p);
      return p;
    } finally {
      consignesEnCours.delete(enCours);
    }
  }
```

- Expression des routes : `(redaction|vignette\/consigne|vignette|captures|valider|relais|site\/retirer|youtube\/(?:preparer|ouvrir|envoi|verifier))`.
- Aiguillage, avant la ligne `action === 'vignette'` : `else if (action === 'vignette/consigne' && req.method === 'POST') repondre(res, 200, await consigneVignette(req, ctx));`

`studio/serveur/principal.ts` : `import { proposerVignettes } from './vignette-claude';` et, après `rediger: d => redigerPublication(d),` : `proposerVignettes: d => proposerVignettes(d),`.

Run: `npx vitest run studio/serveur/publication.test.ts` → PASS. `npx vitest run` → vert. `npx tsc --noEmit` → 0 erreur.

- [ ] **Step 4: Commit**

```bash
git add -A noyau studio
git commit -m "Studio : route des consignes pour la vignette

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Panneau des consignes pour la vignette

**Files:**
- Modify: `studio/src/logique/publication.ts`, `studio/src/logique/publication.test.ts`
- Modify: `studio/src/api.ts`
- Create: `studio/src/composants/ConsignesVignette.tsx`
- Modify: `studio/src/composants/ChoixVignette.tsx`, `studio/src/styles.css`
- Modify: `docs/studio.md`

**Interfaces:**
- Consumes (Tasks 2, 4) : `PropositionVignette`, `ConsigneVignette`, `VideoPubliee.consignesVignette`, `proprietesVignette`, `BasesImages` (noyau) ; route `POST /api/tournages/<nom>/publication/vignette/consigne` `{ cible, texte }` → `Publication`.
- Produces : `vignetteDepuisProposition(p: PropositionVignette, fichier: string | null): Vignette`, `appliquerProposition(v: VideoPubliee, consigne: number, indice: number): Partial<VideoPubliee>` ; `api.consigneVignette(nom, cible, texte): Promise<Publication>` ; composant `ConsignesVignette`.

- [ ] **Step 1: Tests de la logique (rouges)**

Dans `studio/src/logique/publication.test.ts` (adapter les imports) :

```ts
describe('appliquerProposition', () => {
  const proposition = { pose: 'b.jpg', logos: ['excel.png'], captures: ['a.png'], gabarit: 'demonstration' as const, accroche: 'Planning facile', explication: 'En grand.' };
  const consigne = { texte: 'Le planning', compris: 'Planning.', pasRealisable: [], propositions: [proposition, { ...proposition, gabarit: 'classique' as const }], choisie: null };
  const video = {
    ...videoParDefaut('complete', PERSO),
    vignette: { pose: { source: 'banque' as const, fichier: 'a.jpg' }, accroche: 'Ancienne', gabarit: 'classique' as const, logos: [], captures: [], fichier: 'rendus/vignettes/complete.jpg' },
    consignesVignette: [consigne, { ...consigne, texte: 'Autre', choisie: 0 }],
  };
  it('compose la vignette d’après la proposition et la marque retenue', () => {
    const c = appliquerProposition(video, 0, 1);
    expect(c.vignette).toEqual({
      pose: { source: 'banque', fichier: 'b.jpg' }, accroche: 'Planning facile', gabarit: 'classique', logos: ['excel.png'], captures: ['a.png'],
      fichier: 'rendus/vignettes/complete.jpg',
    });
    expect(c.consignesVignette!.map(x => x.choisie)).toEqual([1, 0]);
  });
  it('ne change rien pour une proposition inconnue', () => {
    expect(appliquerProposition(video, 5, 0)).toEqual({});
    expect(appliquerProposition(video, 0, 7)).toEqual({});
  });
  it('compose une vignette sans fichier rendu pour l’aperçu', () => {
    expect(vignetteDepuisProposition(proposition, null)).toMatchObject({ pose: { source: 'banque', fichier: 'b.jpg' }, fichier: null });
  });
});
```

(Le fichier rendu est gardé tel quel : `appliquerModifications` le remet à `null` dès que l'image change.)

Run: `npx vitest run studio/src/logique/publication.test.ts` → FAIL.

- [ ] **Step 2: Logique**

Dans `studio/src/logique/publication.ts` (importer `PropositionVignette`, `Vignette`, `VideoPubliee` du noyau si besoin) :

```ts
// Vignette composée d'après une proposition de Claude.
export function vignetteDepuisProposition(p: PropositionVignette, fichier: string | null): Vignette {
  return { pose: { source: 'banque', fichier: p.pose }, accroche: p.accroche, gabarit: p.gabarit, logos: p.logos, captures: p.captures, fichier };
}

// Applique à la vignette la proposition `indice` de la consigne `consigne` et la marque retenue ; le fichier rendu
// est gardé tel quel (il redevient « à rendre » dès que l'image change, comme pour une retouche à la main).
export function appliquerProposition(v: VideoPubliee, consigne: number, indice: number): Partial<VideoPubliee> {
  const p = v.consignesVignette[consigne]?.propositions[indice];
  if (!p) return {};
  return {
    vignette: vignetteDepuisProposition(p, v.vignette?.fichier ?? null),
    consignesVignette: v.consignesVignette.map((c, i) => (i === consigne ? { ...c, choisie: indice } : c)),
  };
}
```

Run: même commande → PASS.

- [ ] **Step 3: Client de l'API**

Dans `studio/src/api.ts`, après `rendreVignette` :

```ts
  consigneVignette: (nom: string, cible: CiblePublication, texte: string) =>
    appeler<Publication>(`${chemin(nom)}/publication/vignette/consigne`, enJson('POST', { cible, texte })),
```

- [ ] **Step 4: Composant `ConsignesVignette`**

Créer `studio/src/composants/ConsignesVignette.tsx` :

```tsx
import { Thumbnail } from '@remotion/player';
import { type FC, type KeyboardEvent, useState } from 'react';
import { LIBELLES_GABARIT } from '../../../noyau/gabarits';
import { proprietesVignette, type BasesImages, type ConsigneVignette, type Publication, type VideoPubliee } from '../../../noyau/publication';
import { HAUTEUR_VIGNETTE, LARGEUR_VIGNETTE, Vignette as CompositionVignette } from '../../../remotion/composants/Vignette';
import { api } from '../api';
import { appliquerProposition, vignetteDepuisProposition } from '../logique/publication';
import { Attente } from './Attente';

export const CONSIGNE_VIGNETTE = 'Claude compose la vignette…';

interface Props {
  nom: string;
  video: VideoPubliee;
  bases: BasesImages;
  changer: (c: Partial<VideoPubliee>) => void;
  lancer: (libelle: string, action: () => Promise<Publication>) => Promise<void>;
  // Libellé de l’action en cours sur la carte, null si aucune.
  occupe: string | null;
}

// Consigne libre pour la vignette : Claude répond par 2 ou 3 compositions en aperçu, un clic en applique une.
export const ConsignesVignette: FC<Props> = ({ nom, video: v, bases, changer, lancer, occupe }) => {
  const [texte, setTexte] = useState('');

  const envoyer = () => {
    if (!texte.trim() || occupe) return;
    void lancer(CONSIGNE_VIGNETTE, async () => {
      const p = await api.consigneVignette(nom, v.cible, texte);
      setTexte('');
      return p;
    });
  };
  const touche = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      envoyer();
    }
  };

  const carte = (c: ConsigneVignette, i: number) => (
    <div key={i} className="consigne">
      <div><strong>{c.texte}</strong></div>
      <div className="reformulation">J’ai compris : {c.compris}</div>
      {c.pasRealisable.length > 0 && (
        <div className="alerte">
          Pas réalisable :
          <ul>{c.pasRealisable.map(n => <li key={n}>{n}</li>)}</ul>
        </div>
      )}
      <div className="gabarits">
        {c.propositions.map((p, j) => (
          <button key={j} className={c.choisie === j ? 'gabarit choisi' : 'gabarit'} disabled={!!occupe} onClick={() => changer(appliquerProposition(v, i, j))}>
            <Thumbnail
              component={CompositionVignette}
              compositionWidth={LARGEUR_VIGNETTE}
              compositionHeight={HAUTEUR_VIGNETTE}
              frameToDisplay={0}
              durationInFrames={1}
              fps={30}
              inputProps={proprietesVignette(vignetteDepuisProposition(p, null), bases)}
              style={{ width: '100%' }}
            />
            <span>{LIBELLES_GABARIT[p.gabarit]}{c.choisie === j ? ' · retenue' : ''} — {p.explication}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const n = v.consignesVignette.length;
  return (
    <div className="consignes-vignette">
      <label>
        Consigne pour la vignette
        <textarea
          className="zone-consigne" rows={2} value={texte} placeholder="Mets en avant le planning, ton plus léger…"
          onChange={e => setTexte(e.target.value)} onKeyDown={touche}
        />
      </label>
      <div className="actions">
        <button disabled={!!occupe || !texte.trim()} onClick={envoyer}>Envoyer</button>
        {occupe === CONSIGNE_VIGNETTE ? <Attente libelle={CONSIGNE_VIGNETTE} /> : <span className="discret">Ctrl+Entrée</span>}
      </div>
      {n > 0 && carte(v.consignesVignette[n - 1]!, n - 1)}
      {n > 1 && (
        <details>
          <summary>Consignes précédentes ({n - 1})</summary>
          {v.consignesVignette.slice(0, -1).map((c, i) => ({ c, i })).reverse().map(({ c, i }) => carte(c, i))}
        </details>
      )}
    </div>
  );
};
```

- [ ] **Step 5: Intégration dans le panneau Vignette**

Dans `studio/src/composants/ChoixVignette.tsx`, importer `ConsignesVignette` et l'insérer juste après le `<div className={depot ? 'depot actif' : 'depot'} …>…</div>` (sous les captures) :

```tsx
      <ConsignesVignette nom={nom} video={v} bases={bases} changer={changer} lancer={lancer} occupe={occupe} />
```

`studio/src/styles.css`, près de `.capture-candidate` :

```css
.consignes-vignette { margin: 0.75rem 0; }
```

Run: `npx tsc --noEmit` → 0 erreur ; `npx vitest run` → vert.

- [ ] **Step 6: Documentation**

Dans `docs/studio.md`, section Publication, ajouter après la puce **Vignette** :

```md
- **Consignes pour la vignette** : sous les captures, écrire une consigne libre (« mets en avant le planning, ton plus léger ») puis « Envoyer » (ou Ctrl+Entrée). Claude, qui ne voit que les noms des fichiers, reformule la consigne, signale ce qui n’est pas réalisable et propose 2 ou 3 compositions (pose, logos, captures, gabarit, accroche) en aperçu. Il pioche dans les captures cochées « Pour Claude », sinon dans toutes celles du dossier, et évite les gabarits déjà pris par les autres vidéos. Un clic sur un aperçu l’applique à la vignette, à retoucher puis rendre comme d’habitude. Les consignes précédentes restent consultables, la proposition retenue marquée.
```

- [ ] **Step 7: Commit**

```bash
git add -A studio docs/studio.md
git commit -m "Studio : consignes à Claude dans le panneau Vignette, propositions en aperçu

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Essai réel (contrôleur, pas de sous-agent)

- [ ] Sauvegarder `publication.json` d'un tournage rendu, lancer le studio de la branche, ouvrir l'écran Publication.
- [ ] Vérifier : plus de lecteur de la source ni de boutons écran / caméra ; pose de la banque et fond de la charte ; cases « Pour Claude » (compteur, désactivées au-delà de 5).
- [ ] Envoyer une consigne avec le vrai Claude : reformulation, « Pas réalisable » si on demande un fond vert, 2 ou 3 aperçus ; clic → vignette appliquée, « retenue » marqué ; « Rendre la vignette » ; deuxième consigne « plus court » → la première passe dans « Consignes précédentes ».
- [ ] Restaurer les données.
