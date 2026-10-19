import { spawn } from 'node:child_process';
import path from 'node:path';
import { RACINE } from '../../remotion/scripts/tournage';

// Lance « mtpipeline relancer-suggestions » avec le Python de .venv ; l'erreur reprend sa sortie d'erreur.
// Une API Claude indisponible n'est pas un échec : analyse.json garde alors erreurSuggestions.
export function relancerSuggestions(dossier: string): Promise<void> {
  const python = path.join(RACINE, '.venv', 'Scripts', 'python.exe');
  return new Promise((resoudre, rejeter) => {
    const processus = spawn(python, ['-m', 'mtpipeline.cli', 'relancer-suggestions', dossier], {
      cwd: path.join(RACINE, 'pipeline'),
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
    let erreurs = '';
    processus.stderr.on('data', (d: Buffer) => { erreurs += d.toString('utf-8'); });
    processus.on('error', rejeter);
    processus.on('close', code => (code === 0 ? resoudre() : rejeter(new Error(erreurs.trim() || `code de sortie ${code}`))));
  });
}
