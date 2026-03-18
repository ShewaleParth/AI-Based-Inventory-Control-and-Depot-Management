const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, 'Backend/server/.env') });

async function checkTokens() {
  try {
    const MONGODB_URI = "mongodb+srv://luckyak619_db_user:luckyak619@cluster0.lcmjwhw.mongodb.net/animesh?retryWrites=true&w=majority&appName=Cluster0";
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to DB');
    
    const db = mongoose.connection.db;
    
    // Check if collection exists
    const collections = await db.listCollections().toArray();
    console.log('Collections:', collections.map(c => c.name));
    
    // Query tokens
    const tokens = await db.collection('refreshtokens').find({}).toArray();
    console.log(`Found ${tokens.length} refresh tokens in DB:`);
    tokens.forEach(t => console.log(JSON.stringify(t, null, 2)));
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

checkTokens();
