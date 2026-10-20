import { passageEnTemps, type Consigne, type EtatProposition, type Operation } from '../../../noyau/consignes';
import type { Analyse, Montage, Segment } from '../../../noyau/types';

function passage(analyse: Analyse, premierMot: number, dernierMot: number): Segment | null {
  const p = passageEnTemps(analyse, premierMot, dernierMot);
  return typeof p === 'string' ? null : p;
}

// Passage à écouter pour une proposition qui porte sur un passage, une coupe ou un élément existant.
export function passageDeProposition(analyse: Analyse, montage: Montage, operation: Operation): Segment | null {
  switch (operation.type) {
    case 'couper':
    case 'ajouterElement':
      return passage(analyse, operation.premierMot, operation.dernierMot);
    case 'basculerCoupe':
    case 'deciderLongueur': {
      const coupe = montage.coupes.find(c => c.id === operation.idCoupe);
      return coupe ? { debut: coupe.debut, fin: coupe.fin } : null;
    }
    case 'modifierElement':
    case 'supprimerElement': {
      if (operation.type === 'modifierElement' && operation.premierMot !== undefined && operation.dernierMot !== undefined) {
        return passage(analyse, operation.premierMot, operation.dernierMot);
      }
      const e = montage.elements.find(x => x.id === operation.idElement);
      return e ? { debut: e.debut, fin: e.fin } : null;
    }
    default:
      return null;
  }
}

// Proposition de zoom ou de mise en avant : la zone se trace dans l'aperçu.
export function demandeUneZone(operation: Operation): boolean {
  return operation.type === 'ajouterElement' && (operation.nature === 'zoom' || operation.nature === 'miseEnAvant');
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
