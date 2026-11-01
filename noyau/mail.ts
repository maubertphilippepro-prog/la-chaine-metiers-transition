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

// SharePoint affiche le nom du fichier au-dessus de la vignette : on reprend le titre, sans les caractères interdits.
export function fichierSharepoint(titre: string): string {
  const nom = titre.replace(/[\/:*?"<>|#%~&{}]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 120).trim();
  return `${nom || 'Vidéo'}.mp4`;
}

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

// Retouche ponctuelle du HTML construit : chaque « avant » doit figurer une seule fois, pour ne rien toucher d'autre.
export interface Remplacement {
  avant: string;
  apres: string;
}

export function appliquerRetouches(html: string, remplacements: Remplacement[]): string {
  const introuvables = remplacements.filter(r => r.avant === '' || html.split(r.avant).length !== 2);
  if (introuvables.length > 0) {
    throw new Error(`${introuvables.length} morceau(x) introuvable(s) ou présent(s) plusieurs fois dans le HTML : rien n'a été modifié.`);
  }
  return remplacements.reduce((h, r) => h.replace(r.avant, () => r.apres), html);
}

// preview.html est mail.html avec les images servies par fichier plutôt que par pièce jointe (comme build_mail.py).
export const apercuDepuisMail = (html: string, images: { cid: string; file: string }[]) =>
  images.reduce((h, im) => h.split(`src="cid:${im.cid}"`).join(`src="${im.file}"`), html);
