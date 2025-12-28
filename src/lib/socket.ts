import { Server } from 'socket.io';

let io: Server | null = null;

export function initSocket(socketIo: Server): void {
  io = socketIo;
  console.log('[Socket] Socket.io initialized');
}

export function getIO(): Server | null {
  if (!io) {
    console.warn('[Socket] Socket.io not initialized yet');
  }
  return io;
}

export function emitProductCreated(product: any): void {
  if (io) {
    io.emit('product:created', {
      type: 'product:created',
      data: product,
      timestamp: new Date()
    });
  }
}

export function emitProductUpdated(product: any): void {
  if (io) {
    io.emit('product:updated', {
      type: 'product:updated',
      data: product,
      timestamp: new Date()
    });
  }
}

export function emitProductDeleted(productId: string): void {
  if (io) {
    io.emit('product:deleted', {
      type: 'product:deleted',
      data: { id: productId },
      timestamp: new Date()
    });
  }
}

export function emitStockUpdated(stockData: any): void {
  if (io) {
    io.emit('stock:updated', {
      type: 'stock:updated',
      data: stockData,
      timestamp: new Date()
    });
  }
}

export function emitTransactionCreated(transaction: any): void {
  if (io) {
    io.emit('transaction:created', {
      type: 'transaction:created',
      data: transaction,
      timestamp: new Date()
    });
  }
}

export function emitSettingsUpdated(settings: any): void {
  if (io) {
    io.emit('settings:updated', {
      type: 'settings:updated',
      data: settings,
      timestamp: new Date()
    });
  }
}

export function emitCategoryUpdated(category: any): void {
  if (io) {
    io.emit('category:updated', {
      type: 'category:updated',
      data: category,
      timestamp: new Date()
    });
  }
}
