import { Router } from 'express';
import { sql } from '../db';
import { authRequired, AuthRequest } from '../middleware/auth';
import { requireEscapeOwner } from '../middleware/roles';

const router = Router();

/**
 * Helper: vérifier que l'escape appartient bien au owner connecté
 */
async function ensureEscapeOwnership(escapeGameId: string, userId: string) {
    const rows = await sql<{ owner_user_id: string }[]>`
    SELECT owner_user_id
    FROM escape_games
    WHERE id = ${escapeGameId}
    LIMIT 1
  `;
    const game = rows[0];
    if (!game) return { exists: false, ownerMatches: false };
    return {
        exists: true,
        ownerMatches: game.owner_user_id === userId,
    };
}

/**
 * CREATE room (escape owner)
 */
router.post(
    '/',
    authRequired,
    requireEscapeOwner,
    async (req: AuthRequest, res) => {
        try {
            const {
                escape_game_id,
                name,
                description,
                image_url,
                price_total,
                duration_minutes,
                difficulty,
                theme,
                languages,
                min_players,
                max_players,
            } = req.body;

            if (
                !escape_game_id ||
                !name ||
                !price_total ||
                !duration_minutes ||
                !min_players ||
                !max_players
            ) {
                return res.status(400).json({ error: 'missing_required_fields' });
            }

            const ownership = await ensureEscapeOwnership(
                escape_game_id,
                req.user!.id
            );
            if (!ownership.exists) {
                return res.status(404).json({ error: 'escape_game_not_found' });
            }
            if (!ownership.ownerMatches) {
                return res.status(403).json({ error: 'forbidden' });
            }

            const result = await sql<any[]>`
        INSERT INTO rooms (
          escape_game_id,
          name,
          description,
          image_url,
          price_total,
          duration_minutes,
          difficulty,
          theme,
          languages,
          min_players,
          max_players
        )
        VALUES (
          ${escape_game_id},
          ${name},
          ${description},
          ${image_url},
          ${price_total},
          ${duration_minutes},
          ${difficulty},
          ${theme},
          ${languages ? JSON.stringify(languages) : null},
          ${min_players},
          ${max_players}
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
 * LIST / SEARCH rooms (public, joueurs)
 * Filtres possibles:
 * - name (substring)
 * - city
 * - min_price, max_price
 * - difficulty
 */
router.get('/', async (req, res) => {
    try {
        const { name, city, min_price, max_price, difficulty } = req.query;

        const filters: string[] = ['r.is_active = TRUE', 'eg.is_active = TRUE'];
        const params: any[] = [];

        if (name) {
            params.push(`%${name}%`);
            filters.push(`r.name ILIKE $${params.length}`);
        }

        if (city) {
            params.push(city);
            filters.push(`eg.city ILIKE $${params.length}`);
        }

        if (min_price) {
            params.push(min_price);
            filters.push(`r.price_total >= $${params.length}`);
        }

        if (max_price) {
            params.push(max_price);
            filters.push(`r.price_total <= $${params.length}`);
        }

        if (difficulty) {
            params.push(difficulty);
            filters.push(`r.difficulty = $${params.length}`);
        }

        const whereClause = filters.length
            ? 'WHERE ' + filters.join(' AND ')
            : '';

        const query = `
      SELECT
        r.id,
        r.name,
        r.description,
        r.image_url,
        r.price_total,
        r.duration_minutes,
        r.difficulty,
        r.theme,
        r.languages,
        r.min_players,
        r.max_players,
        eg.id AS escape_game_id,
        eg.display_name AS escape_game_name,
        eg.city,
        eg.postal_code,
        eg.country
      FROM rooms r
      JOIN escape_games eg ON r.escape_game_id = eg.id
      ${whereClause}
      ORDER BY eg.city ASC, r.name ASC
      LIMIT 100
    `;

        const rooms = await sql<any[]>(query, params);

        return res.json(rooms);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'internal_error' });
    }
});

/**
 * GET room by id (public)
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const rows = await sql<any[]>`
      SELECT
        r.*,
        eg.display_name AS escape_game_name,
        eg.city,
        eg.postal_code,
        eg.country
      FROM rooms r
      JOIN escape_games eg ON r.escape_game_id = eg.id
      WHERE r.id = ${id} AND r.is_active = TRUE AND eg.is_active = TRUE
      LIMIT 1
    `;

        const room = rows[0];
        if (!room) {
            return res.status(404).json({ error: 'not_found' });
        }
        return res.json(room);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'internal_error' });
    }
});

/**
 * UPDATE room (owner, seulement sur ses salles)
 */
router.put(
    '/:id',
    authRequired,
    requireEscapeOwner,
    async (req: AuthRequest, res) => {
        try {
            const { id } = req.params;

            const rows = await sql<{ escape_game_id: string }[]>`
        SELECT escape_game_id
        FROM rooms
        WHERE id = ${id}
        LIMIT 1
      `;
            const room = rows[0];
            if (!room) {
                return res.status(404).json({ error: 'not_found' });
            }

            const ownership = await ensureEscapeOwnership(
                room.escape_game_id,
                req.user!.id
            );
            if (!ownership.ownerMatches) {
                return res.status(403).json({ error: 'forbidden' });
            }

            const {
                name,
                description,
                image_url,
                price_total,
                duration_minutes,
                difficulty,
                theme,
                languages,
                min_players,
                max_players,
                is_active,
            } = req.body;

            const updated = await sql<any[]>`
        UPDATE rooms
        SET
          name = COALESCE(${name}, name),
          description = COALESCE(${description}, description),
          image_url = COALESCE(${image_url}, image_url),
          price_total = COALESCE(${price_total}, price_total),
          duration_minutes = COALESCE(${duration_minutes}, duration_minutes),
          difficulty = COALESCE(${difficulty}, difficulty),
          theme = COALESCE(${theme}, theme),
          languages = COALESCE(${languages ? JSON.stringify(languages) : null}, languages),
          min_players = COALESCE(${min_players}, min_players),
          max_players = COALESCE(${max_players}, max_players),
          is_active = COALESCE(${is_active}, is_active)
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
 * DELETE room (soft delete)
 */
router.delete(
    '/:id',
    authRequired,
    requireEscapeOwner,
    async (req: AuthRequest, res) => {
        try {
            const { id } = req.params;

            const rows = await sql<{ escape_game_id: string }[]>`
        SELECT escape_game_id
        FROM rooms
        WHERE id = ${id}
        LIMIT 1
      `;
            const room = rows[0];
            if (!room) {
                return res.status(404).json({ error: 'not_found' });
            }

            const ownership = await ensureEscapeOwnership(
                room.escape_game_id,
                req.user!.id
            );
            if (!ownership.ownerMatches) {
                return res.status(403).json({ error: 'forbidden' });
            }

            await sql`
        UPDATE rooms
        SET is_active = FALSE
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
