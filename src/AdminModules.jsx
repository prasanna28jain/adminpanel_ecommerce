import { useEffect, useRef, useState } from 'react';
import { CircleAlert, LoaderCircle, Plus, Trash2, X } from 'lucide-react';
import { API_BASE_URL, apiRequest, resolveMediaUrl } from './api.js';
import { slugify } from './utils/slug.js';

function idOf(record) {
  return record?.public_id || record?.id || record?.uuid || '';
}

function errorMessage(error) {
  if (error?.details?.length) return error.details.map((detail) => detail.message).filter(Boolean).join(' ');
  return error?.message || 'Something went wrong. Please try again.';
}

function Modal({ title, onClose, children, wide = false }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={`modal-card ${wide ? 'modal-card-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-top"><div className="modal-heading modal-heading-compact"><h2>{title}</h2></div><button className="icon-button modal-close" type="button" aria-label="Close dialog" onClick={onClose}><X size={18} /></button></div>
      {children}
    </section>
  </div>;
}

function Notice({ error }) {
  return error ? <div className="notice notice-error" role="alert"><CircleAlert size={16} />{error}</div> : null;
}

export function MediaImage({ src, alt = '', className }) {
  const resolved = resolveMediaUrl(src);
  const [currentSrc, setCurrentSrc] = useState(resolved);
  const [triedAlternate, setTriedAlternate] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setCurrentSrc(resolved);
    setTriedAlternate(false);
    setFailed(false);
  }, [resolved]);

  function handleError() {
    if (!triedAlternate) {
      setTriedAlternate(true);
      try {
        const failedUrl = new URL(currentSrc);
        const apiPrefix = new URL(API_BASE_URL, window.location.origin).pathname.replace(/\/+$/, '');
        if (apiPrefix && apiPrefix !== '/' && failedUrl.pathname.startsWith('/uploads/')) {
          failedUrl.pathname = `${apiPrefix}${failedUrl.pathname}`;
          setCurrentSrc(failedUrl.href);
          return;
        }
      } catch { /* show the unavailable state below */ }
    }
    setFailed(true);
  }

  if (!src || failed) return <span className="media-image-failed" title={currentSrc || 'No image URL'}>Image unavailable</span>;
  // Force a CORS fetch instead of a no-cors image request. The backend's
  // Cross-Origin-Resource-Policy blocks the latter when admin runs on :5173.
  return <img className={className} src={currentSrc} alt={alt} crossOrigin="anonymous" onError={handleError} />;
}

function EditorForm({ fields, initial = {}, onSave, onCancel, saveLabel, generateSlug = false, attributeOptions = [] }) {
  const [form, setForm] = useState(() => Object.fromEntries(fields.map((field) => {
    let value = initial[field.name];
    if (field.type === 'json') value = JSON.stringify(value || [], null, 2);
    if (field.type === 'attribute-values') {
      value = Object.fromEntries((value || []).map((selection) => {
        const attributeValue = selection.attributeValue || selection.attribute_value || {};
        const attributeId = selection.attributeId
          ?? selection.attribute_id
          ?? selection.attribute?.id
          ?? attributeValue.attributeId
          ?? attributeValue.attribute_id
          ?? attributeValue.attribute?.id;
        const attributeValueId = selection.attributeValueId
          ?? selection.attribute_value_id
          ?? selection.valueId
          ?? selection.value_id
          ?? attributeValue.id
          ?? selection.value?.id;
        const matchingAttribute = attributeOptions.find((attribute) => (
          String(idOf(attribute)) === String(attributeId)
          || (attribute.values || []).some((option) => String(idOf(option)) === String(attributeValueId))
        ));
        return [
          String(attributeId ?? idOf(matchingAttribute) ?? ''),
          String(attributeValueId ?? ''),
        ];
      }).filter(([attributeId, attributeValueId]) => attributeId && attributeValueId));
    }
    return [field.name, value ?? (
      field.type === 'checkbox' ? false
        : field.type === 'attribute-values' ? {}
          : field.type === 'select' ? field.options?.[0] || ''
            : ''
    )];
  })));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setError('');
    const body = {};
    try {
      fields.forEach(({ name, type }) => {
        let value = form[name];
        if (type === 'number' && value !== '') value = Number(value);
        if (type === 'json') value = JSON.parse(value);
        if (type === 'attribute-values') {
          value = Object.entries(value)
            .filter(([, attributeValueId]) => attributeValueId)
            .map(([attributeId, attributeValueId]) => ({ attributeId: Number(attributeId), attributeValueId: Number(attributeValueId) }));
        }
        if (initial[name] !== undefined && JSON.stringify(value) === JSON.stringify(initial[name])) return;
        if (value !== '' && value !== undefined) body[name] = value;
      });
      if (generateSlug && (fields.some((field) => field.name === 'name') || fields.some((field) => field.name === 'value'))) {
        const source = form.name ?? form.value;
        body.slug = slugify(source);
        if (!body.slug) throw new Error('Enter a name containing letters or numbers to generate its slug.');
      }
      if (!Object.keys(body).length) {
        setError('Change at least one field before saving.');
        return;
      }
    } catch (parseError) {
      setError(parseError instanceof SyntaxError ? 'Enter valid JSON.' : errorMessage(parseError));
      return;
    }
    setBusy(true);
    try { await onSave(body); } catch (saveError) { setError(errorMessage(saveError)); }
    finally { setBusy(false); }
  }
  return <form className="entity-form" onSubmit={submit}>
    <div className="editor-grid">{fields.map((field) => {
      const value = form[field.name];
      if (field.type === 'checkbox') return <label className="featured-control" key={field.name}><input type="checkbox" checked={Boolean(value)} onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.checked }))} /><span>{field.label}</span></label>;
      if (field.type === 'attribute-values') return <div className="field field-wide variation-attribute-fields" key={field.name}>
        <span>{field.label}</span>
        {!attributeOptions.length && <span className="editor-help">Assign attributes to this product before selecting variation options. You can still save a variation without attribute values.</span>}
        {attributeOptions.map((attribute) => <label className="field" key={idOf(attribute)}><span>{attribute.name}</span><select value={value?.[String(idOf(attribute))] || ''} onChange={(event) => setForm((current) => ({ ...current, [field.name]: { ...current[field.name], [String(idOf(attribute))]: event.target.value } }))}><option value="">Choose {attribute.name}</option>{(attribute.values || []).map((attributeValue) => <option key={idOf(attributeValue)} value={idOf(attributeValue)}>{attributeValue.value || attributeValue.name}</option>)}</select></label>)}
      </div>;
      const control = { required: field.required, value, onChange: (event) => setForm((current) => ({ ...current, [field.name]: event.target.value })) };
      return <label className={`field ${field.type === 'json' || field.type === 'textarea' ? 'field-wide' : ''}`} key={field.name}><span>{field.label}{field.required && <b> *</b>}</span>{field.type === 'select' ? <select {...control}>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}</select> : field.type === 'json' || field.type === 'textarea' ? <textarea rows={field.rows || 4} {...control} /> : <input type={field.type || 'text'} min={field.min} step={field.type === 'number' ? 'any' : undefined} {...control} />}</label>;
    })}</div>
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="modal-actions"><button type="button" className="button button-light" onClick={onCancel}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={15} /> : saveLabel}</button></div>
  </form>;
}

const productFields = {
  image: [{ name: 'imageUrl', label: 'Image URL', required: true }, { name: 'altText', label: 'Alt text' }, { name: 'sortOrder', label: 'Sort order', type: 'number' }, { name: 'isPrimary', label: 'Primary image', type: 'checkbox' }],
  attribute: [{ name: 'name', label: 'Name', required: true }, { name: 'displayType', label: 'Display type', required: true }, { name: 'sortOrder', label: 'Sort order', type: 'number' }],
  attributeCreate: [{ name: 'name', label: 'Name', required: true }, { name: 'values', label: 'Values (JSON array of strings)', type: 'json', required: true }],
  value: [{ name: 'value', label: 'Value', required: true }, { name: 'colorCode', label: 'Color code' }, { name: 'sortOrder', label: 'Sort order', type: 'number' }],
  variation: [{ name: 'sku', label: 'SKU', required: true }, { name: 'price', label: 'Price (₹)', type: 'number', required: true }, { name: 'salePrice', label: 'Sale price (₹)', type: 'number' }, { name: 'costPrice', label: 'Cost price (₹)', type: 'number' }, { name: 'taxRate', label: 'Tax rate (%)', type: 'number' }, { name: 'status', label: 'Status', type: 'select', options: ['active', 'inactive'] }, { name: 'isDefault', label: 'Default variation', type: 'checkbox' }, { name: 'attributeValues', label: 'Attribute values', type: 'attribute-values' }],
};

function toCamel(item, pairs) {
  return pairs.reduce((result, [camel, snake]) => ({ ...result, [camel]: item[camel] ?? item[snake] }), item);
}

export function ProductResource({ product, token, permissions, onClose, initialTab = 'images' }) {
  const root = `/products/${idOf(product)}`;
  const [tab, setTab] = useState(initialTab);
  const [images, setImages] = useState([]);
  const [attributes, setAttributes] = useState([]);
  const [variationAttributeOptions, setVariationAttributeOptions] = useState([]);
  const [globalAttributes, setGlobalAttributes] = useState([]);
  const [globalAttributeId, setGlobalAttributeId] = useState('');
  const [variations, setVariations] = useState([]);
  const [values, setValues] = useState([]);
  const [selectedAttribute, setSelectedAttribute] = useState('');
  const [editor, setEditor] = useState(null);
  const [variationGenerator, setVariationGenerator] = useState(null);
  const [generationBusy, setGenerationBusy] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [primaryFile, setPrimaryFile] = useState(null);
  const [secondaryFiles, setSecondaryFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState('');
  const primaryImageInput = useRef(null);
  const secondaryImageInput = useRef(null);
  const [uploadOptions, setUploadOptions] = useState({ altText: '', sortOrder: 0 });
  const canCreate = permissions.has('products.create');
  const canUpdate = permissions.has('products.update');
  const canDelete = permissions.has('products.delete');

  async function load() {
    setError('');
    const [imageResult, attributeResult, variationResult, globalAttributeResult] = await Promise.all([
      apiRequest(`${root}/images`, { token }),
      apiRequest(`${root}/attributes`, { token }),
      apiRequest(`${root}/variations`, { token }),
      apiRequest('/products/attributes', { token }),
    ]);
    setImages(imageResult.data || []);
    setAttributes(attributeResult.data || []);
    setGlobalAttributes(globalAttributeResult.data || []);
    setVariations(variationResult.data || []);
  }
  useEffect(() => {
    let alive = true;
    load().catch((requestError) => { if (alive) setError(errorMessage(requestError)); });
    return () => { alive = false; };
  }, [root, token]);

  const collectionFor = (kind, attributeId) => kind === 'image' ? `${root}/images`
    : kind === 'attribute' ? `${root}/attributes`
      : kind === 'variation' ? `${root}/variations`
        : `/products/attributes/${attributeId}/values`;

  async function save(payload) {
    setBusy(true);
    setError('');
    try {
      const { kind, item, attributeId } = editor;
      const collection = collectionFor(kind, attributeId);
      const body = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== '' && value !== undefined));
      const target = kind === 'attribute' && item
        ? `/products/attributes/${idOf(item)}`
        : item ? `${collection}/${idOf(item)}` : collection;
      await apiRequest(target, { method: item ? 'PATCH' : 'POST', token, body });
      setEditor(null);
      await load();
      if (kind === 'value') await loadValues(attributeId);
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setBusy(false); }
  }

  async function loadValues(attributeId) {
    setSelectedAttribute(String(attributeId));
    setError('');
    try {
      const response = await apiRequest(`/products/attributes/${attributeId}/values`, { token });
      setValues(response.data || []);
    } catch (requestError) { setError(errorMessage(requestError)); }
  }

  async function assignGlobalAttribute() {
    if (!globalAttributeId) return;
    setBusy(true);
    setError('');
    try {
      await apiRequest(`${root}/attributes/${globalAttributeId}/assign`, { method: 'POST', token });
      setGlobalAttributeId('');
      await load();
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setBusy(false); }
  }

  async function openVariationEditor(item) {
    setBusy(true);
    setError('');
    try {
      const options = await Promise.all(attributes.map(async (attribute) => {
        const embeddedValues = attribute.values || attribute.attributeValues || attribute.attribute_values;
        if (Array.isArray(embeddedValues)) return { ...attribute, values: embeddedValues };
        const response = await apiRequest(`/products/attributes/${idOf(attribute)}/values`, { token });
        return { ...attribute, values: response.data || [] };
      }));
      setVariationAttributeOptions(options);
      setEditor({ kind: 'variation', ...(item ? { item: fieldsFor('variation', item) } : {}) });
    } catch (requestError) {
      setError(`Could not load product attribute options: ${errorMessage(requestError)}`);
    } finally {
      setBusy(false);
    }
  }

  async function openVariationGenerator() {
    setBusy(true);
    setError('');
    try {
      if (!attributes.length) {
        throw new Error('Assign at least one attribute to this product before generating variations.');
      }
      const options = await Promise.all(attributes.map(async (attribute) => {
        const embeddedValues = attribute.values || attribute.attributeValues || attribute.attribute_values;
        if (Array.isArray(embeddedValues)) return { ...attribute, values: embeddedValues };
        const response = await apiRequest(`/products/attributes/${idOf(attribute)}/values`, { token });
        return { ...attribute, values: response.data || [] };
      }));
      const emptyAttribute = options.find((attribute) => !attribute.values.length);
      if (emptyAttribute) throw new Error(`Add values to the ${emptyAttribute.name} attribute before generating variations.`);
      setVariationAttributeOptions(options);
      setVariationGenerator({ options });
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  function variationCombinationKey(attributeValues) {
    return attributeValues
      .map(({ attributeId, attributeValueId }) => `${attributeId}:${attributeValueId}`)
      .sort()
      .join('|');
  }

  function existingVariationKey(variation) {
    const selectedValues = variation.attributeValues
      || variation.attribute_values
      || variation.attributes
      || [];
    const normalizedValues = selectedValues.map((selection) => {
      const attributeValue = selection.attributeValue
        || selection.attribute_value
        || selection.value
        || {};
      return {
        attributeId: selection.attributeId
          ?? selection.attribute_id
          ?? selection.attribute?.id
          ?? selection.pivot?.attributeId
          ?? selection.pivot?.attribute_id
          ?? attributeValue.attributeId
          ?? attributeValue.attribute_id
          ?? attributeValue.attribute?.id
          ?? attributeValue.pivot?.attributeId
          ?? attributeValue.pivot?.attribute_id,
        attributeValueId: selection.attributeValueId
          ?? selection.attribute_value_id
          ?? selection.valueId
          ?? selection.value_id
          ?? selection.pivot?.attributeValueId
          ?? selection.pivot?.attribute_value_id
          ?? attributeValue.id,
      };
    }).filter((selection) => selection.attributeId && selection.attributeValueId);
    return normalizedValues.length ? variationCombinationKey(normalizedValues) : '';
  }

  async function generateVariations() {
    const options = variationGenerator?.options || [];
    const parentPrice = Number(
      product.regularPrice
      ?? product.regular_price
      ?? product.price
      ?? variations.find((item) => item.isDefault ?? item.is_default)?.price
      ?? variations[0]?.price,
    );
    const parentSalePrice = Number(
      product.salePrice
      ?? product.sale_price
      ?? variations.find((item) => item.isDefault ?? item.is_default)?.salePrice
      ?? variations.find((item) => item.isDefault ?? item.is_default)?.sale_price
      ?? parentPrice,
    );
    if (!Number.isFinite(parentPrice) || parentPrice <= 0) {
      setError('Set a valid product price or create one variation first so generated variations can inherit its price.');
      return;
    }

    let combinations = [[]];
    options.forEach((attribute) => {
      combinations = combinations.flatMap((combination) => attribute.values.map((value) => [
        ...combination,
        { attribute, value },
      ]));
    });

    const existingKeys = new Set(variations.map(existingVariationKey).filter(Boolean));

    const pending = combinations.map((combination) => {
      const attributeValues = combination.map(({ attribute, value }) => ({
        attributeId: Number(idOf(attribute)),
        attributeValueId: Number(idOf(value)),
      }));
      return { combination, attributeValues };
    }).filter(({ attributeValues }) => !existingKeys.has(variationCombinationKey(attributeValues)));

    if (!pending.length) {
      setVariationGenerator(null);
      setError('All attribute combinations already have variations.');
      return;
    }

    const productSuffix = String(product.id || product.public_id || product.uuid || idOf(product))
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(-8)
      .toUpperCase();
    let created = 0;
    let skipped = 0;
    setGenerationBusy(true);
    setError('');
    try {
      for (const { combination, attributeValues } of pending) {
        const valueIds = attributeValues.map(({ attributeValueId }) => attributeValueId);
        const baseSku = `VAR-${productSuffix}-${valueIds.join('-')}`;
        const body = {
          sku: baseSku,
          price: parentPrice,
          status: 'active',
          isDefault: variations.length === 0 && created === 0,
          attributeValues,
        };
        if (Number.isFinite(parentSalePrice) && parentSalePrice < parentPrice) {
          body.salePrice = parentSalePrice;
        }
        try {
          await apiRequest(`${root}/variations`, { method: 'POST', token, body });
          created += 1;
        } catch (requestError) {
          if (requestError.status !== 409) throw requestError;

          let currentVariations;
          try {
            const refreshed = await apiRequest(`${root}/variations`, { token });
            currentVariations = refreshed.data || [];
          } catch (refreshError) {
            throw new Error(`Could not verify an existing variation after a conflict: ${errorMessage(refreshError)}`);
          }
          const currentKeys = new Set(currentVariations.map(existingVariationKey).filter(Boolean));
          if (currentKeys.has(variationCombinationKey(attributeValues))) {
            skipped += 1;
            continue;
          }

          const fallbackBody = { ...body, sku: `${baseSku}-2` };
          try {
            await apiRequest(`${root}/variations`, { method: 'POST', token, body: fallbackBody });
            created += 1;
          } catch (retryError) {
            if (retryError.status !== 409) throw retryError;
            skipped += 1;
          }
        }
      }
      setVariationGenerator(null);
      await load();
      if (skipped) {
        setError(`${created} variation${created === 1 ? '' : 's'} created; ${skipped} skipped because the SKU or attribute combination already exists.`);
      }
    } catch (requestError) {
      const refreshMessage = created
        ? ` ${created} variation${created === 1 ? '' : 's'} were created before the next request failed.`
        : '';
      setError(`${errorMessage(requestError)}${refreshMessage}`);
      if (created) {
        try {
          await load();
        } catch (refreshError) {
          setError(`${errorMessage(requestError)} ${created} variation${created === 1 ? '' : 's'} were created, but the list could not be refreshed: ${errorMessage(refreshError)}`);
        }
      }
    } finally {
      setGenerationBusy(false);
    }
  }

  async function remove(kind, item, attributeId) {
    if (!window.confirm(`Delete this ${kind}?`)) return;
    setBusy(true);
    setError('');
    try {
      await apiRequest(`${collectionFor(kind, attributeId)}/${idOf(item)}`, { method: 'DELETE', token });
      await load();
      if (kind === 'value') await loadValues(attributeId);
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setBusy(false); }
  }

  async function upload() {
    const files = [
      ...(primaryFile ? [{ file: primaryFile, isPrimary: true }] : []),
      ...secondaryFiles.map((file) => ({ file, isPrimary: false })),
    ];
    if (!files.length) return;
    const availableSlots = Math.max(0, 9 - images.length);
    if (files.length > availableSlots) {
      setError(`This product has ${availableSlots} image slot${availableSlots === 1 ? '' : 's'} remaining. Select fewer images.`);
      return;
    }
    if (!images.length && secondaryFiles.length && !primaryFile) {
      setError('Select a primary image before adding secondary images to a product with no images.');
      return;
    }
    if (secondaryFiles.length > 8) {
      setError('Select no more than 8 secondary images.');
      return;
    }
    const invalidFile = files.find(({ file }) => (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
      || file.size > 5 * 1024 * 1024
    ));
    if (invalidFile) {
      setError(`${invalidFile.file.name} is not a supported image. Choose JPEG, PNG, or WebP files no larger than 5 MB each.`);
      return;
    }
    setBusy(true);
    setError('');
    let uploadedCount = 0;
    let uploadFailure = '';
    let refreshFailure = '';
    try {
      try {
        for (const [index, { file, isPrimary }] of files.entries()) {
          setUploadProgress(`Uploading image ${index + 1} of ${files.length}…`);
          await apiRequest(`${root}/images/upload`, {
            method: 'POST',
            token,
            rawBody: file,
            contentType: file.type,
            query: {
              altText: uploadOptions.altText || file.name,
              sortOrder: Number(uploadOptions.sortOrder) + images.length + index,
              isPrimary,
            },
          });
          uploadedCount += 1;
        }
        setPrimaryFile(null);
        setSecondaryFiles([]);
        if (primaryImageInput.current) primaryImageInput.current.value = '';
        if (secondaryImageInput.current) secondaryImageInput.current.value = '';
      } catch (requestError) {
        if (uploadedCount) {
          uploadFailure = `${uploadedCount} image${uploadedCount === 1 ? '' : 's'} uploaded; the next upload failed: ${errorMessage(requestError)} Select the remaining image files to retry.`;
          setPrimaryFile(null);
          setSecondaryFiles([]);
          if (primaryImageInput.current) primaryImageInput.current.value = '';
          if (secondaryImageInput.current) secondaryImageInput.current.value = '';
        } else {
          uploadFailure = errorMessage(requestError);
        }
      }
      if (uploadedCount) {
        try {
          await load();
        } catch (refreshError) {
          refreshFailure = `Images uploaded, but the image list could not be refreshed: ${errorMessage(refreshError)}`;
        }
      }
      setError([uploadFailure, refreshFailure].filter(Boolean).join(' '));
    } finally {
      setUploadProgress('');
      setBusy(false);
    }
  }

  const tabs = ['images', 'attributes', 'variations'];
  const shownItems = tab === 'images' ? images : tab === 'attributes' ? (selectedAttribute ? values : attributes) : variations;
  function fieldsFor(kind, item) {
    if (kind === 'image') return { imageUrl: item.imageUrl ?? item.image_url ?? '', altText: item.altText ?? item.alt_text ?? '', sortOrder: item.sortOrder ?? item.sort_order ?? 0, isPrimary: item.isPrimary ?? item.is_primary ?? false };
    if (kind === 'attribute') return { ...item, displayType: item.displayType ?? item.display_type, sortOrder: item.sortOrder ?? item.sort_order };
    if (kind === 'value') return { ...item, colorCode: item.colorCode ?? item.color_code, sortOrder: item.sortOrder ?? item.sort_order };
    return toCamel(item, [['salePrice', 'sale_price'], ['costPrice', 'cost_price'], ['taxRate', 'tax_rate'], ['isDefault', 'is_default'], ['attributeValues', 'attribute_values']]);
  }

  return <Modal title={`Manage ${product.name || 'product'}`} onClose={onClose} wide>
    <Notice error={error} />
    <div className="nested-tabs">{tabs.map((name) => <button type="button" key={name} className={tab === name ? 'nested-tab-active' : ''} onClick={() => setTab(name)}>{name[0].toUpperCase() + name.slice(1)} <span>{name === 'images' ? images.length : name === 'attributes' ? attributes.length : variations.length}</span></button>)}</div>
    {tab === 'images' && !canUpdate && <div className="editor-help" role="status">Your account needs the <strong>products.update</strong> permission to upload or add product images. Ask an administrator to grant access, then sign in again.</div>}
    {tab === 'images' && canUpdate && <div className="upload-row upload-options product-image-fields">
      <label className="field"><span>Primary image (one; JPEG, PNG, WebP; max 5 MB)</span><input ref={primaryImageInput} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || images.length >= 9} onChange={(event) => { setPrimaryFile(event.target.files?.[0] || null); setError(''); }} /></label>
      {primaryFile && <span className="upload-selection">Primary: {primaryFile.name}</span>}
      <label className="field"><span>Secondary images (up to {Math.min(8, Math.max(0, 9 - images.length - (primaryFile ? 1 : 0)))} available; max 5 MB each)</span><input ref={secondaryImageInput} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || images.length + (primaryFile ? 1 : 0) >= 9} onChange={(event) => { setSecondaryFiles(Array.from(event.target.files || [])); setError(''); }} /></label>
      {secondaryFiles.length > 0 && <span className="upload-selection">{secondaryFiles.length} secondary image{secondaryFiles.length === 1 ? '' : 's'}: {secondaryFiles.map((file) => file.name).join(', ')}</span>}
      <label className="field"><span>Alt text (optional; defaults to filename)</span><input value={uploadOptions.altText} onChange={(event) => setUploadOptions((current) => ({ ...current, altText: event.target.value }))} /></label>
      <label className="field"><span>Starting sort order</span><input type="number" min="0" value={uploadOptions.sortOrder} onChange={(event) => setUploadOptions((current) => ({ ...current, sortOrder: Number(event.target.value) }))} /></label>
      <button type="button" className="button button-light" disabled={(!primaryFile && !secondaryFiles.length) || busy} onClick={upload}>{busy ? <><LoaderCircle className="spin" size={15} /> {uploadProgress || 'Uploading…'}</> : 'Upload selected images'}</button>
    </div>}
    {tab === 'attributes' && <div className="nested-tabs nested-subtabs">{attributes.map((attribute) => <button type="button" key={idOf(attribute)} className={selectedAttribute === String(idOf(attribute)) ? 'nested-tab-active' : ''} onClick={() => loadValues(idOf(attribute))}>{attribute.name} values</button>)}{selectedAttribute && canCreate && <button type="button" onClick={() => setEditor({ kind: 'value', attributeId: selectedAttribute })}><Plus size={14} /> Add value</button>}</div>}
    {tab === 'attributes' && !selectedAttribute && canUpdate && <div className="attribute-assign-controls"><select aria-label="Choose a shared attribute" value={globalAttributeId} onChange={(event) => setGlobalAttributeId(event.target.value)}><option value="">Choose a shared attribute</option>{globalAttributes.filter((attribute) => !attributes.some((assigned) => String(idOf(assigned)) === String(idOf(attribute)))).map((attribute) => <option key={idOf(attribute)} value={idOf(attribute)}>{attribute.name}</option>)}</select><button type="button" className="button button-light" disabled={!globalAttributeId || busy} onClick={assignGlobalAttribute}>{busy ? <LoaderCircle className="spin" size={14} /> : 'Assign existing attribute'}</button></div>}
    <div className="nested-toolbar"><strong>{tab === 'images' ? 'Product images' : tab === 'attributes' ? selectedAttribute ? 'Attribute values' : 'Product attributes' : 'Product variations'}</strong><div className="nested-toolbar-actions">{tab === 'variations' && canCreate && <button type="button" className="button button-light" onClick={openVariationGenerator} disabled={busy}>Generate all combinations</button>}{(tab === 'images' ? canUpdate : canCreate) && <button type="button" className="button button-primary" onClick={() => tab === 'variations' ? openVariationEditor() : setEditor({ kind: tab === 'images' ? 'image' : selectedAttribute ? 'value' : 'attribute', ...(tab === 'attributes' && selectedAttribute ? { attributeId: selectedAttribute } : {}) })} disabled={busy}><Plus size={15} /> Add {tab === 'images' ? 'image URL' : tab === 'attributes' ? selectedAttribute ? 'value' : 'attribute' : 'variation'}</button>}</div></div>
    {variationGenerator && <Modal title="Generate product variations" onClose={() => { if (!generationBusy) setVariationGenerator(null); }}><div className="variation-generator"><p>Generate one variation for every combination of the selected attribute values. Existing combinations are skipped.</p><ul>{variationGenerator.options.map((attribute) => <li key={idOf(attribute)}><strong>{attribute.name}:</strong> {attribute.values.map((value) => value.value || value.name).join(', ')}</li>)}</ul><p>{variationGenerator.options.reduce((total, attribute) => total * attribute.values.length, 1)} total combinations. New variations inherit the product price and use automatically generated SKUs.</p><div className="modal-actions"><button type="button" className="button button-light" disabled={generationBusy} onClick={() => setVariationGenerator(null)}>Cancel</button><button type="button" className="button button-primary" disabled={generationBusy} onClick={generateVariations}>{generationBusy ? <><LoaderCircle className="spin" size={15} /> Generating…</> : 'Generate missing variations'}</button></div></div></Modal>}
    <div className="nested-list">{shownItems.map((item) => {
      const kind = tab === 'images' ? 'image' : tab === 'variations' ? 'variation' : selectedAttribute ? 'value' : 'attribute';
      const label = item.name || item.value || item.sku || item.altText || item.imageUrl || item.image_url || `#${idOf(item)}`;
      const variationValues = tab === 'variations'
        ? (item.attributeValues || item.attribute_values || []).map((selection) => selection.value?.value || selection.attributeValue?.value || selection.attribute_value?.value || selection.value || '').filter(Boolean).join(', ')
        : '';
      return <div className="nested-row" key={idOf(item)}>{tab === 'images' && (item.imageUrl || item.image_url) && <MediaImage src={item.imageUrl || item.image_url} alt={item.altText || item.alt_text || ''} />}<div className="nested-row-main"><strong>{label}</strong><small>{tab === 'variations' ? [variationValues, item.status, item.price != null ? `₹${item.price}` : ''].filter(Boolean).join(' · ') : item.displayType || item.display_type || item.status || (item.price != null ? `₹${item.price}` : '')}</small></div>{tab === 'attributes' && !selectedAttribute && <button type="button" className="button button-light button-small" onClick={() => loadValues(idOf(item))}>Values</button>}{canUpdate && <button type="button" className="button button-light button-small" onClick={() => tab === 'variations' ? openVariationEditor(item) : setEditor({ kind, item: fieldsFor(kind, item), attributeId: selectedAttribute })} disabled={busy}>Edit</button>}{canDelete && <button type="button" className="icon-button danger-button" disabled={busy} onClick={() => remove(kind, item, selectedAttribute)}><Trash2 size={14} /></button>}</div>;
    })}{!shownItems.length && <div className="panel-empty">No {selectedAttribute && tab === 'attributes' ? 'values' : tab} added yet.</div>}</div>
    {editor && <Modal title={`${editor.item ? 'Edit' : 'Add'} ${editor.kind}`} onClose={() => setEditor(null)}><EditorForm fields={editor.kind === 'attribute' && !editor.item ? productFields.attributeCreate : productFields[editor.kind]} initial={editor.item} attributeOptions={editor.kind === 'variation' ? variationAttributeOptions : []} generateSlug={false} onSave={save} onCancel={() => setEditor(null)} saveLabel={editor.item ? 'Save changes' : `Add ${editor.kind}`} /></Modal>}
  </Modal>;
}

