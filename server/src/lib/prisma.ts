/**
 * Prisma Client Singleton
 * 
 * In development, hot-reloading can create multiple Prisma Client instances.
 * This singleton pattern ensures we reuse the same client across reloads.
 * 
 * In production, this is less critical but still good practice for
 * connection pool management.
 */

import { PrismaClient } from '@prisma/client';

// Extend globalThis to include prisma client
declare global {
    // eslint-disable-next-line no-var
    var prisma: PrismaClient | undefined;
}

// Create or reuse existing Prisma Client
export const prisma = globalThis.prisma || new PrismaClient({
    log: process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
});

// In development, attach to global to survive hot reloads
if (process.env.NODE_ENV !== 'production') {
    globalThis.prisma = prisma;
}

export default prisma;
