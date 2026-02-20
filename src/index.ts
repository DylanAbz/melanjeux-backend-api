import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth';
import { authRequired, AuthRequest } from './middleware/auth';
import escapeGamesRoutes from './routes/escapeGames';
import roomsRoutes from './routes/rooms';
import timeSlotsRoutes from './routes/timeSlots';
import timeSlotPlayersRoutes from './routes/timeSlotPlayers';
import { sql } from './db';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Basic migration
async function runMigrations() {
    try {
        console.log('Running schema migrations...');
        
        // Ensure the table exists
        await sql`
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'player',
                first_name TEXT,
                last_name TEXT,
                birth_date DATE,
                is_age_public BOOLEAN DEFAULT FALSE,
                city TEXT,
                pseudo TEXT UNIQUE,
                consent_cgu BOOLEAN DEFAULT FALSE,
                consent_rgpd BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `;

        // Ensure all columns exist (for existing tables)
        await sql`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS first_name TEXT,
            ADD COLUMN IF NOT EXISTS last_name TEXT,
            ADD COLUMN IF NOT EXISTS birth_date DATE,
            ADD COLUMN IF NOT EXISTS is_age_public BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS city TEXT,
            ADD COLUMN IF NOT EXISTS pseudo TEXT,
            ADD COLUMN IF NOT EXISTS consent_cgu BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS consent_rgpd BOOLEAN DEFAULT FALSE;
        `;
        console.log('Migrations finished.');
    } catch (err) {
        console.error('Migration error:', err);
    }
}
runMigrations();

app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'melanjeux-api' });
});

app.use('/auth', authRoutes);
app.use('/escape-games', escapeGamesRoutes);
app.use('/rooms', roomsRoutes);
app.use('/time-slots', timeSlotsRoutes);
app.use('/time-slot-players', timeSlotPlayersRoutes);

// Exemple route protégée
app.get('/me', authRequired, (req: AuthRequest, res) => {
    res.json({ user: req.user });
});

app.listen(PORT, () => {
    console.log(`melanjeux-api listening on http://localhost:${PORT}`);
});
