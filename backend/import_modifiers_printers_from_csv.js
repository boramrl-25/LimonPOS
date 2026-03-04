import fs from "fs";
import { v4 as uuid } from "uuid";
import { db } from "./db.js";

function parseCsvLine(line) {
  // Simple CSV splitter – current sheet has no quoted commas
  return line.split(",").map((c) => c.trim());
}

async function run() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Usage: node import_modifiers_printers_from_csv.js <path-to-csv>");
    process.exit(1);
  }

  if (!fs.existsSync(csvPath)) {
    console.error("CSV file not found:", csvPath);
    process.exit(1);
  }

  await db.read();

  db.data.products = db.data.products || [];
  db.data.categories = db.data.categories || [];
  db.data.printers = db.data.printers || [];
  db.data.modifier_groups = db.data.modifier_groups || [];

  const fileContent = fs.readFileSync(csvPath, "utf8");
  const lines = fileContent
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  if (lines.length <= 1) {
    console.error("CSV file seems empty or has no data rows.");
    process.exit(1);
  }

  const [headerLine, ...dataLines] = lines;
  const headerCols = parseCsvLine(headerLine);

  // Expect structure: [<product>, "Modifier", "printer", "printer", "printer", "printer", "category", ...]
  const productIdx = 0;
  const modifierIdx = headerCols.findIndex((h) => h.toLowerCase() === "modifier");
  const categoryIdx = headerCols.findIndex((h) => h.toLowerCase() === "category");

  const printerIdxs = [];
  headerCols.forEach((h, i) => {
    if (h.toLowerCase() === "printer") {
      printerIdxs.push(i);
    }
  });

  console.log("Header columns:", headerCols);
  console.log("Detected indices -> product:", productIdx, "modifier:", modifierIdx, "printers:", printerIdxs, "category:", categoryIdx);

  const ensureModifierGroupIds = (names) => {
    const ids = [];
    for (const rawName of names) {
      const name = (rawName || "").trim();
      if (!name) continue;
      const existing = db.data.modifier_groups.find(
        (m) => (m.name || "").trim().toLowerCase() === name.toLowerCase(),
      );
      if (existing) {
        ids.push(existing.id);
      } else {
        const id = `mg_${uuid().slice(0, 8)}`;
        const mg = {
          id,
          name,
          min_select: 0,
          max_select: 1,
          required: 0,
          options: "[]",
        };
        db.data.modifier_groups.push(mg);
        ids.push(id);
        console.log("Created modifier group:", name, "->", id);
      }
    }
    return ids;
  };

  const ensurePrinterIds = (names) => {
    const ids = [];
    for (const rawName of names) {
      const name = (rawName || "").trim();
      if (!name) continue;
      const existing = db.data.printers.find(
        (p) => (p.name || "").trim().toLowerCase() === name.toLowerCase(),
      );
      if (existing) {
        ids.push(existing.id);
      } else {
        const id = `pr_${uuid().slice(0, 8)}`;
        const pr = {
          id,
          name,
          printer_type: "kitchen",
          ip_address: "",
          port: 9100,
          connection_type: "network",
          status: "offline",
          is_backup: 0,
          kds_enabled: 1,
        };
        db.data.printers.push(pr);
        ids.push(id);
        console.log("Created printer:", name, "->", id);
      }
    }
    return ids;
  };

  let updatedCount = 0;
  let notFoundCount = 0;

  for (const line of dataLines) {
    const cols = parseCsvLine(line);
    const productName = (cols[productIdx] || "").trim();
    if (!productName) continue;

    const modifierName = modifierIdx >= 0 ? (cols[modifierIdx] || "").trim() : "";
    const printerNames = printerIdxs
      .map((idx) => (cols[idx] || "").trim())
      .filter((v) => v);
    const categoryName = categoryIdx >= 0 ? (cols[categoryIdx] || "").trim() : "";

    const matchedProducts = db.data.products.filter(
      (p) => (p.name || "").trim().toLowerCase() === productName.toLowerCase(),
    );

    if (!matchedProducts.length) {
      console.log("No product found for row name:", productName);
      notFoundCount += 1;
      continue;
    }

    const modifierIds = modifierName ? ensureModifierGroupIds([modifierName]) : [];
    const printerIds = printerNames.length ? ensurePrinterIds(printerNames) : [];

    let categoryId = null;
    if (categoryName) {
      const cat = db.data.categories.find(
        (c) => (c.name || "").trim().toLowerCase() === categoryName.toLowerCase(),
      );
      if (cat) {
        categoryId = cat.id;
      } else {
        console.log("Category not found for row:", productName, "category:", categoryName);
      }
    }

    for (const p of matchedProducts) {
      if (modifierIds.length) {
        const existing = JSON.parse(p.modifier_groups || "[]");
        const merged = Array.from(new Set([...existing, ...modifierIds]));
        p.modifier_groups = JSON.stringify(merged);
      }
      if (printerIds.length) {
        const existing = JSON.parse(p.printers || "[]");
        const merged = Array.from(new Set([...existing, ...printerIds]));
        p.printers = JSON.stringify(merged);
      }
      if (categoryId) {
        p.category_id = categoryId;
      }
      updatedCount += 1;
    }
  }

  await db.write();

  console.log("Done.");
  console.log("Products updated:", updatedCount);
  console.log("CSV rows without matching product:", notFoundCount);
}

run().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});

