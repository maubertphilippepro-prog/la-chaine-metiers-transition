import type { Coupe, ReglagesCoupe, Segment } from './types';

// Un silence garde sa demi-marge seulement du côté de la parole, pas contre 0 ni contre la durée.
// Une prise ratée part un peu avant son « action » et laisse une respiration avant la reprise.
export function intervalleACouper(coupe: Coupe, r: ReglagesCoupe, duree?: number): Segment | null {
  let debut = coupe.debut;
  let fin = coupe.fin;
  if (coupe.type === 'silence') {
    if (debut > 0) debut += r.silenceConserve / 2;
    if (duree === undefined || fin < duree) fin -= r.silenceConserve / 2;
  } else if (coupe.type === 'prise') {
    debut -= r.margeMots;
    if (duree === undefined || fin < duree) fin -= r.silenceConserve / 2;
  } else if (coupe.type === 'hesitation') {
    debut += r.margeMots;
    fin -= r.margeMots;
  }
  if (fin - debut < r.dureeMinCoupe) return null;
  return { debut, fin };
}

export function calculerSegments(duree: number, coupes: Coupe[], r: ReglagesCoupe): Segment[] {
  const intervalles = coupes
    .filter(c => c.active)
    .map(c => intervalleACouper(c, r, duree))
    .filter((i): i is Segment => i !== null)
    .map(i => ({ debut: Math.max(0, i.debut), fin: Math.min(duree, i.fin) }))
    .filter(i => i.fin > i.debut)
    .sort((a, b) => a.debut - b.debut);

  const fusionnes: Segment[] = [];
  for (const i of intervalles) {
    const dernier = fusionnes[fusionnes.length - 1];
    if (dernier && i.debut <= dernier.fin) dernier.fin = Math.max(dernier.fin, i.fin);
    else fusionnes.push({ ...i });
  }

  const segments: Segment[] = [];
  let curseur = 0;
  for (const i of fusionnes) {
    if (i.debut - curseur >= r.dureeMinSegment) segments.push({ debut: curseur, fin: i.debut });
    curseur = i.fin;
  }
  if (duree - curseur >= r.dureeMinSegment) segments.push({ debut: curseur, fin: duree });
  return segments;
}
