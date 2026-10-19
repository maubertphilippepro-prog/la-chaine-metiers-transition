# Consignes en langage naturel dans le studio — conception

Date : 2026-10-19. Sous-projet A d'un ensemble de trois :

- **A. Moteur de consignes** (ce document) : une consigne écrite devient une liste d'opérations sur le montage, validées une par une.
- **B. Consignes permanentes pour les suggestions** : à cadrer après A ; une partie du besoin est déjà couverte par A.
- **C. Nouveaux éléments à l'écran** (texte incrusté, zoom…) : nouveaux composants Remotion et nouvelles opérations du vocabulaire de A.

## Objectif

Depuis l'écran de montage, l'auteur écrit une consigne libre (« coupe tout le passage sur Excel », « renomme le chapitre 2 en … », « ajoute une définition pour prompt »), éventuellement ancrée sur un passage sélectionné du texte. Claude la reformule et la traduit en opérations d'un vocabulaire fermé. L'auteur accepte ou refuse chaque opération ; rien ne change tant qu'il n'a pas accepté.

## Principes

- Claude n'utilise que le vocabulaire fermé. Ce qu'il ne peut pas traduire est listé dans `nonRealisable` avec la raison : pas d'invention, pas d'approximation silencieuse.
- Claude commence par reformuler la consigne (« J'ai compris : … »).
- Le studio vérifie chaque opération avant de la montrer, puis de nouveau au moment de l'accepter.
- Les passages sont désignés par numéros de mots ; le studio convertit en temps (début du premier mot, fin du dernier).
- Un chapitre est désigné par son premier mot, jamais par son numéro, pour rester stable après une fusion ou un ajout.

## Données

### Contexte envoyé à Claude

- la transcription numérotée (`numéro:mot`, lignes de 30 mots, comme le pipeline) ;
- l'état du montage enregistré : titre de la vidéo ; coupes (id, type, active, en attente, premier et dernier mot recouverts) ; chapitres (titre, premier mot) ; termes (terme, définition, statut, position) ;
- la consigne et, si elle est ancrée, le passage (premier et dernier mot) ;
- la longueur maximale d'une définition (`definitionMaxCaracteres`).

### Vocabulaire (`noyau/consignes.ts`)

Chaque opération porte une `explication` d'une phrase, affichée à l'auteur.

| Opération | Données | Application |
|---|---|---|
| `couper` | premierMot, dernierMot | `couperPassage` |
| `basculerCoupe` | idCoupe | `basculerCoupe` |
| `deciderLongueur` | idCoupe, accepter | `deciderLongueur` |
| `renommerChapitre` | premierMotChapitre, titre | `renommerChapitre` |
| `ajouterChapitre` | premierMot, titre | `ajouterChapitre` |
| `deplacerChapitre` | premierMotChapitre, nouveauPremierMot | `deplacerLimite` |
| `fusionnerChapitre` | premierMotChapitre | `fusionnerChapitre` |
| `modifierTerme` | terme, définition ?, statut ?, position ? | `modifierTerme` |
| `ajouterTerme` | terme, définition, mots | nouvelle fonction `ajouterTerme` (statut `a-valider`, position `bas`) |
| `titreVideo` | titre | nouvelle fonction `changerTitre` |

Réponse de Claude (sortie structurée) : `{ reformulation: string, operations: Operation[], nonRealisable: string[] }`.

### `consignes.json` (dans le dossier du tournage, à côté de `montage.json`)

```ts
interface FichierConsignes {
  version: 1;
  consignes: Consigne[];
}

interface Consigne {
  id: string;
  date: string;                 // ISO 8601
  texte: string;
  ancrage: { premierMot: number; dernierMot: number } | null;
  reformulation: string;
  nonRealisable: string[];
  propositions: Proposition[];
}

interface Proposition {
  operation: Operation;
  explication: string;
  etat: 'en-attente' | 'acceptee' | 'refusee' | 'invalide';
  probleme?: string;            // présent quand etat = 'invalide'
}
```

Absent : aucune consigne. Illisible : erreur explicite à l'ouverture du tournage, sans écraser le fichier.

## Vérification

`verifierOperation(analyse, montage, operation, reglages)` renvoie le montage modifié ou un problème. Une opération est invalide quand :

- un numéro de mot est hors de la transcription, ou `dernierMot < premierMot` ;
- l'id de coupe est inconnu, ou `deciderLongueur` vise une coupe qui n'est pas une longueur ;
- aucun chapitre ne commence au premier mot indiqué ; le premier chapitre ne peut être ni fusionné ni déplacé ;
- le terme est inconnu (`modifierTerme`) ou déjà présent (`ajouterTerme`) ; la définition est vide ou trop longue ;
- un titre est vide ;
- la fonction d'édition renvoie le montage inchangé (opération sans effet).

À la réception, les opérations sont vérifiées en chaîne sur une copie du montage, chacune après application des précédentes. À l'acceptation, la vérification est rejouée sur le montage actuel ; en cas d'échec, la proposition passe `invalide` avec le problème.

## Serveur

- `POST /api/tournages/<nom>/consignes` avec `{ texte, ancrage }` :
  1. refus (409) si un rendu est en cours ou en préparation ;
  2. texte vide refusé (400) ; ancrage vérifié ;
  3. chargement de l'analyse et du montage enregistré (ou par défaut) ;
  4. appel à Claude par `@anthropic-ai/sdk`, modèle `reglages.modeles.claude`, sortie structurée ;
  5. vérification en chaîne, ajout de la consigne à `consignes.json` (écriture atomique), réponse avec la consigne.
- `PUT /api/tournages/<nom>/consignes` : enregistre le fichier complet après acceptation ou refus (même contrôle de forme et même refus pendant un rendu que le montage).
- `GET /api/tournages/<nom>` renvoie aussi les consignes (`DetailTournage.consignes`).
- L'appel à Claude passe par une fonction injectée dans `ConfigApi` (`interpreterConsigne`), comme `relancerSuggestions`, pour les tests.
- Erreurs : clé API absente, connexion impossible, limite de requêtes, réponse inexploitable → message clair (500 ou 503) ; la consigne n'est pas enregistrée.

## Interface

Panneau « Consignes » dans la colonne de droite, sous l'aperçu :

- zone de texte multiligne et bouton « Envoyer » (Ctrl+Entrée) ; pendant l'appel, « Claude interprète la consigne… » et bouton désactivé ; en cas d'erreur, le texte reste dans la zone ;
- ancrage : nouvelle entrée « Donner une consigne sur ce passage » dans le menu du texte ([Texte.tsx](../../../studio/src/composants/Texte.tsx)) ; étiquette « Sur : "…" ✕ » au-dessus de la zone de texte ;
- dernière consigne dépliée : texte, « J'ai compris : … », encadré « Pas réalisable : … » si besoin, propositions avec explication ;
  - en attente : Accepter, Refuser, et pour celles qui portent sur un passage, Écouter et Voir dans l'aperçu ;
  - acceptées, refusées, invalides : grisées avec leur état, et le problème pour une invalide ;
  - « Tout accepter » (en attente et valides) et « Tout refuser » ;
- « Consignes précédentes (n) » : liste compacte (date, texte, bilan « 2 acceptées, 1 refusée »), dépliable ; pastille sur une consigne qui a encore des propositions en attente.

L'acceptation applique l'opération par `modifier()` (enregistrement de `montage.json` inchangé), puis enregistre `consignes.json`.

## Rendu

Une proposition en attente bloque « Valider et lancer le rendu » (règle ajoutée à `noyau/verifications.ts`, message « Consigne : n proposition(s) en attente »). Une proposition invalide ne bloque pas.

## Tests

- `noyau/consignes.test.ts` : conversion mots → temps ; chaque opération, valide et dans chaque cas de rejet ; vérification en chaîne ; chapitre désigné par son premier mot après une fusion ; `ajouterTerme` et `changerTitre`.
- `noyau/verifications.test.ts` : en attente bloque, invalide ne bloque pas.
- `studio/serveur/api.test.ts` : routes POST et PUT avec un faux `interpreterConsigne` ; refus pendant un rendu ; erreur de l'API sans enregistrement ; `consignes.json` absent ou illisible ; consignes dans le détail du tournage.
- Construction du prompt testée par instantané.
- Pas d'appel réel à Claude dans les tests automatiques ; essai manuel sur un vrai tournage en fin d'implémentation.

## Documentation

Section « Consignes » dans `docs/studio.md`, avec la mention de `consignes.json`.

## Hors périmètre

- Consignes permanentes appliquées à chaque analyse (sous-projet B).
- Éléments à l'écran (sous-projet C) : le vocabulaire accueillera de nouvelles opérations (par exemple `ajouterIncrustation`) sans changer le format de `consignes.json`.
- Conversation avec Claude, rejeu d'une consigne, aperçu des propositions avant acceptation.
