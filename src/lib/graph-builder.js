import { getDb } from './database';

const NODE_COLORS = {
  SalesOrder: '#FF6B6B',
  SalesOrderItem: '#FF8E8E',
  Delivery: '#4ECDC4',
  DeliveryItem: '#7EDDD6',
  BillingDocument: '#45B7D1',
  BillingDocumentItem: '#77CCE0',
  JournalEntry: '#96CEB4',
  Payment: '#FFEAA7',
  Customer: '#DDA0DD',
  Product: '#98D8C8',
  Plant: '#F7DC6F',
  Address: '#BB8FCE',
  ScheduleLine: '#FFB8B8',
  StorageLocation: '#D4AC0D',
};

export function buildGraph(options = {}) {
  const db = getDb();
  const nodes = [];
  const edges = [];
  const nodeSet = new Set();

  function addNode(id, type, label, metadata = {}) {
    if (nodeSet.has(id)) return;
    nodeSet.add(id);
    nodes.push({
      id,
      type,
      label,
      color: NODE_COLORS[type] || '#999',
      metadata,
    });
  }

  function addEdge(source, target, relationship) {
    if (!nodeSet.has(source) || !nodeSet.has(target)) return;
    edges.push({ source, target, relationship });
  }

  // Sales Order Headers
  const salesOrders = db.prepare('SELECT * FROM sales_order_headers LIMIT 200').all();
  for (const so of salesOrders) {
    addNode(`SO:${so.salesOrder}`, 'SalesOrder', `SO ${so.salesOrder}`, {
      salesOrder: so.salesOrder,
      type: so.salesOrderType,
      totalNetAmount: so.totalNetAmount,
      currency: so.transactionCurrency,
      creationDate: so.creationDate,
      deliveryStatus: so.overallDeliveryStatus,
      billingStatus: so.overallBillingStatus,
      status: so.overallSDProcessStatus,
    });
  }

  // Sales Order Items
  const soItems = db.prepare(`
    SELECT soi.*, pd.productDescription
    FROM sales_order_items soi
    LEFT JOIN product_descriptions pd ON soi.material = pd.product AND pd.language = 'EN'
    LIMIT 500
  `).all();
  for (const item of soItems) {
    const itemId = `SOI:${item.salesOrder}:${item.salesOrderItem}`;
    addNode(itemId, 'SalesOrderItem', `Item ${item.salesOrderItem}`, {
      salesOrder: item.salesOrder,
      item: item.salesOrderItem,
      material: item.material,
      productDescription: item.productDescription,
      quantity: item.orderQuantity,
      netAmount: item.netAmount,
      plant: item.plant,
    });
    addEdge(`SO:${item.salesOrder}`, itemId, 'HAS_ITEM');

    // Link to product
    if (item.material) {
      addNode(`PROD:${item.material}`, 'Product', item.productDescription || `Product ${item.material}`, {
        product: item.material,
        description: item.productDescription,
      });
      addEdge(itemId, `PROD:${item.material}`, 'CONTAINS_PRODUCT');
    }

    // Link to plant
    if (item.plant) {
      const plant = db.prepare('SELECT * FROM plants WHERE plant = ?').get(item.plant);
      if (plant) {
        addNode(`PLT:${item.plant}`, 'Plant', plant.plantName || `Plant ${item.plant}`, {
          plant: item.plant,
          plantName: plant.plantName,
          country: plant.country,
          city: plant.cityName,
        });
        addEdge(itemId, `PLT:${item.plant}`, 'FROM_PLANT');
      }
    }
  }

  // Customers
  const customers = db.prepare(`
    SELECT bp.*, bpa.cityName, bpa.country
    FROM business_partners bp
    LEFT JOIN business_partner_addresses bpa ON bp.businessPartner = bpa.businessPartner
  `).all();
  for (const cust of customers) {
    addNode(`CUST:${cust.customer}`, 'Customer', cust.businessPartnerFullName || `Customer ${cust.customer}`, {
      customer: cust.customer,
      name: cust.businessPartnerFullName,
      city: cust.cityName,
      country: cust.country,
    });
  }

  // Link SOs to Customers
  for (const so of salesOrders) {
    if (so.soldToParty) {
      addEdge(`CUST:${so.soldToParty}`, `SO:${so.salesOrder}`, 'PLACED_ORDER');
    }
  }

  // Deliveries
  const deliveries = db.prepare('SELECT * FROM outbound_delivery_headers LIMIT 200').all();
  for (const del of deliveries) {
    addNode(`DEL:${del.deliveryDocument}`, 'Delivery', `Delivery ${del.deliveryDocument}`, {
      deliveryDocument: del.deliveryDocument,
      type: del.deliveryDocumentType,
      deliveryDate: del.deliveryDate,
      goodsMovementDate: del.actualGoodsMovementDate,
      goodsMovementStatus: del.overallGoodsMovementStatus,
      shippingPoint: del.shippingPoint,
    });
    if (del.soldToParty) {
      addEdge(`CUST:${del.soldToParty}`, `DEL:${del.deliveryDocument}`, 'RECEIVED_DELIVERY');
    }
  }

  // Delivery Items → link Delivery to Sales Order
  const delItems = db.prepare('SELECT * FROM outbound_delivery_items LIMIT 500').all();
  for (const item of delItems) {
    if (item.referenceSDDocument) {
      addEdge(`SO:${item.referenceSDDocument}`, `DEL:${item.deliveryDocument}`, 'DELIVERED_VIA');
    }
  }

  // Billing Documents
  const billingDocs = db.prepare('SELECT * FROM billing_document_headers WHERE billingDocumentIsCancelled = 0 LIMIT 200').all();
  for (const bill of billingDocs) {
    addNode(`BILL:${bill.billingDocument}`, 'BillingDocument', `Bill ${bill.billingDocument}`, {
      billingDocument: bill.billingDocument,
      type: bill.billingDocumentType,
      date: bill.billingDocumentDate,
      totalNetAmount: bill.totalNetAmount,
      currency: bill.transactionCurrency,
      isCancelled: bill.billingDocumentIsCancelled,
    });
    if (bill.soldToParty) {
      addEdge(`CUST:${bill.soldToParty}`, `BILL:${bill.billingDocument}`, 'BILLED_TO');
    }
  }

  // Billing Items → link Billing to SO/Delivery
  const billItems = db.prepare('SELECT * FROM billing_document_items LIMIT 500').all();
  for (const item of billItems) {
    if (item.referenceSDDocument) {
      // Try linking to Sales Order first
      if (nodeSet.has(`SO:${item.referenceSDDocument}`)) {
        addEdge(`SO:${item.referenceSDDocument}`, `BILL:${item.billingDocument}`, 'BILLED_FOR');
      }
      // Try linking to Delivery
      if (nodeSet.has(`DEL:${item.referenceSDDocument}`)) {
        addEdge(`DEL:${item.referenceSDDocument}`, `BILL:${item.billingDocument}`, 'BILLED_FOR');
      }
    }
  }

  // Journal Entries
  const journalEntries = db.prepare(`
    SELECT DISTINCT companyCode, fiscalYear, accountingDocument, accountingDocumentType,
    customer, SUM(amountInCompanyCurrency) as totalAmount, companyCodeCurrency, postingDate
    FROM journal_entry_items
    GROUP BY companyCode, fiscalYear, accountingDocument
    LIMIT 200
  `).all();
  for (const je of journalEntries) {
    const jeId = `JE:${je.accountingDocument}`;
    addNode(jeId, 'JournalEntry', `JE ${je.accountingDocument}`, {
      accountingDocument: je.accountingDocument,
      type: je.accountingDocumentType,
      totalAmount: je.totalAmount,
      currency: je.companyCodeCurrency,
      postingDate: je.postingDate,
      customer: je.customer,
    });
    if (je.customer) {
      addEdge(`CUST:${je.customer}`, jeId, 'HAS_JOURNAL_ENTRY');
    }
  }

  // Payments
  const paymentsDocs = db.prepare(`
    SELECT DISTINCT companyCode, fiscalYear, accountingDocument, accountingDocumentType,
    customer, SUM(amountInCompanyCurrency) as totalAmount, companyCodeCurrency, postingDate
    FROM payments
    GROUP BY companyCode, fiscalYear, accountingDocument
    LIMIT 200
  `).all();
  for (const pay of paymentsDocs) {
    const payId = `PAY:${pay.accountingDocument}`;
    addNode(payId, 'Payment', `Payment ${pay.accountingDocument}`, {
      accountingDocument: pay.accountingDocument,
      type: pay.accountingDocumentType,
      totalAmount: pay.totalAmount,
      currency: pay.companyCodeCurrency,
      postingDate: pay.postingDate,
      customer: pay.customer,
    });
    if (pay.customer) {
      addEdge(`CUST:${pay.customer}`, payId, 'MADE_PAYMENT');
    }
  }

  // Link journal entries to billing docs via clearing documents
  const clearingLinks = db.prepare(`
    SELECT je.accountingDocument as jeDoc, je.clearingDocument
    FROM journal_entry_items je
    WHERE je.clearingDocument IS NOT NULL AND je.clearingDocument != ''
  `).all();
  for (const link of clearingLinks) {
    if (nodeSet.has(`JE:${link.jeDoc}`) && nodeSet.has(`PAY:${link.clearingDocument}`)) {
      addEdge(`JE:${link.jeDoc}`, `PAY:${link.clearingDocument}`, 'CLEARED_BY');
    }
  }

  // Product Plants
  const productPlants = db.prepare('SELECT * FROM product_plants LIMIT 500').all();
  for (const pp of productPlants) {
    if (nodeSet.has(`PROD:${pp.product}`) && nodeSet.has(`PLT:${pp.plant}`)) {
      addEdge(`PROD:${pp.product}`, `PLT:${pp.plant}`, 'PRODUCED_AT');
    }
  }

  // Product Storage Locations
  const storageLocs = db.prepare('SELECT * FROM product_storage_locations LIMIT 500').all();
  for (const sl of storageLocs) {
    const slocId = `SLOC:${sl.plant}:${sl.storageLocation}`;
    if (!nodeSet.has(slocId)) {
      addNode(slocId, 'StorageLocation', `SLoc ${sl.storageLocation}`, {
        plant: sl.plant,
        storageLocation: sl.storageLocation,
        warehouseStorageBin: sl.warehouseStorageBin
      });
      if (nodeSet.has(`PLT:${sl.plant}`)) {
        addEdge(`PLT:${sl.plant}`, slocId, 'HAS_STORAGE_LOC');
      }
    }
    if (nodeSet.has(`PROD:${sl.product}`)) {
      addEdge(`PROD:${sl.product}`, slocId, 'STORED_IN');
    }
  }

  // Sales Order Schedule Lines
  const scheduleLines = db.prepare('SELECT * FROM sales_order_schedule_lines LIMIT 500').all();
  for (const sl of scheduleLines) {
    const soItemId = `SOI:${sl.salesOrder}:${sl.salesOrderItem}`;
    const slId = `SCHED:${sl.salesOrder}:${sl.salesOrderItem}:${sl.scheduleLine}`;
    if (nodeSet.has(soItemId)) {
      addNode(slId, 'ScheduleLine', `Sched ${sl.scheduleLine}`, {
        salesOrder: sl.salesOrder,
        salesOrderItem: sl.salesOrderItem,
        scheduleLine: sl.scheduleLine,
        orderQuantity: sl.orderQuantity,
        scheduledQuantity: sl.scheduledQuantity,
        deliveredQuantity: sl.deliveredQuantity
      });
      addEdge(soItemId, slId, 'HAS_SCHEDULE');
    }
  }

  return { nodes, edges };
}

export function getNodeNeighbors(nodeId) {
  const graph = buildGraph();
  const neighborEdges = graph.edges.filter(
    e => e.source === nodeId || e.target === nodeId
  );
  const neighborIds = new Set();
  for (const edge of neighborEdges) {
    neighborIds.add(edge.source);
    neighborIds.add(edge.target);
  }
  neighborIds.delete(nodeId);

  const neighborNodes = graph.nodes.filter(n => neighborIds.has(n.id));
  const centerNode = graph.nodes.find(n => n.id === nodeId);

  return {
    node: centerNode,
    neighbors: neighborNodes,
    edges: neighborEdges,
  };
}
