/**
 * Webhook Controller
 * 
 * POST /api/webhooks/stripe
 * 
 * Handles incoming webhooks from Stripe with proper security measures.
 * 
 * ============================================================================
 * WHY WEBHOOK SIGNING IS CRITICAL FOR FINANCIAL SECURITY
 * ============================================================================
 * 
 * Without signature verification, your webhook endpoint is vulnerable to
 * forgery attacks. Here's the threat model:
 * 
 * ATTACK SCENARIO:
 * 1. Attacker discovers your webhook URL (often predictable: /api/webhooks/stripe)
 * 2. Attacker crafts a fake JSON payload:
 *    {
 *      "type": "checkout.session.completed",
 *      "data": { "object": { "id": "cs_real_session_id", ... } }
 *    }
 * 3. Attacker POSTs this to your endpoint
 * 4. Without verification, your code marks the order as PAID
 * 5. Attacker receives goods/services without paying
 * 
 * DEFENSE - HMAC SIGNATURE VERIFICATION:
 * 1. Each Stripe webhook endpoint has a unique signing secret (whsec_xxx)
 * 2. Stripe computes HMAC-SHA256 of timestamp + payload using this secret
 * 3. Stripe includes signature in 'stripe-signature' header
 * 4. Your server recomputes the signature and compares
 * 5. Only requests from Stripe (who knows the secret) will match
 * 
 * ADDITIONAL PROTECTIONS:
 * - Timestamp tolerance prevents replay attacks (old signed requests)
 * - Raw body required (JSON parsing alters the payload, breaking sig)
 * 
 * ============================================================================
 * AT-LEAST-ONCE DELIVERY
 * ============================================================================
 * 
 * Stripe webhooks are delivered "at least once" - the same event may be
 * sent multiple times due to:
 * - Network timeouts (Stripe didn't receive your 200 OK)
 * - Stripe's internal retry logic
 * - Manual event replay from Stripe dashboard
 * 
 * To handle this safely, we:
 * 1. Store processed event IDs in WebhookEvent table
 * 2. Check if event exists before processing
 * 3. If exists, return 200 immediately (idempotent)
 * 4. If not, process and record atomically (transaction)
 */

import { Request, Response } from 'express';
import Stripe from 'stripe';
import * as stripeService from '../services/stripe.service';
import * as orderService from '../services/order.service';

/**
 * Handles Stripe webhook events.
 * 
 * IMPORTANT: This endpoint must receive the raw body (not parsed JSON)
 * for signature verification to work. See rawBody middleware.
 */
export async function handleStripeWebhook(
    req: Request,
    res: Response
): Promise<void> {
    // ========================================================================
    // Step 1: Get Signature and Raw Body
    // ========================================================================
    const signature = req.headers['stripe-signature'] as string;

    // Express raw body middleware should attach this
    const rawBody = (req as any).rawBody;

    if (!signature) {
        console.error('[Webhook] Missing stripe-signature header');
        res.status(400).send('Missing signature');
        return;
    }

    if (!rawBody) {
        console.error('[Webhook] Missing raw body - check middleware configuration');
        res.status(400).send('Missing raw body');
        return;
    }

    // ========================================================================
    // Step 2: Verify Webhook Signature
    // ========================================================================
    // This is the CRITICAL security step that proves the request is from Stripe
    const event = stripeService.verifyWebhookSignature(rawBody, signature);

    if (!event) {
        // Signature invalid - could be:
        // - Attacker forging request
        // - Wrong webhook secret configured
        // - Payload was modified in transit
        console.error('[Webhook] Invalid signature');
        res.status(400).send('Invalid signature');
        return;
    }

    console.log(`[Webhook] Received event: ${event.type} (${event.id})`);

    // ========================================================================
    // Step 3: Route Event to Handler
    // ========================================================================
    try {
        switch (event.type) {
            case 'checkout.session.completed':
                await handleCheckoutCompleted(event);
                break;

            case 'checkout.session.expired':
                await handleCheckoutExpired(event);
                break;

            case 'payment_intent.payment_failed':
                await handlePaymentFailed(event);
                break;

            default:
                // Log unhandled events for monitoring
                console.log(`[Webhook] Unhandled event type: ${event.type}`);
        }

        // ========================================================================
        // Step 4: Return 200 OK
        // ========================================================================
        // IMPORTANT: Always return 200 quickly!
        // Stripe will retry if it doesn't receive 200 within ~20 seconds
        // Do heavy processing asynchronously or in background job
        res.status(200).json({ received: true });

    } catch (error) {
        console.error('[Webhook] Error processing event:', error);

        // Return 500 to trigger Stripe retry
        // But be careful - if the error is persistent, you'll get stuck in retry loop
        res.status(500).send('Webhook processing failed');
    }
}

/**
 * Handles checkout.session.completed event.
 * 
 * This is THE event that confirms payment was successful.
 * It's safe to fulfill the order when this arrives.
 * 
 * DECOUPLED FULFILLMENT PATTERN:
 * We wait for this webhook instead of fulfilling in the checkout response.
 * This prevents edge cases like:
 * - User closes browser before redirect
 * - Payment succeeds at Stripe but our API call times out
 * - Network partition between Stripe and our server
 */
async function handleCheckoutCompleted(event: Stripe.Event): Promise<void> {
    const session = event.data.object as Stripe.Checkout.Session;

    console.log(`[Webhook] Checkout completed for session: ${session.id}`);

    // Extract relevant data from session
    const stripeCheckoutId = session.id;
    const stripePaymentId = typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id || null;
    const customerEmail = session.customer_details?.email || null;

    // Mark order as PAID with atomic transaction
    // This also handles at-least-once delivery (prevents duplicate processing)
    const order = await orderService.markOrderAsPaid(
        stripeCheckoutId,
        stripePaymentId,
        customerEmail,
        event.id  // Use Stripe event ID for idempotency
    );

    if (order) {
        console.log(`[Webhook] Order ${order.id} marked as PAID`);

        // Here you would trigger post-payment actions:
        // - Send confirmation email
        // - Start fulfillment process
        // - Update inventory
        // - Notify relevant systems

        // These should ideally be done via message queue for reliability
    } else {
        console.log(`[Webhook] Order already processed or not found`);
    }
}

/**
 * Handles checkout.session.expired event.
 * 
 * User didn't complete payment within the session timeout (~24 hours).
 * Mark order as FAILED so we don't hold inventory.
 */
async function handleCheckoutExpired(event: Stripe.Event): Promise<void> {
    const session = event.data.object as Stripe.Checkout.Session;

    console.log(`[Webhook] Checkout expired for session: ${session.id}`);

    const order = await orderService.markOrderAsFailed(
        session.id,
        event.id
    );

    if (order) {
        console.log(`[Webhook] Order ${order.id} marked as FAILED (expired)`);
    }
}

/**
 * Handles payment_intent.payment_failed event.
 * 
 * Payment was attempted but declined (e.g., insufficient funds).
 * In Checkout mode, user can try again with different card,
 * so we log but don't immediately fail the order.
 */
async function handlePaymentFailed(event: Stripe.Event): Promise<void> {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;

    console.log(`[Webhook] Payment failed for intent: ${paymentIntent.id}`);
    console.log(`[Webhook] Last error: ${paymentIntent.last_payment_error?.message}`);

    // In Checkout mode, user stays on Stripe's page and can retry
    // We don't fail the order here - only on session.expired
}
