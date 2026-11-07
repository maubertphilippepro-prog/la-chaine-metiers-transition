# Prompt Replit : classements des vidéos

Prompt à envoyer à l'app Replit du site (via `update_app_using_prompt`) pour que le Studio puisse lire les types de classement, créer des valeurs et classer chaque vidéo avant le relais. Il reprend la section 1 de la spec `docs/superpowers/specs/2026-10-29-classements-site-design.md` et correspond au client du Studio (`studio/serveur/site-replit.ts`, `noyau/relais.ts`).

À soumettre à l'auteur avant tout envoi : l'envoi à Replit est une action extérieure.

## Prompt

```text
Ajoute au site des « classements » de vidéos : des types de classement, chacun avec ses valeurs, que l'accueil affiche en rubriques et que l'API expose. Aujourd'hui il y en a deux, « Par outil » et « Par thème ».

1. Types de classement

Deux types, dans cet ordre d'affichage :
- clé "outil", libellé "Par outil", multiple = false, required = true. Ses valeurs sont les catégories actuelles : le stockage existant (categoryId, table des catégories) ne change pas.
- clé "theme", libellé "Par thème", multiple = true, required = false. Ses valeurs sont une nouvelle table.

2. Thèmes : table et reprise de l'existant

Crée une table des thèmes (id, name) et une table de liaison vidéo ↔ thème. La rubrique « Par thème » de l'accueil doit être construite à partir de cette table : supprime la liste en dur.
Reprends les trois thèmes actuels, dans cet ordre, avec ces noms exacts :
- id 1 : "Skills (compétences)"
- id 2 : "vibe-coding"
- id 3 : "en vrac"
Les vidéos déjà publiées dont les tags correspondent à ces thèmes (selon la règle de rattachement actuelle de la rubrique) doivent être rattachées au thème correspondant dans la table de liaison, pour que la rubrique reste identique après la migration. Écris la migration de façon à pouvoir la rejouer sans doublon.

3. GET /api/classifications (public, sans clé, comme /api/categories)

Renvoie les types dans l'ordre d'affichage, chacun avec ses valeurs :
[
  { "key": "outil", "label": "Par outil", "multiple": false, "required": true,
    "values": [{ "id": 1, "name": "Delos" }] },
  { "key": "theme", "label": "Par thème", "multiple": true, "required": false,
    "values": [{ "id": 1, "name": "Skills (compétences)" }, { "id": 2, "name": "vibe-coding" }, { "id": 3, "name": "en vrac" }] }
]
Pour "outil", les values sont les catégories existantes (id et name de la catégorie).

4. POST /api/classifications/{key}/values

Corps : { "name": "…" }. Authentification : en-tête X-Api-Key (clé machine, AUTOMATION_API_KEY) ou administrateur connecté, comme les autres routes d'écriture.
- 201 avec { "id": …, "name": "…" } quand la valeur est créée ;
- 200 avec { "id": …, "name": "…" } quand une valeur du même nom existe déjà dans ce type (comparaison sans tenir compte de la casse ni des espaces autour) : pas de doublon, on renvoie l'existante ;
- 404 si {key} ne correspond à aucun type ;
- 400 si le nom est vide (ou ne contient que des espaces) ;
- 401 / 403 si ni la clé ni l'administrateur ne sont valables, comme ailleurs.
Pour "outil", créer une valeur crée une catégorie.

5. POST /api/videos et PATCH /api/videos/:id

Ces deux routes acceptent en plus un champ classifications : { [key]: number[] }, par exemple { "outil": [1], "theme": [1, 3] } ; les nombres sont des id de valeurs. Validation, avec 400 et un message clair sinon :
- clé inconnue, ou id inexistant dans le type ;
- plus d'une valeur pour un type dont multiple est false ;
- tableau vide ou clé absente pour un type dont required est true (à la création ; en PATCH, seulement si la clé est fournie, pour ne pas casser les mises à jour partielles) ;
- pour un type facultatif, [] est valide et retire toutes les valeurs.
Correspondance outil ↔ categoryId : classifications.outil = [n] équivaut à categoryId = n, et l'inverse. categoryId reste accepté comme aujourd'hui. Si les deux sont fournis, ils doivent concorder (400 sinon). Pas de changement de stockage pour l'outil.
Les thèmes sont écrits dans la table de liaison : en PATCH, la liste fournie remplace l'ancienne.

6. Réponses vidéo

Toutes les réponses qui renvoient une vidéo (listes, détail, POST, PATCH) incluent classifications sous la même forme : { "outil": [1], "theme": [1, 3] }, avec une clé par type, [] quand rien n'est choisi. categoryId reste présent.

7. Contrat et code généré

Mets à jour openapi.yaml (nouvelles routes, champ classifications dans les corps et les réponses de vidéo, schémas des types et des valeurs, codes 200/201/400/404), puis relance la génération de code (codegen) pour que les clients et les schémas de validation générés suivent. Ajoute des tests pour : la lecture de /api/classifications, la création d'une valeur (201), le doublon (200, sans casse), la clé inconnue (404), le nom vide (400), la validation multiple / required, l'équivalence outil ↔ categoryId, et la rubrique « Par thème » alimentée par la table.
```

## Après l'envoi

1. Vérifier que `GET <REPLIT_SITE_URL>/api/classifications` renvoie bien les deux types, avec les trois thèmes et les catégories comme valeurs de « Par outil ».
2. Vérifier la rubrique « Par thème » de l'accueil : mêmes vidéos qu'avant la migration.
3. Dans le Studio, ouvrir le panneau Replit d'une vidéo Pro « Prête » : les deux blocs de classement doivent apparaître (voir « Classements du site » dans [studio.md](studio.md)).
