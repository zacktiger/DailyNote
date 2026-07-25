import { defineConfig } from 'drizzle-kit';

/**
 * Generated SQL lands in /supabase/migrations so the Supabase CLI is the single
 * thing that applies migrations. Drizzle authors the schema; it does not run it.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: '../../supabase/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  // Supabase owns these; never diff or drop them.
  schemaFilter: ['public'],
  verbose: true,
  strict: true,
});
