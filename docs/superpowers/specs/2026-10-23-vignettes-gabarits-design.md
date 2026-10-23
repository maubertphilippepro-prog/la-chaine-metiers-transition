# Vignettes variées : logos, captures et gabarits — conception

Date : 2026-10-23. Complète [la conception de la publication](2026-10-20-publication-design.md) : la vignette n'a aujourd'hui qu'une mise en page (bande rouge, accroche à gauche, pose à droite, fond écran flouté ou formes de la charte), d'où des vignettes trop uniformes. L'auteur peut désormais y poser des **logos de logiciels** et des **captures** prises hors de l'app, puis choisir parmi plusieurs **gabarits** proposés en aperçu.

## Principe

1. L'auteur choisit les éléments : pose, fond, accroche (inchangés), jusqu'à 3 logos, jusqu'à 3 captures.
2. Le studio affiche côte à côte l'aperçu de chaque gabarit compatible avec ces éléments.
3. L'auteur clique sur un aperçu, puis rend la vignette comme aujourd'hui.

L'app ne prend pas de captures et ne les recadre pas : elle se contente de les mettre en valeur.

## Éléments

### Logos

- Banque locale `donnees/logos/` (PNG ou SVG, fond transparent de préférence), alimentée par l'auteur, servie comme `donnees/poses/`.
- Le nom du fichier sans extension est le nom du logiciel (`excel.png`, `chatgpt.svg`).
- La rédaction IA renvoie un nouveau champ `logiciels: string[]` : les logiciels et services nommés dans la vidéo. Le studio pré-coche les logos de la banque dont le nom correspond (comparaison sans casse, sans accents, sans espaces ni tirets), dans la limite de 3, tant que l'auteur n'a pas touché aux logos de cette vignette.
- Un logo est dessiné en **tuile** : carré blanc aux coins arrondis, ombre portée, logo centré avec une marge.

### Captures

- Dossier `captures/` du tournage (PNG ou JPEG) : l'auteur y dépose ses images, ou les glisse sur le panneau Vignette ; le studio les copie alors dans ce dossier (nom conservé, suffixe numérique si le nom existe).
- Le studio liste les captures en miniatures cliquables ; l'auteur en coche jusqu'à 3, dans l'ordre de clic.
- Une capture est dessinée en **carte** : image nette (non floutée), cadre blanc, coins légèrement arrondis, ombre, légère inclinaison fixée par le gabarit.

## Gabarits

Chaque gabarit est un composant Remotion qui place des briques partagées : `Fond`, `Pose`, `Accroche`, `TuileLogo`, `CarteCapture`, `LogoMT`. Positions et angles sont fixes par gabarit (aucun tirage au sort) : un même choix donne toujours la même vignette.

| Gabarit | Mise en page | Condition |
|---|---|---|
| `classique` | Mise en page actuelle : bande rouge, logo M&T, accroche à gauche, pose à droite. Logos et captures ignorés. | toujours |
| `vitrine` | Pose au centre, logos en tuiles flottant autour de la tête, accroche en bandeau en bas, fond dégradé de la charte (le fond choisi est ignoré). | au moins 1 logo |
| `demonstration` | Première capture en grande carte à gauche, premier logo épinglé dans son coin, pose à droite, accroche en bandeau sous la capture. | au moins 1 capture |
| `mosaique` | 2 ou 3 captures en éventail à gauche, pose à droite, accroche en haut à droite, premier logo en tuile s'il y en a un. | au moins 2 captures |

Une fonction pure du noyau décide des propositions :

```ts
type Gabarit = 'classique' | 'vitrine' | 'demonstration' | 'mosaique';
function gabaritsCompatibles(e: { logos: number; captures: number }, dejaUtilises: Gabarit[]): Gabarit[];
```

Elle renvoie les gabarits dont la condition est remplie ; ceux déjà utilisés par les autres vidéos de la même publication (complète, épisodes) passent en fin de liste, pour pousser à varier. Le gabarit retenu par défaut, quand l'auteur n'a pas encore cliqué, est le premier de la liste.

Chaque gabarit garde le logo Métiers & Transition et l'accroche en capitales ; la taille de l'accroche reste calculée par `tailleAccroche`, avec une largeur propre à chaque gabarit.

## Données

`Vignette` (noyau/publication.ts) gagne trois champs :

```ts
interface Vignette {
  pose: PoseVignette;
  fond: FondVignette;
  accroche: string;
  gabarit: Gabarit;
  logos: string[];     // fichiers de donnees/logos/, 3 au plus
  captures: string[];  // fichiers de captures/ du tournage, 3 au plus
  fichier: string | null;
}
```

- **Compatibilité** : à la lecture, une vignette sans ces champs reçoit `gabarit: 'classique'`, `logos: []`, `captures: []`. Le rendu des vignettes existantes ne change pas, et `publication.json` ne change pas de version.
- `raisonVignette` vérifie le gabarit (valeur connue), les listes (textes, 3 au plus).
- `cleVignette` inclut gabarit, logos et captures : en changer rend la vignette « à refaire ».
- `urlsVignette` renvoie aussi les adresses des logos et des captures ; `ProprietesVignette` les reçoit avec le gabarit.
- Si un logo ou une capture cochés ont disparu du disque, le studio le signale et le contrôle avant validation bloque (« Vignette : logo excel.png introuvable »).

## Studio

Panneau Vignette ([ChoixVignette.tsx](../../../studio/src/composants/ChoixVignette.tsx)), dans l'ordre :

1. Pose, fond, accroche : inchangés.
2. **Logos** : miniatures de la banque, cases à cocher, compteur « 2/3 ».
3. **Captures** : miniatures de `captures/`, zone de dépôt, compteur.
4. **Gabarits** : une rangée d'aperçus (`Thumbnail` Remotion, un par gabarit compatible), celui retenu encadré.
5. Rendu : inchangé.

Le serveur du studio ajoute : la liste des logos de la banque, la liste des captures d'un tournage, et le dépôt d'une capture.

## Tests

- `gabaritsCompatibles` : conditions de chaque gabarit, gabarits déjà utilisés relégués en fin de liste.
- Correspondance logiciels → logos (casse, accents, espaces, limite de 3).
- Lecture d'une ancienne vignette (champs absents → classique, listes vides) ; `raisonVignette` et `cleVignette` avec les nouveaux champs.
- Chaque gabarit se rend sans erreur avec le minimum et le maximum d'éléments (test e2e de rendu existant étendu).
- Dépôt d'une capture : copie dans `captures/`, nom déjà pris.

## Hors champ

Prise et recadrage de captures dans l'app, téléchargement automatique de logos, flèches et pastilles, tirage aléatoire des positions.
