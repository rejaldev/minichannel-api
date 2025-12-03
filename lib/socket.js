/**
 * Socket.io Event Emitter Helper
 * Centralized module for emitting real-time events to connected clients
 */

let io = null;

/**
 * Initialize socket.io instance
 * @param {Server} socketIo - Socket.io server instance
 */
function initSocket(socketIo) {
  io = socketIo;
  console.log('[Socket] Socket.io initialized');
}

/**
 * Get socket.io instance
 * @returns {Server} Socket.io instance
 */
function getIO() {
  if (!io) {
    console.warn('[Socket] Socket.io not initialized yet');
  }
  return io;
}

/**
 * Emit product created event
 * @param {Object} product - Created product data
 */
function emitProductCreated(product) {
  if (io) {
    io.emit('product:created', {
      type: 'product:created',
      data: product,
      timestamp: new Date()
    });
  }
}

/**
 * Emit product updated event
 * @param {Object} product - Updated product data
 */
function emitProductUpdated(product) {
  if (io) {
    io.emit('product:updated', {
      type: 'product:updated',
      data: product,
      timestamp: new Date()
    });
  }
}

/**
 * Emit product deleted event
 * @param {String} productId - Deleted product ID
 */
function emitProductDeleted(productId) {
  if (io) {
    io.emit('product:deleted', {
      type: 'product:deleted',
      data: { id: productId },
      timestamp: new Date()
    });
  }
}

/**
 * Emit stock updated event
 * @param {Object} stockData - Stock update data
 */
function emitStockUpdated(stockData) {
  if (io) {
    io.emit('stock:updated', {
      type: 'stock:updated',
      data: stockData,
      timestamp: new Date()
    });
  }
}

/**
 * Emit category created/updated event
 * @param {Object} category - Category data
 */
function emitCategoryUpdated(category) {
  if (io) {
    io.emit('category:updated', {
      type: 'category:updated',
      data: category,
      timestamp: new Date()
    });
  }
}

/**
 * Emit generic sync trigger (for full sync)
 * @param {String} syncType - Type of sync needed (products, categories, etc)
 */
function emitSyncTrigger(syncType) {
  if (io) {
    io.emit('sync:trigger', {
      type: 'sync:trigger',
      syncType: syncType,
      timestamp: new Date()
    });
  }
}

module.exports = {
  initSocket,
  getIO,
  emitProductCreated,
  emitProductUpdated,
  emitProductDeleted,
  emitStockUpdated,
  emitCategoryUpdated,
  emitSyncTrigger
};
