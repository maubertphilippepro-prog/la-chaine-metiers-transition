# Suppression d'un tournage, remplacement de la vidéo et ordre de l'écran de montage — conception

Date : 2026-10-23. Retours de l'essai du plan 11 : une vidéo sans piste audio a fait échouer l'analyse, et l'auteur n'a pas pu changer le fichier, il a dû créer un autre tournage. Il veut aussi pouvoir supprimer un tournage (avec confirmation) et réordonner les panneaux de l'écran de montage.

## 1. Supprimer un tournage

- Dans la liste des tournages, chaque ligne a un bouton « Supprimer ». Un clic le remplace, dans la ligne, par « Supprimer « <titre> » ? », suivi de « Oui, supprimer » et « Annuler ». Aucune boîte de dialogue du navigateur.
- `DELETE /api/tournages/<nom>` **déplace** le dossier dans `donnees/tournages-supprimes/<nom>`. Si ce nom y existe déjà, il prend le suffixe `-2`, `-3`… Le tournage disparaît alors de la liste, et ses fichiers restent récupérables à la main. Le dossier `tournages-supprimes/` n'est jamais vidé par le studio.
- La suppression est refusée (409) pendant une analyse, un rendu ou un envoi de vidéo sur ce tournage. Le message nomme le travail en cours. Dans la liste, « Supprimer » est désactivé pendant une analyse de ce tournage.
- `donnees/tournages-supprimes/` est ajouté au `.gitignore`.

## 2. Remplacer la vidéo d'un tournage en erreur au premier chargement

- Cas visé : statut « Erreur » et aucune analyse faite (pas d'`analyse.json`), avec une vidéo dans `bruts/`. C'est l'état `erreur` de `etatTournage` : par exemple une vidéo sans piste audio, ou dans un format illisible.
- La ligne garde « Relancer l'analyse » et gagne « Remplacer la vidéo ». Ce bouton ouvre le choix d'un fichier ; on peut aussi glisser la vidéo sur la ligne. Le fichier passe par la même validation que dans « Nouveau tournage » (`raisonFichierVideo`).
- Enchaînement, avec la progression de l'envoi dans la ligne :
  1. `DELETE /api/tournages/<nom>/video` retire les vidéos du montage de `bruts/`, mais garde l'enregistrement `-camera`. Il retire aussi les fichiers tirés de l'ancienne vidéo : `source.mp4`, `preparation.json`, `transcription.json`, `detections.json`, `suggestions.json`.
  2. `PUT /api/tournages/<nom>/video?fichier=…` envoie la nouvelle vidéo (route existante).
  3. `POST /api/tournages/<nom>/analyse` relance l'analyse avec le titre du tournage (`titreParDefaut`, route existante).
- `DELETE …/video` est refusé (409) si le tournage n'est pas dans ce cas : déjà analysé, pas en erreur, analyse ou envoi en cours.
- Un échec s'affiche dans la ligne. Si la vidéo a été retirée mais l'envoi a échoué, la ligne montre « Vidéo manquante ». Le tournage n'a alors plus de vidéo et n'est plus en erreur au sens de `etatTournage`. L'auteur peut le supprimer et en recréer un.

## 3. Ordre de l'écran de montage

Colonne de droite (`EcranMontage`), de haut en bas : aperçu vidéo, éléments à l'écran, longueurs proposées, termes, consignes, rendu. Le bandeau « Relancer les suggestions », affiché seulement quand les suggestions de Claude ont échoué, reste au-dessus de l'aperçu. Les panneaux eux-mêmes ne changent pas.

## Erreurs

| Cas | Comportement |
|---|---|
| Suppression pendant une analyse, un rendu ou un envoi sur ce tournage | 409 avec le travail en cours nommé, message dans la liste |
| Remplacement d'un tournage hors du cas visé | 409 |
| Fichier non vidéo pour le remplacement | Refusé dans la ligne, rien d'envoyé ni retiré |
| Envoi de la nouvelle vidéo interrompu | Message dans la ligne ; la ligne montre ensuite « Vidéo manquante » |

## Tests

- **Serveur** (vitest) :
  - suppression : déplacement vers `tournages-supprimes/` avec suffixe en cas de doublon, tournage absent de la liste ensuite, refus pendant une analyse, un rendu ou un envoi, 404 pour un tournage inconnu ;
  - retrait de la vidéo : vidéo et fichiers intermédiaires retirés, `-camera` gardé, refus pour un tournage analysé, sans erreur, ou dont l'analyse ou l'envoi est en cours.
- **Client** : logique pure décidant des actions d'une ligne (« Remplacer la vidéo » seulement dans l'état `erreur`).
- **Essai réel** : supprimer un tournage d'essai et le retrouver dans `donnees/tournages-supprimes/` ; remplacer la vidéo d'un tournage en erreur (vidéo sans son) par une vidéo correcte, jusqu'à « Analysé » ; vérifier l'ordre des panneaux.

## Hors périmètre

Restauration d'un tournage supprimé depuis le studio, vidage de `tournages-supprimes/`, remplacement de la vidéo d'un tournage déjà analysé.
