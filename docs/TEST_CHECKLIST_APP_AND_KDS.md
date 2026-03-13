# LimonPOS Test Checklist – App & KDS

Use this checklist to verify all scenarios. Print in English. Mark `[x]` when OK, add notes in the right column.

---

## 1. LOGIN & AUTH

| [ ] OK | Scenario | Notes |
|:---:|---|------|
| | PIN login – valid user | |
| | PIN login – invalid PIN | |
| | 1234 maintenance – Server Settings access | |
| | User without App Settings – no Settings in 3-dot menu | |
| | User with App Settings – Settings visible | |
| | End of shift – PIN dialog and logout | |

---

## 2. FLOOR PLAN

| [ ] OK | Scenario | Notes |
|:---:|---|------|
| | Floor Plan loads – tables visible | |
| | Tap free table – Open Table dialog | |
| | Open table – guest count, confirm | |
| | Reserve table – guest name, phone, from/to time | |
| | Tap occupied table – Order screen | |
| | Tap reserved table – reservation info dialog | |
| | Close table – confirm, items discarded | |
| | Transfer table – select source & target | |
| | Table search – filter by number/name | |
| | Floor / section filters (Main, A, B…) | |
| | 3-dot menu – Settings (if permitted) | |
| | 3-dot menu – Sync Data | |
| | 3-dot menu – Daily Transaction | |
| | 3-dot menu – Void Approvals (if permitted) | |
| | 3-dot menu – End of shift | |
| | Cash drawer (currency) – PIN required | |
| | Logout (lock icon) | |

---

## 3. ORDER SCREEN

| [ ] OK | Scenario | Notes |
|:---:|---|------|
| | Products list loads | |
| | Search products | |
| | Category filter (All, Categories) | |
| | Add product – no modifiers | |
| | Add product – with modifiers dialog | |
| | Add product – with notes dialog | |
| | Cart icon – empty = green, has items = red | |
| | Tap cart – Cart bottom sheet opens | |
| | Edit item note/quantity | |
| | Remove item (new/pending only) | |
| | Add More – closes cart | |
| | Transfer table button | |
| | Sync (refresh) button | |
| | Logout button | |
| | Home (Floor Plan) button | |

---

## 4. SALES – CART & SEND TO KITCHEN

| [ ] OK | Scenario | Notes |
|:---:|---|------|
| | Cart – item list (New items / Sent to kitchen) | |
| | Send to Kitchen – pending items sent | |
| | Send to Kitchen – printer warning (if any) | |
| | Send to Kitchen – kitchen print | |
| | Send to Kitchen – logout flow (if configured) | |
| | Remove item – **new items only** (not sent to kitchen) | |
| | Void item – **sent items** (PIN or approval request) | |
| | Void with PIN – admin/manager PIN, immediate void | |
| | Void with approval request – supervisor approves (app or web) | |
| | Refund single item (recalled order) | |
| | Refund full bill (recalled order) | |
| | Mark item Delivered (✓ Delivered button) | |
| | Total display correct | |

---

## 5. DISCOUNT

| [ ] OK | Scenario | Notes |
|:---:|---|------|
| | Send discount request – % or amount, notes | |
| | Discount request pending – message shown | |
| | Sync after approval – total updates | |
| | Web: Approve discount – Dashboard → Discount Requests | |
| | Web: Cancel discount request | |
| | 100% discount – check closes at 0 | |

---

## 6. TRANSFER TABLE (ORDER TO ANOTHER TABLE)

| [ ] OK | Scenario | Notes |
|:---:|---|------|
| | Transfer icon – from Order screen | |
| | Select source table (current) | |
| | Select target table – must be free | |
| | Order moves to target table | |
| | Source table becomes free | |

---

## 7. PAYMENT

| [ ] OK | Scenario | Notes |
|:---:|---|------|
| | Payment screen loads – order summary | |
| | Payment mode – CASH | |
| | Payment mode – CARD | |
| | Payment mode – SPLIT | |
| | Split – Cash amount, Pay | |
| | Split – Bal button, remaining amount, Pay | |
| | Print Bill button | |
| | Complete Payment | |
| | Payment complete → logout (if configured) | |
| | Fix Overpayment (remove excess) | |

