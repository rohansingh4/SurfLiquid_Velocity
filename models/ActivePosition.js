import mongoose from 'mongoose';

const activePositionSchema = new mongoose.Schema({
  // There should only ever be ONE document in this collection
  _id: { type: String, default: 'current' },

  // Position details
  tickLower: { type: Number, required: true },
  tickUpper: { type: Number, required: true },
  liquidity: { type: String, required: true }, // Store as string for BigInt

  // Pool info
  poolAddress: { type: String, required: true },

  // Metadata
  lastUpdated: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

const ActivePosition = mongoose.model('ActivePosition', activePositionSchema);

export default ActivePosition;
