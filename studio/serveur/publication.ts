import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { logosSuggeres, MAX_ELEMENTS, resoudreLogos } from '../../noyau/gabarits';
import { decisionsEpisodes, decisionsVideoComplete, dureeEpisode, dureeVideoComplete } from '../../noyau/decisions';
import {
  accorderPublication, appliquerModifications, cleVignette, DOSSIER_CAPTURES, fichierRendu, fichierVignette, gabaritsAutres, modifierVideo,
  MAX_PROPOSITIONS_VIGNETTE, migrerPublication, poseDetouree, problemesPreparation, raisonPublication, proprietesVignette, type CiblePublication, type ConsigneVignette, type ProprietesVignette, type Publication, type VideoPubliee, type Vignette,
} from '../../noyau/publication';
import { chapitresYoutube, descriptionYoutube, segmentsSecondes, texteConserve } from '../../noyau/publication-textes';
import { diffusion, NATURES, type Nature } from '../../noyau/qualification';
import type { ValeurClassement } from '../../noyau/classements';
import { corpsRelais, enregistrerRelais, enregistrerRetrait, problemesRelais, raisonLectureRelais, urlYoutube } from '../../noyau/relais';
import type { Segment } from '../../noyau/types';
import {
  bilanLecture, dossierYoutube, enregistrerEnvoi, FORMES_URL, idYoutube, problemesEnvoi, raisonEnvoi, textesYoutube,
  type LectureYoutube, type VisibiliteYoutube,
} from '../../noyau/youtube';
import type { ResultatVignette } from '../../remotion/scripts/vignette';
import { chargerTournage, lireEpisode, type Tournage } from '../../remotion/scripts/tournage';
import type { DetailPublication, DossierYoutube, Logo, Pose, VerificationYoutube, VideoDisponible } from '../commun';
import { ErreurInterpretation } from './consignes';
import { dossierTournage, ecrireJson, ErreurHttp, lireCorps, lireOctets, message, repondre, repondreErreur } from './http';
import type { Rediger } from './redaction';
import type { ClientSite, ReferencesSite } from './site-replit';
import type { ImageClaude, ReduireImage } from './images';
import { nettoyerPropositionsVignette, type ProposerVignettes, type ReponseVignette } from './vignette-claude';
import { ecrireDossierYoutube } from './youtube';
import { creerLinkedin, type OutilsLinkedin } from './linkedin';
import { creerMail, type OutilsMail, type VideoMail } from './mail';

export interface ConfigPublication {
  racineTournages: string;
  cheminPoses: string;
  cheminLogos: string;
  // Serveurs de fichiers : dossiers de tournage, banque de poses, banque de logos.
  urlFichiers: string;
  urlPoses: string;
  urlLogos: string;
  urlSite: string | undefined;
  lireSite: (urlSite: string | undefined) => Promise<ReferencesSite | null>;
  rediger: Rediger;
  proposerVignettes: ProposerVignettes;
  // Images réduites envoyées à Claude avec la demande de vignette.
  reduireImage: ReduireImage;
  detourer: (entree: string, sortie: string) => Promise<void>;
  rendreVignette: (props: ProprietesVignette, sortie: string, octetsMax: number) => Promise<ResultatVignette>;
  // Visibilité vue par l’adresse publique oEmbed, et ouverture d’un dossier dans l’Explorateur.
  lireVisibiliteYoutube: (id: string) => Promise<LectureYoutube>;
  ouvrirDossier: (dossier: string) => Promise<void>;
  // Écritures sur le site (clé d’API de .env) ; null si l’adresse ou la clé manque.
  site: ClientSite | null;
  // Mail de com : copie SharePoint, rédaction, scripts du skill de mailing.
  mail: OutilsMail;
  // Post LinkedIn : rédaction par Claude d'après la bibliothèque du skill post-linkedin.
  linkedin: OutilsLinkedin;
}

const EXTENSIONS_PHOTO = new Set(['.jpg', '.jpeg', '.png']);

