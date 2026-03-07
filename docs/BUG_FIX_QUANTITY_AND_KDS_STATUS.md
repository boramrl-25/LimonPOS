# Bug Fix: Quantity Explosion & KDS Ready Items Reappearing

## BUG 1 — POS Quantity Explosion

### Root Cause
1. **API duplicate lines**: `ensureOrderExistsOnApi` used `orderItemLineKey(productName, quantity, price, notes)` — key **included quantity**. So "1x Coffee" and "2x Coffee" were different keys. API could accumulate duplicate lines (e.g. 4x "1x Coffee") from retries/sync races.
2. **No consolidation**: When API had more lines than local for the same product, we never deleted or merged excess lines. We only deleted when `key !in localKeys` (line not present at all).
3. **Merge summed duplicates**: `syncOrdersFromApi` / `refreshOrderFromApi` merged API lines by `(productId, productName, price, notes, status, sentAt)`. Duplicate "1x Coffee" lines (identical) summed to quantity 4 → cart showed x4.

### Fix Applied

**File: `ApiSyncRepository.kt`**

1. **New line key without quantity**  
   `orderItemLineKeyNoQty(productId, productName, price, notes)` — used for quantity-based matching.

2. **ensureOrderExistsOnApi rewrite**:
   - Match by `productId|productName|price|notes` (no quantity).
   - Compare **total quantities** per line: `localTotalQty` vs `apiTotalQty`.
   - If `apiTotalQty > localTotalQty`: consolidate — update one API item to `quantity = localTotalQty`, delete the rest, update local `apiId` to the kept item.
   - If `apiTotalQty < localTotalQty`: add one line with `quantity = localTotalQty - apiTotalQty`.
   - **Removed `sendOrderToKitchen`** — only called via explicit `ensureOrderAndSendToKitchen` (user action).

3. **Sync merge**:
   - Merge by `(productId, productName, price, notes)` only.
   - For status: use **max** (delivered > ready > preparing > sent > pending).
   - Enables correct resolution when API has duplicates with mixed status.

### Why Duplicates No Longer Inflate Quantity

- `ensureOrderExistsOnApi` runs in `pushOpenOrdersAndTables` **before** `syncOrdersFromApi`.
- Excess API lines are merged and cleaned before pull.
- Sync pull receives a single correct line per product.
- Quantity-based matching ensures local and API totals stay aligned.

---

## BUG 2 — KDS Ready Items Reappearing

### Root Cause
1. KDS marked items as "ready" → `pushOrderItemStatusUpdates` pushed to API.
2. `syncOrdersFromApi` / `refreshOrderFromApi` pulled orders from API.
3. API sometimes returned older status (e.g. "sent" or "preparing") due to timing or caching.
4. Sync overwrote local with API status → ready items reverted to sent/preparing.

### Fix Applied

**File: `ApiSyncRepository.kt`**

1. **Status conflict resolution** (`resolveStatusForSync`):
   - Hierarchy: `delivered > ready > preparing > sent > pending`.
   - Local-first: if local status rank ≥ API rank, keep local.
   - If API rank > local rank, use API status.
   - Never regress: delivered/ready/preparing/sent are never replaced by a lower status.

2. **Sync merge status**:
   - When merging duplicate API lines, take the **highest** status in the group (e.g. one ready, one sent → keep ready).

3. **Local lookup for merged lines**:
   - Added `localByLineKey` so when API items are merged, we still match local by `productId|productName|price|notes`.
   - Local higher status is preserved even when API item id changes due to merge.

### Why Ready Items No Longer Reappear

- Sync compares local and API status via `resolveStatusForSync`.
- Higher status always wins.
- Local "ready" is never overwritten by API "sent".
- Merge uses max status when combining duplicate lines.

---

## Status Conflict Resolution Rule

```
delivered (5) > ready (4) > preparing (3) > sent (2) > pending (1)
```

- If local rank ≥ API rank → keep local (status + deliveredAt).
- If API rank > local rank → use API (when API has newer state).
- `sentAt` remains immutable; local `sentAt` is preferred when available.

---

## Files Changed

| File | Changes |
|------|---------|
| `ApiSyncRepository.kt` | `orderItemLineKeyNoQty`, `resolveStatusForSync`, `ensureOrderExistsOnApi` rewrite, `syncOrdersFromApi` merge + status resolution, `refreshOrderFromApi` merge + status resolution, removed `sendOrderToKitchen` from sync |

---

## Test Scenarios

### 1. Single item added once
- Add 1x product to cart.
- Cart shows x1 only.
- Run sync multiple times.
- Quantity remains x1.

### 2. Sync after send
- Add product, send to kitchen.
- Run sync several times.
- Quantity does not increase.

### 3. KDS ready persistence
- Mark item as ready on KDS.
- Run sync (or wait for periodic sync).
- Item stays ready.
- Does not revert to sent/preparing.

### 4. Add product to same table later
- Order has item A.
- Add item B to same table.
- Only B appears as new.
- Existing items (including A) do not change in quantity.
