import type { FichierConsignes } from '../noyau/consignes';
import type { Analyse, Montage, Reglages, StatutEpisode } from '../noyau/types';
import type { ResultatRendu } from '../remotion/scripts/rendu';
import type { CiblePublication, Publication, ReglagesPublication } from '../noyau/publication';
import type { ChapitreYoutube } from '../noyau/publication-textes';
import type { LectureYoutube, TextesYoutube } from '../noyau/youtube';
import type { ReferencesSite } from './serveur/site-replit';

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
  // consignes.json, ou aucune consigne tant qu'il n'existe pas.
  consignes: FichierConsignes;
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

export interface VideoDisponible {
  cible: CiblePublication;
  titre: string;
  fichier: string;          // nom du rendu dans rendus/
  rendue: boolean;
  dureeSecondes: number;
  chapitres: ChapitreYoutube[];
}
export interface Pose { fichier: string; url: string }   // url : PNG détouré
export interface Logo { fichier: string; url: string }

export interface DetailPublication {
  nom: string;
  titre: string;
  sourceUrl: string;
  urlTournage: string;      // sert le dossier du tournage (images, vignettes)
  urlPoses: string;
  urlLogos: string;
  logos: Logo[];            // banque donnees/logos/
  captures: string[];       // fichiers de captures/ du tournage
  publication: Publication;
  videos: VideoDisponible[];
  camera: string | null;    // nom du fichier caméra dans bruts/
  site: ReferencesSite | null;
  urlSite: string | null;   // adresse du site, pour ouvrir une vidéo relayée
  reglages: ReglagesPublication;
}
// Dossier « Préparer pour YouTube » : chemins absolus ; rendu est la vidéo placée dans le dossier.
export interface DossierYoutube {
  dossier: string;
  rendu: string;
  textes: TextesYoutube;
}
export interface VerificationYoutube {
  lecture: LectureYoutube;
  alerte: boolean;
  message: string;
}
