import { existsSync } from 'node:fs';
import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { montageInitial } from '../../noyau/montage-initial';
import type { Analyse, Montage, Reglages, StatutEpisode } from '../../noyau/types';

export const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export interface Tournage {
  dossier: string;
  nom: string;
  titre: string;
  analyse: Analyse;
  montage: Montage;
  reglages: Reglages;
}

async function lireJson<T>(chemin: string): Promise<T> {
  return JSON.parse(await readFile(chemin, 'utf-8')) as T;
}

export async function chargerTournage(dossier: string, options: { brouillon: boolean }): Promise<Tournage> {
  const nom = path.basename(dossier);
  const cheminAnalyse = path.join(dossier, 'analyse.json');
  if (!existsSync(cheminAnalyse)) throw new Error(`${nom} : analyse.json absent, lancez d'abord l'analyse.`);
  const analyse = await lireJson<Analyse>(cheminAnalyse);

  const cheminEpisode = path.join(dossier, 'episode.json');
  const episode = existsSync(cheminEpisode) ? await lireJson<{ titre?: string }>(cheminEpisode) : {};
  const titre = episode.titre ?? nom;

  const cheminMontage = path.join(dossier, 'montage.json');
  let montage: Montage;
  if (existsSync(cheminMontage)) montage = await lireJson<Montage>(cheminMontage);
  else if (options.brouillon) montage = montageInitial(analyse, titre);
  else throw new Error(`${nom} : montage.json absent. Validez le tournage dans le studio, ou utilisez --brouillon.`);

  const reglages = await lireJson<Reglages>(path.join(RACINE, 'reglages.json'));
  return { dossier, nom, titre, analyse, montage, reglages };
}

export async function majStatutEpisode(dossier: string, statut: StatutEpisode, message: string | null): Promise<void> {
  const chemin = path.join(dossier, 'episode.json');
  let episode: Record<string, unknown> = {};
  try {
    const lu: unknown = JSON.parse(await readFile(chemin, 'utf-8'));
    if (lu && typeof lu === 'object' && !Array.isArray(lu)) episode = lu as Record<string, unknown>;
  } catch {
    // absent ou illisible : on repart d'un épisode vide
  }
  const temporaire = `${chemin}.tmp`;
  await writeFile(temporaire, JSON.stringify({ ...episode, version: 1, statut, message }, null, 2), 'utf-8');
  await rename(temporaire, chemin);
}

export function urlSource(urlServeur: string, nom: string): string {
  return `${urlServeur}/${encodeURIComponent(nom)}/source.mp4`;
}
