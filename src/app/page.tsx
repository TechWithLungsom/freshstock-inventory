'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowDown, ArrowDownToLine, ArrowUpRight, Bell, Boxes, CalendarDays, Check, ChevronDown, CircleHelp, Clock3, Download, FileSpreadsheet, LayoutDashboard, Leaf, LogOut, Menu, MoreHorizontal, Package, Plus, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Tag, Truck, Upload, Users, X } from 'lucide-react';
import { supabase, type InventoryItem, type TeamProfile, type TeamRole, type User } from '@/lib/supabase';

const nav = [
  { label:'Overview', icon:LayoutDashboard }, { label:'Inventory', icon:Boxes },
  { label:'Expiry calendar', icon:CalendarDays, warn:true }, { label:'Suppliers', icon:Truck },
];

const roleLabels: Record<TeamRole, string> = { admin:'Admin', warehouse_staff:'Warehouse Staff', store_manager:'Store Manager' };

function expiryState(date: string) {
  const today = new Date(); today.setHours(0,0,0,0);
  const expiry = new Date(`${date}T00:00:00`);
  const days = Math.round((expiry.getTime() - today.getTime()) / 86400000);
  return days <= 1 ? { text: days < 0 ? 'Expired' : 'Expires today', tone:'danger' } : days <= 3 ? { text:`In ${days} days`, tone:'warning' } : { text:`In ${days} days`, tone:'muted' };
}

function money(value: number) { return new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(value); }

