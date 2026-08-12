CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS pokedex;

-- Trigram matching backs card-name resolution during scans. It must live in
-- public: the application pins search_path=public, so an extension installed
-- anywhere else leaves gin_trgm_ops invisible to index creation.
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA public;
