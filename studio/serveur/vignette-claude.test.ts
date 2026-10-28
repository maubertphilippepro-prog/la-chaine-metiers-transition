import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import type { ConsigneVignette, PropositionVignette, Vignette } from '../../noyau/publication';
import { ErreurInterpretation } from './consignes';
import {
  construirePromptVignette, nettoyerPropositionsVignette, proposerVignettes, type DemandeVignette, type ElementsDisponibles,
} from './vignette-claude';

const DISPONIBLES: ElementsDisponibles = {
  poses: ['surpris.jpg', 'souriant.jpg'],
  logos: ['excel.png', 'teams.svg'],
  captures: ['planning.png', 'tableau.png'],
  accroches: ['Planning sans effort', 'Excel en 2 clics'],
};
const ACTUELLE: Vignette = {
  pose: { source: 'banque', fichier: 'souriant.jpg' }, accroche: 'Accroche actuelle', gabarit: 'classique', logos: [], captures: [], fichier: null,
};
const PROPOSITION: PropositionVignette = {
  pose: 'surpris.jpg', logos: ['excel.png'], captures: ['planning.png'], gabarit: 'demonstration', accroche: 'Planning en un clin d’œil', explication: 'Le planning en grand.',
};
const PRECEDENTE: ConsigneVignette = {
  texte: 'Plus sobre', compris: 'Moins d’éléments.', pasRealisable: [], propositions: [{ ...PROPOSITION, gabarit: 'classique', logos: [], captures: [] }], choisie: 0,
};
const demande: DemandeVignette = {
  consigne: 'Mets en avant le planning, ton plus léger',
  titre: 'Le planning Excel', description: 'Un planning partagé.', logiciels: ['Excel'],
  disponibles: DISPONIBLES, actuelle: ACTUELLE, dejaUtilises: ['vitrine'], precedentes: [PRECEDENTE],
  qualification: { nature: 'perso', confidentielle: false }, modele: 'claude-opus-5-5',
};

function client(parse: (...args: unknown[]) => Promise<unknown>) {
  const fonction = vi.fn(parse);
  return { client: { messages: { parse: fonction } } as unknown as Anthropic, parse: fonction };
}

describe('construirePromptVignette', () => {
  it('donne la consigne, les textes et les noms de fichiers proposables', () => {
    const prompt = construirePromptVignette(demande);
    expect(prompt).toContain('<consigne>\nMets en avant le planning, ton plus léger\n</consigne>');
    expect(prompt).toContain('Titre : Le planning Excel');
    expect(prompt).toContain('- Planning sans effort');
    expect(prompt).toContain('- Excel');
    expect(prompt).toContain('- surpris.jpg');
    expect(prompt).toContain('- teams.svg');
    expect(prompt).toContain('- planning.png\n- tableau.png');
    expect(prompt).toContain('noms de fichiers');
  });
  it('décrit la composition actuelle et les gabarits, en signalant ceux déjà pris', () => {
    const prompt = construirePromptVignette(demande);
    expect(prompt).toContain('Composition actuelle : pose souriant.jpg, gabarit classique, accroche « Accroche actuelle »');
    expect(prompt).toMatch(/- vitrine \(Vitrine\) : .*possible dès un logo — déjà pris par une autre vidéo/);
    expect(prompt).not.toMatch(/- classique .*déjà pris/);
    expect(construirePromptVignette({ ...demande, actuelle: null })).toContain('Pas encore de composition.');
  });
  it('rappelle les consignes précédentes et la proposition retenue', () => {
    const prompt = construirePromptVignette(demande);
    expect(prompt).toContain('- « Plus sobre » (retenue : pose surpris.jpg, gabarit classique');
    expect(construirePromptVignette({ ...demande, precedentes: [{ ...PRECEDENTE, choisie: null }] })).toContain('aucune proposition retenue');
    expect(construirePromptVignette({ ...demande, precedentes: [] })).not.toContain('Consignes précédentes');
  });
  it('donne les règles et le ton selon la diffusion', () => {
    const prompt = construirePromptVignette(demande);
    expect(prompt).toContain('3 logos et 3 captures au plus');
    expect(prompt).toContain('3 à 5 mots');
    expect(prompt).toContain('ne mentionne aucun employeur');
    expect(construirePromptVignette({ ...demande, qualification: { nature: 'pro', confidentielle: true } })).toContain('usage interne');
  });
});

