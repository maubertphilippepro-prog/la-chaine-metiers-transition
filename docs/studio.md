# Studio de validation

Le studio sert à relire un tournage analysé, corriger les décisions de montage et lancer les rendus.

## Lancer

1. Analyser le tournage (voir le pipeline) : `cd pipeline; ..\.venv\Scripts\python -m mtpipeline.cli analyser ..\donnees\tournages\<dossier> --titre "<titre>"`.
2. À la racine du projet : `npm run validation`, puis ouvrir http://127.0.0.1:5180 dans Chrome ou Edge. Le navigateur intégré de VS Code ne décode pas le son AAC de `source.mp4` : l’aperçu n’y fait entendre que le jingle et le tapis.

## Écran de montage

- **Texte** (à gauche) : les passages coupés sont barrés, avec une couleur par type (silence, hésitation, répétition, prise ratée, longueur, coupe manuelle). Les termes à définir sont surlignés en jaune, les longueurs proposées sur fond rose.
  - Cliquer un passage coupé : le rétablir (ou le recouper), l'écouter seul, le retrouver dans l'aperçu.
  - Cliquer un mot ou sélectionner un passage à la souris : le couper, l'écouter, le lire dans l'aperçu, y commencer un nouveau chapitre, y donner une consigne, y poser un élément à l’écran.
  - Chaque chapitre a son titre modifiable, « Commencer ici » (déplace son début sur le passage choisi) et « Fusionner avec le précédent ».
- **Aperçu** (à droite) : la vidéo complète ou chaque épisode, avec habillage, recalculés à chaque modification.
- **Longueurs proposées** : rien n'est coupé tant que la suggestion n'est pas acceptée (« Couper ») ou refusée (« Garder »).
- **Termes** : valider, écarter, corriger la définition (160 caractères au plus), placer l'encart en haut.

Chaque modification est enregistrée dans `montage.json` ; `analyse.json` n’est jamais modifié par le studio : seul « Relancer les suggestions » (dans le bandeau) fait réécrire ce fichier par le pipeline.

## Consignes

Le panneau **Consignes** (sous l’aperçu) accepte une consigne écrite librement : « coupe tout le passage sur Excel », « renomme le chapitre 2 en … », « ajoute une définition pour prompt ». Pour viser un passage, le sélectionner dans le texte puis choisir « Donner une consigne sur ce passage ».

- « Envoyer » (ou Ctrl+Entrée) : Claude reformule la consigne (« J’ai compris : … ») et la traduit en opérations du studio (couper, rétablir une coupe, décider d’une longueur, renommer, ajouter, déplacer ou fusionner un chapitre, modifier ou ajouter un terme, changer le titre, poser, modifier ou retirer un élément à l’écran). Ce qu’aucune opération ne permet est listé dans « Pas réalisable ».
- Rien ne change tant qu’une proposition n’est pas acceptée. Chacune peut être acceptée ou refusée, écoutée et vue dans l’aperçu quand elle porte sur un passage ; « Tout accepter » et « Tout refuser » traitent toutes celles en attente.
- Une proposition qui ne s’applique plus au montage (par exemple parce qu’une autre a été refusée) passe « invalide » avec la raison ; elle ne bloque pas le rendu. Une proposition en attente bloque « Valider et lancer le rendu ».
- Les consignes précédentes restent consultables (pastille rouge : propositions encore en attente).

Les consignes sont enregistrées dans `consignes.json`, à côté de `montage.json`. L’appel à Claude demande la clé `ANTHROPIC_API_KEY`, lue comme pour l’analyse dans la variable d’environnement ou dans le fichier `.env` à la racine du projet ; le modèle est celui de `reglages.json` (`modeles.claude`).

## Éléments à l’écran

Quatre éléments peuvent être posés sur la vidéo pendant un passage : un **zoom** sur une zone du partage d’écran, une **mise en avant** (le reste de l’image s’assombrit, la zone reçoit un cadre rouge), un **texte incrusté** court (URL, nom d’outil, raccourci clavier, chiffre clé ; 40 caractères au plus) et la **caméra en grand** (la vignette passe au centre, deux fois plus grande, l’écran derrière est flouté).

- **Depuis le texte** : sélectionner un passage, puis « Zoomer ici », « Mettre en avant », « Ajouter un texte » (prérempli avec les mots sélectionnés, position au choix) ou « Caméra en grand ». L’élément est créé directement, validé.
- **Tracer une zone** : pour un zoom ou une mise en avant, l’aperçu se met en pause au début du passage ; tirer un rectangle à la souris (en 16:9 pour un zoom, 480 pixels de large au moins), puis « Valider » ou « Annuler ».
- **Par une consigne** : « zoome ici », « affiche l’URL », « accepte les textes suggérés »… Claude ne voit pas l’image : une proposition de zoom ou de mise en avant affiche « Zone à tracer » ; « Tracer dans l’aperçu » ouvre le tracé, et « Accepter » n’est possible qu’une fois la zone tracée.
- **Suggestions de l’analyse** : Claude propose les textes à incruster et les moments où l’auteur désigne l’écran. Elles arrivent « à valider », avec leur raison ; une suggestion de zoom ou de mise en avant attend sa zone.

Le panneau **Éléments à l’écran** liste les éléments par ordre d’apparition : écouter, voir dans l’aperçu, accepter ou écarter une suggestion, tracer ou retracer la zone, modifier le texte et sa position, « Recaler sur la sélection » (reprend le passage sélectionné dans le texte), supprimer. Dans le texte, un soulignement de couleur repère les passages couverts (bleu : zoom, orange : mise en avant, vert : texte, violet : caméra), avec la nature au survol.

