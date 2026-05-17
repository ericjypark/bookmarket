CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE auth_provider AS ENUM ('email', 'google', 'github');
CREATE TYPE metadata_status AS ENUM ('PENDING', 'READY', 'FAILED');
CREATE TYPE collection_visibility AS ENUM ('PRIVATE', 'PUBLIC', 'UNLISTED');
CREATE TYPE listing_status AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE purchase_status AS ENUM ('PENDING', 'PAID', 'REFUNDED', 'CANCELED');
CREATE TYPE access_grant_source AS ENUM ('PURCHASE', 'ADMIN', 'CREATOR_PREVIEW');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  username text UNIQUE,
  first_name text,
  last_name text,
  picture_url text,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_not_blank CHECK (length(trim(email)) > 0),
  CONSTRAINT users_username_format CHECK (
    username IS NULL OR username ~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$'
  )
);

CREATE UNIQUE INDEX users_email_unique_idx ON users (lower(email));
CREATE UNIQUE INDEX users_username_lower_unique_idx ON users (lower(username)) WHERE username IS NOT NULL;

CREATE TABLE auth_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider auth_provider NOT NULL,
  provider_subject text,
  email text NOT NULL,
  password_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_accounts_provider_subject_required CHECK (
    provider = 'email' OR provider_subject IS NOT NULL
  ),
  CONSTRAINT auth_accounts_password_required CHECK (
    provider <> 'email' OR password_hash IS NOT NULL
  )
);

CREATE UNIQUE INDEX auth_accounts_provider_subject_unique_idx
  ON auth_accounts (provider, provider_subject)
  WHERE provider_subject IS NOT NULL;
CREATE UNIQUE INDEX auth_accounts_email_provider_unique_idx
  ON auth_accounts (lower(email), provider);
CREATE INDEX auth_accounts_user_id_idx ON auth_accounts (user_id);

CREATE TABLE refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  token_family_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  replaced_by_token_id uuid REFERENCES refresh_tokens(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX refresh_tokens_user_id_idx ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (token_family_id);

CREATE TABLE api_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  token_prefix text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT '{}',
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX api_tokens_user_id_idx ON api_tokens (user_id);

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT categories_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE UNIQUE INDEX categories_user_name_unique_idx ON categories (user_id, lower(name));

CREATE TABLE bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  url text NOT NULL,
  normalized_url text NOT NULL,
  title_override text,
  description_override text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT bookmarks_url_not_blank CHECK (length(trim(url)) > 0),
  CONSTRAINT bookmarks_normalized_url_not_blank CHECK (length(trim(normalized_url)) > 0)
);

CREATE INDEX bookmarks_user_created_idx ON bookmarks (user_id, created_at DESC);
CREATE INDEX bookmarks_user_category_idx ON bookmarks (user_id, category_id);
CREATE UNIQUE INDEX bookmarks_user_normalized_url_unique_idx
  ON bookmarks (user_id, normalized_url)
  WHERE deleted_at IS NULL;

CREATE TABLE bookmark_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bookmark_id uuid NOT NULL UNIQUE REFERENCES bookmarks(id) ON DELETE CASCADE,
  status metadata_status NOT NULL DEFAULT 'PENDING',
  version integer NOT NULL DEFAULT 1,
  title text,
  description text,
  favicon_url text,
  canonical_url text,
  failure_code text,
  failure_message text,
  fetched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bookmark_metadata_ready_has_title CHECK (
    status <> 'READY' OR title IS NOT NULL
  )
);

CREATE INDEX bookmark_metadata_status_idx ON bookmark_metadata (status);

CREATE TABLE public_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  is_public boolean NOT NULL DEFAULT true,
  display_name text,
  bio text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX public_profiles_username_lower_unique_idx ON public_profiles (lower(username));

CREATE TABLE collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  visibility collection_visibility NOT NULL DEFAULT 'PRIVATE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT collections_title_not_blank CHECK (length(trim(title)) > 0)
);

CREATE INDEX collections_owner_idx ON collections (owner_user_id, created_at DESC);

