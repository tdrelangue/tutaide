import fs from "fs";
import os from "os";
import path from "path";

/**
 * Settings that belong to THIS computer, not to the account: the DB is shared
 * by every PC of a user, but each PC has its own path to the same OneDrive
 * folder. Stored next to the default documents folder.
 */
export type MachineSettings = {
  /** Absolute path of the folder holding documents. Null = default folder. */
  documentsDir: string | null;
  /**
   * Folders used before on this computer. Changing folder copies documents and
   * never empties the old one, so deleting a document must also remove its
   * copies there.
   */
  previousDocumentsDirs: string[];
};

const DEFAULT_SETTINGS: MachineSettings = { documentsDir: null, previousDocumentsDirs: [] };

function isAbsolutePath(value: unknown): value is string {
  return typeof value === "string" && path.isAbsolute(value);
}

/** %APPDATA% on Windows, Application Support on macOS, ~/.config elsewhere. */
export function getAppDataDir(): string {
  return (
    process.env.APPDATA ||
    (process.platform === "darwin"
      ? path.join(os.homedir(), "Library", "Application Support")
      : path.join(os.homedir(), ".config"))
  );
}

function settingsFilePath(): string {
  return path.join(getAppDataDir(), "tutaide", "settings.json");
}

function parseSettings(raw: unknown): MachineSettings {
  if (typeof raw !== "object" || raw === null) return DEFAULT_SETTINGS;
  const dir: unknown = Reflect.get(raw, "documentsDir");
  const previous: unknown = Reflect.get(raw, "previousDocumentsDirs");
  return {
    documentsDir: isAbsolutePath(dir) ? dir : null,
    previousDocumentsDirs: Array.isArray(previous) ? previous.filter(isAbsolutePath) : [],
  };
}

// Document lists check every file, so the parsed file is kept and re-read
// only when its modification time changes (Next may load this module more
// than once, so an in-memory "written" flag would not be seen everywhere).
let cache: { mtimeMs: number; settings: MachineSettings } | null = null;

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export function readMachineSettings(): MachineSettings {
  const file = settingsFilePath();
  try {
    const { mtimeMs } = fs.statSync(file);
    if (cache?.mtimeMs === mtimeMs) return cache.settings;
    const settings = parseSettings(JSON.parse(fs.readFileSync(file, "utf8")));
    cache = { mtimeMs, settings };
    return settings;
  } catch (error) {
    // No file yet (fresh install): defaults.
    if (isMissingFile(error)) return DEFAULT_SETTINGS;
    // Unreadable or corrupt file: keep the last good value rather than
    // silently switching folder, which would hide every document.
    console.error("Unreadable machine settings:", error);
    return cache?.settings ?? DEFAULT_SETTINGS;
  }
}

/**
 * Settings after switching from folder `from` to `to` (`toSetting` null = the
 * default folder). `from` joins the previous folders; `to` leaves them.
 */
export function switchedSettings(
  current: MachineSettings,
  from: string,
  to: string,
  toSetting: string | null
): MachineSettings {
  const key = (p: string) => path.resolve(p).toLowerCase();
  const previous = [...current.previousDocumentsDirs, from].filter(
    (dir, i, all) => key(dir) !== key(to) && all.findIndex((d) => key(d) === key(dir)) === i
  );
  return { documentsDir: toSetting, previousDocumentsDirs: previous };
}

/** Atomic write (temp file + rename): an interrupted save never corrupts it. */
export function writeMachineSettings(next: MachineSettings): void {
  const file = settingsFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(next, null, 2), "utf8");
  fs.renameSync(temp, file);
}
