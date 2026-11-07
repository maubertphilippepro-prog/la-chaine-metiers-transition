import { describe, expect, it } from 'vitest';
import { construirePromptPost, type DemandePost } from './linkedin-claude';

const D: DemandePost = {
  profil: 'cicad', titreVideo: 'AnalyzTech en mode projet', description: 'Desc publiée', texte: 'Bonjour, aujourd’hui on ouvre AnalyzTech.',
  chapitres: ['Intro'], brief: { objectif: 'Annonce', cta: '', elements: 'Merci Jimmy', visuel: '' },
  bibliotheque: { guide: 'GUIDE', index: 'INDEX', exemples: [{ fichier: 'cicad/a.md', texte: 'EXEMPLE A' }] }, modele: 'claude-opus-5-5',
};

describe('prompt du post LinkedIn', () => {
  it('donne la transcription, le brief, le guide, l’index et les exemples', () => {
    const p = construirePromptPost(D);
    for (const t of [D.texte, 'Objectif : Annonce', 'Merci Jimmy', 'Call-to-action : (non précisé)', 'GUIDE', 'INDEX', '<post fichier="cicad/a.md">', 'EXEMPLE A', '- Intro']) {
      expect(p).toContain(t);
    }
  });
  it('fixe la voix du profil et interdit d’inventer', () => {
    expect(construirePromptPost(D)).toContain('« nous », jamais « je »');
    expect(construirePromptPost({ ...D, profil: 'personnel' })).toContain('il écrit en « je »');
    expect(construirePromptPost(D)).toContain('[crochets]');
  });
});
