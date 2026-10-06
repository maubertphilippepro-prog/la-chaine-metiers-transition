import type { Analyse, Chapitre, Coupe, Montage, Terme } from './types';

export function montageInitial(analyse: Analyse, titre: string): Montage {
  const s = analyse.suggestions;

  const coupes: Coupe[] = [
    ...analyse.detections.map(d => ({ id: d.id, type: d.type, debut: d.debut, fin: d.fin, active: true })),
    ...(s?.longueurs ?? []).map(l => ({
      id: l.id, type: 'longueur' as const, debut: l.debut, fin: l.fin, active: false,
    })),
  ];

  const chapitres: Chapitre[] = s && s.chapitres.length > 0
    ? [...s.chapitres].sort((a, b) => a.debut - b.debut).map((c, i) => ({ titre: c.titre, debut: i === 0 ? 0 : c.debut }))
    : [{ titre, debut: 0 }];

  const termes: Terme[] = (s?.termes ?? []).map(t => ({
    terme: t.terme,
    definition: t.definition,
    occurrences: t.occurrences,
    statut: t.origine === 'glossaire' ? 'valide' : 'a-valider',
    position: 'bas',
  }));

  return { version: 1, titre, coupes, chapitres, termes };
}
