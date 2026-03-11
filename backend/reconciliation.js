/**
 * Reconciliation: Auto-fetch emails (UTAP, Bank), parse CSV attachments, store for Cash & Card matching.
 * User sets up auto-forward: UTAP/Bank emails → reconciliation inbox. We poll via IMAP.
 * Uses Prisma (PostgreSQL) via store - no LowDB/data.json.
 */
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import * as store from "./lib/store.js";

/** Parse CSV buffer, return rows. Flexible: date, amount, description, type. */
function parseCSV(buffer) {
  const text = buffer.toString("utf-8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0].split(/[,;\t]/).map((h) => h.trim().toLowerCase());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(/[,;\t]/).map((v) => v.trim());
    const row = {};
    header.forEach((h, idx) => {
      row[h] = vals[idx] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

/** Try to parse date from string. Returns YYYY-MM-DD or null. */
function parseDateStr(s) {
  if (!s || typeof s !== "string") return null;
  const trimmed = s.trim();
  // YYYY-MM-DD
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
  m = /^(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{4})/.exec(trimmed);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  // MM/DD/YYYY
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(trimmed);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

/** Parse amount from string. Supports 1,234.56 or 1234,56 or 1234.56 */
function parseAmount(s) {
  if (s == null || s === "") return NaN;
  const str = String(s).replace(/\s/g, "").replace(/,/g, ".");
  const n = parseFloat(str);
  return isNaN(n) ? NaN : n;
}

/** Detect source from email: utap | bank. */
function detectSource(from, subject, to) {
  const combined = `${(from || "").toLowerCase()} ${(subject || "").toLowerCase()} ${(to || "").toLowerCase()}`;
  if (/utap|transaction|kart|card/.test(combined)) return "utap";
  if (/bank|deposit|yatırım|hesap|banka|emirates\s*nbd/.test(combined)) return "bank";
  return "unknown";
}

/** Parse Emirates NBD email body: card credited + cash deposit. */
function parseBankEmailBody(text) {
  const results = [];
  const body = (text || "").replace(/\s+/g, " ");

  const cardMatch = body.match(/AED\s*([\d,]+(?:\.\d{2})?)\s+has\s+been\s+credited\s+to\s+your\s+account\s+no\.?\s*(\d[\d\sXx*]+)/i);
  if (cardMatch) {
    const amount = parseAmount(cardMatch[1]);
    const account = (cardMatch[2] || "").replace(/\s/g, "");
    if (!isNaN(amount)) {
      const today = new Date().toISOString().slice(0, 10);
      results.push({ date: today, amount, account, source: "bank_email_card", description: "Card credited" });
    }
  }

  const cashProcessed = body.match(/cash\s+deposit\s+has\s+been\s+successfully\s+processed\s+on\s+(\d{2}[.\/\-]\d{2}[.\/\-]\d{4})/i);
  const cashAmount = body.match(/Amount:\s*AED\s*([\d,]+)/i);
  const cashAccount = body.match(/Deposited\s+to:\s*(\d[\d\sXx*]+)/i);
  if (cashProcessed && cashAmount) {
    const dateStr = cashProcessed[1] ? parseDateStr(cashProcessed[1].replace(/-/g, ".").replace(/\//g, ".")) : new Date().toISOString().slice(0, 10);
    const amount = parseAmount(cashAmount[1]);
    const account = cashAccount ? (cashAccount[1] || "").replace(/\s/g, "") : "";
    if (!isNaN(amount) && dateStr) {
      results.push({ date: dateStr, amount, account, source: "bank_email_cash", description: "Cash deposit" });
    }
  }

  return results;
}

/** Check if account matches configured. User can use * as wildcard. */
function accountMatches(configured, actual) {
  if (!configured || !actual) return true;
  const cfg = String(configured).trim().replace(/\s/g, "");
  const act = String(actual).replace(/\s/g, "");
  if (!cfg) return true;
  const pattern = cfg.replace(/\*/g, ".*").replace(/X/gi, ".");
  const re = new RegExp(`^${pattern}$`, "i");
  return re.test(act);
}

/** Extract transactions from CSV rows. UTAP format: TARIH column (TOTAL at top, skip), TxnAmt for amount. */
function extractFromCSV(rows, source) {
  const results = [];
  const dateKeys = ["date", "tarih", "transaction_date", "settlement_date", "txndate"];
  const amountKeys = ["amount", "tutar", "txnamt", "total", "toplam", "amount_usd", "amount_aed", "odeme_tutari"];
  const descKeys = ["description", "açıklama", "type", "tip", "odeme_tipi"];

  for (const row of rows) {
    let dateStr = null;
    let skipRow = false;
    for (const k of dateKeys) {
      const v = row[k];
      if (v && String(v).toLowerCase() === "total") {
        skipRow = true;
        break;
      }
      if (v) {
        dateStr = parseDateStr(v);
        if (dateStr) break;
      }
    }
    if (skipRow || !dateStr) continue;

    let amount = NaN;
    let deduction = NaN;
    let netAmount = NaN;
    for (const k of amountKeys) {
      const v = row[k];
      if (v === undefined || v === "" || String(v).toLowerCase() === "total") continue;
      amount = parseAmount(v);
      if (!isNaN(amount)) break;
    }
    const deductionKeys = ["deduction", "kesinti", "fee", "komisyon"];
    const netKeys = ["netamt", "net_amount", "net", "net_tutar"];
    for (const k of deductionKeys) {
      const v = row[k];
      if (v !== undefined && v !== "") {
        deduction = parseAmount(v);
        if (!isNaN(deduction)) break;
      }
    }
    for (const k of netKeys) {
      const v = row[k];
      if (v !== undefined && v !== "") {
        netAmount = parseAmount(v);
        if (!isNaN(netAmount)) break;
      }
    }
    if (isNaN(amount) && !isNaN(netAmount) && !isNaN(deduction)) {
      amount = netAmount + deduction;
    }
    if (isNaN(amount)) continue;

    let desc = "";
    for (const k of descKeys) {
      if (row[k]) {
        desc = String(row[k]);
        break;
      }
    }
    results.push({ date: dateStr, amount, deduction: isNaN(deduction) ? null : deduction, netAmount: isNaN(netAmount) ? null : netAmount, description: desc, source });
  }
  return results;
}

/** Aggregate imports by date: { "2025-03-09": { cash: Y, card: Z } }. Exported for server. */
export function aggregateReconciliationByDate(imports) {
  const byDate = {};
  for (const imp of imports || []) {
    const d = imp.date;
    if (!byDate[d]) byDate[d] = { cash: 0, card: 0 };
    if (imp.source === "utap") byDate[d].card += imp.amount;
    else if (imp.source === "bank" || imp.source === "bank_email_card") {
      if (imp.amount > 0) byDate[d].card += imp.amount;
    } else if (imp.source === "bank_email_cash") {
      if (imp.amount > 0) byDate[d].cash += imp.amount;
    } else if (imp.source === "bank") {
      if (imp.amount > 0) {
        if (imp.description && /cash|nakit|kasa/i.test(imp.description)) byDate[d].cash += imp.amount;
        else byDate[d].card += imp.amount;
      }
    }
  }
  return byDate;
}

/** Fetch emails from IMAP inbox, parse attachments, store. */
export async function fetchReconciliationEmails() {
  const config = await store.getReconciliationInboxConfig();
  if (!config || !config.host || !config.user) {
    return { ok: false, error: "Reconciliation inbox not configured" };
  }

  const client = new ImapFlow({
    host: config.host,
    port: config.port || 993,
    secure: config.secure !== false,
    auth: {
      user: config.user,
      pass: config.password,
    },
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const existingImports = await store.getReconciliationImports();
      const processedIds = new Set((existingImports || []).map((i) => i.message_id).filter(Boolean));
      const newImports = [];
      const warningsToAdd = [];
      const toMarkSeen = [];

      for await (const msg of client.fetch({ seen: false }, { source: true })) {
        const parsed = await simpleParser(msg.source);
        const from = parsed.from?.text || "";
        const subject = parsed.subject || "";
        const to = parsed.to?.text || "";
        const messageId = parsed.messageId || msg.uid;

        let source = detectSource(from, subject, to);
        if (source === "unknown" && /emirates\s*nbd|nbd\.com/i.test(from + subject)) source = "bank";
        if (source === "unknown") {
          toMarkSeen.push(msg.uid);
          continue;
        }
        if (processedIds.has(messageId)) {
          toMarkSeen.push(msg.uid);
          continue;
        }

        const bodyText = (parsed.text || "") + " " + (parsed.html || "").replace(/<[^>]+>/g, " ");
        const bankBodyResults = source === "bank" ? parseBankEmailBody(bodyText) : [];
        const accounts = (await store.getReconciliationBankAccounts()) || {};
        for (const e of bankBodyResults) {
          const accountMatch = e.source === "bank_email_card"
            ? accountMatches(accounts.card_account, e.account)
            : accountMatches(accounts.cash_account, e.account);
          const warning = !accountMatch ? { type: "account_mismatch", expected: e.source === "bank_email_card" ? accounts.card_account : accounts.cash_account, actual: e.account, amount: e.amount, date: e.date } : null;
            newImports.push({
            id: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            message_id: messageId,
            date: e.date,
            amount: e.amount,
            deduction: null,
            net_amount: null,
            description: e.description,
            source: e.source,
            account: e.account,
            account_mismatch: !accountMatch,
            email_from: from,
            email_subject: subject,
            created_at: Date.now(),
          });
          if (warning) {
            warningsToAdd.push(warning);
          }
        }

        const attachments = parsed.attachments || [];
        for (const att of attachments) {
          const name = (att.filename || "").toLowerCase();
          if (!name.endsWith(".csv") && !name.endsWith(".txt")) continue;

          const buf = att.content;
          const rows = parseCSV(buf);
          const extracted = extractFromCSV(rows, source);

          for (const e of extracted) {
            newImports.push({
              id: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
              message_id: messageId,
              date: e.date,
              amount: e.amount,
              deduction: e.deduction ?? null,
              net_amount: e.netAmount ?? null,
              description: e.description,
              source,
              email_from: from,
              email_subject: subject,
              created_at: Date.now(),
            });
          }
        }
        toMarkSeen.push(msg.uid);
      }

      for (const uid of toMarkSeen) {
        try {
          await client.messageFlagsAdd({ uid }, ["\\Seen"]);
        } catch (_) {}
      }

      if (newImports.length > 0) {
        await store.appendReconciliationImportsAndWarnings(newImports, warningsToAdd);
      }

      return { ok: true, imported: newImports.length };
    } finally {
      lock.release();
    }
  } catch (e) {
    console.error("[reconciliation] IMAP error:", e?.message);
    return { ok: false, error: e?.message || "IMAP connection failed" };
  } finally {
    try {
      await client.logout();
    } catch (_) {}
  }
}

