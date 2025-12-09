require('dotenv').config()
const express = require('express');
const cors = require('cors');

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 3000;

//moddleware
app.use(cors());
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_user}:${process.env.DB_pass}@cluster0.nlnjuiz.mongodb.net/?appName=Cluster0`;


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



    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    
  }
}
run().catch(console.dir);


app.listen(port, () => {
  console.log(`bookcourier server is running on port ${port}`);
})  