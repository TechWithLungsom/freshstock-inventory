# FreshStock

A real-time inventory dashboard for retail stores and small warehouses, built with Next.js, Supabase and ExcelJS.

## Start locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and add your Supabase project URL and publishable key.
3. Apply the SQL migrations in `supabase/migrations` in filename order.
4. Run `npm run dev` and open `http://localhost:3000`.

The app is invitation-only. It reads inventory only after a team member signs in, subscribes to Supabase Realtime, and never writes inventory to local demo state. The app uses a publishable key only; database access is protected by RLS and role checks.

## Import / export

Excel imports expect a header row containing `sku`, `name`, `category`, `supplier`, `quantity`, `unit`, `price`, `batch_number` and `expiry_date`. Exports include a formatted inventory status workbook, along with expiry summary and stock-out report variants from the export action. `manufactured_date` and supplier IDs can be added to vendor mappings as needed.

## Roles

Roles are `admin`, `warehouse_staff` and `store_manager`. Team accounts are invited through Supabase Auth; new users start as `warehouse_staff` and can reset their passwords from the sign-in page. Warehouse Staff can receive inventory and update counts and batch dates, Store Managers can manage suppliers and markdown pricing, and Admins can change team roles and view audit logs. RLS and database triggers enforce these permissions even when requests bypass the UI.

### First admin setup

There are no starter credentials. Invite your email from the Supabase project’s **Authentication → Users** page, then promote that account once in the Supabase SQL editor:

```sql
update public.profiles set role = 'admin' where email = 'your-email@example.com';
```

After that, sign in at FreshStock and manage additional roles from **Team members**. Replace the email with the invited account’s address.
