# Edhyaa Admin API Guide

This guide describes the implemented backend endpoints for building the Edhyaa admin panel. The API uses JSON over HTTP and defaults to `http://localhost:5000/api/v1`. All IDs described as UUIDs are public IDs returned by the API. Use them in URLs and relationships.

## Common request and response rules

Send JSON requests with `Content-Type: application/json`. For protected routes, send the access token in `Authorization: Bearer <accessToken>`. Login and webhooks are the exceptions. Unknown JSON fields are rejected by validation, so send only documented properties. Monetary values in normal admin APIs are decimal rupees; Razorpay's `amount` is in paise.

Most successful responses use this shape:

```json
{
  "success": true,
  "message": "Product created successfully",
  "data": {
    "id": "8b76cdb5-0625-4ea5-86c2-fba6caf2a145",
    "name": "Floral Dress"
  }
}
```

Paginated list responses use `data` as an array and include `pagination`:

```json
{
  "success": true,
  "message": "Products retrieved successfully",
  "data": [],
  "pagination": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 }
}
```

Validation errors return HTTP 400:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [{ "field": "name", "message": "Product name must contain at least 2 characters" }]
}
```

Other common statuses: `401` missing/invalid token, `403` permission denied, `404` resource not found, `409` business-rule conflict, `500` unexpected server error. The UI should display the response `message` and map `errors[].field` to form controls where appropriate.

## Authentication

| Method | Endpoint | Auth |
|---|---|---|
| POST | `/auth/login` | Public; Admin account required |
| GET | `/auth/customer/coins` | Customer access token |
| GET | `/auth/me` | Bearer token |

`POST /auth/login` body:

```json
{ "email": "admin@example.com", "password": "your-password" }
```

Response `data` contains `accessToken`, `tokenType` (`Bearer`), `expiresIn`, and `user` with `id`, name, email, roles, and permissions. Keep the token in the admin app's authentication state and attach it to protected calls. `GET /auth/me` returns the current user's public profile.

Customer web accounts use `POST /auth/signup` with `firstName`, optional `lastName`, `email`, and `password`; successful signup returns HTTP 201 and signs the customer in. Use `POST /auth/customer/login` for subsequent customer logins and `GET /auth/customer/me` to retrieve the current profile. Customer passwords require at least 8 characters and are limited to 72 UTF-8 bytes. Duplicate emails return HTTP 409. Signup always assigns the Customer role and never accepts a role from the request.

For the admin panel, `POST /auth/admin/login` is the preferred endpoint. The existing `POST /auth/login` remains available as an Admin-only alias for compatibility. Admin accounts must be provisioned out-of-band using `npm run db:seed` and `node scripts/create-admin.js`; public signup cannot create administrators. Configure a unique random `JWT_SECRET` of at least 32 characters in each environment and optionally set `JWT_EXPIRES_IN` (default: `15m`). Admin and customer access tokens use different JWT audiences and cannot be substituted for one another.

Set `FRONTEND_URL` and `ADMIN_URL` to the exact origins of the deployed customer website and admin panel so browser requests pass the API CORS allowlist.

## Endpoint and permission map

Every endpoint in this table is under `/api/v1`. Public catalog reads are marked below. All other catalog, customer, offer, order, settings, payment-admin, shipment-admin and report routes require a valid Admin token and the listed permission.

| Module | Methods and path | Permission |
|---|---|---|
| Categories | GET `/categories`, GET `/categories/:id` | Public; Admin tokens may also be used to read any status and require `categories.view` |
| | POST `/categories` | `categories.create` |
| | PATCH `/categories/:id` | `categories.update` |
| | DELETE `/categories/:id` | `categories.delete` |
| Subcategories | GET `/subcategories`, GET `/subcategories/:id` | `subcategories.view` |
| | POST `/subcategories` | `subcategories.create` |
| | PATCH `/subcategories/:id` | `subcategories.update` |
| | DELETE `/subcategories/:id` | `subcategories.delete` |
| Brands | GET `/brands`, GET `/brands/:id` | `products.view` |
| | POST `/brands` / PATCH `/brands/:id` / DELETE `/brands/:id` | `products.create` / `products.update` / `products.delete` |
| Tags | GET `/tags` | `products.view` |
| | POST `/tags` | `products.create` |
| Products | GET `/products`, GET `/products/:id` | Public; Admin tokens may also be used to read any status and require `products.view` |
| | POST `/products`, PATCH `/products/:id`, DELETE `/products/:id` | `products.create`, `products.update`, `products.delete` respectively |
| Product images | GET `/products/:id/images` | `products.view` |
| | POST `/products/:id/images`, POST `/products/:id/images/upload`, PATCH/DELETE `/products/:id/images/:imageId` | `products.update` |
| Shared attributes | GET/POST `/products/attributes`; PATCH `/products/attributes/:attributeId` | `products.view`, `products.create`, `products.update` respectively |
| Shared attribute values | GET/POST `/products/attributes/:attributeId/values`; PATCH/DELETE `/products/attributes/:attributeId/values/:valueId` | `products.view`, `products.create`, `products.update`, `products.delete` respectively |
| Product attribute assignment | GET `/products/:id/attributes`; POST `/products/:id/attributes/:attributeId/assign`; DELETE `/products/:id/attributes/:attributeId` to detach | `products.view`, `products.update`, `products.delete` respectively |
| Variations | GET `/products/:id/variations[/:variationId]`, POST/PATCH/DELETE same paths | view/create/update/delete product permissions by method |
| Customers | GET `/customers`, GET `/customers/:id`, GET `/customers/:id/orders`, GET addresses | `customers.view` |
| | PATCH `/customers/:id`, POST/PATCH/DELETE customer addresses | `customers.update` |
| Coupons | GET `/coupons`, GET `/coupons/:id` | `coupons.view` |
| | POST/PATCH/DELETE coupons | `coupons.create` / `coupons.update` / `coupons.delete` |
| Combo offers | GET `/combo-offers`, GET `/combo-offers/:id` | `combo_offers.view` |
| | POST/PATCH/DELETE combo offers | `combo_offers.create` / `combo_offers.update` / `combo_offers.delete` |
| Orders | GET `/orders`, GET `/orders/:id`, GET `/orders/:id/returns` | `orders.view` |
| | POST `/orders`, POST `/orders/:id/returns` | `orders.create` |
| | PATCH `/orders/:id/status`, PATCH `/orders/:id/returns/:returnId` | `orders.update_status` |
| Payment settings | GET/PUT `/settings/payment-provider` | `settings.view` / `settings.update` |
| Payment provider catalog | GET/POST `/settings/payment-providers`, PATCH/DELETE `/settings/payment-providers/:id` | `settings.view` / `settings.update` |
| Payments | POST `/payments/orders/:id`, POST `/payments/orders/:id/refunds`, POST `/payments/orders/:id/mark-cod-paid` | `payments.manage` |
| | GET `/payments/orders/:id/refunds` | `orders.view` |
| Shipments | POST `/shipments/orders/:orderId`, POST `/shipments/:id/dispatch` | `shipping.manage` |
| | GET `/shipments/:id`, GET `/shipments/:id/track` | `orders.view` |
| Reports | GET `/reports/dashboard` | `dashboard.view` |

`DELETE` on categories, subcategories, products, brands, coupons and variations follows the module's soft-delete or status rules; it does not mean the UI should assume the record was physically removed. Attribute and value path IDs, variation attribute IDs and image IDs are numeric IDs where noted by the endpoint data model. Most top-level resource IDs are UUIDs.

Unauthenticated users can list and retrieve active categories and products. Draft, inactive, and archived products and inactive categories remain hidden from public requests. Admin requests with a valid Admin token retain the full catalog view and require the listed view permission. All catalog writes and product management subroutes remain protected.

## Catalog examples

### Categories, subcategories, brands

Create a tag with `POST /tags`:

```json
{ "name": "Hot" }
```

The API generates the tag slug from its name. Use `GET /tags?page=1&limit=20&search=hot` to list tags for product forms; the admin product form loads all pages and offers the tag names as selectable options. Tag names and slugs must be unique. Product creation accepts tag names in its `tags` array; existing tags with matching names are linked to the product.

`POST /categories`:

```json
{
  "name": "Women's Clothing",
  "slug": "womens-clothing",
  "description": "Clothing and apparel",
  "imageUrl": "https://cdn.example.com/categories/clothing.jpg",
  "seoTitle": "Women's Clothing",
  "seoDescription": "Shop clothing",
  "seoKeywords": "clothing,women",
  "status": "active",
  "sortOrder": 0
}
```

To upload a category image, send the raw file bytes to `POST /categories/images/upload` with the Admin Bearer token and `Content-Type: image/jpeg`, `image/png`, or `image/webp` (maximum 5 MB). The endpoint requires `categories.create` or `categories.update`, so it works both when creating a category and when editing one. The response contains `data.imageUrl`; include that URL in the `imageUrl` field and save the category to attach it. You can also provide an externally hosted image URL directly in the category request.

Example upload:

```sh
curl -X POST "http://localhost:5000/api/v1/categories/images/upload" \
  -H "Authorization: Bearer ADMIN_ACCESS_TOKEN" \
  -H "Content-Type: image/jpeg" \
  --data-binary "@category.jpg"
