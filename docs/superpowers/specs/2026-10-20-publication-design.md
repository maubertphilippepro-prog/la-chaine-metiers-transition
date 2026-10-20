# Publication — conception (sous-projet D)

Date : 2026-10-20. Sous-projet D annoncé par [la conception de la post-production](2026-10-06-post-production-design.md) : à partir des rendus d'un tournage, préparer les vidéos (métadonnées, vignette), les envoyer sur la chaîne YouTube PMT et, selon le cas, les relayer sur le site Replit.

## Objectif

Pour chaque tournage au statut `rendu`, l'auteur choisit dans le studio quelles vidéos publier (vidéo complète, épisodes) et, pour chacune, un **profil** :

| Profil | Contenu | YouTube | Site Replit |
|---|---|---|---|
| **Interne** | corporate, confidentiel | privée | fichier vidéo hébergé sur le site, réservé aux comptes autorisés |
| **Perso** | personnel | publique (ou programmée) | rien |
| **Mixte** | corporate et personnel, sans contenu sensible | publique (ou programmée) | lien YouTube intégré, visible de tous |

Le site Replit (app « Internal Assets », titre *Métiers & Transition*) sert au contenu destiné à Ingérop. La chaîne YouTube et l'app PMT ne mentionnent jamais Ingérop ni Cicad ; le site Replit, lui, le peut.

Aucune vidéo ne part sans validation humaine de son titre, de sa description et de sa vignette.

## Découpage

| Plan | Contenu | Dépend de |
|---|---|---|
| 6 — Préparation | onglet Publication, profils, métadonnées, vignette | — |
| 7 — YouTube en mode manuel | dossier prêt à téléverser, URL collée dans le studio, vérification de la visibilité | 6 |
| 8 — Site Replit et relais | clé d'API, visibilité interne, stockage, lecteur ; relais depuis l'app | 6 (7 pour Mixte) |
| plus tard — Envoi YouTube par l'API | connexion OAuth, envoi avec reprise, vignette, playlist | 7, projet Google Cloud |

Décision du 2026-10-20 : tant que la chaîne n'a pas fait ses preuves, pas de projet Google Cloud. L'envoi sur YouTube se fait à la main à partir d'un dossier préparé par le studio (plan 7). L'envoi par l'API est décrit plus bas pour mémoire et sera planifié plus tard.

## Données

### `donnees/tournages/<tournage>/publication.json`

Écrit par le studio, sur le modèle de `montage.json`. Version 1.

```ts
type Profil = 'interne' | 'perso' | 'mixte';
type StatutPublication = 'a-preparer' | 'prete' | 'envoyee-youtube' | 'relayee' | 'erreur';

interface Publication {
  version: 1;
  profilParDefaut: Profil;
  videos: VideoPubliee[];
}

interface VideoPubliee {
  cible: 'complete' | { episode: number };   // rendu concerné dans rendus/
  publier: boolean;
  profil: Profil;                             // par défaut profilParDefaut
  statut: StatutPublication;
  titre: string;                              // ≤ 100 caractères (YouTube) ; Claude vise ≤ 70
  variantesTitre: string[];                   // 2 propositions de Claude
  description: string;                        // ≤ 5 000 caractères, chapitres compris
  tags: string[];                             // ≤ 500 caractères au total
  vignette: Vignette | null;
  youtube: {
    id: string | null;
    visibilite: 'privee' | 'publique' | 'programmee';
    programmeeLe: string | null;              // ISO 8601, si programmée
    playlistId: string | null;
  };
  replit: {
    id: number | null;
    categorieId: number | null;
    playlistId: number | null;
  };
  erreur: { etape: 'vignette' | 'youtube' | 'replit'; message: string; le: string } | null;
}

interface Vignette {
  pose: { source: 'banque'; fichier: string } | { source: 'camera'; instant: number };
  fond: { source: 'ecran'; instant: number } | { source: 'charte' };
  accroche: string;                           // 3 à 5 mots
  fichier: string;                            // rendus/vignettes/<cible>.jpg
}
```

`profil` ne s'applique qu'aux vidéos ayant `publier: true`. Le statut avance ainsi : `a-preparer` → `prete` (titre, description et vignette validés) → `envoyee-youtube` → `relayee` (Interne et Mixte seulement). Une vidéo Interne peut être relayée sans être passée par YouTube ; l'envoi YouTube privé reste alors facultatif.

### Banque de poses

`donnees/poses/` est partagé entre les tournages, comme `glossaire.json`. L'auteur y dépose 5 à 10 photos HD (`*.jpg`) ; le pipeline produit pour chacune un PNG détouré `*.detoure.png`, recalculé seulement si la photo change.

### Caméra séparée

Si `bruts/` contient un enregistrement de la webcam seule (plugin OBS Source Record, nom se terminant par `-camera`), il sert uniquement aux vignettes : le montage l'ignore.

