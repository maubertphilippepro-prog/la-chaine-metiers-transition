import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { GABARITS } from '../../noyau/gabarits';
import { demarrerServeur } from './serveur-fichiers';
import { rendreVignette } from './vignette';

let dossier: string;
let serveur: Awaited<ReturnType<typeof demarrerServeur>>;

// Pour inspecter les rendus : PMT_COPIE_VIGNETTES=<dossier> copie les JPEG produits.
async function copier(sortie: string, nom: string): Promise<void> {
  const cible = process.env.PMT_COPIE_VIGNETTES;
  if (!cible) return;
  await mkdir(cible, { recursive: true });
  await copyFile(sortie, path.join(cible, `${nom}.jpg`));
}

beforeAll(async () => {
  dossier = await mkdtemp(path.join(os.tmpdir(), 'pmt-vignette-'));
  const ffmpeg = (...args: string[]) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
  ffmpeg('-f', 'lavfi', '-i', 'testsrc=size=1920x1080', '-frames:v', '1', path.join(dossier, 'fond.png'));
  ffmpeg('-f', 'lavfi', '-i', 'color=c=red:s=600x900', '-frames:v', '1', path.join(dossier, 'pose.png'));
  ffmpeg('-f', 'lavfi', '-i', 'color=c=green:s=256x256', '-frames:v', '1', path.join(dossier, 'logo.png'));
  ffmpeg('-f', 'lavfi', '-i', 'testsrc2=size=1280x720', '-frames:v', '1', path.join(dossier, 'capture.png'));
  serveur = await demarrerServeur(dossier);
});

afterAll(async () => {
  await serveur.fermer();
});

it.each(GABARITS)('rend le gabarit %s en JPEG 1280×720 de moins de 2 Mo, avec trois logos et trois captures', async gabarit => {
  const sortie = path.join(dossier, 'vignettes', `${gabarit}.jpg`);
  const trois = (f: string) => [1, 2, 3].map(n => `${serveur.url}/${f}?n=${n}`);
  const resultat = await rendreVignette({
    gabarit, fondUrl: `${serveur.url}/fond.png`, poseUrl: `${serveur.url}/pose.png`,
    logoUrls: trois('logo.png'), captureUrls: trois('capture.png'), accroche: 'Le presse-papiers caché',
  }, sortie, 2_000_000);
  expect(resultat.octets).toBeLessThanOrEqual(2_000_000);
  expect((await stat(sortie)).size).toBe(resultat.octets);
  const dimensions = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', sortie], { encoding: 'utf-8' });
  expect(dimensions.trim()).toBe('1280,720');
  await copier(sortie, gabarit);
});

it('rend le classique sans fond, sans logo ni capture', async () => {
  const sortie = path.join(dossier, 'vignettes', 'nu.jpg');
  const resultat = await rendreVignette({
    gabarit: 'classique', fondUrl: null, poseUrl: `${serveur.url}/pose.png`, logoUrls: [], captureUrls: [], accroche: 'Essai',
  }, sortie, 2_000_000);
  expect(resultat.octets).toBeGreaterThan(0);
  await copier(sortie, 'nu');
});
