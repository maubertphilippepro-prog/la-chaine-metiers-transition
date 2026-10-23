import { EXTENSIONS_VIDEO, type EtapeAnalyse, type ResumeTournage } from '../../commun';

export const LIBELLES_ETAPE: Record<EtapeAnalyse, string> = {
  preparation: 'Préparation de la vidéo',
  transcription: 'Transcription',
  detections: 'Repérage des coupes',
  suggestions: 'Suggestions de Claude',
};

const LISTE_EXTENSIONS = `${EXTENSIONS_VIDEO.slice(0, -1).join(', ')} ou ${EXTENSIONS_VIDEO[EXTENSIONS_VIDEO.length - 1]}`;

// Message de refus, ou null pour une vidéo que le pipeline sait lire.
export function raisonFichierVideo(nom: string): string | null {
  const point = nom.lastIndexOf('.');
  const extension = point >= 0 ? nom.slice(point).toLowerCase() : '';
  return EXTENSIONS_VIDEO.includes(extension) ? null : `« ${nom} » n’est pas une vidéo ${LISTE_EXTENSIONS}.`;
}

// Date du jour en heure locale, au format AAAA-MM-JJ.
export function aujourdhui(d: Date = new Date()): string {
  const deux = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;
}

// Titre proposé pour « Analyser » : celui d'episode.json, sinon le nom du dossier sans la date.
export const titreParDefaut = (t: Pick<ResumeTournage, 'nom' | 'titre'>) =>
  t.titre !== t.nom ? t.titre : t.nom.replace(/^\d{4}-\d{2}-\d{2}-/, '');

export type EtatTournage = 'en-cours' | 'analyse' | 'erreur' | 'a-analyser' | 'video-manquante';

// Ce que la liste montre d'un tournage. Un tournage analysé garde le comportement actuel, même après un rendu en échec.
export function etatTournage(t: ResumeTournage): EtatTournage {
  if (t.analyseEnCours) return 'en-cours';
  if (t.analyseFaite) return 'analyse';
  if (t.statut === 'erreur') return 'erreur';
  return t.videoPresente ? 'a-analyser' : 'video-manquante';
}
