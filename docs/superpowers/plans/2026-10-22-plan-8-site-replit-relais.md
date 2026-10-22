# Plan 8 — Site Replit et relais : plan de mise en œuvre

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le site Replit accepte une clé d'API machine, des vidéos réservées aux comptes autorisés et des fichiers hébergés dans son stockage ; le studio relaie sur ce site une vidéo Interne (fichier MP4 et vignette) ou Mixte (vidéo YouTube intégrée et vignette) d'un clic, et enregistre l'identifiant renvoyé pour les mises à jour suivantes.

**Architecture:** Le site est modifié par l'agent Replit (Task 1), d'après un cahier des charges recopié ci-dessous, puis vérifié en lisant son code et en appelant son API. Côté app, les règles sont des fonctions pures d'un nouveau module du noyau (`noyau/relais.ts`) : contrôles avant relais, corps envoyé au site, passage à `relayee`. Les appels au site (demande d'URL d'envoi, envoi du fichier, création ou mise à jour de la vidéo) vivent dans `studio/serveur/site-replit.ts`, derrière une interface `ClientSite` injectée dans `creerApiPublication` (simulée dans les tests). Le studio gagne un panneau « Site » dans la carte d'une vidéo Interne ou Mixte prête.

**Tech Stack:** Node 22, TypeScript 5 (`strict`, `noUncheckedIndexedAccess`), Vitest 3, React 19.3.0, Vite 7.3.7. Site : Express 5, Drizzle, OpenAPI + Orval, Object Storage de Replit (géré par l'agent Replit).

Spec de référence : `docs/superpowers/specs/2026-10-20-publication-design.md` (sections Plan 8, Contrôles avant envoi, Gestion des erreurs, Tests).

## Global Constraints

- La chaîne s'appelle **« PMT »** (projet personnel). Aucune mention d'organisation dans le code, les textes affichés ou la documentation de ce dépôt (seule exception existante : `publication.mentionsInterdites` de `reglages.json`). Le site Replit, lui, peut en mentionner.
- Texte visible et noms de domaine en français ; clés JSON du dépôt en camelCase ; apostrophe typographique `’` dans les textes affichés et les messages d'erreur. Le contrat du site garde ses noms anglais (`title`, `videoObject`, `visibility`…).
- Site publié : `https://internal-assets.replit.app` (app Replit « Internal Assets », replId `a9c0e477-1b18-4dcf-a216-28cebf28c819`). Page d'une vidéo : `/video/<id>`.
- `.env` du dépôt : `REPLIT_SITE_URL` (adresse du site) et `REPLIT_API_KEY` (clé). Secrets du site : `AUTOMATION_API_KEY` (même clé) et `ALLOWED_EMAIL_DOMAINS` (domaines autorisés, fournis par l'auteur, jamais écrits dans ce dépôt). La clé n'est jamais affichée, ni envoyée ailleurs qu'au site (en-tête `X-Api-Key`), ni écrite dans un prompt.
- Contrat du site utilisé par l'app :
  - `POST /api/uploads` `{ contentType }` → 200 `{ uploadUrl, objectId }` ; l'app envoie ensuite le fichier par `PUT uploadUrl` (en-têtes `Content-Type` et `Content-Length`, sans la clé).
  - `POST /api/videos` → 201 `Video` ; `PATCH /api/videos/:id` → 200 `Video` (404 si la vidéo n'existe plus).
  - Corps envoyé : `title`, `description` (sans horodatages), `tags`, `categoryId`, `playlistId`, `durationSeconds`, `format: "long"`, `status: "published"`, `visibility` (`"interne"` ou `"public"`), `thumbnailObject`, et soit `videoObject` (Interne), soit `videoUrl` = `https://www.youtube.com/watch?v=<id>` (Mixte).
- Relais : Interne si la vidéo est cochée et `prete`, `envoyee-youtube` ou `relayee` ; Mixte si elle est `envoyee-youtube` ou `relayee`, a un identifiant YouTube et est lisible publiquement par oEmbed au moment du relais (une vidéo programmée attend son heure). Perso : jamais. La catégorie du site est obligatoire, la playlist facultative. Les contrôles avant envoi du plan 7 s'appliquent (rendu présent, vignette ≤ 2 Mo, limites, mentions interdites hors Interne).
- Un relais réussi passe la vidéo à `relayee` et enregistre `replit.id` ; un nouveau relais met à jour la vidéo (`PATCH`) et renvoie le fichier d'une vidéo Interne. Un échec garde le statut, écrit `erreur: { etape: 'replit', … }` et répond 502 : « le relais reste à faire, rien n’est perdu ».
- Aucun appel réel à YouTube ni au site Replit dans les tests automatiques.
- Le chemin du projet contient « & » : ne jamais utiliser `npx` ; passer par les scripts npm (`npm test -- <fichier>`, `npm run typecheck`).
- Chaque commit se termine par la ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Structure des fichiers

```
(site Replit, hors dépôt)            clé d'API, visibilité interne, stockage, route media, lecteur HTML5
noyau/
  relais.ts (+ test)                 NOUVEAU : contrôles avant relais, lecture oEmbed, corps envoyé au site, passage à relayée
studio/
  commun.ts                          DetailPublication + urlSite
  serveur/site-replit.ts (+ test)    + ClientSite : envoi d'un fichier dans le stockage, création ou mise à jour d'une vidéo
  serveur/publication.ts             route publication/relais, ConfigPublication + site
  serveur/publication.test.ts        tests du relais (site simulé)
  serveur/principal.ts               branche le client du site (.env)
  src/api.ts                         + relayer
  src/logique/publication.ts (+ test) + EXPLICATIONS_RELAIS
  src/composants/PanneauSite.tsx     NOUVEAU
  src/composants/CartePublication.tsx affiche le panneau pour une vidéo Interne ou Mixte prête
  src/styles.css                     style du panneau
docs/
  studio.md                          section Publication : relais sur le site, variables de .env
```

---

### Task 1: Modifications du site Replit

Faites par l'agent Replit, en arrière-plan : les Tasks 2 à 5 n'en dépendent pas (site simulé dans les tests) et peuvent avancer pendant ce temps.

**Files:** aucun dans ce dépôt, hormis `.env` (ignoré par git).

**Interfaces:**
- Produces : le contrat du site décrit dans les Global Constraints, publié sur `https://internal-assets.replit.app`.

- [ ] **Step 1: Générer la clé et compléter `.env` sans l'afficher**

```bash
cd "/c/Users/pmaubert/dev/La chaine M&T"
grep -q '^REPLIT_SITE_URL=' .env || echo 'REPLIT_SITE_URL=https://internal-assets.replit.app' >> .env
grep -q '^REPLIT_API_KEY=' .env || echo "REPLIT_API_KEY=$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))")" >> .env
grep -c '^REPLIT_' .env
```

Expected: `2`.

- [ ] **Step 2: Demander à l'auteur de renseigner les secrets du site**

Message à l'auteur (il agit dans Replit, onglet Secrets de « Internal Assets ») :
- `AUTOMATION_API_KEY` = la valeur de `REPLIT_API_KEY` dans `.env` (copier-coller depuis le fichier) ;
- `ALLOWED_EMAIL_DOMAINS` = la liste des domaines e-mail autorisés, séparés par des virgules ;
- vérifier que ces secrets sont aussi présents dans les secrets du déploiement.

Ne pas attendre sa réponse pour lancer le Step 3 ; elle est nécessaire avant le Step 5.

- [ ] **Step 3: Confier les modifications à l'agent Replit**

Appeler `mcp__replit__update_app_using_prompt` avec `replId` `a9c0e477-1b18-4dcf-a216-28cebf28c819` et ce `changeDescription` (recopié tel quel) :

```
Le studio vidéo de l'auteur va publier automatiquement des vidéos sur ce site. Quatre évolutions, en commençant par mettre à jour lib/api-spec/openapi.yaml puis en régénérant le code (règle du projet).

1. Clé d'API machine. Nouveau secret AUTOMATION_API_KEY (déjà créé par l'auteur). Une requête qui porte l'en-tête X-Api-Key égal à ce secret a les droits d'un administrateur, partout où requireAdmin s'applique et pour toutes les règles de visibilité ci-dessous. Comparaison en temps constant (crypto.timingSafeEqual, après contrôle de longueur). Une clé absente ou fausse sur une route d'écriture renvoie 401 comme aujourd'hui. Si le secret est vide, aucune clé n'est acceptée.

2. Visibilité. Nouveau champ vidéo visibility: "public" | "interne", par défaut "public" (colonne en base, VideoInput, VideoUpdate et Video). Une vidéo "interne" n'apparaît, pour un visiteur non autorisé, ni dans les listes (/videos, /videos/recent, /videos/popular, /videos/featured), ni dans la recherche, ni dans les playlists (liste des vidéos et videoCount), ni dans les statistiques. Est autorisé : un administrateur, la clé d'API, ou un compte connecté dont le domaine de l'e-mail figure dans le nouveau secret ALLOWED_EMAIL_DOMAINS (liste séparée par des virgules, comparaison insensible à la casse, domaine exact après le @). GET /videos/:id d'une vidéo interne renvoie 401 { error, loginRequired: true } à un visiteur non connecté, et 404 à un compte connecté non autorisé ; la page vidéo affiche alors « Cette vidéo est réservée aux comptes autorisés » avec un bouton « Se connecter » (401) ou la page introuvable (404). Le formulaire d'administration propose la visibilité.

3. Stockage. Utiliser l'Object Storage de Replit. Nouvelle route POST /api/uploads (clé ou administrateur), corps { contentType } limité à video/mp4, image/jpeg, image/png (400 sinon), qui renvoie 200 { uploadUrl, objectId } : uploadUrl est une URL d'envoi signée valable 15 minutes, à utiliser par PUT avec ce Content-Type ; objectId est un identifiant opaque (sans barre oblique). VideoInput et VideoUpdate acceptent videoObject et thumbnailObject (objectId) en plus de videoUrl et thumbnailUrl. À la création, il faut exactement l'un de videoUrl ou videoObject (400 sinon) ; videoUrl n'est donc plus obligatoire dans VideoInput. Quand une mise à jour remplace videoObject ou thumbnailObject, l'ancien objet est supprimé du stockage. Un objectId inconnu du stockage est refusé (400).

4. Lecture. Nouvelle route GET /api/media/:objectId qui sert l'objet en flux, avec son Content-Type, en gérant les requêtes par plage (Range → 206, Accept-Ranges: bytes). Elle retrouve la vidéo qui référence cet objet (videoObject ou thumbnailObject) et applique les mêmes droits que GET /videos/:id (statut publié sauf administrateur ou clé, règle de visibilité) ; 404 si aucune vidéo ne le référence. Dans les réponses Video, une vidéo qui a un videoObject a videoUrl = "/api/media/<objectId>", et une vignette stockée donne thumbnailUrl = "/api/media/<objectId>" ; aucune URL de stockage permanente n'est exposée. Ajouter hostedVideo: boolean à Video. La page vidéo lit une vidéo hébergée dans un lecteur HTML5 (<video controls preload="metadata">) au lieu de l'iframe YouTube/Vimeo.

Mettre à jour replit.md. Ne pas modifier les données existantes autrement que par la valeur par défaut "public".
```

Expected : la réponse indique que la mise à jour a démarré. Prévenir l'auteur avec le lien du Repl.

- [ ] **Step 4: Vérifier le code du site une fois l'agent Replit terminé**

Lire avec `mcp__replit__read_app_file` : `lib/api-spec/openapi.yaml`, `artifacts/api-server/src/middlewares/requireAdmin.ts`, `artifacts/api-server/src/routes/videos.ts`, la nouvelle route d'envoi et la route media (les trouver avec `mcp__replit__list_app_files` sur `artifacts/api-server/src/routes`). Cocher :
- `X-Api-Key` comparée avec `timingSafeEqual`, refusée si le secret est vide ;
- `visibility` filtrée dans `/videos`, `/videos/recent`, `/videos/popular`, `/videos/featured`, `/search`, `/playlists` (vidéos et `videoCount`), `/stats` ;
- `ALLOWED_EMAIL_DOMAINS` comparé au domaine exact (pas un `endsWith` qui laisserait passer `x-domaine.com`) ;
- `POST /api/uploads` protégée, `contentType` limité, réponse `{ uploadUrl, objectId }` ;
- `/api/media/:objectId` revérifie les droits de la vidéo et gère `Range` ;
- `videoUrl` facultatif à la création, exactement un de `videoUrl`/`videoObject`.

Tout écart : le décrire précisément dans un nouvel appel à `update_app_using_prompt`, puis relire.

- [ ] **Step 5: Publier et vérifier l'API**

Une fois les secrets renseignés (Step 2), appeler `mcp__replit__publish_app`, puis `mcp__replit__get_publish_status` toutes les 30 s jusqu'à `success`. Ensuite :

```bash
cd "/c/Users/pmaubert/dev/La chaine M&T"
set -a; . ./.env; set +a
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$REPLIT_SITE_URL/api/videos" -H 'Content-Type: application/json' -d '{}'
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$REPLIT_SITE_URL/api/uploads" -H 'Content-Type: application/json' -H 'X-Api-Key: mauvaise' -d '{"contentType":"image/jpeg"}'
curl -s -X POST "$REPLIT_SITE_URL/api/uploads" -H 'Content-Type: application/json' -H "X-Api-Key: $REPLIT_API_KEY" -d '{"contentType":"image/jpeg"}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(typeof j.uploadUrl,typeof j.objectId)})"
curl -s "$REPLIT_SITE_URL/api/videos?limit=1" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.length?('visibility' in j[0])+' '+('hostedVideo' in j[0]):'liste vide')})"
```

Expected : `401`, `401`, `string string`, `true true` (ou `liste vide`).

---

### Task 2: Règles du relais dans le noyau

**Files:**
- Create: `noyau/relais.ts`, `noyau/relais.test.ts`

**Interfaces:**
- Consumes : `VideoPubliee`, `ReglagesPublication` (`noyau/publication.ts`) ; `problemesEnvoi(v, descriptionFinale, r, etat: { rendu: { fichier: string; present: boolean }; octetsVignette: number | null }): string[]`, `bilanLecture(v, lecture, maintenant): { alerte: boolean; message: string }`, `LectureYoutube` (`noyau/youtube.ts`).
- Produces (exports de `noyau/relais.ts`) :
  - types `FichierVideoSite` (= `{ videoUrl: string } | { videoObject: string }`), `CorpsVideoSite`, `EtatRelais` (= état de `problemesEnvoi` + `siteConfigure: boolean`)
  - `urlYoutube(id: string): string`
  - `problemesRelais(v: VideoPubliee, descriptionFinale: string, r: ReglagesPublication, etat: EtatRelais): string[]`
  - `raisonLectureRelais(v: VideoPubliee, lecture: LectureYoutube, maintenant: Date): string | null`
  - `corpsRelais(v: VideoPubliee, o: { dureeSecondes: number; fichier: FichierVideoSite; thumbnailObject: string }): CorpsVideoSite`
  - `enregistrerRelais(v: VideoPubliee, id: number): Partial<VideoPubliee>`

- [ ] **Step 1: Écrire les tests**

`noyau/relais.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import reglagesJson from '../reglages.json';
import { videoParDefaut, type VideoPubliee } from './publication';
import { corpsRelais, enregistrerRelais, problemesRelais, raisonLectureRelais, urlYoutube } from './relais';
import type { Reglages } from './types';

const R = (reglagesJson as Reglages).publication;
const ID = 'dQw4w9WgXcQ';
const video = (changement: Partial<VideoPubliee> = {}): VideoPubliee => ({
  ...videoParDefaut('complete', 'interne'),
  statut: 'prete',
  titre: ' Le SSO expliqué ',
  description: 'Desc',
  tags: ['sso'],
  vignette: { pose: { source: 'banque', fichier: 'a.jpg' }, fond: { source: 'charte' }, accroche: 'Un seul mot', fichier: 'rendus/vignettes/complete.jpg' },
  replit: { id: null, categorieId: 3, playlistId: 7 },
  ...changement,
});
const mixteEnvoyee = (youtube: Partial<VideoPubliee['youtube']> = {}) => video({
  profil: 'mixte', statut: 'envoyee-youtube', youtube: { id: ID, visibilite: 'publique', programmeeLe: null, playlistId: null, ...youtube },
});
const ETAT = { rendu: { fichier: 'video-complete.mp4', present: true }, octetsVignette: 1000, siteConfigure: true };

describe('problemesRelais', () => {
  it('accepte une vidéo Interne prête, envoyée ou déjà relayée', () => {
    for (const statut of ['prete', 'envoyee-youtube', 'relayee'] as const) expect(problemesRelais(video({ statut }), 'Desc', R, ETAT)).toEqual([]);
  });
  it('n’accepte une vidéo Mixte qu’une fois l’envoi YouTube enregistré', () => {
    expect(problemesRelais(video({ profil: 'mixte' }), 'Desc', R, ETAT))
      .toEqual(['Enregistrez d’abord l’envoi sur YouTube : une vidéo Mixte est relayée une fois en ligne.']);
    expect(problemesRelais(mixteEnvoyee(), 'Desc', R, ETAT)).toEqual([]);
  });
  it('refuse une vidéo Perso', () => {
    expect(problemesRelais(video({ profil: 'perso' }), 'Desc', R, ETAT)).toEqual(['Une vidéo Perso n’est pas relayée sur le site.']);
  });
  it('reprend les contrôles avant envoi, exige la catégorie et un site configuré', () => {
    expect(problemesRelais(video({ statut: 'a-preparer', replit: { id: null, categorieId: null, playlistId: null } }), 'Desc', R, {
      rendu: { fichier: 'video-complete.mp4', present: false }, octetsVignette: 1000, siteConfigure: false,
    })).toEqual([
      'Vidéo pas encore validée pour la publication.',
      'Rendu absent : video-complete.mp4.',
      'Choisissez la catégorie du site.',
      'Site non configuré : renseignez REPLIT_SITE_URL et REPLIT_API_KEY dans .env, puis relancez le studio.',
    ]);
  });
  it('refuse une mention interdite pour une vidéo Mixte, pas pour une vidéo Interne', () => {
    const mention = R.mentionsInterdites[0]!;
    expect(problemesRelais(mixteEnvoyee(), `Desc ${mention}`, R, ETAT)).toEqual([`Mention interdite pour une vidéo publique : « ${mention} ».`]);
    expect(problemesRelais(video(), `Desc ${mention}`, R, ETAT)).toEqual([]);
  });
});

describe('raisonLectureRelais', () => {
  const maintenant = new Date('2026-10-20T12:00:00Z');
  it('laisse passer une vidéo lisible publiquement', () => {
    expect(raisonLectureRelais(mixteEnvoyee(), 'publique', maintenant)).toBeNull();
  });
  it('fait attendre une vidéo programmée et explique les autres cas', () => {
    expect(raisonLectureRelais(mixteEnvoyee({ visibilite: 'programmee', programmeeLe: '2026-10-21T16:00:00.000Z' }), 'non-publique', maintenant))
      .toContain('pas encore en ligne');
    expect(raisonLectureRelais(mixteEnvoyee(), 'non-publique', maintenant))
      .toBe('Vidéo pas encore lisible publiquement : passez-la en public dans YouTube Studio, ou attendez l’heure programmée.');
    expect(raisonLectureRelais(mixteEnvoyee(), 'inconnue', maintenant)).toBe('Vérification impossible : YouTube ne répond pas, réessayez plus tard.');
  });
});

describe('corpsRelais', () => {
  it('envoie le fichier d’une vidéo Interne, réservée aux comptes autorisés', () => {
    expect(corpsRelais(video(), { dureeSecondes: 312.6, fichier: { videoObject: 'objet-video' }, thumbnailObject: 'objet-vignette' })).toEqual({
      title: 'Le SSO expliqué', description: 'Desc', tags: ['sso'], categoryId: 3, playlistId: 7, durationSeconds: 313,
      format: 'long', status: 'published', visibility: 'interne', videoObject: 'objet-video', thumbnailObject: 'objet-vignette',
    });
  });
  it('intègre la vidéo YouTube d’une vidéo Mixte, visible de tous', () => {
    const corps = corpsRelais(mixteEnvoyee(), { dureeSecondes: 60, fichier: { videoUrl: urlYoutube(ID) }, thumbnailObject: 'v' });
    expect(corps).toMatchObject({ visibility: 'public', videoUrl: `https://www.youtube.com/watch?v=${ID}`, thumbnailObject: 'v' });
    expect(corps).not.toHaveProperty('videoObject');
  });
  it('refuse une vidéo sans catégorie', () => {
    expect(() => corpsRelais(video({ replit: { id: null, categorieId: null, playlistId: null } }),
      { dureeSecondes: 1, fichier: { videoObject: 'o' }, thumbnailObject: 'v' })).toThrow('Catégorie du site manquante.');
  });
});

