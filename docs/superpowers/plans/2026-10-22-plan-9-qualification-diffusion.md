# Plan 9 — Qualification des vidéos et sablier : plan de mise en œuvre

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** L'auteur qualifie chaque vidéo (Pro ou Perso, confidentielle ou non) et l'app en déduit sa diffusion sur YouTube et sur le site, y compris le retrait du site d'une vidéo requalifiée en Perso ; toute attente du studio montre un sablier.

**Architecture:** Une fonction pure `diffusion(qualification)` dans un nouveau module `noyau/qualification.ts` porte toute la grille ; `publication.json` passe en version 2 (champs `nature` et `confidentielle`), un fichier v1 étant converti à la lecture. Les règles YouTube et du relais (`noyau/youtube.ts`, `noyau/relais.ts`) ne lisent que `diffusion(...)`. Le serveur gagne la route `site/retirer` et le client du site `supprimerVideo` ; le site Replit gagne `DELETE /api/videos/:id` (agent Replit). Côté studio, un composant `Attente` (sablier + libellé) remplace les textes d'attente.

**Tech Stack:** Node 22, TypeScript 5 (`strict`, `noUncheckedIndexedAccess`), Vitest 3, React 19.3.0, Vite 7.3.7. Site : Express 5, Drizzle, OpenAPI + Orval, Object Storage de Replit (géré par l'agent Replit).

Spec de référence : `docs/superpowers/specs/2026-10-22-qualification-diffusion-design.md`.

## Global Constraints

- La chaîne s'appelle **« PMT »**. Aucune mention d'organisation dans le code, les textes affichés ou la documentation (seule exception existante : `publication.mentionsInterdites` de `reglages.json`).
- Texte visible et noms de domaine en français ; clés JSON en camelCase ; apostrophe typographique `’` dans les textes affichés et les messages d'erreur.
- Grille (seule source : `diffusion`) : Pro confidentielle → YouTube `aucun`, site `fichier` ; Pro non confidentielle → `non-repertoriee`, `lien` ; Perso confidentielle → `privee`, `aucun` ; Perso non confidentielle → `publique` (ou programmée), `aucun`.
- Qualification par défaut : Perso, non confidentielle.
- Conversion v1 → v2 : `interne` → Pro confidentielle ; `mixte` → Pro non confidentielle ; `perso` → Perso non confidentielle.
- Mentions interdites contrôlées pour toute vidéo dont la diffusion YouTube n'est pas `aucun`.
- Un relais ou un retrait raté ne change pas le statut ; `erreur` garde l'étape `replit` et le message.
- Aucun appel réel à YouTube, à l'Explorateur ni au site Replit dans les tests automatiques.
- Le chemin du projet contient « & » : ne jamais utiliser `npx` ; passer par les scripts npm (`npm test -- <fichier>`, `npm run typecheck`).
- Ne pas toucher aux fichiers déjà modifiés hors de ce plan dans l'arbre de travail (`reglages.json`, `noyau/reglages.test.ts`, `remotion/**`, `public/logo/`) : `git add` seulement les fichiers de la tâche.
- Chaque commit se termine par la ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Structure des fichiers

```
noyau/
  qualification.ts (+ test)          NOUVEAU : Nature, Qualification, Diffusion, diffusion, conversion des profils v1
  publication.ts (+ test)            version 2, nature et confidentielle, migrerPublication, retraitAFaire, mentions selon la diffusion
  youtube.ts (+ test)                validee, problemesDiffusion, visibilités et consignes selon la diffusion, Non répertoriée
  relais.ts (+ test)                 relais selon la diffusion, deux champs vidéo (l’un null), enregistrerRetrait
studio/
  serveur/site-replit.ts (+ test)    supprimerVideo, suite du message selon l’action
  serveur/redaction.ts (+ test)      qualification au lieu du profil
  serveur/publication.ts (+ test)    lecture v1 convertie, Non répertoriée, relais selon la diffusion, route site/retirer
  src/api.ts                         retirerDuSite
  src/logique/publication.ts (+ test) libellés de nature, résumé de la diffusion, qualification par défaut, confirmation du retrait
  src/composants/Attente.tsx (+ test) NOUVEAU : sablier et libellé d’attente
  src/composants/*.tsx               sablier partout ; qualification dans la carte et l’écran ; panneau Site en mode retrait
  src/styles.css                     sablier
docs/
  studio.md, youtube-studio.md, superpowers/specs/2026-10-20-publication-design.md
```

---

### Task 1: Site Replit — suppression d'une vidéo, champs vidéo effaçables

Faite par l'agent Replit, en arrière-plan : les autres tâches n'en dépendent pas (site simulé dans les tests). Seule la Task 8 (essai réel) l'attend.

**Files:** aucun dans ce dépôt.

**Interfaces:**
- Produces (site publié `https://internal-assets.replit.app`) : `DELETE /api/videos/:id` (clé `X-Api-Key` ou admin ; 204, 404 si absente, 401 sans droits) ; `videoUrl: null` et `videoObject: null` acceptés par `POST /api/videos` et `PATCH /api/videos/:id`.

- [ ] **Step 1: Confier les modifications à l'agent Replit**

Appeler `mcp__replit__update_app_using_prompt` avec `replId` `a9c0e477-1b18-4dcf-a216-28cebf28c819` et ce `changeDescription` (recopié tel quel) :

```
Deux modifications de l’API des vidéos. Mettre à jour l’OpenAPI en premier, puis régénérer le code (règle du projet). Ne rien changer d’autre.

1. Route DELETE /api/videos/:id.
   - Réservée à la clé d’API machine (en-tête X-Api-Key comparé à AUTOMATION_API_KEY, comme les autres routes d’écriture) ou à un administrateur connecté ; 401 sinon.
   - Supprime la vidéo, ses rattachements aux playlists et ses statistiques (vues, likes et autres tables liées), ainsi que ses objets dans l’Object Storage (videoObject et thumbnailObject) s’il en a.
   - Réponse 204 sans corps ; 404 si la vidéo n’existe pas.
   - Si la route existe déjà, vérifier qu’elle fait tout cela (notamment la suppression des objets du stockage) et compléter au besoin.

2. VideoInput (POST /api/videos) et VideoUpdate (PATCH /api/videos/:id) acceptent videoUrl: null et videoObject: null.
   - null efface le champ.
   - Quand videoObject ou thumbnailObject est effacé ou remplacé par un autre objet, l’ancien objet est supprimé du stockage.
   - Une vidéo garde toujours au moins une source (videoUrl ou videoObject) : sinon 400 avec un message clair.
```

- [ ] **Step 2: Vérifier le code du site une fois l'agent terminé**

Avec `mcp__replit__list_app_files` puis `mcp__replit__read_app_file` : lire l'OpenAPI (route `DELETE /videos/{id}`, `videoUrl` et `videoObject` nullables dans `VideoInput` et `VideoUpdate`) et le routeur des vidéos (contrôle de la clé ou de l'admin, suppression des liens playlists et statistiques, suppression des objets, 204/404, contrôle « au moins une source »). Tout écart : le décrire précisément dans un nouvel appel à `update_app_using_prompt`, puis relire.

- [ ] **Step 3: Vérifier l'API publiée**

Publier si nécessaire (`mcp__replit__publish_app`, puis `mcp__replit__get_publish_status` jusqu'à la fin). Puis, sans afficher la clé :

```bash
cd "/c/Users/pmaubert/dev/La chaine M&T"
CLE=$(grep '^REPLIT_API_KEY=' .env | cut -d= -f2-)
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE https://internal-assets.replit.app/api/videos/999999
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE -H "X-Api-Key: $CLE" https://internal-assets.replit.app/api/videos/999999
```

Expected: `401` puis `404`.

Rien à committer dans ce dépôt.

---

### Task 2: Sablier pour toute attente du studio

**Files:**
- Create: `studio/src/composants/Attente.tsx`, `studio/src/composants/Attente.test.tsx`
- Modify: `studio/src/styles.css`, `studio/src/composants/CartePublication.tsx`, `studio/src/composants/ChoixVignette.tsx`, `studio/src/composants/PanneauYoutube.tsx`, `studio/src/composants/PanneauSite.tsx`, `studio/src/composants/BandeauSuggestions.tsx`, `studio/src/composants/PanneauConsignes.tsx`, `studio/src/composants/PanneauRendu.tsx`, `studio/src/composants/EcranMontage.tsx`, `studio/src/composants/EcranPublication.tsx`

**Interfaces:**
- Produces : `Sablier: FC`, `Attente: FC<{ libelle: string }>` (de `studio/src/composants/Attente.tsx`) ; `RENDU_VIGNETTE = 'Rendu de la vignette…'` et la prop `occupe: string | null` de `ChoixVignette`.

- [ ] **Step 1: Écrire le test**

`studio/src/composants/Attente.test.tsx` :

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Attente } from './Attente';

describe('Attente', () => {
  it('affiche le sablier devant le libellé, annoncé aux lecteurs d’écran', () => {
    expect(renderToStaticMarkup(<Attente libelle="Rendu de la vignette…" />)).toBe(
      '<span class="attente" role="status"><span class="sablier" aria-hidden="true">⏳</span>Rendu de la vignette…</span>',
    );
  });
});
```

- [ ] **Step 2: Vérifier que le test échoue**

Run: `npm test -- studio/src/composants/Attente.test.tsx`
Expected: FAIL (module `./Attente` introuvable).

- [ ] **Step 3: Écrire le composant et son style**

`studio/src/composants/Attente.tsx` :

```tsx
import type { FC } from 'react';

// Sablier animé (fixe si l’utilisateur réduit les animations) : une action fait attendre l’auteur.
export const Sablier: FC = () => <span className="sablier" aria-hidden="true">⏳</span>;

