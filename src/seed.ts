import { sql } from './db';
import bcrypt from 'bcryptjs';

async function seed() {
    console.log('🌱 Starting seed...');

    try {
        // Ensure constraints are dropped before seeding
        await sql`ALTER TABLE rooms ALTER COLUMN price_total DROP NOT NULL`;
        await sql`ALTER TABLE rooms ALTER COLUMN duration_minutes DROP NOT NULL`;
        await sql`ALTER TABLE rooms ALTER COLUMN min_players DROP NOT NULL`;
        await sql`ALTER TABLE rooms ALTER COLUMN max_players DROP NOT NULL`;

        // 1. Nettoyage
        await sql`DELETE FROM rooms`;
        // await sql`DELETE FROM escape_games`;
        // await sql`DELETE FROM users WHERE email = 'owner@test.com'`;

        // 2. Création d'un utilisateur Owner
        const hashedPassword = await bcrypt.hash('password123', 10);
        const userResult = await sql<any[]>`
            INSERT INTO users (email, password_hash, role, first_name, last_name, pseudo)
            VALUES ('owner@test.com', ${hashedPassword}, 'escape_owner', 'Marc', 'Owner', 'MarcEscape')
            ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
            RETURNING id
        `;
        const ownerId = userResult[0].id;
        console.log('✅ User owner created');

        // 3. Création d'un Escape Game
        const egResult = await sql<any[]>`
            INSERT INTO escape_games (
                owner_user_id, display_name, address_line1, city, postal_code, country, 
                contact_email, contact_phone, latitude, longitude
            )
            VALUES (
                ${ownerId}, 'Melanjeux HQ', '15 Rue de Rivoli', 'Paris', '75004', 'France',
                'contact@melanjeux.fr', '0123456789', 48.8556, 2.3522
            )
            RETURNING id
        `;
        const egId = egResult[0].id;
        console.log('✅ Escape Game created');

        // 4. Création des Salles
        const rooms = [
            {
                name: 'Le Secret de la Momie',
                description: 'Explorez le tombeau oublié du Pharaon Râ et déjouez ses pièges millénaires.',
                image_url: 'https://images.unsplash.com/photo-1605806616949-1e87b487fc2f?q=80&w=800',
                category: 'Aventure',
                duration_minutes: 60,
                min_players: 2,
                max_players: 6,
                search_level: 4,
                thinking_level: 3,
                manipulation_level: 2,
                difficulty_level: 3,
                is_pmr_accessible: false,
                price_json: JSON.stringify({ 2: 35, 3: 30, 4: 28, 5: 25, 6: 22 })
            },
            {
                name: 'Le Manoir Hanté',
                description: 'Oserez-vous pénétrer dans la demeure des Blackwood pour briser leur malédiction ?',
                image_url: 'https://images.unsplash.com/photo-1505635552518-3448ff6190a7?q=80&w=800',
                category: 'Horreur',
                duration_minutes: 75,
                min_players: 3,
                max_players: 5,
                search_level: 3,
                thinking_level: 4,
                manipulation_level: 4,
                difficulty_level: 5,
                is_pmr_accessible: true,
                price_json: JSON.stringify({ 3: 40, 4: 35, 5: 32 })
            },
            {
                name: 'Mission Spatiale',
                description: 'Votre station orbitale est en perdition. Vous avez 60 minutes pour réactiver les moteurs.',
                image_url: 'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?q=80&w=800',
                category: 'Science-Fiction',
                duration_minutes: 60,
                min_players: 2,
                max_players: 4,
                search_level: 2,
                thinking_level: 5,
                manipulation_level: 5,
                difficulty_level: 4,
                is_pmr_accessible: false,
                price_json: JSON.stringify({ 2: 45, 3: 38, 4: 32 })
            }
        ];

        for (const room of rooms) {
            await sql`
                INSERT INTO rooms (
                    escape_game_id, name, description, image_url, category, 
                    duration_minutes, min_players, max_players, search_level, 
                    thinking_level, manipulation_level, difficulty_level, 
                    is_pmr_accessible, price_json
                )
                VALUES (
                    ${egId}, ${room.name}, ${room.description}, ${room.image_url}, ${room.category},
                    ${room.duration_minutes}, ${room.min_players}, ${room.max_players}, ${room.search_level},
                    ${room.thinking_level}, ${room.manipulation_level}, ${room.difficulty_level},
                    ${room.is_pmr_accessible}, ${room.price_json}
                )
            `;
        }

        console.log('✅ Rooms created');
        console.log('✨ Seed completed successfully !');
        process.exit(0);
    } catch (err) {
        console.error('❌ Seed error:', err);
        process.exit(1);
    }
}

seed();
