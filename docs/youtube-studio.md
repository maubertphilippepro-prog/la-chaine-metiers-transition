# Mettre une vidéo en ligne avec YouTube Studio

Le studio prépare tout ; le téléversement se fait à la main dans YouTube Studio (https://studio.youtube.com), connecté au compte de la chaîne PMT. Les libellés ci-dessous sont ceux de l’interface en français ; YouTube les retouche de temps en temps : en cas d’écart, se fier au sens et corriger cette notice.

## Une fois pour toutes

1. **Vérifier la chaîne** : ouvrir https://www.youtube.com/verify, choisir un code par SMS et le saisir. Sans cette vérification, la miniature personnalisée est refusée.
2. **Réglages par défaut des mises en ligne** : YouTube Studio → Paramètres → paramètres par défaut de l’importation (selon la version : « Paramètres d’importation par défaut » ou « Paramètres par défaut pour les téléchargements »).
   - Onglet des informations de base : Visibilité « Privée » (on la change vidéo par vidéo).
   - Onglet « Paramètres avancés » : Catégorie « Science et technologie », Langue de la vidéo « Français ».
   - Enregistrer.
   - L’audience (« conçue pour les enfants ») se confirme à chaque vidéo : la cocher par erreur désactive commentaires, écrans de fin et playlists.
3. **Playlists** : rien à créer d’avance. Quand plusieurs vidéos d’un même tournage sont publiées, `reglages-youtube.txt` suggère une playlist au nom du tournage, créée au premier téléversement (étape « Détails » → Playlists → « Nouvelle playlist »).

## À chaque vidéo

1. Dans le studio, écran Publication : la vidéo doit être « Prête ». Cliquer **Préparer pour YouTube**. Le studio écrit `donnees/tournages/<tournage>/publication/<complete|episode-NN>/` (vignette, titre, description, tags, réglages) et affiche le chemin du MP4 dans `rendus/`. **Ouvrir le dossier** l’affiche dans l’Explorateur.
2. YouTube Studio → **Créer** → **Importer des vidéos** → sélectionner le MP4 indiqué.
3. Étape **Détails** :
   - Titre : bouton « Copier le titre » du studio, puis coller.
   - Description : « Copier la description » (chapitres compris), puis coller.
   - Miniature : « Importer un fichier » → `vignette.jpg` du dossier.
   - Playlists : celle indiquée dans `reglages-youtube.txt`, s’il y en a une.
   - Audience : « Non, elle n’est pas conçue pour les enfants ».
   - « Afficher plus » → Tags : « Copier les tags », puis coller (les virgules séparent les tags) ; vérifier la langue et la catégorie.
4. Étape **Éléments vidéo** : rien à ajouter (le carton de fin est déjà dans la vidéo).
5. Étape **Vérifications** : attendre la fin du contrôle des droits d’auteur ; en cas de signalement, ne pas publier et revoir la musique ou les images.
6. Étape **Visibilité** : selon le profil (voir ci-dessous), puis « Enregistrer » ou « Programmer ».
7. Copier le lien de la vidéo (affiché pendant le téléversement, ou « Partager » sur la vidéo) et le coller dans le studio, champ **URL de la vidéo sur YouTube**. Choisir la visibilité retenue (et la date si elle est programmée), puis **Enregistrer l’envoi**. La vidéo passe à « Envoyée sur YouTube » et le studio vérifie aussitôt ce que voit un visiteur sans compte.

## Parcours par profil

- **Interne** : Visibilité **Privée**, jamais « Non répertoriée » (un lien non répertorié est lisible par quiconque l’obtient). Le studio alerte si la vidéo est lisible publiquement. Elle sera ensuite relayée sur le site, fichier compris.
- **Perso** : **Publique**, ou **Programmer** avec la date et l’heure voulues. Rien n’est relayé sur le site.
- **Mixte** : **Publique** ou **Programmer**. Le relais sur le site n’est possible qu’une fois la vidéo lisible publiquement ; pour une vidéo programmée, attendre l’heure de mise en ligne puis cliquer « Vérifier la visibilité ».

## Cas courants

- **Modifier le titre, la description ou les tags d’une vidéo en ligne** : corriger dans le studio (la vidéo reste « Envoyée sur YouTube »), « Préparer pour YouTube » de nouveau, puis YouTube Studio → Contenu → la vidéo → Détails : recoller les champs et « Enregistrer ».
- **Remplacer la vignette** : rendre la nouvelle vignette dans le studio, « Préparer pour YouTube », puis dans Détails → Miniature → « Importer un fichier » → `vignette.jpg`, et « Enregistrer ».
- **Rattraper une erreur de visibilité** : YouTube Studio → Contenu → colonne Visibilité de la vidéo → choisir la bonne, « Enregistrer ». Dans le studio, recoller l’URL avec la visibilité corrigée (« Enregistrer l’envoi »), puis « Vérifier la visibilité ». Une vidéo Interne passée publique par erreur doit repasser en Privée immédiatement.
- **Mauvaise URL collée** : recoller la bonne et « Enregistrer l’envoi » ; l’ancienne est remplacée.
