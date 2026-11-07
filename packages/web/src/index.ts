import path from 'node:path';

/** Folder with the built browser app (`pnpm build`), to pass to the server as `publicDir`. */
export const publicDir = path.join(import.meta.dirname, '..', 'dist');