const addressFields = [
  { name: 'label', label: 'Label', required: true }, { name: 'recipientName', label: 'Recipient name', required: true },
  { name: 'phone', label: 'Phone', required: true }, { name: 'addressLine1', label: 'Address line 1', required: true },
  { name: 'addressLine2', label: 'Address line 2' }, { name: 'city', label: 'City', required: true },
  { name: 'state', label: 'State', required: true }, { name: 'postalCode', label: 'Postal code', required: true },
  { name: 'countryCode', label: 'Country code', required: true }, { name: 'isDefault', label: 'Default address', type: 'checkbox' },
];

export function CustomerAddresses({ customer, token, onClose }) {
  const [addresses, setAddresses] = useState([]);
  const [editor, setEditor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const base = `/customers/${idOf(customer)}/addresses`;
  async function load() {
    const result = await apiRequest(base, { token });
    setAddresses(result.data || []);
  }
  useEffect(() => {
    let alive = true;
    load().catch((loadError) => { if (alive) setError(errorMessage(loadError)); });
    return () => { alive = false; };
  }, [base, token]);
  async function save(payload) {
    setBusy(true);
    setError('');
    try {
      await apiRequest(editor.item ? `${base}/${idOf(editor.item)}` : base, { method: editor.item ? 'PATCH' : 'POST', token, body: payload });
      setEditor(null);
      await load();
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setBusy(false); }
  }
  async function remove(item) {
    if (!window.confirm('Delete this customer address?')) return;
    setBusy(true);
    setError('');
    try { await apiRequest(`${base}/${idOf(item)}`, { method: 'DELETE', token }); await load(); }
    catch (requestError) { setError(errorMessage(requestError)); }
    finally { setBusy(false); }
  }
  return <Modal title={`${customer.name || customer.email || 'Customer'} addresses`} onClose={onClose} wide>
    <Notice error={error} />
    <div className="nested-toolbar"><strong>Saved addresses</strong><button className="button button-primary" type="button" onClick={() => setEditor({ item: null })}><Plus size={15} /> Add address</button></div>
    <div className="nested-list">{addresses.map((address) => <div className="nested-row" key={idOf(address)}><div className="nested-row-main"><strong>{address.label} · {address.recipientName}</strong><small>{[address.addressLine1, address.addressLine2, address.city, address.state, address.postalCode, address.countryCode].filter(Boolean).join(', ')}</small></div><button type="button" className="button button-light button-small" onClick={() => setEditor({ item: address })}>Edit</button><button type="button" className="icon-button danger-button" disabled={busy} onClick={() => remove(address)}><Trash2 size={14} /></button></div>)}{!addresses.length && <div className="panel-empty">No addresses found.</div>}</div>
    {editor && <Modal title={editor.item ? 'Edit address' : 'Add address'} onClose={() => setEditor(null)}><EditorForm fields={addressFields} initial={editor.item} onSave={save} onCancel={() => setEditor(null)} saveLabel={editor.item ? 'Save changes' : 'Add address'} /></Modal>}
  </Modal>;
}

export function CustomerDetails({ customer, token, canManageAddresses, onClose }) {
  const [profile, setProfile] = useState(customer);
  const [orders, setOrders] = useState([]);
  const [showAddresses, setShowAddresses] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    Promise.all([apiRequest(`/customers/${idOf(customer)}`, { token }), apiRequest(`/customers/${idOf(customer)}/orders`, { token })])
      .then(([profileResult, orderResult]) => {
        if (alive) { setProfile(profileResult.data || customer); setOrders(orderResult.data || []); }
      }).catch((requestError) => { if (alive) setError(errorMessage(requestError)); });
    return () => { alive = false; };
  }, [customer, token]);
  return <Modal title={profile.name || profile.email || 'Customer details'} onClose={onClose} wide>
    <Notice error={error} />
    <section className="detail-grid"><div><span>Email</span><strong>{profile.email || '—'}</strong></div><div><span>Phone</span><strong>{profile.phone || '—'}</strong></div><div><span>Status</span><strong>{profile.status || '—'}</strong></div><div><span>Joined</span><strong>{profile.createdAt || profile.created_at || '—'}</strong></div></section>
    <div className="nested-toolbar"><strong>Customer orders</strong>{canManageAddresses && <button type="button" className="button button-light" onClick={() => setShowAddresses(true)}>Manage addresses</button>}</div>
    <div className="nested-list">{orders.map((order) => <div className="nested-row" key={idOf(order)}><div className="nested-row-main"><strong>{order.orderNumber || order.order_number || `Order ${idOf(order)}`}</strong><small>{order.status || '—'} · {order.totalAmount ?? order.total_amount ?? order.total ?? '—'}</small></div></div>)}{!orders.length && <div className="panel-empty">No orders found for this customer.</div>}</div>
    {showAddresses && <CustomerAddresses customer={profile} token={token} onClose={() => setShowAddresses(false)} />}
  </Modal>;
}