describe('enregistrerRelais', () => {
  it('passe la vidéo à relayée et garde l’identifiant du site', () => {
    expect(enregistrerRelais(video({ statut: 'envoyee-youtube' }), 42)).toEqual({
      statut: 'relayee', replit: { id: 42, categorieId: 3, playlistId: 7 }, erreur: null,
    });
  });
});
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `npm test -- noyau/relais.test.ts`
Expected: FAIL (module `./relais` introuvable).

- [ ] **Step 3: Écrire le module**

`noyau/relais.ts` :

```ts
import type { ReglagesPublication, VideoPubliee } from './publication';
import { bilanLecture, problemesEnvoi, type LectureYoutube } from './youtube';

// Vidéo sur le site : fichier hébergé dans son stockage (Interne) ou vidéo YouTube intégrée (Mixte).
export type FichierVideoSite = { videoUrl: string } | { videoObject: string };

// Corps de POST /api/videos et PATCH /api/videos/:id du site (noms de son API).
export type CorpsVideoSite = {
  title: string;
  description: string;
  tags: string[];
  categoryId: number;
  playlistId: number | null;
  durationSeconds: number;
  format: 'long';
  status: 'published';
  visibility: 'public' | 'interne';
  thumbnailObject: string;
} & FichierVideoSite;

export type EtatRelais = Parameters<typeof problemesEnvoi>[3] & { siteConfigure: boolean };

const STATUTS_MIXTE: VideoPubliee['statut'][] = ['envoyee-youtube', 'relayee'];

export const urlYoutube = (id: string) => `https://www.youtube.com/watch?v=${id}`;

