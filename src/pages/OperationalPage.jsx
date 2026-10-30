import { useEffect, useState } from 'react';
import {
  ArrowDownToLine, ArrowRight, BadgePercent, Boxes, ChartNoAxesCombined,
  ChevronDown, ChevronLeft, ChevronRight, CircleAlert, ClipboardList,
  CreditCard, LayoutDashboard, LoaderCircle, LogOut, Menu, Package, Pencil, Plus, Power,
  Search, Settings2, Shapes, ShoppingBag, Tag, Trash2, Truck, Users, Wallet, X,
} from 'lucide-react';
import {
  ActionDialog, CreateOrder, CustomerDetails, InitializeInventory, InventoryDetails,
  OrderReturns, ResourceDetails,
} from '../AdminModules.jsx';
import { apiRequest } from '../api.js';
import { operations } from '../config/resources.js';
import { DataTable, Pager, usePagedList } from '../components/DataTable.jsx';
import { errorMessage, formatDate, formatMoney, recordId } from '../utils/admin.js';
import { slugify } from '../utils/slug.js';

function PageFrame({ title, group, description, actions, children }) {
  return <><div className="page-heading"><div><span className="eyebrow">{group}</span><h1>{title}</h1><p>{description}</p></div>{actions}</div>{children}</>;
}

function PaymentProviderEditor({ provider, busy, onClose, onSave }) {
  const [form, setForm] = useState({
    name: provider?.name || '',
    active: provider?.active ?? true,
    publicKey: provider?.publicKey || provider?.public_key || '',
    secretKey: '',
    webhookSecret: '',
  });
  function update(name, value) { setForm((current) => ({ ...current, [name]: value })); }
  function submit(event) {
    event.preventDefault();
    const body = {
      name: form.name.trim(),
      active: form.active,
      publicKey: form.publicKey.trim(),
      ...(form.secretKey ? { secretKey: form.secretKey } : {}),
      ...(form.webhookSecret ? { webhookSecret: form.webhookSecret } : {}),
      ...(!provider ? { slug: slugify(form.name) } : {}),
    };
    onSave(body);
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal-card provider-editor" role="dialog" aria-modal="true" aria-labelledby="provider-editor-title">
      <div className="modal-top"><div className="modal-heading modal-heading-compact"><h2 id="provider-editor-title">{provider ? 'Edit Payment Provider' : 'Add Payment Provider'}</h2></div><button className="icon-button modal-close" type="button" aria-label="Close dialog" onClick={onClose}><X size={18} /></button></div>
      <div className="provider-form-section"><div className="provider-form-heading"><CreditCard size={17} /><strong>Provider Details</strong></div>
        <form className="provider-form" onSubmit={submit}>
          <label className="field"><span>Name <b>*</b></span><input required minLength={2} value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="e.g. Stripe, Razorpay" /></label>
          <label className="featured-control provider-active"><input type="checkbox" checked={form.active} onChange={(event) => update('active', event.target.checked)} /><span>Active</span></label>
          <label className="field field-wide"><span>Public key</span><input autoComplete="off" value={form.publicKey} onChange={(event) => update('publicKey', event.target.value)} placeholder="pk_live_…" /></label>
          <label className="field"><span>Secret key</span><input autoComplete="new-password" type="password" value={form.secretKey} onChange={(event) => update('secretKey', event.target.value)} placeholder={provider ? 'Leave blank to keep saved key' : 'sk_live_…'} /></label>
          <label className="field"><span>Webhook secret</span><input autoComplete="new-password" type="password" value={form.webhookSecret} onChange={(event) => update('webhookSecret', event.target.value)} placeholder={provider ? 'Leave blank to keep saved secret' : 'Optional'} /></label>
          {provider && <p className="provider-secret-help field-wide">Secret values are never displayed. Leave either secret field blank to keep its saved value.</p>}
          <div className="provider-form-actions field-wide"><button type="button" className="button button-light" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : provider ? 'Save changes' : 'Create Provider'}</button></div>
        </form>
      </div>
    </section>
  </div>;
}

