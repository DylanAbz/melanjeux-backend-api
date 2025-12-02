import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

export function requireEscapeOwner(
    req: AuthRequest,
    res: Response,
    next: NextFunction
) {
    if (!req.user) {
        return res.status(401).json({ error: 'unauthenticated' });
    }
    if (req.user.role !== 'escape_owner') {
        return res.status(403).json({ error: 'forbidden' });
    }
    return next();
}
