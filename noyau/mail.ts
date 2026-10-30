import { nomCible, type CiblePublication } from './publication';
import type { Nature } from './qualification';
import type { Reglages } from './types';

// Suivi du mail de com d'une vidéo, dans publication/<cible>/mail/etat.json.
export interface EtatMail {
  urlSharepoint: string | null;
  copieLe: string | null;
  redigeLe: string | null;
  construitLe: string | null;
  brouillonLe: string | null;
}

export const ETAT_MAIL_VIDE: EtatMail = { urlSharepoint: null, copieLe: null, redigeLe: null, construitLe: null, brouillonLe: null };

export const A_COMPLETER = '[À COMPLÉTER]';

export const dossierMail = (c: CiblePublication) => `publication/${nomCible(c)}/mail`;

export const fichierSharepoint = (nomTournage: string, fichierRendu: string) => `${nomTournage}-${fichierRendu}`;

// Adresse de lecture Stream, de la forme copiée dans la barre d'adresse : chemin entièrement encodé, « - » et « . » compris.
export function urlSharepoint(s: Reglages['sharepoint'], fichier: string): string {
  const cheminSite = new URL(s.site).pathname.replace(/\/$/, '');
  const id = encodeURIComponent(`${cheminSite}/${s.bibliotheque}/${fichier}`).replace(/-/g, '%2D').replace(/\./g, '%2E');
  return `${s.site.replace(/\/$/, '')}/_layouts/15/stream.aspx?id=${id}`;
}

export function raisonMail(nature: Nature, rendue: boolean): string | null {
  if (nature !== 'pro') return 'Le mail de com est réservé aux vidéos Pro.';
  if (!rendue) return 'Le rendu de la vidéo est absent.';
  return null;
}

export function brouillonPossible(e: EtatMail, modifieLe: number | null): boolean {
  return e.construitLe !== null && modifieLe !== null && modifieLe <= Date.parse(e.construitLe);
}
