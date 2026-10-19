// Accepte uniquement les requêtes adressées au studio lui-même : Host local et, s'il est présent, Origin local.
export function requeteAutorisee(host: string | undefined, origin: string | undefined, port: number): boolean {
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return false;
  if (origin === undefined) return true;
  return origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
}
