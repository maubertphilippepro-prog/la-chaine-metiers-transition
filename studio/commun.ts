import type { Analyse, Montage, Reglages, StatutEpisode } from '../noyau/types';
import type { ResultatRendu } from '../remotion/scripts/rendu';

// Données échangées entre le serveur du studio et l'interface.

export interface ResumeTournage {
  nom: string;
  titre: string;
  statut: StatutEpisode | null;
  message: string | null;
  analyseFaite: boolean;
}

export interface DetailTournage extends ResumeTournage {
  analyse: Analyse;
  // montage.json, ou le montage par défaut tant qu'il n'a jamais été enregistré.
  montage: Montage;
  montageEnregistre: boolean;
  reglages: Reglages;
  sourceUrl: string;
}

// Les fichiers sont désignés par leur nom seul (episode-01-intro.mp4).
export interface EtatRendu {
  nom: string | null;
  enCours: boolean;
  fichier: string | null;
  progression: number;
  resultats: ResultatRendu[];
  erreur: string | null;
}
