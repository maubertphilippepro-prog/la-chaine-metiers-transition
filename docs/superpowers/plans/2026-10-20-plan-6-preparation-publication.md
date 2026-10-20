# Plan 6 — Préparation de la publication : plan de mise en œuvre

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une fois un tournage rendu, l'auteur choisit dans le studio les vidéos à publier (vidéo complète, épisodes) et leur profil (Interne, Perso, Mixte), obtient de Claude un titre, une description, des tags et des accroches, compose et rend une vignette 1280×720 (pose détourée, fond, accroche), puis valide chaque vidéo : elle passe à « prête ».

**Architecture:** Tout l'état vit dans `publication.json` du tournage. Les règles (forme du fichier, statuts, chemins des images, contrôles avant validation) sont des fonctions pures du noyau (`noyau/publication.ts`), les textes calculés (chapitres YouTube, description finale, paroles conservées) dans `noyau/publication-textes.ts`. Le pipeline Python gagne deux commandes génériques : extraire une image d'une vidéo, détourer une photo (rembg, modèle local). Remotion gagne une image fixe `Vignette`, rendue en JPEG par `renderStill`. Le serveur du studio expose les routes de publication dans un module à part (`studio/serveur/publication.ts`), le studio un écran « Publication » (`#/<tournage>/publication`).

**Tech Stack:** Node 22, TypeScript 5 (`strict`, `noUncheckedIndexedAccess`), Vitest 3, React 19.3.0, Vite 7.3.7, Remotion 4.0.533 (`@remotion/renderer` `renderStill`, `@remotion/player` `Thumbnail`), `@anthropic-ai/sdk` + `zod` ; Python 3.11 + Pillow + rembg (onnxruntime) + pytest ; ffmpeg.

Spec de référence : `docs/superpowers/specs/2026-10-20-publication-design.md` (sections Données et Plan 6).

## Global Constraints

- La chaîne s'appelle **« PMT »** (projet personnel). Aucune mention d'organisation dans le code, les textes affichés, les prompts ou la documentation. **Seule exception** : la liste `publication.mentionsInterdites` de `reglages.json`, qui sert à les refuser dans les textes publics.
- Texte visible, noms de domaine et prompts en français ; clés JSON en camelCase ; apostrophe typographique `’` dans les textes affichés et les messages d'erreur.
- `publication.json` : version 1 ; un fichier absent se lit comme une publication par défaut (vidéo complète cochée, profil `perso`).
- Cible d'une vidéo : `'complete'` ou numéro d'épisode à partir de 1, dans l'ordre de `decisionsEpisodes` (comme la cible du rendu).
- Statuts : `a-preparer` → `prete` uniquement par la route de validation ; toute modification du profil, du titre, de la description, des tags ou de la vignette d'une vidéo `prete` la ramène à `a-preparer`. Changer la pose, le fond ou l'accroche remet `vignette.fichier` à `null`.
- Limites (dans `reglages.json`, `publication`) : `titreMax: 100`, `descriptionMax: 5000` (chapitres compris), `tagsMax: 500`, `vignetteOctetsMax: 2000000`.
- Chapitres YouTube seulement pour la vidéo complète : au moins 3, chacun d'au moins 10 s, premier à `0:00` ; sinon aucun.
- Vignette : 1280×720, JPEG d'au plus `vignetteOctetsMax` octets, dans `rendus/vignettes/<complete|episode-NN>.jpg`.
- Images de travail : `publication/images/ecran-<ms>.png` (fond), `publication/images/camera-<ms>.png` et `camera-<ms>.detoure.png` (pose caméra), `<ms>` = instant de la source en millisecondes arrondies. Banque de poses : `donnees/poses/<photo>` et `<photo sans extension>.detoure.png`.
- Un enregistrement caméra séparé est un fichier de `bruts/` dont le nom (sans extension) se termine par `-camera` ; il est ignoré par la préparation de `source.mp4` et n'est utilisé que s'il accompagne un seul autre enregistrement.
- Aucun appel réel à Claude, au site Replit ni au modèle de détourage dans les tests automatiques.
- Le chemin du projet contient « & » : ne jamais utiliser `npx` ; passer par les scripts npm (`npm test -- <fichier>`, `npm run typecheck`, `npm run test:rendu`). Côté Python : `cd pipeline; ..\.venv\Scripts\python -m pytest <fichiers> -q`.
- Chaque commit se termine par la ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Structure des fichiers

```
reglages.json                        + modeles.detourage, publication
.gitignore                           + donnees/poses/
noyau/
  types.ts                           Reglages.modeles.detourage, Reglages.publication
  reglages.test.ts                   nouvelles valeurs
  publication.ts (+ test)            NOUVEAU : types, forme, accord avec les vidéos rendues, statuts, chemins, contrôles
  publication-textes.ts (+ test)     NOUVEAU : chapitres YouTube, description finale, paroles conservées
pipeline/
  requirements.txt                   + rembg[cpu]
  pytest.ini                         + marqueur detourage
  mtpipeline/images.py               NOUVEAU : bruts sans caméra, extraction d'image, détourage
  mtpipeline/cli.py                  commandes image et detourer ; bruts sans caméra
  tests/test_images.py               NOUVEAU
  tests/test_cli.py                  nouvelles commandes
remotion/
  calculs.ts (+ test)                + tailleAccroche
  composants/Vignette.tsx            NOUVEAU
  Root.tsx                           + Still « Vignette »
  scripts/vignette.ts (+ test)       NOUVEAU : renderStill en JPEG sous la taille maximale
  scripts/vignette.e2e.test.ts       NOUVEAU
  scripts/serveur-fichiers.ts        + .jpg
  scripts/tournage.ts                + lireEpisode (déplacé depuis le serveur du studio)
studio/
  commun.ts                          + DetailPublication, VideoDisponible, Pose
  serveur/http.ts                    NOUVEAU (extrait de api.ts) : ErreurHttp, repondre, lireCorps, ecrireJson, dossierTournage
  serveur/claude.ts                  NOUVEAU (extrait de interpretation.ts) : clé, erreurs de l'API
  serveur/pipeline.ts                NOUVEAU (extrait de suggestions.ts) : lancer le pipeline Python
  serveur/api.ts                     utilise http.ts et lireEpisode
  serveur/interpretation.ts          utilise claude.ts
  serveur/suggestions.ts             utilise pipeline.ts
  serveur/site-replit.ts (+ test)    NOUVEAU : catégories et playlists du site
  serveur/redaction.ts (+ test)      NOUVEAU : textes de publication par Claude
  serveur/publication.ts (+ test)    NOUVEAU : routes de publication
  serveur/principal.ts               serveur des poses, routes de publication
  src/api.ts                         + appels de publication
  src/App.tsx                        + route #/<tournage>/publication
  src/usePublication.ts              NOUVEAU
  src/logique/publication.ts (+ test) NOUVEAU : tags, libellés, profil par défaut
  src/composants/EcranPublication.tsx NOUVEAU
  src/composants/CartePublication.tsx NOUVEAU
  src/composants/ChoixVignette.tsx   NOUVEAU
  src/composants/EcranMontage.tsx    lien « Publication »
  src/styles.css                     styles de l'écran
docs/
  studio.md                          section Publication
  obs-configuration.md               caméra séparée (Source Record), banque de poses
```

---

### Task 1: Réglages et modèle de `publication.json`

**Files:**
- Modify: `reglages.json`, `noyau/types.ts`, `noyau/reglages.test.ts`
- Create: `noyau/publication.ts`, `noyau/publication.test.ts`

**Interfaces:**
- Produces (exports de `noyau/publication.ts`) :
  - types `Profil`, `StatutPublication`, `CiblePublication`, `PoseVignette`, `FondVignette`, `Vignette`, `VideoPubliee`, `Publication`, `ReglagesPublication`, `BasesImages`
  - `PROFILS: Profil[]`
  - `videoParDefaut(cible: CiblePublication, profil: Profil): VideoPubliee`
  - `accorderPublication(p: Publication | null, cibles: CiblePublication[]): Publication`
  - `modifierVideo(p: Publication, cible: CiblePublication, changement: Partial<VideoPubliee>): Publication`
  - `appliquerModifications(ancienne: Publication, nouvelle: Publication): Publication`
  - `raisonPublication(v: unknown): string | null`
  - `cleVignette(v: Vignette | null): string`
  - `nomCible(c)`, `fichierRendu(c, titresEpisodes: string[])`, `fichierVignette(c)`, `imageEcran(instant): string`, `imageCamera(instant): { brute: string; detouree: string }`, `poseDetouree(fichier): string`
  - `urlsVignette(v: Vignette, b: BasesImages): { pose: string; fond: string | null }`
  - `longueurTags(tags: string[]): number`, `mentionsTrouvees(textes: string[], mentions: string[]): string[]`
  - `problemesPreparation(v: VideoPubliee, descriptionFinale: string, r: ReglagesPublication, vignettePresente: boolean): string[]`

- [ ] **Step 1: Ajouter les réglages**

Dans `reglages.json`, remplacer le bloc `modeles` et ajouter `publication` après `elements` :

```json
  "modeles": {
    "whisper": "large-v3",
    "claude": "claude-opus-5-5",
    "detourage": "birefnet-portrait"
  },
```

```json
  "elements": {
    "texteMaxCaracteres": 40,
    "dureeMin": 1,
    "zoomLargeurMin": 480
  },
  "publication": {
    "titreMax": 100,
    "descriptionMax": 5000,
    "tagsMax": 500,
    "vignetteOctetsMax": 2000000,
    "mentionsInterdites": ["ingérop", "ingerop", "cicad"]
  }
```

(Respecter la mise en forme existante du fichier : `elements` y est écrit sur une ligne ; garder ce style et ajouter `"publication": { ... }` sur plusieurs lignes juste après, sans oublier la virgule.)

Dans `noyau/types.ts`, interface `Reglages` :

```ts
  elements: { texteMaxCaracteres: number; dureeMin: number; zoomLargeurMin: number };
  // Limites de YouTube et mots refusés dans les textes d'une vidéo publique.
  publication: {
    titreMax: number;
    descriptionMax: number;
    tagsMax: number;
    vignetteOctetsMax: number;
    mentionsInterdites: string[];
  };
  modeles: { whisper: string; claude: string; detourage: string };
```

Dans `noyau/reglages.test.ts`, ajouter à la fin du `it` :

```ts
    expect(r.modeles.detourage).toBe('birefnet-portrait');
    expect(r.publication).toMatchObject({ titreMax: 100, descriptionMax: 5000, tagsMax: 500, vignetteOctetsMax: 2_000_000 });
    expect(r.publication.mentionsInterdites.length).toBeGreaterThan(0);
```

- [ ] **Step 2: Écrire les tests du modèle**

Créer `noyau/publication.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import reglagesJson from '../reglages.json';
import {
  accorderPublication, appliquerModifications, cleVignette, fichierRendu, fichierVignette, imageCamera, imageEcran,
  longueurTags, mentionsTrouvees, modifierVideo, nomCible, poseDetouree, problemesPreparation, raisonPublication,
  urlsVignette, videoParDefaut, type Publication, type Vignette,
} from './publication';
import type { Reglages } from './types';

const R = (reglagesJson as Reglages).publication;
const VIGNETTE: Vignette = {
  pose: { source: 'banque', fichier: 'surpris.jpg' },
  fond: { source: 'ecran', instant: 12.3456 },
  accroche: 'Le presse-papiers caché',
  fichier: 'rendus/vignettes/complete.jpg',
};
const prete = (): Publication => ({
  version: 1,
  profilParDefaut: 'perso',
  videos: [{ ...videoParDefaut('complete', 'perso'), statut: 'prete', titre: 'Titre', description: 'Desc', tags: ['windows'], vignette: VIGNETTE }],
});

describe('accorderPublication', () => {
  it('crée une entrée par vidéo rendue, seule la vidéo complète cochée', () => {
    const p = accorderPublication(null, ['complete', 1, 2]);
    expect(p.profilParDefaut).toBe('perso');
    expect(p.videos.map(v => [v.cible, v.publier, v.statut])).toEqual([
      ['complete', true, 'a-preparer'], [1, false, 'a-preparer'], [2, false, 'a-preparer'],
    ]);
  });
  it('garde les entrées existantes, ajoute les nouvelles au profil par défaut et retire celles qui n’existent plus', () => {
    const avant: Publication = {
      version: 1, profilParDefaut: 'mixte', videos: [{ ...videoParDefaut(1, 'interne'), titre: 'Gardé' }, videoParDefaut(3, 'perso')],
    };
    expect(accorderPublication(avant, ['complete', 1]).videos.map(v => [v.cible, v.profil, v.titre])).toEqual([
      ['complete', 'mixte', ''], [1, 'interne', 'Gardé'],
    ]);
  });
});

describe('noms et chemins', () => {
  it('nomme les cibles, les rendus et les vignettes', () => {
    expect(nomCible('complete')).toBe('complete');
    expect(nomCible(3)).toBe('episode-03');
    expect(fichierRendu('complete', [])).toBe('video-complete.mp4');
    expect(fichierRendu(2, ['Intro', 'Le SSO'])).toBe('episode-02-le-sso.mp4');
    expect(fichierVignette(1)).toBe('rendus/vignettes/episode-01.jpg');
  });
  it('range les images de travail par instant en millisecondes', () => {
    expect(imageEcran(12.3456)).toBe('publication/images/ecran-12346.png');
    expect(imageCamera(1.5)).toEqual({ brute: 'publication/images/camera-1500.png', detouree: 'publication/images/camera-1500.detoure.png' });
    expect(poseDetouree('surpris.jpg')).toBe('surpris.detoure.png');
  });
  it('donne les adresses des images d’une vignette', () => {
    const bases = { tournage: 'http://f/essai', poses: 'http://p' };
    expect(urlsVignette(VIGNETTE, bases)).toEqual({ pose: 'http://p/surpris.detoure.png', fond: 'http://f/essai/publication/images/ecran-12346.png' });
    expect(urlsVignette({ ...VIGNETTE, pose: { source: 'camera', instant: 2 }, fond: { source: 'charte' } }, bases)).toEqual({
      pose: 'http://f/essai/publication/images/camera-2000.detoure.png', fond: null,
    });
  });
});

describe('raisonPublication', () => {
  it('accepte une publication bien formée', () => {
    expect(raisonPublication(prete())).toBeNull();
    expect(raisonPublication(accorderPublication(null, ['complete', 1]))).toBeNull();
  });
  it('refuse une forme invalide', () => {
    expect(raisonPublication({ ...prete(), version: 2 })).toBe('version 1 attendue');
    expect(raisonPublication({ ...prete(), profilParDefaut: 'pro' })).toBe('profilParDefaut invalide');
    const v = prete().videos[0]!;
    expect(raisonPublication({ ...prete(), videos: [{ ...v, cible: 0 }] })).toBe('videos[0] : cible invalide');
    expect(raisonPublication({ ...prete(), videos: [{ ...v, tags: 'a,b' }] })).toBe('videos[0] : tags doit être une liste de textes');
    expect(raisonPublication({ ...prete(), videos: [{ ...v, vignette: { ...VIGNETTE, pose: { source: 'banque', fichier: '../x.jpg' } } }] }))
      .toBe('videos[0] : vignette : pose invalide');
    expect(raisonPublication({ ...prete(), videos: [v, v] })).toBe('une vidéo apparaît deux fois');
  });
});

describe('appliquerModifications', () => {
  it('ramène à préparer une vidéo prête dont le titre change', () => {
    const p = appliquerModifications(prete(), modifierVideo(prete(), 'complete', { titre: 'Autre' }));
    expect(p.videos[0]!.statut).toBe('a-preparer');
  });
  it('garde prête une vidéo seulement décochée', () => {
    expect(appliquerModifications(prete(), modifierVideo(prete(), 'complete', { publier: false })).videos[0]!.statut).toBe('prete');
  });
  it('oublie le fichier de la vignette quand l’accroche change', () => {
    const p = appliquerModifications(prete(), modifierVideo(prete(), 'complete', { vignette: { ...VIGNETTE, accroche: 'Autre' } }));
    expect(p.videos[0]!.vignette!.fichier).toBeNull();
    expect(p.videos[0]!.statut).toBe('a-preparer');
  });
  it('ignore le statut, le fichier de vignette et l’état YouTube envoyés par le studio', () => {
    const triche = modifierVideo(prete(), 'complete', {
      statut: 'relayee', vignette: { ...VIGNETTE, fichier: 'autre.jpg' }, youtube: { id: 'x', visibilite: 'publique', programmeeLe: null, playlistId: null },
    });
    const v = appliquerModifications(prete(), triche).videos[0]!;
    expect(v.statut).toBe('prete');
    expect(v.vignette!.fichier).toBe('rendus/vignettes/complete.jpg');
    expect(v.youtube.id).toBeNull();
  });
  it('compare les vignettes sur la pose, le fond et l’accroche', () => {
    expect(cleVignette(VIGNETTE)).toBe(cleVignette({ ...VIGNETTE, fichier: null }));
    expect(cleVignette(VIGNETTE)).not.toBe(cleVignette({ ...VIGNETTE, fond: { source: 'charte' } }));
    expect(cleVignette(null)).toBe('');
  });
});

describe('problemesPreparation', () => {
  const v = prete().videos[0]!;
  it('accepte une vidéo complète', () => {
    expect(problemesPreparation(v, 'Desc', R, true)).toEqual([]);
  });
  it('signale titre, description, tags et vignette', () => {
    const vide = { ...v, titre: ' ', description: '', vignette: null };
    expect(problemesPreparation(vide, '', R, false)).toEqual(['Titre vide.', 'Description vide.', 'Vignette à composer.']);
    expect(problemesPreparation({ ...v, titre: 'x'.repeat(101) }, 'Desc', R, true)).toEqual(['Titre trop long : 101 caractères, 100 au plus.']);
    expect(problemesPreparation(v, 'x'.repeat(5001), R, true)).toEqual(['Description trop longue avec les chapitres : 5001 caractères, 5000 au plus.']);
    expect(problemesPreparation({ ...v, tags: ['x'.repeat(501)] }, 'Desc', R, true)).toEqual(['Tags trop longs : 501 caractères, 500 au plus.']);
    expect(problemesPreparation(v, 'Desc', R, false)).toEqual(['Vignette à rendre.']);
  });
  it('refuse une mention interdite dans une vidéo publique, pas dans une vidéo interne', () => {
    const mention = R.mentionsInterdites[0]!;
    const avec = { ...v, description: `Vidéo pour ${mention.toUpperCase()}.` };
    expect(problemesPreparation(avec, avec.description, R, true)).toEqual([`Mention interdite pour une vidéo publique : « ${mention} ».`]);
    expect(problemesPreparation({ ...avec, profil: 'interne' }, avec.description, R, true)).toEqual([]);
  });
  it('compte les tags comme YouTube : virgules et guillemets des tags à espaces', () => {
    expect(longueurTags(['ia', 'presse papiers'])).toBe(2 + 1 + 14 + 2);
    expect(longueurTags([])).toBe(0);
    expect(mentionsTrouvees(['Bonjour', 'ABC def'], ['abc', 'xyz'])).toEqual(['abc']);
  });
});
```

