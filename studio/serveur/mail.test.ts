import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import exemple from '../../fixtures/analyse-exemple.json';
import type { Publication } from '../../noyau/publication';
import { creerApiPublication, type ConfigPublication } from './publication';

const MONTAGE = {
  version: 1, titre: 'Essai', coupes: [],
  chapitres: [{ titre: 'Intro', debut: 0 }, { titre: 'Le SSO', debut: 3 }],
  termes: [{ terme: 'SSO', definition: 'Authentification unique.', occurrences: [3.8], statut: 'valide', position: 'bas' }],
  elements: [],
};
const RENDU = { version: 1, titre: 'Essai', statut: 'rendu', message: null };
const PROPOSITION = { titre: 'Le SSO expliqué', variantesTitre: ['A', 'B'], description: 'Desc', tags: ['sso'], accroches: ['Un seul mot de passe'], logiciels: ['Excel'] };
const PROPOSITION_VIGNETTE = {
  pose: 'surpris.jpg', logos: ['excel.png', 'inconnu.png'], captures: ['a.png', 'b.png'], gabarit: 'mosaique' as const, accroche: 'Planning facile', explication: 'Les captures en éventail.',
};
const REPONSE_VIGNETTE = { compris: 'Le planning en avant.', pasRealisable: [' Un fond vert — le fond est celui de la charte ', ''], propositions: [PROPOSITION_VIGNETTE] };
const SITE = {
  categories: [{ id: 1, nom: 'IA' }], playlists: [],
  classements: [
    { cle: 'outil', libelle: 'Par outil', multiple: false, obligatoire: true, valeurs: [{ id: 1, nom: 'Claude' }] },
    { cle: 'theme', libelle: 'Par thème', multiple: true, obligatoire: false, valeurs: [{ id: 5, nom: 'vibe-coding' }] },
  ],
};

let racine: string;
let url: string;
let serveur: http.Server;
let config: ConfigPublication;

async function tournage(nom: string, episode: unknown = RENDU): Promise<string> {
  const dossier = path.join(racine, 'tournages', nom);
  await mkdir(path.join(dossier, 'rendus'), { recursive: true });
  await writeFile(path.join(dossier, 'analyse.json'), JSON.stringify(exemple), 'utf-8');
  await writeFile(path.join(dossier, 'montage.json'), JSON.stringify(MONTAGE), 'utf-8');
  await writeFile(path.join(dossier, 'episode.json'), JSON.stringify(episode), 'utf-8');
  for (const f of ['video-complete.mp4', 'episode-01-intro.mp4', 'episode-02-le-sso.mp4']) await writeFile(path.join(dossier, 'rendus', f), '');
  return dossier;
}

const json = { 'Content-Type': 'application/json' };
const lirePublication = async (nom: string) => (await (await fetch(`${url}/api/tournages/${nom}/publication`)).json()).publication as Publication;
const envoyer = (nom: string, p: unknown) => fetch(`${url}/api/tournages/${nom}/publication`, { method: 'PUT', headers: json, body: JSON.stringify(p) });
const action = (nom: string, quoi: string, corps: unknown) =>
  fetch(`${url}/api/tournages/${nom}/publication/${quoi}`, { method: 'POST', headers: json, body: JSON.stringify(corps) });

