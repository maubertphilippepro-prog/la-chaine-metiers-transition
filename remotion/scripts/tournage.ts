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

// `libelle` (« <tournage>/<fichier> ») sert aux messages d'erreur.
async function lireJson(chemin: string, libelle: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(chemin, 'utf-8'));
  } catch (e) {
    throw new Error(`${libelle} illisible : ${e instanceof Error ? e.message : String(e)}`);
  }
}

function estObjet(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function raisonAnalyse(a: unknown): string | null {
  if (!estObjet(a)) return 'objet attendu';
  if (a.version !== 1) return 'version 1 attendue';
  if (typeof a.duree !== 'number' || !(a.duree > 0)) return 'duree positive attendue';
  if (typeof a.fps !== 'number' || !(a.fps > 0)) return 'fps positif attendu';
  if (!Array.isArray(a.mots)) return 'mots doit être une liste';
  if (!Array.isArray(a.detections)) return 'detections doit être une liste';
  return null;
}

export function raisonMontage(m: unknown): string | null {
  if (!estObjet(m)) return 'objet attendu';
  if (m.version !== 1) return 'version 1 attendue';
  if (typeof m.titre !== 'string') return 'titre doit être un texte';
  for (const champ of ['coupes', 'chapitres', 'termes']) {
    if (!Array.isArray(m[champ])) return `${champ} doit être une liste`;
  }
  // Absent dans un montage enregistré avant les éléments à l'écran.
  if (m.elements !== undefined && !Array.isArray(m.elements)) return 'elements doit être une liste';
  return null;
}

async function lireValide<T>(chemin: string, libelle: string, raison: (v: unknown) => string | null): Promise<T> {
  const valeur = await lireJson(chemin, libelle);
  const probleme = raison(valeur);
  if (probleme) throw new Error(`${libelle} invalide : ${probleme}`);
  return valeur as T;
}

export async function chargerTournage(dossier: string, options: { brouillon: boolean }): Promise<Tournage> {
  const nom = path.basename(dossier);
  const cheminAnalyse = path.join(dossier, 'analyse.json');
  if (!existsSync(cheminAnalyse)) throw new Error(`${nom} : analyse.json absent, lancez d'abord l'analyse.`);
  const analyse = await lireValide<Analyse>(cheminAnalyse, `${nom}/analyse.json`, raisonAnalyse);

  const cheminEpisode = path.join(dossier, 'episode.json');
  const episode = existsSync(cheminEpisode) ? await lireJson(cheminEpisode, `${nom}/episode.json`) : null;
  const titre = estObjet(episode) && typeof episode.titre === 'string' ? episode.titre : nom;

  const cheminMontage = path.join(dossier, 'montage.json');
  let montage: Montage;
  if (existsSync(cheminMontage)) {
    const lu = await lireValide<Montage>(cheminMontage, `${nom}/montage.json`, raisonMontage);
    montage = { ...lu, elements: lu.elements ?? [] };
  }
  else if (options.brouillon) montage = montageInitial(analyse, titre);
  else throw new Error(`${nom} : montage.json absent. Validez le tournage dans le studio, ou utilisez --brouillon.`);

  const reglages = (await lireJson(path.join(RACINE, 'reglages.json'), 'reglages.json')) as Reglages;
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
