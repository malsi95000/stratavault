/** Délai avant de libérer l'URL du fichier : le navigateur a eu le temps de lancer le téléchargement. */
const REVOKE_DELAY_MS = 1000;

/** Fait télécharger un fichier au navigateur (lien temporaire, URL révoquée ensuite). */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
