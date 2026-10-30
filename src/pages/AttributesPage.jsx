import { useEffect, useState } from 'react';
import { LoaderCircle, Pencil, Plus, Trash2, X } from 'lucide-react';
import { apiRequest } from '../api.js';
import { DataTable } from '../components/DataTable.jsx';
import { errorMessage } from '../utils/admin.js';

const emptyAttribute = { name: '', displayType: 'text', sortOrder: '0' };

function attributeIdOf(attribute) { return attribute?.id; }

export default function AttributesPage({ token, permissions }) {
  const [attributes, setAttributes] = useState([]);
  const [attributesLoading, setAttributesLoading] = useState(true);
  const [selectedAttribute, setSelectedAttribute] = useState(null);
  const [values, setValues] = useState([]);
  const [valuesLoading, setValuesLoading] = useState(false);
  const [valueInput, setValueInput] = useState('');
  const [valueColorCode, setValueColorCode] = useState('');
  const [editingValue, setEditingValue] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState(emptyAttribute);
  const [newAttributeValue, setNewAttributeValue] = useState('');
  const [initialValues, setInitialValues] = useState([]);
  const canCreate = permissions.has('products.create');
  const canUpdate = permissions.has('products.update');
  const canDelete = permissions.has('products.delete');

  async function loadAttributes() {
    setAttributesLoading(true);
    try {
      const response = await apiRequest('/products/attributes', { token });
      setAttributes(response.data || []);
      setError('');
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setAttributesLoading(false); }
  }

  useEffect(() => { loadAttributes(); }, [token]);

  async function loadValues(attribute) {
    setSelectedAttribute(attribute);
    setValuesLoading(true);
    setError('');
    try {
      const response = await apiRequest(`/products/attributes/${attributeIdOf(attribute)}/values`, { token });
      setValues(response.data || []);
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setValuesLoading(false); }
  }

  function openEditor(attribute = null) {
    setError('');
    setForm(attribute ? {
      name: attribute.name || '',
      displayType: attribute.displayType || attribute.display_type || 'text',
      sortOrder: String(attribute.sortOrder ?? attribute.sort_order ?? 0),
    } : emptyAttribute);
    setInitialValues([]);
    setNewAttributeValue('');
    setEditor(attribute || {});
  }

  async function saveAttribute(event) {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) { setError('Attribute name is required.'); return; }
    const isEditing = Boolean(editor?.id);
    const valueLabels = initialValues.map((value) => value.trim()).filter(Boolean);
    if (!isEditing && valueLabels.length === 0) { setError('Add at least one value for this attribute.'); return; }
    if (!isEditing && new Set(valueLabels.map((value) => value.toLocaleLowerCase())).size !== valueLabels.length) { setError('Remove duplicate values before creating this attribute.'); return; }
    const body = isEditing
      ? { name, displayType: form.displayType, sortOrder: Math.max(0, Math.trunc(Number(form.sortOrder) || 0)) }
      : { name, values: valueLabels };
    setBusyId('attribute');
    setError('');
    try {
      await apiRequest(isEditing ? `/products/attributes/${attributeIdOf(editor)}` : '/products/attributes', {
        method: isEditing ? 'PATCH' : 'POST', token, body,
      });
      setEditor(null);
      setNotice(isEditing ? 'Shared attribute updated.' : 'Shared attribute created and ready to assign to products.');
      await loadAttributes();
      if (selectedAttribute && selectedAttribute.id === editor?.id) {
        const updated = { ...selectedAttribute, ...body };
        setSelectedAttribute(updated);
        await loadValues(updated);
      }
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setBusyId(''); }
  }

  async function saveValue(event) {
    event.preventDefault();
    const value = valueInput.trim();
    if (!value || !selectedAttribute) return;
    const url = `/products/attributes/${attributeIdOf(selectedAttribute)}/values`;
    const editing = Boolean(editingValue);
    setBusyId('value');
    setError('');
    try {
      await apiRequest(editing ? `${url}/${editingValue.id}` : url, {
        method: editing ? 'PATCH' : 'POST', token, body: { value, ...(valueColorCode ? { colorCode: valueColorCode } : {}) },
      });
      setValueInput('');
      setValueColorCode('');
      setEditingValue(null);
      await loadValues(selectedAttribute);
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setBusyId(''); }
  }

  async function deleteValue(item) {
    if (!window.confirm(`Delete the shared value “${item.value}”? This affects every product using ${selectedAttribute.name}.`)) return;
    setBusyId(`value-${item.id}`);
    setError('');
    try {
      await apiRequest(`/products/attributes/${attributeIdOf(selectedAttribute)}/values/${item.id}`, { method: 'DELETE', token });
      await loadValues(selectedAttribute);
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setBusyId(''); }
  }

  return <>
    <div className="page-heading"><div><span className="eyebrow">CATALOGUE</span><h1>Product attributes</h1><p>Create shared attributes and values, then assign them to any product.</p></div>{canCreate && <button type="button" className="button button-primary" onClick={() => openEditor()}><Plus size={15} /> Create attribute</button>}</div>
    {error && <div className="form-error" role="alert">{error}</div>}
    {notice && <div className="editor-help" role="status">{notice}</div>}

    {editor && <section className="data-card attribute-create-card"><div className="data-toolbar"><div><strong>{editor.id ? 'Edit shared attribute' : 'Create shared attribute'}</strong><span>Attribute definitions and values are shared by every assigned product.</span></div></div>
      <form className="resource-form" onSubmit={saveAttribute}>
        <label className="field"><span>Name <b>*</b></span><input required maxLength={100} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Size" /></label>
        {editor.id && <><label className="field"><span>Display type</span><select value={form.displayType} onChange={(event) => setForm((current) => ({ ...current, displayType: event.target.value }))}><option value="text">Text</option><option value="color">Color</option><option value="image">Image</option></select></label>
        <label className="field"><span>Sort order</span><input type="number" min="0" step="1" value={form.sortOrder} onChange={(event) => setForm((current) => ({ ...current, sortOrder: event.target.value }))} /></label></>}
        {!editor.id && <div className="field field-wide"><span>Attribute values <b>*</b></span><div className="attribute-entry-row"><input aria-label="Attribute value" maxLength={100} value={newAttributeValue} onChange={(event) => setNewAttributeValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); const value = newAttributeValue.trim(); if (value && !initialValues.some((item) => item.toLocaleLowerCase() === value.toLocaleLowerCase())) setInitialValues((items) => [...items, value]); setNewAttributeValue(''); } }} placeholder="Type a value and press Enter" /><button type="button" className="button button-primary" onClick={() => { const value = newAttributeValue.trim(); if (value && !initialValues.some((item) => item.toLocaleLowerCase() === value.toLocaleLowerCase())) setInitialValues((items) => [...items, value]); setNewAttributeValue(''); }}><Plus size={14} /> Add</button></div><small className="attribute-entry-help">Add each value separately, such as S, M, and L for Size.</small>{initialValues.length > 0 && <div className="attribute-value-chips" aria-label="Added attribute values">{initialValues.map((value) => <span className="attribute-value-chip" key={value}>{value}<button type="button" aria-label={`Remove ${value}`} onClick={() => setInitialValues((items) => items.filter((item) => item !== value))}><X size={13} /></button></span>)}</div>}</div>}
        <div className="modal-actions field-wide"><button type="button" className="button button-light" onClick={() => setEditor(null)}>Cancel</button><button className="button button-primary" disabled={busyId === 'attribute'}>{busyId === 'attribute' ? <LoaderCircle className="spin" size={15} /> : editor.id ? 'Save changes' : 'Create attribute'}</button></div>
      </form>
    </section>}

    <div className="attribute-workspace">
      <section className="data-card"><div className="data-toolbar"><div><strong>Shared attribute library</strong><span>{attributes.length} total</span></div></div>
        <DataTable columns={[{ key: 'name', label: 'Attribute' }, { key: 'displayType', label: 'Display type' }, { key: 'slug', label: 'Slug' }]} items={attributes} loading={attributesLoading} emptyText="No shared attributes yet. Create one to reuse it across products." renderCell={(item, key) => key === 'displayType' ? item.displayType || item.display_type || 'text' : item[key] || '—'} actions={(attribute) => <><button type="button" className="button button-light button-small" onClick={() => loadValues(attribute)}>Values</button>{canUpdate && <button type="button" className="icon-button" aria-label={`Edit ${attribute.name}`} onClick={() => openEditor(attribute)}><Pencil size={14} /></button>}</>} />
      </section>

      {selectedAttribute && <section className="data-card attribute-values-card"><div className="data-toolbar"><div><strong>{selectedAttribute.name} values</strong><span>Shared across all assigned products</span></div><button type="button" className="icon-button" aria-label="Close attribute values" onClick={() => { setSelectedAttribute(null); setValues([]); setEditingValue(null); setValueInput(''); setValueColorCode(''); }}><X size={16} /></button></div>
        {(canCreate || (editingValue && canUpdate)) && <form className="attribute-value-form" onSubmit={saveValue}><label className="field"><span>{editingValue ? 'Edit value' : 'Add value'}</span><input required maxLength={100} value={valueInput} onChange={(event) => setValueInput(event.target.value)} placeholder="e.g. XXL" /></label>{(selectedAttribute.displayType === 'color' || selectedAttribute.display_type === 'color') && <label className="field"><span>Color code (optional)</span><input type="color" value={valueColorCode || '#000000'} onChange={(event) => setValueColorCode(event.target.value)} /></label>}<div><button className="button button-primary" disabled={busyId === 'value' || (editingValue ? !canUpdate : !canCreate)}>{busyId === 'value' ? <LoaderCircle className="spin" size={14} /> : editingValue ? 'Save value' : 'Add value'}</button>{editingValue && <button type="button" className="button button-light" onClick={() => { setEditingValue(null); setValueInput(''); setValueColorCode(''); }}>Cancel</button>}</div></form>}
        <DataTable columns={[{ key: 'value', label: 'Value' }, { key: 'slug', label: 'Slug' }]} items={values} loading={valuesLoading} emptyText="No values added yet." renderCell={(item, key) => item[key] || '—'} actions={(item) => <>{canUpdate && <button type="button" className="icon-button" aria-label={`Edit value ${item.value}`} onClick={() => { setEditingValue(item); setValueInput(item.value); setValueColorCode(item.colorCode || item.color_code || ''); }}><Pencil size={14} /></button>}{canDelete && <button type="button" className="icon-button danger-button" disabled={busyId === `value-${item.id}`} aria-label={`Delete value ${item.value}`} onClick={() => deleteValue(item)}><Trash2 size={14} /></button>}</>} />
      </section>}
    </div>
  </>;
}
