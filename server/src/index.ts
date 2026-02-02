/**
 * EcomSync Payment Server
 * 
 * A senior-level Node.js/TypeScript backend for Stripe payment processing.
 * 
 * ARCHITECTURE OVERVIEW:
 * =====================
 * This server demonstrates fintech-grade engineering patterns:
 * 
 * 1. IDEMPOTENCY
 *    - Every checkout request accepts/generates unique idempotency key
 *    - Same key + same request = same response (safe to retry)
 *    - Prevents duplicate charges on network timeouts
 * 
 * 2. STATEFUL ORDER TRACKING
 *    - Orders created in PENDING before calling Stripe
 *    - Status transitions: PENDING -> PROCESSING -> PAID
 *    - Full audit trail with Stripe session/payment IDs
 * 
 * 3. SECURE WEBHOOKS
 *    - HMAC signature verification on every webhook
 *    - At-least-once delivery handling with event deduplication
 *    - Atomic database transactions for state updates
 * 
 * 4. RESILIENCY
 *    - Stripe error classification (card/rate-limit/connection)
 *    - Graceful degradation and user-friendly error messages
 *    - Structured logging for debugging
 * 
 * RUNNING THE SERVER:
 * ==================
 * 1. Start PostgreSQL: docker-compose up -d
 * 2. Run migrations: npm run db:push
 * 3. Start server: npm run dev
 * 4. For webhooks: stripe listen --forward-to localhost:4000/api/webhooks/stripe
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import routes from './routes';
import { notFoundHandler, globalErrorHandler } from './middleware/error.middleware';

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
    'DATABASE_URL',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'FRONTEND_URL',
];

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        console.error(`Missing required environment variable: ${envVar}`);
        process.exit(1);
    }
}

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 4000;

// ============================================================================
// MIDDLEWARE
// ============================================================================

// CORS - Allow frontend to make requests
app.use(cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
}));

// Trust proxy - Important for rate limiting behind load balancer
app.set('trust proxy', 1);

// Request logging (simple version - use morgan/winston in production)
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// NOTE: JSON body parser is applied per-route to allow raw body for webhooks
// See routes/index.ts for middleware configuration

// ============================================================================
// ROUTES
// ============================================================================

// Mount all API routes under /api
app.use('/api', routes);

// Legacy route support - redirect old checkout endpoint
app.post('/checkout', express.json(), (req, res) => {
    // Redirect to new endpoint
    res.redirect(307, '/api/create-checkout-session');
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler for unmatched routes
app.use(notFoundHandler);

// Global error handler
app.use(globalErrorHandler);

// ============================================================================
// SERVER STARTUP
// ============================================================================

app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('🚀 EcomSync Payment Server');
    console.log('='.repeat(60));
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Port:        ${PORT}`);
    console.log(`   Frontend:    ${process.env.FRONTEND_URL}`);
    console.log('');
    console.log('📚 Available Endpoints:');
    console.log('   POST /api/create-checkout-session - Create Stripe Checkout');
    console.log('   POST /api/webhooks/stripe         - Stripe Webhooks');
    console.log('   GET  /api/health                  - Health Check');
    console.log('='.repeat(60));
    console.log('');
    console.log('💡 For local webhook testing, run:');
    console.log(`   stripe listen --forward-to localhost:${PORT}/api/webhooks/stripe`);
    console.log('');
});

export default app;
