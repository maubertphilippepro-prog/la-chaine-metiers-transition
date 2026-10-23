import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProprietesVignette } from '../composants/Vignette';
import { oublierPaquet, rendreVignette, type DependancesVignette } from './vignette';

const PROPS: ProprietesVignette = { gabarit: 'classique', fondUrl: null, poseUrl: null, logoUrls: [], captureUrls: [], accroche: 'Essai' };

// Faux moteur : chaque qualité JPEG produit un fichier de la taille indiquée.
function dependances(tailles: Record<number, number>) {
  const d = {
    bundle: vi.fn(async () => 'http://paquet'),
    ensureBrowser: vi.fn(async () => undefined),
    selectComposition: vi.fn(async () => ({ id: 'Vignette' })),
    renderStill: vi.fn(async (o: { output: string; jpegQuality: number }) => {
      await writeFile(o.output, Buffer.alloc(tailles[o.jpegQuality] ?? 1));
      return {};
    }),
  };
  return { d, deps: d as unknown as DependancesVignette };
}

beforeEach(() => oublierPaquet());

describe('rendreVignette', () => {
  it('baisse la qualité jusqu’à passer sous la taille maximale', async () => {
    const sortie = path.join(await mkdtemp(path.join(os.tmpdir(), 'pmt-vignette-')), 'complete.jpg');
    const { d, deps } = dependances({ 90: 3000, 80: 1500 });
    expect(await rendreVignette(PROPS, sortie, 2000, deps)).toEqual({ octets: 1500, qualite: 80 });
    expect((await readFile(sortie)).length).toBe(1500);
    expect(d.selectComposition).toHaveBeenCalledWith(expect.objectContaining({ id: 'Vignette', inputProps: PROPS }));
    expect(d.renderStill).toHaveBeenCalledWith(expect.objectContaining({ imageFormat: 'jpeg', jpegQuality: 90 }));
  });
  it('échoue si même la qualité la plus basse est trop lourde', async () => {
    const sortie = path.join(await mkdtemp(path.join(os.tmpdir(), 'pmt-vignette-')), 'complete.jpg');
    const { deps } = dependances({ 90: 3000, 80: 3000, 70: 3000, 60: 3000 });
    await expect(rendreVignette(PROPS, sortie, 2000, deps)).rejects.toThrow('Vignette de plus de 2000 octets');
  });
  it('ne construit le paquet Remotion qu’une fois', async () => {
    const dossier = await mkdtemp(path.join(os.tmpdir(), 'pmt-vignette-'));
    const { d, deps } = dependances({});
    await rendreVignette(PROPS, path.join(dossier, 'a.jpg'), 2000, deps);
    await rendreVignette(PROPS, path.join(dossier, 'b.jpg'), 2000, deps);
    expect(d.bundle).toHaveBeenCalledTimes(1);
  });
});
