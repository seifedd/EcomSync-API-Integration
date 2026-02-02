/**
 * Raw Body Middleware
 * 
 * Captures the raw request body BEFORE JSON parsing.
 * This is REQUIRED for Stripe webhook signature verification.
 * 
 * WHY THIS IS NECESSARY:
 * =====================
 * Stripe's signature is computed on the exact bytes of the request body.
 * When Express parses JSON, it can subtly alter the payload:
 * - Whitespace changes
 * - Number precision differences
 * - Object key ordering
 * 
 * These changes break the HMAC signature verification.
 * 
 * SOLUTION:
 * We use express.raw() for webhook routes to capture the buffer,
 * then attach it to the request for later verification.
 */

import express, { Request, Response, NextFunction } from 'express';

/**
 * Middleware that captures raw body for webhook signature verification.
 * Use this BEFORE the JSON parser on webhook routes.
 */
export const rawBodyMiddleware = express.raw({
    type: 'application/json',
    verify: (req: Request, res: Response, buf: Buffer) => {
        // Attach raw body to request for later use
        (req as any).rawBody = buf;
    },
});

/**
 * Alternative: Capture raw body while still parsing JSON.
 * Useful if you need both raw and parsed body on same route.
 */
export function captureRawBody(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    if (req.headers['content-type'] === 'application/json') {
        let data = '';
        req.setEncoding('utf8');

        req.on('data', (chunk) => {
            data += chunk;
        });

        req.on('end', () => {
            (req as any).rawBody = data;
            next();
        });
    } else {
        next();
    }
}
