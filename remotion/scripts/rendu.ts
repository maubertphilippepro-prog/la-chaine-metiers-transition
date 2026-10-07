import { bundle } from '@remotion/bundler';
import { ensureBrowser, renderMedia, selectComposition } from '@remotion/renderer';
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decisionsEpisodes, decisionsVideoComplete } from '../../noyau/decisions';
import { nomFichierEpisode } from '../../noyau/nommage';
import { demarrerServeur } from './serveur-fichiers';
import { chargerTournage, majStatutEpisode, RACINE, urlSource } from './tournage';

export type Cible = 'tout' | 'complete' | number;

export interface ResultatRendu {
  fichier: string;
  ok: boolean;
  message: string | null;
}

const USAGE = 'Usage : npm run rendu -- <dossier du tournage> [--brouillon] [--seul <numéro>|complete]';

export function lireArguments(args: string[]): { dossier: string; brouillon: boolean; cible: Cible } {
  let dossier: string | undefined;
  let brouillon = false;
  let cible: Cible = 'tout';
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '--brouillon') brouillon = true;
    else if (a === '--seul') {
      const valeur = args[++i];
      if (valeur === 'complete') cible = 'complete';
      else if (valeur !== undefined && /^[1-9]\d*$/.test(valeur)) cible = Number(valeur);
      else throw new Error(`--seul attend un numéro d'épisode (1, 2…) ou « complete ». ${USAGE}`);
    } else if (a.startsWith('--')) throw new Error(`Option inconnue : ${a}. ${USAGE}`);
    else dossier = a;
  }
  if (!dossier) throw new Error(USAGE);
  return { dossier, brouillon, cible };
}

interface Travail {
  fichier: string;
  composition: 'Episode' | 'VideoComplete';
  props: Record<string, unknown>;
}

export async function rendreTournage(dossier: string, options: { brouillon: boolean; cible: Cible }): Promise<ResultatRendu[]> {
  const t = await chargerTournage(dossier, { brouillon: options.brouillon });
  const sortie = path.join(dossier, 'rendus');
  await mkdir(sortie, { recursive: true });
  const noter = (ligne: string) => appendFile(path.join(sortie, 'journal.txt'), `${new Date().toISOString()} ${ligne}\n`, 'utf-8');

  const serveur = await demarrerServeur(path.dirname(dossier));
  const resultats: ResultatRendu[] = [];
  try {
    const source = urlSource(serveur.url, t.nom);
    const episodes = decisionsEpisodes(t.analyse, t.montage, t.reglages, source);
    const travaux: Travail[] = [];
    episodes.forEach((decisions, i) => {
      if (options.cible === 'tout' || options.cible === i + 1) {
        travaux.push({ fichier: nomFichierEpisode(i, decisions.titre), composition: 'Episode', props: { decisions } });
      }
    });
    if (options.cible === 'tout' || options.cible === 'complete') {
      travaux.push({
        fichier: 'video-complete.mp4',
        composition: 'VideoComplete',
        props: { decisions: decisionsVideoComplete(t.analyse, t.montage, t.reglages, source) },
      });
    }
    if (travaux.length === 0) throw new Error(`Rien à rendre pour « ${options.cible} » : ${episodes.length} épisode(s).`);

    await ensureBrowser();
    const serveUrl = await bundle({ entryPoint: path.join(RACINE, 'remotion', 'index.ts') });
    for (const travail of travaux) {
      const fichier = path.join(sortie, travail.fichier);
      await noter(`début ${travail.fichier}${options.brouillon ? ' (brouillon)' : ''}`);
      try {
        const composition = await selectComposition({ serveUrl, id: travail.composition, inputProps: travail.props });
        await renderMedia({
          composition,
          serveUrl,
          codec: 'h264',
          outputLocation: fichier,
          inputProps: travail.props,
          onProgress: ({ progress }) => process.stdout.write(`\r${travail.fichier} : ${Math.round(progress * 100)} %`),
        });
        process.stdout.write('\n');
        await noter(`ok ${travail.fichier}`);
        resultats.push({ fichier, ok: true, message: null });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await noter(`échec ${travail.fichier} : ${message}`);
        resultats.push({ fichier, ok: false, message });
      }
    }
  } finally {
    await serveur.fermer();
  }

  if (!options.brouillon && options.cible === 'tout' && resultats.every(r => r.ok)) {
    await majStatutEpisode(dossier, 'rendu', null);
  }
  return resultats;
}

async function main(): Promise<void> {
  const { dossier, brouillon, cible } = lireArguments(process.argv.slice(2));
  const resultats = await rendreTournage(path.resolve(dossier), { brouillon, cible });
  for (const r of resultats) console.log(`${r.ok ? 'OK    ' : 'ÉCHEC '} ${path.basename(r.fichier)}${r.message ? ` : ${r.message}` : ''}`);
  process.exit(resultats.every(r => r.ok) ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => {
    console.error(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
