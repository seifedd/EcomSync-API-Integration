# Stripe Production Deployment Checklist

## Overview

This checklist covers transitioning from Stripe **Test Mode** to **Live Mode** for demos and production deployments.

---

## 1. Environment Variables: Test → Live Keys

### Local Development (Test Mode)
```bash
# server/.env (current)
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_test_..."
```

### Production (Live Mode)
```bash
# Production environment variables (NEVER commit to git!)
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_live_..."
```

### Best Practices
| ✅ Do | ❌ Don't |
|-------|---------|
| Use environment variables | Hardcode keys in source code |
| Use secret managers (AWS Secrets, Vault) | Commit `.env` files to git |
| Rotate keys after exposure | Share keys via Slack/email |
| Use restricted API keys in production | Use unrestricted keys |

### Getting Live Keys
1. Go to [Stripe Dashboard](https://dashboard.stripe.com/apikeys)
2. Toggle **"Test mode"** OFF (top-right)
3. Copy the live secret key (`sk_live_...`)

---

## 2. Webhook Endpoint: localhost → Production URL

### Current (Local)
```
stripe listen --forward-to localhost:4000/api/webhooks/stripe
```

### Production Setup
1. **Deploy your server** to a public URL (e.g., `https://api.yoursite.com`)

2. **Create Webhook Endpoint in Stripe Dashboard:**
   - Go to [Developers → Webhooks](https://dashboard.stripe.com/webhooks)
   - Click **"Add endpoint"**
   - Enter: `https://api.yoursite.com/api/webhooks/stripe`
   - Select events:
     - `checkout.session.completed`
     - `checkout.session.expired`
     - `payment_intent.payment_failed`

3. **Copy the Signing Secret** (`whsec_...`) to your production environment

### Update Frontend URLs
```typescript
// server/src/services/stripe.service.ts
success_url: `${process.env.FRONTEND_URL}/success`,
cancel_url: `${process.env.FRONTEND_URL}/cancel`,
```

Set `FRONTEND_URL` to your production domain in environment variables.

---

## 3. SSL/HTTPS Requirements

> [!IMPORTANT]
> **Stripe REQUIRES HTTPS for all production webhooks and API calls.**

### Requirements
| Component | Requirement |
|-----------|-------------|
| Webhook endpoint | Must be HTTPS |
| Success/Cancel URLs | Should be HTTPS |
| API calls | Stripe SDK uses HTTPS automatically |

### Solutions
| Platform | HTTPS Setup |
|----------|-------------|
| Vercel/Netlify | Automatic SSL included |
| AWS/GCP | Use Application Load Balancer with ACM cert |
| Self-hosted | Use Caddy (auto-HTTPS) or Nginx + Let's Encrypt |
| For demos | Use ngrok (`ngrok http 4000`) |

### Quick Demo with ngrok
```bash
# Expose local server with HTTPS
ngrok http 4000

# Use the https URL for webhook endpoint
# Example: https://abc123.ngrok.io/api/webhooks/stripe
```

---

## 4. Testing Live Mode Safely

### Option A: Stripe Test Mode (Recommended for Demos)
**You can demo the ENTIRE flow using test mode!** No real money moves.

Test cards work in test mode:
```
Success:  4242 4242 4242 4242
Declined: 4000 0000 0000 0002
```

### Option B: Live Mode with Minimal Amount
If you MUST test live mode:
1. Create a product with $0.50 minimum (Stripe's minimum)
2. Use your own card
3. Immediately refund via Dashboard

### Option C: Stripe Test Clocks
For subscription testing, use [Test Clocks](https://stripe.com/docs/billing/testing/test-clocks) to simulate time passing.

---

## 5. Why Full "Live Demo" May Not Be Possible

> [!CAUTION]
> For interview demos, **Test Mode is sufficient and preferred.**

### Challenges with Live Mode Demos
| Challenge | Reason |
|-----------|--------|
| Requires business verification | Stripe requires legal entity info for live mode |
| Real money at risk | Any bugs = real financial issues |
| Refund delays | Takes 5-10 days to get money back |
| No takebacks | Once live, real customers can pay |

### Interview Recommendation
For your Gigadat interview, **stay in Test Mode** and explain:

> "This demo uses Stripe's Test Mode, which provides identical API behavior to Live Mode. The only difference is no real money moves. Switching to live is a configuration change - swapping `sk_test_` for `sk_live_` in environment variables and updating webhook URLs. I've built the system with that transition in mind by using environment variables throughout."

---

## Pre-Deployment Checklist

### Environment
- [ ] `STRIPE_SECRET_KEY` set to `sk_live_...` (production only)
- [ ] `STRIPE_WEBHOOK_SECRET` set to production signing secret
- [ ] `FRONTEND_URL` set to production domain
- [ ] `DATABASE_URL` set to production database
- [ ] All secrets in secret manager (not `.env` files)

### Stripe Dashboard
- [ ] Webhook endpoint created with production URL
- [ ] Correct events selected (checkout.session.completed, etc.)
- [ ] Test webhook with "Send test webhook" button

### Infrastructure
- [ ] HTTPS enabled on all endpoints
- [ ] Database migrations applied
- [ ] Error monitoring configured (Sentry, etc.)
- [ ] Logging configured for debugging

### Testing
- [ ] Complete one end-to-end checkout in test mode
- [ ] Verify webhook updates order to PAID
- [ ] Test duplicate webhook handling (idempotency)
- [ ] Test error scenarios (declined card)

---

## Quick Reference: Environment Files

### Development (.env.development)
```bash
STRIPE_SECRET_KEY="sk_test_51M0xn8..."
STRIPE_WEBHOOK_SECRET="whsec_..."
FRONTEND_URL="http://localhost:3001"
DATABASE_URL="postgresql://seif@localhost:5432/ecomsync"
```

### Production (set in hosting platform)
```bash
STRIPE_SECRET_KEY="sk_live_..."  # From Stripe Dashboard
STRIPE_WEBHOOK_SECRET="whsec_..."  # From production webhook
FRONTEND_URL="https://yoursite.com"
DATABASE_URL="postgresql://user:pass@prod-db:5432/ecomsync"
```
