import { useState } from 'react';
import { BadgePercent, CircleAlert, Pencil, Plus, Search, X } from 'lucide-react';
import { apiRequest } from '../api.js';
import { ResourceDetails } from '../AdminModules.jsx';
import { DataTable, Pager, usePagedList } from '../components/DataTable.jsx';
import { definitions } from '../config/resources.js';
import { errorMessage, formatDate, formatMoney, recordId } from '../utils/admin.js';
import { ResourceEditor } from './ResourcePage.jsx';

const OFFER_LABELS = {
  percentage_off: 'Percentage off',
  fixed_off: 'Fixed amount off',
  buy_x_get_y: 'Buy X, get Y',
  app_coins: 'App coins',
};

function offerDescription(coupon) {
  if (coupon.offerType === 'percentage_off') {
    const discount = coupon.discountValue === '' || coupon.discountValue == null ? '—' : coupon.discountValue;
    const cap = coupon.maxDiscountAmount === '' || coupon.maxDiscountAmount == null
      ? ''
      : ` · max ${formatMoney(coupon.maxDiscountAmount)}`;
    return `${discount}% off${cap}`;
  }
  if (coupon.offerType === 'fixed_off') {
    return coupon.discountValue === '' || coupon.discountValue == null
      ? '—'
      : `${formatMoney(coupon.discountValue)} off`;
  }
  if (coupon.offerType === 'buy_x_get_y') {
    return `Buy ${coupon.buyQuantity ?? '—'}, get ${coupon.freeQuantity ?? '—'} free`;
  }
  if (coupon.offerType === 'app_coins') {
    return `${coupon.coinReward ?? '—'} coins`;
  }
  return '—';
}

function validity(coupon) {
  const startsAt = coupon.startsAt ? formatDate(coupon.startsAt) : 'Immediately';
  const expiresAt = coupon.expiresAt ? formatDate(coupon.expiresAt) : 'No expiry';
  return <span className="coupon-validity">{startsAt}<span>to {expiresAt}</span></span>;
}

export default function CouponsPage({ token, permissions }) {
  const resource = definitions.coupons;
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const list = usePagedList(resource.path, token, { search, status: status || undefined });
  const [editor, setEditor] = useState(null);
  const [detailRecord, setDetailRecord] = useState(null);
  const [busyId, setBusyId] = useState('');
  const canCreate = permissions.has('coupons.create');
  const canUpdate = permissions.has('coupons.update');
  const canDelete = permissions.has('coupons.delete');

  async function save(payload) {
    const editing = Boolean(editor.record);
    await apiRequest(
      editing ? `${resource.path}/${recordId(editor.record)}` : resource.path,
      { method: editing ? 'PATCH' : 'POST', token, body: payload },
    );
    setEditor(null);
    list.refresh();
  }

  async function remove(coupon) {
    if (!window.confirm(`Delete coupon "${coupon.code}"?`)) return;
    setBusyId(recordId(coupon));
    list.setError('');
    try {
      await apiRequest(`${resource.path}/${recordId(coupon)}`, { method: 'DELETE', token });
      list.refresh();
    } catch (requestError) {
      list.setError(errorMessage(requestError));
    } finally {
      setBusyId('');
    }
  }

  if (editor) {
    return (
      <ResourceEditor
        resourceKey="coupons"
        record={editor.record}
        token={token}
        permissions={permissions}
        onClose={() => setEditor(null)}
        onSave={save}
      />
    );
  }

  const columns = [
    { key: 'code', label: 'Coupon code' },
    { key: 'offerType', label: 'Offer' },
    { key: 'offerValue', label: 'Benefit' },
    { key: 'minimumOrderValue', label: 'Minimum order' },
    { key: 'validity', label: 'Validity' },
    { key: 'usage', label: 'Usage limit' },
    { key: 'status', label: 'Status' },
  ];

  function renderCell(coupon, key) {
    if (key === 'offerType') return OFFER_LABELS[coupon.offerType] || coupon.offerType || '—';
    if (key === 'offerValue') return offerDescription(coupon);
    if (key === 'minimumOrderValue') {
      return coupon.minimumOrderValue === '' || coupon.minimumOrderValue == null
        ? 'No minimum'
        : formatMoney(coupon.minimumOrderValue);
    }
    if (key === 'validity') return validity(coupon);
    if (key === 'usage') {
      return coupon.usageLimit === '' || coupon.usageLimit == null
        ? 'Unlimited'
        : `${coupon.usageLimit} total${coupon.perCustomerLimit ? ` · ${coupon.perCustomerLimit} per customer` : ''}`;
    }
    if (key === 'status') {
      return <span className={`status-pill status-${coupon.status || 'unknown'}`}>{coupon.status || '—'}</span>;
    }
    return coupon[key] ?? '—';
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">OFFERS · COUPONS</span>
          <h1>Coupons &amp; offers</h1>
          <p>Create and manage discount codes, buy-X-get-Y deals, and app coin rewards.</p>
        </div>
        {canCreate && <button type="button" className="button button-primary" onClick={() => setEditor({ record: null })}><Plus size={16} /> Create offer</button>}
      </div>

      {list.error && (
        <div className="notice notice-error" role="alert">
          <CircleAlert size={16} />
          <span>{list.error}</span>
          <button type="button" aria-label="Dismiss error" onClick={() => list.setError('')}><X size={15} /></button>
        </div>
      )}

      <section className="data-card">
        <div className="data-toolbar">
          <div><strong><BadgePercent size={17} /> Offer codes</strong><span>{list.pagination.total} total</span></div>
          <form className="list-filters" onSubmit={(event) => { event.preventDefault(); list.setPage(1); setSearch(searchInput.trim()); }}>
            <label className="search-field list-search" aria-label="Search coupons">
              <Search size={16} />
              <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search coupon codes" />
            </label>
            <select aria-label="Filter coupons by status" value={status} onChange={(event) => { setStatus(event.target.value); list.setPage(1); }}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <button type="submit" className="button button-light">Search</button>
          </form>
        </div>
        <DataTable
          columns={columns}
          items={list.items}
          loading={list.loading}
          emptyText="No coupons or offers found."
          renderCell={renderCell}
          actions={(coupon) => (
            <>
              <button className="button button-light button-small" type="button" onClick={() => setDetailRecord(coupon)}>View</button>
              {canUpdate && <button className="icon-button" type="button" aria-label={`Edit coupon ${coupon.code}`} onClick={() => setEditor({ record: coupon })}><Pencil size={15} /></button>}
              {canDelete && <button className="icon-button danger-button" type="button" aria-label={`Delete coupon ${coupon.code}`} disabled={busyId === recordId(coupon)} onClick={() => remove(coupon)}><X size={15} /></button>}
            </>
          )}
        />
        <Pager pagination={list.pagination} page={list.page} setPage={list.setPage} loading={list.loading} />
      </section>

      {detailRecord && <ResourceDetails title="Coupon details" path={`${resource.path}/${recordId(detailRecord)}`} token={token} onClose={() => setDetailRecord(null)} />}
    </>
  );
}