```

The endpoint validates the file signature and stores uploads under `uploads/categories`. Configure `PUBLIC_BASE_URL` to the public API base URL. Use persistent shared storage before deploying multiple server instances.

Subcategory images use the same flow at `POST /subcategories/images/upload` (requires `subcategories.create`). Upload the raw JPEG, PNG, or WebP bytes with the matching `Content-Type`; use the returned `data.imageUrl` in the `imageUrl` field of `POST /subcategories`. Files are stored under `uploads/subcategories`.

`POST /subcategories` uses the category UUID:

```json
{ "categoryId": "CATEGORY_UUID", "name": "Dresses", "slug": "dresses", "status": "active", "sortOrder": 0 }
```

`POST /brands`:

```json
{ "name": "Edhyaa Studio", "slug": "edhyaa-studio", "description": "In-house label", "logoUrl": "https://cdn.example.com/brand.png", "status": "active" }
```

For each list endpoint, use `page` and `limit` (1–100), with supported `search`, `status`, and sort parameters. Categories accept `sortBy=name|created_at|sort_order`; products accept `name|created_at|updated_at`; subcategories accept `name|created_at|sort_order`. Product list filters include `categoryId`, `subCategoryId`, `brandId`, and `status`.

### Products

`POST /products`:

```json
{
  "name": "Floral Dress",
  "categoryId": "CATEGORY_UUID",
  "subCategoryId": "SUBCATEGORY_UUID",
  "brandId": "BRAND_UUID",
  "shortDescription": "Lightweight floral dress",
  "description": "Full product description.",
  "regularPrice": 2499,
  "discountType": "percentage",
  "discountValue": 10,
  "tags": ["floral", "summer", "dress"],
  "status": "draft",
  "isFeatured": false,
  "seoTitle": "Floral Dress",
  "seoDescription": "Shop the floral dress",
  "seoKeywords": "dress,floral"
}
```

`slug` is optional; if omitted, the API generates a URL-safe slug from `name` and adds a suffix if needed to keep it unique. `categoryId` is required. `brandId` is an optional UUID when the product has a brand. `regularPrice` is required and creates the product's initial default variation and SKU. `discountType` accepts `none`, `percentage`, or `fixed`; omit `discountValue` for `none`, use 1–100 for a percentage, or an amount no greater than `regularPrice` for a fixed discount. The API calculates the resulting sale price. On product edit, update the default variation's `price` and `salePrice` using `PATCH /products/:id/variations/:variationId`; the admin form uses that endpoint to save the edited pricing model. `tags` is an optional array of up to 50 strings. Status values: `draft`, `active`, `inactive`, `archived`. Use the product UUID as `:id`.

`PATCH /products/:id` takes any non-empty subset of the editable product fields (name, slug, category/brand, descriptions, tags, status, featured and SEO fields). `tags` is an optional array of up to 50 tag names, matching the product creation format.

### Images

The admin product form can let the user choose images from their device with a file input. Create the product first with `POST /products`, then upload the selected files one at a time using the returned product UUID. Upload the primary image first; the API automatically makes the first image primary. Upload up to eight more images as secondary images. Each file must be JPEG, PNG, or WebP and no larger than 5 MB. Image upload requires the Admin Bearer token and `products.update` permission.

Example browser flow:

```js
const productResponse = await fetch(`${API_BASE}/products`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(productForm),
});

