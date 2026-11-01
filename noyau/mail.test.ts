import { describe, expect, it } from 'vitest';
import { apercuDepuisMail, appliquerRetouches, brouillonPossible, dossierMail, ETAT_MAIL_VIDE, fichierSharepoint, raisonMail, urlSharepoint } from './mail';

const SP = { dossierLocal: 'C:\\x', site: 'https://ingeropgroup.sharepoint.com/sites/vitrin3', bibliotheque: 'Chane vido interne' };

describe('mail de com', () => {
  it('nomme le dossier du mail par vidéo', () => {
    expect(dossierMail('complete')).toBe('publication/complete/mail');
    expect(dossierMail(2)).toBe('publication/episode-02/mail');
  });
  it('nomme le fichier copié d’après le titre de la vidéo', () => {
    expect(fichierSharepoint('AnalyzTech : le mode projet expliqué')).toBe('AnalyzTech le mode projet expliqué.mp4');
    expect(fichierSharepoint('Quoi de neuf ? / Épisode 2.')).toBe('Quoi de neuf Épisode 2.mp4');
    expect(fichierSharepoint(' ?? ')).toBe('Vidéo.mp4');
  });
  it('calcule l’URL Stream comme celle copiée dans SharePoint', () => {
    expect(urlSharepoint(SP, '2026-10-27-analyztech-en-mode-projet-video-complete.mp4')).toBe(
      'https://ingeropgroup.sharepoint.com/sites/vitrin3/_layouts/15/stream.aspx?id='
      + '%2Fsites%2Fvitrin3%2FChane%20vido%20interne%2F2026%2D10%2D27%2Danalyztech%2Den%2Dmode%2Dprojet%2Dvideo%2Dcomplete%2Emp4',
    );
  });
  it('n’ouvre le mail qu’aux vidéos Pro rendues', () => {
    expect(raisonMail('pro', true)).toBeNull();
    expect(raisonMail('perso', true)).toContain('Pro');
    expect(raisonMail('pro', false)).toContain('rendu');
  });
  it('n’autorise le brouillon qu’après un build plus récent que mail.md', () => {
    const construit = { ...ETAT_MAIL_VIDE, construitLe: '2026-10-30T10:00:00.000Z' };
    expect(brouillonPossible(ETAT_MAIL_VIDE, 0)).toBe(false);
    expect(brouillonPossible(construit, Date.parse('2026-10-30T09:59:00Z'))).toBe(true);
    expect(brouillonPossible(construit, Date.parse('2026-10-30T10:01:00Z'))).toBe(false);
    expect(brouillonPossible(construit, null)).toBe(false);
  });
});

describe('retouche du HTML construit', () => {
  it('remplace chaque morceau trouvé une seule fois', () => {
    expect(appliquerRetouches('<p style="color:#333">a</p><b>$&</b>', [
      { avant: 'color:#333', apres: 'color:#16a34a' },
      { avant: '<b>$&</b>', apres: '<b>$1</b>' },
    ])).toBe('<p style="color:#16a34a">a</p><b>$1</b>');
  });
  it('ne modifie rien si un morceau manque ou se répète', () => {
    expect(() => appliquerRetouches('<p>a</p><p>a</p>', [{ avant: '<p>a</p>', apres: 'x' }])).toThrow('rien n');
    expect(() => appliquerRetouches('<p>a</p>', [{ avant: 'absent', apres: 'x' }])).toThrow('1 morceau');
  });
  it('reconstruit l’aperçu à partir du mail', () => {
    expect(apercuDepuisMail('<img src="cid:img1">', [{ cid: 'img1', file: 'images/a.png' }])).toBe('<img src="images/a.png">');
  });
});
