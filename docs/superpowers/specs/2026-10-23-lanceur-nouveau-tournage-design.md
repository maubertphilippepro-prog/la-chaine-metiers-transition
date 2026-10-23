# Lanceur et nouveau tournage — conception

Date : 2026-10-23. Aujourd'hui, utiliser l'app demande deux lignes de commande : `mtpipeline analyser` dans `pipeline/` pour chaque tournage, puis `npm run validation`. L'auteur veut s'en passer : une **icône sur le bureau** ouvre le studio, et un bouton **« Nouveau tournage »** crée le tournage à partir de la vidéo (exportée de Clipchamp) et lance l'analyse.

## Principe

1. Double-clic sur l'icône « Métiers & Transition » : le studio démarre et s'ouvre dans le navigateur.
2. « Nouveau tournage » : glisser la vidéo, saisir le titre ; le studio crée le dossier, copie la vidéo et lance l'analyse.
3. La liste des tournages montre l'avancement de l'analyse ; une fois finie, le tournage s'ouvre comme aujourd'hui.

Le pipeline Python n'est pas modifié : il est appelé par `lancerPipeline` (`studio/serveur/pipeline.ts`), comme pour « Relancer les suggestions ». Son analyse reprend déjà là où elle s'était arrêtée, chaque étape écrivant son fichier.

## 1. Lanceur

- Script `outils/lanceur.ps1` :
  - si `http://127.0.0.1:5180` répond, ouvre seulement cette adresse dans le navigateur par défaut ;
  - sinon, démarre `npm run validation` à la racine du projet dans une fenêtre PowerShell **réduite**, titrée « Studio M&T — ne pas fermer », attend que le studio réponde (30 s au plus, puis message d'erreur dans une boîte de dialogue Windows) et ouvre l'adresse.
- Fermer la fenêtre réduite arrête le studio. Pas d'icône dans la zone de notification.
- Script `outils/installer-raccourci.ps1`, lancé une fois : crée sur le bureau le raccourci « Métiers & Transition » vers `powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File <projet>\outils\lanceur.ps1`, avec l'icône `outils/metiers-transition.ico`.
- `outils/metiers-transition.ico` (16 à 256 px) est généré une fois à partir de `public/logo/metiers-transition.svg` et versionné.

## 2. Nouveau tournage

Sur la page **Tournages**, un bouton « Nouveau tournage » ouvre un encadré :

- **Vidéo** : zone de glisser-déposer, ou bouton « Choisir un fichier ». Extensions acceptées : `.mp4`, `.mkv`, `.mov`, `.webm` (celles du pipeline) ; un autre fichier est refusé avec un message, sans rien envoyer.
- **Titre** (obligatoire) et **date** (aujourd'hui par défaut).
- « Créer et analyser » :
  1. `POST /api/tournages` `{ titre, date }` crée `donnees/tournages/<AAAA-MM-JJ>-<titre simplifié>/bruts/` (minuscules, sans accents, mots séparés par des tirets, 50 caractères au plus) ; si le nom existe, suffixe `-2`, `-3`… Réponse : le nom du dossier.
  2. `PUT /api/tournages/<nom>/video?fichier=<nom du fichier>` reçoit la vidéo en flux et l'écrit dans `bruts/` (aucun chargement en mémoire). Une barre de progression suit l'envoi (progression de `XMLHttpRequest`). Refus si le tournage a déjà une vidéo dans `bruts/` ou si l'extension n'est pas acceptée. Un envoi interrompu supprime le fichier partiel.
  3. `POST /api/tournages/<nom>/analyse` `{ titre }` lance l'analyse (voir §3).
- Un échec à l'étape 1 ou 2 s'affiche dans l'encadré ; le dossier déjà créé reste, et le tournage apparaît dans la liste avec « Analyser » une fois une vidéo déposée (sinon : « Vidéo manquante »).

## 3. Analyse suivie

- `POST /api/tournages/<nom>/analyse` `{ titre }` lance `mtpipeline analyser <dossier> --titre <titre>` en arrière-plan et répond aussitôt (202). **Une seule analyse à la fois** : une deuxième demande est refusée (409, « Une analyse est déjà en cours : <titre> »).
- Le serveur garde en mémoire l'analyse en cours (nom, titre, début) et, à la fin, l'erreur éventuelle (la sortie d'erreur du pipeline, déjà reprise par `lancerPipeline`).
- `GET /api/tournages` ajoute à chaque résumé :
  - `analyseEnCours: boolean` ;
  - `etapeAnalyse` : déduite des fichiers présents — `preparation` (aucun), `transcription` (`preparation.json`), `detections` (`transcription.json`), `suggestions` (`detections.json`) ;
  - `videoPresente: boolean` (un fichier vidéo dans `bruts/`).
- Liste des tournages :
  - analyse en cours : sablier (`Attente`) et libellé de l'étape (« Préparation de la vidéo », « Transcription », « Repérage des coupes », « Suggestions de Claude ») ; la liste se rafraîchit toutes les 3 s tant qu'une analyse est en cours ;
  - fin : statut « Analysé », titre cliquable (comportement actuel) ;
  - erreur : message d'`episode.json` et bouton « Relancer l'analyse » ;
  - jamais analysé (studio fermé pendant l'analyse, ou dossier créé à la main) avec une vidéo : bouton « Analyser » et champ titre prérempli (titre d'`episode.json`, sinon nom du dossier sans la date) ;
  - les boutons « Analyser » et « Relancer l'analyse » sont désactivés pendant qu'une autre analyse tourne.
- Fermer le studio arrête l'analyse en cours ; elle reprendra à « Analyser », sans refaire les étapes finies.

## Erreurs

| Cas | Comportement |
|---|---|
| Fichier non vidéo déposé | Refusé dans l'encadré, rien d'envoyé |
| Titre vide | « Créer et analyser » désactivé |
| Disque plein, envoi coupé | Message dans l'encadré, fichier partiel supprimé |
| Analyse déjà en cours | Boutons désactivés ; 409 si la demande arrive quand même |
| Échec du pipeline | Statut « Erreur », message, « Relancer l'analyse » |
| Studio injoignable au lancement | Boîte de dialogue : « Le studio n'a pas démarré », avec la fin du journal |

## Tests

- **Serveur** (vitest, pipeline simulé) : nom du dossier (accents, longueur, doublon), création ; dépôt de la vidéo en flux, refus d'extension, refus d'une seconde vidéo, suppression du fichier partiel ; lancement de l'analyse, 409 pendant une analyse, étape déduite des fichiers, erreur conservée.
- **Client** : logique pure (validation du fichier, libellés d'étape) en tests unitaires.
- **Essai réel** : créer le raccourci, double-clic studio arrêté puis studio lancé, nouveau tournage avec une vidéo Clipchamp courte jusqu'à « Analysé ».

## Hors périmètre

Application Windows dédiée, icône dans la zone de notification, file d'attente de plusieurs analyses, liste des vidéos récentes de Téléchargements, démarrage automatique avec Windows.