Règles vérifiées à chaque création ou retouche (un refus s’affiche sans rien modifier) : au moins 1 s à l’écran une fois les coupes retirées ; un seul zoom ou caméra en grand à la fois ; pas de mise en avant pendant un zoom ou la caméra en grand ; deux textes simultanés à des positions différentes ; pas de texte en haut à droite pendant un encart de définition placé en haut. Les textes ne se placent pas dans les coins bas (vignette caméra à gauche, logo à droite). La position de la vignette caméra dans la source se règle dans `reglages.json` (`camera`).

## Rendu

« Valider et lancer le rendu » est disponible quand la vidéo et chaque chapitre ont un titre, chaque terme est validé ou écarté, aucune longueur n'est en attente, aucune proposition de consigne n'attend de décision et aucun élément à l’écran n’est à valider ni en défaut. Le studio ajoute alors les définitions validées à `donnees/glossaire.json`, passe le tournage au statut « Validé » et rend la vidéo complète et chaque épisode dans `rendus/`. Un rendu en échec peut être relancé seul ; le détail est dans `rendus/journal.txt`.

## Publication

Une fois le tournage rendu, le lien **Publication →** de l’en-tête ouvre l’écran de publication. Chaque vidéo rendue (vidéo complète, épisodes) y a sa carte ; seules les vidéos cochées sont préparées.

- **Qualification** : *Nature* (Pro ou Perso) et case *Confidentielle* ; l’app en déduit la diffusion, résumée sous les contrôles. Pro confidentielle : rien sur YouTube, fichier envoyé sur le site, réservé aux comptes autorisés. Pro non confidentielle : Non répertoriée sur YouTube, puis lien YouTube sur le site, visible de tous. Perso confidentielle : Privée sur YouTube, rien sur le site. Perso non confidentielle : Publique ou Programmée sur YouTube, rien sur le site. La qualification par défaut s’applique aux vidéos qui suivaient la précédente, sauf celles déjà sur le site. Passer en Perso une vidéo déjà sur le site demande confirmation et la retire du site.
- **Textes** : « Proposer les textes avec Claude » remplit le titre (avec deux variantes), la description, les tags et trois accroches de vignette, à partir des paroles conservées. Tout se corrige à la main. Les chapitres de la vidéo complète sont ajoutés à la description automatiquement (au moins 3 chapitres de 10 s).
- **Vignette** : choisir une pose (photo de `donnees/poses/`, détourée automatiquement, ou caméra séparée à l’image affichée dans le lecteur), un fond (formes de la charte, ou écran à l’image affichée) et une accroche ; l’aperçu suit chaque choix. « Rendre la vignette » produit le JPEG 1280×720 dans `rendus/vignettes/`.
- **Valider pour la publication** vérifie titre, description, tags, vignette rendue et, pour une vidéo envoyée sur YouTube (même privée ou non répertoriée), l’absence de mention interdite ; la vidéo passe alors à « Prête ». Toute modification ultérieure la ramène à « À préparer ».

- **YouTube** (vidéo « Prête » qui va sur YouTube) : « Préparer pour YouTube » écrit dans `publication/<complete|episode-NN>/` la vidéo à téléverser, la vignette et `youtube.txt` (titre, description, tags et réglages à choisir), après les contrôles avant envoi (rendu présent, vignette de 2 Mo au plus, limites de YouTube, mentions interdites). Les boutons « Copier » mettent chaque champ dans le presse-papiers, « Ouvrir le dossier » l’affiche dans l’Explorateur. Une fois la vidéo téléversée, coller son URL, indiquer la visibilité (celle déduite de la qualification : Non répertoriée, Privée, ou Publique ou Programmée) et « Enregistrer l’envoi » : la vidéo passe à « Envoyée sur YouTube ». « Vérifier la visibilité » interroge l’adresse publique oEmbed de YouTube, sans compte Google, et alerte si une vidéo privée est lisible publiquement ou si une vidéo non répertoriée ou publique ne l’est pas encore. Pas à pas dans YouTube Studio : [youtube-studio.md](youtube-studio.md).

- **Replit** (vidéo Pro « Prête ») : panneau du site. La catégorie (obligatoire) et la playlist (facultative, parmi celles de la catégorie) se choisissent dans ce panneau, lues sur le site ; « Relayer sur le site » y publie la vidéo. *Pro confidentielle* : le fichier vidéo et la vignette sont envoyés dans le stockage du site, la vidéo n’est visible que des comptes autorisés ; le relais n’attend pas YouTube. *Pro non confidentielle* : la vidéo YouTube est intégrée au site, visible de tous, une fois l’envoi YouTube enregistré et la vidéo lisible par lien (vérifié au moment du relais). Les contrôles avant envoi s’appliquent. La vidéo passe à « Relayée sur le site » ; un nouveau relais met à jour la même vidéo (et renvoie le fichier d’une vidéo Pro confidentielle). Une vidéo passée en Perso alors qu’elle est sur le site n’affiche plus que « Retirer du site » tant que le retrait n’a pas réussi. Si le site est injoignable ou refuse la clé, l’erreur s’affiche sur la carte et rien n’est perdu. Il faut dans `.env` : `REPLIT_SITE_URL` (adresse du site) et `REPLIT_API_KEY` (égale au secret `AUTOMATION_API_KEY` du site).
- **Attente** : toute action qui fait attendre (rédaction par Claude, rendu de la vignette, préparation du dossier YouTube, vérification, relais ou retrait du site, enregistrement) affiche un sablier à côté de son libellé ; le bouton qui l’a lancée reste désactivé jusqu’à la fin.

Tout est enregistré dans `publication.json` du tournage.
