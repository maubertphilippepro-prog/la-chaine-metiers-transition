import type { Montage } from './types';

// Conditions du rendu final (spec §7) : chaque problème est une phrase affichée telle quelle.
export function verifierAvantRendu(m: Montage, definitionMax: number): string[] {
  const problemes: string[] = [];
  if (!m.titre.trim()) problemes.push('La vidéo complète n’a pas de titre.');
  m.chapitres.forEach((c, i) => {
    if (!c.titre.trim()) problemes.push(`Le chapitre ${i + 1} n’a pas de titre.`);
  });
  for (const t of m.termes) {
    if (t.statut === 'a-valider') problemes.push(`Le terme « ${t.terme} » n’est ni validé ni écarté.`);
    else if (t.statut === 'valide' && !t.definition.trim()) problemes.push(`La définition de « ${t.terme} » est vide.`);
    else if (t.statut === 'valide' && t.definition.length > definitionMax) {
      problemes.push(`La définition de « ${t.terme} » dépasse ${definitionMax} caractères.`);
    }
  }
  const enAttente = m.coupes.filter(c => c.enAttente).length;
  if (enAttente > 0) problemes.push(`${enAttente} suggestion(s) de longueur en attente.`);
  return problemes;
}
