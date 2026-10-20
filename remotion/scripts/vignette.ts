import { bundle } from '@remotion/bundler';
import { ensureBrowser, renderStill, selectComposition } from '@remotion/renderer';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ProprietesVignette } from '../composants/Vignette';
import { portLibre } from './rendu';
import { RACINE } from './tournage';

export interface DependancesVignette {
  bundle: typeof bundle;
  ensureBrowser: typeof ensureBrowser;
  selectComposition: typeof selectComposition;
  renderStill: typeof renderStill;
}

const DEPENDANCES: DependancesVignette = { bundle, ensureBrowser, selectComposition, renderStill };
const QUALITES_JPEG = [90, 80, 70, 60];

export interface ResultatVignette {
  octets: number;
  qualite: number;
}

// Le paquet Remotion est construit une fois par processus : les vignettes suivantes partent en quelques secondes.
let paquet: Promise<string> | null = null;

export function oublierPaquet(): void {
  paquet = null;
}

// Rend la vignette en JPEG dans `sortie` (.jpg), en baissant la qualité jusqu'à passer sous `octetsMax`.
// Les images (fond, pose) sont des adresses HTTP servies par le serveur de fichiers.
export async function rendreVignette(
  props: ProprietesVignette, sortie: string, octetsMax: number, d: DependancesVignette = DEPENDANCES,
): Promise<ResultatVignette> {
  paquet ??= d.bundle({ entryPoint: path.join(RACINE, 'remotion', 'index.ts'), publicDir: path.join(RACINE, 'public') });
  let serveUrl: string;
  try {
    serveUrl = await paquet;
  } catch (e) {
    paquet = null;
    throw e;
  }
  await d.ensureBrowser();
  const port = await portLibre();
  const composition = await d.selectComposition({ serveUrl, port, id: 'Vignette', inputProps: { ...props } });
  await mkdir(path.dirname(sortie), { recursive: true });
  const temporaire = sortie.replace(/\.jpg$/, '.tmp.jpg');
  try {
    for (const qualite of QUALITES_JPEG) {
      await d.renderStill({
        composition, serveUrl, port, output: temporaire, inputProps: { ...props }, imageFormat: 'jpeg', jpegQuality: qualite, overwrite: true,
      });
      const { size } = await stat(temporaire);
      if (size <= octetsMax) {
        await rename(temporaire, sortie);
        return { octets: size, qualite };
      }
    }
  } finally {
    await rm(temporaire, { force: true });
  }
  throw new Error(`Vignette de plus de ${octetsMax} octets même en qualité ${QUALITES_JPEG[QUALITES_JPEG.length - 1]}.`);
}
