import { spawn } from 'node:child_process';
import path from 'node:path';
import { RACINE } from '../../remotion/scripts/tournage';

// Lance « mtpipeline <args> » avec le Python de .venv ; l'erreur reprend sa sortie d'erreur.
export function lancerPipeline(args: string[]): Promise<void> {
  const python = path.join(RACINE, '.venv', 'Scripts', 'python.exe');
  return new Promise((resoudre, rejeter) => {
    const processus = spawn(python, ['-m', 'mtpipeline.cli', ...args], {
      cwd: path.join(RACINE, 'pipeline'),
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
    let erreurs = '';
    processus.stderr.on('data', (d: Buffer) => { erreurs += d.toString('utf-8'); });
    processus.on('error', rejeter);
    processus.on('close', code => (code === 0 ? resoudre() : rejeter(new Error(erreurs.trim() || `code de sortie ${code}`))));
  });
}

export const extraireImage = (video: string, instant: number, sortie: string) => lancerPipeline(['image', video, String(instant), sortie]);
export const detourerImage = (entree: string, sortie: string) => lancerPipeline(['detourer', entree, sortie]);
