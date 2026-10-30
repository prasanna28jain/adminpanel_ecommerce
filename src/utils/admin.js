export function recordId(record) {
  return record?.public_id || record?.id || record?.uuid || '';
}

export function normalize(record = {}) {
  return {
    ...record,
    categoryId: record.category_id ?? record.categoryId ?? '',
    subCategoryId: record.sub_category_id ?? record.subCategoryId ?? '',
    imageUrl: record.image_url ?? record.imageUrl ?? '',
    logoUrl: record.logo_url ?? record.logoUrl ?? '',
    shortDescription: record.short_description ?? record.shortDescription ?? '',
    seoTitle: record.seo_title ?? record.seoTitle ?? '',
    seoDescription: record.seo_description ?? record.seoDescription ?? '',
    seoKeywords: record.seo_keywords ?? record.seoKeywords ?? '',
    brandId: record.brand_id ?? record.brandId ?? '',
    discountType: record.discount_type ?? record.discountType ?? '',
    discountValue: record.discount_value ?? record.discountValue ?? '',
    offerPrice: record.offer_price ?? record.offerPrice ?? '',
    items: record.items ?? record.comboItems ?? record.combo_items ?? [],
    productIds: record.product_ids ?? record.productIds ?? [],
    categoryIds: record.category_ids ?? record.categoryIds ?? [],
    perCustomerLimit: record.per_customer_limit ?? record.perCustomerLimit ?? '',
    maxDiscountAmount: record.max_discount_amount ?? record.maxDiscountAmount ?? '',
    minimumOrderValue: record.minimum_order_value ?? record.minimumOrderValue ?? '',
    usageLimit: record.usage_limit ?? record.usageLimit ?? '',
    offerType: record.offer_type ?? record.offerType ?? '',
    buyQuantity: record.buy_quantity ?? record.buyQuantity ?? '',
    freeQuantity: record.free_quantity ?? record.freeQuantity ?? '',
    coinReward: record.coin_reward ?? record.coinReward ?? '',
    regularPrice: record.regular_price ?? record.regularPrice ?? '',
    tags: record.tags ?? [],
    sortOrder: record.sort_order ?? record.sortOrder ?? 0,
    createdAt: record.created_at ?? record.createdAt,
    expiresAt: record.expires_at ?? record.expiresAt,
    startsAt: record.starts_at ?? record.startsAt,
    isFeatured: Boolean(record.is_featured ?? record.isFeatured),
  };
}

export function displayName(user) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.name || user?.email || 'Admin';
}

export function initials(user) {
  return displayName(user).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('');
}

export function errorMessage(error) {
  if (error?.details?.length) return error.details.map((detail) => detail.message).filter(Boolean).join(' ');
  return error?.message || 'Something went wrong. Please try again.';
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount) : '—';
}
