import { Router } from 'express';
import { sql } from '../db';
import { authRequired, AuthRequest } from '../middleware/auth';
import { requireEscapeOwner } from '../middleware/roles';

const router = Router();

/**
 * Helper: vérifier que la room appartient bien à un escape game possédé par l'utilisateur
 */
async function ensureRoomOwnership(roomId: string, userId: string) {
    const rows = await sql<{ owner_user_id: string }[]>`
    SELECT eg.owner_user_id
    FROM rooms r
    JOIN escape_games eg ON r.escape_game_id = eg.id
    WHERE r.id = ${roomId}
    LIMIT 1
  `;
    const row = rows[0];
    if (!row) return { exists: false, ownerMatches: false };
    return {
        exists: true,
        ownerMatches: row.owner_user_id === userId,
    };
}

/**
 * CREATE time slot (escape owner)
 */
router.post(
    '/',
    authRequired,
    requireEscapeOwner,
    async (req: AuthRequest, res) => {
        try {
            const {
                room_id,
                start_time,
                min_players_override,
                max_players_override,
            } = req.body;

            if (!room_id || !start_time) {
                return res.status(400).json({ error: 'missing_required_fields' });
            }

            const ownership = await ensureRoomOwnership(room_id, req.user!.id);
            if (!ownership.exists) {
                return res.status(404).json({ error: 'room_not_found' });
            }
            if (!ownership.ownerMatches) {
                return res.status(403).json({ error: 'forbidden' });
            }

            const result = await sql<any[]>`
        INSERT INTO time_slots (
          room_id,
          start_time,
          status,
          min_players_override,
          max_players_override,
          current_players_count
        )
        VALUES (
          ${room_id},
          ${start_time},
          'empty',
          ${min_players_override},
          ${max_players_override},
          0
        )
        RETURNING *
      `;

            return res.status(201).json(result[0]);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: 'internal_error' });
        }
    }
);

/**
 * LIST time slots pour une room (public, joueurs)
 * - option: filtrer à partir d'une date
 */
router.get('/', async (req, res) => {
    try {
        const { room_id, from } = req.query;

        if (!room_id) {
            return res.status(400).json({ error: 'room_id_required' });
        }

        const params: any[] = [room_id];
        let where = 'WHERE ts.room_id = $1';

        if (from) {
            params.push(from);
            where += ` AND ts.start_time >= $${params.length}`;
        }

        where += ` AND ts.status != 'cancelled'`;

        const query = `
      SELECT
        ts.id,
        ts.room_id,
        ts.start_time,
        ts.status,
        ts.min_players_override,
        ts.max_players_override,
        ts.current_players_count
      FROM time_slots ts
      ${where}
      ORDER BY ts.start_time ASC
      LIMIT 200
    `;

        const slots = await sql<any[]>(query, params);

        return res.json(slots);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'internal_error' });
    }
});

/**
 * UPDATE time slot (owner, pour changer statut / overrides)
 */
router.put(
    '/:id',
    authRequired,
    requireEscapeOwner,
    async (req: AuthRequest, res) => {
        try {
            const { id } = req.params;

            const rows = await sql<{ room_id: string }[]>`
        SELECT room_id
        FROM time_slots
        WHERE id = ${id}
        LIMIT 1
      `;
            const slot = rows[0];
            if (!slot) {
                return res.status(404).json({ error: 'not_found' });
            }

            const ownership = await ensureRoomOwnership(slot.room_id, req.user!.id);
            if (!ownership.ownerMatches) {
                return res.status(403).json({ error: 'forbidden' });
            }

            const {
                start_time,
                status,
                min_players_override,
                max_players_override,
            } = req.body;

            const updated = await sql<any[]>`
        UPDATE time_slots
        SET
          start_time = COALESCE(${start_time}, start_time),
          status = COALESCE(${status}, status),
          min_players_override = COALESCE(${min_players_override}, min_players_override),
          max_players_override = COALESCE(${max_players_override}, max_players_override)
        WHERE id = ${id}
        RETURNING *
      `;

            return res.json(updated[0]);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: 'internal_error' });
        }
    }
);

/**
 * DELETE time slot (soft via status=cancelled)
 */
router.delete(
    '/:id',
    authRequired,
    requireEscapeOwner,
    async (req: AuthRequest, res) => {
        try {
            const { id } = req.params;

            const rows = await sql<{ room_id: string }[]>`
        SELECT room_id
        FROM time_slots
        WHERE id = ${id}
        LIMIT 1
      `;
            const slot = rows[0];
            if (!slot) {
                return res.status(404).json({ error: 'not_found' });
            }

            const ownership = await ensureRoomOwnership(slot.room_id, req.user!.id);
            if (!ownership.ownerMatches) {
                return res.status(403).json({ error: 'forbidden' });
            }

            await sql`
        UPDATE time_slots
        SET status = 'cancelled'
        WHERE id = ${id}
      `;

            return res.status(204).send();
        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: 'internal_error' });
        }
    }
);

export default router;
