# EcomSync Senior-Level Stripe Backend - Setup Guide

## Quick Start

### 1. Start PostgreSQL Database

**Option A: Docker (Recommended)**
```bash
cd server
docker compose up -d
```

**Option B: Local PostgreSQL**
If you have PostgreSQL installed locally:
```bash
createdb ecomsync
```

Update `server/.env`:
```
DATABASE_URL="postgresql://your_user:your_password@localhost:5432/ecomsync"
```

### 2. Run Database Migration
```bash
cd server
npx prisma db push
```

### 3. Set Up Stripe Webhook Secret

For local testing with Stripe CLI:
```bash
stripe listen --forward-to localhost:4000/api/webhooks/stripe
```

Copy the webhook signing secret (starts with `whsec_`) and update `server/.env`:
```
STRIPE_WEBHOOK_SECRET="whsec_your_secret_here"
```

### 4. Start the Server
```bash
cd server
npm run dev
```

### 5. Test the Flow
1. Open frontend at http://localhost:3001
2. Add items to cart
3. Click "Proceed to Checkout"
4. Complete payment on Stripe test page (use card: 4242 4242 4242 4242)
5. Redirect to success page

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│                        CLIENT (React)                          │
│  - Sends cart items to /api/create-checkout-session            │
│  - Redirects to Stripe Checkout URL                            │
└────────────────────────┬───────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────┐
│                   EXPRESS API SERVER                           │
│                                                                 │
│  POST /api/create-checkout-session                             │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ 1. Generate/accept idempotency key                      │  │
│  │ 2. Create PENDING order in PostgreSQL                    │  │
│  │ 3. Call Stripe SDK with idempotencyKey                  │  │
│  │ 4. Store stripe_checkout_id                             │  │
│  │ 5. Return session URL                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  POST /api/webhooks/stripe                                     │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ 1. Verify HMAC signature (CRITICAL!)                    │  │
│  │ 2. Check WebhookEvent table (at-least-once)             │  │
│  │ 3. Update Order → PAID in transaction                   │  │
│  │ 4. Record event ID                                      │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

---

## Key Files

| File | Purpose |
|------|---------|
| [schema.prisma](file:///Users/seif/Desktop/coding/EcomSync-API-Integration/server/prisma/schema.prisma) | Database models with idempotency tracking |
| [stripe.service.ts](file:///Users/seif/Desktop/coding/EcomSync-API-Integration/server/src/services/stripe.service.ts) | Stripe SDK wrapper with error classification |
| [order.service.ts](file:///Users/seif/Desktop/coding/EcomSync-API-Integration/server/src/services/order.service.ts) | Atomic database operations |
| [checkout.controller.ts](file:///Users/seif/Desktop/coding/EcomSync-API-Integration/server/src/controllers/checkout.controller.ts) | Checkout session creation |
| [webhook.controller.ts](file:///Users/seif/Desktop/coding/EcomSync-API-Integration/server/src/controllers/webhook.controller.ts) | Webhook handling with security docs |

---

## Interview Talking Points

### 1. Decoupled Fulfillment
> "I don't fulfill the order in the immediate API response. I wait for the Webhook to confirm the funds are actually captured. This prevents 'Race Conditions' where a user might see a success screen before the payment actually settles."

### 2. Atomic Database Operations
> "Just like we did at Shipt with high-volume transactions, I use database transactions here to ensure our local order state never gets out of sync with Stripe's payment state."

### 3. Idempotency as a Safety Net
> "In payment systems, retries are inevitable. I implemented Idempotency Keys so that even if the client retries a request after a timeout, we guarantee the user is only charged once."

---

## Security Highlights

### Webhook Signature Verification

See [webhook.controller.ts](file:///Users/seif/Desktop/coding/EcomSync-API-Integration/server/src/controllers/webhook.controller.ts) lines 1-50 for the full security explanation.

**Without verification, an attacker could:**
1. Discover your webhook URL
2. POST fake "payment_succeeded" event
3. Your system marks order PAID without payment
4. Attacker gets goods for free

**HMAC verification proves:**
- Request came from Stripe
- Payload wasn't tampered
- Timestamp is recent (prevents replay)

---

## Database Schema

```prisma
model Order {
  id                String      @id @default(uuid())
  status            OrderStatus @default(PENDING)  // PENDING → PAID
  amount            Int                             // Cents (avoid floats!)
  idempotencyKey    String      @unique            // Prevents duplicates
  stripeCheckoutId  String?     @unique            // Links to Stripe
  paidAt            DateTime?                      // Set on webhook
}

model WebhookEvent {
  id    String   @id  // Stripe event ID - prevents duplicate processing
  type  String
}
```

---

## Stripe Error Handling

See [stripe.service.ts](file:///Users/seif/Desktop/coding/EcomSync-API-Integration/server/src/services/stripe.service.ts) for full implementation.

| Error Type | Response | Action |
|------------|----------|--------|
| StripeCardError | 402 | User can retry with different card |
| StripeRateLimitError | 429 | Exponential backoff, retry |
| StripeConnectionError | 500 | Safe to retry with same idempotency key |
| StripeIdempotencyError | 400 | Conflicting request - refresh |
