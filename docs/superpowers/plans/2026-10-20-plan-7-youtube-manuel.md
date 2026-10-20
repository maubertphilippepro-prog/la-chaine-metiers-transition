# Plan 7 — YouTube en mode manuel : plan de mise en œuvre

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pour une vidéo « prête », le studio écrit un dossier prêt à téléverser à la main dans YouTube Studio (vignette, titre, description, tags, réglages), puis l'auteur colle l'URL de la vidéo mise en ligne : la vidéo passe à « envoyée sur YouTube » et le studio vérifie sa visibilité par oEmbed, sans compte Google.

**Architecture:** Les règles sont des fonctions pures d'un nouveau module du noyau (`noyau/youtube.ts`) : identifiant tiré d'une URL, visibilités permises par profil, contrôles avant envoi, contenu des fichiers du dossier, passage à `envoyee-youtube`, bilan de la vérification. Les effets (écrire le dossier, ouvrir l'Explorateur, appeler oEmbed) vivent dans `studio/serveur/youtube.ts`, injectés dans `creerApiPublication` comme les autres dépendances. Le studio gagne un panneau YouTube dans chaque carte de vidéo prête.

**Tech Stack:** Node 22, TypeScript 5 (`strict`, `noUncheckedIndexedAccess`), Vitest 3, React 19.3.0, Vite 7.3.7.

Spec de référence : `docs/superpowers/specs/2026-10-20-publication-design.md` (sections Plan 7, Contrôles avant envoi, Gestion des erreurs, Tests).

## Global Constraints

- La chaîne s'appelle **« PMT »** (projet personnel). Aucune mention d'organisation dans le code, les textes affichés ou la documentation (seule exception existante : `publication.mentionsInterdites` de `reglages.json`).
- Texte visible et noms de domaine en français ; clés JSON en camelCase ; apostrophe typographique `’` dans les textes affichés et les messages d'erreur.
- Dossier préparé : `donnees/tournages/<tournage>/publication/<complete|episode-NN>/` avec `vignette.jpg`, `titre.txt`, `description.txt` (chapitres compris), `tags.txt` (séparés par `, `), `reglages-youtube.txt`. Le MP4 n'est pas copié.
- Réglages indiqués : catégorie « Science et technologie », langue français, « Non, cette vidéo n’est pas conçue pour les enfants », playlist suggérée (titre du tournage) quand plusieurs vidéos du tournage sont cochées.
- Visibilités : **Privée** pour Interne ; **Publique** ou **Programmée** pour Perso et Mixte. Une date est exigée pour Programmée, interdite sinon.
- Préparer et enregistrer l'envoi ne sont possibles que pour une vidéo cochée au statut `prete`, `envoyee-youtube` ou `relayee` (mise à jour). Enregistrer l'envoi passe `prete` à `envoyee-youtube` ; `relayee` le reste.
- URL acceptées : `youtube.com/watch?v=<id>`, `youtu.be/<id>`, `youtube.com/shorts/<id>`, `studio.youtube.com/video/<id>/…`, ou l'identifiant seul (11 caractères `[A-Za-z0-9_-]`).
- oEmbed : `https://www.youtube.com/oembed?url=<URL watch encodée>&format=json` ; 200 → lisible publiquement ; 401, 403, 404 → non lisible ; autre statut ou erreur réseau → inconnu.
- Aucun appel réel à YouTube, à l'Explorateur ni au site Replit dans les tests automatiques.
- Le chemin du projet contient « & » : ne jamais utiliser `npx` ; passer par les scripts npm (`npm test -- <fichier>`, `npm run typecheck`).
- Chaque commit se termine par la ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Structure des fichiers

```
noyau/
  youtube.ts (+ test)                NOUVEAU : URL, visibilités, contrôles, fichiers du dossier, envoi, bilan oEmbed
studio/
  commun.ts                          + DossierYoutube, VerificationYoutube
  serveur/youtube.ts (+ test)        NOUVEAU : oEmbed, écriture du dossier, ouverture dans l'Explorateur
  serveur/publication.ts             routes youtube/preparer, youtube/ouvrir, youtube/envoi, youtube/verifier
  serveur/publication.test.ts        tests des routes YouTube
  serveur/principal.ts               branche oEmbed et Explorateur
  src/api.ts                         + appels YouTube
  src/usePublication.ts              + synchroniser (enregistrement en attente envoyé avant une action)
  src/logique/publication.ts (+ test) + libellés de visibilité, conversion date locale ↔ ISO
  src/composants/PanneauYoutube.tsx  NOUVEAU
  src/composants/CartePublication.tsx affiche le panneau pour une vidéo prête
  src/composants/EcranPublication.tsx transmet synchroniser
  src/styles.css                     style du panneau
docs/
  youtube-studio.md                  NOUVEAU : notice pas à pas
  studio.md                          section Publication complétée
```

---

### Task 1: Règles YouTube du noyau

**Files:**
- Create: `noyau/youtube.ts`, `noyau/youtube.test.ts`

**Interfaces:**
- Consumes (de `noyau/publication.ts`) : `VideoPubliee`, `Profil`, `ReglagesPublication`, `CiblePublication`, `nomCible`, `problemesPreparation(v, descriptionFinale, r, vignettePresente): string[]`.
- Produces (exports de `noyau/youtube.ts`) :
  - types `VisibiliteYoutube` (= `'privee' | 'publique' | 'programmee'`), `LectureYoutube` (= `'publique' | 'non-publique' | 'inconnue'`), `EnvoiYoutube { id: string; visibilite: VisibiliteYoutube; programmeeLe: string | null }`, `TextesYoutube { titre: string; description: string; tags: string; reglages: string }`
  - `FORMES_URL: string`
  - `idYoutube(texte: string): string | null`
  - `visibilitesIndiquees(profil: Profil): VisibiliteYoutube[]`
  - `pretePourYoutube(v: VideoPubliee): boolean`
  - `dossierYoutube(c: CiblePublication): string` (relatif au tournage)
  - `problemesEnvoi(v, descriptionFinale, r, etat: { rendu: { fichier: string; present: boolean }; octetsVignette: number | null }): string[]`
  - `textesYoutube(v, descriptionFinale, o: { playlist: string | null; cheminRendu: string }): TextesYoutube`
  - `raisonEnvoi(v: VideoPubliee, e: EnvoiYoutube): string | null`
  - `enregistrerEnvoi(v: VideoPubliee, e: EnvoiYoutube): Partial<VideoPubliee>`
  - `bilanLecture(v: VideoPubliee, lecture: LectureYoutube, maintenant: Date): { alerte: boolean; message: string }`

- [ ] **Step 1: Écrire les tests**

`noyau/youtube.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import reglagesJson from '../reglages.json';
import { videoParDefaut, type VideoPubliee } from './publication';
import type { Reglages } from './types';
import {
  bilanLecture, dossierYoutube, enregistrerEnvoi, FORMES_URL, idYoutube, pretePourYoutube, problemesEnvoi, raisonEnvoi,
  textesYoutube, visibilitesIndiquees,
} from './youtube';

const R = (reglagesJson as Reglages).publication;
const ID = 'dQw4w9WgXcQ';
const prete = (changement: Partial<VideoPubliee> = {}): VideoPubliee => ({
  ...videoParDefaut('complete', 'perso'),
  statut: 'prete',
  titre: 'Le SSO expliqué',
  description: 'Desc',
  tags: ['sso', 'mot de passe'],
  vignette: { pose: { source: 'banque', fichier: 'a.jpg' }, fond: { source: 'charte' }, accroche: 'Un seul mot', fichier: 'rendus/vignettes/complete.jpg' },
  ...changement,
});
const RENDU = { fichier: 'video-complete.mp4', present: true };

describe('idYoutube', () => {
  it('reconnaît les formes d’URL acceptées et l’identifiant seul', () => {
    for (const url of [
      `https://www.youtube.com/watch?v=${ID}&t=42s`,
      `youtube.com/watch?v=${ID}`,
      `https://m.youtube.com/watch?v=${ID}`,
      `https://youtu.be/${ID}?si=abc`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://studio.youtube.com/video/${ID}/edit`,
      ` ${ID} `,
    ]) expect(idYoutube(url)).toBe(ID);
  });
  it('refuse toute autre chaîne', () => {
    for (const texte of ['', 'bonjour', `https://vimeo.com/${ID}`, 'https://www.youtube.com/watch?v=court', 'https://youtu.be/',
      'https://www.youtube.com/playlist?list=PL123', `https://www.youtube.com/@pmt`]) {
      expect(idYoutube(texte)).toBeNull();
    }
  });
  it('rappelle les formes acceptées', () => {
    expect(FORMES_URL).toContain('youtu.be/');
    expect(FORMES_URL).toContain('11 caractères');
  });
});