export function problemesRelais(v: VideoPubliee, descriptionFinale: string, r: ReglagesPublication, etat: EtatRelais): string[] {
  if (v.profil === 'perso') return ['Une vidéo Perso n’est pas relayée sur le site.'];
  const problemes = problemesEnvoi(v, descriptionFinale, r, etat);
  if (v.profil === 'mixte' && (!STATUTS_MIXTE.includes(v.statut) || !v.youtube.id)) {
    problemes.push('Enregistrez d’abord l’envoi sur YouTube : une vidéo Mixte est relayée une fois en ligne.');
  }
  if (v.replit.categorieId === null) problemes.push('Choisissez la catégorie du site.');
  if (!etat.siteConfigure) problemes.push('Site non configuré : renseignez REPLIT_SITE_URL et REPLIT_API_KEY dans .env, puis relancez le studio.');
  return problemes;
}

// Une vidéo Mixte n’est relayée que lisible publiquement, vérifié par oEmbed au moment du relais.
export const raisonLectureRelais = (v: VideoPubliee, lecture: LectureYoutube, maintenant: Date): string | null =>
  (lecture === 'publique' ? null : bilanLecture(v, lecture, maintenant).message);

export function corpsRelais(
  v: VideoPubliee, o: { dureeSecondes: number; fichier: FichierVideoSite; thumbnailObject: string },
): CorpsVideoSite {
  if (v.replit.categorieId === null) throw new Error('Catégorie du site manquante.');
  return {
    title: v.titre.trim(),
    // Sans les chapitres horodatés : ils ne servent qu’à YouTube.
    description: v.description.trim(),
    tags: v.tags,
    categoryId: v.replit.categorieId,
    playlistId: v.replit.playlistId,
    durationSeconds: Math.round(o.dureeSecondes),
    format: 'long',
    status: 'published',
    visibility: v.profil === 'interne' ? 'interne' : 'public',
    ...o.fichier,
    thumbnailObject: o.thumbnailObject,
  };
}

