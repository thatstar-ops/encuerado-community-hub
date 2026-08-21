-- Gate the public self-registration page (/events/[id]/public-register)
-- behind an explicit per-event opt-in. Defaults to FALSE so every existing
-- event (most of which are paid, ticketed through Stripe/TicketSpice) stays
-- closed to free self-registration unless an admin deliberately flips it on
-- for a real free RSVP-style event.
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "selfRegistrationEnabled" BOOLEAN NOT NULL DEFAULT false;
