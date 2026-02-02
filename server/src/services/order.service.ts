/**
 * Order Service
 * 
 * Handles all order-related business logic with atomic database operations.
 * 
 * FINTECH BEST PRACTICE: Atomic Database Operations
 * =================================================
 * "Just like we did at Shipt with high-volume transactions, I use database
 * transactions here to ensure our local order state never gets out of sync
 * with Stripe's payment state."
 * 
 * Why this matters:
 * - If we update order status but fail to record webhook event, we might
 *   process the same webhook twice on retry.
 * - If we record webhook event but fail to update order, the order stays
 *   in wrong state forever.
 * - Using a transaction ensures BOTH happen or NEITHER happens.
 */

import prisma from '../lib/prisma';
import { Order, OrderStatus, Prisma } from '@prisma/client';
import { CreateOrderInput, CartItem } from '../types';

/**
 * Creates a new order in PENDING status.
 * 
 * IDEMPOTENCY PATTERN:
 * If an order with this idempotencyKey already exists, return it instead
 * of creating a duplicate. This handles client retries gracefully.
 * 
 * @param input - Order creation input with items and idempotencyKey
 * @returns Created or existing order
 */
export async function createOrder(input: CreateOrderInput): Promise<Order> {
    const { items, idempotencyKey, amount, currency = 'usd' } = input;

    // Check if order with this idempotency key already exists
    const existingOrder = await prisma.order.findUnique({
        where: { idempotencyKey },
    });

    if (existingOrder) {
        console.log(`[Order] Returning existing order for idempotencyKey: ${idempotencyKey}`);
        return existingOrder;
    }

    // Create new order in PENDING status
    const order = await prisma.order.create({
        data: {
            status: 'PENDING',
            amount,
            currency,
            items: items as unknown as Prisma.JsonValue,
            idempotencyKey,
        },
    });

    console.log(`[Order] Created new order: ${order.id} with idempotencyKey: ${idempotencyKey}`);
    return order;
}

/**
 * Updates order with Stripe checkout session ID.
 * Called after successfully creating Stripe session.
 */
export async function updateOrderWithStripeSession(
    orderId: string,
    stripeCheckoutId: string
): Promise<Order> {
    return prisma.order.update({
        where: { id: orderId },
        data: {
            stripeCheckoutId,
            status: 'PROCESSING',
        },
    });
}

/**
 * Finds an order by its Stripe checkout session ID.
 * Used during webhook processing to reconcile.
 */
export async function findOrderByStripeCheckoutId(
    stripeCheckoutId: string
): Promise<Order | null> {
    return prisma.order.findUnique({
        where: { stripeCheckoutId },
    });
}

/**
 * Finds an order by idempotency key.
 * Used to check for existing orders on retry.
 */
export async function findOrderByIdempotencyKey(
    idempotencyKey: string
): Promise<Order | null> {
    return prisma.order.findUnique({
        where: { idempotencyKey },
    });
}

/**
 * Marks order as PAID with atomic transaction.
 * 
 * AT-LEAST-ONCE DELIVERY PATTERN:
 * ================================
 * Stripe webhooks are delivered "at least once" - meaning the same webhook
 * might be sent multiple times (network issues, retries, etc.).
 * 
 * To handle this safely:
 * 1. Check if event was already processed (WebhookEvent table)
 * 2. If yes, return early (idempotent - no duplicate processing)
 * 3. If no, process event AND record it in same transaction
 * 
 * The transaction ensures both operations succeed or both fail.
 * 
 * @param stripeCheckoutId - Stripe session ID
 * @param stripePaymentId - Payment intent ID
 * @param customerEmail - Customer email from Stripe
 * @param webhookEventId - Stripe event ID for idempotency
 * @returns Updated order or null if already processed
 */
export async function markOrderAsPaid(
    stripeCheckoutId: string,
    stripePaymentId: string | null,
    customerEmail: string | null,
    webhookEventId: string
): Promise<Order | null> {
    // Use transaction to ensure atomicity
    return prisma.$transaction(async (tx) => {
        // Step 1: Check if this webhook event was already processed
        const existingEvent = await tx.webhookEvent.findUnique({
            where: { id: webhookEventId },
        });

        if (existingEvent) {
            console.log(`[Order] Webhook event ${webhookEventId} already processed, skipping.`);
            return null; // Idempotent - already processed
        }

        // Step 2: Find the order by Stripe checkout ID
        const order = await tx.order.findUnique({
            where: { stripeCheckoutId },
        });

        if (!order) {
            console.error(`[Order] No order found for stripeCheckoutId: ${stripeCheckoutId}`);
            // Still record the event to prevent re-processing
            await tx.webhookEvent.create({
                data: {
                    id: webhookEventId,
                    type: 'checkout.session.completed',
                },
            });
            return null;
        }

        // Step 3: Check if order is already paid (belt and suspenders)
        if (order.status === 'PAID') {
            console.log(`[Order] Order ${order.id} already PAID, recording event.`);
            await tx.webhookEvent.create({
                data: {
                    id: webhookEventId,
                    type: 'checkout.session.completed',
                },
            });
            return order;
        }

        // Step 4: Update order to PAID
        const updatedOrder = await tx.order.update({
            where: { id: order.id },
            data: {
                status: 'PAID',
                stripePaymentId,
                customerEmail,
                paidAt: new Date(),
            },
        });

        // Step 5: Record webhook event (prevents duplicate processing)
        await tx.webhookEvent.create({
            data: {
                id: webhookEventId,
                type: 'checkout.session.completed',
            },
        });

        console.log(`[Order] Order ${order.id} marked as PAID`);
        return updatedOrder;
    });
}

/**
 * Marks order as FAILED.
 * Called when checkout session expires or payment fails.
 */
export async function markOrderAsFailed(
    stripeCheckoutId: string,
    webhookEventId: string
): Promise<Order | null> {
    return prisma.$transaction(async (tx) => {
        // Check for duplicate webhook
        const existingEvent = await tx.webhookEvent.findUnique({
            where: { id: webhookEventId },
        });

        if (existingEvent) {
            return null;
        }

        const order = await tx.order.findUnique({
            where: { stripeCheckoutId },
        });

        if (!order) {
            await tx.webhookEvent.create({
                data: { id: webhookEventId, type: 'checkout.session.expired' },
            });
            return null;
        }

        const updatedOrder = await tx.order.update({
            where: { id: order.id },
            data: { status: 'FAILED' },
        });

        await tx.webhookEvent.create({
            data: { id: webhookEventId, type: 'checkout.session.expired' },
        });

        console.log(`[Order] Order ${order.id} marked as FAILED`);
        return updatedOrder;
    });
}

/**
 * Gets order by ID with all details.
 */
export async function getOrderById(orderId: string): Promise<Order | null> {
    return prisma.order.findUnique({
        where: { id: orderId },
    });
}
