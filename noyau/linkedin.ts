import { nomCible, type CiblePublication } from './publication';

// Post LinkedIn d'une vidéo Pro, d'après le skill post-linkedin : un post par profil, jamais deviné.
export type ProfilLinkedin = 'personnel' | 'cicad';
export const PROFILS_LINKEDIN: ProfilLinkedin[] = ['personnel', 'cicad'];

// Les quatre questions du brief du skill, posées une fois pour toutes les versions.
export interface BriefLinkedin {
  objectif: string;
  cta: string;
  elements: string;
  visuel: string;
}

export const BRIEF_VIDE: BriefLinkedin = { objectif: '', cta: '', elements: '', visuel: '' };

export const dossierLinkedin = (c: CiblePublication) => `publication/${nomCible(c)}/linkedin`;
export const fichierPost = (p: ProfilLinkedin) => `post-${p}.txt`;

export function lireProfils(valeur: unknown): ProfilLinkedin[] {
  const profils = Array.isArray(valeur) ? PROFILS_LINKEDIN.filter(p => valeur.includes(p)) : [];
  if (profils.length === 0) throw new Error('Choisissez au moins un profil : personnel ou CICAD.');
  return profils;
}
