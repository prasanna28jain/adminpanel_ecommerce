# Edhyaa Admin Dashboard

React + Vite admin app for the existing Edhyaa API. It includes admin sign-in,
a reporting dashboard, catalogue and offer management, and operational pages
for inventory, customers, orders, payments, and shipments.

## Run locally

1. Start the backend API on port `5000`.
2. Copy `.env.example` to `.env` and set `VITE_API_BASE_URL` if the API is at a
   different origin or path.
3. Run `npm install` and `npm run dev`.

Vite serves the dashboard at `http://localhost:5173`, an origin allowed by the
backend's current CORS configuration.

## API integration

The app shell and reusable sidebar live in `src/App.jsx` and
`src/components/Sidebar.jsx`. Catalogue screens are split into individual
modules under `src/pages/`, with shared resource forms, table components,
configuration, and admin utilities kept in their respective shared folders.

The dashboard uses `/auth/admin/login` and `/auth/me`, and connects pages to the
documented `/reports/dashboard`, catalogue, inventory, customer, offer, order,
payment, settings, and shipment endpoints. Categories, subcategories, products,
and coupons have searchable, paginated indexes with dedicated create/edit
pages. Tags have an index and create page; the API currently documents tag
listing and creation only, so tag editing and deletion are not offered.
The coupon management page displays offer benefits, minimum order values,
validity windows, usage limits, and status, with searchable, status-filtered
create/edit/detail/delete workflows for the documented coupon offer types.
Category images can be uploaded from the category editor; the dashboard sends
JPEG, PNG, or WebP files (up to 5 MB) to the documented upload endpoint and
fills the returned image URL into the category form.
Subcategory images can be uploaded from their create/edit page in the same way;
the API requires `subcategories.create` permission for that upload endpoint.
Product image management has separate primary-image and secondary-images
selectors. Upload one primary image and up to eight secondary images (JPEG,
PNG, or WebP; 5 MB each), within the API's nine-image limit. Product creation
also accepts those separate optional image fields and uploads them after the
product is created, using its new ID. This requires `products.update`
permission; if an image upload fails, the created product remains saved and the
page reports which image needs retrying.
Protected requests include the
bearer token. Tokens are held in browser local storage and cleared on logout or
an authenticated `401` response. The UI uses the user's permissions to hide
pages and actions; the API remains the final authorization check.

Operational actions that require contextual identifiers (such as an order UUID,
shipment UUID, or inventory variation identifiers) provide form fields for
those values or use identifiers returned by the relevant list endpoint. Product detail
management includes image URL/binary upload, attributes and values, and
variations. Customers can manage addresses, orders can be created and their
returns managed, and inventory can be initialized as well as adjusted.
Provider credentials are never entered or stored in the dashboard.

The UI only offers actions supported by the API guide. For example, the API
does not document deleting orders, inventory records, returns, or shipments;
those resources therefore have status/transaction workflows rather than a
delete action.
