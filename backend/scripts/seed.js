/**
 * LimonPOS - Başlangıç verileri (Prisma seed)
 * Temiz kurulumda admin, kategori, ürün, masa, ödeme yöntemleri oluşturur.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 LimonPOS seed başlatılıyor...");

  // 1. Admin kullanıcı
  await prisma.user.upsert({
    where: { id: "u1" },
    create: {
      id: "u1",
      name: "Admin",
      pin: "1234",
      role: "admin",
      active: 1,
      permissions: "[]",
      cash_drawer_permission: 1,
    },
    update: {},
  });
  console.log("  ✓ Admin (pin: 1234)");

  // 2. Settings
  await prisma.settings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      setup_complete: false,
      company_name: "LimonPOS",
      currency_code: "AED",
    },
    update: {},
  });
  console.log("  ✓ Settings");

  // 3. ZohoConfig
  await prisma.zohoConfig.upsert({
    where: { id: "default" },
    create: { id: "default", enabled: "false" },
    update: {},
  });
  console.log("  ✓ ZohoConfig");

  // 4. Ödeme yöntemleri
  const paymentMethods = [
    { id: "pm-cash", name: "Nakit", code: "cash", sort_order: 0 },
    { id: "pm-card", name: "Kredi Kartı", code: "card", sort_order: 1 },
  ];
  for (const pm of paymentMethods) {
    await prisma.paymentMethod.upsert({
      where: { id: pm.id },
      create: { ...pm, active: 1 },
      update: {},
    });
  }
  console.log("  ✓ Ödeme yöntemleri:", paymentMethods.length);

  // 5. Kategori
  await prisma.category.upsert({
    where: { id: "cat-1" },
    create: {
      id: "cat-1",
      name: "İçecekler",
      color: "#84CC16",
      sort_order: 0,
      active: 1,
      modifier_groups: "[]",
      printers: "[]",
      show_till: 0,
    },
    update: {},
  });
  console.log("  ✓ Kategori: İçecekler");

  // 6. Ürünler
  const products = [
    { id: "prod-1", name: "Çay", category_id: "cat-1", price: 5 },
    { id: "prod-2", name: "Kahve", category_id: "cat-1", price: 15 },
    { id: "prod-3", name: "Su", category_id: "cat-1", price: 3 },
  ];
  for (const p of products) {
    await prisma.product.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        name: p.name,
        category_id: p.category_id,
        price: p.price,
        printers: "[]",
        modifier_groups: "[]",
        active: 1,
        pos_enabled: 1,
        sellable: true,
      },
      update: {},
    });
  }
  console.log("  ✓ Ürünler:", products.length);

  // 7. Masalar (1-10)
  for (let i = 1; i <= 10; i++) {
    await prisma.table.upsert({
      where: { id: `table-${i}` },
      create: {
        id: `table-${i}`,
        number: i,
        name: `Masa ${i}`,
        floor: "Ana Salon",
        status: "free",
        capacity: 4,
      },
      update: {},
    });
  }
  console.log("  ✓ Masalar: 10 adet");

  console.log("\n✅ Seed tamamlandı!");
}

main()
  .catch((e) => {
    console.error("Seed hatası:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