export function ResourceDetails({ title, path, token, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    apiRequest(path, { token }).then((response) => { if (alive) setData(response.data); })
      .catch((requestError) => { if (alive) setError(errorMessage(requestError)); });
    return () => { alive = false; };
  }, [path, token]);
  return <Modal title={title} onClose={onClose} wide><Notice error={error} />{!data && !error && <div className="panel-empty"><LoaderCircle className="spin" size={17} /> Loading details…</div>}{data && <pre className="json-result json-result-nested">{JSON.stringify(data, null, 2)}</pre>}</Modal>;
}

export function ProductDetails({ product, token, onClose }) {
  const [details, setDetails] = useState(null);
  const [images, setImages] = useState([]);
  const [error, setError] = useState('');
  const productId = idOf(product);
  useEffect(() => {
    let alive = true;
    Promise.all([
      apiRequest(`/products/${productId}`, { token }),
      apiRequest(`/products/${productId}/images`, { token }).catch((imageError) => ({ imageError, data: [] })),
    ]).then(([productResult, imageResult]) => {
      if (!alive) return;
      setDetails(productResult.data || {});
      setImages(Array.isArray(imageResult.data) ? imageResult.data : []);
      if (imageResult.imageError) setError(`Product loaded, but images could not be retrieved: ${errorMessage(imageResult.imageError)}`);
    }).catch((requestError) => { if (alive) setError(errorMessage(requestError)); });
    return () => { alive = false; };
  }, [productId, token]);

  const value = (camel, snake) => details?.[camel] ?? details?.[snake] ?? product?.[camel] ?? product?.[snake];
  const name = value('name', 'name') || 'Product';
  const status = value('status', 'status') || 'unknown';
  const price = value('regularPrice', 'regular_price') ?? value('price', 'price');
  const salePrice = value('salePrice', 'sale_price');
  const imageUrl = (image) => image.imageUrl || image.image_url || '';
  const imageLabel = (image) => image.altText || image.alt_text || name;
  const display = (item) => item === undefined || item === null || item === '' ? '—' : String(item);
  const money = (amount) => amount === undefined || amount === null || amount === '' ? '—' : `₹${Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  const field = (label, content, wide = false) => <div className={wide ? 'product-detail-wide' : ''} key={label}><span>{label}</span><p>{display(content)}</p></div>;
  const primaryImage = images.find((image) => image.isPrimary || image.is_primary) || images[0];
  const tags = Array.isArray(details?.tags || product?.tags) ? (details?.tags || product?.tags).map((tag) => typeof tag === 'string' ? tag : tag.name).filter(Boolean).join(', ') : details?.tags || product?.tags;

  return <Modal title="Product details" onClose={onClose} wide>
    <Notice error={error} />
    {!details && !error && <div className="panel-empty"><LoaderCircle className="spin" size={17} /> Loading product details…</div>}
    {details && <div className="product-detail">
      <section className="product-detail-hero">
        <div className="product-detail-image">{primaryImage && imageUrl(primaryImage) ? <MediaImage src={imageUrl(primaryImage)} alt={imageLabel(primaryImage)} /> : <span>No image</span>}</div>
        <div className="product-detail-heading"><span className="eyebrow">PRODUCT</span><h2>{name}</h2><span className={`status-pill status-${status}`}>{status}</span><span className="product-detail-slug">{display(value('slug', 'slug'))}</span></div>
      </section>
      <section className="product-detail-section"><h3>Product images <small>{images.length}</small></h3>
        {images.length ? <div className="product-detail-gallery">{images.map((image, index) => <figure key={idOf(image) || imageUrl(image) || index}><div>{imageUrl(image) ? <MediaImage src={imageUrl(image)} alt={imageLabel(image)} /> : <span>No preview</span>}</div><figcaption>{image.isPrimary || image.is_primary ? 'Primary image' : imageLabel(image)}</figcaption></figure>)}</div> : <p className="product-detail-empty">No product images added.</p>}
      </section>
      <section className="product-detail-section"><h3>Product information</h3><div className="product-detail-grid">
        {field('Category', details.category?.name || details.categoryName || details.category_name || details.categoryId || details.category_id || product.category?.name || product.categoryName)}
        {field('Subcategory', details.subcategory?.name || details.subCategory?.name || details.subcategoryName || details.subcategory_name || details.subCategoryId || details.subcategory_id)}
        {field('Brand', details.brand?.name || details.brandName || details.brand_name || details.brandId || details.brand_id)}
        {field('Featured', value('isFeatured', 'is_featured') ? 'Yes' : 'No')}
        {field('Regular price', money(price))}
        {field('Sale price', money(salePrice))}
        {field('Discount', [value('discountValue', 'discount_value'), value('discountType', 'discount_type')].filter((part) => part !== undefined && part !== null && part !== '').join(' ') || '—')}
        {field('Tags', tags, true)}
        {field('Short description', value('shortDescription', 'short_description'), true)}
        {field('Description', value('description', 'description'), true)}
      </div></section>
      <section className="product-detail-section"><h3>Search listing</h3><div className="product-detail-grid">
        {field('SEO title', value('seoTitle', 'seo_title'))}{field('SEO keywords', value('seoKeywords', 'seo_keywords'))}{field('SEO description', value('seoDescription', 'seo_description'), true)}
      </div></section>
    </div>}
  </Modal>;
}

export function CategoryDetails({ category, token, onClose }) {
  const [details, setDetails] = useState(category);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    apiRequest(`/categories/${idOf(category)}`, { token })
      .then((response) => {
        if (alive) setDetails(response.data || category);
      })
      .catch((requestError) => {
        if (alive) setError(errorMessage(requestError));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [category, token]);

  const imageUrl = details.imageUrl || details.image_url;
  const status = details.status || 'unknown';
  const value = (camel, snake = camel) => details[camel] ?? details[snake];
  const date = value('createdAt', 'created_at');

  return <Modal title="Category details" onClose={onClose} wide>
    <Notice error={error} />
    {loading && <div className="panel-empty"><LoaderCircle className="spin" size={17} /> Loading category details…</div>}
    {!loading && <div className="category-detail">
      <section className="category-detail-hero">
        <div className="category-detail-image">{imageUrl ? <MediaImage src={imageUrl} alt={`${details.name || 'Category'} image`} /> : <span>No image</span>}</div>
        <div className="category-detail-heading">
          <span className="eyebrow">CATEGORY</span>
          <h2>{details.name || 'Untitled category'}</h2>
          <span className={`status-pill status-${status}`}>{status}</span>
        </div>
      </section>
      <section className="category-detail-section">
        <h3>Overview</h3>
        <div className="category-detail-grid">
          <div><span>Description</span><p>{details.description || 'No description provided.'}</p></div>
          <div><span>Display order</span><p>{value('sortOrder', 'sort_order') ?? 0}</p></div>
          <div><span>Created</span><p>{date ? new Date(date).toLocaleString() : '—'}</p></div>
        </div>
      </section>
      <section className="category-detail-section">
        <h3>Search engine details</h3>
        <div className="category-detail-grid">
          <div><span>SEO title</span><p>{value('seoTitle', 'seo_title') || '—'}</p></div>
          <div><span>SEO keywords</span><p>{value('seoKeywords', 'seo_keywords') || '—'}</p></div>
          <div className="category-detail-wide"><span>SEO description</span><p>{value('seoDescription', 'seo_description') || '—'}</p></div>
        </div>
      </section>
    </div>}
    <div className="modal-actions"><button type="button" className="button button-light" onClick={onClose}>Close</button></div>
  </Modal>;
}

export function InventoryDetails({ item, token, onClose }) {
  const productId = item.productId || item.product_id || item.product?.id;
  const variationId = item.variationId || item.variation_id || item.variation?.id || item.id;
  const [inventory, setInventory] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!productId || !variationId) { setError('The inventory row is missing product or variation UUIDs.'); setLoading(false); return undefined; }
    let alive = true;
    setLoading(true);
    Promise.all([
      apiRequest(`/products/${productId}/variations/${variationId}/inventory`, { token }),
      apiRequest(`/products/${productId}/variations/${variationId}/inventory/transactions`, { token, query: { page, limit: 10 } }),
    ]).then(([current, history]) => {
      if (alive) { setInventory(current.data); setTransactions(history.data || []); setPagination(history.pagination || { page, totalPages: 1, total: (history.data || []).length }); setError(''); }
    }).catch((requestError) => { if (alive) setError(errorMessage(requestError)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [productId, variationId, page, token]);
  return <Modal title="Inventory and transaction history" onClose={onClose} wide>
    <Notice error={error} />
    <div className="editor-help">Product: {item.productName || item.product_name || item.product?.name || '—'} · SKU: {item.sku || item.variationSku || item.variation_sku || '—'}</div>
    <div className="detail-grid">{[['Physical', inventory?.physicalStock ?? inventory?.physical_stock ?? inventory?.stockQuantity ?? inventory?.stock_quantity], ['Reserved', inventory?.reservedStock ?? inventory?.reserved_stock ?? inventory?.reserved], ['Available', inventory?.availableStock ?? inventory?.available_stock ?? inventory?.available], ['Low-stock threshold', inventory?.lowStockThreshold ?? inventory?.low_stock_threshold]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{loading ? '…' : value ?? '—'}</strong></div>)}</div>
    <div className="nested-toolbar"><strong>Transactions</strong><span>{pagination.total || 0} total</span></div>
    <div className="nested-list">{transactions.map((entry) => <div className="nested-row" key={idOf(entry)}><div className="nested-row-main"><strong>{entry.action || entry.type || 'Stock transaction'} · {entry.quantity ?? '—'}</strong><small>{entry.reason || '—'} · {entry.createdAt || entry.created_at || ''}</small></div></div>)}{!loading && !transactions.length && <div className="panel-empty">No inventory transactions.</div>}</div>
    <div className="pagination"><span>Page {page} of {Math.max(1, pagination.totalPages || 1)}</span><div><button className="icon-button" type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}>‹</button><button className="icon-button" type="button" disabled={page >= (pagination.totalPages || 1) || loading} onClick={() => setPage((current) => current + 1)}>›</button></div></div>
  </Modal>;
}

export function OrderReturns({ order, token, permissions, onClose }) {
  const [returns, setReturns] = useState([]);
  const [reason, setReason] = useState('');
  const [itemsJson, setItemsJson] = useState('[\n  { "orderItemId": 0, "quantity": 1, "restock": true }\n]');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const base = `/orders/${idOf(order)}/returns`;
  async function load() {
    const result = await apiRequest(base, { token });
    setReturns(result.data || []);
  }
  useEffect(() => {
    let alive = true;
    load().catch((requestError) => { if (alive) setError(errorMessage(requestError)); });
    return () => { alive = false; };
  }, [base, token]);
  useEffect(() => {
    let alive = true;
    apiRequest(`/orders/${idOf(order)}`, { token }).then((response) => {
      const detail = response.data || {};
      const items = detail.items || detail.orderItems || detail.order_items || [];
      const initial = items.map((item) => ({ orderItemId: item.orderItemId ?? item.order_item_id ?? item.id, quantity: 1, restock: true })).filter((item) => item.orderItemId != null);
      if (alive && initial.length) setItemsJson(JSON.stringify(initial, null, 2));
    }).catch((requestError) => { if (alive) setError(errorMessage(requestError)); });
    return () => { alive = false; };
  }, [order, token]);
  async function create(event) {
    event.preventDefault();
    let items;
    try { items = JSON.parse(itemsJson); }
    catch { setError('Return items must be a valid JSON array.'); return; }
    setBusy(true);
    setError('');
    try { await apiRequest(base, { method: 'POST', token, body: { reason, items } }); setReason(''); await load(); }
    catch (requestError) { setError(errorMessage(requestError)); }
    finally { setBusy(false); }
  }
  async function update(item, status) {
    setBusy(true);
    setError('');
    try { await apiRequest(`${base}/${idOf(item)}`, { method: 'PATCH', token, body: { status } }); await load(); }
    catch (requestError) { setError(errorMessage(requestError)); }
    finally { setBusy(false); }
  }
  return <Modal title={`Returns · ${order.orderNumber || order.order_number || idOf(order)}`} onClose={onClose} wide>
    <Notice error={error} />
    {permissions.has('orders.create') && <form className="operation-form operation-grid return-form" onSubmit={create}><label className="field"><span>Return reason</span><input required value={reason} onChange={(event) => setReason(event.target.value)} /></label><label className="field field-wide"><span>Return items (order item numeric IDs)</span><textarea required rows={5} value={itemsJson} onChange={(event) => setItemsJson(event.target.value)} /></label><div className="field-wide"><button className="button button-primary" disabled={busy}>Create return request</button></div></form>}
    <div className="nested-list">{returns.map((item) => {
      const status = item.status || 'requested';
      const options = status === 'requested' ? ['approved', 'rejected'] : status === 'approved' ? ['received', 'rejected'] : [];
      return <div className="nested-row" key={idOf(item)}><div className="nested-row-main"><strong>{item.reason || `Return #${idOf(item)}`}</strong><small>{status} · {Array.isArray(item.items) ? item.items.length : 0} item(s)</small></div>{permissions.has('orders.update_status') && options.length > 0 && <label className="field return-status"><span>Update status</span><select disabled={busy} value="" onChange={(event) => update(item, event.target.value)}><option value="" disabled>Choose status</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>}</div>;
    })}{!returns.length && <div className="panel-empty">No returns for this order.</div>}</div>
  </Modal>;
}

