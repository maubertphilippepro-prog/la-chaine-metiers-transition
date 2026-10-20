import reglagesJson from '../reglages.json';
import type { Reglages } from '../noyau/types';

const reglages: Reglages = reglagesJson;

export const charte = reglages.charte;
export const durees = reglages.durees;
export const audio = reglages.audio;
// Vignette caméra dans la source, d'après la scène OBS.
export const camera = reglages.camera;
export const LARGEUR = 1920;
export const HAUTEUR = 1080;
// Cadence des compositions d'habillage affichées seules dans le Studio.
export const FPS_HABILLAGE = 30;
export const NOIR_TEXTE = '#1d1d1b';
// Épaisseur de la frise posée en bas de la vidéo, et hauteur du logo posé dans le coin bas droit.
export const FRISE = 14;
export const HAUTEUR_LOGO_VIDEO = 90;
