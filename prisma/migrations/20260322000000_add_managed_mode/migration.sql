-- Add CodeGenerationMode enum and new enums for batch management
CREATE TYPE "CodeGenerationMode" AS ENUM ('EXTERNAL', 'MANAGED');
CREATE TYPE "BatchStatus" AS ENUM ('PENDING', 'GENERATING', 'COMPLETED', 'FAILED', 'CANCELLED', 'SEALED');
CREATE TYPE "BatchFormat" AS ENUM ('PIN', 'CSV', 'JSON');
CREATE TYPE "IssuedCodeStatus" AS ENUM ('ACTIVE', 'REDEEMED', 'EXPIRED', 'REVOKED');

-- Add generation_mode column to code_rules
ALTER TABLE "code_rules" ADD COLUMN "generation_mode" "CodeGenerationMode" NOT NULL DEFAULT 'EXTERNAL';

-- Create code_batches table
CREATE TABLE "code_batches" (
    "id" TEXT NOT NULL,
    "code_rule_id" TEXT NOT NULL,
    "batch_size" INTEGER NOT NULL,
    "generated_count" INTEGER NOT NULL DEFAULT 0,
    "status" "BatchStatus" NOT NULL DEFAULT 'PENDING',
    "format" "BatchFormat" NOT NULL DEFAULT 'PIN',
    "label" TEXT,
    "expires_at" TIMESTAMP(3),
    "download_count" INTEGER NOT NULL DEFAULT 0,
    "last_download_at" TIMESTAMP(3),
    "error_message" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    CONSTRAINT "code_batches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "code_batches_code_rule_id_fkey" FOREIGN KEY ("code_rule_id") REFERENCES "code_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "code_batches_code_rule_id_idx" ON "code_batches"("code_rule_id");
CREATE INDEX "code_batches_status_idx" ON "code_batches"("status");
CREATE INDEX "code_batches_created_at_idx" ON "code_batches"("created_at");

-- Create issued_codes table
CREATE TABLE "issued_codes" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "code_hash" VARCHAR(64) NOT NULL,
    "code_encrypted" TEXT NOT NULL,
    "status" "IssuedCodeStatus" NOT NULL DEFAULT 'ACTIVE',
    "redeemed_at" TIMESTAMP(3),
    "redeemed_by_user" TEXT,
    "redemption_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "issued_codes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "issued_codes_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "code_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "issued_codes_batch_id_code_hash_key" ON "issued_codes"("batch_id", "code_hash");
CREATE INDEX "issued_codes_code_hash_idx" ON "issued_codes"("code_hash");
CREATE INDEX "issued_codes_status_idx" ON "issued_codes"("status");
