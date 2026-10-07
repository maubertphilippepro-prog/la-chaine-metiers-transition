import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { decisionsEpisodes, decisionsVideoComplete } from '../../noyau/decisions';
import { demarrerServeur } from './serveur-fichiers';
import { chargerTournage, RACINE, urlSource } from './tournage';

// Usage : npm run apercu -- <dossier du tournage> [complete|<numéro d'épisode>]
async function main(): Promise<void> {
  const [dossierArg, choix = '1'] = process.argv.slice(2);
  if (!dossierArg) {
    console.error("Usage : npm run apercu -- <dossier du tournage> [complete|<numéro d'épisode>]");
    process.exit(1);
  }
  const dossier = path.resolve(dossierArg);
  const t = await chargerTournage(dossier, { brouillon: true });
  const serveur = await demarrerServeur(path.dirname(dossier));
  const source = urlSource(serveur.url, t.nom);

  let composition: string;
  let props: Record<string, unknown>;
  if (choix === 'complete') {
    composition = 'VideoComplete';
    props = { decisions: decisionsVideoComplete(t.analyse, t.montage, t.reglages, source) };
  } else {
    const episodes = decisionsEpisodes(t.analyse, t.montage, t.reglages, source);
    const decisions = episodes[Number(choix) - 1];
    if (!decisions) {
      console.error(`Épisode ${choix} introuvable (${episodes.length} épisode(s)).`);
      await serveur.fermer();
      process.exit(1);
    }
    composition = 'Episode';
    props = { decisions };
  }

  const fichierProps = path.join(os.tmpdir(), `pmt-apercu-${process.pid}.json`);
  await writeFile(fichierProps, JSON.stringify(props), 'utf-8');
  console.log(`source.mp4 servi sur ${serveur.url}. Dans Remotion Studio, ouvrez la composition « ${composition} ».`);

  const cli = path.join(RACINE, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
  const studio = spawn(process.execPath, [cli, 'studio', path.join(RACINE, 'remotion', 'index.ts'), `--props=${fichierProps}`], {
    stdio: 'inherit',
    cwd: RACINE,
  });
  studio.on('exit', async code => {
    await serveur.fermer();
    process.exit(code ?? 0);
  });
}

main().catch(e => {
  console.error(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
