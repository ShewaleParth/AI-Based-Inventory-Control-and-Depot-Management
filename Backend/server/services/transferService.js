const mongoose = require('mongoose');
const DepotStock = require('../models/DepotStock');
const Transaction = require('../models/Transaction');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../config/logger');

/**
 * Execute an inter-depot stock transfer atomically.
 * All writes succeed or all are rolled back — no partial state.
 */
async function executeTransfer({
    productId, fromDepotId, toDepotId, quantity, userId, notes
}) {
    // Validate inputs before touching the database
    if (!productId || !fromDepotId || !toDepotId)
        throw new AppError('Missing required transfer fields', 400, 'INVALID_INPUT');

    if (quantity <= 0)
        throw new AppError('Transfer quantity must be positive', 400, 'INVALID_QUANTITY');

    if (fromDepotId.toString() === toDepotId.toString())
        throw new AppError('Source and destination must differ', 400, 'SAME_DEPOT');

    // Start MongoDB session
    const session = await mongoose.startSession();
    session.startTransaction({
        // Strictest isolation — reads see only committed data
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
    });

    try {
        // ── STEP 1: Read source stock inside the transaction ──
        // The session: option locks this document for the transaction
        const sourceStock = await DepotStock.findOne(
            { productId, depotId: fromDepotId, userId },
            null,
            { session }  // <-- critical: read inside transaction
        );

        if (!sourceStock || sourceStock.quantity < quantity) {
            throw new AppError(
                `Insufficient stock. Available: ${sourceStock?.quantity ?? 0}, Requested: ${quantity}`,
                400,
                'INSUFFICIENT_STOCK'
            );
        }

        // ── STEP 2: Deduct from source ────────────────────────
        const updatedSource = await DepotStock.findOneAndUpdate(
            { productId, depotId: fromDepotId, userId },
            { $inc: { quantity: -quantity } },
            { session, new: true, runValidators: true }
            // runValidators enforces min: 0 from schema
        );

        // ── STEP 3: Credit destination ────────────────────────
        // upsert: true creates the record if it doesn't exist yet
        await DepotStock.findOneAndUpdate(
            { productId, depotId: toDepotId, userId },
            { $inc: { quantity: quantity } },
            { session, new: true, upsert: true, runValidators: true }
        );

        // ── STEP 4: Audit record (same transaction) ───────────
        // Using array syntax is required for create() in a session
        const [txn] = await Transaction.create([{
            userId,
            transactionType: 'transfer',
            productId,
            productName: '...', // Can be populated dynamically if needed
            productSku: '...',
            fromDepotId,
            toDepotId,
            quantity,
            previousStock: sourceStock.quantity,
            newStock: updatedSource.quantity,
            performedBy: userId,
            notes: notes || '',
            timestamp: new Date(),
        }], { session });

        // ── All good: commit all three writes atomically ──────
        await session.commitTransaction();
        logger.info(`Transfer committed: ${quantity} units of ${productId}`);

        return {
            success: true,
            transactionId: txn._id,
            newSourceQty: updatedSource.quantity,
        };
    } catch (err) {
        // Any error — rolls back ALL writes (deduct AND credit)
        await session.abortTransaction();
        logger.error(`Transfer aborted: ${err.message}`);
        throw err; // re-throw so asyncWrap sends proper response
    } finally {
        // Always release the session, even if commit/abort fails
        session.endSession();
    }
}

module.exports = { executeTransfer };
