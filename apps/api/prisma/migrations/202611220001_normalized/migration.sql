-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TargetVersionKind" AS ENUM ('CONFIGURATION', 'SNAPSHOT');

CREATE TYPE "QuantityMode" AS ENUM ('TOTAL', 'GOOD');

-- CreateEnum
CREATE TYPE "ActionKind" AS ENUM ('OVERTIME', 'CAPACITY', 'MATERIAL', 'PEOPLE', 'MAINTENANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ActionCalendar" AS ENUM ('ALL', 'WEEKDAYS', 'SATURDAY');

-- CreateEnum
CREATE TYPE "MailStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(160) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "accessKey" VARCHAR(100) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "timeZone" VARCHAR(80) NOT NULL DEFAULT 'America/Sao_Paulo',

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Factory" (
    "id" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(160) NOT NULL,

    CONSTRAINT "Factory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Area" (
    "id" UUID NOT NULL,
    "factoryId" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(160) NOT NULL,

    CONSTRAINT "Area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Line" (
    "id" UUID NOT NULL,
    "areaId" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(160) NOT NULL,

    CONSTRAINT "Line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessStage" (
    "id" UUID NOT NULL,
    "areaId" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(160) NOT NULL,

    CONSTRAINT "ProcessStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageTranslation" (
    "stageId" UUID NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "label" VARCHAR(160) NOT NULL,

    CONSTRAINT "StageTranslation_pkey" PRIMARY KEY ("stageId","locale")
);

-- CreateTable
CREATE TABLE "LineStage" (
    "id" UUID NOT NULL,
    "lineId" UUID NOT NULL,
    "stageId" UUID NOT NULL,

    CONSTRAINT "LineStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" UUID NOT NULL,
    "lineId" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "workCenter" VARCHAR(60),
    "assetCode" VARCHAR(100),

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "startMinute" SMALLINT NOT NULL,
    "endMinute" SMALLINT NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftCalendarRule" (
    "id" UUID NOT NULL,
    "shiftId" UUID NOT NULL,
    "weekday" SMALLINT NOT NULL,
    "anchorDate" DATE NOT NULL,
    "intervalWeeks" SMALLINT NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "startMinute" SMALLINT,
    "endMinute" SMALLINT,

    CONSTRAINT "ShiftCalendarRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Actor" (
    "id" UUID NOT NULL,
    "issuer" VARCHAR(500) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "displayName" VARCHAR(160) NOT NULL,

    CONSTRAINT "Actor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TargetSchedule" (
    "id" UUID NOT NULL,
    "lineStageId" UUID NOT NULL,
    "shiftId" UUID NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TargetSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TargetVersion" (
    "id" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "kind" "TargetVersionKind" NOT NULL DEFAULT 'CONFIGURATION',
    "effectiveFrom" DATE NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "capacity" INTEGER,
    "efficiencyPercent" DECIMAL(5,2),
    "quantityTarget" INTEGER,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TargetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionEntry" (
    "id" UUID NOT NULL,
    "operationDate" DATE NOT NULL,
    "lineStageId" UUID NOT NULL,
    "shiftId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "defects" INTEGER NOT NULL DEFAULT 0,
    "recovery" BOOLEAN NOT NULL DEFAULT false,
    "targetVersionId" UUID,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ProductionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StopReason" (
    "id" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(160) NOT NULL,

    CONSTRAINT "StopReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReasonTranslation" (
    "reasonId" UUID NOT NULL,
    "locale" VARCHAR(10) NOT NULL,
    "label" VARCHAR(160) NOT NULL,

    CONSTRAINT "ReasonTranslation_pkey" PRIMARY KEY ("reasonId","locale")
);

-- CreateTable
CREATE TABLE "StopEntry" (
    "id" UUID NOT NULL,
    "equipmentId" UUID NOT NULL,
    "reasonId" UUID NOT NULL,
    "shiftId" UUID NOT NULL,
    "operationDate" DATE NOT NULL,
    "comment" VARCHAR(500) NOT NULL,
    "reportedDurationMinutes" INTEGER,
    "startedAt" TIMESTAMPTZ(3),
    "endedAt" TIMESTAMPTZ(3),
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "StopEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryPlan" (
    "id" UUID NOT NULL,
    "areaId" UUID NOT NULL,
    "currentRevision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RecoveryPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryPlanVersion" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "stageId" UUID NOT NULL,
    "lineId" UUID,
    "startDate" DATE NOT NULL,
    "initialBacklog" INTEGER NOT NULL,
    "quantityMode" "QuantityMode" NOT NULL DEFAULT 'TOTAL',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "note" VARCHAR(500) NOT NULL DEFAULT '',
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryPlanVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanDay" (
    "id" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "demand" INTEGER,
    "forecast" INTEGER,
    "actualOverride" INTEGER,
    "actualReason" VARCHAR(500) NOT NULL DEFAULT '',
    "adjustment" INTEGER NOT NULL DEFAULT 0,
    "adjustmentReason" VARCHAR(500) NOT NULL DEFAULT '',
    "note" VARCHAR(500) NOT NULL DEFAULT '',
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "recoveryOnly" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PlanDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryAction" (
    "id" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "lineId" UUID,
    "title" VARCHAR(150) NOT NULL,
    "kind" "ActionKind" NOT NULL DEFAULT 'OTHER',
    "status" "ActionStatus" NOT NULL DEFAULT 'PLANNED',
    "calendar" "ActionCalendar" NOT NULL DEFAULT 'ALL',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "responsible" VARCHAR(100) NOT NULL DEFAULT '',
    "extraUnits" INTEGER NOT NULL DEFAULT 0,
    "costPerDay" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "note" VARCHAR(500) NOT NULL DEFAULT '',

    CONSTRAINT "RecoveryAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanCosts" (
    "versionId" UUID NOT NULL,
    "hourly" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "premium" DECIMAL(10,4) NOT NULL DEFAULT 2,
    "charges" DECIMAL(10,4) NOT NULL DEFAULT 1.7445,
    "dsm" DECIMAL(10,4) NOT NULL DEFAULT 1.2,
    "hours" DECIMAL(8,4) NOT NULL DEFAULT 8.8,
    "food" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "people" INTEGER NOT NULL DEFAULT 0,
    "volume" INTEGER NOT NULL DEFAULT 0,
    "dailyExtra" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlanCosts_pkey" PRIMARY KEY ("versionId")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "unitKey" VARCHAR(100),
    "entityType" VARCHAR(60) NOT NULL,
    "entityId" VARCHAR(100) NOT NULL,
    "action" VARCHAR(60) NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "before" JSONB,
    "after" JSONB,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegacyReference" (
    "source" VARCHAR(100) NOT NULL,
    "entityType" VARCHAR(60) NOT NULL,
    "sourceId" VARCHAR(100) NOT NULL,
    "targetId" UUID NOT NULL,
    "checksum" CHAR(64) NOT NULL,

    CONSTRAINT "LegacyReference_pkey" PRIMARY KEY ("source","entityType","sourceId")
);

-- CreateTable
CREATE TABLE "ReportRecipient" (
    "id" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "address" VARCHAR(254) NOT NULL,
    "locale" VARCHAR(10) NOT NULL DEFAULT 'pt-BR',
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ReportRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailOutbox" (
    "id" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "subject" VARCHAR(250) NOT NULL,
    "text" TEXT NOT NULL,
    "status" "MailStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMPTZ(3),
    "sentAt" TIMESTAMPTZ(3),
    "lastError" VARCHAR(100),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_code_key" ON "Organization"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_accessKey_key" ON "Unit"("accessKey");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_organizationId_code_key" ON "Unit"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Factory_unitId_code_key" ON "Factory"("unitId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Area_factoryId_code_key" ON "Area"("factoryId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Line_areaId_code_key" ON "Line"("areaId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessStage_areaId_code_key" ON "ProcessStage"("areaId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "LineStage_lineId_stageId_key" ON "LineStage"("lineId", "stageId");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_lineId_code_key" ON "Equipment"("lineId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Shift_unitId_code_key" ON "Shift"("unitId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftCalendarRule_shiftId_weekday_anchorDate_key" ON "ShiftCalendarRule"("shiftId", "weekday", "anchorDate");

-- CreateIndex
CREATE UNIQUE INDEX "Actor_issuer_subject_key" ON "Actor"("issuer", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "TargetSchedule_lineStageId_shiftId_key" ON "TargetSchedule"("lineStageId", "shiftId");

-- CreateIndex
CREATE INDEX "TargetVersion_scheduleId_effectiveFrom_revision_idx" ON "TargetVersion"("scheduleId", "effectiveFrom", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "TargetVersion_scheduleId_revision_key" ON "TargetVersion"("scheduleId", "revision");

-- CreateIndex
CREATE INDEX "ProductionEntry_lineStageId_operationDate_shiftId_idx" ON "ProductionEntry"("lineStageId", "operationDate", "shiftId");

-- CreateIndex
CREATE UNIQUE INDEX "StopReason_unitId_code_key" ON "StopReason"("unitId", "code");

-- CreateIndex
CREATE INDEX "StopEntry_equipmentId_operationDate_shiftId_idx" ON "StopEntry"("equipmentId", "operationDate", "shiftId");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryPlanVersion_planId_revision_key" ON "RecoveryPlanVersion"("planId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "PlanDay_versionId_date_key" ON "PlanDay"("versionId", "date");

-- CreateIndex
CREATE INDEX "AuditEvent_unitKey_occurredAt_idx" ON "AuditEvent"("unitKey", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReportRecipient_unitId_address_key" ON "ReportRecipient"("unitId", "address");

-- CreateIndex
CREATE INDEX "MailOutbox_status_availableAt_idx" ON "MailOutbox"("status", "availableAt");

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factory" ADD CONSTRAINT "Factory_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Area" ADD CONSTRAINT "Area_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "Factory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Line" ADD CONSTRAINT "Line_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessStage" ADD CONSTRAINT "ProcessStage_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageTranslation" ADD CONSTRAINT "StageTranslation_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "ProcessStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineStage" ADD CONSTRAINT "LineStage_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "Line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineStage" ADD CONSTRAINT "LineStage_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "ProcessStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "Line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftCalendarRule" ADD CONSTRAINT "ShiftCalendarRule_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetSchedule" ADD CONSTRAINT "TargetSchedule_lineStageId_fkey" FOREIGN KEY ("lineStageId") REFERENCES "LineStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetSchedule" ADD CONSTRAINT "TargetSchedule_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetVersion" ADD CONSTRAINT "TargetVersion_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "TargetSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetVersion" ADD CONSTRAINT "TargetVersion_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionEntry" ADD CONSTRAINT "ProductionEntry_lineStageId_fkey" FOREIGN KEY ("lineStageId") REFERENCES "LineStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionEntry" ADD CONSTRAINT "ProductionEntry_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionEntry" ADD CONSTRAINT "ProductionEntry_targetVersionId_fkey" FOREIGN KEY ("targetVersionId") REFERENCES "TargetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionEntry" ADD CONSTRAINT "ProductionEntry_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StopReason" ADD CONSTRAINT "StopReason_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReasonTranslation" ADD CONSTRAINT "ReasonTranslation_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "StopReason"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StopEntry" ADD CONSTRAINT "StopEntry_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StopEntry" ADD CONSTRAINT "StopEntry_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "StopReason"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StopEntry" ADD CONSTRAINT "StopEntry_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StopEntry" ADD CONSTRAINT "StopEntry_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryPlan" ADD CONSTRAINT "RecoveryPlan_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryPlanVersion" ADD CONSTRAINT "RecoveryPlanVersion_planId_fkey" FOREIGN KEY ("planId") REFERENCES "RecoveryPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryPlanVersion" ADD CONSTRAINT "RecoveryPlanVersion_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "ProcessStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryPlanVersion" ADD CONSTRAINT "RecoveryPlanVersion_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "Line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryPlanVersion" ADD CONSTRAINT "RecoveryPlanVersion_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanDay" ADD CONSTRAINT "PlanDay_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "RecoveryPlanVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryAction" ADD CONSTRAINT "RecoveryAction_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "RecoveryPlanVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryAction" ADD CONSTRAINT "RecoveryAction_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "Line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanCosts" ADD CONSTRAINT "PlanCosts_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "RecoveryPlanVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRecipient" ADD CONSTRAINT "ReportRecipient_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailOutbox" ADD CONSTRAINT "MailOutbox_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "ReportRecipient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Domain invariants supplement the foreign keys generated by Prisma.
ALTER TABLE "ProductionEntry" ADD CONSTRAINT production_counts CHECK (quantity >= 0 AND defects >= 0 AND defects <= quantity AND version > 0);
ALTER TABLE "StopEntry" ADD CONSTRAINT stop_times CHECK (version > 0 AND (("reportedDurationMinutes" IS NOT NULL AND "reportedDurationMinutes" BETWEEN 1 AND 1440 AND "startedAt" IS NULL AND "endedAt" IS NULL) OR ("reportedDurationMinutes" IS NULL AND "startedAt" IS NOT NULL AND "endedAt" IS NOT NULL AND "endedAt">"startedAt" AND EXTRACT(EPOCH FROM ("endedAt"-"startedAt")) BETWEEN 60 AND 86400 AND MOD(EXTRACT(EPOCH FROM ("endedAt"-"startedAt")),60)=0)));
ALTER TABLE "Shift" ADD CONSTRAINT shift_minutes CHECK ("startMinute" BETWEEN 0 AND 1439 AND "endMinute" BETWEEN 0 AND 1439 AND "startMinute" <> "endMinute");
ALTER TABLE "ShiftCalendarRule" ADD CONSTRAINT calendar_values CHECK (weekday BETWEEN 1 AND 7 AND "intervalWeeks" BETWEEN 1 AND 52 AND (("startMinute" IS NULL AND "endMinute" IS NULL) OR ("startMinute" IS NOT NULL AND "endMinute" IS NOT NULL AND "startMinute" BETWEEN 0 AND 1439 AND "endMinute" BETWEEN 0 AND 1439 AND "startMinute" <> "endMinute")));
ALTER TABLE "TargetVersion" ADD CONSTRAINT target_values CHECK (revision > 0 AND (capacity IS NULL OR "quantityTarget" IS NULL) AND (capacity IS NULL OR capacity >= 0) AND ("quantityTarget" IS NULL OR "quantityTarget" >= 0) AND ((capacity IS NULL AND "efficiencyPercent" IS NULL) OR (capacity IS NOT NULL AND "efficiencyPercent" IS NOT NULL AND "efficiencyPercent" BETWEEN 0 AND 100)) AND (NOT enabled OR capacity IS NOT NULL OR "quantityTarget" IS NOT NULL));
ALTER TABLE "TargetSchedule" ADD CONSTRAINT target_revision CHECK (revision >= 0);
ALTER TABLE "RecoveryPlan" ADD CONSTRAINT plan_revision CHECK ("currentRevision" >= 0);
ALTER TABLE "RecoveryPlanVersion" ADD CONSTRAINT plan_values CHECK (revision > 0 AND "initialBacklog" >= 0);
ALTER TABLE "PlanDay" ADD CONSTRAINT day_values CHECK ((demand IS NULL OR demand >= 0) AND (forecast IS NULL OR forecast >= 0) AND ("actualOverride" IS NULL OR ("actualOverride" >= 0 AND LENGTH(TRIM("actualReason")) > 0)) AND (adjustment=0 OR LENGTH(TRIM("adjustmentReason")) > 0));
ALTER TABLE "RecoveryAction" ADD CONSTRAINT action_values CHECK ("endDate" >= "startDate" AND "extraUnits" >= 0 AND "costPerDay" >= 0);
ALTER TABLE "PlanCosts" ADD CONSTRAINT cost_values CHECK (hourly>=0 AND premium>=0 AND charges>=0 AND dsm>=0 AND hours BETWEEN 0 AND 24 AND food>=0 AND people>=0 AND volume>=0 AND "dailyExtra">=0);
ALTER TABLE "MailOutbox" ADD CONSTRAINT mail_attempts CHECK (attempts>=0);
CREATE FUNCTION panel_scope_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE unit_a uuid; unit_b uuid; unit_c uuid; area_a uuid; area_b uuid; ls uuid; sh uuid; effective date;
BEGIN
 IF TG_TABLE_NAME='LineStage' THEN
  SELECT "areaId" INTO area_a FROM "Line" WHERE id=NEW."lineId";
  SELECT "areaId" INTO area_b FROM "ProcessStage" WHERE id=NEW."stageId";
  IF area_a IS DISTINCT FROM area_b THEN RAISE EXCEPTION 'line_stage_scope' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME IN ('TargetSchedule','ProductionEntry') THEN
  SELECT f."unitId" INTO unit_a FROM "LineStage" ls JOIN "Line" l ON l.id=ls."lineId" JOIN "Area" a ON a.id=l."areaId" JOIN "Factory" f ON f.id=a."factoryId" WHERE ls.id=NEW."lineStageId";
  SELECT "unitId" INTO unit_b FROM "Shift" WHERE id=NEW."shiftId";
  IF unit_a IS DISTINCT FROM unit_b THEN RAISE EXCEPTION 'line_shift_scope' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='ProductionEntry' THEN
   IF NEW."targetVersionId" IS NOT NULL THEN
   SELECT s."lineStageId",s."shiftId",v."effectiveFrom" INTO ls,sh,effective FROM "TargetVersion" v JOIN "TargetSchedule" s ON s.id=v."scheduleId" WHERE v.id=NEW."targetVersionId";
   IF ls IS DISTINCT FROM NEW."lineStageId" OR sh IS DISTINCT FROM NEW."shiftId" OR effective>NEW."operationDate" THEN RAISE EXCEPTION 'target_scope' USING ERRCODE='23514'; END IF;
   END IF;
  END IF;
 ELSIF TG_TABLE_NAME='StopEntry' THEN
  SELECT f."unitId" INTO unit_a FROM "Equipment" e JOIN "Line" l ON l.id=e."lineId" JOIN "Area" a ON a.id=l."areaId" JOIN "Factory" f ON f.id=a."factoryId" WHERE e.id=NEW."equipmentId";
  SELECT "unitId" INTO unit_b FROM "Shift" WHERE id=NEW."shiftId";
  SELECT "unitId" INTO unit_c FROM "StopReason" WHERE id=NEW."reasonId";
  IF unit_a IS DISTINCT FROM unit_b OR unit_a IS DISTINCT FROM unit_c THEN RAISE EXCEPTION 'stop_scope' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='RecoveryPlanVersion' THEN
  SELECT "areaId" INTO area_a FROM "RecoveryPlan" WHERE id=NEW."planId";
  SELECT "areaId" INTO area_b FROM "ProcessStage" WHERE id=NEW."stageId";
  IF area_a IS DISTINCT FROM area_b THEN RAISE EXCEPTION 'plan_stage_scope' USING ERRCODE='23514'; END IF;
  IF NEW."lineId" IS NOT NULL THEN
   SELECT "areaId" INTO area_b FROM "Line" WHERE id=NEW."lineId";
   IF area_a IS DISTINCT FROM area_b THEN RAISE EXCEPTION 'plan_line_scope' USING ERRCODE='23514'; END IF;
   IF NOT EXISTS(SELECT 1 FROM "LineStage" WHERE "lineId"=NEW."lineId" AND "stageId"=NEW."stageId") THEN RAISE EXCEPTION 'plan_line_stage' USING ERRCODE='23514'; END IF;
  END IF;
 ELSIF TG_TABLE_NAME='RecoveryAction' AND NEW."lineId" IS NOT NULL THEN
  SELECT p."areaId" INTO area_a FROM "RecoveryPlanVersion" v JOIN "RecoveryPlan" p ON p.id=v."planId" WHERE v.id=NEW."versionId";
  SELECT "areaId" INTO area_b FROM "Line" WHERE id=NEW."lineId";
  IF area_a IS DISTINCT FROM area_b THEN RAISE EXCEPTION 'action_line_scope' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER line_stage_integrity BEFORE INSERT OR UPDATE ON "LineStage" FOR EACH ROW EXECUTE FUNCTION panel_scope_integrity();
CREATE TRIGGER schedule_integrity BEFORE INSERT OR UPDATE ON "TargetSchedule" FOR EACH ROW EXECUTE FUNCTION panel_scope_integrity();
CREATE TRIGGER production_integrity BEFORE INSERT OR UPDATE ON "ProductionEntry" FOR EACH ROW EXECUTE FUNCTION panel_scope_integrity();
CREATE TRIGGER stop_integrity BEFORE INSERT OR UPDATE ON "StopEntry" FOR EACH ROW EXECUTE FUNCTION panel_scope_integrity();
CREATE TRIGGER plan_integrity BEFORE INSERT OR UPDATE ON "RecoveryPlanVersion" FOR EACH ROW EXECUTE FUNCTION panel_scope_integrity();
CREATE TRIGGER action_integrity BEFORE INSERT OR UPDATE ON "RecoveryAction" FOR EACH ROW EXECUTE FUNCTION panel_scope_integrity();
CREATE FUNCTION panel_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable_history' USING ERRCODE='23514'; END $$;
CREATE TRIGGER immutable_targets BEFORE UPDATE OR DELETE ON "TargetVersion" FOR EACH ROW EXECUTE FUNCTION panel_immutable();
CREATE TRIGGER immutable_plans BEFORE UPDATE OR DELETE ON "RecoveryPlanVersion" FOR EACH ROW EXECUTE FUNCTION panel_immutable();
CREATE TRIGGER immutable_days BEFORE UPDATE OR DELETE ON "PlanDay" FOR EACH ROW EXECUTE FUNCTION panel_immutable();
CREATE TRIGGER immutable_actions BEFORE UPDATE OR DELETE ON "RecoveryAction" FOR EACH ROW EXECUTE FUNCTION panel_immutable();
CREATE TRIGGER immutable_costs BEFORE UPDATE OR DELETE ON "PlanCosts" FOR EACH ROW EXECUTE FUNCTION panel_immutable();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION panel_immutable();
-- Catalog identities cannot be moved into a different authorization boundary.
CREATE FUNCTION panel_fixed_parent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF to_jsonb(OLD)->TG_ARGV[0] IS DISTINCT FROM to_jsonb(NEW)->TG_ARGV[0] THEN RAISE EXCEPTION 'immutable_parent' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER fixed_unit BEFORE UPDATE ON "Unit" FOR EACH ROW EXECUTE FUNCTION panel_fixed_parent('organizationId');
CREATE TRIGGER fixed_factory BEFORE UPDATE ON "Factory" FOR EACH ROW EXECUTE FUNCTION panel_fixed_parent('unitId');
CREATE TRIGGER fixed_area BEFORE UPDATE ON "Area" FOR EACH ROW EXECUTE FUNCTION panel_fixed_parent('factoryId');
CREATE TRIGGER fixed_line BEFORE UPDATE ON "Line" FOR EACH ROW EXECUTE FUNCTION panel_fixed_parent('areaId');
CREATE TRIGGER fixed_stage BEFORE UPDATE ON "ProcessStage" FOR EACH ROW EXECUTE FUNCTION panel_fixed_parent('areaId');
CREATE TRIGGER fixed_equipment BEFORE UPDATE ON "Equipment" FOR EACH ROW EXECUTE FUNCTION panel_fixed_parent('lineId');
CREATE TRIGGER fixed_shift BEFORE UPDATE ON "Shift" FOR EACH ROW EXECUTE FUNCTION panel_fixed_parent('unitId');
CREATE TRIGGER fixed_reason BEFORE UPDATE ON "StopReason" FOR EACH ROW EXECUTE FUNCTION panel_fixed_parent('unitId');
