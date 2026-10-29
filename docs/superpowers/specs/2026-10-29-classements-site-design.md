# Classements des vidéos sur le site (par outil, par thème…)

## Objectif

Avant tout relais sur le site Replit, chaque vidéo doit être caractérisée pour **chaque type de classement** que le site déclare (aujourd'hui « Par outil » et « Par thème »). Le Studio lit ces types et leurs valeurs sur le site, permet de choisir une ou plusieurs valeurs existantes, d'en créer une nouvelle, ou de cocher sciemment « Aucune sélection » pour un type facultatif.

## 1. Contrat côté site (à implémenter dans l'app Replit)

- `GET /api/classifications` (public, comme `/api/categories`) renvoie les types dans l'ordre d'affichage :
  ```json
  [{ "key": "outil", "label": "Par outil", "multiple": false, "required": true,
     "values": [{ "id": 1, "name": "Delos" }] },
   { "key": "theme", "label": "Par thème", "multiple": true, "required": false,
     "values": [{ "id": 1, "name": "Skills (compétences)" }, { "id": 2, "name": "vibe-coding" }, { "id": 3, "name": "en vrac" }] }]
  ```
- `POST /api/classifications/{key}/values` avec `{ "name": "…" }` (clé machine `X-Api-Key` ou administrateur) :
  - `201 { id, name }` à la création ;
  - `200 { id, name }` si une valeur du même nom existe déjà (comparaison sans casse ni espaces autour) ;
  - `404` si `key` est inconnue, `400` si le nom est vide.
- `POST /api/videos` et `PATCH /api/videos/:id` acceptent `classifications: { [key]: number[] }`, validé selon `multiple` / `required` (400 sinon).
  - `outil` est traduit en `categoryId` : le stockage existant ne change pas, `categoryId` reste accepté.
  - Les thèmes deviennent une table ; la rubrique « Par thème » de l'accueil est construite à partir d'elle (fini la liste en dur). Les vidéos dont les tags correspondent aux thèmes existants y restent rattachées.
- Les vidéos renvoyées incluent `classifications` sous la même forme.

## 2. Données du Studio (`noyau/`)

- `VideoPubliee.replit` gagne `classements: Record<string, number[] | 'aucun'>` :
  - `number[]` : valeurs choisies ;
  - `'aucun'` : case « Aucune sélection » cochée (refusé pour un type obligatoire) ;
  - clé absente : pas encore décidé.
- `categorieId` est repris en `classements.outil` à la lecture d'une publication ancienne ; `playlistId` reste tel quel (la playlist n'est pas un classement).
- Fonction pure `classementsManquants(types, classements): string[]` : libellés des types non décidés (absents, tableau vide, ou `'aucun'` sur un type obligatoire, ou plusieurs valeurs sur un type simple).
- Le corps envoyé au site (`CorpsVideoSite`) porte `classifications` ; `'aucun'` devient `[]`.

## 3. Serveur du Studio (`studio/serveur/site-replit.ts`)

- `ReferencesSite` gagne `classements: TypeClassement[]` (`cle, libelle, multiple, obligatoire, valeurs: {id, nom}[]`), lu sur `/api/classifications` en même temps que catégories et playlists. Échec de lecture → `null`, relais impossible (comportement actuel).
- `ClientSite.creerValeur(cle, nom): Promise<{ id, nom }>`, exposée par une route du Studio ; les erreurs suivent `appeler` / `refus` (« rien n'est perdu »).
- Le relais refuse avec la liste des problèmes si `classementsManquants` n'est pas vide (ex. « Par thème : choisir une valeur ou cocher Aucune sélection »).

## 4. Interface (`studio/src/composants/PanneauSite.tsx`)

Un bloc par type, dans l'ordre du site :
- liste déroulante (simple ou multiple selon `multiple`) des valeurs ;
- « + Créer… » : champ + bouton ; à la réponse, la valeur est ajoutée aux références et sélectionnée ;
- case « Aucune sélection » si le type est facultatif ; la cocher vide la sélection, choisir une valeur la décoche.

Le bouton Relayer est désactivé tant que `classementsManquants` n'est pas vide ; la liste des types manquants est affichée à côté. Le choix de playlist reste comme aujourd'hui.

## 5. Tests

- `site-replit.test.ts` : lecture et filtrage de `/api/classifications` (entrées malformées ignorées), `creerValeur` (201, 200 doublon, 404, clé refusée), avec `fetch` simulé.
- `noyau` : `classementsManquants` (tous les cas ci-dessus), reprise de `categorieId`, corps envoyé (`'aucun'` → `[]`).
- Relais : refus avec problèmes quand un type manque.

## Hors périmètre

Logos des outils créés depuis le Studio (ajoutés à la main sur le site) ; renommage/suppression de valeurs depuis le Studio ; playlist comme type de classement.