describe('visibilités et statuts', () => {
  it('indique Privée pour Interne, Publique ou Programmée sinon', () => {
    expect(visibilitesIndiquees('interne')).toEqual(['privee']);
    expect(visibilitesIndiquees('perso')).toEqual(['publique', 'programmee']);
    expect(visibilitesIndiquees('mixte')).toEqual(['publique', 'programmee']);
  });
  it('ne prépare que les vidéos cochées et validées', () => {
    expect(pretePourYoutube(prete())).toBe(true);
    expect(pretePourYoutube(prete({ statut: 'envoyee-youtube' }))).toBe(true);
    expect(pretePourYoutube(prete({ statut: 'relayee' }))).toBe(true);
    expect(pretePourYoutube(prete({ statut: 'a-preparer' }))).toBe(false);
    expect(pretePourYoutube(prete({ statut: 'erreur' }))).toBe(false);
    expect(pretePourYoutube(prete({ publier: false }))).toBe(false);
  });
  it('range le dossier par cible', () => {
    expect(dossierYoutube('complete')).toBe('publication/complete');
    expect(dossierYoutube(2)).toBe('publication/episode-02');
  });
});

describe('problemesEnvoi', () => {
  it('accepte une vidéo prête', () => {
    expect(problemesEnvoi(prete(), 'Desc', R, { rendu: RENDU, octetsVignette: 1000 })).toEqual([]);
  });
  it('reprend les contrôles de la préparation et y ajoute statut, rendu et poids de la vignette', () => {
    expect(problemesEnvoi(prete({ statut: 'a-preparer', publier: false }), 'Desc', R, {
      rendu: { fichier: 'video-complete.mp4', present: false }, octetsVignette: 2_000_001,
    })).toEqual([
      'Vidéo non cochée pour la publication.',
      'Vidéo pas encore validée pour la publication.',
      'Rendu absent : video-complete.mp4.',
      'Vignette trop lourde : 2000001 octets, 2000000 au plus.',
    ]);
    expect(problemesEnvoi(prete({ titre: '' }), 'Desc', R, { rendu: RENDU, octetsVignette: null })).toEqual(['Titre vide.', 'Vignette à rendre.']);
  });
});

describe('textesYoutube', () => {
  it('donne les champs à copier et les réglages d’une vidéo publique', () => {
    const t = textesYoutube(prete(), 'Desc\n\nChapitres :\n0:00 Intro', { playlist: 'Essai', cheminRendu: 'C:\\t\\rendus\\video-complete.mp4' });
    expect(t.titre).toBe('Le SSO expliqué');
    expect(t.description).toBe('Desc\n\nChapitres :\n0:00 Intro');
    expect(t.tags).toBe('sso, mot de passe');
    expect(t.reglages).toContain('Fichier vidéo : C:\\t\\rendus\\video-complete.mp4');
    expect(t.reglages).toContain('Visibilité : Publique, ou Programmée à la date voulue');
    expect(t.reglages).toContain('Catégorie : Science et technologie');
    expect(t.reglages).toContain('Langue de la vidéo : Français');
    expect(t.reglages).toContain('Non, cette vidéo n’est pas conçue pour les enfants');
    expect(t.reglages).toContain('Playlist : Essai');
  });
  it('indique Privée pour une vidéo Interne et omet la playlist si elle est seule', () => {
    const t = textesYoutube(prete({ profil: 'interne' }), 'Desc', { playlist: null, cheminRendu: 'x.mp4' });
    expect(t.reglages).toContain('Visibilité : Privée');
    expect(t.reglages).not.toContain('Playlist');
  });
});

describe('envoi', () => {
  const envoi = { id: ID, visibilite: 'publique' as const, programmeeLe: null };
  it('accepte un envoi conforme au profil', () => {
    expect(raisonEnvoi(prete(), envoi)).toBeNull();
    expect(raisonEnvoi(prete(), { id: ID, visibilite: 'programmee', programmeeLe: '2026-10-21T16:00:00.000Z' })).toBeNull();
    expect(raisonEnvoi(prete({ profil: 'interne' }), { ...envoi, visibilite: 'privee' })).toBeNull();
  });
  it('refuse une vidéo non validée, une visibilité contraire au profil et une date incohérente', () => {
    expect(raisonEnvoi(prete({ statut: 'a-preparer' }), envoi)).toBe('Validez d’abord la vidéo pour la publication.');
    expect(raisonEnvoi(prete({ profil: 'interne' }), envoi)).toBe('Une vidéo Interne reste privée sur YouTube.');
    expect(raisonEnvoi(prete(), { ...envoi, visibilite: 'privee' })).toBe('Une vidéo Perso ou Mixte est publique ou programmée sur YouTube.');
    expect(raisonEnvoi(prete(), { ...envoi, visibilite: 'programmee' })).toBe('Date et heure de mise en ligne attendues.');
    expect(raisonEnvoi(prete(), { ...envoi, visibilite: 'programmee', programmeeLe: 'demain' })).toBe('Date et heure de mise en ligne attendues.');
    expect(raisonEnvoi(prete(), { ...envoi, programmeeLe: '2026-10-21T16:00:00.000Z' })).toBe('Date de mise en ligne réservée à une vidéo programmée.');
  });
  it('passe la vidéo à envoyée et garde « relayée »', () => {
    expect(enregistrerEnvoi(prete(), envoi)).toEqual({
      statut: 'envoyee-youtube', youtube: { id: ID, visibilite: 'publique', programmeeLe: null, playlistId: null }, erreur: null,
    });
    expect(enregistrerEnvoi(prete({ statut: 'relayee' }), envoi).statut).toBe('relayee');
  });
});

describe('bilanLecture', () => {
  const maintenant = new Date('2026-10-20T12:00:00Z');
  const envoyee = (profil: VideoPubliee['profil'], youtube: Partial<VideoPubliee['youtube']> = {}) =>
    prete({ profil, statut: 'envoyee-youtube', youtube: { id: ID, visibilite: 'publique', programmeeLe: null, playlistId: null, ...youtube } });
  it('alerte si une vidéo Interne est lisible publiquement', () => {
    expect(bilanLecture(envoyee('interne', { visibilite: 'privee' }), 'publique', maintenant)).toEqual({
      alerte: true, message: 'Vidéo Interne lisible publiquement : passez-la en privé dans YouTube Studio.',
    });
    expect(bilanLecture(envoyee('interne', { visibilite: 'privee' }), 'non-publique', maintenant).alerte).toBe(false);
  });
  it('confirme une vidéo publique en ligne', () => {
    expect(bilanLecture(envoyee('mixte'), 'publique', maintenant)).toEqual({ alerte: false, message: 'Vidéo en ligne, lisible publiquement.' });
  });
  it('attend l’heure d’une vidéo programmée, alerte sinon', () => {
    const programmee = bilanLecture(envoyee('perso', { visibilite: 'programmee', programmeeLe: '2026-10-21T16:00:00.000Z' }), 'non-publique', maintenant);
    expect(programmee.alerte).toBe(false);
    expect(programmee.message).toContain('pas encore en ligne');
    expect(bilanLecture(envoyee('perso'), 'non-publique', maintenant)).toEqual({
      alerte: true, message: 'Vidéo pas encore lisible publiquement : passez-la en public dans YouTube Studio, ou attendez l’heure programmée.',
    });
  });
  it('signale une vérification impossible', () => {
    expect(bilanLecture(envoyee('perso'), 'inconnue', maintenant)).toEqual({
      alerte: true, message: 'Vérification impossible : YouTube ne répond pas, réessayez plus tard.',
    });
  });
});
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `npm test -- noyau/youtube.test.ts`
Expected: FAIL (module `./youtube` introuvable).

- [ ] **Step 3: Écrire le module**

`noyau/youtube.ts` :

