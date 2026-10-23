# Plan 12 : suppression d'un tournage, remplacement de la vidéo en erreur, ordre de l'écran de montage — plan de mise en œuvre

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** depuis la liste des tournages, l'auteur supprime un tournage (avec confirmation dans la ligne, dossier déplacé dans `donnees/tournages-supprimes/`) et remplace la vidéo d'un tournage en erreur au premier chargement ; l'écran de montage présente ses panneaux dans l'ordre vidéo, éléments, longueurs, termes, consignes, rendu.

**Architecture :** côté serveur, un module `studio/serveur/suppression.ts` (déplacement du dossier) et une fonction `retirerVideo` dans `studio/serveur/nouveau-tournage.ts` ; `studio/serveur/api.ts` ajoute `DELETE /api/tournages/<nom>` et `DELETE /api/tournages/<nom>/video` en vérifiant qu'aucune analyse, aucun rendu ni aucun envoi ne tourne sur le tournage. Côté interface, la ligne de la liste devient un composant `LigneTournage` (confirmation, remplacement avec progression), appuyé sur deux règles pures ajoutées à `studio/src/logique/nouveau-tournage.ts`. `EcranMontage` réordonne ses panneaux.

**Tech Stack :** TypeScript, React 19, Node `http` et `fs/promises`, Vitest.

Spec : [2026-10-23-suppression-remplacement-ordre-design.md](../specs/2026-10-23-suppression-remplacement-ordre-design.md).

## Global Constraints

