import { describe, expect, it } from 'vitest';
import { construirePromptMail, construirePromptRetouche, extraireMail, type DemandeMail } from './mail-claude';

const D: DemandeMail = {
  titreVideo: 'AnalyzTech en mode projet', description: 'Desc publiée', texte: 'Bonjour, aujourd’hui on ouvre AnalyzTech.',
  chapitres: ['Intro', 'Le tableau'], notes: 'Inviter à tester avant le 15/11', images: ['capture.png'], vignette: 'vignette.jpg',
  urlVideo: 'https://sp/stream.aspx?id=x', logosBandeau: ['analyztech', 'there'],
  charte: 'CHARTE', syntaxe: 'SYNTAXE', exemple: 'EXEMPLE', modele: 'claude-opus-5-5',
};

describe('prompt du mail de com', () => {
  it('donne la transcription, les notes, la charte, la syntaxe et l’exemple', () => {
    const p = construirePromptMail(D);
    for (const t of [D.texte, D.notes, 'CHARTE', 'SYNTAXE', 'EXEMPLE', 'capture.png', '- Intro']) expect(p).toContain(t);
  });
  it('impose le bloc vidéo vers SharePoint avec la vignette', () => {
    expect(construirePromptMail(D)).toContain('[[video: AnalyzTech en mode projet | https://sp/stream.aspx?id=x | vignette.jpg]]');
    expect(construirePromptMail({ ...D, vignette: null })).toContain('[[video: AnalyzTech en mode projet | https://sp/stream.aspx?id=x]]');
  });
  it('demande [À COMPLÉTER] plutôt qu’une info inventée et limite les logos du bandeau', () => {
    const p = construirePromptMail(D);
    expect(p).toContain('[À COMPLÉTER]');
    expect(p).toContain('analyztech, there');
  });
  it('retire une éventuelle clôture de code autour de mail.md', () => {
    expect(extraireMail('```markdown\n---\nobjet: X\n---\nCorps\n```')).toBe('---\nobjet: X\n---\nCorps\n');
    expect(extraireMail('---\nobjet: X\n---\nCorps')).toBe('---\nobjet: X\n---\nCorps\n');
  });
});

describe('prompt de retouche', () => {
  it('donne la demande et le HTML, et demande des extraits uniques', () => {
    const p = construirePromptRetouche({ consigne: 'Titre en vert', html: '<h1 style="color:#004D9B">T</h1>', modele: 'm' });
    for (const t of ['Titre en vert', '<h1 style="color:#004D9B">T</h1>', 'une seule fois', 'VML']) expect(p).toContain(t);
  });
});
