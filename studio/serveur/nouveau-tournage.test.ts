import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { etapeAnalyse, simplifierTitre } from './nouveau-tournage';

describe('titre simplifié', () => {
  it('retire accents et ponctuation, en minuscules séparées par des tirets', () => {
    expect(simplifierTitre('Métiers & Transition : l’été !')).toBe('metiers-transition-l-ete');
    expect(simplifierTitre('  Manœuvre  ÉCLAIR  ')).toBe('manoeuvre-eclair');
  });
  it('garde 50 caractères au plus, sans tiret final', () => {
    expect(simplifierTitre(`${'a'.repeat(30)} ${'b'.repeat(30)}`)).toBe(`${'a'.repeat(30)}-${'b'.repeat(19)}`);
    expect(simplifierTitre(`${'a'.repeat(49)} b`)).toBe('a'.repeat(49));
  });
  it('se rabat sur « tournage » sans lettre ni chiffre', () => {
    expect(simplifierTitre('?!')).toBe('tournage');
  });
});

describe('étape de l’analyse', () => {
  it('se déduit du dernier fichier écrit par le pipeline', async () => {
    const d = await mkdtemp(path.join(os.tmpdir(), 'pmt-etape-'));
    expect(etapeAnalyse(d)).toBe('preparation');
    await writeFile(path.join(d, 'preparation.json'), '{}');
    expect(etapeAnalyse(d)).toBe('transcription');
    await writeFile(path.join(d, 'transcription.json'), '[]');
    expect(etapeAnalyse(d)).toBe('detections');
    await writeFile(path.join(d, 'detections.json'), '[]');
    expect(etapeAnalyse(d)).toBe('suggestions');
  });
});
