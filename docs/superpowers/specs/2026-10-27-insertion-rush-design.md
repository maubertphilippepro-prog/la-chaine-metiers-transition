# Insérer un rush dans un tournage — conception

Date : 2026-10-27. Retour du montage de « mon premier skill delos ». Une fois l'analyse faite et le montage commencé, l'auteur s'aperçoit qu'il manque un morceau : un chapitre oublié, une intro à refaire ou une outro. Aujourd'hui, il n'a pas d'autre choix que de créer un nouveau tournage, et il perd alors tout le montage. Il veut tourner ce morceau à part (un « rush ») et l'insérer à l'endroit voulu du texte, sans perdre les coupes, chapitres, termes, éléments et consignes déjà en place.

Le rush est un vrai morceau de vidéo, plusieurs minutes en général, et non une retouche de quelques mots.

## Principe

`source.mp4` reste l'unique vidéo du tournage et le montage reste dans l'ordre de la source : le studio ne sait pas déplacer un passage. Insérer un rush revient donc à reconstruire `source.mp4` avec le rush au point d'insertion, puis à décaler de la durée du rush tout ce qui vient après. Le rush est analysé seul, et son analyse est fusionnée dans celle du tournage.

Pour **refaire une intro**, on insère la nouvelle au début, puis on coupe l'ancienne à la souris dans le texte. Pour **remplacer un passage**, on fait de même : insertion, puis coupe de l'ancien.

## 1. Usage dans le studio

- Dans la barre de sélection du texte (un mot ou un passage choisi), deux boutons :
  - **« Insérer un rush avant »** : le point d'insertion T est la fin du mot qui précède la sélection, ou 0 si la sélection commence au premier mot. C'est ce qui sert pour une intro.
  - **« Insérer un rush après »** : T est la fin du dernier mot sélectionné. Sélectionner le dernier mot du texte donne l'outro.
- Chaque bouton ouvre, dans la barre, un petit formulaire :
  - le fichier (choisi, ou glissé sur le formulaire), validé comme dans « Nouveau tournage » (`raisonFichierVideo`) ;
  - le titre du chapitre du rush (par défaut « Nouveau chapitre ») ;
  - un rappel : « Insertion à 2:34, après « … dernier mot ». Comptez quelques minutes. » ;
  - « Insérer » et « Annuler ».
- « Insérer » attend que le montage soit enregistré (`enregistrement === 'a-jour'`), envoie le fichier avec sa progression, puis lance l'insertion. L'écran de montage est alors remplacé par un écran d'attente (sablier `Attente`) qui donne l'étape en cours : préparation, transcription, repérage des coupes, suggestions, reconstruction de la vidéo. Aucune modification n'est possible pendant ce temps.
- À la fin, le tournage est rechargé. Le texte montre le rush à sa place, avec ses coupes et son chapitre. L'aperçu se cale sur le début du rush.
- En cas d'échec, le message s'affiche et le tournage est rechargé tel qu'avant : rien n'a été modifié (voir §4).

## 2. Serveur

- `PUT /api/tournages/<nom>/rush?fichier=…` dépose le fichier dans `rushs/` du tournage. Il ne va pas dans `bruts/`, que la préparation concatène. Un nom déjà pris reçoit le suffixe `-2`, `-3`…
- `POST /api/tournages/<nom>/rush` avec `{ fichier, t, titre }` lance l'insertion par le suivi des analyses (`SuiviAnalyse`). Il ne peut donc y avoir qu'un seul travail lourd à la fois. La liste des tournages montre « Insertion d'un rush » comme une analyse en cours.
- Refus (409) :
  - pendant une analyse (de n'importe quel tournage), un rendu ou un envoi sur ce tournage ;
  - si le tournage n'est pas analysé (pas d'`analyse.json`) ;
  - si T sort de [0, durée].
- L'écran d'attente interroge l'état du suivi, comme la liste des tournages, jusqu'à la fin.
- Le statut du tournage passe à « en validation » s'il était « validé » ou « rendu » : les rendus existants ne correspondent plus au montage. Ils restent dans `rendus/` jusqu'au prochain rendu. `publication.json` n'est pas modifié. Si une vidéo du tournage est déjà « Prête » ou envoyée, le formulaire avertit que la publication devra être refaite.

## 3. Pipeline : `mtpipeline inserer <dossier> <rush> --a T --titre "<titre>"`

Le numéro N du rush vaut 1 pour le premier inséré, puis 2, etc.

