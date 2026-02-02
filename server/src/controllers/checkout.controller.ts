/**
 * Checkout Controller
 * 
 * POST /api/create-checkout-session
 * 
 * This is the heart of our payment flow. It demonstrates:
 * 1. Server-Side Idempotency - Generate or accept unique key per request
 * 2. Stateful Order Tracking - Create PENDING order before calling Stripe
 * 3. Stripe SDK Idempotency - Pass key to prevent duplicate charges
 * 4. Proper Error Handling - Classify Stripe errors appropriately
 * 
 * FINTECH INTERVIEW TALKING POINT - "Decoupled Fulfillment":
 * ==========================================================
 * "I don't fulfill the order in the immediate API response. I wait for
 * the Webhook to confirm the funds are actually captured. This prevents
 * 'Race Conditions' where a user might see a success screen before the
 * payment actually settles."
 * 
 * Flow:
 * 1. Client calls this endpoint with cart items
 * 2. We create a PENDING order in our database
 * 3. We call Stripe to create a Checkout Session
 * 4. We return the session URL for redirect
 * 5. User pays on Stripe's hosted page
 * 6. Stripe sends webhook -> we mark order PAID (separate endpoint)
 */

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { CreateCheckoutRequest, CreateCheckoutResponse, CartItem } from '../types';
import * as orderService from '../services/order.service';
import * as stripeService from '../services/stripe.service';

/**
 * Creates a Stripe Checkout Session for the provided cart items.
 * 
 * IDEMPOTENCY AS A SAFETY NET:
 * ============================
 * "In payment systems, retries are inevitable. I implemented Idempotency Keys
 * so that even if the client retries a request after a timeout, we guarantee
 * the user is only charged once."
 * 
 * How it works:
 * - Client can optionally provide idempotencyKey in request
 * - If not provided, we generate one (UUID)
 * - Same key + same request = same response (from our cache OR Stripe's)
 * - Same key + different request = error (StripeIdempotencyError)
 */
export async function createCheckoutSession(
    req: Request<{}, {}, CreateCheckoutRequest>,
    res: Response<CreateCheckoutResponse>
): Promise<void> {
    try {
        const { items, idempotencyKey: clientKey } = req.body;

        // ========================================================================
        // Step 1: Validate Input
        // ========================================================================
        if (!items || !Array.isArray(items) || items.length === 0) {
            res.status(400).json({
                success: false,
                error: 'Cart items are required',
            });
            return;
        }

        // Validate each item has required fields
        for (const item of items) {
            if (!item.id || !item.quantity || item.quantity < 1) {
                res.status(400).json({
                    success: false,
                    error: 'Each item must have id and quantity >= 1',
                });
                return;
            }
        }

        // ========================================================================
        // Step 2: Generate or Use Client Idempotency Key
        // ========================================================================
        // If client provides key, use it (enables client-side retry safety)
        // Otherwise generate a new one (request is treated as unique)
        const idempotencyKey = clientKey || uuidv4();

        console.log(`[Checkout] Processing request with idempotencyKey: ${idempotencyKey}`);

        // ========================================================================
        // Step 3: Check for Existing Order (Idempotency Check)
        // ========================================================================
        // If we already processed this key, return the existing session
        const existingOrder = await orderService.findOrderByIdempotencyKey(idempotencyKey);

        if (existingOrder && existingOrder.stripeCheckoutId) {
            console.log(`[Checkout] Returning existing session for order: ${existingOrder.id}`);

            // Retrieve the session from Stripe to get the URL
            const session = await stripeService.getCheckoutSession(existingOrder.stripeCheckoutId);

            if (session?.url) {
                res.json({
                    success: true,
                    sessionUrl: session.url,
                    orderId: existingOrder.id,
                });
                return;
            }
            // If session expired, continue to create new one
        }

        // ========================================================================
        // Step 4: Calculate Total Amount
        // ========================================================================
        // In a real app, you'd fetch prices from your database to prevent
        // price manipulation attacks. For demo, we trust client prices.
        const amount = calculateOrderTotal(items);

        // ========================================================================
        // Step 5: Create PENDING Order in Database
        // ========================================================================
        // CRITICAL: Create order BEFORE calling Stripe
        // This ensures we have a record even if Stripe call fails
        const order = await orderService.createOrder({
            items,
            idempotencyKey,
            amount,
            currency: 'usd',
        });

        console.log(`[Checkout] Created/found order: ${order.id}`);

        // ========================================================================
        // Step 6: Create Stripe Checkout Session
        // ========================================================================
        // Pass idempotency key to Stripe - this prevents duplicate sessions
        // if we retry after a timeout
        const stripeResult = await stripeService.createCheckoutSession(
            order.id,
            items,
            idempotencyKey
        );

        if (!stripeResult.success) {
            // Stripe call failed - order remains in PENDING (can retry)
            console.error(`[Checkout] Stripe session creation failed: ${stripeResult.error}`);

            res.status(500).json({
                success: false,
                error: stripeResult.error || 'Failed to create checkout session',
            });
            return;
        }

        // ========================================================================
        // Step 7: Update Order with Stripe Session ID
        // ========================================================================
        // Store the Stripe session ID so we can reconcile in webhooks
        await orderService.updateOrderWithStripeSession(
            order.id,
            stripeResult.sessionId!
        );

        console.log(`[Checkout] Session created: ${stripeResult.sessionId}`);

        // ========================================================================
        // Step 8: Return Session URL
        // ========================================================================
        // Client will redirect to this URL for payment
        res.json({
            success: true,
            sessionUrl: stripeResult.sessionUrl,
            orderId: order.id,
        });

    } catch (error) {
        console.error('[Checkout] Unexpected error:', error);

        res.status(500).json({
            success: false,
            error: 'An unexpected error occurred. Please try again.',
        });
    }
}

/**
 * Calculates total order amount in cents.
 * 
 * SECURITY NOTE: In production, NEVER trust client-side prices.
 * Always fetch prices from your database to prevent manipulation.
 */
function calculateOrderTotal(items: CartItem[]): number {
    return items.reduce((total, item) => {
        return total + (item.price * item.quantity);
    }, 0);
}
