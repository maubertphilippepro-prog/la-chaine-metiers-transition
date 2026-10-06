import { sourceVersMonte } from './temps';
import type { Chapitre, PositionEncart, Segment, Terme } from './types';

export interface Plage {
  titre: string;
  debut: number;
  fin: number;
}

export interface EncartPlace {
  terme: string;
  definition: string;
  position: PositionEncart;
  debut: number;
}

export function plagesEpisodes(chapitres: Chapitre[], duree: number): Plage[] {
  const tries = [...chapitres].sort((a, b) => a.debut - b.debut);
  return tries.map((c, i) => ({
    titre: c.titre,
    debut: c.debut,
    fin: tries[i + 1]?.debut ?? duree,
  }));
}

export function decouperSegments(segments: Segment[], plage: { debut: number; fin: number }): Segment[] {
  return segments
    .map(s => ({ debut: Math.max(s.debut, plage.debut), fin: Math.min(s.fin, plage.fin) }))
    .filter(s => s.fin > s.debut);
}

function estConserve(t: number, segments: Segment[]): boolean {
  return segments.some(s => t >= s.debut && t <= s.fin);
}

export function placerEncarts(termes: Terme[], segments: Segment[], dureeEncart: number): EncartPlace[] {
  const places: EncartPlace[] = [];
  for (const t of termes) {
    if (t.statut !== 'valide') continue;
    const occurrence = [...t.occurrences].sort((a, b) => a - b).find(o => estConserve(o, segments));
    if (occurrence === undefined) continue;
    const debut = sourceVersMonte(occurrence, segments);
    if (debut === null) continue;
    places.push({ terme: t.terme, definition: t.definition, position: t.position, debut });
  }
  places.sort((a, b) => a.debut - b.debut);
  for (let i = 1; i < places.length; i++) {
    const precedent = places[i - 1]!;
    const courant = places[i]!;
    courant.debut = Math.max(courant.debut, precedent.debut + dureeEncart);
  }
  return places;
}
