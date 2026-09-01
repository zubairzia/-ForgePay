const db = require("../db");

// Check duplicate email
const findByEmail = async (email) => {
  const result = await db.query(
    "SELECT * FROM customers WHERE email = $1",
    [email]
  );
  return result.rows[0];
};

// Get last record number
const getLastCustomer = async () => {
  const result = await db.query(
    "SELECT record_number FROM customers ORDER BY id DESC LIMIT 1"
  );
  return result.rows[0];
};

// Create customer
const createCustomer = async (recordNumber, name, email, phone) => {
  const result = await db.query(
    `INSERT INTO customers (record_number,name,email,phone)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [recordNumber, name, email, phone]
  );

  return result.rows[0];
};

const getCustomerById = async (code) => {
  const result = await db.query(
    "SELECT * FROM customers WHERE record_number = $1",
    [code]
  );
  return result.rows[0];
};

const updateCustomer = async (code, data) => {
  const { name, email, phone } = data;

  const result = await db.query(
    `UPDATE customers 
     SET name = $1, email = $2, phone = $3 
     WHERE record_number = $4
     RETURNING *`,
    [name, email, phone, code]
  );

  return result.rows[0];
};

module.exports = {
  findByEmail,
  getLastCustomer,
  createCustomer,
  getCustomerById,
  updateCustomer
};