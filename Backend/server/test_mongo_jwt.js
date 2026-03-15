require('dotenv').config();
const mongoose = require('mongoose');
const RefreshToken = require('./models/RefreshToken');

async function test() {
  try {
    console.log('Connecting...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.');
    
    console.log('Creating token...');
    const token = await RefreshToken.create({
      userId: new mongoose.Types.ObjectId(),
      jti: 'test-jti-' + Date.now(),
      familyId: 'test-family'
    });
    console.log('Created!', token);
    
    console.log('Finding token...');
    const found = await RefreshToken.findOne({ jti: token.jti });
    console.log('Found:', !!found);
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

test();
