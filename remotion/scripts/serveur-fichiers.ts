import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { pipeline } from 'node:stream';

// Sert source.mp4 au lecteur Remotion (Studio et rendu) : plages HTTP pour la lecture vidéo, CORS pour le Studio.
export interface ServeurFichiers {
  url: string;
  fermer(): Promise<void>;
}

const TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.json': 'application/json',
  '.png': 'image/png',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Range',
  'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
};

export function cheminDemande(racine: string, urlDemandee: string): string | null {
  const base = path.resolve(racine);
  let relatif: string;
  try {
    relatif = decodeURIComponent(new URL(urlDemandee, 'http://local').pathname);
  } catch {
    return null;
  }
  const chemin = path.resolve(base, `.${relatif}`);
  return chemin.startsWith(base + path.sep) ? chemin : null;
}

export function lirePlage(entete: string | undefined, taille: number): { debut: number; fin: number } | null | 'invalide' {
  if (!entete) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(entete.trim());
  if (!m || (m[1] === '' && m[2] === '')) return 'invalide';
  let debut: number;
  let fin: number;
  if (m[1] === '') {
    debut = Math.max(0, taille - Number(m[2]));
    fin = taille - 1;
  } else {
    debut = Number(m[1]);
    fin = m[2] === '' ? taille - 1 : Math.min(Number(m[2]), taille - 1);
  }
  return debut >= taille || debut > fin ? 'invalide' : { debut, fin };
}

export function demarrerServeur(racine: string, port = 0): Promise<ServeurFichiers> {
  const serveur = http.createServer(async (req, res) => {
    const { port: reel } = serveur.address() as AddressInfo;
    if (req.headers.host !== `127.0.0.1:${reel}` && req.headers.host !== `localhost:${reel}`) {
      res.writeHead(403).end();
      return;
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS).end();
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, CORS).end();
      return;
    }
    const chemin = cheminDemande(racine, req.url ?? '/');
    const infos = chemin ? await stat(chemin).catch(() => null) : null;
    if (!chemin || !infos?.isFile()) {
      res.writeHead(404, CORS).end();
      return;
    }
    const plage = lirePlage(req.headers.range, infos.size);
    if (plage === 'invalide') {
      res.writeHead(416, { ...CORS, 'Content-Range': `bytes */${infos.size}` }).end();
      return;
    }
    const { debut, fin } = plage ?? { debut: 0, fin: infos.size - 1 };
    res.writeHead(plage ? 206 : 200, {
      ...CORS,
      'Content-Type': TYPES[path.extname(chemin).toLowerCase()] ?? 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Content-Length': Math.max(0, fin - debut + 1),
      ...(plage ? { 'Content-Range': `bytes ${debut}-${fin}/${infos.size}` } : {}),
    });
    if (req.method === 'HEAD' || infos.size === 0) {
      res.end();
      return;
    }
    // Les coupures client (déplacement dans la vidéo) sont normales : pipeline ferme le fichier, l'erreur est ignorée.
    pipeline(createReadStream(chemin, { start: debut, end: fin }), res, () => {});
  });

  return new Promise((resolve, reject) => {
    serveur.once('error', reject);
    serveur.listen(port, '127.0.0.1', () => {
      resolve({
        url: `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`,
        fermer: () =>
          new Promise<void>(fini => {
            serveur.closeAllConnections();
            serveur.close(() => fini());
          }),
      });
    });
  });
}
