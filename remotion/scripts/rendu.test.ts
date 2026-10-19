import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import exemple from '../../fixtures/analyse-exemple.json';
import { montageInitial } from '../../noyau/montage-initial';
import type { Analyse } from '../../noyau/types';
import { lireArguments, rendreTournage, type Dependances } from './rendu';

describe('lireArguments', () => {
  it('lit le dossier et les options', () => {
    expect(lireArguments(['donnees/tournages/x'])).toEqual({ dossier: 'donnees/tournages/x', brouillon: false, cible: 'tout' });
    expect(lireArguments(['x', '--brouillon', '--seul', '2'])).toEqual({ dossier: 'x', brouillon: true, cible: 2 });
    expect(lireArguments(['--seul', 'complete', 'x'])).toEqual({ dossier: 'x', brouillon: false, cible: 'complete' });
  });
  it('refuse les arguments invalides', () => {
    expect(() => lireArguments([])).toThrow('Usage');
    expect(() => lireArguments(['x', '--seul', '0'])).toThrow('--seul');
    expect(() => lireArguments(['x', '--seul'])).toThrow('--seul');
    expect(() => lireArguments(['x', '--inconnu'])).toThrow('--inconnu');
  });
});

async function tournage(avecMontage: boolean): Promise<string> {
  const dossier = path.join(await mkdtemp(path.join(os.tmpdir(), 'pmt-rendu-')), '2026-10-07-essai');
  await mkdir(dossier);
  await writeFile(path.join(dossier, 'source.mp4'), 'factice', 'utf-8');
  await writeFile(path.join(dossier, 'analyse.json'), JSON.stringify(exemple), 'utf-8');
  await writeFile(path.join(dossier, 'episode.json'), JSON.stringify({ version: 1, titre: 'Essai', statut: 'analyse', message: null }), 'utf-8');
  if (avecMontage) {
    await writeFile(path.join(dossier, 'montage.json'), JSON.stringify(montageInitial(exemple as Analyse, 'Essai')), 'utf-8');
  }
  return dossier;
}

// Faux moteur : écrit un petit fichier à l'emplacement demandé, ou échoue (après une écriture partielle) pour `echec`.
function dependances(echec: string | null): Dependances {
  return {
    ensureBrowser: (async () => ({})) as unknown as Dependances['ensureBrowser'],
    bundle: (async () => 'http://bundle') as unknown as Dependances['bundle'],
    selectComposition: (async () => ({})) as unknown as Dependances['selectComposition'],
    renderMedia: (async (o: { outputLocation: string; onProgress?: (p: { progress: number }) => void }) => {
      o.onProgress?.({ progress: 0.5 });
      await writeFile(o.outputLocation, 'partiel', 'utf-8');
      if (echec && o.outputLocation.includes(echec)) throw new Error('moteur en panne');
      await writeFile(o.outputLocation, 'nouveau', 'utf-8');
      return {};
    }) as unknown as Dependances['renderMedia'],
  };
}

const statut = async (dossier: string) => JSON.parse(await readFile(path.join(dossier, 'episode.json'), 'utf-8'));

describe('rendreTournage', () => {
  it("poursuit après un échec, sans fichier temporaire et en gardant l'ancien rendu", async () => {
    const d = await tournage(false);
    await mkdir(path.join(d, 'rendus'));
    await writeFile(path.join(d, 'rendus', 'video-complete.mp4'), 'ancien', 'utf-8');
    const resultats = await rendreTournage(d, { brouillon: true, cible: 'tout' }, dependances('video-complete'));

    expect(resultats.length).toBeGreaterThan(1);
    expect(resultats.filter(r => !r.ok).map(r => path.basename(r.fichier))).toEqual(['video-complete.mp4']);
    expect(resultats.find(r => !r.ok)!.message).toBe('moteur en panne');
    for (const r of resultats.filter(r => r.ok)) expect(await readFile(r.fichier, 'utf-8')).toBe('nouveau');
    expect(await readFile(path.join(d, 'rendus', 'video-complete.mp4'), 'utf-8')).toBe('ancien');
    expect((await readdir(path.join(d, 'rendus'))).filter(f => f.includes('.tmp'))).toEqual([]);
    expect(await readFile(path.join(d, 'rendus', 'journal.txt'), 'utf-8')).toContain('échec video-complete.mp4 : moteur en panne');
  });
  it('passe le statut à « rendu » quand tout réussit hors brouillon', async () => {
    const d = await tournage(true);
    const resultats = await rendreTournage(d, { brouillon: false, cible: 'tout' }, dependances(null));
    expect(resultats.every(r => r.ok)).toBe(true);
    expect(await statut(d)).toMatchObject({ titre: 'Essai', statut: 'rendu', message: null });
  });
  it('passe le statut à « erreur » en nommant le rendu en échec, hors brouillon', async () => {
    const d = await tournage(true);
    await rendreTournage(d, { brouillon: false, cible: 'tout' }, dependances('video-complete'));
    expect(await statut(d)).toMatchObject({ statut: 'erreur', message: '1 rendu(s) en échec : video-complete.mp4' });
  });
  it('passe le statut à « rendu » après un rendu partiel si tous les fichiers existent', async () => {
    const d = await tournage(true);
    await rendreTournage(d, { brouillon: false, cible: 'tout' }, dependances('video-complete'));
    expect((await statut(d)).statut).toBe('erreur');
    const resultats = await rendreTournage(d, { brouillon: false, cible: 'complete' }, dependances(null));
    expect(resultats.map(r => path.basename(r.fichier))).toEqual(['video-complete.mp4']);
    expect(await statut(d)).toMatchObject({ statut: 'rendu', message: null });
  });
  it('laisse le statut inchangé après un rendu partiel si un fichier manque', async () => {
    const d = await tournage(true);
    await writeFile(path.join(d, 'episode.json'), JSON.stringify({ version: 1, titre: 'Essai', statut: 'valide', message: null }), 'utf-8');
    await rendreTournage(d, { brouillon: false, cible: 'complete' }, dependances(null));
    expect(await statut(d)).toMatchObject({ statut: 'valide', message: null });
  });
  it('ne touche pas au statut en brouillon', async () => {
    const d = await tournage(false);
    await rendreTournage(d, { brouillon: true, cible: 'tout' }, dependances('video-complete'));
    expect(await statut(d)).toMatchObject({ statut: 'analyse', message: null });
  });
  it('signale la progression de chaque rendu', async () => {
    const d = await tournage(false);
    const appels: [string, number][] = [];
    const resultats = await rendreTournage(d, {
      brouillon: true, cible: 'complete', onProgression: (fichier, progression) => appels.push([fichier, progression]),
    }, dependances(null));
    expect(appels).toEqual([[resultats[0]!.fichier, 0.5]]);
    expect(existsSync(path.join(d, 'rendus', 'video-complete.mp4'))).toBe(true);
  });
});
