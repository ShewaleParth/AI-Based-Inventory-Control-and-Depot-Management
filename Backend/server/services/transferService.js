const mongoose = require('mongoose');
const Product = require('../models/Product');
const Depot = require('../models/Depot');
const Transaction = require('../models/Transaction');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../config/logger');

/**
 * Execute an inter-depot stock transfer atomically using Product.depotDistribution.
 * Stock data lives in Product.depotDistribution — NOT in a separate DepotStock collection.
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
        throw new AppError('Source and destination depots must be different', 400, 'SAME_DEPOT');

    // Start MongoDB session for atomic writes
    const session = await mongoose.startSession();
    session.startTransaction({
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
    });

    try {
        // ── STEP 1: Load product and depots inside the transaction ──
        const product = await Product.findOne(
            { _id: productId, userId },
            null,
            { session }
        );

        if (!product) {
            throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
        }

        // ── STEP 2: Validate source depot stock in depotDistribution ──
        const fromDepotIndex = product.depotDistribution.findIndex(
            d => d.depotId.toString() === fromDepotId.toString()
        );

        if (fromDepotIndex < 0 || product.depotDistribution[fromDepotIndex].quantity < quantity) {
            const available = fromDepotIndex >= 0 ? product.depotDistribution[fromDepotIndex].quantity : 0;
            throw new AppError(
                `Insufficient stock in source depot. Available: ${available}, Requested: ${quantity}`,
                400,
                'INSUFFICIENT_STOCK'
            );
        }

        const previousStock = product.depotDistribution[fromDepotIndex].quantity;

        // ── STEP 3: Deduct from source depot ──────────────────────
        product.depotDistribution[fromDepotIndex].quantity -= quantity;
        product.depotDistribution[fromDepotIndex].lastUpdated = new Date();

        // Remove entry if quantity reaches 0
        if (product.depotDistribution[fromDepotIndex].quantity === 0) {
            product.depotDistribution.splice(fromDepotIndex, 1);
        }

        // ── STEP 4: Credit destination depot ──────────────────────
        const toDepotIndex = product.depotDistribution.findIndex(
            d => d.depotId.toString() === toDepotId.toString()
        );

        if (toDepotIndex >= 0) {
            // Depot already exists in distribution — just increment
            product.depotDistribution[toDepotIndex].quantity += quantity;
            product.depotDistribution[toDepotIndex].lastUpdated = new Date();
        } else {
            // Depot not yet in distribution — fetch depot name and create entry
            const toDepot = await Depot.findOne(
                { _id: toDepotId, userId },
                null,
                { session }
            );
            if (!toDepot) {
                throw new AppError('Destination depot not found', 404, 'DEPOT_NOT_FOUND');
            }
            product.depotDistribution.push({
                depotId: toDepot._id,
                depotName: toDepot.name,
                quantity,
                lastUpdated: new Date()
            });
        }

        // ── STEP 5: Save the product (pre-save hook recalculates total stock) ──
        await product.save({ session });

        // Resolve depot names for the transaction record
        const fromDepotEntry = product.depotDistribution.find(
            d => d.depotId.toString() === toDepotId.toString()
        );
        // Fetch the from-depot name separately since we may have removed it above
        const fromDepot = await Depot.findOne({ _id: fromDepotId, userId }, 'name', { session });
        const fromDepotName = fromDepot?.name || 'Unknown';
        const toDepotName = fromDepotEntry?.depotName || 'Unknown';

        // ── STEP 6: Create audit transaction record ────────────────
        const [txn] = await Transaction.create([{
            userId,
            transactionType: 'transfer',
            productId: product._id,
            productName: product.name,
            productSku: product.sku,
            fromDepotId,
            fromDepot: fromDepotName,
            toDepotId,
            toDepot: toDepotName,
            quantity,
            previousStock,
            newStock: previousStock - quantity,
            performedBy: 'Staff',
            notes: notes || '',
            timestamp: new Date(),
        }], { session });

        // ── All good: commit all writes atomically ─────────────────
        await session.commitTransaction();
        logger.info(`Transfer committed: ${quantity} units of ${product.name} (${productId}) from ${fromDepotName} → ${toDepotName}`);

        return {
            success: true,
            transactionId: txn._id,
            transaction: txn,
            fromDepotName,
            toDepotName,
            newSourceQty: previousStock - quantity,
        };
    } catch (err) {
        // Any error — rolls back ALL writes
        await session.abortTransaction();
        logger.error(`Transfer aborted: ${err.message}`);
        throw err; // re-throw so the route sends the proper response
    } finally {
        // Always release the session
        session.endSession();
    }
}

module.exports = { executeTransfer };
