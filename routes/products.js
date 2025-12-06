const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, ownerOrManager } = require('../middleware/auth');
const { emitProductCreated, emitProductUpdated, emitProductDeleted, emitCategoryUpdated, emitStockUpdated } = require('../lib/socket');
const multer = require('multer');
const csv = require('csv-parser');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const prisma = new PrismaClient();

// Configure multer for file upload
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Get all categories
router.get('/categories', authMiddleware, async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      include: {
        _count: {
          select: { products: true }
        }
      }
    });
    res.json(categories);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create category (Owner/Manager only)
router.post('/categories', authMiddleware, ownerOrManager, async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const category = await prisma.category.create({
      data: { name, description }
    });

    // Emit WebSocket event
    emitCategoryUpdated(category);

    res.status(201).json(category);
  } catch (error) {
    console.error('Create category error:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Category name already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all products with filters
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { categoryId, search, isActive } = req.query;

    const where = {};
    if (categoryId) where.categoryId = categoryId;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { 
          variants: {
            some: {
              sku: { contains: search, mode: 'insensitive' }
            }
          }
        }
      ];
    }
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const products = await prisma.product.findMany({
      where,
      include: {
        category: true,
        variants: {
          include: {
            stocks: {
              include: {
                cabang: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(products);
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Download Template - Excel file with 2 sheets (must be before /:id route)
router.get('/template', authMiddleware, async (req, res) => {
  try {
    // Get available categories and cabangs
    const categories = await prisma.category.findMany({ orderBy: { name: 'asc' } });
    const cabangs = await prisma.cabang.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
    
    if (categories.length === 0 || cabangs.length === 0) {
      return res.status(400).json({ 
        error: 'Tidak ada kategori atau cabang. Buat kategori dan cabang terlebih dahulu.' 
      });
    }

    // Create new workbook
    const workbook = XLSX.utils.book_new();

    // ========================================
    // SHEET 1: REFERENSI & INFO
    // ========================================
    const sheet1Data = [];
    
    // Title & Instructions
    sheet1Data.push(['REFERENSI & INFO IMPORT PRODUK']);
    sheet1Data.push([]);
    sheet1Data.push(['PANDUAN PENGGUNAAN:']);
    sheet1Data.push(['1. Lihat contoh pengisian produk di bawah']);
    sheet1Data.push(['2. Lihat tabel referensi ID Kategori dan ID Cabang']);
    sheet1Data.push(['3. Pindah ke Sheet "Template Import" untuk isi data']);
    sheet1Data.push(['4. Gunakan ID dari tabel referensi saat mengisi template']);
    sheet1Data.push(['5. Simpan file dan upload']);
    sheet1Data.push([]);
    
    // Example section
    sheet1Data.push(['CONTOH PENGISIAN PRODUK:']);
    sheet1Data.push([]);
    sheet1Data.push(['SKU', 'Nama Produk', 'Deskripsi', 'ID Kategori', 'Tipe Produk', 'Nama Varian', 'Nilai Varian', 'Harga', 'Stok', 'ID Cabang']);
    sheet1Data.push([
      'CONTOH-001',
      'Kaos Polos Basic',
      'Kaos cotton combed premium',
      categories[0]?.id || '',
      'SINGLE',
      '',
      '',
      50000,
      20,
      cabangs[0]?.id || ''
    ]);
    sheet1Data.push([
      'CONTOH-002-42',
      'Sepatu Sport Pro',
      'Sepatu running profesional',
      categories[0]?.id || '',
      'VARIANT',
      'Warna|Ukuran',
      'Hitam|42',
      450000,
      5,
      cabangs[0]?.id || ''
    ]);
    sheet1Data.push([
      'CONTOH-002-43',
      'Sepatu Sport Pro',
      'Sepatu running profesional',
      categories[0]?.id || '',
      'VARIANT',
      'Warna|Ukuran',
      'Hitam|43',
      450000,
      3,
      cabangs[0]?.id || ''
    ]);
    sheet1Data.push([
      'CONTOH-002-W42',
      'Sepatu Sport Pro',
      'Sepatu running profesional',
      categories[0]?.id || '',
      'VARIANT',
      'Warna|Ukuran',
      'Putih|42',
      450000,
      4,
      cabangs[0]?.id || ''
    ]);
    sheet1Data.push([]);
    
    // Explanation
    sheet1Data.push(['PENJELASAN:']);
    sheet1Data.push(['• Baris 1: Produk SINGLE (tanpa varian), kolom Nama Varian & Nilai Varian kosong']);
    sheet1Data.push(['• Baris 2-4: Produk VARIANT (3 varian), Nama Produk sama, SKU berbeda']);
    sheet1Data.push(['• Format multi varian: gunakan pipe (|) sebagai pemisah, contoh "Warna|Ukuran"']);
    sheet1Data.push([]);
    sheet1Data.push([]);
    
    // Categories table
    sheet1Data.push(['REFERENSI ID KATEGORI:']);
    sheet1Data.push([]);
    sheet1Data.push(['ID Kategori', 'Nama Kategori', 'Deskripsi']);
    categories.forEach(cat => {
      sheet1Data.push([cat.id, cat.name, cat.description || '-']);
    });
    sheet1Data.push([]);
    sheet1Data.push([]);
    
    // Cabangs table
    sheet1Data.push(['REFERENSI ID CABANG:']);
    sheet1Data.push([]);
    sheet1Data.push(['ID Cabang', 'Nama Cabang', 'Alamat', 'Status']);
    cabangs.forEach(cabang => {
      sheet1Data.push([
        cabang.id,
        cabang.name,
        cabang.address || '-',
        cabang.isActive ? 'Aktif' : 'Nonaktif'
      ]);
    });

    const worksheet1 = XLSX.utils.aoa_to_sheet(sheet1Data);
    
    // Set column widths for sheet 1
    worksheet1['!cols'] = [
      { wch: 15 }, // SKU
      { wch: 25 }, // Nama Produk
      { wch: 30 }, // Deskripsi
      { wch: 12 }, // ID Kategori
      { wch: 15 }, // Tipe Produk
      { wch: 15 }, // Nama Varian
      { wch: 15 }, // Nilai Varian
      { wch: 12 }, // Harga
      { wch: 8 },  // Stok
      { wch: 12 }  // ID Cabang
    ];
    
    XLSX.utils.book_append_sheet(workbook, worksheet1, 'Referensi & Info');

    // ========================================
    // SHEET 2: TEMPLATE IMPORT
    // ========================================
    const sheet2Data = [];
    
    // Instructions
    sheet2Data.push(['TEMPLATE IMPORT PRODUK']);
    sheet2Data.push([]);
    sheet2Data.push(['INSTRUKSI:']);
    sheet2Data.push(['1. Hapus baris instruksi ini (baris 1-13)']);
    sheet2Data.push(['2. Lihat Sheet "Referensi & Info" untuk contoh dan tabel ID']);
    sheet2Data.push(['3. Isi data produk mulai dari baris 2 (setelah header)']);
    sheet2Data.push(['4. Gunakan ID dari Sheet "Referensi & Info"']);
    sheet2Data.push([]);
    sheet2Data.push(['ATURAN PENTING:']);
    sheet2Data.push(['• SKU harus unique untuk produk SINGLE']);
    sheet2Data.push(['• SKU harus berbeda untuk tiap varian dari 1 produk VARIANT']);
    sheet2Data.push(['• Nama Produk harus sama untuk semua varian dari 1 produk']);
    sheet2Data.push(['• Tipe Produk: SINGLE atau VARIANT']);
    sheet2Data.push(['• Nama Varian & Nilai Varian: kosong untuk SINGLE, wajib isi untuk VARIANT']);
    sheet2Data.push([]);
    
    // Header row
    sheet2Data.push(['SKU', 'Nama Produk', 'Deskripsi', 'ID Kategori', 'Tipe Produk', 'Nama Varian', 'Nilai Varian', 'Harga', 'Stok', 'ID Cabang']);
    
    // Empty rows for user to fill
    sheet2Data.push(['', '', '', '', '', '', '', '', '', '']);

    const worksheet2 = XLSX.utils.aoa_to_sheet(sheet2Data);
    
    // Set column widths for sheet 2
    worksheet2['!cols'] = [
      { wch: 15 }, // SKU
      { wch: 25 }, // Nama Produk
      { wch: 30 }, // Deskripsi
      { wch: 12 }, // ID Kategori
      { wch: 15 }, // Tipe Produk
      { wch: 15 }, // Nama Varian
      { wch: 15 }, // Nilai Varian
      { wch: 12 }, // Harga
      { wch: 8 },  // Stok
      { wch: 12 }  // ID Cabang
    ];
    
    XLSX.utils.book_append_sheet(workbook, worksheet2, 'Template Import');

    // Generate Excel file
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=template-import-produk.xlsx');
    res.send(excelBuffer);
  } catch (error) {
    console.error('Download template error:', error);
    res.status(500).json({ error: 'Gagal mengunduh template' });
  }
});

// Export Products to Excel (must be before /:id route)
router.get('/export', authMiddleware, async (req, res) => {
  try {
    // Get all products with variants and stocks
    const products = await prisma.product.findMany({
      include: {
        category: true,
        variants: {
          include: {
            stocks: {
              include: {
                cabang: true
              }
            }
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    // Flatten data for export
    const exportData = [];
    products.forEach(product => {
      product.variants.forEach(variant => {
        variant.stocks.forEach(stock => {
          exportData.push([
            variant.sku || '',
            product.name,
            product.description || '',
            product.categoryId || '',
            product.category?.name || '',
            product.productType,
            variant.variantName || '',
            variant.variantValue || '',
            stock.price || 0,
            stock.quantity || 0,
            stock.cabangId,
            stock.cabang.name,
            product.isActive ? 'Aktif' : 'Nonaktif'
          ]);
        });
      });
    });

    if (exportData.length === 0) {
      return res.status(404).json({ error: 'Tidak ada data produk untuk diexport' });
    }

    // Create workbook
    const workbook = XLSX.utils.book_new();
    
    // Add header
    const header = [
      'SKU',
      'Nama Produk',
      'Deskripsi',
      'ID Kategori',
      'Nama Kategori',
      'Tipe Produk',
      'Nama Varian',
      'Nilai Varian',
      'Harga',
      'Stok',
      'ID Cabang',
      'Nama Cabang',
      'Status'
    ];
    
    const worksheetData = [header, ...exportData];
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    
    // Set column widths
    worksheet['!cols'] = [
      { wch: 15 }, // SKU
      { wch: 25 }, // Nama Produk
      { wch: 30 }, // Deskripsi
      { wch: 12 }, // ID Kategori
      { wch: 20 }, // Nama Kategori
      { wch: 15 }, // Tipe Produk
      { wch: 15 }, // Nama Varian
      { wch: 15 }, // Nilai Varian
      { wch: 12 }, // Harga
      { wch: 8 },  // Stok
      { wch: 12 }, // ID Cabang
      { wch: 20 }, // Nama Cabang
      { wch: 10 }  // Status
    ];
    
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Data Produk');
    
    // Generate Excel file
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=export-produk-${Date.now()}.xlsx`);
    res.send(excelBuffer);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Gagal export produk' });
  }
});

// Get single product by ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: {
        category: true,
        variants: {
          include: {
            stocks: {
              include: {
                cabang: true
              }
            }
          }
        }
      }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create product with variants (Owner/Manager only)
router.post('/', authMiddleware, ownerOrManager, async (req, res) => {
  try {
    const { name, description, categoryId, productType, variants, sku, stocks } = req.body;

    if (!name || !categoryId || !productType) {
      return res.status(400).json({ error: 'Name, category, and product type are required' });
    }

    // Validation based on product type
    if (productType === 'SINGLE') {
      if (!sku) {
        return res.status(400).json({ error: 'SKU is required for single product' });
      }
      if (!stocks || stocks.length === 0) {
        return res.status(400).json({ error: 'At least one cabang with price is required' });
      }
    } else if (productType === 'VARIANT') {
      if (!variants || variants.length === 0) {
        return res.status(400).json({ error: 'At least one variant is required for variant product' });
      }
      // Validate all variants have stocks with prices
      for (const variant of variants) {
        if (!variant.stocks || variant.stocks.length === 0) {
          return res.status(400).json({ error: 'All variants must have stocks with prices' });
        }
      }
    }

    // Create product in transaction
    const product = await prisma.$transaction(async (tx) => {
      const newProduct = await tx.product.create({
        data: {
          name,
          description,
          categoryId,
          productType
        }
      });

      // Create variants if product type is VARIANT
      if (productType === 'VARIANT' && variants && variants.length > 0) {
        for (const variant of variants) {
          const newVariant = await tx.productVariant.create({
            data: {
              productId: newProduct.id,
              variantName: variant.variantName,
              variantValue: variant.variantValue,
              sku: variant.sku || `${newProduct.id}-${variant.variantValue}`
            }
          });

          // Create stocks for each cabang if provided
          if (variant.stocks && variant.stocks.length > 0) {
            for (const stock of variant.stocks) {
              await tx.stock.upsert({
                where: {
                  productVariantId_cabangId: {
                    productVariantId: newVariant.id,
                    cabangId: stock.cabangId
                  }
                },
                update: {
                  quantity: stock.quantity !== undefined ? parseInt(stock.quantity) : 0,
                  price: stock.price !== undefined ? parseFloat(stock.price) : 0
                },
                create: {
                  productVariantId: newVariant.id,
                  cabangId: stock.cabangId,
                  quantity: stock.quantity !== undefined ? parseInt(stock.quantity) : 0,
                  price: stock.price !== undefined ? parseFloat(stock.price) : 0
                }
              });
            }
          }
        }
      } else if (productType === 'SINGLE') {
        // Create default variant for SINGLE product
        const newVariant = await tx.productVariant.create({
          data: {
            productId: newProduct.id,
            variantName: 'Default',
            variantValue: 'Standard',
            sku: sku || `${newProduct.id}-DEFAULT`
          }
        });

        // Create stocks for each cabang if provided
        if (stocks && stocks.length > 0) {
          for (const stock of stocks) {
            await tx.stock.upsert({
              where: {
                productVariantId_cabangId: {
                  productVariantId: newVariant.id,
                  cabangId: stock.cabangId
                }
              },
              update: {
                quantity: stock.quantity !== undefined ? parseInt(stock.quantity) : 0,
                price: stock.price !== undefined ? parseFloat(stock.price) : 0
              },
              create: {
                productVariantId: newVariant.id,
                cabangId: stock.cabangId,
                quantity: stock.quantity !== undefined ? parseInt(stock.quantity) : 0,
                price: stock.price !== undefined ? parseFloat(stock.price) : 0
              }
            });
          }
        }
      }

      return tx.product.findUnique({
        where: { id: newProduct.id },
        include: {
          category: true,
          variants: true
        }
      });
    });

    // Emit WebSocket event
    emitProductCreated(product);

    res.status(201).json(product);
  } catch (error) {
    console.error('Create product error:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'SKU already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update product with variants (Owner/Manager only)
router.put('/:id', authMiddleware, ownerOrManager, async (req, res) => {
  try {
    const { name, description, categoryId, productType, isActive, variants } = req.body;

    const product = await prisma.$transaction(async (tx) => {
      // Update product basic info (force updatedAt to be updated for sync detection)
      const updatedProduct = await tx.product.update({
        where: { id: req.params.id },
        data: {
          name,
          description,
          categoryId,
          productType,
          isActive,
          updatedAt: new Date() // Force update timestamp for delta sync
        }
      });

      // Handle variants based on product type
      if (productType === 'SINGLE' && variants && variants.length > 0) {
        // For SINGLE products, update the default variant and its stocks
        const variant = variants[0]; // Should only have one variant
        if (variant.id) {
          // Update existing variant
          await tx.productVariant.update({
            where: { id: variant.id },
            data: {
              variantName: variant.variantName || 'Default',
              variantValue: variant.variantValue || 'Standard',
              sku: variant.sku
            }
          });

          // Update stocks for this variant
          if (variant.stocks && variant.stocks.length > 0) {
            for (const stock of variant.stocks) {
              await tx.stock.upsert({
                where: {
                  productVariantId_cabangId: {
                    productVariantId: variant.id,
                    cabangId: stock.cabangId
                  }
                },
                update: {
                  quantity: parseInt(stock.quantity) || 0,
                  price: stock.price !== undefined ? parseFloat(stock.price) : 0
                },
                create: {
                  productVariantId: variant.id,
                  cabangId: stock.cabangId,
                  quantity: parseInt(stock.quantity) || 0,
                  price: stock.price !== undefined ? parseFloat(stock.price) : 0
                }
              });
            }
          }
        }
      } else if (productType === 'VARIANT' && variants && variants.length > 0) {
        // Get existing variant IDs
        const existingVariants = await tx.productVariant.findMany({
          where: { productId: req.params.id },
          select: { id: true }
        });
        const existingIds = existingVariants.map(v => v.id);
        const providedIds = variants.filter(v => v.id).map(v => v.id);

        // Delete variants not in the provided list
        const idsToDelete = existingIds.filter(id => !providedIds.includes(id));
        if (idsToDelete.length > 0) {
          await tx.productVariant.deleteMany({
            where: { id: { in: idsToDelete } }
          });
        }

        // Update or create variants
        for (const variant of variants) {
          if (variant.id) {
            // Update existing variant
            await tx.productVariant.update({
              where: { id: variant.id },
              data: {
                variantName: variant.variantName,
                variantValue: variant.variantValue,
                sku: variant.sku
              }
            });

            // Update stocks for this variant
            if (variant.stocks && variant.stocks.length > 0) {
              for (const stock of variant.stocks) {
                await tx.stock.upsert({
                  where: {
                    productVariantId_cabangId: {
                      productVariantId: variant.id,
                      cabangId: stock.cabangId
                    }
                  },
                  update: {
                    quantity: parseInt(stock.quantity) || 0,
                    price: stock.price !== undefined ? parseFloat(stock.price) : 0
                  },
                  create: {
                    productVariantId: variant.id,
                    cabangId: stock.cabangId,
                    quantity: parseInt(stock.quantity) || 0,
                    price: stock.price !== undefined ? parseFloat(stock.price) : 0
                  }
                });
              }
            }
          } else {
            // Create new variant
            const newVariant = await tx.productVariant.create({
              data: {
                productId: updatedProduct.id,
                variantName: variant.variantName,
                variantValue: variant.variantValue,
                sku: variant.sku || `${updatedProduct.id}-${variant.variantValue}`
              }
            });

            // Create stocks for new variant
            if (variant.stocks && variant.stocks.length > 0) {
              for (const stock of variant.stocks) {
                await tx.stock.create({
                  data: {
                    productVariantId: newVariant.id,
                    cabangId: stock.cabangId,
                    quantity: parseInt(stock.quantity) || 0,
                    price: stock.price !== undefined ? parseFloat(stock.price) : 0
                  }
                });
              }
            }
          }
        }
      }

      // Return updated product with relations
      return tx.product.findUnique({
        where: { id: req.params.id },
        include: {
          category: true,
          variants: {
            include: {
              stocks: {
                include: {
                  cabang: true
                }
              }
            }
          }
        }
      });
    });

    // Emit WebSocket event
    emitProductUpdated(product);

    res.json(product);
  } catch (error) {
    console.error('Update product error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Product not found' });
    }
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'SKU already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete product (Owner only)
router.delete('/:id', authMiddleware, ownerOrManager, async (req, res) => {
  try {
    // Check if product exists
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: {
        variants: {
          include: {
            transactionItems: {
              take: 1 // Just need to know if any exist
            }
          }
        }
      }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check if any variant has been used in transactions
    const hasTransactions = product.variants.some(
      variant => variant.transactionItems.length > 0
    );

    if (hasTransactions) {
      // Soft delete - set as inactive instead
      const updatedProduct = await prisma.product.update({
        where: { id: req.params.id },
        data: { isActive: false }
      });

      // Emit WebSocket event for update (soft delete)
      emitProductUpdated(updatedProduct);

      return res.json({ 
        message: 'Product has transaction history. Product has been deactivated instead of deleted.',
        action: 'deactivated'
      });
    }

    // Safe to hard delete - no transaction history
    await prisma.product.delete({
      where: { id: req.params.id }
    });

    // Emit WebSocket event for delete
    emitProductDeleted(req.params.id);

    res.json({ 
      message: 'Product deleted successfully',
      action: 'deleted'
    });
  } catch (error) {
    console.error('Delete product error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get stock by variant and cabang
router.get('/stock/:variantId', authMiddleware, async (req, res) => {
  try {
    const { cabangId } = req.query;

    const where = { productVariantId: req.params.variantId };
    if (cabangId) where.cabangId = cabangId;

    const stocks = await prisma.stock.findMany({
      where,
      include: {
        cabang: true,
        productVariant: {
          include: {
            product: true
          }
        }
      }
    });

    res.json(stocks);
  } catch (error) {
    console.error('Get stock error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update stock (Owner/Manager only)
router.put('/stock/:variantId/:cabangId', authMiddleware, ownerOrManager, async (req, res) => {
  try {
    const { quantity, price, reason, notes } = req.body;
    const { variantId, cabangId } = req.params;

    // Get current stock to log adjustment
    const currentStock = await prisma.stock.findUnique({
      where: {
        productVariantId_cabangId: {
          productVariantId: variantId,
          cabangId: cabangId
        }
      }
    });

    const previousQty = currentStock?.quantity || 0;
    const newQty = parseInt(quantity);

    // Update stock with transaction to ensure consistency
    const result = await prisma.$transaction(async (tx) => {
      // Update or create stock
      const stock = await tx.stock.upsert({
        where: {
          productVariantId_cabangId: {
            productVariantId: variantId,
            cabangId: cabangId
          }
        },
        update: {
          quantity: quantity !== undefined ? newQty : undefined,
          price: price !== undefined ? parseFloat(price) : undefined
        },
        create: {
          productVariantId: variantId,
          cabangId: cabangId,
          quantity: newQty || 0,
          price: parseFloat(price) || 0
        },
        include: {
          cabang: true,
          productVariant: {
            include: {
              product: true
            }
          }
        }
      });

      // Log adjustment if quantity changed
      if (quantity !== undefined && previousQty !== newQty) {
        // Map reason string to enum
        const reasonMap = {
          'Stok opname': 'STOCK_OPNAME',
          'Barang rusak': 'DAMAGED',
          'Barang hilang': 'LOST',
          'Return supplier': 'SUPPLIER_RETURN',
          'Koreksi input': 'INPUT_ERROR',
          'Lainnya': 'OTHER'
        };

        await tx.stockAdjustment.create({
          data: {
            stockId: stock.id,
            productVariantId: variantId,
            cabangId: cabangId,
            adjustedById: req.user.userId,
            previousQty: previousQty,
            newQty: newQty,
            difference: newQty - previousQty,
            reason: reason ? reasonMap[reason] : null,
            notes: notes || null
          }
        });
        
        // Update product.updatedAt so delta sync picks up the change
        await tx.product.update({
          where: { id: stock.productVariant.productId },
          data: { updatedAt: new Date() }
        });
      }

      return stock;
    });

    // Emit WebSocket event for stock update
    emitStockUpdated({
      productVariantId: variantId,
      cabangId,
      quantity: newQty,
      previousQuantity: previousQty,
      operation: 'set'
    });

    res.json(result);
  } catch (error) {
    console.error('Update stock error:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      meta: error.meta
    });
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Get low stock alert
router.get('/alerts/low-stock', authMiddleware, async (req, res) => {
  try {
    const { cabangId } = req.query;

    // Get minStock from settings
    const minStockSetting = await prisma.settings.findUnique({
      where: { key: 'minStock' }
    });
    const minStock = parseInt(minStockSetting?.value) || 5;

    const where = {
      quantity: {
        lte: minStock
      }
    };
    
    if (cabangId) where.cabangId = cabangId;

    const lowStocks = await prisma.stock.findMany({
      where,
      include: {
        cabang: true,
        productVariant: {
          include: {
            product: {
              include: {
                category: true
              }
            }
          }
        }
      },
      orderBy: { quantity: 'asc' }
    });

    res.json(lowStocks);
  } catch (error) {
    console.error('Get low stock error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get stock adjustment history
router.get('/stock/:variantId/:cabangId/adjustments', authMiddleware, async (req, res) => {
  try {
    const { variantId, cabangId } = req.params;
    const { limit = 50 } = req.query;

    const adjustments = await prisma.stockAdjustment.findMany({
      where: {
        productVariantId: variantId,
        cabangId: cabangId
      },
      include: {
        adjustedBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        productVariant: {
          include: {
            product: true
          }
        },
        cabang: true
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit)
    });

    res.json(adjustments);
  } catch (error) {
    console.error('Get adjustments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all stock adjustments (for reports)
router.get('/adjustments/all', authMiddleware, ownerOrManager, async (req, res) => {
  try {
    const { cabangId, startDate, endDate, reason, limit = 100 } = req.query;

    const where = {};
    if (cabangId) where.cabangId = cabangId;
    if (reason) where.reason = reason;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const adjustments = await prisma.stockAdjustment.findMany({
      where,
      include: {
        adjustedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        },
        productVariant: {
          include: {
            product: {
              include: {
                category: true
              }
            }
          }
        },
        cabang: true
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit)
    });

    // Summary stats
    const stats = {
      totalAdjustments: adjustments.length,
      totalIncrease: adjustments
        .filter(a => a.difference > 0)
        .reduce((sum, a) => sum + a.difference, 0),
      totalDecrease: adjustments
        .filter(a => a.difference < 0)
        .reduce((sum, a) => sum + Math.abs(a.difference), 0),
      byReason: {}
    };

    adjustments.forEach(adj => {
      if (adj.reason) {
        stats.byReason[adj.reason] = (stats.byReason[adj.reason] || 0) + 1;
      }
    });

    res.json({
      data: adjustments,
      stats
    });
  } catch (error) {
    console.error('Get all adjustments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get product by barcode (uses SKU)
router.get('/barcode/:barcode', authMiddleware, async (req, res) => {
  try {
    const { barcode } = req.params;
    
    // Search by SKU (barcode scanner will scan SKU)
    const variant = await prisma.productVariant.findUnique({
      where: { sku: barcode },
      include: {
        product: {
          include: {
            category: true,
            variants: {
              include: {
                stocks: {
                  include: {
                    cabang: true
                  }
                }
              }
            }
          }
        },
        stocks: {
          include: {
            cabang: true
          }
        }
      }
    });
    
    if (!variant) {
      return res.status(404).json({ error: 'Produk tidak ditemukan' });
    }
    
    // Return full product with all variants (consistent with getProduct endpoint)
    res.json(variant.product);
  } catch (error) {
    console.error('Get product by barcode error:', error);
    res.status(500).json({ error: 'Gagal mencari produk' });
  }
});

// Search product by SKU - for Stock In feature
router.get('/search/sku/:sku', authMiddleware, async (req, res) => {
  try {
    const { sku } = req.params;
    
    // Search by SKU
    const variant = await prisma.productVariant.findUnique({
      where: { sku: sku.trim() },
      include: {
        product: {
          include: {
            category: true
          }
        },
        stocks: {
          include: {
            cabang: true
          }
        }
      }
    });
    
    if (!variant) {
      return res.status(404).json({ 
        success: false,
        error: 'SKU tidak ditemukan' 
      });
    }
    
    // Return product and variant info in structured format
    res.json({
      success: true,
      data: {
        product: {
          id: variant.product.id,
          name: variant.product.name,
          description: variant.product.description,
          category: variant.product.category,
          productType: variant.product.productType
        },
        variant: {
          id: variant.id,
          sku: variant.sku,
          variantType: variant.variantName,
          value: variant.variantValue,
          stocks: variant.stocks
        }
      }
    });
  } catch (error) {
    console.error('Search SKU error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Gagal mencari SKU' 
    });
  }
});

// Import Products from Excel
router.post('/import', authMiddleware, ownerOrManager, upload.single('file'), async (req, res) => {
  const filePath = req.file?.path;
  
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File tidak ditemukan' });
    }

    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    
    if (!['.xlsx', '.xls'].includes(fileExtension)) {
      return res.status(400).json({ error: 'Format file tidak didukung. Gunakan Excel (.xlsx atau .xls)' });
    }

    // Parse Excel - read "Template Import" sheet
    const workbook = XLSX.readFile(filePath);
    
    // Try to find the template sheet (could be named differently)
    let sheetName = 'Template Import';
    if (!workbook.SheetNames.includes(sheetName)) {
      // Fallback to second sheet or first sheet
      sheetName = workbook.SheetNames[1] || workbook.SheetNames[0];
    }
    
    const worksheet = workbook.Sheets[sheetName];
    
    // Parse with header row at index 15 (row 16 in Excel, after instructions)
    // This skips the instruction rows (1-15) and uses row 16 as header
    const products = XLSX.utils.sheet_to_json(worksheet, { 
      range: 15, // Start from row 16 (0-indexed = 15)
      defval: '' // Default empty string for empty cells
    });

    if (products.length === 0) {
      return res.status(400).json({ error: 'File kosong atau format tidak valid. Pastikan Sheet "Template Import" berisi data mulai dari baris 17 (setelah header di baris 16).' });
    }

    // Get all categories and cabangs
    const categories = await prisma.category.findMany();
    const cabangs = await prisma.cabang.findMany();

    const errors = [];
    const success = [];
    const productsToCreate = new Map(); // Group by product name

    // Group products by name (for variants)
    for (let i = 0; i < products.length; i++) {
      const row = products[i];
      const rowNum = i + 2; // Excel row number (1 = header)

      try {
        // Validate required fields
        const sku = row['SKU']?.toString().trim();
        const productName = row['Nama Produk']?.toString().trim();
        const categoryId = row['ID Kategori']?.toString().trim();
        const productType = row['Tipe Produk']?.toString().toUpperCase().trim();
        const price = parseInt(row['Harga']);
        const stock = parseInt(row['Stok']);
        const cabangId = row['ID Cabang']?.toString().trim();

        if (!sku || !productName || !categoryId || !productType || isNaN(price) || isNaN(stock) || !cabangId) {
          errors.push({ row: rowNum, error: 'Data tidak lengkap. Pastikan SKU, Nama Produk, ID Kategori, Tipe Produk, Harga, Stok, dan ID Cabang diisi' });
          continue;
        }

        if (!['SINGLE', 'VARIANT'].includes(productType)) {
          errors.push({ row: rowNum, error: 'Tipe Produk harus SINGLE atau VARIANT' });
          continue;
        }

        // Check if category exists by ID
        const category = categories.find(c => c.id === categoryId);
        if (!category) {
          errors.push({ row: rowNum, error: `ID Kategori "${categoryId}" tidak ditemukan. Gunakan ID dari sheet Kategori` });
          continue;
        }

        // Check if cabang exists by ID
        const cabang = cabangs.find(c => c.id === cabangId);
        if (!cabang) {
          errors.push({ row: rowNum, error: `ID Cabang "${cabangId}" tidak ditemukan. Gunakan ID dari sheet Cabang` });
          continue;
        }

        // Check if SKU already exists
        const existingSku = await prisma.productVariant.findUnique({
          where: { sku }
        });
        if (existingSku) {
          errors.push({ row: rowNum, error: `SKU "${sku}" sudah terdaftar` });
          continue;
        }

        // Prepare product data
        const productKey = productName.toLowerCase();
        if (!productsToCreate.has(productKey)) {
          productsToCreate.set(productKey, {
            name: productName,
            description: row['Deskripsi']?.toString().trim() || '',
            categoryId: category.id,
            productType,
            isActive: true,
            variants: []
          });
        }

        const productData = productsToCreate.get(productKey);

        // Validate product type consistency
        if (productData.productType !== productType) {
          errors.push({ row: rowNum, error: `Produk "${productName}" memiliki tipe yang berbeda dalam file` });
          continue;
        }

        // Add variant
        const variantData = {
          sku,
          variantName: productType === 'VARIANT' ? (row['Nama Varian']?.toString().trim() || 'Default') : 'Default',
          variantValue: productType === 'VARIANT' ? (row['Nilai Varian']?.toString().trim() || 'Default') : 'Default',
          stocks: [
            {
              cabangId: cabang.id,
              quantity: stock,
              price: price
            }
          ]
        };

        productData.variants.push(variantData);

      } catch (error) {
        errors.push({ row: rowNum, error: error.message });
      }
    }

    // Create products in database
    for (const [productKey, productData] of productsToCreate) {
      try {
        const product = await prisma.product.create({
          data: {
            name: productData.name,
            description: productData.description,
            categoryId: productData.categoryId,
            productType: productData.productType,
            isActive: productData.isActive,
            variants: {
              create: productData.variants.map(v => ({
                sku: v.sku,
                variantName: v.variantName,
                variantValue: v.variantValue,
                stocks: {
                  create: v.stocks
                }
              }))
            }
          },
          include: {
            variants: {
              include: {
                stocks: true
              }
            }
          }
        });

        success.push({
          product: product.name,
          variants: product.variants.length,
          message: `Berhasil import produk dengan ${product.variants.length} varian`
        });

        // Emit WebSocket event
        emitProductCreated(product);

      } catch (error) {
        errors.push({ 
          product: productData.name, 
          error: error.message || 'Gagal membuat produk' 
        });
      }
    }

    // Clean up uploaded file
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({
      success: success.length > 0,
      imported: success.length,
      failed: errors.length,
      details: {
        success,
        errors
      }
    });

  } catch (error) {
    console.error('Import error:', error);
    
    // Clean up uploaded file on error
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    res.status(500).json({ error: 'Gagal import produk: ' + error.message });
  }
});

module.exports = router;

 
