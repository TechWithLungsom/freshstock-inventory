'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowDown, ArrowDownToLine, ArrowUpRight, Bell, Boxes, CalendarDays, Check, ChevronDown, CircleHelp, Clock3, Download, FileSpreadsheet, LayoutDashboard, Leaf, LogOut, Menu, MoreHorizontal, Package, Plus, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Tag, TrendingDown, Truck, Upload, Users, X } from 'lucide-react';
import { supabase, type InventoryItem } from '@/lib/supabase';

const demo: InventoryItem[] = [
  { id:'1', sku:'PRD-2048', name:'Organic baby spinach', category:'Produce', supplier:'Green Valley Farms', quantity:24, unit:'cases', price:34.5, markdown_price:null, batch_number:'GV-2409-A', expiry_date:'2026-10-29' },
  { id:'2', sku:'PRD-2049', name:'Strawberries · 1 lb', category:'Produce', supplier:'Berry Good Co.', quantity:8, unit:'crates', price:42, markdown_price:33.6, batch_number:'BG-1024-09', expiry_date:'2026-10-28' },
  { id:'3', sku:'DAI-1102', name:'Whole milk · 1 gal', category:'Dairy', supplier:'Meadow & Co.', quantity:36, unit:'units', price:5.49, markdown_price:null, batch_number:'MC-1023-17', expiry_date:'2026-10-30' },
  { id:'4', sku:'BAK-0058', name:'Sourdough boule', category:'Bakery', supplier:'Daily Loaf Bakery', quantity:5, unit:'trays', price:28, markdown_price:19.6, batch_number:'DL-1026-02', expiry_date:'2026-10-27' },
  { id:'5', sku:'PRD-2033', name:'Avocados · Hass', category:'Produce', supplier:'Green Valley Farms', quantity:2, unit:'cases', price:38, markdown_price:null, batch_number:'GV-2410-C', expiry_date:'2026-11-02' },
  { id:'6', sku:'DAI-1088', name:'Greek yogurt · plain', category:'Dairy', supplier:'Meadow & Co.', quantity:18, unit:'cases', price:31.2, markdown_price:null, batch_number:'MC-1022-11', expiry_date:'2026-10-31' },
];

const nav = [
  { label:'Overview', icon:LayoutDashboard }, { label:'Inventory', icon:Boxes },
  { label:'Expiry calendar', icon:CalendarDays, warn:true }, { label:'Suppliers', icon:Truck },
];

function expiryState(date: string) {
  const today = new Date(); today.setHours(0,0,0,0);
  const expiry = new Date(`${date}T00:00:00`);
  const days = Math.round((expiry.getTime() - today.getTime()) / 86400000);
  return days <= 1 ? { text: days < 0 ? 'Expired' : 'Expires today', tone:'danger' } : days <= 3 ? { text:`In ${days} days`, tone:'warning' } : { text:`In ${days} days`, tone:'muted' };
}

function money(value: number) { return new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(value); }