describe('nettoyerPropositionsVignette', () => {
  const nettoyer = (p: Partial<PropositionVignette>[], actuelle: Vignette | null = ACTUELLE) =>
    nettoyerPropositionsVignette(p.map(x => ({ ...PROPOSITION, ...x })), DISPONIBLES, actuelle, ['vitrine']);
  it('garde une proposition valable telle quelle, sans blancs', () => {
    expect(nettoyer([{ accroche: ' Planning en un clin d’œil ', explication: ' Le planning en grand. ' }])).toEqual([PROPOSITION]);
  });
  it('retire fichiers inconnus et doublons, et garde 3 éléments au plus', () => {
    const [p] = nettoyer([{ logos: ['excel.png', 'inconnu.png', 'excel.png', 'teams.svg'], captures: ['planning.png', 'hors-liste.png'] }]);
    expect(p).toMatchObject({ logos: ['excel.png', 'teams.svg'], captures: ['planning.png'] });
    const plusieurs = nettoyerPropositionsVignette(
      [{ ...PROPOSITION, logos: ['a.png', 'b.png', 'c.png', 'd.png'] }],
      { ...DISPONIBLES, logos: ['a.png', 'b.png', 'c.png', 'd.png'] }, ACTUELLE, [],
    );
    expect(plusieurs[0]!.logos).toEqual(['a.png', 'b.png', 'c.png']);
  });
  it('corrige un gabarit impossible avec les éléments retenus, en évitant ceux déjà pris', () => {
    expect(nettoyer([{ gabarit: 'mosaique', captures: ['planning.png'] }])[0]!.gabarit).toBe('demonstration');
    expect(nettoyer([{ gabarit: 'mosaique', captures: [], logos: ['excel.png'] }])[0]!.gabarit).toBe('classique');
  });
  it('remplace une pose inconnue par celle de la composition actuelle, sinon la première de la banque', () => {
    expect(nettoyer([{ pose: 'inconnue.jpg' }])[0]!.pose).toBe('souriant.jpg');
    expect(nettoyer([{ pose: 'inconnue.jpg' }], null)[0]!.pose).toBe('surpris.jpg');
  });
  it('remplace une accroche vide par l’actuelle, sinon la première rédigée', () => {
    expect(nettoyer([{ accroche: '  ' }])[0]!.accroche).toBe('Accroche actuelle');
    expect(nettoyer([{ accroche: '' }], null)[0]!.accroche).toBe('Planning sans effort');
  });
  it('fusionne les propositions identiques après nettoyage et en garde 3 au plus', () => {
    expect(nettoyer([{}, { logos: ['excel.png', 'inconnu.png'], explication: 'Autre' }])).toHaveLength(1);
    const quatre = nettoyer([{ accroche: 'Un' }, { accroche: 'Deux' }, { accroche: 'Trois' }, { accroche: 'Quatre' }]);
    expect(quatre.map(p => p.accroche)).toEqual(['Un', 'Deux', 'Trois']);
  });
  it('ne garde rien sans pose ni accroche possibles', () => {
    expect(nettoyerPropositionsVignette([PROPOSITION], { ...DISPONIBLES, poses: [] }, null, [])).toEqual([]);
    expect(nettoyerPropositionsVignette([{ ...PROPOSITION, accroche: '' }], { ...DISPONIBLES, accroches: [] }, null, [])).toEqual([]);
  });
});

describe('proposerVignettes', () => {
  const REPONSE = { compris: 'Le planning en avant.', pasRealisable: [], propositions: [PROPOSITION] };
  it('appelle Claude en sortie structurée, effort moyen, avec repli serveur', async () => {
    const { client: c, parse } = client(async () => ({ stop_reason: 'end_turn', parsed_output: REPONSE }));
    expect(await proposerVignettes(demande, c)).toEqual(REPONSE);
    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-opus-5-5', fallbacks: 'default', output_config: expect.objectContaining({ effort: 'medium' }) }),
      { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } },
    );
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