```ts
import { nomCible, problemesPreparation, type CiblePublication, type Profil, type ReglagesPublication, type VideoPubliee } from './publication';

export type VisibiliteYoutube = VideoPubliee['youtube']['visibilite'];
// Résultat de la vérification par oEmbed : lisible sans compte, non lisible (privée, programmée, supprimée), ou YouTube injoignable.
export type LectureYoutube = 'publique' | 'non-publique' | 'inconnue';

export interface EnvoiYoutube {
  id: string;
  visibilite: VisibiliteYoutube;
  programmeeLe: string | null;
}

// Contenu des fichiers texte du dossier « Préparer pour YouTube ».
export interface TextesYoutube {
  titre: string;
  description: string;
  tags: string;
  reglages: string;
}

const ID = /^[A-Za-z0-9_-]{11}$/;
const STATUTS_ENVOI: VideoPubliee['statut'][] = ['prete', 'envoyee-youtube', 'relayee'];

export const FORMES_URL = 'Formes acceptées : youtube.com/watch?v=…, youtu.be/…, youtube.com/shorts/…, '
  + 'studio.youtube.com/video/…/edit, ou l’identifiant seul de 11 caractères.';

export function idYoutube(texte: string): string | null {
  const t = texte.trim();
  if (ID.test(t)) return t;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
  } catch {
    return null;
  }
  const hote = url.hostname.toLowerCase().replace(/^(www|m)\./, '');
  const morceaux = url.pathname.split('/').filter(Boolean);
  let id: string | null | undefined = null;
  if (hote === 'youtube.com' && morceaux.length === 1 && morceaux[0] === 'watch') id = url.searchParams.get('v');
  else if (hote === 'youtube.com' && morceaux.length === 2 && morceaux[0] === 'shorts') id = morceaux[1];
  else if (hote === 'youtu.be' && morceaux.length === 1) id = morceaux[0];
  else if (hote === 'studio.youtube.com' && morceaux[0] === 'video') id = morceaux[1];
  return id && ID.test(id) ? id : null;
}

export const visibilitesIndiquees = (profil: Profil): VisibiliteYoutube[] =>
  (profil === 'interne' ? ['privee'] : ['publique', 'programmee']);

export const pretePourYoutube = (v: VideoPubliee) => v.publier && STATUTS_ENVOI.includes(v.statut);

export const dossierYoutube = (c: CiblePublication) => `publication/${nomCible(c)}`;

export function problemesEnvoi(
  v: VideoPubliee, descriptionFinale: string, r: ReglagesPublication,
  etat: { rendu: { fichier: string; present: boolean }; octetsVignette: number | null },
): string[] {
  const problemes: string[] = [];
  if (!v.publier) problemes.push('Vidéo non cochée pour la publication.');
  if (!STATUTS_ENVOI.includes(v.statut)) problemes.push('Vidéo pas encore validée pour la publication.');
  if (!etat.rendu.present) problemes.push(`Rendu absent : ${etat.rendu.fichier}.`);
  problemes.push(...problemesPreparation(v, descriptionFinale, r, etat.octetsVignette !== null));
  if (etat.octetsVignette !== null && etat.octetsVignette > r.vignetteOctetsMax) {
    problemes.push(`Vignette trop lourde : ${etat.octetsVignette} octets, ${r.vignetteOctetsMax} au plus.`);
  }
  return problemes;
}

const CONSIGNE_VISIBILITE: Record<Profil, string> = {
  interne: 'Privée (profil Interne : jamais publique ni non répertoriée)',
  perso: 'Publique, ou Programmée à la date voulue (profil Perso)',
  mixte: 'Publique, ou Programmée à la date voulue (profil Mixte : relayée sur le site une fois en ligne)',
};

export function textesYoutube(
  v: VideoPubliee, descriptionFinale: string, o: { playlist: string | null; cheminRendu: string },
): TextesYoutube {
  const reglages = [
    'Réglages à choisir dans YouTube Studio',
    '',
    `Fichier vidéo : ${o.cheminRendu}`,
    `Visibilité : ${CONSIGNE_VISIBILITE[v.profil]}`,
    'Catégorie : Science et technologie',
    'Langue de la vidéo : Français',
    'Audience : Non, cette vidéo n’est pas conçue pour les enfants',
    ...(o.playlist ? [`Playlist : ${o.playlist}`] : []),
  ];
  return { titre: v.titre.trim(), description: descriptionFinale, tags: v.tags.join(', '), reglages: reglages.join('\n') };
}

export function raisonEnvoi(v: VideoPubliee, e: EnvoiYoutube): string | null {
  if (!pretePourYoutube(v)) return 'Validez d’abord la vidéo pour la publication.';
  if (!visibilitesIndiquees(v.profil).includes(e.visibilite)) {
    return v.profil === 'interne' ? 'Une vidéo Interne reste privée sur YouTube.' : 'Une vidéo Perso ou Mixte est publique ou programmée sur YouTube.';
  }
  if (e.visibilite === 'programmee') {
    if (!e.programmeeLe || Number.isNaN(Date.parse(e.programmeeLe))) return 'Date et heure de mise en ligne attendues.';
  } else if (e.programmeeLe !== null) {
    return 'Date de mise en ligne réservée à une vidéo programmée.';
  }
  return null;
}

export function enregistrerEnvoi(v: VideoPubliee, e: EnvoiYoutube): Partial<VideoPubliee> {
  return {
    statut: v.statut === 'relayee' ? 'relayee' : 'envoyee-youtube',
    youtube: { ...v.youtube, id: e.id, visibilite: e.visibilite, programmeeLe: e.programmeeLe },
    erreur: null,
  };
}

export function bilanLecture(v: VideoPubliee, lecture: LectureYoutube, maintenant: Date): { alerte: boolean; message: string } {
  if (lecture === 'inconnue') return { alerte: true, message: 'Vérification impossible : YouTube ne répond pas, réessayez plus tard.' };
  const publique = lecture === 'publique';
  if (v.profil === 'interne') {
    return publique
      ? { alerte: true, message: 'Vidéo Interne lisible publiquement : passez-la en privé dans YouTube Studio.' }
      : { alerte: false, message: 'Vidéo privée : elle n’est pas lisible publiquement.' };
  }
  if (publique) return { alerte: false, message: 'Vidéo en ligne, lisible publiquement.' };
  const heure = v.youtube.visibilite === 'programmee' && v.youtube.programmeeLe ? new Date(v.youtube.programmeeLe) : null;
  if (heure && heure > maintenant) {
    const date = heure.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' });
    return { alerte: false, message: `Vidéo programmée : pas encore en ligne, mise en ligne prévue le ${date}.` };
  }
  return { alerte: true, message: 'Vidéo pas encore lisible publiquement : passez-la en public dans YouTube Studio, ou attendez l’heure programmée.' };
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npm test -- noyau/youtube.test.ts` puis `npm run typecheck`
Expected: PASS ; aucune erreur de type.

- [ ] **Step 5: Commit**

```bash
git add noyau/youtube.ts noyau/youtube.test.ts
git commit -m "Publication : règles YouTube en mode manuel — URL collée, visibilités par profil, contrôles avant envoi, dossier à téléverser, bilan oEmbed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Effets YouTube du serveur (oEmbed, dossier, Explorateur)

**Files:**
- Create: `studio/serveur/youtube.ts`, `studio/serveur/youtube.test.ts`

**Interfaces:**
- Consumes : `LectureYoutube`, `TextesYoutube` (Task 1).
- Produces :
  - `lireVisibiliteYoutube(id: string, recuperer?: typeof fetch): Promise<LectureYoutube>`
  - `ecrireDossierYoutube(dossier: string, textes: TextesYoutube, vignette: string): Promise<void>` (chemins absolus)
  - `ouvrirDansExplorateur(dossier: string): Promise<void>`

- [ ] **Step 1: Écrire les tests**

`studio/serveur/youtube.test.ts` :

```ts
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ecrireDossierYoutube, lireVisibiliteYoutube } from './youtube';

const ID = 'dQw4w9WgXcQ';
const reponse = (status: number) => ({ ok: status >= 200 && status < 300, status, json: async () => ({}) }) as Response;
const avec = (status: number) => vi.fn(async () => reponse(status)) as unknown as typeof fetch;

