import "reflect-metadata";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import { fileURLToPath } from "node:url";
export function smtpTransport() {
  if (process.env.MAIL_ENABLED !== "true") throw Error("mail_disabled");
  const host = process.env.SMTP_HOST,
    from = process.env.MAIL_FROM;
  if (!host || !from) throw Error("mail_configuration_required");
  const port = Number(process.env.SMTP_PORT || 587),
    secure = port === 465;
  if (![465, 587].includes(port) && process.env.NODE_ENV !== "test")
    throw Error("smtp_tls_required");
  return nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: process.env.NODE_ENV !== "test",
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 60000,
    ...(process.env.SMTP_USER
      ? {
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
          },
        }
      : {}),
  });
}
export async function deliverBatch(
  db: PrismaClient,
  send: (m: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }) => Promise<unknown>,
  limit = 50,
) {
  let sent = 0,
    failed = 0;
  const domains = (process.env.MAIL_ALLOWED_DOMAINS || "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim());
  for (let i = 0; i < limit; i++) {
    const rows = await db.$queryRaw<
      {
        id: string;
        recipientId: string;
        subject: string;
        text: string;
        attempts: number;
        claimedAt: Date;
      }[]
    >`
   UPDATE "MailOutbox" SET "status"='PROCESSING',"claimedAt"=NOW(),"attempts"="attempts"+1 WHERE "id" IN (
    SELECT "id" FROM "MailOutbox" WHERE ("status"='PENDING' AND "availableAt"<=NOW()) OR ("status"='PROCESSING' AND "claimedAt"<NOW()-INTERVAL '10 minutes') ORDER BY "availableAt" FOR UPDATE SKIP LOCKED LIMIT 1
   ) RETURNING *`;
    const row = rows[0];
    if (!row) break;
    try {
      const r = await db.reportRecipient.findUniqueOrThrow({
        where: { id: row.recipientId },
      });
      if (
        !r.enabled ||
        !domains.includes(r.address.split("@")[1].toLowerCase())
      )
        throw Object.assign(Error(), { code: "RECIPIENT_DISABLED" });
      await send({
        from: process.env.MAIL_FROM!,
        to: r.address,
        subject: row.subject,
        text: row.text,
      });
      await db.mailOutbox.updateMany({
        where: { id: row.id, status: "PROCESSING", claimedAt: row.claimedAt },
        data: { status: "SENT", sentAt: new Date(), lastError: null },
      });
      sent++;
    } catch (error) {
      const c = String((error as { code?: string }).code || "DELIVERY_ERROR");
      await db.mailOutbox.updateMany({
        where: { id: row.id, status: "PROCESSING", claimedAt: row.claimedAt },
        data: {
          status: row.attempts >= 5 ? "FAILED" : "PENDING",
          availableAt: new Date(
            Date.now() + Math.min(3600, 30 * 2 ** row.attempts) * 1000,
          ),
          lastError: /^[A-Z0-9_]{1,50}$/.test(c) ? c : "DELIVERY_ERROR",
        },
      });
      failed++;
    }
  }
  return { sent, failed };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = new PrismaClient();
  try {
    const transport = smtpTransport();
    console.log(
      JSON.stringify(await deliverBatch(db, (m) => transport.sendMail(m))),
    );
    transport.close();
  } finally {
    await db.$disconnect();
  }
}