## Plan 6 — Préparation

### Onglet Publication

Il est accessible dans le studio quand le tournage est au statut `rendu`. Il liste la vidéo complète et chaque épisode, avec une case « publier » et un profil. Pour Interne et Mixte, il propose aussi une catégorie et une playlist du site Replit, lues sur son API (`GET /api/categories`, `GET /api/playlists`). Si le site est injoignable, ces champs restent vides et le relais est bloqué jusqu'à ce qu'ils soient remplis.

### Métadonnées

Claude reçoit la transcription montée de la vidéo, les titres de chapitres et le glossaire. Il propose, en sortie structurée contrôlée par le noyau (même mécanisme que les consignes) :

- un titre (≤ 70 caractères) et 2 variantes ;
- une description (accroche, résumé, liens cités) ;
- des tags.

Les **chapitres horodatés** sont calculés par le noyau à partir du montage (début de chaque chapitre dans la vidéo montée, premier à `0:00`, au moins 3 chapitres de 10 s minimum, sinon ils sont omis), puis ajoutés à la description YouTube. Claude ne produit aucun horodatage.

Tout se modifie à la main dans le studio.

### Vignette

Format : 1280×720, JPEG de moins de 2 Mo.

1. **Pose** : l'auteur choisit une photo détourée de la banque de poses ou, si une caméra séparée existe, un instant du tournage. Claude suggère 3 instants où l'auteur est face caméra, à partir de la transcription. Le pipeline extrait l'image de la caméra séparée et la détoure.
2. **Fond** : un instant du partage d'écran (image de `source.mp4` dans le montage) ou un fond de la charte.
3. **Accroche** : Claude en propose 3, de 3 à 5 mots ; l'auteur en choisit une ou l'écrit.
4. **Rendu** : la composition Remotion `Vignette` assemble le fond (assombri et flouté légèrement), la pose détourée en grand à droite, l'accroche en gros caractères à gauche, les formes géométriques et le logo PMT de la charte. L'image fixe est rendue par `renderStill`, et le studio l'affiche aussitôt.

Les épisodes reprennent par défaut la pose et le fond choisis pour la vidéo complète ; l'accroche reste propre à chaque vidéo. Un seul gabarit sert aux trois profils.

Le **détourage** se fait dans le pipeline Python, avec un modèle de segmentation de personne exécuté localement (aucun service en ligne), et produit un PNG transparent aux dimensions de l'image d'origine.

## Plan 7 — YouTube en mode manuel

### Préparer pour YouTube

Pour une vidéo `prete`, le bouton « Préparer pour YouTube » passe les contrôles avant envoi puis écrit `donnees/tournages/<tournage>/publication/<cible>/` :

- `vignette.jpg` ;
- `titre.txt`, `description.txt` (chapitres compris), `tags.txt` (séparés par des virgules, comme les attend YouTube Studio) ;
- `reglages-youtube.txt` : visibilité à choisir, catégorie « Science et technologie », langue français, « non, cette vidéo n'est pas conçue pour les enfants », playlist suggérée (nom du tournage) quand plusieurs vidéos du tournage sont publiées.

Le MP4 n'est pas copié : le studio affiche le chemin du rendu dans `rendus/`. Il propose aussi un bouton « copier » par champ et un bouton qui ouvre le dossier dans l'Explorateur.

Visibilité indiquée selon le profil : **Privée** pour Interne, **Publique** ou **Programmée** pour Perso et Mixte.

### Retour de l'URL

Une fois la vidéo téléversée dans YouTube Studio, l'auteur colle son URL dans le studio. Le noyau en extrait l'identifiant (formes `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`, `studio.youtube.com/video/<id>/edit`, ou identifiant seul de 11 caractères) et refuse toute autre chaîne. L'auteur indique la visibilité choisie et, si elle est programmée, la date et l'heure. La vidéo passe à `envoyee-youtube`.

### Vérification de la visibilité

Sans compte Google, par l'adresse publique oEmbed : `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=<id>&format=json`. Une réponse 200 signifie que la vidéo est lisible publiquement ; 401, 403 ou 404 qu'elle est privée, programmée et pas encore en ligne, ou supprimée. Cette vérification conditionne le relais Mixte. Pour une vidéo Interne, le studio la lance aussi et alerte si la vidéo est lisible publiquement alors qu'elle devrait être privée.

### Notice YouTube Studio

`docs/youtube-studio.md`, sur le modèle de `docs/obs-configuration.md`, pas à pas et propre à notre cas :

