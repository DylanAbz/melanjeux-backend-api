import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth';
import { authRequired, AuthRequest } from './middleware/auth';
import escapeGamesRoutes from './routes/escapeGames';
import roomsRoutes from './routes/rooms';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'melanjeux-api' });
});

app.use('/auth', authRoutes);
app.use('/escape-games', escapeGamesRoutes);
app.use('/rooms', roomsRoutes);

// Exemple route protégée
app.get('/me', authRequired, (req: AuthRequest, res) => {
    res.json({ user: req.user });
});

app.listen(PORT, () => {
    console.log(`melanjeux-api listening on http://localhost:${PORT}`);
});
