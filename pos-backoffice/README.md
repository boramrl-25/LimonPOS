# Limon POS Back-Office & Dashboard

Full-stack POS Back-Office and Dashboard built with **Next.js 14**, **Tailwind CSS**, and **Lucide Icons**.

## Features

### 1. Payment Methods & Integrations
- Enable/Disable switches for Cash and Card
- Card API: Manual or Integrated mode
- Integrated: Endpoint and API Key fields (uTap, bank APIs)
- Add custom payment methods (Sodexo, Tabby, etc.)

### 2. Zoho Books Integration
- Enable Zoho Sync / Real-time Sync toggles
- Client ID, Client Secret, Refresh Token, Organization ID
- Sync Sales / Sync Products buttons

### 3. Email & SMTP Settings
- Z-Report recipients (up to 4 emails)
- SMTP config: Host, Port, User, Password

### 4. Users & Permissions
- User list: Admin, Manager, Ahmed (Waiter), Sara (Cashier)
- Role management: Add new roles
- Permissions matrix: Floor Plan, Take Orders, Kitchen Display, **KDS Mode Access**, Process Payments, Open Cash Drawer, View Dashboard, View Reports, Void Items, Apply Discounts, Manage Products, Manage Categories, Manage Users, Manage Printers, View All Orders, Edit/Void Closed Bills

### 5. Product Management
- Multi-language: English, Arabic, Turkish
- Price (AED), Tax Rate (%), Category dropdown
- Printer routing (multi-select): BAR, 6 LI OCAK, Grill, etc.
- Modifier groups: Cooking Level, Sauce, Extras, Size

### 6. Interactive Dashboard
- Main stats: Today's Sales (AED), Order Count, Open Tables, Open Checks (clickable)
- Payment breakdown: Cash, Card, uTap (clickable)
- Void tracking: Pre-Print Voids, Post-Print Voids, Top Void Users (clickable)
- Log tracking: Order Edits, Cash Drawer Opens (No Sale) (clickable)
- Drill-down pages for each metric

## Run

```bash
cd pos-backoffice
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)
