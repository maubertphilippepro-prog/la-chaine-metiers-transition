import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import reglagesJson from '../../reglages.json';
import { decisionsEpisodes, dureeEpisode } from '../../noyau/decisions';
import { montageInitial } from '../../noyau/montage-initial';
import type { Analyse, Reglages } from '../../noyau/types';
import { rendreTournage } from './rendu';

function dureeVideo(fichier: string): number {
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', fichier], { encoding: 'utf-8' }));
}

it("rend les épisodes et la vidéo complète d'un tournage en brouillon", async () => {
  const dossier = path.join(await mkdtemp(path.join(os.tmpdir(), 'pmt-rendu-')), '2026-10-07-test');
  await mkdir(dossier);
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'testsrc=size=1920x1080:rate=30:duration=8',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
    path.join(dossier, 'source.mp4'),
  ]);
  const analyse: Analyse = {
    version: 1, duree: 8, fps: 30, mots: [],
    detections: [{ id: 'd0', type: 'silence', debut: 2, fin: 4 }],
    suggestions: {
      chapitres: [{ titre: 'Introduction', debut: 0 }, { titre: 'Suite', debut: 5 }],
      termes: [{ terme: 'API', definition: "Interface d'échange entre logiciels.", occurrences: [1], origine: 'glossaire' }],
      longueurs: [],
    },
    erreurSuggestions: null,
  };
  await writeFile(path.join(dossier, 'analyse.json'), JSON.stringify(analyse), 'utf-8');
  await writeFile(path.join(dossier, 'episode.json'), JSON.stringify({ version: 1, titre: 'Essai de rendu', statut: 'analyse', message: null }), 'utf-8');

  const resultats = await rendreTournage(dossier, { brouillon: true, cible: 'tout' });

  expect(resultats.map(r => [path.basename(r.fichier), r.ok, r.message])).toEqual([
    ['episode-01-introduction.mp4', true, null],
    ['episode-02-suite.mp4', true, null],
    ['video-complete.mp4', true, null],
  ]);
  const reglages: Reglages = reglagesJson;
  const attendu = decisionsEpisodes(analyse, montageInitial(analyse, 'Essai de rendu'), reglages, '')[0]!;
  expect(dureeVideo(resultats[0]!.fichier)).toBeCloseTo(dureeEpisode(attendu) / 30, 0);
  expect(await readFile(path.join(dossier, 'rendus', 'journal.txt'), 'utf-8')).toContain('ok video-complete.mp4');
  expect(JSON.parse(await readFile(path.join(dossier, 'episode.json'), 'utf-8')).statut).toBe('analyse');
  console.log(`Rendus de test dans ${path.join(dossier, 'rendus')}`);
});
