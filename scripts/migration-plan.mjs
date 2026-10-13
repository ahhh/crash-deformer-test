// @ts-check
/**
 * Migration bookkeeping for `src/lib/db.ts` (PGLite, `import.meta.glob`).
 *
 * Applied files are keyed by BASENAME, so the same file applies once no matter
 * which directory it is globbed from. The applier does not descend into
 * subdirectories.
 */
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** The workspace root (this file lives in `<root>/scripts/`). */
export function projectRoot() {
  return dirname(dirname(fileURLToPath(import.meta.url)));
}

/**
 * The `_migrations` key for a migration path (or bare filename).
 * @param {string} path
 * @returns {string}
 */
export function migrationName(path) {
  return path.split("/").pop() ?? path;
}

/**
 * @param {string} path
 * @returns {boolean}
 */
export function isMigrationFile(path) {
  return path.endsWith(".sql");
}

/**
 * Migrations in `paths` that are not yet in `applied`, in apply order.
 * Non-`.sql` entries (a `readdir` also yields subdirectories) are dropped.
 * @param {Iterable<string>} paths
 * @param {Iterable<string>} applied
 * @returns {Array<{ name: string, path: string }>}
 */
export function pendingMigrations(paths, applied) {
  const done = new Set(applied);
  return [...paths]
    .filter(isMigrationFile)
    .map((path) => ({ name: migrationName(path), path }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter(({ name }) => !done.has(name));
}
