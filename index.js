const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const SSLCommerzPayment = require('sslcommerz-lts')
require("dotenv").config();
const app = express();

const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });
  }

  // bearer token
  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized access" });
    }

    req.decoded = decoded;
    next();
  });
};

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.rvg3x0p.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const store_id = process.env.STORE_ID
const store_passwd = process.env.STORE_PASSWD
const is_live = false //true for live, false for sandbox

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    const bestCollectionPerfume = client
      .db("perfumeEcommerce")
      .collection("perfumeBestSeller");
    const wishListPerfumeCollection = client
      .db("perfumeEcommerce")
      .collection("wishListPerfume");
    const addToCartCollection = client
      .db("perfumeEcommerce")
      .collection("addToCart");
    const usersCollection = client.db("perfumeEcommerce").collection("users");
    const orderCollection = client.db("perfumeEcommerce").collection("order");

    // jwt related
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // create index key
    // await bestCollectionPerfume.dropIndex("titleCategory"); // Drop the existing index
    const indexKey = { name: 1, category: 1 }
    const indexOptions = { name: "newIndexName" }
    
    const result = await bestCollectionPerfume.createIndex(indexKey, indexOptions)

    app.get('/jobSearchByTitle/:text', async (req, res) => {
      const searchText = req.params.text
      console.log(searchText)
      const result = await bestCollectionPerfume.find({
        $or: [
        {name: {$regex:  searchText, $options: 'i'}},
        {category: {$regex:  searchText, $options: 'i'}},
        ]
      }).toArray()

      res.send(result)
    })

    // warning: use verifyJwt before using verifyAdmin
    const veryAdmin = async (req, res, next) => {
      const email = req.decoded.email 
      console.log(email)
      const query = { email: email }
      const user = await usersCollection.findOne(query)
      if (user.role !== 'Admin') {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }
      next()
    }

    // user related

    app.get("/users",verifyJWT, veryAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exist" });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // security layer : verifyJWT
    // email same
    // check admin
    app.get("/users/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ admin: false });
      }

      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === "Admin" };
      res.send(result);
    });
    
    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "Admin",
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // app.patch('/users/manager/:id', async (req, res) => {
    //   const id = req.params.id
    //   const filter = { _id: new ObjectId(id) }
    //   const updateDoc = {
    //     $set: {
    //       role: 'Manager'
    //     },
    //   };
    //   const result = await usersCollection.updateOne(filter, updateDoc)
    //   res.send(result)
    // })

    app.delete("/users/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });

    app.get('/buyer/:email',verifyJWT, async(req, res)=>{
      const email = req.params.email

      if(req.decoded.email !== email){
        return res.send({buyer:false})
      }
      const query = {email: email}
      const user = await usersCollection.findOne(query)
      const result = {buyer: user?.role === 'Buyer'}
      res.send(result)
    })
    // bestPerfume

    app.get("/bestPerfume", async (req, res) => {
      const result = await bestCollectionPerfume.find().toArray();
      res.send(result);
    });

    app.post('/allPerfume',verifyJWT, veryAdmin, async (req, res) => {
      const newItem = req.body
      const result = await bestCollectionPerfume.insertOne(newItem)
      res.send(result)
    })

    app.get("/allPerfume", async (req, res) => {
      const result = await bestCollectionPerfume.find().toArray();
      res.send(result);
    });

    app.delete('/allPerfume/:id',verifyJWT, veryAdmin, async (req, res) => {
      const id = req.params.id 
      const query = { _id: new ObjectId(id) }
      const result = await bestCollectionPerfume.deleteOne(query)
      res.send(result)
    })

    // shop page

    app.get("/shop", async (req, res) => {
      const selectedOption = req.query.sortBy;
      const priceFilters = req.query.priceFilters;

      let sortOption = {};
      if (selectedOption === "lowest") {
        sortOption = { price: 1 };
      } else if (selectedOption === "highest") {
        sortOption = { price: -1 };
      }

      let filterOption = {};
      if (priceFilters === "low") {
        filterOption = { price: { $gte: 50, $lte: 100 } };
      } else if (priceFilters === "medium") {
        filterOption = { price: { $gt: 100, $lte: 500 } };
      } else if (priceFilters === "high") {
        filterOption = { price: { $gt: 500, $lte: 1000 } };
      }
      const result = await bestCollectionPerfume
        .find(filterOption)
        .sort(sortOption)
        .toArray();
      res.send(result);
    });

    // modal related
    app.get("/bestPerfume/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bestCollectionPerfume.findOne(query);
      res.send(result);
    });

    // wishList related
    app.post("/wishList", async (req, res) => {
      const item = req.body;
      const itemId = req.body.wishListId;

      const existorder = await wishListPerfumeCollection.findOne({
        wishListId: itemId,
      });

      if (existorder) {
        return res.send({
          message: "This order is already in your wishlist.",
        });
      }
      const result = await wishListPerfumeCollection.insertOne(item);
      res.send(result);
    });

    app.get("/allWishlist", async (req, res) => {
      const result = await wishListPerfumeCollection.find().toArray();
      res.send(result);
    });

    app.delete("/allWishList/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await wishListPerfumeCollection.deleteOne(query);
      res.send(result);
    });

    // addToCart related

    app.get("/addToCart", verifyJWT, async (req, res) => {
      const email = req.query.email;

      if (!email) {
        return res.send([]);
      }

      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }
      const query = { email: email };
      // const result = await addToCartCollection.find({email: req.params.email}).toArray()
      // res.send(result)
      const result = await addToCartCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/addToCart", async (req, res) => {
      const addItem = req.body;
      const result = await addToCartCollection.insertOne(addItem);
      res.send(result);
    });

    app.put("/addToCart/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateData = req.body;
      console.log(updateData)
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          quantity: updateData.quantity,
        },
      };
      const result = await addToCartCollection.updateOne(
        query,
        updateDoc,
        options
      );
      res.send(result);
    });

    app.delete("/addToCart/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await addToCartCollection.deleteOne(query);
      res.send(result);
    });

    app.delete("/addToCart", async (req, res) => {
      const result = await addToCartCollection.deleteMany();
      res.send(result);
    });

    // category
    app.get("/category", async (req, res) => {
      const result = await bestCollectionPerfume.find().toArray();
      res.send(result);
    });

    const tran_id = new ObjectId().toString()
    // payment related

    app.post('/order', async (req, res) => {
      const order = req.body 
      console.log('ooo',order)
      const price = order.price 
      const priceNum = parseFloat(price)
      console.log(priceNum)
    
      const data = {
        total_amount: parseFloat(order.price),
        currency: order.currency,
        tran_id: tran_id, // use unique tran_id for each api call
        success_url: `http://localhost:5000/payment/success/${tran_id}`,
        fail_url: `http://localhost:5000/payment/fail/${tran_id}`,
        cancel_url: 'http://localhost:3030/cancel',
        ipn_url: 'http://localhost:3030/ipn',
        shipping_method: 'Courier',
        product_name: 'Computer.',
        product_category: 'Electronic',
        product_profile: 'general',
        cus_name: order.name,
        cus_email: 'customer@example.com',
        cus_add1: order.address,
        cus_add2: 'Dhaka',
        cus_city: 'Dhaka',
        cus_state: 'Dhaka',
        cus_postcode: order.postCode,
        cus_country: 'Bangladesh',
        cus_phone: order.phone,
        cus_fax: '01711111111',
        ship_name: 'Customer Name',
        ship_add1: 'Dhaka',
        ship_add2: 'Dhaka',
        ship_city: 'Dhaka',
        ship_state: 'Dhaka',
        ship_postcode: 1000,
        ship_country: 'Bangladesh',
    };
      
      // console.log(data)
    const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live)
    sslcz.init(data).then(async apiResponse => {
      // Redirect the user to payment gateway
      // console.log(apiResponse)
        let GatewayPageURL = apiResponse.GatewayPageURL
        res.send( {url: GatewayPageURL})
        
      
      const finalOrder = {
       order, paidStatus: false, transactionId: tran_id
      }
      const result = orderCollection.insertOne(finalOrder)
      
    });
      
      app.post('/payment/success/:tranId', async (req, res) => {
       const trans_id = req.params.tranId
        const transactionId = { transactionId: trans_id }
        // console.log(transactionId)
        const updateDoc = {
          $set: {
            paidStatus: true
          },
        };
        const result = await orderCollection.updateOne(transactionId, updateDoc)
        if (result.modifiedCount > 0) {
         res.redirect(`http://localhost:5173/payment/success/${trans_id}`)
        }
      })
      
      app.post('/payment/fail/:tranId', async (req, res) => {
        const trans_id = req.params.tranId
        const transactionId = { transactionId: trans_id } 
        const result = await orderCollection.deleteOne(transactionId)

        if (result.deletedCount) {
        res.redirect(`http://localhost:5173/payment/fail/${trans_id}`)
        }
      })
      
    })

    app.get('/orderDetails', async (req, res) => {
      const result = await orderCollection.find().toArray()
      res.send(result)
    })
    app.get('/admin-stats',verifyJWT, veryAdmin, async (req, res) => {
      const users = await usersCollection.estimatedDocumentCount();
      const products = await bestCollectionPerfume.estimatedDocumentCount();
      const orders = await orderCollection.estimatedDocumentCount();
    
      // Define the aggregation pipeline to calculate the sum
      const pipeline = [
        {
          $group: {
            _id: null,
            totalPrice: { $sum: '$order.price' } // Access the nested 'price' field
          }
        }
      ];
    
      // Execute the aggregation pipeline
      const aggregationResult = await orderCollection.aggregate(pipeline).toArray();
      // console.log(aggregationResult)
    
      // Check if there are aggregation results
      if (aggregationResult.length > 0) {
        const revenue = aggregationResult[0].totalPrice;
        // console.log(revenue)
        res.send({
          users,
          products,
          orders,
          revenue // Send the total price in the response
        });
      } else {
        // Handle the case where there are no aggregation results
        res.send({
          users,
          products,
          orders,
          revenue: 0 // Set total price to 0 if there are no results
        });
      }
    });

    
    app.get('/monthly-sales', async (req, res) => {
      try {
        const salesData = await orderCollection.aggregate([
          {
            $group: {
              _id: {
                year: { $year: { $toDate: '$order.purchaseDate' } },
                month: { $month: { $toDate: '$order.purchaseDate' } }
              },
              totalSales: { $sum: '$order.price' } // Use 'price' instead of 'totalAmount'
            }
          },
          {
            $project: {
              _id: 0,
              year: '$_id.year',
              month: '$_id.month',
              totalSales: 1
            }
          }
        ]).sort({ year: 1, month: 1 });
    
        console.log(salesData);
        res.json(salesData);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
    

    //     await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    //     await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("perfume is running");
});

app.listen(port, () => {
  console.log(`perfume is running on port ${port}`);
});
