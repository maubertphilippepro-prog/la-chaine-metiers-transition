# Qualification des vidéos et sablier — conception

Date : 2026-10-22. Révise [la conception de la publication](2026-10-20-publication-design.md) après les plans 7 et 8 : les trois profils (Interne, Perso, Mixte) sont remplacés par une **qualification** à deux axes, dont l'app déduit la diffusion. S'y ajoute un sablier pour toute attente dans le studio.

## Qualification et diffusion

Dans le studio, l'auteur qualifie chaque vidéo à publier :

- **Nature** : Pro ou Perso ;
- **Confidentielle** : oui ou non.

Il ne choisit plus rien d'autre : l'app en déduit la diffusion.

| Qualification | YouTube | Site Replit |
|---|---|---|
| Pro, confidentielle | aucun envoi | fichier vidéo hébergé sur le site, réservé aux comptes autorisés (`visibility: interne`) |
| Pro, non confidentielle | Non répertoriée | lien YouTube intégré, visible de tous (`visibility: public`) |
| Perso, confidentielle | Privée | rien |
| Perso, non confidentielle | Publique, ou Programmée | rien |

### Règle centrale

Une fonction pure du noyau porte toute la grille :

```ts
type Nature = 'pro' | 'perso';
interface Qualification { nature: Nature; confidentielle: boolean }
interface Diffusion {
  youtube: 'aucun' | 'non-repertoriee' | 'privee' | 'publique';   // 'publique' admet aussi la programmation
  site: 'fichier' | 'lien' | 'aucun';
}
function diffusion(q: Qualification): Diffusion;
```

Les contrôles, les consignes du dossier YouTube, le bilan oEmbed, le relais et l'affichage des panneaux ne lisent que `diffusion(...)`, jamais `nature` ni `confidentielle` directement.

## Données

`publication.json` passe en **version 2** :

- `VideoPubliee.profil` est remplacé par `nature: Nature` et `confidentielle: boolean` ;
- `profilParDefaut` est remplacé par `qualificationParDefaut: Qualification` (par défaut Perso, non confidentielle) ;
- `youtube.visibilite` admet en plus `'non-repertoriee'` : `'privee' | 'non-repertoriee' | 'publique' | 'programmee'`.

Un fichier en version 1 est converti à la lecture, puis réécrit en version 2 au prochain enregistrement :

| Profil v1 | Qualification v2 |
|---|---|
| `interne` | Pro, confidentielle |
| `mixte` | Pro, non confidentielle |
| `perso` | Perso, non confidentielle |

Une vidéo convertie depuis `mixte` qui a déjà `youtube.visibilite: 'publique'` garde cette valeur ; le bilan oEmbed l'accepte (voir plus bas) et le studio rappelle de la passer en Non répertoriée.

## Statuts

- YouTube `aucun` (Pro, confidentielle) : `a-preparer` → `prete` → `relayee`. Pas de « Préparer pour YouTube », pas d'URL à coller.
- YouTube et site `lien` (Pro, non confidentielle) : `a-preparer` → `prete` → `envoyee-youtube` → `relayee`.
- YouTube seul (Perso) : `a-preparer` → `prete` → `envoyee-youtube`.

## YouTube en mode manuel

- **Préparer pour YouTube** est refusé si `diffusion.youtube` vaut `aucun`.
- La fiche `youtube.txt` du dossier indique la visibilité déduite : « Non répertoriée », « Privée », ou « Publique, ou Programmée à la date voulue ».
- **Enregistrer l'envoi** n'accepte que la visibilité déduite : `non-repertoriee` pour Pro non confidentielle, `privee` pour Perso confidentielle, `publique` ou `programmee` (avec date) pour Perso non confidentielle.
- **Mentions interdites** : contrôlées pour toute vidéo envoyée sur YouTube, quelle que soit sa visibilité (Perso comme Pro non confidentielle). Elles ne le sont pas pour Pro confidentielle, qui ne va que sur le site.

