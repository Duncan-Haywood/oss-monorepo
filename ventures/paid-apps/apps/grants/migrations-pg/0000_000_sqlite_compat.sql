-- SQLite compatibility for the shared Drizzle (sqlite-core) schema. Generated: do not edit.
CREATE OR REPLACE FUNCTION instr(haystack text, needle text) RETURNS integer
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS 'SELECT strpos(haystack, needle)';
--> statement-breakpoint
CREATE OR REPLACE VIEW sqlite_master AS
  SELECT 'table'::text AS type, table_name::text AS name, table_name::text AS tbl_name
  FROM information_schema.tables WHERE table_schema = current_schema();