export default function Home() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All items');
  const [active, setActive] = useState('Inventory');
  const [dialog, setDialog] = useState<'add'|'import'|null>(null);
  const [toast, setToast] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<TeamProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<'sign_in'|'reset'|'new_password'>('sign_in');
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [dataError, setDataError] = useState('');
  const [teamMembers, setTeamMembers] = useState<TeamProfile[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const [form, setForm] = useState({ name:'', sku:'', category:'Produce', supplier:'', quantity:'', unit:'cases', price:'', batch_number:'', expiry_date:'' });
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => {
    const client = supabase;
    if (!client) { setAuthReady(true); return; }
    let mounted = true;
    const loadProfile = async (sessionUser: User | null) => {
      if (!mounted) return;
      setUser(sessionUser);
      if (!sessionUser) { setProfile(null); setItems([]); setAuthReady(true); return; }
      const { data, error } = await client.from('profiles').select('id,full_name,email,role').eq('id', sessionUser.id).maybeSingle();
      if (!mounted) return;
      if (error) { setAuthError('We could not load your team permissions. Please try again or contact your administrator.'); setProfile(null); }
      else setProfile(data as TeamProfile | null);
      setAuthReady(true);
    };
    client.auth.getSession().then(({ data, error }) => {
      if (error) setAuthError('We could not restore your session. Please sign in again.');
      void loadProfile(data.session?.user ?? null);
    });
    const { data: auth } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setAuthMode('new_password');
      queueMicrotask(() => { void loadProfile(session?.user ?? null); });
    });
    return () => { mounted = false; auth.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client || !user || !profile) { setItems([]); return; }
    let active = true;
    const load = async () => {
      const { data, error } = await client.from('inventory_items').select('*, suppliers(name)').order('expiry_date');
      if (!active) return;
      if (error) { setDataError('Inventory could not be loaded. Check your access or ask an administrator.'); setItems([]); return; }
      setDataError('');
      setItems((data ?? []).map((row: any) => ({ ...row, supplier: row.suppliers?.name ?? '—' })));
    };
    void load();
    const channel = client.channel(`inventory-live-${user.id}`).on('postgres_changes', { event:'*', schema:'public', table:'inventory_items' }, () => { void load(); }).subscribe();
    return () => { active = false; void client.removeChannel(channel); };
  }, [user?.id, profile?.role]);

  useEffect(() => {
    const client = supabase;
    if (!client || active !== 'Team members' || profile?.role !== 'admin') return;
    let mounted = true;
    setTeamLoading(true);
    client.from('profiles').select('id,full_name,email,role').order('created_at').then(({ data, error }) => {
      if (!mounted) return;
      setTeamLoading(false);
      if (error) { notify('Team list could not be loaded.'); return; }
      setTeamMembers((data ?? []) as TeamProfile[]);
    });
    return () => { mounted = false; };
  }, [active, profile?.role]);

  const visible = useMemo(() => items.filter(item => {
    const q = query.toLowerCase();
    const match = `${item.name} ${item.sku} ${item.supplier} ${item.batch_number}`.toLowerCase().includes(q);
    const exp = expiryState(item.expiry_date);
    return match && (filter === 'All items' || (filter === 'Expiring soon' && (exp.tone === 'warning' || exp.tone === 'danger')) || (filter === 'Low stock' && item.quantity <= 8) || (filter === 'On markdown' && item.markdown_price !== null));
  }), [items, query, filter]);

  const expiring = items.filter(item => expiryState(item.expiry_date).tone !== 'muted').length;
  const lowStock = items.filter(item => item.quantity <= 8).length;
  const markdownCandidates = items.filter(item => item.markdown_price === null && expiryState(item.expiry_date).tone !== 'muted').slice(0, 2);
  const stockValue = items.reduce((sum, item) => sum + item.quantity * (item.markdown_price ?? item.price), 0);
  const dateLabel = new Intl.DateTimeFormat('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' }).format(new Date()).toUpperCase();
  const notify = (text: string) => { setToast(text); window.setTimeout(() => setToast(''), 2800); };
  const isAdmin = profile?.role === 'admin';
  const canManagePricing = profile?.role === 'admin' || profile?.role === 'store_manager';

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
    e.preventDefault();
    if (!supabase || !user || !profile) { notify('Sign in with an authorized team account to add inventory.'); return; }
    setBusy(true);
    const newItem: any = { sku:form.sku, name:form.name, category:form.category, quantity:Number(form.quantity), unit:form.unit, price:Number(form.price), batch_number:form.batch_number, expiry_date:form.expiry_date };
    try { newItem.supplier_id = await supplierId(form.supplier); } catch (error:any) { notify(error.message); setBusy(false); return; }
    const { data, error } = await supabase.from('inventory_items').insert(newItem).select('*, suppliers(name)').single();
    if (error) { notify(error.message); setBusy(false); return; }
    setItems(current => [{ ...data, supplier:data.suppliers?.name ?? form.supplier ?? '—' }, ...current]);
    setBusy(false); setDialog(null); setForm({ name:'', sku:'', category:'Produce', supplier:'', quantity:'', unit:'cases', price:'', batch_number:'', expiry_date:'' }); notify('Item added to inventory');
  }

  async function saveImport(file?: File) {
    if (!file) return;
    if (!supabase || !user || !profile) { notify('Sign in with an authorized team account to import inventory.'); return; }
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
      try {
        const payload = await Promise.all(parsed.map(async row => ({ sku:row.sku, name:row.name, category:row.category, quantity:row.quantity, unit:row.unit, price:row.price, batch_number:row.batch_number, expiry_date:row.expiry_date, supplier_id:await supplierId(row.supplier) })));
        const { error } = await supabase.from('inventory_items').insert(payload);
        if (error) { notify(error.message); setBusy(false); return; }
      } catch (error:any) { notify(error.message); setBusy(false); return; }
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
    e.preventDefault(); setAuthError(''); setAuthNotice('');
    if (!supabase) { setAuthError('Authentication is not configured for this deployment.'); return; }
    const values = new FormData(e.currentTarget);
    setAuthBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email:String(values.get('email')).trim(), password:String(values.get('password')) });
    setAuthBusy(false);
    if (error) setAuthError('Email or password was not accepted. Check your details and try again.');
  }

  async function requestPasswordReset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setAuthError(''); setAuthNotice('');
    if (!supabase) return;
    const values = new FormData(e.currentTarget);
    setAuthBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(String(values.get('email')).trim(), { redirectTo:window.location.origin });
    setAuthBusy(false);
    if (error) setAuthError('Password reset could not be requested. Check the email and try again.');
    else setAuthNotice('If that email belongs to a team member, a password reset link is on its way.');
  }

  async function updatePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setAuthError(''); setAuthNotice('');
    if (!supabase) return;
    const values = new FormData(e.currentTarget);
    const password = String(values.get('password'));
    if (password !== String(values.get('confirmPassword'))) { setAuthError('The passwords do not match.'); return; }
    if (password.length < 10) { setAuthError('Use a password with at least 10 characters.'); return; }
    setAuthBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setAuthBusy(false);
    if (error) setAuthError('Password could not be updated. Request a new reset link and try again.');
    else { setAuthMode('sign_in'); setAuthNotice('Password updated. Sign in with your new password.'); await supabase.auth.signOut(); }
  }

  async function changeTeamRole(id: string, role: TeamRole) {
    if (!supabase || !isAdmin) { notify('Only admins can change team roles.'); return; }
    const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
    if (error) { notify('Role change was denied.'); return; }
    setTeamMembers(current => current.map(member => member.id === id ? { ...member, role } : member));
    notify('Team role updated');
  }

  async function applyMarkdown(item: InventoryItem) {
    if (!supabase || !canManagePricing) { notify('Only admins and store managers can change prices.'); return; }
    const markdown = Math.round(item.price * 0.8 * 100) / 100;
    const { data, error } = await supabase.from('inventory_items').update({ markdown_price:markdown }).eq('id', item.id).select('*, suppliers(name)').single();
    if (error) { notify('Price change was denied.'); return; }
    setItems(current => current.map(existing => existing.id === item.id ? { ...data, supplier:data.suppliers?.name ?? existing.supplier } : existing));
    notify('Markdown price updated');
  }

  if (!authReady) return <main className="auth-shell"><section className="auth-card auth-loading"><div className="brand"><div className="brand-mark"><Leaf size={21}/></div><span>freshstock<span className="brand-dot">.</span></span></div><p>Checking your secure team session…</p></section></main>;
  if (!supabase) return <main className="auth-shell"><section className="auth-card"><div className="brand"><div className="brand-mark"><Leaf size={21}/></div><span>freshstock<span className="brand-dot">.</span></span></div><h1>Connect your workspace</h1><p>Supabase authentication is not configured for this deployment. Ask your administrator to add the project URL and publishable key in Render.</p></section></main>;
  if (authMode === 'new_password' && user) return <main className="auth-shell"><section className="auth-card"><div className="brand"><div className="brand-mark"><Leaf size={21}/></div><span>freshstock<span className="brand-dot">.</span></span></div><span className="auth-kicker">ACCOUNT SECURITY</span><h1>Choose a new password</h1><p>Use at least 10 characters for your FreshStock account.</p><form className="auth-form" onSubmit={updatePassword}><label>New password<input name="password" type="password" autoComplete="new-password" minLength={10} required/></label><label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} required/></label>{authError&&<div className="auth-message error" role="alert">{authError}</div>}<button className="button button-primary" disabled={authBusy}>{authBusy?'Updating…':'Update password'}</button></form></section></main>;
  if (!user) return <main className="auth-shell"><section className="auth-card"><div className="brand"><div className="brand-mark"><Leaf size={21}/></div><span>freshstock<span className="brand-dot">.</span></span></div><span className="auth-kicker">TEAM INVENTORY WORKSPACE</span><h1>{authMode === 'reset' ? 'Reset your password' : 'Welcome back'}</h1><p>{authMode === 'reset' ? 'Enter your team email and we’ll send a secure reset link.' : 'Sign in with the email and password from your team invitation.'}</p>{authError&&<div className="auth-message error" role="alert">{authError}</div>}{authNotice&&<div className="auth-message success" role="status">{authNotice}</div>}{authMode === 'reset' ? <form className="auth-form" onSubmit={requestPasswordReset}><label>Work email<input name="email" type="email" autoComplete="email" required placeholder="you@store.com"/></label><button className="button button-primary" disabled={authBusy}>{authBusy?'Sending…':'Send reset link'}</button><button type="button" className="auth-link" onClick={()=>{setAuthMode('sign_in');setAuthError('');setAuthNotice('')}}>Back to sign in</button></form> : <form className="auth-form" onSubmit={signIn}><label>Work email<input name="email" type="email" autoComplete="username" required placeholder="you@store.com"/></label><label>Password<input name="password" type="password" autoComplete="current-password" required placeholder="Your password"/></label><button className="button button-primary" disabled={authBusy}>{authBusy?'Signing in…':'Sign in'}</button><button type="button" className="auth-link" onClick={()=>{setAuthMode('reset');setAuthError('');setAuthNotice('')}}>Forgot password?</button><div className="auth-invite-note"><ShieldCheck size={15}/><span>Accounts are invitation-only. Ask your workspace admin to invite your email through Supabase Auth.</span></div></form>}</section></main>;
  if (!profile) return <main className="auth-shell"><section className="auth-card"><div className="brand"><div className="brand-mark"><Leaf size={21}/></div><span>freshstock<span className="brand-dot">.</span></span></div><h1>Team access is not ready</h1><p>{authError || 'This account does not have a FreshStock team profile yet. Ask an administrator to invite you.'}</p><button className="button button-secondary" onClick={()=>void supabase?.auth.signOut()}><LogOut size={15}/> Sign out</button></section></main>;

  return <main className="app-shell">
    <aside className={`sidebar ${mobileNav?'mobile-open':''}`}>
      <div className="brand"><div className="brand-mark"><Leaf size={21} strokeWidth={2.2}/></div><span>freshstock<span className="brand-dot">.</span></span></div>
      <button className="workspace-switch"><div className="workspace-avatar">H</div><span className="workspace-copy"><b>Harbor Market</b><small>Workspace</small></span><ChevronDown size={15}/></button>
      <div className="nav-label">WORKSPACE</div>
      <nav>{nav.map(item => {const count = item.label==='Inventory' ? items.length : item.label==='Expiry calendar' ? expiring : null; return <button key={item.label} className={`nav-item ${active===item.label?'selected':''}`} onClick={()=>{setActive(item.label);setMobileNav(false)}}><item.icon size={18}/><span>{item.label}</span>{count!==null&&<span className={`nav-count ${item.warn?'nav-alert':''}`}>{count}</span>}</button>})}</nav>
      <div className="nav-label team-label">TEAM</div>
      <button className={`nav-item ${active==='Team members'?'selected':''}`} onClick={()=>{setActive('Team members');setMobileNav(false)}}><Users size={18}/><span>Team members</span>{!isAdmin&&<span className="nav-count">Admin</span>}</button>
      <button className="nav-item" onClick={()=>notify('Settings are coming soon')}><Settings2 size={18}/><span>Settings</span></button>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><CircleHelp size={16}/></div><b>Need a hand?</b><p>We’re here to help you keep things fresh.</p><button onClick={()=>notify('Help center opened in a new tab')}>Visit help center <ArrowUpRight size={13}/></button></div><div className="profile-row"><div className="profile-avatar">{(profile.full_name || user.email || 'FS').slice(0,2).toUpperCase()}</div><div className="profile-copy"><b>{profile.full_name || user.email}</b><small>{roleLabels[profile.role]}</small></div><button className="icon-button small" aria-label="Sign out" onClick={()=>void supabase.auth.signOut()}><LogOut size={16}/></button></div></div>
    </aside>

    <section className="main-area">
      <header className="topbar"><button className="icon-button menu-toggle" onClick={()=>setMobileNav(!mobileNav)} aria-label="Toggle navigation"><Menu size={19}/></button><div className="breadcrumb">Workspace <span>/</span> <b>{active}</b></div><div className="top-actions"><div className="sync-pill"><span className="live-dot"/> Live sync</div><button className="icon-button notification-button" aria-label="Notifications" onClick={()=>notify('You’re all caught up')}><Bell size={18}/><i/></button><div className="top-divider"/><button className="top-user" onClick={()=>void supabase.auth.signOut()}><div className="profile-avatar">{(profile.full_name || user.email || 'FS').slice(0,2).toUpperCase()}</div><span>{profile.full_name || user.email}</span><span className="role-chip">{roleLabels[profile.role]}</span><ChevronDown size={14}/></button></div></header>
      <div className="content">
        {active === 'Team members' ? <section className="team-panel"><div className="panel-heading"><div><div className="panel-title-row"><h2>Team members</h2><span className="total-chip">{teamMembers.length} accounts</span></div><p>Roles control what each person can view and change.</p></div></div>{isAdmin ? <><div className="team-admin-note"><ShieldCheck size={16}/><span>Invite accounts in Supabase Auth. New accounts start as Warehouse Staff.</span><a href="https://supabase.com/dashboard/project/eyndywxiqmrafdayzsco/auth/users" target="_blank" rel="noreferrer">Open user invites <ArrowUpRight size={13}/></a></div><div className="team-list"><div className="team-row team-header"><span>TEAM MEMBER</span><span>ACCESS ROLE</span></div>{teamLoading ? <div className="team-empty">Loading team members…</div> : teamMembers.length ? teamMembers.map(member=><div className="team-row" key={member.id}><div className="team-identity"><div className="profile-avatar">{(member.full_name || member.email || 'FS').slice(0,2).toUpperCase()}</div><div><b>{member.full_name || 'Team member'}</b><small>{member.email}</small></div></div><label className="team-role-select"><span className="sr-only">Role for {member.email}</span><select value={member.role} disabled={member.id===user.id} onChange={e=>void changeTeamRole(member.id,e.target.value as TeamRole)}><option value="admin">Admin</option><option value="store_manager">Store Manager</option><option value="warehouse_staff">Warehouse Staff</option></select>{member.id===user.id&&<small>Your role</small>}</label></div>) : <div className="team-empty">No team members yet.</div>}</div></> : <div className="team-empty permission-empty"><ShieldCheck size={20}/><b>Admin access required</b><span>Only admins can view the team list or change roles.</span></div>}</section> : <>
        <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-icon"><Sparkles size={13}/></span> {dateLabel}</div><h1>Good morning, {profile.full_name || user.email?.split('@')[0] || 'there'} <span>☀️</span></h1><p>Here’s what’s happening across your inventory today.</p></div><div className="heading-actions"><button className="button button-secondary" onClick={()=>setDialog('import')}><Upload size={16}/> Import</button><button className="button button-primary" onClick={()=>setDialog('add')}><Plus size={17}/> Add item</button></div></div>

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
          <div className="table-footer"><span>Showing <b>{visible.length ? `1–${visible.length}` : '0'}</b> of <b>{items.length}</b> items</span><span>Inventory is protected by your {roleLabels[profile.role]} access</span></div>
        </section>

        <div className="bottom-grid"><section className="insight-card"><div className="insight-head"><div className="insight-icon"><Tag size={16}/></div><div><h3>Markdown opportunity</h3><p>Save products before they go to waste.</p></div><button className="text-link" onClick={()=>setFilter('On markdown')}>View all <ArrowUpRight size={13}/></button></div>{markdownCandidates.length ? markdownCandidates.map(item=><div className="markdown-row" key={item.id}><div className="markdown-product"><span className="mini-thumb">{item.category==='Dairy'?'🥛':item.category==='Bakery'?'🍞':'🥬'}</span><div><b>{item.name}</b><small>{item.quantity} {item.unit} · {expiryState(item.expiry_date).text.toLowerCase()}</small></div></div><div className="markdown-prices"><span>{money(item.price)}</span><ArrowDown size={13}/><b>{money(Math.round(item.price*0.8*100)/100)}</b><small>−20%</small></div>{canManagePricing&&<button className="markdown-apply" onClick={()=>void applyMarkdown(item)}>Apply</button>}</div>) : <div className="insight-empty">No unmarked items are nearing expiry.</div>}</section>
          <section className="activity-card"><div className="activity-heading"><div><h3>Recent activity</h3><p>Inventory updates are recorded securely.</p></div></div><div className="activity-list"><div className="activity-item"><span className="activity-dot dot-green"><ShieldCheck size={13}/></span><div><b>Audit trail enabled</b><p>Changes to inventory batches are logged.</p><small>Access is limited by your team role.</small></div></div></div></section></div>
        <footer className="footer"><span><ShieldCheck size={14}/> Your inventory is synced and secure</span><span>FreshStock <b>·</b> Last synced just now</span></footer>
        </>}
      </div>
    </section>

    {dialog&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setDialog(null)}}><section className="modal"><div className="modal-heading"><div><span className="modal-kicker">{dialog==='add'?'NEW ARRIVAL':dialog==='import'?'BULK UPLOAD':'YOUR WORKSPACE'}</span><h2>{dialog==='add'?'Add an inventory item':dialog==='import'?'Import from Excel':'Sign in to FreshStock'}</h2><p>{dialog==='add'?'Enter the details for this stock batch.':dialog==='import'?'Bring in a vendor manifest and we’ll map it to your inventory.':'Use your team account to access live inventory.'}</p></div><button className="icon-button" onClick={()=>setDialog(null)} aria-label="Close"><X size={18}/></button></div>
      {dialog==='add'?<form onSubmit={addItem} className="modal-form"><label>Product name<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Organic baby spinach"/></label><div className="form-row"><label>SKU<input required value={form.sku} onChange={e=>setForm({...form,sku:e.target.value})} placeholder="PRD-2050"/></label><label>Category<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}><option>Produce</option><option>Dairy</option><option>Bakery</option><option>Meat & seafood</option><option>Other</option></select></label></div><div className="form-row"><label>Quantity<input required type="number" min="0" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})} placeholder="24"/></label><label>Unit<select value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})}><option>cases</option><option>units</option><option>crates</option><option>trays</option><option>boxes</option></select></label><label>Unit price<input required type="number" min="0" step="0.01" value={form.price} onChange={e=>setForm({...form,price:e.target.value})} placeholder="0.00"/></label></div><div className="form-row"><label>Batch number<input required value={form.batch_number} onChange={e=>setForm({...form,batch_number:e.target.value})} placeholder="BATCH-001"/></label><label>Expiry date<input required type="date" value={form.expiry_date} onChange={e=>setForm({...form,expiry_date:e.target.value})}/></label></div><label>Supplier<input value={form.supplier} onChange={e=>setForm({...form,supplier:e.target.value})} placeholder="Supplier name"/></label><div className="modal-actions"><button type="button" className="button button-secondary" onClick={()=>setDialog(null)}>Cancel</button><button className="button button-primary" disabled={busy}>{busy?'Saving…':<><Plus size={16}/> Add to inventory</>}</button></div></form>:dialog==='import'?<div className="import-content"><label className="upload-zone"><input type="file" accept=".xlsx,.xls" onChange={e=>saveImport(e.target.files?.[0])}/><div className="upload-icon"><FileSpreadsheet size={23}/></div><b>Drop your Excel file here</b><span>or <u>browse files</u> · .xlsx or .xls, up to 10 MB</span><span className="upload-cta"><Upload size={14}/> Choose file</span></label><div className="import-note"><div><FileSpreadsheet size={17}/></div><p><b>Use our import template</b><br/>Your file should include SKU, name, category, quantity, price, batch_number and expiry_date.</p><button onClick={()=>exportXlsx('Import template')}><Download size={14}/> Get template</button></div><div className="modal-actions"><button className="button button-secondary" onClick={()=>setDialog(null)}>Cancel</button></div></div>:<form className="modal-form" onSubmit={signIn}><label>Email<input name="email" type="email" required placeholder="you@store.com"/></label><label>Password<input name="password" type="password" required placeholder="Your password"/></label><div className="modal-actions"><button type="button" className="button button-secondary" onClick={()=>setDialog(null)}>Cancel</button><button className="button button-primary">Sign in</button></div><p className="auth-footnote">No account yet? Invite your team through Supabase Auth to get started.</p></form>}
    </section></div>}
    {toast&&<div className="toast"><span><Check size={14}/></span>{toast}</div>}
  </main>;
}
