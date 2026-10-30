import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine, ArrowRight, BadgePercent, Boxes, ChartNoAxesCombined,
  ChevronDown, ChevronLeft, ChevronRight, CircleAlert, ClipboardList,
  LayoutDashboard, LoaderCircle, LogOut, Menu, Package, Pencil, Plus,
  Search, Settings2, Shapes, ShoppingBag, Tag, Trash2, Truck, Users, Wallet, X,
} from 'lucide-react';
import { apiRequest } from '../api.js';
import { DataTable } from '../components/DataTable.jsx';
import { displayName, errorMessage, formatDate, formatMoney, recordId } from '../utils/admin.js';

export function Dashboard({ token, user, permissions, onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [range, setRange] = useState(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 29);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!permissions.has('dashboard.view')) {
      setLoading(false);
      return undefined;
    }
    let alive = true;
    setLoading(true);
    apiRequest('/reports/dashboard', { token, query: range }).then((response) => {
      if (alive) { setData(response.data); setError(''); }
    }).catch((requestError) => { if (alive) setError(errorMessage(requestError)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [permissions, range, reload, token]);
  const sales = data?.salesByDay || data?.sales_by_day || [];
  const orderCount = data?.totalOrders ?? data?.orders?.total ?? data?.orderCount ?? '—';
  const revenue = data?.revenue ?? data?.totalRevenue ?? data?.sales ?? 0;
  const lowStock = data?.lowStockVariations || data?.low_stock_variations || [];
  const recentOrders = data?.recentOrders || data?.recent_orders || [];
  const otherMetrics = [
    ['Products', data?.catalog?.products ?? data?.productCount ?? data?.productsCount, 'products'],
    ['Customers', data?.customerCount ?? data?.customersCount, 'customers'],
    ['Active coupons', data?.couponUsage ?? data?.coupon_usage ?? '—', 'coupons'],
  ];
  return <>
    <div className="page-heading"><div><span className="eyebrow">STORE OVERVIEW</span><h1>Welcome, {displayName(user)}</h1><p>Here’s what’s happening across your store.</p></div><div className="dashboard-range"><input aria-label="From date" type="date" value={range.from} onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))} /><span>to</span><input aria-label="To date" type="date" value={range.to} onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))} /><button className="button button-light" type="button" onClick={() => setReload((value) => value + 1)}>Refresh</button></div></div>
    {error && <div className="notice notice-error" role="alert"><CircleAlert size={16} />{error}</div>}
    {permissions.has('dashboard.view') ? <>
      <section className="metric-grid live-metric-grid">
        <button type="button" className="metric-card live-metric-card" onClick={() => onNavigate('orders')}><span className="metric-icon"><ClipboardList size={18} /></span><strong className="metric-value">{loading ? '—' : orderCount}</strong><span className="metric-label">Orders in range</span><span className="metric-link">View orders <ArrowRight size={14} /></span></button>
        <button type="button" className="metric-card live-metric-card" onClick={() => onNavigate('orders')}><span className="metric-icon"><Wallet size={18} /></span><strong className="metric-value metric-money">{loading ? '—' : formatMoney(revenue)}</strong><span className="metric-label">Revenue</span><span className="metric-link">Review orders <ArrowRight size={14} /></span></button>
        {otherMetrics.map(([label, value, target]) => <button type="button" className="metric-card live-metric-card" key={label} onClick={() => onNavigate(target)}><span className="metric-icon"><Package size={18} /></span><strong className="metric-value">{loading ? '—' : value ?? '—'}</strong><span className="metric-label">{label}</span><span className="metric-link">Manage {label.toLowerCase()} <ArrowRight size={14} /></span></button>)}
      </section>
      <div className="dashboard-columns">
        <section className="data-card dashboard-panel"><div className="data-toolbar"><div><strong>Sales by day</strong><span>API report</span></div><ChartNoAxesCombined size={18} /></div>{loading ? <div className="panel-empty">Loading report…</div> : sales.length ? <div className="sales-list">{sales.slice(-14).map((point, index) => <div className="sales-row" key={point.date || point.day || index}><span>{formatDate(point.date || point.day)}</span><div className="sales-track"><i style={{ width: `${Math.max(4, Math.min(100, Number(point.revenue || point.sales || 0) / Math.max(1, ...sales.map((entry) => Number(entry.revenue || entry.sales || 0))) * 100))}%` }} /></div><strong>{formatMoney(point.revenue ?? point.sales)}</strong></div>)}</div> : <div className="panel-empty">No sales data for this date range.</div>}</section>
        <section className="data-card dashboard-panel"><div className="data-toolbar"><div><strong>Low stock</strong><span>{lowStock.length} variations</span></div></div><div className="quick-list">{loading ? <div className="panel-empty">Loading…</div> : lowStock.slice(0, 6).map((item, index) => <div className="quick-row" key={recordId(item) || index}><span className="quick-avatar"><Package size={15} /></span><span className="quick-name"><strong>{item.productName || item.product_name || item.name || item.sku || 'Product variation'}</strong><small>{item.sku || item.variationSku || item.variation_sku || 'Variation'}</small></span><span className="stock-count">{item.availableStock ?? item.available_stock ?? item.stockQuantity ?? item.stock_quantity ?? '—'} left</span></div>)}{!loading && !lowStock.length && <div className="panel-empty">Stock levels look healthy.</div>}</div></section>
      </div>
      <section className="data-card dashboard-panel recent-panel"><div className="data-toolbar"><div><strong>Recent orders</strong><span>Latest activity</span></div><button type="button" className="text-action" onClick={() => onNavigate('orders')}>All orders <ArrowRight size={13} /></button></div><DataTable columns={[{ key: 'number', label: 'Order' }, { key: 'customer', label: 'Customer' }, { key: 'total', label: 'Total' }, { key: 'status', label: 'Status' }]} items={recentOrders.slice(0, 5)} loading={loading} emptyText="No recent orders." renderCell={(order, key) => key === 'number' ? order.orderNumber || order.order_number || order.number || recordId(order) : key === 'customer' ? order.customer?.name || order.customerName || order.customer_name || '—' : key === 'total' ? formatMoney(order.totalAmount ?? order.total_amount ?? order.total) : <span className={`status-pill status-${order.status}`}>{order.status || '—'}</span>} /></section>
    </> : <section className="welcome-card live-welcome-card"><div><span className="eyebrow">EDHYAA STORE</span><h2>Your workspace is ready.</h2><p>Your account can access the pages available in the navigation.</p></div><Package size={42} /></section>}
  </>;
}