- une fois pour toutes : vérification de la chaîne par téléphone, réglages par défaut des mises en ligne (catégorie, langue, « pas conçue pour les enfants »), playlists ;
- à chaque vidéo : du dossier « Préparer pour YouTube » jusqu'à l'URL collée dans le studio, en suivant les écrans de téléversement de YouTube Studio (Détails, Éléments vidéo, Vérifications, Visibilité) ;
- un parcours par profil : Interne (Privée, puis relais), Perso (Publique ou Programmée, pas de relais), Mixte (Publique ou Programmée, relais une fois en ligne) ;
- les cas courants : modifier une vidéo déjà en ligne, remplacer la vignette, rattraper une erreur de visibilité.

Les libellés des écrans de YouTube Studio sont vérifiés au moment de la rédaction, à la fin du plan 7.

## Plus tard — Envoi YouTube par l'API

Pour mémoire : cette partie sera planifiée quand la chaîne aura fait ses preuves et que le projet Google Cloud existera. Elle remplace alors le téléversement à la main ; `publication.json`, les contrôles et le relais restent inchangés.

### Connexion

Projet Google Cloud de l'auteur, API YouTube Data v3, identifiant OAuth de type « application de bureau », portée `youtube.upload` et `youtube`. Au premier envoi, le studio ouvre la page de consentement Google ; l'auteur choisit maubert.philippe.pro@gmail.com et la chaîne PMT. Le jeton de rafraîchissement est stocké dans un fichier ignoré par git (`.secrets/youtube.json`), l'identifiant client dans `.env`. Si le jeton expire ou est révoqué, le studio redemande la connexion.

Une fiche `docs/youtube-configuration.md` guide la création du projet, la vérification de la chaîne par téléphone et la demande d'audit.

### Envoi

Par vidéo `prete`, ou « tout envoyer » :

1. envoi du MP4 par morceaux avec reprise (`uploadType=resumable`) ; une coupure reprend au dernier morceau reçu ;
2. métadonnées : titre, description avec chapitres, tags, catégorie « Science et technologie », langue `fr`, `selfDeclaredMadeForKids: false` ;
3. vignette (`thumbnails.set`) ;
4. ajout à une playlist par tournage, créée au premier envoi quand plusieurs vidéos du tournage sont publiées ;
5. visibilité (tableau ci-dessous).

| Profil | Audit Google obtenu | Audit non obtenu |
|---|---|---|
| Interne | privée | privée |
| Perso, Mixte | publique ou programmée (`publishAt`) | privée, avec l'indication « à passer en public dans YouTube Studio » et le lien direct |

Le réglage `youtube.auditObtenu` (dans `reglages.json`) bascule d'une colonne à l'autre.

Un nouvel envoi d'une vidéo qui a déjà un `youtube.id` met à jour ses métadonnées et sa vignette (`videos.update`) sans renvoyer le fichier.

La progression s'affiche en direct, sur le modèle du suivi de rendu existant.

### Contrainte de l'audit

Un projet d'API non audité qui envoie des vidéos les voit verrouillées en privé, quelle que soit la visibilité demandée. L'audit (formulaire de conformité, démonstration de la connexion OAuth) prend quelques semaines et se demande dès la création du projet Google Cloud. Ce point s'appuie sur des sources tierces et doit être vérifié dans la documentation Google et la console au moment de la configuration.

Tant que l'audit n'est pas obtenu, si une vidéo verrouillée ne peut pas passer en public à la main, le mode manuel du plan 7 reste la voie normale pour Perso et Mixte.

### Quotas

Le quota standard permet environ 6 envois par jour. Un dépassement affiche un message clair et laisse la vidéo en `prete`.

## Plan 8 — Site Replit et relais

### Modifications du site

Elles sont faites par l'agent Replit d'après cette section, puis vérifiées en lisant le code et en appelant l'API.

