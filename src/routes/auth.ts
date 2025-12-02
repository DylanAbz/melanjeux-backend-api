import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { sql } from '../db';
import { signToken } from '../middleware/auth';

const router = Router();

router.post('/signup', async (req, res) => {
    try {
        const { email, password, role } = req.body as {
            email?: string;
            password?: string;
            role?: 'player' | 'escape_owner';
        };

        if (!email || !password) {
            return res.status(400).json({ error: 'email and password are required' });
        }

        const normalizedRole: 'player' | 'escape_owner' =
            role === 'escape_owner' ? 'escape_owner' : 'player';

        const hash = await bcrypt.hash(password, 10);

        const result = await sql<{
            id: string;
            email: string;
            role: 'player' | 'escape_owner';
        }[]>`
      INSERT INTO users (email, password_hash, role)
      VALUES (${email}, ${hash}, ${normalizedRole})
      RETURNING id, email, role
    `;

        const user = result[0];
        const token = signToken({ id: user.id, role: user.role });

        return res.status(201).json({
            user,
            token,
        });
    } catch (err: any) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'email already in use' });
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

        const rows = await sql<{
            id: string;
            email: string;
            password_hash: string;
            role: 'player' | 'escape_owner';
        }[]>`
      SELECT id, email, password_hash, role
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
            },
            token,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'internal_error' });
    }
});

export default router;
