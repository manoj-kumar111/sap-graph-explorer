import Database from 'better-sqlite3';
import path from 'path';

let db = null;

export function getDb() {
  if (!db) {
    const dbPath = path.join(process.cwd(), 'sap_graph.db');
    db = new Database(dbPath, { readonly: true });
    db.pragma('journal_mode = WAL');
  }
  return db;
}

export function getSchema() {
  return `
DATABASE SCHEMA (SQLite):

Table: sales_order_headers
  - salesOrder TEXT (PK) — Sales Order number
  - salesOrderType TEXT — e.g. "OR"
  - salesOrganization TEXT
  - soldToParty TEXT — Customer number (FK to business_partners.customer)
  - creationDate TEXT — ISO date
  - totalNetAmount REAL — Total value
  - transactionCurrency TEXT — e.g. "USD"
  - overallSDProcessStatus TEXT — Overall status
  - overallDeliveryStatus TEXT — "A"=not yet, "B"=partial, "C"=complete
  - overallBillingStatus TEXT — "A"=not yet, "B"=partial, "C"=complete
  - paymentTerms TEXT

Table: sales_order_items
  - salesOrder TEXT (FK)
  - salesOrderItem TEXT — Line item number (e.g. "10", "20")
  - material TEXT — Product/Material number (FK to products.product)
  - orderQuantity REAL
  - netAmount REAL
  - plant TEXT — (FK to plants.plant)
  - deliveryStatus TEXT
  - billingStatus TEXT

Table: outbound_delivery_headers
  - deliveryDocument TEXT (PK)
  - deliveryDocumentType TEXT
  - soldToParty TEXT
  - creationDate TEXT
  - deliveryDate TEXT
  - actualGoodsMovementDate TEXT
  - shippingPoint TEXT
  - overallGoodsMovementStatus TEXT

Table: outbound_delivery_items
  - deliveryDocument TEXT (FK)
  - deliveryDocumentItem TEXT
  - material TEXT
  - plant TEXT
  - actualDeliveryQuantity REAL
  - referenceSDDocument TEXT — Links to salesOrder
  - referenceSDDocumentItem TEXT

Table: billing_document_headers
  - billingDocument TEXT (PK)
  - billingDocumentType TEXT
  - billingDocumentDate TEXT
  - soldToParty TEXT
  - totalNetAmount REAL
  - transactionCurrency TEXT
  - billingDocumentIsCancelled INTEGER — 0/1
  - cancelledBillingDocument TEXT
  - referenceSDDocument TEXT

Table: billing_document_items
  - billingDocument TEXT (FK)
  - billingDocumentItem TEXT
  - material TEXT
  - netAmount REAL
  - plant TEXT
  - referenceSDDocument TEXT — Links to salesOrder or deliveryDocument
  - referenceSDDocumentItem TEXT

Table: billing_document_cancellations
  - billingDocument TEXT
  - cancelledBillingDocument TEXT

Table: journal_entry_items (Accounts Receivable journal entries)
  - companyCode TEXT
  - fiscalYear TEXT
  - accountingDocument TEXT
  - accountingDocumentItem TEXT
  - accountingDocumentType TEXT
  - customer TEXT
  - amountInCompanyCurrency REAL
  - postingDate TEXT
  - clearingDocument TEXT
  - clearingDate TEXT

Table: payments (Accounts Receivable payments)
  - companyCode TEXT
  - fiscalYear TEXT
  - accountingDocument TEXT
  - accountingDocumentItem TEXT
  - accountingDocumentType TEXT
  - customer TEXT
  - amountInCompanyCurrency REAL
  - postingDate TEXT
  - clearingDocument TEXT

Table: business_partners
  - businessPartner TEXT (PK)
  - customer TEXT — Customer number
  - firstName TEXT
  - lastName TEXT
  - businessPartnerFullName TEXT

Table: business_partner_addresses
  - businessPartner TEXT (FK)
  - addressID TEXT
  - cityName TEXT
  - country TEXT
  - region TEXT

Table: products
  - product TEXT (PK) — Material/Product number
  - productType TEXT
  - productGroup TEXT
  - baseUnit TEXT
  - division TEXT

Table: product_descriptions
  - product TEXT (FK)
  - language TEXT
  - productDescription TEXT — Human-readable product name

Table: plants
  - plant TEXT (PK)
  - plantName TEXT
  - companyCode TEXT
  - country TEXT
  - cityName TEXT

Table: product_plants
  - product TEXT (FK to products.product)
  - plant TEXT (FK to plants.plant)
  - countryOfOrigin TEXT
  - profitCenter TEXT
  - mrpType TEXT — MRP planning type

Table: product_storage_locations
  - product TEXT (FK to products.product)
  - plant TEXT (FK to plants.plant)
  - storageLocation TEXT
  - warehouseStorageBin TEXT

Table: sales_order_schedule_lines
  - salesOrder TEXT (FK to sales_order_headers.salesOrder)
  - salesOrderItem TEXT
  - scheduleLine TEXT
  - orderQuantity REAL
  - orderQuantityUnit TEXT
  - scheduledQuantity REAL
  - deliveredQuantity REAL
  - confdOrderQtyByMatlAvailCheck REAL — Confirmed quantity by material availability

KEY RELATIONSHIPS (for JOINs):
  - sales_order_headers.soldToParty = business_partners.customer
  - sales_order_items.salesOrder = sales_order_headers.salesOrder
  - sales_order_items.material = products.product
  - sales_order_items.plant = plants.plant
  - sales_order_schedule_lines.salesOrder = sales_order_headers.salesOrder
  - sales_order_schedule_lines.salesOrderItem = sales_order_items.salesOrderItem
  - outbound_delivery_items.referenceSDDocument = sales_order_headers.salesOrder
  - outbound_delivery_headers.soldToParty = business_partners.customer
  - billing_document_items.referenceSDDocument can reference salesOrder OR deliveryDocument
  - billing_document_headers.soldToParty = business_partners.customer
  - journal_entry_items.customer = business_partners.customer
  - payments.customer = business_partners.customer
  - product_descriptions.product = products.product
  - product_plants.product = products.product AND product_plants.plant = plants.plant
  - product_storage_locations.product = products.product AND product_storage_locations.plant = plants.plant
  `;
}
