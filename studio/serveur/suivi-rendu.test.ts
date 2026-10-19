import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SuiviRendu } from './suivi-rendu';

describe('SuiviRendu', () => {
  it('suit la progression puis garde les résultats sans les chemins complets', async () => {
    const suivi = new SuiviRendu();
    let finir!: () => void;
    const fichier = path.join('donnees', 'tournages', 'a', 'rendus', 'episode-01-intro.mp4');
    const lance = suivi.lancer('a', async onProgression => {
      onProgression(fichier, 0.5);
      await new Promise<void>(r => { finir = r; });
      return [{ fichier, ok: false, message: 'boum' }];
    });
    expect(lance).toBe(true);
    expect(suivi.etat()).toMatchObject({ nom: 'a', enCours: true, fichier: 'episode-01-intro.mp4', progression: 0.5 });
    expect(suivi.lancer('b', async () => [])).toBe(false);
    finir();
    await suivi.attendre();
    expect(suivi.etat()).toMatchObject({
      nom: 'a', enCours: false, erreur: null,
      resultats: [{ fichier: 'episode-01-intro.mp4', ok: false, message: 'boum' }],
    });
  });
  it('garde l’erreur d’un rendu qui échoue avant de commencer et accepte un nouveau rendu', async () => {
    const suivi = new SuiviRendu();
    suivi.lancer('a', async () => { throw new Error('montage.json absent'); });
    await suivi.attendre();
    expect(suivi.etat()).toMatchObject({ enCours: false, erreur: 'montage.json absent' });
    expect(suivi.lancer('a', async () => [])).toBe(true);
  });
  it('renvoie une copie de son état', () => {
    const suivi = new SuiviRendu();
    suivi.etat().resultats.push({ fichier: 'x', ok: true, message: null });
    expect(suivi.etat().resultats).toEqual([]);
  });
});
