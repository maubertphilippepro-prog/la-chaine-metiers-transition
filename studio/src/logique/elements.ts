import { extraitPassage, type Ancrage } from '../../../noyau/consignes';
import type { Analyse, ElementEcran, Montage } from '../../../noyau/types';

// Éléments du panneau : non écartés, par ordre d'apparition.
export function elementsAffiches(m: Montage): ElementEcran[] {
  return m.elements.filter(e => e.statut !== 'ecarte').sort((a, b) => a.debut - b.debut);
}

// Texte proposé pour un texte incrusté : les mots sélectionnés, coupés à la longueur maximale.
export function textePrerempli(analyse: Analyse, ancrage: Ancrage, max: number): string {
  return extraitPassage(analyse, ancrage).slice(0, max).trimEnd();
}
