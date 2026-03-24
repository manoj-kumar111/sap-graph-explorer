const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'sap_graph.db');
const DATA_DIR = path.join(__dirname, '..', 'data', 'sap-o2c-data');

function readJsonlFiles(dirName) {
  const dirPath = path.join(DATA_DIR, dirName);
  if (!fs.existsSync(dirPath)) {
    console.log(`  ⚠ Directory not found: ${dirName}`);
    return [];
  }
  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl'));
  const records = [];
  for (const file of files) {
    const lines = fs.readFileSync(path.join(dirPath, file), 'utf-8')
      .split('\n')
      .filter(line => line.trim());
    for (const line of lines) {
      try {
        records.push(JSON.parse(line));
      } catch (e) {
        // skip malformed lines
      }
    }
  }
  console.log(`  ✔ ${dirName}: ${records.length} records`);
  return records;
}

function main() {
  console.log('🚀 Starting database seed...\n');

  // Remove existing DB
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
    console.log('  Removed existing database\n');
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create tables
  console.log('📋 Creating tables...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS sales_order_headers (
      salesOrder TEXT PRIMARY KEY,
      salesOrderType TEXT,
      salesOrganization TEXT,
      soldToParty TEXT,
      creationDate TEXT,
      pricingDate TEXT,
      requestedDeliveryDate TEXT,
      totalNetAmount REAL,
      transactionCurrency TEXT,
      overallSDProcessStatus TEXT,
      totalBlockStatus TEXT,
      overallDeliveryStatus TEXT,
      overallBillingStatus TEXT,
      paymentTerms TEXT,
      totalCreditCheckStatus TEXT
    );

    CREATE TABLE IF NOT EXISTS sales_order_items (
      salesOrder TEXT,
      salesOrderItem TEXT,
      material TEXT,
      orderQuantity REAL,
      orderQuantityUnit TEXT,
      netAmount REAL,
      transactionCurrency TEXT,
      plant TEXT,
      storageLocation TEXT,
      deliveryStatus TEXT,
      billingStatus TEXT,
      sdDocumentRejectionStatus TEXT,
      deliveryBlockReason TEXT,
      billingBlockReason TEXT,
      itemBillingBlockReason TEXT,
      paymentRjcnReason TEXT,
      PRIMARY KEY (salesOrder, salesOrderItem)
    );

    CREATE TABLE IF NOT EXISTS outbound_delivery_headers (
      deliveryDocument TEXT PRIMARY KEY,
      deliveryDocumentType TEXT,
      soldToParty TEXT,
      shipToParty TEXT,
      creationDate TEXT,
      deliveryDate TEXT,
      actualGoodsMovementDate TEXT,
      actualDeliveryRoute TEXT,
      shippingPoint TEXT,
      totalBlockStatus TEXT,
      overallGoodsMovementStatus TEXT,
      overallSDProcessStatus TEXT,
      overallPickingStatus TEXT,
      overallPackingStatus TEXT,
      overallProofOfDeliveryStatus TEXT
    );

    CREATE TABLE IF NOT EXISTS outbound_delivery_items (
      deliveryDocument TEXT,
      deliveryDocumentItem TEXT,
      material TEXT,
      plant TEXT,
      storageLocation TEXT,
      batch TEXT,
      actualDeliveryQuantity REAL,
      deliveryQuantityUnit TEXT,
      referenceSDDocument TEXT,
      referenceSDDocumentItem TEXT,
      PRIMARY KEY (deliveryDocument, deliveryDocumentItem)
    );

    CREATE TABLE IF NOT EXISTS billing_document_headers (
      billingDocument TEXT PRIMARY KEY,
      billingDocumentType TEXT,
      billingDocumentDate TEXT,
      soldToParty TEXT,
      payerParty TEXT,
      totalNetAmount REAL,
      transactionCurrency TEXT,
      paymentTerms TEXT,
      billingDocumentIsCancelled INTEGER DEFAULT 0,
      cancelledBillingDocument TEXT,
      sdDocumentCategory TEXT,
      referenceSDDocument TEXT
    );

    CREATE TABLE IF NOT EXISTS billing_document_items (
      billingDocument TEXT,
      billingDocumentItem TEXT,
      material TEXT,
      netAmount REAL,
      transactionCurrency TEXT,
      plant TEXT,
      referenceSDDocument TEXT,
      referenceSDDocumentItem TEXT,
      PRIMARY KEY (billingDocument, billingDocumentItem)
    );

    CREATE TABLE IF NOT EXISTS billing_document_cancellations (
      billingDocument TEXT,
      cancelledBillingDocument TEXT
    );

    CREATE TABLE IF NOT EXISTS journal_entry_items (
      companyCode TEXT,
      fiscalYear TEXT,
      accountingDocument TEXT,
      accountingDocumentItem TEXT,
      accountingDocumentType TEXT,
      customer TEXT,
      amountInCompanyCurrency REAL,
      companyCodeCurrency TEXT,
      postingDate TEXT,
      documentDate TEXT,
      clearingDocument TEXT,
      clearingDate TEXT,
      clearingDocFiscalYear TEXT,
      costCenter TEXT,
      profitCenter TEXT,
      PRIMARY KEY (companyCode, fiscalYear, accountingDocument, accountingDocumentItem)
    );

    CREATE TABLE IF NOT EXISTS payments (
      companyCode TEXT,
      fiscalYear TEXT,
      accountingDocument TEXT,
      accountingDocumentItem TEXT,
      accountingDocumentType TEXT,
      customer TEXT,
      amountInCompanyCurrency REAL,
      companyCodeCurrency TEXT,
      postingDate TEXT,
      documentDate TEXT,
      clearingDocument TEXT,
      clearingDate TEXT,
      clearingDocFiscalYear TEXT,
      costCenter TEXT,
      profitCenter TEXT,
      PRIMARY KEY (companyCode, fiscalYear, accountingDocument, accountingDocumentItem)
    );

    CREATE TABLE IF NOT EXISTS business_partners (
      businessPartner TEXT PRIMARY KEY,
      customer TEXT,
      firstName TEXT,
      lastName TEXT,
      businessPartnerFullName TEXT,
      searchTerm1 TEXT,
      businessPartnerGrouping TEXT,
      businessPartnerCategory TEXT,
      isMarkedForArchiving INTEGER DEFAULT 0,
      customerIsBlocked INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS business_partner_addresses (
      businessPartner TEXT,
      addressID TEXT,
      cityName TEXT,
      postalCode TEXT,
      streetName TEXT,
      houseNumber TEXT,
      country TEXT,
      region TEXT,
      PRIMARY KEY (businessPartner, addressID)
    );

    CREATE TABLE IF NOT EXISTS products (
      product TEXT PRIMARY KEY,
      productType TEXT,
      crossPlantStatus TEXT,
      productGroup TEXT,
      baseUnit TEXT,
      weightUnit TEXT,
      division TEXT,
      industrySector TEXT
    );

    CREATE TABLE IF NOT EXISTS product_descriptions (
      product TEXT,
      language TEXT,
      productDescription TEXT,
      PRIMARY KEY (product, language)
    );

    CREATE TABLE IF NOT EXISTS plants (
      plant TEXT PRIMARY KEY,
      plantName TEXT,
      companyCode TEXT,
      country TEXT,
      cityName TEXT,
      postalCode TEXT,
      streetName TEXT
    );

    CREATE TABLE IF NOT EXISTS customer_company_assignments (
      customer TEXT,
      companyCode TEXT,
      paymentTerms TEXT,
      paymentMethodsList TEXT,
      PRIMARY KEY (customer, companyCode)
    );

    CREATE TABLE IF NOT EXISTS customer_sales_area_assignments (
      customer TEXT,
      salesOrganization TEXT,
      distributionChannel TEXT,
      division TEXT,
      customerGroup TEXT,
      paymentTerms TEXT,
      deliveryPriority TEXT,
      PRIMARY KEY (customer, salesOrganization, distributionChannel, division)
    );

    CREATE TABLE IF NOT EXISTS product_plants (
      product TEXT,
      plant TEXT,
      countryOfOrigin TEXT,
      configProfile TEXT,
      configVariant TEXT,
      profitCenter TEXT,
      mrpType TEXT,
      PRIMARY KEY (product, plant)
    );

    CREATE TABLE IF NOT EXISTS product_storage_locations (
      product TEXT,
      plant TEXT,
      storageLocation TEXT,
      warehouseStorageBin TEXT,
      dateOfLastPostedCntUnRstrcdStk TEXT,
      PRIMARY KEY (product, plant, storageLocation)
    );

    CREATE TABLE IF NOT EXISTS sales_order_schedule_lines (
      salesOrder TEXT,
      salesOrderItem TEXT,
      scheduleLine TEXT,
      orderQuantity REAL,
      orderQuantityUnit TEXT,
      scheduledQuantity REAL,
      deliveredQuantity REAL,
      confdOrderQtyByMatlAvailCheck REAL,
      PRIMARY KEY (salesOrder, salesOrderItem, scheduleLine)
    );
  `);
  console.log('  ✔ Tables created\n');

  // Read all data
  console.log('📥 Reading JSONL data...');
  const data = {
    salesOrderHeaders: readJsonlFiles('sales_order_headers'),
    salesOrderItems: readJsonlFiles('sales_order_items'),
    deliveryHeaders: readJsonlFiles('outbound_delivery_headers'),
    deliveryItems: readJsonlFiles('outbound_delivery_items'),
    billingHeaders: readJsonlFiles('billing_document_headers'),
    billingItems: readJsonlFiles('billing_document_items'),
    billingCancellations: readJsonlFiles('billing_document_cancellations'),
    journalEntries: readJsonlFiles('journal_entry_items_accounts_receivable'),
    payments: readJsonlFiles('payments_accounts_receivable'),
    businessPartners: readJsonlFiles('business_partners'),
    addresses: readJsonlFiles('business_partner_addresses'),
    products: readJsonlFiles('products'),
    productDescriptions: readJsonlFiles('product_descriptions'),
    plants: readJsonlFiles('plants'),
    customerCompany: readJsonlFiles('customer_company_assignments'),
    customerSalesArea: readJsonlFiles('customer_sales_area_assignments'),
    productPlants: readJsonlFiles('product_plants'),
    productStorageLocations: readJsonlFiles('product_storage_locations'),
    salesOrderScheduleLines: readJsonlFiles('sales_order_schedule_lines'),
  };

  // Insert data using transactions for speed
  console.log('\n📤 Inserting data...');

  const insertMany = (tableName, records, columns) => {
    if (records.length === 0) return;
    const placeholders = columns.map(() => '?').join(', ');
    const stmt = db.prepare(`INSERT OR IGNORE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`);
    const tx = db.transaction((rows) => {
      for (const row of rows) {
        const values = columns.map(col => {
          const val = row[col];
          if (val === null || val === undefined) return null;
          if (typeof val === 'boolean') return val ? 1 : 0;
          return val;
        });
        stmt.run(...values);
      }
    });
    tx(records);
    console.log(`  ✔ ${tableName}: ${records.length} rows`);
  };

  insertMany('sales_order_headers', data.salesOrderHeaders, [
    'salesOrder', 'salesOrderType', 'salesOrganization', 'soldToParty',
    'creationDate', 'pricingDate', 'requestedDeliveryDate', 'totalNetAmount',
    'transactionCurrency', 'overallSDProcessStatus', 'totalBlockStatus',
    'overallDeliveryStatus', 'overallBillingStatus', 'paymentTerms', 'totalCreditCheckStatus'
  ]);

  insertMany('sales_order_items', data.salesOrderItems, [
    'salesOrder', 'salesOrderItem', 'material', 'orderQuantity', 'orderQuantityUnit',
    'netAmount', 'transactionCurrency', 'plant', 'storageLocation',
    'deliveryStatus', 'billingStatus', 'sdDocumentRejectionStatus',
    'deliveryBlockReason', 'billingBlockReason', 'itemBillingBlockReason', 'paymentRjcnReason'
  ]);

  insertMany('outbound_delivery_headers', data.deliveryHeaders, [
    'deliveryDocument', 'deliveryDocumentType', 'soldToParty', 'shipToParty',
    'creationDate', 'deliveryDate', 'actualGoodsMovementDate', 'actualDeliveryRoute',
    'shippingPoint', 'totalBlockStatus', 'overallGoodsMovementStatus',
    'overallSDProcessStatus', 'overallPickingStatus', 'overallPackingStatus',
    'overallProofOfDeliveryStatus'
  ]);

  insertMany('outbound_delivery_items', data.deliveryItems, [
    'deliveryDocument', 'deliveryDocumentItem', 'material', 'plant',
    'storageLocation', 'batch', 'actualDeliveryQuantity', 'deliveryQuantityUnit',
    'referenceSDDocument', 'referenceSDDocumentItem'
  ]);

  insertMany('billing_document_headers', data.billingHeaders, [
    'billingDocument', 'billingDocumentType', 'billingDocumentDate',
    'soldToParty', 'payerParty', 'totalNetAmount', 'transactionCurrency',
    'paymentTerms', 'billingDocumentIsCancelled', 'cancelledBillingDocument',
    'sdDocumentCategory', 'referenceSDDocument'
  ]);

  insertMany('billing_document_items', data.billingItems, [
    'billingDocument', 'billingDocumentItem', 'material', 'netAmount',
    'transactionCurrency', 'plant', 'referenceSDDocument', 'referenceSDDocumentItem'
  ]);

  insertMany('billing_document_cancellations', data.billingCancellations, [
    'billingDocument', 'cancelledBillingDocument'
  ]);

  insertMany('journal_entry_items', data.journalEntries, [
    'companyCode', 'fiscalYear', 'accountingDocument', 'accountingDocumentItem',
    'accountingDocumentType', 'customer', 'amountInCompanyCurrency',
    'companyCodeCurrency', 'postingDate', 'documentDate',
    'clearingDocument', 'clearingDate', 'clearingDocFiscalYear',
    'costCenter', 'profitCenter'
  ]);

  insertMany('payments', data.payments, [
    'companyCode', 'fiscalYear', 'accountingDocument', 'accountingDocumentItem',
    'accountingDocumentType', 'customer', 'amountInCompanyCurrency',
    'companyCodeCurrency', 'postingDate', 'documentDate',
    'clearingDocument', 'clearingDate', 'clearingDocFiscalYear',
    'costCenter', 'profitCenter'
  ]);

  insertMany('business_partners', data.businessPartners, [
    'businessPartner', 'customer', 'firstName', 'lastName',
    'businessPartnerFullName', 'searchTerm1', 'businessPartnerGrouping',
    'businessPartnerCategory', 'isMarkedForArchiving', 'customerIsBlocked'
  ]);

  insertMany('business_partner_addresses', data.addresses, [
    'businessPartner', 'addressID', 'cityName', 'postalCode',
    'streetName', 'houseNumber', 'country', 'region'
  ]);

  insertMany('products', data.products, [
    'product', 'productType', 'crossPlantStatus', 'productGroup',
    'baseUnit', 'weightUnit', 'division', 'industrySector'
  ]);

  insertMany('product_descriptions', data.productDescriptions, [
    'product', 'language', 'productDescription'
  ]);

  insertMany('plants', data.plants, [
    'plant', 'plantName', 'companyCode', 'country',
    'cityName', 'postalCode', 'streetName'
  ]);

  insertMany('customer_company_assignments', data.customerCompany, [
    'customer', 'companyCode', 'paymentTerms', 'paymentMethodsList'
  ]);

  insertMany('customer_sales_area_assignments', data.customerSalesArea, [
    'customer', 'salesOrganization', 'distributionChannel', 'division',
    'customerGroup', 'paymentTerms', 'deliveryPriority'
  ]);

  insertMany('product_plants', data.productPlants, [
    'product', 'plant', 'countryOfOrigin', 'configProfile',
    'configVariant', 'profitCenter', 'mrpType'
  ]);

  insertMany('product_storage_locations', data.productStorageLocations, [
    'product', 'plant', 'storageLocation', 'warehouseStorageBin',
    'dateOfLastPostedCntUnRstrcdStk'
  ]);

  insertMany('sales_order_schedule_lines', data.salesOrderScheduleLines, [
    'salesOrder', 'salesOrderItem', 'scheduleLine', 'orderQuantity',
    'orderQuantityUnit', 'scheduledQuantity', 'deliveredQuantity',
    'confdOrderQtyByMatlAvailCheck'
  ]);

  // Create indexes for common queries
  console.log('\n🔍 Creating indexes...');
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_soi_material ON sales_order_items(material);
    CREATE INDEX IF NOT EXISTS idx_soi_plant ON sales_order_items(plant);
    CREATE INDEX IF NOT EXISTS idx_soh_soldto ON sales_order_headers(soldToParty);
    CREATE INDEX IF NOT EXISTS idx_dh_soldto ON outbound_delivery_headers(soldToParty);
    CREATE INDEX IF NOT EXISTS idx_di_ref ON outbound_delivery_items(referenceSDDocument);
    CREATE INDEX IF NOT EXISTS idx_bh_soldto ON billing_document_headers(soldToParty);
    CREATE INDEX IF NOT EXISTS idx_bi_ref ON billing_document_items(referenceSDDocument);
    CREATE INDEX IF NOT EXISTS idx_je_customer ON journal_entry_items(customer);
    CREATE INDEX IF NOT EXISTS idx_pay_customer ON payments(customer);
    CREATE INDEX IF NOT EXISTS idx_bp_customer ON business_partners(customer);
    CREATE INDEX IF NOT EXISTS idx_pp_product ON product_plants(product);
    CREATE INDEX IF NOT EXISTS idx_pp_plant ON product_plants(plant);
    CREATE INDEX IF NOT EXISTS idx_psl_product ON product_storage_locations(product);
    CREATE INDEX IF NOT EXISTS idx_sosl_so ON sales_order_schedule_lines(salesOrder);
  `);
  console.log('  ✔ Indexes created\n');

  // Print summary
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('📊 Database Summary:');
  for (const { name } of tables) {
    const count = db.prepare(`SELECT COUNT(*) as c FROM ${name}`).get();
    console.log(`  ${name}: ${count.c} rows`);
  }

  // Revert back to DELETE mode so it cleans up WAL files
  // This is required for Vercel's read-only serverless environments
  db.pragma('journal_mode = DELETE');
  db.close();
  console.log('\n✅ Database seeded successfully!');
}

main();