### Bilan oEmbed

oEmbed répond 200 pour une vidéo publique comme pour une non répertoriée : il ne distingue pas les deux. Le studio rappelle donc le bon réglage sans pouvoir le contrôler.

| Diffusion YouTube | Lisible | Non lisible |
|---|---|---|
| `non-repertoriee` | « Vidéo lisible par lien. Vérifiez dans YouTube Studio qu’elle est bien Non répertoriée. » | alerte : « Vidéo pas encore lisible : passez-la en Non répertoriée dans YouTube Studio. » |
| `privee` | alerte : « Vidéo lisible publiquement : passez-la en privé dans YouTube Studio. » | « Vidéo privée : elle n’est pas lisible publiquement. » |
| `publique` | « Vidéo en ligne, lisible publiquement. » | sans changement : en attente de l'heure programmée, alerte sinon |

YouTube injoignable : message inchangé.

## Relais sur le site

| Diffusion site | Condition | Envoyé |
|---|---|---|
| `fichier` | vidéo `prete` | MP4 et vignette dans le stockage, `visibility: interne` |
| `lien` | vidéo `envoyee-youtube` et lisible par oEmbed au moment du relais | `videoUrl` YouTube, vignette dans le stockage, `visibility: public` |
| `aucun` | refusé : « Une vidéo Perso n’est pas relayée sur le site. » | — |

Le reste du relais (corps envoyé, mise à jour par `PATCH`, erreurs) ne change pas. Une vidéo relayée qui passe de Pro confidentielle à Pro non confidentielle, ou l'inverse, reste sur le site : le relais suivant la met à jour selon la nouvelle diffusion (fichier ou lien, visibilité).

### Retrait d'une vidéo requalifiée en Perso

Une vidéo qui a un `replit.id` et dont la diffusion site devient `aucun` (passage en Perso) est retirée du site :

1. Dans le studio, passer une telle vidéo en Perso demande confirmation : « Cette vidéo est sur le site : la passer en Perso la retirera du site. » Sans confirmation, la qualification ne change pas.
2. Après confirmation, le studio envoie l'enregistrement en attente (`synchroniser`), puis appelle `POST /api/tournages/<nom>/publication/site/retirer` `{ cible }`.
3. Le serveur vérifie que `diffusion.site` vaut `aucun` et que `replit.id` existe (sinon 409), puis appelle `DELETE /api/videos/:id` sur le site avec la clé d'API. Une réponse 404 compte comme un retrait réussi : la vidéo n'y est déjà plus.
4. En cas de succès : `replit.id`, `replit.categorieId` et `replit.playlistId` repassent à `null`, `erreur` à `null`, et le statut `relayee` devient `envoyee-youtube` si `youtube.id` existe, `prete` sinon.
5. En cas d'échec (site injoignable, clé refusée) : `statut: erreur`, `erreur.etape: 'replit'` avec le message « Retrait du site impossible : … ; la vidéo y est encore visible. » ; `replit.id` est gardé. Le panneau Site reste affiché pour cette vidéo avec un seul bouton **Retirer du site**, qui relance l'étape 3.

Aucune vidéo Perso n'est envoyée sur YouTube tant qu'un retrait est en échec : « Préparer pour YouTube » et « Enregistrer l'envoi » sont refusés avec « Retirez d’abord la vidéo du site. »

### Modification du site

Faite par l'agent Replit, puis vérifiée en lisant le code et en appelant l'API, comme au plan 8 :

- `DELETE /api/videos/:id`, réservé à la clé d'API ou à un administrateur (401 sinon), supprime la vidéo, ses rattachements aux playlists et ses statistiques, ainsi que ses objets dans le stockage (`videoObject`, `thumbnailObject`). Réponse 204 ; 404 si la vidéo n'existe pas.
- Si la route existe déjà, seul le nettoyage du stockage est vérifié et ajouté au besoin.
- L'OpenAPI du site est mis à jour en premier, puis le code est régénéré.