export function CreateOrder({ token, onClose, onCreated }) {
  const [form, setForm] = useState({
    customerId: '', idempotencyKey: `admin-${Date.now()}`,
    items: '[\n  { "variationId": "VARIATION_UUID", "quantity": 1 }\n]',
    shippingAddress: '{\n  "recipientName": "",\n  "phone": "",\n  "addressLine1": "",\n  "addressLine2": null,\n  "city": "",\n  "state": "",\n  "postalCode": "",\n  "countryCode": "IN"\n}',
    billingAddress: '', paymentMethod: 'cod', couponCode: '', customerNote: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function update(name, value) { setForm((current) => ({ ...current, [name]: value })); }
  async function submit(event) {
    event.preventDefault();
    setError('');
    let body;
    try {
      body = {
        customerId: form.customerId,
        idempotencyKey: form.idempotencyKey,
        items: JSON.parse(form.items),
        shippingAddress: JSON.parse(form.shippingAddress),
        billingAddress: form.billingAddress ? JSON.parse(form.billingAddress) : null,
        paymentMethod: form.paymentMethod,
        ...(form.couponCode ? { couponCode: form.couponCode } : {}),
        ...(form.customerNote ? { customerNote: form.customerNote } : {}),
      };
    } catch { setError('Items and addresses must contain valid JSON.'); return; }
    setBusy(true);
    try { const response = await apiRequest('/orders', { method: 'POST', token, body }); onCreated(response); }
    catch (requestError) { setError(errorMessage(requestError)); }
    finally { setBusy(false); }
  }
  return <Modal title="Create admin order" onClose={onClose} wide>
    <div className="editor-help">Product prices, tax, and totals are calculated by the server. Do not add prices to order items.</div>
    <Notice error={error} />
    <form className="entity-form" onSubmit={submit}><div className="editor-grid">
      <label className="field"><span>Customer UUID</span><input required value={form.customerId} onChange={(event) => update('customerId', event.target.value)} /></label>
      <label className="field"><span>Idempotency key</span><input required minLength={8} value={form.idempotencyKey} onChange={(event) => update('idempotencyKey', event.target.value)} /></label>
      <label className="field"><span>Payment method</span><select value={form.paymentMethod} onChange={(event) => update('paymentMethod', event.target.value)}><option value="cod">Cash on delivery</option><option value="online">Online</option></select></label>
      <label className="field"><span>Coupon code</span><input value={form.couponCode} onChange={(event) => update('couponCode', event.target.value)} /></label>
      <label className="field field-wide"><span>Items (JSON array)</span><textarea required rows={4} value={form.items} onChange={(event) => update('items', event.target.value)} /></label>
      <label className="field field-wide"><span>Shipping address (JSON)</span><textarea required rows={6} value={form.shippingAddress} onChange={(event) => update('shippingAddress', event.target.value)} /></label>
      <label className="field field-wide"><span>Billing address (optional JSON)</span><textarea rows={4} value={form.billingAddress} onChange={(event) => update('billingAddress', event.target.value)} /></label>
      <label className="field field-wide"><span>Customer note</span><input value={form.customerNote} onChange={(event) => update('customerNote', event.target.value)} /></label>
    </div><div className="modal-actions"><button className="button button-light" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={15} /> : 'Create order'}</button></div></form>
  </Modal>;
}

export function InitializeInventory({ token, onClose, onCreated }) {
  const [form, setForm] = useState({ productId: '', variationId: '', stockQuantity: '', lowStockThreshold: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    const body = { stockQuantity: Number(form.stockQuantity), lowStockThreshold: Number(form.lowStockThreshold || 0) };
    if (!Number.isInteger(body.stockQuantity) || body.stockQuantity < 0 || !Number.isInteger(body.lowStockThreshold) || body.lowStockThreshold < 0) { setError('Stock values must be non-negative whole numbers.'); return; }
    setBusy(true);
    try { await apiRequest(`/products/${form.productId}/variations/${form.variationId}/inventory`, { method: 'POST', token, body }); onCreated(); }
    catch (requestError) { setError(errorMessage(requestError)); }
    finally { setBusy(false); }
  }
  return <Modal title="Initialize variation inventory" onClose={onClose}>
    <Notice error={error} />
    <form className="entity-form" onSubmit={submit}><div className="editor-grid">
      {[['productId', 'Product UUID'], ['variationId', 'Variation UUID']].map(([name, label]) => <label className="field field-wide" key={name}><span>{label}</span><input required value={form[name]} onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))} /></label>)}
      <label className="field"><span>Initial physical stock</span><input required type="number" min="0" step="1" value={form.stockQuantity} onChange={(event) => setForm((current) => ({ ...current, stockQuantity: event.target.value }))} /></label>
      <label className="field"><span>Low-stock threshold</span><input type="number" min="0" step="1" value={form.lowStockThreshold} onChange={(event) => setForm((current) => ({ ...current, lowStockThreshold: event.target.value }))} /></label>
    </div><div className="modal-actions"><button className="button button-light" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={15} /> : 'Initialize inventory'}</button></div></form>
  </Modal>;
}

export function ActionDialog({ title, fields, initial = {}, onClose, onSubmit }) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((field) => [field.name, initial[field.name] ?? field.defaultValue ?? ''])));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const body = Object.fromEntries(fields.map((field) => [field.name, field.type === 'number' ? Number(values[field.name]) : values[field.name]]));
    try { const result = await onSubmit(body); if (result !== false) onClose(); }
    catch (requestError) { setError(errorMessage(requestError)); }
    finally { setBusy(false); }
  }
  return <Modal title={title} onClose={onClose}><Notice error={error} /><form className="entity-form" onSubmit={submit}><div className="editor-grid">
    {fields.map((field) => <label className="field field-wide" key={field.name}><span>{field.label}</span>{field.type === 'select' ? <select required={field.required} value={values[field.name]} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}</select> : <input required={field.required} type={field.type || 'text'} min={field.min} step={field.type === 'number' ? 'any' : undefined} value={values[field.name]} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} />}</label>)}
  </div><div className="modal-actions"><button className="button button-light" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={15} /> : 'Save'}</button></div></form></Modal>;
}
