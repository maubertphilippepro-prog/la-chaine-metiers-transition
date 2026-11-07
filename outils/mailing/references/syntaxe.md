# Syntaxe de `mail.md`

Le fichier comporte un en-tête (entre `---`) suivi du corps en Markdown enrichi.
Les chemins d'images sont relatifs au dossier de la comm. Le script cherche aussi dans `assets/`, puis dans les assets du skill, donc `capture.png` suffit si le fichier est dans `assets/`.

## En-tête

```
---
objet: 🎙️ La FICO se rédige pendant la visite de chantier        ← objet du mail (obligatoire)
preheader: Dictée vocale, photos, IA : divisez par deux…        ← texte d'aperçu dans la boîte de réception
bandeau_titre: La FICO                                           ← grand titre du bandeau (défaut : objet)
bandeau_sous_titre: avec                                         ← petit texte avant le logo (optionnel)
bandeau_logo: there                                              ← logo produit : nom dans assets/logos ou chemin (optionnel)
bandeau_logo_hauteur: 34                                         ← hauteur du logo en px (défaut 34)
bandeau_accroche: Divisez par deux le temps de formalisation     ← ligne sous le titre (optionnel)
bandeau: non                                                     ← pour un mail sans bandeau
a: prenom.nom@ingerop.com                                        ← destinataires (optionnel, sinon dans Outlook)
cc:
cci:
---
```

Le bandeau généré comporte, de haut en bas : la frise CICAD, le titre, la ligne « sous-titre + logo », l'accroche, puis un filet rouge (aucun logo Pôle ni Cicad).

## Texte

| Écrire | Résultat |
|---|---|
| `## Titre` / `### Sous-titre` | titres bleus CICAD (22 / 18 px) |
| paragraphe | lignes séparées par une ligne vide ; un simple retour à la ligne donne un saut de ligne |
| `**gras**`, `*italique*`, `==surligné==`, `` `code` `` | mise en forme inline |
| `[texte](https://…)` | lien |
| `- élément` | liste à puces rouges ; si l'élément commence par un emoji, l'emoji sert de puce |
| `1. élément` | liste numérotée |
| `---` | filet de séparation |
| `<span style="color:#E40521">…</span>` | HTML inline autorisé en dernier recours |

## Images

```
![Texte alternatif](capture.png)                  ← pleine largeur (536 px max), centrée
![Texte alternatif](capture.png){width=60%}       ← largeur relative
![Texte alternatif](logo.png){width=200}          ← largeur en px
![Texte alternatif](capture.png){align=left}
[![Texte alternatif](capture.png)](https://lien)  ← image cliquable
_Légende en italique_                             ← ligne juste sous l'image = légende
```

Une image n'est jamais agrandie au-delà de sa taille réelle. Pour une capture d'écran nette, fournis-la au moins 2× plus large que sa taille d'affichage.

## Boutons et vidéos

```
[[bouton: 📄 Gabarit de FICO | https://… ]]
[[bouton: 👉 Ouvrir l'appli | https://… | Légende grise sous le bouton ]]
[[bouton: S'inscrire | https://… | | rouge ]]          ← 4e argument : couleur (rouge ou #hex)

[[video: Partie 1 — La prise de notes | https://sharepoint… ]]              ← pavé bleu ▶️ cliquable
[[video: Partie 1 — La prise de notes | https://sharepoint… | vignette.png ]] ← vignette cliquable + bouton ▶️

[[espace: 24]]                                          ← espace vertical en px
```

Les boutons sont dessinés en VML pour Outlook classique (coins arrondis, cliquables partout) et en CSS ailleurs.

## Blocs

```
:::info Titre optionnel
Texte, listes, images, boutons… tout le Markdown fonctionne dedans.
:::
```

Variantes de couleur :
- `info` / `callout` : bleu, pour mettre en avant une info ou une étape
- `astuce` / `success` : vert, pour un conseil
- `attention` / `warning` : orange, pour une mise en garde ou une règle d'usage
- `important` : rouge, pour une échéance ou une action obligatoire

```
:::centre
Paragraphe centré.
:::

:::colonnes
Contenu colonne 1 (texte, image, bouton, vidéo…)
|||
Contenu colonne 2
:::
```

Les colonnes (2 ou 3) sont côte à côte sur ordinateur et s'empilent sur mobile. Mets-y des contenus courts et équilibrés : image + texte, deux vidéos, deux chiffres clés.

```
:::footer
Bonne découverte !
Bonne découverte !
:::
```

Le pied de page affiche un texte gris centré, précédé d'un filet. Le logo du Pôle Métiers & Transition est ajouté, centré, en bas de chaque mail.

## HTML brut

Une ligne commençant par `<table`, `<div`, `<p`, `<center` ou `<!--` est recopiée telle quelle. Réserve-le aux cas que la syntaxe ne couvre pas, et vérifie ensuite le rendu Outlook. En particulier, ne mets pas de `margin` sur une `<table>` de plusieurs lignes : Outlook l'applique à chaque ligne.
