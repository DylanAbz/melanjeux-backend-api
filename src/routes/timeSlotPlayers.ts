import { Router } from 'express';
import { sql } from '../db';
import { authRequired, AuthRequest } from '../middleware/auth';

const router = Router();

/**
 * Helper pour récupérer min/max players effectifs pour un créneau
 */
async function getSlotCapacity(slotId: string) {
    const rows = await sql<{
        min_players: number;
        max_players: number;
        min_players_override: number | null;
        max_players_override: number | null;
        current_players_count: number;
        status: string;
    }[]>`
    SELECT
      r.min_players,
      r.max_players,
      ts.min_players_override,
      ts.max_players_override,
      ts.current_players_count,
      ts.status
    FROM time_slots ts
    JOIN rooms r ON ts.room_id = r.id
    WHERE ts.id = ${slotId}
    LIMIT 1
  `;
    const row = rows[0];
    if (!row) return null;

    const effectiveMin =
        row.min_players_override ?? row.min_players;
    const effectiveMax =
        row.max_players_override ?? row.max_players;

    return {
        minPlayers: effectiveMin,
        maxPlayers: effectiveMax,
        currentPlayers: row.current_players_count,
        status: row.status as
            | 'empty'
            | 'filling'
            | 'payment_pending'
            | 'confirmed'
            | 'cancelled',
    };
}

/**
 * JOIN a time slot (joueur)
 */
router.post(
    '/join',
    authRequired,
    async (req: AuthRequest, res) => {
        try {
            if (!req.user || req.user.role !== 'player') {
                return res.status(403).json({ error: 'only_players_can_join' });
            }

            const { time_slot_id } = req.body;
            if (!time_slot_id) {
                return res.status(400).json({ error: 'time_slot_id_required' });
            }

            const capacity = await getSlotCapacity(time_slot_id);
            if (!capacity) {
                return res.status(404).json({ error: 'time_slot_not_found' });
            }
            if (capacity.status === 'cancelled' || capacity.status === 'confirmed') {
                return res.status(400).json({ error: 'slot_not_joinable' });
            }
            if (capacity.currentPlayers >= capacity.maxPlayers) {
                return res.status(400).json({ error: 'slot_full' });
            }

            // Inscription du joueur
            const inserted = await sql<any[]>`
        INSERT INTO time_slot_players (
          time_slot_id,
          user_id,
          status
        )
        VALUES (
          ${time_slot_id},
          ${req.user.id},
          'joined'
        )
        ON CONFLICT (time_slot_id, user_id)
        DO UPDATE SET status = 'joined'
        RETURNING *
      `;

            // Mettre à jour le compteur
            const updatedCount = await sql<{ count: number }[]>`
        SELECT COUNT(*)::int AS count
        FROM time_slot_players
        WHERE time_slot_id = ${time_slot_id}
          AND status IN ('joined', 'paying', 'paid')
      `;

            const newCount = updatedCount[0].count;

            // Mettre à jour le status du slot en fonction du nombre de joueurs
            let newStatus: string = capacity.status;
            if (newCount === 0) {
                newStatus = 'empty';
            } else if (newCount < capacity.minPlayers) {
                newStatus = 'filling';
            } else {
                // nombre minimal atteint, on pourra passer en paiement plus tard
                if (capacity.status === 'empty' || capacity.status === 'filling') {
                    newStatus = 'filling'; // ou 'payment_pending' selon ton workflow
                }
            }

            await sql`
        UPDATE time_slots
        SET
          current_players_count = ${newCount},
          status = ${newStatus}
        WHERE id = ${time_slot_id}
      `;

            return res.status(200).json(inserted[0]);
        } catch (err: any) {
            if (err.code === '23503') {
                return res.status(404).json({ error: 'time_slot_not_found' });
            }
            console.error(err);
            return res.status(500).json({ error: 'internal_error' });
        }
    }
);

/**
 * LEAVE a time slot (joueur)
 */
router.post(
    '/leave',
    authRequired,
    async (req: AuthRequest, res) => {
        try {
            if (!req.user || req.user.role !== 'player') {
                return res.status(403).json({ error: 'only_players_can_leave' });
            }

            const { time_slot_id } = req.body;
            if (!time_slot_id) {
                return res.status(400).json({ error: 'time_slot_id_required' });
            }

            await sql`
        UPDATE time_slot_players
        SET status = 'cancelled'
        WHERE time_slot_id = ${time_slot_id}
          AND user_id = ${req.user.id}
          AND status IN ('joined', 'paying')
      `;

            const capacity = await getSlotCapacity(time_slot_id);
            if (!capacity) {
                return res.status(404).json({ error: 'time_slot_not_found' });
            }

            const updatedCount = await sql<{ count: number }[]>`
        SELECT COUNT(*)::int AS count
        FROM time_slot_players
        WHERE time_slot_id = ${time_slot_id}
          AND status IN ('joined', 'paying', 'paid')
      `;
            const newCount = updatedCount[0].count;

            let newStatus: string = capacity.status;
            if (newCount === 0) {
                newStatus = 'empty';
            } else if (newCount < capacity.minPlayers) {
                newStatus = 'filling';
            }

            await sql`
        UPDATE time_slots
        SET
          current_players_count = ${newCount},
          status = ${newStatus}
        WHERE id = ${time_slot_id}
      `;

            return res.status(204).send();
        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: 'internal_error' });
        }
    }
);

/**
 * GET current user's bookings
 */
router.get(
    '/my-bookings',
    authRequired,
    async (req: AuthRequest, res) => {
        try {
            const rows = await sql<any[]>`
        SELECT
          ts.id as slot_id,
          ts.start_time,
          ts.status as slot_status,
          ts.current_players_count,
          r.name as room_title,
          r.image_url as room_image,
          r.min_players,
          r.max_players,
          tsp.status as player_status
        FROM time_slot_players tsp
        JOIN time_slots ts ON tsp.time_slot_id = ts.id
        JOIN rooms r ON ts.room_id = r.id
        WHERE tsp.user_id = ${req.user!.id}
          AND tsp.status != 'cancelled'
        ORDER BY ts.start_time DESC
      `;

            return res.json(rows);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: 'internal_error' });
        }
    }
);

/**
 * LIST players for a slot (owner ou admin plus tard, ici on fait simple: owner via join)
 */
router.get(
    '/by-slot/:id',
    authRequired,
    async (req: AuthRequest, res) => {
        try {
            const { id } = req.params;

            const players = await sql<any[]>`
        SELECT
          tsp.id,
          tsp.status,
          tsp.created_at,
          u.id AS user_id,
          u.email
        FROM time_slot_players tsp
        JOIN users u ON tsp.user_id = u.id
        WHERE tsp.time_slot_id = ${id}
      `;

            return res.json(players);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: 'internal_error' });
        }
    }
);

export default router;
