export function slug(texte: string): string {
  const brut = texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return brut || 'sans-titre';
}

export function nomFichierEpisode(index: number, titre: string): string {
  return `episode-${String(index + 1).padStart(2, '0')}-${slug(titre)}.mp4`;
}