export default function Home() {
  const [items, setItems] = useState<InventoryItem[]>(demo);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All items');
  const [active, setActive] = useState('Inventory');
  const [dialog, setDialog] = useState<'add'|'import'|'signin'|null>(null);
  const [toast, setToast] = useState('');
  const [user, setUser] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const [form, setForm] = useState({ name:'', sku:'', category:'Produce', supplier:'', quantity:'', unit:'cases', price:'', batch_number:'', expiry_date:'' });
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: auth } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    const load = async () => {
      const { data, error } = await supabase!.from('inventory_items').select('*, suppliers(name)').order('expiry_date');
      if (!error && data) setItems(data.map((row: any) => ({ ...row, supplier: row.suppliers?.name ?? '—' })));
    };
    load();
    const channel = supabase.channel('inventory-live').on('postgres_changes', { event:'*', schema:'public', table:'inventory_items' }, () => load()).subscribe();
    return () => { auth.subscription.unsubscribe(); supabase?.removeChannel(channel); };
  }, []);

  const visible = useMemo(() => items.filter(item => {
    const q = query.toLowerCase();
    const match = `${item.name} ${item.sku} ${item.supplier} ${item.batch_number}`.toLowerCase().includes(q);
    const exp = expiryState(item.expiry_date);
    return match && (filter === 'All items' || (filter === 'Expiring soon' && (exp.tone === 'warning' || exp.tone === 'danger')) || (filter === 'Low stock' && item.quantity <= 8) || (filter === 'On markdown' && item.markdown_price !== null));
  }), [items, query, filter]);

  const expiring = items.filter(item => expiryState(item.expiry_date).tone !== 'muted').length;
  const lowStock = items.filter(item => item.quantity <= 8).length;
  const stockValue = items.reduce((sum, item) => sum + item.quantity * (item.markdown_price ?? item.price), 0);
  const dateLabel = new Intl.DateTimeFormat('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' }).format(new Date()).toUpperCase();
  const notify = (text: string) => { setToast(text); window.setTimeout(() => setToast(''), 2800); };

  async function supplierId(name: string) {
    if (!supabase || !name || name === '—' || name === 'Local supplier') return null;
    const existing = await supabase.from('suppliers').select('id').eq('name', name).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return existing.data.id as string;
    const inserted = await supabase.from('suppliers').insert({ name }).select('id').single();
    if (!inserted.error) return inserted.data.id as string;
    // Another upload may have created this supplier between the lookup and insert.
    const retry = await supabase.from('suppliers').select('id').eq('name', name).maybeSingle();
    if (retry.data) return retry.data.id as string;
    throw inserted.error;
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    const newItem: any = { sku:form.sku, name:form.name, category:form.category, quantity:Number(form.quantity), unit:form.unit, price:Number(form.price), batch_number:form.batch_number, expiry_date:form.expiry_date };
    if (supabase && user) {
      try { newItem.supplier_id = await supplierId(form.supplier); } catch (error:any) { notify(error.message); setBusy(false); return; }
      const { data, error } = await supabase.from('inventory_items').insert(newItem).select().single();
      if (error) { notify(error.message); setBusy(false); return; }
      setItems(current => [{ ...data, supplier:form.supplier || 'Local supplier' }, ...current]);
    } else { setItems(current => [{ ...newItem, id:crypto.randomUUID(), markdown_price:null }, ...current]); }
    setBusy(false); setDialog(null); setForm({ name:'', sku:'', category:'Produce', supplier:'', quantity:'', unit:'cases', price:'', batch_number:'', expiry_date:'' }); notify('Item added to inventory');
  }

  async function saveImport(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const sheet = workbook.worksheets[0];
      const headers: string[] = [];
      sheet.getRow(1).eachCell((cell, col) => headers[col] = String(cell.value ?? '').trim().toLowerCase().replaceAll(' ','_'));
      const parsed: any[] = [];
      sheet.eachRow((row, rowNo) => {
        if (rowNo === 1) return;
        const value: any = {};
        row.eachCell((cell, col) => value[headers[col]] = cell.value);
        if (value.sku && value.name) parsed.push({ sku:String(value.sku), name:String(value.name), category:String(value.category || 'Other'), supplier:String(value.supplier || '—'), quantity:Number(value.quantity || 0), unit:String(value.unit || 'units'), price:Number(value.price || 0), batch_number:String(value.batch_number || ''), expiry_date:value.expiry_date instanceof Date ? value.expiry_date.toISOString().slice(0,10) : String(value.expiry_date || '').slice(0,10) });
      });
      if (!parsed.length) { notify('No valid rows found. Check the template headers.'); setBusy(false); return; }
      if (supabase && user) {
        try {
          const payload = await Promise.all(parsed.map(async row => ({ ...row, supplier_id:await supplierId(row.supplier) })));
          const { error } = await supabase.from('inventory_items').insert(payload);
          if (error) { notify(error.message); setBusy(false); return; }
        } catch (error:any) { notify(error.message); setBusy(false); return; }
      }
      setItems(current => [...parsed.map((row, i) => ({ ...row, id:crypto.randomUUID(), markdown_price:null })), ...current]);
      setDialog(null); notify(`${parsed.length} ${parsed.length === 1 ? 'item' : 'items'} imported successfully`);
    } catch { notify('Could not read this file. Please upload an .xlsx or .xls file.'); }
    setBusy(false);
  }

  async function exportXlsx(report = 'Inventory status') {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const isTemplate = report === 'Import template';
    const sheet = workbook.addWorksheet(report, { views:[{ state:'frozen', ySplit:1 }] });
    sheet.columns = isTemplate ? [
      { header:'sku', key:'sku', width:16 }, { header:'name', key:'name', width:30 }, { header:'category', key:'category', width:16 }, { header:'supplier', key:'supplier', width:23 }, { header:'quantity', key:'quantity', width:12 }, { header:'unit', key:'unit', width:12 }, { header:'price', key:'price', width:14 }, { header:'batch_number', key:'batch_number', width:18 }, { header:'expiry_date', key:'expiry_date', width:16 },
    ] : [
      { header:'SKU', key:'sku', width:14 }, { header:'Product', key:'name', width:30 }, { header:'Category', key:'category', width:16 }, { header:'Supplier', key:'supplier', width:23 }, { header:'Quantity', key:'quantity', width:12 }, { header:'Unit', key:'unit', width:12 }, { header:'Price', key:'price', width:14 }, { header:'Markdown price', key:'markdown', width:17 }, { header:'Batch number', key:'batch', width:18 }, { header:'Expiry date', key:'expiry', width:16 },
    ];
    sheet.getRow(1).height = 30;
    sheet.getRow(1).eachCell(cell => { cell.font = { bold:true, color:{ argb:'FFFFFFFF' } }; cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF183D32' } }; cell.alignment = { vertical:'middle' }; });
    const rows = isTemplate ? [] : report === 'Stock-out log' ? items.filter(item => item.quantity === 0) : report === 'Expiry summary' ? items.filter(item => expiryState(item.expiry_date).tone !== 'muted') : items;
    rows.forEach((item, i) => {
      const row = sheet.addRow({ sku:item.sku, name:item.name, category:item.category, supplier:item.supplier, quantity:item.quantity, unit:item.unit, price:item.price, markdown:item.markdown_price ?? '', batch:item.batch_number, expiry:item.expiry_date });
      row.height = 25;
      row.eachCell(cell => { cell.border = { bottom:{ style:'hair', color:{ argb:'FFE9EEEB' } } }; if (i % 2) cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFF7F9F7' } }; });
      if (expiryState(item.expiry_date).tone === 'danger') row.getCell(10).font = { bold:true, color:{ argb:'FFC4473A' } };
      if (expiryState(item.expiry_date).tone === 'warning') row.getCell(10).font = { bold:true, color:{ argb:'FFB77B19' } };
    });
    sheet.autoFilter = { from:'A1', to:'J1' };
    const buffer = await workbook.xlsx.writeBuffer();
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([buffer])); link.download = `${report.toLowerCase().replaceAll(' ','-')}-${new Date().toISOString().slice(0,10)}.xlsx`; link.click(); URL.revokeObjectURL(link.href); notify(`${report} report downloaded`);
  }

  async function signIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!supabase) { notify('Add your Supabase keys to connect authentication.'); return; }
    const values = new FormData(e.currentTarget);
    const { error } = await supabase.auth.signInWithPassword({ email:String(values.get('email')), password:String(values.get('password')) });
    if (error) notify(error.message); else { setDialog(null); notify('Signed in successfully'); }
  }

  return <main className="app-shell">
    <aside className={`sidebar ${mobileNav?'mobile-open':''}`}>
      <div className="brand"><div className="brand-mark"><Leaf size={21} strokeWidth={2.2}/></div><span>freshstock<span className="brand-dot">.</span></span></div>
      <button className="workspace-switch"><div className="workspace-avatar">H</div><span className="workspace-copy"><b>Harbor Market</b><small>Workspace</small></span><ChevronDown size={15}/></button>
      <div className="nav-label">WORKSPACE</div>
      <nav>{nav.map(item => {const count = item.label==='Inventory' ? items.length : item.label==='Expiry calendar' ? expiring : null; return <button key={item.label} className={`nav-item ${active===item.label?'selected':''}`} onClick={()=>{setActive(item.label);setMobileNav(false)}}><item.icon size={18}/><span>{item.label}</span>{count!==null&&<span className={`nav-count ${item.warn?'nav-alert':''}`}>{count}</span>}</button>})}</nav>
      <div className="nav-label team-label">TEAM</div>
      <button className="nav-item" onClick={()=>notify('Team management is ready after Supabase setup')}><Users size={18}/><span>Team members</span></button>
      <button className="nav-item" onClick={()=>notify('Settings are coming soon')}><Settings2 size={18}/><span>Settings</span></button>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><CircleHelp size={16}/></div><b>Need a hand?</b><p>We’re here to help you keep things fresh.</p><button onClick={()=>notify('Help center opened in a new tab')}>Visit help center <ArrowUpRight size={13}/></button></div><div className="profile-row"><div className="profile-avatar">JM</div><div className="profile-copy"><b>{user?.email ? user.email.split('@')[0] : 'Jordan Miller'}</b><small>{user ? 'Admin' : 'Store Manager'}</small></div><button className="icon-button small" aria-label="Sign in or sign out" onClick={()=>user ? supabase?.auth.signOut() : setDialog('signin')}>{user?<LogOut size={16}/>:<ChevronDown size={16}/>}</button></div></div>
    </aside>

    <section className="main-area">
      <header className="topbar"><button className="icon-button menu-toggle" onClick={()=>setMobileNav(!mobileNav)} aria-label="Toggle navigation"><Menu size={19}/></button><div className="breadcrumb">Workspace <span>/</span> <b>{active}</b></div><div className="top-actions"><div className="sync-pill"><span className="live-dot"/> Live sync</div><button className="icon-button notification-button" aria-label="Notifications" onClick={()=>notify('You’re all caught up')}><Bell size={18}/><i/></button><div className="top-divider"/><button className="top-user" onClick={()=>user ? supabase?.auth.signOut() : setDialog('signin')}><div className="profile-avatar">JM</div><span>Jordan Miller</span><ChevronDown size={14}/></button></div></header>
      <div className="content">
        <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-icon"><Sparkles size={13}/></span> {dateLabel}</div><h1>Good morning, Jordan <span>☀️</span></h1><p>Here’s what’s happening across your inventory today.</p></div><div className="heading-actions"><button className="button button-secondary" onClick={()=>setDialog('import')}><Upload size={16}/> Import</button><button className="button button-primary" onClick={()=>setDialog('add')}><Plus size={17}/> Add item</button></div></div>

        <div className="metrics-grid">
          <article className="metric-card"><div className="metric-top"><span className="metric-title">Total stock value</span><span className="metric-icon green"><Package size={17}/></span></div><div className="metric-value">{money(stockValue)}</div><div className="metric-foot"><span className="foot-muted">Based on current unit prices</span><span className="metric-spark spark-green">▁▃▂▅▄▆▅▇</span></div></article>
          <article className="metric-card"><div className="metric-top"><span className="metric-title">Active products</span><span className="metric-icon blue"><Boxes size={17}/></span></div><div className="metric-value">{items.length}<small> SKUs</small></div><div className="metric-foot"><span className="foot-muted"><span className="green-dot"/> Inventory tracked live</span><span className="metric-spark spark-blue">▂▃▅▄▅▇▆▇</span></div></article>
          <article className="metric-card"><div className="metric-top"><span className="metric-title">Expiring soon</span><span className="metric-icon amber"><Clock3 size={17}/></span></div><div className="metric-value">{expiring}<small> items</small></div><div className="metric-foot"><span className="warning-text"><span className="tiny-dot amber-dot"/> Within 3 days</span><button className="text-link" onClick={()=>setFilter('Expiring soon')}>Review <ArrowUpRight size={13}/></button></div></article>
          <article className="metric-card"><div className="metric-top"><span className="metric-title">Low stock alerts</span><span className="metric-icon red"><Activity size={17}/></span></div><div className="metric-value">{lowStock}<small> items</small></div><div className="metric-foot"><span className="danger-text"><span className="tiny-dot red-dot"/> At or below reorder point</span><button className="text-link" onClick={()=>setFilter('Low stock')}>Review <ArrowUpRight size={13}/></button></div></article>
        </div>

        <section className="inventory-panel">
          <div className="panel-heading"><div><div className="panel-title-row"><h2>Inventory</h2><span className="total-chip">{items.length} total</span></div><p>Keep an eye on every batch, from arrival to sell-through.</p></div><div className="panel-tools"><div className="export-wrap"><button className="button button-secondary report-button" onClick={()=>setExportMenu(!exportMenu)}><Download size={15}/> Export report <ChevronDown size={13}/></button>{exportMenu&&<div className="export-menu">{['Inventory status','Expiry summary','Stock-out log'].map(report=><button key={report} onClick={()=>{setExportMenu(false);exportXlsx(report)}}><FileSpreadsheet size={14}/>{report}</button>)}</div>}</div><button className="icon-button filter-button" onClick={()=>setFilter(filter==='All items'?'Expiring soon':'All items')} aria-label="Toggle expiring filter"><SlidersHorizontal size={16}/></button></div></div>
          <div className="toolbar"><div className="tabs">{['All items','Expiring soon','Low stock','On markdown'].map(tab=><button key={tab} className={`tab ${filter===tab?'active':''}`} onClick={()=>setFilter(tab)}>{tab}{tab==='Expiring soon'&&<span className="tab-count">{expiring}</span>}</button>)}</div><label className="search-box"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search inventory..."/><kbd>⌘ K</kbd></label></div>
          <div className="table-wrap"><table><thead><tr><th className="product-head">PRODUCT</th><th>SUPPLIER</th><th>IN STOCK</th><th>UNIT PRICE</th><th>BATCH / EXPIRY</th><th>STATUS</th><th></th></tr></thead><tbody>{visible.map(item=>{const state=expiryState(item.expiry_date);return <tr key={item.id}><td><div className="product-cell"><div className={`product-thumb ${item.category.toLowerCase()}`}>{item.category==='Dairy'?'🥛':item.category==='Bakery'?'🍞':item.name.toLowerCase().includes('strawber')?'🍓':item.name.toLowerCase().includes('avocado')?'🥑':'🥬'}</div><div><b>{item.name}</b><small>{item.sku} <span>·</span> {item.category}</small></div></div></td><td><span className="supplier-name">{item.supplier}</span></td><td><span className={`stock-count ${item.quantity<=8?'stock-low':''}`}>{item.quantity} <small>{item.unit}</small></span>{item.quantity<=8&&<small className="reorder-note">Reorder soon</small>}</td><td><div className="price-cell">{money(item.markdown_price ?? item.price)}{item.markdown_price&&<small className="old-price">{money(item.price)}</small>}</div></td><td><div className="batch-cell"><b>{item.batch_number}</b><small>{new Date(item.expiry_date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}</small></div></td><td><span className={`status-pill ${state.tone}`}>{state.tone==='danger'?'●':state.tone==='warning'?'●':'●'} {state.text}</span></td><td><button className="icon-button row-more" aria-label={`More options for ${item.name}`} onClick={()=>notify(`Options for ${item.name}`)}><MoreHorizontal size={18}/></button></td></tr>})}</tbody></table>{visible.length===0&&<div className="empty-state"><Package size={22}/><b>No items found</b><span>Try a different search or filter.</span></div>}</div>
          <div className="table-footer"><span>Showing <b>{visible.length?1:0}–{visible.length}</b> of <b>{items.length}</b> items</span><div className="pagination"><button disabled>Previous</button><button className="page-current">1</button><button onClick={()=>notify('You’re viewing all demo rows')}>2</button><button>3</button><span>…</span><button>10</button><button onClick={()=>notify('You’re viewing all demo rows')}>Next <ArrowDown size={13} className="next-arrow"/></button></div></div>
        </section>

        <div className="bottom-grid"><section className="insight-card"><div className="insight-head"><div className="insight-icon"><Tag size={16}/></div><div><h3>Markdown opportunity</h3><p>Save products before they go to waste.</p></div><button className="text-link" onClick={()=>setFilter('On markdown')}>View all <ArrowUpRight size={13}/></button></div><div className="markdown-row"><div className="markdown-product"><span className="mini-thumb">🍓</span><div><b>Strawberries · 1 lb</b><small>8 crates · expires in 1 day</small></div></div><div className="markdown-prices"><span>{money(42)}</span><ArrowDown size={13}/><b>{money(33.6)}</b><small>−20%</small></div><button className="markdown-apply" onClick={()=>notify('Markdown price updated')}>Apply</button></div><div className="markdown-row"><div className="markdown-product"><span className="mini-thumb">🍞</span><div><b>Sourdough boule</b><small>5 trays · expires today</small></div></div><div className="markdown-prices"><span>{money(28)}</span><ArrowDown size={13}/><b>{money(19.6)}</b><small>−30%</small></div><button className="markdown-apply" onClick={()=>notify('Markdown price updated')}>Apply</button></div></section>
          <section className="activity-card"><div className="activity-heading"><div><h3>Recent activity</h3><p>Latest changes from your team.</p></div><button className="icon-button" onClick={()=>notify('Showing recent activity')}><MoreHorizontal size={18}/></button></div><div className="activity-list"><div className="activity-item"><span className="activity-dot dot-green"><ArrowDownToLine size={13}/></span><div><b>Stock received</b><p>Green Valley Farms · 24 cases spinach</p><small>Today, 9:42 AM · <strong>Jordan M.</strong></small></div></div><div className="activity-item"><span className="activity-dot dot-amber"><Tag size={13}/></span><div><b>Markdown applied</b><p>Strawberries · 1 lb · 20% off</p><small>Today, 8:16 AM · <strong>Sam R.</strong></small></div></div></div></section></div>
        <footer className="footer"><span><ShieldCheck size={14}/> Your inventory is synced and secure</span><span>FreshStock <b>·</b> Last synced just now</span></footer>
      </div>
    </section>

    {dialog&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setDialog(null)}}><section className="modal"><div className="modal-heading"><div><span className="modal-kicker">{dialog==='add'?'NEW ARRIVAL':dialog==='import'?'BULK UPLOAD':'YOUR WORKSPACE'}</span><h2>{dialog==='add'?'Add an inventory item':dialog==='import'?'Import from Excel':'Sign in to FreshStock'}</h2><p>{dialog==='add'?'Enter the details for this stock batch.':dialog==='import'?'Bring in a vendor manifest and we’ll map it to your inventory.':'Use your team account to access live inventory.'}</p></div><button className="icon-button" onClick={()=>setDialog(null)} aria-label="Close"><X size={18}/></button></div>
      {dialog==='add'?<form onSubmit={addItem} className="modal-form"><label>Product name<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Organic baby spinach"/></label><div className="form-row"><label>SKU<input required value={form.sku} onChange={e=>setForm({...form,sku:e.target.value})} placeholder="PRD-2050"/></label><label>Category<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}><option>Produce</option><option>Dairy</option><option>Bakery</option><option>Meat & seafood</option><option>Other</option></select></label></div><div className="form-row"><label>Quantity<input required type="number" min="0" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})} placeholder="24"/></label><label>Unit<select value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})}><option>cases</option><option>units</option><option>crates</option><option>trays</option><option>boxes</option></select></label><label>Unit price<input required type="number" min="0" step="0.01" value={form.price} onChange={e=>setForm({...form,price:e.target.value})} placeholder="0.00"/></label></div><div className="form-row"><label>Batch number<input required value={form.batch_number} onChange={e=>setForm({...form,batch_number:e.target.value})} placeholder="BATCH-001"/></label><label>Expiry date<input required type="date" value={form.expiry_date} onChange={e=>setForm({...form,expiry_date:e.target.value})}/></label></div><label>Supplier<input value={form.supplier} onChange={e=>setForm({...form,supplier:e.target.value})} placeholder="Supplier name"/></label><div className="modal-actions"><button type="button" className="button button-secondary" onClick={()=>setDialog(null)}>Cancel</button><button className="button button-primary" disabled={busy}>{busy?'Saving…':<><Plus size={16}/> Add to inventory</>}</button></div></form>:dialog==='import'?<div className="import-content"><label className="upload-zone"><input type="file" accept=".xlsx,.xls" onChange={e=>saveImport(e.target.files?.[0])}/><div className="upload-icon"><FileSpreadsheet size={23}/></div><b>Drop your Excel file here</b><span>or <u>browse files</u> · .xlsx or .xls, up to 10 MB</span><span className="upload-cta"><Upload size={14}/> Choose file</span></label><div className="import-note"><div><FileSpreadsheet size={17}/></div><p><b>Use our import template</b><br/>Your file should include SKU, name, category, quantity, price, batch_number and expiry_date.</p><button onClick={()=>exportXlsx('Import template')}><Download size={14}/> Get template</button></div><div className="modal-actions"><button className="button button-secondary" onClick={()=>setDialog(null)}>Cancel</button></div></div>:<form className="modal-form" onSubmit={signIn}><label>Email<input name="email" type="email" required placeholder="you@store.com"/></label><label>Password<input name="password" type="password" required placeholder="Your password"/></label><div className="modal-actions"><button type="button" className="button button-secondary" onClick={()=>setDialog(null)}>Cancel</button><button className="button button-primary">Sign in</button></div><p className="auth-footnote">No account yet? Invite your team through Supabase Auth to get started.</p></form>}
    </section></div>}
    {toast&&<div className="toast"><span><Check size={14}/></span>{toast}</div>}
  </main>;
}
