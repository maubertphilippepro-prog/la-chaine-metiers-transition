import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { RACINE } from '../../remotion/scripts/tournage';

// Scripts et charte du skill de mailing du Pôle, recopiés dans le projet.
export const DOSSIER_MAILING = path.join(RACINE, 'outils', 'mailing');

// Copie dans le dossier OneDrive, sauf si un fichier de même taille y est déjà (vidéo déjà envoyée).
export async function copierSiDifferent(source: string, cible: string): Promise<boolean> {
  if (existsSync(cible) && (await stat(cible)).size === (await stat(source)).size) return false;
  await mkdir(path.dirname(cible), { recursive: true });
  await copyFile(source, cible);
  return true;
}

// Lance un programme ; résout sa sortie standard, l'erreur reprend sa sortie d'erreur.
function executer(programme: string, args: string[]): Promise<string> {
  return new Promise((resoudre, rejeter) => {
    const processus = spawn(programme, args, { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    let sortie = '';
    let erreurs = '';
    processus.stdout.on('data', (d: Buffer) => { sortie += d.toString('utf-8'); });
    processus.stderr.on('data', (d: Buffer) => { erreurs += d.toString('utf-8'); });
    processus.on('error', rejeter);
    processus.on('close', code => (code === 0 ? resoudre(sortie) : rejeter(new Error(erreurs.trim() || sortie.trim() || `code de sortie ${code}`))));
  });
}

const python = path.join(RACINE, '.venv', 'Scripts', 'python.exe');
const script = (nom: string) => path.join(DOSSIER_MAILING, 'scripts', nom);

export async function construireMail(dossierMail: string): Promise<string> {
  const build = await executer(python, [script('build_mail.py'), 'build', dossierMail]);
  const captures = await executer(python, [script('screenshot.py'), dossierMail]);
  return `${build}${captures}`;
}

export const creerBrouillon = (dossierBuild: string) =>
  executer('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script('outlook_draft.ps1'), '-BuildDir', dossierBuild]);
