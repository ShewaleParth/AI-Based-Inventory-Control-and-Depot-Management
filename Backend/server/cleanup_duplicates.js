/**
 * Cleanup script: removes the wrongly-imported duplicate products
 * imported under userId 69affdf32996e82831e975e2 (abhishek staff account)
 * which duplicated items already belonging to 69af0deb9267ba92dd4042b3 (sparth admin)
 */
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config({ path: path.join(__dirname, '.env') });

const WRONG_USER_ID = '69affdf32996e82831e975e2';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // Count how many products the wrong user has
  const count = await mongoose.connection.db.collection('products')
    .countDocuments({ userId: new mongoose.Types.ObjectId(WRONG_USER_ID) });
  console.log(`Found ${count} products under wrong userId`);

  if (count > 0) {
    // Delete all products for that user
    const delResult = await mongoose.connection.db.collection('products')
      .deleteMany({ userId: new mongoose.Types.ObjectId(WRONG_USER_ID) });
    console.log(`Deleted ${delResult.deletedCount} products`);

    // Delete related transactions too
    const txDel = await mongoose.connection.db.collection('transactions')
      .deleteMany({ userId: new mongoose.Types.ObjectId(WRONG_USER_ID) });
    console.log(`Deleted ${txDel.deletedCount} transactions created by import`);

    // Clean up depot products arrays for depots belonging to wrong user
    const depotDel = await mongoose.connection.db.collection('depots')
      .deleteMany({ userId: new mongoose.Types.ObjectId(WRONG_USER_ID) });
    console.log(`Deleted ${depotDel.deletedCount} depots created by import`);
  }

  const summary = { removedProducts: count };
  fs.writeFileSync(path.join(__dirname, 'cleanup_result.json'), JSON.stringify(summary, null, 2));
  console.log('\nCleanup complete. Summary in cleanup_result.json');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
