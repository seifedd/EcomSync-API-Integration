/**
 * TypeScript Type Definitions for EcomSync Backend
 * 
 * These interfaces define the contract between frontend and backend,
 * ensuring type safety across the API boundary.
 */

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * Cart item structure sent from frontend
 */
export interface CartItem {
    id: string;           // Product ID (Stripe price ID)
    name: string;         // Product name for order snapshot
    price: number;        // Price in cents
    quantity: number;     // Quantity ordered
}

/**
 * Request body for POST /api/create-checkout-session
 */
export interface CreateCheckoutRequest {
    items: CartItem[];
    idempotencyKey?: string;  // Optional: client can provide their own
}

/**
 * Response from POST /api/create-checkout-session
 */
export interface CreateCheckoutResponse {
    success: boolean;
    sessionUrl?: string;      // Stripe Checkout URL to redirect to
    orderId?: string;         // Our internal order ID
    error?: string;           // Error message if success is false
}

/**
 * Generic API error response
 */
export interface ApiErrorResponse {
    success: false;
    error: string;
    code?: string;            // Error code for programmatic handling
    details?: unknown;        // Additional error context
}

// ============================================================================
// Stripe-Related Types
// ============================================================================

/**
 * Stripe error types we handle specifically
 * These correspond to Stripe SDK error classes
 */
export type StripeErrorType =
    | 'StripeCardError'           // Card was declined
    | 'StripeRateLimitError'      // Too many requests
    | 'StripeInvalidRequestError' // Invalid parameters
    | 'StripeAPIError'            // Stripe server error
    | 'StripeConnectionError'     // Network error
    | 'StripeAuthenticationError' // Invalid API key
    | 'StripeIdempotencyError';   // Conflicting idempotent request

/**
 * Webhook event types we handle
 */
export type WebhookEventType =
    | 'checkout.session.completed'
    | 'checkout.session.expired'
    | 'payment_intent.succeeded'
    | 'payment_intent.payment_failed';

// ============================================================================
// Internal Service Types
// ============================================================================

/**
 * Order creation input for OrderService
 */
export interface CreateOrderInput {
    items: CartItem[];
    idempotencyKey: string;
    amount: number;         // Total in cents
    currency?: string;
}

/**
 * Result from Stripe service operations
 */
export interface StripeSessionResult {
    success: boolean;
    sessionId?: string;
    sessionUrl?: string;
    error?: string;
    errorType?: StripeErrorType;
}
