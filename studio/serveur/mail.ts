import { existsSync } from 'node:fs';
import { appendFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import path from 'node:path';
import {
  A_COMPLETER, apercuDepuisMail, appliquerRetouches, brouillonPossible, dossierMail, ETAT_MAIL_VIDE, fichierSharepoint, raisonMail, urlSharepoint, type EtatMail,
} from '../../noyau/mail';
import { fichierVignette, type CiblePublication, type VideoPubliee } from '../../noyau/publication';
import type { Reglages } from '../../noyau/types';
import type { DetailMail, VideoDisponible } from '../commun';
import { ErreurInterpretation } from './consignes';
import { ecrireJson, ErreurHttp, message } from './http';
import type { RedigerMail, RetoucherMail } from './mail-claude';

export interface OutilsMail {
  sharepoint: Reglages['sharepoint'];
  copier: (source: string, cible: string) => Promise<boolean>;
  rediger: RedigerMail;
  construire: (dossierMail: string) => Promise<string>;
  retoucher: RetoucherMail;
  capturer: (dossierMail: string) => Promise<string>;
  // Copie de la vignette rendue avec un bouton de lecture par-dessus.
  vignetteLecture: (source: string, cible: string) => Promise<unknown>;
  brouillon: (dossierBuild: string) => Promise<string>;
  lireReference: (relatif: string) => Promise<string>;
  logosBandeau: () => Promise<string[]>;
}

// Ce que le serveur de publication sait de la vidéo visée.
export interface VideoMail {
  dossierTournage: string;
  urlTournage: string;
  cible: CiblePublication;
  video: VideoPubliee;
  disponible: VideoDisponible;
  // Paroles conservées et titres d'épisodes (vidéo complète), calculés par le serveur de publication.
  texte: string;
  chapitres: string[];
  modele: string;
}

const VIGNETTE = 'vignette.jpg';
const IMAGES = new Set(['.png', '.jpg', '.jpeg', '.gif']);

export function creerMail(o: OutilsMail) {
  const enCours = new Set<string>();
  const dossier = (v: VideoMail) => path.join(v.dossierTournage, ...dossierMail(v.cible).split('/'));
  const lire = async (f: string) => (existsSync(f) ? readFile(f, 'utf-8') : '');

  async function etat(v: VideoMail): Promise<EtatMail> {
    const texte = await lire(path.join(dossier(v), 'etat.json'));
    return texte ? { ...ETAT_MAIL_VIDE, ...(JSON.parse(texte) as Partial<EtatMail>) } : ETAT_MAIL_VIDE;
  }
  const noter = async (v: VideoMail, changement: Partial<EtatMail>) => {
    await mkdir(dossier(v), { recursive: true });
    await ecrireJson(path.join(dossier(v), 'etat.json'), { ...(await etat(v)), ...changement });
  };
  const journaliser = async (v: VideoMail, texte: string) => {
    await mkdir(dossier(v), { recursive: true });
    await appendFile(path.join(dossier(v), 'journal.txt'), `${new Date().toISOString()} ${texte.trim()}\n`, 'utf-8');
  };

  function verifier(v: VideoMail): void {
    const raison = raisonMail(v.video.nature, v.disponible.rendue);
    if (raison) throw new ErreurHttp(409, raison);
  }

  // Une action longue à la fois par vidéo ; l'échec est journalisé puis rendu au studio.
  async function exclusif(v: VideoMail, etape: string, action: () => Promise<void>): Promise<void> {
    const cle = `${v.dossierTournage}|${v.cible}`;
    if (enCours.has(cle)) throw new ErreurHttp(409, 'Une action est déjà en cours sur ce mail.');
    enCours.add(cle);
    try {
      await action();
    } catch (e) {
      if (e instanceof ErreurHttp) throw e;
      await journaliser(v, `${etape} : ${message(e)}`);
      if (e instanceof ErreurInterpretation) throw new ErreurHttp(e.statut, e.message);
      throw new ErreurHttp(500, `${etape} impossible : ${message(e)}`);
    } finally {
      enCours.delete(cle);
    }
  }

  async function detail(v: VideoMail): Promise<DetailMail> {
    const d = dossier(v);
    const texte = await lire(path.join(d, 'mail.md'));
    const fichiers = async (sous: string) => (existsSync(path.join(d, sous)) ? (await readdir(path.join(d, sous))).sort() : []);
    const e = await etat(v);
    const md = path.join(d, 'mail.md');
    return {
      etat: e,
      texte,
      notes: await lire(path.join(d, 'notes.txt')),
      images: (await fichiers('assets')).filter(f => f !== VIGNETTE && IMAGES.has(path.extname(f).toLowerCase())),
      apercus: (await fichiers('build')).filter(f => /^apercu-.*\.png$/.test(f)),
      urlBuild: `${v.urlTournage}/${dossierMail(v.cible)}/build`,
      aCompleter: texte.includes(A_COMPLETER),
      brouillonPossible: brouillonPossible(e, existsSync(md) ? (await stat(md)).mtimeMs : null),
    };
  }

  async function copier(v: VideoMail): Promise<DetailMail> {
    verifier(v);
    if (!existsSync(o.sharepoint.dossierLocal)) {
      throw new ErreurHttp(409, `Dossier OneDrive introuvable : ${o.sharepoint.dossierLocal}. Vérifiez la synchronisation de Vitrin3.`);
    }
    const fichier = fichierSharepoint(path.basename(v.dossierTournage), v.disponible.fichier);
    await exclusif(v, 'Copie sur SharePoint', async () => {
      await o.copier(path.join(v.dossierTournage, 'rendus', v.disponible.fichier), path.join(o.sharepoint.dossierLocal, fichier));
      await noter(v, { urlSharepoint: urlSharepoint(o.sharepoint, fichier), copieLe: new Date().toISOString() });
    });
    return detail(v);
  }

  async function enregistrer(v: VideoMail, corps: Record<string, unknown>): Promise<DetailMail> {
    verifier(v);
    await mkdir(dossier(v), { recursive: true });
    if (typeof corps.texte === 'string') await writeFile(path.join(dossier(v), 'mail.md'), corps.texte, 'utf-8');
    if (typeof corps.notes === 'string') await writeFile(path.join(dossier(v), 'notes.txt'), corps.notes, 'utf-8');
    return detail(v);
  }

  async function deposerImage(v: VideoMail, fichier: string, octets: Buffer): Promise<DetailMail> {
    verifier(v);
    const nom = path.basename(fichier).replace(/\s+/g, '-');
    if (!IMAGES.has(path.extname(nom).toLowerCase()) || nom === VIGNETTE) throw new ErreurHttp(400, 'Image attendue : PNG, JPEG ou GIF.');
    await mkdir(path.join(dossier(v), 'assets'), { recursive: true });
    await writeFile(path.join(dossier(v), 'assets', nom), octets);
    return detail(v);
  }

  // Reprend la vignette rendue à chaque rédaction et construction : une vignette refaite entre-temps est prise en compte.
  async function rafraichirVignette(v: VideoMail): Promise<boolean> {
    const source = path.join(v.dossierTournage, fichierVignette(v.cible));
    if (!existsSync(source)) return false;
    await mkdir(path.join(dossier(v), 'assets'), { recursive: true });
    await o.vignetteLecture(source, path.join(dossier(v), 'assets', VIGNETTE));
    return true;
  }

  async function rediger(v: VideoMail): Promise<DetailMail> {
    verifier(v);
    const e = await etat(v);
    if (!e.urlSharepoint) throw new ErreurHttp(409, 'Copiez d’abord la vidéo sur SharePoint : le mail a besoin de son adresse.');
    await exclusif(v, 'Rédaction', async () => {
      const vignette = (await rafraichirVignette(v)) ? VIGNETTE : null;
      const d = await detail(v);
      const texte = await o.rediger({
        titreVideo: v.video.titre || v.disponible.titre,
        description: v.video.description,
        texte: v.texte,
        chapitres: v.chapitres,
        notes: d.notes,
        images: d.images,
        vignette,
        urlVideo: e.urlSharepoint!,
        logosBandeau: await o.logosBandeau(),
        charte: await o.lireReference('references/redaction.md'),
        syntaxe: await o.lireReference('references/syntaxe.md'),
        exemple: await o.lireReference('examples/exemple-fico-there.md'),
        modele: v.modele,
      });
      await writeFile(path.join(dossier(v), 'mail.md'), texte, 'utf-8');
      await noter(v, { redigeLe: new Date().toISOString() });
    });
    return detail(v);
  }

  async function construire(v: VideoMail): Promise<DetailMail> {
    verifier(v);
    if (!(await lire(path.join(dossier(v), 'mail.md'))).trim()) throw new ErreurHttp(409, 'Rien à construire : mail.md est vide.');
    await exclusif(v, 'Construction', async () => {
      const debut = new Date().toISOString();
      await rafraichirVignette(v);
      await journaliser(v, await o.construire(dossier(v)));
      await noter(v, { construitLe: debut });
    });
    return detail(v);
  }

  // Retouche du HTML construit, pour ce mail seulement : mail.md n'est pas modifié, la prochaine construction l'efface.
  async function retoucher(v: VideoMail, consigne: string): Promise<DetailMail & { resumeRetouche: string }> {
    verifier(v);
    if (!consigne.trim()) throw new ErreurHttp(400, 'Décrivez la retouche voulue.');
    const build = path.join(dossier(v), 'build');
    if (!existsSync(path.join(build, 'mail.html'))) throw new ErreurHttp(409, 'Construisez d’abord le mail : la retouche porte sur le HTML construit.');
    let resume = '';
    await exclusif(v, 'Retouche', async () => {
      const html = await readFile(path.join(build, 'mail.html'), 'utf-8');
      const r = await o.retoucher({ consigne, html, modele: v.modele });
      resume = r.resume;
      if (r.remplacements.length === 0) return;
      const retouche = appliquerRetouches(html, r.remplacements);
      const manifeste = JSON.parse(await readFile(path.join(build, 'manifest.json'), 'utf-8')) as { images: { cid: string; file: string }[] };
      await writeFile(path.join(build, 'mail.html'), retouche, 'utf-8');
      await writeFile(path.join(build, 'preview.html'), apercuDepuisMail(retouche, manifeste.images), 'utf-8');
      await journaliser(v, `Retouche « ${consigne.trim()} » : ${resume}`);
      await journaliser(v, await o.capturer(dossier(v)));
    });
    return { ...(await detail(v)), resumeRetouche: resume };
  }

  async function brouillon(v: VideoMail): Promise<DetailMail> {
    verifier(v);
    if (!(await detail(v)).brouillonPossible) throw new ErreurHttp(409, 'Construisez d’abord le mail : le texte a changé depuis le dernier aperçu.');
    await exclusif(v, 'Brouillon Outlook', async () => {
      await journaliser(v, await o.brouillon(path.join(dossier(v), 'build')));
      await noter(v, { brouillonLe: new Date().toISOString() });
    });
    return detail(v);
  }

  return { detail, copier, enregistrer, deposerImage, rediger, construire, retoucher, brouillon };
}