---

## 8. CLOSED BILLS & RECALL (INTERVENTION ON PAID ORDERS)

| [ ] OK | Scenario | Notes |
|:---:|---|------|
| | Closed Bills – list of closed orders | |
| | Access with PIN – user with closed_bill_access | |
| | Request access – user without permission | |
| | Approve access – manager/supervisor (app or web) | |
| | Recall order to table – payments reversed, order editable | |
| | Refund single item (from Closed Bills) | |
| | Refund full bill (from Closed Bills) | |
| | Change payment method on recalled order | |

---

## 9. RECALLED ORDER (AFTER RECALL TO TABLE)

| [ ] OK | Scenario | Notes |
|:---:|---|------|
| | Recalled banner visible | |
| | Clear previous payments (change payment method) | |
| | Refund single item | |
| | Refund full bill | |
| | Add new items to recalled order | |
| | Payment – complete with new total | |

---

## 10. VOID APPROVALS (SUPERVISOR APPROVAL)

| [ ] OK | Scenario | Notes |
|:---:|---|------|
| | Void Approvals – 3-dot menu (if permitted) | |
| | Request void from app – appears in list | |
| | Approve void – from app (supervisor) | |
| | Reject void – from app | |
| | Web: Approvals page – approve/reject void requests | |
| | After approval – sync app, item voided | |

---

## 11. SETTINGS & NAVIGATION

| [ ] OK | Scenario | Notes |
|:---:|---|------|
| | Settings – access (if permitted) | |
| | Settings – printers | |
| | Settings – server URL | |
| | Settings – back to Floor Plan | |
| | Closed Bills | |
| | Void Approvals (if permitted) | |
| | Daily Cash Entry | |
| | KDS access (if permitted) | |

---

## 12. KDS (KITCHEN DISPLAY)

| [ ] OK | Scenario | Notes |
|:---:|---|------|
| | KDS screen loads | |
| | Items sent from App – appear in KDS | |
| | Printer filter – All / specific printer(s) | |
| | Start – item goes to preparing | |
| | Ready – item shows "Ready for service" | |
| | Delivered – item removed from KDS | |
| | Order Ready – all items ready | |
| | New order sound | |
| | Refresh button | |
| | Settings / Reports tab | |

---

## 13. PRINT FLOWS

| [ ] OK | Scenario | Notes |
|:---:|---|------|
| | Kitchen print – Send to Kitchen | |
| | Receipt print – Print Bill | |
| | Receipt print – after payment | |
| | Printer offline – warning/retry | |

---

## 14. USERS (WEB PANEL – pos.the-limon.com)

| [ ] OK | Scenario | Notes |
|:---:|---|------|
| | Users page – list loads | |
| | Add user – name, PIN, role | |
| | Add user – Can access App Settings (POS app) | |
| | Add user – Can access Web Settings | |
| | Edit user – change name, PIN | |
| | Edit user – toggle App Settings permission | |
| | Edit user – toggle Web Settings permission | |
| | Disable user – user can no longer login to App | |
| | Delete user – confirm and remove | |
| | User without App Settings – POS app: no Settings in 3-dot | |
| | User with App Settings – POS app: Settings visible | |
| | User without Web Settings – web: cannot open Settings | |
| | User with Web Settings – web: Settings accessible | |

---

## 15. WEB PANEL – DISCOUNT & APPROVALS

| [ ] OK | Scenario | Notes |
|:---:|---|------|
| | Dashboard → Discount Requests – pending list | |
| | Approve discount – enter % or amount | |
| | Cancel discount request | |
| | Dashboard → Approval Requests – Void + Closed Bill Access | |
| | Approve void request | |
| | Reject void request | |
| | Approve closed bill access request | |
| | Reject closed bill access request | |

---

## 16. EDGE CASES & ERRORS

| [ ] OK | Scenario | Notes |
|:---:|---|------|
| | Offline – local DB fallback | |
| | Sync – refresh from API | |
| | API error – snackbar message | |
| | Overdue undelivered – alert dialog | |
| | Pending void request – alert | |
| | Pending closed bill access – alert | |

---

**Date tested:** _______________  
**Tester:** _______________  
**Device/OS:** _______________
