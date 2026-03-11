#!/usr/bin/env node
/**
 * ZohoConfig tablosuna organizasyon, müşteri ve bölge ayarlarını ekle/güncelle.
 * Sunucuda: docker exec limonpos-backend node scripts/set-zoho-config.js
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.zohoConfig.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      organization_id: "20111054613",
      customer_id: "864689000000385153",
      enabled: "true",
      dc: "eu",
    },
    update: {
      organization_id: "20111054613",
      customer_id: "864689000000385153",
      enabled: "true",
      dc: "eu",
    },
  });
  console.log("ZohoConfig güncellendi: org=20111054613, customer=864689000000385153, enabled=true, dc=eu");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
