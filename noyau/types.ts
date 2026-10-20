// Contrat de données partagé entre le pipeline Python, Remotion et le studio.
// Tous les temps sont en secondes, relatifs à source.mp4.

export interface Mot {
  id: number;
  texte: string;
  debut: number;
  fin: number;
}

export type TypeDetection = 'silence' | 'hesitation' | 'repetition' | 'prise';
export type TypeCoupe = TypeDetection | 'longueur' | 'manuelle';

export interface Detection {
  id: string;
  type: TypeDetection;
  debut: number;
  fin: number;
  // Mots entendus à la réécoute d'une hésitation : la coupe n'est pas active par défaut.
  paroles?: string;
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

// Rectangle en pixels de source.mp4 (1920×1080).
export interface Zone {
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
}

export type NatureElement = 'zoom' | 'miseEnAvant' | 'texte' | 'camera';
export type PositionTexte = 'haut-gauche' | 'haut-droite' | 'centre' | 'bas-centre';
export type StatutElement = 'a-valider' | 'valide' | 'ecarte';

// Élément posé sur la vidéo pendant un passage de la source.
// `zone: null` n'existe que pour une suggestion de l'analyse pas encore complétée.
export type ElementEcran = { id: string; debut: number; fin: number; statut: StatutElement } & (
  | { nature: 'zoom'; zone: Zone | null }
  | { nature: 'miseEnAvant'; zone: Zone | null }
  | { nature: 'texte'; texte: string; position: PositionTexte }
  | { nature: 'camera' }
);

// Suggestion de l'analyse ; sa raison reste lisible dans le studio par l'id.
export interface SuggestionElement {
  id: string;
  nature: 'zoom' | 'miseEnAvant' | 'texte';
  debut: number;
  fin: number;
  texte?: string;
  raison: string;
}

export interface Suggestions {
  chapitres: SuggestionChapitre[];
  termes: SuggestionTerme[];
  longueurs: SuggestionLongueur[];
  // Absent dans une analyse faite avant les éléments à l'écran : aucune suggestion.
  elements?: SuggestionElement[];
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
  // Suggestion de longueur pas encore acceptée ni refusée.
  enAttente?: boolean;
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
  elements: ElementEcran[];
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
    hesitationTranscriteMin: number;
    seuilSilenceDb: number;
    proportionVoiseeHesitation: number;
    repetitionMaxMots: number;
    prolongementMotMax: number;
    pauseMotCle: number;
  };
  coupe: ReglagesCoupe;
  durees: { generique: number; encart: number; intertitre: number; cartonFin: number };
  charte: {
    rouge: string;
    bleu: string;
    bleuGris: string;
    blanc: string;
    police: string;
    nomChaine: string;
  };
  // Fichiers relatifs au dossier public/, volumes entre 0 et 1.
  audio: { jingle: string; tapis: string; volumeJingle: number; volumeTapis: number };
  // Position de la vignette caméra dans la source, en pixels.
  camera: Zone;
  elements: { texteMaxCaracteres: number; dureeMin: number; zoomLargeurMin: number };
  // Limites de YouTube et mots refusés dans les textes d'une vidéo publique.
  publication: {
    titreMax: number;
    descriptionMax: number;
    tagsMax: number;
    vignetteOctetsMax: number;
    mentionsInterdites: string[];
  };
  modeles: { whisper: string; claude: string; detourage: string };
  definitionMaxCaracteres: number;
}
