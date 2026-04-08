const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: '.env' });

const dbURI = process.env.MONGODB_URI;

mongoose.connect(dbURI)
  .then(async () => {
    console.log('Connected to MongoDB');
    // We assume the schema is simple
    const products = await mongoose.connection.db.collection('products').find({}).toArray();
    console.log('Total products:', products.length);
    if(products.length > 0) {
      console.log('Sample product:', { name: products[0].name, sku: products[0].sku });
      const myProducts = products.filter(p => p.sku === 'ELE-001' || p.sku === 'WGT-001');
      console.log('Found specific products:', myProducts.map(p => ({name: p.name, sku: p.sku})));
    }
    const depots = await mongoose.connection.db.collection('depots').find({}).toArray();
    console.log('Total depots:', depots.length);
    if(depots.length > 0) {
      console.log('Sample depot:', depots[0].name);
    }
    process.exit(0);
  })
  .catch(err => {
    console.error('Connection error', err);
    process.exit(1);
  });