## Studio

- La carte de chaque vidéo remplace le choix du profil par deux contrôles : **Pro / Perso** et une case **Confidentielle**. Sous les contrôles, une ligne résume la diffusion déduite, par exemple « YouTube : Non répertoriée · Site : lien YouTube, visible de tous ».
- La qualification par défaut du tournage se règle de la même façon, à la place du profil par défaut.
- Le panneau YouTube n'apparaît que si `diffusion.youtube` ≠ `aucun` ; le panneau Site que si `diffusion.site` ≠ `aucun`, ou si un retrait du site reste à faire. Catégorie et playlist du site ne sont demandées que pour les vidéos Pro.

## Sablier

Toute action du studio qui fait attendre l'auteur affiche un **sablier** animé :

- le bouton qui l'a lancée est désactivé et montre le sablier à côté de son libellé d'attente (par exemple « Rendu de la vignette… ») ;
- pendant le rendu de la vignette, la zone « Rendu » de l'aperçu montre aussi le sablier à la place de l'image ou de « Pas encore rendue. ».

Un seul composant `Sablier` (CSS, sans dépendance), qui respecte `prefers-reduced-motion` (sablier fixe, sans rotation). Il remplace les textes d'attente actuels :

| Écran | Attentes |
|---|---|
| Publication, carte | rédaction par Claude, vérification avant validation, rendu de la vignette |
| Publication, choix de la vignette | extraction d'une image de la caméra ou de l'écran |
| Panneau YouTube | préparation du dossier, ouverture du dossier, enregistrement de l'envoi, vérification sur YouTube |
| Panneau Site | relais sur le site, retrait du site |
| Montage | relance des suggestions, envoi d'une consigne à Claude |
| Rendu | préparation avant la première progression (la barre de progression reste ensuite) |
| Enregistrements différés | « Enregistrement… » des écrans Montage et Publication |

Les copies dans le presse-papiers, quasi instantanées, n'en affichent pas.

## Documentation

- `docs/superpowers/specs/2026-10-20-publication-design.md` : une note en tête renvoie à la présente conception pour les profils.
- `docs/youtube-studio.md` : les trois parcours par profil deviennent quatre parcours par qualification (Pro confidentielle : pas de YouTube ; Pro non confidentielle : Non répertoriée puis relais ; Perso confidentielle : Privée ; Perso non confidentielle : Publique ou Programmée).
- `docs/studio.md` : section Publication mise à jour (qualification, diffusion déduite, sablier).

## Tests

- **noyau** : `diffusion` pour les quatre qualifications ; conversion d'un `publication.json` v1 (trois profils, `profilParDefaut`) ; refus de « Préparer pour YouTube » sans YouTube ; visibilités acceptées à l'envoi ; bilan oEmbed des trois diffusions YouTube ; conditions du relais `fichier` et `lien` ; mentions interdites contrôlées pour la non répertoriée ; état après un retrait réussi ou échoué, statut rendu selon `youtube.id`.
- **serveur du studio** : routes YouTube, relais et retrait avec les nouvelles qualifications, oEmbed et site simulés (204, 404 compté comme réussi, 401, site injoignable) ; refus de l'envoi YouTube tant qu'un retrait est en échec.
- **studio** : libellés de la diffusion déduite ; confirmation demandée avant de passer en Perso une vidéo présente sur le site.
- **essai réel guidé** : sur `zz-essai-plan7`, conversion du fichier v1, puis une vidéo Pro non confidentielle téléversée en Non répertoriée, URL collée, vérification et relais ; enfin passage de cette vidéo en Perso et contrôle qu'elle a disparu du site et de son stockage.

## Hors périmètre

Contrôle réel de la visibilité Non répertoriée (il faudrait l'API YouTube).
