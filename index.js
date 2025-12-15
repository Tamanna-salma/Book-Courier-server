require('dotenv').config()
const express = require('express');
const cors = require('cors');

    //  mongodb***
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 3000;

//moddleware
app.use(cors());
app.use(express.json())

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
    const db=client.db('book_courier_db');
    const userscollection=db.collection('users');
    const bookscollection=db.collection('Books');
    const ordersCollection=db.collection('orders');

  //  usersApi
    app.post('/users', async (req, res) => {
      const newUser = req.body;
      const email = req.body.email;
      const query = { email: email }
      const existinguser = await userscollection.findOne(query);
      if (existinguser) {
        res.send({ massage: 'user already exits.' })
      }
      else {
        const result = await userscollection.insertOne(newUser);
        res.send(result);
      }

    })

//latest Books

app.get('/recentBooks',async(req,res)=>{
  const cursor=bookscollection.find()
  .project({review:0,yearOfPublishing:0,totalPages:0,publisher:0})
  .sort({price:-1}).limit(6)
const result=await cursor.toArray();
res.send(result);
})

//  all books data get**

app.get('/Books', async (req, res) => {
      const { bookName} = req.query
      let query = {}
      if (bookName) {
        query.bookName = {
          $regex: bookName,
          $options: 'i'
        };
      }
      const cursor = bookscollection.find(query).sort({ created_at: -1 })
      const result = await cursor.toArray();
      res.send(result)
    });

    
    //  get single data

    app.get('/Books/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await bookscollection.findOne(query)
      res.send(result)
    });
      
    // delete**

     app.delete('/Books/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await bookscollection.deleteOne(query);
      res.send(result)
    })

        // data post**

 app.post('/Books', async (req, res) => {
      const newbookData = req.body;
      const { bookName, image,
        rating,
        email,
        author,
        review,
        publisher,
        totalPages,
        yearOfPublishing,
       category,tags,price
       } = newbookData
      
      const created_at = new Date()
      const newbook = {
       bookName, image,
        rating,
        email,
        author,
         review,
        publisher,
        totalPages,
        yearOfPublishing,
       category,tags,price,
        created_at
      }
      const result = await bookscollection.insertOne(newbook);
      res.send(result);
    });

     // edit data**
    app.patch('/Books/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const updatedbook = req.body; 

    const query = { _id: new ObjectId(id) };

    const update = {
      $set: {
        ...(updatedbook. bookName && {  bookName: updatedbook. bookName }),
        ...(updatedbook.category && { category: updatedbook.category }),
        ...(updatedbook.rating && { rating: updatedbook.rating }),
        ...(updatedbook.price && { price: updatedbook.price }),
        updated_at: new Date(),
      },
    };
 const result = await bookscollection.updateOne(query, update);
    res.send(result);
  } catch (error) {
    console.error('Error updating book:', error);
    res.status(500).send({ error: 'Failed to update book' });
  }
});



    // orders api**
app.get('/orders',async(req,res)=>{
 try{
   const query={}
 const { email } = req.query;
   if (email) {
        query.senderEmail = email;
      }
      const options = { sort: { createdAt: -1 } };

  const cursor=ordersCollection.find(query,options)
  const result=await cursor.toArray();
  res.send(result);
 }
 catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).send({ message: "Failed to fetch orders" });
  }

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
  const result = await ordersCollection.deleteOne(query) ;
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