beforeEach(async () => {
  racine = await mkdtemp(path.join(os.tmpdir(), 'pmt-publication-'));
  await mkdir(path.join(racine, 'tournages'));
  await mkdir(path.join(racine, 'poses'));
  await mkdir(path.join(racine, 'logos'));
  config = {
    racineTournages: path.join(racine, 'tournages'),
    cheminPoses: path.join(racine, 'poses'),
    cheminLogos: path.join(racine, 'logos'),
    urlFichiers: 'http://127.0.0.1:9999',
    urlPoses: 'http://127.0.0.1:9998',
    urlLogos: 'http://127.0.0.1:9997',
    urlSite: 'https://site.example',
    lireSite: vi.fn(async () => SITE),
    rediger: vi.fn(async () => PROPOSITION),
    proposerVignettes: vi.fn(async () => REPONSE_VIGNETTE),
    detourer: vi.fn(async (_entree: string, sortie: string) => { await writeFile(sortie, 'png'); }),
    rendreVignette: vi.fn(async (_props, sortie: string) => {
      await mkdir(path.dirname(sortie), { recursive: true });
      await writeFile(sortie, 'jpg');
      return { octets: 3, qualite: 90 };
    }),
    lireVisibiliteYoutube: vi.fn(async () => 'publique' as const),
    ouvrirDossier: vi.fn(async () => {}),
    site: {
      envoyerFichier: vi.fn(async (chemin: string) => (chemin.endsWith('.mp4') ? 'objet-video' : 'objet-vignette')),
      enregistrerVideo: vi.fn(async () => 42),
      supprimerVideo: vi.fn(async () => {}),
      creerValeur: vi.fn(async (_c: string, nom: string) => ({ id: 99, nom })),
    },
    mail: {
      sharepoint: { dossierLocal: path.join(racine, 'sharepoint'), site: 'https://sp.example/sites/vitrin3', bibliotheque: 'Bib' },
      copier: vi.fn(async () => true),
      rediger: vi.fn(async () => '---\nobjet: Essai\n---\n## Titre\n\n[À COMPLÉTER]\n'),
      construire: vi.fn(async (dossier: string) => {
        await mkdir(path.join(dossier, 'build'), { recursive: true });
        await writeFile(path.join(dossier, 'build', 'apercu-bureau.png'), 'png');
        return 'ok';
      }),
      brouillon: vi.fn(async () => 'Brouillon Outlook cree'),
      lireReference: vi.fn(async (r: string) => `contenu de ${r}`),
      logosBandeau: vi.fn(async () => ['there']),
    },
  };
  const api = creerApiPublication(config);
  serveur = http.createServer(async (req, res) => {
    if (!(await api(req, res))) res.writeHead(418).end();
  });
  await new Promise<void>(r => serveur.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>(r => serveur.close(() => r()));
});

const qualifier = async (nom: string, nature: 'pro' | 'perso') => {
  const p = await lirePublication(nom);
  await envoyer(nom, { ...p, videos: p.videos.map(v => ({ ...v, nature })) });
};
const mail = (nom: string, quoi: string, corps: unknown) => action(nom, `mail/${quoi}`, corps);
const detailMail = async (nom: string) => (await fetch(`${url}/api/tournages/${nom}/publication/mail?cible=complete`)).json();

describe('mail de com', () => {
  it('est refusé pour une vidéo Perso', async () => {
    await tournage('a');
    await qualifier('a', 'perso');
    const r = await mail('a', 'copie', { cible: 'complete' });
    expect(r.status).toBe(409);
    expect((await r.json()).erreur).toContain('Pro');
  });
  it('copie la vidéo sous le nom du tournage et enregistre l’URL', async () => {
    await tournage('a');
    await qualifier('a', 'pro');
    await mkdir(path.join(racine, 'sharepoint'));
    const d = await (await mail('a', 'copie', { cible: 'complete' })).json();
    expect(config.mail.copier).toHaveBeenCalledWith(
      path.join(racine, 'tournages', 'a', 'rendus', 'video-complete.mp4'), path.join(racine, 'sharepoint', 'a-video-complete.mp4'),
    );
    expect(d.etat.urlSharepoint).toContain('/_layouts/15/stream.aspx?id=%2Fsites%2Fvitrin3%2FBib%2Fa%2Dvideo%2Dcomplete%2Emp4');
    expect(d.etat.copieLe).not.toBeNull();
  });
  it('signale un dossier OneDrive absent', async () => {
    await tournage('a');
    await qualifier('a', 'pro');
    const r = await mail('a', 'copie', { cible: 'complete' });
    expect(r.status).toBe(409);
    expect((await r.json()).erreur).toContain('OneDrive');
  });
  it('refuse la rédaction avant la copie, puis écrit mail.md avec la vignette et les notes', async () => {
    await tournage('a');
    await qualifier('a', 'pro');
    expect((await mail('a', 'redaction', { cible: 'complete' })).status).toBe(409);
    await mkdir(path.join(racine, 'sharepoint'));
    await mail('a', 'copie', { cible: 'complete' });
    await fetch(`${url}/api/tournages/a/publication/mail`, { method: 'PUT', headers: json, body: JSON.stringify({ cible: 'complete', notes: 'Tester avant le 15' }) });
    const d = await (await mail('a', 'redaction', { cible: 'complete' })).json();
    const demande = vi.mocked(config.mail.rediger).mock.calls[0]![0];
    expect(demande.notes).toBe('Tester avant le 15');
    expect(demande.texte.length).toBeGreaterThan(0);
    expect(demande.urlVideo).toBe(d.etat.urlSharepoint);
    expect(demande.charte).toBe('contenu de references/redaction.md');
    expect(d.texte).toContain('objet: Essai');
    expect(d.aCompleter).toBe(true);
  });
  it('construit puis autorise le brouillon, que toute modification de mail.md rebloque', async () => {
    await tournage('a');
    await qualifier('a', 'pro');
    const corps = { cible: 'complete', texte: '---\nobjet: X\n---\nCorps\n' };
    await fetch(`${url}/api/tournages/a/publication/mail`, { method: 'PUT', headers: json, body: JSON.stringify(corps) });
    expect((await mail('a', 'brouillon', { cible: 'complete' })).status).toBe(409);
    const d = await (await mail('a', 'construire', { cible: 'complete' })).json();
    expect(d.apercus).toEqual(['apercu-bureau.png']);
    expect(d.brouillonPossible).toBe(true);
    const b = await (await mail('a', 'brouillon', { cible: 'complete' })).json();
    expect(b.etat.brouillonLe).not.toBeNull();
    await new Promise(r => setTimeout(r, 20));
    await fetch(`${url}/api/tournages/a/publication/mail`, { method: 'PUT', headers: json, body: JSON.stringify({ ...corps, texte: 'autre' }) });
    expect((await detailMail('a')).brouillonPossible).toBe(false);
  });
  it('rapporte l’échec du build et le journalise', async () => {
    await tournage('a');
    await qualifier('a', 'pro');
    await fetch(`${url}/api/tournages/a/publication/mail`, { method: 'PUT', headers: json, body: JSON.stringify({ cible: 'complete', texte: 'Corps' }) });
    vi.mocked(config.mail.construire).mockRejectedValueOnce(new Error('PIL absent'));
    const r = await mail('a', 'construire', { cible: 'complete' });
    expect(r.status).toBe(500);
    expect((await r.json()).erreur).toContain('PIL absent');
    expect(await readFile(path.join(racine, 'tournages', 'a', 'publication', 'complete', 'mail', 'journal.txt'), 'utf-8')).toContain('PIL absent');
  });
});
