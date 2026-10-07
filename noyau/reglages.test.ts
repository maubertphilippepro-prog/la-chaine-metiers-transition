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
  });
});
