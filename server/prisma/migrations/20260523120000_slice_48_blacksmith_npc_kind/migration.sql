-- Slice 48: add `blacksmith` to the NpcKind enum so Blacksmith NPCs can
-- be placed alongside shop / healer / quest. See ADR 0003 + CONTEXT.md.
-- Postgres needs the literal added in its own statement before any column
-- can reference it.

ALTER TYPE "public"."NpcKind" ADD VALUE 'blacksmith';
