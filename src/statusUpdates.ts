import { sql } from './db';

export async function checkTimeSlotStatusUpdates() {
    try {
        const now = new Date();
        console.log(`🔄 [${now.toISOString()}] Running background tasks...`);

        // 1. Passage en payment_pending (< 48h et min atteint)
        const slotsToUpdate = await sql<any[]>`
            SELECT ts.id, ts.room_id, ts.start_time, ts.current_players_count, 
                   COALESCE(ts.min_players_override, r.min_players) as min_players
            FROM time_slots ts
            JOIN rooms r ON ts.room_id = r.id
            WHERE ts.status IN ('empty', 'filling')
              AND ts.start_time <= NOW() + INTERVAL '48 hours'
              AND ts.start_time > NOW()
        `;

        for (const slot of slotsToUpdate) {
            if (slot.current_players_count >= slot.min_players) {
                console.log(`✅ Slot ${slot.id} -> payment_pending`);
                await sql`UPDATE time_slots SET status = 'payment_pending' WHERE id = ${slot.id}`;
            } else if (slot.current_players_count === 0) {
                 console.log(`❌ Slot ${slot.id} -> cancelled (no players at 48h)`);
                 await sql`UPDATE time_slots SET status = 'cancelled' WHERE id = ${slot.id}`;
            }
        }

        // 2. Gestion des créneaux PASSÉS (Une fois que l'heure de début est dépassée)
        
        // A. Ceux qui ont été validés/confirmés -> passent en 'finished'
        const finishedResult = await sql`
            UPDATE time_slots 
            SET status = 'finished'
            WHERE status = 'confirmed'
              AND start_time <= NOW()
            RETURNING id
        `;
        if (finishedResult.length > 0) console.log(`🏁 Marked ${finishedResult.length} slots as finished.`);

        // B. Ceux qui n'ont jamais été confirmés (toujours en attente, paiement, ou remplissage) -> passent en 'cancelled'
        const failedResult = await sql`
            UPDATE time_slots 
            SET status = 'cancelled'
            WHERE status IN ('empty', 'filling', 'payment_pending', 'waiting_validation')
              AND start_time <= NOW()
            RETURNING id
        `;
        if (failedResult.length > 0) console.log(`🚫 Cancelled ${failedResult.length} past unconfirmed slots.`);


        // 3. Archivage des chats (Tout créneau terminé depuis > 24h)
        const archivedResult = await sql`
            UPDATE time_slots 
            SET is_chat_active = FALSE
            WHERE is_chat_active = TRUE
              AND start_time <= NOW() - INTERVAL '24 hours'
            RETURNING id
        `;

        if (archivedResult.length > 0) {
            console.log(`📦 Archived ${archivedResult.length} old chats.`);
        }

    } catch (err) {
        console.error('Error in checkTimeSlotStatusUpdates:', err);
    }
}