describe('lireVisibiliteYoutube', () => {
  it('interroge l’adresse oEmbed de la vidéo', async () => {
    const recuperer = avec(200);
    expect(await lireVisibiliteYoutube(ID, recuperer)).toBe('publique');
    const attendue = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${ID}`)}&format=json`;
    expect(recuperer).toHaveBeenCalledWith(attendue, expect.anything());
  });
  it('lit 401, 403 et 404 comme non lisible, le reste comme inconnu', async () => {
    for (const status of [401, 403, 404]) expect(await lireVisibiliteYoutube(ID, avec(status))).toBe('non-publique');
    expect(await lireVisibiliteYoutube(ID, avec(500))).toBe('inconnue');
    const injoignable = vi.fn(async () => { throw new Error('ENOTFOUND'); }) as unknown as typeof fetch;
    expect(await lireVisibiliteYoutube(ID, injoignable)).toBe('inconnue');
  });
});

describe('ecrireDossierYoutube', () => {
  it('écrit la vignette et les textes, en remplaçant une préparation précédente', async () => {
    const racine = await mkdtemp(path.join(os.tmpdir(), 'pmt-youtube-'));
    const vignette = path.join(racine, 'complete.jpg');
    await writeFile(vignette, 'jpg');
    const dossier = path.join(racine, 'publication', 'complete');
    const textes = { titre: 'Titre', description: 'Desc', tags: 'a, b', reglages: 'Réglages' };
    await ecrireDossierYoutube(dossier, { ...textes, titre: 'Ancien' }, vignette);
    await ecrireDossierYoutube(dossier, textes, vignette);
    const lire = (f: string) => readFile(path.join(dossier, f), 'utf-8');
    expect(await lire('vignette.jpg')).toBe('jpg');
    expect(await lire('titre.txt')).toBe('Titre');
    expect(await lire('description.txt')).toBe('Desc');
    expect(await lire('tags.txt')).toBe('a, b');
    expect(await lire('reglages-youtube.txt')).toBe('Réglages');
  });
});
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `npm test -- studio/serveur/youtube.test.ts`
Expected: FAIL (module `./youtube` introuvable).

- [ ] **Step 3: Écrire le module**

`studio/serveur/youtube.ts` :

```ts
import { spawn } from 'node:child_process';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { LectureYoutube, TextesYoutube } from '../../noyau/youtube';

const DELAI = 5000;
const NON_LISIBLE = new Set([401, 403, 404]);

// Visibilité vue sans compte Google : l’adresse oEmbed ne répond qu’aux vidéos lisibles publiquement (publiques ou non répertoriées).
export async function lireVisibiliteYoutube(id: string, recuperer: typeof fetch = fetch): Promise<LectureYoutube> {
  const video = `https://www.youtube.com/watch?v=${id}`;
  try {
    const reponse = await recuperer(`https://www.youtube.com/oembed?url=${encodeURIComponent(video)}&format=json`, {
      signal: AbortSignal.timeout(DELAI),
    });
    if (reponse.ok) return 'publique';
    return NON_LISIBLE.has(reponse.status) ? 'non-publique' : 'inconnue';
  } catch {
    return 'inconnue';
  }
}

export async function ecrireDossierYoutube(dossier: string, textes: TextesYoutube, vignette: string): Promise<void> {
  await mkdir(dossier, { recursive: true });
  await copyFile(vignette, path.join(dossier, 'vignette.jpg'));
  const fichiers: [string, string][] = [
    ['titre.txt', textes.titre],
    ['description.txt', textes.description],
    ['tags.txt', textes.tags],
    ['reglages-youtube.txt', textes.reglages],
  ];
  for (const [nom, contenu] of fichiers) await writeFile(path.join(dossier, nom), contenu, 'utf-8');
}

// L’Explorateur rend la main aussitôt (et sort souvent avec le code 1) : seul l’échec du lancement compte.
export function ouvrirDansExplorateur(dossier: string): Promise<void> {
  return new Promise((resoudre, rejeter) => {
    const processus = spawn('explorer.exe', [dossier], { detached: true, stdio: 'ignore' });
    processus.on('error', rejeter);
    processus.on('spawn', () => {
      processus.unref();
      resoudre();
    });
  });
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npm test -- studio/serveur/youtube.test.ts` puis `npm run typecheck`
Expected: PASS ; aucune erreur de type.

- [ ] **Step 5: Commit**

```bash
git add studio/serveur/youtube.ts studio/serveur/youtube.test.ts
git commit -m "Studio : vérification oEmbed, écriture du dossier YouTube et ouverture dans l’Explorateur

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Routes YouTube du serveur

**Files:**
- Modify: `studio/commun.ts`, `studio/serveur/publication.ts`, `studio/serveur/publication.test.ts`, `studio/serveur/principal.ts`

**Interfaces:**
- Consumes : Task 1 (`idYoutube`, `FORMES_URL`, `dossierYoutube`, `problemesEnvoi`, `textesYoutube`, `raisonEnvoi`, `enregistrerEnvoi`, `bilanLecture`, types) et Task 2 (`ecrireDossierYoutube`, `lireVisibiliteYoutube`, `ouvrirDansExplorateur`).
- Produces :
  - `ConfigPublication` + `lireVisibiliteYoutube: (id: string) => Promise<LectureYoutube>` et `ouvrirDossier: (dossier: string) => Promise<void>`
  - `studio/commun.ts` : `DossierYoutube { dossier: string; rendu: string; textes: TextesYoutube }`, `VerificationYoutube { lecture: LectureYoutube; alerte: boolean; message: string }`
  - routes (corps JSON, toutes en `POST`) :
    - `/api/tournages/<nom>/publication/youtube/preparer` `{ cible }` → `DossierYoutube` ; 422 avec `problemes`
    - `/api/tournages/<nom>/publication/youtube/ouvrir` `{ cible }` → `{ ok: true }` ; 409 si le dossier n'est pas préparé
    - `/api/tournages/<nom>/publication/youtube/envoi` `{ cible, url, visibilite, programmeeLe }` → `Publication` ; 400 URL non reconnue, 422 envoi refusé
    - `/api/tournages/<nom>/publication/youtube/verifier` `{ cible }` → `VerificationYoutube` ; 409 sans identifiant

- [ ] **Step 1: Écrire les tests des routes**

Dans `studio/serveur/publication.test.ts`, ajouter dans le `beforeEach`, à la fin de l'objet `config` (après `rendreVignette`) :

```ts
    lireVisibiliteYoutube: vi.fn(async () => 'publique' as const),
    ouvrirDossier: vi.fn(async () => {}),
```

Puis ajouter à la fin du fichier :

```ts
describe('YouTube', () => {
  const ID = 'dQw4w9WgXcQ';
  async function prete(profil = 'perso') {
    const dossier = await tournage('a');
    await writeFile(path.join(racine, 'poses', 'surpris.jpg'), 'jpg');
    await writeFile(path.join(racine, 'poses', 'surpris.detoure.png'), 'png');
    const p = await lirePublication('a');
    const vignette = { pose: { source: 'banque', fichier: 'surpris.jpg' }, fond: { source: 'charte' }, accroche: 'Un seul mot de passe', fichier: null };
    await envoyer('a', {
      ...p,
      videos: p.videos.map(v => (v.cible === 'complete'
        ? { ...v, profil, titre: 'Titre', description: 'Desc', tags: ['sso', 'mot de passe'], vignette }
        : v)),
    });
    await action('a', 'vignette', { cible: 'complete' });
    expect((await action('a', 'valider', { cible: 'complete' })).status).toBe(200);
    return dossier;
  }
  const envoi = (corps: Record<string, unknown> = {}) =>
    action('a', 'youtube/envoi', { cible: 'complete', url: `https://youtu.be/${ID}`, visibilite: 'publique', programmeeLe: null, ...corps });

  it('prépare le dossier à téléverser', async () => {
    const dossier = await prete();
    const r = await action('a', 'youtube/preparer', { cible: 'complete' });
    expect(r.status).toBe(200);
    const d = await r.json();
    const sortie = path.join(dossier, 'publication', 'complete');
    expect(d.dossier).toBe(sortie);
    expect(d.rendu).toBe(path.join(dossier, 'rendus', 'video-complete.mp4'));
    expect(d.textes).toMatchObject({ titre: 'Titre', description: 'Desc', tags: 'sso, mot de passe' });
    expect(await readFile(path.join(sortie, 'titre.txt'), 'utf-8')).toBe('Titre');
    expect(await readFile(path.join(sortie, 'vignette.jpg'), 'utf-8')).toBe('jpg');
    const reglages = await readFile(path.join(sortie, 'reglages-youtube.txt'), 'utf-8');
    expect(reglages).toContain('Science et technologie');
    expect(reglages).not.toContain('Playlist');
  });
  it('suggère une playlist au nom du tournage quand plusieurs vidéos sont publiées', async () => {
    await prete();
    const p = await lirePublication('a');
    await envoyer('a', { ...p, videos: p.videos.map(v => (v.cible === 1 ? { ...v, publier: true } : v)) });
    const d = await (await action('a', 'youtube/preparer', { cible: 'complete' })).json();
    expect(d.textes.reglages).toContain('Playlist : Essai');
  });
  it('refuse une vidéo non validée ou une vignette trop lourde, en expliquant pourquoi', async () => {
    await tournage('a');
    const refus = await action('a', 'youtube/preparer', { cible: 'complete' });
    expect(refus.status).toBe(422);
    expect((await refus.json()).problemes).toContain('Vidéo pas encore validée pour la publication.');
    const dossier = await prete();
    await writeFile(path.join(dossier, 'rendus', 'vignettes', 'complete.jpg'), Buffer.alloc(2_000_001));
    const lourde = await action('a', 'youtube/preparer', { cible: 'complete' });
    expect((await lourde.json()).problemes).toEqual(['Vignette trop lourde : 2000001 octets, 2000000 au plus.']);
  });
  it('ouvre le dossier une fois préparé', async () => {
    const dossier = await prete();
    expect((await action('a', 'youtube/ouvrir', { cible: 'complete' })).status).toBe(409);
    await action('a', 'youtube/preparer', { cible: 'complete' });
    expect((await action('a', 'youtube/ouvrir', { cible: 'complete' })).status).toBe(200);
    expect(config.ouvrirDossier).toHaveBeenCalledWith(path.join(dossier, 'publication', 'complete'));
  });
  it('enregistre l’URL collée et passe la vidéo à envoyée', async () => {
    const dossier = await prete();
    const r = await envoi();
    expect(r.status).toBe(200);
    expect(((await r.json()) as Publication).videos[0]).toMatchObject({
      statut: 'envoyee-youtube', youtube: { id: ID, visibilite: 'publique', programmeeLe: null, playlistId: null },
    });
    const enregistree = JSON.parse(await readFile(path.join(dossier, 'publication.json'), 'utf-8')) as Publication;
    expect(enregistree.videos[0]!.youtube.id).toBe(ID);
  });
  it('refuse une URL non reconnue en rappelant les formes acceptées', async () => {
    await prete();
    const r = await envoi({ url: 'https://vimeo.com/123' });
    expect(r.status).toBe(400);
    expect((await r.json()).erreur).toContain('youtu.be/');
  });
  it('refuse une visibilité publique pour une vidéo Interne', async () => {
    await prete('interne');
    const r = await envoi();
    expect(r.status).toBe(422);
    expect((await r.json()).erreur).toBe('Une vidéo Interne reste privée sur YouTube.');
    expect((await envoi({ visibilite: 'privee' })).status).toBe(200);
  });
  it('vérifie la visibilité par oEmbed une fois l’URL collée', async () => {
    await prete();
    expect((await action('a', 'youtube/verifier', { cible: 'complete' })).status).toBe(409);
    await envoi();
    vi.mocked(config.lireVisibiliteYoutube).mockResolvedValueOnce('non-publique');
    const r = await action('a', 'youtube/verifier', { cible: 'complete' });
    expect(await r.json()).toEqual({
      lecture: 'non-publique', alerte: true,
      message: 'Vidéo pas encore lisible publiquement : passez-la en public dans YouTube Studio, ou attendez l’heure programmée.',
    });
    expect(config.lireVisibiliteYoutube).toHaveBeenCalledWith(ID);
  });
});
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `npm test -- studio/serveur/publication.test.ts`
Expected: FAIL — erreur de type sur `config` puis routes inconnues (404) dans le bloc `YouTube`.

