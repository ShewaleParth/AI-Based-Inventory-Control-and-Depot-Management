const mongoose = require('mongoose');
const dotenv = require('dotenv');
const fs = require('fs');

dotenv.config({ path: '.env' });

const dbURI = process.env.MONGODB_URI;

mongoose.connect(dbURI)
  .then(async () => {
    const users = await mongoose.connection.db.collection('users').find({}, { projection: { email: 1, role: 1 } }).toArray();
    const sampleProd = await mongoose.connection.db.collection('products').findOne({ sku: 'ELE-001' });
    const result = {
      users: users.map(u => ({ id: u._id, email: u.email, role: u.role })),
      ele001_userId: sampleProd ? sampleProd.userId : 'not found',
      all_ele001: await (async () => {
        const all = await mongoose.connection.db.collection('products').find({ sku: 'ELE-001' }).toArray();
        return all.map(p => ({ name: p.name, userId: p.userId, stock: p.stock }));
      })()
    };

    fs.writeFileSync('db_status.json', JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch(err => {
    fs.writeFileSync('db_status.json', JSON.stringify({error: err.message}));
    process.exit(1);
  });