- [ ] **Step 3: Vérifier que les tests échouent**

Run: `npm test -- noyau/publication.test.ts noyau/reglages.test.ts`
Expected: FAIL (`Cannot find module './publication'`, réglages sans `publication`).

- [ ] **Step 4: Écrire le module**

Créer `noyau/publication.ts` :

```ts
import { nomFichierEpisode } from './nommage';
import type { Reglages } from './types';

export type Profil = 'interne' | 'perso' | 'mixte';
export type StatutPublication = 'a-preparer' | 'prete' | 'envoyee-youtube' | 'relayee' | 'erreur';
// Vidéo complète ou numéro d'épisode (1, 2…), comme la cible du rendu.
export type CiblePublication = 'complete' | number;

export type PoseVignette = { source: 'banque'; fichier: string } | { source: 'camera'; instant: number };
export type FondVignette = { source: 'ecran'; instant: number } | { source: 'charte' };

export interface Vignette {
  pose: PoseVignette;
  fond: FondVignette;
  accroche: string;
  // rendus/vignettes/<cible>.jpg une fois rendue ; null tant qu'elle ne l'est pas.
  fichier: string | null;
}

export interface VideoPubliee {
  cible: CiblePublication;
  publier: boolean;
  profil: Profil;
  statut: StatutPublication;
  titre: string;
  variantesTitre: string[];
  description: string;
  tags: string[];
  accroches: string[];
  vignette: Vignette | null;
  youtube: { id: string | null; visibilite: 'privee' | 'publique' | 'programmee'; programmeeLe: string | null; playlistId: string | null };
  replit: { id: number | null; categorieId: number | null; playlistId: number | null };
  erreur: { etape: 'vignette' | 'youtube' | 'replit'; message: string; le: string } | null;
}

export interface Publication {
  version: 1;
  profilParDefaut: Profil;
  videos: VideoPubliee[];
}

export type ReglagesPublication = Reglages['publication'];

// Adresses (sans barre finale) qui servent le dossier du tournage et la banque de poses.
export interface BasesImages {
  tournage: string;
  poses: string;
}

export const PROFILS: Profil[] = ['interne', 'perso', 'mixte'];
const STATUTS: StatutPublication[] = ['a-preparer', 'prete', 'envoyee-youtube', 'relayee', 'erreur'];

export function videoParDefaut(cible: CiblePublication, profil: Profil): VideoPubliee {
  return {
    cible,
    publier: cible === 'complete',
    profil,
    statut: 'a-preparer',
    titre: '',
    variantesTitre: [],
    description: '',
    tags: [],
    accroches: [],
    vignette: null,
    youtube: { id: null, visibilite: 'privee', programmeeLe: null, playlistId: null },
    replit: { id: null, categorieId: null, playlistId: null },
    erreur: null,
  };
}

// Une entrée par vidéo rendue, dans l'ordre des cibles : les vidéos d'un montage précédent qui n'existent plus disparaissent.
export function accorderPublication(p: Publication | null, cibles: CiblePublication[]): Publication {
  const profil = p?.profilParDefaut ?? 'perso';
  return {
    version: 1,
    profilParDefaut: profil,
    videos: cibles.map(c => p?.videos.find(v => v.cible === c) ?? videoParDefaut(c, profil)),
  };
}

export function modifierVideo(p: Publication, cible: CiblePublication, changement: Partial<VideoPubliee>): Publication {
  return { ...p, videos: p.videos.map(v => (v.cible === cible ? { ...v, ...changement } : v)) };
}

// Ce qui distingue deux vignettes à l'image : pose, fond et accroche (pas le fichier rendu).
export function cleVignette(v: Vignette | null): string {
  if (!v) return '';
  const pose = v.pose.source === 'banque' ? `banque:${v.pose.fichier}` : `camera:${v.pose.instant}`;
  const fond = v.fond.source === 'ecran' ? `ecran:${v.fond.instant}` : 'charte';
  return `${pose}|${fond}|${v.accroche}`;
}

// Modifications venues du studio : statut, fichier de vignette, états YouTube et Replit et erreur ne changent
// que par les routes du serveur ; une vidéo prête dont le contenu change revient à préparer.
export function appliquerModifications(ancienne: Publication, nouvelle: Publication): Publication {
  return {
    ...nouvelle,
    videos: nouvelle.videos.map(n => {
      const a = ancienne.videos.find(v => v.cible === n.cible) ?? videoParDefaut(n.cible, nouvelle.profilParDefaut);
      const memeImage = cleVignette(a.vignette) === cleVignette(n.vignette);
      const vignette = n.vignette && { ...n.vignette, fichier: memeImage ? (a.vignette?.fichier ?? null) : null };
      const change = a.profil !== n.profil || a.titre !== n.titre || a.description !== n.description
        || a.tags.join('\n') !== n.tags.join('\n') || !memeImage;
      return {
        ...n,
        vignette,
        statut: a.statut === 'prete' && change ? 'a-preparer' : a.statut,
        youtube: a.youtube,
        replit: { ...n.replit, id: a.replit.id },
        erreur: a.erreur,
      };
    }),
  };
}

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const estTexte = (v: unknown): v is string => typeof v === 'string';
const listeDeTextes = (v: unknown) => Array.isArray(v) && v.every(estTexte);
const estInstant = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const estId = (v: unknown) => v === null || (typeof v === 'number' && Number.isInteger(v));

function raisonVignette(v: unknown): string | null {
  if (v === null) return null;
  if (!estObjet(v) || !estObjet(v.pose) || !estObjet(v.fond)) return 'vignette : pose et fond attendus';
  const pose = v.pose;
  const poseValide = (pose.source === 'banque' && estTexte(pose.fichier) && pose.fichier !== '' && !/[\\/]/.test(pose.fichier))
    || (pose.source === 'camera' && estInstant(pose.instant));
  if (!poseValide) return 'vignette : pose invalide';
  if (!(v.fond.source === 'charte' || (v.fond.source === 'ecran' && estInstant(v.fond.instant)))) return 'vignette : fond invalide';
  if (!estTexte(v.accroche)) return 'vignette : accroche attendue';
  if (v.fichier !== null && !estTexte(v.fichier)) return 'vignette : fichier invalide';
  return null;
}

export function raisonPublication(p: unknown): string | null {
  if (!estObjet(p)) return 'objet attendu';
  if (p.version !== 1) return 'version 1 attendue';
  if (!PROFILS.includes(p.profilParDefaut as Profil)) return 'profilParDefaut invalide';
  if (!Array.isArray(p.videos)) return 'videos doit être une liste';
  for (const [i, v] of p.videos.entries()) {
    const ou = `videos[${i}]`;
    if (!estObjet(v)) return `${ou} : objet attendu`;
    if (v.cible !== 'complete' && !(Number.isInteger(v.cible) && (v.cible as number) >= 1)) return `${ou} : cible invalide`;
    if (typeof v.publier !== 'boolean') return `${ou} : publier doit être vrai ou faux`;
    if (!PROFILS.includes(v.profil as Profil)) return `${ou} : profil invalide`;
    if (!STATUTS.includes(v.statut as StatutPublication)) return `${ou} : statut invalide`;
    for (const champ of ['titre', 'description']) if (!estTexte(v[champ])) return `${ou} : ${champ} doit être un texte`;
    for (const champ of ['variantesTitre', 'tags', 'accroches']) if (!listeDeTextes(v[champ])) return `${ou} : ${champ} doit être une liste de textes`;
    const vignette = raisonVignette(v.vignette);
    if (vignette) return `${ou} : ${vignette}`;
    if (!estObjet(v.youtube) || !estObjet(v.replit)) return `${ou} : youtube et replit attendus`;
    if (!estId(v.replit.id) || !estId(v.replit.categorieId) || !estId(v.replit.playlistId)) return `${ou} : identifiants du site invalides`;
  }
  const cles = p.videos.map(v => String((v as Record<string, unknown>).cible));
  if (new Set(cles).size !== cles.length) return 'une vidéo apparaît deux fois';
  return null;
}

export const nomCible = (c: CiblePublication) => (c === 'complete' ? 'complete' : `episode-${String(c).padStart(2, '0')}`);

export function fichierRendu(c: CiblePublication, titresEpisodes: string[]): string {
  return c === 'complete' ? 'video-complete.mp4' : nomFichierEpisode(c - 1, titresEpisodes[c - 1] ?? '');
}

export const fichierVignette = (c: CiblePublication) => `rendus/vignettes/${nomCible(c)}.jpg`;

const ms = (instant: number) => Math.round(instant * 1000);
export const imageEcran = (instant: number) => `publication/images/ecran-${ms(instant)}.png`;
export const imageCamera = (instant: number) => ({
  brute: `publication/images/camera-${ms(instant)}.png`,
  detouree: `publication/images/camera-${ms(instant)}.detoure.png`,
});
export const poseDetouree = (fichier: string) => `${fichier.replace(/\.[^.]+$/, '')}.detoure.png`;

export function urlsVignette(v: Vignette, b: BasesImages): { pose: string; fond: string | null } {
  return {
    pose: v.pose.source === 'banque'
      ? `${b.poses}/${encodeURIComponent(poseDetouree(v.pose.fichier))}`
      : `${b.tournage}/${imageCamera(v.pose.instant).detouree}`,
    fond: v.fond.source === 'ecran' ? `${b.tournage}/${imageEcran(v.fond.instant)}` : null,
  };
}

// Comme YouTube : tags séparés par des virgules, un tag contenant une espace compte ses guillemets.
export function longueurTags(tags: string[]): number {
  return tags.reduce((n, t) => n + t.length + (t.includes(' ') ? 2 : 0), 0) + Math.max(0, tags.length - 1);
}

export function mentionsTrouvees(textes: string[], mentions: string[]): string[] {
  const tout = textes.join('\n').toLowerCase();
  return mentions.filter(m => tout.includes(m.toLowerCase()));
}

export function problemesPreparation(
  v: VideoPubliee, descriptionFinale: string, r: ReglagesPublication, vignettePresente: boolean,
): string[] {
  const problemes: string[] = [];
  const titre = v.titre.trim();
  if (!titre) problemes.push('Titre vide.');
  else if (titre.length > r.titreMax) problemes.push(`Titre trop long : ${titre.length} caractères, ${r.titreMax} au plus.`);
  if (!v.description.trim()) problemes.push('Description vide.');
  else if (descriptionFinale.length > r.descriptionMax) {
    problemes.push(`Description trop longue avec les chapitres : ${descriptionFinale.length} caractères, ${r.descriptionMax} au plus.`);
  }
  const tags = longueurTags(v.tags);
  if (tags > r.tagsMax) problemes.push(`Tags trop longs : ${tags} caractères, ${r.tagsMax} au plus.`);
  if (!v.vignette) problemes.push('Vignette à composer.');
  else if (!v.vignette.fichier || !vignettePresente) problemes.push('Vignette à rendre.');
  if (v.profil !== 'interne') {
    for (const m of mentionsTrouvees([v.titre, v.description, ...v.tags], r.mentionsInterdites)) {
      problemes.push(`Mention interdite pour une vidéo publique : « ${m} ».`);
    }
  }
  return problemes;
}
```

- [ ] **Step 5: Vérifier que les tests passent, ainsi que le typage**

Run: `npm test -- noyau/publication.test.ts noyau/reglages.test.ts` puis `npm run typecheck`
Expected: PASS ; aucune erreur de typage (`remotion/charte.ts` type `reglages.json` comme `Reglages`).

- [ ] **Step 6: Commit**

```bash
git add reglages.json noyau/types.ts noyau/reglages.test.ts noyau/publication.ts noyau/publication.test.ts
git commit -m "Publication : réglages et modèle de publication.json, statuts, chemins des images, contrôles avant validation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Chapitres YouTube, description finale, paroles conservées

**Files:**
- Create: `noyau/publication-textes.ts`, `noyau/publication-textes.test.ts`

**Interfaces:**
- Consumes: `DecisionsVideoComplete`, `Partie` (`noyau/decisions.ts`), `Mot`, `Segment` (`noyau/types.ts`).
- Produces:
  - `interface ChapitreYoutube { titre: string; debut: number }` (secondes dans la vidéo rendue)
  - `chapitresYoutube(d: DecisionsVideoComplete): ChapitreYoutube[]`
  - `formatHorodatage(secondes: number): string`
  - `descriptionYoutube(description: string, chapitres: ChapitreYoutube[]): string`
  - `segmentsSecondes(partie: Partie, fps: number): Segment[]`
  - `texteConserve(mots: Mot[], segments: Segment[]): string`

- [ ] **Step 1: Écrire les tests**

Créer `noyau/publication-textes.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import type { DecisionsVideoComplete, Partie } from './decisions';
import { chapitresYoutube, descriptionYoutube, formatHorodatage, segmentsSecondes, texteConserve } from './publication-textes';

const FPS = 30;
const partie = (titre: string, secondes: number): Partie => ({
  titre, segments: [{ debut: 0, fin: secondes * FPS }], encarts: [], encartsRetires: [], elements: [], duree: secondes * FPS,
});
// Générique 4 s, intertitre 2 s, carton de fin 5 s.
const decisions = (durees: number[]): DecisionsVideoComplete => ({
  fps: FPS, sourceUrl: '', titre: 'T',
  parties: durees.map((d, i) => partie(`Chapitre ${i + 1}`, d)),
  durees: { generique: 120, intertitre: 60, cartonFin: 150, fonduAudio: 1 },
});

describe('chapitresYoutube', () => {
  it('place chaque chapitre au début de son intertitre, le premier à 0', () => {
    expect(chapitresYoutube(decisions([20, 30, 40]))).toEqual([
      { titre: 'Chapitre 1', debut: 0 }, { titre: 'Chapitre 2', debut: 24 }, { titre: 'Chapitre 3', debut: 56 },
    ]);
  });
  it('n’en donne aucun avec moins de trois chapitres', () => {
    expect(chapitresYoutube(decisions([20, 30]))).toEqual([]);
  });
  it('n’en donne aucun si un chapitre dure moins de 10 s', () => {
    expect(chapitresYoutube(decisions([20, 5, 40]))).toEqual([]);
  });
});

describe('formatHorodatage', () => {
  it('écrit m:ss, ou h:mm:ss au-delà d’une heure', () => {
    expect(formatHorodatage(0)).toBe('0:00');
    expect(formatHorodatage(65.9)).toBe('1:05');
    expect(formatHorodatage(3725)).toBe('1:02:05');
  });
});

describe('descriptionYoutube', () => {
  it('ajoute la liste des chapitres', () => {
    expect(descriptionYoutube('Desc\n', chapitresYoutube(decisions([20, 30, 40])))).toBe(
      'Desc\n\nChapitres :\n0:00 Chapitre 1\n0:24 Chapitre 2\n0:56 Chapitre 3',
    );
  });
  it('laisse la description seule sans chapitres', () => {
    expect(descriptionYoutube(' Desc ', [])).toBe('Desc');
  });
});

describe('paroles conservées', () => {
  it('convertit les segments en secondes et garde les mots dont le milieu est conservé', () => {
    const segments = segmentsSecondes({ ...partie('A', 0), segments: [{ debut: 0, fin: 30 }, { debut: 90, fin: 150 }] }, FPS);
    expect(segments).toEqual([{ debut: 0, fin: 1 }, { debut: 3, fin: 5 }]);
    const mots = [
      { id: 0, texte: 'Bonjour', debut: 0.2, fin: 0.6 },
      { id: 1, texte: 'euh', debut: 1.5, fin: 2 },
      { id: 2, texte: 'voici', debut: 3.1, fin: 3.5 },
    ];
    expect(texteConserve(mots, segments)).toBe('Bonjour voici');
  });
});
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `npm test -- noyau/publication-textes.test.ts`
Expected: FAIL (`Cannot find module './publication-textes'`).

- [ ] **Step 3: Écrire le module**

Créer `noyau/publication-textes.ts` :

