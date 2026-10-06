import { execFile } from "child_process";

/**
 * Opens a local file in its default macOS app (Aperçu, etc.).
 *
 * Only on the desktop app on macOS: there the Next.js server runs on the
 * user's own Mac, and WKWebView silently ignores `window.open` / attachment
 * downloads, so the webview cannot open documents by itself. Elsewhere this
 * returns false and the caller keeps the browser behaviour (unchanged on
 * Windows, where WebView2 handles it).
 */
export function openFileWithMacOs(filePath: string): Promise<boolean> {
  const isDesktop =
    process.env.TUTELLIA_DESKTOP === "1" || process.env.NODE_ENV === "development";
  if (process.platform !== "darwin" || !isDesktop) return Promise.resolve(false);

  // execFile, no shell: the path is passed as a single argument.
  return new Promise((resolve) => {
    execFile("open", [filePath], (error) => resolve(!error));
  });
}
