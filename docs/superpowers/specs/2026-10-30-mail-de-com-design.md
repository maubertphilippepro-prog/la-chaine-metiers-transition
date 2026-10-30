# Mail de com — design

Date : 2026-10-30. Source : skill `sources/mailing-pole-metiers-transition.zip`.

## But

Pour une vidéo **Pro** rendue, préparer depuis le studio le mail HTML d'annonce aux collaborateurs CICAD (charte du Pôle Métiers & Transition, cellule QIU) : la vidéo est copiée sur SharePoint, Claude rédige le mail à partir de la transcription, le studio construit le HTML compatible Outlook et crée un brouillon Outlook. Un mail par vidéo (vidéo complète ou un épisode). Exception assumée à la règle « aucune mention d'organisation » : ce contenu est destiné à Ingérop, comme le site Replit.

## Approche

Les scripts et assets du skill sont repris tels quels dans `outils/mailing/` (`build_mail.py`, `screenshot.py`, `outlook_draft.ps1`, `assets/`, `references/redaction.md`, `references/syntaxe.md`, `examples/exemple-fico-there.md`). Le studio les lance avec le Python de `.venv`, comme pour le pipeline. Pas de réécriture du build en TypeScript.

## Interface

Panneau « Mail de com » sur la carte de publication d'une vidéo, visible si la vidéo est qualifiée **Pro** et que son rendu existe.

1. **Copier sur SharePoint** : copie `rendus/<vidéo>.mp4` vers `<dossierLocal>\<tournage>-<vidéo>.mp4` (ex. `2026-10-27-analyztech-en-mode-projet-video-complete.mp4`). Pas de nouvelle copie si un fichier de même taille existe déjà. Affiche l'URL Stream calculée, avec « Copier ».
2. **Notes** : champ libre facultatif (attente vis-à-vis du lecteur, liens, contexte) et images déposées dans `assets/`.
3. **Rédiger avec Claude** : produit `mail.md`. Entrées : paroles conservées (transcription moins les coupes), titre et description de publication, titres de chapitres, notes, noms des images, URL SharePoint, `redaction.md`, `syntaxe.md`, l'exemple FICO. Le mail contient un bloc `[[video: <titre> | <URL SharePoint>]]` dont la vignette est la vignette rendue de la vidéo. Une info manquante est écrite `[À COMPLÉTER]`, jamais inventée. Désactivé tant que la copie SharePoint n'est pas faite.
4. **Relecture** : `mail.md` modifiable dans un éditeur texte du panneau (enregistré à la volée). « Construire » lance `build_mail.py build` puis `screenshot.py`, et affiche `preview.html` et les captures bureau, mobile et Outlook. Un `[À COMPLÉTER]` restant est signalé.
5. **Créer le brouillon Outlook** : lance `outlook_draft.ps1 -BuildDir …`. N'envoie jamais. Disponible après un build réussi, plus récent que la dernière modification de `mail.md`. Un nouveau clic crée un nouveau brouillon ; le panneau rappelle que l'ancien reste dans Brouillons.

Toute action qui fait attendre affiche le sablier, comme le reste de la publication.

## URL SharePoint

`<site>/_layouts/15/stream.aspx?id=<encodeURIComponent("/sites/vitrin3/" + bibliotheque + "/" + fichier)>`, où `encodeURIComponent` est complété pour encoder aussi `-` et `.` comme dans l'URL copiée de Stream (`%2D`, `%2E`). La bibliothèque SharePoint s'appelle « Chane vido interne » (sans accents) alors que le dossier local est « Vitrin3 - Chaîne vidéo interne ».

## Réglages

`reglages.json` :

```json
"sharepoint": {
  "dossierLocal": "C:\\Users\\pmaubert\\INGEROP\\Vitrin3 - Chaîne vidéo interne",
  "site": "https://ingeropgroup.sharepoint.com/sites/vitrin3",
  "bibliotheque": "Chane vido interne"
}
```

## Stockage

Par vidéo : `publication/<complete|episode-NN>/mail/` du tournage, contenant `mail.md`, `notes.txt`, `assets/`, `build/`. Dans `publication.json`, pour la vidéo : `mail: { urlSharepoint, copieLe, redigeLe?, construitLe?, brouillonLe? }`.

## Erreurs

Dossier OneDrive absent, rendu absent, échec de Claude, échec du build ou des captures, Outlook classique indisponible (COM) : message sur le panneau, rien n'est perdu ni modifié. Sortie d'erreur des scripts journalisée dans `mail/journal.txt`.

## Tests

Vitest : calcul de l'URL (cas réel ci-dessus), nom du fichier copié, copie idempotente, construction du prompt (transcription sans les coupes, `[À COMPLÉTER]` demandé), routes API avec scripts et Claude simulés, visibilité du panneau (Pro + rendu). Essai réel une fois : build, captures et brouillon Outlook sur un tournage.

## Hors périmètre

Envoi automatique, destinataires gérés par le studio (on garde `a:`/`cc:`/`cci:` de `mail.md`), comms libres sans tournage, mail regroupant plusieurs vidéos, lien de partage SharePoint (on utilise l'URL calculée).
