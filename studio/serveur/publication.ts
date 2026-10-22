import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { decisionsEpisodes, decisionsVideoComplete, dureeEpisode, dureeVideoComplete } from '../../noyau/decisions';
import {
  accorderPublication, appliquerModifications, cleVignette, fichierRendu, fichierVignette, imageCamera, imageEcran, modifierVideo,
  migrerPublication, poseDetouree, problemesPreparation, raisonPublication, urlsVignette, type CiblePublication, type Publication, type VideoPubliee,
} from '../../noyau/publication';
import { chapitresYoutube, descriptionYoutube, segmentsSecondes, texteConserve } from '../../noyau/publication-textes';
import { diffusion, NATURES, type Nature } from '../../noyau/qualification';
import { corpsRelais, enregistrerRelais, enregistrerRetrait, problemesRelais, raisonLectureRelais, urlYoutube } from '../../noyau/relais';
import type { Segment } from '../../noyau/types';
import {
  bilanLecture, dossierYoutube, enregistrerEnvoi, FORMES_URL, idYoutube, problemesEnvoi, raisonEnvoi, textesYoutube,
  type LectureYoutube, type VisibiliteYoutube,
} from '../../noyau/youtube';
import type { ProprietesVignette } from '../../remotion/composants/Vignette';
import type { ResultatVignette } from '../../remotion/scripts/vignette';
import { chargerTournage, lireEpisode, urlSource, type Tournage } from '../../remotion/scripts/tournage';
import type { DetailPublication, DossierYoutube, Pose, VerificationYoutube, VideoDisponible } from '../commun';
import { ErreurInterpretation } from './consignes';
import { dossierTournage, ecrireJson, ErreurHttp, lireCorps, message, repondre, repondreErreur } from './http';
import type { Rediger } from './redaction';
import type { ClientSite, ReferencesSite } from './site-replit';
import { ecrireDossierYoutube } from './youtube';

export interface ConfigPublication {
  racineTournages: string;
  cheminPoses: string;
  // Serveurs de fichiers : dossiers de tournage, banque de poses.
  urlFichiers: string;
  urlPoses: string;
  urlSite: string | undefined;
  lireSite: (urlSite: string | undefined) => Promise<ReferencesSite | null>;
  rediger: Rediger;
  extraireImage: (video: string, instant: number, sortie: string) => Promise<void>;
  detourer: (entree: string, sortie: string) => Promise<void>;
  rendreVignette: (props: ProprietesVignette, sortie: string, octetsMax: number) => Promise<ResultatVignette>;
  // Visibilité vue par l’adresse publique oEmbed, et ouverture d’un dossier dans l’Explorateur.
  lireVisibiliteYoutube: (id: string) => Promise<LectureYoutube>;
  ouvrirDossier: (dossier: string) => Promise<void>;
  // Écritures sur le site (clé d’API de .env) ; null si l’adresse ou la clé manque.
  site: ClientSite | null;
}

const EXTENSIONS_VIDEO = new Set(['.mp4', '.mkv', '.mov', '.webm']);
const EXTENSIONS_PHOTO = new Set(['.jpg', '.jpeg', '.png']);
const estCamera = (fichier: string) => path.parse(fichier).name.toLowerCase().endsWith('-camera');

// Enregistrement de la webcam seule, utilisable s'il accompagne un seul autre enregistrement (mêmes temps que source.mp4).
export async function fichierCamera(dossier: string): Promise<string | null> {
  const bruts = path.join(dossier, 'bruts');
  const fichiers = existsSync(bruts) ? (await readdir(bruts)).filter(f => EXTENSIONS_VIDEO.has(path.extname(f).toLowerCase())) : [];
  const cameras = fichiers.filter(estCamera);
  return cameras.length === 1 && fichiers.length === 2 ? cameras[0]! : null;
}

