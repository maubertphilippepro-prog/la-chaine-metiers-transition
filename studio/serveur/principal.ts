import http from 'node:http';
import path from 'node:path';
import { createServer as creerVite } from 'vite';
import { rendreTournage } from '../../remotion/scripts/rendu';
import { demarrerServeur } from '../../remotion/scripts/serveur-fichiers';
import { RACINE } from '../../remotion/scripts/tournage';
import { creerApi } from './api';
import { relancerSuggestions } from './suggestions';
import { SuiviRendu } from './suivi-rendu';

const PORT = 5180;

async function main(): Promise<void> {
  const racineTournages = path.join(RACINE, 'donnees', 'tournages');
  const fichiers = await demarrerServeur(racineTournages);
  const api = creerApi({
    racineTournages,
    cheminGlossaire: path.join(RACINE, 'donnees', 'glossaire.json'),
    urlFichiers: fichiers.url,
    suivi: new SuiviRendu(),
    rendre: (dossier, cible, onProgression) => rendreTournage(dossier, { brouillon: false, cible, onProgression }),
    relancerSuggestions,
  });

  const serveur = http.createServer();
  const vite = await creerVite({
    configFile: path.join(RACINE, 'studio', 'vite.config.ts'),
    server: { middlewareMode: true, hmr: { server: serveur } },
    appType: 'spa',
  });
  serveur.on('request', async (req, res) => {
    // Refuse une page d'un autre site qui viserait le studio par un nom de domaine pointant vers 127.0.0.1.
    if (req.headers.host !== `127.0.0.1:${PORT}` && req.headers.host !== `localhost:${PORT}`) {
      res.writeHead(403).end();
      return;
    }
    if (await api(req, res)) return;
    vite.middlewares(req, res);
  });
  serveur.listen(PORT, '127.0.0.1', () => console.log(`Studio de validation : http://127.0.0.1:${PORT}`));
}

main().catch(e => {
  console.error(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
