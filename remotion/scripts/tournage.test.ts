import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import exemple from '../../fixtures/analyse-exemple.json';
import { chargerTournage, majStatutEpisode, urlSource } from './tournage';

async function tournage(fichiers: Record<string, unknown>): Promise<string> {
  const dossier = path.join(await mkdtemp(path.join(os.tmpdir(), 'pmt-tournage-')), '2026-10-07-essai');
  await mkdir(dossier);
  for (const [nom, contenu] of Object.entries(fichiers)) {
    await writeFile(path.join(dossier, nom), JSON.stringify(contenu), 'utf-8');
  }
  return dossier;
}

describe('chargerTournage', () => {
  it("exige l'analyse", async () => {
    await expect(chargerTournage(await tournage({}), { brouillon: true })).rejects.toThrow('analyse.json absent');
  });
  it('exige montage.json hors brouillon', async () => {
    const d = await tournage({ 'analyse.json': exemple });
    await expect(chargerTournage(d, { brouillon: false })).rejects.toThrow('--brouillon');
  });
  it('construit le montage par défaut en brouillon, avec le titre de episode.json', async () => {
    const d = await tournage({ 'analyse.json': exemple, 'episode.json': { version: 1, titre: 'Essai', statut: 'analyse', message: null } });
    const t = await chargerTournage(d, { brouillon: true });
    expect(t.nom).toBe('2026-10-07-essai');
    expect(t.titre).toBe('Essai');
    expect(t.montage.titre).toBe('Essai');
    expect(t.montage.chapitres[0]).toEqual({ titre: 'Introduction', debut: 0 });
    expect(t.reglages.charte.nomChaine).toBe('Métiers & Transition');
  });
  it('reprend montage.json quand il existe', async () => {
    const montage = { version: 1, titre: 'Validé', coupes: [], chapitres: [{ titre: 'Seul', debut: 0 }], termes: [] };
    const t = await chargerTournage(await tournage({ 'analyse.json': exemple, 'montage.json': montage }), { brouillon: false });
    expect(t.montage.titre).toBe('Validé');
    expect(t.titre).toBe('2026-10-07-essai');
  });
  it('lit un montage enregistré sans éléments à l’écran comme une liste vide', async () => {
    const montage = { version: 1, titre: 'Validé', coupes: [], chapitres: [{ titre: 'Seul', debut: 0 }], termes: [] };
    const t = await chargerTournage(await tournage({ 'analyse.json': exemple, 'montage.json': montage }), { brouillon: false });
    expect(t.montage.elements).toEqual([]);
  });
  it('signale un JSON illisible', async () => {
    const d = await tournage({ 'analyse.json': exemple });
    await writeFile(path.join(d, 'montage.json'), '{ pas du json', 'utf-8');
    await expect(chargerTournage(d, { brouillon: false })).rejects.toThrow('2026-10-07-essai/montage.json illisible : ');
  });
  it('refuse un montage.json invalide', async () => {
    const valide = { version: 1, titre: 'Validé', coupes: [], chapitres: [], termes: [] };
    for (const [montage, raison] of [
      [[], 'objet attendu'],
      [{ ...valide, version: 2 }, 'version'],
      [{ ...valide, titre: 3 }, 'titre'],
      [{ ...valide, coupes: null }, 'coupes'],
      [{ ...valide, chapitres: {} }, 'chapitres'],
      [{ ...valide, termes: 'x' }, 'termes'],
      [{ ...valide, elements: {} }, 'elements'],
    ] as const) {
      const d = await tournage({ 'analyse.json': exemple, 'montage.json': montage });
      await expect(chargerTournage(d, { brouillon: false })).rejects.toThrow(`2026-10-07-essai/montage.json invalide : ${raison}`);
    }
  });
  it('refuse une analyse.json invalide', async () => {
    for (const [analyse, raison] of [
      [null, 'objet attendu'],
      [{ ...exemple, version: 0 }, 'version'],
      [{ ...exemple, duree: 0 }, 'duree'],
      [{ ...exemple, fps: '30' }, 'fps'],
      [{ ...exemple, mots: null }, 'mots'],
      [{ ...exemple, detections: undefined }, 'detections'],
    ] as const) {
      const d = await tournage({ 'analyse.json': analyse });
      await expect(chargerTournage(d, { brouillon: true })).rejects.toThrow(`2026-10-07-essai/analyse.json invalide : ${raison}`);
    }
  });
  it("ignore un episode.json qui n'est pas un objet", async () => {
    for (const episode of [null, [1], 'texte']) {
      const t = await chargerTournage(await tournage({ 'analyse.json': exemple, 'episode.json': episode }), { brouillon: true });
      expect(t.titre).toBe('2026-10-07-essai');
    }
  });
});

describe('majStatutEpisode', () => {
  it('met à jour le statut en gardant les autres champs', async () => {
    const d = await tournage({ 'episode.json': { version: 1, titre: 'Essai', statut: 'analyse', message: null, episodes: [1] } });
    await majStatutEpisode(d, 'rendu', null);
    expect(JSON.parse(await readFile(path.join(d, 'episode.json'), 'utf-8')))
      .toEqual({ version: 1, titre: 'Essai', statut: 'rendu', message: null, episodes: [1] });
  });
});

describe('urlSource', () => {
  it('encode le nom du dossier', () => {
    expect(urlSource('http://127.0.0.1:5000', 'mon essai')).toBe('http://127.0.0.1:5000/mon%20essai/source.mp4');
  });
});
