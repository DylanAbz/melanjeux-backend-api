import { Router } from 'express';
import { sql } from '../db';
import { authRequired, AuthRequest } from '../middleware/auth';
import { requireEscapeOwner } from '../middleware/roles';

const router = Router();

// CREATE escape game (owner)
router.post(
    '/',
    authRequired,
    requireEscapeOwner,
    async (req: AuthRequest, res) => {
        try {
            const {
                display_name,
                legal_name,
                siret,
                address_line1,
                address_line2,
                city,
                postal_code,
                country,
                contact_email,
                contact_phone,
                description,
                logo_url,
            } = req.body;

            if (
                !display_name ||
                !address_line1 ||
                !city ||
                !postal_code ||
                !country ||
                !contact_email
            ) {
                return res.status(400).json({ error: 'missing_required_fields' });
            }

            const result = await sql<{
                id: string;
                display_name: string;
                owner_user_id: string;
            }[]>`
        INSERT INTO escape_games (
          owner_user_id,
          display_name,
          legal_name,
          siret,
          address_line1,
          address_line2,
          city,
          postal_code,
          country,
          contact_email,
          contact_phone,
          description,
          logo_url
        )
        VALUES (
          ${req.user!.id},
          ${display_name},
          ${legal_name},
          ${siret},
          ${address_line1},
          ${address_line2},
          ${city},
          ${postal_code},
          ${country},
          ${contact_email},
          ${contact_phone},
          ${description},
          ${logo_url}
        )
        RETURNING id, display_name, owner_user_id
      `;

            return res.status(201).json(result[0]);
        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: 'internal_error' });
        }
    }
);

// LIST escape games (public, pour la recherche)
router.get('/', async (_req, res) => {
    try {
        const games = await sql<any[]>`
      SELECT
        id,
        display_name,
        city,
        postal_code,
        country,
        description,
        logo_url,
        is_active
      FROM escape_games
      WHERE is_active = TRUE
      ORDER BY display_name ASC
    `;
        return res.json(games);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'internal_error' });
    }
});

// GET one escape game (public)
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const rows = await sql<any[]>`
      SELECT
        id,
        display_name,
        legal_name,
        siret,
        address_line1,
        address_line2,
        city,
        postal_code,
        country,
        contact_email,
        contact_phone,
        description,
        logo_url,
        is_active,
        created_at
      FROM escape_games
      WHERE id = ${id}
      LIMIT 1
    `;
        const game = rows[0];
        if (!game) {
            return res.status(404).json({ error: 'not_found' });
        }
        return res.json(game);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'internal_error' });
    }
});

// UPDATE escape game (owner only, sur son propre escape)
router.put(
    '/:id',
    authRequired,
    requireEscapeOwner,
    async (req: AuthRequest, res) => {
        try {
            const { id } = req.params;

            // Vérifier que l'escape appartient à l'utilisateur
            const ownerCheck = await sql<{ owner_user_id: string }[]>`
        SELECT owner_user_id
        FROM escape_games
        WHERE id = ${id}
        LIMIT 1
      `;
            const game = ownerCheck[0];
            if (!game) {
                return res.status(404).json({ error: 'not_found' });
            }
            if (game.owner_user_id !== req.user!.id) {
                return res.status(403).json({ error: 'forbidden' });
            }

            const {
                display_name,
                legal_name,
                siret,
                address_line1,
                address_line2,
                city,
                postal_code,
                country,
                contact_email,
                contact_phone,
                description,
                logo_url,
                is_active,
            } = req.body;

            const updated = await sql<any[]>`
        UPDATE escape_games
        SET
          display_name = COALESCE(${display_name}, display_name),
          legal_name = COALESCE(${legal_name}, legal_name),
          siret = COALESCE(${siret}, siret),
          address_line1 = COALESCE(${address_line1}, address_line1),
          address_line2 = COALESCE(${address_line2}, address_line2),
          city = COALESCE(${city}, city),
          postal_code = COALESCE(${postal_code}, postal_code),
          country = COALESCE(${country}, country),
          contact_email = COALESCE(${contact_email}, contact_email),
          contact_phone = COALESCE(${contact_phone}, contact_phone),
          description = COALESCE(${description}, description),
          logo_url = COALESCE(${logo_url}, logo_url),
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

// DELETE (soft delete: on passe is_active à false)
router.delete(
    '/:id',
    authRequired,
    requireEscapeOwner,
    async (req: AuthRequest, res) => {
        try {
            const { id } = req.params;

            const ownerCheck = await sql<{ owner_user_id: string }[]>`
        SELECT owner_user_id
        FROM escape_games
        WHERE id = ${id}
        LIMIT 1
      `;
            const game = ownerCheck[0];
            if (!game) {
                return res.status(404).json({ error: 'not_found' });
            }
            if (game.owner_user_id !== req.user!.id) {
                return res.status(403).json({ error: 'forbidden' });
            }

            await sql`
        UPDATE escape_games
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
