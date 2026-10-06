// Contrat de données partagé entre le pipeline Python, Remotion et le studio.
// Tous les temps sont en secondes, relatifs à source.mp4.

export interface Mot {
  id: number;
  texte: string;
  debut: number;
  fin: number;
}

export type TypeDetection = 'silence' | 'hesitation' | 'repetition';
export type TypeCoupe = TypeDetection | 'longueur' | 'manuelle';

export interface Detection {
  id: string;
  type: TypeDetection;
  debut: number;
  fin: number;
}

export interface SuggestionChapitre {
  titre: string;
  debut: number;
}

export interface SuggestionTerme {
  terme: string;
  definition: string;
  occurrences: number[];
  origine: 'glossaire' | 'ia';
}

export interface SuggestionLongueur {
  id: string;
  debut: number;
  fin: number;
  raison: string;
}

export interface Suggestions {
  chapitres: SuggestionChapitre[];
  termes: SuggestionTerme[];
  longueurs: SuggestionLongueur[];
}

export interface Analyse {
  version: 1;
  duree: number;
  fps: number;
  mots: Mot[];
  detections: Detection[];
  suggestions: Suggestions | null;
  erreurSuggestions: string | null;
}

export interface Coupe {
  id: string;
  type: TypeCoupe;
  debut: number;
  fin: number;
  active: boolean;
}

export interface Chapitre {
  titre: string;
  debut: number;
}

export type StatutTerme = 'a-valider' | 'valide' | 'ecarte';
export type PositionEncart = 'bas' | 'haut';

export interface Terme {
  terme: string;
  definition: string;
  occurrences: number[];
  statut: StatutTerme;
  position: PositionEncart;
}

export interface Montage {
  version: 1;
  titre: string;
  coupes: Coupe[];
  chapitres: Chapitre[];
  termes: Terme[];
}

export type StatutEpisode = 'analyse' | 'en-validation' | 'valide' | 'rendu' | 'erreur';

export interface Episode {
  version: 1;
  titre: string;
  statut: StatutEpisode;
  message: string | null;
}

export interface Segment {
  debut: number;
  fin: number;
}

export interface ReglagesCoupe {
  silenceConserve: number;
  margeMots: number;
  dureeMinCoupe: number;
  dureeMinSegment: number;
  fonduAudio: number;
}

export interface Reglages {
  detection: {
    silenceMin: number;
    hesitationMin: number;
    seuilSilenceDb: number;
    proportionVoiseeHesitation: number;
    repetitionMaxMots: number;
  };
  coupe: ReglagesCoupe;
  durees: { generique: number; encart: number; intertitre: number; cartonFin: number };
  charte: {
    rouge: string;
    bleu: string;
    bleuGris: string;
    blanc: string;
    police: string;
    logoCarre: string;
    logoHorizontal: string;
    logoCicad: string;
  };
  modeles: { whisper: string; claude: string };
  definitionMaxCaracteres: number;
}
