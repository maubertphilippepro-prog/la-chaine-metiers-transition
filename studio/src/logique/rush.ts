import type { Mot } from '../../../noyau/types';
import type { EtapeInsertion, EtatInsertion } from '../../commun';
import { horodatage } from './format';
import { LIBELLES_ETAPE } from './nouveau-tournage';

export type SensInsertion = 'avant' | 'apres';

// t : instant de la source où le rush s'insère ; rangAvant : rang (dans analyse.mots) du mot qui le précède.
export interface PointInsertion {
  t: number;
  rangAvant: number | null;
}

export const LIBELLES_INSERTION: Record<EtapeInsertion, string> = {
  ...LIBELLES_ETAPE,
  reconstruction: 'Reconstruction de la vidéo',
};

const MOTS_DU_RAPPEL = 3;

// « Avant » : fin du mot qui précède la sélection (0 si elle commence au premier mot) ; « après » : fin de son dernier mot.
export function pointInsertion(mots: Mot[], rangs: [number, number], sens: SensInsertion): PointInsertion {
  const rang = sens === 'avant' ? rangs[0] - 1 : rangs[1];
  const mot = mots[rang];
  return mot ? { t: mot.fin, rangAvant: rang } : { t: 0, rangAvant: null };
}

export function rappelInsertion(mots: Mot[], p: PointInsertion): string {
  if (p.rangAvant === null) return 'Insertion au début de la vidéo. Comptez quelques minutes.';
  const extrait = mots.slice(Math.max(0, p.rangAvant - MOTS_DU_RAPPEL + 1), p.rangAvant + 1).map(m => m.texte).join(' ');
  return `Insertion à ${horodatage(p.t)}, après « … ${extrait} ». Comptez quelques minutes.`;
}

export function messageFinInsertion(e: EtatInsertion): string | null {
  if (e.erreur) return `Insertion impossible : ${e.erreur}`;
  if (e.avertissement) return `Rush inséré sans suggestions de Claude : ${e.avertissement}`;
  return null;
}
