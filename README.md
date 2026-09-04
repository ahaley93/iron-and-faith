# Iron & Faith

A mobile-first, two-person gym accountability app built for Aaron and Vaughn.

## What it tracks

- Daily workout, nutrition, prayer/scripture, mobility, water, steps, sleep, energy, and reflection
- Weekly weight, body-fat percentage, waist, training sessions, wins, and next-week commitments
- Shared accountability consistency
- Weight/body-fat/waist progress charts
- Shared goals
- Encouragement/accountability messages
- A rotating daily Bible scripture

## Stack

- Static HTML/CSS/JavaScript frontend
- Supabase Auth + PostgreSQL backend
- Row Level Security so only members of the same two-person team can access team data
- GitHub Pages deployment
- Installable PWA shell

## Supabase

This repository is already configured for the dedicated **Iron & Faith** Supabase project through the public browser values in `config.js`.

The key in `config.js` is a Supabase **publishable** key, not a service-role secret. Application data is protected by the database Row Level Security policies in `schema.sql`.

## First use

1. Open the deployed site.
2. Create an account.
3. One person chooses **Create team** and enters a display name.
4. Share the generated invite code with the other person.
5. The second person creates an account and chooses **Join team**.
6. Start logging daily and reviewing weekly.

If Supabase email confirmation is enabled, confirm the email and then return to the app to log in.
