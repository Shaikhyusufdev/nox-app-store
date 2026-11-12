# Esports Platform – Phase 1

## Setup
1. Supabase project banao -> SQL Editor me `supabase-schema.sql` run karo.
2. `cp .env.example .env` aur values bharo (JWT secrets: `openssl rand -hex 48`).
3. `npm install && npm run seed-admin && npm run dev`
4. GitHub push -> Vercel import -> same env variables Vercel Settings me daalo. `.env` kabhi commit mat karo.

## Phase 1 API
- POST /api/auth/register | login | logout | forgot-password | reset-password, GET /api/auth/me
- POST /api/admin/login | logout, GET /api/admin/me   (admin UI ke liye route: /admin)
- GET /api/games, /api/tournaments, /api/tournaments/:id, POST /api/tournaments/:id/join, GET /api/wallet

## Wallet rules
- 3 balances: deposit, winnings (withdrawable), bonus (non-withdrawable).
- Entry fee kat-ne ka order: bonus -> deposit -> winnings.
- Spin wheel sirf discount deta hai (`user_discounts`), cash nahi.
- Referral: friend ko Rs5 bonus signup pe; referrer ko Rs5 bonus jab friend REAL deposit karke paid match join kare.
