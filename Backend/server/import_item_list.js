/**
 * Script: import_item_list.js
 * Reads Dataset/Item List.csv and imports ALL products directly into MongoDB,
 * matching each to the named depot (creates depot if missing).
 * Run: node import_item_list.js
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

const Product = require('./models/Product');
const Depot   = require('./models/Depot');
const Transaction = require('./models/Transaction');

const CSV_PATH = path.join(__dirname, '../../Dataset/Item List.csv');

// Parse a CSV line that may contain quoted fields with commas inside
function parseLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // Use the admin account that owns the existing products (sparth7972@gmail.com)
  const CORRECT_USER_ID = '69af0deb9267ba92dd4042b3';
  const userId = new mongoose.Types.ObjectId(CORRECT_USER_ID);
  console.log(`Using userId: ${userId}`);


  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  const headers = parseLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, ''));

  const getCol = (row, name) => {
    const idx = headers.indexOf(name);
    return idx >= 0 ? (row[idx] || '').trim().replace(/^"|"$/g, '') : '';
  };

  let success = 0, failed = 0, skipped = 0;
  const errors = [];

  // Cache depots
  const depotCache = {};

  for (let i = 1; i < lines.length; i++) {
    const row = parseLine(lines[i]);
    const sku      = getCol(row, 'sku');
    const name     = getCol(row, 'name');
    if (!sku || !name) { skipped++; continue; }

    try {
      const category    = getCol(row, 'category') || 'Uncategorized';
      const stock       = parseInt(getCol(row, 'stock'))    || 0;
      const price       = parseFloat(getCol(row, 'price'))  || 0;
      const supplier    = getCol(row, 'supplier')           || 'Unknown';
      const reorderPoint= parseInt(getCol(row, 'reorderpoint')) || 10;
      const dailySales  = parseInt(getCol(row, 'dailysales'))   || 5;
      const weeklySales = parseInt(getCol(row, 'weeklysales'))  || 35;
      const brand       = getCol(row, 'brand')              || 'Generic';
      const leadTime    = parseInt(getCol(row, 'leadtime'))  || 7;
      const image       = getCol(row, 'image')              || '';
      const depotName   = getCol(row, 'depot')              || 'Main Depot';

      // Find or create depot
      let depot = depotCache[depotName];
      if (!depot) {
        depot = await Depot.findOne({ name: depotName, userId });
        if (!depot) {
          depot = new Depot({
            userId,
            name: depotName,
            location: 'Auto-created',
            capacity: 50000,
            currentUtilization: 0,
            itemsStored: 0,
            products: [],
            status: 'normal'
          });
          await depot.save();
          console.log(`  Created depot: ${depotName}`);
        }
        depotCache[depotName] = depot;
      }

      // Upsert product
      let product = await Product.findOne({ sku, userId });
      if (product) {
        // Update fields
        product.name        = name;
        product.category    = category;
        product.price       = price;
        product.supplier    = supplier;
        product.reorderPoint= reorderPoint;
        product.dailySales  = dailySales;
        product.weeklySales = weeklySales;
        product.brand       = brand;
        product.leadTime    = leadTime;
        if (image) product.image = image;

        // Add depot distribution if missing
        const ddIdx = product.depotDistribution.findIndex(
          d => d.depotId.toString() === depot._id.toString()
        );
        if (ddIdx < 0) {
          product.depotDistribution.push({ depotId: depot._id, depotName: depot.name, quantity: stock, lastUpdated: new Date() });
        }
        await product.save();
        console.log(`  Updated: ${sku} - ${name}`);
      } else {
        product = new Product({
          userId, sku, name, category, stock,
          reorderPoint, supplier, price,
          dailySales, weeklySales, brand, leadTime, image,
          depotDistribution: stock > 0 ? [{ depotId: depot._id, depotName: depot.name, quantity: stock, lastUpdated: new Date() }] : []
        });
        await product.save();

        // Add to depot
        depot.products.push({ productId: product._id, productName: name, productSku: sku, quantity: stock, lastUpdated: new Date() });
        depot.currentUtilization += stock;
        depot.itemsStored = depot.products.length;
        await depot.save();

        // Initial stock-in transaction
        if (stock > 0) {
          const tx = new Transaction({
            userId,
            productId: product._id,
            productName: name,
            productSku: sku,
            transactionType: 'stock-in',
            quantity: stock,
            toDepot: depot.name,
            toDepotId: depot._id,
            previousStock: 0,
            newStock: stock,
            reason: 'Item List Import',
            performedBy: 'System'
          });
          await tx.save();
        }
        console.log(`  Created: ${sku} - ${name} (stock: ${stock}) → ${depot.name}`);
      }

      // Update depot cache reference (might have been updated)
      depotCache[depotName] = await Depot.findById(depot._id);
      success++;
    } catch (err) {
      failed++;
      errors.push(`Row ${i + 1} (${sku}): ${err.message}`);
      console.error(`  ERROR Row ${i + 1} (${sku}): ${err.message}`);
    }
  }

  console.log(`\n✅ Import complete: ${success} succeeded, ${failed} failed, ${skipped} skipped`);
  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.forEach(e => console.log(' ', e));
  }

  // Write summary to JSON for easy reading
  const summary = { success, failed, skipped, errors };
  fs.writeFileSync(path.join(__dirname, 'import_result.json'), JSON.stringify(summary, null, 2));
  console.log('\nSummary written to import_result.json');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