// Garde une copie horodatée (complete-AAAAMMJJ-HHmmss.jpg) de la vignette avant qu'un nouveau rendu ne l'écrase.
async function archiverVignette(fichier: string): Promise<void> {
  if (!existsSync(fichier)) return;
  const d = new Date();
  const n = (x: number) => String(x).padStart(2, '0');
  const horodatage = `${d.getFullYear()}${n(d.getMonth() + 1)}${n(d.getDate())}-${n(d.getHours())}${n(d.getMinutes())}${n(d.getSeconds())}`;
  const extension = path.extname(fichier);
  await copyFile(fichier, `${fichier.slice(0, -extension.length)}-${horodatage}${extension}`);
}
const EXTENSIONS_LOGO = new Set(['.png', '.svg']);
const EXTENSIONS_CAPTURE = new Set(['.png', '.jpg', '.jpeg', '.svg']);

async function listerImages(dossier: string, extensions: Set<string>): Promise<string[]> {
  if (!existsSync(dossier)) return [];
  return (await readdir(dossier)).filter(f => extensions.has(path.extname(f).toLowerCase())).sort();
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

const lireCibleTexte = (t: string | null): unknown => (t === null ? null : t === 'complete' ? t : Number(t));

function lireCible(corps: unknown, cibles: CiblePublication[]): CiblePublication {
  const v = objet(corps).cible;
  const cible = cibles.find(c => c === v);
  if (cible === undefined) throw new ErreurHttp(400, `cible attendue : « complete » ou un numéro d’épisode de 1 à ${cibles.length - 1}.`);
  return cible;
}

export function creerApiPublication(c: ConfigPublication): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  let vignetteEnCours = false;
  let relaisEnCours = false;
  // Une génération de vignette à la fois par vidéo (« dossier|cible »).
  const consignesEnCours = new Set<string>();
  const urlTournage = (dossier: string) => `${c.urlFichiers}/${encodeURIComponent(path.basename(dossier))}`;
  const mail = creerMail(c.mail);
  const linkedin = creerLinkedin(c.linkedin);

  // La vidéo visée par une route du mail, avec ses paroles conservées.
  function videoMail(ctx: Contexte, cible: CiblePublication): VideoMail {
    return {
      dossierTournage: ctx.dossier,
      urlTournage: urlTournage(ctx.dossier),
      cible,
      video: videoDe(ctx.publication, cible),
      disponible: ctx.videos.find(v => v.cible === cible)!,
      texte: texteConserve(ctx.tournage.analyse.mots, ctx.segments(cible)),
      chapitres: cible === 'complete' ? ctx.videos.filter(v => v.cible !== 'complete').map(v => v.titre) : [],
      modele: ctx.tournage.reglages.modeles.claude,
    };
  }

  const banqueLogos = () => listerImages(c.cheminLogos, EXTENSIONS_LOGO);
  const captures = (dossier: string) => listerImages(path.join(dossier, DOSSIER_CAPTURES), EXTENSIONS_CAPTURE);
  // Logos et captures de la vignette qui ne sont plus sur le disque, nommés pour l'auteur.
  const elementsAbsents = (v: Vignette, dossier: string) => [
    ...v.logos.filter(f => !existsSync(path.join(c.cheminLogos, f))).map(f => `logo ${f}`),
    ...v.captures.filter(f => !existsSync(path.join(dossier, DOSSIER_CAPTURES, f))).map(f => `capture ${f}`),
  ];

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
      urlTournage: urlTournage(ctx.dossier),
      urlPoses: c.urlPoses,
      urlLogos: c.urlLogos,
      logos: (await banqueLogos()).map((f): Logo => ({ fichier: f, url: `${c.urlLogos}/${encodeURIComponent(f)}` })),
      captures: await captures(ctx.dossier),
      publication: ctx.publication,
      videos: ctx.videos,
      site: await c.lireSite(c.urlSite),
      urlSite: c.urlSite ?? null,
      reglages: ctx.tournage.reglages.publication,
    };
  }

  async function enregistrer(req: IncomingMessage, ctx: Contexte): Promise<Publication> {
    // Le studio peut envoyer une vignette d'avant les gabarits : elle est complétée comme à la lecture du fichier.
    const corps = migrerPublication(await lireCorps(req));
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
    // La première accroche va dans la vignette déjà composée ; les autres restent à essayer. Une vignette sans logo
    // reçoit ceux des logiciels cités.
    const vignette = videoDe(actuelle, cible).vignette;
    const accroche = proposition.accroches[0] ?? vignette?.accroche ?? '';
    const logos = vignette && vignette.logos.length === 0 ? logosSuggeres(proposition.logiciels, await banqueLogos()) : vignette?.logos ?? [];
    const changement = vignette ? { ...proposition, vignette: { ...vignette, accroche, logos } } : proposition;
    const p = appliquerModifications(actuelle, modifierVideo(actuelle, cible, changement));
    await ecrirePublication(ctx.dossier, p);
    return p;
  }

  // Formulaire de vignette : éléments imposés par l'auteur, consignes, variante de départ. Claude propose 3 mises en page,
  // ajoutées en un nouveau tour ; la vignette ne change que quand l'auteur en retient une.
  async function genererVignette(req: IncomingMessage, ctx: Contexte): Promise<Publication> {
    const brut = await lireCorps(req);
    const cible = lireCible(brut, ctx.cibles);
    const corps = objet(brut);
    const texte = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const pose = texte(corps.pose);
    const accroche = texte(corps.accroche);
    const logosTexte = texte(corps.logosTexte);
    const consignes = texte(corps.consignes);
    const choisies = Array.isArray(corps.captures) ? corps.captures.filter((f): f is string => typeof f === 'string') : [];
    if (!(await photosBanque()).includes(pose)) throw new ErreurHttp(400, 'Pose inconnue.');
    if (!accroche) throw new ErreurHttp(400, 'Accroche vide.');
    const toutes = await captures(ctx.dossier);
    if (choisies.length > MAX_ELEMENTS || choisies.some(f => !toutes.includes(f))) throw new ErreurHttp(400, `Captures invalides (${MAX_ELEMENTS} au plus, prises dans captures/).`);
    const enCours = `${ctx.dossier}|${cible}`;
    if (consignesEnCours.has(enCours)) throw new ErreurHttp(409, 'Une génération est déjà en cours pour cette vignette.');
    consignesEnCours.add(enCours);
    try {
      const video = videoDe(ctx.publication, cible);
      const refBase = objet(corps.base);
      const base = corps.base ? video.consignesVignette[refBase.consigne as number]?.propositions[refBase.proposition as number] ?? null : null;
      const banque = await banqueLogos();
      const resolus = resoudreLogos(logosTexte, banque);
      const lire = async (dossier: string, fichiers: string[]) =>
        (await Promise.all(fichiers.map(f => c.reduireImage(path.join(dossier, f))))).filter((i): i is ImageClaude => i !== null);
      const images = {
        pose: await c.reduireImage(path.join(c.cheminPoses, poseDetouree(pose))),
        logos: await lire(c.cheminLogos, resolus.logos),
        captures: await lire(path.join(ctx.dossier, DOSSIER_CAPTURES), choisies),
      };
      const dejaUtilises = gabaritsAutres(ctx.publication, cible);
      let reponse: ReponseVignette;
      try {
        reponse = await c.proposerVignettes({
          elements: { pose, accroche, logosTexte, logos: resolus.logos, captures: choisies },
          ambigus: resolus.ambigus, logosBanque: banque, consignes, base,
          titre: video.titre || ctx.videos.find(v => v.cible === cible)!.titre, description: video.description,
          images, dejaUtilises,
          qualification: { nature: video.nature, confidentielle: video.confidentielle },
          modele: ctx.tournage.reglages.modeles.claude,
        });
      } catch (e) {
        if (e instanceof ErreurInterpretation) throw new ErreurHttp(e.statut, e.message);
        throw new ErreurHttp(500, `Génération de vignette impossible : ${message(e)}`);
      }
      // Logos tranchés par Claude pour les noms ambigus, s'ils sont bien dans la banque.
      const ajoutes = reponse.logosAjoutes.filter(f => banque.includes(f) && !resolus.logos.includes(f));
      const elements = { pose, accroche, logosTexte, logos: [...resolus.logos, ...ajoutes].slice(0, MAX_ELEMENTS), captures: choisies };
      const propositions = nettoyerPropositionsVignette(reponse.propositions, elements, dejaUtilises);
      if (propositions.length === 0) throw new ErreurHttp(422, 'Claude n’a proposé aucune vignette utilisable.');
      const nonTranches = resolus.ambigus.filter(n => !ajoutes.some(f => f.toLowerCase().includes(n.toLowerCase())));
      const tour: ConsigneVignette = {
        texte: consignes, elements, base,
        compris: reponse.compris.trim(),
        pasRealisable: [
          ...reponse.pasRealisable.map(t => t.trim()).filter(t => t !== ''),
          ...(propositions.length < MAX_PROPOSITIONS_VIGNETTE ? [`${propositions.length} variante(s) seulement après vérification`] : []),
        ],
        introuvables: [...resolus.introuvables, ...nonTranches],
        propositions, choisie: null,
      };
      const actuelle = await relire(ctx);
      const p = modifierVideo(actuelle, cible, { consignesVignette: [...videoDe(actuelle, cible).consignesVignette, tour] });
      await ecrirePublication(ctx.dossier, p);
      return p;
    } finally {
      consignesEnCours.delete(enCours);
    }
  }

  // Capture glissée dans le studio : copiée dans captures/, sous un nom libre (suffixe -2, -3… si le nom est pris).
  async function deposerCapture(req: IncomingMessage, ctx: Contexte): Promise<{ fichier: string; captures: string[] }> {
    const demande = new URL(req.url ?? '/', 'http://local').searchParams.get('fichier') ?? '';
    const extension = path.extname(demande).toLowerCase();
    if (!demande || path.basename(demande) !== demande || demande.startsWith('.') || !EXTENSIONS_CAPTURE.has(extension)) {
      throw new ErreurHttp(400, 'fichier attendu : une image PNG, JPEG ou SVG, sans chemin.');
    }
    const octets = await lireOctets(req);
    if (octets.length === 0) throw new ErreurHttp(400, 'Image vide.');
    const dossier = path.join(ctx.dossier, DOSSIER_CAPTURES);
    await mkdir(dossier, { recursive: true });
    const base = demande.slice(0, -extension.length);
    let fichier = demande;
    for (let n = 2; existsSync(path.join(dossier, fichier)); n++) fichier = `${base}-${n}${path.extname(demande)}`;
    await writeFile(path.join(dossier, fichier), octets);
    return { fichier, captures: await captures(ctx.dossier) };
  }

  // Photo envoyée depuis le studio : copiée dans donnees/poses/ (suffixe -2, -3… si le nom est pris), détourée à la liste.
  async function deposerPose(req: IncomingMessage): Promise<{ fichier: string; poses: Pose[] }> {
    const demande = new URL(req.url ?? '/', 'http://local').searchParams.get('fichier') ?? '';
    const extension = path.extname(demande).toLowerCase();
    if (!demande || path.basename(demande) !== demande || demande.startsWith('.') || !EXTENSIONS_PHOTO.has(extension)
      || demande.toLowerCase().endsWith('.detoure.png')) {
      throw new ErreurHttp(400, 'fichier attendu : une photo JPEG ou PNG, sans chemin.');
    }
    const octets = await lireOctets(req);
    if (octets.length === 0) throw new ErreurHttp(400, 'Image vide.');
    await mkdir(c.cheminPoses, { recursive: true });
    const base = demande.slice(0, -extension.length);
    let fichier = demande;
    for (let n = 2; existsSync(path.join(c.cheminPoses, fichier)); n++) fichier = `${base}-${n}${path.extname(demande)}`;
    await writeFile(path.join(c.cheminPoses, fichier), octets);
    return { fichier, poses: await poses() };
  }

  async function vignette(req: IncomingMessage, ctx: Contexte): Promise<Publication> {
    const cible = lireCible(await lireCorps(req), ctx.cibles);
    const v = videoDe(ctx.publication, cible).vignette;
    if (!v) throw new ErreurHttp(422, 'Composez d’abord la vignette : pose et accroche.');
    if (!v.accroche.trim()) throw new ErreurHttp(422, 'Accroche vide.');
    if (!existsSync(path.join(c.cheminPoses, poseDetouree(v.pose.fichier)))) {
      throw new ErreurHttp(409, 'Image de la vignette absente : choisissez de nouveau la pose.');
    }
    const absents = elementsAbsents(v, ctx.dossier);
    if (absents.length > 0) throw new ErreurHttp(409, `Image de la vignette absente : ${absents.join(', ')}.`);
    if (vignetteEnCours) throw new ErreurHttp(409, 'Une vignette est déjà en cours de rendu.');
    vignetteEnCours = true;
    const cle = cleVignette(v);
    const chemin = fichierVignette(cible);
    try {
      await archiverVignette(path.join(ctx.dossier, chemin));
      const bases = { tournage: urlTournage(ctx.dossier), poses: c.urlPoses, logos: c.urlLogos };
      await c.rendreVignette(proprietesVignette(v, bases), path.join(ctx.dossier, chemin), ctx.tournage.reglages.publication.vignetteOctetsMax);
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
    if (video.vignette) problemes.push(...elementsAbsents(video.vignette, ctx.dossier).map(a => `Vignette : ${a} introuvable.`));
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

  // Ouvre dans l'explorateur un dossier connu du serveur : jamais un chemin envoyé par le navigateur.
  async function ouvrir(req: IncomingMessage, ctx: Contexte): Promise<{ ok: true }> {
    const quoi = objet(await lireCorps(req)).dossier;
    const dossiers: Record<string, string | undefined> = {
      vignettes: path.join(ctx.dossier, path.dirname(fichierVignette('complete'))),
      sharepoint: c.mail.sharepoint.dossierLocal,
      onedrive: c.mail.sharepoint.dossierTemp,
    };
    const dossier = typeof quoi === 'string' && Object.hasOwn(dossiers, quoi) ? dossiers[quoi] : undefined;
    if (!dossier) throw new ErreurHttp(400, 'dossier attendu : vignettes, sharepoint ou onedrive.');
    if (!existsSync(dossier)) throw new ErreurHttp(409, `Dossier introuvable : ${dossier}.`);
    try {
      await c.ouvrirDossier(dossier);
    } catch (e) {
      throw new ErreurHttp(500, `Ouverture du dossier impossible : ${message(e)}`);
    }
    return { ok: true };
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

  async function creerValeurClassement(req: IncomingMessage, cle: string): Promise<ValeurClassement> {
    const nom = objet(await lireCorps(req)).nom;
    if (typeof nom !== 'string' || nom.trim() === '') throw new ErreurHttp(400, 'nom attendu : texte non vide.');
    if (!c.site) throw new ErreurHttp(422, 'Site non configuré : renseignez REPLIT_SITE_URL et REPLIT_API_KEY dans .env, puis relancez le studio.');
    try {
      return await c.site.creerValeur(cle, nom.trim());
    } catch (e) {
      throw new ErreurHttp(502, message(e));
    }
  }

  async function relayer(req: IncomingMessage, ctx: Contexte): Promise<Publication> {
    const cible = lireCible(await lireCorps(req), ctx.cibles);
    const video = videoDe(ctx.publication, cible);
    const disponible = ctx.videos.find(v => v.cible === cible)!;
    const vignette = video.vignette?.fichier ? path.join(ctx.dossier, video.vignette.fichier) : null;
    const octetsVignette = vignette && existsSync(vignette) ? (await stat(vignette)).size : null;
    const references = await c.lireSite(c.urlSite);
    const problemes = problemesRelais(video, descriptionYoutube(video.description, disponible.chapitres), ctx.tournage.reglages.publication, {
      rendu: { fichier: disponible.fichier, present: disponible.rendue },
      octetsVignette,
      siteConfigure: c.site !== null,
      classements: references?.classements ?? null,
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
      id = await c.site.enregistrerVideo(video.replit.id, corpsRelais(video, { classements: references!.classements, dureeSecondes: disponible.dureeSecondes, fichier, thumbnailObject }));
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
    // La qualification demandée est réappliquée : un enregistrement concurrent (titre, tags) pendant le retrait a pu la remettre en Pro.
    const p = modifierVideo(actuelle, cible, { ...qualification, ...enregistrerRetrait(videoDe(actuelle, cible)) });
    await ecrirePublication(ctx.dossier, p);
    return p;
  }

  // Photos de donnees/poses/, sans leurs versions détourées.
  async function photosBanque(): Promise<string[]> {
    const fichiers = existsSync(c.cheminPoses) ? await readdir(c.cheminPoses) : [];
    return fichiers.filter(f => EXTENSIONS_PHOTO.has(path.extname(f).toLowerCase()) && !f.toLowerCase().endsWith('.detoure.png')).sort();
  }

  // Photos de donnees/poses/, détourées à la première demande puis chaque fois que la photo change.
  // Les appels simultanés (double montage de l’écran) partagent le même passage : un seul détourage par photo.
  let posesEnCours: Promise<Pose[]> | null = null;
  function poses(): Promise<Pose[]> {
    posesEnCours ??= calculerPoses().finally(() => { posesEnCours = null; });
    return posesEnCours;
  }

  async function calculerPoses(): Promise<Pose[]> {
    const photos = await photosBanque();
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
    const route = /^\/api\/tournages\/([^/]+)\/publication(?:\/(redaction|vignette\/generer|vignette|ouvrir|captures|valider|relais|site\/retirer|youtube\/(?:preparer|ouvrir|envoi|verifier)|mail(?:\/(?:copie|images|redaction|construire|retouche|brouillon))?|linkedin(?:\/redaction)?))?$/
      .exec(chemin);
    const valeur = /^\/api\/site\/classements\/([^/]+)\/valeurs$/.exec(chemin);
    if (valeur) {
      try {
        if (req.method !== 'POST') throw new ErreurHttp(405, 'Méthode non permise.');
        let cle: string;
        try { cle = decodeURIComponent(valeur[1]!); } catch { throw new ErreurHttp(400, 'Clé de classement mal encodée.'); }
        repondre(res, 200, await creerValeurClassement(req, cle));
      } catch (e) {
        repondreErreur(res, e);
      }
      return true;
    }
    if (!route && chemin !== '/api/poses') return false;
    try {
      if (!route) {
        if (req.method === 'POST') repondre(res, 200, await deposerPose(req));
        else if (req.method === 'GET') repondre(res, 200, await poses());
        else throw new ErreurHttp(405, 'Méthode non permise.');
        return true;
      }
      const ctx = await contexte(dossierTournage(c.racineTournages, route[1]!));
      const action = route[2];
      if (!action && req.method === 'GET') repondre(res, 200, await detail(ctx));
      else if (!action && req.method === 'PUT') repondre(res, 200, await enregistrer(req, ctx));
      else if (action === 'redaction' && req.method === 'POST') repondre(res, 200, await rediger(req, ctx));
      else if (action === 'vignette/generer' && req.method === 'POST') repondre(res, 200, await genererVignette(req, ctx));
      else if (action === 'vignette' && req.method === 'POST') repondre(res, 200, await vignette(req, ctx));
      else if (action === 'captures' && req.method === 'GET') repondre(res, 200, await captures(ctx.dossier));
      else if (action === 'captures' && req.method === 'POST') repondre(res, 200, await deposerCapture(req, ctx));
      else if (action === 'valider' && req.method === 'POST') repondre(res, 200, await valider(req, ctx));
      else if (action === 'youtube/preparer' && req.method === 'POST') repondre(res, 200, await preparerYoutube(req, ctx));
      else if (action === 'ouvrir' && req.method === 'POST') repondre(res, 200, await ouvrir(req, ctx));
      else if (action === 'youtube/ouvrir' && req.method === 'POST') repondre(res, 200, await ouvrirYoutube(req, ctx));
      else if (action === 'youtube/envoi' && req.method === 'POST') repondre(res, 200, await envoiYoutube(req, ctx));
      else if (action === 'youtube/verifier' && req.method === 'POST') repondre(res, 200, await verifierYoutube(req, ctx));
      else if (action === 'relais' && req.method === 'POST') repondre(res, 200, await relayer(req, ctx));
      else if (action === 'site/retirer' && req.method === 'POST') repondre(res, 200, await retirerDuSite(req, ctx));
      else if (action?.startsWith('mail')) {
        const parametres = new URL(req.url ?? '/', 'http://local').searchParams;
        if (req.method === 'GET' && action === 'mail') {
          repondre(res, 200, await mail.detail(videoMail(ctx, lireCible({ cible: lireCibleTexte(parametres.get('cible')) }, ctx.cibles))));
        } else if (req.method === 'POST' && action === 'mail/images') {
          const v = videoMail(ctx, lireCible({ cible: lireCibleTexte(parametres.get('cible')) }, ctx.cibles));
          repondre(res, 200, await mail.deposerImage(v, parametres.get('fichier') ?? '', await lireOctets(req)));
        } else {
          const corps = objet(await lireCorps(req));
          const v = videoMail(ctx, lireCible(corps, ctx.cibles));
          if (req.method === 'PUT' && action === 'mail') repondre(res, 200, await mail.enregistrer(v, corps));
          else if (req.method === 'POST' && action === 'mail/copie') repondre(res, 200, await mail.copier(v));
          else if (req.method === 'POST' && action === 'mail/redaction') repondre(res, 200, await mail.rediger(v));
          else if (req.method === 'POST' && action === 'mail/construire') repondre(res, 200, await mail.construire(v));
          else if (req.method === 'POST' && action === 'mail/retouche') repondre(res, 200, await mail.retoucher(v, typeof corps.consigne === 'string' ? corps.consigne : ''));
          else if (req.method === 'POST' && action === 'mail/brouillon') repondre(res, 200, await mail.brouillon(v));
          else repondre(res, 404, { erreur: 'Route inconnue.' });
        }
      }
      else if (action === 'linkedin' && req.method === 'GET') {
        const cible = lireCibleTexte(new URL(req.url ?? '/', 'http://local').searchParams.get('cible'));
        repondre(res, 200, await linkedin.detail(videoMail(ctx, lireCible({ cible }, ctx.cibles))));
      } else if (action?.startsWith('linkedin')) {
        const corps = objet(await lireCorps(req));
        const v = videoMail(ctx, lireCible(corps, ctx.cibles));
        if (req.method === 'PUT' && action === 'linkedin') repondre(res, 200, await linkedin.enregistrer(v, corps));
        else if (req.method === 'POST' && action === 'linkedin/redaction') repondre(res, 200, await linkedin.rediger(v, corps));
        else repondre(res, 404, { erreur: 'Route inconnue.' });
      }
      else repondre(res, 404, { erreur: 'Route inconnue.' });
    } catch (e) {
      repondreErreur(res, e);
    }
    return true;
  };
}