async function lirePublication(dossier: string): Promise<Publication | null> {
  const chemin = path.join(dossier, 'publication.json');
  if (!existsSync(chemin)) return null;
  let valeur: unknown;
  try {
    // Une version 1 est convertie ici et réécrite en version 2 au prochain enregistrement.
    valeur = migrerPublication(JSON.parse(await readFile(chemin, 'utf-8')));
  } catch (e) {
    throw new ErreurHttp(409, `publication.json illisible : ${message(e)}`);
  }
  const probleme = raisonPublication(valeur);
  if (probleme) throw new ErreurHttp(409, `publication.json invalide : ${probleme}`);
  return valeur as Publication;
}

const ecrirePublication = (dossier: string, p: Publication) => ecrireJson(path.join(dossier, 'publication.json'), p);
const videoDe = (p: Publication, cible: CiblePublication): VideoPubliee => p.videos.find(v => v.cible === cible)!;
const objet = (corps: unknown): Record<string, unknown> => (corps && typeof corps === 'object' ? (corps as Record<string, unknown>) : {});

interface Contexte {
  dossier: string;
  tournage: Tournage;
  cibles: CiblePublication[];
  videos: VideoDisponible[];
  // Passages conservés d'une vidéo, en secondes de la source.
  segments: (cible: CiblePublication) => Segment[];
  publication: Publication;
}

function lireCible(corps: unknown, cibles: CiblePublication[]): CiblePublication {
  const v = objet(corps).cible;
  const cible = cibles.find(c => c === v);
  if (cible === undefined) throw new ErreurHttp(400, `cible attendue : « complete » ou un numéro d’épisode de 1 à ${cibles.length - 1}.`);
  return cible;
}

