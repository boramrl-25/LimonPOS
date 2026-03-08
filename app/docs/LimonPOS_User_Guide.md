# LimonPOS User Guide

## Complete Guide for Taking Orders, Payments, Discounts, and Managing Items

**Version:** 1.2  
**Language:** English  
**Last updated:** March 2026

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Taking Orders](#2-taking-orders)
3. [Removing Products](#3-removing-products)
4. [Void Requests (Items Sent to Kitchen)](#4-void-requests-items-sent-to-kitchen)
5. [Refunds (Recalled Orders)](#5-refunds-recalled-orders)
6. [Discount Requests](#6-discount-requests)
7. [Collecting Payment](#7-collecting-payment)
8. [Other Actions](#8-other-actions)

---

## 1. Getting Started

### Login

1. Open the LimonPOS app.
2. Enter your 4-digit PIN using the on-screen numpad or a connected keyboard.
3. Use **C** to clear your PIN, **⌫** (backspace) to delete the last digit.
4. Tap the PIN display or press **Enter** to log in.

### Main Flow

1. **Floor Plan** – View all tables. Tap a table to open or create an order.
2. **Order Screen** – Add products, manage cart, send to kitchen, go to payment.
3. **Payment Screen** – Apply discounts, collect payment, close the bill.

---

## 2. Taking Orders

### Step 1: Open a Table

- On the **Floor Plan**, tap a **free** table to start a new order.
- Tap an **occupied** table to view or edit the current order.

### Step 2: Add Products

- Tap a **product** on the order screen to add it to the cart.
- Products may be:
  - **Simple** – Added immediately.
  - **With modifiers** – A modifier dialog opens. Select required options (e.g. size, toppings), then tap **Add**.
  - **With notes** – A notes dialog opens. Add special instructions if needed, then tap **Add**.

### Step 3: Modifiers

- Each modifier group has minimum and maximum selections (e.g. 1–2).
- Select required options (checkboxes).
- For paid modifiers, adjust quantity with **+** / **−** or type a number.
- Tap **Add** when selections are valid.

### Step 4: Edit Item Note or Quantity

- In the **Cart**, tap an item.
- Update **Note** or **Quantity**.
- Tap **Save** to confirm, or **Remove Note** to clear the note.

### Step 5: Send to Kitchen

- Tap **Send to Kitchen** in the cart to send pending items to the kitchen display (KDS).
- Items must be sent to kitchen before payment is enabled.
- If a printer warning appears, either retry printing or dismiss it to continue.

### Step 6: Mark Items as Delivered

- For items sent to kitchen but not yet marked delivered, tap the item in the cart to mark it as delivered.
- This helps track kitchen status.

---

## 3. Removing Products

### When Can You Remove?

You can **remove** an item only if it has **not** been sent to the kitchen (status: **pending**).

### How to Remove

1. Open the **Cart** (cart icon or summary at bottom).
2. Find the item under **New items**.
3. Tap the **delete / remove** icon (trash) next to the item.
4. The item is removed from the order immediately. No approval is needed.

### If the Item Was Sent to Kitchen

- Use **Void** instead (see Section 4).
- Or use **Refund** if the bill was already closed and recalled (see Section 5).

---

## 4. Void Requests (Items Sent to Kitchen)

### When to Use Void

Use **Void** when an item has been **sent to the kitchen** but must be cancelled (e.g. wrong order, customer change).

### How to Void

1. Open the **Cart**.
2. Find the item under **Sent to kitchen**.
3. Tap the **Void** button for that item.

### Two Options to Void

**Option 1: Void with PIN (fastest)**

- Enter the 4-digit PIN of an **admin** or **manager** (or user with post_void permission).
- Tap **Void with PIN**.
- The item is voided immediately.

**Option 2: Request Approval**

- Tap **Request Approval**.
- Both the **Supervisor** (on web) and **KDS** (kitchen display) must approve the void.
- After both approvals, sync the app to update the order.

### Important

- Once you enter a valid manager/admin PIN, you can void several items without entering the PIN again in the same session.

---

## 5. Refunds (Recalled Orders)

### When to Use Refund

Use **Refund** when the bill was **already closed** and the order was **recalled** from Closed Bills (e.g. customer returned, wrong payment).

### Refund Single Item

1. Open the recalled order.
2. Open the **Cart**.
3. Find the item and tap the **Refund** button.
4. Confirm **Refund**.
5. The item is removed from the order and recorded as a refund.

### Refund Full Bill

1. Open the recalled order.
2. Open the **Cart**.
3. Tap **Refund Full Bill**.
4. Confirm – all items will be removed and the table closed.

---

## 6. Discount Requests

Discounts require approval from an authorized user on the web backoffice.

### How to Request a Discount

1. Go to the **Payment** screen.
2. In the **Discount** section, tap **Send discount request**.
3. In the dialog:
   - **Requested discount %** (optional) – e.g. 10 for 10%.
   - **Requested discount amount** (optional) – e.g. 5 for 5 AED.
   - **Notes** (optional) – e.g. "Loyalty discount".
4. Enter at least one of: percentage or amount.
5. Tap **Send**.

### After Sending the Request

- A message appears: *"Discount request sent. Sync to get updated total after web approval."*
- An authorized user approves the discount on the web backoffice.
- On the payment screen, tap **Sync / Update** to refresh the order.
- Once approved, the total updates and you can collect payment.

---

## 7. Collecting Payment

### Step 1: Open Payment Screen

- From the order screen, open the **Cart** and tap **Payment**.
- Or tap the payment icon when payment is enabled.
- Items must be **sent to kitchen** before payment can be taken.

### Step 2: Choose Payment Mode

- **CASH** – Single cash payment.
- **CARD** – Single card payment.
- **SPLIT** – Multiple payment methods (e.g. part cash, part card).

### Step 3: Enter Amount and Complete

**For CASH or CARD (single payment):**

1. Enter the **amount received**.
2. The app shows **Change** if the amount exceeds the total.
3. Tap **Complete Payment**.

**For SPLIT payment:**

1. Enter amount and select method for the first split (e.g. Cash 50 AED).
2. Tap **Pay** for that split.
3. Add more splits as needed (e.g. Card for the rest).
4. When **Balance** is 0 (or very close), all payments are complete.

### Other Actions on Payment Screen

- **Print Bill** – Print a bill before or during payment.
- **Fix Overpayment** – If the total received is more than the bill, tap this to remove excess payments.
- **Clear previous payments** (recalled order) – If you need to change the payment method for a recalled bill.

---

## 8. Other Actions

### Transfer Table

- On the order screen, tap the **transfer** icon (arrows).
- Select **source table** (current occupied table) and **target table** (free table).
- Tap **Transfer** to move the order.

### Close Table Without Payment

- Use only if you must abandon the order (e.g. customer left).
- Tap the **menu** (⋮) and choose **Close table**.
- Confirm – items are discarded and the table becomes free.
- Use with care; this cannot be undone.

### Sync Data

- Use **Sync** (Settings or menu) to sync orders, tables, products, and users with the server.
- Sync after discount approval or void approvals to see updated totals and statuses.

### Receipt Size

- In **Settings** → Receipt item size: **Normal**, **Large**, or **XLarge**.

### Printer Setup

- In **Settings** → **Printer Setup** to configure printers for bills and kitchen tickets.

---

## Quick Reference

| Action           | Location    | Notes                                                         |
|-----------------|-------------|---------------------------------------------------------------|
| Add product     | Order screen| Tap product; select modifiers/notes if needed                 |
| Remove item     | Cart        | **New items** only (not sent to kitchen)                      |
| Void item       | Cart        | **Sent items** only; PIN or Supervisor + KDS approval         |
| Refund item     | Cart        | **Recalled order** only                                       |
| Discount        | Payment     | Send request → web approval → Sync                            |
| Payment         | Payment     | CASH / CARD / SPLIT; Complete when balance is 0               |
| Transfer table  | Order       | Order icon → source + target table                            |
| Send to kitchen | Cart        | Required before payment                                       |

---

## Support

For technical support or questions about your setup, contact your system administrator or the person who manages your LimonPOS installation.