```ts
import { dureeVideoComplete, type DecisionsVideoComplete, type Partie } from './decisions';
import type { Mot, Segment } from './types';

// Début d'un chapitre en secondes dans la vidéo rendue.
export interface ChapitreYoutube {
  titre: string;
  debut: number;
}

// Règles de YouTube pour afficher des chapitres.
const CHAPITRES_MIN = 3;
const DUREE_CHAPITRE_MIN = 10;

// Le premier chapitre commence à 0 (avec le générique), les suivants au début de leur intertitre.
export function chapitresYoutube(d: DecisionsVideoComplete): ChapitreYoutube[] {
  const chapitres: ChapitreYoutube[] = [];
  let image = d.durees.generique;
  d.parties.forEach((p, i) => {
    chapitres.push({ titre: p.titre, debut: i === 0 ? 0 : image / d.fps });
    image += (i === 0 ? 0 : d.durees.intertitre) + p.duree;
  });
  const fin = dureeVideoComplete(d) / d.fps;
  const durees = chapitres.map((c, i) => (chapitres[i + 1]?.debut ?? fin) - c.debut);
  if (chapitres.length < CHAPITRES_MIN || durees.some(duree => duree < DUREE_CHAPITRE_MIN)) return [];
  return chapitres;
}

export function formatHorodatage(secondes: number): string {
  const total = Math.floor(secondes);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function descriptionYoutube(description: string, chapitres: ChapitreYoutube[]): string {
  const texte = description.trim();
  if (chapitres.length === 0) return texte;
  return `${texte}\n\nChapitres :\n${chapitres.map(c => `${formatHorodatage(c.debut)} ${c.titre}`).join('\n')}`;
}

export function segmentsSecondes(partie: Partie, fps: number): Segment[] {
  return partie.segments.map(s => ({ debut: s.debut / fps, fin: s.fin / fps }));
}

// Paroles entendues dans la vidéo montée : les mots dont le milieu tombe dans un passage conservé.
export function texteConserve(mots: Mot[], segments: Segment[]): string {
  return mots
    .filter(m => {
      const milieu = (m.debut + m.fin) / 2;
      return segments.some(s => milieu >= s.debut && milieu <= s.fin);
    })
    .map(m => m.texte)
    .join(' ');
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npm test -- noyau/publication-textes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add noyau/publication-textes.ts noyau/publication-textes.test.ts
git commit -m "Publication : chapitres YouTube de la vidéo complète, description finale, paroles conservées

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Pipeline — caméra séparée, extraction d'image, détourage

**Files:**
- Create: `pipeline/mtpipeline/images.py`, `pipeline/tests/test_images.py`
- Modify: `pipeline/mtpipeline/cli.py`, `pipeline/tests/test_cli.py`, `pipeline/requirements.txt`, `pipeline/pytest.ini`, `docs/obs-configuration.md`

**Interfaces:**
- Produces (Python) : `est_camera(chemin: Path) -> bool`, `lister_bruts(dossier: Path) -> list[Path]`, `extraire_image(video: Path, instant: float, sortie: Path) -> None`, `retirer_fond(modele: str) -> Retirer`, `detourer(entree: Path, sortie: Path, retirer: Retirer) -> None`.
- Produces (ligne de commande, utilisée par le studio en Task 5) :
  - `python -m mtpipeline.cli image <video> <instant> <sortie>` → PNG de l'image à `instant` secondes ;
  - `python -m mtpipeline.cli detourer <entree> <sortie>` → PNG transparent.
  - Code de sortie 0 en cas de succès ; 1 avec `Erreur : …` sur la sortie d'erreur sinon.

- [ ] **Step 1: Installer rembg**

Ajouter à `pipeline/requirements.txt`, après `numpy>=1.26` :

```
pillow>=10.0
rembg[cpu]>=2.0.60
```

Run: `.venv\Scripts\python -m pip install "rembg[cpu]>=2.0.60"`
Expected: installation réussie (onnxruntime est déjà présent).

Dans `pipeline/pytest.ini`, ajouter le marqueur et l'exclure par défaut :

```ini
markers =
    gpu: test nécessitant le GPU et les modèles Whisper (lent)
    reseau: test appelant l'API Claude (payant)
    detourage: test téléchargeant et exécutant le modèle de détourage (lent)
addopts = -m "not gpu and not reseau and not detourage"
```

- [ ] **Step 2: Écrire les tests**

Créer `pipeline/tests/test_images.py` :

```python
from pathlib import Path

import pytest
from PIL import Image

from mtpipeline.erreurs import ErreurEntree
from mtpipeline.images import detourer, est_camera, extraire_image, lister_bruts, retirer_fond
from mtpipeline.reglages import charger_reglages


def fond_retire(image):
    resultat = image.convert("RGBA")
    resultat.putalpha(128)
    return resultat


def test_extrait_l_image_a_l_instant_donne(video_test, tmp_path):
    video = video_test("source.mp4", duree=2)
    sortie = tmp_path / "images" / "ecran-1000.png"
    extraire_image(video, 1.0, sortie)
    with Image.open(sortie) as image:
        assert image.size == (1920, 1080)


def test_refuse_un_instant_apres_la_fin(video_test, tmp_path):
    video = video_test("source.mp4", duree=2)
    with pytest.raises(ErreurEntree, match="image"):
        extraire_image(video, 30.0, tmp_path / "x.png")


def test_refuse_un_instant_negatif(video_test, tmp_path):
    with pytest.raises(ErreurEntree, match="instant"):
        extraire_image(video_test("source.mp4"), -1, tmp_path / "x.png")


def test_detoure_en_png_transparent(tmp_path):
    entree = tmp_path / "pose.jpg"
    Image.new("RGB", (300, 400), "red").save(entree)
    sortie = tmp_path / "pose.detoure.png"
    detourer(entree, sortie, fond_retire)
    with Image.open(sortie) as image:
        assert image.mode == "RGBA"
        assert image.size == (300, 400)
        assert image.getpixel((0, 0))[3] == 128


def test_redresse_une_photo_de_telephone(tmp_path):
    entree = tmp_path / "pose.jpg"
    exif = Image.Exif()
    exif[0x0112] = 6  # orientation : pivotée de 90°
    Image.new("RGB", (400, 300), "red").save(entree, exif=exif)
    sortie = tmp_path / "pose.detoure.png"
    detourer(entree, sortie, fond_retire)
    with Image.open(sortie) as image:
        assert image.size == (300, 400)


def test_signale_une_photo_illisible(tmp_path):
    entree = tmp_path / "pose.jpg"
    entree.write_text("pas une image", encoding="utf-8")
    with pytest.raises(ErreurEntree, match="illisible"):
        detourer(entree, tmp_path / "x.png", fond_retire)


def test_reconnait_l_enregistrement_camera():
    assert est_camera(Path("2026-10-20 10-00-00-camera.mp4"))
    assert est_camera(Path("prise-CAMERA.mkv"))
    assert not est_camera(Path("2026-10-20 10-00-00.mp4"))


def test_liste_les_bruts_sans_la_camera(tmp_path):
    for nom in ["b.mp4", "a.webm", "a-camera.mkv", "notes.txt"]:
        (tmp_path / nom).write_text("", encoding="utf-8")
    assert [p.name for p in lister_bruts(tmp_path)] == ["a.webm", "b.mp4"]


@pytest.mark.detourage
def test_detourage_reel(tmp_path):
    entree = tmp_path / "pose.jpg"
    Image.new("RGB", (320, 480), "white").save(entree)
    sortie = tmp_path / "pose.detoure.png"
    detourer(entree, sortie, retirer_fond(charger_reglages()["modeles"]["detourage"]))
    with Image.open(sortie) as image:
        assert image.mode == "RGBA" and image.size == (320, 480)
```

Dans `pipeline/tests/test_cli.py`, ajouter à la fin :

```python
def test_commande_image(video_test, tmp_path):
    video = video_test("source.mp4", duree=2)
    assert main(["image", str(video), "0.5", str(tmp_path / "i.png")]) == 0
    assert (tmp_path / "i.png").exists()


def test_commande_image_en_erreur(tmp_path, capsys):
    assert main(["image", str(tmp_path / "absent.mp4"), "0", str(tmp_path / "i.png")]) == 1
    assert "Erreur" in capsys.readouterr().err


def test_commande_detourer(tmp_path, monkeypatch):
    from PIL import Image

    def retirer(image):
        return image.convert("RGBA")

    monkeypatch.setattr("mtpipeline.cli.retirer_fond", lambda modele: retirer)
    entree = tmp_path / "pose.png"
    Image.new("RGB", (10, 20), "blue").save(entree)
    assert main(["detourer", str(entree), str(tmp_path / "pose.detoure.png")]) == 0
    assert (tmp_path / "pose.detoure.png").exists()
```

- [ ] **Step 3: Vérifier que les tests échouent**

Run: `cd pipeline; ..\.venv\Scripts\python -m pytest tests/test_images.py tests/test_cli.py -q`
Expected: FAIL (`ModuleNotFoundError: mtpipeline.images`).

- [ ] **Step 4: Écrire le module**

Créer `pipeline/mtpipeline/images.py` :

```python
"""Images de la publication : enregistrements caméra, images extraites d'une vidéo, photos détourées."""
import os
import subprocess
from pathlib import Path
from typing import Callable

from PIL import Image, ImageOps, UnidentifiedImageError

from .erreurs import ErreurEntree
from .preparation import _executer, _extrait

EXTENSIONS = {".mp4", ".mkv", ".mov", ".webm"}
SUFFIXE_CAMERA = "-camera"

Retirer = Callable[[Image.Image], Image.Image]


def est_camera(chemin: Path) -> bool:
    """Enregistrement de la webcam seule (plugin OBS Source Record) : sert aux vignettes, pas au montage."""
    return chemin.stem.lower().endswith(SUFFIXE_CAMERA)


def lister_bruts(dossier: Path) -> list[Path]:
    return sorted(p for p in dossier.iterdir() if p.suffix.lower() in EXTENSIONS and not est_camera(p))


def extraire_image(video: Path, instant: float, sortie: Path) -> None:
    if instant < 0:
        raise ErreurEntree(f"instant négatif : {instant}.")
    sortie.parent.mkdir(parents=True, exist_ok=True)
    try:
        _executer(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{instant:.3f}", "-i", str(video),
                   "-frames:v", "1", str(sortie)])
    except subprocess.CalledProcessError as e:
        raise ErreurEntree(f"{video.name} : image à {instant:.3f} s impossible à extraire ({_extrait(e.stderr)}).") from e
    if not sortie.exists():
        raise ErreurEntree(f"{video.name} : aucune image à {instant:.3f} s (au-delà de la fin ?).")


def retirer_fond(modele: str) -> Retirer:
    """Détourage par rembg, exécuté localement ; le modèle est téléchargé au premier usage."""
    try:
        from rembg import new_session, remove
        session = new_session(modele)
    except Exception as e:  # import ou téléchargement du modèle
        raise ErreurEntree(f"Détourage indisponible ({modele}) : {e}") from e
    return lambda image: remove(image, session=session)


def detourer(entree: Path, sortie: Path, retirer: Retirer) -> None:
    try:
        with Image.open(entree) as image:
            # Une photo de téléphone porte son orientation dans l'EXIF : on la redresse avant de détourer.
            source = ImageOps.exif_transpose(image).convert("RGB")
    except (OSError, UnidentifiedImageError, ValueError) as e:
        raise ErreurEntree(f"{entree.name} : image illisible ({e}).") from e
    resultat = retirer(source).convert("RGBA")
    sortie.parent.mkdir(parents=True, exist_ok=True)
    temporaire = sortie.with_name(sortie.name + ".tmp")
    resultat.save(temporaire, format="PNG")
    os.replace(temporaire, sortie)
```

- [ ] **Step 5: Brancher la ligne de commande**

Dans `pipeline/mtpipeline/cli.py` :

1. Remplacer `EXTENSIONS = {".mp4", ".mkv", ".mov", ".webm"}` par l'import (et ajouter l'import à la liste des imports du paquet) :

```python
from .images import detourer, extraire_image, lister_bruts, retirer_fond
```

2. Dans `analyser`, remplacer la ligne qui construit `bruts` par :

```python
            bruts = lister_bruts(dossier / "bruts")
```

3. Dans `main`, après la déclaration de `p_relancer` :

```python
    p_image = sous.add_parser("image", help="Extraire l'image d'une vidéo à un instant donné (PNG).")
    p_image.add_argument("video", type=Path)
    p_image.add_argument("instant", type=float)
    p_image.add_argument("sortie", type=Path)
    p_detourer = sous.add_parser("detourer", help="Détourer une photo (PNG transparent).")
    p_detourer.add_argument("entree", type=Path)
    p_detourer.add_argument("sortie", type=Path)
```

4. Remplacer le bloc `try:` de `main` par :

```python
    try:
        if args.commande == "image":
            extraire_image(args.video, args.instant, args.sortie)
            return 0
        if args.commande == "detourer":
            detourer(args.entree, args.sortie, retirer_fond(reglages["modeles"]["detourage"]))
            return 0
        if args.commande == "analyser":
            analyse = analyser(args.dossier, args.titre, reglages)
        else:
            analyse = relancer_suggestions(args.dossier, reglages)
    except ErreurEntree as e:
        print(f"Erreur : {e}", file=sys.stderr)
        return 1
```

- [ ] **Step 6: Vérifier que les tests passent**

Run: `cd pipeline; ..\.venv\Scripts\python -m pytest -q`
Expected: PASS (tous les tests du pipeline, hors marqueurs exclus).

Puis, une fois, le test réel (télécharge le modèle, environ 1 Go) :
Run: `cd pipeline; ..\.venv\Scripts\python -m pytest tests/test_images.py -m detourage -q`
Expected: PASS.

- [ ] **Step 7: Documenter la caméra séparée et la banque de poses**

Ajouter à la fin de `docs/obs-configuration.md` :

```markdown
## Caméra enregistrée à part (pour les vignettes)

Les vignettes YouTube montrent le visage en grand : la vignette caméra de la scène (480x270) serait floue. Deux sources possibles, au choix dans le studio :

1. **Caméra séparée.** Installer le plugin **Source Record** (page des plugins sur obsproject.com), puis, sur la source webcam : clic droit → Filtres → ajouter « Source Record ». Réglages : enregistrer pendant l'enregistrement, dossier `bruts/` du tournage, format de nom se terminant par `-camera` (par exemple `%CCYY-%MM-%DD %hh-%mm-%ss-camera`), webcam en 1920x1080. Ce fichier ne sert qu'aux vignettes : la préparation de la vidéo l'ignore. Il n'est utilisé que si `bruts/` contient un seul autre enregistrement.
2. **Banque de poses.** Déposer 5 à 10 photos HD de soi (téléphone, fond uni, expressions variées : surpris, souriant, pensif, qui pointe du doigt) dans `donnees/poses/`. Le studio les détoure la première fois qu'il ouvre l'écran Publication. Ce dossier n'est pas versionné.
```

- [ ] **Step 8: Commit**

```bash
git add pipeline/mtpipeline/images.py pipeline/mtpipeline/cli.py pipeline/tests/test_images.py pipeline/tests/test_cli.py pipeline/requirements.txt pipeline/pytest.ini docs/obs-configuration.md
git commit -m "Pipeline : caméra séparée ignorée par la préparation, extraction d'image et détourage en ligne de commande

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Remotion — composition `Vignette` et rendu en JPEG

**Files:**
- Modify: `remotion/calculs.ts`, `remotion/calculs.test.ts`, `remotion/Root.tsx`, `remotion/scripts/serveur-fichiers.ts`
- Create: `remotion/composants/Vignette.tsx`, `remotion/scripts/vignette.ts`, `remotion/scripts/vignette.test.ts`, `remotion/scripts/vignette.e2e.test.ts`

**Interfaces:**
- Consumes: `portLibre` (`remotion/scripts/rendu.ts`), `RACINE` (`remotion/scripts/tournage.ts`), `demarrerServeur` (`remotion/scripts/serveur-fichiers.ts`), `LogoPMT`, `charte`, `police`.
- Produces:
  - `tailleAccroche(texte: string): number` (taille de police en pixels)
  - `LARGEUR_VIGNETTE = 1280`, `HAUTEUR_VIGNETTE = 720`, `interface ProprietesVignette { fondUrl: string | null; poseUrl: string | null; accroche: string }`, composant `Vignette`
  - `rendreVignette(props: ProprietesVignette, sortie: string, octetsMax: number, d?: DependancesVignette): Promise<ResultatVignette>` avec `ResultatVignette = { octets: number; qualite: number }`
  - `oublierPaquet(): void` (tests)

- [ ] **Step 1: Écrire les tests de la taille d'accroche**

Ajouter à `remotion/calculs.test.ts` (et `tailleAccroche` à son import depuis `./calculs`) :

```ts
describe('tailleAccroche', () => {
  it('écrit grand une accroche courte', () => {
    expect(tailleAccroche('Copiez tout')).toBe(120);
  });
  it('réduit une accroche longue', () => {
    expect(tailleAccroche('Retrouvez tout ce que vous copiez')).toBe(84);
  });
  it('réduit assez pour qu’un mot très long tienne sur une ligne', () => {
    expect(tailleAccroche('Anticonstitutionnellement')).toBeLessThan(40);
  });
});
```

- [ ] **Step 2: Écrire les tests du rendu**

Créer `remotion/scripts/vignette.test.ts` :

```ts
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { oublierPaquet, rendreVignette, type DependancesVignette } from './vignette';

const PROPS = { fondUrl: null, poseUrl: null, accroche: 'Essai' };

// Faux moteur : chaque qualité JPEG produit un fichier de la taille indiquée.
function dependances(tailles: Record<number, number>) {
  const d = {
    bundle: vi.fn(async () => 'http://paquet'),
    ensureBrowser: vi.fn(async () => undefined),
    selectComposition: vi.fn(async () => ({ id: 'Vignette' })),
    renderStill: vi.fn(async (o: { output: string; jpegQuality: number }) => {
      await writeFile(o.output, Buffer.alloc(tailles[o.jpegQuality] ?? 1));
      return {};
    }),
  };
  return { d, deps: d as unknown as DependancesVignette };
}

beforeEach(() => oublierPaquet());

describe('rendreVignette', () => {
  it('baisse la qualité jusqu’à passer sous la taille maximale', async () => {
    const sortie = path.join(await mkdtemp(path.join(os.tmpdir(), 'pmt-vignette-')), 'complete.jpg');
    const { d, deps } = dependances({ 90: 3000, 80: 1500 });
    expect(await rendreVignette(PROPS, sortie, 2000, deps)).toEqual({ octets: 1500, qualite: 80 });
    expect((await readFile(sortie)).length).toBe(1500);
    expect(d.selectComposition).toHaveBeenCalledWith(expect.objectContaining({ id: 'Vignette', inputProps: PROPS }));
    expect(d.renderStill).toHaveBeenCalledWith(expect.objectContaining({ imageFormat: 'jpeg', jpegQuality: 90 }));
  });
  it('échoue si même la qualité la plus basse est trop lourde', async () => {
    const sortie = path.join(await mkdtemp(path.join(os.tmpdir(), 'pmt-vignette-')), 'complete.jpg');
    const { deps } = dependances({ 90: 3000, 80: 3000, 70: 3000, 60: 3000 });
    await expect(rendreVignette(PROPS, sortie, 2000, deps)).rejects.toThrow('Vignette de plus de 2000 octets');
  });
  it('ne construit le paquet Remotion qu’une fois', async () => {
    const dossier = await mkdtemp(path.join(os.tmpdir(), 'pmt-vignette-'));
    const { d, deps } = dependances({});
    await rendreVignette(PROPS, path.join(dossier, 'a.jpg'), 2000, deps);
    await rendreVignette(PROPS, path.join(dossier, 'b.jpg'), 2000, deps);
    expect(d.bundle).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Vérifier que les tests échouent**

Run: `npm test -- remotion/calculs.test.ts remotion/scripts/vignette.test.ts`
Expected: FAIL (`tailleAccroche` absent, module `./vignette` introuvable).

- [ ] **Step 4: Écrire la taille d'accroche**

Ajouter à la fin de `remotion/calculs.ts` :

```ts
// Taille de l'accroche de la vignette (gras, capitales, colonne de 640 px) : plus grande quand elle est courte,
// et assez petite pour que son mot le plus long tienne sur une ligne (une capitale grasse fait environ 0,68 em).
export function tailleAccroche(texte: string): number {
  const longueur = texte.trim().length;
  const base = longueur <= 20 ? 120 : longueur <= 30 ? 100 : 84;
  const plusLongMot = Math.max(1, ...texte.split(/\s+/).map(m => m.length));
  return Math.min(base, Math.floor(640 / (0.68 * plusLongMot)));
}
```

- [ ] **Step 5: Écrire la composition**

Créer `remotion/composants/Vignette.tsx` :

```tsx
import type { FC } from 'react';
import { AbsoluteFill, Img } from 'remotion';
import { tailleAccroche } from '../calculs';
import { charte } from '../charte';
import { police } from '../police';
import { LogoPMT } from './LogoPMT';

