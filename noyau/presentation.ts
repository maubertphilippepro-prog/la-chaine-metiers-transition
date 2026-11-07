import { nomCible, type CiblePublication } from './publication';

// Texte de présentation de la vidéo sur la page SharePoint « Chaîne M&T » : accroche, ligne de tags, description.
export interface Presentation {
  titre: string;
  // Sujets (outil, thème) ; la durée et le nombre de vidéos sont ajoutés par lignePresentation.
  tags: string[];
  description: string;
}

export const PRESENTATION_VIDE: Presentation = { titre: '', tags: [], description: '' };
export const TITRE_MOTS_MAX = 10;

export const fichierPresentation = (c: CiblePublication) => `publication/${nomCible(c)}/sharepoint/presentation.json`;

export function dureeMinutes(secondes: number): string {
  const minutes = Math.max(1, Math.round(secondes / 60));
  return `${minutes} minute${minutes > 1 ? 's' : ''}`;
}

// « Mindra (powered by There.do) • 10 minutes • 1 vidéo »
export function lignePresentation(p: Presentation, dureeSecondes: number): string {
  return [...p.tags.map(t => t.trim()).filter(Boolean), dureeMinutes(dureeSecondes), '1 vidéo'].join(' • ');
}

export const motsTitre = (titre: string) => titre.trim().split(/\s+/).filter(Boolean).length;

// Texte complet prêt à coller dans SharePoint.
export const textePresentation = (p: Presentation, dureeSecondes: number) =>
  `${p.titre.trim()}\n${lignePresentation(p, dureeSecondes)}\n\n${p.description.trim()}\n`;

export function lirePresentation(v: unknown): Presentation {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return {
    titre: typeof o.titre === 'string' ? o.titre : '',
    tags: Array.isArray(o.tags) ? o.tags.filter((t): t is string => typeof t === 'string') : [],
    description: typeof o.description === 'string' ? o.description : '',
  };
}
