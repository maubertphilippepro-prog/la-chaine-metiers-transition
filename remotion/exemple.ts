import reglagesJson from '../reglages.json';
import { dureesHabillage, type DecisionsEpisode, type DecisionsVideoComplete } from '../noyau/decisions';
import type { Reglages } from '../noyau/types';
import { FPS_HABILLAGE } from './charte';

// Décisions sans vidéo : le Studio affiche l'habillage seul tant qu'aucun tournage n'est chargé (voir `npm run apercu`).
const reglages: Reglages = reglagesJson;
const durees = dureesHabillage(reglages, FPS_HABILLAGE);

export const exempleEpisode: DecisionsEpisode = {
  fps: FPS_HABILLAGE,
  sourceUrl: '',
  titre: "Titre de l'épisode",
  partie: { titre: '', segments: [], encarts: [], encartsRetires: [], elements: [], duree: 0 },
  durees,
};

export const exempleVideoComplete: DecisionsVideoComplete = {
  fps: FPS_HABILLAGE,
  sourceUrl: '',
  titre: 'Titre de la vidéo',
  parties: [],
  durees,
};
