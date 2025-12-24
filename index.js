require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.Stripe_Secret);
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors({
  origin: process.env.SIDE_DOMAIN || "http://localhost:5173",
  credentials: true,
}));

const uri = `mongodb+srv://${process.env.DB_user}:${process.env.DB_pass}@cluster0.nlnjuiz.mongodb.net/?appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let userscollection, bookscollection, ordersCollection, paymentCollection, wishlistCollection, ratingCollection;

async function run() {
  try {
    const db = client.db('book_courier_db');
    userscollection = db.collection('users');
    bookscollection = db.collection('Books');
    ordersCollection = db.collection('orders');
    paymentCollection = db.collection("payments");
    wishlistCollection = db.collection("wishlists");
    ratingCollection = db.collection("bookRatings");

    app.get('/', (req, res) => {
      res.send('bookcourier server is running');
    });

    // --- User Routes ---
    app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email;
      const user = await userscollection.findOne({ email });
      if (!user) return res.status(404).send({ message: "User not found" });
      res.send({ role: user.role });
    });

    app.patch("/users/role/:id", async (req, res) => {
      const id = req.params.id;
      const { role } = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { role: role },
      };
      const result = await userscollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.get("/users", async (req, res) => {
      const result = await userscollection.find().toArray();
      res.send(result);
    });

    app.post('/users', async (req, res) => {
      const newUser = req.body;
      const query = { email: newUser.email };
      const existingUser = await userscollection.findOne(query);
      if (existingUser) {
        const result = await userscollection.updateOne(query, { $set: { last_loggedIn: new Date() } });
        return res.send(result);
      }
      newUser.create_date = new Date();
      newUser.role = "customer";
      const result = await userscollection.insertOne(newUser);
      res.send(result);
    });

    // --- Books Routes ---
    app.get("/books", async (req, res) => {
      const { search = "", sort = "" } = req.query;
      let filter = { status: "published" };
      if (search) filter.bookName = { $regex: search, $options: "i" };
      let sortOption = sort === "low-high" ? { price: 1 } : sort === "high-low" ? { price: -1 } : { create_date: -1 };
      const result = await bookscollection.find(filter).sort(sortOption).toArray();
      res.send(result);
    });

    app.get('/books/:id', async (req, res) => {
      const result = await bookscollection.findOne({ _id: new ObjectId(req.params.id) });
      res.send(result);
    });

    app.get("/manage-books", async (req, res) => {
      const result = await bookscollection.find().toArray();
      res.send(result);
    });

    app.post('/books', async (req, res) => {
      const newBook = req.body;
      newBook.price = parseFloat(newBook.price);
      newBook.create_date = new Date();
      const result = await bookscollection.insertOne(newBook);
      res.send(result);
    });

    app.get("/recentBooks", async (req, res) => {
      try {
        const result = await bookscollection
          .find({ status: "published" })
          .sort({ create_date: -1 })
          .limit(6)
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error fetching recent books", error });
      }
    });

    // --- Books Update Routes ---

    app.get("/update-book/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookscollection.findOne(query);
      res.send(result);
    });

    app.put("/books/:id", async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;

      const { _id, ...updateDocWithoutId } = updatedData;

      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: updateDocWithoutId,
      };

      try {
        const result = await bookscollection.updateOne(query, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Update failed", error });
      }
    });

    app.get("/my-books/:email", async (req, res) => {
      const email = req.params.email;
      const result = await bookscollection.find({ authorEmail: email }).toArray();
      res.send(result);
    });

    // Specific Status Update Route (Always put specific routes above generic /:id routes)
    app.patch("/books/status/:id", async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = { $set: { status: status } };
      const result = await bookscollection.updateOne(query, updateDoc);
      res.send(result);
    });

    app.delete("/books/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const orderQuery = { bookId: id };
      await ordersCollection.deleteMany(orderQuery);
      const result = await bookscollection.deleteOne(query);
      res.send(result);
    });

    // --- Payment & Others ---
    app.post('/create-checkout-session', async (req, res) => {
      const paymentinfo = req.body;
      const amount = Math.round(parseFloat(paymentinfo.price) * 100);
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: { currency: 'usd', unit_amount: amount, product_data: { name: paymentinfo.name } },
          quantity: 1,
        }],
        customer_email: paymentinfo.customerEmail,
        mode: 'payment',
        metadata: { orderId: paymentinfo._id },
        success_url: `${process.env.SIDE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SIDE_DOMAIN}/dashboard/my-orders`,
      });
      res.send({ url: session.url });
    });

    app.patch("/payment-success", async (req, res) => {
      const session = await stripe.checkout.sessions.retrieve(req.query.session_id);
      const orderId = session?.metadata?.orderId;
      if (session.payment_status === "paid") {
        await ordersCollection.updateOne(
          { _id: new ObjectId(orderId) },
          { $set: { paymentStatus: "paid", transactionId: session.payment_intent } }
        );
        res.send({ success: true, transactionId: session.payment_intent });
      } else {
        res.status(400).send({ message: "Payment failed" });
      }
    });

    app.get("/payments/:email", async (req, res) => {
      const email = req.params.email;
      const query = { userEmail: email, paymentStatus: "paid" };
      const result = await ordersCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/payments/:email", async (req, res) => {
      const email = req.params.email;
      const query = { userEmail: email, paymentStatus: "paid" };
      const result = await ordersCollection.find(query).toArray();
      res.send(result);
    })

    app.post("/orders", async (req, res) => {
      try {
        const order = req.body;
        const result = await ordersCollection.insertOne(order);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to place order", error });
      }
    });

    app.patch("/order-cancelled/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { status: "cancelled" },
      };
      const result = await ordersCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    app.get("/orders/:email", async (req, res) => {
      const email = req.params.email;
      const result = await ordersCollection.find({ userEmail: email }).toArray();
      res.send(result);
    });

    app.post("/wish-list", async (req, res) => {
      const item = req.body;

      const query = {
        bookId: item.bookId,
        userEmail: item.userEmail
      };

      const existingItem = await wishlistCollection.findOne(query);

      if (existingItem) {
        return res.send({ message: "This book is already in your wishlist!", insertedId: null });
      }

      const result = await wishlistCollection.insertOne({
        ...item,
        wishList_date: new Date()
      });
      res.send(result);
    });

    app.get("/wish-list/:email", async (req, res) => {
      const email = req.params.email;
      const result = await wishlistCollection.find({ userEmail: email }).toArray();
      res.send(result);
    })

    app.delete("/wish-list/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await wishlistCollection.deleteOne(query);
      res.send(result);
    });

    app.post("/review", async (req, res) => {
      const result = await ratingCollection.insertOne({ ...req.body, date: new Date() });
      res.send(result);
    });

    app.get("/review/:bookId", async (req, res) => {
      const result = await ratingCollection.find({ bookId: req.params.bookId }).toArray();
      res.send(result);
    });

  } catch (error) {
    console.error(error);
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});