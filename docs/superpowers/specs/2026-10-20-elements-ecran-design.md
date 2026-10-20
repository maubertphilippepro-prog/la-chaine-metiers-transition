# Éléments à l'écran — conception

Date : 2026-10-20. Sous-projet C de l'ensemble ouvert par [la conception des consignes](2026-10-19-consignes-design.md) : de nouveaux éléments posés sur la vidéo montée, créés par une consigne, depuis le texte ou suggérés par l'analyse.

## Objectif

Pendant un passage choisi, l'auteur peut :

- **zoomer** sur une zone du partage d'écran ;
- **mettre en avant** une zone (le reste de l'image s'assombrit) ;
- **incruster un texte** court (URL, nom d'outil, raccourci clavier, chiffre clé) ;
- **passer la caméra en grand** (aparté face caméra).

Ces éléments se créent de trois façons : par une consigne (« zoome ici », « affiche l'URL »), directement depuis le menu du texte sélectionné, ou par une suggestion de l'analyse. Ils se retouchent ensuite dans un panneau dédié, sans repasser par Claude. La zone d'un zoom ou d'une mise en avant se trace toujours à la souris dans l'aperçu : ni Claude ni l'analyse ne voient l'image.

## Données

### `montage.json`

Nouveau champ `elements: Element[]`. Un montage enregistré sans ce champ est lu comme une liste vide ; la version reste 1.

```ts
// Pixels de source.mp4 (1920×1080).
interface Zone { x: number; y: number; largeur: number; hauteur: number }

type NatureElement = 'zoom' | 'miseEnAvant' | 'texte' | 'camera';
type PositionTexte = 'haut-gauche' | 'haut-droite' | 'centre' | 'bas-centre';
type StatutElement = 'a-valider' | 'valide' | 'ecarte';

type Element = { id: string; debut: number; fin: number; statut: StatutElement } & (
  | { nature: 'zoom'; zone: Zone | null }
  | { nature: 'miseEnAvant'; zone: Zone | null }
  | { nature: 'texte'; texte: string; position: PositionTexte }
  | { nature: 'camera' }
);
```

- `debut` et `fin` sont en secondes de `source.mp4`, comme les coupes et les chapitres. Un élément créé à partir de mots prend le début du premier mot et la fin du dernier.
- `zone: null` n'existe que pour une suggestion de l'analyse pas encore complétée. Un élément `valide` de nature `zoom` ou `miseEnAvant` a toujours une zone.
- Les ids sont uniques dans le montage : `e0`, `e1`… pour les éléments créés dans le studio, `se0`, `se1`… pour ceux issus des suggestions.

### `reglages.json`

Nouvelle rubrique `camera: { x, y, largeur, hauteur }` : la position de la vignette caméra dans la source, en pixels (par défaut `24, 786, 480, 270`, d'après [la scène OBS](../../obs-configuration.md)). Nouvelles bornes dans `elements` : `texteMaxCaracteres` (40), `dureeMin` (1 s), `zoomLargeurMin` (480 px, soit un zoom de 4× au plus).

### `analyse.json`

Nouveau champ `suggestions.elements: SuggestionElement[]`. Une analyse sans ce champ est lue comme une liste vide.

```ts
interface SuggestionElement {
  id: string;
  nature: 'zoom' | 'miseEnAvant' | 'texte';
  debut: number;
  fin: number;
  texte?: string;   // pour un texte
  raison: string;   // une phrase, affichée dans le studio
}
```

Le montage initial transforme chaque suggestion en élément `a-valider` : position `haut-gauche` pour un texte, `zone: null` pour un zoom ou une mise en avant. La raison reste lisible dans le studio via l'analyse (même id).

## Rendu de chaque nature

- **Zoom** : la couche vidéo s'agrandit et se recadre sur la zone, avec une entrée et une sortie adoucies d'environ 0,5 s. La zone est en 16:9. Le zoom reste stable à travers les coupes : pas de nouvelle entrée après un jump cut. Pendant le zoom, la vignette caméra est découpée dans la source (rectangle `reglages.camera`) et reposée à sa place, au-dessus de la vidéo zoomée.
- **Mise en avant** : hors de la zone, l'image s'assombrit (voile noir à 60 %) ; la zone reçoit un cadre rouge de la charte. Proportions libres. Entrée et sortie en fondu.
- **Texte** : une étiquette au fond bleu de la charte, texte blanc, filet rouge à gauche, à l'une des quatre positions. Les coins bas sont exclus (vignette caméra à gauche, logo à droite). Entrée et sortie comme les encarts.
- **Caméra** : la vignette passe à 2× (960×540), centrée ; derrière, l'écran est flouté et assombri. Transition d'environ 0,4 s.

La frise, le logo et les encarts de définition restent au-dessus de tout.

## Règles

Contrôlées par une seule fonction du noyau, utilisée par la vérification des consignes, par les retouches directes et par le contrôle avant rendu.

- **Durée** : au moins `dureeMin` à l'écran, une fois les coupes retirées. Un élément entièrement coupé ou devenu trop court est signalé au contrôle avant rendu.
- **Texte** : non vide, au plus `texteMaxCaracteres`.
- **Zone** : dans les limites de l'image ; pour un zoom, en 16:9 (à un pixel près) et d'une largeur d'au moins `zoomLargeurMin`.
- **Chevauchements refusés** (entre éléments `valide` ou `a-valider`, sur les temps de la source) :
  - deux « cadres » en même temps (zoom ou caméra) ;
  - une mise en avant pendant un zoom ou la caméra, car sa zone ne correspondrait plus à l'image ;
  - deux textes à la même position ;
  - un texte `haut-droite` pendant un encart de définition placé en haut.
- **Éléments `a-valider`** : ils bloquent le rendu, comme les termes à valider. Un élément `a-valider` sans zone ne peut pas être accepté.
- Les éléments `ecarte` sont ignorés partout.

## Consignes

Trois opérations rejoignent le vocabulaire de `noyau/consignes.ts` :

```ts
| { type: 'ajouterElement'; nature: NatureElement; premierMot: number; dernierMot: number;
    texte?: string; position?: PositionTexte; zone?: Zone }
| { type: 'modifierElement'; idElement: string; premierMot?: number; dernierMot?: number;
    texte?: string; position?: PositionTexte; zone?: Zone; statut?: StatutElement }
| { type: 'supprimerElement'; idElement: string }
```

- **Claude ne fournit jamais de zone.** Le champ `zone` des opérations est rempli par le studio quand l'auteur trace le rectangle sur une proposition.
- Une proposition `ajouterElement` de nature `zoom` ou `miseEnAvant` sans zone s'affiche avec la mention « Zone à tracer ». Son bouton « Tracer dans l'aperçu » ouvre le dessin ; « Accepter » reste grisé tant que la zone manque. La zone tracée est enregistrée dans la proposition, et l'acceptation revérifie l'opération complète.
- Pour un texte, `position` vaut `haut-gauche` si Claude ne la précise pas.
- `modifierElement` avec `statut` permet « accepte les textes suggérés » ; accepter une suggestion sans zone est refusé par la vérification.
- Le prompt d'interprétation reçoit la liste des éléments existants : id, nature, numéros du premier et du dernier mot couverts, texte, statut.
- Le contrôle de forme de `consignes.json` couvre les nouveaux champs (table `CHAMPS_OPERATION`, avec un genre de champ pour la zone et pour les énumérations).

## Suggestions de l'analyse

Le prompt de `pipeline/mtpipeline/suggestions.py` reçoit une quatrième rubrique, `elements`, avec la consigne d'être sélectif :

- **textes** : URL, noms d'outils, raccourcis clavier et chiffres clés prononcés. Pour chacun : premier et dernier numéro de mot, texte de 40 caractères au plus ;
- **moments à zoomer ou à mettre en avant** : quand l'auteur désigne un endroit de l'écran (« cliquez ici », « en haut à droite, vous voyez… »). Pour chacun : nature, premier et dernier numéro de mot, raison en une phrase.

La caméra n'est jamais suggérée. `convertir` écarte les numéros de mot invalides, tronque les textes trop longs et attribue les ids `se0`, `se1`…

## Studio

### Menu du texte sélectionné

Quatre entrées s'ajoutent à « Donner une consigne sur ce passage » : « Zoomer ici », « Mettre en avant », « Ajouter un texte », « Caméra en grand ». L'élément est créé directement au statut `valide`, sans passer par Claude :

- zoom ou mise en avant : le dessin de la zone s'ouvre aussitôt ; « Annuler » ne crée rien ;
- texte : un champ s'ouvre, prérempli avec les mots sélectionnés (tronqués à la longueur maximale), avec le choix de la position ;
- caméra : créée telle quelle.

Une création refusée par les règles affiche le problème et ne modifie pas le montage.

### Dessin de la zone

L'aperçu se met en pause au début de l'élément et affiche l'image sans cet élément. L'auteur tire un rectangle à la souris ; pour un zoom, le rectangle garde le 16:9 et ne descend pas sous la largeur minimale. « Valider » ou « Annuler ». Les coordonnées sont converties de l'aperçu vers les pixels de la source.

### Panneau « Éléments à l'écran »

Les éléments non écartés, par ordre d'apparition. Chaque ligne affiche la nature, un extrait du passage, le statut, la raison d'une suggestion et l'éventuel problème. Actions :

- « Écouter » et « Voir dans l'aperçu » ;
- « Accepter » et « Écarter » pour un élément à valider ;
- « Tracer » ou « Retracer » la zone ;
- modifier le texte et la position ;
- « Recaler sur la sélection » : reprend le passage sélectionné dans le texte ;
- « Supprimer ».

Chaque retouche passe par les règles ; un refus affiche le problème sans rien modifier.

### Ailleurs dans le studio

- **Repères dans le texte** : un fin soulignement de couleur sous les passages couverts par un élément, selon sa nature, avec la nature au survol.
- **Bandeau des suggestions** et **contrôle avant rendu** : ils comptent les éléments à valider et listent les problèmes (chevauchement, élément coupé ou trop court, zone manquante).
- **Mode d'emploi** : section « Éléments à l'écran » dans `docs/studio.md`.

## Remotion

- `noyau/decisions.ts` transforme les éléments `valide` en plages d'images de chaque partie, comme les encarts : les morceaux coupés sont retirés, les morceaux contigus dans le montage fusionnés en une seule plage.
- `VideoMontee` applique le zoom et la caméra en grand à la couche vidéo, et repose la vignette pendant un zoom.
- Composants `MiseEnAvant`, `TexteIncruste` et `CameraEnGrand` dans `remotion/composants/` ; le calcul de la transformation du zoom (zone → échelle et décalage, courbes d'entrée et de sortie) dans `remotion/calculs.ts`.
- `remotion/apercus.tsx` reçoit une composition de démonstration par nature, pour la vérification visuelle dans Remotion Studio.

## Tests

- **Noyau** : passage des temps à travers les coupes, fusion des morceaux contigus, chaque règle de chevauchement, durée et zone, vérification des trois opérations, contrôle de forme, montage initial à partir des suggestions, lecture d'un montage ou d'une analyse sans `elements`.
- **`remotion/calculs.ts`** : transformation de la zone, courbes d'entrée et de sortie du zoom.
- **Pipeline** : `convertir` (mots invalides, textes trop longs, ids), instantané du prompt mis à jour.
- **Studio** : routes de l'API (création, retouche, suppression, acceptation d'une proposition avec zone) et logique côté interface (conversion des coordonnées, contrainte 16:9).
- **Vérification visuelle** des quatre natures dans Remotion Studio.
- **Essai manuel** sur le tournage d'essai : analyse relancée pour voir les suggestions, consigne avec un vrai appel à Claude, création depuis le texte, dessin de zone, rendu complet.

## Hors périmètre

- Fichier caméra enregistré à part (caméra nette en plein cadre).
- Zoom qui suit la souris ou se déplace pendant le passage.
- Animations de texte variées, styles multiples.
- Suggestions qui regardent l'image (zones proposées par l'analyse).
- Suggestion de passages en caméra en grand.
