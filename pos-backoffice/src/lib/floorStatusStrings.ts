/**
 * Centralized English strings and helpers for web floor (table card / floor modal).
 * Item-based status: On Hold, In Kitchen, In Kitchen (delayed), delivered to table.
 */

// Legend text in floor modal
export const FLOOR_LEGEND =
  "In Kitchen = sent to kitchen; Delivered = waiter delivered to table";

// Status labels
export const STATUS_ON_HOLD = "On Hold";
export const DELAYED_ITEMS_TITLE = "Delayed items";
export const DELAY_LABEL_PAST_DUE = "past due";
export const TO_TABLE_SUFFIX = "to table";
export const DELAYED_SUFFIX = "(delayed)";
export const TOAST_TABLE_DELAYED = (tableNumber: string | number) =>
  `Table ${tableNumber} has delayed items`;

/** "Just now" | "1 min ago" | "X min ago" */
export function minsAgoEn(ts: number | null): string {
  if (ts == null) return "";
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "Just now";
  if (mins === 1) return "1 min ago";
  return `${mins} min ago`;
}

export type ItemStatusKind = "on_hold" | "in_kitchen" | "in_kitchen_delayed" | "delivered";

export function getItemStatusKind(
  item: { sent_at: number | null; delivered_at?: number | null; overdue_undelivered_minutes?: number | null },
  defaultOverdueMinutes: number
): ItemStatusKind {
  if (item.delivered_at != null && item.delivered_at !== undefined) return "delivered";
  if (item.sent_at == null) return "on_hold";
  const overdueMins = item.overdue_undelivered_minutes ?? defaultOverdueMinutes;
  const thresholdMs = overdueMins * 60 * 1000;
  const delayed = Date.now() - item.sent_at > thresholdMs;
  return delayed ? "in_kitchen_delayed" : "in_kitchen";
}

/** English status text for right side of item row */
export function getItemStatusText(
  item: { sent_at: number | null; delivered_at?: number | null; overdue_undelivered_minutes?: number | null },
  defaultOverdueMinutes: number
): string {
  if (item.delivered_at != null && item.delivered_at !== undefined) {
    const ago = minsAgoEn(item.delivered_at);
    return ago ? `${ago} ${TO_TABLE_SUFFIX}` : `Just now ${TO_TABLE_SUFFIX}`;
  }
  if (item.sent_at == null) return STATUS_ON_HOLD;
  const sentAgo = minsAgoEn(item.sent_at);
  const kind = getItemStatusKind(item, defaultOverdueMinutes);
  if (kind === "in_kitchen_delayed") return `In Kitchen ${sentAgo} ${DELAYED_SUFFIX}`;
  return `In Kitchen ${sentAgo}`;
}

/**
 * Delay minutes for delayed item: floor((now - (sentAt + overdueMinutes*60*1000)) / 60000).
 * Returns null if not delayed (delivered or not yet overdue).
 */
export function getDelayMinutes(
  item: { sent_at: number | null; delivered_at?: number | null; overdue_undelivered_minutes?: number | null },
  defaultOverdueMinutes: number
): number | null {
  if (item.delivered_at != null && item.delivered_at !== undefined) return null;
  if (item.sent_at == null) return null;
  const overdueMins = item.overdue_undelivered_minutes ?? defaultOverdueMinutes;
  const dueTime = item.sent_at + overdueMins * 60 * 1000;
  if (Date.now() < dueTime) return null;
  return Math.floor((Date.now() - dueTime) / 60000);
}

/** "X min delayed" or "past due" for delayed item list line */
export function getDelayLabel(
  item: { sent_at: number | null; delivered_at?: number | null; overdue_undelivered_minutes?: number | null },
  defaultOverdueMinutes: number
): string {
  const delayMins = getDelayMinutes(item, defaultOverdueMinutes);
  if (delayMins == null) return "";
  if (delayMins <= 0) return DELAY_LABEL_PAST_DUE;
  return `${delayMins} min delayed`;
}

export function isItemDelayed(
  item: { sent_at: number | null; delivered_at?: number | null; overdue_undelivered_minutes?: number | null },
  defaultOverdueMinutes: number
): boolean {
  return getDelayMinutes(item, defaultOverdueMinutes) !== null;
}
