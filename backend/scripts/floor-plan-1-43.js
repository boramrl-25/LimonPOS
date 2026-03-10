/**
 * Floor plan: masaları 1-43 sırala, bu aralıkta olmayan masaları sil.
 * Kullanım: DATABASE_URL=... node backend/scripts/floor-plan-1-43.js
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL gerekli");
    process.exit(1);
  }

  // 1. floor_plan_sections: 1-43 sıralı, A:1-9, B:10-18, C:19-27, D:28-36, E:37-43
  const sections = {
    A: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    B: [10, 11, 12, 13, 14, 15, 16, 17, 18],
    C: [19, 20, 21, 22, 23, 24, 25, 26, 27],
    D: [28, 29, 30, 31, 32, 33, 34, 35, 36],
    E: [37, 38, 39, 40, 41, 42, 43],
  };

  const settings = await prisma.settings.findUnique({ where: { id: "default" } });
  if (!settings) {
    await prisma.settings.create({ data: { id: "default", floor_plan_sections: sections } });
  } else {
    await prisma.settings.update({
      where: { id: "default" },
      data: { floor_plan_sections: sections },
    });
  }
  console.log("floor_plan_sections güncellendi: 1-43 (A:1-9, B:10-18, C:19-27, D:28-36, E:37-43)");

  // 2. 1-43 dışındaki masaları sil (sadece siparişi olmayanlar - veri kaybı önlenir)
  const allTables = await prisma.table.findMany();
  const orderTableIds = new Set((await prisma.order.findMany({ select: { table_id: true } })).map((o) => o.table_id));
  const toDelete = allTables.filter((t) => (t.number < 1 || t.number > 43) && !orderTableIds.has(t.id));

  if (toDelete.length > 0) {
    for (const t of toDelete) {
      await prisma.table.delete({ where: { id: t.id } });
      console.log("  Silindi: masa", t.number, "(id:", t.id, ")");
    }
    console.log("Silinen masa sayısı:", toDelete.length);
  } else {
    const outOfRange = allTables.filter((t) => t.number < 1 || t.number > 43);
    if (outOfRange.length > 0) {
      console.log("1-43 dışında", outOfRange.length, "masa var ama siparişe bağlı olduğu için silinmedi.");
    } else {
      console.log("Silinecek masa yok.");
    }
  }

  // 3. 1-43 aralığında eksik masa varsa oluştur
  const existingNumbers = new Set((await prisma.table.findMany()).map((t) => t.number));
  let created = 0;
  for (let n = 1; n <= 43; n++) {
    if (existingNumbers.has(n)) continue;
    await prisma.table.create({
      data: {
        id: `table-${n}`,
        number: n,
        name: `Masa ${n}`,
        floor: "Main",
        capacity: 4,
      },
    });
    created++;
  }
  if (created > 0) console.log("Oluşturulan masa:", created);

  console.log("Tamamlandı.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