export const enregistrerRelais = (v: VideoPubliee, id: number): Partial<VideoPubliee> =>
  ({ statut: 'relayee', replit: { ...v.replit, id }, erreur: null });
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npm test -- noyau/relais.test.ts` puis `npm run typecheck`
Expected: PASS ; aucune erreur de type.

- [ ] **Step 5: Commit**

```bash
git add noyau/relais.ts noyau/relais.test.ts
git commit -m "Publication : règles du relais sur le site — contrôles par profil, lecture oEmbed pour Mixte, corps envoyé, passage à relayée

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Client du site (stockage et vidéos)

**Files:**
- Modify: `studio/serveur/site-replit.ts`, `studio/serveur/site-replit.test.ts`

**Interfaces:**
- Consumes : `CorpsVideoSite` (Task 2).
- Produces (exports ajoutés à `studio/serveur/site-replit.ts`) :
  - `interface ClientSite { envoyerFichier(chemin: string, typeContenu: string): Promise<string>; enregistrerVideo(id: number | null, corps: CorpsVideoSite): Promise<number> }` — `envoyerFichier` renvoie l'`objectId` ; `enregistrerVideo` renvoie l'identifiant de la vidéo sur le site.
  - `creerClientSite(urlSite: string | undefined, cle: string | undefined, recuperer?: typeof fetch): ClientSite | null` — `null` si l'adresse ou la clé manque. Les erreurs sont des `Error` au message français, terminé par « le relais reste à faire, rien n’est perdu ».

- [ ] **Step 1: Écrire les tests**

Dans `studio/serveur/site-replit.test.ts`, remplacer les imports par :

```ts
import { mkdtemp, writeFile } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CorpsVideoSite } from '../../noyau/relais';
import { creerClientSite, lireReferencesSite } from './site-replit';
```

et ajouter à la fin du fichier :

```ts
// Site simulé par un vrai serveur local : l’envoi du fichier passe par un flux, qu’un faux fetch ne vérifierait pas.
interface Requete { methode: string; chemin: string; entetes: http.IncomingHttpHeaders; corps: Buffer }
const CORPS: CorpsVideoSite = {
  title: 'Titre', description: 'Desc', tags: [], categoryId: 1, playlistId: null, durationSeconds: 60,
  format: 'long', status: 'published', visibility: 'interne', videoObject: 'abc', thumbnailObject: 'def',
};

describe('creerClientSite', () => {
  let serveur: http.Server;
  let base: string;
  let requetes: Requete[];
  let reponse: (r: Requete) => [number, unknown];
  const parDefaut = (r: Requete): [number, unknown] => {
    if (r.chemin === '/api/uploads') return [200, { uploadUrl: `${base}/stockage/abc?signature=x`, objectId: 'abc' }];
    if (r.chemin.startsWith('/stockage/')) return [200, {}];
    if (r.methode === 'POST' && r.chemin === '/api/videos') return [201, { id: 42 }];
    if (r.methode === 'PATCH' && r.chemin === '/api/videos/42') return [200, { id: 42 }];
    return [404, { error: 'Not found' }];
  };
  const site = () => creerClientSite(`${base}/`, 'cle-secrete')!;

  beforeEach(async () => {
    requetes = [];
    reponse = parDefaut;
    serveur = http.createServer(async (req, res) => {
      const morceaux: Buffer[] = [];
      for await (const m of req) morceaux.push(m as Buffer);
      const r = { methode: req.method ?? '', chemin: req.url ?? '', entetes: req.headers, corps: Buffer.concat(morceaux) };
      requetes.push(r);
      const [statut, corps] = reponse(r);
      res.writeHead(statut, { 'Content-Type': 'application/json' }).end(JSON.stringify(corps));
    });
    await new Promise<void>(r => serveur.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    await new Promise<void>(r => serveur.close(() => r()));
  });

  it('n’existe pas sans adresse ou sans clé', () => {
    expect(creerClientSite(undefined, 'cle')).toBeNull();
    expect(creerClientSite('https://site.example', '')).toBeNull();
  });
  it('demande une URL d’envoi avec la clé, puis y envoie le fichier sans la clé', async () => {
    const fichier = path.join(await mkdtemp(path.join(os.tmpdir(), 'pmt-site-')), 'video.mp4');
    await writeFile(fichier, 'contenu');
    expect(await site().envoyerFichier(fichier, 'video/mp4')).toBe('abc');
    const [demande, envoi] = requetes;
    expect(demande).toMatchObject({ methode: 'POST', chemin: '/api/uploads' });
    expect(demande!.entetes['x-api-key']).toBe('cle-secrete');
    expect(JSON.parse(demande!.corps.toString())).toEqual({ contentType: 'video/mp4' });
    expect(envoi).toMatchObject({ methode: 'PUT', chemin: '/stockage/abc?signature=x' });
    expect(envoi!.entetes['content-type']).toBe('video/mp4');
    expect(envoi!.entetes['content-length']).toBe('7');
    expect(envoi!.entetes['x-api-key']).toBeUndefined();
    expect(envoi!.corps.toString()).toBe('contenu');
  });
  it('crée la vidéo, la met à jour, et la recrée si elle a disparu du site', async () => {
    expect(await site().enregistrerVideo(null, CORPS)).toBe(42);
    expect(requetes[0]).toMatchObject({ methode: 'POST', chemin: '/api/videos' });
    expect(JSON.parse(requetes[0]!.corps.toString())).toEqual(CORPS);
    expect(await site().enregistrerVideo(42, CORPS)).toBe(42);
    expect(requetes[1]).toMatchObject({ methode: 'PATCH', chemin: '/api/videos/42' });
    expect(await site().enregistrerVideo(7, CORPS)).toBe(42);
    expect(requetes.slice(2).map(r => `${r.methode} ${r.chemin}`)).toEqual(['PATCH /api/videos/7', 'POST /api/videos']);
  });
  it('explique une clé refusée, un refus du site ou du stockage, et un site injoignable', async () => {
    reponse = () => [401, { error: 'Authentication required' }];
    await expect(site().enregistrerVideo(null, CORPS)).rejects.toThrow('Clé refusée par le site');
    reponse = r => (r.chemin === '/api/videos' ? [400, { error: 'Invalid body' }] : parDefaut(r));
    await expect(site().enregistrerVideo(null, CORPS)).rejects.toThrow('Vidéo refusée par le site (400 : Invalid body) ; le relais reste à faire, rien n’est perdu.');
    reponse = r => (r.chemin.startsWith('/stockage/') ? [403, {}] : parDefaut(r));
    const fichier = path.join(await mkdtemp(path.join(os.tmpdir(), 'pmt-site-')), 'v.jpg');
    await writeFile(fichier, 'jpg');
    await expect(site().envoyerFichier(fichier, 'image/jpeg')).rejects.toThrow('Fichier refusé par le stockage du site (403)');
    const injoignable = vi.fn(async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
    await expect(creerClientSite(base, 'cle', injoignable)!.enregistrerVideo(null, CORPS)).rejects.toThrow('Site injoignable (ECONNREFUSED)');
  });
});
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `npm test -- studio/serveur/site-replit.test.ts`
Expected: FAIL (`creerClientSite` n'est pas exporté).

- [ ] **Step 3: Écrire le client**

Dans `studio/serveur/site-replit.ts`, ajouter en tête :

```ts
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import type { CorpsVideoSite } from '../../noyau/relais';
```

et à la fin du fichier :

```ts
// Écritures sur le site avec la clé d’API machine (en-tête X-Api-Key) : stockage des fichiers, création ou mise à jour des vidéos.
export interface ClientSite {
  envoyerFichier: (chemin: string, typeContenu: string) => Promise<string>;
  enregistrerVideo: (id: number | null, corps: CorpsVideoSite) => Promise<number>;
}

