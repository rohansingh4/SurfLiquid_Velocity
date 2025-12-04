import mongoose from 'mongoose';

const MONGODB_URI = 'mongodb+srv://nishant:fq2OndbVPe3M5LZq@finora-backend.ztyjpt.mongodb.net/Velocity?tls=true';

let isConnected = false;

async function connectDB() {
  if (isConnected) {
    console.log('📊 Using existing MongoDB connection');
    return;
  }

  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    isConnected = true;
    console.log('✅ MongoDB connected successfully to Velocity database');

    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
      isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      console.log('⚠️  MongoDB disconnected');
      isConnected = false;
    });

  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    throw error;
  }
}

export { connectDB, mongoose };
