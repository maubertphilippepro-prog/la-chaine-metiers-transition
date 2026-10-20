import { describe, expect, it } from 'vitest';
import reglagesJson from '../reglages.json';
import type { Reglages } from './types';

describe('reglages.json', () => {
  it('respecte le type Reglages et les valeurs par défaut de la spec', () => {
    const r: Reglages = reglagesJson;
    expect(r.detection.silenceMin).toBe(0.7);
    expect(r.coupe.silenceConserve).toBe(0.3);
    expect(r.detection.hesitationMin).toBe(0.4);
    expect(r.detection.hesitationTranscriteMin).toBe(0);
    expect(r.durees.encart).toBe(6);
    expect(r.definitionMaxCaracteres).toBe(160);
    expect(r.modeles.claude).toBe('claude-opus-5-5');
    expect(r.charte.nomChaine).toBe('PMT');
    expect(Object.keys(r.charte).some(k => k.startsWith('logo'))).toBe(false);
    expect(r.camera).toEqual({ x: 24, y: 786, largeur: 480, hauteur: 270 });
    expect(r.elements).toEqual({ texteMaxCaracteres: 40, dureeMin: 1, zoomLargeurMin: 480 });
    expect(r.modeles.detourage).toBe('birefnet-portrait');
    expect(r.publication).toMatchObject({ titreMax: 100, descriptionMax: 5000, tagsMax: 500, vignetteOctetsMax: 2_000_000 });
    expect(r.publication.mentionsInterdites.length).toBeGreaterThan(0);
  });
});
