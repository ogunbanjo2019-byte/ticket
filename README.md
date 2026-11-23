# Ticketly frontend

Deploy this folder to Vercel as a static project over HTTPS. Configure the public Supabase Project URL/anon key, Render API origin, and optional Turnstile site key in `config.js` before deploying. Run the Supabase SQL from the separate backend package. Never add service-role or SMTP secrets to browser code.

See `SETUP-SUPABASE.md` for email deliverability, rate limits, CAPTCHA, account/file security, legal review, and release checks.