export function creerApiPublication(c: ConfigPublication): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  let vignetteEnCours = false;
  let relaisEnCours = false;
  const urlTournage = (dossier: string) => `${c.urlFichiers}/${encodeURIComponent(path.basename(dossier))}`;

  async function contexte(dossier: string): Promise<Contexte> {
    if ((await lireEpisode(dossier)).statut !== 'rendu') {
      throw new ErreurHttp(409, 'La publication s’ouvre une fois le rendu terminé.');
    }
    let tournage: Tournage;
    try {
      tournage = await chargerTournage(dossier, { brouillon: false });
    } catch (e) {
      throw new ErreurHttp(409, message(e));
    }
    const { analyse, montage, reglages } = tournage;
    const fps = analyse.fps;
    const episodes = decisionsEpisodes(analyse, montage, reglages, '');
    const complete = decisionsVideoComplete(analyse, montage, reglages, '');
    const titres = episodes.map(e => e.titre);
    const cibles: CiblePublication[] = ['complete', ...episodes.map((_, i) => i + 1)];
    const videos = cibles.map((cible): VideoDisponible => {
      const episode = cible === 'complete' ? null : episodes[cible - 1]!;
      const fichier = fichierRendu(cible, titres);
      return {
        cible,
        titre: episode ? episode.titre : montage.titre,
        fichier,
        rendue: existsSync(path.join(dossier, 'rendus', fichier)),
        dureeSecondes: (episode ? dureeEpisode(episode) : dureeVideoComplete(complete)) / fps,
        chapitres: episode ? [] : chapitresYoutube(complete),
      };
    });
    const segments = (cible: CiblePublication) => (cible === 'complete'
      ? complete.parties.flatMap(p => segmentsSecondes(p, fps))
      : segmentsSecondes(episodes[cible - 1]!.partie, fps));
    return { dossier, tournage, cibles, videos, segments, publication: accorderPublication(await lirePublication(dossier), cibles) };
  }

  // Relue avant d'écrire après une attente (Claude, rendu) : l'auteur a pu modifier autre chose entre-temps.
  const relire = async (ctx: Contexte) => accorderPublication(await lirePublication(ctx.dossier), ctx.cibles);

  async function detail(ctx: Contexte): Promise<DetailPublication> {
    return {
      nom: path.basename(ctx.dossier),
      titre: ctx.tournage.titre,
      sourceUrl: urlSource(c.urlFichiers, ctx.tournage.nom),
      urlTournage: urlTournage(ctx.dossier),
      urlPoses: c.urlPoses,
      publication: ctx.publication,
      videos: ctx.videos,
      camera: await fichierCamera(ctx.dossier),
      site: await c.lireSite(c.urlSite),
      urlSite: c.urlSite ?? null,
      reglages: ctx.tournage.reglages.publication,
    };
  }

  async function enregistrer(req: IncomingMessage, ctx: Contexte): Promise<Publication> {
    const corps = await lireCorps(req);
    const probleme = raisonPublication(corps);
    if (probleme) throw new ErreurHttp(400, `publication invalide : ${probleme}`);
    const p = accorderPublication(appliquerModifications(ctx.publication, corps as Publication), ctx.cibles);
    await ecrirePublication(ctx.dossier, p);
    return p;
  }

  async function rediger(req: IncomingMessage, ctx: Contexte): Promise<Publication> {
    const cible = lireCible(await lireCorps(req), ctx.cibles);
    const { analyse, montage, reglages } = ctx.tournage;
    const texte = texteConserve(analyse.mots, ctx.segments(cible));
    if (!texte) throw new ErreurHttp(422, 'Aucune parole conservée dans cette vidéo : rien à résumer.');
    let proposition;
    try {
      proposition = await c.rediger({
        titreVideo: ctx.videos.find(v => v.cible === cible)!.titre,
        texte,
        chapitres: cible === 'complete' ? ctx.videos.filter(v => v.cible !== 'complete').map(v => v.titre) : [],
        termes: montage.termes.filter(t => t.statut === 'valide').map(t => ({ terme: t.terme, definition: t.definition })),
        qualification: { nature: videoDe(ctx.publication, cible).nature, confidentielle: videoDe(ctx.publication, cible).confidentielle },
        modele: reglages.modeles.claude,
      });
    } catch (e) {
      if (e instanceof ErreurInterpretation) throw new ErreurHttp(e.statut, e.message);
      throw new ErreurHttp(500, `Rédaction impossible : ${message(e)}`);
    }
    const actuelle = await relire(ctx);
    // La première accroche va dans la vignette déjà composée ; les autres restent à essayer.
    const vignette = videoDe(actuelle, cible).vignette;
    const accroche = proposition.accroches[0];
    const changement = vignette && accroche ? { ...proposition, vignette: { ...vignette, accroche } } : proposition;
    const p = appliquerModifications(actuelle, modifierVideo(actuelle, cible, changement));
    await ecrirePublication(ctx.dossier, p);
    return p;
  }

  async function executerPipeline(f: () => Promise<void>): Promise<void> {
    try {
      await f();
    } catch (e) {
      throw new ErreurHttp(500, `Image impossible : ${message(e)}`);
    }
  }

  async function image(req: IncomingMessage, ctx: Contexte): Promise<{ chemin: string }> {
    const o = objet(await lireCorps(req));
    const duree = ctx.tournage.analyse.duree;
    const instant = o.instant;
    if (typeof instant !== 'number' || !Number.isFinite(instant) || instant < 0 || instant > duree) {
      throw new ErreurHttp(400, `instant attendu entre 0 et ${duree} s.`);
    }
    if (o.source === 'ecran') {
      const chemin = imageEcran(instant);
      const sortie = path.join(ctx.dossier, chemin);
      if (!existsSync(sortie)) await executerPipeline(() => c.extraireImage(path.join(ctx.dossier, 'source.mp4'), instant, sortie));
      return { chemin };
    }
    if (o.source === 'camera') {
      const camera = await fichierCamera(ctx.dossier);
      if (!camera) throw new ErreurHttp(409, 'Aucun enregistrement caméra séparé dans bruts/ (accompagnant un seul autre enregistrement).');
      const { brute, detouree } = imageCamera(instant);
      const sortie = path.join(ctx.dossier, detouree);
      if (!existsSync(sortie)) {
        await executerPipeline(() => c.extraireImage(path.join(ctx.dossier, 'bruts', camera), instant, path.join(ctx.dossier, brute)));
        await executerPipeline(() => c.detourer(path.join(ctx.dossier, brute), sortie));
      }
      return { chemin: detouree };
    }
    throw new ErreurHttp(400, 'source attendue : « ecran » ou « camera ».');
  }

  async function vignette(req: IncomingMessage, ctx: Contexte): Promise<Publication> {
    const cible = lireCible(await lireCorps(req), ctx.cibles);
    const v = videoDe(ctx.publication, cible).vignette;
    if (!v) throw new ErreurHttp(422, 'Composez d’abord la vignette : pose, fond et accroche.');
    if (!v.accroche.trim()) throw new ErreurHttp(422, 'Accroche vide.');
    const images = [
      v.pose.source === 'banque' ? path.join(c.cheminPoses, poseDetouree(v.pose.fichier)) : path.join(ctx.dossier, imageCamera(v.pose.instant).detouree),
      ...(v.fond.source === 'ecran' ? [path.join(ctx.dossier, imageEcran(v.fond.instant))] : []),
    ];
    if (!images.every(f => existsSync(f))) throw new ErreurHttp(409, 'Image de la vignette absente : choisissez de nouveau la pose ou le fond.');
    if (vignetteEnCours) throw new ErreurHttp(409, 'Une vignette est déjà en cours de rendu.');
    vignetteEnCours = true;
    const cle = cleVignette(v);
    const chemin = fichierVignette(cible);
    try {
      const urls = urlsVignette(v, { tournage: urlTournage(ctx.dossier), poses: c.urlPoses });
      await c.rendreVignette({ fondUrl: urls.fond, poseUrl: urls.pose, accroche: v.accroche.trim() }, path.join(ctx.dossier, chemin),
        ctx.tournage.reglages.publication.vignetteOctetsMax);
    } catch (e) {
      const actuelle = await relire(ctx);
      await ecrirePublication(ctx.dossier, modifierVideo(actuelle, cible, {
        erreur: { etape: 'vignette', message: message(e), le: new Date().toISOString() },
      }));
      throw new ErreurHttp(500, `Rendu de la vignette impossible : ${message(e)}`);
    } finally {
      vignetteEnCours = false;
    }
    const actuelle = await relire(ctx);
    const video = videoDe(actuelle, cible);
    // La vignette a pu changer pendant le rendu : le fichier ne vaut que pour celle qui a été rendue.
    const p = video.vignette && cleVignette(video.vignette) === cle
      ? modifierVideo(actuelle, cible, { vignette: { ...video.vignette, fichier: chemin }, erreur: null })
      : actuelle;
    await ecrirePublication(ctx.dossier, p);
    return p;
  }

  async function valider(req: IncomingMessage, ctx: Contexte): Promise<Publication> {
    const cible = lireCible(await lireCorps(req), ctx.cibles);
    const video = videoDe(ctx.publication, cible);
    const disponible = ctx.videos.find(v => v.cible === cible)!;
    const vignettePresente = !!video.vignette?.fichier && existsSync(path.join(ctx.dossier, video.vignette.fichier));
    const problemes = problemesPreparation(video, descriptionYoutube(video.description, disponible.chapitres),
      ctx.tournage.reglages.publication, vignettePresente);
    if (!disponible.rendue) problemes.unshift(`Rendu absent : ${disponible.fichier}.`);
    if (problemes.length > 0) throw new ErreurHttp(422, 'La vidéo n’est pas prête.', problemes);
    const statut = video.statut === 'a-preparer' || video.statut === 'erreur' ? 'prete' : video.statut;
    const p = modifierVideo(ctx.publication, cible, { statut, erreur: null });
    await ecrirePublication(ctx.dossier, p);
    return p;
  }

  async function preparerYoutube(req: IncomingMessage, ctx: Contexte): Promise<DossierYoutube> {
    const cible = lireCible(await lireCorps(req), ctx.cibles);
    const video = videoDe(ctx.publication, cible);
    const disponible = ctx.videos.find(v => v.cible === cible)!;
    const descriptionFinale = descriptionYoutube(video.description, disponible.chapitres);
    const vignette = video.vignette?.fichier ? path.join(ctx.dossier, video.vignette.fichier) : null;
    const octetsVignette = vignette && existsSync(vignette) ? (await stat(vignette)).size : null;
    const problemes = problemesEnvoi(video, descriptionFinale, ctx.tournage.reglages.publication, {
      rendu: { fichier: disponible.fichier, present: disponible.rendue },
      octetsVignette,
    });
    if (problemes.length > 0 || !vignette) throw new ErreurHttp(422, 'La vidéo ne peut pas être préparée pour YouTube.', problemes);
    const rendu = path.join(ctx.dossier, 'rendus', disponible.fichier);
    // Une playlist par tournage n’a de sens que si plusieurs de ses vidéos sont publiées.
    const plusieurs = ctx.publication.videos.filter(v => v.publier).length > 1;
    const dossier = path.join(ctx.dossier, dossierYoutube(cible));
    const aTeleverser = path.join(dossier, disponible.fichier);
    const textes = textesYoutube(video, descriptionFinale, { playlist: plusieurs ? ctx.tournage.titre : null, cheminRendu: aTeleverser });
    await ecrireDossierYoutube(dossier, textes, vignette, rendu);
    return { dossier, rendu: aTeleverser, textes };
  }

  async function ouvrirYoutube(req: IncomingMessage, ctx: Contexte): Promise<{ ok: true }> {
    const dossier = path.join(ctx.dossier, dossierYoutube(lireCible(await lireCorps(req), ctx.cibles)));
    if (!existsSync(dossier)) throw new ErreurHttp(409, 'Préparez d’abord le dossier pour YouTube.');
    try {
      await c.ouvrirDossier(dossier);
    } catch (e) {
      throw new ErreurHttp(500, `Ouverture du dossier impossible : ${message(e)}`);
    }
    return { ok: true };
  }

  async function envoiYoutube(req: IncomingMessage, ctx: Contexte): Promise<Publication> {
    const corps = await lireCorps(req);
    const cible = lireCible(corps, ctx.cibles);
    const o = objet(corps);
    const id = typeof o.url === 'string' ? idYoutube(o.url) : null;
    if (!id) throw new ErreurHttp(400, `URL YouTube non reconnue. ${FORMES_URL}`);
    if (!['privee', 'non-repertoriee', 'publique', 'programmee'].includes(o.visibilite as string)) {
      throw new ErreurHttp(400, 'visibilite attendue : « privee », « non-repertoriee », « publique » ou « programmee ».');
    }
    if (o.programmeeLe !== null && typeof o.programmeeLe !== 'string') throw new ErreurHttp(400, 'programmeeLe attendu : date ISO ou null.');
    const envoi = { id, visibilite: o.visibilite as VisibiliteYoutube, programmeeLe: o.programmeeLe };
    const video = videoDe(ctx.publication, cible);
    const refus = raisonEnvoi(video, envoi);
    if (refus) throw new ErreurHttp(422, refus);
    const p = modifierVideo(ctx.publication, cible, enregistrerEnvoi(video, envoi));
    await ecrirePublication(ctx.dossier, p);
    return p;
  }

  async function verifierYoutube(req: IncomingMessage, ctx: Contexte): Promise<VerificationYoutube> {
    const video = videoDe(ctx.publication, lireCible(await lireCorps(req), ctx.cibles));
    const id = video.youtube.id;
    if (!id) throw new ErreurHttp(409, 'Collez d’abord l’URL de la vidéo mise en ligne.');
    const lecture = await c.lireVisibiliteYoutube(id);
    return { lecture, ...bilanLecture(video, lecture, new Date()) };
  }

  async function relayer(req: IncomingMessage, ctx: Contexte): Promise<Publication> {
    const cible = lireCible(await lireCorps(req), ctx.cibles);
    const video = videoDe(ctx.publication, cible);
    const disponible = ctx.videos.find(v => v.cible === cible)!;
    const vignette = video.vignette?.fichier ? path.join(ctx.dossier, video.vignette.fichier) : null;
    const octetsVignette = vignette && existsSync(vignette) ? (await stat(vignette)).size : null;
    const problemes = problemesRelais(video, descriptionYoutube(video.description, disponible.chapitres), ctx.tournage.reglages.publication, {
      rendu: { fichier: disponible.fichier, present: disponible.rendue },
      octetsVignette,
      siteConfigure: c.site !== null,
    });
    if (problemes.length > 0 || !vignette || !c.site) throw new ErreurHttp(422, 'La vidéo ne peut pas être relayée sur le site.', problemes);
    const idYoutube = video.youtube.id;
    const lien = diffusion(video).site === 'lien';
    if (lien && idYoutube) {
      const refus = raisonLectureRelais(video, await c.lireVisibiliteYoutube(idYoutube), new Date());
      if (refus) throw new ErreurHttp(422, refus);
    }
    if (relaisEnCours) throw new ErreurHttp(409, 'Un relais est déjà en cours.');
    relaisEnCours = true;
    let id: number;
    try {
      const thumbnailObject = await c.site.envoyerFichier(vignette, 'image/jpeg');
      // Pro confidentielle : le fichier est hébergé sur le site ; Pro non confidentielle : la vidéo YouTube y est intégrée.
      const fichier = lien && idYoutube
        ? { videoUrl: urlYoutube(idYoutube), videoObject: null }
        : { videoObject: await c.site.envoyerFichier(path.join(ctx.dossier, 'rendus', disponible.fichier), 'video/mp4'), videoUrl: null };
      id = await c.site.enregistrerVideo(video.replit.id, corpsRelais(video, { dureeSecondes: disponible.dureeSecondes, fichier, thumbnailObject }));
    } catch (e) {
      const actuelle = await relire(ctx);
      await ecrirePublication(ctx.dossier, modifierVideo(actuelle, cible, {
        erreur: { etape: 'replit', message: message(e), le: new Date().toISOString() },
      }));
      throw new ErreurHttp(502, `Relais impossible : ${message(e)}`);
    } finally {
      relaisEnCours = false;
    }
    const actuelle = await relire(ctx);
    const p = modifierVideo(actuelle, cible, enregistrerRelais(videoDe(actuelle, cible), id));
    await ecrirePublication(ctx.dossier, p);
    return p;
  }

  // Requalification qui fait sortir une vidéo du site : la qualification est enregistrée d’abord, pour que la vidéo
  // reste Perso et le retrait à faire même si le site échoue ; le statut ne change qu’une fois la vidéo retirée.
  async function retirerDuSite(req: IncomingMessage, ctx: Contexte): Promise<Publication> {
    const corps = await lireCorps(req);
    const cible = lireCible(corps, ctx.cibles);
    const o = objet(corps);
    if (!NATURES.includes(o.nature as Nature) || typeof o.confidentielle !== 'boolean') {
      throw new ErreurHttp(400, 'nature (« pro » ou « perso ») et confidentielle (vrai ou faux) attendues.');
    }
    const qualification = { nature: o.nature as Nature, confidentielle: o.confidentielle };
    const id = videoDe(ctx.publication, cible).replit.id;
    if (id === null || diffusion(qualification).site !== 'aucun') {
      throw new ErreurHttp(409, 'Rien à retirer : la vidéo n’est pas sur le site, ou sa qualification l’y garde.');
    }
    if (!c.site) throw new ErreurHttp(422, 'Site non configuré : renseignez REPLIT_SITE_URL et REPLIT_API_KEY dans .env, puis relancez le studio.');
    if (relaisEnCours) throw new ErreurHttp(409, 'Un relais est déjà en cours.');
    relaisEnCours = true;
    try {
      await ecrirePublication(ctx.dossier, appliquerModifications(ctx.publication, modifierVideo(ctx.publication, cible, qualification)));
      await c.site.supprimerVideo(id);
    } catch (e) {
      const raison = `Retrait du site impossible : ${message(e)}`;
      const actuelle = await relire(ctx);
      await ecrirePublication(ctx.dossier, modifierVideo(actuelle, cible, { erreur: { etape: 'replit', message: raison, le: new Date().toISOString() } }));
      throw new ErreurHttp(502, raison);
    } finally {
      relaisEnCours = false;
    }
    const actuelle = await relire(ctx);
    const p = modifierVideo(actuelle, cible, enregistrerRetrait(videoDe(actuelle, cible)));
    await ecrirePublication(ctx.dossier, p);
    return p;
  }

  // Photos de donnees/poses/, détourées à la première demande puis chaque fois que la photo change.
  // Les appels simultanés (double montage de l’écran) partagent le même passage : un seul détourage par photo.
  let posesEnCours: Promise<Pose[]> | null = null;
  function poses(): Promise<Pose[]> {
    posesEnCours ??= calculerPoses().finally(() => { posesEnCours = null; });
    return posesEnCours;
  }

  async function calculerPoses(): Promise<Pose[]> {
    const fichiers = existsSync(c.cheminPoses) ? await readdir(c.cheminPoses) : [];
    const photos = fichiers
      .filter(f => EXTENSIONS_PHOTO.has(path.extname(f).toLowerCase()) && !f.toLowerCase().endsWith('.detoure.png'))
      .sort();
    const resultat: Pose[] = [];
    for (const photo of photos) {
      const source = path.join(c.cheminPoses, photo);
      const detouree = path.join(c.cheminPoses, poseDetouree(photo));
      const aJour = existsSync(detouree) && (await stat(detouree)).mtimeMs >= (await stat(source)).mtimeMs;
      if (!aJour) {
        try {
          await c.detourer(source, detouree);
        } catch (e) {
          throw new ErreurHttp(500, `Détourage de ${photo} impossible : ${message(e)}`);
        }
      }
      resultat.push({ fichier: photo, url: `${c.urlPoses}/${encodeURIComponent(poseDetouree(photo))}` });
    }
    return resultat;
  }

  return async function traiter(req, res) {
    const chemin = new URL(req.url ?? '/', 'http://local').pathname;
    const route = /^\/api\/tournages\/([^/]+)\/publication(?:\/(redaction|image|vignette|valider|relais|site\/retirer|youtube\/(?:preparer|ouvrir|envoi|verifier)))?$/
      .exec(chemin);
    if (!route && chemin !== '/api/poses') return false;
    try {
      if (!route) {
        if (req.method !== 'GET') throw new ErreurHttp(405, 'Méthode non permise.');
        repondre(res, 200, await poses());
        return true;
      }
      const ctx = await contexte(dossierTournage(c.racineTournages, route[1]!));
      const action = route[2];
      if (!action && req.method === 'GET') repondre(res, 200, await detail(ctx));
      else if (!action && req.method === 'PUT') repondre(res, 200, await enregistrer(req, ctx));
      else if (action === 'redaction' && req.method === 'POST') repondre(res, 200, await rediger(req, ctx));
      else if (action === 'image' && req.method === 'POST') repondre(res, 200, await image(req, ctx));
      else if (action === 'vignette' && req.method === 'POST') repondre(res, 200, await vignette(req, ctx));
      else if (action === 'valider' && req.method === 'POST') repondre(res, 200, await valider(req, ctx));
      else if (action === 'youtube/preparer' && req.method === 'POST') repondre(res, 200, await preparerYoutube(req, ctx));
      else if (action === 'youtube/ouvrir' && req.method === 'POST') repondre(res, 200, await ouvrirYoutube(req, ctx));
      else if (action === 'youtube/envoi' && req.method === 'POST') repondre(res, 200, await envoiYoutube(req, ctx));
      else if (action === 'youtube/verifier' && req.method === 'POST') repondre(res, 200, await verifierYoutube(req, ctx));
      else if (action === 'relais' && req.method === 'POST') repondre(res, 200, await relayer(req, ctx));
      else if (action === 'site/retirer' && req.method === 'POST') repondre(res, 200, await retirerDuSite(req, ctx));
      else repondre(res, 404, { erreur: 'Route inconnue.' });
    } catch (e) {
      repondreErreur(res, e);
    }
    return true;
  };
}
