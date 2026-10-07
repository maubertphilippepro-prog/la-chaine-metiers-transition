import reglagesJson from '../reglages.json';
import type { Reglages } from '../noyau/types';

const reglages: Reglages = reglagesJson;

export const charte = reglages.charte;
export const durees = reglages.durees;
export const LARGEUR = 1920;
export const HAUTEUR = 1080;
// Cadence des compositions d'habillage affichées seules dans le Studio.
export const FPS_HABILLAGE = 30;
export const NOIR_TEXTE = '#1d1d1b';