const RIEN_PERDU = 'le relais reste à faire, rien n’est perdu';
const texteErreur = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function creerClientSite(urlSite: string | undefined, cle: string | undefined, recuperer: typeof fetch = fetch): ClientSite | null {
  if (!urlSite || !cle) return null;
  const base = urlSite.replace(/\/+$/, '');
  const entetes = { 'Content-Type': 'application/json', 'X-Api-Key': cle };

  async function appeler(chemin: string, methode: string, corps: unknown): Promise<{ statut: number; json: Record<string, unknown> }> {
    let reponse: Response;
    try {
      reponse = await recuperer(`${base}${chemin}`, {
        method: methode, headers: entetes, body: JSON.stringify(corps), signal: AbortSignal.timeout(DELAI),
      });
    } catch (e) {
      throw new Error(`Site injoignable (${texteErreur(e)}) : ${RIEN_PERDU}.`);
    }
    if (reponse.status === 401 || reponse.status === 403) {
      throw new Error(`Clé refusée par le site : vérifiez REPLIT_API_KEY dans .env et AUTOMATION_API_KEY sur le site ; ${RIEN_PERDU}.`);
    }
    const json: unknown = await reponse.json().catch(() => ({}));
    return { statut: reponse.status, json: estObjet(json) ? json : {} };
  }
  const refus = (quoi: string, statut: number, json: Record<string, unknown>) =>
    new Error(`${quoi} refusée par le site (${statut}${typeof json.error === 'string' ? ` : ${json.error}` : ''}) ; ${RIEN_PERDU}.`);

  return {
    async envoyerFichier(chemin, typeContenu) {
      const { statut, json } = await appeler('/api/uploads', 'POST', { contentType: typeContenu });
      if (statut !== 200 || typeof json.uploadUrl !== 'string' || typeof json.objectId !== 'string') {
        throw refus('Demande d’envoi', statut, json);
      }
      // Envoi en flux, sans la clé : l’URL signée suffit. Pas de délai : une vidéo peut prendre plusieurs minutes.
      let reponse: Response;
      try {
        reponse = await recuperer(json.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': typeContenu, 'Content-Length': String((await stat(chemin)).size) },
          body: Readable.toWeb(createReadStream(chemin)) as ReadableStream,
          duplex: 'half',
        } as RequestInit);
      } catch (e) {
        throw new Error(`Stockage du site injoignable (${texteErreur(e)}) : ${RIEN_PERDU}.`);
      }
      if (!reponse.ok) throw new Error(`Fichier refusé par le stockage du site (${reponse.status}) ; ${RIEN_PERDU}.`);
      return json.objectId;
    },
    async enregistrerVideo(id, corps) {
      let r = id === null ? null : await appeler(`/api/videos/${id}`, 'PATCH', corps);
      // Vidéo supprimée du site entre-temps : elle est recréée.
      if (r === null || r.statut === 404) r = await appeler('/api/videos', 'POST', corps);
      if ((r.statut !== 200 && r.statut !== 201) || typeof r.json.id !== 'number') throw refus('Vidéo', r.statut, r.json);
      return r.json.id;
    },
  };
}
```

Note : `refus('Demande d’envoi', …)` et `refus('Vidéo', …)` donnent « Demande d’envoi refusée… », « Vidéo refusée… ».

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npm test -- studio/serveur/site-replit.test.ts` puis `npm run typecheck`
Expected: PASS ; aucune erreur de type. Si `content-length` n'arrive pas (fetch passé en envoi par morceaux), remplacer l'envoi du fichier par `http.request`/`https.request` avec `Content-Length` explicite et `pipeline(createReadStream(chemin), requete)`, sans changer le test.

- [ ] **Step 5: Commit**

```bash
git add studio/serveur/site-replit.ts studio/serveur/site-replit.test.ts
git commit -m "Studio : client du site Replit — envoi d’un fichier dans son stockage, création ou mise à jour d’une vidéo avec la clé d’API

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Route de relais du serveur

**Files:**
- Modify: `studio/commun.ts`, `studio/serveur/publication.ts`, `studio/serveur/publication.test.ts`, `studio/serveur/principal.ts`

**Interfaces:**
- Consumes : Task 2 (`problemesRelais`, `raisonLectureRelais`, `corpsRelais`, `enregistrerRelais`, `urlYoutube`) ; Task 3 (`ClientSite`, `creerClientSite`).
- Produces :
  - `ConfigPublication` + `site: ClientSite | null`
  - `DetailPublication` + `urlSite: string | null`
  - route `POST /api/tournages/<nom>/publication/relais` `{ cible }` → `Publication` ; 422 avec `problemes` (contrôles) ou `erreur` (lecture YouTube) ; 409 si un relais est déjà en cours ; 502 si le site échoue (erreur enregistrée dans la vidéo).

- [ ] **Step 1: Écrire les tests des routes**

Dans `studio/serveur/publication.test.ts` :

1. Dans le `beforeEach`, à la fin de l'objet `config` (après `ouvrirDossier`) :

```ts
    site: {
      envoyerFichier: vi.fn(async (chemin: string) => (chemin.endsWith('.mp4') ? 'objet-video' : 'objet-vignette')),
      enregistrerVideo: vi.fn(async () => 42),
    },
