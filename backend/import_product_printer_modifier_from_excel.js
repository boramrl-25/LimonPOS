/**
 * Reads MODIFER.xlsx and PRODUCT PRINTER AND MODIFER.xlsx, then:
 * 1. Creates/updates modifier groups (with options, min/max) from MODIFER.xlsx
 * 2. Updates products: printers, modifier_groups, category from PRODUCT PRINTER AND MODIFER.xlsx
 *
 * Usage: node import_product_printer_modifier_from_excel.js <path-to-MODIFER.xlsx> <path-to-PRODUCT-PRINTER-AND-MODIFER.xlsx>
 */

import XLSX from "xlsx";
import fs from "fs";
import { v4 as uuid } from "uuid";
import { db } from "./db.js";

function readSheet(path, sheetIndex = 0) {
  const wb = XLSX.readFile(path);
  const name = wb.SheetNames[sheetIndex];
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" });
}

function trim(s) {
  return typeof s === "string" ? s.trim() : "";
}

async function run() {
  const modifierPath = process.argv[2];
  const productPath = process.argv[3];
  if (!modifierPath || !productPath) {
    console.error("Usage: node import_product_printer_modifier_from_excel.js <MODIFER.xlsx> <PRODUCT PRINTER AND MODIFER.xlsx>");
    process.exit(1);
  }
  if (!fs.existsSync(modifierPath)) {
    console.error("File not found:", modifierPath);
    process.exit(1);
  }
  if (!fs.existsSync(productPath)) {
    console.error("File not found:", productPath);
    process.exit(1);
  }

  await db.read();
  db.data.products = db.data.products || [];
  db.data.categories = db.data.categories || [];
  db.data.printers = db.data.printers || [];
  db.data.modifier_groups = db.data.modifier_groups || [];

  // ----- 1. Parse MODIFER.xlsx -> modifier groups with options -----
  const modifierRows = readSheet(modifierPath);
  const groups = [];
  let current = null;

  for (let i = 0; i < modifierRows.length; i++) {
    const row = modifierRows[i];
    const c0 = trim(row[0]);
    const c1 = trim(row[1]);
    const c2 = row[2];
    const c3 = row[3];
    const c4 = row[4];
    const num3 = typeof c3 === "number" ? c3 : parseInt(c3, 10);
    const num4 = typeof c4 === "number" ? c4 : parseInt(c4, 10);

    if (c0 === "MIN" && c1 === "" && row[3] === "MIN" && row[4] === "MAX") {
      continue;
    }
    if (c0.toUpperCase().startsWith("OPTION") && c1) {
      if (current) {
        const price = typeof c2 === "number" ? c2 : parseFloat(c2) || 0;
        current.options.push({ name: c1, price });
      }
      continue;
    }
    if (!c1) continue;

    if (!isNaN(num3) && !isNaN(num4) && num3 >= 0 && num4 >= 0) {
      current = { name: c1, min_select: num3, max_select: num4, options: [] };
      groups.push(current);
      continue;
    }
    if (c1 === "MIN" || c1 === "MAX") continue;

    const priceVal = typeof c2 === "number" ? c2 : parseFloat(c2);
    if (current && current.options.length === 0 && !isNaN(priceVal) && priceVal > 0) {
      current.options.push({ name: "Extra", price: priceVal });
      current = null;
      continue;
    }

    current = { name: c1, min_select: 0, max_select: 1, options: [] };
    groups.push(current);
  }

  const nameToModifierId = {};
  for (const g of groups) {
    if (!g.name) continue;
    const existing = db.data.modifier_groups.find(
      (m) => trim(m.name).toLowerCase() === g.name.toLowerCase()
    );
    const opts = (g.options || []).map((o, i) => ({
      id: `mo_${uuid().slice(0, 6)}_${i}`,
      name: o.name || "Option",
      price: Number(o.price) || 0,
    }));
    if (existing) {
      existing.min_select = g.min_select ?? 0;
      existing.max_select = g.max_select ?? 1;
      existing.options = JSON.stringify(opts);
      nameToModifierId[g.name.toLowerCase()] = existing.id;
    } else {
      const id = `mg_${uuid().slice(0, 8)}`;
      db.data.modifier_groups.push({
        id,
        name: g.name,
        min_select: g.min_select ?? 0,
        max_select: g.max_select ?? 1,
        required: 0,
        options: JSON.stringify(opts),
      });
      nameToModifierId[g.name.toLowerCase()] = id;
    }
  }
  console.log("Modifier groups processed:", Object.keys(nameToModifierId).length);

  // ----- 2. Ensure printers by name -----
  const ensurePrinterIds = (names) => {
    const ids = [];
    for (const raw of names) {
      const name = trim(raw);
      if (!name) continue;
      let existing = db.data.printers.find(
        (p) => trim(p.name).toLowerCase() === name.toLowerCase()
      );
      if (!existing) {
        const id = `pr_${uuid().slice(0, 8)}`;
        existing = {
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
        db.data.printers.push(existing);
      }
      ids.push(existing.id);
    }
    return ids;
  };

  // ----- 3. Parse PRODUCT PRINTER AND MODIFER.xlsx -----
  const productRows = readSheet(productPath);
  if (productRows.length < 2) {
    console.log("No data rows in product file.");
    await db.write();
    return;
  }

  const header = productRows[0];
  const productCol = 0;
  const modifier1Col = 1;
  const modifier2Col = 2;
  const printerColStart = 3;
  const printerColEnd = 6;
  const categoryCol = 7;

  let updated = 0;
  let skipped = 0;

  for (let i = 1; i < productRows.length; i++) {
    const row = productRows[i];
    const productName = trim(row[productCol]);
    if (!productName) continue;

    const mod1 = trim(row[modifier1Col]);
    const mod2 = trim(row[modifier2Col]);
    const printerNames = [];
    for (let c = printerColStart; c <= printerColEnd; c++) {
      const p = trim(row[c]);
      if (p) printerNames.push(p);
    }
    const categoryName = trim(row[categoryCol]);

    const modifierIds = [];
    if (mod1 && nameToModifierId[mod1.toLowerCase()])
      modifierIds.push(nameToModifierId[mod1.toLowerCase()]);
    if (mod2 && nameToModifierId[mod2.toLowerCase()])
      modifierIds.push(nameToModifierId[mod2.toLowerCase()]);
    const printerIds = ensurePrinterIds(printerNames);

    let categoryId = null;
    if (categoryName) {
      const cat = db.data.categories.find(
        (c) => trim(c.name).toLowerCase() === categoryName.toLowerCase()
      );
      if (cat) categoryId = cat.id;
    }

    const products = db.data.products.filter(
      (p) => trim(p.name).toLowerCase() === productName.toLowerCase()
    );
    if (products.length === 0) {
      skipped++;
      continue;
    }

    for (const p of products) {
      const existingMod = JSON.parse(p.modifier_groups || "[]");
      const mergedMod = [...new Set([...existingMod, ...modifierIds])];
      const existingPr = JSON.parse(p.printers || "[]");
      const mergedPr = [...new Set([...existingPr, ...printerIds])];
      p.modifier_groups = JSON.stringify(mergedMod);
      p.printers = JSON.stringify(mergedPr);
      if (categoryId) p.category_id = categoryId;
      updated++;
    }
  }

  await db.write();
  console.log("Products updated:", updated);
  console.log("Product rows skipped (no match):", skipped);
  console.log("Done.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
