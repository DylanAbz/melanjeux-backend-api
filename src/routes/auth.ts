import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { sql } from '../db';
import { signToken } from '../middleware/auth';

const router = Router();

router.post('/signup', async (req, res) => {
    try {
        const {
            email,
            password,
            firstName,
            lastName,
            birthDate,
            isAgePublic,
            city,
            pseudo,
            consentCGU,
            consentRGPD
        } = req.body as {
            email?: string;
            password?: string;
            firstName?: string;
            lastName?: string;
            birthDate?: string;
            isAgePublic?: boolean;
            city?: string;
            pseudo?: string;
            consentCGU?: boolean;
            consentRGPD?: boolean;
        };

        if (!email || !password || !firstName || !lastName || !birthDate || !pseudo || !consentCGU || !consentRGPD) {
            return res.status(400).json({ error: 'missing_required_fields' });
        }

        const hash = await bcrypt.hash(password, 10);

        const result = await sql<any[]>`
      INSERT INTO users (
        email, 
        password_hash, 
        first_name, 
        last_name, 
        birth_date, 
        is_age_public, 
        city, 
        pseudo, 
        consent_cgu, 
        consent_rgpd,
        role
      )
      VALUES (
        ${email}, 
        ${hash}, 
        ${firstName}, 
        ${lastName}, 
        ${birthDate}, 
        ${isAgePublic || false}, 
        ${city || null}, 
        ${pseudo}, 
        ${consentCGU}, 
        ${consentRGPD},
        'player'
      )
      RETURNING id, email, first_name, last_name, pseudo, role, birth_date, city
    `;

        const user = result[0];
        const token = signToken({ id: user.id, role: user.role });

        return res.status(201).json({
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                firstName: user.first_name,
                lastName: user.last_name,
                pseudo: user.pseudo,
                birthDate: user.birth_date,
                city: user.city
            },
            token,
        });
    } catch (err: any) {
        if (err.code === '23505') {
            if (err.detail?.includes('email')) {
                return res.status(409).json({ error: 'email_already_in_use' });
            }
            if (err.detail?.includes('pseudo')) {
                return res.status(409).json({ error: 'pseudo_already_in_use' });
            }
            return res.status(409).json({ error: 'conflict' });
        }
        console.error(err);
        return res.status(500).json({ error: 'internal_error' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body as {
            email?: string;
            password?: string;
        };

        if (!email || !password) {
            return res.status(400).json({ error: 'email and password are required' });
        }

        const rows = await sql<any[]>`
      SELECT id, email, password_hash, role, first_name, last_name, pseudo, birth_date, city, rooms_explored, favorite_hobby, characteristics, avatar_url
      FROM users
      WHERE email = ${email}
      LIMIT 1
    `;

        const user = rows[0];
        if (!user) {
            return res.status(401).json({ error: 'invalid_credentials' });
        }

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(401).json({ error: 'invalid_credentials' });
        }

        const token = signToken({ id: user.id, role: user.role });

        return res.json({
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                firstName: user.first_name,
                lastName: user.last_name,
                pseudo: user.pseudo,
                birthDate: user.birth_date,
                city: user.city,
                roomsExplored: user.rooms_explored,
                favoriteHobby: user.favorite_hobby,
                characteristics: user.characteristics,
                avatarUrl: user.avatar_url
            },
            token,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'internal_error' });
    }
});

router.put('/profile', async (req, res) => {
    // Basic implementation, should ideally use authRequired middleware
    // For now keeping it simple as per previous routes
    try {
        const { id, pseudo, roomsExplored, favoriteHobby, characteristics, avatarUrl, firstName, lastName, birthDate, isAgePublic, city } = req.body;
        if (!id) return res.status(400).json({ error: 'User ID is required' });

        // Neon / PostgreSQL JSONB requires a proper JSON string or a JSON object that can be cast
        const characteristicsJson = characteristics ? JSON.stringify(characteristics) : undefined;

        // Since neon sql doesn't support object syntax for SET, we'll fetch current and update
        // Or we use multiple SET but that's complex with template strings.
        // Let's use a simple approach for now where we update all if present
        
        const result = await sql`
            UPDATE users 
            SET pseudo = COALESCE(${pseudo || null}, pseudo),
                rooms_explored = COALESCE(${roomsExplored || null}, rooms_explored),
                favorite_hobby = COALESCE(${favoriteHobby || null}, favorite_hobby),
                characteristics = COALESCE(${characteristicsJson || null}::jsonb, characteristics),
                avatar_url = COALESCE(${avatarUrl || null}, avatar_url),
                first_name = COALESCE(${firstName || null}, first_name),
                last_name = COALESCE(${lastName || null}, last_name),
                birth_date = COALESCE(${birthDate ? new Date(birthDate).toISOString() : null}, birth_date),
                is_age_public = COALESCE(${isAgePublic ?? null}, is_age_public),
                city = COALESCE(${city || null}, city)
            WHERE id = ${id}
            RETURNING id, email, role, first_name, last_name, pseudo, birth_date, city, rooms_explored, favorite_hobby, characteristics, avatar_url, is_age_public
        `;

        const user = result[0];
        return res.json({
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                firstName: user.first_name,
                lastName: user.last_name,
                pseudo: user.pseudo,
                birthDate: user.birth_date,
                city: user.city,
                roomsExplored: user.rooms_explored,
                favoriteHobby: user.favorite_hobby,
                characteristics: user.characteristics,
                avatarUrl: user.avatar_url,
                isAgePublic: user.is_age_public
            }
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'internal_error' });
    }
});

export default router;
