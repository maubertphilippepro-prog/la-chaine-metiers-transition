import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { RACINE } from '../../remotion/scripts/tournage';

export const COTE_MAX_IMAGE_CLAUDE = 800;

export interface ImageClaude { nom: string; media_type: 'image/jpeg'; data: string }
export type ReduireImage = (chemin: string) => Promise<ImageClaude | null>;

const SCRIPT = path.join(RACINE, 'outils', 'vignette', 'reduire_image.py');
// Python du projet (avec Pillow), comme pour le mail de com ; celui du système à défaut.
const VENV = path.join(RACINE, '.venv', 'Scripts', 'python.exe');
const python = existsSync(VENV) ? VENV : 'python';

// Les SVG ne passent pas (Claude ne les lit pas) : Claude n'en voit que le nom. Une image illisible non plus.
export const reduireImage: ReduireImage = async chemin => {
  if (path.extname(chemin).toLowerCase() === '.svg') return null;
  try {
    const { stdout } = await promisify(execFile)(python, [SCRIPT, chemin], { maxBuffer: 20 * 1024 * 1024 });
    return { nom: path.basename(chemin), media_type: 'image/jpeg', data: stdout.trim() };
  } catch {
    return null;
  }
};
