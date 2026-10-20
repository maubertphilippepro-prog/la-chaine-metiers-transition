import { execFileSync } from 'node:child_process';
import { mkdtemp, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { demarrerServeur } from './serveur-fichiers';
import { rendreVignette } from './vignette';

it('rend une vignette 1280×720 en JPEG de moins de 2 Mo', async () => {
  const dossier = await mkdtemp(path.join(os.tmpdir(), 'pmt-vignette-'));
  const ffmpeg = (...args: string[]) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
  ffmpeg('-f', 'lavfi', '-i', 'testsrc=size=1920x1080', '-frames:v', '1', path.join(dossier, 'fond.png'));
  ffmpeg('-f', 'lavfi', '-i', 'color=c=red:s=600x900', '-frames:v', '1', path.join(dossier, 'pose.png'));
  const serveur = await demarrerServeur(dossier);
  try {
    const sortie = path.join(dossier, 'vignettes', 'complete.jpg');
    const resultat = await rendreVignette(
      { fondUrl: `${serveur.url}/fond.png`, poseUrl: `${serveur.url}/pose.png`, accroche: 'Le presse-papiers caché' },
      sortie, 2_000_000,
    );
    expect(resultat.octets).toBeLessThanOrEqual(2_000_000);
    expect((await stat(sortie)).size).toBe(resultat.octets);
    const dimensions = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', sortie], { encoding: 'utf-8' });
    expect(dimensions.trim()).toBe('1280,720');
  } finally {
    await serveur.fermer();
  }
});
