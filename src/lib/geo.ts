// Coordonnées géographiques : toujours [longitude, latitude].
export type LonLat = [lon: number, lat: number];

/** Position lisible (bêta, fmtLL) : « 48.86° N, 2.35° E ». */
export function fmtLL([lon, lat]: LonLat): string {
  return `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? "E" : "O"}`;
}