export const LARGEUR_VIGNETTE = 1280;
export const HAUTEUR_VIGNETTE = 720;

export interface ProprietesVignette {
  // Image du partage d'écran, ou null pour un fond aux formes de la charte.
  fondUrl: string | null;
  // Pose détourée (PNG transparent).
  poseUrl: string | null;
  accroche: string;
}

// Fond (écran flouté et assombri, ou formes de la charte), bande rouge, accroche en capitales à gauche,
// pose détourée en grand à droite, logo PMT en haut à gauche.
export const Vignette: FC<ProprietesVignette> = ({ fondUrl, poseUrl, accroche }) => (
  <AbsoluteFill style={{ backgroundColor: charte.blanc, fontFamily: police, overflow: 'hidden' }}>
    {fondUrl ? (
      <>
        <Img
          src={fondUrl}
          style={{ position: 'absolute', left: -20, top: -20, width: LARGEUR_VIGNETTE + 40, height: HAUTEUR_VIGNETTE + 40, objectFit: 'cover', filter: 'blur(6px)' }}
        />
        <AbsoluteFill style={{ backgroundColor: 'rgba(0, 28, 64, 0.55)' }} />
      </>
    ) : (
      <>
        <div style={{ position: 'absolute', right: -120, top: -120, width: 520, height: 520, borderRadius: '50%', backgroundColor: charte.bleuGris, opacity: 0.6 }} />
        <div style={{ position: 'absolute', right: 0, bottom: 0, width: 0, height: 0, borderBottom: `320px solid ${charte.bleu}`, borderLeft: '320px solid transparent' }} />
      </>
    )}
    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 28, backgroundColor: charte.rouge }} />
    {poseUrl && (
      <Img
        src={poseUrl}
        style={{ position: 'absolute', right: 0, bottom: 0, height: '100%', maxWidth: '55%', objectFit: 'contain', objectPosition: 'right bottom' }}
      />
    )}
    <div style={{ position: 'absolute', left: 64, top: 40 }}>
      <LogoPMT hauteur={72} />
    </div>
    <div style={{ position: 'absolute', left: 64, top: 150, bottom: 60, width: 640, display: 'flex', alignItems: 'center' }}>
      <div
        style={{
          fontSize: tailleAccroche(accroche), fontWeight: 800, lineHeight: 1.05, textTransform: 'uppercase',
          color: fondUrl ? charte.blanc : charte.bleu,
          textShadow: fondUrl ? '0 4px 18px rgba(0, 0, 0, 0.6)' : 'none',
        }}
      >
        {accroche}
      </div>
    </div>
  </AbsoluteFill>
);
```

Dans `remotion/Root.tsx`, importer `Vignette, HAUTEUR_VIGNETTE, LARGEUR_VIGNETTE` depuis `./composants/Vignette` et ajouter, après le dossier `Elements-ecran` :

```tsx
    <Folder name="Vignettes">
      <Still
        id="Vignette" component={Vignette} width={LARGEUR_VIGNETTE} height={HAUTEUR_VIGNETTE}
        defaultProps={{ fondUrl: null, poseUrl: null, accroche: 'Windows + V : le presse-papiers caché' }}
      />
    </Folder>
```

- [ ] **Step 6: Écrire le rendu**

Dans `remotion/scripts/serveur-fichiers.ts`, ajouter au tableau `TYPES` :

```ts
  '.jpg': 'image/jpeg',
```

Créer `remotion/scripts/vignette.ts` :

```ts
import { bundle } from '@remotion/bundler';
import { ensureBrowser, renderStill, selectComposition } from '@remotion/renderer';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ProprietesVignette } from '../composants/Vignette';
import { portLibre } from './rendu';
import { RACINE } from './tournage';

export interface DependancesVignette {
  bundle: typeof bundle;
  ensureBrowser: typeof ensureBrowser;
  selectComposition: typeof selectComposition;
  renderStill: typeof renderStill;
}

const DEPENDANCES: DependancesVignette = { bundle, ensureBrowser, selectComposition, renderStill };
const QUALITES_JPEG = [90, 80, 70, 60];

export interface ResultatVignette {
  octets: number;
  qualite: number;
}

// Le paquet Remotion est construit une fois par processus : les vignettes suivantes partent en quelques secondes.
let paquet: Promise<string> | null = null;

export function oublierPaquet(): void {
  paquet = null;
}

