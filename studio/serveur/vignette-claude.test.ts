import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import type { ElementsVignette, PropositionVignette } from '../../noyau/publication';
import { ErreurInterpretation } from './consignes';
import type { ImageClaude } from './images';
import {
  construireMessageVignette, nettoyerPropositionsVignette, proposerVignettes, type DemandeVignette,
} from './vignette-claude';

const IMAGE = (nom: string): ImageClaude => ({ nom, media_type: 'image/jpeg', data: 'AAAA' });
const ELEMENTS: ElementsVignette = { pose: 'surpris.jpg', accroche: 'Planning sans effort', logosTexte: 'Excel, Power', logos: ['excel.png'], captures: ['planning.png', 'tableau.png'] };
const PROPOSITION: PropositionVignette = {
  pose: 'surpris.jpg', logos: ['excel.png'], captures: ['planning.png', 'tableau.png'], gabarit: 'mosaique', accroche: 'Planning sans effort', explication: 'Le planning en grand.',
  mise: { cotePose: 'gauche', tailleAccroche: 'grande', recadrages: [{ x: 10, y: 10, largeur: 50, hauteur: 50 }, null], logoVedette: null },
};
const demande: DemandeVignette = {
  elements: ELEMENTS, ambigus: ['Power'], logosBanque: ['excel.png', 'Power BI.png', 'Power Automate.png'], consignes: 'Zoome sur le bouton Partager',
  base: null, titre: 'Le planning Excel', description: 'Un planning partagé.',
  images: { pose: IMAGE('surpris.detoure.png'), logos: [IMAGE('excel.png')], captures: [IMAGE('planning.png'), IMAGE('tableau.png')] },
  dejaUtilises: ['vitrine'], qualification: { nature: 'perso', confidentielle: false }, modele: 'claude-opus-5-5',
};
const texte = (blocs: Anthropic.ContentBlockParam[]) => blocs.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('\n');

function client(parse: (...args: unknown[]) => Promise<unknown>) {
  const fonction = vi.fn(parse);
  return { client: { messages: { parse: fonction } } as unknown as Anthropic, parse: fonction };
}

describe('construireMessageVignette', () => {
  it('légende chaque image puis l’envoie', () => {
    const blocs = construireMessageVignette(demande);
    const i = blocs.findIndex(b => b.type === 'text' && (b as { text: string }).text.includes('Capture planning.png'));
    expect(blocs[i + 1]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } });
    expect(blocs.filter(b => b.type === 'image')).toHaveLength(4);
  });
  it('impose les éléments et demande 3 variantes dont une avec l’accroche telle quelle', () => {
    const t = texte(construireMessageVignette(demande));
    expect(t).toContain('« Planning sans effort »');
    expect(t).toContain('exactement 3');
    expect(t).toContain('<consignes>\nZoome sur le bouton Partager\n</consignes>');
    expect(t).toMatch(/Power.*Power BI\.png.*Power Automate\.png/s);
    expect(t).toMatch(/- vitrine .*déjà pris/);
  });
  it('demande de rester proche de la base quand il y en a une', () => {
    expect(texte(construireMessageVignette(demande))).not.toContain('Variante de départ');
    const t = texte(construireMessageVignette({ ...demande, base: PROPOSITION }));
    expect(t).toContain('Variante de départ');
    expect(t).toContain('"cotePose":"gauche"');
  });
  it('donne le ton selon la diffusion', () => {
    expect(texte(construireMessageVignette(demande))).toContain('ne mentionne aucun employeur');
    expect(texte(construireMessageVignette({ ...demande, qualification: { nature: 'pro', confidentielle: true } }))).toContain('usage interne');
  });
});

describe('nettoyerPropositionsVignette', () => {
  it('rétablit les éléments imposés et borne la mise', () => {
    const [p] = nettoyerPropositionsVignette([{ ...PROPOSITION, pose: 'autre.jpg', captures: ['planning.png'], mise: { ...PROPOSITION.mise!, recadrages: [{ x: 99, y: 0, largeur: 5, hauteur: 50 }] } }], ELEMENTS, []);
    expect(p!.pose).toBe('surpris.jpg');
    expect(p!.captures).toEqual(['planning.png', 'tableau.png']);
    expect(p!.mise!.recadrages[0]).toEqual({ x: 90, y: 0, largeur: 10, hauteur: 50 });
  });
  it('accepte les logos ajoutés pour un nom ambigu', () => {
    const [p] = nettoyerPropositionsVignette([{ ...PROPOSITION, logos: ['excel.png', 'Power BI.png'] }], { ...ELEMENTS, logos: ['excel.png', 'Power BI.png'] }, []);
    expect(p!.logos).toEqual(['excel.png', 'Power BI.png']);
  });
  it('remplace un gabarit impossible, reprend l’accroche de l’auteur si vide, fusionne les doublons', () => {
    const r = nettoyerPropositionsVignette([
      { ...PROPOSITION, gabarit: 'mosaique', captures: [] , accroche: '' },
      { ...PROPOSITION, accroche: 'Autre accroche' },
      { ...PROPOSITION, accroche: 'Autre accroche' },
    ], { ...ELEMENTS, captures: [] }, []);
    expect(r[0]!.gabarit).toBe('vitrine');
    expect(r[0]!.accroche).toBe('Planning sans effort');
    expect(r).toHaveLength(2);
  });
});

describe('proposerVignettes', () => {
  const REPONSE = { compris: 'Le planning en avant.', pasRealisable: [], logosAjoutes: [], propositions: [PROPOSITION] };
  it('appelle Claude en sortie structurée, effort moyen, avec repli serveur', async () => {
    const { client: c, parse } = client(async () => ({ stop_reason: 'end_turn', parsed_output: REPONSE }));
    expect(await proposerVignettes(demande, c)).toEqual(REPONSE);
    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-opus-5-5', fallbacks: 'default', output_config: expect.objectContaining({ effort: 'medium' }) }),
      { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } },
    );
    expect(parse.mock.calls[0]![0]).toMatchObject({ messages: [{ role: 'user', content: construireMessageVignette(demande) }] });
  });
  it('signale un refus ou une réponse inexploitable', async () => {
    await expect(proposerVignettes(demande, client(async () => ({ stop_reason: 'refusal', parsed_output: null })).client)).rejects.toThrow(ErreurInterpretation);
    await expect(proposerVignettes(demande, client(async () => ({ stop_reason: 'max_tokens', parsed_output: null })).client))
      .rejects.toThrow('inexploitable');
  });
  it('traduit une erreur de connexion en 503', async () => {
    const { client: c } = client(async () => { throw new Anthropic.APIConnectionError({ message: 'hors ligne' }); });
    await expect(proposerVignettes(demande, c)).rejects.toMatchObject({ statut: 503 });
  });
});
