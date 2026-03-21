-- Grant permissions on public schema
GRANT ALL ON SCHEMA public TO CURRENT_USER;

-- Create enums
CREATE TYPE "Charset" AS ENUM ('NUMERIC', 'ALPHA_UPPER', 'ALPHA_LOWER', 'ALPHANUMERIC', 'CUSTOM');
CREATE TYPE "CheckAlgorithm" AS ENUM ('LUHN', 'MOD10', 'MOD11', 'MOD97', 'VERHOEFF', 'DAMM', 'CUSTOM');
CREATE TYPE "CheckDigitPos" AS ENUM ('LAST', 'FIRST');

-- Create tenants
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "ow_tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "api_key" TEXT NOT NULL,
    "api_secret" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "webhook_url" TEXT,
    "banned_countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tenants_ow_tenant_id_key" ON "tenants"("ow_tenant_id");
CREATE UNIQUE INDEX "tenants_api_key_key" ON "tenants"("api_key");

-- Create projects
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "projects_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "projects_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Create code_rules
CREATE TABLE "code_rules" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku_reference" TEXT,
    "total_length" INTEGER NOT NULL,
    "charset" "Charset" NOT NULL,
    "custom_charset" TEXT,
    "has_check_digit" BOOLEAN NOT NULL,
    "check_algorithm" "CheckAlgorithm",
    "check_digit_position" "CheckDigitPos",
    "structure_def" JSONB NOT NULL,
    "separator" TEXT,
    "case_sensitive" BOOLEAN NOT NULL DEFAULT false,
    "prefix" TEXT,
    "max_redemptions" INTEGER NOT NULL DEFAULT 1,
    "product_info" JSONB,
    "campaign_info" JSONB,
    "points_value" INTEGER,
    "custom_check_function" TEXT,
    "fabricant_secret" TEXT,
    "allowed_countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "code_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "code_rules_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Create redeemed_codes
CREATE TABLE "redeemed_codes" (
    "id" TEXT NOT NULL,
    "code_rule_id" TEXT NOT NULL,
    "code_hash" VARCHAR(64) NOT NULL,
    "code_plain" TEXT,
    "ow_user_id" TEXT,
    "ow_transaction_id" TEXT,
    "redemption_count" INTEGER NOT NULL DEFAULT 1,
    "redeemed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "detected_country" VARCHAR(2),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "redeemed_codes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "redeemed_codes_code_rule_id_fkey" FOREIGN KEY ("code_rule_id") REFERENCES "code_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "redeemed_codes_code_rule_id_code_hash_key" ON "redeemed_codes"("code_rule_id", "code_hash");
CREATE INDEX "redeemed_codes_ow_user_id_idx" ON "redeemed_codes"("ow_user_id");
CREATE INDEX "redeemed_codes_redeemed_at_idx" ON "redeemed_codes"("redeemed_at");

-- Create admin_users
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "admin_users_username_key" ON "admin_users"("username");