# FreshStock

A real-time inventory dashboard for retail stores and small warehouses, built with Next.js, Supabase and ExcelJS.

## Start locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and add your Supabase project URL and anon key.
3. Run the SQL in `supabase/migrations/202610270001_inventory.sql` in the Supabase SQL editor (or apply it with the Supabase CLI).
4. Run `npm run dev` and open `http://localhost:3000`.

The dashboard renders with sample data when Supabase credentials are not configured. Once connected, it reads `inventory_items`, subscribes to Supabase Realtime changes and supports authenticated inserts. The app uses the Supabase anon key only; database access is protected by RLS.

## Import / export

Excel imports expect a header row containing `sku`, `name`, `category`, `supplier`, `quantity`, `unit`, `price`, `batch_number` and `expiry_date`. Exports include a formatted inventory status workbook, along with expiry summary and stock-out report variants from the export action. `manufactured_date` and supplier IDs can be added to vendor mappings as needed.

## Roles

Roles are `admin`, `warehouse_staff` and `store_manager`. New Auth users automatically receive a profile with the `warehouse_staff` role. Assign elevated roles by updating `public.profiles.role` in the Supabase dashboard. RLS grants team read and inventory write access; only managers/admins can delete inventory, and admins can view audit logs/manage team profiles.
