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

// Écart (s) en dessous duquel deux coupes brutes forment une seule coupe : sinon chaque type applique sa marge et laisse
// entre elles un micro-segment de quelques dizaines de ms, audible comme un glitch.
const ECART_FUSION = 0.1;

// Regroupe les coupes actives qui se touchent, quel que soit leur type. Le bloc prend la marge d'entrée de la coupe qui
// commence en premier et la marge de sortie de celle qui finit en dernier.
function blocsDeCoupes(coupes: Coupe[], r: ReglagesCoupe, duree: number): Segment[] {
  const actives = coupes.filter(c => c.active).sort((a, b) => a.debut - b.debut);
  const ecart = r.ecartFusion ?? ECART_FUSION;
  const blocs: { entree: Coupe; sortie: Coupe }[] = [];
  for (const c of actives) {
    const dernier = blocs[blocs.length - 1];
    if (dernier && c.debut - dernier.sortie.fin <= ecart) {
      if (c.fin > dernier.sortie.fin) dernier.sortie = c;
    } else blocs.push({ entree: c, sortie: c });
  }
  return blocs
    .map(({ entree, sortie }) => {
      const debut = intervalleACouper({ ...entree, fin: Number.MAX_SAFE_INTEGER }, { ...r, dureeMinCoupe: 0 })!.debut;
      const fin = intervalleACouper({ ...sortie, debut: -1 }, { ...r, dureeMinCoupe: 0 }, duree)!.fin;
      return fin - debut < r.dureeMinCoupe ? null : { debut, fin };
    })
    .filter((i): i is Segment => i !== null);
}

export function calculerSegments(duree: number, coupes: Coupe[], r: ReglagesCoupe): Segment[] {
  const intervalles = blocsDeCoupes(coupes, r, duree)
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