- [ ] **Step 3: Ajouter les types partagés**

Dans `studio/commun.ts`, ajouter l'import et les deux interfaces (après `DetailPublication`) :

```ts
import type { LectureYoutube, TextesYoutube } from '../noyau/youtube';
```

```ts
// Dossier « Préparer pour YouTube » : chemins absolus, le MP4 reste dans rendus/.
export interface DossierYoutube {
  dossier: string;
  rendu: string;
  textes: TextesYoutube;
}
export interface VerificationYoutube {
  lecture: LectureYoutube;
  alerte: boolean;
  message: string;
}
```

- [ ] **Step 4: Ajouter les routes**

Dans `studio/serveur/publication.ts` :

1. Imports (`stat` et `existsSync` sont déjà importés) : ajouter

```ts
import {
  bilanLecture, dossierYoutube, enregistrerEnvoi, FORMES_URL, idYoutube, problemesEnvoi, raisonEnvoi, textesYoutube,
  type LectureYoutube, type VisibiliteYoutube,
} from '../../noyau/youtube';
import { ecrireDossierYoutube } from './youtube';
```

et compléter l'import de `../commun` : `import type { DetailPublication, DossierYoutube, Pose, VerificationYoutube, VideoDisponible } from '../commun';`

2. `ConfigPublication`, après `rendreVignette` :

```ts
  // Visibilité vue par l’adresse publique oEmbed, et ouverture d’un dossier dans l’Explorateur.
  lireVisibiliteYoutube: (id: string) => Promise<LectureYoutube>;
  ouvrirDossier: (dossier: string) => Promise<void>;
```

3. Dans `creerApiPublication`, après la fonction `valider`, ajouter :

```ts
  async function preparerYoutube(req: IncomingMessage, ctx: Contexte): Promise<DossierYoutube> {
    const cible = lireCible(await lireCorps(req), ctx.cibles);
    const video = videoDe(ctx.publication, cible);
    const disponible = ctx.videos.find(v => v.cible === cible)!;
    const descriptionFinale = descriptionYoutube(video.description, disponible.chapitres);
    const vignette = video.vignette?.fichier ? path.join(ctx.dossier, video.vignette.fichier) : null;
    const octetsVignette = vignette && existsSync(vignette) ? (await stat(vignette)).size : null;
    const problemes = problemesEnvoi(video, descriptionFinale, ctx.tournage.reglages.publication, {
      rendu: { fichier: disponible.fichier, present: disponible.rendue },
      octetsVignette,
    });
    if (problemes.length > 0 || !vignette) throw new ErreurHttp(422, 'La vidéo ne peut pas être préparée pour YouTube.', problemes);
    const rendu = path.join(ctx.dossier, 'rendus', disponible.fichier);
    // Une playlist par tournage n’a de sens que si plusieurs de ses vidéos sont publiées.
    const plusieurs = ctx.publication.videos.filter(v => v.publier).length > 1;
    const textes = textesYoutube(video, descriptionFinale, { playlist: plusieurs ? ctx.tournage.titre : null, cheminRendu: rendu });
    const dossier = path.join(ctx.dossier, dossierYoutube(cible));
    await ecrireDossierYoutube(dossier, textes, vignette);
    return { dossier, rendu, textes };
  }

  async function ouvrirYoutube(req: IncomingMessage, ctx: Contexte): Promise<{ ok: true }> {
    const dossier = path.join(ctx.dossier, dossierYoutube(lireCible(await lireCorps(req), ctx.cibles)));
    if (!existsSync(dossier)) throw new ErreurHttp(409, 'Préparez d’abord le dossier pour YouTube.');
    try {
      await c.ouvrirDossier(dossier);
    } catch (e) {
      throw new ErreurHttp(500, `Ouverture du dossier impossible : ${message(e)}`);
    }
    return { ok: true };
  }

  async function envoiYoutube(req: IncomingMessage, ctx: Contexte): Promise<Publication> {
    const corps = await lireCorps(req);
    const cible = lireCible(corps, ctx.cibles);
    const o = objet(corps);
    const id = typeof o.url === 'string' ? idYoutube(o.url) : null;
    if (!id) throw new ErreurHttp(400, `URL YouTube non reconnue. ${FORMES_URL}`);
    if (!['privee', 'publique', 'programmee'].includes(o.visibilite as string)) {
      throw new ErreurHttp(400, 'visibilite attendue : « privee », « publique » ou « programmee ».');
    }
    if (o.programmeeLe !== null && typeof o.programmeeLe !== 'string') throw new ErreurHttp(400, 'programmeeLe attendu : date ISO ou null.');
    const envoi = { id, visibilite: o.visibilite as VisibiliteYoutube, programmeeLe: o.programmeeLe };
    const video = videoDe(ctx.publication, cible);
    const refus = raisonEnvoi(video, envoi);
    if (refus) throw new ErreurHttp(422, refus);
    const p = modifierVideo(ctx.publication, cible, enregistrerEnvoi(video, envoi));
    await ecrirePublication(ctx.dossier, p);
    return p;
  }

  async function verifierYoutube(req: IncomingMessage, ctx: Contexte): Promise<VerificationYoutube> {
    const video = videoDe(ctx.publication, lireCible(await lireCorps(req), ctx.cibles));
    const id = video.youtube.id;
    if (!id) throw new ErreurHttp(409, 'Collez d’abord l’URL de la vidéo mise en ligne.');
    const lecture = await c.lireVisibiliteYoutube(id);
    return { lecture, ...bilanLecture(video, lecture, new Date()) };
  }
```

