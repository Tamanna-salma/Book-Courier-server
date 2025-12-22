require('dotenv').config()
const express = require('express');
const cors = require('cors');
const app = express();
//  mongodb***
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.Stripe_Secret);
const port = process.env.PORT || 3000
// firabase admin**
const admin = require("firebase-admin");

if (!process.env.FIRE_BASE_SECURET_KEY) {
  
  admin.initializeApp();
} else {
  try {
    const decoded = Buffer.from(
      process.env.FIRE_BASE_SECURET_KEY,
      "base64"
    ).toString("utf-8");
    const serviceAccount = JSON.parse(decoded);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (error) {
    console.error("Firebase initialization error:", error);
    admin.initializeApp(); 
  }
}

// JWT Verification Middleware
const verifyJWT = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(" ")[1];

  if (!token) return res.status(401).send({ message: "Unauthorized Access!" });
  
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.tokenEmail = decoded.email;
   
    next();
  } catch (error) {
    console.log("JWT Error:", error);
    return res.status(401).send({ message: "Unauthorized Access!", error });
  }
};

// middleware
app.use(express.json())
app.use(cors({
  origin: process.env.SIDE_DOMAIN || "http://localhost:5173",
  credentials: true,
  optionSuccessStatus: 200,
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// mongodb**
const uri = `mongodb+srv://${process.env.DB_user}:${process.env.DB_pass}@cluster0.nlnjuiz.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// Role middlewre
const verifyADMIN = async (req, res, next) => {
  try {
    const email = req.tokenEmail;
    const user = await userscollection.findOne({ email: email });
    
    if (!user || user?.role !== "admin") {
      return res.status(403).send({ 
        message: "Admin Only Actions", 
        role: user?.role || "none" 
      });
    }
    next();
  } catch (error) {
    console.error("Admin verification error:", error);
    return res.status(500).send({ message: "Server error" });
  }
};

const verifyLibrarian = async (req, res, next) => {
  try {
    const email = req.tokenEmail;
    const user = await userscollection.findOne({ email: email });
    
    if (!user || (user?.role !== "librarian" && user?.role !== "admin")) {
      return res.status(403).send({ 
        message: "Librarian Only Actions", 
        role: user?.role || "none" 
      });
    }
    next();
  } catch (error) {
    console.error("Librarian verification error:", error);
    return res.status(500).send({ message: "Server error" });
  }
};


async function run() {
  try {

    await client.connect();
    const db = client.db('book_courier_db');
    const userscollection = db.collection('users');
    const bookscollection = db.collection('Books');
    const ordersCollection = db.collection('orders');
    const paymentCollection = db.collection("payments");
    const wishlistCollection = db.collection("wishlists");
    const ratingCollection = db.collection("bookRatings");

    app.get('/', (req, res) => {
      res.send('bookcourier server is running')

    })


    //  usersApi

   app.get("/all-users/:email", verifyJWT, verifyADMIN, async (req, res) => {
      try {
        const adminEmail = req.params.email;
        const result = await userscollection
          .find({ email: { $ne: adminEmail } })
          .toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).send({ error: "Failed to fetch users" });
      }
    });

     app.get("/users/:email", verifyJWT, async (req, res) => {
      try {
        const email = req.params.email;
        const result = await  userscollection .findOne({ email: email });
        res.send(result || {});
      } catch (error) {
        console.error("Error fetching user:", error);
        res.status(500).send({ error: "Failed to fetch user" });
      }
    });

   //  get user-role api**
   app.get("/user/role", async (req, res) => {
  const email = req.query.email;
  if (!email ) {
    return res.status(403).send({ message: "Forbidden" });
  }
  const user = await userscollection.findOne({ email });
  res.send({ role: user?.role || "customer" });
});


    //User Role post
 app.post('/users',verifyJWT, async (req, res) => {
  try {
    const newUser = req.body;
    newUser.create_date = new Date();
    newUser.last_loggedIn = new Date();
    newUser.role = "customer";
    
    const query = { email: newUser.email };
    const existinguser = await userscollection.findOne(query);
    
    if (existinguser) {
      const updateUser = await userscollection.updateOne(query, {
        $set: { last_loggedIn: new Date() },
      });
      return res.send(updateUser);
    } else {
      const result = await userscollection.insertOne(newUser);
      res.send(result);
    }
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).send({ error: "Failed to create user" });
  }
});

    // user profile update
     app.patch("/users/:id/role", verifyJWT,verifyADMIN, async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const updateUser = req.body;
        const updateProfile = { 
          name: updateUser.name, 
          image: updateUser.image 
        };
        const updateDoc = { $set: updateProfile };
        
        const result = await userscollection.updateOne(query, updateDoc);
        res.send(result);
      } catch (error) {
        console.error("Error updating profile:", error);
        res.status(500).send({ error: "Failed to update profile" });
      }
    });

    //User Role Update
     app.patch("/user-role", verifyJWT, verifyADMIN, async (req, res) => {
      try {
        const email = req.body.email;
        const query = { email: email };
        const roleUpdate = req.body;
        
        const updateDoc = {
          $set: { role: roleUpdate.role }
        };
        
        const result = await userscollection.updateOne(query, updateDoc);
        res.send(result);
      } catch (error) {
        console.error("Error updating role:", error);
        res.status(500).send({ error: "Failed to update role" });
      }
    });

    //latest Books

     app.get('/recentBooks', async (req, res) => {
      try {
        const publish = "published";
        const result = await bookscollection
          .find({ status: publish })
          .sort({ create_date: -1 })
          .limit(6)
          .toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching recent books:", error);
        res.status(500).send({ error: "Failed to fetch recent books" });
      }
    });

    // all books search & sort
     app.get("/books", async (req, res) => {
      try {
        const { search = "", sort = "" } = req.query;
        let filter = { status: "published" };

        if (search) {
          filter.bookName = { $regex: search, $options: "i" };
        }

        let sortOption = {};
        if (sort === "low-high") sortOption = { price: 1 };
        else if (sort === "high-low") sortOption = { price: -1 };
        else sortOption = { create_date: -1 };

        const result = await bookscollection.find(filter).sort(sortOption).toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching books:", error);
        res.status(500).send({ error: "Failed to fetch books" });
      }
    });
    //manage-book get api(admin)
    app.get("/manage-books", verifyJWT, verifyADMIN, async (req, res) => {
      const result = await bookscollection
        .find()
        .sort({ create_date: -1 })
        .toArray();
      res.send(result);
    });

    //my-book get api(Librarian)
    app.get("/my-books/:email", verifyJWT, verifyLibrarian, async (req, res) => {
      const email = req.params.email;
      const result = await bookscollection
        .find({ authorEmail: email })
        .toArray();
      res.send(result);
    }
    );

    //  get single data

    app.get('/books/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await bookscollection.findOne(query)
      res.send(result)
    });

    // delete**

    app.delete('/books/:id', verifyJWT, verifyLibrarian, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const existingData = await bookscollection.findOne(query);
      if (existingData.status === "published") {
        return res.send({ message: "book is published not delete" });
      }

      const result = await bookscollection.deleteOne(query);
      res.send(result)
    });

    //update book api
    app.get("/update-book/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookscollection.findOne(query);
      res.send(result);
    });

    // data post**

    app.post('/books', verifyJWT, verifyLibrarian, async (req, res) => {
  try {
    const newBook = req.body;
    
    //  all required fields
    const bookData = {
      bookName: newBook.bookName,
     authorName: newBook.author || newBook.authorName,
      authorEmail: req.tokenEmail, 
      publisher: newBook.publisher,
      publishedYear: parseInt(newBook.publishedYear),
      pageNumber: parseInt(newBook.pageNumber || newBook.pageNumber),
      price: parseFloat(newBook.price),
     stockQuantity: parseInt(newBook.stock || newBook.stockQuantity),
      category: newBook.category,
      status: newBook.status || "unpublished",
      tags: Array.isArray(newBook.tags) ? newBook.tags : 
            typeof newBook.tags === 'string' ? newBook.tags.split(',').map(t => t.trim()) : [],
      description: newBook.description,
      image: newBook.image,
      create_date: new Date()
    };
    
    // Validate required fields
    const requiredFields = ['bookName', 'authorName', 'price', 'category'];
    for (const field of requiredFields) {
      if (!bookData[field]) {
        return res.status(400).send({ error: `${field} is required` });
      }
    }
    
    const result = await bookscollection.insertOne(bookData);
    res.send({ 
      success: true, 
      message: "Book added successfully",
      insertedId: result.insertedId 
    });
    
  } catch (error) {
    console.error("Error adding book:", error);
    res.status(500).send({ error: "Failed to add book", details: error.message });
  }
});

    // edit data**

    app.put("/books/:id", verifyJWT, verifyLibrarian, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateBook = req.body;
      const updateDoc = { $set: updateBook };
      const result = await bookscollection.updateOne(query, updateDoc);
      res.send(result);
    });
    // publish and unpublish //
    app.patch("/books/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: {
          status: req.body.status,
        },
      };
      const result = await bookscollection.updateOne(query, update);
      res.send(result);
    });

    // orders api**
    app.get(
      "/orders/:email/payments",
      verifyJWT,
      verifyLibrarian,
      async (req, res) => {
        const email = req.params.email;
        const result = await ordersCollection
          .find({ authorEmail: email, paymentStatus: "paid" })
          .toArray();
        res.send(result);
      }
    );

    // singleorders data get**

    app.get("/orders/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const result = await ordersCollection
        .find({ customerEmail: email })
        .toArray();
      res.send(result);
    });

    // orders post api**
    app.post("/orders", verifyJWT, async (req, res) => {
      const newOrder = req.body;
      newOrder.status = "pending";
      newOrder.paymentStatus = "unpaid";
      newOrder.order_date = new Date();
      const result = await ordersCollection.insertOne(newOrder);
      res.send(result);
    });


    //delate orders
    app.delete('/orders/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await ordersCollection.deleteOne(query);
      res.send(result);
    });

    // patch orders
    app.patch("/order/:id", verifyJWT, verifyLibrarian, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const statusUpdate = req.body;

      const updateDoc = {
        $set: { status: statusUpdate.status },
      };

      await paymentCollection.updateOne({ orderId: id }, updateDoc);

      const result = await ordersCollection.updateOne(query, updateDoc);
      res.send(result);
    });
    // orders cancelled
    app.patch("/order-cancelled/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const updateDoc = { $set: { status: req.body.status } };

      try {
        const result = await ordersCollection.updateOne(query, updateDoc);
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "Internal Server Error", error: err });
      }
    });

    // stripe payment relatet Apis
    app.post('/create-checkout-session', async (req, res) => {
      const paymentinfo = req.body;
      const amount = parseInt(paymentinfo.cost) * 100;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: 'usd',
              unit_amount: amount,
              product_data: {
                name: ` ${paymentinfo.name}`
              }
            },
            quantity: 1,
          },
        ],
        customer_email: paymentinfo.customerEmail,
        mode: 'payment',
        metadata: {
          orderId: paymentinfo._Id

        },

        success_url: `${process.env.SIDE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SIDE_DOMAIN}/dashboard/my-orders`,
      })
      res.send({ url: session.url })

    })

    app.patch("/payment-success", verifyJWT, async (req, res) => {
      const sessionId = req.query.session_id;

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const orderId = session?.metadata?.orderId;
      const orderQuery = { _id: new ObjectId(orderId) };

      const books = await ordersCollection.findOne(orderQuery);

      // Already paid?
      const existingPayment = await paymentCollection.findOne({
        transationId: session.payment_intent,
      });

      if (existingPayment) {
        return res.send({
          message: "Payment already processed",
          transationId: existingPayment.transationId,
        });
      }

      if (session.payment_status === "paid" && books) {
        const orderInfo = {
          orderId: orderId,
          transationId: session.payment_intent,
          bookName: books.name,
          authorName: books.authorName,
          authorEmail: books.authorEmail,
          customer_email: session.customer_email,
          customer_name: books.customerName,
          payment_date: new Date(),
          status: books.status,
          price: session.amount_total / 100,
        };

        const result = await paymentCollection.insertOne(orderInfo);

        await ordersCollection.updateOne(orderQuery, {
          $set: { paymentStatus: session.payment_status },
          $inc: { quantity: -1 },
        });

        return res.send({

          transationId: session.payment_intent,
          orderId: result.insertedId,
        });
      }

      return res.send({ message: "Payment not completed" });
    });

    // payment
    app.get("/payments/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const result = await paymentCollection
        .find({ customer_email: email })
        .sort({ payment_date: -1 })
        .toArray();
      res.send(result);
    });

    app.get("/paymets-all", verifyJWT, verifyADMIN, async (req, res) => {
      const result = await paymentCollection.find().toArray();
      res.send(result);
    });

    // wishlist releted api //
    app.get("/wish-list", verifyJWT, async (req, res) => {
      const email = req.tokenEmail;
      const result = await wishlistCollection
        .find({ userEmail: email })
        .sort({ wishList_date: -1 })
        .toArray();
      res.send(result);
    });
    // wishlist post api 
    app.post("/wish-list", async (req, res) => {
      const newWishList = req.body;
      const existingWishList = await wishlistCollection.findOne({
        userEmail: newWishList.userEmail,
        bookName: newWishList.bookName,
      });
      if (existingWishList) {
        return res.send({ message: "already_exists" });
      }
      newWishList.wishList_date = new Date();
      const result = await wishlistCollection.insertOne(newWishList);
      res.send(result);
    });

    // wishlist delete api 
    app.delete("/wish-list/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await wishlistCollection.deleteOne(query);
      res.send(result);
    });
    //  rating releted  api**

  //  Get all reviews for a book
app.get("/review/:bookId", verifyJWT, async (req, res) => {
  const bookId = req.params.bookId;
  const reviews = await ratingCollection
    .find({ bookId: bookId })
    .sort({ date: -1 })
    .toArray();
  res.send(reviews);
});

// 2. POST review 
app.post("/review", verifyJWT, async (req, res) => {
  const review = req.body;
  const email = req.tokenEmail;
  
  const existing = await ratingCollection.findOne({
    bookId: review.bookId,
    userEmail: email
  });
  
  if (existing) {
    return res.send({ 
      error: "Already reviewed",
      existingId: existing._id 
    });
  }
  
  review.userEmail = email;
  review.date = new Date();
  const result = await ratingCollection.insertOne(review);
  res.send({ insertedId: result.insertedId });
});

//  Delete review 
app.delete("/review/:id", verifyJWT, async (req, res) => {
  const reviewId = req.params.id;
  const email = req.tokenEmail;
  
  const result = await ratingCollection.deleteOne({
    _id: new ObjectId(reviewId),
    userEmail: email  
  });
  
  res.send(result);
});

    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {

  }
}
run().catch(console.dir);


app.listen(port, () => {
  console.log(`bookcourier server is running on port ${port}`);
})  