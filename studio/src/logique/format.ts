export function horodatage(t: number): string {
  const secondes = Math.floor(t);
  return `${Math.floor(secondes / 60)}:${String(secondes % 60).padStart(2, '0')}`;
}

export function duree(t: number): string {
  return `${t.toFixed(1).replace('.', ',')} s`;
}
