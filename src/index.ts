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

        await sql`
            CREATE TABLE IF NOT EXISTS escape_games (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                owner_user_id UUID NOT NULL REFERENCES users(id),
                display_name TEXT NOT NULL,
                legal_name TEXT,
                siret TEXT,
                address_line1 TEXT NOT NULL,
                address_line2 TEXT,
                city TEXT NOT NULL,
                postal_code TEXT NOT NULL,
                country TEXT NOT NULL,
                contact_email TEXT NOT NULL,
                contact_phone TEXT,
                description TEXT,
                logo_url TEXT,
                latitude DOUBLE PRECISION,
                longitude DOUBLE PRECISION,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS rooms (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                escape_game_id UUID NOT NULL REFERENCES escape_games(id),
                name TEXT NOT NULL,
                description TEXT,
                image_url TEXT,
                category TEXT,
                price_json JSONB,
                duration_minutes INTEGER NOT NULL,
                min_players INTEGER NOT NULL,
                max_players INTEGER NOT NULL,
                search_level INTEGER DEFAULT 1,
                thinking_level INTEGER DEFAULT 1,
                manipulation_level INTEGER DEFAULT 1,
                difficulty_level INTEGER DEFAULT 1,
                is_pmr_accessible BOOLEAN DEFAULT FALSE,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                price_total INTEGER -- old column
            );
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS time_slots (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                room_id UUID NOT NULL REFERENCES rooms(id),
                start_time TIMESTAMP WITH TIME ZONE NOT NULL,
                status TEXT NOT NULL DEFAULT 'empty', -- empty, partially_filled, full, cancelled
                min_players_override INTEGER,
                max_players_override INTEGER,
                current_players_count INTEGER DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `;

        // Migration columns for existing tables
        await sql`
            ALTER TABLE escape_games 
            ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
        `;

        await sql`
            ALTER TABLE rooms 
            ALTER COLUMN price_total DROP NOT NULL,
            ALTER COLUMN duration_minutes DROP NOT NULL,
            ALTER COLUMN min_players DROP NOT NULL,
            ALTER COLUMN max_players DROP NOT NULL,
            ADD COLUMN IF NOT EXISTS category TEXT,
            ADD COLUMN IF NOT EXISTS price_json JSONB,
            ADD COLUMN IF NOT EXISTS search_level INTEGER DEFAULT 1,
            ADD COLUMN IF NOT EXISTS thinking_level INTEGER DEFAULT 1,
            ADD COLUMN IF NOT EXISTS manipulation_level INTEGER DEFAULT 1,
            ADD COLUMN IF NOT EXISTS difficulty_level INTEGER DEFAULT 1,
            ADD COLUMN IF NOT EXISTS is_pmr_accessible BOOLEAN DEFAULT FALSE;
        `;
        await sql`
            ALTER TABLE time_slots 
            ALTER COLUMN status TYPE TEXT,
            ALTER COLUMN status SET DEFAULT 'empty';
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
