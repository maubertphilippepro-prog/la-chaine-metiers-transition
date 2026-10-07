import { bundle } from '@remotion/bundler';
import { ensureBrowser, renderMedia, selectComposition } from '@remotion/renderer';
import { appendFile, mkdir, rename, rm } from 'node:fs/promises';
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

// Moteur de rendu injectable, pour tester l'enchaînement sans rendre réellement.
export interface Dependances {
  renderMedia: typeof renderMedia;
  selectComposition: typeof selectComposition;
  bundle: typeof bundle;
  ensureBrowser: typeof ensureBrowser;
}

const DEPENDANCES: Dependances = { renderMedia, selectComposition, bundle, ensureBrowser };

export interface OptionsRendu {
  brouillon: boolean;
  cible: Cible;
  onProgression?: (fichier: string, progression: number) => void;
}

// Chaque rendu passe par un fichier temporaire : un échec laisse intact le rendu précédent.
export async function rendreTournage(
  dossier: string, options: OptionsRendu, dependances: Dependances = DEPENDANCES,
): Promise<ResultatRendu[]> {
  const { renderMedia, selectComposition, bundle, ensureBrowser } = dependances;
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
      const temporaire = fichier.replace(/\.mp4$/, '.tmp.mp4');
      try {
        await noter(`début ${travail.fichier}${options.brouillon ? ' (brouillon)' : ''}`);
        const composition = await selectComposition({ serveUrl, id: travail.composition, inputProps: travail.props });
        await renderMedia({
          composition,
          serveUrl,
          codec: 'h264',
          outputLocation: temporaire,
          inputProps: travail.props,
          onProgress: ({ progress }) => options.onProgression?.(fichier, progress),
        });
        await rename(temporaire, fichier);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await rm(temporaire, { force: true });
        resultats.push({ fichier, ok: false, message });
        await noter(`échec ${travail.fichier} : ${message}`).catch(() => undefined);
        continue;
      }
      resultats.push({ fichier, ok: true, message: null });
      await noter(`ok ${travail.fichier}`).catch(() => undefined);
    }
  } finally {
    await serveur.fermer();
  }

  const echecs = resultats.filter(r => !r.ok);
  if (!options.brouillon && echecs.length > 0) {
    const noms = echecs.map(r => path.basename(r.fichier)).join(', ');
    await majStatutEpisode(dossier, 'erreur', `${echecs.length} rendu(s) en échec : ${noms}`);
  } else if (!options.brouillon && options.cible === 'tout') {
    await majStatutEpisode(dossier, 'rendu', null);
  }
  return resultats;
}

async function main(): Promise<void> {
  const { dossier, brouillon, cible } = lireArguments(process.argv.slice(2));
  let enCours: string | null = null;
  const onProgression = (fichier: string, progression: number) => {
    if (enCours !== null && enCours !== fichier) process.stdout.write('\n');
    enCours = fichier;
    process.stdout.write(`\r${path.basename(fichier)} : ${Math.round(progression * 100)} %`);
  };
  let resultats: ResultatRendu[];
  try {
    resultats = await rendreTournage(path.resolve(dossier), { brouillon, cible, onProgression });
  } finally {
    if (enCours !== null) process.stdout.write('\n');
  }
  for (const r of resultats) console.log(`${r.ok ? 'OK    ' : 'ÉCHEC '} ${path.basename(r.fichier)}${r.message ? ` : ${r.message}` : ''}`);
  process.exit(resultats.every(r => r.ok) ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => {
    console.error(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
