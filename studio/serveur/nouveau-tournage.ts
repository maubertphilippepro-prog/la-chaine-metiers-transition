import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { ecrireJson, ErreurHttp } from './http';

const LONGUEUR_MAX = 50;

// « Métiers & Transition : l’été ! » → « metiers-transition-l-ete ».
export function simplifierTitre(titre: string): string {
  const simple = titre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return simple.slice(0, LONGUEUR_MAX).replace(/-+$/, '') || 'tournage';
}

function lireDemandeCreation(corps: unknown): { titre: string; date: string } {
  const c = corps && typeof corps === 'object' ? (corps as Record<string, unknown>) : {};
  const titre = typeof c.titre === 'string' ? c.titre.trim() : '';
  if (!titre) throw new ErreurHttp(400, 'Le titre est vide.');
  const date = typeof c.date === 'string' ? c.date : '';
  const jour = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(jour.getTime()) || jour.toISOString().slice(0, 10) !== date) {
    throw new ErreurHttp(400, 'date attendue : AAAA-MM-JJ.');
  }
  return { titre, date };
}

// Crée <date>-<titre simplifié>/bruts/ (suffixe -2, -3… si le nom est pris) ; renvoie le nom du dossier.
export async function creerTournage(racine: string, corps: unknown): Promise<string> {
  const { titre, date } = lireDemandeCreation(corps);
  const base = `${date}-${simplifierTitre(titre)}`;
  await mkdir(racine, { recursive: true });
  for (let n = 1; ; n++) {
    const nom = n === 1 ? base : `${base}-${n}`;
    const dossier = path.join(racine, nom);
    try {
      await mkdir(dossier);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST') continue;
      throw e;
    }
    await mkdir(path.join(dossier, 'bruts'));
    // Le titre reste disponible pour « Analyser » si l’envoi de la vidéo échoue.
    await ecrireJson(path.join(dossier, 'episode.json'), { version: 1, titre, statut: null, message: null });
    return nom;
  }
}
