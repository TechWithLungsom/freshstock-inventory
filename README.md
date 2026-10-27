# FreshStock

A real-time inventory dashboard for retail stores and small warehouses, built with Next.js, Supabase and ExcelJS.

## Start locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and add your Supabase project URL and publishable key.
3. Apply the SQL migrations in `supabase/migrations` in filename order.
4. Run `npm run dev` and open `http://localhost:3000`.

The app provides sign-in, sign-up and password recovery. New sign-ups are assigned the Warehouse Staff role and remain pending until an active Admin approves them. Inventory is visible only to approved team members. The app uses a publishable key only; database access and role checks are enforced by Supabase RLS and database triggers.

## Import / export

Excel imports expect a header row containing `sku`, `name`, `category`, `supplier`, `quantity`, `unit`, `price`, `batch_number` and `expiry_date`. Exports include a formatted inventory status workbook, along with expiry summary and stock-out report variants from the export action. `manufactured_date` and supplier IDs can be added to vendor mappings as needed.

## Roles

Roles are `admin`, `warehouse_staff` and `store_manager`. Warehouse Staff can receive inventory and update counts and batch dates, Store Managers can manage suppliers and markdown pricing, and Admins can approve or suspend accounts, change team roles and view audit logs. New members do not receive inventory access until an Admin approves them from **Team members**. The existing owner account was promoted to Admin during setup; no manual SQL step is required.