1. **Analyse du rush seul**, dans un dossier de travail `rushs/<N>/` :
   - préparation en 1920×1080, à la cadence de la source, l'audio suivant ses horodatages ;
   - transcription ;
   - détection des coupes, avec les paroles des hésitations ;
   - suggestions de Claude (termes, longueurs, éléments à l'écran) sur les mots du rush. Le glossaire est lu comme pour une analyse. Les suggestions de chapitres sont ignorées, puisque le chapitre est donné par l'auteur. Un échec des suggestions n'arrête pas l'insertion : le rush est inséré sans suggestions, et le message est montré à la fin.
2. **Sauvegarde** dans `historique/<horodatage>-rush-<N>/` de `source.mp4` et de tous les JSON du tournage (y compris `montage.json` et `consignes.json`).
3. **Nouvelle source** : `source[0, T] + rush + source[T, fin]`, en un seul passage ffmpeg (`trim`/`atrim` + `concat`), réencodée comme dans la préparation. La durée d du rush est celle de sa vidéo préparée.
4. **Décalage** de tout ce qui est après T, par la fonction de temps f(t) = t si t ≤ T, sinon t + d. On réutilise `decaler_tournage` du recalage, appliqué à :
   - la transcription, les détections et les suggestions ;
   - le montage : coupes, chapitres, occurrences des termes, éléments.

   Cas limites :
   - un intervalle (coupe, élément, longueur proposée) qui commence avant T et finit après est **scindé**. La partie avant T garde son identifiant ; la partie après, décalée, prend `<id>-suite`. Un élément scindé dont une partie fait moins d'1 s à l'écran sera signalé par les règles habituelles ;
   - un chapitre qui commence exactement en T reste après le rush : le rush s'insère avant lui.
5. **Fusion de l'analyse du rush**, décalée de T :
   - **mots** : tous les mots sont renumérotés dans l'ordre du temps, car le studio suppose des identifiants croissants (`passageEnTemps`, `extraitPassage`). La table ancien → nouveau est appliquée aux consignes : ancrage, `premierMot`, `dernierMot`, `premierMotChapitre`, `nouveauPremierMot`, `mots` ;
   - **détections et suggestions** du rush : identifiants préfixés `r<N>-` (`r1-d4`, `r1-l0`, `r1-se2`), pour ne jamais rencontrer ceux du tournage, y compris après « Relancer les suggestions ».
6. **Montage** :
   - ajout des coupes du rush (détections actives sauf hésitations à paroles, longueurs en attente), comme pour un montage initial ;
   - ajout de ses termes suggérés, sauf ceux déjà présents : un terme connu reçoit seulement les nouvelles occurrences ;
   - ajout de ses éléments suggérés, à valider ;
   - ajout d'un chapitre en T, au titre donné. Si T coupait un chapitre (T n'est pas le début d'un chapitre), on ajoute aussi un chapitre en T + d qui reprend le titre du chapitre coupé, pour que la suite y reste. Avec T = 0, le chapitre du rush devient le premier, et l'ancien premier chapitre commence en d.
7. `preparation.json` (durée, marque `audioHorodate`) et `analyse.json` sont réécrits. Le dossier de travail `rushs/<N>/` est gardé, avec le fichier du rush.

## 4. Sûreté

- Tout est préparé avant d'écrire dans le tournage : analyse du rush, nouvelle source dans un fichier temporaire, JSON décalés en mémoire. Les fichiers du tournage ne sont remplacés qu'à la fin, `source.mp4` en dernier, chacun par écriture puis renommage.
- Un échec avant cette dernière étape ne change rien au tournage. Un échec pendant (rare : disque plein…) laisse la sauvegarde de l'étape 2 : le message indique son dossier pour une remise à la main.
- Annuler une insertion réussie n'est pas prévu dans le studio. La sauvegarde de `historique/` permet de revenir en arrière à la main.

## Erreurs

| Cas | Comportement |
|---|---|
| Fichier non vidéo, ou enregistrement « -camera » | Refusé dans le formulaire, rien n'est envoyé |
| Rush sans piste audio ou de mauvais format | Message de la préparation (comme une analyse), tournage inchangé |
| Analyse, rendu ou envoi en cours | 409, message dans la barre |
| Montage pas encore enregistré | « Insérer » attend l'enregistrement ; en cas d'échec d'enregistrement, l'insertion n'est pas lancée |
| Échec des suggestions de Claude sur le rush | Rush inséré sans suggestions, message à la fin |
| Studio fermé pendant l'insertion | Tournage inchangé (rien n'est remplacé avant la fin) ; le dossier `rushs/<N>/` peut rester et sera écrasé à la prochaine insertion |

## Tests

- **Pipeline** (pytest) :
  - fonction de décalage : avant, après et exactement en T ; intervalle scindé et son `-suite` ;
  - renumérotation des mots et application aux consignes ;
  - préfixe des identifiants du rush ;
  - chapitres : T au milieu d'un chapitre, T en début de chapitre, T = 0, T = fin ;
  - commande complète sur deux petites vidéos de test : durée de la nouvelle source = source + rush, mots du rush à leur place, sauvegarde présente, tournage intact quand la préparation du rush échoue.
- **Serveur** (vitest) : dépôt dans `rushs/` avec suffixe, refus 409 (analyse ou rendu en cours, tournage non analysé, T hors durée), retour du statut à « en validation ».
- **Client** : logique pure du point d'insertion (avant ou après une sélection, premier et dernier mot).
- **Essai réel** : sur `2026-10-essai`, insérer un rush d'une minute au milieu d'un chapitre. Vérifier que :
  - les coupes et éléments d'après sont décalés ;
  - les deux chapitres sont créés ;
  - les consignes visent toujours les bons mots ;
  - l'aperçu et un rendu d'épisode sont corrects.

  Puis insérer une intro (T = 0) et couper l'ancienne.

## Hors périmètre

Déplacer ou réordonner des passages, supprimer un rush inséré depuis le studio, insérer plusieurs rushs en une fois, recaler les rendus ou la publication existants.
