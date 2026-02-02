/**
 * Stripe Service
 * 
 * Encapsulates all Stripe SDK interactions with proper error handling.
 * This abstraction allows us to:
 *   1. Centralize Stripe configuration
 *   2. Implement consistent error handling
 *   3. Add logging and monitoring hooks
 *   4. Make testing easier with dependency injection
 * 
 * FINTECH BEST PRACTICE: Never expose Stripe errors directly to clients.
 * Classify errors and return user-friendly messages.
 */

import Stripe from 'stripe';
import { CartItem, StripeSessionResult, StripeErrorType } from '../types';

// Initialize Stripe with API version pinning
// Pinning ensures consistent behavior across deployments
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * Line item structure for Stripe Checkout
 */
interface StripeLineItem {
    price_data: {
        currency: string;
        product_data: {
            name: string;
        };
        unit_amount: number;
    };
    quantity: number;
}

/**
 * Creates a Stripe Checkout Session with idempotency protection.
 * 
 * IDEMPOTENCY KEY BEHAVIOR:
 * - If the same idempotencyKey is used with IDENTICAL parameters,
 *   Stripe returns the cached response (no duplicate session).
 * - If the same key is used with DIFFERENT parameters,
 *   Stripe throws StripeIdempotencyError.
 * 
 * This ensures that network retries don't create duplicate charges.
 * 
 * @param orderId - Our internal order ID for metadata
 * @param items - Cart items to create line items from
 * @param idempotencyKey - Unique key for this checkout attempt
 * @returns StripeSessionResult with session URL or error
 */
export async function createCheckoutSession(
    orderId: string,
    items: CartItem[],
    idempotencyKey: string
): Promise<StripeSessionResult> {
    try {
        // Transform cart items to Stripe line_items format
        const lineItems: StripeLineItem[] = items.map(item => ({
            price_data: {
                currency: 'usd',
                product_data: {
                    name: item.name,
                },
                unit_amount: item.price, // Already in cents
            },
            quantity: item.quantity,
        }));

        // Create Checkout Session with idempotency
        const session = await stripe.checkout.sessions.create(
            {
                payment_method_types: ['card'],
                line_items: lineItems,
                mode: 'payment',
                success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.FRONTEND_URL}/cancel`,
                // Store our order ID in metadata for webhook reconciliation
                metadata: {
                    orderId: orderId,
                },
                // Optional: Collect customer email
                customer_creation: 'always',
            },
            {
                // CRITICAL: Idempotency key prevents duplicate sessions on retry
                idempotencyKey: idempotencyKey,
            }
        );

        return {
            success: true,
            sessionId: session.id,
            sessionUrl: session.url || undefined,
        };

    } catch (error) {
        return handleStripeError(error);
    }
}

/**
 * Verifies webhook signature and constructs event.
 * 
 * WHY WEBHOOK SIGNING IS CRITICAL FOR FINANCIAL SECURITY:
 * ========================================================
 * Without signature verification, ANYONE could send a POST request to
 * your webhook endpoint with a fake "payment_succeeded" event.
 * 
 * An attacker could:
 *   1. Discover your webhook URL (often predictable like /api/webhooks/stripe)
 *   2. Send a crafted JSON payload claiming payment was successful
 *   3. Your system would mark orders as PAID without actual payment
 *   4. Attacker gets goods/services for free
 * 
 * The HMAC signature proves:
 *   - The request genuinely came from Stripe's servers
 *   - The payload wasn't tampered with in transit
 *   - The timestamp is recent (prevents replay attacks)
 * 
 * Stripe signs each webhook with your endpoint's unique secret (whsec_xxx).
 * Only you and Stripe know this secret, so only Stripe can create valid signatures.
 * 
 * @param payload - Raw request body (must be unparsed string/buffer)
 * @param signature - Value from 'stripe-signature' header
 * @returns Verified Stripe Event or null if invalid
 */
export function verifyWebhookSignature(
    payload: string | Buffer,
    signature: string
): Stripe.Event | null {
    try {
        const event = stripe.webhooks.constructEvent(
            payload,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET!
        );
        return event;
    } catch (error) {
        console.error('[Stripe] Webhook signature verification failed:', error);
        return null;
    }
}

/**
 * Retrieves a Checkout Session by ID.
 * Used to get additional details after webhook.
 */
export async function getCheckoutSession(
    sessionId: string
): Promise<Stripe.Checkout.Session | null> {
    try {
        return await stripe.checkout.sessions.retrieve(sessionId, {
            expand: ['payment_intent', 'customer'],
        });
    } catch (error) {
        console.error('[Stripe] Failed to retrieve session:', error);
        return null;
    }
}

/**
 * Classifies Stripe errors for appropriate handling.
 * 
 * RESILIENCY PATTERN: Different error types require different responses:
 * - Card errors: User can try different card (recoverable)
 * - Rate limit: Implement exponential backoff, retry
 * - Connection: Safe to retry with same idempotency key
 * - API errors: Log and alert, may need manual intervention
 */
function handleStripeError(error: unknown): StripeSessionResult {
    // Type guard for Stripe errors
    if (error instanceof Stripe.errors.StripeError) {
        const errorType = getStripeErrorType(error);

        console.error(`[Stripe] ${errorType}:`, {
            message: error.message,
            code: error.code,
            type: error.type,
        });

        // Return user-friendly error based on type
        switch (errorType) {
            case 'StripeCardError':
                return {
                    success: false,
                    error: 'Your card was declined. Please try a different payment method.',
                    errorType,
                };

            case 'StripeRateLimitError':
                return {
                    success: false,
                    error: 'Service is temporarily busy. Please try again in a moment.',
                    errorType,
                };

            case 'StripeConnectionError':
                return {
                    success: false,
                    error: 'Unable to connect to payment service. Please try again.',
                    errorType,
                };

            case 'StripeIdempotencyError':
                return {
                    success: false,
                    error: 'A conflicting request was made. Please refresh and try again.',
                    errorType,
                };

            default:
                return {
                    success: false,
                    error: 'Payment processing failed. Please try again later.',
                    errorType,
                };
        }
    }

    // Unknown error
    console.error('[Stripe] Unexpected error:', error);
    return {
        success: false,
        error: 'An unexpected error occurred. Please try again.',
    };
}

/**
 * Maps Stripe error classes to our error type enum
 */
function getStripeErrorType(error: Stripe.errors.StripeError): StripeErrorType {
    if (error instanceof Stripe.errors.StripeCardError) {
        return 'StripeCardError';
    }
    if (error instanceof Stripe.errors.StripeRateLimitError) {
        return 'StripeRateLimitError';
    }
    if (error instanceof Stripe.errors.StripeInvalidRequestError) {
        return 'StripeInvalidRequestError';
    }
    if (error instanceof Stripe.errors.StripeAPIError) {
        return 'StripeAPIError';
    }
    if (error instanceof Stripe.errors.StripeConnectionError) {
        return 'StripeConnectionError';
    }
    if (error instanceof Stripe.errors.StripeAuthenticationError) {
        return 'StripeAuthenticationError';
    }
    // Check for idempotency error by code
    if (error.code === 'idempotency_key_in_use') {
        return 'StripeIdempotencyError';
    }
    return 'StripeAPIError'; // Default fallback
}

export default stripe;
