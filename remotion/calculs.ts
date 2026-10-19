// Micro-fondu aux raccords pour éviter les clics : rampe sur `fondu` images à chaque extrémité.
export function volumeRaccord(image: number, duree: number, fondu: number): number {
  const rampe = Math.max(1, fondu);
  const entree = (image + 0.5) / rampe;
  const sortie = (duree - image - 0.5) / rampe;
  return Math.max(0, Math.min(1, entree, sortie));
}

// Volume du tapis : montée sur 1,5 s, descente sur les 2 dernières secondes.
export function volumeTapis(image: number, duree: number, fps: number, volume: number): number {
  const entree = image / (1.5 * fps);
  const sortie = (duree - image) / (2 * fps);
  return volume * Math.max(0, Math.min(1, entree, sortie));
}
