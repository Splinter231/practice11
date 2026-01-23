const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

/*
 MongoDB Atlas connection string
 ЗАМЕНИ <username>, <password>, <cluster>
*/
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = "shop";
let db;

/*
 Middleware
*/

// JSON body parser
app.use(express.json());
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
------------------------------------
 GET /api/products/:id
------------------------------------
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
------------------------------------
 POST /api/products
------------------------------------
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