CREATE TABLE collection_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  bookmark_id uuid NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
  position integer NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT collection_items_position_nonnegative CHECK (position >= 0)
);

CREATE UNIQUE INDEX collection_items_collection_position_unique_idx
  ON collection_items (collection_id, position);
CREATE UNIQUE INDEX collection_items_collection_bookmark_unique_idx
  ON collection_items (collection_id, bookmark_id);

CREATE TABLE marketplace_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  collection_id uuid NOT NULL REFERENCES collections(id) ON DELETE RESTRICT,
  status listing_status NOT NULL DEFAULT 'DRAFT',
  slug text UNIQUE,
  title text NOT NULL,
  description text,
  price_cents integer NOT NULL DEFAULT 0,
  currency char(3) NOT NULL DEFAULT 'USD',
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_listings_price_nonnegative CHECK (price_cents >= 0),
  CONSTRAINT marketplace_listings_title_not_blank CHECK (length(trim(title)) > 0)
);

CREATE INDEX marketplace_listings_seller_idx ON marketplace_listings (seller_user_id, created_at DESC);
CREATE INDEX marketplace_listings_status_idx ON marketplace_listings (status);

CREATE TABLE listing_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  version integer NOT NULL,
  collection_id uuid NOT NULL REFERENCES collections(id) ON DELETE RESTRICT,
  snapshot jsonb NOT NULL,
  price_cents integer NOT NULL,
  currency char(3) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT listing_versions_version_positive CHECK (version > 0),
  CONSTRAINT listing_versions_price_nonnegative CHECK (price_cents >= 0)
);

CREATE UNIQUE INDEX listing_versions_listing_version_unique_idx ON listing_versions (listing_id, version);

CREATE TABLE purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES marketplace_listings(id) ON DELETE RESTRICT,
  listing_version_id uuid NOT NULL REFERENCES listing_versions(id) ON DELETE RESTRICT,
  status purchase_status NOT NULL DEFAULT 'PENDING',
  amount_cents integer NOT NULL,
  currency char(3) NOT NULL,
  provider text,
  provider_purchase_id text,
  purchased_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchases_amount_nonnegative CHECK (amount_cents >= 0)
);

CREATE INDEX purchases_buyer_idx ON purchases (buyer_user_id, created_at DESC);
CREATE UNIQUE INDEX purchases_provider_purchase_unique_idx
  ON purchases (provider, provider_purchase_id)
  WHERE provider IS NOT NULL AND provider_purchase_id IS NOT NULL;

CREATE TABLE access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_version_id uuid NOT NULL REFERENCES listing_versions(id) ON DELETE CASCADE,
  purchase_id uuid REFERENCES purchases(id) ON DELETE SET NULL,
  source access_grant_source NOT NULL,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX access_grants_user_listing_version_unique_idx
  ON access_grants (user_id, listing_version_id)
  WHERE revoked_at IS NULL;

CREATE TABLE processed_events (
  event_id uuid PRIMARY KEY,
  idempotency_key text NOT NULL,
  consumer text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX processed_events_consumer_key_unique_idx
  ON processed_events (consumer, idempotency_key);

CREATE TABLE idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  response_status integer,
  response_body jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idempotency_records_user_key_unique_idx
  ON idempotency_records (user_id, idempotency_key);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER auth_accounts_set_updated_at BEFORE UPDATE ON auth_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER api_tokens_set_updated_at BEFORE UPDATE ON api_tokens
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER categories_set_updated_at BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER bookmarks_set_updated_at BEFORE UPDATE ON bookmarks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER bookmark_metadata_set_updated_at BEFORE UPDATE ON bookmark_metadata
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER public_profiles_set_updated_at BEFORE UPDATE ON public_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER collections_set_updated_at BEFORE UPDATE ON collections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER collection_items_set_updated_at BEFORE UPDATE ON collection_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER marketplace_listings_set_updated_at BEFORE UPDATE ON marketplace_listings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER purchases_set_updated_at BEFORE UPDATE ON purchases
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
