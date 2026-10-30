import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createServer as creerVite } from 'vite';
import { rendreVignette } from '../../remotion/scripts/vignette';
import { rendreTournage } from '../../remotion/scripts/rendu';
import { demarrerServeur } from '../../remotion/scripts/serveur-fichiers';
import { RACINE } from '../../remotion/scripts/tournage';
import type { Reglages } from '../../noyau/types';
import { creerApi } from './api';
import { interpreterConsigne } from './interpretation';
import { redigerMail, retoucherMail } from './mail-claude';
import { vignetteLecture, capturerMail, construireMail, copierSiDifferent, creerBrouillon, DOSSIER_MAILING } from './mail-outils';
import { requeteAutorisee } from './origine';
import { analyserTournage, detourerImage } from './pipeline';
import { creerApiPublication } from './publication';
import { redigerPublication } from './redaction';
import { proposerVignettes } from './vignette-claude';
import { creerClientSite, lireReferencesSite } from './site-replit';
import { relancerSuggestions } from './suggestions';
import { SuiviAnalyse } from './suivi-analyse';
import { SuiviRendu } from './suivi-rendu';
import { lireVisibiliteYoutube, ouvrirDansExplorateur } from './youtube';

const PORT = 5180;

async function main(): Promise<void> {
  // Clé de l'API Claude dans .env, comme pour le pipeline ; une variable déjà définie garde sa valeur.
  const cheminEnv = path.join(RACINE, '.env');
  if (existsSync(cheminEnv)) process.loadEnvFile(cheminEnv);
  const racineTournages = path.join(RACINE, 'donnees', 'tournages');
  const fichiers = await demarrerServeur(racineTournages);
  const api = creerApi({
    racineTournages,
    racineSupprimes: path.join(RACINE, 'donnees', 'tournages-supprimes'),
    cheminGlossaire: path.join(RACINE, 'donnees', 'glossaire.json'),
    urlFichiers: fichiers.url,
    suivi: new SuiviRendu(),
    rendre: (dossier, cible, onProgression) => rendreTournage(dossier, { brouillon: false, cible, onProgression }),
    relancerSuggestions,
    suiviAnalyse: new SuiviAnalyse(),
    analyser: analyserTournage,
    interpreterConsigne: d => interpreterConsigne(d),
  });

  // Banque de poses servie à part : ses photos ne sont pas dans un dossier de tournage.
  const cheminPoses = path.join(RACINE, 'donnees', 'poses');
  await mkdir(cheminPoses, { recursive: true });
  const serveurPoses = await demarrerServeur(cheminPoses);
  // Banque de logos de logiciels, servie à part comme celle des poses.
  const cheminLogos = path.join(RACINE, 'donnees', 'logos');
  await mkdir(cheminLogos, { recursive: true });
  const serveurLogos = await demarrerServeur(cheminLogos);
  // Réglages lus comme chargerTournage le fait : SharePoint de Vitrin3 pour le mail de com.
  const reglages = JSON.parse(await readFile(path.join(RACINE, 'reglages.json'), 'utf-8')) as Reglages;
  const apiPublication = creerApiPublication({
    racineTournages,
    cheminPoses,
    cheminLogos,
    urlFichiers: fichiers.url,
    urlPoses: serveurPoses.url,
    urlLogos: serveurLogos.url,
    // Adresse publiée du site Replit (classements et playlists), dans .env.
    urlSite: process.env.REPLIT_SITE_URL,
    lireSite: url => lireReferencesSite(url),
    rediger: d => redigerPublication(d),
    proposerVignettes: d => proposerVignettes(d),
    detourer: detourerImage,
    rendreVignette: (props, sortie, octetsMax) => rendreVignette(props, sortie, octetsMax),
    lireVisibiliteYoutube: id => lireVisibiliteYoutube(id),
    ouvrirDossier: ouvrirDansExplorateur,
    // Clé d’API du site (REPLIT_API_KEY dans .env), égale au secret AUTOMATION_API_KEY du site.
    site: creerClientSite(process.env.REPLIT_SITE_URL, process.env.REPLIT_API_KEY),
    mail: {
      sharepoint: reglages.sharepoint,
      copier: copierSiDifferent,
      rediger: d => redigerMail(d),
      construire: construireMail,
      retoucher: d => retoucherMail(d),
      capturer: capturerMail,
      vignetteLecture,
      brouillon: creerBrouillon,
      lireReference: r => readFile(path.join(DOSSIER_MAILING, r), 'utf-8'),
      logosBandeau: async () => (await readdir(path.join(DOSSIER_MAILING, 'assets', 'logos'))).filter(f => f.endsWith('.png')).map(f => f.slice(0, -4)),
    },
  });

  const serveur = http.createServer();
  // Une longue vidéo peut mettre plus que les 5 minutes accordées par défaut à une requête.
  serveur.requestTimeout = 0;
  const vite = await creerVite({
    configFile: path.join(RACINE, 'studio', 'vite.config.ts'),
    server: { middlewareMode: true, hmr: { server: serveur } },
    appType: 'spa',
  });
  serveur.on('request', async (req, res) => {
    // Refuse une page d'un autre site qui viserait le studio, par un nom de domaine pointant vers 127.0.0.1 (Host) ou par une requête inter-sites (Origin).
    if (!requeteAutorisee(req.headers.host, req.headers.origin, PORT)) {
      res.writeHead(403).end();
      return;
    }
    if (await apiPublication(req, res)) return;
    if (await api(req, res)) return;
    vite.middlewares(req, res);
  });
  serveur.listen(PORT, '127.0.0.1', () => {
    // Titre de la fenêtre du lanceur (outils/lanceur.ps1) : npm le remplace au démarrage.
    process.title = 'Studio M&T — ne pas fermer';
    console.log(`Studio de validation : http://127.0.0.1:${PORT}`);
  });
}

main().catch(e => {
  console.error(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
