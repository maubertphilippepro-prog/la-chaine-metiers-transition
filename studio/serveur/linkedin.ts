import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BRIEF_VIDE, dossierLinkedin, fichierPost, lireProfils, PROFILS_LINKEDIN, type BriefLinkedin, type ProfilLinkedin } from '../../noyau/linkedin';
import type { DetailLinkedin } from '../commun';
import { ErreurInterpretation } from './consignes';
import { ecrireJson, ErreurHttp, message } from './http';
import type { Bibliotheque, RedigerPost } from './linkedin-claude';
import type { VideoMail } from './mail';

export interface OutilsLinkedin {
  rediger: RedigerPost;
  lireBibliotheque: (p: ProfilLinkedin) => Promise<Bibliotheque>;
}

// Inspirations retenues par Claude pour chaque post, dans linkedin/etat.json.
type EtatLinkedin = Partial<Record<ProfilLinkedin, { inspirations: string[]; redigeLe: string }>>;

export function creerLinkedin(o: OutilsLinkedin) {
  const enCours = new Set<string>();
  const dossier = (v: VideoMail) => path.join(v.dossierTournage, ...dossierLinkedin(v.cible).split('/'));
  const lire = async (f: string) => (existsSync(f) ? readFile(f, 'utf-8') : '');

  function verifier(v: VideoMail): void {
    if (v.video.nature !== 'pro') throw new ErreurHttp(409, 'Le post LinkedIn est réservé aux vidéos Pro.');
  }

  async function detail(v: VideoMail): Promise<DetailLinkedin> {
    const d = dossier(v);
    const brief = await lire(path.join(d, 'brief.json'));
    const etat = await lire(path.join(d, 'etat.json'));
    const posts: DetailLinkedin['posts'] = {};
    for (const p of PROFILS_LINKEDIN) {
      const texte = await lire(path.join(d, fichierPost(p)));
      if (texte) posts[p] = texte;
    }
    return {
      brief: brief ? { ...BRIEF_VIDE, ...(JSON.parse(brief) as Partial<BriefLinkedin>) } : BRIEF_VIDE,
      posts,
      inspirations: Object.fromEntries(Object.entries(etat ? (JSON.parse(etat) as EtatLinkedin) : {}).map(([p, e]) => [p, e.inspirations])),
    };
  }

  async function enregistrer(v: VideoMail, corps: Record<string, unknown>): Promise<DetailLinkedin> {
    verifier(v);
    await mkdir(dossier(v), { recursive: true });
    if (corps.brief && typeof corps.brief === 'object') {
      const b = corps.brief as Record<string, unknown>;
      const brief = Object.fromEntries(Object.keys(BRIEF_VIDE).map(k => [k, typeof b[k] === 'string' ? b[k] : ''])) as unknown as BriefLinkedin;
      await ecrireJson(path.join(dossier(v), 'brief.json'), brief);
    }
    if (corps.posts && typeof corps.posts === 'object') {
      for (const p of PROFILS_LINKEDIN) {
        const texte = (corps.posts as Record<string, unknown>)[p];
        if (typeof texte === 'string') await writeFile(path.join(dossier(v), fichierPost(p)), texte, 'utf-8');
      }
    }
    return detail(v);
  }

  // Un post par profil demandé, rédigés l'un après l'autre : chaque profil a sa propre bibliothèque.
  async function rediger(v: VideoMail, corps: Record<string, unknown>): Promise<DetailLinkedin> {
    verifier(v);
    let profils: ProfilLinkedin[];
    try { profils = lireProfils(corps.profils); } catch (e) { throw new ErreurHttp(400, message(e)); }
    const cle = `${v.dossierTournage}|${v.cible}`;
    if (enCours.has(cle)) throw new ErreurHttp(409, 'Une rédaction est déjà en cours pour ce post.');
    enCours.add(cle);
    try {
      const { brief } = await detail(v);
      await mkdir(dossier(v), { recursive: true });
      for (const profil of profils) {
        const r = await o.rediger({
          profil,
          titreVideo: v.video.titre || v.disponible.titre,
          description: v.video.description,
          texte: v.texte,
          chapitres: v.chapitres,
          brief,
          bibliotheque: await o.lireBibliotheque(profil),
          modele: v.modele,
        });
        await writeFile(path.join(dossier(v), fichierPost(profil)), r.post, 'utf-8');
        const etat = await lire(path.join(dossier(v), 'etat.json'));
        await ecrireJson(path.join(dossier(v), 'etat.json'), {
          ...(etat ? (JSON.parse(etat) as EtatLinkedin) : {}),
          [profil]: { inspirations: r.inspirations, redigeLe: new Date().toISOString() },
        });
      }
    } catch (e) {
      if (e instanceof ErreurHttp) throw e;
      await mkdir(dossier(v), { recursive: true });
      await appendFile(path.join(dossier(v), 'journal.txt'), `${new Date().toISOString()} Rédaction : ${message(e)}\n`, 'utf-8');
      if (e instanceof ErreurInterpretation) throw new ErreurHttp(e.statut, e.message);
      throw new ErreurHttp(500, `Rédaction impossible : ${message(e)}`);
    } finally {
      enCours.delete(cle);
    }
    return detail(v);
  }

  return { detail, enregistrer, rediger };
}