- Tout en français : identifiants, commentaires, messages, libellés (style du code existant : `ErreurHttp`, `raisonX`, `peutX`).
- Tournage supprimé : dossier **déplacé** dans `donnees/tournages-supprimes/<nom>` (suffixe `-2`, `-3`… si le nom y est pris) ; jamais effacé, jamais vidé par le studio. `donnees/tournages-supprimes/` dans `.gitignore`.
- Suppression refusée (409) pendant une analyse, un rendu ou un envoi de vidéo sur ce tournage, avec le travail en cours nommé.
- Remplacement de la vidéo : seulement pour un tournage au statut `erreur` sans `analyse.json` (état `erreur` de `etatTournage`). Retire les vidéos du montage de `bruts/` (l'enregistrement `-camera` reste) et `source.mp4`, `preparation.json`, `transcription.json`, `detections.json`. Refus (409) hors de ce cas ou pendant une analyse ou un envoi sur ce tournage.
- Confirmation de suppression dans la ligne : « Supprimer « <titre> » ? », « Oui, supprimer », « Annuler » ; aucune boîte de dialogue du navigateur.
- Ordre de la colonne de droite de l'écran de montage : bandeau des suggestions (s'il y a lieu), aperçu, éléments à l'écran, longueurs proposées, termes, consignes, rendu.
- Commandes : `npm test`, `npm run typecheck`.
- Fin de chaque message de commit : ligne vide puis `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Messages de commit en français, au style du dépôt (« Studio : … », « Documentation : … »).

## Fichiers

| Fichier | Rôle |
|---|---|
| `studio/serveur/suppression.ts` (créé) | Déplace un dossier de tournage vers les tournages supprimés |
| `studio/serveur/nouveau-tournage.ts` (modifié) | `envoiEnCours`, `retirerVideo` |
| `studio/serveur/api.ts` (modifié) | `ConfigApi.racineSupprimes`, routes `DELETE` |
| `studio/serveur/api.test.ts` (modifié) | Tests des deux routes |
| `studio/serveur/principal.ts` (modifié) | `racineSupprimes` |
| `.gitignore` (modifié) | `donnees/tournages-supprimes/` |
| `studio/src/logique/nouveau-tournage.ts` (modifié) | `peutRemplacerVideo`, `peutSupprimer` |
| `studio/src/logique/nouveau-tournage.test.ts` (modifié) | Tests de ces règles |
| `studio/src/api.ts` (modifié) | `supprimerTournage`, `retirerVideo` |
| `studio/src/composants/LigneTournage.tsx` (créé) | Une ligne de la liste : statut, actions, confirmation, remplacement |
| `studio/src/composants/ListeTournages.tsx` (modifié) | Utilise `LigneTournage` |
| `studio/src/composants/EcranMontage.tsx` (modifié) | Ordre des panneaux |
| `docs/studio.md` (modifié) | Suppression, remplacement, ordre |

---

### Task 1 : serveur — suppression d'un tournage

**Files:**
- Create: `studio/serveur/suppression.ts`
- Modify: `studio/serveur/nouveau-tournage.ts`, `studio/serveur/api.ts`, `studio/serveur/principal.ts`, `.gitignore`
- Test: `studio/serveur/api.test.ts`

**Interfaces:**
- Produces :
  - `deplacerVersSupprimes(dossier: string, racineSupprimes: string): Promise<string>` (renvoie le nom sous lequel le dossier a été rangé).
  - `envoiEnCours(dossier: string): boolean` dans `nouveau-tournage.ts`.
  - `ConfigApi.racineSupprimes: string`.
  - Route `DELETE /api/tournages/<nom>` → `200 { ok: true }`.

- [ ] **Step 1 : tests qui échouent**

Dans `studio/serveur/api.test.ts` :
- dans `beforeEach`, ajouter à `config` (après `racineTournages`) : `racineSupprimes: path.join(racine, 'tournages-supprimes'),` ;
- ajouter après `demanderAnalyse` :

```ts
const supprimer = (nom: string) => fetch(`${url}/api/tournages/${nom}`, { method: 'DELETE' });
```

- ajouter le bloc après `describe('analyse', …)` :

```ts
describe('suppression d’un tournage', () => {
  it('déplace le dossier dans les tournages supprimés et le retire de la liste', async () => {
    await tournage('a', { 'episode.json': { version: 1, titre: 'A', statut: 'analyse', message: null } });
    expect((await supprimer('a')).status).toBe(200);
    expect(existsSync(path.join(config.racineTournages, 'a'))).toBe(false);
    expect(await lire(path.join(config.racineSupprimes, 'a', 'episode.json'))).toMatchObject({ titre: 'A' });
    expect(await (await fetch(`${url}/api/tournages`)).json()).toEqual([]);
  });
  it('ajoute -2 quand le nom est déjà parmi les supprimés', async () => {
    await mkdir(path.join(config.racineSupprimes, 'a'), { recursive: true });
    await tournage('a', {});
    expect((await supprimer('a')).status).toBe(200);
    expect(existsSync(path.join(config.racineSupprimes, 'a-2'))).toBe(true);
  });
  it('refuse pendant une analyse de ce tournage', async () => {
    await avecVideo('a');
    const finir = analyseBloquee();
    await demanderAnalyse('a', 'Titre');
    const r = await supprimer('a');
    expect(r.status).toBe(409);
    expect((await r.json()).erreur).toBe('Analyse en cours sur ce tournage : attendez sa fin avant de le supprimer.');
    finir();
  });
  it('refuse pendant un rendu de ce tournage', async () => {
    await tournage('a', {});
    let finir = () => {};
    config.suivi.lancer('a', () => new Promise(r => { finir = () => r([]); }));
    const r = await supprimer('a');
    expect(r.status).toBe(409);
    expect((await r.json()).erreur).toBe('Rendu en cours sur ce tournage : attendez sa fin avant de le supprimer.');
    finir();
  });
  it('refuse pendant un envoi de vidéo sur ce tournage', async () => {
    const d = await tournage('a', {});
    const partiel = path.join(d, 'bruts', 'film.mp4.partiel');
    const req = http.request(`${url}/api/tournages/a/video?fichier=film.mp4`, { method: 'PUT' });
    const fini = new Promise<number | undefined>(resolve => req.on('response', res => { res.resume(); resolve(res.statusCode); }));
    req.write(Buffer.alloc(1000));
    await vi.waitFor(() => expect(existsSync(partiel)).toBe(true));
    const r = await supprimer('a');
    expect(r.status).toBe(409);
    expect((await r.json()).erreur).toBe('Vidéo en cours d’envoi sur ce tournage : attendez sa fin avant de le supprimer.');
    req.end();
    expect(await fini).toBe(200);
  });
  it('refuse un tournage inconnu', async () => {
    expect((await supprimer('inconnu')).status).toBe(404);
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npx vitest run studio/serveur/api.test.ts`
Expected : FAIL (`racineSupprimes` inconnu au typage n'empêche pas vitest ; les nouvelles requêtes reçoivent 404 « Route inconnue »).

- [ ] **Step 3 : implémenter**

`studio/serveur/suppression.ts` :

```ts
import { existsSync } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { ErreurHttp } from './http';

// Range le dossier du tournage parmi les tournages supprimés (suffixe -2, -3… si le nom y est pris) : rien n'est effacé.
export async function deplacerVersSupprimes(dossier: string, racineSupprimes: string): Promise<string> {
  await mkdir(racineSupprimes, { recursive: true });
  const base = path.basename(dossier);
  for (let n = 1; ; n++) {
    const nom = n === 1 ? base : `${base}-${n}`;
    const cible = path.join(racineSupprimes, nom);
    if (existsSync(cible)) continue;
    try {
      await rename(dossier, cible);
      return nom;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') {
        throw new ErreurHttp(409, 'Dossier du tournage ouvert dans un autre programme (explorateur, lecteur vidéo…) : fermez-le puis réessayez.');
      }
      throw e;
    }
  }
}
```

Dans `studio/serveur/nouveau-tournage.ts`, juste après la déclaration de `envoisEnCours` :

```ts
export const envoiEnCours = (dossier: string) => envoisEnCours.has(dossier);
```

Dans `studio/serveur/api.ts` :
- importer `envoiEnCours` avec `creerTournage, deposerVideo, etapeAnalyse, videosBrutes`, et `import { deplacerVersSupprimes } from './suppression';` ;
- dans `ConfigApi`, après `racineTournages: string;` :

```ts
  // Les tournages supprimés y sont rangés, jamais effacés.
  racineSupprimes: string;
```

- après `lancerAnalyse` :

```ts
  async function supprimerTournage(dossier: string): Promise<void> {
    const nom = path.basename(dossier);
    const analyse = c.suiviAnalyse.etat();
    if (analyse.enCours && analyse.nom === nom) throw new ErreurHttp(409, 'Analyse en cours sur ce tournage : attendez sa fin avant de le supprimer.');
    const rendu = c.suivi.etat();
    if ((rendu.enCours && rendu.nom === nom) || enPreparation === nom) {
      throw new ErreurHttp(409, 'Rendu en cours sur ce tournage : attendez sa fin avant de le supprimer.');
    }
    if (envoiEnCours(dossier)) throw new ErreurHttp(409, 'Vidéo en cours d’envoi sur ce tournage : attendez sa fin avant de le supprimer.');
    await deplacerVersSupprimes(dossier, c.racineSupprimes);
  }
```

- dans le routeur, après la branche `nom && !action && req.method === 'GET'` :

```ts
      } else if (nom && !action && req.method === 'DELETE') {
        await supprimerTournage(dossierDe(nom));
        repondre(res, 200, { ok: true });
```

Dans `studio/serveur/principal.ts`, dans `creerApi({ … })` après `racineTournages,` :

```ts
    racineSupprimes: path.join(RACINE, 'donnees', 'tournages-supprimes'),
```

Dans `.gitignore`, après `donnees/tournages/` : `donnees/tournages-supprimes/`.

- [ ] **Step 4 : vérifier**

Run : `npx vitest run studio/serveur` puis `npm run typecheck`
Expected : PASS, aucune erreur de type.

- [ ] **Step 5 : commit**

```bash
git add studio/serveur/suppression.ts studio/serveur/nouveau-tournage.ts studio/serveur/api.ts studio/serveur/api.test.ts studio/serveur/principal.ts .gitignore
git commit -m "Studio : suppression d'un tournage, rangé dans donnees/tournages-supprimes/"
```

---

### Task 2 : serveur — retrait de la vidéo d'un tournage en erreur

**Files:**
- Modify: `studio/serveur/nouveau-tournage.ts`, `studio/serveur/api.ts`
- Test: `studio/serveur/api.test.ts`

**Interfaces:**
- Consumes : `envoiEnCours` (tâche 1).
- Produces :
  - `retirerVideo(dossier: string): Promise<void>` dans `nouveau-tournage.ts`.
  - Route `DELETE /api/tournages/<nom>/video` → `200 { ok: true }`.

- [ ] **Step 1 : tests qui échouent**

Dans `studio/serveur/api.test.ts`, ajouter après `supprimer` :

```ts
const retirerVideo = (nom: string) => fetch(`${url}/api/tournages/${nom}/video`, { method: 'DELETE' });
const EN_ERREUR = { version: 1, titre: 'A', statut: 'erreur', message: 'film.mp4 : aucune piste audio.' };
```

et le bloc :

```ts
describe('retrait de la vidéo', () => {
  it('retire la vidéo et les fichiers tirés d’elle, garde la webcam', async () => {
    const d = await avecVideo('a', { 'episode.json': EN_ERREUR, 'preparation.json': {}, 'transcription.json': [] });
    await writeFile(path.join(d, 'bruts', 'film-camera.mkv'), 'webcam');
    await writeFile(path.join(d, 'source.mp4'), 'source');
    expect((await retirerVideo('a')).status).toBe(200);
    expect(readdirSync(path.join(d, 'bruts'))).toEqual(['film-camera.mkv']);
    for (const f of ['source.mp4', 'preparation.json', 'transcription.json']) expect(existsSync(path.join(d, f))).toBe(false);
    expect(existsSync(path.join(d, 'episode.json'))).toBe(true);
    expect((await (await fetch(`${url}/api/tournages`)).json())[0].videoPresente).toBe(false);
  });
  it('refuse un tournage déjà analysé ou qui n’est pas en erreur', async () => {
    await avecVideo('a', { 'episode.json': EN_ERREUR, 'analyse.json': exemple });
    await avecVideo('b', { 'episode.json': { ...EN_ERREUR, statut: null, message: null } });
    expect((await retirerVideo('a')).status).toBe(409);
    expect((await retirerVideo('b')).status).toBe(409);
  });
  it('refuse pendant une analyse de ce tournage', async () => {
    await avecVideo('a', { 'episode.json': EN_ERREUR });
    const finir = analyseBloquee();
    await demanderAnalyse('a', 'Titre');
    const r = await retirerVideo('a');
    expect(r.status).toBe(409);
    expect((await r.json()).erreur).toBe('Analyse en cours sur ce tournage : attendez sa fin.');
    finir();
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npx vitest run studio/serveur/api.test.ts`
Expected : FAIL (404 sur `DELETE …/video`).

- [ ] **Step 3 : implémenter**

Dans `studio/serveur/nouveau-tournage.ts`, importer `import { lireEpisode } from '../../remotion/scripts/tournage';` et ajouter après `deposerVideo` :

```ts
// Fichiers que le pipeline tire de la vidéo du montage : à refaire avec la nouvelle vidéo.
const FICHIERS_DE_LA_VIDEO = ['source.mp4', 'preparation.json', 'transcription.json', 'detections.json'];

// Retire la vidéo d'un tournage en erreur au premier chargement, pour en déposer une autre ; l'enregistrement « -camera » reste.
export async function retirerVideo(dossier: string): Promise<void> {
  if (existsSync(path.join(dossier, 'analyse.json'))) {
    throw new ErreurHttp(409, 'Ce tournage est déjà analysé : supprimez-le et créez-en un autre.');
  }
  if ((await lireEpisode(dossier)).statut !== 'erreur') throw new ErreurHttp(409, 'Seule la vidéo d’un tournage en erreur peut être remplacée.');
  if (envoiEnCours(dossier)) throw new ErreurHttp(409, 'Une vidéo est déjà en cours d’envoi pour ce tournage.');
  for (const f of await videosBrutes(dossier)) await rm(path.join(dossier, 'bruts', f), { force: true });
  for (const f of FICHIERS_DE_LA_VIDEO) await rm(path.join(dossier, f), { force: true });
}
```

Dans `studio/serveur/api.ts` : importer `retirerVideo` avec les autres fonctions de `./nouveau-tournage`, puis ajouter dans le routeur, après la branche `action === 'video' && req.method === 'PUT'` :

```ts
      } else if (nom && action === 'video' && req.method === 'DELETE') {
        const dossier = dossierDe(nom);
        const analyse = c.suiviAnalyse.etat();
        if (analyse.enCours && analyse.nom === path.basename(dossier)) throw new ErreurHttp(409, 'Analyse en cours sur ce tournage : attendez sa fin.');
        await retirerVideo(dossier);
        repondre(res, 200, { ok: true });
```

- [ ] **Step 4 : vérifier**

Run : `npx vitest run studio/serveur` puis `npm run typecheck`
Expected : PASS.

- [ ] **Step 5 : commit**

```bash
git add studio/serveur/nouveau-tournage.ts studio/serveur/api.ts studio/serveur/api.test.ts
git commit -m "Studio : retrait de la vidéo d'un tournage en erreur, pour la remplacer"
```

---

### Task 3 : interface — supprimer et remplacer depuis la liste

**Files:**
- Modify: `studio/src/logique/nouveau-tournage.ts`, `studio/src/logique/nouveau-tournage.test.ts`, `studio/src/api.ts`, `studio/src/composants/ListeTournages.tsx`
- Create: `studio/src/composants/LigneTournage.tsx`

**Interfaces:**
- Consumes : routes des tâches 1 et 2 ; `etatTournage`, `raisonFichierVideo`, `titreParDefaut`, `LIBELLES_ETAPE`, `api.deposerVideo`, `api.analyser` (existants).
- Produces :
  - `peutRemplacerVideo(t: ResumeTournage): boolean`, `peutSupprimer(t: ResumeTournage): boolean`.
  - `api.supprimerTournage(nom: string): Promise<void>`, `api.retirerVideo(nom: string): Promise<void>`.
  - `LigneTournage: FC<{ t: ResumeTournage; bloque: boolean; onAnalyser: (nom: string, titre: string) => Promise<void>; onChangement: () => void }>`.

- [ ] **Step 1 : tests qui échouent**

Dans `studio/src/logique/nouveau-tournage.test.ts`, ajouter `peutRemplacerVideo, peutSupprimer` à l'import et ce test dans le `describe` :

```ts
  it('propose de remplacer la vidéo d’un tournage en erreur au premier chargement seulement', () => {
    expect(peutRemplacerVideo({ ...TOURNAGE, videoPresente: true, statut: 'erreur' })).toBe(true);
    expect(peutRemplacerVideo({ ...TOURNAGE, videoPresente: true })).toBe(false);
    expect(peutRemplacerVideo({ ...TOURNAGE, analyseFaite: true, videoPresente: true, statut: 'erreur' })).toBe(false);
    expect(peutRemplacerVideo({ ...TOURNAGE, videoPresente: true, statut: 'erreur', analyseEnCours: true })).toBe(false);
  });
  it('ne supprime pas un tournage en cours d’analyse', () => {
    expect(peutSupprimer(TOURNAGE)).toBe(true);
    expect(peutSupprimer({ ...TOURNAGE, analyseEnCours: true })).toBe(false);
  });
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npx vitest run studio/src/logique/nouveau-tournage.test.ts`
Expected : FAIL (fonctions non exportées).

- [ ] **Step 3 : implémenter la logique et les appels**

À la fin de `studio/src/logique/nouveau-tournage.ts` :

```ts
// « Remplacer la vidéo » : seulement pour un tournage en erreur au premier chargement.
export const peutRemplacerVideo = (t: ResumeTournage) => etatTournage(t) === 'erreur';

// Un tournage en cours d'analyse ne se supprime pas (le serveur refuse aussi pendant un rendu ou un envoi).
export const peutSupprimer = (t: ResumeTournage) => !t.analyseEnCours;
```

Dans `studio/src/api.ts`, dans l'objet `api`, après `analyser` :

```ts
  supprimerTournage: async (nom: string) => {
    await appeler<{ ok: true }>(chemin(nom), { method: 'DELETE' });
  },
  retirerVideo: async (nom: string) => {
    await appeler<{ ok: true }>(`${chemin(nom)}/video`, { method: 'DELETE' });
  },
```

Run : `npx vitest run studio/src/logique/nouveau-tournage.test.ts` — Expected : PASS.

- [ ] **Step 4 : créer `studio/src/composants/LigneTournage.tsx`**

La ligne reprend le rendu actuel de `ListeTournages` (statut, message, « Analyser », « Relancer l'analyse ») et ajoute la suppression et le remplacement.

```tsx
import { type FC, useRef, useState } from 'react';
import type { StatutEpisode } from '../../../noyau/types';
import { EXTENSIONS_VIDEO, type ResumeTournage } from '../../commun';
import { api } from '../api';
import { etatTournage, LIBELLES_ETAPE, peutRemplacerVideo, peutSupprimer, raisonFichierVideo, titreParDefaut } from '../logique/nouveau-tournage';
import { Attente } from './Attente';

export const LIBELLES_STATUT: Record<StatutEpisode, string> = {
  analyse: 'Analysé',
  'en-validation': 'En validation',
  valide: 'Validé',
  rendu: 'Rendu',
  erreur: 'Erreur',
};

interface Props {
  t: ResumeTournage;
  // Une analyse tourne ou se lance : les actions qui en lanceraient une autre attendent.
  bloque: boolean;
  onAnalyser: (nom: string, titre: string) => Promise<void>;
  // Recharge la liste après une suppression ou un remplacement.
  onChangement: () => void;
}

export const LigneTournage: FC<Props> = ({ t, bloque, onAnalyser, onChangement }) => {
  const [titre, setTitre] = useState(() => titreParDefaut(t));
  const [confirmation, setConfirmation] = useState(false);
  const [progression, setProgression] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const choix = useRef<HTMLInputElement>(null);
  const etat = etatTournage(t);
  const occupe = progression !== null;

  async function supprimer() {
    setErreur(null);
    try {
      await api.supprimerTournage(t.nom);
      onChangement();
    } catch (e) {
      setErreur((e as Error).message);
      setConfirmation(false);
    }
  }

  async function remplacer(fichiers: File[]) {
    const f = fichiers[0];
    if (!f || occupe || bloque || !peutRemplacerVideo(t)) return;
    const raison = raisonFichierVideo(f.name);
    if (raison) {
      setErreur(raison);
      return;
    }
    setErreur(null);
    setProgression(0);
    try {
      await api.retirerVideo(t.nom);
      await api.deposerVideo(t.nom, f, setProgression);
      setProgression(null);
      await onAnalyser(t.nom, titreParDefaut(t));
    } catch (e) {
      setErreur((e as Error).message);
      setProgression(null);
      onChangement();
    }
  }

  return (
    <tr
      onDragOver={e => { if (peutRemplacerVideo(t)) e.preventDefault(); }}
      onDrop={e => { e.preventDefault(); void remplacer([...e.dataTransfer.files]); }}
    >
      <td>
        {t.analyseFaite ? <a href={`#/${encodeURIComponent(t.nom)}`}>{t.titre}</a> : t.titre}
        <div className="discret">{t.nom}</div>
      </td>
      <td>
        {etat === 'en-cours' && <Attente libelle={LIBELLES_ETAPE[t.etapeAnalyse]} />}
        {(etat === 'analyse' || etat === 'erreur') && t.statut && (
          <span className={`statut statut-${t.statut}`}>{LIBELLES_STATUT[t.statut]}</span>
        )}
        {etat === 'analyse' && !t.statut && <span className="discret">Non analysé</span>}
        {etat === 'a-analyser' && <span className="discret">Non analysé</span>}
        {etat === 'video-manquante' && <span className="discret">Vidéo manquante</span>}
      </td>
      <td className="discret">
        {etat !== 'en-cours' && (t.message ?? '')}
        {progression !== null && (
          <p><progress value={progression} max={1} /> Envoi de la vidéo : {Math.round(progression * 100)} %</p>
        )}
        {erreur && <p className="alerte">{erreur}</p>}
        <div className="actions">
          {etat === 'erreur' && (
            <>
              <button onClick={() => void onAnalyser(t.nom, titreParDefaut(t))} disabled={bloque || occupe}>Relancer l’analyse</button>
              <button onClick={() => choix.current?.click()} disabled={bloque || occupe}>Remplacer la vidéo</button>
              <input
                ref={choix}
                type="file"
                accept={EXTENSIONS_VIDEO.join(',')}
                hidden
                onChange={e => { void remplacer([...(e.target.files ?? [])]); e.target.value = ''; }}
              />
            </>
          )}
          {etat === 'a-analyser' && (
            <>
              <input value={titre} onChange={e => setTitre(e.target.value)} aria-label={`Titre de ${t.nom}`} size={30} />
              <button onClick={() => void onAnalyser(t.nom, titre.trim())} disabled={bloque || !titre.trim()}>Analyser</button>
            </>
          )}
          {!confirmation && (
            <button onClick={() => setConfirmation(true)} disabled={!peutSupprimer(t) || occupe}>Supprimer</button>
          )}
          {confirmation && (
            <>
              <span>Supprimer « {t.titre} » ?</span>
              <button className="principal" onClick={() => void supprimer()}>Oui, supprimer</button>
              <button onClick={() => setConfirmation(false)}>Annuler</button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
};
```

- [ ] **Step 5 : brancher `LigneTournage` dans `ListeTournages.tsx`**

Dans `studio/src/composants/ListeTournages.tsx` :
- supprimer `LIBELLES_STATUT` (déplacé dans `LigneTournage.tsx`), l'état `titres`, et les imports devenus inutiles (`StatutEpisode`, `etatTournage`, `LIBELLES_ETAPE`, `titreParDefaut`, `Attente`) ;
- importer `import { LigneTournage } from './LigneTournage';` ;
- remplacer tout le contenu de `<tbody>…</tbody>` par :

```tsx
          <tbody>
            {tournages.map(t => (
              <LigneTournage key={t.nom} t={t} bloque={bloque} onAnalyser={analyser} onChangement={charger} />
            ))}
          </tbody>
```

La fonction `analyser(nom, titre)` existante garde sa signature.

- [ ] **Step 6 : vérifier**

Run : `npm test` puis `npm run typecheck`
Expected : tout passe, aucune erreur de type (si `LIBELLES_STATUT` de `ListeTournages` était importé ailleurs, le typage le signale : l'importer depuis `LigneTournage`).

- [ ] **Step 7 : commit**

```bash
git add studio/src/logique/nouveau-tournage.ts studio/src/logique/nouveau-tournage.test.ts studio/src/api.ts studio/src/composants/LigneTournage.tsx studio/src/composants/ListeTournages.tsx
git commit -m "Studio : supprimer un tournage et remplacer la vidéo en erreur depuis la liste"
```

---

### Task 4 : ordre de l'écran de montage et documentation

**Files:**
- Modify: `studio/src/composants/EcranMontage.tsx` (colonne `<aside className="cote">`)
- Modify: `docs/studio.md`

- [ ] **Step 1 : réordonner les panneaux**

Dans `studio/src/composants/EcranMontage.tsx`, à l'intérieur de `<aside className="cote">`, garder le bandeau des suggestions puis `<Apercu … />` en tête, et déplacer les blocs JSX existants (sans modifier leurs propriétés) pour obtenir cet ordre :

1. `{detail.analyse.erreurSuggestions && (<BandeauSuggestions … />)}`
2. `<Apercu … />`
3. `<PanneauElements … />`
4. `<PanneauLongueurs … />`
5. `<PanneauTermes … />`
6. `<PanneauConsignes … />`
7. `<PanneauRendu … />`

- [ ] **Step 2 : documentation**

Dans `docs/studio.md` :
- ajouter à la fin de la section « Lancer », après le point 3 (« Nouveau tournage ») :

```markdown
4. **Supprimer** (chaque ligne de la liste, après confirmation) : le dossier du tournage est rangé dans `donnees/tournages-supprimes/`, d'où il peut être remis à la main dans `donnees/tournages/` ; le studio ne le vide jamais. Refusé pendant une analyse, un rendu ou un envoi sur ce tournage.
5. **Remplacer la vidéo** (tournage en erreur au premier chargement, par exemple une vidéo sans piste audio) : choisir ou glisser sur la ligne la bonne vidéo ; le studio retire l'ancienne et les fichiers tirés d'elle, garde l'enregistrement `-camera`, envoie la nouvelle et relance l'analyse.
```

- dans la section « Écran de montage », ajouter après le point « Aperçu » :

```markdown
- **Colonne de droite**, de haut en bas : aperçu, éléments à l'écran, longueurs proposées, termes, consignes, rendu.
```

- [ ] **Step 3 : vérifier**

Run : `npm test` puis `npm run typecheck`
Expected : tout passe.

- [ ] **Step 4 : commit**

```bash
git add studio/src/composants/EcranMontage.tsx docs/studio.md
git commit -m "Studio : écran de montage réordonné (vidéo, éléments, longueurs, termes, consignes, rendu) ; documentation"
```

- [ ] **Step 5 : essai réel (avec l'auteur)**

1. Supprimer un tournage d'essai : confirmation dans la ligne, puis le dossier se retrouve dans `donnees/tournages-supprimes/`.
2. Tournage en erreur (vidéo sans son) : « Remplacer la vidéo » avec une vidéo correcte, progression, puis étapes de l'analyse jusqu'à « Analysé ».
3. Ouvrir un tournage analysé : panneaux dans l'ordre vidéo, éléments, longueurs, termes, consignes, rendu.
