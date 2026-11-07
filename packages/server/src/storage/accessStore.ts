// Who may do what with a document. One rule, used by every route:
//   owner   the document's owner_id
//   editor  a grant with role 'editor'
//   viewer  a grant with role 'viewer', or visibility 'everyone' (every signed-in user)
//   none    otherwise; routes answer 404 so document ids cannot be probed

import { toIso, type Db, type Queryable } from './db.ts';

export type Role = 'none' | 'viewer' | 'editor' | 'owner';
export type GrantRole = 'viewer' | 'editor';
export type Visibility = 'private' | 'everyone';

const RANK: Record<Role, number> = { none: 0, viewer: 1, editor: 2, owner: 3 };
export const atLeast = (role: Role, minimum: Role) => RANK[role] >= RANK[minimum];
export const isGrantRole = (value: unknown): value is GrantRole => value === 'viewer' || value === 'editor';
export const isVisibility = (value: unknown): value is Visibility => value === 'private' || value === 'everyone';

export interface UserSummary {
  id: string;
  name: string;
  email: string | null;
}

export interface DocumentAccess {
  owner: UserSummary | null;
  visibility: Visibility;
  /** Sorted by name. */
  grants: Array<{ user: UserSummary; role: GrantRole; grantedAt: string }>;
}

/** SQL expression for the role of user $1 on document alias d with grant alias g (left-joined for $1). */
export const ROLE_SQL = `CASE WHEN d.owner_id = $1 THEN 'owner'
  WHEN g.role IS NOT NULL THEN g.role
  WHEN d.visibility = 'everyone' THEN 'viewer'
  ELSE 'none' END`;

/** Gives every document without an owner to the first user who signed in; returns how many changed. */
export async function adoptUnowned(q: Queryable): Promise<number> {
  return (await q.run(
    `UPDATE documents SET owner_id = (SELECT id FROM users ORDER BY created_at, id LIMIT 1)
     WHERE owner_id IS NULL AND EXISTS (SELECT 1 FROM users)`
  )).changes;
}

export type AccessStore = ReturnType<typeof createAccessStore>;

export function createAccessStore(db: Db) {
  return {
    adoptUnowned: () => db.transaction(adoptUnowned),

    /** The user's role on a document; 'none' also when the document does not exist. */
    async roleOf(userId: string, documentId: string): Promise<Role> {
      const row = await db.read((q) =>
        q.get<{ role: Role }>(
          `SELECT ${ROLE_SQL} AS role FROM documents d
           LEFT JOIN document_grants g ON g.document_id = d.id AND g.user_id = $1
           WHERE d.id = $2`,
          [userId, documentId]
        )
      );
      return row?.role ?? 'none';
    },

    access(documentId: string): Promise<DocumentAccess> {
      return db.read(async (q) => {
        const doc = await q.get<{ visibility: Visibility; owner_id: string | null; name: string | null; email: string | null }>(
          `SELECT d.visibility, d.owner_id, u.name, u.email FROM documents d LEFT JOIN users u ON u.id = d.owner_id WHERE d.id = $1`,
          [documentId]
        );
        const grants = await q.all<{ id: string; name: string; email: string | null; role: GrantRole; created_at: unknown }>(
          `SELECT u.id, u.name, u.email, g.role, g.created_at FROM document_grants g JOIN users u ON u.id = g.user_id
           WHERE g.document_id = $1 ORDER BY lower(u.name), u.id`,
          [documentId]
        );
        return {
          owner: doc?.owner_id ? { id: doc.owner_id, name: doc.name!, email: doc.email ?? null } : null,
          visibility: doc?.visibility ?? 'private',
          grants: grants.map((g) => ({ user: { id: g.id, name: g.name, email: g.email ?? null }, role: g.role, grantedAt: toIso(g.created_at)! }))
        };
      });
    },

    /** Gives a user a role; refuses the owner and unknown users. */
    grant(documentId: string, userId: string, role: GrantRole, grantedBy: string): Promise<'ok' | 'owner' | 'unknown-user'> {
      return db.transaction(async (q) => {
        if (!(await q.get('SELECT id FROM users WHERE id = $1', [userId]))) return 'unknown-user';
        if (await q.get('SELECT id FROM documents WHERE id = $1 AND owner_id = $2', [documentId, userId])) return 'owner';
        const now = new Date().toISOString();
        const updated = await q.run('UPDATE document_grants SET role = $3, updated_at = $4 WHERE document_id = $1 AND user_id = $2', [documentId, userId, role, now]);
        if (!updated.changes) {
          await q.run(
            'INSERT INTO document_grants (document_id, user_id, role, granted_by, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $5)',
            [documentId, userId, role, grantedBy, now]
          );
        }
        return 'ok';
      });
    },

    /** Removes a user's grant; false when there was none. */
    revoke(documentId: string, userId: string): Promise<boolean> {
      return db.transaction(async (q) =>
        (await q.run('DELETE FROM document_grants WHERE document_id = $1 AND user_id = $2', [documentId, userId])).changes > 0
      );
    },

    setVisibility(documentId: string, visibility: Visibility): Promise<void> {
      return db.transaction(async (q) => {
        await q.run('UPDATE documents SET visibility = $2 WHERE id = $1', [documentId, visibility]);
      });
    },

    /** Signed-in users whose name or email contains `query` (case-insensitive), for the share dialog. */
    searchUsers(query: string, limit = 10): Promise<UserSummary[]> {
      const pattern = `%${query.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      return db.read(async (q) =>
        (await q.all<{ id: string; name: string; email: string | null }>(
          `SELECT id, name, email FROM users
           WHERE lower(name) LIKE $1 ESCAPE '\\' OR lower(coalesce(email, '')) LIKE $1 ESCAPE '\\'
           ORDER BY lower(name), id LIMIT $2`,
          [pattern, limit]
        )).map((u) => ({ id: u.id, name: u.name, email: u.email ?? null }))
      );
    }
  };
}
