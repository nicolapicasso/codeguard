-- CreateTable
CREATE TABLE "validation_attempts" (
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "code_rule_id" TEXT,
    "tenant_id" TEXT,
    "code" VARCHAR(500) NOT NULL,
    "status" VARCHAR(10) NOT NULL,
    "error_code" VARCHAR(50),
    "error_message" TEXT,
    "ow_user_id" TEXT,
    "ip_address" TEXT,
    "detected_country" VARCHAR(2),
    "detected_region" TEXT,
    "detected_city" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "validation_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "validation_attempts_tenant_id_created_at_idx" ON "validation_attempts"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "validation_attempts_project_id_created_at_idx" ON "validation_attempts"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "validation_attempts_ip_address_created_at_idx" ON "validation_attempts"("ip_address", "created_at");

-- CreateIndex
CREATE INDEX "validation_attempts_ow_user_id_created_at_idx" ON "validation_attempts"("ow_user_id", "created_at");

-- CreateIndex
CREATE INDEX "validation_attempts_status_created_at_idx" ON "validation_attempts"("status", "created_at");

-- CreateIndex
CREATE INDEX "validation_attempts_error_code_created_at_idx" ON "validation_attempts"("error_code", "created_at");