// Rend la vignette en JPEG dans `sortie` (.jpg), en baissant la qualité jusqu'à passer sous `octetsMax`.
// Les images (fond, pose) sont des adresses HTTP servies par le serveur de fichiers.
export async function rendreVignette(
  props: ProprietesVignette, sortie: string, octetsMax: number, d: DependancesVignette = DEPENDANCES,
): Promise<ResultatVignette> {
  paquet ??= d.bundle({ entryPoint: path.join(RACINE, 'remotion', 'index.ts'), publicDir: path.join(RACINE, 'public') });
  let serveUrl: string;
  try {
    serveUrl = await paquet;
  } catch (e) {
    paquet = null;
    throw e;
  }
  await d.ensureBrowser();
  const port = await portLibre();
  const composition = await d.selectComposition({ serveUrl, port, id: 'Vignette', inputProps: { ...props } });
  await mkdir(path.dirname(sortie), { recursive: true });
  const temporaire = sortie.replace(/\.jpg$/, '.tmp.jpg');
  try {
    for (const qualite of QUALITES_JPEG) {
      await d.renderStill({
        composition, serveUrl, port, output: temporaire, inputProps: { ...props }, imageFormat: 'jpeg', jpegQuality: qualite, overwrite: true,
      });
      const { size } = await stat(temporaire);
      if (size <= octetsMax) {
        await rename(temporaire, sortie);
        return { octets: size, qualite };
      }
    }
  } finally {
    await rm(temporaire, { force: true });
  }
  throw new Error(`Vignette de plus de ${octetsMax} octets même en qualité ${QUALITES_JPEG[QUALITES_JPEG.length - 1]}.`);
}
```

Note : le test vérifie `inputProps: PROPS` avec `toHaveBeenCalledWith(expect.objectContaining(...))`, qui compare en profondeur : la copie `{ ...props }` convient.

- [ ] **Step 7: Vérifier que les tests passent**

Run: `npm test -- remotion/calculs.test.ts remotion/scripts/vignette.test.ts` puis `npm run typecheck`
Expected: PASS ; aucune erreur de typage.

- [ ] **Step 8: Test de rendu réel**

Créer `remotion/scripts/vignette.e2e.test.ts` :

```ts
import { execFileSync } from 'node:child_process';
import { mkdtemp, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { demarrerServeur } from './serveur-fichiers';
import { rendreVignette } from './vignette';

it('rend une vignette 1280×720 en JPEG de moins de 2 Mo', async () => {
  const dossier = await mkdtemp(path.join(os.tmpdir(), 'pmt-vignette-'));
  const ffmpeg = (...args: string[]) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
  ffmpeg('-f', 'lavfi', '-i', 'testsrc=size=1920x1080', '-frames:v', '1', path.join(dossier, 'fond.png'));
  ffmpeg('-f', 'lavfi', '-i', 'color=c=red:s=600x900', '-frames:v', '1', path.join(dossier, 'pose.png'));
  const serveur = await demarrerServeur(dossier);
  try {
    const sortie = path.join(dossier, 'vignettes', 'complete.jpg');
    const resultat = await rendreVignette(
      { fondUrl: `${serveur.url}/fond.png`, poseUrl: `${serveur.url}/pose.png`, accroche: 'Le presse-papiers caché' },
      sortie, 2_000_000,
    );
    expect(resultat.octets).toBeLessThanOrEqual(2_000_000);
    expect((await stat(sortie)).size).toBe(resultat.octets);
    const dimensions = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', sortie], { encoding: 'utf-8' });
    expect(dimensions.trim()).toBe('1280,720');
  } finally {
    await serveur.fermer();
  }
});
```

Run: `npm run test:rendu -- remotion/scripts/vignette.e2e.test.ts`
Expected: PASS (première exécution lente : construction du paquet). Ouvrir le JPEG produit (chemin temporaire affiché si le test est lancé en mode verbeux, sinon relancer la composition `Vignette` dans `npm run studio`) et vérifier à l'œil : accroche lisible, pose à droite, logo en haut à gauche.

- [ ] **Step 9: Commit**

```bash
git add remotion/calculs.ts remotion/calculs.test.ts remotion/Root.tsx remotion/composants/Vignette.tsx remotion/scripts/vignette.ts remotion/scripts/vignette.test.ts remotion/scripts/vignette.e2e.test.ts remotion/scripts/serveur-fichiers.ts
git commit -m "Remotion : vignette 1280×720 (fond, pose détourée, accroche, logo), rendu JPEG sous 2 Mo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Serveur du studio — outils communs extraits (sans changement de comportement)

**Files:**
- Create: `studio/serveur/http.ts`, `studio/serveur/claude.ts`, `studio/serveur/pipeline.ts`
- Modify: `studio/serveur/api.ts`, `studio/serveur/interpretation.ts`, `studio/serveur/suggestions.ts`, `remotion/scripts/tournage.ts`

**Interfaces:**
- Produces:
  - `http.ts` : `class ErreurHttp(statut: number, message: string, problemes?: string[])`, `message(e: unknown): string`, `repondre(res, statut, corps)`, `repondreErreur(res, e)`, `lireCorps(req): Promise<unknown>`, `ecrireJson(chemin, valeur): Promise<void>`, `dossierTournage(racine: string, nomEncode: string): string`
  - `claude.ts` : `verifierCleClaude(client?: Anthropic): void`, `traduireErreurClaude(e: unknown): unknown`
  - `pipeline.ts` : `lancerPipeline(args: string[]): Promise<void>`, `extraireImage(video: string, instant: number, sortie: string): Promise<void>`, `detourerImage(entree: string, sortie: string): Promise<void>`
  - `tournage.ts` : `lireEpisode(dossier): Promise<{ titre: string | null; statut: StatutEpisode | null; message: string | null }>`

- [ ] **Step 1: Vérifier l'état de départ**

Run: `npm test` puis `npm run typecheck`
Expected: PASS. Ces tests serviront de filet : cette tâche ne change aucun comportement.

- [ ] **Step 2: Extraire les outils HTTP**

Créer `studio/serveur/http.ts` :

```ts
import { randomUUID } from 'node:crypto';
import { statSync } from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

export class ErreurHttp extends Error {
  constructor(readonly statut: number, message: string, readonly problemes?: string[]) {
    super(message);
  }
}

const TAILLE_MAX = 50_000_000;

export const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function repondre(res: ServerResponse, statut: number, corps: unknown): void {
  res.writeHead(statut, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(corps));
}

export function repondreErreur(res: ServerResponse, e: unknown): void {
  if (e instanceof ErreurHttp) repondre(res, e.statut, { erreur: e.message, ...(e.problemes ? { problemes: e.problemes } : {}) });
  else repondre(res, 500, { erreur: message(e) });
}

export async function lireCorps(req: IncomingMessage): Promise<unknown> {
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

export async function ecrireJson(chemin: string, valeur: unknown): Promise<void> {
  const temporaire = `${chemin}.${randomUUID()}.tmp`;
  await writeFile(temporaire, JSON.stringify(valeur, null, 2), 'utf-8');
  await rename(temporaire, chemin);
}

// Dossier du tournage nommé dans l'URL ; 404 s'il n'existe pas ou sortirait de la racine.
export function dossierTournage(racine: string, nomEncode: string): string {
  let nom: string;
  try {
    nom = decodeURIComponent(nomEncode);
  } catch {
    throw new ErreurHttp(404, 'Tournage introuvable.');
  }
  const dossier = path.join(racine, nom);
  if (nom.startsWith('.') || /[\\/]/.test(nom) || !statSync(dossier, { throwIfNoEntry: false })?.isDirectory()) {
    throw new ErreurHttp(404, `Tournage introuvable : ${nom}`);
  }
  return dossier;
}
```

Déplacer `lireEpisode` dans `remotion/scripts/tournage.ts` (à la suite de `majStatutEpisode`), avec la liste des statuts :

```ts
const STATUTS: StatutEpisode[] = ['analyse', 'en-validation', 'valide', 'rendu', 'erreur'];

// episode.json absent ou illisible : tournage sans titre ni statut.
export async function lireEpisode(dossier: string): Promise<{ titre: string | null; statut: StatutEpisode | null; message: string | null }> {
  try {
    const lu: unknown = JSON.parse(await readFile(path.join(dossier, 'episode.json'), 'utf-8'));
    if (estObjet(lu)) {
      return {
        titre: typeof lu.titre === 'string' ? lu.titre : null,
        statut: STATUTS.includes(lu.statut as StatutEpisode) ? (lu.statut as StatutEpisode) : null,
        message: typeof lu.message === 'string' ? lu.message : null,
      };
    }
  } catch {
    // signalé par l'absence de statut
  }
  return { titre: null, statut: null, message: null };
}
```

Dans `studio/serveur/api.ts` :
- supprimer `ErreurHttp`, `STATUTS`, `TAILLE_MAX`, `message`, `repondre`, `lireCorps`, `ecrireJson`, `lireEpisode` et les imports devenus inutiles (`randomUUID` reste utilisé par `donnerConsigne` ; retirer `rename`, `writeFile`, `statSync` s'ils ne servent plus) ;
- ajouter `import { dossierTournage, ecrireJson, ErreurHttp, lireCorps, message, repondre, repondreErreur } from './http';` et ajouter `lireEpisode` à l'import de `../../remotion/scripts/tournage` ;
- remplacer le corps de `dossierDe` par `return dossierTournage(c.racineTournages, nomEncode);` ;
- remplacer le `catch` final de `traiter` par `} catch (e) { repondreErreur(res, e); }`.

- [ ] **Step 3: Extraire les erreurs de Claude**

Créer `studio/serveur/claude.ts` :

```ts
import Anthropic from '@anthropic-ai/sdk';
import { ErreurInterpretation } from './consignes';

export function verifierCleClaude(client?: Anthropic): void {
  if (!client && !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new ErreurInterpretation(500, 'Clé API Claude absente : définissez la variable d’environnement ANTHROPIC_API_KEY.');
  }
}

// Erreur de l'API Claude traduite pour le studio (503 : réessayer plus tard) ; toute autre erreur est rendue telle quelle.
export function traduireErreurClaude(e: unknown): unknown {
  if (e instanceof Anthropic.APIConnectionError) return new ErreurInterpretation(503, `Connexion à l’API Claude impossible : ${e.message}`);
  if (e instanceof Anthropic.RateLimitError) return new ErreurInterpretation(503, 'Limite de requêtes de l’API Claude atteinte, réessayez plus tard.');
  if (e instanceof Anthropic.APIError) {
    const statut = e.status !== undefined && e.status >= 500 ? 503 : 500;
    return new ErreurInterpretation(statut, `Erreur de l’API Claude (${e.status ?? 'sans statut'}) : ${e.message}`);
  }
  if (e instanceof Anthropic.AnthropicError) return new ErreurInterpretation(500, `Réponse de Claude inexploitable : ${e.message}`);
  return e;
}
```

Dans `studio/serveur/interpretation.ts`, remplacer le test de la clé par `verifierCleClaude(client);` et tout le contenu du `catch (e) { … }` de l'appel par `throw traduireErreurClaude(e);` ; importer les deux fonctions depuis `./claude`.

- [ ] **Step 4: Extraire le lancement du pipeline**

Créer `studio/serveur/pipeline.ts` :

```ts
import { spawn } from 'node:child_process';
import path from 'node:path';
import { RACINE } from '../../remotion/scripts/tournage';

// Lance « mtpipeline <args> » avec le Python de .venv ; l'erreur reprend sa sortie d'erreur.
export function lancerPipeline(args: string[]): Promise<void> {
  const python = path.join(RACINE, '.venv', 'Scripts', 'python.exe');
  return new Promise((resoudre, rejeter) => {
    const processus = spawn(python, ['-m', 'mtpipeline.cli', ...args], {
      cwd: path.join(RACINE, 'pipeline'),
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
    let erreurs = '';
    processus.stderr.on('data', (d: Buffer) => { erreurs += d.toString('utf-8'); });
    processus.on('error', rejeter);
    processus.on('close', code => (code === 0 ? resoudre() : rejeter(new Error(erreurs.trim() || `code de sortie ${code}`))));
  });
}

export const extraireImage = (video: string, instant: number, sortie: string) => lancerPipeline(['image', video, String(instant), sortie]);
export const detourerImage = (entree: string, sortie: string) => lancerPipeline(['detourer', entree, sortie]);
```

Remplacer le contenu de `studio/serveur/suggestions.ts` par :

```ts
import { lancerPipeline } from './pipeline';

// Une API Claude indisponible n'est pas un échec : analyse.json garde alors erreurSuggestions.
export const relancerSuggestions = (dossier: string) => lancerPipeline(['relancer-suggestions', dossier]);
```

- [ ] **Step 5: Vérifier que rien n'a changé**

Run: `npm test` puis `npm run typecheck`
Expected: PASS, mêmes tests qu'à l'étape 1 (les snapshots du prompt sont inchangés).

- [ ] **Step 6: Commit**

```bash
git add studio/serveur/http.ts studio/serveur/claude.ts studio/serveur/pipeline.ts studio/serveur/api.ts studio/serveur/interpretation.ts studio/serveur/suggestions.ts remotion/scripts/tournage.ts
git commit -m "Studio : outils HTTP, erreurs de Claude et lancement du pipeline partagés entre les routes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Site Replit (catégories, playlists) et rédaction par Claude

**Files:**
- Create: `studio/serveur/site-replit.ts`, `studio/serveur/site-replit.test.ts`, `studio/serveur/redaction.ts`, `studio/serveur/redaction.test.ts`

**Interfaces:**
- Consumes: `verifierCleClaude`, `traduireErreurClaude` (Task 5), `ErreurInterpretation` (`./consignes`), `Profil` (Task 1).
- Produces:
  - `interface ReferencesSite { categories: { id: number; nom: string }[]; playlists: { id: number; nom: string; categorieId: number }[] }`
  - `lireReferencesSite(urlSite: string | undefined, recuperer?: typeof fetch): Promise<ReferencesSite | null>`
  - `interface DemandeRedaction { titreVideo: string; texte: string; chapitres: string[]; termes: { terme: string; definition: string }[]; profil: Profil; modele: string }`
  - `interface PropositionRedaction { titre: string; variantesTitre: string[]; description: string; tags: string[]; accroches: string[] }`
  - `type Rediger = (d: DemandeRedaction) => Promise<PropositionRedaction>`
  - `construirePromptRedaction(d): string`, `nettoyerProposition(p): PropositionRedaction`, `redigerPublication(d, client?): Promise<PropositionRedaction>`

- [ ] **Step 1: Écrire les tests du site**

Créer `studio/serveur/site-replit.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { lireReferencesSite } from './site-replit';

const reponse = (corps: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => corps }) as Response;

describe('lireReferencesSite', () => {
  it('lit les catégories et les playlists du site', async () => {
    const recuperer = vi.fn(async (url: string) => reponse(url.endsWith('/api/categories')
      ? [{ id: 1, name: 'IA & outils numériques' }, { id: 'x' }]
      : [{ id: 7, name: 'Bureautique', categoryId: 1 }]));
    expect(await lireReferencesSite('https://site.example/', recuperer as unknown as typeof fetch)).toEqual({
      categories: [{ id: 1, nom: 'IA & outils numériques' }],
      playlists: [{ id: 7, nom: 'Bureautique', categorieId: 1 }],
    });
    expect(recuperer).toHaveBeenCalledWith('https://site.example/api/categories', expect.anything());
  });
  it('renvoie null sans adresse, ou si le site ne répond pas correctement', async () => {
    expect(await lireReferencesSite(undefined)).toBeNull();
    const enPanne = vi.fn(async () => reponse({}, false));
    expect(await lireReferencesSite('https://site.example', enPanne as unknown as typeof fetch)).toBeNull();
    const injoignable = vi.fn(async () => { throw new Error('ECONNREFUSED'); });
    expect(await lireReferencesSite('https://site.example', injoignable as unknown as typeof fetch)).toBeNull();
  });
});
```

- [ ] **Step 2: Écrire les tests de la rédaction**

Créer `studio/serveur/redaction.test.ts` :

```ts
import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { ErreurInterpretation } from './consignes';
import { construirePromptRedaction, nettoyerProposition, redigerPublication, type DemandeRedaction } from './redaction';

const demande: DemandeRedaction = {
  titreVideo: 'Windows + V',
  texte: 'Bonjour à tous. Aujourd’hui, le presse-papiers.',
  chapitres: ['Le raccourci', 'Épingler'],
  termes: [{ terme: 'Presse-papiers', definition: 'Mémoire de ce qui est copié.' }],
  profil: 'perso',
  modele: 'claude-opus-5-5',
};
const PROPOSITION = {
  titre: ' Retrouvez tout ce que vous copiez ',
  variantesTitre: ['A', 'B', 'C'],
  description: 'Desc',
  tags: ['Windows', ' ', 'windows', 'presse-papiers'],
  accroches: ['Un', 'Deux', 'Trois', 'Quatre'],
};

function client(parse: (...args: unknown[]) => Promise<unknown>) {
  const fonction = vi.fn(parse);
  return { client: { messages: { parse: fonction } } as unknown as Anthropic, parse: fonction };
}

describe('construirePromptRedaction', () => {
  it('donne le titre, les chapitres, les termes et la transcription', () => {
    const prompt = construirePromptRedaction(demande);
    expect(prompt).toContain('Titre de travail : Windows + V');
    expect(prompt).toContain('- Le raccourci\n- Épingler');
    expect(prompt).toContain('- Presse-papiers : Mémoire de ce qui est copié.');
    expect(prompt).toContain('<transcription>\nBonjour à tous.');
    expect(prompt).toContain('ne mentionne aucun employeur');
    expect(prompt).toContain('Pas d’horodatage');
  });
  it('demande un ton sobre pour une vidéo interne, sans la règle de mention', () => {
    const prompt = construirePromptRedaction({ ...demande, profil: 'interne', chapitres: [] });
    expect(prompt).toContain('usage interne');
    expect(prompt).not.toContain('ne mentionne aucun employeur');
    expect(prompt).not.toContain('Chapitres de la vidéo');
  });
});

describe('nettoyerProposition', () => {
  it('retire les blancs, les doublons et l’excédent', () => {
    expect(nettoyerProposition(PROPOSITION)).toEqual({
      titre: 'Retrouvez tout ce que vous copiez',
      variantesTitre: ['A', 'B'],
      description: 'Desc',
      tags: ['Windows', 'presse-papiers'],
      accroches: ['Un', 'Deux', 'Trois'],
    });
  });
});

describe('redigerPublication', () => {
  it('appelle Claude en sortie structurée et nettoie la proposition', async () => {
    const { client: c, parse } = client(async () => ({ stop_reason: 'end_turn', parsed_output: PROPOSITION }));
    expect((await redigerPublication(demande, c)).variantesTitre).toEqual(['A', 'B']);
    expect(parse).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-opus-5-5' }), expect.anything());
  });
  it('signale un refus', async () => {
    const { client: c } = client(async () => ({ stop_reason: 'refusal', parsed_output: null }));
    await expect(redigerPublication(demande, c)).rejects.toThrow(ErreurInterpretation);
  });
  it('traduit une erreur de connexion en 503', async () => {
    const { client: c } = client(async () => { throw new Anthropic.APIConnectionError({ message: 'hors ligne' }); });
    await expect(redigerPublication(demande, c)).rejects.toMatchObject({ statut: 503 });
  });
});
```

- [ ] **Step 3: Vérifier que les tests échouent**

Run: `npm test -- studio/serveur/site-replit.test.ts studio/serveur/redaction.test.ts`
Expected: FAIL (modules introuvables).

- [ ] **Step 4: Écrire la lecture du site**

Créer `studio/serveur/site-replit.ts` :

```ts
export interface ReferencesSite {
  categories: { id: number; nom: string }[];
  playlists: { id: number; nom: string; categorieId: number }[];
}

const DELAI = 5000;
const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// Catégories et playlists du site, lues sur ses routes publiques (sans clé) ;
// null si l'adresse manque ou si le site ne répond pas correctement.
export async function lireReferencesSite(urlSite: string | undefined, recuperer: typeof fetch = fetch): Promise<ReferencesSite | null> {
  if (!urlSite) return null;
  const base = urlSite.replace(/\/+$/, '');
  try {
    const [categories, playlists] = await Promise.all(['categories', 'playlists'].map(async route => {
      const reponse = await recuperer(`${base}/api/${route}`, { signal: AbortSignal.timeout(DELAI) });
      if (!reponse.ok) throw new Error(`${route} : ${reponse.status}`);
      return (await reponse.json()) as unknown;
    }));
    if (!Array.isArray(categories) || !Array.isArray(playlists)) return null;
    return {
      categories: categories.filter(estObjet)
        .filter(c => typeof c.id === 'number' && typeof c.name === 'string')
        .map(c => ({ id: c.id as number, nom: c.name as string })),
      playlists: playlists.filter(estObjet)
        .filter(p => typeof p.id === 'number' && typeof p.name === 'string' && typeof p.categoryId === 'number')
        .map(p => ({ id: p.id as number, nom: p.name as string, categorieId: p.categoryId as number })),
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Écrire la rédaction**

Créer `studio/serveur/redaction.ts` :

```ts
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { Profil } from '../../noyau/publication';
import { traduireErreurClaude, verifierCleClaude } from './claude';
import { ErreurInterpretation } from './consignes';

// Ce qu'il faut à Claude pour proposer les textes de publication d'une vidéo.
export interface DemandeRedaction {
  titreVideo: string;
  // Paroles conservées dans la vidéo montée.
  texte: string;
  // Titres des chapitres (vidéo complète seulement).
  chapitres: string[];
  termes: { terme: string; definition: string }[];
  profil: Profil;
  modele: string;
}

export interface PropositionRedaction {
  titre: string;
  variantesTitre: string[];
  description: string;
  tags: string[];
  accroches: string[];
}

export type Rediger = (d: DemandeRedaction) => Promise<PropositionRedaction>;

export function construirePromptRedaction(d: DemandeRedaction): string {
  const chapitres = d.chapitres.length > 0 ? `\nChapitres de la vidéo :\n${d.chapitres.map(c => `- ${c}`).join('\n')}\n` : '';
  const termes = d.termes.length > 0 ? `\nTermes définis à l'écran :\n${d.termes.map(t => `- ${t.terme} : ${t.definition}`).join('\n')}\n` : '';
  const ton = d.profil === 'interne'
    ? 'Cette vidéo est destinée à un usage interne : ton sobre et professionnel.'
    : 'Cette vidéo est publique : ne mentionne aucun employeur, client ni organisation, même si la transcription en cite.';
  return `Tu aides l'auteur de la chaîne YouTube « PMT » (astuces et outils numériques expliqués simplement à un public non spécialiste) à publier une vidéo tournée face caméra, en français. À partir de ce qu'il dit, propose les textes de publication ; il les relira et les corrigera.

Titre de travail : ${d.titreVideo}
${chapitres}${termes}
<transcription>
${d.texte}
</transcription>

${ton}

Réponds avec :
- titre : un titre YouTube accrocheur et honnête, 70 caractères au plus, qui dit ce que le spectateur va apprendre ; majuscule au premier mot seulement, pas d'émoji, pas de points d'exclamation en série.
- variantesTitre : deux autres titres, d'un angle différent, mêmes règles.
- description : 2 à 4 courts paragraphes (une accroche d'une phrase, ce que montre la vidéo, à qui elle sert), puis, s'il en cite, les outils ou sites nommés dans la vidéo, un par ligne. Pas d'horodatage ni de liste de chapitres : ils sont ajoutés automatiquement. N'invente aucun lien : ne donne une adresse que si elle est prononcée.
- tags : 8 à 15 mots-clés de recherche, en minuscules, du plus précis au plus général (noms d'outils, tâches, notions).
- accroches : trois textes de 3 à 5 mots pour la vignette, percutants et lisibles en petit, sans reprendre le titre mot pour mot.
`;
}

const SchemaRedaction = z.object({
  titre: z.string(),
  variantesTitre: z.array(z.string()),
  description: z.string(),
  tags: z.array(z.string()),
  accroches: z.array(z.string()),
});

const nonVides = (textes: string[]) => textes.map(t => t.trim()).filter(t => t !== '');

export function nettoyerProposition(p: PropositionRedaction): PropositionRedaction {
  const vus = new Set<string>();
  const tags = nonVides(p.tags).filter(t => {
    const cle = t.toLowerCase();
    if (vus.has(cle)) return false;
    vus.add(cle);
    return true;
  });
  return {
    titre: p.titre.trim(),
    variantesTitre: nonVides(p.variantesTitre).slice(0, 2),
    description: p.description.trim(),
    tags,
    accroches: nonVides(p.accroches).slice(0, 3),
  };
}

// Sortie structurée, effort moyen et repli serveur en cas de refus, comme l'interprétation des consignes.
export async function redigerPublication(d: DemandeRedaction, client?: Anthropic): Promise<PropositionRedaction> {
  verifierCleClaude(client);
  let reponse;
  try {
    reponse = await (client ?? new Anthropic()).messages.parse(
      {
        model: d.modele,
        max_tokens: 8000,
        output_config: { effort: 'medium', format: zodOutputFormat(SchemaRedaction) },
        messages: [{ role: 'user', content: construirePromptRedaction(d) }],
        fallbacks: 'default',
      },
      { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } },
    );
  } catch (e) {
    throw traduireErreurClaude(e);
  }
  if (reponse.stop_reason === 'refusal') throw new ErreurInterpretation(500, 'Claude a refusé de rédiger les textes de cette vidéo.');
  if (!reponse.parsed_output) throw new ErreurInterpretation(500, `Réponse de Claude inexploitable (arrêt : ${reponse.stop_reason}).`);
  return nettoyerProposition(reponse.parsed_output);
}
```

- [ ] **Step 6: Vérifier que les tests passent**

Run: `npm test -- studio/serveur/site-replit.test.ts studio/serveur/redaction.test.ts` puis `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add studio/serveur/site-replit.ts studio/serveur/site-replit.test.ts studio/serveur/redaction.ts studio/serveur/redaction.test.ts
git commit -m "Studio : catégories et playlists du site, textes de publication proposés par Claude

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Routes de publication du serveur

**Files:**
- Create: `studio/serveur/publication.ts`, `studio/serveur/publication.test.ts`
- Modify: `studio/commun.ts`, `studio/serveur/principal.ts`, `.gitignore`

**Interfaces:**
- Consumes: Tasks 1, 2, 4, 5, 6 (`noyau/publication`, `noyau/publication-textes`, `ProprietesVignette`, `ResultatVignette`, `http.ts`, `Rediger`, `ReferencesSite`), `chargerTournage`, `lireEpisode`, `urlSource` (`remotion/scripts/tournage.ts`), `decisionsEpisodes`, `decisionsVideoComplete`, `dureeEpisode`, `dureeVideoComplete`.
- Produces (`studio/commun.ts`) :

```ts
export interface VideoDisponible {
  cible: CiblePublication;
  titre: string;
  fichier: string;          // nom du rendu dans rendus/
  rendue: boolean;
  dureeSecondes: number;
  chapitres: ChapitreYoutube[];
}
export interface Pose { fichier: string; url: string }   // url : PNG détouré
export interface DetailPublication {
  nom: string;
  titre: string;
  sourceUrl: string;
  urlTournage: string;      // sert le dossier du tournage (images, vignettes)
  urlPoses: string;
  publication: Publication;
  videos: VideoDisponible[];
  camera: string | null;    // nom du fichier caméra dans bruts/
  site: ReferencesSite | null;
  reglages: ReglagesPublication;
}
```

- Routes :
  - `GET /api/tournages/:nom/publication` → `DetailPublication` (409 si le tournage n'est pas au statut `rendu`)
  - `PUT /api/tournages/:nom/publication` (corps : `Publication`) → `Publication` enregistrée
  - `POST /api/tournages/:nom/publication/redaction` `{ cible }` → `Publication`
  - `POST /api/tournages/:nom/publication/image` `{ source: 'ecran' | 'camera', instant }` → `{ chemin: string }` (relatif au dossier du tournage)
  - `POST /api/tournages/:nom/publication/vignette` `{ cible }` → `Publication`
  - `POST /api/tournages/:nom/publication/valider` `{ cible }` → `Publication`, ou 422 `{ erreur, problemes }`
  - `GET /api/poses` → `Pose[]` (détoure les photos nouvelles ou modifiées)
- `creerApiPublication(c: ConfigPublication): (req, res) => Promise<boolean>` (renvoie `false` hors de ses routes) ; `fichierCamera(dossier): Promise<string | null>`.

- [ ] **Step 1: Ajouter les types communs**

Dans `studio/commun.ts`, ajouter les imports et les trois interfaces ci-dessus :

```ts
import type { CiblePublication, Publication, ReglagesPublication } from '../noyau/publication';
import type { ChapitreYoutube } from '../noyau/publication-textes';
import type { ReferencesSite } from './serveur/site-replit';
```

- [ ] **Step 2: Écrire les tests**

Créer `studio/serveur/publication.test.ts` :

```ts
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import exemple from '../../fixtures/analyse-exemple.json';
import type { Publication } from '../../noyau/publication';
import { creerApiPublication, type ConfigPublication } from './publication';

const MONTAGE = {
  version: 1, titre: 'Essai', coupes: [],
  chapitres: [{ titre: 'Intro', debut: 0 }, { titre: 'Le SSO', debut: 3 }],
  termes: [{ terme: 'SSO', definition: 'Authentification unique.', occurrences: [3.8], statut: 'valide', position: 'bas' }],
  elements: [],
};
const RENDU = { version: 1, titre: 'Essai', statut: 'rendu', message: null };
const PROPOSITION = { titre: 'Le SSO expliqué', variantesTitre: ['A', 'B'], description: 'Desc', tags: ['sso'], accroches: ['Un seul mot de passe'] };
const SITE = { categories: [{ id: 1, nom: 'IA' }], playlists: [] };

let racine: string;
let url: string;
let serveur: http.Server;
let config: ConfigPublication;

async function tournage(nom: string, episode: unknown = RENDU): Promise<string> {
  const dossier = path.join(racine, 'tournages', nom);
  await mkdir(path.join(dossier, 'rendus'), { recursive: true });
  await writeFile(path.join(dossier, 'analyse.json'), JSON.stringify(exemple), 'utf-8');
  await writeFile(path.join(dossier, 'montage.json'), JSON.stringify(MONTAGE), 'utf-8');
  await writeFile(path.join(dossier, 'episode.json'), JSON.stringify(episode), 'utf-8');
  for (const f of ['video-complete.mp4', 'episode-01-intro.mp4', 'episode-02-le-sso.mp4']) await writeFile(path.join(dossier, 'rendus', f), '');
  return dossier;
}

const json = { 'Content-Type': 'application/json' };
const lirePublication = async (nom: string) => (await (await fetch(`${url}/api/tournages/${nom}/publication`)).json()).publication as Publication;
const envoyer = (nom: string, p: unknown) => fetch(`${url}/api/tournages/${nom}/publication`, { method: 'PUT', headers: json, body: JSON.stringify(p) });
const action = (nom: string, quoi: string, corps: unknown) =>
  fetch(`${url}/api/tournages/${nom}/publication/${quoi}`, { method: 'POST', headers: json, body: JSON.stringify(corps) });

beforeEach(async () => {
  racine = await mkdtemp(path.join(os.tmpdir(), 'pmt-publication-'));
  await mkdir(path.join(racine, 'tournages'));
  await mkdir(path.join(racine, 'poses'));
  config = {
    racineTournages: path.join(racine, 'tournages'),
    cheminPoses: path.join(racine, 'poses'),
    urlFichiers: 'http://127.0.0.1:9999',
    urlPoses: 'http://127.0.0.1:9998',
    urlSite: 'https://site.example',
    lireSite: vi.fn(async () => SITE),
    rediger: vi.fn(async () => PROPOSITION),
    extraireImage: vi.fn(async (_video: string, _instant: number, sortie: string) => {
      await mkdir(path.dirname(sortie), { recursive: true });
      await writeFile(sortie, 'png');
    }),
    detourer: vi.fn(async (_entree: string, sortie: string) => { await writeFile(sortie, 'png'); }),
    rendreVignette: vi.fn(async (_props, sortie: string) => {
      await mkdir(path.dirname(sortie), { recursive: true });
      await writeFile(sortie, 'jpg');
      return { octets: 3, qualite: 90 };
    }),
  };
  const api = creerApiPublication(config);
  serveur = http.createServer(async (req, res) => {
    if (!(await api(req, res))) res.writeHead(418).end();
  });
  await new Promise<void>(r => serveur.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>(r => serveur.close(() => r()));
});

describe('détail de la publication', () => {
  it('laisse passer les autres routes', async () => {
    expect((await fetch(`${url}/api/tournages`)).status).toBe(418);
  });
  it('attend la fin du rendu', async () => {
    await tournage('a', { ...RENDU, statut: 'valide' });
    const r = await fetch(`${url}/api/tournages/a/publication`);
    expect(r.status).toBe(409);
    expect((await r.json()).erreur).toContain('rendu');
  });
  it('liste les vidéos rendues et une publication par défaut', async () => {
    await tournage('a');
    const d = await (await fetch(`${url}/api/tournages/a/publication`)).json();
    expect(d.videos.map((v: { cible: unknown; titre: string; fichier: string; rendue: boolean }) => [v.cible, v.titre, v.fichier, v.rendue])).toEqual([
      ['complete', 'Essai', 'video-complete.mp4', true],
      [1, 'Intro', 'episode-01-intro.mp4', true],
      [2, 'Le SSO', 'episode-02-le-sso.mp4', true],
    ]);
    expect(d.videos[0].chapitres).toEqual([]);
    expect(d.publication.videos.map((v: { publier: boolean }) => v.publier)).toEqual([true, false, false]);
    expect(d.sourceUrl).toBe('http://127.0.0.1:9999/a/source.mp4');
    expect(d.urlTournage).toBe('http://127.0.0.1:9999/a');
    expect(d.site).toEqual(SITE);
    expect(d.camera).toBeNull();
    expect(d.reglages.titreMax).toBe(100);
  });
  it('repère un enregistrement caméra séparé s’il accompagne un seul autre enregistrement', async () => {
    const dossier = await tournage('a');
    await mkdir(path.join(dossier, 'bruts'));
    await writeFile(path.join(dossier, 'bruts', 'prise.mp4'), '');
    await writeFile(path.join(dossier, 'bruts', 'prise-camera.mp4'), '');
    expect((await (await fetch(`${url}/api/tournages/a/publication`)).json()).camera).toBe('prise-camera.mp4');
    await writeFile(path.join(dossier, 'bruts', 'prise2.mp4'), '');
    expect((await (await fetch(`${url}/api/tournages/a/publication`)).json()).camera).toBeNull();
  });
});

describe('enregistrement', () => {
  it('refuse une publication mal formée', async () => {
    await tournage('a');
    expect((await envoyer('a', { version: 2 })).status).toBe(400);
  });
  it('enregistre les modifications sans laisser le studio changer le statut', async () => {
    const dossier = await tournage('a');
    const p = await lirePublication('a');
    const modifiee = { ...p, videos: p.videos.map(v => (v.cible === 1 ? { ...v, publier: true, titre: 'X', statut: 'prete' } : v)) };
    const r = await envoyer('a', modifiee);
    expect(r.status).toBe(200);
    const enregistree = JSON.parse(await readFile(path.join(dossier, 'publication.json'), 'utf-8')) as Publication;
    expect(enregistree.videos[1]).toMatchObject({ publier: true, titre: 'X', statut: 'a-preparer' });
  });
});

describe('rédaction', () => {
  it('envoie à Claude les paroles conservées et enregistre la proposition', async () => {
    await tournage('a');
    const r = await action('a', 'redaction', { cible: 'complete' });
    expect(r.status).toBe(200);
    expect(config.rediger).toHaveBeenCalledWith(expect.objectContaining({
      titreVideo: 'Essai', chapitres: ['Intro', 'Le SSO'], profil: 'perso',
      termes: [{ terme: 'SSO', definition: 'Authentification unique.' }],
    }));
    expect(vi.mocked(config.rediger).mock.calls[0]![0].texte).toContain('Bonjour');
    const p = (await r.json()) as Publication;
    expect(p.videos[0]).toMatchObject({ titre: 'Le SSO expliqué', variantesTitre: ['A', 'B'], accroches: ['Un seul mot de passe'] });
  });
  it('refuse une cible inconnue', async () => {
    await tournage('a');
    expect((await action('a', 'redaction', { cible: 9 })).status).toBe(400);
  });
});

describe('images', () => {
  it('extrait l’image de l’écran une seule fois', async () => {
    const dossier = await tournage('a');
    const r = await action('a', 'image', { source: 'ecran', instant: 1.5 });
    expect(await r.json()).toEqual({ chemin: 'publication/images/ecran-1500.png' });
    expect(config.extraireImage).toHaveBeenCalledWith(path.join(dossier, 'source.mp4'), 1.5, path.join(dossier, 'publication', 'images', 'ecran-1500.png'));
    await action('a', 'image', { source: 'ecran', instant: 1.5 });
    expect(config.extraireImage).toHaveBeenCalledTimes(1);
  });
  it('extrait et détoure l’image de la caméra séparée', async () => {
    const dossier = await tournage('a');
    await mkdir(path.join(dossier, 'bruts'));
    await writeFile(path.join(dossier, 'bruts', 'prise.mp4'), '');
    await writeFile(path.join(dossier, 'bruts', 'prise-camera.mp4'), '');
    const r = await action('a', 'image', { source: 'camera', instant: 2 });
    expect(await r.json()).toEqual({ chemin: 'publication/images/camera-2000.detoure.png' });
    expect(config.detourer).toHaveBeenCalledTimes(1);
  });
  it('refuse la caméra sans enregistrement séparé, et un instant hors de la vidéo', async () => {
    await tournage('a');
    expect((await action('a', 'image', { source: 'camera', instant: 2 })).status).toBe(409);
    expect((await action('a', 'image', { source: 'ecran', instant: 999 })).status).toBe(400);
  });
});

describe('vignette et validation', () => {
  async function preparer() {
    const dossier = await tournage('a');
    await writeFile(path.join(racine, 'poses', 'surpris.jpg'), 'jpg');
    await writeFile(path.join(racine, 'poses', 'surpris.detoure.png'), 'png');
    const p = await lirePublication('a');
    const vignette = { pose: { source: 'banque', fichier: 'surpris.jpg' }, fond: { source: 'charte' }, accroche: 'Un seul mot de passe', fichier: null };
    await envoyer('a', { ...p, videos: p.videos.map(v => (v.cible === 'complete' ? { ...v, titre: 'Titre', description: 'Desc', vignette } : v)) });
    return dossier;
  }
  it('rend la vignette avec les adresses de ses images', async () => {
    const dossier = await preparer();
    const r = await action('a', 'vignette', { cible: 'complete' });
    expect(r.status).toBe(200);
    expect(config.rendreVignette).toHaveBeenCalledWith(
      { fondUrl: null, poseUrl: 'http://127.0.0.1:9998/surpris.detoure.png', accroche: 'Un seul mot de passe' },
      path.join(dossier, 'rendus', 'vignettes', 'complete.jpg'),
      2_000_000,
    );
    expect(((await r.json()) as Publication).videos[0]!.vignette!.fichier).toBe('rendus/vignettes/complete.jpg');
  });
  it('refuse une vignette dont l’image manque', async () => {
    await preparer();
    await rm(path.join(racine, 'poses', 'surpris.detoure.png'));
    expect((await action('a', 'vignette', { cible: 'complete' })).status).toBe(409);
  });
  it('valide une vidéo complète, et explique ce qui manque sinon', async () => {
    await preparer();
    const refus = await action('a', 'valider', { cible: 'complete' });
    expect(refus.status).toBe(422);
    expect((await refus.json()).problemes).toEqual(['Vignette à rendre.']);
    await action('a', 'vignette', { cible: 'complete' });
    const ok = await action('a', 'valider', { cible: 'complete' });
    expect(((await ok.json()) as Publication).videos[0]!.statut).toBe('prete');
  });
});

describe('banque de poses', () => {
  it('détoure les photos nouvelles une seule fois', async () => {
    await writeFile(path.join(racine, 'poses', 'souriant.jpg'), 'jpg');
    await writeFile(path.join(racine, 'poses', 'notes.txt'), '');
    const poses = await (await fetch(`${url}/api/poses`)).json();
    expect(poses).toEqual([{ fichier: 'souriant.jpg', url: 'http://127.0.0.1:9998/souriant.detoure.png' }]);
    expect(existsSync(path.join(racine, 'poses', 'souriant.detoure.png'))).toBe(true);
    await fetch(`${url}/api/poses`);
    expect(config.detourer).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Vérifier que les tests échouent**

Run: `npm test -- studio/serveur/publication.test.ts`
Expected: FAIL (`Cannot find module './publication'`).

- [ ] **Step 4: Écrire les routes**

Créer `studio/serveur/publication.ts` :

```ts
import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { decisionsEpisodes, decisionsVideoComplete, dureeEpisode, dureeVideoComplete } from '../../noyau/decisions';
import {
  accorderPublication, appliquerModifications, cleVignette, fichierRendu, fichierVignette, imageCamera, imageEcran, modifierVideo,
  poseDetouree, problemesPreparation, raisonPublication, urlsVignette, type CiblePublication, type Publication, type VideoPubliee,
} from '../../noyau/publication';
import { chapitresYoutube, descriptionYoutube, segmentsSecondes, texteConserve } from '../../noyau/publication-textes';
import type { Segment } from '../../noyau/types';
import type { ProprietesVignette } from '../../remotion/composants/Vignette';
import type { ResultatVignette } from '../../remotion/scripts/vignette';
import { chargerTournage, lireEpisode, urlSource, type Tournage } from '../../remotion/scripts/tournage';
import type { DetailPublication, Pose, VideoDisponible } from '../commun';
import { ErreurInterpretation } from './consignes';
import { dossierTournage, ecrireJson, ErreurHttp, lireCorps, message, repondre, repondreErreur } from './http';
import type { Rediger } from './redaction';
import type { ReferencesSite } from './site-replit';

export interface ConfigPublication {
  racineTournages: string;
  cheminPoses: string;
  // Serveurs de fichiers : dossiers de tournage, banque de poses.
  urlFichiers: string;
  urlPoses: string;
  urlSite: string | undefined;
  lireSite: (urlSite: string | undefined) => Promise<ReferencesSite | null>;
  rediger: Rediger;
  extraireImage: (video: string, instant: number, sortie: string) => Promise<void>;
  detourer: (entree: string, sortie: string) => Promise<void>;
  rendreVignette: (props: ProprietesVignette, sortie: string, octetsMax: number) => Promise<ResultatVignette>;
}

const EXTENSIONS_VIDEO = new Set(['.mp4', '.mkv', '.mov', '.webm']);
const EXTENSIONS_PHOTO = new Set(['.jpg', '.jpeg', '.png']);
const estCamera = (fichier: string) => path.parse(fichier).name.toLowerCase().endsWith('-camera');

// Enregistrement de la webcam seule, utilisable s'il accompagne un seul autre enregistrement (mêmes temps que source.mp4).
export async function fichierCamera(dossier: string): Promise<string | null> {
  const bruts = path.join(dossier, 'bruts');
  const fichiers = existsSync(bruts) ? (await readdir(bruts)).filter(f => EXTENSIONS_VIDEO.has(path.extname(f).toLowerCase())) : [];
  const cameras = fichiers.filter(estCamera);
  return cameras.length === 1 && fichiers.length === 2 ? cameras[0]! : null;
}

async function lirePublication(dossier: string): Promise<Publication | null> {
  const chemin = path.join(dossier, 'publication.json');
  if (!existsSync(chemin)) return null;
  let valeur: unknown;
  try {
    valeur = JSON.parse(await readFile(chemin, 'utf-8'));
  } catch (e) {
    throw new ErreurHttp(409, `publication.json illisible : ${message(e)}`);
  }
  const probleme = raisonPublication(valeur);
  if (probleme) throw new ErreurHttp(409, `publication.json invalide : ${probleme}`);
  return valeur as Publication;
}

const ecrirePublication = (dossier: string, p: Publication) => ecrireJson(path.join(dossier, 'publication.json'), p);
const videoDe = (p: Publication, cible: CiblePublication): VideoPubliee => p.videos.find(v => v.cible === cible)!;
const objet = (corps: unknown): Record<string, unknown> => (corps && typeof corps === 'object' ? (corps as Record<string, unknown>) : {});

interface Contexte {
  dossier: string;
  tournage: Tournage;
  cibles: CiblePublication[];
  videos: VideoDisponible[];
  // Passages conservés d'une vidéo, en secondes de la source.
  segments: (cible: CiblePublication) => Segment[];
  publication: Publication;
}

function lireCible(corps: unknown, cibles: CiblePublication[]): CiblePublication {
  const v = objet(corps).cible;
  const cible = cibles.find(c => c === v);
  if (cible === undefined) throw new ErreurHttp(400, `cible attendue : « complete » ou un numéro d’épisode de 1 à ${cibles.length - 1}.`);
  return cible;
}

export function creerApiPublication(c: ConfigPublication): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  let vignetteEnCours = false;
  const urlTournage = (dossier: string) => `${c.urlFichiers}/${encodeURIComponent(path.basename(dossier))}`;

  async function contexte(dossier: string): Promise<Contexte> {
    if ((await lireEpisode(dossier)).statut !== 'rendu') {
      throw new ErreurHttp(409, 'La publication s’ouvre une fois le rendu terminé.');
    }
    let tournage: Tournage;
    try {
      tournage = await chargerTournage(dossier, { brouillon: false });
    } catch (e) {
      throw new ErreurHttp(409, message(e));
    }
    const { analyse, montage, reglages } = tournage;
    const fps = analyse.fps;
    const episodes = decisionsEpisodes(analyse, montage, reglages, '');
    const complete = decisionsVideoComplete(analyse, montage, reglages, '');
    const titres = episodes.map(e => e.titre);
    const cibles: CiblePublication[] = ['complete', ...episodes.map((_, i) => i + 1)];
    const videos = cibles.map((cible): VideoDisponible => {
      const episode = cible === 'complete' ? null : episodes[cible - 1]!;
      const fichier = fichierRendu(cible, titres);
      return {
        cible,
        titre: episode ? episode.titre : montage.titre,
        fichier,
        rendue: existsSync(path.join(dossier, 'rendus', fichier)),
        dureeSecondes: (episode ? dureeEpisode(episode) : dureeVideoComplete(complete)) / fps,
        chapitres: episode ? [] : chapitresYoutube(complete),
      };
    });
    const segments = (cible: CiblePublication) => (cible === 'complete'
      ? complete.parties.flatMap(p => segmentsSecondes(p, fps))
      : segmentsSecondes(episodes[cible - 1]!.partie, fps));
    return { dossier, tournage, cibles, videos, segments, publication: accorderPublication(await lirePublication(dossier), cibles) };
  }

  // Relue avant d'écrire après une attente (Claude, rendu) : l'auteur a pu modifier autre chose entre-temps.
  const relire = async (ctx: Contexte) => accorderPublication(await lirePublication(ctx.dossier), ctx.cibles);

  async function detail(ctx: Contexte): Promise<DetailPublication> {
    return {
      nom: path.basename(ctx.dossier),
      titre: ctx.tournage.titre,
      sourceUrl: urlSource(c.urlFichiers, ctx.tournage.nom),
      urlTournage: urlTournage(ctx.dossier),
      urlPoses: c.urlPoses,
      publication: ctx.publication,
      videos: ctx.videos,
      camera: await fichierCamera(ctx.dossier),
      site: await c.lireSite(c.urlSite),
      reglages: ctx.tournage.reglages.publication,
    };
  }

  async function enregistrer(req: IncomingMessage, ctx: Contexte): Promise<Publication> {
    const corps = await lireCorps(req);
    const probleme = raisonPublication(corps);
    if (probleme) throw new ErreurHttp(400, `publication invalide : ${probleme}`);
    const p = accorderPublication(appliquerModifications(ctx.publication, corps as Publication), ctx.cibles);
    await ecrirePublication(ctx.dossier, p);
    return p;
  }

  async function rediger(req: IncomingMessage, ctx: Contexte): Promise<Publication> {
    const cible = lireCible(await lireCorps(req), ctx.cibles);
    const { analyse, montage, reglages } = ctx.tournage;
    const texte = texteConserve(analyse.mots, ctx.segments(cible));
    if (!texte) throw new ErreurHttp(422, 'Aucune parole conservée dans cette vidéo : rien à résumer.');
    let proposition;
    try {
      proposition = await c.rediger({
        titreVideo: ctx.videos.find(v => v.cible === cible)!.titre,
        texte,
        chapitres: cible === 'complete' ? ctx.videos.filter(v => v.cible !== 'complete').map(v => v.titre) : [],
        termes: montage.termes.filter(t => t.statut === 'valide').map(t => ({ terme: t.terme, definition: t.definition })),
        profil: videoDe(ctx.publication, cible).profil,
        modele: reglages.modeles.claude,
      });
    } catch (e) {
      if (e instanceof ErreurInterpretation) throw new ErreurHttp(e.statut, e.message);
      throw new ErreurHttp(500, `Rédaction impossible : ${message(e)}`);
    }
    const actuelle = await relire(ctx);
    const p = appliquerModifications(actuelle, modifierVideo(actuelle, cible, proposition));
    await ecrirePublication(ctx.dossier, p);
    return p;
  }

  async function executerPipeline(f: () => Promise<void>): Promise<void> {
    try {
      await f();
    } catch (e) {
      throw new ErreurHttp(500, `Image impossible : ${message(e)}`);
    }
  }

  async function image(req: IncomingMessage, ctx: Contexte): Promise<{ chemin: string }> {
    const o = objet(await lireCorps(req));
    const duree = ctx.tournage.analyse.duree;
    const instant = o.instant;
    if (typeof instant !== 'number' || !Number.isFinite(instant) || instant < 0 || instant > duree) {
      throw new ErreurHttp(400, `instant attendu entre 0 et ${duree} s.`);
    }
    if (o.source === 'ecran') {
      const chemin = imageEcran(instant);
      const sortie = path.join(ctx.dossier, chemin);
      if (!existsSync(sortie)) await executerPipeline(() => c.extraireImage(path.join(ctx.dossier, 'source.mp4'), instant, sortie));
      return { chemin };
    }
    if (o.source === 'camera') {
      const camera = await fichierCamera(ctx.dossier);
      if (!camera) throw new ErreurHttp(409, 'Aucun enregistrement caméra séparé dans bruts/ (accompagnant un seul autre enregistrement).');
      const { brute, detouree } = imageCamera(instant);
      const sortie = path.join(ctx.dossier, detouree);
      if (!existsSync(sortie)) {
        await executerPipeline(() => c.extraireImage(path.join(ctx.dossier, 'bruts', camera), instant, path.join(ctx.dossier, brute)));
        await executerPipeline(() => c.detourer(path.join(ctx.dossier, brute), sortie));
      }
      return { chemin: detouree };
    }
    throw new ErreurHttp(400, 'source attendue : « ecran » ou « camera ».');
  }

  async function vignette(req: IncomingMessage, ctx: Contexte): Promise<Publication> {
    const cible = lireCible(await lireCorps(req), ctx.cibles);
    const v = videoDe(ctx.publication, cible).vignette;
    if (!v) throw new ErreurHttp(422, 'Composez d’abord la vignette : pose, fond et accroche.');
    if (!v.accroche.trim()) throw new ErreurHttp(422, 'Accroche vide.');
    const images = [
      v.pose.source === 'banque' ? path.join(c.cheminPoses, poseDetouree(v.pose.fichier)) : path.join(ctx.dossier, imageCamera(v.pose.instant).detouree),
      ...(v.fond.source === 'ecran' ? [path.join(ctx.dossier, imageEcran(v.fond.instant))] : []),
    ];
    if (!images.every(f => existsSync(f))) throw new ErreurHttp(409, 'Image de la vignette absente : choisissez de nouveau la pose ou le fond.');
    if (vignetteEnCours) throw new ErreurHttp(409, 'Une vignette est déjà en cours de rendu.');
    vignetteEnCours = true;
    const cle = cleVignette(v);
    const chemin = fichierVignette(cible);
    try {
      const urls = urlsVignette(v, { tournage: urlTournage(ctx.dossier), poses: c.urlPoses });
      await c.rendreVignette({ fondUrl: urls.fond, poseUrl: urls.pose, accroche: v.accroche.trim() }, path.join(ctx.dossier, chemin),
        ctx.tournage.reglages.publication.vignetteOctetsMax);
    } catch (e) {
      const actuelle = await relire(ctx);
      await ecrirePublication(ctx.dossier, modifierVideo(actuelle, cible, {
        erreur: { etape: 'vignette', message: message(e), le: new Date().toISOString() },
      }));
      throw new ErreurHttp(500, `Rendu de la vignette impossible : ${message(e)}`);
    } finally {
      vignetteEnCours = false;
    }
    const actuelle = await relire(ctx);
    const video = videoDe(actuelle, cible);
    // La vignette a pu changer pendant le rendu : le fichier ne vaut que pour celle qui a été rendue.
    const p = video.vignette && cleVignette(video.vignette) === cle
      ? modifierVideo(actuelle, cible, { vignette: { ...video.vignette, fichier: chemin }, erreur: null })
      : actuelle;
    await ecrirePublication(ctx.dossier, p);
    return p;
  }

  async function valider(req: IncomingMessage, ctx: Contexte): Promise<Publication> {
    const cible = lireCible(await lireCorps(req), ctx.cibles);
    const video = videoDe(ctx.publication, cible);
    const disponible = ctx.videos.find(v => v.cible === cible)!;
    const vignettePresente = !!video.vignette?.fichier && existsSync(path.join(ctx.dossier, video.vignette.fichier));
    const problemes = problemesPreparation(video, descriptionYoutube(video.description, disponible.chapitres),
      ctx.tournage.reglages.publication, vignettePresente);
    if (!disponible.rendue) problemes.unshift(`Rendu absent : ${disponible.fichier}.`);
    if (problemes.length > 0) throw new ErreurHttp(422, 'La vidéo n’est pas prête.', problemes);
    const statut = video.statut === 'a-preparer' || video.statut === 'erreur' ? 'prete' : video.statut;
    const p = modifierVideo(ctx.publication, cible, { statut, erreur: null });
    await ecrirePublication(ctx.dossier, p);
    return p;
  }

  // Photos de donnees/poses/, détourées à la première demande puis chaque fois que la photo change.
  async function poses(): Promise<Pose[]> {
    const fichiers = existsSync(c.cheminPoses) ? await readdir(c.cheminPoses) : [];
    const photos = fichiers
      .filter(f => EXTENSIONS_PHOTO.has(path.extname(f).toLowerCase()) && !f.toLowerCase().endsWith('.detoure.png'))
      .sort();
    const resultat: Pose[] = [];
    for (const photo of photos) {
      const source = path.join(c.cheminPoses, photo);
      const detouree = path.join(c.cheminPoses, poseDetouree(photo));
      const aJour = existsSync(detouree) && (await stat(detouree)).mtimeMs >= (await stat(source)).mtimeMs;
      if (!aJour) {
        try {
          await c.detourer(source, detouree);
        } catch (e) {
          throw new ErreurHttp(500, `Détourage de ${photo} impossible : ${message(e)}`);
        }
      }
      resultat.push({ fichier: photo, url: `${c.urlPoses}/${encodeURIComponent(poseDetouree(photo))}` });
    }
    return resultat;
  }

  return async function traiter(req, res) {
    const chemin = new URL(req.url ?? '/', 'http://local').pathname;
    const route = /^\/api\/tournages\/([^/]+)\/publication(?:\/(redaction|image|vignette|valider))?$/.exec(chemin);
    if (!route && chemin !== '/api/poses') return false;
    try {
      if (!route) {
        if (req.method !== 'GET') throw new ErreurHttp(405, 'Méthode non permise.');
        repondre(res, 200, await poses());
        return true;
      }
      const ctx = await contexte(dossierTournage(c.racineTournages, route[1]!));
      const action = route[2];
      if (!action && req.method === 'GET') repondre(res, 200, await detail(ctx));
      else if (!action && req.method === 'PUT') repondre(res, 200, await enregistrer(req, ctx));
      else if (action === 'redaction' && req.method === 'POST') repondre(res, 200, await rediger(req, ctx));
      else if (action === 'image' && req.method === 'POST') repondre(res, 200, await image(req, ctx));
      else if (action === 'vignette' && req.method === 'POST') repondre(res, 200, await vignette(req, ctx));
      else if (action === 'valider' && req.method === 'POST') repondre(res, 200, await valider(req, ctx));
      else repondre(res, 404, { erreur: 'Route inconnue.' });
    } catch (e) {
      repondreErreur(res, e);
    }
    return true;
  };
}
```

Note : `modifierVideo(actuelle, cible, proposition)` copie les cinq champs de `PropositionRedaction` (`titre`, `variantesTitre`, `description`, `tags`, `accroches`), tous présents dans `VideoPubliee`.

- [ ] **Step 5: Vérifier que les tests passent**

Run: `npm test -- studio/serveur/publication.test.ts` puis `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Brancher dans le serveur du studio**

Dans `studio/serveur/principal.ts`, ajouter les imports :

```ts
import { mkdir } from 'node:fs/promises';
import { rendreVignette } from '../../remotion/scripts/vignette';
import { detourerImage, extraireImage } from './pipeline';
import { creerApiPublication } from './publication';
import { redigerPublication } from './redaction';
import { lireReferencesSite } from './site-replit';
```

Après la création de `api` :

```ts
  // Banque de poses servie à part : ses photos ne sont pas dans un dossier de tournage.
  const cheminPoses = path.join(RACINE, 'donnees', 'poses');
  await mkdir(cheminPoses, { recursive: true });
  const serveurPoses = await demarrerServeur(cheminPoses);
  const apiPublication = creerApiPublication({
    racineTournages,
    cheminPoses,
    urlFichiers: fichiers.url,
    urlPoses: serveurPoses.url,
    // Adresse publiée du site Replit (catégories et playlists), dans .env.
    urlSite: process.env.REPLIT_SITE_URL,
    lireSite: url => lireReferencesSite(url),
    rediger: d => redigerPublication(d),
    extraireImage,
    detourer: detourerImage,
    rendreVignette: (props, sortie, octetsMax) => rendreVignette(props, sortie, octetsMax),
  });
```

Dans le gestionnaire de requêtes, avant `if (await api(req, res)) return;` (qui répond 404 à toute route `/api/` inconnue) :

```ts
    if (await apiPublication(req, res)) return;
```

Ajouter à `.gitignore` :

```
donnees/poses/
```

- [ ] **Step 7: Vérifier l'ensemble**

Run: `npm test` puis `npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add studio/commun.ts studio/serveur/publication.ts studio/serveur/publication.test.ts studio/serveur/principal.ts .gitignore
git commit -m "Studio : routes de publication — vidéos rendues, rédaction, images, vignette, validation, banque de poses

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Écran « Publication » du studio

**Files:**
- Create: `studio/src/logique/publication.ts`, `studio/src/logique/publication.test.ts`, `studio/src/usePublication.ts`, `studio/src/composants/EcranPublication.tsx`, `studio/src/composants/CartePublication.tsx`, `studio/src/composants/ChoixVignette.tsx`
- Modify: `studio/src/api.ts`, `studio/src/App.tsx`, `studio/src/composants/EcranMontage.tsx`, `studio/src/styles.css`, `docs/studio.md`

**Interfaces:**
- Consumes: routes et types de la Task 7 ; `modifierVideo`, `appliquerModifications`, `urlsVignette`, `longueurTags`, `PROFILS` (Task 1) ; `descriptionYoutube`, `formatHorodatage` (Task 2) ; `Vignette`, `LARGEUR_VIGNETTE`, `HAUTEUR_VIGNETTE` (Task 4) ; `ErreurApi` (`studio/src/api.ts`) ; `EtatEnregistrement` (`studio/src/useMontage.ts`).
- Produces (`studio/src/logique/publication.ts`) : `LIBELLES_PROFIL`, `EXPLICATIONS_PROFIL`, `LIBELLES_STATUT`, `libelleCible(c)`, `tagsDepuisTexte(s)`, `texteDepuisTags(tags)`, `changerProfilParDefaut(p, profil)`.

- [ ] **Step 1: Écrire les tests de la logique**

Créer `studio/src/logique/publication.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { accorderPublication, modifierVideo } from '../../../noyau/publication';
import { changerProfilParDefaut, libelleCible, tagsDepuisTexte, texteDepuisTags } from './publication';

describe('tags', () => {
  it('découpe sur les virgules et retire les vides', () => {
    expect(tagsDepuisTexte(' Windows, presse-papiers ,, ia ')).toEqual(['Windows', 'presse-papiers', 'ia']);
    expect(texteDepuisTags(['a', 'b c'])).toBe('a, b c');
  });
});

describe('libelleCible', () => {
  it('nomme la vidéo complète et les épisodes', () => {
    expect(libelleCible('complete')).toBe('Vidéo complète');
    expect(libelleCible(2)).toBe('Épisode 2');
  });
});

describe('changerProfilParDefaut', () => {
  it('change le profil des vidéos qui suivaient l’ancien défaut', () => {
    const p = modifierVideo(accorderPublication(null, ['complete', 1]), 1, { profil: 'interne' });
    const q = changerProfilParDefaut(p, 'mixte');
    expect(q.profilParDefaut).toBe('mixte');
    expect(q.videos.map(v => v.profil)).toEqual(['mixte', 'interne']);
  });
});
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `npm test -- studio/src/logique/publication.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Écrire la logique**

Créer `studio/src/logique/publication.ts` :

```ts
import type { CiblePublication, Profil, Publication, StatutPublication } from '../../../noyau/publication';

export const LIBELLES_PROFIL: Record<Profil, string> = { interne: 'Interne', perso: 'Perso', mixte: 'Mixte' };

export const EXPLICATIONS_PROFIL: Record<Profil, string> = {
  interne: 'Contenu confidentiel : privée sur YouTube, fichier envoyé sur le site, réservé aux comptes autorisés.',
  perso: 'Contenu personnel : publique sur YouTube, rien sur le site.',
  mixte: 'Contenu sans risque : publique sur YouTube, puis relayée sur le site.',
};

export const LIBELLES_STATUT: Record<StatutPublication, string> = {
  'a-preparer': 'À préparer',
  prete: 'Prête',
  'envoyee-youtube': 'Envoyée sur YouTube',
  relayee: 'Relayée sur le site',
  erreur: 'Erreur',
};

export const libelleCible = (c: CiblePublication) => (c === 'complete' ? 'Vidéo complète' : `Épisode ${c}`);

export const tagsDepuisTexte = (texte: string) => texte.split(',').map(t => t.trim()).filter(t => t !== '');
export const texteDepuisTags = (tags: string[]) => tags.join(', ');

// Les vidéos qui suivaient l'ancien profil par défaut prennent le nouveau ; les autres gardent le leur.
export function changerProfilParDefaut(p: Publication, profil: Profil): Publication {
  return {
    ...p,
    profilParDefaut: profil,
    videos: p.videos.map(v => (v.profil === p.profilParDefaut ? { ...v, profil } : v)),
  };
}
```

Run: `npm test -- studio/src/logique/publication.test.ts`
Expected: PASS.

- [ ] **Step 4: Appels au serveur**

Dans `studio/src/api.ts`, ajouter aux imports `import type { CiblePublication, Publication } from '../../noyau/publication';` et `DetailPublication, Pose` à l'import de `../commun`, puis à l'objet `api` :

```ts
  publication: (nom: string) => appeler<DetailPublication>(`${chemin(nom)}/publication`),
  enregistrerPublication: (nom: string, p: Publication) => appeler<Publication>(`${chemin(nom)}/publication`, enJson('PUT', p)),
  rediger: (nom: string, cible: CiblePublication) => appeler<Publication>(`${chemin(nom)}/publication/redaction`, enJson('POST', { cible })),
  image: (nom: string, source: 'ecran' | 'camera', instant: number) =>
    appeler<{ chemin: string }>(`${chemin(nom)}/publication/image`, enJson('POST', { source, instant })),
  rendreVignette: (nom: string, cible: CiblePublication) => appeler<Publication>(`${chemin(nom)}/publication/vignette`, enJson('POST', { cible })),
  validerVideo: (nom: string, cible: CiblePublication) => appeler<Publication>(`${chemin(nom)}/publication/valider`, enJson('POST', { cible })),
  poses: () => appeler<Pose[]>('/api/poses'),
```

- [ ] **Step 5: Chargement et enregistrement**

Créer `studio/src/usePublication.ts` :

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { appliquerModifications, type Publication } from '../../noyau/publication';
import type { DetailPublication } from '../commun';
import { api } from './api';
import type { EtatEnregistrement } from './useMontage';

const DELAI_ENREGISTREMENT = 400;

// Charge la publication d'un tournage et l'enregistre peu après chaque modification, avec les mêmes règles
// de statut que le serveur. Une action du serveur (rédaction, vignette, validation) part après l'enregistrement
// en attente et remplace la publication par celle qu'il renvoie.
export function usePublication(nom: string) {
  const [detail, setDetail] = useState<DetailPublication | null>(null);
  const [publication, setPublication] = useState<Publication | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistrement, setEnregistrement] = useState<EtatEnregistrement>('a-jour');
  const recue = useRef<Publication | null>(null);
  const derniere = useRef<Publication | null>(null);
  const minuteur = useRef<number | undefined>(undefined);
  const file = useRef<Promise<unknown>>(Promise.resolve());
  derniere.current = publication;

  const recevoir = useCallback((p: Publication) => {
    recue.current = p;
    setPublication(p);
  }, []);

  useEffect(() => {
    setDetail(null);
    setErreur(null);
    api.publication(nom).then(d => { setDetail(d); recevoir(d.publication); }, (e: Error) => setErreur(e.message));
  }, [nom, recevoir]);

  const enregistrer = useCallback((p: Publication) => {
    file.current = file.current
      .then(() => api.enregistrerPublication(nom, p))
      .then(() => setEnregistrement('a-jour'), () => setEnregistrement('erreur'));
    return file.current;
  }, [nom]);

  useEffect(() => {
    if (!publication || publication === recue.current) return;
    setEnregistrement('en-attente');
    window.clearTimeout(minuteur.current);
    minuteur.current = window.setTimeout(() => void enregistrer(publication), DELAI_ENREGISTREMENT);
  }, [publication, enregistrer]);

  const modifier = useCallback((f: (p: Publication) => Publication) => {
    setPublication(p => (p ? appliquerModifications(p, f(p)) : p));
  }, []);

  const executer = useCallback(async (action: () => Promise<Publication>) => {
    window.clearTimeout(minuteur.current);
    const p = derniere.current;
    if (p && p !== recue.current) await enregistrer(p);
    recevoir(await action());
    setEnregistrement('a-jour');
  }, [enregistrer, recevoir]);

  return { detail, publication, erreur, enregistrement, modifier, executer };
}
```

- [ ] **Step 6: Composition de la vignette**

Créer `studio/src/composants/ChoixVignette.tsx` :

```tsx
import { Thumbnail } from '@remotion/player';
import { type FC, useState } from 'react';
import { cleVignette, urlsVignette, type Publication, type Vignette, type VideoPubliee } from '../../../noyau/publication';
import { HAUTEUR_VIGNETTE, LARGEUR_VIGNETTE, Vignette as CompositionVignette } from '../../../remotion/composants/Vignette';
import type { DetailPublication, Pose } from '../../commun';
import { api } from '../api';

interface Props {
  nom: string;
  video: VideoPubliee;
  detail: DetailPublication;
  poses: Pose[];
  // Instant affiché dans le lecteur de l'écran, en secondes de la source.
  instant: () => number;
  changer: (c: Partial<VideoPubliee>) => void;
  lancer: (libelle: string, action: () => Promise<Publication>) => Promise<void>;
}

const arrondi = (t: number) => Math.round(t * 1000) / 1000;

// Pose (banque ou caméra), fond (charte ou écran), accroche ; aperçu immédiat, puis rendu en JPEG par le serveur.
export const ChoixVignette: FC<Props> = ({ nom, video: v, detail, poses, instant, changer, lancer }) => {
  const [erreur, setErreur] = useState<string | null>(null);
  const [extraction, setExtraction] = useState(false);
  const vignette = v.vignette;
  const bases = { tournage: detail.urlTournage, poses: detail.urlPoses };

  const composer = (c: Partial<Omit<Vignette, 'fichier'>>) => {
    const premiere = poses[0];
    const pose = c.pose ?? vignette?.pose ?? (premiere ? { source: 'banque' as const, fichier: premiere.fichier } : null);
    if (!pose) {
      setErreur('Aucune pose : ajoutez des photos dans donnees/poses/ ou utilisez la caméra séparée.');
      return;
    }
    setErreur(null);
    changer({
      vignette: {
        pose,
        fond: c.fond ?? vignette?.fond ?? { source: 'charte' },
        accroche: c.accroche ?? vignette?.accroche ?? v.accroches[0] ?? '',
        fichier: vignette?.fichier ?? null,
      },
    });
  };

  const prendre = async (source: 'ecran' | 'camera') => {
    const t = arrondi(instant());
    setExtraction(true);
    setErreur(null);
    try {
      await api.image(nom, source, t);
      composer(source === 'ecran' ? { fond: { source: 'ecran', instant: t } } : { pose: { source: 'camera', instant: t } });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setExtraction(false);
    }
  };

  const urls = vignette ? urlsVignette(vignette, bases) : null;
  return (
    <fieldset className="vignette">
      <legend>Vignette</legend>
      <div className="actions">
        <span>Pose :</span>
        {poses.map(p => (
          <button
            key={p.fichier}
            className={vignette?.pose.source === 'banque' && vignette.pose.fichier === p.fichier ? 'pose choisie' : 'pose'}
            title={p.fichier}
            onClick={() => composer({ pose: { source: 'banque', fichier: p.fichier } })}
          >
            <img src={p.url} alt={p.fichier} />
          </button>
        ))}
        {detail.camera && (
          <button disabled={extraction} onClick={() => void prendre('camera')}>Caméra à l’image affichée</button>
        )}
      </div>
      <div className="actions">
        <span>Fond :</span>
        <button onClick={() => composer({ fond: { source: 'charte' } })}>Formes de la charte</button>
        <button disabled={extraction} onClick={() => void prendre('ecran')}>Écran à l’image affichée</button>
      </div>
      <label>
        Accroche (3 à 5 mots)
        <input value={vignette?.accroche ?? ''} onChange={e => composer({ accroche: e.target.value })} />
      </label>
      {v.accroches.length > 0 && (
        <div className="actions">
          {v.accroches.map(a => <button key={a} className="lien" onClick={() => composer({ accroche: a })}>{a}</button>)}
        </div>
      )}
      {extraction && <p className="discret">Extraction de l’image…</p>}
      {erreur && <p className="alerte">{erreur}</p>}
      {vignette && urls && (
        <div className="apercus-vignette">
          <div>
            <p className="discret">Aperçu</p>
            <Thumbnail
              component={CompositionVignette}
              compositionWidth={LARGEUR_VIGNETTE}
              compositionHeight={HAUTEUR_VIGNETTE}
              frameToDisplay={0}
              durationInFrames={1}
              fps={30}
              inputProps={{ fondUrl: urls.fond, poseUrl: urls.pose, accroche: vignette.accroche }}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <p className="discret">Rendu</p>
            {vignette.fichier
              ? <img className="vignette-rendue" src={`${detail.urlTournage}/${vignette.fichier}?v=${encodeURIComponent(cleVignette(vignette))}`} alt="Vignette rendue" />
              : <p className="discret">Pas encore rendue.</p>}
          </div>
        </div>
      )}
      {vignette && (
        <button onClick={() => void lancer('Rendu de la vignette…', () => api.rendreVignette(nom, v.cible))}>Rendre la vignette</button>
      )}
    </fieldset>
  );
};
```

- [ ] **Step 7: Carte d'une vidéo**

Créer `studio/src/composants/CartePublication.tsx` :

```tsx
import { type FC, useEffect, useState } from 'react';
import { longueurTags, modifierVideo, PROFILS, type Profil, type Publication, type VideoPubliee } from '../../../noyau/publication';
import { descriptionYoutube, formatHorodatage } from '../../../noyau/publication-textes';
import type { DetailPublication, Pose, VideoDisponible } from '../../commun';
import { api, ErreurApi } from '../api';
import { EXPLICATIONS_PROFIL, libelleCible, LIBELLES_PROFIL, LIBELLES_STATUT, tagsDepuisTexte, texteDepuisTags } from '../logique/publication';
import { ChoixVignette } from './ChoixVignette';

interface Props {
  nom: string;
  video: VideoPubliee;
  disponible: VideoDisponible;
  detail: DetailPublication;
  poses: Pose[];
  instant: () => number;
  modifier: (f: (p: Publication) => Publication) => void;
  executer: (action: () => Promise<Publication>) => Promise<void>;
}

const idOuNull = (valeur: string) => (valeur === '' ? null : Number(valeur));

export const CartePublication: FC<Props> = ({ nom, video: v, disponible, detail, poses, instant, modifier, executer }) => {
  const [occupe, setOccupe] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [problemes, setProblemes] = useState<string[]>([]);
  const [tags, setTags] = useState(texteDepuisTags(v.tags));
  useEffect(() => setTags(texteDepuisTags(v.tags)), [v.tags]);

  const changer = (c: Partial<VideoPubliee>) => modifier(p => modifierVideo(p, v.cible, c));
  const lancer = async (libelle: string, action: () => Promise<Publication>) => {
    setOccupe(libelle);
    setErreur(null);
    setProblemes([]);
    try {
      await executer(action);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
      if (e instanceof ErreurApi) setProblemes(e.problemes);
    } finally {
      setOccupe(null);
    }
  };

  const r = detail.reglages;
  const site = detail.site;
  const descriptionFinale = descriptionYoutube(v.description, disponible.chapitres);
  const playlists = site?.playlists.filter(p => v.replit.categorieId === null || p.categorieId === v.replit.categorieId) ?? [];
  return (
    <section className="panneau carte-publication">
      <h3>
        <label>
          <input type="checkbox" checked={v.publier} onChange={e => changer({ publier: e.target.checked })} />
          {' '}{libelleCible(v.cible)} — {disponible.titre}
        </label>
        {' '}<span className={`statut statut-${v.statut}`}>{LIBELLES_STATUT[v.statut]}</span>
      </h3>
      {!disponible.rendue && <p className="alerte">Rendu absent : {disponible.fichier}</p>}
      {v.erreur && <p className="alerte">Dernière erreur ({v.erreur.etape}) : {v.erreur.message}</p>}
      {v.publier && (
        <>
          <label>
            Profil{' '}
            <select value={v.profil} onChange={e => changer({ profil: e.target.value as Profil })}>
              {PROFILS.map(p => <option key={p} value={p}>{LIBELLES_PROFIL[p]}</option>)}
            </select>
          </label>
          <p className="discret">{EXPLICATIONS_PROFIL[v.profil]}</p>
          {v.profil !== 'perso' && site && (
            <div className="actions">
              <label>
                Catégorie du site{' '}
                <select
                  value={v.replit.categorieId ?? ''}
                  onChange={e => changer({ replit: { ...v.replit, categorieId: idOuNull(e.target.value), playlistId: null } })}
                >
                  <option value="">—</option>
                  {site.categories.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </label>
              <label>
                Playlist du site{' '}
                <select value={v.replit.playlistId ?? ''} onChange={e => changer({ replit: { ...v.replit, playlistId: idOuNull(e.target.value) } })}>
                  <option value="">—</option>
                  {playlists.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
                </select>
              </label>
            </div>
          )}
          <button disabled={!!occupe} onClick={() => void lancer('Rédaction par Claude…', () => api.rediger(nom, v.cible))}>
            Proposer les textes avec Claude
          </button>
          <label>
            Titre ({v.titre.trim().length}/{r.titreMax})
            <input value={v.titre} onChange={e => changer({ titre: e.target.value })} />
          </label>
          {v.variantesTitre.length > 0 && (
            <div className="actions">
              <span className="discret">Variantes :</span>
              {v.variantesTitre.map(t => <button key={t} className="lien" onClick={() => changer({ titre: t })}>{t}</button>)}
            </div>
          )}
          <label>
            Description ({descriptionFinale.length}/{r.descriptionMax} avec les chapitres)
            <textarea rows={8} value={v.description} onChange={e => changer({ description: e.target.value })} />
          </label>
          {disponible.chapitres.length > 0 && (
            <pre className="discret">Chapitres :{'\n'}{disponible.chapitres.map(c => `${formatHorodatage(c.debut)} ${c.titre}`).join('\n')}</pre>
          )}
          <label>
            Tags, séparés par des virgules ({longueurTags(tagsDepuisTexte(tags))}/{r.tagsMax})
            <input value={tags} onChange={e => setTags(e.target.value)} onBlur={() => changer({ tags: tagsDepuisTexte(tags) })} />
          </label>
          <ChoixVignette nom={nom} video={v} detail={detail} poses={poses} instant={instant} changer={changer} lancer={lancer} />
          <button className="principal" disabled={!!occupe} onClick={() => void lancer('Vérification…', () => api.validerVideo(nom, v.cible))}>
            Valider pour la publication
          </button>
        </>
      )}
      {occupe && <p className="discret">{occupe}</p>}
      {erreur && <p className="alerte">{erreur}</p>}
      {problemes.length > 0 && <ul>{problemes.map(p => <li key={p}>{p}</li>)}</ul>}
    </section>
  );
};
```

- [ ] **Step 8: Écran et navigation**

Créer `studio/src/composants/EcranPublication.tsx` :

```tsx
import { type FC, useEffect, useRef, useState } from 'react';
import { PROFILS, type Profil } from '../../../noyau/publication';
import type { Pose } from '../../commun';
import { api } from '../api';
import { changerProfilParDefaut, EXPLICATIONS_PROFIL, LIBELLES_PROFIL } from '../logique/publication';
import { usePublication } from '../usePublication';
import type { EtatEnregistrement } from '../useMontage';
import { CartePublication } from './CartePublication';

const LIBELLES_ENREGISTREMENT: Record<EtatEnregistrement, string> = {
  'a-jour': 'Enregistré',
  'en-attente': 'Enregistrement…',
  erreur: 'Échec de l’enregistrement : la prochaine modification réessaiera',
};

// Une carte par vidéo rendue ; le lecteur de la source sert à choisir l'image d'un fond ou d'une pose caméra.
export const EcranPublication: FC<{ nom: string }> = ({ nom }) => {
  const { detail, publication, erreur, enregistrement, modifier, executer } = usePublication(nom);
  const [poses, setPoses] = useState<Pose[] | null>(null);
  const [erreurPoses, setErreurPoses] = useState<string | null>(null);
  const lecteur = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    api.poses().then(setPoses, (e: Error) => setErreurPoses(e.message));
  }, []);

  const retour = <a href={`#/${encodeURIComponent(nom)}`}>← Montage</a>;
  if (erreur) return <div className="page">{retour}<p className="alerte">{erreur}</p></div>;
  if (!detail || !publication) return <div className="page">Chargement…</div>;

  const instant = () => lecteur.current?.currentTime ?? 0;
  return (
    <div className="page publication">
      <header className="entete">
        {retour}
        <h2>Publication — {detail.titre}</h2>
        <span className="discret">{LIBELLES_ENREGISTREMENT[enregistrement]}</span>
      </header>
      <section className="panneau">
        <label>
          Profil par défaut{' '}
          <select value={publication.profilParDefaut} onChange={e => modifier(p => changerProfilParDefaut(p, e.target.value as Profil))}>
            {PROFILS.map(p => <option key={p} value={p}>{LIBELLES_PROFIL[p]}</option>)}
          </select>
        </label>
        <p className="discret">{EXPLICATIONS_PROFIL[publication.profilParDefaut]}</p>
        <video ref={lecteur} className="lecteur-publication" src={detail.sourceUrl} controls preload="metadata" />
        <p className="discret">Placez la vidéo sur l’image voulue, puis prenez-la comme fond ou comme pose dans une vignette.</p>
        {poses === null && !erreurPoses && <p className="discret">Préparation de la banque de poses…</p>}
        {erreurPoses && <p className="alerte">Banque de poses : {erreurPoses}</p>}
        {!detail.site && (
          <p className="discret">Site Replit injoignable ou adresse absente (REPLIT_SITE_URL dans .env) : catégories et playlists indisponibles.</p>
        )}
      </section>
      {publication.videos.map(v => {
        const disponible = detail.videos.find(d => d.cible === v.cible);
        return disponible && (
          <CartePublication
            key={String(v.cible)} nom={nom} video={v} disponible={disponible} detail={detail} poses={poses ?? []}
            instant={instant} modifier={modifier} executer={executer}
          />
        );
      })}
    </div>
  );
};
```

Remplacer `studio/src/App.tsx` par :

```tsx
import { type FC, useEffect, useState } from 'react';
import { EcranMontage } from './composants/EcranMontage';
import { EcranPublication } from './composants/EcranPublication';
import { ListeTournages } from './composants/ListeTournages';

// #/ : liste des tournages ; #/<nom> : écran de montage ; #/<nom>/publication : écran de publication.
function routeDeLAncre() {
  const [nom = '', ecran = ''] = window.location.hash.replace(/^#\/?/, '').split('/');
  return { nom: decodeURIComponent(nom), publication: ecran === 'publication' };
}

export const App: FC = () => {
  const [route, setRoute] = useState(routeDeLAncre);
  useEffect(() => {
    const suivre = () => setRoute(routeDeLAncre());
    window.addEventListener('hashchange', suivre);
    return () => window.removeEventListener('hashchange', suivre);
  }, []);
  if (!route.nom) return <ListeTournages />;
  return route.publication ? <EcranPublication key={route.nom} nom={route.nom} /> : <EcranMontage key={route.nom} nom={route.nom} />;
};
```

Dans `studio/src/composants/EcranMontage.tsx`, dans `<header className="entete">`, après le `<span>` d'état d'enregistrement :

```tsx
        {detail.statut === 'rendu' && <a href={`#/${encodeURIComponent(nom)}/publication`}>Publication →</a>}
```

Ajouter à la fin de `studio/src/styles.css` :

```css
.publication { max-width: 1100px; margin: 0 auto; }
.publication label { display: block; margin: 0.5rem 0; }
.publication input:not([type='checkbox']), .publication textarea { width: 100%; box-sizing: border-box; }
.lecteur-publication { width: 100%; max-height: 360px; background: #000; }
.carte-publication h3 label { display: inline; }
.statut { font-size: 0.8rem; padding: 0.1rem 0.5rem; border-radius: 1rem; background: #e5e7eb; }
.statut-prete { background: #d1fae5; }
.statut-erreur { background: #fee2e2; }
.vignette { border: 1px solid #d1d5db; border-radius: 6px; padding: 0.5rem 1rem; margin: 1rem 0; }
.pose { padding: 2px; background: #f3f4f6; border: 2px solid transparent; }
.pose.choisie { border-color: #004c99; }
.pose img { height: 64px; display: block; }
.apercus-vignette { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.vignette-rendue { width: 100%; }
```

- [ ] **Step 9: Vérifier le typage et les tests**

Run: `npm run typecheck` puis `npm test`
Expected: PASS.

- [ ] **Step 10: Essai dans le navigateur**

Préparer : passer le tournage d'essai au statut `rendu` en lançant son rendu depuis le studio (ou vérifier `donnees/tournages/2026-10-essai/episode.json`), déposer au moins une photo dans `donnees/poses/`, et ajouter `REPLIT_SITE_URL=<adresse publiée du site>` à `.env` si elle est connue.

Run: `npm run validation`, puis ouvrir http://127.0.0.1:5180 dans Chrome.

Vérifier, sur le tournage d'essai :
1. le lien « Publication → » apparaît dans l'en-tête du montage et ouvre l'écran ;
2. « Proposer les textes avec Claude » remplit titre, variantes, description, tags et accroches ;
3. choisir une pose, prendre l'écran à l'image affichée comme fond, choisir une accroche : l'aperçu se met à jour aussitôt ;
4. « Rendre la vignette » affiche le JPEG rendu, de moins de 2 Mo, dans `rendus/vignettes/` ;
5. « Valider pour la publication » passe la vidéo à « Prête » ; modifier ensuite le titre la ramène à « À préparer » ;
6. recharger la page : tout est conservé (`publication.json`).

- [ ] **Step 11: Mode d'emploi**

Ajouter à la fin de `docs/studio.md` :

```markdown
## Publication

Une fois le tournage rendu, le lien **Publication →** de l’en-tête ouvre l’écran de publication. Chaque vidéo rendue (vidéo complète, épisodes) y a sa carte ; seules les vidéos cochées sont préparées.

- **Profil** : *Interne* (contenu confidentiel : privée sur YouTube, fichier envoyé sur le site), *Perso* (publique sur YouTube, rien sur le site), *Mixte* (publique sur YouTube, puis relayée sur le site). Le profil par défaut s’applique aux vidéos qui ne l’ont pas changé. Pour Interne et Mixte, choisir la catégorie et la playlist du site (lues sur le site si `REPLIT_SITE_URL` est renseignée dans `.env`).
- **Textes** : « Proposer les textes avec Claude » remplit le titre (avec deux variantes), la description, les tags et trois accroches de vignette, à partir des paroles conservées. Tout se corrige à la main. Les chapitres de la vidéo complète sont ajoutés à la description automatiquement (au moins 3 chapitres de 10 s).
- **Vignette** : choisir une pose (photo de `donnees/poses/`, détourée automatiquement, ou caméra séparée à l’image affichée dans le lecteur), un fond (formes de la charte, ou écran à l’image affichée) et une accroche ; l’aperçu suit chaque choix. « Rendre la vignette » produit le JPEG 1280×720 dans `rendus/vignettes/`.
- **Valider pour la publication** vérifie titre, description, tags, vignette rendue et, pour une vidéo publique, l’absence de mention interdite ; la vidéo passe alors à « Prête ». Toute modification ultérieure la ramène à « À préparer ».

Tout est enregistré dans `publication.json` du tournage.
```

- [ ] **Step 12: Commit**

```bash
git add studio/src docs/studio.md
git commit -m "Studio : écran de publication — profils, textes proposés par Claude, vignette composée et rendue, validation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Vérification finale

- [ ] **Step 1: Toute la suite**

Run: `npm test`, `npm run typecheck`, `npm run test:rendu`, puis `cd pipeline; ..\.venv\Scripts\python -m pytest -q`
Expected: PASS partout.

- [ ] **Step 2: Relire la spec**

Relire les sections « Données » et « Plan 6 » de `docs/superpowers/specs/2026-10-20-publication-design.md` et cocher chaque exigence : onglet Publication, profils et profil par défaut, catégories et playlists du site, métadonnées par Claude, chapitres calculés par le noyau, vignette (pose banque ou caméra, fond, accroche, rendu Remotion, moins de 2 Mo), banque de poses partagée, caméra séparée ignorée par le montage, statut « prête » seulement après validation. Corriger tout écart avant de clore.
