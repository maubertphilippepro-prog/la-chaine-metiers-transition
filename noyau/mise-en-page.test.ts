import { describe, expect, it } from 'vitest';
import { bornerMise, cleMise, MISE_PAR_DEFAUT, raisonMise } from './mise-en-page';

describe('bornerMise', () => {
  it('donne les défauts quand rien n’est fourni', () => {
    expect(bornerMise(undefined, [], 0)).toEqual(MISE_PAR_DEFAUT);
  });
  it('ramène un recadrage dans l’image, avec 10 % au moins', () => {
    const m = bornerMise({ recadrages: [{ x: 95, y: -5, largeur: 2, hauteur: 200 }] }, [], 1);
    expect(m.recadrages).toEqual([{ x: 90, y: 0, largeur: 10, hauteur: 100 }]);
  });
  it('aligne les recadrages sur le nombre de captures', () => {
    expect(bornerMise({ recadrages: [null, null, null] }, [], 1).recadrages).toEqual([null]);
    expect(bornerMise({ recadrages: [] }, [], 2).recadrages).toEqual([null, null]);
  });
  it('oublie un logo vedette absent de la vignette et une valeur inconnue', () => {
    const m = bornerMise({ logoVedette: 'word.png', cotePose: 'haut' as never, tailleAccroche: 'grande' }, ['excel.png'], 0);
    expect(m).toMatchObject({ logoVedette: null, cotePose: 'droite', tailleAccroche: 'grande' });
  });
});

describe('raisonMise', () => {
  it('accepte une mise bornée et refuse une forme inattendue', () => {
    expect(raisonMise(MISE_PAR_DEFAUT)).toBeNull();
    expect(raisonMise({ ...MISE_PAR_DEFAUT, recadrages: [{ x: 'a' }] })).toBe('mise invalide');
  });
});

describe('cleMise', () => {
  it('est vide pour la mise par défaut, pour garder les clés des vignettes existantes', () => {
    expect(cleMise(undefined)).toBe('');
    expect(cleMise(MISE_PAR_DEFAUT)).toBe('');
    expect(cleMise({ ...MISE_PAR_DEFAUT, cotePose: 'gauche' })).not.toBe('');
  });
});
