require('dotenv').config()
const express = require('express');
const cors = require('cors');

//  mongodb***
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 3000;

const admin = require("firebase-admin");

const serviceAccount = require("./book-courier-firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


app.use(express.json())
app.use(cors({
  origin: "http://localhost:5173",
  credentials: true
}));

// token

const verifyJWT = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(" ")[1];

  if (!token) return res.status(401).send({ message: "Unauthorized Access!" });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.tokenEmail = decoded.email;

    next();
  } catch (error) {
    console.log(err);
    return res.status(401).send({ message: "Unauthorized Access!", error });
  }
};

const uri = `mongodb+srv://${process.env.DB_user}:${process.env.DB_pass}@cluster0.nlnjuiz.mongodb.net/?appName=Cluster0`;

// mongodb**
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});



app.get('/', (req, res) => {
  res.send('bookcourier server is running')

})

async function run() {
  try {

    await client.connect();
    const db = client.db('book_courier_db');
    const userscollection = db.collection('users');
    const bookscollection = db.collection('Books');
    const ordersCollection = db.collection('orders');
    // const paymentCollection = db.collection("payments");
    // const wishlistCollection = db.collection("wishlists");
    // const ratingCollection = db.collection("bookRatings");


    //  usersApi
    app.post('/users', async (req, res) => {
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
      }
      else {
        const result = await userscollection.insertOne(newUser);
        res.send(result);
      }
    });

    //User Role 
    app.patch("/user-role", verifyJWT, verifyADMIN, async (req, res) => {
      const email = req.body.email;
      const query = { email: email };
      const roleUpdate = req.body;
      const updateinfo = {
        $set: {
          role: roleUpdate.role,
        },
      };
      const result = await userscollection.updateOne(query, updateinfo);
      res.send(result);
    });

    //latest Books

    app.get('/recentBooks', async (req, res) => {

      const publish = "published";
      const result = await bookscollection
        .find({ status: publish })
        .sort({ create_date: -1 })
        .limit(6)
        .toArray();
      res.send(result);;
    })

    //  all books data get**

    // app.get('/books', async (req, res) => {
    //   const { bookName } = req.query
    //   let query = {}
    //   if (bookName) {
    //     query.bookName = {
    //       $regex: bookName,
    //       $options: 'i'
    //     };
    //   }
    //   const cursor = bookscollection.find(query).sort({ created_at: -1 })
    //   const result = await cursor.toArray();
    //   res.send(result)
    // });
    // all books search & sort
    app.get("/books", async (req, res) => {
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
});
//  get user-role api**
app.get("/user/role", verifyJWT, async (req, res) => {
  const email = req.query.email;
  const user = await userscollection.findOne({ email });
  res.send({ role: user?.role || "customer" });
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

    app.delete('/books/:id',verifyJWT, verifyLibrarian, async (req, res) => {
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
      const newBook = req.body;
       newBook.create_date = new Date();
        const result = await bookscollection.insertOne(newBook);
      res.send(result);
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
    app.get('/orders', async (req, res) => {
      try {
        const query = {}
        const { email } = req.query;
        if (email) {
          query.userEmail = email;
        }
        const options = { sort: { createdAt: -1 } };

        const cursor = ordersCollection.find(query, options)
        const result = await cursor.toArray();
        res.send(result);
      }
      catch (error) {
        console.error("Error fetching orders:", error);
        res.status(500).send({ message: "Failed to fetch orders" });
      }

    })

    // singleorders data get**

    app.get('/orders/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await ordersCollection.findOne(query);
      res.send(result);
    })

    // orders post api**
    app.post("/orders", async (req, res) => {
      const orderData = req.body;

      orderData.createdAt = new Date();

      const result = await ordersCollection.insertOne(orderData);
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
    app.patch('/orders/:id', async (req, res) => {
      const id = req.params.id;
      const { status, paymentStatus } = req.body;
      const result = await ordersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status, paymentStatus } }
      );
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