1. **Clé d'API machine.** Secret `AUTOMATION_API_KEY`. Une requête portant l'en-tête `X-Api-Key` égal à cette clé (comparaison en temps constant) a les droits d'un administrateur. Une clé absente ou fausse sur une route d'écriture renvoie 401.
2. **Visibilité.** Nouveau champ vidéo `visibility: 'public' | 'interne'`, par défaut `public`. Une vidéo `interne` est invisible des listes, recherches, playlists, statistiques, vidéo à la une et pages vidéo pour tout visiteur non autorisé. Est autorisé un compte connecté dont le domaine de l'e-mail figure dans le secret `ALLOWED_EMAIL_DOMAINS` (liste séparée par des virgules, initialement `ingerop.com,cicad.fr`, comparaison insensible à la casse), ou un administrateur. Un visiteur non connecté qui ouvre une vidéo interne est invité à se connecter ; un compte connecté non autorisé reçoit 404.
3. **Stockage.** Object Storage de Replit. `POST /api/uploads` (clé ou admin) renvoie une URL d'envoi signée de courte durée et une référence d'objet ; le fichier est envoyé directement dans le stockage. `VideoInput` et `VideoUpdate` acceptent `videoObject` et `thumbnailObject` (références d'objet) en plus des URL.
4. **Lecture.** Une vidéo qui a un `videoObject` est lue dans un lecteur HTML5. Le fichier est servi par `GET /api/media/:objet`, qui revérifie les droits de la vidéo à chaque requête et gère les requêtes par plage (`Range`). Les vignettes des vidéos internes passent par la même route. Aucune URL de stockage permanente n'est exposée.

L'OpenAPI du site est mis à jour en premier, puis le code est régénéré (règle du site).

### Relais depuis l'app

Un bouton par vidéo Interne ou Mixte, actif quand les conditions sont remplies :

| Profil | Condition | Envoyé au site |
|---|---|---|
| Interne | vidéo `prete` ou `envoyee-youtube` | MP4 et vignette dans le stockage, `visibility: interne` |
| Mixte | vidéo `envoyee-youtube` et lisible publiquement, vérifiée par oEmbed au moment du relais ; une vidéo programmée attend son heure de mise en ligne | `videoUrl` YouTube, vignette dans le stockage, `visibility: public` |

Dans les deux cas : titre, description sans horodatages, tags, catégorie, playlist, `durationSeconds`, `format: long`, `status: published`. L'identifiant renvoyé est enregistré dans `replit.id` ; un nouveau relais met à jour la vidéo (`PATCH /api/videos/:id`) au lieu d'en créer une autre.

L'adresse du site (`REPLIT_SITE_URL`) et la clé (`REPLIT_API_KEY`) sont lues dans `.env`.

## Contrôles avant envoi

Le noyau refuse un envoi ou un relais et explique pourquoi si :

- la vidéo n'est pas `prete` (ou déjà envoyée, pour une mise à jour) ;
- le fichier de rendu ou la vignette est absent ;
- la vignette dépasse 2 Mo ;
- le titre dépasse 100 caractères, la description 5 000, les tags 500 au total ;
- une vidéo Perso ou Mixte mentionne Ingérop ou Cicad dans son titre, sa description ou ses tags (YouTube) ;
- l'action n'est pas permise par le profil (relais d'une vidéo Perso, relais Mixte d'une vidéo non publique).

## Gestion des erreurs

Chaque étape (vignette, YouTube, Replit) écrit son état dans `publication.json`. En cas d'échec, `statut: erreur` et `erreur` gardent l'étape, le message et l'horodatage ; relancer reprend à l'étape échouée sans refaire les précédentes. Messages en français, avec l'action à faire :

- URL YouTube non reconnue → rappel des formes acceptées ;
- vidéo Mixte pas encore lisible publiquement → passer en public dans YouTube Studio, ou attendre l'heure programmée ;
- vidéo Interne lisible publiquement → la passer en privé dans YouTube Studio ;
- site injoignable ou clé refusée → le relais reste à faire, rien n'est perdu.

L'envoi par l'API, plus tard, ajoutera : jeton Google expiré ou révoqué (reconnexion), quota dépassé (réessayer le lendemain), vidéo verrouillée en privé (audit à obtenir).

## Tests

- **noyau** (vitest) : chapitres horodatés depuis le montage, contrôles avant envoi, transitions d'état, visibilité indiquée selon le profil, extraction de l'identifiant d'une URL YouTube, lecture d'un `publication.json` absent ;
- **serveur du studio** : routes de publication, dossier « Préparer pour YouTube », avec oEmbed et le site Replit simulés, sans aucun appel réel ;
- **Remotion** : rendu de `Vignette` en image fixe, dimensions et poids ;
- **pipeline** (pytest) : détourage d'une photo de fixture, PNG transparent aux bonnes dimensions ;
- **essais réels guidés** : en fin de plan 7, préparation d'une vidéo de test, téléversement à la main en privé, URL collée et vérification oEmbed ; en fin de plan 8, relais Interne et Mixte, et contrôle de l'accès par domaine avec un compte autorisé et un compte non autorisé.

## Prérequis côté utilisateur

1. Vérifier la chaîne PMT par téléphone dans YouTube Studio (nécessaire pour les vignettes personnalisées, même à la main).
2. Fournir 5 à 10 photos HD pour la banque de poses.
3. Installer le plugin OBS Source Record et brancher la webcam 1080p ; la fiche OBS sera complétée.
4. Établir la liste complète des domaines e-mail d'Ingérop pour le site.
5. Confirmer que la licence gratuite de Remotion couvre la diffusion de vidéos sur le site destiné à Ingérop.

Plus tard, pour l'envoi par l'API : créer le projet Google Cloud, activer l'API YouTube Data v3, créer l'identifiant OAuth « application de bureau » (fiche guidée) et demander l'audit.

## Hors périmètre

LinkedIn, Shorts, statistiques YouTube rapatriées, programmation gérée par l'app elle-même (la programmation de YouTube suffit), variantes de gabarit de vignette.
