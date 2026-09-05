const db = require('../../db');
const validator = require('validator');

// Local Postgres-backed item service, mirroring
// services/Vendors/localService.js.

const getAllLocalItems = async (tenantId) => {
  const result = await db.query(
    'SELECT * FROM items WHERE company_id = $1 ORDER BY created_at DESC',
    [tenantId]
  );
  return result.rows;
};

const createLocalItem = async (tenantId, data) => {
  const itemCode = (data.itemCode || '').trim();
  const name = (data.name || '').trim();

  if (!validator.isLength(itemCode, { min: 1 })) {
    const err = new Error('Item code is required');
    err.status = 400;
    throw err;
  }
  if (!validator.isLength(name, { min: 1 })) {
    const err = new Error('Item name is required');
    err.status = 400;
    throw err;
  }
  if (data.itemType && !['goods', 'service'].includes(data.itemType)) {
    const err = new Error("Item type must be 'goods' or 'service'");
    err.status = 400;
    throw err;
  }

  // Wrap in a transaction: the duplicate check + insert should be atomic,
  // same reasoning as createLocalCustomer's email check. The
  // uq_items_company_item_code DB constraint is the backstop for the
  // remaining race window between two concurrent requests.
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const duplicate = await client.query(
      'SELECT id FROM items WHERE company_id = $1 AND item_code = $2',
      [tenantId, itemCode]
    );
    if (duplicate.rows.length > 0) {
      const err = new Error('Item already exists');
      err.status = 409;
      throw err;
    }

    const result = await client.query(
      `INSERT INTO items (
        company_id, item_code, name, description, item_type, sku,
        unit_of_measure, sales_price, purchase_price, tax_rate, is_active
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
      ) RETURNING *`,
      [
        tenantId, itemCode, name, data.description || null,
        data.itemType || 'goods', data.sku || null, data.unitOfMeasure || null,
        data.salesPrice ?? null, data.purchasePrice ?? null, data.taxRate ?? null,
        data.isActive !== undefined ? data.isActive : true,
      ]
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const searchLocalItems = async (tenantId, query) => {
  const q = query.query || '';

  const result = await db.query(
    `SELECT * FROM items
     WHERE company_id = $1
       AND (name ILIKE $2 OR item_code ILIKE $2 OR sku ILIKE $2 OR description ILIKE $2)
     ORDER BY created_at DESC`,
    [tenantId, `%${q}%`]
  );

  return result.rows;
};

const getItemById = async (tenantId, id) => {
  const result = await db.query(
    'SELECT * FROM items WHERE company_id = $1 AND id = $2',
    [tenantId, id]
  );
  return result.rows[0];
};

const updateLocalItem = async (tenantId, id, data) => {
  if (data.itemType && !['goods', 'service'].includes(data.itemType)) {
    const err = new Error("Item type must be 'goods' or 'service'");
    err.status = 400;
    throw err;
  }

  // COALESCE keeps existing values for any field the caller omits, rather
  // than nulling them out — important since item_code/name are NOT NULL.
  const result = await db.query(
    `UPDATE items SET
      item_code       = COALESCE($1, item_code),
      name            = COALESCE($2, name),
      description     = COALESCE($3, description),
      item_type       = COALESCE($4, item_type),
      sku             = COALESCE($5, sku),
      unit_of_measure = COALESCE($6, unit_of_measure),
      sales_price     = COALESCE($7, sales_price),
      purchase_price  = COALESCE($8, purchase_price),
      tax_rate        = COALESCE($9, tax_rate),
      is_active       = COALESCE($10, is_active),
      updated_at      = now()
    WHERE company_id = $11 AND id = $12
    RETURNING *`,
    [
      data.itemCode ?? null, data.name ?? null, data.description ?? null,
      data.itemType ?? null, data.sku ?? null, data.unitOfMeasure ?? null,
      data.salesPrice ?? null, data.purchasePrice ?? null, data.taxRate ?? null,
      data.isActive ?? null,
      tenantId, id,
    ]
  );

  return result.rows[0];
};

module.exports = {
  getAllLocalItems,
  createLocalItem,
  searchLocalItems,
  getItemById,
  updateLocalItem,
};
