import { propositionsEnAttente, type Consigne } from './consignes';
import { problemesElements, ZONE_A_TRACER, type ReglagesElements } from './elements';
import type { Analyse, Montage, Reglages } from './types';

export type ReglagesRendu = Pick<Reglages, 'definitionMaxCaracteres'> & ReglagesElements;

// Conditions du rendu final (spec §7) : chaque problème est une phrase affichée telle quelle.
export function verifierAvantRendu(analyse: Analyse, m: Montage, r: ReglagesRendu, consignes: Consigne[] = []): string[] {
  const definitionMax = r.definitionMaxCaracteres;
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
  const aValider = m.elements.filter(e => e.statut === 'a-valider');
  if (aValider.length > 0) problemes.push(`${aValider.length} élément(s) à l’écran à valider.`);
  for (const e of aValider) {
    if ((e.nature === 'zoom' || e.nature === 'miseEnAvant') && e.zone === null) problemes.push(`Élément ${e.id} : ${ZONE_A_TRACER}`);
  }
  for (const p of problemesElements(analyse, m, r)) problemes.push(`Élément ${p.id} : ${p.probleme}`);
  const propositions = propositionsEnAttente(consignes);
  if (propositions > 0) problemes.push(`Consigne : ${propositions} proposition(s) en attente.`);
  return problemes;
}