```

2. Dans le test « liste les vidéos rendues et une publication par défaut », après `expect(d.site).toEqual(SITE);` :

```ts
    expect(d.urlSite).toBe('https://site.example');
```

3. Sortir `ID`, `prete` et `envoi` du bloc `describe('YouTube', …)` pour les placer juste avant lui, au niveau du fichier, et donner à `prete` un second paramètre. Le début du bloc devient :

```ts
const ID = 'dQw4w9WgXcQ';
// Vidéo complète validée, vignette rendue ; `changement` complète ses champs (catégorie du site…).
async function prete(profil = 'perso', changement: Record<string, unknown> = {}) {
  const dossier = await tournage('a');
  await writeFile(path.join(racine, 'poses', 'surpris.jpg'), 'jpg');
  await writeFile(path.join(racine, 'poses', 'surpris.detoure.png'), 'png');
  const p = await lirePublication('a');
  const vignette = { pose: { source: 'banque', fichier: 'surpris.jpg' }, fond: { source: 'charte' }, accroche: 'Un seul mot de passe', fichier: null };
  await envoyer('a', {
    ...p,
    videos: p.videos.map(v => (v.cible === 'complete'
      ? { ...v, profil, titre: 'Titre', description: 'Desc', tags: ['sso', 'mot de passe'], vignette, ...changement }
      : v)),
  });
  await action('a', 'vignette', { cible: 'complete' });
  expect((await action('a', 'valider', { cible: 'complete' })).status).toBe(200);
  return dossier;
}
const envoi = (corps: Record<string, unknown> = {}) =>
  action('a', 'youtube/envoi', { cible: 'complete', url: `https://youtu.be/${ID}`, visibilite: 'publique', programmeeLe: null, ...corps });

