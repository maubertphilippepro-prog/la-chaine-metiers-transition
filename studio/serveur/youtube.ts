import { spawn } from 'node:child_process';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { LectureYoutube, TextesYoutube } from '../../noyau/youtube';

const DELAI = 5000;
const NON_LISIBLE = new Set([401, 403, 404]);

// Visibilité vue sans compte Google : l’adresse oEmbed ne répond qu’aux vidéos lisibles publiquement (publiques ou non répertoriées).
export async function lireVisibiliteYoutube(id: string, recuperer: typeof fetch = fetch): Promise<LectureYoutube> {
  const video = `https://www.youtube.com/watch?v=${id}`;
  try {
    const reponse = await recuperer(`https://www.youtube.com/oembed?url=${encodeURIComponent(video)}&format=json`, {
      signal: AbortSignal.timeout(DELAI),
    });
    if (reponse.ok) return 'publique';
    return NON_LISIBLE.has(reponse.status) ? 'non-publique' : 'inconnue';
  } catch {
    return 'inconnue';
  }
}

export async function ecrireDossierYoutube(dossier: string, textes: TextesYoutube, vignette: string): Promise<void> {
  await mkdir(dossier, { recursive: true });
  await copyFile(vignette, path.join(dossier, 'vignette.jpg'));
  const fichiers: [string, string][] = [
    ['titre.txt', textes.titre],
    ['description.txt', textes.description],
    ['tags.txt', textes.tags],
    ['reglages-youtube.txt', textes.reglages],
  ];
  for (const [nom, contenu] of fichiers) await writeFile(path.join(dossier, nom), contenu, 'utf-8');
}

// L’Explorateur rend la main aussitôt (et sort souvent avec le code 1) : seul l’échec du lancement compte.
export function ouvrirDansExplorateur(dossier: string): Promise<void> {
  return new Promise((resoudre, rejeter) => {
    const processus = spawn('explorer.exe', [dossier], { detached: true, stdio: 'ignore' });
    processus.on('error', rejeter);
    processus.on('spawn', () => {
      processus.unref();
      resoudre();
    });
  });
}
