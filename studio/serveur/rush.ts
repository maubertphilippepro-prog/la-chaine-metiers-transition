import { existsSync, readFileSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import path from 'node:path';
import type { EtapeInsertion } from '../commun';
import { ErreurHttp } from './http';
import { avecEnvoi, ecrireEnFlux, etapeAnalyse, nomVideoDemande } from './nouveau-tournage';

// Rushs déposés, et dossiers de travail rushs/<N>/ du pipeline.
export const DOSSIER_RUSHS = 'rushs';
export const TITRE_RUSH_PAR_DEFAUT = 'Nouveau chapitre';

export interface DemandeRush {
  fichier: string;
  t: number;
  titre: string;
}

// Rush envoyé par le studio, écrit en flux dans rushs/ (jamais dans bruts/, que la préparation concatène) ;
// un nom déjà pris reçoit -2, -3…
export async function deposerRush(req: IncomingMessage, dossier: string): Promise<string> {
  const fichier = nomVideoDemande(req);
  return avecEnvoi(dossier, async () => {
    const rushs = path.join(dossier, DOSSIER_RUSHS);
    const { name, ext } = path.parse(fichier);
    let nom = fichier;
    for (let n = 2; existsSync(path.join(rushs, nom)); n++) nom = `${name}-${n}${ext}`;
    await ecrireEnFlux(req, rushs, nom);
    return nom;
  });
}

export function lireDemandeRush(corps: unknown, duree: number): DemandeRush {
  const c = corps && typeof corps === 'object' ? (corps as Record<string, unknown>) : {};
  const fichier = typeof c.fichier === 'string' ? c.fichier : '';
  if (!fichier || path.basename(fichier) !== fichier || fichier.startsWith('.')) {
    throw new ErreurHttp(400, 'fichier attendu : le nom du rush déposé dans rushs/.');
  }
  if (typeof c.t !== 'number' || !Number.isFinite(c.t)) throw new ErreurHttp(400, 't attendu : un instant en secondes.');
  if (c.t < 0 || c.t > duree) throw new ErreurHttp(409, `L’instant ${c.t} s sort de la vidéo (0 à ${duree} s).`);
  const titre = typeof c.titre === 'string' && c.titre.trim() ? c.titre.trim() : TITRE_RUSH_PAR_DEFAUT;
  return { fichier, t: c.t, titre };
}

function rushsInseres(dossier: string): Record<string, unknown>[] {
  try {
    const p = JSON.parse(readFileSync(path.join(dossier, 'preparation.json'), 'utf-8')) as { rushs?: unknown };
    return Array.isArray(p.rushs) ? (p.rushs as Record<string, unknown>[]) : [];
  } catch {
    return [];
  }
}

// Le pipeline analyse le rush dans rushs/<N>/ (N : rang de l'insertion en cours) ; son analyse.json écrit,
// il reconstruit la vidéo.
export function etapeInsertion(dossier: string): EtapeInsertion {
  const travail = path.join(dossier, DOSSIER_RUSHS, String(rushsInseres(dossier).length + 1));
  return existsSync(path.join(travail, 'analyse.json')) ? 'reconstruction' : etapeAnalyse(travail);
}

// Raison pour laquelle le dernier rush inséré n'a pas de suggestions de Claude, ou null.
export function avertissementInsertion(dossier: string): string | null {
  const erreur = rushsInseres(dossier).at(-1)?.erreurSuggestions;
  return typeof erreur === 'string' ? erreur : null;
}

const STATUTS_ENGAGES = ['prete', 'envoyee-youtube', 'relayee'];

// Une vidéo du tournage est déjà prête ou envoyée (publication.json lu sans le valider).
export function publicationEngagee(dossier: string): boolean {
  try {
    const p = JSON.parse(readFileSync(path.join(dossier, 'publication.json'), 'utf-8')) as { videos?: unknown };
    return Array.isArray(p.videos) && p.videos.some(v => STATUTS_ENGAGES.includes((v as { statut?: string })?.statut ?? ''));
  } catch {
    return false;
  }
}
