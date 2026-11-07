# Vignette composée dans le studio, puis 3 variantes par Claude

## Objectif

Aujourd'hui, Claude choisit lui-même la pose, les logos, les captures (parmi 5 candidates), le gabarit et l'accroche, en ne voyant que les noms de fichiers. L'auteur corrige à la marge par des consignes. Désormais, l'auteur fixe les éléments, Claude ne génère qu'à la demande, et l'auteur itère à partir d'une variante.

## Parcours

1. **Formulaire** (rien n'est généré avant le clic) :
   - **Pose** : clic sur une photo de la banque.
   - **Accroche** : champ libre, avec les accroches rédigées en raccourci.
   - **Logos** : zone de texte libre (« Excel, Teams, SharePoint »). Résolution dans `donnees/logos/` : correspondance du nom de fichier (insensible à la casse et aux accents) d'abord, puis Claude tranche les noms ambigus ou non trouvés lors de la génération. Les logos résolus s'affichent en vignettes et les noms introuvables sont signalés, sans bloquer.
   - **Captures** : cochées directement, `MAX_ELEMENTS` (3) au plus. La case « Pour Claude » et `capturesCandidates` disparaissent.
   - **Consignes** : texte libre.
   - Bouton **« Générer 3 vignettes »**.
2. **Génération** : Claude reçoit les images (pose, logos, captures) et le texte (titre, description, ton, éléments, consignes, base éventuelle). Il renvoie exactement 3 compositions :
   - une accroche : celle de l'auteur dans une variante, des reformulations de 3 à 5 mots dans les autres ;
   - un gabarit compatible ;
   - des **réglages de mise en page** : `cotePose` (gauche|droite), `tailleAccroche` (petite|normale|grande), `recadrages` (par capture : zone x, y, largeur, hauteur en % de l'image, bornée à 0–100 avec une taille minimale de 10 %), `logoVedette` (nom de fichier ou null) ;
   - une explication d'une phrase.
   Les éléments imposés par l'auteur ne changent pas : le nettoyage serveur rétablit pose, logos et captures s'ils diffèrent.
3. **Itération** : un clic sur une variante en fait la **base**. Le formulaire se remplit avec la pose, l'accroche, les logos (repassés en texte) et les captures de la base. L'auteur modifie ce qu'il veut, ajoute des consignes et relance. Claude reçoit la base complète, réglages compris, avec la consigne de rester proche de celle-ci tout en appliquant les changements. La base reste affichée et peut être retenue telle quelle. « Rendre la vignette » est inchangé.

## Données

- `Vignette` gagne `mise: MiseEnPage` (facultatif). Absent, il vaut les défauts qui reproduisent le rendu actuel, donc les vignettes existantes ne changent pas. `cleVignette` inclut la mise.
- `ConsigneVignette` devient un **tour** : `{ elements: { pose, accroche, logosTexte, logos, captures }, consignes, base: PropositionVignette | null, compris, pasRealisable, introuvables, propositions, choisie }`. Les anciens historiques sont relus sans erreur, avec des champs neufs vides.
- `PropositionVignette` gagne `mise`.

## Composants touchés

- `noyau/gabarits.ts`, `noyau/publication.ts` : types `MiseEnPage`, défauts, validation et bornage.
- `remotion/composants/vignette/*` : les 4 gabarits et les briques appliquent la mise (côté, taille, `object-position` et zoom par recadrage, logo agrandi).
- `studio/serveur/vignette-claude.ts` : prompt multimodal (images en base64, redimensionnées côté serveur à 800 px au plus), schéma zod étendu, nettoyage, résolution des logos.
- `studio/serveur/publication.ts` : la route `vignette/consigne` devient `vignette/generer` et prend les éléments du formulaire.
- `studio/src/composants/ChoixVignette.tsx` et `ConsignesVignette.tsx` : formulaire, 3 aperçus, choix de la base, historique. Le sélecteur manuel de gabarit disparaît.

## Erreurs

- Pas de pose ou pas d'accroche : bouton désactivé.
- Logo introuvable : signalé, la génération continue sans lui.
- Moins de 3 propositions valides après nettoyage : afficher celles qui restent et le dire.
- Erreurs Claude : `traduireErreurClaude`, comme aujourd'hui.

## Tests

- Nettoyage : éléments imposés rétablis, réglages bornés, gabarit compatible, doublons fusionnés.
- Résolution des logos : casse, accents, introuvables.
- Prompt : il contient les images, la base et les consignes.
- Remotion : la mise par défaut est identique au rendu actuel (test e2e existant), et chaque réglage modifie le rendu.
- Relecture des anciennes publications (`capturesCandidates`, anciennes consignes).
