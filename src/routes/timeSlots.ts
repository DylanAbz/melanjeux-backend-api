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
 * NEW: GET available dates for a room
 */
router.get('/available-dates', async (req, res) => {
    try {
        const { room_id } = req.query;
        if (!room_id) return res.status(400).json({ error: 'room_id_required' });

        const rows = await sql<any[]>`
            SELECT DISTINCT TO_CHAR(start_time, 'YYYY-MM-DD') as date
            FROM time_slots
            WHERE room_id = ${room_id as string} 
              AND status IN ('empty', 'partially_filled')
              AND start_time >= NOW()
            ORDER BY date ASC
        `;

        return res.json(rows.map(r => r.date));
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'internal_error' });
    }
});

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
 * LIST time slots pour une room
 */
router.get('/', async (req, res) => {
    try {
        const { room_id, date } = req.query;

        if (!room_id) {
            return res.status(400).json({ error: 'room_id_required' });
        }

        let slots;
        if (date) {
            // Filter by specific day, but only in the future
            slots = await sql<any[]>`
                SELECT * FROM time_slots
                WHERE room_id = ${room_id as string}
                  AND TO_CHAR(start_time, 'YYYY-MM-DD') = ${date as string}
                  AND start_time >= NOW()
                  AND status != 'cancelled'
                ORDER BY start_time ASC
            `;
        } else {
            slots = await sql<any[]>`
                SELECT * FROM time_slots
                WHERE room_id = ${room_id as string}
                  AND start_time >= NOW()
                  AND status != 'cancelled'
                ORDER BY start_time ASC
                LIMIT 200
            `;
        }

        return res.json(slots);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'internal_error' });
    }
});

/**
 * UPDATE time slot
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
 * GET one time slot with full room and escape game details
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const rows = await sql<any[]>`
            SELECT 
                ts.*,
                r.name as room_name,
                r.price_json,
                r.duration_minutes,
                r.min_players,
                r.max_players,
                eg.display_name as escape_game_nom,
                eg.address_line1 as escape_game_adresse,
                (SELECT COUNT(*)::int FROM time_slot_players WHERE time_slot_id = ts.id AND status = 'paid') as paid_players_count
            FROM time_slots ts
            JOIN rooms r ON ts.room_id = r.id
            JOIN escape_games eg ON r.escape_game_id = eg.id
            WHERE ts.id = ${id}
            LIMIT 1
        `;

        if (rows.length === 0) {
            return res.status(404).json({ error: 'not_found' });
        }

        return res.json(rows[0]);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'internal_error' });
    }
});

/**
 * DELETE time slot
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
