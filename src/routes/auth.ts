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
      RETURNING id, email, first_name, last_name, pseudo, role
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
                pseudo: user.pseudo
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
      SELECT id, email, password_hash, role, first_name, last_name, pseudo
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
                pseudo: user.pseudo
            },
            token,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'internal_error' });
    }
});

export default router;
