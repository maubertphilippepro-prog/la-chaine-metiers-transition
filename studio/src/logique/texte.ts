import type { Analyse, Coupe, Montage, Mot, NatureElement } from '../../../noyau/types';

export type ElementTexte =
  | { genre: 'mot'; mot: Mot; coupe: Coupe | null; terme: string | null; reperes: NatureElement[] }
  | { genre: 'trou'; coupe: Coupe };

// `index` est la position du chapitre dans montage.chapitres (pour les opérations d'édition).
export interface BlocChapitre {
  index: number;
  titre: string;
  debut: number;
  elements: ElementTexte[];
}

// Quand plusieurs coupes couvrent un mot : appliquée, puis en attente, puis rétablie.
function rang(c: Coupe): number {
  return c.active ? 0 : c.enAttente ? 1 : 2;
}

const milieu = (m: Mot) => (m.debut + m.fin) / 2;
const couvre = (p: { debut: number; fin: number }, t: number) => t >= p.debut && t <= p.fin;
const cle = (t: number) => Math.round(t * 1000);

export function construireTexte(analyse: Analyse, montage: Montage): BlocChapitre[] {
  const coupes = [...montage.coupes].sort((a, b) => rang(a) - rang(b));
  const termes = new Map<number, string>();
  for (const t of montage.termes) {
    if (t.statut === 'ecarte') continue;
    for (const o of t.occurrences) termes.set(cle(o), t.terme);
  }

  // Repères des éléments non écartés : natures des éléments qui couvrent le milieu du mot.
  const elements = montage.elements.filter(e => e.statut !== 'ecarte');

  const places: { t: number; element: ElementTexte }[] = analyse.mots.map(mot => ({
    t: mot.debut,
    element: {
      genre: 'mot',
      mot,
      coupe: coupes.find(c => couvre(c, milieu(mot))) ?? null,
      terme: termes.get(cle(mot.debut)) ?? null,
      reperes: [...new Set(elements.filter(e => couvre(e, milieu(mot))).map(e => e.nature))],
    },
  }));
  for (const coupe of montage.coupes) {
    if (!analyse.mots.some(m => couvre(coupe, milieu(m)))) places.push({ t: coupe.debut, element: { genre: 'trou', coupe } });
  }
  places.sort((a, b) => a.t - b.t);

  const chapitres = montage.chapitres.map((c, index) => ({ ...c, index })).sort((a, b) => a.debut - b.debut);
  return chapitres.map((c, i) => {
    const fin = chapitres[i + 1]?.debut ?? Infinity;
    return {
      index: c.index,
      titre: c.titre,
      debut: c.debut,
      elements: places.filter(p => p.t >= c.debut && p.t < fin).map(p => p.element),
    };
  });
}