describe('YouTube', () => {
  it('prépare le dossier à téléverser', async () => {
```

(le reste du bloc `YouTube` est inchangé).

4. Ajouter à la fin du fichier :

```ts
describe('relais sur le site', () => {
  const SITE_CHOISI = { replit: { id: null, categorieId: 1, playlistId: null } };
  const relayer = () => action('a', 'relais', { cible: 'complete' });
  const site = () => config.site!;

  it('relaie une vidéo Interne : fichier et vignette dans le stockage, réservée aux comptes autorisés', async () => {
    const dossier = await prete('interne', SITE_CHOISI);
    const r = await relayer();
    expect(r.status).toBe(200);
    expect(((await r.json()) as Publication).videos[0]).toMatchObject({ statut: 'relayee', replit: { id: 42, categorieId: 1 }, erreur: null });
    expect(site().envoyerFichier).toHaveBeenCalledWith(path.join(dossier, 'rendus', 'vignettes', 'complete.jpg'), 'image/jpeg');
    expect(site().envoyerFichier).toHaveBeenCalledWith(path.join(dossier, 'rendus', 'video-complete.mp4'), 'video/mp4');
    expect(site().enregistrerVideo).toHaveBeenCalledWith(null, expect.objectContaining({
      title: 'Titre', description: 'Desc', tags: ['sso', 'mot de passe'], categoryId: 1, playlistId: null, format: 'long', status: 'published',
      visibility: 'interne', videoObject: 'objet-video', thumbnailObject: 'objet-vignette', durationSeconds: expect.any(Number),
    }));
    expect(config.lireVisibiliteYoutube).not.toHaveBeenCalled();
    const enregistree = JSON.parse(await readFile(path.join(dossier, 'publication.json'), 'utf-8')) as Publication;
    expect(enregistree.videos[0]!.replit.id).toBe(42);
  });
  it('met à jour la vidéo du site au relais suivant', async () => {
    await prete('interne', SITE_CHOISI);
    await relayer();
    expect((await relayer()).status).toBe(200);
    expect(site().enregistrerVideo).toHaveBeenLastCalledWith(42, expect.anything());
  });
  it('refuse une vidéo Perso, ou sans catégorie, en expliquant pourquoi', async () => {
    await prete('perso');
    const perso = await relayer();
    expect(perso.status).toBe(422);
    expect((await perso.json()).problemes).toEqual(['Une vidéo Perso n’est pas relayée sur le site.']);
    await prete('interne');
    expect((await (await relayer()).json()).problemes).toEqual(['Choisissez la catégorie du site.']);
    expect(site().enregistrerVideo).not.toHaveBeenCalled();
  });
  it('refuse tant que le site n’est pas configuré', async () => {
    await prete('interne', SITE_CHOISI);
    config.site = null;
    expect((await (await relayer()).json()).problemes)
      .toEqual(['Site non configuré : renseignez REPLIT_SITE_URL et REPLIT_API_KEY dans .env, puis relancez le studio.']);
  });
  it('relaie une vidéo Mixte une fois lisible publiquement, en intégrant la vidéo YouTube', async () => {
    await prete('mixte', SITE_CHOISI);
    expect((await (await relayer()).json()).problemes)
      .toEqual(['Enregistrez d’abord l’envoi sur YouTube : une vidéo Mixte est relayée une fois en ligne.']);
    await envoi();
    vi.mocked(config.lireVisibiliteYoutube).mockResolvedValueOnce('non-publique');
    const attente = await relayer();
    expect(attente.status).toBe(422);
    expect((await attente.json()).erreur)
      .toBe('Vidéo pas encore lisible publiquement : passez-la en public dans YouTube Studio, ou attendez l’heure programmée.');
    expect((await relayer()).status).toBe(200);
    expect(config.lireVisibiliteYoutube).toHaveBeenLastCalledWith(ID);
    expect(site().envoyerFichier).toHaveBeenCalledTimes(1);
    expect(site().enregistrerVideo).toHaveBeenCalledWith(null, expect.objectContaining({
      visibility: 'public', videoUrl: `https://www.youtube.com/watch?v=${ID}`, thumbnailObject: 'objet-vignette',
    }));
  });
  it('garde le statut et note l’erreur si le site échoue, puis reprend au relais suivant', async () => {
    const dossier = await prete('interne', SITE_CHOISI);
    vi.mocked(site().enregistrerVideo).mockRejectedValueOnce(new Error('Site injoignable (ECONNREFUSED) : le relais reste à faire, rien n’est perdu.'));
    const r = await relayer();
    expect(r.status).toBe(502);
    expect((await r.json()).erreur).toBe('Relais impossible : Site injoignable (ECONNREFUSED) : le relais reste à faire, rien n’est perdu.');
    const apres = JSON.parse(await readFile(path.join(dossier, 'publication.json'), 'utf-8')) as Publication;
    expect(apres.videos[0]).toMatchObject({ statut: 'prete', erreur: { etape: 'replit' } });
    expect(((await (await relayer()).json()) as Publication).videos[0]).toMatchObject({ statut: 'relayee', erreur: null });
  });
});
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `npm test -- studio/serveur/publication.test.ts`
Expected: FAIL — erreur de type sur `config.site`, `urlSite` absent, route `relais` inconnue (404).

- [ ] **Step 3: Type partagé**

Dans `studio/commun.ts`, dans `DetailPublication`, après `site: ReferencesSite | null;` :

```ts
  urlSite: string | null;   // adresse du site, pour ouvrir une vidéo relayée
```

- [ ] **Step 4: Route**

Dans `studio/serveur/publication.ts` :

1. Imports : ajouter

```ts
import { corpsRelais, enregistrerRelais, problemesRelais, raisonLectureRelais, urlYoutube } from '../../noyau/relais';
```

et remplacer `import type { ReferencesSite } from './site-replit';` par `import type { ClientSite, ReferencesSite } from './site-replit';`.

2. `ConfigPublication`, après `ouvrirDossier` :

```ts
  // Écritures sur le site (clé d’API de .env) ; null si l’adresse ou la clé manque.
  site: ClientSite | null;
```

3. Dans `creerApiPublication`, à côté de `let vignetteEnCours = false;` :

```ts
  let relaisEnCours = false;
```

4. Dans `detail`, après `site: await c.lireSite(c.urlSite),` :

```ts
      urlSite: c.urlSite ?? null,
```

5. Après la fonction `verifierYoutube`, ajouter :

```ts
  async function relayer(req: IncomingMessage, ctx: Contexte): Promise<Publication> {
    const cible = lireCible(await lireCorps(req), ctx.cibles);
    const video = videoDe(ctx.publication, cible);
    const disponible = ctx.videos.find(v => v.cible === cible)!;
    const vignette = video.vignette?.fichier ? path.join(ctx.dossier, video.vignette.fichier) : null;
    const octetsVignette = vignette && existsSync(vignette) ? (await stat(vignette)).size : null;
    const problemes = problemesRelais(video, descriptionYoutube(video.description, disponible.chapitres), ctx.tournage.reglages.publication, {
      rendu: { fichier: disponible.fichier, present: disponible.rendue },
      octetsVignette,
      siteConfigure: c.site !== null,
    });
    if (problemes.length > 0 || !vignette || !c.site) throw new ErreurHttp(422, 'La vidéo ne peut pas être relayée sur le site.', problemes);
    const idYoutube = video.youtube.id;
    if (video.profil === 'mixte' && idYoutube) {
      const refus = raisonLectureRelais(video, await c.lireVisibiliteYoutube(idYoutube), new Date());
      if (refus) throw new ErreurHttp(422, refus);
    }
    if (relaisEnCours) throw new ErreurHttp(409, 'Un relais est déjà en cours.');
    relaisEnCours = true;
    let id: number;
    try {
      const thumbnailObject = await c.site.envoyerFichier(vignette, 'image/jpeg');
      // Interne : le fichier est hébergé sur le site ; Mixte : la vidéo YouTube y est intégrée.
      const fichier = video.profil === 'mixte' && idYoutube
        ? { videoUrl: urlYoutube(idYoutube) }
        : { videoObject: await c.site.envoyerFichier(path.join(ctx.dossier, 'rendus', disponible.fichier), 'video/mp4') };
      id = await c.site.enregistrerVideo(video.replit.id, corpsRelais(video, { dureeSecondes: disponible.dureeSecondes, fichier, thumbnailObject }));
    } catch (e) {
      const actuelle = await relire(ctx);
      await ecrirePublication(ctx.dossier, modifierVideo(actuelle, cible, {
        erreur: { etape: 'replit', message: message(e), le: new Date().toISOString() },
      }));
      throw new ErreurHttp(502, `Relais impossible : ${message(e)}`);
    } finally {
      relaisEnCours = false;
    }
    const actuelle = await relire(ctx);
    const p = modifierVideo(actuelle, cible, enregistrerRelais(videoDe(actuelle, cible), id));
    await ecrirePublication(ctx.dossier, p);
    return p;
  }
```

6. Dans `traiter`, ajouter `relais` à l'expression de route et une branche :

```ts
    const route = /^\/api\/tournages\/([^/]+)\/publication(?:\/(redaction|image|vignette|valider|relais|youtube\/(?:preparer|ouvrir|envoi|verifier)))?$/
      .exec(chemin);
```

```ts
      else if (action === 'youtube/verifier' && req.method === 'POST') repondre(res, 200, await verifierYoutube(req, ctx));
      else if (action === 'relais' && req.method === 'POST') repondre(res, 200, await relayer(req, ctx));
```

- [ ] **Step 5: Brancher le client réel**

Dans `studio/serveur/principal.ts`, remplacer `import { lireReferencesSite } from './site-replit';` par `import { creerClientSite, lireReferencesSite } from './site-replit';` et, dans l'objet passé à `creerApiPublication`, après `ouvrirDossier: ouvrirDansExplorateur,` :

```ts
    // Clé d’API du site (REPLIT_API_KEY dans .env), égale au secret AUTOMATION_API_KEY du site.
    site: creerClientSite(process.env.REPLIT_SITE_URL, process.env.REPLIT_API_KEY),
```

- [ ] **Step 6: Vérifier**

Run: `npm test -- studio/serveur/publication.test.ts` puis `npm run typecheck`
Expected: PASS (anciens et nouveaux tests) ; aucune erreur de type.

- [ ] **Step 7: Commit**

```bash
git add studio/commun.ts studio/serveur/publication.ts studio/serveur/publication.test.ts studio/serveur/principal.ts
git commit -m "Studio : route de relais sur le site — fichier Interne ou vidéo YouTube Mixte, mise à jour au relais suivant, erreur notée sans rien perdre

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Panneau Site dans l'écran de publication

**Files:**
- Modify: `studio/src/api.ts`, `studio/src/logique/publication.ts`, `studio/src/logique/publication.test.ts`, `studio/src/composants/CartePublication.tsx`, `studio/src/styles.css`
- Create: `studio/src/composants/PanneauSite.tsx`

**Interfaces:**
- Consumes : route `publication/relais` et `DetailPublication.urlSite` (Task 4) ; `pretePourYoutube` (`noyau/youtube.ts`).
- Produces : `api.relayer(nom, cible): Promise<Publication>` ; `EXPLICATIONS_RELAIS: Record<'interne' | 'mixte', string>` ; composant `PanneauSite`.

- [ ] **Step 1: Test de la logique**

Dans `studio/src/logique/publication.test.ts`, ajouter `EXPLICATIONS_RELAIS` à l'import depuis `./publication` et ajouter :

```ts
describe('relais sur le site', () => {
  it('explique le relais des seuls profils relayés', () => {
    expect(Object.keys(EXPLICATIONS_RELAIS)).toEqual(['interne', 'mixte']);
    expect(EXPLICATIONS_RELAIS.interne).toContain('comptes autorisés');
    expect(EXPLICATIONS_RELAIS.mixte).toContain('lisible publiquement');
  });
});
```

Run: `npm test -- studio/src/logique/publication.test.ts`
Expected: FAIL (export manquant).

- [ ] **Step 2: Logique**

Dans `studio/src/logique/publication.ts`, après `EXPLICATIONS_PROFIL` :

```ts
export const EXPLICATIONS_RELAIS: Record<Exclude<Profil, 'perso'>, string> = {
  interne: 'Le fichier vidéo et la vignette sont envoyés sur le site, visibles des seuls comptes autorisés. '
    + 'Un nouveau relais renvoie le fichier et met à jour la fiche.',
  mixte: 'La vidéo YouTube est intégrée au site, visible de tous, une fois lisible publiquement sur YouTube. '
    + 'Un nouveau relais met à jour la fiche.',
};
```

Run: `npm test -- studio/src/logique/publication.test.ts`
Expected: PASS.

- [ ] **Step 3: Appel au serveur**

Dans `studio/src/api.ts`, dans l'objet `api`, après `verifierYoutube` :

```ts
  relayer: (nom: string, cible: CiblePublication) => appeler<Publication>(`${chemin(nom)}/publication/relais`, enJson('POST', { cible })),
```

- [ ] **Step 4: Composant**

`studio/src/composants/PanneauSite.tsx` :

```tsx
import { type FC, useState } from 'react';
import type { Publication, VideoPubliee } from '../../../noyau/publication';
import { api, ErreurApi } from '../api';
import { EXPLICATIONS_RELAIS } from '../logique/publication';

interface Props {
  nom: string;
  video: VideoPubliee & { profil: 'interne' | 'mixte' };
  urlSite: string | null;
  synchroniser: () => Promise<void>;
  executer: (action: () => Promise<Publication>) => Promise<void>;
}

// Relais d’une vidéo Interne ou Mixte sur le site ; le serveur vérifie les conditions et explique un refus.
export const PanneauSite: FC<Props> = ({ nom, video: v, urlSite, synchroniser, executer }) => {
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [problemes, setProblemes] = useState<string[]>([]);

  const relayer = async () => {
    setOccupe(true);
    setErreur(null);
    setProblemes([]);
    try {
      await synchroniser();
      await executer(() => api.relayer(nom, v.cible));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
      if (e instanceof ErreurApi) setProblemes(e.problemes);
    } finally {
      setOccupe(false);
    }
  };

  return (
    <div className="site">
      <h4>Site</h4>
      <p className="discret">{EXPLICATIONS_RELAIS[v.profil]}</p>
      <div className="actions">
        <button className="principal" disabled={occupe} onClick={() => void relayer()}>
          {v.replit.id ? 'Mettre à jour sur le site' : 'Relayer sur le site'}
        </button>
        {v.replit.id && urlSite && (
          <a href={`${urlSite.replace(/\/+$/, '')}/video/${v.replit.id}`} target="_blank" rel="noreferrer">Voir sur le site</a>
        )}
      </div>
      {occupe && (
        <p className="discret">
          Relais en cours…{v.profil === 'interne' && ' L’envoi du fichier vidéo peut prendre plusieurs minutes.'}
        </p>
      )}
      {erreur && <p className="alerte">{erreur}</p>}
      {problemes.length > 0 && <ul>{problemes.map(p => <li key={p}>{p}</li>)}</ul>}
    </div>
  );
};
```

- [ ] **Step 5: L'afficher dans la carte**

Dans `studio/src/composants/CartePublication.tsx`, ajouter l'import `import { PanneauSite } from './PanneauSite';` et, juste après la ligne `{pretePourYoutube(v) && <PanneauYoutube … />}` :

```tsx
          {pretePourYoutube(v) && v.profil !== 'perso' && (
            <PanneauSite key={v.profil} nom={nom} video={{ ...v, profil: v.profil }} urlSite={detail.urlSite} synchroniser={synchroniser} executer={executer} />
          )}
```

- [ ] **Step 6: Style**

Dans `studio/src/styles.css`, remplacer la ligne

```css
.carte-publication .youtube { border-top: 1px solid #e5e7eb; margin-top: 1rem; padding-top: 0.5rem; }
```

par

```css
.carte-publication .youtube, .carte-publication .site { border-top: 1px solid #e5e7eb; margin-top: 1rem; padding-top: 0.5rem; }
```

- [ ] **Step 7: Vérifier**

Run: `npm test` puis `npm run typecheck`
Expected: tous les tests PASS ; aucune erreur de type.

Puis lancer le studio (`npm run validation`), ouvrir un tournage rendu → Publication, et vérifier à l'œil sur une vidéo prête : profil Interne ou Mixte → panneau « Site » sous le panneau YouTube avec son explication ; profil Perso → pas de panneau. Sans catégorie choisie, « Relayer sur le site » affiche « Choisissez la catégorie du site. ».

- [ ] **Step 8: Commit**

```bash
git add studio/src/api.ts studio/src/logique/publication.ts studio/src/logique/publication.test.ts studio/src/composants/PanneauSite.tsx studio/src/composants/CartePublication.tsx studio/src/styles.css
git commit -m "Studio : panneau Site — relais d’une vidéo Interne ou Mixte prête, mise à jour, lien vers la vidéo relayée

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Documentation et essai réel guidé

**Files:**
- Modify: `docs/studio.md`

**Interfaces:**
- Consumes : tout ce qui précède, site publié (Task 1).

- [ ] **Step 1: Documentation**

Dans `docs/studio.md`, section Publication, après le paragraphe **YouTube** et avant « Tout est enregistré dans `publication.json` du tournage. », ajouter :

```markdown
- **Site** (vidéo Interne ou Mixte « Prête ») : « Relayer sur le site » publie la vidéo sur le site, dans la catégorie et la playlist choisies. *Interne* : le fichier vidéo et la vignette sont envoyés dans le stockage du site, la vidéo n’est visible que des comptes autorisés ; le relais n’attend pas YouTube. *Mixte* : la vidéo YouTube est intégrée au site, visible de tous, une fois l’envoi YouTube enregistré et la vidéo lisible publiquement (vérifié au moment du relais ; une vidéo programmée attend son heure). Les contrôles avant envoi s’appliquent. La vidéo passe à « Relayée sur le site » ; un nouveau relais met à jour la même vidéo (et renvoie le fichier d’une vidéo Interne). Si le site est injoignable ou refuse la clé, l’erreur s’affiche sur la carte et le relais reste à faire. Il faut dans `.env` : `REPLIT_SITE_URL` (adresse du site) et `REPLIT_API_KEY` (égale au secret `AUTOMATION_API_KEY` du site).
```

- [ ] **Step 2: Commit**

```bash
git add docs/studio.md
git commit -m "Documentation : relais sur le site dans le studio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Essai réel guidé (avec l'auteur)**

Pré-requis : Task 1 publiée, secrets du site renseignés, studio relancé (`npm run validation`) pour relire `.env`. Sur un tournage de test rendu :

1. **Interne** : vidéo complète en profil Interne, catégorie du site choisie, validée. « Relayer sur le site » → statut « Relayée sur le site », lien « Voir sur le site ». Vérifier sur le site : connecté avec un compte d'un domaine autorisé, la vidéo apparaît dans les listes et se lit dans le lecteur HTML5 (avance rapide comprise, signe que les requêtes par plage marchent) ; dans une fenêtre privée non connectée, elle n'apparaît nulle part et sa page invite à se connecter ; connecté avec un compte d'un domaine non autorisé, sa page est introuvable et l'adresse `/api/media/<objectId>` de la vidéo renvoie 404.
2. **Mise à jour** : modifier le titre, valider, relayer de nouveau → même identifiant sur le site, titre à jour.
3. **Mixte** : un épisode en profil Mixte, envoyé sur YouTube en Publique (plan 7), URL collée. « Relayer sur le site » → vidéo YouTube intégrée sur le site, visible sans connexion. Avant la mise en ligne (ou en Privée), le relais est refusé avec le message « pas encore lisible publiquement ».
4. **Erreur** : mettre une fausse `REPLIT_API_KEY` dans `.env`, relancer le studio, relayer → « Clé refusée par le site… », la carte affiche la dernière erreur, le statut ne change pas. Remettre la bonne clé.

Supprimer ensuite du site les vidéos de test (page d'administration), et noter le résultat de l'essai dans la mémoire du projet.
```
