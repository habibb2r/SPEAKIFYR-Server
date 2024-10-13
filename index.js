const express = require("express");
const app = express();
const cors = require("cors");
const port = process.env.PORT || 5000;
require("dotenv").config();
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.PAYMENT_SK);

//middleware
app.use(cors());
app.use(express.json());
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: "unauthorized" });
  }

  //bearer token
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: "unauthorized" });
    }
    req.decoded = decoded;
    next();
  });
};

app.get("/", (req, res) => {
  res.send("Running Assignment 12 Server");
});

//DB

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ir3lm70.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    //Collections
    const classCollection = client.db("summerCamp").collection("classList");
    const instCollection = client.db("summerCamp").collection("instructorList");
    const userCollection = client.db("summerCamp").collection("userList");
    const myClassCollection = client.db("summerCamp").collection("myClass");
    const paymentCollection = client.db("summerCamp").collection("pay");

    //JWT
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "5000hr",
      });
      res.send({ token });
    });

    //Verify Admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      if (user?.role !== "admin") {
        return res.status(403).send({ error: true, message: "forbidden" });
      }
      next();
    };

    app.get("/classes", async (req, res) => {
      const result = await classCollection.find().toArray();
      res.send(result);
    });

    app.get("/popularclass", async (req, res) => {
      const result = await classCollection.find().sort({ price: -1 }).toArray();
      res.send(result);
    });
    app.get("/instructors", async (req, res) => {
      const result = await instCollection.find().toArray();
      res.send(result);
    });

    app.get("/myclass", verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }

      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res
          .status(403)
          .send({ error: true, message: "Forbidden Access" });
      }

      const query = { email: email };
      const result = await myClassCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/userList", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get('/userInfo', async(req, res)=>{
      const email = req.query.email;
      const query = { email: email };
      const result = await userCollection.findOne(query, {projection: { photo: 0, role: 0 }});
      res.send(result);
    })

    app.post('/makepayment', async (req, res) => {
      try {
        const paymentSlip = req.body;
        const query = { _id: new ObjectId(paymentSlip.classId) };
        const classData = await classCollection.findOne(query);
        const courseTag = classData.course_tag;
    
        const generateRoll = () => {
          const randomNumber = Math.floor(Math.random() * 21) + 100; // Generate random number between 100 and 120
          return courseTag + randomNumber;
        };
    
        let assignRoll;
        let isRollExist;
        
        do {
          assignRoll = generateRoll();
          isRollExist = await paymentCollection.findOne({ entry_code: assignRoll });
        } while (isRollExist);
        const payslip={
          ...paymentSlip,
          entry_code: assignRoll,
        }
        const removeCart = await myClassCollection.deleteOne({ _id: new ObjectId(paymentSlip.cartId) });
        const result = await paymentCollection.insertOne(payslip);
        res.send({ status: true, result, removeCart });
      } catch (error) {
        console.error(error);
        res.status(500).send({ status: false, message: 'Internal Server Error' });
      }
    });

    app.get('/myEnrolledClass', async(req, res)=>{
      const email = req.query.email;
      const query = { email: email };
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    })
    app.get("/userList/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        return res.send({ admin: false });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const result = { admin: user?.role === "admin" };
      return res.send(result);
    });
    app.patch(
      "/userList/admin/:id",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            role: "admin",
          },
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );
    app.delete("/userList/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: id };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    app.post("/addClass", async (req, res) => {
      const body = req.body;
      const insturctorQuery = { _id: new ObjectId(body.classId) };
      const query = { classId: body.classId, email: body.email };
      const existing = await myClassCollection.findOne(query);
      if (existing) {
        return res.send({ message: "Already added" });
      }
      const updateSit = await classCollection.updateOne(insturctorQuery, {
        $inc: { sit: -1 },
      });
      const result = await myClassCollection.insertOne(req.body);
      res.send({
        status: true,
        message: "Added to Cart, Please, complete next procedure",
        result,
        updateSit,
      });
    });

    app.delete("/addClass/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const classId = req.query.classId;
      const myClassQuery = { _id: new ObjectId(id) };
      const classQuery = { _id: new ObjectId(classId) };
      const updateClass = await classCollection.updateOne(classQuery, {
        $inc: { sit: 1 },
      });
      const result = await myClassCollection.deleteOne(myClassQuery);
      res.send({ status: true, updateClass, result });
    });

    app.post('/userList', async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existing = await userCollection.findOne(query);

      if (existing) {
        return res.send({ message: "User already exists" });
      }
      const result = await userCollection.insertOne(user);
      return res.send(result);
    });


    //Instructor Section

    app.get('/userList/instructorInfo', async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await userCollection.findOne(query);
      if(result.role == 'instructor'){
          return res.send({instructor : true})
      }
      return res.send({instructor : false})
    })

    // Payment
    app.post("/createPayment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = price * 100;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Assignment server port: ${port}`);
});
