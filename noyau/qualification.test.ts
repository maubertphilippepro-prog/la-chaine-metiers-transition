import { describe, expect, it } from 'vitest';
import { diffusion, memeQualification, QUALIFICATION_PAR_DEFAUT, qualificationDepuisProfil } from './qualification';

describe('diffusion', () => {
  it('déduit YouTube et le site des quatre qualifications', () => {
    expect(diffusion({ nature: 'pro', confidentielle: true })).toEqual({ youtube: 'aucun', site: 'fichier' });
    expect(diffusion({ nature: 'pro', confidentielle: false })).toEqual({ youtube: 'non-repertoriee', site: 'lien' });
    expect(diffusion({ nature: 'perso', confidentielle: true })).toEqual({ youtube: 'privee', site: 'aucun' });
    expect(diffusion({ nature: 'perso', confidentielle: false })).toEqual({ youtube: 'publique', site: 'aucun' });
  });
  it('part d’une vidéo Perso non confidentielle', () => {
    expect(QUALIFICATION_PAR_DEFAUT).toEqual({ nature: 'perso', confidentielle: false });
  });
});

describe('memeQualification', () => {
  it('compare la nature et la confidentialité seulement', () => {
    expect(memeQualification({ nature: 'pro', confidentielle: true }, { nature: 'pro', confidentielle: true })).toBe(true);
    expect(memeQualification({ nature: 'pro', confidentielle: true }, { nature: 'pro', confidentielle: false })).toBe(false);
    expect(memeQualification({ nature: 'pro', confidentielle: false }, { nature: 'perso', confidentielle: false })).toBe(false);
  });
});

describe('qualificationDepuisProfil', () => {
  it('convertit les profils de la version 1', () => {
    expect(qualificationDepuisProfil('interne')).toEqual({ nature: 'pro', confidentielle: true });
    expect(qualificationDepuisProfil('mixte')).toEqual({ nature: 'pro', confidentielle: false });
    expect(qualificationDepuisProfil('perso')).toEqual({ nature: 'perso', confidentielle: false });
  });
  it('ne reconnaît rien d’autre', () => {
    for (const p of ['pro', 'toString', '', undefined, null, 3]) expect(qualificationDepuisProfil(p)).toBeNull();
  });
  it('rend une copie, pas la table interne', () => {
    const q = qualificationDepuisProfil('interne')!;
    q.confidentielle = false;
    expect(qualificationDepuisProfil('interne')).toEqual({ nature: 'pro', confidentielle: true });
  });
});
