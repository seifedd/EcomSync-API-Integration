/**
 * Global Error Handling Middleware
 * 
 * Catches all errors and returns consistent error responses.
 * 
 * FINTECH BEST PRACTICE:
 * Never expose internal error details to clients.
 * Log full details internally for debugging.
 */

import { Request, Response, NextFunction } from 'express';
import Stripe from 'stripe';

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
    constructor(
        public statusCode: number,
        public message: string,
        public code?: string
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

/**
 * Not Found middleware - catches unmatched routes
 */
export function notFoundHandler(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.path,
    });
}

/**
 * Global error handler - catches all thrown errors
 */
export function globalErrorHandler(
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
): void {
    // Log full error internally
    console.error('[Error]', {
        message: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
    });

    // Handle known error types
    if (error instanceof ApiError) {
        res.status(error.statusCode).json({
            success: false,
            error: error.message,
            code: error.code,
        });
        return;
    }

    // Handle Stripe errors
    if (error instanceof Stripe.errors.StripeError) {
        const statusCode = getStripeErrorStatusCode(error);
        res.status(statusCode).json({
            success: false,
            error: 'Payment processing error',
            code: error.code,
        });
        return;
    }

    // Handle validation errors (e.g., from JSON parsing)
    if (error instanceof SyntaxError && 'body' in error) {
        res.status(400).json({
            success: false,
            error: 'Invalid JSON in request body',
        });
        return;
    }

    // Default: Internal server error
    // Never expose internal details in production
    res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'development'
            ? error.message
            : 'An unexpected error occurred',
    });
}

/**
 * Maps Stripe errors to HTTP status codes
 */
function getStripeErrorStatusCode(error: Stripe.errors.StripeError): number {
    if (error instanceof Stripe.errors.StripeCardError) {
        return 402; // Payment Required
    }
    if (error instanceof Stripe.errors.StripeRateLimitError) {
        return 429; // Too Many Requests
    }
    if (error instanceof Stripe.errors.StripeInvalidRequestError) {
        return 400; // Bad Request
    }
    if (error instanceof Stripe.errors.StripeAuthenticationError) {
        return 401; // Unauthorized
    }
    return 500; // Internal Server Error
}