// Libellé d’attente précédé du sablier, annoncé aux lecteurs d’écran.
export const Attente: FC<{ libelle: string }> = ({ libelle }) => (
  <span className="attente" role="status"><Sablier />{libelle}</span>
);
```

À la fin de `studio/src/styles.css` :

```css
/* Sablier : toute action qui fait attendre l’auteur. */
.attente { display: inline-flex; align-items: center; gap: 6px; color: var(--discret); font-size: 13px; }
.sablier { display: inline-block; animation: sablier 1.6s ease-in-out infinite; }
@keyframes sablier {
  0%, 40% { transform: rotate(0deg); }
  50%, 90% { transform: rotate(180deg); }
  100% { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) { .sablier { animation: none; } }
.rendu-en-cours {
  display: flex; align-items: center; justify-content: center; aspect-ratio: 16 / 9;
  border: 1px dashed var(--bleu-gris); border-radius: 6px;
}
```

Run: `npm test -- studio/src/composants/Attente.test.tsx`
Expected: PASS.

- [ ] **Step 4: Carte et vignette**

Dans `studio/src/composants/ChoixVignette.tsx` :

1. Import : `import { Attente } from './Attente';`
2. Avant `interface Props`, ajouter : `export const RENDU_VIGNETTE = 'Rendu de la vignette…';`
3. Dans `Props`, après `lancer` : `  // Libellé de l’action en cours sur la carte, null si aucune.\n  occupe: string | null;` (deux lignes) ; ajouter `occupe` à la déstructuration des props du composant.
4. Remplacer `{extraction && <p className="discret">Extraction de l’image…</p>}` par `{extraction && <p><Attente libelle="Extraction de l’image…" /></p>}`.
5. Remplacer le bloc de la zone « Rendu » :

```tsx
            <p className="discret">Rendu</p>
            {occupe === RENDU_VIGNETTE
              ? <div className="rendu-en-cours"><Attente libelle={RENDU_VIGNETTE} /></div>
              : vignette.fichier
                ? <img className="vignette-rendue" src={`${detail.urlTournage}/${vignette.fichier}?v=${encodeURIComponent(cleVignette(vignette))}`} alt="Vignette rendue" />
                : <p className="discret">Pas encore rendue.</p>}
```

6. Remplacer la ligne du bouton « Rendre la vignette » par :

```tsx
          <div className="actions">
            <button disabled={!!occupe} onClick={() => void lancer(RENDU_VIGNETTE, () => api.rendreVignette(nom, v.cible))}>Rendre la vignette</button>
            {occupe === RENDU_VIGNETTE && <Attente libelle={RENDU_VIGNETTE} />}
          </div>
```

Dans `studio/src/composants/CartePublication.tsx` :

1. Import : `import { Attente } from './Attente';`
2. Après `interface Props { … }`, ajouter :

```tsx
const REDACTION = 'Rédaction par Claude…';
const VERIFICATION = 'Vérification…';
```

3. Remplacer le bouton de rédaction par :

```tsx
          <div className="actions">
            <button disabled={!!occupe} onClick={() => void lancer(REDACTION, () => api.rediger(nom, v.cible))}>
              Proposer les textes avec Claude
            </button>
            {occupe === REDACTION && <Attente libelle={REDACTION} />}
          </div>
```

4. Passer `occupe={occupe}` à `<ChoixVignette … />`.
5. Remplacer le bouton de validation par :

```tsx
          <div className="actions">
            <button className="principal" disabled={!!occupe} onClick={() => void lancer(VERIFICATION, () => api.validerVideo(nom, v.cible))}>
              Valider pour la publication
            </button>
            {occupe === VERIFICATION && <Attente libelle={VERIFICATION} />}
          </div>
```

6. Supprimer la ligne `{occupe && <p className="discret">{occupe}</p>}`.

- [ ] **Step 5: Panneaux YouTube et Site**

Dans `studio/src/composants/PanneauYoutube.tsx` : importer `Attente` ; ajouter avant `export const PanneauYoutube` la constante `const COPIE = 'Copie…';` ; dans `copier`, remplacer `lancer('Copie…', …` par `lancer(COPIE, …` ; remplacer `{occupe && <p className="discret">{occupe}</p>}` par :

```tsx
      {/* Une copie dans le presse-papiers est quasi instantanée : pas de sablier. */}
      {occupe && occupe !== COPIE && <p><Attente libelle={occupe} /></p>}
```

Dans `studio/src/composants/PanneauSite.tsx` : importer `Attente` ; remplacer le bloc `{occupe && ( <p className="discret"> Relais en cours…… </p> )}` par :

```tsx
      {occupe && (
        <p><Attente libelle={`Relais en cours…${v.profil === 'interne' ? ' L’envoi du fichier vidéo peut prendre plusieurs minutes.' : ''}`} /></p>
      )}
```

- [ ] **Step 6: Montage, rendu et enregistrements**

`studio/src/composants/BandeauSuggestions.tsx` : importer `Attente` ; remplacer la ligne du bouton par :

```tsx
        <button disabled={enCours} onClick={relancer}>Relancer les suggestions</button>
        {enCours && <Attente libelle="Relance en cours…" />}
```

`studio/src/composants/PanneauConsignes.tsx` : importer `Attente` ; remplacer `{envoi && <span className="discret">Claude interprète la consigne…</span>}` par `{envoi && <Attente libelle="Claude interprète la consigne…" />}` et `{!envoi && !pret && <span className="discret">En attente de l’enregistrement du montage…</span>}` par `{!envoi && !pret && <Attente libelle="En attente de l’enregistrement du montage…" />}`.

`studio/src/composants/PanneauRendu.tsx` : importer `Attente` ; remplacer `{enCours && !ici && <p className="discret">Rendu en cours pour « {etat?.nom} ».</p>}` par `{enCours && !ici && <p><Attente libelle={`Rendu en cours pour « ${etat?.nom ?? ''} ».`} /></p>}` ; remplacer le bloc `{ici?.enCours && ( <p> {ici.fichier ?? 'Préparation…'} : … % </p> )}` par :

```tsx
      {ici?.enCours && (ici.fichier
        ? <p>{ici.fichier} : {Math.round(ici.progression * 100)} %</p>
        : <p><Attente libelle="Préparation du rendu…" /></p>)}
```

`studio/src/composants/EcranMontage.tsx` et `studio/src/composants/EcranPublication.tsx` : importer `Attente` ; remplacer `<span className="discret">{LIBELLES_ENREGISTREMENT[enregistrement]}</span>` par :

```tsx
        {enregistrement === 'en-attente'
          ? <Attente libelle={LIBELLES_ENREGISTREMENT[enregistrement]} />
          : <span className="discret">{LIBELLES_ENREGISTREMENT[enregistrement]}</span>}
```

Dans `EcranPublication.tsx`, remplacer aussi `{poses === null && !erreurPoses && <p className="discret">Préparation de la banque de poses…</p>}` par `{poses === null && !erreurPoses && <p><Attente libelle="Préparation de la banque de poses…" /></p>}`.

- [ ] **Step 7: Vérifier**

Run: `npm test` puis `npm run typecheck`
Expected: tout PASS ; aucune erreur de type.

Puis, avec le skill `run` (ou `npm run validation`), ouvrir l'écran de publication de `zz-essai-plan7` et cliquer « Rendre la vignette » : le bouton est désactivé, le sablier tourne à côté et dans la zone « Rendu » jusqu'à l'affichage de l'image.

- [ ] **Step 8: Commit**

```bash
git add studio/src/composants/Attente.tsx studio/src/composants/Attente.test.tsx studio/src/styles.css \
  studio/src/composants/CartePublication.tsx studio/src/composants/ChoixVignette.tsx studio/src/composants/PanneauYoutube.tsx \
  studio/src/composants/PanneauSite.tsx studio/src/composants/BandeauSuggestions.tsx studio/src/composants/PanneauConsignes.tsx \
  studio/src/composants/PanneauRendu.tsx studio/src/composants/EcranMontage.tsx studio/src/composants/EcranPublication.tsx
git commit -m "Studio : sablier pour toute attente — rédaction, vignette, YouTube, site, consignes, rendu, enregistrements

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Qualification et diffusion dans le noyau

**Files:**
- Create: `noyau/qualification.ts`, `noyau/qualification.test.ts`

**Interfaces:**
- Produces (exports de `noyau/qualification.ts`) :
  - types `Nature` (= `'pro' | 'perso'`), `Qualification { nature: Nature; confidentielle: boolean }`, `DiffusionYoutube` (= `'aucun' | 'non-repertoriee' | 'privee' | 'publique'`), `DiffusionSite` (= `'fichier' | 'lien' | 'aucun'`), `Diffusion { youtube: DiffusionYoutube; site: DiffusionSite }`
  - `NATURES: Nature[]`, `QUALIFICATION_PAR_DEFAUT: Qualification`
  - `diffusion(q: Qualification): Diffusion`
  - `memeQualification(a: Qualification, b: Qualification): boolean`
  - `qualificationDepuisProfil(profil: unknown): Qualification | null`

- [ ] **Step 1: Écrire les tests**

`noyau/qualification.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { diffusion, memeQualification, QUALIFICATION_PAR_DEFAUT, qualificationDepuisProfil } from './qualification';

describe('diffusion', () => {
  it('déduit YouTube et le site des quatre qualifications', () => {
    expect(diffusion({ nature: 'pro', confidentielle: true })).toEqual({ youtube: 'aucun', site: 'fichier' });
    expect(diffusion({ nature: 'pro', confidentielle: false })).toEqual({ youtube: 'non-repertoriee', site: 'lien' });
    expect(diffusion({ nature: 'perso', confidentielle: true })).toEqual({ youtube: 'privee', site: 'aucun' });
    expect(diffusion({ nature: 'perso', confidentielle: false })).toEqual({ youtube: 'publique', site: 'aucun' });
  });
  it('part d’une vidéo Perso non confidentielle', () => {
    expect(QUALIFICATION_PAR_DEFAUT).toEqual({ nature: 'perso', confidentielle: false });
  });
});

describe('memeQualification', () => {
  it('compare la nature et la confidentialité seulement', () => {
    expect(memeQualification({ nature: 'pro', confidentielle: true }, { nature: 'pro', confidentielle: true })).toBe(true);
    expect(memeQualification({ nature: 'pro', confidentielle: true }, { nature: 'pro', confidentielle: false })).toBe(false);
    expect(memeQualification({ nature: 'pro', confidentielle: false }, { nature: 'perso', confidentielle: false })).toBe(false);
  });
});

describe('qualificationDepuisProfil', () => {
  it('convertit les profils de la version 1', () => {
    expect(qualificationDepuisProfil('interne')).toEqual({ nature: 'pro', confidentielle: true });
    expect(qualificationDepuisProfil('mixte')).toEqual({ nature: 'pro', confidentielle: false });
    expect(qualificationDepuisProfil('perso')).toEqual({ nature: 'perso', confidentielle: false });
  });
  it('ne reconnaît rien d’autre', () => {
    for (const p of ['pro', 'toString', '', undefined, null, 3]) expect(qualificationDepuisProfil(p)).toBeNull();
  });
  it('rend une copie, pas la table interne', () => {
    const q = qualificationDepuisProfil('interne')!;
    q.confidentielle = false;
    expect(qualificationDepuisProfil('interne')).toEqual({ nature: 'pro', confidentielle: true });
  });
});
```

- [ ] **Step 2: Vérifier que les tests échouent**

Run: `npm test -- noyau/qualification.test.ts`
Expected: FAIL (module `./qualification` introuvable).

- [ ] **Step 3: Écrire le module**

`noyau/qualification.ts` :

```ts
// Qualification d’une vidéo par l’auteur et diffusion qu’en déduit l’app : la grille ne vit qu’ici.
export type Nature = 'pro' | 'perso';

export interface Qualification {
  nature: Nature;
  confidentielle: boolean;
}

// 'publique' admet aussi la programmation.
export type DiffusionYoutube = 'aucun' | 'non-repertoriee' | 'privee' | 'publique';
// Fichier hébergé sur le site (comptes autorisés), lien YouTube intégré (visible de tous), ou rien.
export type DiffusionSite = 'fichier' | 'lien' | 'aucun';

export interface Diffusion {
  youtube: DiffusionYoutube;
  site: DiffusionSite;
}

export const NATURES: Nature[] = ['pro', 'perso'];
export const QUALIFICATION_PAR_DEFAUT: Qualification = { nature: 'perso', confidentielle: false };

export function diffusion(q: Qualification): Diffusion {
  if (q.nature === 'pro') return q.confidentielle ? { youtube: 'aucun', site: 'fichier' } : { youtube: 'non-repertoriee', site: 'lien' };
  return { youtube: q.confidentielle ? 'privee' : 'publique', site: 'aucun' };
}

export const memeQualification = (a: Qualification, b: Qualification) => a.nature === b.nature && a.confidentielle === b.confidentielle;

// Profils de publication.json version 1.
const DEPUIS_PROFIL = new Map<string, Qualification>([
  ['interne', { nature: 'pro', confidentielle: true }],
  ['mixte', { nature: 'pro', confidentielle: false }],
  ['perso', { nature: 'perso', confidentielle: false }],
]);

export function qualificationDepuisProfil(profil: unknown): Qualification | null {
  const q = typeof profil === 'string' ? DEPUIS_PROFIL.get(profil) : undefined;
  return q ? { ...q } : null;
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npm test -- noyau/qualification.test.ts` puis `npm run typecheck`
Expected: PASS ; aucune erreur de type.

- [ ] **Step 5: Commit**

```bash
git add noyau/qualification.ts noyau/qualification.test.ts
git commit -m "Publication : qualification Pro ou Perso et confidentialité, diffusion déduite sur YouTube et le site

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Publication v2, règles YouTube et du relais selon la diffusion

Cette tâche change le modèle partagé : à sa fin, les tests et le typage de `noyau/` passent, mais `studio/` ne compile plus et ses tests de publication échouent. Les Tasks 5 et 6 les remettent d'aplomb ; ne pas les corriger ici.

**Files:**
- Modify: `noyau/publication.ts`, `noyau/publication.test.ts`, `noyau/youtube.ts`, `noyau/youtube.test.ts`, `noyau/relais.ts`, `noyau/relais.test.ts`

**Interfaces:**
- Consumes : Task 3 (`diffusion`, `memeQualification`, `NATURES`, `QUALIFICATION_PAR_DEFAUT`, `qualificationDepuisProfil`, types).
- Produces :
  - `noyau/publication.ts` : `VideoPubliee` sans `profil`, avec `nature: Nature` et `confidentielle: boolean` ; `youtube.visibilite: 'privee' | 'non-repertoriee' | 'publique' | 'programmee'` ; `Publication { version: 2; qualificationParDefaut: Qualification; videos }` ; `videoParDefaut(cible, q: Qualification)` ; `migrerPublication(valeur: unknown): unknown` ; `retraitAFaire(v: VideoPubliee): boolean`. `Profil` et `PROFILS` disparaissent.
  - `noyau/youtube.ts` : `validee(v)`, `problemesDiffusion(v, descriptionFinale, r, etat)` (contrôles communs à YouTube et au site), `problemesEnvoi` (même signature qu'avant), `visibilitesIndiquees(q: Qualification)`, `pretePourYoutube(v)` (validée, diffusion YouTube ≠ `aucun`, pas de retrait à faire) ; constantes `SANS_YOUTUBE`, `RETRAIT_D_ABORD`.
  - `noyau/relais.ts` : `FichierVideoSite = { videoUrl: string; videoObject: null } | { videoObject: string; videoUrl: null }` ; `enregistrerRetrait(v): Partial<VideoPubliee>`.

- [ ] **Step 1: Tests de `publication.ts`**

Dans `noyau/publication.test.ts` :

1. Compléter l'import de `./publication` avec `migrerPublication, retraitAFaire` et ajouter `import type { Qualification } from './qualification';`.
2. Ajouter après `const R = …` :

```ts
const PERSO: Qualification = { nature: 'perso', confidentielle: false };
const PRO: Qualification = { nature: 'pro', confidentielle: false };
const PRO_CONF: Qualification = { nature: 'pro', confidentielle: true };
```

3. Remplacer `prete` par :

```ts
const prete = (): Publication => ({
  version: 2,
  qualificationParDefaut: PERSO,
  videos: [{ ...videoParDefaut('complete', PERSO), statut: 'prete', titre: 'Titre', description: 'Desc', tags: ['windows'], vignette: VIGNETTE }],
});
```

4. Dans `describe('accorderPublication')`, remplacer `expect(p.profilParDefaut).toBe('perso');` par `expect(p.qualificationParDefaut).toEqual(PERSO);` et le second test par :

```ts
  it('garde les entrées existantes, ajoute les nouvelles à la qualification par défaut et retire celles qui n’existent plus', () => {
    const avant: Publication = {
      version: 2, qualificationParDefaut: PRO, videos: [{ ...videoParDefaut(1, PRO_CONF), titre: 'Gardé' }, videoParDefaut(3, PERSO)],
    };
    expect(accorderPublication(avant, ['complete', 1]).videos.map(v => [v.cible, v.nature, v.confidentielle, v.titre])).toEqual([
      ['complete', 'pro', false, ''], [1, 'pro', true, 'Gardé'],
    ]);
  });
```

5. Dans `describe('raisonPublication')`, remplacer les deux premières lignes de `refuse une forme invalide` par :

```ts
    expect(raisonPublication({ ...prete(), version: 1 })).toBe('version 2 attendue');
    expect(raisonPublication({ ...prete(), qualificationParDefaut: { nature: 'interne', confidentielle: false } })).toBe('qualificationParDefaut invalide');
    expect(raisonPublication({ ...prete(), videos: [{ ...prete().videos[0]!, nature: 'mixte' }] })).toBe('videos[0] : nature invalide');
    expect(raisonPublication({ ...prete(), videos: [{ ...prete().videos[0]!, confidentielle: 'oui' }] }))
      .toBe('videos[0] : confidentielle doit être vrai ou faux');
```

6. Dans les tests des mentions, remplacer toutes les occurrences de `pour une vidéo publique` par `pour une vidéo envoyée sur YouTube`, et la ligne `expect(problemesPreparation({ ...avec, profil: 'interne' }, …)).toEqual([]);` par :

```ts
    expect(problemesPreparation({ ...avec, ...PRO_CONF }, avec.description, R, true)).toEqual([]);
    for (const q of [PRO, { nature: 'perso' as const, confidentielle: true }]) {
      expect(problemesPreparation({ ...avec, ...q }, avec.description, R, true)).toHaveLength(1);
    }
```

et renommer ce test : `'refuse une mention interdite dans une vidéo envoyée sur YouTube, même privée ou non répertoriée, pas dans une vidéo Pro confidentielle'`.

7. Ajouter à la fin du fichier :

```ts
describe('migrerPublication', () => {
  const v1 = (profil: string) => {
    const { nature: _n, confidentielle: _c, ...base } = videoParDefaut('complete', PERSO);
    return { ...base, profil };
  };
  it('convertit une version 1 : profils en qualifications', () => {
    const p = migrerPublication({ version: 1, profilParDefaut: 'mixte', videos: [v1('interne'), { ...v1('perso'), cible: 1 }] }) as Publication;
    expect(p.version).toBe(2);
    expect(p.qualificationParDefaut).toEqual(PRO);
    expect(p.videos.map(v => [v.nature, v.confidentielle])).toEqual([['pro', true], ['perso', false]]);
    expect(p).not.toHaveProperty('profilParDefaut');
    expect(p.videos[0]).not.toHaveProperty('profil');
    expect(raisonPublication(p)).toBeNull();
  });
  it('laisse une version 2 telle quelle, et un profil inconnu à raisonPublication', () => {
    const v2 = prete();
    expect(migrerPublication(v2)).toBe(v2);
    expect(raisonPublication(migrerPublication({ version: 1, profilParDefaut: 'perso', videos: [v1('autre')] })))
      .toBe('videos[0] : nature invalide');
    expect(raisonPublication(migrerPublication({ version: 1, profilParDefaut: 'autre', videos: [] }))).toBe('qualificationParDefaut invalide');
  });
});

describe('requalification', () => {
  it('remet à préparer une vidéo prête dont la qualification change', () => {
    const p = prete();
    const q = appliquerModifications(p, modifierVideo(p, 'complete', PRO));
    expect(q.videos[0]).toMatchObject({ nature: 'pro', confidentielle: false, statut: 'a-preparer' });
  });
  it('signale un retrait du site à faire quand une vidéo sur le site n’y a plus sa place', () => {
    const v = { ...prete().videos[0]!, replit: { id: 42, categorieId: 1, playlistId: null } };
    expect(retraitAFaire(v)).toBe(true);
    expect(retraitAFaire({ ...v, ...PRO })).toBe(false);
    expect(retraitAFaire({ ...v, replit: { id: null, categorieId: null, playlistId: null } })).toBe(false);
  });
});
```

Run: `npm test -- noyau/publication.test.ts`
Expected: FAIL (exports manquants, version 1 attendue…).

- [ ] **Step 2: Modèle v2 dans `publication.ts`**

Dans `noyau/publication.ts` :

1. Ajouter l'import :

```ts
import { diffusion, memeQualification, NATURES, QUALIFICATION_PAR_DEFAUT, qualificationDepuisProfil, type Nature, type Qualification } from './qualification';
```

2. Supprimer `export type Profil = …` et `export const PROFILS: Profil[] = …`.
3. Dans `VideoPubliee`, remplacer `profil: Profil;` par :

```ts
  // Qualification choisie par l’auteur ; la diffusion s’en déduit (noyau/qualification.ts).
  nature: Nature;
  confidentielle: boolean;
```

et le type de `youtube` par `youtube: { id: string | null; visibilite: 'privee' | 'non-repertoriee' | 'publique' | 'programmee'; programmeeLe: string | null; playlistId: string | null };`.

4. Remplacer `Publication` par :

```ts
export interface Publication {
  version: 2;
  qualificationParDefaut: Qualification;
  videos: VideoPubliee[];
}
```

5. Remplacer `videoParDefaut` (signature et deux premières propriétés) :

```ts
export function videoParDefaut(cible: CiblePublication, q: Qualification): VideoPubliee {
  return {
    cible,
    publier: cible === 'complete',
    nature: q.nature,
    confidentielle: q.confidentielle,
```

(le reste de l'objet est inchangé).

6. Remplacer `accorderPublication` par :

```ts
export function accorderPublication(p: Publication | null, cibles: CiblePublication[]): Publication {
  const q = p?.qualificationParDefaut ?? QUALIFICATION_PAR_DEFAUT;
  return {
    version: 2,
    qualificationParDefaut: { ...q },
    videos: cibles.map(c => p?.videos.find(v => v.cible === c) ?? videoParDefaut(c, q)),
  };
}
```

7. Dans `appliquerModifications`, remplacer `videoParDefaut(n.cible, nouvelle.profilParDefaut)` par `videoParDefaut(n.cible, nouvelle.qualificationParDefaut)` et `a.profil !== n.profil` par `!memeQualification(a, n)`.

8. Après `appliquerModifications`, ajouter :

```ts
// Vidéo encore sur le site alors que sa qualification ne l’y met plus (passée en Perso) : à retirer.
export const retraitAFaire = (v: VideoPubliee) => diffusion(v).site === 'aucun' && v.replit.id !== null;
```

9. Après `const estId = …`, ajouter :

```ts
const estQualification = (q: unknown) => estObjet(q) && NATURES.includes(q.nature as Nature) && typeof q.confidentielle === 'boolean';

// publication.json version 1 (profils Interne, Perso, Mixte) lu comme une version 2 ; il est réécrit en version 2
// au prochain enregistrement. Une forme inattendue est rendue telle quelle : raisonPublication dira ce qui ne va pas.
export function migrerPublication(valeur: unknown): unknown {
  if (!estObjet(valeur) || valeur.version !== 1 || !Array.isArray(valeur.videos)) return valeur;
  const { profilParDefaut, ...reste } = valeur;
  return {
    ...reste,
    version: 2,
    qualificationParDefaut: qualificationDepuisProfil(profilParDefaut) ?? profilParDefaut,
    videos: valeur.videos.map((v: unknown) => {
      if (!estObjet(v)) return v;
      const { profil, ...autres } = v;
      return { ...autres, ...(qualificationDepuisProfil(profil) ?? {}) };
    }),
  };
}
```

10. Dans `raisonPublication`, remplacer les lignes de version et de profil par défaut :

```ts
  if (p.version !== 2) return 'version 2 attendue';
  if (!estQualification(p.qualificationParDefaut)) return 'qualificationParDefaut invalide';
```

et, dans la boucle, la ligne du profil par :

```ts
    if (!NATURES.includes(v.nature as Nature)) return `${ou} : nature invalide`;
    if (typeof v.confidentielle !== 'boolean') return `${ou} : confidentielle doit être vrai ou faux`;
```

11. Dans `problemesPreparation`, remplacer le bloc des mentions par :

```ts
  // Tout ce qui part sur YouTube, même privé ou non répertorié, peut être vu hors du cercle prévu.
  if (diffusion(v).youtube !== 'aucun') {
    for (const m of mentionsTrouvees([v.titre, descriptionFinale, ...v.tags, v.vignette?.accroche ?? ''], r.mentionsInterdites)) {
      problemes.push(`Mention interdite pour une vidéo envoyée sur YouTube : « ${m} ».`);
    }
  }
```

Run: `npm test -- noyau/publication.test.ts`
Expected: PASS.

- [ ] **Step 3: Tests de `youtube.ts`**

Dans `noyau/youtube.test.ts` :

1. Compléter l'import de `./youtube` avec `problemesDiffusion, RETRAIT_D_ABORD, SANS_YOUTUBE, validee`, et ajouter :

```ts
import type { Qualification } from './qualification';

const PERSO: Qualification = { nature: 'perso', confidentielle: false };
const PERSO_CONF: Qualification = { nature: 'perso', confidentielle: true };
const PRO: Qualification = { nature: 'pro', confidentielle: false };
const PRO_CONF: Qualification = { nature: 'pro', confidentielle: true };
```

2. Dans `prete`, remplacer `videoParDefaut('complete', 'perso')` par `videoParDefaut('complete', PERSO)`.
3. Remplacer le test `indique Privée pour Interne, Publique ou Programmée sinon` par :

```ts
  it('indique la visibilité déduite de la qualification', () => {
    expect(visibilitesIndiquees(PRO_CONF)).toEqual([]);
    expect(visibilitesIndiquees(PRO)).toEqual(['non-repertoriee']);
    expect(visibilitesIndiquees(PERSO_CONF)).toEqual(['privee']);
    expect(visibilitesIndiquees(PERSO)).toEqual(['publique', 'programmee']);
  });
```

4. Dans le test `ne prépare que les vidéos cochées et validées`, ajouter :

```ts
    expect(validee(prete({ ...PRO_CONF }))).toBe(true);
    expect(pretePourYoutube(prete({ ...PRO_CONF }))).toBe(false);
    expect(pretePourYoutube(prete({ statut: 'relayee', replit: { id: 42, categorieId: 1, playlistId: null } }))).toBe(false);
```

5. Dans `describe('problemesEnvoi')`, ajouter :

```ts
  it('refuse une vidéo Pro confidentielle et une vidéo encore sur le site', () => {
    expect(problemesEnvoi(prete({ ...PRO_CONF }), 'Desc', R, { rendu: RENDU, octetsVignette: 1000 })).toEqual([SANS_YOUTUBE]);
    expect(problemesDiffusion(prete({ ...PRO_CONF }), 'Desc', R, { rendu: RENDU, octetsVignette: 1000 })).toEqual([]);
    expect(problemesEnvoi(prete({ statut: 'relayee', replit: { id: 42, categorieId: 1, playlistId: null } }), 'Desc', R, {
      rendu: RENDU, octetsVignette: 1000,
    })).toEqual([RETRAIT_D_ABORD]);
  });
```

6. Remplacer le test `indique Privée pour une vidéo Interne et omet la playlist si elle est seule` par :

```ts
  it('indique la visibilité déduite et omet la playlist si la vidéo est seule', () => {
    const consigne = (q: Qualification) => textesYoutube(prete({ ...q }), 'Desc', { playlist: null, cheminRendu: 'x.mp4' }).reglages;
    expect(consigne(PERSO_CONF)).toContain('Visibilité : Privée');
    expect(consigne(PRO)).toContain('Visibilité : Non répertoriée');
    expect(consigne(PRO)).not.toContain('Playlist');
    expect(() => consigne(PRO_CONF)).toThrow(SANS_YOUTUBE);
  });
```

7. Dans `describe('envoi')`, remplacer les deux premiers tests par :

```ts
  it('accepte un envoi conforme à la qualification', () => {
    expect(raisonEnvoi(prete(), envoi)).toBeNull();
    expect(raisonEnvoi(prete(), { id: ID, visibilite: 'programmee', programmeeLe: '2026-10-21T16:00:00.000Z' })).toBeNull();
    expect(raisonEnvoi(prete({ ...PERSO_CONF }), { ...envoi, visibilite: 'privee' })).toBeNull();
    expect(raisonEnvoi(prete({ ...PRO }), { ...envoi, visibilite: 'non-repertoriee' })).toBeNull();
  });
  it('refuse une vidéo non validée, une visibilité contraire à la qualification et une date incohérente', () => {
    expect(raisonEnvoi(prete({ statut: 'a-preparer' }), envoi)).toBe('Validez d’abord la vidéo pour la publication.');
    expect(raisonEnvoi(prete({ ...PRO_CONF }), envoi)).toBe(SANS_YOUTUBE);
    expect(raisonEnvoi(prete({ statut: 'relayee', replit: { id: 42, categorieId: 1, playlistId: null } }), envoi)).toBe(RETRAIT_D_ABORD);
    expect(raisonEnvoi(prete({ ...PERSO_CONF }), envoi)).toBe('Une vidéo Perso confidentielle reste privée sur YouTube.');
    expect(raisonEnvoi(prete({ ...PRO }), envoi)).toBe('Une vidéo Pro non confidentielle est non répertoriée sur YouTube.');
    expect(raisonEnvoi(prete(), { ...envoi, visibilite: 'non-repertoriee' }))
      .toBe('Une vidéo Perso non confidentielle est publique ou programmée sur YouTube.');
    expect(raisonEnvoi(prete(), { ...envoi, visibilite: 'programmee' })).toBe('Date et heure de mise en ligne attendues.');
    expect(raisonEnvoi(prete(), { ...envoi, visibilite: 'programmee', programmeeLe: 'demain' })).toBe('Date et heure de mise en ligne attendues.');
    expect(raisonEnvoi(prete(), { ...envoi, programmeeLe: '2026-10-21T16:00:00.000Z' })).toBe('Date de mise en ligne réservée à une vidéo programmée.');
  });
```

8. Dans `describe('bilanLecture')`, remplacer `envoyee` et les deux premiers tests par :

```ts
  const envoyee = (q: Qualification, youtube: Partial<VideoPubliee['youtube']> = {}) =>
    prete({ ...q, statut: 'envoyee-youtube', youtube: { id: ID, visibilite: 'publique', programmeeLe: null, playlistId: null, ...youtube } });
  it('alerte si une vidéo privée est lisible publiquement', () => {
    expect(bilanLecture(envoyee(PERSO_CONF, { visibilite: 'privee' }), 'publique', maintenant)).toEqual({
      alerte: true, message: 'Vidéo lisible publiquement : passez-la en privé dans YouTube Studio.',
    });
    expect(bilanLecture(envoyee(PERSO_CONF, { visibilite: 'privee' }), 'non-publique', maintenant)).toEqual({
      alerte: false, message: 'Vidéo privée : elle n’est pas lisible publiquement.',
    });
  });
  it('confirme une vidéo non répertoriée lisible par lien, sans pouvoir vérifier qu’elle n’est pas publique', () => {
    expect(bilanLecture(envoyee(PRO, { visibilite: 'non-repertoriee' }), 'publique', maintenant)).toEqual({
      alerte: false, message: 'Vidéo lisible par lien. Vérifiez dans YouTube Studio qu’elle est bien Non répertoriée.',
    });
    expect(bilanLecture(envoyee(PRO, { visibilite: 'non-repertoriee' }), 'non-publique', maintenant)).toEqual({
      alerte: true, message: 'Vidéo pas encore lisible : passez-la en Non répertoriée dans YouTube Studio.',
    });
  });
  it('confirme une vidéo publique en ligne', () => {
    expect(bilanLecture(envoyee(PERSO), 'publique', maintenant)).toEqual({ alerte: false, message: 'Vidéo en ligne, lisible publiquement.' });
  });
```

Dans les deux tests suivants (`attend l’heure d’une vidéo programmée…`, `signale une vérification impossible`), remplacer `envoyee('perso'` par `envoyee(PERSO`.

Run: `npm test -- noyau/youtube.test.ts`
Expected: FAIL.

- [ ] **Step 4: Règles YouTube**

Dans `noyau/youtube.ts` :

1. Remplacer la ligne d'import par :

```ts
import { nomCible, problemesPreparation, retraitAFaire, type CiblePublication, type ReglagesPublication, type VideoPubliee } from './publication';
import { diffusion, type DiffusionYoutube, type Qualification } from './qualification';
```

2. Remplacer `const STATUTS_ENVOI … ;` par :

```ts
const STATUTS_VALIDES: VideoPubliee['statut'][] = ['prete', 'envoyee-youtube', 'relayee'];
type AvecYoutube = Exclude<DiffusionYoutube, 'aucun'>;

export const SANS_YOUTUBE = 'Une vidéo Pro confidentielle ne va pas sur YouTube : elle est seulement relayée sur le site.';
export const RETRAIT_D_ABORD = 'Retirez d’abord la vidéo du site.';
```

3. Remplacer `visibilitesIndiquees`, `pretePourYoutube` et `problemesEnvoi` par :

```ts
const VISIBILITES: Record<DiffusionYoutube, VisibiliteYoutube[]> = {
  aucun: [],
  'non-repertoriee': ['non-repertoriee'],
  privee: ['privee'],
  publique: ['publique', 'programmee'],
};

export const visibilitesIndiquees = (q: Qualification): VisibiliteYoutube[] => VISIBILITES[diffusion(q).youtube];

// Cochée et validée : prête à partir sur YouTube ou sur le site, ou à y être mise à jour.
export const validee = (v: VideoPubliee) => v.publier && STATUTS_VALIDES.includes(v.statut);

export const pretePourYoutube = (v: VideoPubliee) => validee(v) && diffusion(v).youtube !== 'aucun' && !retraitAFaire(v);

export const dossierYoutube = (c: CiblePublication) => `publication/${nomCible(c)}`;

// Contrôles communs à l’envoi sur YouTube et au relais sur le site.
export function problemesDiffusion(
  v: VideoPubliee, descriptionFinale: string, r: ReglagesPublication,
  etat: { rendu: { fichier: string; present: boolean }; octetsVignette: number | null },
): string[] {
  const problemes: string[] = [];
  if (!v.publier) problemes.push('Vidéo non cochée pour la publication.');
  if (!STATUTS_VALIDES.includes(v.statut)) problemes.push('Vidéo pas encore validée pour la publication.');
  if (!etat.rendu.present) problemes.push(`Rendu absent : ${etat.rendu.fichier}.`);
  problemes.push(...problemesPreparation(v, descriptionFinale, r, etat.octetsVignette !== null));
  if (etat.octetsVignette !== null && etat.octetsVignette > r.vignetteOctetsMax) {
    problemes.push(`Vignette trop lourde : ${etat.octetsVignette} octets, ${r.vignetteOctetsMax} au plus.`);
  }
  return problemes;
}

export function problemesEnvoi(
  v: VideoPubliee, descriptionFinale: string, r: ReglagesPublication,
  etat: { rendu: { fichier: string; present: boolean }; octetsVignette: number | null },
): string[] {
  return [
    ...(diffusion(v).youtube === 'aucun' ? [SANS_YOUTUBE] : []),
    ...(retraitAFaire(v) ? [RETRAIT_D_ABORD] : []),
    ...problemesDiffusion(v, descriptionFinale, r, etat),
  ];
}
```

(supprimer l'ancienne ligne `export const dossierYoutube = …`, déplacée ci-dessus).

4. Remplacer `CONSIGNE_VISIBILITE` et la ligne `Visibilité :` de `textesYoutube` :

```ts
const CONSIGNE_VISIBILITE: Record<AvecYoutube, string> = {
  'non-repertoriee': 'Non répertoriée (Pro non confidentielle : jamais publique ; relayée sur le site une fois l’URL enregistrée)',
  privee: 'Privée (Perso confidentielle : jamais publique ni non répertoriée)',
  publique: 'Publique, ou Programmée à la date voulue (Perso non confidentielle)',
};
```

Au début de `textesYoutube`, ajouter :

```ts
  const d = diffusion(v).youtube;
  if (d === 'aucun') throw new Error(SANS_YOUTUBE);
```

et remplacer `` `Visibilité : ${CONSIGNE_VISIBILITE[v.profil]}` `` par `` `Visibilité : ${CONSIGNE_VISIBILITE[d]}` ``.

5. Remplacer `raisonEnvoi` par :

```ts
const REFUS_VISIBILITE: Record<AvecYoutube, string> = {
  'non-repertoriee': 'Une vidéo Pro non confidentielle est non répertoriée sur YouTube.',
  privee: 'Une vidéo Perso confidentielle reste privée sur YouTube.',
  publique: 'Une vidéo Perso non confidentielle est publique ou programmée sur YouTube.',
};

export function raisonEnvoi(v: VideoPubliee, e: EnvoiYoutube): string | null {
  if (!validee(v)) return 'Validez d’abord la vidéo pour la publication.';
  const d = diffusion(v).youtube;
  if (d === 'aucun') return SANS_YOUTUBE;
  if (retraitAFaire(v)) return RETRAIT_D_ABORD;
  if (!VISIBILITES[d].includes(e.visibilite)) return REFUS_VISIBILITE[d];
  if (e.visibilite === 'programmee') {
    if (!e.programmeeLe || Number.isNaN(Date.parse(e.programmeeLe))) return 'Date et heure de mise en ligne attendues.';
  } else if (e.programmeeLe !== null) {
    return 'Date de mise en ligne réservée à une vidéo programmée.';
  }
  return null;
}
```

6. Dans `bilanLecture`, remplacer le bloc `if (v.profil === 'interne') { … }` par :

```ts
  const d = diffusion(v).youtube;
  if (d === 'non-repertoriee') {
    // oEmbed lit une vidéo non répertoriée comme une publique : le réglage se vérifie dans YouTube Studio.
    return publique
      ? { alerte: false, message: 'Vidéo lisible par lien. Vérifiez dans YouTube Studio qu’elle est bien Non répertoriée.' }
      : { alerte: true, message: 'Vidéo pas encore lisible : passez-la en Non répertoriée dans YouTube Studio.' };
  }
  // Privée, ou Pro confidentielle déjà envoyée sur YouTube avant sa requalification : elle doit rester privée.
  if (d === 'privee' || d === 'aucun') {
    return publique
      ? { alerte: true, message: 'Vidéo lisible publiquement : passez-la en privé dans YouTube Studio.' }
      : { alerte: false, message: 'Vidéo privée : elle n’est pas lisible publiquement.' };
  }
```

Run: `npm test -- noyau/youtube.test.ts`
Expected: PASS.

- [ ] **Step 5: Tests de `relais.ts`**

Dans `noyau/relais.test.ts` :

1. Compléter l'import de `./relais` avec `enregistrerRetrait`, et ajouter `import type { Qualification } from './qualification';` puis :

```ts
const PRO: Qualification = { nature: 'pro', confidentielle: false };
const PRO_CONF: Qualification = { nature: 'pro', confidentielle: true };
const PERSO: Qualification = { nature: 'perso', confidentielle: false };
```

2. Dans `video`, remplacer `videoParDefaut('complete', 'interne')` par `videoParDefaut('complete', PRO_CONF)`.
3. Renommer `mixteEnvoyee` en `lienEnvoyee` (toutes les occurrences) et remplacer sa définition par :

```ts
const lienEnvoyee = (youtube: Partial<VideoPubliee['youtube']> = {}) => video({
  ...PRO, statut: 'envoyee-youtube', youtube: { id: ID, visibilite: 'non-repertoriee', programmeeLe: null, playlistId: null, ...youtube },
});
```

4. Remplacer les tests de `describe('problemesRelais')` qui nomment des profils :

```ts
  it('accepte une vidéo Pro confidentielle prête, envoyée ou déjà relayée', () => {
    for (const statut of ['prete', 'envoyee-youtube', 'relayee'] as const) expect(problemesRelais(video({ statut }), 'Desc', R, ETAT)).toEqual([]);
  });
  it('n’accepte une vidéo Pro non confidentielle qu’une fois l’envoi YouTube enregistré', () => {
    expect(problemesRelais(video({ ...PRO }), 'Desc', R, ETAT))
      .toEqual(['Enregistrez d’abord l’envoi sur YouTube : une vidéo Pro non confidentielle est relayée avec son lien YouTube.']);
    expect(problemesRelais(lienEnvoyee(), 'Desc', R, ETAT)).toEqual([]);
  });
  it('refuse une vidéo Perso', () => {
    expect(problemesRelais(video({ ...PERSO }), 'Desc', R, ETAT)).toEqual(['Une vidéo Perso n’est pas relayée sur le site.']);
  });
```

et, dans le test des mentions, son nom par `'refuse une mention interdite pour une vidéo Pro non confidentielle, pas pour une vidéo Pro confidentielle'` et `pour une vidéo publique` par `pour une vidéo envoyée sur YouTube`.

5. Dans `describe('raisonLectureRelais')`, garder le premier test et remplacer le second (`fait attendre une vidéo programmée et explique les autres cas`) par :

```ts
  it('explique pourquoi une vidéo non lisible n’est pas encore relayée', () => {
    expect(raisonLectureRelais(lienEnvoyee(), 'non-publique', maintenant))
      .toBe('Vidéo pas encore lisible : passez-la en Non répertoriée dans YouTube Studio.');
    expect(raisonLectureRelais(lienEnvoyee(), 'inconnue', maintenant)).toBe('Vérification impossible : YouTube ne répond pas, réessayez plus tard.');
  });
```

(une vidéo Pro non confidentielle n'est jamais programmée : le cas de l'heure programmée reste couvert par `bilanLecture` dans `noyau/youtube.test.ts`).

6. Dans `describe('corpsRelais')`, remplacer les deux premiers tests par :

```ts
  it('envoie le fichier d’une vidéo Pro confidentielle, réservée aux comptes autorisés', () => {
    expect(corpsRelais(video(), {
      dureeSecondes: 312.6, fichier: { videoObject: 'objet-video', videoUrl: null }, thumbnailObject: 'objet-vignette',
    })).toEqual({
      title: 'Le SSO expliqué', description: 'Desc', tags: ['sso'], categoryId: 3, playlistId: 7, durationSeconds: 313,
      format: 'long', status: 'published', visibility: 'interne', videoObject: 'objet-video', videoUrl: null, thumbnailObject: 'objet-vignette',
    });
  });
  it('intègre la vidéo YouTube d’une vidéo Pro non confidentielle, visible de tous, sans fichier', () => {
    const corps = corpsRelais(lienEnvoyee(), { dureeSecondes: 60, fichier: { videoUrl: urlYoutube(ID), videoObject: null }, thumbnailObject: 'v' });
    expect(corps).toMatchObject({ visibility: 'public', videoUrl: `https://www.youtube.com/watch?v=${ID}`, videoObject: null, thumbnailObject: 'v' });
  });
```

et, dans `refuse une vidéo sans catégorie`, remplacer `fichier: { videoObject: 'o' }` par `fichier: { videoObject: 'o', videoUrl: null }`.

7. Ajouter à la fin :

```ts
describe('enregistrerRetrait', () => {
  const relayee = (youtube: Partial<VideoPubliee['youtube']> = {}) => video({
    ...PERSO, statut: 'relayee', replit: { id: 42, categorieId: 3, playlistId: 7 }, youtube: { ...video().youtube, ...youtube },
    erreur: { etape: 'replit', message: 'x', le: '2026-10-22T10:00:00.000Z' },
  });
  it('efface la vidéo du site et ramène à prête, ou à envoyée si elle a une URL YouTube', () => {
    expect(enregistrerRetrait(relayee())).toEqual({ statut: 'prete', replit: { id: null, categorieId: null, playlistId: null }, erreur: null });
    expect(enregistrerRetrait(relayee({ id: ID })).statut).toBe('envoyee-youtube');
  });
  it('garde un statut autre que relayée', () => {
    expect(enregistrerRetrait({ ...relayee(), statut: 'a-preparer' }).statut).toBe('a-preparer');
  });
});
```

Run: `npm test -- noyau/relais.test.ts`
Expected: FAIL.

- [ ] **Step 6: Règles du relais**

Dans `noyau/relais.ts` :

1. Remplacer les imports par :

```ts
import type { ReglagesPublication, VideoPubliee } from './publication';
import { diffusion } from './qualification';
import { bilanLecture, problemesDiffusion, type LectureYoutube } from './youtube';
```

2. Remplacer `FichierVideoSite` par :

```ts
// Vidéo sur le site : fichier hébergé dans son stockage (Pro confidentielle) ou vidéo YouTube intégrée (Pro non confidentielle).
// L’autre champ part à null : une vidéo qui change de forme ne garde rien de l’ancienne.
export type FichierVideoSite = { videoUrl: string; videoObject: null } | { videoObject: string; videoUrl: null };
```

3. Remplacer `EtatRelais`, `STATUTS_MIXTE` et `problemesRelais` par :

```ts
export type EtatRelais = Parameters<typeof problemesDiffusion>[3] & { siteConfigure: boolean };

const STATUTS_LIEN: VideoPubliee['statut'][] = ['envoyee-youtube', 'relayee'];

export function problemesRelais(v: VideoPubliee, descriptionFinale: string, r: ReglagesPublication, etat: EtatRelais): string[] {
  const site = diffusion(v).site;
  if (site === 'aucun') return ['Une vidéo Perso n’est pas relayée sur le site.'];
  const problemes = problemesDiffusion(v, descriptionFinale, r, etat);
  if (site === 'lien' && (!STATUTS_LIEN.includes(v.statut) || !v.youtube.id)) {
    problemes.push('Enregistrez d’abord l’envoi sur YouTube : une vidéo Pro non confidentielle est relayée avec son lien YouTube.');
  }
  if (v.replit.categorieId === null) problemes.push('Choisissez la catégorie du site.');
  if (!etat.siteConfigure) problemes.push('Site non configuré : renseignez REPLIT_SITE_URL et REPLIT_API_KEY dans .env, puis relancez le studio.');
  return problemes;
}
```

4. Remplacer le commentaire de `raisonLectureRelais` par `// Une vidéo relayée avec son lien YouTube ne l’est que lisible par lien, vérifié par oEmbed au moment du relais.`
5. Dans `corpsRelais`, remplacer `visibility: v.profil === 'interne' ? 'interne' : 'public',` par `visibility: diffusion(v).site === 'fichier' ? 'interne' : 'public',`.
6. Ajouter à la fin :

```ts
// Vidéo retirée du site : plus d’identifiant ni de catégorie, et le statut d’avant le relais.
export function enregistrerRetrait(v: VideoPubliee): Partial<VideoPubliee> {
  const statut = v.statut === 'relayee' ? (v.youtube.id ? 'envoyee-youtube' : 'prete') : v.statut;
  return { statut, replit: { id: null, categorieId: null, playlistId: null }, erreur: null };
}
```

- [ ] **Step 7: Vérifier**

Run: `npm test -- noyau/` puis `npm run typecheck`
Expected: tous les tests de `noyau/` PASS. Le typage ne signale d'erreurs que dans `studio/` (profil, `PROFILS`, `profilParDefaut`, `videoObject` sans `videoUrl`) : elles sont corrigées par les Tasks 5 et 6.

- [ ] **Step 8: Commit**

```bash
git add noyau/publication.ts noyau/publication.test.ts noyau/youtube.ts noyau/youtube.test.ts noyau/relais.ts noyau/relais.test.ts
git commit -m "Publication : publication.json en version 2 qualifiée, v1 convertie, YouTube et relais selon la diffusion déduite, Non répertoriée, retrait du site

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Serveur — lecture convertie, Non répertoriée, relais et retrait du site

**Files:**
- Modify: `studio/serveur/site-replit.ts`, `studio/serveur/site-replit.test.ts`, `studio/serveur/redaction.ts`, `studio/serveur/redaction.test.ts`, `studio/serveur/publication.ts`, `studio/serveur/publication.test.ts`

**Interfaces:**
- Consumes : Task 3 et Task 4 (`migrerPublication`, `diffusion`, `NATURES`, `enregistrerRetrait`, `FichierVideoSite`…).
- Produces :
  - `ClientSite.supprimerVideo(id: number): Promise<void>` (404 compté comme réussi)
  - `DemandeRedaction.qualification: Qualification` (remplace `profil`)
  - route `POST /api/tournages/<nom>/publication/site/retirer` `{ cible, nature, confidentielle }` → `Publication` ; 400 qualification invalide, 409 rien à retirer ou relais en cours, 422 site non configuré, 502 échec du site.

- [ ] **Step 1: Tests du client du site**

Dans `studio/serveur/site-replit.test.ts`, dans `CORPS`, remplacer `videoObject: 'abc', thumbnailObject: 'def',` par `videoObject: 'abc', videoUrl: null, thumbnailObject: 'def',`, puis ajouter dans `describe('creerClientSite')` :

```ts
  it('supprime une vidéo du site avec la clé, et compte une vidéo déjà absente comme retirée', async () => {
    reponse = r => (r.methode === 'DELETE' && r.chemin === '/api/videos/42' ? [204, null] : [404, { error: 'Not found' }]);
    await site().supprimerVideo(42);
    expect(requetes[0]).toMatchObject({ methode: 'DELETE', chemin: '/api/videos/42' });
    expect(requetes[0]!.entetes['x-api-key']).toBe('cle-secrete');
    await expect(site().supprimerVideo(7)).resolves.toBeUndefined();
  });
  it('explique un retrait refusé : la vidéo reste visible sur le site', async () => {
    reponse = () => [500, { error: 'boom' }];
    await expect(site().supprimerVideo(42)).rejects.toThrow('Suppression refusée par le site (500 : boom) ; la vidéo y est encore visible.');
    reponse = () => [401, {}];
    await expect(site().supprimerVideo(42)).rejects.toThrow(
      'Clé refusée par le site : vérifiez REPLIT_API_KEY dans .env et AUTOMATION_API_KEY sur le site ; la vidéo y est encore visible.',
    );
  });
```

Run: `npm test -- studio/serveur/site-replit.test.ts`
Expected: FAIL (`supprimerVideo` absent).

- [ ] **Step 2: Client du site**

Dans `studio/serveur/site-replit.ts` :

1. Dans `ClientSite`, ajouter : `  supprimerVideo: (id: number) => Promise<void>;`
2. Après `const RIEN_PERDU = …`, ajouter : `const ENCORE_VISIBLE = 'la vidéo y est encore visible';`
3. Remplacer la signature et le corps de la requête de `appeler`, ainsi que `refus`, par :

```ts
  // `suite` dit à l’auteur ce que devient son action après un échec.
  async function appeler(
    chemin: string, methode: string, corps: unknown, suite = RIEN_PERDU,
  ): Promise<{ statut: number; json: Record<string, unknown> }> {
    let reponse: Response;
    try {
      reponse = await recuperer(`${base}${chemin}`, {
        method: methode, headers: entetes, body: corps === undefined ? undefined : JSON.stringify(corps), signal: AbortSignal.timeout(DELAI),
      });
    } catch (e) {
      throw new Error(`Site injoignable (${texteErreur(e)}) : ${suite}.`);
    }
    if (reponse.status === 401 || reponse.status === 403) {
      throw new Error(`Clé refusée par le site : vérifiez REPLIT_API_KEY dans .env et AUTOMATION_API_KEY sur le site ; ${suite}.`);
    }
    const json: unknown = await reponse.json().catch(() => ({}));
    return { statut: reponse.status, json: estObjet(json) ? json : {} };
  }
  const refus = (quoi: string, statut: number, json: Record<string, unknown>, suite = RIEN_PERDU) =>
    new Error(`${quoi} refusée par le site (${statut}${typeof json.error === 'string' ? ` : ${json.error}` : ''}) ; ${suite}.`);
```

4. Ajouter dans l'objet renvoyé, après `enregistrerVideo` :

```ts
    async supprimerVideo(id) {
      const { statut, json } = await appeler(`/api/videos/${id}`, 'DELETE', undefined, ENCORE_VISIBLE);
      // 404 : la vidéo n’est déjà plus sur le site, rien à retirer.
      if (statut !== 200 && statut !== 204 && statut !== 404) throw refus('Suppression', statut, json, ENCORE_VISIBLE);
    },
```

Run: `npm test -- studio/serveur/site-replit.test.ts`
Expected: PASS.

- [ ] **Step 3: Rédaction selon la qualification**

Dans `studio/serveur/redaction.test.ts` : remplacer `profil: 'perso',` par `qualification: { nature: 'perso', confidentielle: false },` ; remplacer le test `demande un ton sobre pour une vidéo interne…` par :

```ts
  it('demande un ton sobre pour une vidéo Pro confidentielle, sans la règle de mention', () => {
    const prompt = construirePromptRedaction({ ...demande, qualification: { nature: 'pro', confidentielle: true }, chapitres: [] });
    expect(prompt).toContain('usage interne');
    expect(prompt).not.toContain('ne mentionne aucun employeur');
    expect(prompt).not.toContain('Chapitres de la vidéo');
  });
  it('garde la règle de mention pour toute vidéo envoyée sur YouTube, même privée', () => {
    const prompt = construirePromptRedaction({ ...demande, qualification: { nature: 'perso', confidentielle: true } });
    expect(prompt).toContain('ne mentionne aucun employeur');
  });
```

Dans `studio/serveur/redaction.ts` : remplacer `import type { Profil } from '../../noyau/publication';` par `import { diffusion, type Qualification } from '../../noyau/qualification';` ; dans `DemandeRedaction`, remplacer `profil: Profil;` par `qualification: Qualification;` ; remplacer le calcul de `ton` par :

```ts
  const ton = diffusion(d.qualification).youtube === 'aucun'
    ? 'Cette vidéo est destinée à un usage interne : ton sobre et professionnel.'
    : 'Cette vidéo part sur YouTube : ne mentionne aucun employeur, client ni organisation, même si la transcription en cite.';
```

Run: `npm test -- studio/serveur/redaction.test.ts`
Expected: PASS.

- [ ] **Step 4: Tests des routes**

Dans `studio/serveur/publication.test.ts` :

1. Remplacer l'import `import type { Publication } from '../../noyau/publication';` par :

```ts
import { videoParDefaut, type Publication } from '../../noyau/publication';
import type { Qualification } from '../../noyau/qualification';
```

2. Dans `config.site` du `beforeEach`, ajouter : `      supprimerVideo: vi.fn(async () => {}),`
3. Dans le test `rédaction`, remplacer `profil: 'perso',` par `qualification: { nature: 'perso', confidentielle: false },`.
4. Remplacer `const ID = …` et l'en-tête du helper `prete` par :

```ts
const ID = 'dQw4w9WgXcQ';
const PERSO: Qualification = { nature: 'perso', confidentielle: false };
const PERSO_CONF: Qualification = { nature: 'perso', confidentielle: true };
const PRO: Qualification = { nature: 'pro', confidentielle: false };
const PRO_CONF: Qualification = { nature: 'pro', confidentielle: true };
const SITE_CHOISI = { replit: { id: null, categorieId: 1, playlistId: null } };
// Vidéo complète validée, vignette rendue ; `changement` complète ses champs (catégorie du site…).
async function prete(q: Qualification = PERSO, changement: Record<string, unknown> = {}) {
```

et, dans son corps, `{ ...v, profil, titre: 'Titre', …` par `{ ...v, ...q, titre: 'Titre', …`. Supprimer la ligne `const SITE_CHOISI = …` du `describe('relais sur le site')`.

5. Dans `describe('YouTube')`, remplacer le test `refuse une visibilité publique pour une vidéo Interne` par :

```ts
  it('n’accepte que la visibilité déduite de la qualification', async () => {
    await prete(PERSO_CONF);
    const r = await envoi();
    expect(r.status).toBe(422);
    expect((await r.json()).erreur).toBe('Une vidéo Perso confidentielle reste privée sur YouTube.');
    expect((await envoi({ visibilite: 'privee' })).status).toBe(200);
  });
  it('enregistre une vidéo Pro non confidentielle en Non répertoriée', async () => {
    await prete(PRO);
    const r = await envoi({ visibilite: 'non-repertoriee' });
    expect(r.status).toBe(200);
    expect(((await r.json()) as Publication).videos[0]!.youtube.visibilite).toBe('non-repertoriee');
    const d = await (await action('a', 'youtube/preparer', { cible: 'complete' })).json();
    expect(d.textes.reglages).toContain('Visibilité : Non répertoriée');
  });
  it('ne prépare pas pour YouTube une vidéo Pro confidentielle', async () => {
    await prete(PRO_CONF);
    const r = await action('a', 'youtube/preparer', { cible: 'complete' });
    expect(r.status).toBe(422);
    expect((await r.json()).problemes).toEqual(['Une vidéo Pro confidentielle ne va pas sur YouTube : elle est seulement relayée sur le site.']);
  });
```

6. Dans `describe('relais sur le site')` :
   - remplacer chaque `prete('interne'` par `prete(PRO_CONF`, `prete('perso')` par `prete(PERSO)` et `prete('mixte'` par `prete(PRO` ;
   - renommer `relaie une vidéo Interne : …` en `relaie une vidéo Pro confidentielle : fichier et vignette dans le stockage, réservée aux comptes autorisés`, et y remplacer `videoObject: 'objet-video', thumbnailObject: 'objet-vignette',` par `videoObject: 'objet-video', videoUrl: null, thumbnailObject: 'objet-vignette',` ;
   - remplacer le test `relaie une vidéo Mixte une fois lisible publiquement…` par :

```ts
  it('relaie une vidéo Pro non confidentielle une fois lisible par lien, en intégrant la vidéo YouTube', async () => {
    await prete(PRO, SITE_CHOISI);
    expect((await (await relayer()).json()).problemes)
      .toEqual(['Enregistrez d’abord l’envoi sur YouTube : une vidéo Pro non confidentielle est relayée avec son lien YouTube.']);
    await envoi({ visibilite: 'non-repertoriee' });
    vi.mocked(config.lireVisibiliteYoutube).mockResolvedValueOnce('non-publique');
    const attente = await relayer();
    expect(attente.status).toBe(422);
    expect((await attente.json()).erreur).toBe('Vidéo pas encore lisible : passez-la en Non répertoriée dans YouTube Studio.');
    expect((await relayer()).status).toBe(200);
    expect(config.lireVisibiliteYoutube).toHaveBeenLastCalledWith(ID);
    expect(site().envoyerFichier).toHaveBeenCalledTimes(1);
    expect(site().enregistrerVideo).toHaveBeenCalledWith(null, expect.objectContaining({
      visibility: 'public', videoUrl: `https://www.youtube.com/watch?v=${ID}`, videoObject: null, thumbnailObject: 'objet-vignette',
    }));
  });
```

7. Ajouter à la fin du fichier :

```ts
describe('lecture d’un publication.json en version 1', () => {
  it('convertit les profils et réécrit le fichier en version 2 au prochain enregistrement', async () => {
    const dossier = await tournage('a');
    const { nature: _n, confidentielle: _c, ...base } = videoParDefaut('complete', PERSO);
    await writeFile(path.join(dossier, 'publication.json'),
      JSON.stringify({ version: 1, profilParDefaut: 'mixte', videos: [{ ...base, profil: 'interne' }] }), 'utf-8');
    const p = await lirePublication('a');
    expect(p.version).toBe(2);
    expect(p.qualificationParDefaut).toEqual(PRO);
    expect(p.videos[0]).toMatchObject(PRO_CONF);
    expect(p.videos[0]).not.toHaveProperty('profil');
    expect((await envoyer('a', p)).status).toBe(200);
    expect(JSON.parse(await readFile(path.join(dossier, 'publication.json'), 'utf-8')).version).toBe(2);
  });
});

describe('retrait du site', () => {
  const relayer = () => action('a', 'relais', { cible: 'complete' });
  const retirer = (q: Qualification = PERSO) => action('a', 'site/retirer', { cible: 'complete', ...q });
  const site = () => config.site!;

  it('enregistre la qualification, retire la vidéo du site et la ramène à prête', async () => {
    const dossier = await prete(PRO_CONF, SITE_CHOISI);
    await relayer();
    const r = await retirer();
    expect(r.status).toBe(200);
    expect(((await r.json()) as Publication).videos[0]).toMatchObject({
      ...PERSO, statut: 'prete', replit: { id: null, categorieId: null, playlistId: null }, erreur: null,
    });
    expect(site().supprimerVideo).toHaveBeenCalledWith(42);
    const enregistree = JSON.parse(await readFile(path.join(dossier, 'publication.json'), 'utf-8')) as Publication;
    expect(enregistree.videos[0]).toMatchObject({ ...PERSO, replit: { id: null } });
  });
  it('ramène à envoyée une vidéo qui a une URL YouTube', async () => {
    await prete(PRO, SITE_CHOISI);
    await envoi({ visibilite: 'non-repertoriee' });
    await relayer();
    expect(((await (await retirer(PERSO_CONF)).json()) as Publication).videos[0]).toMatchObject({ statut: 'envoyee-youtube', youtube: { id: ID } });
  });
  it('refuse quand il n’y a rien à retirer ou que la qualification est invalide', async () => {
    await prete(PRO_CONF, SITE_CHOISI);
    expect((await retirer()).status).toBe(409);
    await relayer();
    expect((await retirer(PRO)).status).toBe(409);
    expect((await action('a', 'site/retirer', { cible: 'complete', nature: 'autre', confidentielle: false })).status).toBe(400);
    expect(site().supprimerVideo).not.toHaveBeenCalled();
  });
  it('garde la qualification et note l’erreur si le site échoue, bloque YouTube, puis reprend', async () => {
    const dossier = await prete(PRO_CONF, SITE_CHOISI);
    await relayer();
    vi.mocked(site().supprimerVideo).mockRejectedValueOnce(new Error('Site injoignable (ECONNREFUSED) : la vidéo y est encore visible.'));
    const r = await retirer();
    expect(r.status).toBe(502);
    expect((await r.json()).erreur).toBe('Retrait du site impossible : Site injoignable (ECONNREFUSED) : la vidéo y est encore visible.');
    const apres = JSON.parse(await readFile(path.join(dossier, 'publication.json'), 'utf-8')) as Publication;
    expect(apres.videos[0]).toMatchObject({ ...PERSO, statut: 'relayee', replit: { id: 42 }, erreur: { etape: 'replit' } });
    expect((await (await action('a', 'youtube/preparer', { cible: 'complete' })).json()).problemes).toContain('Retirez d’abord la vidéo du site.');
    expect((await envoi()).status).toBe(422);
    expect(((await (await retirer()).json()) as Publication).videos[0]).toMatchObject({ statut: 'prete', replit: { id: null }, erreur: null });
  });
});
```

Run: `npm test -- studio/serveur/publication.test.ts`
Expected: FAIL (route `site/retirer` inconnue, profils…).

- [ ] **Step 5: Routes**

Dans `studio/serveur/publication.ts` :

1. Imports : ajouter `migrerPublication` à l'import de `../../noyau/publication` ; ajouter `import { diffusion, NATURES, type Nature } from '../../noyau/qualification';` ; ajouter `enregistrerRetrait` à l'import de `../../noyau/relais`.
2. Dans `lirePublication`, remplacer `valeur = JSON.parse(await readFile(chemin, 'utf-8'));` par :

```ts
    // Une version 1 est convertie ici et réécrite en version 2 au prochain enregistrement.
    valeur = migrerPublication(JSON.parse(await readFile(chemin, 'utf-8')));
```

3. Dans `rediger`, remplacer `profil: videoDe(ctx.publication, cible).profil,` par :

```ts
        qualification: { nature: videoDe(ctx.publication, cible).nature, confidentielle: videoDe(ctx.publication, cible).confidentielle },
```

4. Dans `envoiYoutube`, remplacer le contrôle de la visibilité par :

```ts
    if (!['privee', 'non-repertoriee', 'publique', 'programmee'].includes(o.visibilite as string)) {
      throw new ErreurHttp(400, 'visibilite attendue : « privee », « non-repertoriee », « publique » ou « programmee ».');
    }
```

5. Dans `relayer`, remplacer `if (video.profil === 'mixte' && idYoutube) {` par :

```ts
    const lien = diffusion(video).site === 'lien';
    if (lien && idYoutube) {
```

et le bloc `const fichier = …` (avec son commentaire) par :

```ts
      // Pro confidentielle : le fichier est hébergé sur le site ; Pro non confidentielle : la vidéo YouTube y est intégrée.
      const fichier = lien && idYoutube
        ? { videoUrl: urlYoutube(idYoutube), videoObject: null }
        : { videoObject: await c.site.envoyerFichier(path.join(ctx.dossier, 'rendus', disponible.fichier), 'video/mp4'), videoUrl: null };
```

6. Après `relayer`, ajouter :

```ts
  // Requalification qui fait sortir une vidéo du site : la qualification est enregistrée d’abord, pour que la vidéo
  // reste Perso et le retrait à faire même si le site échoue ; le statut ne change qu’une fois la vidéo retirée.
  async function retirerDuSite(req: IncomingMessage, ctx: Contexte): Promise<Publication> {
    const corps = await lireCorps(req);
    const cible = lireCible(corps, ctx.cibles);
    const o = objet(corps);
    if (!NATURES.includes(o.nature as Nature) || typeof o.confidentielle !== 'boolean') {
      throw new ErreurHttp(400, 'nature (« pro » ou « perso ») et confidentielle (vrai ou faux) attendues.');
    }
    const qualification = { nature: o.nature as Nature, confidentielle: o.confidentielle };
    const id = videoDe(ctx.publication, cible).replit.id;
    if (id === null || diffusion(qualification).site !== 'aucun') {
      throw new ErreurHttp(409, 'Rien à retirer : la vidéo n’est pas sur le site, ou sa qualification l’y garde.');
    }
    if (!c.site) throw new ErreurHttp(422, 'Site non configuré : renseignez REPLIT_SITE_URL et REPLIT_API_KEY dans .env, puis relancez le studio.');
    if (relaisEnCours) throw new ErreurHttp(409, 'Un relais est déjà en cours.');
    relaisEnCours = true;
    try {
      await ecrirePublication(ctx.dossier, appliquerModifications(ctx.publication, modifierVideo(ctx.publication, cible, qualification)));
      await c.site.supprimerVideo(id);
    } catch (e) {
      const raison = `Retrait du site impossible : ${message(e)}`;
      const actuelle = await relire(ctx);
      await ecrirePublication(ctx.dossier, modifierVideo(actuelle, cible, { erreur: { etape: 'replit', message: raison, le: new Date().toISOString() } }));
      throw new ErreurHttp(502, raison);
    } finally {
      relaisEnCours = false;
    }
    const actuelle = await relire(ctx);
    const p = modifierVideo(actuelle, cible, enregistrerRetrait(videoDe(actuelle, cible)));
    await ecrirePublication(ctx.dossier, p);
    return p;
  }
```

7. Dans `traiter`, remplacer l'expression de route par :

```ts
    const route = /^\/api\/tournages\/([^/]+)\/publication(?:\/(redaction|image|vignette|valider|relais|site\/retirer|youtube\/(?:preparer|ouvrir|envoi|verifier)))?$/
      .exec(chemin);
```

et ajouter, après la branche `relais` :

```ts
      else if (action === 'site/retirer' && req.method === 'POST') repondre(res, 200, await retirerDuSite(req, ctx));
```

- [ ] **Step 6: Vérifier**

Run: `npm test -- studio/serveur/` puis `npm run typecheck`
Expected: tous les tests de `studio/serveur/` PASS. Le typage ne signale plus d'erreurs que dans `studio/src/` (corrigées par la Task 6).

- [ ] **Step 7: Commit**

```bash
git add studio/serveur/site-replit.ts studio/serveur/site-replit.test.ts studio/serveur/redaction.ts studio/serveur/redaction.test.ts \
  studio/serveur/publication.ts studio/serveur/publication.test.ts
git commit -m "Studio : publication.json v1 converti à la lecture, Non répertoriée, relais selon la diffusion, retrait du site d’une vidéo requalifiée en Perso

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Studio — qualification, diffusion affichée, retrait du site

**Files:**
- Modify: `studio/src/logique/publication.ts`, `studio/src/logique/publication.test.ts`, `studio/src/api.ts`, `studio/src/composants/CartePublication.tsx`, `studio/src/composants/EcranPublication.tsx`, `studio/src/composants/PanneauSite.tsx`, `studio/src/composants/PanneauYoutube.tsx`

**Interfaces:**
- Consumes : Tasks 2 à 5 (`Attente`, `diffusion`, `NATURES`, `retraitAFaire`, `validee`, `pretePourYoutube`, `visibilitesIndiquees(q)`, route `site/retirer`).
- Produces :
  - `LIBELLES_NATURE`, `resumeDiffusion(d: Diffusion): string`, `EXPLICATIONS_RELAIS: Record<'fichier' | 'lien', string>`, `EXPLICATION_RETRAIT`, `CONFIRMATION_RETRAIT`, `requalificationRetire(v, q): boolean`, `changerQualificationParDefaut(p, q): Publication` ; `LIBELLES_VISIBILITE` avec `'non-repertoriee'`. `LIBELLES_PROFIL`, `EXPLICATIONS_PROFIL` et `changerProfilParDefaut` disparaissent.
  - `api.retirerDuSite(nom, cible, q: Qualification): Promise<Publication>`

- [ ] **Step 1: Tests de la logique**

Dans `studio/src/logique/publication.test.ts` :

1. Remplacer les imports par :

```ts
import { describe, expect, it } from 'vitest';
import { accorderPublication, modifierVideo } from '../../../noyau/publication';
import { diffusion, type Qualification } from '../../../noyau/qualification';
import {
  baseVignette, changerQualificationParDefaut, EXPLICATIONS_RELAIS, isoDepuisLocal, libelleCible, LIBELLES_VISIBILITE, localDepuisIso,
  requalificationRetire, resumeDiffusion, tagsDepuisTexte, texteDepuisTags,
} from './publication';

const PERSO: Qualification = { nature: 'perso', confidentielle: false };
const PRO: Qualification = { nature: 'pro', confidentielle: false };
const PRO_CONF: Qualification = { nature: 'pro', confidentielle: true };
```

2. Remplacer `describe('changerProfilParDefaut', …)` par :

```ts
describe('changerQualificationParDefaut', () => {
  it('requalifie les vidéos qui suivaient l’ancien défaut, sauf celles déjà sur le site', () => {
    let p = accorderPublication(null, ['complete', 1, 2]);
    p = modifierVideo(p, 1, PRO_CONF);
    p = modifierVideo(p, 2, { replit: { id: 42, categorieId: 1, playlistId: null } });
    const q = changerQualificationParDefaut(p, PRO);
    expect(q.qualificationParDefaut).toEqual(PRO);
    expect(q.videos.map(v => [v.nature, v.confidentielle])).toEqual([['pro', false], ['pro', true], ['perso', false]]);
  });
});

describe('requalificationRetire', () => {
  const surLeSite = { ...modifierVideo(accorderPublication(null, ['complete']), 'complete', PRO_CONF).videos[0]!, replit: { id: 42, categorieId: 1, playlistId: null } };
  it('demande le retrait d’une vidéo du site passée en Perso', () => {
    expect(requalificationRetire(surLeSite, PERSO)).toBe(true);
    expect(requalificationRetire(surLeSite, PRO)).toBe(false);
    expect(requalificationRetire({ ...surLeSite, replit: { id: null, categorieId: null, playlistId: null } }, PERSO)).toBe(false);
  });
});

describe('resumeDiffusion', () => {
  it('résume la diffusion déduite en une ligne', () => {
    expect(resumeDiffusion(diffusion(PRO))).toBe('YouTube : Non répertoriée · Site : lien YouTube, visible de tous');
    expect(resumeDiffusion(diffusion(PRO_CONF))).toBe('YouTube : aucun envoi · Site : fichier vidéo, réservé aux comptes autorisés');
    expect(resumeDiffusion(diffusion({ nature: 'perso', confidentielle: true }))).toBe('YouTube : Privée · Site : rien');
    expect(resumeDiffusion(diffusion(PERSO))).toBe('YouTube : Publique ou Programmée · Site : rien');
  });
});
```

3. Remplacer l'attente de `nomme les visibilités comme YouTube Studio` par :

```ts
    expect(LIBELLES_VISIBILITE).toEqual({ privee: 'Privée', 'non-repertoriee': 'Non répertoriée', publique: 'Publique', programmee: 'Programmée' });
```

4. Remplacer le test de `describe('relais sur le site')` par :

```ts
  it('explique les deux formes de relais', () => {
    expect(Object.keys(EXPLICATIONS_RELAIS)).toEqual(['fichier', 'lien']);
    expect(EXPLICATIONS_RELAIS.fichier).toContain('comptes autorisés');
    expect(EXPLICATIONS_RELAIS.lien).toContain('lisible par lien');
  });
```

Run: `npm test -- studio/src/logique/publication.test.ts`
Expected: FAIL.

- [ ] **Step 2: Logique**

Dans `studio/src/logique/publication.ts` :

1. Remplacer les deux imports par :

```ts
import type { CiblePublication, FondVignette, PoseVignette, Publication, StatutPublication, VideoPubliee, Vignette } from '../../../noyau/publication';
import { diffusion, memeQualification, type Diffusion, type DiffusionSite, type DiffusionYoutube, type Nature, type Qualification } from '../../../noyau/qualification';
import type { VisibiliteYoutube } from '../../../noyau/youtube';
```

2. Remplacer `LIBELLES_PROFIL`, `EXPLICATIONS_PROFIL` et `EXPLICATIONS_RELAIS` par :

```ts
export const LIBELLES_NATURE: Record<Nature, string> = { pro: 'Pro', perso: 'Perso' };

const RESUME_YOUTUBE: Record<DiffusionYoutube, string> = {
  aucun: 'aucun envoi',
  'non-repertoriee': 'Non répertoriée',
  privee: 'Privée',
  publique: 'Publique ou Programmée',
};
const RESUME_SITE: Record<DiffusionSite, string> = {
  fichier: 'fichier vidéo, réservé aux comptes autorisés',
  lien: 'lien YouTube, visible de tous',
  aucun: 'rien',
};

// Diffusion déduite de la qualification, en une ligne sous ses contrôles.
export const resumeDiffusion = (d: Diffusion) => `YouTube : ${RESUME_YOUTUBE[d.youtube]} · Site : ${RESUME_SITE[d.site]}`;

export const EXPLICATIONS_RELAIS: Record<Exclude<DiffusionSite, 'aucun'>, string> = {
  fichier: 'Le fichier vidéo et la vignette sont envoyés sur le site, visibles des seuls comptes autorisés. '
    + 'Un nouveau relais renvoie le fichier et met à jour la fiche.',
  lien: 'La vidéo YouTube est intégrée au site, visible de tous, une fois lisible par lien sur YouTube. '
    + 'Un nouveau relais met à jour la fiche.',
};

export const EXPLICATION_RETRAIT = 'Vidéo passée en Perso : elle doit être retirée du site, où elle est encore visible.';
export const CONFIRMATION_RETRAIT = 'Cette vidéo est sur le site : la passer en Perso la retirera du site.';

// Une requalification qui fait sortir du site une vidéo qui y est demande confirmation, puis le retrait.
export const requalificationRetire = (v: VideoPubliee, q: Qualification) =>
  v.replit.id !== null && diffusion(v).site !== 'aucun' && diffusion(q).site === 'aucun';
```

3. Remplacer `changerProfilParDefaut` (et son commentaire) par :

```ts
// Les vidéos qui suivaient l’ancienne qualification par défaut prennent la nouvelle, sauf celles déjà sur le site :
// elles se requalifient une par une, avec confirmation du retrait.
export function changerQualificationParDefaut(p: Publication, q: Qualification): Publication {
  return {
    ...p,
    qualificationParDefaut: q,
    videos: p.videos.map(v => (memeQualification(v, p.qualificationParDefaut) && v.replit.id === null ? { ...v, ...q } : v)),
  };
}
```

4. Remplacer `LIBELLES_VISIBILITE` par :

```ts
export const LIBELLES_VISIBILITE: Record<VisibiliteYoutube, string> = {
  privee: 'Privée', 'non-repertoriee': 'Non répertoriée', publique: 'Publique', programmee: 'Programmée',
};
```

Run: `npm test -- studio/src/logique/publication.test.ts`
Expected: PASS.

- [ ] **Step 3: Appel au serveur**

Dans `studio/src/api.ts`, ajouter `import type { Qualification } from '../../noyau/qualification';` et, après `relayer` :

```ts
  retirerDuSite: (nom: string, cible: CiblePublication, q: Qualification) =>
    appeler<Publication>(`${chemin(nom)}/publication/site/retirer`, enJson('POST', { cible, ...q })),
```

- [ ] **Step 4: Carte d'une vidéo**

Dans `studio/src/composants/CartePublication.tsx` :

1. Remplacer les imports du noyau et de la logique par :

```tsx
import { longueurTags, modifierVideo, retraitAFaire, type Publication, type VideoPubliee, type Vignette } from '../../../noyau/publication';
import { diffusion, NATURES, type Nature, type Qualification } from '../../../noyau/qualification';
import { descriptionYoutube, formatHorodatage } from '../../../noyau/publication-textes';
import { pretePourYoutube, validee } from '../../../noyau/youtube';
import type { DetailPublication, Pose, VideoDisponible } from '../../commun';
import { api, ErreurApi } from '../api';
import {
  CONFIRMATION_RETRAIT, libelleCible, LIBELLES_NATURE, LIBELLES_STATUT, requalificationRetire, resumeDiffusion, tagsDepuisTexte, texteDepuisTags,
} from '../logique/publication';
```

(l'ancien import séparé de `pretePourYoutube` disparaît).

2. Avec `REDACTION` et `VERIFICATION`, ajouter : `const RETRAIT = 'Retrait du site…';`
3. Après la définition de `lancer`, ajouter :

```tsx
  // Une vidéo déjà sur le site qui n’y a plus sa place en est retirée, après confirmation, par le serveur
  // (qui enregistre lui-même la nouvelle qualification) ; sinon la qualification change comme un autre champ.
  const requalifier = (q: Qualification) => {
    if (!requalificationRetire(v, q)) {
      changer(q);
      return;
    }
    if (!window.confirm(CONFIRMATION_RETRAIT)) return;
    void lancer(RETRAIT, () => api.retirerDuSite(nom, v.cible, q));
  };
  const d = diffusion(v);
```

4. Remplacer le bloc du profil (`<label> Profil{' '} <select …> … </select> </label>` et `<p className="discret">{EXPLICATIONS_PROFIL[v.profil]}</p>`) par :

```tsx
          <div className="actions">
            <label>
              Nature{' '}
              <select value={v.nature} disabled={!!occupe} onChange={e => requalifier({ nature: e.target.value as Nature, confidentielle: v.confidentielle })}>
                {NATURES.map(n => <option key={n} value={n}>{LIBELLES_NATURE[n]}</option>)}
              </select>
            </label>
            <label>
              <input
                type="checkbox" checked={v.confidentielle} disabled={!!occupe}
                onChange={e => requalifier({ nature: v.nature, confidentielle: e.target.checked })}
              />
              {' '}Confidentielle
            </label>
            {occupe === RETRAIT && <Attente libelle={RETRAIT} />}
          </div>
          <p className="discret">{resumeDiffusion(d)}</p>
```

5. Remplacer les deux lignes des panneaux (`{pretePourYoutube(v) && <PanneauYoutube …/>}` et le bloc `{pretePourYoutube(v) && v.profil !== 'perso' && ( <PanneauSite …/> )}`) par :

```tsx
          {pretePourYoutube(v) && (
            <PanneauYoutube key={`youtube-${d.youtube}`} nom={nom} video={v} synchroniser={synchroniser} executer={executer} />
          )}
          {d.youtube === 'aucun' && v.youtube.id && (
            <p className="discret">Cette vidéo a déjà été envoyée sur YouTube : supprimez-la dans YouTube Studio si elle ne doit plus y être.</p>
          )}
          {((validee(v) && d.site !== 'aucun') || retraitAFaire(v)) && (
            <PanneauSite
              key={`site-${d.site}`} nom={nom} video={v} urlSite={detail.urlSite} site={detail.site}
              changer={changer} synchroniser={synchroniser} executer={executer}
            />
          )}
```

- [ ] **Step 5: Panneau Site, en mode relais ou retrait**

Dans `studio/src/composants/PanneauSite.tsx` :

1. Remplacer les imports du noyau et de la logique par :

```tsx
import { retraitAFaire, type Publication, type VideoPubliee } from '../../../noyau/publication';
import { diffusion } from '../../../noyau/qualification';
```

et `import { EXPLICATIONS_RELAIS } from '../logique/publication';` par `import { EXPLICATION_RETRAIT, EXPLICATIONS_RELAIS } from '../logique/publication';`.

2. Dans `Props`, remplacer `video: VideoPubliee & { profil: 'interne' | 'mixte' };` par `video: VideoPubliee;`.
3. Remplacer le commentaire du composant par `// Relais d’une vidéo Pro sur le site (catégorie, playlist), ou retrait d’une vidéo passée en Perso ; le serveur vérifie et explique un refus.`
4. Remplacer `relayer` par une fonction commune et ses deux usages :

```tsx
  const agir = async (action: () => Promise<Publication>) => {
    setOccupe(true);
    setErreur(null);
    setProblemes([]);
    try {
      await synchroniser();
      await executer(action);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
      if (e instanceof ErreurApi) setProblemes(e.problemes);
    } finally {
      setOccupe(false);
    }
  };
  const relayer = () => agir(() => api.relayer(nom, v.cible));
  const retirer = () => agir(() => api.retirerDuSite(nom, v.cible, { nature: v.nature, confidentielle: v.confidentielle }));

  const site = diffusion(v).site;
  const lienSite = v.replit.id && urlSite
    ? <a href={`${urlSite.replace(/\/+$/, '')}/video/${v.replit.id}`} target="_blank" rel="noreferrer">Voir sur le site</a>
    : null;
  const retour = (
    <>
      {erreur && <p className="alerte">{erreur}</p>}
      {problemes.length > 0 && <ul>{problemes.map(p => <li key={p}>{p}</li>)}</ul>}
    </>
  );

  if (retraitAFaire(v)) {
    return (
      <div className="site">
        <h4>Replit</h4>
        <p className="alerte">{EXPLICATION_RETRAIT}</p>
        <div className="actions">
          <button className="principal" disabled={occupe} onClick={() => void retirer()}>Retirer du site</button>
          {lienSite}
        </div>
        {occupe && <p><Attente libelle="Retrait du site…" /></p>}
        {retour}
      </div>
    );
  }
```

5. Dans le rendu du mode relais : remplacer `<p className="discret">{EXPLICATIONS_RELAIS[v.profil]}</p>` par `{site !== 'aucun' && <p className="discret">{EXPLICATIONS_RELAIS[site]}</p>}` ; remplacer le bloc `{v.replit.id && urlSite && ( <a …>Voir sur le site</a> )}` par `{lienSite}` ; dans le libellé d'attente, remplacer `v.profil === 'interne'` par `site === 'fichier'` ; remplacer les deux lignes finales `{erreur && …}` et `{problemes.length > 0 && …}` par `{retour}`.

- [ ] **Step 6: Panneau YouTube et écran de publication**

Dans `studio/src/composants/PanneauYoutube.tsx`, remplacer `const permises = visibilitesIndiquees(v.profil);` par `const permises = visibilitesIndiquees(v);`.

Dans `studio/src/composants/EcranPublication.tsx` :

1. Remplacer les imports `import { PROFILS, type Profil } from '../../../noyau/publication';` et `import { changerProfilParDefaut, EXPLICATIONS_PROFIL, LIBELLES_PROFIL } from '../logique/publication';` par :

```tsx
import { diffusion, NATURES, type Nature } from '../../../noyau/qualification';
import { changerQualificationParDefaut, LIBELLES_NATURE, resumeDiffusion } from '../logique/publication';
```

2. Remplacer le bloc `<label> Profil par défaut{' '} <select …> … </select> </label>` et `<p className="discret">{EXPLICATIONS_PROFIL[publication.profilParDefaut]}</p>` par :

```tsx
        <div className="actions">
          <span>Qualification par défaut :</span>
          <select
            value={publication.qualificationParDefaut.nature}
            onChange={e => modifier(p => changerQualificationParDefaut(p, { ...p.qualificationParDefaut, nature: e.target.value as Nature }))}
          >
            {NATURES.map(n => <option key={n} value={n}>{LIBELLES_NATURE[n]}</option>)}
          </select>
          <label>
            <input
              type="checkbox" checked={publication.qualificationParDefaut.confidentielle}
              onChange={e => modifier(p => changerQualificationParDefaut(p, { ...p.qualificationParDefaut, confidentielle: e.target.checked }))}
            />
            {' '}Confidentielle
          </label>
        </div>
        <p className="discret">
          {resumeDiffusion(diffusion(publication.qualificationParDefaut))}. S’applique aux vidéos qui suivaient la précédente, sauf celles déjà sur le site.
        </p>
```

- [ ] **Step 7: Vérifier**

Run: `npm test` puis `npm run typecheck`
Expected: tout PASS ; aucune erreur de type.

Puis lancer le studio (skill `run`, ou `npm run validation`) sur l'écran de publication de `zz-essai-plan7` **sans rien modifier** : vérifier seulement que les cartes affichent Nature, Confidentielle et la ligne de diffusion (vidéo complète : Pro, confidentielle ; épisode 2 : Pro, non confidentielle, panneau Site présent). Ne pas changer de qualification ici : la vidéo de l'épisode 2 est réellement sur le site, le retrait réel est l'objet de la Task 8.

- [ ] **Step 8: Commit**

```bash
git add studio/src/logique/publication.ts studio/src/logique/publication.test.ts studio/src/api.ts \
  studio/src/composants/CartePublication.tsx studio/src/composants/EcranPublication.tsx studio/src/composants/PanneauSite.tsx \
  studio/src/composants/PanneauYoutube.tsx
git commit -m "Studio : qualification Pro ou Perso et confidentialité dans la publication, diffusion déduite affichée, retrait du site confirmé

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Documentation

**Files:**
- Modify: `docs/studio.md`, `docs/youtube-studio.md`, `docs/superpowers/specs/2026-10-20-publication-design.md`

- [ ] **Step 1: Note dans l'ancienne conception**

Dans `docs/superpowers/specs/2026-10-20-publication-design.md`, insérer après la ligne `Date : 2026-10-20. …` (ligne 3) :

```markdown

> **Révisé le 2026-10-22** : les profils Interne, Perso et Mixte sont remplacés par une qualification (Pro ou Perso, confidentielle ou non) dont l'app déduit la diffusion ; voir [Qualification des vidéos et sablier](2026-10-22-qualification-diffusion-design.md). Les sections ci-dessous qui parlent de profils sont gardées pour l'historique.
```

- [ ] **Step 2: Notice YouTube Studio**

Dans `docs/youtube-studio.md` :

1. Ligne de l'étape 6, remplacer `selon le profil (voir ci-dessous)` par `selon la qualification (voir ci-dessous)`.
2. Remplacer toute la section `## Parcours par profil` (titre et trois puces) par :

```markdown
## Parcours par qualification

La qualification se choisit dans la carte de la vidéo (Nature : Pro ou Perso ; case Confidentielle). Le studio en déduit la visibilité à choisir et la rappelle dans `youtube.txt`.

- **Pro, confidentielle** : rien sur YouTube. Pas de « Préparer pour YouTube » : la vidéo est seulement relayée sur le site (fichier compris), réservée aux comptes autorisés.
- **Pro, non confidentielle** : Visibilité **Non répertoriée**, jamais Publique. Une fois l'URL enregistrée, la vidéo est relayée sur le site avec son lien YouTube, visible de tous. La vérification du studio voit qu'elle est lisible par lien, mais ne distingue pas Non répertoriée de Publique : contrôler ce réglage dans YouTube Studio.
- **Perso, confidentielle** : Visibilité **Privée**, jamais « Non répertoriée » (un lien non répertorié est lisible par quiconque l'obtient). Le studio alerte si la vidéo est lisible publiquement. Rien sur le site.
- **Perso, non confidentielle** : **Publique**, ou **Programmer** avec la date et l'heure voulues. Rien sur le site.
```

3. Dans `## Cas courants`, remplacer la dernière phrase de « Rattraper une erreur de visibilité » (`Une vidéo Interne passée publique par erreur doit repasser en Privée immédiatement.`) par `Une vidéo Perso confidentielle passée publique par erreur doit repasser en Privée immédiatement.` et ajouter à la fin de la liste :

```markdown
- **Passer en Perso une vidéo déjà sur le site** : le studio demande confirmation, puis la retire du site (fichier et vignette compris). Si le site est injoignable, la vidéo reste Perso, l'erreur s'affiche et le panneau Replit propose « Retirer du site » ; l'envoi sur YouTube reste bloqué jusque-là.
- **Vidéo Pro confidentielle déjà envoyée sur YouTube** (ancienne vidéo Interne) : la supprimer dans YouTube Studio → Contenu si elle ne doit plus y être.
```

- [ ] **Step 3: Guide du studio**

Dans `docs/studio.md`, section Publication :

1. Remplacer la puce `- **Profil** : …` par :

```markdown
- **Qualification** : *Nature* (Pro ou Perso) et case *Confidentielle* ; l'app en déduit la diffusion, résumée sous les contrôles. Pro confidentielle : rien sur YouTube, fichier envoyé sur le site, réservé aux comptes autorisés. Pro non confidentielle : Non répertoriée sur YouTube, puis lien YouTube sur le site, visible de tous. Perso confidentielle : Privée sur YouTube, rien sur le site. Perso non confidentielle : Publique ou Programmée sur YouTube, rien sur le site. La qualification par défaut s'applique aux vidéos qui suivaient la précédente, sauf celles déjà sur le site. Passer en Perso une vidéo déjà sur le site demande confirmation et la retire du site.
```

2. Dans la puce **Valider pour la publication**, remplacer `pour une vidéo publique, l’absence de mention interdite` par `pour une vidéo envoyée sur YouTube (même privée ou non répertoriée), l’absence de mention interdite`.
3. Dans la puce **YouTube**, remplacer `(vidéo « Prête »)` par `(vidéo « Prête » qui va sur YouTube)` et `(Privée pour Interne ; Publique ou Programmée pour Perso et Mixte)` par `(celle déduite de la qualification : Non répertoriée, Privée, ou Publique ou Programmée)`, et `alerte si une vidéo Interne est lisible publiquement ou si une vidéo publique ne l’est pas encore` par `alerte si une vidéo privée est lisible publiquement ou si une vidéo non répertoriée ou publique ne l’est pas encore`.
4. Remplacer la puce **Replit** par :

```markdown
- **Replit** (vidéo Pro « Prête ») : panneau du site. La catégorie (obligatoire) et la playlist (facultative, parmi celles de la catégorie) se choisissent dans ce panneau, lues sur le site ; « Relayer sur le site » y publie la vidéo. *Pro confidentielle* : le fichier vidéo et la vignette sont envoyés dans le stockage du site, la vidéo n'est visible que des comptes autorisés ; le relais n'attend pas YouTube. *Pro non confidentielle* : la vidéo YouTube est intégrée au site, visible de tous, une fois l'envoi YouTube enregistré et la vidéo lisible par lien (vérifié au moment du relais). Les contrôles avant envoi s'appliquent. La vidéo passe à « Relayée sur le site » ; un nouveau relais met à jour la même vidéo (et renvoie le fichier d'une vidéo Pro confidentielle). Une vidéo passée en Perso alors qu'elle est sur le site n'affiche plus que « Retirer du site » tant que le retrait n'a pas réussi. Si le site est injoignable ou refuse la clé, l'erreur s'affiche sur la carte et rien n'est perdu. Il faut dans `.env` : `REPLIT_SITE_URL` (adresse du site) et `REPLIT_API_KEY` (égale au secret `AUTOMATION_API_KEY` du site).
```

5. Après la dernière puce de la section (avant `Tout est enregistré dans publication.json du tournage.`), ajouter :

```markdown
- **Attente** : toute action qui fait attendre (rédaction par Claude, rendu de la vignette, préparation du dossier YouTube, vérification, relais ou retrait du site, enregistrement) affiche un sablier à côté de son libellé ; le bouton qui l'a lancée reste désactivé jusqu'à la fin.
```

- [ ] **Step 4: Commit**

```bash
git add docs/studio.md docs/youtube-studio.md docs/superpowers/specs/2026-10-20-publication-design.md
git commit -m "Documentation : qualification des vidéos, diffusion déduite, retrait du site et sablier

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Essai réel guidé

Pré-requis : Task 1 publiée et vérifiée ; Tasks 2 à 7 faites ; studio relancé (`npm run validation`) pour relire `.env`. Se fait avec l'auteur : la confirmation du retrait est une boîte de dialogue du navigateur, qu'il valide lui-même.

État de départ de `zz-essai-plan7` (version 1) : vidéo complète Interne `a-preparer` ; épisode 1 Interne envoyé sur YouTube en privé (`TKnSA4hkQ5s`), non coché ; épisode 2 Mixte relayé (`-PeYdTsnCW0`, site `id` 11).

- [ ] **Step 1: Conversion**

Ouvrir l'écran de publication de `zz-essai-plan7`, modifier un champ sans conséquence (ajouter puis retirer une espace au titre de la vidéo complète) pour déclencher un enregistrement, puis :

```bash
cd "/c/Users/pmaubert/dev/La chaine M&T"
python -c "import json;p=json.load(open('donnees/tournages/zz-essai-plan7/publication.json',encoding='utf-8'));print(p['version'],p['qualificationParDefaut']);[print(v['cible'],v['nature'],v['confidentielle'],v['statut']) for v in p['videos']]"
```

Expected : `2 {'nature': 'perso', 'confidentielle': False}`, puis `complete pro True a-preparer`, `1 pro True envoyee-youtube`, `2 pro False relayee`.

- [ ] **Step 2: Pro non confidentielle en Non répertoriée**

Pour l'épisode 2 : demander à l'auteur de passer la vidéo `-PeYdTsnCW0` en **Non répertoriée** dans YouTube Studio ; dans le studio, recoller l'URL, choisir « Non répertoriée », « Enregistrer l'envoi » : le message dit « Vidéo lisible par lien… ». « Mettre à jour sur le site » : la vidéo reste visible sur le site, avec le lien YouTube.

- [ ] **Step 3: Retrait du site**

Toujours pour l'épisode 2 : passer Nature à Perso ; l'auteur confirme la boîte de dialogue. Le sablier « Retrait du site… » s'affiche, puis la carte montre « Envoyée sur YouTube » et plus de panneau Replit. Vérifier :

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://internal-assets.replit.app/api/videos/11
```

Expected: `404`. Demander à l'auteur de confirmer que la vidéo n'apparaît plus sur le site, et, dans l'Object Storage du site, que sa vignette a disparu.

- [ ] **Step 4: Bilan**

Noter dans la réponse à l'auteur ce qui a été vérifié et tout écart. Remettre l'épisode 2 dans la qualification que l'auteur souhaite. Aucun commit (données de test hors dépôt ou à ne pas committer, selon `.gitignore`).
