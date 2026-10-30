import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine, ArrowRight, BadgePercent, Boxes, ChartNoAxesCombined,
  ChevronDown, ChevronLeft, ChevronRight, CircleAlert, ClipboardList,
  LayoutDashboard, LoaderCircle, LogOut, Menu, Package, Pencil, Plus,
  Search, Settings2, Shapes, ShoppingBag, Tag, Trash2, Truck, Users, Wallet, X,
} from 'lucide-react';
import { apiRequest } from '../api.js';
import { CategoryDetails, MediaImage } from '../AdminModules.jsx';
import { usePagedList } from '../components/DataTable.jsx';
import { errorMessage, normalize, recordId } from '../utils/admin.js';
import { slugify } from '../utils/slug.js';

export function CategoryPage({ token, permissions }) {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1, limit: 12 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState(null);
  const [details, setDetails] = useState(null);
  const [busyId, setBusyId] = useState('');
  const [categoryImage, setCategoryImage] = useState(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageNotice, setImageNotice] = useState('');
  const categoryImageInput = useRef(null);
  const canCreate = permissions.has('categories.create');
  const canUpdate = permissions.has('categories.update');
  const canDelete = permissions.has('categories.delete');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    apiRequest('/categories', {
      token,
      query: { page, limit: 12, search, status: status || undefined, sortBy: 'sort_order' },
    }).then((response) => {
      if (alive) {
        const nextItems = (response.data || []).map(normalize);
        const nextPagination = response.pagination || { total: nextItems.length, totalPages: 1, limit: 12 };
        setPagination(nextPagination);
        if (page > Math.max(1, nextPagination.totalPages || 1)) {
          setPage(Math.max(1, nextPagination.totalPages || 1));
          return;
        }
        setItems(nextItems);
      }
    }).catch((requestError) => { if (alive) setError(errorMessage(requestError)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [token, page, search, status, refreshKey]);

  function openEditor(category = null) {
    const item = normalize(category || {});
    setCategoryImage(null);
    setImageNotice('');
    setEditor({
      record: category,
      form: {
        name: item.name || '', description: item.description || '',
        imageUrl: item.imageUrl || '', seoTitle: item.seoTitle || '', seoDescription: item.seoDescription || '',
        seoKeywords: item.seoKeywords || '', status: item.status || 'active', sortOrder: item.sortOrder ?? 0,
      },
    });
  }

  async function postCategoryImage(file) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError('Choose a JPEG, PNG, or WebP image no larger than 5 MB.');
      throw new Error('Choose a JPEG, PNG, or WebP image no larger than 5 MB.');
    }
    const response = await apiRequest('/categories/images/upload', {
      method: 'POST', token, rawBody: file, contentType: file.type,
    });
    const imageUrl = response.data?.imageUrl || response.data?.image_url;
    if (!imageUrl) throw new Error('The upload succeeded but the API did not return an image URL.');
    return imageUrl;
  }

  async function uploadCategoryImage() {
    if (!categoryImage) return;
    setImageUploading(true);
    setError('');
    try {
      const imageUrl = await postCategoryImage(categoryImage);
      updateCategoryImageUrl(imageUrl);
      setCategoryImage(null);
      setImageNotice('Image uploaded. Save the category to attach it to this record.');
      if (categoryImageInput.current) categoryImageInput.current.value = '';
    } catch (uploadError) {
      setError(errorMessage(uploadError));
    } finally {
      setImageUploading(false);
    }
  }

  function updateCategoryImageUrl(imageUrl) {
    setEditor((current) => ({
      ...current,
      form: { ...current.form, imageUrl },
    }));
  }

  async function saveCategory(event) {
    event.preventDefault();
    setError('');
    const { record, form } = editor;
    if (!form.name.trim() || !Number.isInteger(Number(form.sortOrder)) || Number(form.sortOrder) < 0) {
      setError('Enter a name and non-negative whole-number sort order.');
      return;
    }
    if (!record) {
      if (!slugify(form.name.trim())) { setError('Enter a name containing letters or numbers to generate its slug.'); return; }
    }
    setBusyId('saving');
    try {
      let imageUrl = form.imageUrl || null;
      if (categoryImage) {
        setImageUploading(true);
        imageUrl = await postCategoryImage(categoryImage);
        updateCategoryImageUrl(imageUrl);
        setCategoryImage(null);
        setImageNotice('Image uploaded. Saving category…');
        if (categoryImageInput.current) categoryImageInput.current.value = '';
      }
      const payload = {
        name: form.name.trim(), description: form.description || null, imageUrl,
        seoTitle: form.seoTitle || null, seoDescription: form.seoDescription || null,
        seoKeywords: form.seoKeywords || null, status: form.status, sortOrder: Number(form.sortOrder),
      };
      if (!record) payload.slug = slugify(payload.name);
      if (record) {
        const original = normalize(record);
        Object.keys(payload).forEach((key) => {
          if ((payload[key] === null && !original[key]) || JSON.stringify(payload[key]) === JSON.stringify(original[key])) delete payload[key];
        });
        if (!Object.keys(payload).length) { setError('Change at least one field before saving.'); return; }
      }
      await apiRequest(record ? `/categories/${recordId(record)}` : '/categories', {
        method: record ? 'PATCH' : 'POST', token, body: payload,
      });
      setEditor(null);
      setImageNotice('');
      setRefreshKey((current) => current + 1);
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setBusyId(''); setImageUploading(false); }
  }

  async function removeCategory(category) {
    if (!window.confirm(`Delete "${category.name}"?`)) return;
    setBusyId(recordId(category));
    setError('');
    try {
      await apiRequest(`/categories/${recordId(category)}`, { method: 'DELETE', token });
      if (items.length === 1 && page > 1) setPage((current) => current - 1);
      else setRefreshKey((current) => current + 1);
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setBusyId(''); }
  }

  if (editor) {
    const update = (name, value) => setEditor((current) => ({
      ...current,
      form: { ...current.form, [name]: value },
    }));
    const form = editor.form;
    return <>
      <div className="page-heading category-heading"><div><span className="eyebrow">CATALOGUE · CATEGORIES</span><h1>{editor.record ? 'Edit category' : 'Add category'}</h1><p>{editor.record ? 'Update category information and storefront details.' : 'Create a category to organize products in your store.'}</p></div><button className="button button-light" type="button" onClick={() => setEditor(null)}><ChevronLeft size={15} /> Back to categories</button></div>
      {error && <div className="notice notice-error" role="alert"><CircleAlert size={16} />{error}</div>}
      <section className="data-card category-editor-page">
        <div className="category-preview"><div className="category-preview-image">{form.imageUrl ? <MediaImage src={form.imageUrl} alt="" /> : <Shapes size={28} />}</div><div><span className="eyebrow">LIVE PREVIEW</span><h2>{form.name || 'Category name'}</h2><span className={`status-pill status-${form.status}`}>{form.status}</span></div></div>
        <form className="entity-form category-form" onSubmit={saveCategory}><div className="editor-grid">
          {imageNotice && <div className="editor-help field-wide" role="status">{imageNotice}</div>}
          <label className="field"><span>Category name <b>*</b></span><input required minLength={2} maxLength={150} value={form.name} onChange={(event) => update('name', event.target.value)} /></label>
          <label className="field"><span>Status</span><select value={form.status} onChange={(event) => update('status', event.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
          <label className="field"><span>Sort order</span><input required type="number" min="0" step="1" value={form.sortOrder} onChange={(event) => update('sortOrder', event.target.value)} /></label>
          <label className="field field-wide"><span>Description</span><textarea rows={3} value={form.description} onChange={(event) => update('description', event.target.value)} /></label>
          <div className="field field-wide category-image-field">
            <label className="field"><span>Upload category image (JPEG, PNG, WebP; max 5 MB)</span><input ref={categoryImageInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { setCategoryImage(event.target.files?.[0] || null); setImageNotice(''); setError(''); }} /><small>Choose a file; Save category uploads it and attaches it automatically.</small></label>
            <button type="button" className="button button-light" disabled={!categoryImage || imageUploading} onClick={uploadCategoryImage}>{imageUploading ? <><LoaderCircle className="spin" size={15} /> Uploading…</> : 'Upload image'}</button>
          </div>
          <label className="field field-wide"><span>Image URL</span><input type="url" value={form.imageUrl} onChange={(event) => update('imageUrl', event.target.value)} placeholder="Upload an image above or paste a public image URL" /></label>
          <div className="field-section-title field-wide">Search engine details</div>
          <label className="field"><span>SEO title</span><input value={form.seoTitle} onChange={(event) => update('seoTitle', event.target.value)} /></label>
          <label className="field"><span>SEO keywords</span><input value={form.seoKeywords} onChange={(event) => update('seoKeywords', event.target.value)} /></label>
          <label className="field field-wide"><span>SEO description</span><textarea rows={3} value={form.seoDescription} onChange={(event) => update('seoDescription', event.target.value)} /></label>
        </div><div className="modal-actions"><button type="button" className="button button-light" onClick={() => { setEditor(null); setCategoryImage(null); }}>Cancel</button><button className="button button-primary" disabled={busyId === 'saving' || imageUploading}>{busyId === 'saving' ? <LoaderCircle className="spin" size={15} /> : editor.record ? 'Save category' : 'Create category'}</button></div></form>
      </section>
    </>;
  }

  return <>
    <div className="page-heading"><div><span className="eyebrow">CATALOGUE MANAGEMENT</span><h1>Categories</h1><p>Browse, organize, and update the categories in your store.</p></div>{canCreate && <button type="button" className="button button-primary" onClick={() => openEditor()}><Plus size={16} /> Add category</button>}</div>
    {error && <div className="notice notice-error" role="alert"><CircleAlert size={16} /><span>{error}</span><button type="button" aria-label="Dismiss error" onClick={() => setError('')}><X size={15} /></button></div>}
    <section className="data-card category-index-card"><div className="data-toolbar"><div><strong>All categories</strong><span>{pagination.total || 0} total</span></div><form className="list-filters" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(searchInput.trim()); }}><label className="search-field list-search"><Search size={16} /><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search categories" /></label><select aria-label="Filter categories by status" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select><button className="button button-light">Search</button></form></div>
      {loading && <div className="category-loading"><LoaderCircle className="spin" size={19} /> Loading categories…</div>}
      {!loading && !items.length && <div className="category-empty"><Shapes size={28} /><strong>No categories found</strong><span>{search || status ? 'Try changing your search or status filter.' : 'Create a category to start organizing products.'}</span>{canCreate && !search && !status && <button className="button button-primary" type="button" onClick={() => openEditor()}><Plus size={15} /> Add your first category</button>}</div>}
      {!loading && items.length > 0 && <div className="category-grid">{items.map((category) => <article className="category-card" key={recordId(category)}><div className="category-card-image">{category.imageUrl ? <MediaImage src={category.imageUrl} alt="" /> : <Shapes size={27} />}</div><div className="category-card-content"><div className="category-card-title"><h2>{category.name}</h2><span className={`status-pill status-${category.status}`}>{category.status || '—'}</span></div><span className="category-sort">Display order · {category.sortOrder ?? 0}</span><div className="category-card-actions"><button type="button" className="button button-light button-small" onClick={() => setDetails(category)}>Details</button>{canUpdate && <button type="button" className="button button-light button-small" onClick={() => openEditor(category)}><Pencil size={13} /> Edit</button>}{canDelete && <button type="button" className="button button-light button-small danger-button" disabled={busyId === recordId(category)} onClick={() => removeCategory(category)}>{busyId === recordId(category) ? <LoaderCircle className="spin" size={13} /> : <Trash2 size={13} />} Delete</button>}</div></div></article>)}</div>}
      <div className="pagination"><span>{pagination.total || 0} categories</span><div><button className="icon-button" type="button" aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={17} /></button><span>Page {page} of {Math.max(1, pagination.totalPages || 1)}</span><button className="icon-button" type="button" aria-label="Next page" disabled={page >= (pagination.totalPages || 1) || loading} onClick={() => setPage((current) => current + 1)}><ChevronRight size={17} /></button></div></div>
    </section>
    {details && <CategoryDetails category={details} token={token} onClose={() => setDetails(null)} />}
  </>;
}
