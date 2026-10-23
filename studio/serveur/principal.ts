import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createServer as creerVite } from 'vite';
import { rendreVignette } from '../../remotion/scripts/vignette';
import { rendreTournage } from '../../remotion/scripts/rendu';
import { demarrerServeur } from '../../remotion/scripts/serveur-fichiers';
import { RACINE } from '../../remotion/scripts/tournage';
import { creerApi } from './api';
import { interpreterConsigne } from './interpretation';
import { requeteAutorisee } from './origine';
import { detourerImage, extraireImage } from './pipeline';
import { creerApiPublication } from './publication';
import { redigerPublication } from './redaction';
import { creerClientSite, lireReferencesSite } from './site-replit';
import { relancerSuggestions } from './suggestions';
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
    cheminGlossaire: path.join(RACINE, 'donnees', 'glossaire.json'),
    urlFichiers: fichiers.url,
    suivi: new SuiviRendu(),
    rendre: (dossier, cible, onProgression) => rendreTournage(dossier, { brouillon: false, cible, onProgression }),
    relancerSuggestions,
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
  const apiPublication = creerApiPublication({
    racineTournages,
    cheminPoses,
    cheminLogos,
    urlFichiers: fichiers.url,
    urlPoses: serveurPoses.url,
    urlLogos: serveurLogos.url,
    // Adresse publiée du site Replit (catégories et playlists), dans .env.
    urlSite: process.env.REPLIT_SITE_URL,
    lireSite: url => lireReferencesSite(url),
    rediger: d => redigerPublication(d),
    extraireImage,
    detourer: detourerImage,
    rendreVignette: (props, sortie, octetsMax) => rendreVignette(props, sortie, octetsMax),
    lireVisibiliteYoutube: id => lireVisibiliteYoutube(id),
    ouvrirDossier: ouvrirDansExplorateur,
    // Clé d’API du site (REPLIT_API_KEY dans .env), égale au secret AUTOMATION_API_KEY du site.
    site: creerClientSite(process.env.REPLIT_SITE_URL, process.env.REPLIT_API_KEY),
  });

  const serveur = http.createServer();
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
  serveur.listen(PORT, '127.0.0.1', () => console.log(`Studio de validation : http://127.0.0.1:${PORT}`));
}

main().catch(e => {
  console.error(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
