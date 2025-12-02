import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export interface AuthRequest extends Request {
    user?: {
        id: string;
        role: 'player' | 'escape_owner';
    };
}

export function authRequired(
    req: AuthRequest,
    res: Response,
    next: NextFunction
) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.slice('Bearer '.length);

    try {
        const payload = jwt.verify(token, JWT_SECRET) as {
            id: string;
            role: 'player' | 'escape_owner';
        };
        req.user = payload;
        return next();
    } catch {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

export function signToken(user: { id: string; role: 'player' | 'escape_owner' }) {
    return jwt.sign(
        { id: user.id, role: user.role },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}
