# Consignes à Claude pour la vignette — conception

Date : 2026-10-28. Complète [les vignettes variées](2026-10-23-vignettes-gabarits-design.md). Aujourd'hui l'auteur compose seul la vignette (pose, fond, logos, captures, gabarit, accroche) ; Claude ne fournit que les accroches et la liste des logiciels lors de la rédaction. L'auteur veut écrire une consigne libre (« mets en avant le planning, ton plus léger ») et recevoir 2 ou 3 compositions complètes à choisir en aperçu, comme les consignes du montage dans l'écran Tournage.

Le chantier se fait en deux parties, livrées dans l'ordre.

## Partie 1 — Vignette simplifiée et captures candidates

### Retrait du fond écran et de la pose caméra

Les images tirées de la vidéo ne donnent pas un résultat propre ; l'auteur préfère déposer des captures.

- Le fond est toujours celui de la charte. Le champ `fond` disparaît de `Vignette` ; les gabarits dessinent toujours les formes de la charte (plus de `fondUrl`, plus de plaque sous le logo M&T réservée au fond écran).
- La pose vient toujours de la banque `donnees/poses/`. `PoseVignette` se réduit à `{ source: 'banque'; fichier: string }` (forme gardée pour ne pas réécrire les fichiers existants).
- Disparaissent : les boutons « Écran à l'image affichée » et « Caméra à l'image affichée », la route `POST …/publication/image`, `fichierCamera` et le champ `camera` du détail, `imageEcran`, `imageCamera`, et `extraireImage` de la configuration de publication s'il n'a plus d'autre usage. Le détourage des poses de la banque reste.
- **Compatibilité** : aucune publication existante n'utilise le fond écran ni la pose caméra. À la lecture, un champ `fond` est ignoré ; une pose `camera` rend la publication invalide (« Vignette : pose caméra plus prise en charge, choisissez une pose de la banque »). `publication.json` reste en version 2.

### Captures candidates

- Chaque vidéo publiée gagne `capturesCandidates: string[]` : fichiers de `captures/` du tournage que l'auteur propose à Claude, **5 au plus**, dans l'ordre de choix.
- La vignette garde **3 captures au plus** et les gabarits ne changent pas : les candidates servent seulement de réservoir pour les variantes.
- Panneau Vignette, rangée Captures : un clic sur une miniature la met dans la vignette ou l'en retire (inchangé) ; une case « Pour Claude » sous chaque miniature la coche comme candidate, compteur « 2/5 ». Au-delà de 5, la case est désactivée.
- Une candidate disparue du disque est simplement ignorée (elle ne bloque ni le rendu ni la validation, contrairement à une capture posée sur la vignette).

Les captures sont dessinées en `objectFit: 'contain'` dans leur carte : une image très large (logo en bandeau) n'est plus tronquée (déjà fait).

## Partie 2 — Consignes pour la vignette

### Déroulé

