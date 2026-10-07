# Post-production automatisée — Conception (sous-projet C, V1)

Date : 2026-10-06
Projet : chaîne YouTube personnelle « PMT » (astuces et outils numériques expliqués simplement, public non spécialiste)

> Mise à jour du 2026-10-07 : la chaîne devient un projet personnel nommé PMT. Toute mention d'une organisation est retirée ; Remotion est utilisé sous sa licence gratuite pour usage personnel.

## 1. Contexte et objectif

La chaîne publie au moins une vidéo par semaine sur l'innovation et les outils numériques. Les tournages sont incarnés (face caméra + partage d'écran, vignette caméra en bas à gauche), en français, non scriptés, découpés en chapitres à la manière d'Underscore.

Le projet global est découpé en quatre sous-projets :

| | Sous-projet | Statut |
|---|---|---|
| A | Socle (épisodes, calendrier, rappels, revue humaine) | Minimum inclus dans cette V1 |
| B | Préparation (brainstorming, plan d'enregistrement) | Plus tard |
| **C** | **Post-production** | **Objet de ce document** |
| D | Publication (métadonnées, YouTube, LinkedIn, vitrine Replit) | Plus tard |

**Objectif de la V1 :** à partir d'un tournage brut, produire sans montage manuel :

1. **la vidéo complète** nettoyée (silences, hésitations, faux départs, longueurs validées) ;
2. **un épisode autonome par chapitre**, chacun avec son habillage.

Les Shorts (niveau 3) sont hors V1.

Une validation humaine a lieu avant tout rendu final.

## 2. Hypothèses et contraintes

- **Enregistrement :** OBS Studio, une scène fixe composant l'écran en plein cadre et la caméra en vignette en bas à gauche. Sortie : un MP4 déjà composé, 1920×1080. Un tournage peut comporter **plusieurs fichiers**, concaténés dans l'ordre.
- **Machine :** traitement local sur le PC Windows (Intel Core Ultra 7 155H, 32 Go, NVIDIA RTX 4060 Laptop). FFmpeg, Node.js et Python sont installés.
- **Langue :** tout en français (interface, textes générés, transcription).
- **Pas de voix de synthèse, pas de sous-titrage intégral.**
- **IA :** API Claude pour les suggestions éditoriales (chapitres, termes, longueurs). Coût de l'ordre de quelques centimes par tournage. La transcription reste locale.
- **Identité visuelle :** couleurs rouge `#E30520`, bleu `#004C99`, bleu-gris `#9AB2C9`, blanc. Formes géométriques (bandes, cercles, triangles). Logo : texte « PMT » dessiné dans Remotion (aucun fichier de logo externe). Police : Open Sans (gras pour les titres).

## 3. Architecture

Approche retenue : **Remotion comme moteur de montage**, avec prévisualisation instantanée dans le studio de validation.

```
pipeline/   (Python)      analyse d'un tournage → analyse.json
remotion/   (TypeScript)  compositions vidéo (montage, générique, encarts, carton de fin)
studio/     (TypeScript)  application web locale de validation + lancement des rendus
donnees/                  un dossier par tournage + glossaire.json partagé
reglages.json             seuils, durées, charte
```

### 3.1 `pipeline/` — analyse

Entrée : le ou les fichiers vidéo d'un tournage. Sortie : `analyse.json`. Étapes, chacune sauvegardant son résultat pour permettre la reprise :

1. **Préparation** : vérification des fichiers ; concaténation si plusieurs ; conversion en cadence d'images constante si la source est en cadence variable. L'original n'est jamais modifié ; le fichier de travail s'appelle `source.mp4`.
2. **Transcription** : Whisper large-v3 (faster-whisper, GPU), français, prompt initial encourageant la transcription des hésitations (« euh », « hum »).
3. **Alignement mot à mot** : recalage précis du début et de la fin de chaque mot (alignement forcé sur un modèle acoustique français) pour que les hésitations non transcrites apparaissent comme des trous entre les mots.
4. **Détection mécanique** : silences, hésitations, faux départs et répétitions (voir §4).
5. **Suggestions Claude** à partir du texte horodaté :
   - découpage en chapitres avec titre provisoire ;
   - termes techniques avec définition courte (proposition pour les termes absents du glossaire ; définition du glossaire pour les autres) ;
   - passages trop longs ou digressions.

Si l'API Claude échoue, l'analyse se termine sans l'étape 5 et le signale ; le studio permet de la relancer.

### 3.2 `remotion/` — compositions

Toutes les compositions prennent en entrée un objet de **décisions de montage** (segments conservés, encarts, chapitres, titres) et ne contiennent aucune logique de décision.

- **`VideoMontee`** : enchaîne les segments conservés de `source.mp4`, superpose le logo et les encarts de définition. Paramètre de plage : tout le tournage ou un seul chapitre.
- **`Generique`** : animation d'environ 4 s ; les formes géométriques de la charte se construisent puis laissent place au nom de la chaîne et au titre.
- **`EncartDefinition`** : carte de définition animée (voir §5).
- **`Intertitre`** : environ 2 s, titre du chapitre suivant (vidéo complète uniquement).
- **`CartonFin`** : environ 5 s, logo PMT et invitation à s'abonner.
- **`Episode`** et **`VideoComplete`** : assemblages des éléments ci-dessus (voir §5).

### 3.3 `studio/` — validation

Application web locale (Vite + React), servie par un petit serveur Node qui lit et écrit les fichiers de `donnees/` et lance les rendus.

- **Liste des tournages** avec leur statut.
- **Écran de montage** :
  - à gauche, le texte horodaté : coupes barrées (couleur selon le type), suggestions de longueurs en attente, termes surlignés, limites de chapitres ;
  - à droite, le **lecteur Remotion** (`@remotion/player`) qui affiche la composition montée en direct, mise à jour à chaque modification.
- **Actions** :
  - clic sur un passage barré : rétablir ; sélection de texte : couper ;
  - suggestion de longueur : accepter / refuser ;
  - terme : valider, modifier la définition, écarter, déplacer l'encart en haut ;
  - chapitre : déplacer une limite, fusionner, ajouter, renommer ;
  - écoute d'un passage coupé avant décision.
- **Enregistrement automatique** des décisions à chaque modification.
- **Bouton « Rendu »** : vérifications préalables puis rendu de la vidéo complète et de chaque épisode, avec suivi de progression.

### 3.4 `donnees/` — fichiers

```
donnees/
  glossaire.json                   termes validés et définitions, partagés entre tournages
  tournages/<AAAA-MM-JJ>-<slug>/
    bruts/                         fichiers OBS d'origine (intouchés)
    source.mp4                     fichier de travail (concaténé, cadence constante)
    episode.json                   statut et liste des épisodes (socle A minimal)
    analyse.json                   sortie du pipeline (jamais modifiée par le studio)
    montage.json                   décisions validées (écrit par le studio)
    rendus/                        vidéo complète + un fichier par épisode
```

Statuts dans `episode.json` : `analyse`, `en-validation`, `valide`, `rendu`, `erreur`.

Lors de la validation d'un tournage, les définitions validées sont ajoutées ou mises à jour dans `glossaire.json`.

## 4. Règles de coupe

Valeurs par défaut, toutes réglables dans `reglages.json` :

| Type | Détection | Traitement par défaut | Appliqué d'office |
|---|---|---|---|
| Silence | pause > 0,7 s | raccourci à 0,3 s | oui |
| Hésitation | trou dans la parole ou « euh/hum » transcrit, > 0,4 s | coupée | oui |
| Faux départ / répétition | séquence de mots répétée à courte distance | on garde la dernière occurrence | oui |
| Longueur / digression | suggestion Claude | proposée seulement | **non** |

- Les hésitations courtes (sous le seuil) sont conservées pour garder un débit naturel.
- Marge de sécurité autour des mots (60 ms par défaut) pour ne pas tronquer.
- Micro-fondu audio aux raccords (15 ms par défaut) pour éviter les clics.
- Coupes franches à l'image (jump cuts), sans transition.
- Toute coupe appliquée d'office reste visible et réversible dans le studio.

## 5. Mise en page et habillage

Cadre 1920×1080 ; la vignette caméra occupe le coin bas-gauche.

- **Logo** : logo texte « PMT », petit, en haut à droite, en continu.
- **Encart de définition** : en bas à droite ; carte blanche avec bande rouge/bleue ; terme en gras bleu, définition d'une à deux lignes (160 caractères maximum). Apparaît au moment où le terme est prononcé **pour la première fois dans l'épisode**, reste 6 s, entrée et sortie animées. Position déplaçable en haut à droite au cas par cas (le logo se décale alors).
- Dans la vidéo complète, un terme n'est défini qu'à sa première occurrence dans la vidéo.

**Épisode (un chapitre)** : `Generique` (titre de l'épisode) → contenu du chapitre → `CartonFin`.

**Vidéo complète** : `Generique` (titre général) → chapitre 1 → `Intertitre` → chapitre 2 → … → `CartonFin`.

## 6. Correspondance des temps

Le cœur logique, isolé et testé, convertit :

- mots horodatés + coupes → **segments conservés** de la source ;
- un temps dans la source → un temps dans la vidéo montée (pour placer encarts et intertitres) ;
- les limites de chapitres de la source → les plages de chaque épisode.

Cette logique est écrite une seule fois en TypeScript et partagée entre le studio et Remotion. Le pipeline Python produit uniquement des données (mots, détections, suggestions) et ne calcule pas les segments.

## 7. Gestion des erreurs

- **Entrée invalide** (fichier illisible, format différent de 16:9 ou inférieur à 1280×720, piste audio absente) : arrêt de l'analyse avec un message explicite.
- **Reprise** : chaque étape du pipeline sauvegarde son résultat ; une relance repart de la première étape manquante.
- **API Claude indisponible** : analyse terminée sans suggestions, signalée dans le studio, relance possible.
- **Studio** : `montage.json` enregistré à chaque modification ; `analyse.json` jamais modifié.
- **Avant rendu** : chaque chapitre a un titre ; chaque terme est validé ou écarté ; aucune suggestion de longueur en attente.
- **Rendu** : un rendu par épisode ; l'échec de l'un n'empêche pas les autres ; relance individuelle ; journal dans le dossier du tournage.

## 8. Réglages

`reglages.json` regroupe :

- seuils de coupe (§4) ;
- durées : générique, encarts, intertitres, carton de fin ;
- charte : couleurs, police, chemins des logos ;
- modèle Whisper et modèle Claude utilisés.

## 9. Tests

- **Tests unitaires** sur le cœur logique (§6) et sur la détection mécanique (§4), avec des mots horodatés fabriqués.
- **Test de bout en bout** sur une vidéo d'essai de 2 à 3 minutes enregistrée dans les conditions réelles (OBS, même scène). Elle sert aussi à **calibrer les seuils**.
- **Vérification visuelle** du générique, des encarts, de l'intertitre et du carton de fin dans Remotion Studio.

## 10. Hors périmètre V1

Shorts, métadonnées YouTube, miniatures, envoi YouTube, post LinkedIn, synchronisation de la vitrine Replit, plan d'enregistrement, calendrier éditorial et rappels (.ics / email).

## 11. Prérequis côté utilisateur

- Installer OBS Studio depuis obsproject.com (vérifier l'accord du service informatique) et régler la scène (accompagnement prévu).
- Fournir une clé API Claude.
- Enregistrer la vidéo d'essai de 2 à 3 minutes.