4. Dans `traiter`, remplacer l'expression de route et ajouter les branches :

```ts
    const route = /^\/api\/tournages\/([^/]+)\/publication(?:\/(redaction|image|vignette|valider|youtube\/(?:preparer|ouvrir|envoi|verifier)))?$/
      .exec(chemin);
```

```ts
      else if (action === 'valider' && req.method === 'POST') repondre(res, 200, await valider(req, ctx));
      else if (action === 'youtube/preparer' && req.method === 'POST') repondre(res, 200, await preparerYoutube(req, ctx));
      else if (action === 'youtube/ouvrir' && req.method === 'POST') repondre(res, 200, await ouvrirYoutube(req, ctx));
      else if (action === 'youtube/envoi' && req.method === 'POST') repondre(res, 200, await envoiYoutube(req, ctx));
      else if (action === 'youtube/verifier' && req.method === 'POST') repondre(res, 200, await verifierYoutube(req, ctx));
      else repondre(res, 404, { erreur: 'Route inconnue.' });
```

- [ ] **Step 5: Brancher les effets réels**

Dans `studio/serveur/principal.ts`, ajouter l'import `import { lireVisibiliteYoutube, ouvrirDansExplorateur } from './youtube';` et, dans l'objet passé à `creerApiPublication`, après `rendreVignette` :

```ts
    lireVisibiliteYoutube: id => lireVisibiliteYoutube(id),
    ouvrirDossier: ouvrirDansExplorateur,
```

- [ ] **Step 6: Vérifier**

Run: `npm test -- studio/serveur/publication.test.ts` puis `npm run typecheck`
Expected: PASS (anciens et nouveaux tests) ; aucune erreur de type.

- [ ] **Step 7: Commit**

```bash
git add studio/commun.ts studio/serveur/publication.ts studio/serveur/publication.test.ts studio/serveur/principal.ts
git commit -m "Studio : routes YouTube — dossier à téléverser, ouverture dans l’Explorateur, URL collée, vérification de la visibilité

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Panneau YouTube dans l'écran de publication

**Files:**
- Modify: `studio/src/api.ts`, `studio/src/usePublication.ts`, `studio/src/logique/publication.ts`, `studio/src/logique/publication.test.ts`, `studio/src/composants/CartePublication.tsx`, `studio/src/composants/EcranPublication.tsx`, `studio/src/styles.css`
- Create: `studio/src/composants/PanneauYoutube.tsx`

**Interfaces:**
- Consumes : routes et types de la Task 3 ; `pretePourYoutube`, `visibilitesIndiquees`, `VisibiliteYoutube` (Task 1).
- Produces :
  - `api.preparerYoutube(nom, cible): Promise<DossierYoutube>`, `api.ouvrirDossierYoutube(nom, cible): Promise<void>`, `api.envoiYoutube(nom, cible, envoi: { url: string; visibilite: VisibiliteYoutube; programmeeLe: string | null }): Promise<Publication>`, `api.verifierYoutube(nom, cible): Promise<VerificationYoutube>`
  - `usePublication` renvoie aussi `synchroniser: () => Promise<void>`
  - `LIBELLES_VISIBILITE: Record<VisibiliteYoutube, string>`, `isoDepuisLocal(valeur: string): string | null`, `localDepuisIso(iso: string | null): string`

- [ ] **Step 1: Tests de la logique**

Dans `studio/src/logique/publication.test.ts`, compléter l'import :

```ts
import { baseVignette, changerProfilParDefaut, isoDepuisLocal, libelleCible, LIBELLES_VISIBILITE, localDepuisIso, tagsDepuisTexte, texteDepuisTags } from './publication';
```

et ajouter :

```ts
describe('dates de programmation', () => {
  it('passe d’un champ date et heure locale à une date ISO et retour', () => {
    const iso = isoDepuisLocal('2026-10-21T18:30');
    expect(iso).toBe(new Date('2026-10-21T18:30').toISOString());
    expect(localDepuisIso(iso)).toBe('2026-10-21T18:30');
  });
  it('laisse vide ce qui n’est pas une date', () => {
    expect(isoDepuisLocal('')).toBeNull();
    expect(isoDepuisLocal('n’importe quoi')).toBeNull();
    expect(localDepuisIso(null)).toBe('');
  });
  it('nomme les visibilités comme YouTube Studio', () => {
    expect(LIBELLES_VISIBILITE).toEqual({ privee: 'Privée', publique: 'Publique', programmee: 'Programmée' });
  });
});
```

Run: `npm test -- studio/src/logique/publication.test.ts`
Expected: FAIL (exports manquants).

- [ ] **Step 2: Logique**

Dans `studio/src/logique/publication.ts`, ajouter l'import `import type { VisibiliteYoutube } from '../../../noyau/youtube';` et, à la fin :

```ts
export const LIBELLES_VISIBILITE: Record<VisibiliteYoutube, string> = { privee: 'Privée', publique: 'Publique', programmee: 'Programmée' };

