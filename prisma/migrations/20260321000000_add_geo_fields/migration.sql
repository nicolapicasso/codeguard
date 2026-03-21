-- AlterTable: Add banned_countries to tenants
ALTER TABLE "tenants" ADD COLUMN "banned_countries" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable: Add detected_country to redeemed_codes
ALTER TABLE "redeemed_codes" ADD COLUMN "detected_country" VARCHAR(2);
