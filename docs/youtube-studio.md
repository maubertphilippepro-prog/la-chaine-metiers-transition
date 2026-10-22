# Mettre une vidéo en ligne avec YouTube Studio

Le studio prépare tout ; le téléversement se fait à la main dans YouTube Studio (https://studio.youtube.com), connecté au compte de la chaîne PMT. Les libellés ci-dessous sont ceux de l’interface en français ; YouTube les retouche de temps en temps : en cas d’écart, se fier au sens et corriger cette notice.

## Une fois pour toutes

1. **Vérifier la chaîne** : ouvrir https://www.youtube.com/verify, choisir un code par SMS et le saisir. Sans cette vérification, la miniature personnalisée est refusée.
2. **Réglages par défaut des mises en ligne** : YouTube Studio → Paramètres → paramètres par défaut de l’importation (selon la version : « Paramètres d’importation par défaut » ou « Paramètres par défaut pour les téléchargements »).
   - Onglet des informations de base : Visibilité « Privée » (on la change vidéo par vidéo).
   - Onglet « Paramètres avancés » : Catégorie « Science et technologie », Langue de la vidéo « Français ».
   - Enregistrer.
   - L’audience (« conçue pour les enfants ») se confirme à chaque vidéo : la cocher par erreur désactive commentaires, écrans de fin et playlists.
3. **Playlists** : rien à créer d’avance. Quand plusieurs vidéos d’un même tournage sont publiées, la section RÉGLAGES de `youtube.txt` suggère une playlist au nom du tournage, créée au premier téléversement (étape « Détails » → Playlists → « Nouvelle playlist »).

## À chaque vidéo

1. Dans le studio, écran Publication : la vidéo doit être « Prête ». Cliquer **Préparer pour YouTube**. Le studio écrit `donnees/tournages/<tournage>/publication/<complete|episode-NN>/` : le MP4 à téléverser, `vignette.jpg` et `youtube.txt`, qui rassemble titre, description, tags et réglages à copier. **Ouvrir le dossier** l’affiche dans l’Explorateur.
2. YouTube Studio → **Créer** → **Importer des vidéos** → sélectionner le MP4 du dossier.
3. Étape **Détails** :
   - Titre : bouton « Copier le titre » du studio, puis coller.
   - Description : « Copier la description » (chapitres compris), puis coller.
   - Miniature : « Importer un fichier » → `vignette.jpg` du dossier.
   - Playlists : celle indiquée dans la section RÉGLAGES de `youtube.txt`, s’il y en a une.
   - Audience : « Non, elle n’est pas conçue pour les enfants ».
   - « Afficher plus » → Tags : « Copier les tags », puis coller (les virgules séparent les tags) ; vérifier la langue et la catégorie.
4. Étape **Éléments vidéo** : rien à ajouter (le carton de fin est déjà dans la vidéo).
5. Étape **Vérifications** : attendre la fin du contrôle des droits d’auteur ; en cas de signalement, ne pas publier et revoir la musique ou les images.
6. Étape **Visibilité** : selon la qualification (voir ci-dessous), puis « Enregistrer » ou « Programmer ».
7. Copier le lien de la vidéo (affiché pendant le téléversement, ou « Partager » sur la vidéo) et le coller dans le studio, champ **URL de la vidéo sur YouTube**. Choisir la visibilité retenue (et la date si elle est programmée), puis **Enregistrer l’envoi**. La vidéo passe à « Envoyée sur YouTube » et le studio vérifie aussitôt ce que voit un visiteur sans compte.

## Parcours par qualification

La qualification se choisit dans la carte de la vidéo (Nature : Pro ou Perso ; case Confidentielle). Le studio en déduit la visibilité à choisir et la rappelle dans `youtube.txt`.

- **Pro, confidentielle** : rien sur YouTube. Pas de « Préparer pour YouTube » : la vidéo est seulement relayée sur le site (fichier compris), réservée aux comptes autorisés.
- **Pro, non confidentielle** : Visibilité **Non répertoriée**, jamais Publique. Une fois l’URL enregistrée, la vidéo est relayée sur le site avec son lien YouTube, visible de tous. La vérification du studio voit qu’elle est lisible par lien, mais ne distingue pas Non répertoriée de Publique : contrôler ce réglage dans YouTube Studio.
- **Perso, confidentielle** : Visibilité **Privée**, jamais « Non répertoriée » (un lien non répertorié est lisible par quiconque l’obtient). Le studio alerte si la vidéo est lisible publiquement. Rien sur le site.
- **Perso, non confidentielle** : **Publique**, ou **Programmer** avec la date et l’heure voulues. Rien sur le site.

## Cas courants

- **Modifier le titre, la description ou les tags d’une vidéo en ligne** : corriger dans le studio (la vidéo reste « Envoyée sur YouTube »), « Préparer pour YouTube » de nouveau, puis YouTube Studio → Contenu → la vidéo → Détails : recoller les champs et « Enregistrer ».
- **Remplacer la vignette** : rendre la nouvelle vignette dans le studio, « Préparer pour YouTube », puis dans Détails → Miniature → « Importer un fichier » → `vignette.jpg`, et « Enregistrer ».
- **Rattraper une erreur de visibilité** : YouTube Studio → Contenu → colonne Visibilité de la vidéo → choisir la bonne, « Enregistrer ». Dans le studio, recoller l’URL avec la visibilité corrigée (« Enregistrer l’envoi »), puis « Vérifier la visibilité ». Une vidéo Perso confidentielle passée publique par erreur doit repasser en Privée immédiatement.
- **Mauvaise URL collée** : recoller la bonne et « Enregistrer l’envoi » ; l’ancienne est remplacée.
- **Passer en Perso une vidéo déjà sur le site** : le studio demande confirmation, puis la retire du site (fichier et vignette compris). Si le site est injoignable, la vidéo reste Perso, l’erreur s’affiche et le panneau Replit propose « Retirer du site » ; l’envoi sur YouTube reste bloqué jusque-là.
- **Vidéo Pro confidentielle déjà envoyée sur YouTube** (ancienne vidéo Interne) : la supprimer dans YouTube Studio → Contenu si elle ne doit plus y être.
