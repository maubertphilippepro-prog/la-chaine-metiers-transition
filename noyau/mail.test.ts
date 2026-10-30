import { describe, expect, it } from 'vitest';
import { brouillonPossible, dossierMail, ETAT_MAIL_VIDE, fichierSharepoint, raisonMail, urlSharepoint } from './mail';

const SP = { dossierLocal: 'C:\\x', site: 'https://ingeropgroup.sharepoint.com/sites/vitrin3', bibliotheque: 'Chane vido interne' };

describe('mail de com', () => {
  it('nomme le dossier du mail par vidéo', () => {
    expect(dossierMail('complete')).toBe('publication/complete/mail');
    expect(dossierMail(2)).toBe('publication/episode-02/mail');
  });
  it('préfixe le fichier copié par le nom du tournage', () => {
    expect(fichierSharepoint('2026-10-27-analyztech-en-mode-projet', 'video-complete.mp4'))
      .toBe('2026-10-27-analyztech-en-mode-projet-video-complete.mp4');
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
