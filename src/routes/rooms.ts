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
                category,
                price_json,
                duration_minutes,
                min_players,
                max_players,
                search_level,
                thinking_level,
                manipulation_level,
                difficulty_level,
                is_pmr_accessible
            } = req.body;

            if (
                !escape_game_id ||
                !name ||
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
          category,
          price_json,
          duration_minutes,
          min_players,
          max_players,
          search_level,
          thinking_level,
          manipulation_level,
          difficulty_level,
          is_pmr_accessible
        )
        VALUES (
          ${escape_game_id},
          ${name},
          ${description},
          ${image_url},
          ${category},
          ${price_json ? JSON.stringify(price_json) : null},
          ${duration_minutes},
          ${min_players},
          ${max_players},
          ${search_level || 1},
          ${thinking_level || 1},
          ${manipulation_level || 1},
          ${difficulty_level || 1},
          ${is_pmr_accessible || false}
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
 */
router.get('/', async (req, res) => {
    try {
        const rows = await sql<any[]>`
      SELECT
        r.id,
        r.name AS title,
        r.description,
        r.image_url AS image,
        r.category,
        r.price_json AS price,
        r.duration_minutes AS duration,
        r.min_players AS "minPlayers",
        r.max_players AS "maxPlayers",
        r.search_level AS "searchLevel",
        r.thinking_level AS "thinkingLevel",
        r.manipulation_level AS "manipulationLevel",
        r.difficulty_level AS "difficultyLevel",
        r.is_pmr_accessible AS "isPmrAccessible",
        eg.display_name AS escape_game_nom,
        eg.address_line1 AS escape_game_adresse,
        eg.contact_phone AS escape_game_phone,
        eg.contact_email AS escape_game_mail,
        eg.latitude,
        eg.longitude
      FROM rooms r
      JOIN escape_games eg ON r.escape_game_id = eg.id
      WHERE r.is_active = TRUE AND eg.is_active = TRUE
      ORDER BY r.created_at DESC
      LIMIT 100
    `;

        // Map flat SQL result to nested Room interface
        const rooms = rows.map(r => ({
            id: r.id,
            title: r.title,
            image: r.image,
            category: r.category,
            description: r.description,
            searchLevel: r.searchLevel,
            thinkingLevel: r.thinkingLevel,
            manipulationLevel: r.manipulationLevel,
            difficultyLevel: r.difficultyLevel,
            duration: r.duration,
            minPlayers: r.minPlayers,
            maxPlayers: r.maxPlayers,
            price: r.price || {},
            isPmrAccessible: r.isPmrAccessible,
            escapeGame: {
                nom: r.escape_game_nom,
                adresse: r.escape_game_adresse,
                telephone: r.escape_game_phone,
                mail: r.escape_game_mail,
                coordinates: r.latitude && r.longitude ? { lat: r.latitude, lng: r.longitude } : undefined
            }
        }));

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
        r.id,
        r.name AS title,
        r.description,
        r.image_url AS image,
        r.category,
        r.price_json AS price,
        r.duration_minutes AS duration,
        r.min_players AS "minPlayers",
        r.max_players AS "maxPlayers",
        r.search_level AS "searchLevel",
        r.thinking_level AS "thinkingLevel",
        r.manipulation_level AS "manipulationLevel",
        r.difficulty_level AS "difficultyLevel",
        r.is_pmr_accessible AS "isPmrAccessible",
        eg.display_name AS escape_game_nom,
        eg.address_line1 AS escape_game_adresse,
        eg.contact_phone AS escape_game_phone,
        eg.contact_email AS escape_game_mail,
        eg.latitude,
        eg.longitude
      FROM rooms r
      JOIN escape_games eg ON r.escape_game_id = eg.id
      WHERE r.id = ${id} AND r.is_active = TRUE AND eg.is_active = TRUE
      LIMIT 1
    `;

        const r = rows[0];

        if (!r) {
            return res.status(404).json({ error: 'not_found' });
        }

        const room = {
            id: r.id,
            title: r.title,
            image: r.image,
            category: r.category,
            description: r.description,
            searchLevel: r.searchLevel,
            thinkingLevel: r.thinkingLevel,
            manipulationLevel: r.manipulationLevel,
            difficultyLevel: r.difficultyLevel,
            duration: r.duration,
            minPlayers: r.minPlayers,
            maxPlayers: r.maxPlayers,
            price: r.price || {},
            isPmrAccessible: r.isPmrAccessible,
            escapeGame: {
                nom: r.escape_game_nom,
                adresse: r.escape_game_adresse,
                telephone: r.escape_game_phone,
                mail: r.escape_game_mail,
                coordinates: r.latitude && r.longitude ? { lat: r.latitude, lng: r.longitude } : undefined
            }
        };

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
                category,
                price_json,
                duration_minutes,
                min_players,
                max_players,
                search_level,
                thinking_level,
                manipulation_level,
                difficulty_level,
                is_pmr_accessible,
                is_active
            } = req.body;

            const updated = await sql<any[]>`
        UPDATE rooms
        SET
          name = COALESCE(${name}, name),
          description = COALESCE(${description}, description),
          image_url = COALESCE(${image_url}, image_url),
          category = COALESCE(${category}, category),
          price_json = COALESCE(${price_json ? JSON.stringify(price_json) : null}, price_json),
          duration_minutes = COALESCE(${duration_minutes}, duration_minutes),
          min_players = COALESCE(${min_players}, min_players),
          max_players = COALESCE(${max_players}, max_players),
          search_level = COALESCE(${search_level}, search_level),
          thinking_level = COALESCE(${thinking_level}, thinking_level),
          manipulation_level = COALESCE(${manipulation_level}, manipulation_level),
          difficulty_level = COALESCE(${difficulty_level}, difficulty_level),
          is_pmr_accessible = COALESCE(${is_pmr_accessible}, is_pmr_accessible),
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
