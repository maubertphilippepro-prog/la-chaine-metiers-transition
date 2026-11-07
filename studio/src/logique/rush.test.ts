import { describe, expect, it } from 'vitest';
import type { Mot } from '../../../noyau/types';
import { messageFinInsertion, pointInsertion, rappelInsertion } from './rush';

const mots: Mot[] = [
  { id: 0, texte: 'Bonjour', debut: 0.2, fin: 0.6 },
  { id: 1, texte: 'à', debut: 0.7, fin: 0.8 },
  { id: 2, texte: 'tous', debut: 0.9, fin: 1.2 },
  { id: 3, texte: 'aujourd’hui', debut: 154.0, fin: 154.6 },
];

describe('pointInsertion', () => {
  it('avant : fin du mot qui précède la sélection', () => {
    expect(pointInsertion(mots, [2, 3], 'avant')).toEqual({ t: 0.8, rangAvant: 1 });
  });
  it('avant le premier mot : début de la vidéo', () => {
    expect(pointInsertion(mots, [0, 1], 'avant')).toEqual({ t: 0, rangAvant: null });
  });
  it('après : fin du dernier mot choisi, jusqu’au dernier mot du texte', () => {
    expect(pointInsertion(mots, [1, 3], 'apres')).toEqual({ t: 154.6, rangAvant: 3 });
  });
});

describe('rappelInsertion', () => {
  it('donne l’instant et les derniers mots avant le rush', () => {
    expect(rappelInsertion(mots, { t: 154.6, rangAvant: 3 })).toBe('Insertion à 2:34, après « … à tous aujourd’hui ». Comptez quelques minutes.');
  });
  it('au début de la vidéo', () => {
    expect(rappelInsertion(mots, { t: 0, rangAvant: null })).toBe('Insertion au début de la vidéo. Comptez quelques minutes.');
  });
});

describe('messageFinInsertion', () => {
  const fin = { enCours: false, etape: null, erreur: null, avertissement: null };
  it('rien à dire après un succès', () => expect(messageFinInsertion(fin)).toBeNull());
  it('donne l’échec', () => {
    expect(messageFinInsertion({ ...fin, erreur: 'muet.mp4 : aucune piste audio.' })).toBe('Insertion impossible : muet.mp4 : aucune piste audio.');
  });
  it('signale un rush inséré sans suggestions', () => {
    expect(messageFinInsertion({ ...fin, avertissement: 'API indisponible' })).toBe('Rush inséré sans suggestions de Claude : API indisponible');
  });
});
