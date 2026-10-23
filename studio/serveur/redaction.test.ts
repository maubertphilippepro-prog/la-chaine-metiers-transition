import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { ErreurInterpretation } from './consignes';
import { construirePromptRedaction, nettoyerProposition, redigerPublication, type DemandeRedaction } from './redaction';

const demande: DemandeRedaction = {
  titreVideo: 'Windows + V',
  texte: 'Bonjour à tous. Aujourd’hui, le presse-papiers.',
  chapitres: ['Le raccourci', 'Épingler'],
  termes: [{ terme: 'Presse-papiers', definition: 'Mémoire de ce qui est copié.' }],
  qualification: { nature: 'perso', confidentielle: false },
  modele: 'claude-opus-5-5',
};
const PROPOSITION = {
  titre: ' Retrouvez tout ce que vous copiez ',
  variantesTitre: ['A', 'B', 'C'],
  description: 'Desc',
  tags: ['Windows', ' ', 'windows', 'presse-papiers'],
  accroches: ['Un', 'Deux', 'Trois', 'Quatre'],
  logiciels: [' Excel ', 'excel', '', 'Teams'],
};

function client(parse: (...args: unknown[]) => Promise<unknown>) {
  const fonction = vi.fn(parse);
  return { client: { messages: { parse: fonction } } as unknown as Anthropic, parse: fonction };
}

describe('construirePromptRedaction', () => {
  it('donne le titre, les chapitres, les termes et la transcription', () => {
    const prompt = construirePromptRedaction(demande);
    expect(prompt).toContain('Titre de travail : Windows + V');
    expect(prompt).toContain('- Le raccourci\n- Épingler');
    expect(prompt).toContain('- Presse-papiers : Mémoire de ce qui est copié.');
    expect(prompt).toContain('<transcription>\nBonjour à tous.');
    expect(prompt).toContain('ne mentionne aucun employeur');
    expect(prompt).toContain('Pas d’horodatage');
    expect(prompt).toContain('- logiciels :');
  });
  it('demande un ton sobre pour une vidéo Pro confidentielle, sans la règle de mention', () => {
    const prompt = construirePromptRedaction({ ...demande, qualification: { nature: 'pro', confidentielle: true }, chapitres: [] });
    expect(prompt).toContain('usage interne');
    expect(prompt).not.toContain('ne mentionne aucun employeur');
    expect(prompt).not.toContain('Chapitres de la vidéo');
  });
  it('garde la règle de mention pour toute vidéo envoyée sur YouTube, même privée', () => {
    const prompt = construirePromptRedaction({ ...demande, qualification: { nature: 'perso', confidentielle: true } });
    expect(prompt).toContain('ne mentionne aucun employeur');
  });
});

describe('nettoyerProposition', () => {
  it('retire les blancs, les doublons et l’excédent', () => {
    expect(nettoyerProposition(PROPOSITION)).toEqual({
      titre: 'Retrouvez tout ce que vous copiez',
      variantesTitre: ['A', 'B'],
      description: 'Desc',
      tags: ['Windows', 'presse-papiers'],
      accroches: ['Un', 'Deux', 'Trois'],
      logiciels: ['Excel', 'Teams'],
    });
  });
});

describe('redigerPublication', () => {
  it('appelle Claude en sortie structurée et nettoie la proposition', async () => {
    const { client: c, parse } = client(async () => ({ stop_reason: 'end_turn', parsed_output: PROPOSITION }));
    expect((await redigerPublication(demande, c)).variantesTitre).toEqual(['A', 'B']);
    expect(parse).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-opus-5-5' }), expect.anything());
  });
  it('signale un refus', async () => {
    const { client: c } = client(async () => ({ stop_reason: 'refusal', parsed_output: null }));
    await expect(redigerPublication(demande, c)).rejects.toThrow(ErreurInterpretation);
  });
  it('traduit une erreur de connexion en 503', async () => {
    const { client: c } = client(async () => { throw new Anthropic.APIConnectionError({ message: 'hors ligne' }); });
    await expect(redigerPublication(demande, c)).rejects.toMatchObject({ statut: 503 });
  });
});
