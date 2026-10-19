import { passageEnTemps, type Consigne, type EtatProposition, type Operation } from '../../../noyau/consignes';
import type { Analyse, Montage, Segment } from '../../../noyau/types';

// Passage à écouter pour une proposition qui coupe un passage ou décide d'une coupe existante.
export function passageDeProposition(analyse: Analyse, montage: Montage, operation: Operation): Segment | null {
  if (operation.type === 'couper') {
    const p = passageEnTemps(analyse, operation.premierMot, operation.dernierMot);
    return typeof p === 'string' ? null : p;
  }
  if (operation.type === 'basculerCoupe' || operation.type === 'deciderLongueur') {
    const coupe = montage.coupes.find(c => c.id === operation.idCoupe);
    return coupe ? { debut: coupe.debut, fin: coupe.fin } : null;
  }
  return null;
}

const ACCORDS: [EtatProposition, string, string][] = [
  ['en-attente', 'en attente', 'en attente'],
  ['acceptee', 'acceptée', 'acceptées'],
  ['refusee', 'refusée', 'refusées'],
  ['invalide', 'invalide', 'invalides'],
];

// « 2 acceptées, 1 refusée » pour la liste des consignes précédentes.
export function bilan(consigne: Consigne): string {
  const parties = ACCORDS.flatMap(([etat, un, plusieurs]) => {
    const n = consigne.propositions.filter(p => p.etat === etat).length;
    return n === 0 ? [] : [`${n} ${n === 1 ? un : plusieurs}`];
  });
  return parties.length > 0 ? parties.join(', ') : 'aucune opération';
}