1. Dans le panneau Vignette, sous les captures : champ « Consigne pour la vignette » et bouton « Envoyer » (ou Ctrl+Entrée).
2. Claude répond par une reformulation (« J'ai compris : … »), 2 ou 3 propositions et, s'il y a lieu, ce qui n'est pas réalisable (« Pas réalisable : un fond vert — le fond est toujours celui de la charte »).
3. Chaque proposition s'affiche en aperçu (`Thumbnail` Remotion, comme les gabarits) avec une phrase d'explication.
4. Un clic sur un aperçu l'applique à la vignette (pose, logos, captures, gabarit, accroche) ; l'auteur peut retoucher à la main, puis « Rendre la vignette » comme aujourd'hui.
5. Les consignes précédentes de la vidéo restent consultables, la proposition retenue marquée.

Une seule consigne est en cours à la fois par vidéo (bouton désactivé et sablier pendant l'appel).

### Données

```ts
interface PropositionVignette {
  pose: string;        // fichier de donnees/poses/
  logos: string[];     // 3 au plus
  captures: string[];  // 3 au plus
  gabarit: Gabarit;
  accroche: string;
  explication: string; // une phrase
}

interface ConsigneVignette {
  texte: string;
  compris: string;
  pasRealisable: string[];
  propositions: PropositionVignette[]; // 1 à 3
  choisie: number | null;              // indice de la proposition appliquée
}

interface VideoPubliee {
  // … champs existants
  capturesCandidates: string[];
  consignesVignette: ConsigneVignette[];
}
```

Une vidéo lue sans ces champs reçoit des listes vides. `raisonPublication` vérifie leur forme et leurs limites.

### Ce que Claude reçoit

Fonction pure `construirePromptVignette` (studio/serveur/vignette-claude.ts), sur le modèle de `construirePromptRedaction` :

- la consigne ;
- le titre, la description, les accroches déjà rédigées et les logiciels cités ;
- les **noms de fichiers** des poses de la banque, des logos de la banque et des captures proposables (les candidates si l'auteur en a coché, sinon toutes celles du dossier) — Claude ne voit pas les images ;
- la composition actuelle, s'il y en a une ;
- les gabarits avec leur description et leur condition, et ceux déjà pris par les autres vidéos de la publication (à éviter si possible) ;
- les consignes précédentes de la vidéo (texte et proposition retenue), pour suivre « plus court », « l'autre pose » ;
- les règles : 3 logos et 3 captures au plus, accroche de 3 à 5 mots lisible en petit, ton selon la diffusion (même phrase que la rédaction).

Sortie structurée (zod) : `{ compris, pasRealisable, propositions }`. Même appel que la rédaction : modèle de `reglages.json`, effort moyen, repli serveur, clé `ANTHROPIC_API_KEY`.

### Nettoyage des propositions

Fonction pure `nettoyerPropositionsVignette(propositions, disponibles, actuelle, dejaUtilises)` :

- logos et captures inconnus retirés, doublons retirés, 3 au plus ; une capture hors des proposables est retirée ;
- pose inconnue : celle de la composition actuelle, sinon la première de la banque ;
- accroche vide : celle de la composition actuelle, sinon la première accroche rédigée ;
- gabarit impossible avec les éléments retenus : corrigé par `gabaritRetenu(gabarit, gabaritsCompatibles(…))` ;
- propositions identiques après nettoyage fusionnées ; 3 au plus.

Aucune proposition valable : erreur « Claude n'a proposé aucune composition utilisable », rien n'est enregistré.

### Serveur

`POST /api/tournages/<nom>/publication/vignette/consigne` avec `{ cible, texte }` : appelle Claude, nettoie, ajoute la `ConsigneVignette` à la vidéo, enregistre et renvoie la publication. Texte vide : 400. L'appel à Claude est injecté dans `ConfigPublication` (comme la rédaction) pour les tests.

Appliquer une proposition se fait côté studio : la vignette est recomposée avec la proposition et `choisie` est mis à jour, puis la publication est enregistrée par le `PUT` existant.

### Erreurs

Comme la rédaction : clé absente, refus, réponse inexploitable ou service indisponible donnent un message dans le panneau ; la vignette et l'historique ne changent pas.

## Tests

- Noyau : lecture d'une vignette avec `fond` (ignoré) et d'une pose caméra (refusée) ; `raisonPublication` sur `capturesCandidates` (plus de 5) et `consignesVignette`.
- `construirePromptVignette` : candidates ou toutes les captures, gabarits déjà pris, consignes précédentes, ton selon la diffusion.
- `nettoyerPropositionsVignette` : fichier inconnu, plus de 3 éléments, gabarit impossible, pose inconnue, accroche vide, doublons, aucune proposition valable.
- Route : succès avec un Claude simulé, texte vide, erreur de Claude sans écriture.
- Studio (logique) : application d'une proposition à la vignette.
- E2E vignette : gabarits rendus sans fond écran.

## Documentation

`docs/studio.md`, section Vignette : fond de la charte et pose de la banque seulement, captures candidates (5 au plus), consignes à Claude.
