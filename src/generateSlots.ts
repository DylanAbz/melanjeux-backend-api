const { sql } = require('./db');

async function generateSlots() {
    console.log('📅 Generating time slots for the next 60 days...');

    try {
        const roomRows = await sql`SELECT id FROM rooms`;
        const hours = [10, 12, 14, 16, 18, 20, 22];
        let count = 0;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (const room of roomRows) {
            console.log(`Processing room ${room.id}...`);
            for (let i = 0; i < 60; i++) {
                const date = new Date(today);
                date.setDate(date.getDate() + i);
                
                // On met des créneaux presque tous les jours
                if (i % 7 === 6) continue; 

                for (const hour of hours) {
                    const startTime = new Date(date);
                    startTime.setHours(hour, 0, 0, 0);

                    // Vérifier si le créneau existe déjà pour éviter les doublons
                    const existing = await sql`
                        SELECT id FROM time_slots 
                        WHERE room_id = ${room.id} AND start_time = ${startTime.toISOString()}
                    `;

                    if (existing.length === 0) {
                        await sql`
                            INSERT INTO time_slots (room_id, start_time, status)
                            VALUES (${room.id}, ${startTime.toISOString()}, 'empty')
                        `;
                        count++;
                    }
                }
            }
        }

        console.log(`✅ ${count} new time slots generated successfully!`);
        process.exit(0);
    } catch (err) {
        console.error('❌ Generation error:', err);
        process.exit(1);
    }
}

generateSlots();