const productResult = await productResponse.json();
if (!productResponse.ok) throw new Error(productResult.message);

const productId = productResult.data.id;
for (const [index, file] of selectedFiles.slice(0, 9).entries()) {
  const query = new URLSearchParams({
    sortOrder: String(index),
    isPrimary: String(index === 0),
  });
  const imageResponse = await fetch(
    `${API_BASE}/products/${productId}/images/upload?${query}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': file.type,
      },
      body: file,
    },
  );
  const imageResult = await imageResponse.json();
  if (!imageResponse.ok) throw new Error(imageResult.message);
}
```

`selectedFiles` should place the chosen primary image first. The API stores each successful upload immediately, so if a later upload fails, keep the product and retry the failed image instead of creating the product again. The returned image records can be read with `GET /products/:id/images`.

To attach an existing public image URL, `POST /products/:id/images`:

```json
{ "imageUrl": "https://cdn.example.com/floral-dress-front.jpg", "altText": "Front view", "sortOrder": 0, "isPrimary": true }
```

For upload, send the **raw binary file** (not JSON or multipart) to `POST /products/:id/images/upload`, with `Content-Type: image/jpeg`, `image/png`, or `image/webp`; maximum 5 MB. Optional query string: `?altText=Front%20view&sortOrder=0&isPrimary=true`. Upload the primary image first (the first image is automatically primary), then upload up to 8 secondary images with `isPrimary=false`. The API enforces a maximum of 9 images per product and keeps one primary image. The server validates image signatures and returns a normal success envelope with image metadata. Uploaded files are saved locally under `uploads/products`; configure `PUBLIC_BASE_URL` and use persistent shared storage before deploying multiple server instances.

### Attributes, values and variations

Attributes are reusable across products. To create an attribute like the admin form, send its name and at least one value label together to `POST /products/attributes`. The backend rejects duplicate names or repeated values, generates slugs, and saves the attribute and values in one transaction:

```json
{ "name": "Size", "values": ["S", "M", "L", "XL"] }
```

For example, Color can be created with `{"name":"Color","values":["Red","Blue"]}`. The create request has just the attribute name and its list of values; slugs and display defaults are generated by the backend. `GET /products/attributes` returns each shared attribute with its values. Attach one to a product with `POST /products/:id/attributes/:attributeId/assign`, then read assigned attributes with `GET /products/:id/attributes`. Attribute IDs and value IDs are numeric IDs returned in responses. Existing `POST /products/:id/attributes` remains available and creates a shared attribute with values, already attached to that product.

Manage shared values directly with `GET/POST /products/attributes/:attributeId/values` and `PATCH/DELETE /products/attributes/:attributeId/values/:valueId`. Only `value` is required when adding one value; its slug is generated automatically. To edit an attribute's name or replace its value list, patch `/products/attributes/:attributeId`:

```json
{ "name": "Size", "values": ["12", "14", "16"] }
```

Replacing values retires the previous values from the active list and creates the submitted list in order. Values already used by variations remain stored for those variations, but cannot be selected for new ones.

To add one value instead of replacing the list:

```json
{ "value": "XXL" }
```

Create a variation with `POST /products/:id/variations`:

```json
{
  "sku": "DRESS-RED-S",
  "price": 1499,
  "salePrice": 1299,
  "costPrice": 650,
  "taxRate": 5,
  "status": "active",
  "isDefault": true,
  "attributeValues": [
    { "attributeId": 1, "attributeValueId": 4 },
    { "attributeId": 2, "attributeValueId": 8 }
  ]
}
```

`attributeId` and `attributeValueId` refer to numeric IDs in the admin API. Attribute definitions and values are shared, so changes affect every product using that attribute. Deleting an attribute from a product detaches it from that product; it does not delete the shared definition. SKU and attribute combination must be unique; sale price cannot exceed regular price. Patch variations with a non-empty subset of variation fields. Variation path IDs are public UUIDs.

In the admin product manager, assign shared attributes to the product before adding variations. The variation form then offers one value selector for each assigned attribute and submits the selected combination in the `attributeValues` format shown above, without requiring administrators to enter JSON manually.

The **Generate all combinations** action creates a variation for every combination of the product's assigned attribute values (for example, 3 sizes × 3 colors creates 9 variations). Existing combinations are skipped. Generated SKUs are based on the product and selected values; generated variations inherit the current product price and are marked active.

## Customers and offers

Customer list: `GET /customers?page=1&limit=20&search=maya&status=active`. Change status with `PATCH /customers/:id`:

```json
{ "status": "suspended" }
```

Customer address creation at `POST /customers/:id/addresses`:

```json
{
  "label": "Home",
  "recipientName": "Maya Sharma",
  "phone": "+919876543210",
  "addressLine1": "12 Park Street",
  "addressLine2": null,
  "city": "Kolkata",
  "state": "West Bengal",
  "postalCode": "700016",
  "countryCode": "IN",
  "isDefault": true
}
```

Coupon creation at `POST /coupons`:

```json
{
  "code": "WELCOME10",
  "offerType": "percentage_off",
  "discountType": "percentage",
  "discountValue": 10,
  "maxDiscountAmount": 500,
  "minimumOrderValue": 1000,
  "startsAt": "2026-10-01T00:00:00.000Z",
  "expiresAt": "2026-12-31T23:59:59.000Z",
  "usageLimit": 100,
  "perCustomerLimit": 1,
  "status": "active",
  "productIds": [],
  "categoryIds": []
}
```

Coupon `offerType` values are `fixed_off`, `percentage_off`, `buy_x_get_y`, and `app_coins`. Percentage and fixed discounts use `discountValue`; percentage is capped at 100. Both use `minimumOrderValue` as the order threshold, measured against the item subtotal before coupon discounts, shipping, and tax. For `buy_x_get_y`, provide `buyQuantity` and `freeQuantity`; the cheapest eligible units are free, with each product/category selected in `productIds` and `categoryIds` eligible as either the bought or free item. A complete group requires `buyQuantity + freeQuantity` eligible units. For `app_coins`, provide `coinReward`; the customer earns that many coins after payment is confirmed, provided the order meets `minimumOrderValue`. Fully refunded orders have their earned coins reversed. `productIds` and `categoryIds` are optional restrictions for all offer types.

Buy X Get Y example:

```json
{
  "code": "BUY2GET1",
  "offerType": "buy_x_get_y",
  "buyQuantity": 2,
  "freeQuantity": 1,
  "minimumOrderValue": 0,
  "status": "active",
  "productIds": [],
  "categoryIds": []
}
```

App coins example:

```json
{
  "code": "COINS100",
  "offerType": "app_coins",
  "coinReward": 100,
  "minimumOrderValue": 1000,
  "status": "active",
  "productIds": [],
  "categoryIds": []
}
```

Customers can retrieve their coin balance and latest transactions from `GET /auth/customer/coins` using a customer access token. Coin rewards are earned points; they are not a cash discount on the order.

`POST /combo-offers` accepts an offer and variation list:

```json
{
  "name": "Dress Set",
  "slug": "dress-set",
  "description": "A curated set",
  "offerPrice": 2499,
  "startsAt": "2026-10-01T00:00:00.000Z",
  "expiresAt": "2026-12-31T23:59:59.000Z",
  "status": "draft",
  "items": [{ "variationId": "VARIATION_UUID", "quantity": 1 }]
}
```

Combo status values: `draft`, `active`, `inactive`, `expired`. Combo management exists; combo items are not currently supported in order creation.

## Orders, returns and payments

Create an admin order at `POST /orders`. The idempotency key should be unique per checkout attempt and at least 8 characters. Prices and tax are loaded by the server, never supplied by the admin UI:

```json
{
  "customerId": "CUSTOMER_UUID",
  "idempotencyKey": "admin-order-20261020-001",
  "items": [{ "variationId": "VARIATION_UUID", "quantity": 2 }],
  "shippingAddress": {
    "recipientName": "Maya Sharma",
    "phone": "+919876543210",
    "addressLine1": "12 Park Street",
    "addressLine2": null,
    "city": "Kolkata",
    "state": "West Bengal",
    "postalCode": "700016",
    "countryCode": "IN"
  },
  "billingAddress": null,
  "paymentMethod": "cod",
  "couponCode": "WELCOME10",
  "customerNote": "Call on arrival"
}
```

`paymentMethod` is `cod` or `online`. Online orders begin pending and reserve stock. Captured payment consumes the reservation. Cancelling an unpaid order releases it. Order list filters support `page`, `limit`, `search`, `status`, and `paymentStatus`. Status updates use `PATCH /orders/:id/status`, e.g. `{ "status": "processing", "note": "Packed" }`; allowed transitions are enforced by the server.

Returns: list `GET /orders/:id/returns`; create `POST /orders/:id/returns`:

```json
{
  "reason": "Size does not fit",
  "items": [{ "orderItemId": 123, "quantity": 1, "restock": true }]
}
```

`orderItemId` is the numeric ID supplied on the order item's API representation. Returns may only be requested for delivered orders, and requested quantity cannot exceed the unreturned quantity. Progress with `PATCH /orders/:id/returns/:returnId` and `{ "status": "approved" }`, then `{ "status": "received" }` or `{ "status": "rejected" }`. Marking a restockable return received adds it to inventory. Return refunds are not automatically linked to payment refunds.

### Payment provider and refunds

`GET /settings/payment-provider` returns configured provider options and active provider. Set with `PUT /settings/payment-provider`:

```json
{ "provider": "razorpay" }
```

Built-in providers are COD and Razorpay; Razorpay must be configured on the server before selection. Each provider must have a backend adapter, so this does not allow arbitrary gateways without implementation. For an online order, call `POST /payments/orders/:orderId`; the response gives Razorpay `keyId`, `providerOrderId`, `amount` in paise, currency and payment ID for the checkout UI. The signed Razorpay webhook is authoritative for payment confirmation.

Manage provider records with `GET /settings/payment-providers`, `POST /settings/payment-providers`, `PATCH /settings/payment-providers/:id`, and `DELETE /settings/payment-providers/:id`. Create with the fields shown in the admin form:

```json
{
  "name": "Stripe",
  "slug": "stripe",
  "active": true,
  "publicKey": "pk_live_...",
  "secretKey": "sk_live_...",
  "webhookSecret": "whsec_..."
}
```

Provider credentials are encrypted at rest using `PAYMENT_CREDENTIALS_ENCRYPTION_KEY` (32 random bytes encoded as 64 hex characters). Keep this key stable and secret across deployments. Responses never include secret or webhook-secret values; they include `hasSecretKey` and `hasWebhookSecret` flags instead. Custom provider records can be managed and enabled here, but online checkout and refunds require a provider-specific backend adapter. Only supported integrations can be selected with `PUT /settings/payment-provider`.

Refund request `POST /payments/orders/:orderId/refunds`:

```json
{ "amount": 500, "idempotencyKey": "refund-order-123-1", "reason": "Customer request" }
```

Refund amount is in rupees. List refunds with `GET /payments/orders/:orderId/refunds`. For COD collected outside the online gateway, `POST /payments/orders/:orderId/mark-cod-paid` accepts `{ "reference": "POS-123", "note": "Collected at delivery" }`.

## Shipments

Create a Shiprocket shipment with `POST /shipments/orders/:orderId`:

```json
{ "weightKg": 0.8, "lengthCm": 30, "breadthCm": 22, "heightCm": 5 }
```

Then call `POST /shipments/:shipmentId/dispatch` to assign AWB/schedule pickup. `GET /shipments/:shipmentId` reads saved shipment details and `GET /shipments/:shipmentId/track` refreshes tracking. Configure Shiprocket API-user credentials and pickup location in server environment; credentials are not sent from the admin UI. Configure its callback as `/api/v1/webhooks/carrier-update` with `x-api-key` matching `SHIPROCKET_WEBHOOK_SECRET`. Shipment cancellation and return pickup are not implemented.

## Dashboard

`GET /reports/dashboard?from=2026-10-01&to=2026-10-20` returns the dashboard aggregate: sales by day, revenue, order totals, recent orders, low-stock variations, catalog counts, and coupon usage. Both date values are optional ISO dates; `from` must be no later than `to`.

## Admin panel implementation notes

- Build navigation and action buttons from the `user.permissions` list returned by login. The API remains the final permission check.
- Use UUIDs for resource references unless an endpoint explicitly takes a numeric attribute/value/image/order-item ID.
- Send only changed fields in PATCH requests; empty patches are invalid.
- Display server-calculated totals from order responses. Never calculate or submit trusted prices from the browser.
- Refresh/re-authenticate when a token expires. The current login API issues an access token; there is no refresh-token endpoint.
- Product uploads use local disk storage currently; plan persistent object storage before production/multi-instance deployment.

## Server environment

Use `.env.example` as the key list and keep actual secrets in the local `.env` or deployment secret manager. Provider keys include Razorpay key ID/secret/webhook secret, the payment-credential encryption key, and Shiprocket API-user email/password, pickup location and webhook secret. Set `PUBLIC_BASE_URL` to the backend's externally reachable base URL for image links. Never expose provider secrets to the admin browser.
