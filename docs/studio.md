# Studio de validation

Le studio sert à relire un tournage analysé, corriger les décisions de montage et lancer les rendus.

## Lancer

1. Analyser le tournage (voir le pipeline) : `cd pipeline; ..\.venv\Scripts\python -m mtpipeline.cli analyser ..\donnees\tournages\<dossier> --titre "<titre>"`.
2. À la racine du projet : `npm run validation`, puis ouvrir http://127.0.0.1:5180.

## Écran de montage

- **Texte** (à gauche) : les passages coupés sont barrés, avec une couleur par type (silence, hésitation, répétition, prise ratée, longueur, coupe manuelle). Les termes à définir sont surlignés en jaune, les longueurs proposées sur fond rose.
  - Cliquer un passage coupé : le rétablir (ou le recouper), l'écouter seul, le retrouver dans l'aperçu.
  - Cliquer un mot ou sélectionner un passage à la souris : le couper, l'écouter, le lire dans l'aperçu, y commencer un nouveau chapitre.
  - Chaque chapitre a son titre modifiable, « Commencer ici » (déplace son début sur le passage choisi) et « Fusionner avec le précédent ».
- **Aperçu** (à droite) : la vidéo complète ou chaque épisode, avec habillage, recalculés à chaque modification.
- **Longueurs proposées** : rien n'est coupé tant que la suggestion n'est pas acceptée (« Couper ») ou refusée (« Garder »).
- **Termes** : valider, écarter, corriger la définition (160 caractères au plus), placer l'encart en haut.

Chaque modification est enregistrée dans `montage.json` ; `analyse.json` n'est jamais modifié.

## Rendu

« Valider et lancer le rendu » est disponible quand la vidéo et chaque chapitre ont un titre, chaque terme est validé ou écarté et aucune longueur n'est en attente. Le studio ajoute alors les définitions validées à `donnees/glossaire.json`, passe le tournage au statut « Validé » et rend la vidéo complète et chaque épisode dans `rendus/`. Un rendu en échec peut être relancé seul ; le détail est dans `rendus/journal.txt`.
