import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine, ArrowRight, BadgePercent, Boxes, ChartNoAxesCombined,
  ChevronDown, ChevronLeft, ChevronRight, CircleAlert, ClipboardList,
  LayoutDashboard, LoaderCircle, LogOut, Menu, Package, Pencil, Plus,
  Search, Settings2, Shapes, ShoppingBag, Tag, Trash2, Truck, Users, Wallet, X,
} from 'lucide-react';
import { apiRequest, resolveMediaUrl } from '../api.js';
import { MediaImage, ProductDetails, ProductResource, ResourceDetails } from '../AdminModules.jsx';
import { definitions } from '../config/resources.js';
import { DataTable, Pager, usePagedList } from '../components/DataTable.jsx';
import { errorMessage, formatDate, formatMoney, normalize, recordId } from '../utils/admin.js';
import { slugify } from '../utils/slug.js';

export function ResourceEditor({ resourceKey, record, token, permissions, onClose, onSave }) {
  const resource = definitions[resourceKey];
  const editing = Boolean(record);
  const fields = resource.fields.filter((field) => field.name !== 'slug' && (
    !editing
    || !field.createOnly
    || resourceKey === 'products' && field.name === 'regularPrice'
  ));
  const [imageFile, setImageFile] = useState(null);
  const [imageUploading, setImageUploading] = useState(false);
  const imageInput = useRef(null);
  const [primaryProductImage, setPrimaryProductImage] = useState(null);
  const [secondaryProductImages, setSecondaryProductImages] = useState([]);
  const [existingProductImages, setExistingProductImages] = useState([]);
  const [productImagesLoading, setProductImagesLoading] = useState(resourceKey === 'products' && editing);
  const [productImagesError, setProductImagesError] = useState('');
  const primaryProductImageInput = useRef(null);
  const secondaryProductImageInput = useRef(null);
  const [form, setForm] = useState(() => {
    const item = normalize(record || {});
    return Object.fromEntries(fields.map((field) => {
      const value = item[field.name];
      if (field.type === 'tags' && Array.isArray(value)) {
        return [field.name, value.map((tag) => typeof tag === 'string' ? tag : tag?.name).filter(Boolean)];
      }
      if (['items', 'productIds', 'categoryIds'].includes(field.name) && Array.isArray(value)) return [field.name, JSON.stringify(value, null, 2)];
      if (field.type === 'json' && Array.isArray(value)) return [field.name, JSON.stringify(value, null, 2)];
      if (field.type === 'datetime-local' && value) return [field.name, new Date(value).toISOString().slice(0, 16)];
      return [field.name, value ?? (
        field.type === 'checkbox' ? false
          : field.type === 'json' ? '[]'
            : field.type === 'tags' ? []
            : field.type === 'select' ? field.default ?? field.options?.[0] ?? ''
              : field.default ?? ''
      )];
    }));
  });
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [availableTags, setAvailableTags] = useState([]);
  const [tagsLoading, setTagsLoading] = useState(resourceKey === 'products');
  const [defaultVariation, setDefaultVariation] = useState(null);
  const [pricingLoading, setPricingLoading] = useState(resourceKey === 'products' && editing);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const regularPrice = Number(form.regularPrice);
  const discountValue = Number(form.discountValue);
  const salePrice = resourceKey === 'products'
    && form.regularPrice !== ''
    && form.discountValue !== ''
    && Number.isFinite(regularPrice)
    && regularPrice >= 0
    && (form.discountType === 'percentage'
      ? Number.isFinite(discountValue) && discountValue >= 1 && discountValue <= 100
      : form.discountType === 'fixed'
        ? Number.isFinite(discountValue) && discountValue >= 0 && discountValue <= regularPrice
        : false)
    ? form.discountType === 'percentage'
      ? regularPrice * (1 - discountValue / 100)
      : regularPrice - discountValue
    : null;

  useEffect(() => {
    if (resourceKey !== 'products' || !editing) return undefined;
    let alive = true;
    setPricingLoading(true);
    async function loadPricing() {
      try {
        const response = await apiRequest(`/products/${recordId(record)}/variations`, { token });
        if (!alive) return;
        const variations = response.data || [];
        const variation = variations.find((item) => item.isDefault ?? item.is_default) || variations[0];
        applyVariation(variation);
      } catch (variationError) {
        if (!alive) return;
        try {
          const response = await apiRequest(`/products/${recordId(record)}`, { token });
          if (!alive) return;
          const product = response.data || {};
          const variations = product.variations || product.productVariations || product.product_variations || [];
          const variation = variations.find((item) => item.isDefault ?? item.is_default)
            || variations[0]
            || product.defaultVariation
            || product.default_variation
            || (product.defaultVariationId || product.default_variation_id
              ? { id: product.defaultVariationId || product.default_variation_id }
              : null);
          if (variation) {
            applyVariation({
              ...variation,
              price: variation.price ?? product.regularPrice ?? product.regular_price ?? product.price,
              salePrice: variation.salePrice ?? variation.sale_price ?? product.salePrice ?? product.sale_price,
              discountType: variation.discountType ?? variation.discount_type ?? product.discountType ?? product.discount_type,
              discountValue: variation.discountValue ?? variation.discount_value ?? product.discountValue ?? product.discount_value,
            });
            return;
          }
          const regular = product.regularPrice ?? product.regular_price ?? product.price
            ?? record.regularPrice ?? record.regular_price ?? record.price;
          if (regular !== undefined && regular !== null) {
            const sale = product.salePrice ?? product.sale_price ?? record.salePrice ?? record.sale_price ?? regular;
            const discountType = product.discountType ?? product.discount_type
              ?? record.discountType ?? record.discount_type
              ?? (Number(sale) < Number(regular) ? 'fixed' : 'none');
            const discountValue = product.discountValue ?? product.discount_value
              ?? record.discountValue ?? record.discount_value
              ?? (discountType === 'fixed' ? Number((Number(regular) - Number(sale)).toFixed(2)) : 0);
            setForm((current) => ({ ...current, regularPrice: regular, discountType, discountValue }));
            setError('Pricing loaded, but no default variation ID was returned. The backend must expose the default variation to save pricing changes.');
            return;
          }
          setError(`Could not load product pricing: ${errorMessage(variationError)}`);
        } catch (productError) {
          setError(`Could not load product pricing: ${errorMessage(productError)}`);
        }
      }

      function applyVariation(variation) {
        if (!alive) return;
        if (!variation) {
          setError('No product variation was found, so pricing cannot be edited.');
          return;
        }
        const price = Number(variation.price);
        const sale = Number(variation.salePrice ?? variation.sale_price ?? variation.price);
        const existingDiscountType = variation.discountType ?? variation.discount_type
          ?? record.discountType ?? record.discount_type;
        const existingDiscountValue = variation.discountValue ?? variation.discount_value
          ?? record.discountValue ?? record.discount_value;
        const inferredDiscount = Number.isFinite(price) && Number.isFinite(sale) && sale < price;
        const discountType = ['percentage', 'fixed'].includes(existingDiscountType)
          ? existingDiscountType
          : inferredDiscount ? 'fixed' : 'none';
        const discountValue = discountType === 'percentage' && existingDiscountValue != null
          ? existingDiscountValue
          : discountType === 'fixed' ? Number((price - sale).toFixed(2)) : 0;
        setDefaultVariation(variation);
        setForm((current) => ({
          ...current,
          regularPrice: variation.price ?? record.regularPrice ?? record.regular_price ?? record.price ?? current.regularPrice,
          discountType,
          discountValue,
        }));
      }
    }

    loadPricing().finally(() => {
      if (alive) setPricingLoading(false);
    });
    return () => { alive = false; };
  }, [editing, record, resourceKey, token]);

  useEffect(() => {
    if (resourceKey !== 'products' || !editing) return undefined;
    let alive = true;
    setProductImagesLoading(true);
    apiRequest(`/products/${recordId(record)}/images`, { token }).then((response) => {
      if (alive) setExistingProductImages(Array.isArray(response.data) ? response.data : []);
    }).catch((loadError) => {
      if (alive) setProductImagesError(errorMessage(loadError));
    }).finally(() => {
      if (alive) setProductImagesLoading(false);
    });
    return () => { alive = false; };
  }, [editing, record, resourceKey, token]);

  useEffect(() => {
    if (!fields.some((field) => ['category', 'subcategory', 'brand'].includes(field.type))) return undefined;
    let alive = true;
    async function loadBrands() {
      const firstPage = await apiRequest('/brands', { token, query: { page: 1, limit: 100 } });
      const totalPages = Math.max(1, Number(firstPage.pagination?.totalPages) || 1);
      const remainingPages = await Promise.all(Array.from({ length: totalPages - 1 }, (_, index) => (
        apiRequest('/brands', { token, query: { page: index + 2, limit: 100 } })
      )));
      return [firstPage, ...remainingPages].flatMap((result) => result.data || []);
    }
    async function loadTags() {
      const firstPage = await apiRequest('/tags', { token, query: { page: 1, limit: 100 } });
      const totalPages = Math.max(1, Number(firstPage.pagination?.totalPages) || 1);
      const remainingPages = await Promise.all(Array.from({ length: totalPages - 1 }, (_, index) => (
        apiRequest('/tags', { token, query: { page: index + 2, limit: 100 } })
      )));
      return [firstPage, ...remainingPages].flatMap((result) => result.data || []);
    }
    if (resourceKey === 'products') setTagsLoading(true);
    Promise.all([
      apiRequest('/categories', { token, query: { page: 1, limit: 100 } }),
      resourceKey === 'products' ? apiRequest('/subcategories', { token, query: { page: 1, limit: 100 } }) : Promise.resolve({ data: [] }),
      resourceKey === 'products' ? loadBrands() : Promise.resolve([]),
      resourceKey === 'products' ? loadTags() : Promise.resolve([]),
    ]).then(([categoryResult, subcategoryResult, brandResult, tagResult]) => {
      if (alive) {
        setCategories((categoryResult.data || []).map(normalize));
        setSubcategories((subcategoryResult.data || []).map(normalize));
        setBrands(brandResult.map(normalize));
        setAvailableTags(tagResult.map(normalize));
        setTagsLoading(false);
      }
    }).catch((loadError) => {
      if (alive) {
        setError(errorMessage(loadError));
        setTagsLoading(false);
      }
    });
    return () => { alive = false; };
  }, [resource.fields, resourceKey, token]);

  function update(name, value) {
    setForm((current) => ({
      ...current,
      [name]: value,
      ...(name === 'offerType' && value === 'percentage_off' ? { discountType: 'percentage' } : {}),
      ...(name === 'offerType' && value === 'fixed_off' ? { discountType: 'fixed' } : {}),
    }));
  }

  function updateName(value) {
    setForm((current) => ({ ...current, name: value }));
  }

  async function uploadSubcategoryImage() {
    if (!imageFile) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(imageFile.type) || imageFile.size > 5 * 1024 * 1024) {
      setError('Choose a JPEG, PNG, or WebP image no larger than 5 MB.');
      return;
    }
    setImageUploading(true);
    setError('');
    try {
      const response = await apiRequest('/subcategories/images/upload', {
        method: 'POST',
        token,
        rawBody: imageFile,
        contentType: imageFile.type,
      });
      const imageUrl = response.data?.imageUrl || response.data?.image_url;
      if (!imageUrl) throw new Error('The upload succeeded but the API did not return an image URL.');
      update('imageUrl', imageUrl);
      setImageFile(null);
      if (imageInput.current) imageInput.current.value = '';
    } catch (uploadError) {
      setError(errorMessage(uploadError));
    } finally {
      setImageUploading(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    const payload = {};
    try {
      if (resourceKey === 'products') {
        if (form.discountType === 'percentage'
          && (form.discountValue === '' || Number(form.discountValue) < 1 || Number(form.discountValue) > 100)) {
          throw new Error('Percentage discount must be between 1 and 100.');
        }
        if (form.discountType === 'fixed'
          && (form.discountValue === '' || Number(form.discountValue) < 0 || Number(form.discountValue) > Number(form.regularPrice))) {
          throw new Error('Fixed discount must be between 0 and the regular price.');
        }
        if (secondaryProductImages.length > 8) throw new Error('Select no more than 8 secondary images.');
        if (!editing && secondaryProductImages.length && !primaryProductImage) {
          throw new Error('Select a primary image before adding secondary images.');
        }
        const selectedProductImages = [primaryProductImage, ...secondaryProductImages].filter(Boolean);
        const invalidImage = selectedProductImages.find((file) => (
          !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
          || file.size > 5 * 1024 * 1024
        ));
        if (invalidImage) throw new Error(`${invalidImage.name} is not supported. Choose JPEG, PNG, or WebP files no larger than 5 MB each.`);
      }
      fields.filter((field) => !field.when || field.when(form)).forEach((field) => {
        if (editing && resourceKey === 'products' && field.name === 'regularPrice') return;
        let value = form[field.name];
        if (field.type === 'number' && value !== '') value = Number(value);
        if (field.type === 'datetime-local' && value) value = new Date(value).toISOString();
        if (field.type === 'json') value = JSON.parse(value);
        if (value !== '' && value !== null && value !== undefined) payload[field.name] = value;
      });
      if (!editing && ['categories', 'subcategories', 'brands', 'combo-offers'].includes(resourceKey)) {
        payload.slug = slugify(form.name);
        if (!payload.slug) throw new Error('Enter a name containing letters or numbers to generate its slug.');
      }
      if (editing) {
        const original = normalize(record);
        Object.keys(payload).forEach((key) => {
          const originalValue = key === 'tags' && Array.isArray(original[key])
            ? original[key].map((tag) => typeof tag === 'string' ? tag : tag?.name).filter(Boolean)
            : original[key];
          if (JSON.stringify(payload[key]) === JSON.stringify(originalValue)) delete payload[key];
        });
        if (!Object.keys(payload).length && !primaryProductImage && !secondaryProductImages.length) throw new Error('Change at least one field or select product images before saving.');
      }
    } catch (parseError) {
      setError(parseError instanceof SyntaxError ? 'Enter valid JSON.' : errorMessage(parseError));
      return;
    }
    setBusy(true);
    try {
      let pricing;
      if (resourceKey === 'products' && editing && defaultVariation) {
        const originalPrice = Number(defaultVariation.price);
        const originalSalePrice = Number(defaultVariation.salePrice ?? defaultVariation.sale_price ?? defaultVariation.price);
        const nextSalePrice = form.discountType === 'none' ? Number(form.regularPrice) : salePrice;
        if (nextSalePrice === null) throw new Error('Enter a valid discount to calculate the sale price.');
        if (Number(form.regularPrice) !== originalPrice || nextSalePrice !== originalSalePrice) {
          pricing = {
            variationId: recordId(defaultVariation),
            price: Number(form.regularPrice),
            salePrice: Number(nextSalePrice.toFixed(2)),
          };
        }
      }
      await onSave(payload, { primaryProductImage, secondaryProductImages, pricing });
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setBusy(false);
    }
  }

  function renderField(field) {
    const value = form[field.name] ?? '';
    if (field.when && !field.when(form)) return null;
    const required = field.required && !editing;
    if (resourceKey === 'products' && field.name === 'regularPrice') {
      return <section className="pricing-section field-wide" key="product-pricing" aria-labelledby="product-pricing-heading">
        <h2 id="product-pricing-heading"><span aria-hidden="true">₹</span> Pricing</h2>
        {pricingLoading && <div className="editor-help" role="status">Loading product pricing…</div>}
        {editing && !pricingLoading && !defaultVariation && <div className="editor-help" role="alert">Pricing is unavailable because the product default variation could not be loaded.</div>}
        <div className="pricing-grid">
          <label className="field" htmlFor="products-regularPrice">
            <span>Regular Price (₹){required && <b> *</b>}</span>
            <input id="products-regularPrice" required={required} disabled={pricingLoading || (editing && !defaultVariation)} min="0" step="0.01" type="number" value={form.regularPrice ?? ''} onChange={(event) => update('regularPrice', event.target.value)} placeholder="0.00" />
          </label>
          <label className="field" htmlFor="products-discountType">
            <span>Discount Type</span>
            <select id="products-discountType" disabled={pricingLoading || (editing && !defaultVariation)} value={form.discountType} onChange={(event) => update('discountType', event.target.value)}>
              <option value="none">No discount</option>
              <option value="percentage">Percentage</option>
              <option value="fixed">Fixed amount</option>
            </select>
          </label>
          <label className="field" htmlFor="products-discountValue">
            <span>Discount Value</span>
            <input id="products-discountValue" disabled={pricingLoading || (editing && !defaultVariation) || form.discountType === 'none'} min="0" max={form.discountType === 'percentage' ? 100 : undefined} step="0.01" type="number" value={form.discountValue ?? 0} onChange={(event) => update('discountValue', event.target.value)} placeholder="0" />
          </label>
          <label className="field field-wide" htmlFor="products-calculatedSalePrice">
            <span>Calculated Sale Price (₹)</span>
            <input id="products-calculatedSalePrice" className="calculated-price" readOnly value={salePrice === null ? '' : salePrice.toFixed(2)} placeholder="Calculated automatically" />
            <small className="pricing-help">{salePrice === null
              ? form.discountType === 'none' ? 'Choose a discount type to calculate the sale price.' : 'Enter a valid regular price and discount to calculate the sale price.'
              : form.discountType === 'percentage' ? `Sale price after ${discountValue}% discount.`
                : `Sale price after ${formatMoney(discountValue)} discount.`}</small>
          </label>
        </div>
      </section>;
    }
    if (resourceKey === 'products' && ['discountType', 'discountValue'].includes(field.name)) return null;
    if (field.type === 'checkbox') return <label className="featured-control" key={field.name}><input type="checkbox" checked={Boolean(value)} onChange={(event) => update(field.name, event.target.checked)} /><span>{field.label}</span></label>;
    if (field.type === 'tags') {
      const selectedTags = Array.isArray(value) ? value : [];
      const selectedLabel = selectedTags.length
        ? `${selectedTags.length} selected: ${selectedTags.slice(0, 2).join(', ')}${selectedTags.length > 2 ? ', …' : ''}`
        : 'Choose tags';
      return <div className="field field-wide" key={field.name}>
        <span>{field.label}</span>
        {tagsLoading
          ? <div className="editor-help" role="status">Loading tags…</div>
          : availableTags.length
            ? <details className="tag-dropdown">
              <summary>{selectedLabel}<ChevronDown size={15} /></summary>
              <div className="tag-options">{availableTags.map((tag) => (
                <label className="tag-option" key={recordId(tag) || tag.name}>
                  <input
                    type="checkbox"
                    checked={selectedTags.includes(tag.name)}
                    onChange={(event) => update('tags', event.target.checked
                      ? [...selectedTags, tag.name]
                      : selectedTags.filter((name) => name !== tag.name))}
                  />
                  <span>{tag.name}</span>
                </label>
              ))}</div>
            </details>
            : <div className="editor-help">No tags have been created yet. Add tags in Tags to make them available here.</div>}
      </div>;
    }
    if (field.type === 'select') return <label className="field" key={field.name}><span>{field.label}{required && <b> *</b>}</span><select required={required} value={value} onChange={(event) => update(field.name, event.target.value)}>{field.options.map((option) => <option key={option} value={option}>{option[0].toUpperCase() + option.slice(1)}</option>)}</select></label>;
    if (field.type === 'category' || field.type === 'subcategory' || field.type === 'brand') {
      const choices = field.type === 'category' ? categories
        : field.type === 'subcategory' ? subcategories.filter((item) => String(item.categoryId) === String(form.categoryId))
          : brands;
      const choiceLabel = field.type === 'brand' ? 'a brand' : field.type === 'category' ? 'a category' : 'a subcategory';
      return <label className="field" key={field.name}><span>{field.label}{required && <b> *</b>}</span><select required={required} disabled={field.type === 'subcategory' && !form.categoryId} value={value} onChange={(event) => update(field.name, event.target.value)}><option value="">{field.type === 'brand' ? 'No brand' : `Choose ${choiceLabel}`}</option>{choices.map((item) => <option key={recordId(item)} value={recordId(item)}>{item.name}</option>)}</select></label>;
    }
    if (resourceKey === 'subcategories' && field.name === 'imageUrl') return <>
      {permissions.has('subcategories.create')
        ? <div className="field field-wide subcategory-image-upload">
          <label className="field"><span>Upload subcategory image (JPEG, PNG, WebP; max 5 MB)</span><input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { setImageFile(event.target.files?.[0] || null); setError(''); }} /></label>
          <button type="button" className="button button-light" disabled={!imageFile || imageUploading} onClick={uploadSubcategoryImage}>{imageUploading ? <><LoaderCircle className="spin" size={15} /> Uploading…</> : 'Upload image'}</button>
        </div>
        : <div className="editor-help field-wide" role="status">The API requires the <strong>subcategories.create</strong> permission to upload subcategory images.</div>}
      <label className="field field-wide" key={field.name} htmlFor={`${resourceKey}-${field.name}`}><span>{field.label}{required && <b> *</b>}</span><input id={`${resourceKey}-${field.name}`} type="url" value={value} onChange={(event) => update(field.name, event.target.value)} placeholder="Upload an image above or paste a public image URL" /></label>
      {value && <div className="subcategory-image-preview field-wide"><img src={resolveMediaUrl(value)} alt="Subcategory preview" /></div>}
    </>;
    const control = { id: `${resourceKey}-${field.name}`, required, value, onChange: (event) => field.name === 'name' ? updateName(event.target.value) : update(field.name, event.target.value) };
    return <label className={`field ${field.type === 'textarea' || field.type === 'json' ? 'field-wide' : ''}`} key={field.name} htmlFor={control.id}><span>{field.label}{required && <b> *</b>}</span>{field.type === 'textarea' || field.type === 'json' ? <textarea {...control} rows={field.type === 'json' || field.name === 'items' ? 5 : 3} /> : <input {...control} type={field.type || 'text'} step={field.type === 'number' ? 'any' : undefined} />}</label>;
  }

  return <>
    <div className="page-heading"><div><span className="eyebrow">{resource.group}</span><h1 id="editor-title">{editing ? `Edit ${resource.singular}` : `Create ${resource.singular}`}</h1><p>{editing ? 'Only changed fields will be sent to the API.' : 'Enter the details for this record.'}</p></div><button className="button button-light" type="button" onClick={onClose}><ChevronLeft size={15} /> Back to {resource.title.toLowerCase()}</button></div>
    {error && <div className="notice notice-error" role="alert"><CircleAlert size={16} /><span>{error}</span></div>}
    <section className="data-card resource-editor-card"><form className="entity-form" onSubmit={submit}><div className="editor-grid">
      {fields.map(renderField)}
      {resourceKey === 'products' && <div className="field field-wide product-create-images">
        {editing && <section className="product-edit-images" aria-label="Uploaded product images">
          <strong>Uploaded images</strong>
          {productImagesLoading && <div className="editor-help" role="status">Loading uploaded images…</div>}
          {productImagesError && <div className="notice notice-error" role="alert">{productImagesError}</div>}
          {!productImagesLoading && !productImagesError && existingProductImages.length === 0 && <div className="editor-help">No images have been uploaded for this product.</div>}
          {!productImagesLoading && existingProductImages.length > 0 && <div className="product-edit-gallery">
            {existingProductImages.map((image, index) => {
              const imageUrl = image.imageUrl || image.image_url || '';
              const altText = image.altText || image.alt_text || record.name || 'Product image';
              const isPrimary = image.isPrimary ?? image.is_primary;
              return <figure key={recordId(image) || imageUrl || index}>
                <div>{imageUrl ? <MediaImage src={imageUrl} alt={altText} /> : <span>Image URL unavailable</span>}</div>
                <figcaption>{isPrimary ? 'Primary image' : altText}</figcaption>
              </figure>;
            })}
          </div>}
        </section>}
        {permissions.has('products.update')
          ? <>
          <label className="field"><span>Primary image (select 1; optional; JPEG, PNG, or WebP; max 5 MB)</span><input ref={primaryProductImageInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { setPrimaryProductImage(event.target.files?.[0] || null); setError(''); }} /></label>
          {primaryProductImage && <span className="upload-selection">Primary: {primaryProductImage.name}</span>}
          <label className="field"><span>Secondary images (select up to 8; optional; JPEG, PNG, or WebP; max 5 MB each)</span><input ref={secondaryProductImageInput} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { const selected = Array.from(event.target.files || []); setSecondaryProductImages(selected.slice(0, 8)); setError(selected.length > 8 ? 'You can select up to 8 secondary images. The first 8 have been kept.' : ''); }} /></label>
          {secondaryProductImages.length > 0 && <span className="upload-selection">{secondaryProductImages.length} of 8 secondary images selected: {secondaryProductImages.map((file) => file.name).join(', ')}</span>}
          <span className="editor-help">{editing ? 'Selected images upload after the product changes are saved. The API enforces a maximum of 9 images per product.' : 'Select the primary image first. Secondary images require a primary image and upload after the product is created.'}</span>
          </>
          : <div className="editor-help" role="status">Product images require the <strong>products.update</strong> permission to upload.</div>}
      </div>}
    </div><div className="modal-actions"><button className="button button-light" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy || imageUploading}>{busy || imageUploading ? <LoaderCircle className="spin" size={16} /> : editing ? 'Save changes' : <>Create {resource.singular} <ArrowRight size={16} /></>}</button></div></form></section>
  </>;
}

