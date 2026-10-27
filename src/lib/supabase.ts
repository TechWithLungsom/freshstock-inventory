import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = url && key ? createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null;

export type InventoryItem = {
  id: string; sku: string; name: string; category: string; supplier: string;
  quantity: number; unit: string; price: number; markdown_price: number | null;
  batch_number: string; expiry_date: string; status?: string;
};
