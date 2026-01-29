const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

/*
 MongoDB Atlas connection string
*/
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = "shop";
let db;

/*
 Middleware
*/

// JSON body parser
app.use(express.json());
// API Key Protection Middleware
const apiKeyMiddleware = (req, res, next) => {
  const clientKey = req.headers["x-api-key"];
  const serverKey = process.env.API_KEY;

  // Missing key → Unauthorized
  if (!clientKey) {
    return res.status(401).json({
      error: "Unauthorized: API key missing"
    });
  }

  // Wrong key → Forbidden
  if (clientKey !== serverKey) {
    return res.status(403).json({
      error: "Forbidden: Invalid API key"
    });
  }

  // Key is valid → continue
  next();
};
app.use(express.urlencoded({ extended: true }));

// Logger middleware (method + URL)
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

/*
 MongoDB Connection
*/
MongoClient.connect(MONGO_URI)
  .then(client => {
    db = client.db(DB_NAME);
    console.log("Connected to MongoDB Atlas");
  })
  .catch(error => {
    console.error("MongoDB connection failed:", error);
  });

/*
 Routes
*/

// GET /
app.get("/", (req, res) => {
  res.send(`
    <h1>Shop API</h1>
    <ul>
      <li><a href="/api/products">All Products</a></li>
      <li><a href="/api/products/1">Product by ID</a></li>
    </ul>
  `);
});

// GET /version
app.get("/version", (req, res) => {
  res.json({
    version: "1.1",
    updatedAt: "2026-01-18"
  });
});


/*
 GET /api/products
*/
app.get("/api/products", async (req, res) => {
  try {
    const { category, minPrice, sort, fields } = req.query;

    // FILTER
    const filter = {};

    if (category) {
      filter.category = category;
    }

    if (minPrice) {
      filter.price = { $gte: Number(minPrice) };
    }

    // PROJECTION
    let projection = null;

    if (fields) {
      projection = {};
      fields.split(",").forEach(field => {
        projection[field] = 1;
      });
    }

    // QUERY
    let query = db.collection("products").find(filter);

    if (projection) {
      query = query.project(projection);
    }

    // SORT
    if (sort === "price") {
      query = query.sort({ price: 1 });
    }

    const products = await query.toArray();

    res.json({
      count: products.length,
      products: products
    });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});


/*
 GET /api/products/:id
*/
app.get("/api/products/:id", async (req, res) => {
  const { id } = req.params;

  // Invalid ObjectId
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid product ID" });
  }

  try {
    const product = await db
      .collection("products")
      .findOne({ _id: new ObjectId(id) });

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json(product);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

/*
 POST /api/products
*/
app.post("/api/products", async (req, res) => {
  const { name, price, category } = req.body;

  // Missing fields
  if (!name || !price || !category) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const newProduct = {
    name,
    price: Number(price),
    category
  };


  try {
    const result = await db
      .collection("products")
      .insertOne(newProduct);

    res.status(201).json({
      message: "Product created",
      productId: result.insertedId
    });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// Simple HTML form for POST /api/products
app.get("/add-product-form", (req, res) => {
  res.send(`
    <h2>Add Product</h2>
    <form method="POST" action="/api/products">
      <input name="name" placeholder="Name" required />
      <input name="price" type="number" placeholder="Price" required />
      <input name="category" placeholder="Category" required />
      <button type="submit">Add</button>
    </form>
  `);
});

// GET all items
app.get("/api/items", async (req, res) => {
  try {
    const items = await db.collection("items").find().toArray();

    res.status(200).json({
      count: items.length,
      items: items
    });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// GET item by ID
app.get("/api/items/:id", async (req, res) => {
  const { id } = req.params;

  // Invalid ObjectId
  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid item ID" });
  }

  try {
    const item = await db
      .collection("items")
      .findOne({ _id: new ObjectId(id) });

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    res.status(200).json(item);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// POST create new item
app.post("/api/items", apiKeyMiddleware, async (req, res) => {
  const { name, description } = req.body;

  // Validation
  if (!name || !description) {
    return res.status(400).json({
      error: "Missing required fields: name, description"
    });
  }

  const newItem = {
    name,
    description
  };

  try {
    const result = await db.collection("items").insertOne(newItem);

    res.status(201).json({
      message: "Item created",
      id: result.insertedId
    });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});


// PUT full update (replace all fields)
app.put("/api/items/:id", apiKeyMiddleware, async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid item ID" });
  }

  // PUT 
  if (!name || !description) {
    return res.status(400).json({
      error: "PUT requires full item data: name, description"
    });
  }

  try {
    const result = await db.collection("items").updateOne(
      { _id: new ObjectId(id) },
      { $set: { name, description } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    res.status(200).json({ message: "Item fully updated" });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});


// PATCH partial update (only provided fields)
app.patch("/api/items/:id", apiKeyMiddleware, async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid item ID" });
  }

  const updates = req.body;

  // PATCH 
  if (!updates || Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No fields provided for update" });
  }

  try {
    const result = await db.collection("items").updateOne(
      { _id: new ObjectId(id) },
      { $set: updates }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    res.status(200).json({ message: "Item partially updated" });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});


// DELETE item
app.delete("/api/items/:id", apiKeyMiddleware, async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid item ID" });
  }

  try {
    const result = await db.collection("items").deleteOne({
      _id: new ObjectId(id)
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    // 204 = No Content
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});
/*
 404 Handler
*/
app.use((req, res) => {
  res.status(404).json({ error: "API endpoint not found" });
});

/*
 Server start
*/
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