export function ResourcePage({ resourceKey, token, permissions }) {
  const resource = definitions[resourceKey];
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const list = usePagedList(resource.path, token, { search, status: status || undefined });
  const [editor, setEditor] = useState(null);
  const [managedProduct, setManagedProduct] = useState(null);
  const [detailRecord, setDetailRecord] = useState(null);
  const [busyId, setBusyId] = useState('');
  const canCreate = permissions.has(`${resource.permission}.create`);
  const canUpdate = resourceKey !== 'tags' && permissions.has(`${resource.permission}.update`);
  const canDelete = resourceKey !== 'tags' && permissions.has(`${resource.permission}.delete`);
  async function save(payload, { primaryProductImage, secondaryProductImages = [], pricing } = {}) {
    const editing = Boolean(editor.record);
    let result = { data: editor.record };
    if (!editing || Object.keys(payload).length) {
      result = await apiRequest(editing ? `${resource.path}/${recordId(editor.record)}` : resource.path, { method: editing ? 'PATCH' : 'POST', token, body: payload });
    }
    if (pricing) {
      try {
        await apiRequest(`/products/${recordId(editor.record)}/variations/${pricing.variationId}`, {
          method: 'PATCH',
          token,
          body: { price: pricing.price, salePrice: pricing.salePrice },
        });
      } catch (pricingError) {
        throw new Error(`Product details were saved, but pricing could not be updated: ${errorMessage(pricingError)}`);
      }
    }
    setEditor(null);
    list.refresh();
    if (resourceKey === 'products' && (primaryProductImage || secondaryProductImages.length)) {
      const productId = editing ? recordId(editor.record) : recordId(result.data);
      if (!productId) {
        list.setError('Product was saved, but its ID could not be determined, so the selected images could not be uploaded.');
        return;
      }
      const productImages = [
        ...(primaryProductImage ? [{ file: primaryProductImage, isPrimary: true }] : []),
        ...secondaryProductImages.map((file) => ({ file, isPrimary: false })),
      ];
      for (const [index, { file, isPrimary }] of productImages.entries()) {
        try {
          await apiRequest(`/products/${productId}/images/upload`, {
            method: 'POST',
            token,
            rawBody: file,
            contentType: file.type,
            query: { altText: file.name, sortOrder: editing ? 100 + index : index, isPrimary },
          });
        } catch (uploadError) {
          list.setError(`Product ${editing ? 'updated' : 'created'}, but ${isPrimary ? 'primary' : 'secondary'} image ${index + 1} of ${productImages.length} could not be uploaded: ${errorMessage(uploadError)}. Open Manage details to retry.`);
          return;
        }
      }
      list.refresh();
    }
  }
  async function remove(item) {
    if (!window.confirm(`Delete "${item.name || item.code || resource.singular}"?`)) return;
    setBusyId(recordId(item));
    list.setError('');
    try {
      await apiRequest(`${resource.path}/${recordId(item)}`, { method: 'DELETE', token });
      list.refresh();
    } catch (error) {
      list.setError(errorMessage(error));
    } finally { setBusyId(''); }
  }
  const columns = resource.columns.map((key) => ({ key, label: ({ createdAt: 'Created', category: 'Category', offerPrice: 'Offer price', discountType: 'Discount', discountValue: 'Value', expiresAt: 'Expires' })[key] || key.replace(/[A-Z]/g, (letter) => ` ${letter}`).replace(/^./, (letter) => letter.toUpperCase()) }));
  function renderCell(item, key) {
    if (key === 'category') return item.category?.name || item.categoryName || item.categoryId || '—';
    if (key === 'createdAt' || key === 'expiresAt') return formatDate(item[key]);
    if (key === 'offerPrice' || key === 'discountValue') return formatMoney(item[key]);
    if (key === 'status') return <span className={`status-pill status-${item.status || 'unknown'}`}>{item.status || '—'}</span>;
    return item[key] ?? '—';
  }
  if (editor) return <ResourceEditor resourceKey={resourceKey} record={editor.record} token={token} permissions={permissions} onClose={() => setEditor(null)} onSave={save} />;
  return <>
    <div className="page-heading"><div><span className="eyebrow">{resource.group}</span><h1>{resource.title}</h1><p>{resource.description}</p></div>{canCreate && <button type="button" className="button button-primary" onClick={() => setEditor({ record: null })}><Plus size={16} /> Add {resource.singular}</button>}</div>
    {list.error && <div className="notice notice-error" role="alert"><CircleAlert size={16} /><span>{list.error}</span><button type="button" aria-label="Dismiss error" onClick={() => list.setError('')}><X size={15} /></button></div>}
    <section className="data-card">
      <div className="data-toolbar"><div><strong>{resource.title}</strong><span>{list.pagination.total} total</span></div><form className="list-filters" onSubmit={(event) => { event.preventDefault(); list.setPage(1); setSearch(searchInput.trim()); }}><label className="search-field list-search" aria-label={`Search ${resource.title}`}><Search size={16} /><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder={`Search ${resource.title.toLowerCase()}`} /></label>{resourceKey !== 'tags' && <select aria-label="Filter by status" value={status} onChange={(event) => { setStatus(event.target.value); list.setPage(1); }}><option value="">All statuses</option>{(resourceKey === 'products' ? ['draft', 'active', 'inactive', 'archived'] : resourceKey === 'combo-offers' ? ['draft', 'active', 'inactive', 'expired'] : ['active', 'inactive']).map((value) => <option key={value} value={value}>{value}</option>)}</select>}<button type="submit" className="button button-light">Search</button></form></div>
      <DataTable columns={columns} items={list.items} loading={list.loading} emptyText={`No ${resource.title.toLowerCase()} found.`} renderCell={renderCell} actions={resourceKey === 'tags' ? undefined : (item) => <>{resourceKey === 'products' && <button className="button button-light button-small" type="button" onClick={() => setManagedProduct(item)}>Manage details</button>}<button className="button button-light button-small" type="button" onClick={() => setDetailRecord(item)}>View</button>{canUpdate && <button className="icon-button" type="button" aria-label={`Edit ${resource.singular}`} onClick={() => setEditor({ record: item })}><Pencil size={15} /></button>}{canDelete && <button className="icon-button danger-button" type="button" aria-label={`Delete ${resource.singular}`} disabled={busyId === recordId(item)} onClick={() => remove(item)}>{busyId === recordId(item) ? <LoaderCircle className="spin" size={15} /> : <X size={15} />}</button>}</>} />
      <Pager pagination={list.pagination} page={list.page} setPage={list.setPage} loading={list.loading} />
    </section>
    {managedProduct && <ProductResource product={managedProduct} token={token} permissions={permissions} onClose={() => { setManagedProduct(null); list.refresh(); }} />}
    {detailRecord && (resourceKey === 'products'
      ? <ProductDetails product={detailRecord} token={token} onClose={() => setDetailRecord(null)} />
      : <ResourceDetails title={`${resource.singular} details`} path={`${resource.path}/${recordId(detailRecord)}`} token={token} onClose={() => setDetailRecord(null)} />)}
  </>;
}