// Champ « datetime-local » (heure locale, sans fuseau) ↔ date ISO enregistrée.
export function isoDepuisLocal(valeur: string): string | null {
  if (!valeur) return null;
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function localDepuisIso(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const deux = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}T${deux(d.getHours())}:${deux(d.getMinutes())}`;
}
```

Run: `npm test -- studio/src/logique/publication.test.ts`
Expected: PASS.

- [ ] **Step 3: Appels au serveur**

Dans `studio/src/api.ts`, compléter les imports :

```ts
import type { VisibiliteYoutube } from '../../noyau/youtube';
import type { DetailPublication, DetailTournage, DossierYoutube, EtatRendu, Pose, ResumeTournage, VerificationYoutube } from '../commun';
```

et ajouter dans l'objet `api`, après `validerVideo` :

```ts
  preparerYoutube: (nom: string, cible: CiblePublication) =>
    appeler<DossierYoutube>(`${chemin(nom)}/publication/youtube/preparer`, enJson('POST', { cible })),
  ouvrirDossierYoutube: async (nom: string, cible: CiblePublication) => {
    await appeler<{ ok: true }>(`${chemin(nom)}/publication/youtube/ouvrir`, enJson('POST', { cible }));
  },
  envoiYoutube: (nom: string, cible: CiblePublication, envoi: { url: string; visibilite: VisibiliteYoutube; programmeeLe: string | null }) =>
    appeler<Publication>(`${chemin(nom)}/publication/youtube/envoi`, enJson('POST', { cible, ...envoi })),
  verifierYoutube: (nom: string, cible: CiblePublication) =>
    appeler<VerificationYoutube>(`${chemin(nom)}/publication/youtube/verifier`, enJson('POST', { cible })),
```

- [ ] **Step 4: `synchroniser` dans `usePublication`**

Dans `studio/src/usePublication.ts`, remplacer `executer` par :

```ts
  // Envoie tout de suite l’enregistrement en attente : une action du serveur doit lire la publication à jour.
  const synchroniser = useCallback(async () => {
    window.clearTimeout(minuteur.current);
    enAttente.current = null;
    const p = derniere.current;
    if (p && p !== recue.current) {
      const echec = await enregistrer(p);
      if (echec !== null) throw new Error(echec);
    }
  }, [enregistrer]);

  const executer = useCallback(async (action: () => Promise<Publication>) => {
    await synchroniser();
    recevoir(await action());
    setEnregistrement('a-jour');
  }, [synchroniser, recevoir]);

  return { detail, publication, erreur, enregistrement, modifier, executer, synchroniser };
```

(et supprimer l'ancien `return`).

- [ ] **Step 5: Composant `PanneauYoutube`**

`studio/src/composants/PanneauYoutube.tsx` :

```tsx
import { type FC, useState } from 'react';
import type { Publication, VideoPubliee } from '../../../noyau/publication';
import { visibilitesIndiquees, type VisibiliteYoutube } from '../../../noyau/youtube';
import type { DossierYoutube, VerificationYoutube } from '../../commun';
import { api, ErreurApi } from '../api';
import { isoDepuisLocal, LIBELLES_VISIBILITE, localDepuisIso } from '../logique/publication';

interface Props {
  nom: string;
  video: VideoPubliee;
  synchroniser: () => Promise<void>;
  executer: (action: () => Promise<Publication>) => Promise<void>;
}

const CHAMPS: [keyof DossierYoutube['textes'], string][] = [['titre', 'le titre'], ['description', 'la description'], ['tags', 'les tags']];

// Téléversement à la main : dossier préparé, champs à copier dans YouTube Studio, puis URL collée et visibilité vérifiée.
export const PanneauYoutube: FC<Props> = ({ nom, video: v, synchroniser, executer }) => {
  const [dossier, setDossier] = useState<DossierYoutube | null>(null);
  const [url, setUrl] = useState(v.youtube.id ? `https://youtu.be/${v.youtube.id}` : '');
  const [visibilite, setVisibilite] = useState<VisibiliteYoutube>(v.youtube.visibilite);
  const [date, setDate] = useState(localDepuisIso(v.youtube.programmeeLe));
  const [verification, setVerification] = useState<VerificationYoutube | null>(null);
  const [copie, setCopie] = useState<string | null>(null);
  const [occupe, setOccupe] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [problemes, setProblemes] = useState<string[]>([]);

  const permises = visibilitesIndiquees(v.profil);
  const choisie = permises.includes(visibilite) ? visibilite : permises[0]!;

  const lancer = async (libelle: string, action: () => Promise<void>) => {
    setOccupe(libelle);
    setErreur(null);
    setProblemes([]);
    try {
      await action();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
      if (e instanceof ErreurApi) setProblemes(e.problemes);
    } finally {
      setOccupe(null);
    }
  };
  const preparer = () => lancer('Préparation du dossier…', async () => {
    await synchroniser();
    setDossier(await api.preparerYoutube(nom, v.cible));
    setCopie(null);
  });
  const verifier = () => lancer('Vérification sur YouTube…', async () => setVerification(await api.verifierYoutube(nom, v.cible)));
  const enregistrerEnvoi = () => lancer('Enregistrement de l’envoi…', async () => {
    const programmeeLe = choisie === 'programmee' ? isoDepuisLocal(date) : null;
    await executer(() => api.envoiYoutube(nom, v.cible, { url, visibilite: choisie, programmeeLe }));
    setVerification(await api.verifierYoutube(nom, v.cible));
  });
  const copier = (libelle: string, texte: string) => lancer('Copie…', async () => {
    await navigator.clipboard.writeText(texte);
    setCopie(libelle);
  });

  return (
    <div className="youtube">
      <h4>YouTube</h4>
      <div className="actions">
        <button disabled={!!occupe} onClick={() => void preparer()}>Préparer pour YouTube</button>
        {dossier && (
          <button disabled={!!occupe} onClick={() => void lancer('Ouverture du dossier…', () => api.ouvrirDossierYoutube(nom, v.cible))}>
            Ouvrir le dossier
          </button>
        )}
      </div>
      {dossier && (
        <>
          <p className="discret">
            Dossier : {dossier.dossier}<br />
            Vidéo à téléverser : {dossier.rendu}
          </p>
          <div className="actions">
            {CHAMPS.map(([cle, libelle]) => (
              <button key={cle} disabled={!!occupe} onClick={() => void copier(libelle, dossier.textes[cle])}>Copier {libelle}</button>
            ))}
            {copie && <span className="discret">Copié : {copie}.</span>}
          </div>
          <pre className="discret">{dossier.textes.reglages}</pre>
        </>
      )}
      <label>
        URL de la vidéo sur YouTube
        <input value={url} placeholder="https://youtu.be/…" onChange={e => setUrl(e.target.value)} />
      </label>
      <div className="actions">
        <label>
          Visibilité choisie{' '}
          <select value={choisie} onChange={e => setVisibilite(e.target.value as VisibiliteYoutube)}>
            {permises.map(p => <option key={p} value={p}>{LIBELLES_VISIBILITE[p]}</option>)}
          </select>
        </label>
        {choisie === 'programmee' && (
          <label>
            Mise en ligne le{' '}
            <input type="datetime-local" value={date} onChange={e => setDate(e.target.value)} />
          </label>
        )}
        <button className="principal" disabled={!!occupe || !url.trim()} onClick={() => void enregistrerEnvoi()}>Enregistrer l’envoi</button>
      </div>
      {v.youtube.id && (
        <div className="actions">
          <a href={`https://youtu.be/${v.youtube.id}`} target="_blank" rel="noreferrer">Voir sur YouTube</a>
          <a href={`https://studio.youtube.com/video/${v.youtube.id}/edit`} target="_blank" rel="noreferrer">Ouvrir dans YouTube Studio</a>
          <button disabled={!!occupe} onClick={() => void verifier()}>Vérifier la visibilité</button>
        </div>
      )}
      {verification && <p className={verification.alerte ? 'alerte' : 'discret'}>{verification.message}</p>}
      {occupe && <p className="discret">{occupe}</p>}
      {erreur && <p className="alerte">{erreur}</p>}
      {problemes.length > 0 && <ul>{problemes.map(p => <li key={p}>{p}</li>)}</ul>}
    </div>
  );
};
```

- [ ] **Step 6: Intégrer le panneau**

Dans `studio/src/composants/CartePublication.tsx` :

- imports : `import { pretePourYoutube } from '../../../noyau/youtube';` et `import { PanneauYoutube } from './PanneauYoutube';`
- `Props` : ajouter `synchroniser: () => Promise<void>;` et le déstructurer dans la signature du composant ;
- juste après le bouton « Valider pour la publication », toujours dans le fragment `v.publier && (…)` :

```tsx
          {pretePourYoutube(v) && <PanneauYoutube key={v.profil} nom={nom} video={v} synchroniser={synchroniser} executer={executer} />}
```

(La clé `v.profil` remet le formulaire à zéro si le profil change.)

Dans `studio/src/composants/EcranPublication.tsx` : récupérer `synchroniser` depuis `usePublication(nom)` et le passer à `CartePublication` (`synchroniser={synchroniser}`).

Dans `studio/src/styles.css`, après `.statut-erreur { background: #fee2e2; }` (bloc de la publication) :

```css
.statut-envoyee-youtube, .statut-relayee { background: #dbeafe; }
.carte-publication .youtube { border-top: 1px solid #e5e7eb; margin-top: 1rem; padding-top: 0.5rem; }
.carte-publication .youtube pre { white-space: pre-wrap; }
```

- [ ] **Step 7: Vérifier**

Run: `npm test` puis `npm run typecheck`
Expected: tous les tests passent ; aucune erreur de type.

Puis lancer `npm run validation`, ouvrir l'écran de publication d'un tournage rendu dans Chrome : sur une vidéo « Prête », le panneau YouTube apparaît ; « Préparer pour YouTube » affiche le dossier, les boutons de copie et les réglages ; pour une vidéo Interne, seule « Privée » est proposée ; « Programmée » fait apparaître le champ date. Une vidéo « À préparer » n'a pas de panneau.

- [ ] **Step 8: Commit**

```bash
git add studio/src
git commit -m "Studio : panneau YouTube — dossier à téléverser, champs à copier, URL collée, visibilité vérifiée

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Notice YouTube Studio et documentation du studio

**Files:**
- Create: `docs/youtube-studio.md`
- Modify: `docs/studio.md`

- [ ] **Step 1: Vérifier les libellés actuels de YouTube Studio**

Avant d'écrire, contrôler sur l'aide officielle en français (support.google.com/youtube, `hl=fr`) les libellés suivants et corriger le texte du Step 2 s'ils diffèrent : bouton « Créer » → « Importer des vidéos » ; étapes « Détails », « Éléments vidéo », « Vérifications », « Visibilité » ; champs « Titre (obligatoire) », « Description », « Miniature » / « Importer un fichier », « Playlists », « Audience » et « Non, elle n’est pas conçue pour les enfants », « Afficher plus », « Tags », « Langue et certification des sous-titres » / « Langue de la vidéo », « Catégorie » ; visibilités « Privée », « Non répertoriée », « Publique », « Programmer » ; « Paramètres » → « Paramètres par défaut de l’importation » ; vérification de la chaîne à `https://www.youtube.com/verify`. Noter dans le message final ce qui a été vérifié et ce qui ne l'a pas été.

- [ ] **Step 2: Écrire la notice**

`docs/youtube-studio.md` :

```markdown
# Mettre une vidéo en ligne avec YouTube Studio

Le studio prépare tout ; le téléversement se fait à la main dans YouTube Studio (https://studio.youtube.com), connecté au compte de la chaîne PMT. Les libellés ci-dessous sont ceux de l’interface en français.

## Une fois pour toutes

1. **Vérifier la chaîne** : ouvrir https://www.youtube.com/verify, choisir un code par SMS et le saisir. Sans cette vérification, la miniature personnalisée est refusée.
2. **Réglages par défaut des mises en ligne** : YouTube Studio → Paramètres → Paramètres par défaut de l’importation.
   - Onglet « Informations générales » : Visibilité « Privée » (on la change vidéo par vidéo).
   - Onglet « Paramètres avancés » : Catégorie « Science et technologie », Langue de la vidéo « Français », et, dans « Audience », « Non, elle n’est pas conçue pour les enfants ».
   - Enregistrer.
3. **Playlists** : rien à créer d’avance. Quand plusieurs vidéos d’un même tournage sont publiées, `reglages-youtube.txt` suggère une playlist au nom du tournage, créée au premier téléversement (étape « Détails » → Playlists → « Nouvelle playlist »).

## À chaque vidéo

1. Dans le studio, écran Publication : la vidéo doit être « Prête ». Cliquer **Préparer pour YouTube**. Le studio écrit `donnees/tournages/<tournage>/publication/<complete|episode-NN>/` (vignette, titre, description, tags, réglages) et affiche le chemin du MP4 dans `rendus/`. **Ouvrir le dossier** l’affiche dans l’Explorateur.
2. YouTube Studio → **Créer** → **Importer des vidéos** → sélectionner le MP4 indiqué.
3. Étape **Détails** :
   - Titre : bouton « Copier le titre » du studio, puis coller.
   - Description : « Copier la description » (chapitres compris), puis coller.
   - Miniature : « Importer un fichier » → `vignette.jpg` du dossier.
   - Playlists : celle indiquée dans `reglages-youtube.txt`, s’il y en a une.
   - Audience : « Non, elle n’est pas conçue pour les enfants » (déjà coché par les réglages par défaut).
   - « Afficher plus » → Tags : « Copier les tags », puis coller (les virgules séparent les tags) ; vérifier la langue et la catégorie.
4. Étape **Éléments vidéo** : rien à ajouter (le carton de fin est déjà dans la vidéo).
5. Étape **Vérifications** : attendre la fin du contrôle des droits d’auteur ; en cas de signalement, ne pas publier et revoir la musique ou les images.
6. Étape **Visibilité** : selon le profil (voir ci-dessous), puis « Enregistrer » ou « Programmer ».
7. Copier le lien de la vidéo (affiché pendant le téléversement, ou « Partager » sur la vidéo) et le coller dans le studio, champ **URL de la vidéo sur YouTube**. Choisir la visibilité retenue (et la date si elle est programmée), puis **Enregistrer l’envoi**. La vidéo passe à « Envoyée sur YouTube » et le studio vérifie aussitôt ce que voit un visiteur sans compte.

## Parcours par profil

- **Interne** : Visibilité **Privée**, jamais « Non répertoriée » (un lien non répertorié est lisible par quiconque l’obtient). Le studio alerte si la vidéo est lisible publiquement. Elle sera ensuite relayée sur le site, fichier compris (plan suivant).
- **Perso** : **Publique**, ou **Programmer** avec la date et l’heure voulues. Rien n’est relayé sur le site.
- **Mixte** : **Publique** ou **Programmer**. Le relais sur le site n’est possible qu’une fois la vidéo lisible publiquement ; pour une vidéo programmée, attendre l’heure de mise en ligne puis cliquer « Vérifier la visibilité ».

## Cas courants

- **Modifier le titre, la description ou les tags d’une vidéo en ligne** : corriger dans le studio (la vidéo reste « Envoyée sur YouTube »), « Préparer pour YouTube » de nouveau, puis YouTube Studio → Contenu → la vidéo → Détails : recoller les champs et « Enregistrer ».
- **Remplacer la vignette** : rendre la nouvelle vignette dans le studio, valider de nouveau, « Préparer pour YouTube », puis dans Détails → Miniature → « Importer un fichier » → `vignette.jpg`, et « Enregistrer ».
- **Rattraper une erreur de visibilité** : YouTube Studio → Contenu → colonne Visibilité de la vidéo → choisir la bonne, « Enregistrer ». Dans le studio, recoller l’URL avec la visibilité corrigée (« Enregistrer l’envoi »), puis « Vérifier la visibilité ». Une vidéo Interne passée publique par erreur doit repasser en Privée immédiatement.
- **Mauvaise URL collée** : recoller la bonne et « Enregistrer l’envoi » ; l’ancienne est remplacée.
```

- [ ] **Step 3: Compléter `docs/studio.md`**

Dans la section « Publication », remplacer la dernière phrase (« Tout est enregistré dans `publication.json` du tournage. ») par :

```markdown
- **YouTube** (vidéo « Prête ») : « Préparer pour YouTube » écrit dans `publication/<complete|episode-NN>/` la vignette, le titre, la description, les tags et les réglages à choisir, après les contrôles avant envoi (rendu présent, vignette de 2 Mo au plus, limites de YouTube, mentions interdites). Les boutons « Copier » mettent chaque champ dans le presse-papiers, « Ouvrir le dossier » l’affiche dans l’Explorateur. Une fois la vidéo téléversée, coller son URL, indiquer la visibilité (Privée pour Interne ; Publique ou Programmée pour Perso et Mixte) et « Enregistrer l’envoi » : la vidéo passe à « Envoyée sur YouTube ». « Vérifier la visibilité » interroge l’adresse publique oEmbed de YouTube, sans compte Google, et alerte si une vidéo Interne est lisible publiquement ou si une vidéo publique ne l’est pas encore. Pas à pas dans YouTube Studio : [youtube-studio.md](youtube-studio.md).

Tout est enregistré dans `publication.json` du tournage.
```

- [ ] **Step 4: Relire et commit**

Vérifier qu'aucun nom d'organisation n'apparaît : `git grep -n -i -E "ing[eé]rop|cicad" -- docs/youtube-studio.md docs/studio.md` → aucune ligne.

```bash
git add docs/youtube-studio.md docs/studio.md
git commit -m "Documentation : notice YouTube Studio pas à pas et panneau YouTube du studio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Essai réel guidé (avec l'auteur)

Cette tâche demande l'auteur : elle ne s'automatise pas.

- [ ] **Step 1: Préparer** — sur un tournage rendu, valider une vidéo de test en profil **Interne**, puis « Préparer pour YouTube » : vérifier le contenu du dossier et « Ouvrir le dossier ».
- [ ] **Step 2: Téléverser** — l'auteur suit `docs/youtube-studio.md` et téléverse la vidéo en **Privée** ; noter tout libellé de YouTube Studio qui diffère de la notice et corriger la notice.
- [ ] **Step 3: Coller l'URL** — « Enregistrer l’envoi » avec Privée : statut « Envoyée sur YouTube », message « Vidéo privée : elle n’est pas lisible publiquement. »
- [ ] **Step 4: Contrôle inverse** — passer la vidéo en « Non répertoriée » dans YouTube Studio, « Vérifier la visibilité » : l'alerte Interne doit apparaître. Repasser en Privée, vérifier de nouveau : plus d'alerte. Supprimer ensuite la vidéo de test si l'auteur le souhaite.
- [ ] **Step 5: Commit des corrections éventuelles de la notice**

```bash
git add docs/youtube-studio.md
git commit -m "Documentation : libellés de YouTube Studio vérifiés lors de l’essai réel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