export function OperationalPage({ page, token, permissions }) {
  const config = operations[page];
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const listConfig = page === 'inventory' ? { path: '/inventory', filters: { search } }
    : page === 'customers' ? { path: '/customers', filters: { search } }
      : page === 'orders' ? { path: '/orders', filters: { search } } : null;
  const list = usePagedList(listConfig?.path || null, token, listConfig?.filters || {});
  const [providers, setProviders] = useState([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providerEditor, setProviderEditor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({});
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [showInitializeInventory, setShowInitializeInventory] = useState(false);
  const [shipmentDetails, setShipmentDetails] = useState(null);
  const [actionDialog, setActionDialog] = useState(null);
  const [selectedInventory, setSelectedInventory] = useState(null);

  useEffect(() => {
    if (page !== 'payments' || !permissions.has('settings.view')) return undefined;
    let alive = true;
    setProvidersLoading(true);
    apiRequest('/settings/payment-providers', { token }).then((response) => {
      if (!alive) return;
      const data = response.data;
      setProviders(Array.isArray(data) ? data : data?.providers || []);
      setError('');
    }).catch((requestError) => { if (alive) setError(errorMessage(requestError)); })
      .finally(() => { if (alive) setProvidersLoading(false); });
    return () => { alive = false; };
  }, [page, permissions, token]);

  async function reloadProviders() {
    setProvidersLoading(true);
    try {
      const response = await apiRequest('/settings/payment-providers', { token });
      const data = response.data;
      setProviders(Array.isArray(data) ? data : data?.providers || []);
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setProvidersLoading(false); }
  }

  async function saveProvider(body) {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const editing = Boolean(providerEditor && !providerEditor.create);
      const path = editing ? `/settings/payment-providers/${recordId(providerEditor)}` : '/settings/payment-providers';
      const response = await apiRequest(path, { method: editing ? 'PATCH' : 'POST', token, body });
      setProviderEditor(null);
      setNotice(response.message || (editing ? 'Payment provider updated.' : 'Payment provider created.'));
      await reloadProviders();
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setBusy(false); }
  }

  async function toggleProvider(provider) {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const response = await apiRequest(`/settings/payment-providers/${recordId(provider)}`, { method: 'PATCH', token, body: { active: !provider.active } });
      setNotice(response.message || `Payment provider ${provider.active ? 'disabled' : 'enabled'}.`);
      await reloadProviders();
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setBusy(false); }
  }

  async function deleteProvider(provider) {
    if (!window.confirm(`Delete payment provider “${provider.name}”?`)) return;
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const response = await apiRequest(`/settings/payment-providers/${recordId(provider)}`, { method: 'DELETE', token });
      setNotice(response.message || 'Payment provider deleted.');
      await reloadProviders();
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setBusy(false); }
  }

  async function runAction(action, id, body = {}) {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const result = await action(id, body);
      setNotice(result?.message || 'Action completed successfully.');
      list.refresh();
      return result;
    } catch (requestError) {
      setError(errorMessage(requestError));
      return null;
    } finally { setBusy(false); }
  }

  async function submitDialogAction(action) {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const result = await action();
      setNotice(result?.message || 'Action completed successfully.');
      list.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function updateOrderStatus(order) {
    setActionDialog({
      title: `Update order ${order.orderNumber || order.order_number || ''} status`,
      fields: [{ name: 'status', label: 'Next status', required: true }, { name: 'note', label: 'Note' }],
      initial: { status: order.status || '' },
      onSubmit: async (body) => submitDialogAction(() => apiRequest(`/orders/${recordId(order)}/status`, { method: 'PATCH', token, body })),
    });
  }

  async function updateCustomer(customer) {
    setActionDialog({
      title: `Update ${customer.name || customer.email || 'customer'}`,
      fields: [{ name: 'status', label: 'Account status', type: 'select', required: true, options: ['active', 'suspended'] }],
      initial: { status: customer.status || 'active' },
      onSubmit: async (body) => submitDialogAction(() => apiRequest(`/customers/${recordId(customer)}`, { method: 'PATCH', token, body })),
    });
  }

  async function inventoryTransaction(item) {
    const variationId = item.variationId || item.variation_id || item.variation?.id || item.id;
    const productId = item.productId || item.product_id || item.product?.id;
    if (!productId || !variationId) {
      setError('This inventory row does not include the product and variation IDs required for a stock transaction.');
      return;
    }
    const path = `/products/${productId}/variations/${variationId}/inventory/transactions`;
    setActionDialog({
      title: 'Record inventory transaction',
      fields: [
        { name: 'action', label: 'Action', type: 'select', required: true, options: ['receive', 'adjust', 'reserve', 'release', 'sale'] },
        { name: 'quantity', label: 'Quantity (adjust uses new physical total)', type: 'number', min: 0.01, required: true },
        { name: 'reason', label: 'Reason', required: true },
      ],
      initial: { action: 'receive', reason: 'Admin adjustment' },
      onSubmit: async (body) => {
        if (!Number.isFinite(body.quantity) || body.quantity <= 0) {
          setError('Enter a positive quantity.');
          return false;
        }
        return submitDialogAction(() => apiRequest(path, { method: 'POST', token, body }));
      },
    });
  }

  async function paymentFormSubmit(event) {
    event.preventDefault();
    const orderId = form.orderId?.trim();
    if (!orderId) { setError('Enter an order UUID.'); return; }
    const action = form.action;
    const body = action === 'refund'
      ? { amount: Number(form.amount), idempotencyKey: form.idempotencyKey, reason: form.reason || undefined }
      : action === 'cod'
        ? { reference: form.reference || undefined, note: form.reason || undefined }
        : {};
    if (action === 'refund' && (!Number.isFinite(body.amount) || body.amount <= 0 || !body.idempotencyKey)) { setError('Enter a positive refund amount and a unique idempotency key.'); return; }
    const path = action === 'refund' ? `/payments/orders/${orderId}/refunds` : action === 'cod' ? `/payments/orders/${orderId}/mark-cod-paid` : `/payments/orders/${orderId}`;
    const result = await runAction(() => apiRequest(path, { method: 'POST', token, body }));
    if (result && action === 'online') setNotice('Payment session created. Use the returned provider order details in the checkout flow.');
  }

  async function trackShipment(event) {
    event.preventDefault();
    const shipmentId = form.shipmentId?.trim();
    if (!shipmentId) { setError('Enter a shipment UUID.'); return; }
    const result = await runAction(() => apiRequest(`/shipments/${shipmentId}/track`, { token }));
    if (result?.data) setNotice(`Tracking details refreshed: ${JSON.stringify(result.data)}`);
  }

  async function loadShipmentDetails() {
    const shipmentId = form.shipmentId?.trim();
    if (!shipmentId) { setError('Enter a shipment UUID.'); return; }
    const result = await runAction(() => apiRequest(`/shipments/${shipmentId}`, { token }));
    if (result?.data) setShipmentDetails(result.data);
  }

  const columns = page === 'inventory'
    ? [{ key: 'name', label: 'Product / variation' }, { key: 'sku', label: 'SKU' }, { key: 'physical', label: 'Physical' }, { key: 'reserved', label: 'Reserved' }, { key: 'available', label: 'Available' }, { key: 'threshold', label: 'Low stock at' }]
    : page === 'customers'
      ? [{ key: 'name', label: 'Customer' }, { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' }, { key: 'status', label: 'Status' }, { key: 'joined', label: 'Joined' }]
      : [{ key: 'order', label: 'Order' }, { key: 'customer', label: 'Customer' }, { key: 'total', label: 'Total' }, { key: 'payment', label: 'Payment' }, { key: 'status', label: 'Status' }, { key: 'date', label: 'Date' }];
  function cell(item, key) {
    const display = {
      name: item.productName || item.product_name || item.name || item.product?.name || '—',
      sku: item.sku || item.variationSku || item.variation_sku || '—',
      physical: item.physicalStock ?? item.physical_stock ?? item.stockQuantity ?? item.stock_quantity ?? '—',
      reserved: item.reservedStock ?? item.reserved_stock ?? item.reserved ?? '—',
      available: item.availableStock ?? item.available_stock ?? item.available ?? '—',
      threshold: item.lowStockThreshold ?? item.low_stock_threshold ?? '—',
      email: item.email || '—', phone: item.phone || '—', joined: formatDate(item.createdAt || item.created_at),
      order: item.orderNumber || item.order_number || item.number || recordId(item),
      customer: item.customer?.name || item.customerName || item.customer_name || '—',
      total: formatMoney(item.totalAmount ?? item.total_amount ?? item.total),
      payment: item.paymentStatus || item.payment_status || '—',
      status: <span className={`status-pill status-${item.status || 'unknown'}`}>{item.status || '—'}</span>,
      date: formatDate(item.createdAt || item.created_at || item.orderDate || item.order_date),
    };
    if (key === 'status') return display.status;
    return display[key] ?? item[key] ?? '—';
  }

  if (page === 'payments') {
    const providerColumns = [
      { key: 'number', label: '#' }, { key: 'name', label: 'Name' },
      { key: 'publicKey', label: 'Public key' }, { key: 'secretKey', label: 'Secret key' },
      { key: 'webhookSecret', label: 'Webhook' }, { key: 'status', label: 'Status' },
    ];
    return <PageFrame title={config.title} group="SETTINGS" description={config.description}
      actions={permissions.has('settings.update') && <button type="button" className="button button-primary provider-add-button" onClick={() => setProviderEditor({ create: true })}><Plus size={16} /> Add Provider</button>}>
    {error && <div className="notice notice-error" role="alert"><CircleAlert size={16} />{error}</div>}{notice && <div className="notice notice-success" role="status">{notice}</div>}
    {permissions.has('settings.view') && <section className="data-card provider-catalog-card"><div className="data-toolbar"><div><CreditCard size={17} /><strong>All Payment Providers</strong><span>{providers.length} provider{providers.length === 1 ? '' : 's'}</span></div></div>
      <DataTable columns={providerColumns} items={providers} loading={providersLoading} emptyText="No payment providers have been added yet." renderCell={(provider, key) => {
        if (key === 'number') return provider.id ?? provider.public_id ?? '—';
        if (key === 'publicKey') {
          const publicKey = provider.publicKey || provider.public_key;
          return publicKey ? <code className="provider-key" title={publicKey}>{publicKey.length > 22 ? `${publicKey.slice(0, 18)}…` : publicKey}</code> : '—';
        }
        if (key === 'secretKey') return (provider.hasSecretKey ?? provider.has_secret_key) ? <span className="provider-secret-mask" aria-label="Secret key saved">••••••••</span> : '—';
        if (key === 'webhookSecret') return <span className={`provider-webhook ${provider.hasWebhookSecret ?? provider.has_webhook_secret ? 'is-configured' : ''}`}>{(provider.hasWebhookSecret ?? provider.has_webhook_secret) ? 'Configured' : '—'}</span>;
        if (key === 'status') return <span className={`status-pill ${provider.active ? 'status-active' : 'status-inactive'}`}>{provider.active ? 'Active' : 'Inactive'}</span>;
        return provider[key] ?? '—';
      }} actions={permissions.has('settings.update') ? (provider) => <>
        <button type="button" className={`icon-button provider-toggle ${provider.active ? 'is-on' : ''}`} title={provider.active ? 'Disable provider' : 'Enable provider'} aria-label={provider.active ? `Disable ${provider.name}` : `Enable ${provider.name}`} disabled={busy} onClick={() => toggleProvider(provider)}><Power size={15} /></button>
        <button type="button" className="icon-button" title="Edit provider" aria-label={`Edit ${provider.name}`} disabled={busy} onClick={() => setProviderEditor(provider)}><Pencil size={15} /></button>
        <button type="button" className="icon-button danger-button" title="Delete provider" aria-label={`Delete ${provider.name}`} disabled={busy} onClick={() => deleteProvider(provider)}><Trash2 size={15} /></button>
      </> : undefined} />
      <p className="provider-integration-note">Provider records store configuration details. Adding a gateway does not enable checkout automatically; the backend currently processes online payments through Razorpay.</p>
    </section>}
    {permissions.has('payments.manage') && <section className="data-card operation-card"><div className="data-toolbar"><div><strong>Order payment actions</strong><span>Online checkout, refund, or record COD collection</span></div><Wallet size={18} /></div><form className="operation-form operation-grid" onSubmit={paymentFormSubmit}><label className="field"><span>Order UUID</span><input required value={form.orderId || ''} onChange={(event) => setForm((current) => ({ ...current, orderId: event.target.value }))} placeholder="Order public ID" /></label><label className="field"><span>Action</span><select value={form.action || 'online'} onChange={(event) => setForm((current) => ({ ...current, action: event.target.value }))}><option value="online">Start online payment</option><option value="refund">Request refund</option><option value="cod">Mark COD as paid</option></select></label>{form.action === 'refund' && <><label className="field"><span>Refund amount (₹)</span><input required type="number" min="0.01" step="0.01" value={form.amount || ''} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} /></label><label className="field"><span>Idempotency key</span><input required value={form.idempotencyKey || ''} onChange={(event) => setForm((current) => ({ ...current, idempotencyKey: event.target.value }))} /></label></>}{form.action === 'cod' && <label className="field"><span>Collection reference</span><input value={form.reference || ''} onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))} /></label>}{form.action !== 'online' && <label className="field field-wide"><span>Reason / note</span><input value={form.reason || ''} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} /></label>}<div className="field-wide"><button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : 'Run payment action'}</button></div></form></section>}
    {permissions.has('orders.view') && <section className="data-card operation-card"><div className="data-toolbar"><div><strong>Refund history</strong><span>Look up refunds by order UUID</span></div></div><form className="operation-form inline-operation" onSubmit={async (event) => { event.preventDefault(); const id = form.refundOrderId?.trim(); if (!id) return; const result = await runAction(() => apiRequest(`/payments/orders/${id}/refunds`, { token })); if (result?.data) setNotice(JSON.stringify(result.data)); }}><label className="field"><span>Order UUID</span><input required value={form.refundOrderId || ''} onChange={(event) => setForm((current) => ({ ...current, refundOrderId: event.target.value }))} /></label><button className="button button-light" disabled={busy}>Load refunds</button></form></section>}
    {providerEditor && <PaymentProviderEditor provider={providerEditor.create ? null : providerEditor} busy={busy} onClose={() => setProviderEditor(null)} onSave={saveProvider} />}
  </PageFrame>;
  }

  if (page === 'shipments') return <PageFrame title={config.title} group={config.group} description={config.description}>
    {error && <div className="notice notice-error" role="alert"><CircleAlert size={16} />{error}</div>}{notice && <div className="notice notice-success">{notice}</div>}
    {permissions.has('shipping.manage') && <section className="data-card operation-card"><div className="data-toolbar"><div><strong>Create shipment</strong><span>Shiprocket shipment for an existing order</span></div><Truck size={18} /></div><form className="operation-form operation-grid" onSubmit={async (event) => { event.preventDefault(); const orderId = form.shipOrderId?.trim(); const weightKg = Number(form.weightKg); if (!orderId || weightKg <= 0) { setError('Enter an order UUID and positive shipment weight.'); return; } const body = { weightKg, ...(form.lengthCm ? { lengthCm: Number(form.lengthCm) } : {}), ...(form.breadthCm ? { breadthCm: Number(form.breadthCm) } : {}), ...(form.heightCm ? { heightCm: Number(form.heightCm) } : {}) }; const result = await runAction((id, payload) => apiRequest(`/shipments/orders/${id}`, { method: 'POST', token, body: payload }), orderId, body); if (result?.data?.id) setForm((current) => ({ ...current, shipmentId: result.data.id })); }}><label className="field"><span>Order UUID</span><input required value={form.shipOrderId || ''} onChange={(event) => setForm((current) => ({ ...current, shipOrderId: event.target.value }))} /></label>{['weightKg', 'lengthCm', 'breadthCm', 'heightCm'].map((field) => <label className="field" key={field}><span>{{ weightKg: 'Weight (kg)', lengthCm: 'Length (cm)', breadthCm: 'Breadth (cm)', heightCm: 'Height (cm)' }[field]}</span><input type="number" min="0.01" step="any" required={field === 'weightKg'} value={form[field] || ''} onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))} /></label>)}<div className="field-wide"><button className="button button-primary" disabled={busy}>Create shipment</button></div></form></section>}
    <section className="data-card operation-card"><div className="data-toolbar"><div><strong>Shipment actions</strong><span>Read details, dispatch, or refresh tracking</span></div><ArrowDownToLine size={18} /></div><form className="operation-form inline-operation" onSubmit={trackShipment}><label className="field"><span>Shipment UUID</span><input required value={form.shipmentId || ''} onChange={(event) => { setShipmentDetails(null); setForm((current) => ({ ...current, shipmentId: event.target.value })); }} /></label><button className="button button-light" type="button" disabled={busy} onClick={loadShipmentDetails}>View details</button><button className="button button-light" disabled={busy}>Refresh tracking</button>{permissions.has('shipping.manage') && <button className="button button-primary" type="button" disabled={busy || !form.shipmentId} onClick={() => runAction((id) => apiRequest(`/shipments/${id}/dispatch`, { method: 'POST', token }), form.shipmentId)}>Dispatch</button>}</form>{shipmentDetails && <pre className="json-result">{JSON.stringify(shipmentDetails, null, 2)}</pre>}</section>
  </PageFrame>;

  const hasWriteAction = page === 'inventory' ? permissions.has('inventory.adjust') : page === 'customers' ? permissions.has('customers.update') : page === 'orders' ? permissions.has('orders.update_status') || permissions.has('orders.create') : false;
  return <PageFrame title={config.title} group={config.group} description={config.description}>
    {error && <div className="notice notice-error" role="alert"><CircleAlert size={16} /><span>{error}</span><button type="button" aria-label="Dismiss error" onClick={() => setError('')}><X size={15} /></button></div>}{notice && <div className="notice notice-success" role="status">{notice}</div>}
    <section className="data-card"><div className="data-toolbar"><div><strong>{config.title}</strong><span>{list.pagination.total} total</span></div><div className="toolbar-actions">
      {page === 'inventory' && permissions.has('inventory.adjust') && <button type="button" className="button button-primary" onClick={() => setShowInitializeInventory(true)}><Plus size={15} /> Initialize stock</button>}
      {page === 'orders' && permissions.has('orders.create') && <button type="button" className="button button-primary" onClick={() => setShowCreateOrder(true)}><Plus size={15} /> Create order</button>}
      <form className="list-filters" onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); list.setPage(1); }}><label className="search-field list-search"><Search size={16} /><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder={`Search ${page}`} /></label><button className="button button-light">Search</button></form></div></div>
      <DataTable columns={columns} items={list.items} loading={list.loading} emptyText={`No ${page} found.`} renderCell={cell} actions={page === 'inventory' ? (item) => <>{permissions.has('inventory.view') && <button className="button button-light button-small" type="button" onClick={() => setSelectedInventory(item)}>History</button>}{permissions.has('inventory.adjust') && <button className="button button-light button-small" type="button" disabled={busy} onClick={() => inventoryTransaction(item)}>Adjust stock</button>}</> : page === 'customers' ? (item) => <>{permissions.has('customers.view') && <button className="button button-light button-small" type="button" onClick={() => setSelectedCustomer(item)}>Details &amp; orders</button>}{permissions.has('customers.update') && <button className="button button-light button-small" type="button" disabled={busy} onClick={() => updateCustomer(item)}>Update status</button>}</> : page === 'orders' ? (item) => <>{permissions.has('orders.view') && <button className="button button-light button-small" type="button" onClick={() => setSelectedOrder({ ...item, viewDetails: true })}>Details</button>}{permissions.has('orders.update_status') && <button className="button button-light button-small" type="button" disabled={busy} onClick={() => updateOrderStatus(item)}>Update status</button>}{(permissions.has('orders.view') || permissions.has('orders.create')) && <button className="button button-light button-small" type="button" onClick={() => setSelectedOrder(item)}>Returns</button>}</> : undefined} />
      <Pager pagination={list.pagination} page={list.page} setPage={list.setPage} loading={list.loading} />
    </section>
    {selectedCustomer && <CustomerDetails customer={selectedCustomer} token={token} canManageAddresses={permissions.has('customers.update')} onClose={() => { setSelectedCustomer(null); list.refresh(); }} />}
    {selectedOrder?.viewDetails && <ResourceDetails title="Order details" path={`/orders/${recordId(selectedOrder)}`} token={token} onClose={() => setSelectedOrder(null)} />}
    {selectedOrder && !selectedOrder.viewDetails && <OrderReturns order={selectedOrder} token={token} permissions={permissions} onClose={() => { setSelectedOrder(null); list.refresh(); }} />}
    {showCreateOrder && <CreateOrder token={token} onClose={() => setShowCreateOrder(false)} onCreated={(result) => { setShowCreateOrder(false); setNotice(result.message || 'Order created.'); list.refresh(); }} />}
    {showInitializeInventory && <InitializeInventory token={token} onClose={() => setShowInitializeInventory(false)} onCreated={() => { setShowInitializeInventory(false); setNotice('Inventory initialized.'); list.refresh(); }} />}
    {selectedInventory && <InventoryDetails item={selectedInventory} token={token} onClose={() => setSelectedInventory(null)} />}
    {actionDialog && <ActionDialog title={actionDialog.title} fields={actionDialog.fields} initial={actionDialog.initial} onClose={() => setActionDialog(null)} onSubmit={actionDialog.onSubmit} />}
  </PageFrame>;
}
