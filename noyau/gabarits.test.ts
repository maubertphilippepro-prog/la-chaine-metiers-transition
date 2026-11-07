import { describe, expect, it } from 'vitest';
import { DESCRIPTIONS_GABARIT, GABARITS, gabaritRetenu, gabaritsCompatibles, logosSuggeres, resoudreLogos } from './gabarits';

describe('gabaritsCompatibles', () => {
  it('ne propose que le classique sans logo ni capture', () => {
    expect(gabaritsCompatibles({ logos: 0, captures: 0 }, [])).toEqual(['classique']);
  });
  it('propose la vitrine dès un logo, la démonstration dès une capture, la mosaïque dès deux', () => {
    expect(gabaritsCompatibles({ logos: 1, captures: 0 }, [])).toEqual(['vitrine', 'classique']);
    expect(gabaritsCompatibles({ logos: 0, captures: 1 }, [])).toEqual(['demonstration', 'classique']);
    expect(gabaritsCompatibles({ logos: 2, captures: 2 }, [])).toEqual(['vitrine', 'demonstration', 'mosaique', 'classique']);
  });
  it('relègue en fin de liste les gabarits déjà pris par les autres vidéos', () => {
    expect(gabaritsCompatibles({ logos: 2, captures: 2 }, ['vitrine', 'mosaique'])).toEqual(['demonstration', 'classique', 'vitrine', 'mosaique']);
  });
});

describe('gabaritRetenu', () => {
  it('garde le gabarit choisi tant qu’il reste possible, sinon prend le premier proposé', () => {
    expect(gabaritRetenu('mosaique', ['vitrine', 'mosaique', 'classique'])).toBe('mosaique');
    expect(gabaritRetenu('mosaique', ['vitrine', 'classique'])).toBe('vitrine');
    expect(gabaritRetenu(null, ['demonstration', 'classique'])).toBe('demonstration');
    expect(gabaritRetenu(null, [])).toBe('classique');
  });
});

describe('logosSuggeres', () => {
  const banque = ['chatgpt.svg', 'excel.png', 'microsoft-teams.png', 'notion.png', 'power-bi.svg'];
  it('associe les logiciels cités aux logos, sans casse, accents, espaces, points ni tirets', () => {
    expect(logosSuggeres(['ChatGPT', 'Microsoft Teams'], banque)).toEqual(['chatgpt.svg', 'microsoft-teams.png']);
    expect(logosSuggeres(['Power BI', 'Éxcel'], banque)).toEqual(['power-bi.svg', 'excel.png']);
  });
  it('ignore les logiciels sans logo et les doublons, et s’arrête à trois', () => {
    expect(logosSuggeres(['Word', 'excel', 'Excel'], banque)).toEqual(['excel.png']);
    expect(logosSuggeres(['excel', 'notion', 'chatgpt', 'power bi'], banque)).toEqual(['excel.png', 'notion.png', 'chatgpt.svg']);
  });
});

describe('DESCRIPTIONS_GABARIT', () => {
  it('décrit chaque gabarit avec sa condition', () => {
    expect(Object.keys(DESCRIPTIONS_GABARIT).sort()).toEqual([...GABARITS].sort());
    expect(DESCRIPTIONS_GABARIT.mosaique).toContain('dès deux captures');
  });
});

const BANQUE = ['Excel.png', 'Microsoft Teams.svg', 'SharePoint.png', 'Power BI.png', 'Power Automate.png'];

describe('resoudreLogos', () => {
  it('trouve par nom exact, sans casse ni accents', () => {
    expect(resoudreLogos('excel, sharepoint', BANQUE)).toEqual({ logos: ['Excel.png', 'SharePoint.png'], introuvables: [], ambigus: [] });
  });
  it('trouve par morceau de nom quand il est unique', () => {
    expect(resoudreLogos('Teams', BANQUE).logos).toEqual(['Microsoft Teams.svg']);
  });
  it('signale les noms ambigus et introuvables', () => {
    expect(resoudreLogos('Power; Word\nExcel', BANQUE)).toEqual({ logos: ['Excel.png'], introuvables: ['Word'], ambigus: ['Power'] });
  });
  it('garde 3 logos au plus, sans doublon', () => {
    expect(resoudreLogos('Excel, excel, Teams, SharePoint, Power BI', BANQUE).logos).toHaveLength(3);
  });
});
