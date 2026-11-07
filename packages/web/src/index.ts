import path from 'node:path';

/** Folder with the static browser app, to pass to the server as `publicDir`. */
export const publicDir = path.join(import.meta.dirname, '..', 'public');
