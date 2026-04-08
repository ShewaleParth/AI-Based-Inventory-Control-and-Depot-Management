const mongoose = require('mongoose');
const Product = require('./models/Product');
const DB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/inventory'; // Assuming standard local or loaded from env
require('dotenv').config();

async function fixStaleStock() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to DB');

    const products = await Product.find({});
    let updated = 0;
    let deleted = 0;
    
    // Also require Alert model to clean up cascading references
    const Alert = require('./models/Alert');
    
    for (const p of products) {
      if (p.depotDistribution) {
        p.stock = p.depotDistribution.reduce((total, depot) => total + (depot.quantity || 0), 0);
        
        // AUTO-DELETE: if stock is 0 and no depots hold it, purge it completely
        // This matches the updated backend and ensures Dashboard counts are accurate.
        if (p.stock === 0 && p.depotDistribution.length === 0) {
          await Alert.deleteMany({ productId: p._id });
          await Product.findByIdAndDelete(p._id);
          deleted++;
          continue;
        }

        // Otherwise update status based on total stock levels
        if (p.stock === 0) {
          p.status = 'out-of-stock';
        } else if (p.stock <= p.reorderPoint) {
          p.status = 'low-stock';
        } else if (p.stock > p.reorderPoint * 3) {
          p.status = 'overstock';
        } else {
          p.status = 'in-stock';
        }

        await p.save();
        updated++;
      }
    }

    console.log(`Successfully synced stock across ${updated} active products.`);
    console.log(`Permanently deleted ${deleted} ghost/zero-stock products.`);
    process.exit(0);
  } catch (error) {
    console.error('Error fixing stock:', error);
    process.exit(1);
  }
}

fixStaleStock();
