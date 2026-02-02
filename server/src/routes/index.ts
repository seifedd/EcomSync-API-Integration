/**
 * Route Definitions
 * 
 * All API routes are defined here with their middleware chains.
 */

import { Router } from 'express';
import express from 'express';
import { createCheckoutSession } from '../controllers/checkout.controller';
import { handleStripeWebhook } from '../controllers/webhook.controller';

const router = Router();

// ============================================================================
// PAYMENT ROUTES
// ============================================================================

/**
 * POST /api/create-checkout-session
 * 
 * Creates a Stripe Checkout Session for the provided cart items.
 * 
 * Request body:
 * {
 *   "items": [
 *     { "id": "product_123", "name": "Widget", "price": 1999, "quantity": 2 }
 *   ],
 *   "idempotencyKey": "optional-client-provided-key"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "sessionUrl": "https://checkout.stripe.com/...",
 *   "orderId": "uuid"
 * }
 */
router.post('/create-checkout-session', express.json(), createCheckoutSession);

// ============================================================================
// WEBHOOK ROUTES
// ============================================================================

/**
 * POST /api/webhooks/stripe
 * 
 * Receives webhooks from Stripe.
 * 
 * IMPORTANT: Uses raw body parser (NOT JSON) for signature verification.
 * The JSON is parsed manually after signature is verified.
 */
router.post(
    '/webhooks/stripe',
    // Raw body parser - captures bytes for signature verification
    express.raw({ type: 'application/json' }),
    // Attach raw body to request
    (req, res, next) => {
        (req as any).rawBody = req.body;
        next();
    },
    handleStripeWebhook
);

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * GET /api/health
 * 
 * Simple health check for load balancers and monitoring.
 */
router.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
    });
});

export default router;
