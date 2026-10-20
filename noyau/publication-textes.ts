import { dureeVideoComplete, type DecisionsVideoComplete, type Partie } from './decisions';
import type { Mot, Segment } from './types';

// Début d'un chapitre en secondes dans la vidéo rendue.
export interface ChapitreYoutube {
  titre: string;
  debut: number;
}

// Règles de YouTube pour afficher des chapitres.
const CHAPITRES_MIN = 3;
const DUREE_CHAPITRE_MIN = 10;

// Le premier chapitre commence à 0 (avec le générique), les suivants au début de leur intertitre.
export function chapitresYoutube(d: DecisionsVideoComplete): ChapitreYoutube[] {
  const chapitres: ChapitreYoutube[] = [];
  let image = d.durees.generique;
  d.parties.forEach((p, i) => {
    chapitres.push({ titre: p.titre, debut: i === 0 ? 0 : image / d.fps });
    image += (i === 0 ? 0 : d.durees.intertitre) + p.duree;
  });
  const fin = dureeVideoComplete(d) / d.fps;
  const durees = chapitres.map((c, i) => (chapitres[i + 1]?.debut ?? fin) - c.debut);
  if (chapitres.length < CHAPITRES_MIN || durees.some(duree => duree < DUREE_CHAPITRE_MIN)) return [];
  return chapitres;
}

export function formatHorodatage(secondes: number): string {
  const total = Math.floor(secondes);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function descriptionYoutube(description: string, chapitres: ChapitreYoutube[]): string {
  const texte = description.trim();
  if (chapitres.length === 0) return texte;
  return `${texte}\n\nChapitres :\n${chapitres.map(c => `${formatHorodatage(c.debut)} ${c.titre}`).join('\n')}`;
}

export function segmentsSecondes(partie: Partie, fps: number): Segment[] {
  return partie.segments.map(s => ({ debut: s.debut / fps, fin: s.fin / fps }));
}

// Paroles entendues dans la vidéo montée : les mots dont le milieu tombe dans un passage conservé.
export function texteConserve(mots: Mot[], segments: Segment[]): string {
  return mots
    .filter(m => {
      const milieu = (m.debut + m.fin) / 2;
      return segments.some(s => milieu >= s.debut && milieu <= s.fin);
    })
    .map(m => m.texte)
    .join(' ');
}
