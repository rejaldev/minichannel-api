import { Hono } from 'hono';
import prisma from '../lib/prisma';
import { authMiddleware, ownerOrManager, type AuthUser } from '../middleware/auth';
import { emitProductCreated, emitProductUpdated, emitProductDeleted, emitCategoryUpdated, emitStockUpdated } from '../lib/socket';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

type Variables = {
  user: AuthUser;
};

interface StockData {
  cabangId: string;
  quantity?: number;
  price?: number;
}

interface VariantData {
  id?: string;
  sku?: string;
  variantName: string;
  variantValue: string;
  weight?: number | null;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  imageUrl?: string | null;
  stocks?: StockData[];
}

interface ProductBody {
  name: string;
  description?: string;
  categoryId: string;
  productType: string;
  sku?: string;
  variants?: VariantData[];
  stocks?: StockData[];
  weight?: number | null;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  imageUrl?: string | null;
  isActive?: boolean;
}

const products = new Hono<{ Variables: Variables }>();

// Get all categories
products.get('/categories', authMiddleware, async (c) => {
  try {
    const categories = await prisma.category.findMany({
      include: {
        _count: {
          select: { 
            products: {
              where: { isActive: true }
            }
          }
        }
      }
    });
    return c.json(categories);
  } catch (error) {
    console.error('Get categories error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Create category (Owner/Manager only)
products.post('/categories', authMiddleware, ownerOrManager, async (c) => {
  try {
    const body = await c.req.json();
    const { name, description } = body as { name: string; description?: string };

    if (!name) {
      return c.json({ error: 'Category name is required' }, 400);
    }

    const category = await prisma.category.create({
      data: { name, description }
    });

    emitCategoryUpdated(category);
    return c.json(category, 201);
  } catch (error: any) {
    console.error('Create category error:', error);
    if (error.code === 'P2002') {
      return c.json({ error: 'Category name already exists' }, 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Update category (Owner/Manager only)
products.put('/categories/:id', authMiddleware, ownerOrManager, async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { name, description } = body as { name: string; description?: string };

    if (!name) {
      return c.json({ error: 'Category name is required' }, 400);
    }

    const category = await prisma.category.update({
      where: { id },
      data: { name, description }
    });

    emitCategoryUpdated(category);
    return c.json(category);
  } catch (error: any) {
    console.error('Update category error:', error);
    if (error.code === 'P2002') {
      return c.json({ error: 'Category name already exists' }, 400);
    }
    if (error.code === 'P2025') {
      return c.json({ error: 'Category not found' }, 404);
    }
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Delete category (Owner/Manager only)
products.delete('/categories/:id', authMiddleware, ownerOrManager, async (c) => {
  try {
    const id = c.req.param('id');
    
    const categoryProducts = await prisma.product.findMany({
      where: { categoryId: id },
      include: { variants: true }
    });

    if (categoryProducts.length > 0) {
      const variantIds = categoryProducts.flatMap(p => p.variants.map(v => v.id));

      if (variantIds.length > 0) {
        await prisma.stockAdjustment.deleteMany({
          where: { productVariantId: { in: variantIds } }
        });

        await prisma.productVariant.deleteMany({
          where: { id: { in: variantIds } }
        });
      }

      await prisma.product.deleteMany({
        where: { categoryId: id }
      });
    }

    await prisma.category.delete({
      where: { id }
    });

    return c.json({ 
      message: 'Category deleted successfully',
      productsDeleted: categoryProducts.length
    });
  } catch (error: any) {
    console.error('Delete category error:', error);
    if (error.code === 'P2025') {
      return c.json({ error: 'Category not found' }, 404);
    }
    if (error.code === 'P2003') {
      return c.json({ error: 'Cannot delete category. It still has products.' }, 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get all products with filters
products.get('/', authMiddleware, async (c) => {
  try {
    const categoryId = c.req.query('categoryId');
    const search = c.req.query('search');
    const isActive = c.req.query('isActive');

    const where: any = {};
    if (categoryId) where.categoryId = categoryId;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    // Build search conditions
    if (search) {
      const searchTerm = search.trim();
      const keywords = searchTerm.split(/\s+/).filter(k => k.length > 0);
      
      const searchConditions: any[] = [];
      
      searchConditions.push({ name: { contains: searchTerm, mode: 'insensitive' } });
      keywords.forEach(keyword => {
        searchConditions.push({ name: { contains: keyword, mode: 'insensitive' } });
      });
      
      searchConditions.push({ description: { contains: searchTerm, mode: 'insensitive' } });
      searchConditions.push({ 
        category: { name: { contains: searchTerm, mode: 'insensitive' } }
      });
      searchConditions.push({ 
        variants: { some: { sku: { contains: searchTerm, mode: 'insensitive' } } }
      });
      searchConditions.push({ 
        variants: { some: { variantValue: { contains: searchTerm, mode: 'insensitive' } } }
      });
      
      where.OR = searchConditions;
    }

    let productList = await prisma.product.findMany({
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
      }
    });

    // Sort by name if no search
    if (!search) {
      productList.sort((a, b) => a.name.localeCompare(b.name));
    }

    return c.json(productList);
  } catch (error) {
    console.error('Get products error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Download Template
products.get('/template', authMiddleware, async (c) => {
  try {
    const categories = await prisma.category.findMany({ orderBy: { name: 'asc' } });
    const cabangs = await prisma.cabang.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
    
    if (categories.length === 0 || cabangs.length === 0) {
      return c.json({ 
        error: 'Tidak ada kategori atau cabang. Buat kategori dan cabang terlebih dahulu.' 
      }, 400);
    }

    const workbook = XLSX.utils.book_new();

    // Sheet 1: Data
    const refData: any[] = [];
    refData.push(['KATEGORI', 'CABANG', 'TIPE_PRODUK']);
    const maxRows = Math.max(categories.length, cabangs.length, 2);
    for (let i = 0; i < maxRows; i++) {
      refData.push([
        categories[i]?.name || '',
        cabangs[i]?.name || '',
        i === 0 ? 'SINGLE' : (i === 1 ? 'VARIANT' : '')
      ]);
    }
    const refSheet = XLSX.utils.aoa_to_sheet(refData);
    XLSX.utils.book_append_sheet(workbook, refSheet, 'Data');

    // Sheet 2: Panduan
    const infoData: any[] = [];
    infoData.push(['📋 PANDUAN IMPORT PRODUK']);
    infoData.push([]);
    infoData.push(['LANGKAH-LANGKAH:']);
    infoData.push(['1. Pindah ke Sheet "Template Import"']);
    infoData.push(['2. Gunakan DROPDOWN untuk pilih Kategori, Cabang, dan Tipe Produk']);
    infoData.push(['3. Isi data produk sesuai contoh']);
    infoData.push(['4. Simpan file dan upload ke sistem']);
    infoData.push([]);
    infoData.push(['REFERENSI KATEGORI:']);
    categories.forEach(cat => {
      infoData.push([cat.name, cat.description || '-']);
    });
    infoData.push([]);
    infoData.push(['REFERENSI CABANG:']);
    cabangs.forEach(cabang => {
      infoData.push([cabang.name, cabang.address || '-']);
    });
    const infoSheet = XLSX.utils.aoa_to_sheet(infoData);
    XLSX.utils.book_append_sheet(workbook, infoSheet, 'Panduan');

    // Sheet 3: Template Import
    const templateData: any[] = [];
    templateData.push([
      'INFO PRODUK', '', '', '', '',
      'VARIANT ATTRIBUTES', '', '', '', '', '',
      'PRICING & STOCK', '', '',
      'SPESIFIKASI MARKETPLACE', '', '', '', ''
    ]);
    templateData.push([
      'SKU*', 'Nama Produk*', 'Deskripsi', 'Kategori*', 'Tipe Produk*',
      'Type 1', 'Value 1', 'Type 2', 'Value 2', 'Type 3', 'Value 3',
      'Harga*', 'Stok*', 'Cabang*',
      'Berat (g)', 'Panjang (cm)', 'Lebar (cm)', 'Tinggi (cm)', 'Link Gambar'
    ]);
    for (let i = 0; i < 100; i++) {
      templateData.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    }
    const templateSheet = XLSX.utils.aoa_to_sheet(templateData);
    templateSheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
      { s: { r: 0, c: 5 }, e: { r: 0, c: 10 } },
      { s: { r: 0, c: 11 }, e: { r: 0, c: 13 } },
      { s: { r: 0, c: 14 }, e: { r: 0, c: 18 } }
    ];
    XLSX.utils.book_append_sheet(workbook, templateSheet, 'Template Import');

    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return new Response(excelBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename=template-import-produk.xlsx'
      }
    });
  } catch (error) {
    console.error('Download template error:', error);
    return c.json({ error: 'Gagal mengunduh template' }, 500);
  }
});

// Export Products
products.get('/export', authMiddleware, async (c) => {
  try {
    const productList = await prisma.product.findMany({
      include: {
        category: true,
        variants: {
          include: {
            stocks: {
              include: { cabang: true }
            }
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    const exportData: any[] = [];
    productList.forEach(product => {
      product.variants.forEach(variant => {
        variant.stocks.forEach(stock => {
          const variantNames = variant.variantName?.split(' | ') || [];
          const variantValues = variant.variantValue?.split(' | ') || [];
          
          exportData.push([
            variant.sku || '',
            product.name,
            product.description || '',
            product.category?.name || '',
            product.productType,
            variantNames[0] || '',
            variantValues[0] || '',
            variantNames[1] || '',
            variantValues[1] || '',
            variantNames[2] || '',
            variantValues[2] || '',
            stock.price || 0,
            stock.quantity || 0,
            stock.cabang.name,
            variant.weight || '',
            variant.length || '',
            variant.width || '',
            variant.height || '',
            variant.imageUrl || ''
          ]);
        });
      });
    });

    if (exportData.length === 0) {
      return c.json({ error: 'Tidak ada data produk untuk diexport' }, 404);
    }

    const workbook = XLSX.utils.book_new();
    const header = [
      'SKU*', 'Nama Produk*', 'Deskripsi', 'Kategori*', 'Tipe Produk*',
      'Type 1', 'Value 1', 'Type 2', 'Value 2', 'Type 3', 'Value 3',
      'Harga*', 'Stok*', 'Cabang*',
      'Berat (g)', 'Panjang (cm)', 'Lebar (cm)', 'Tinggi (cm)', 'Link Gambar'
    ];
    const worksheetData = [header, ...exportData];
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template Import');
    
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return new Response(excelBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=export-produk-${Date.now()}.xlsx`
      }
    });
  } catch (error) {
    console.error('Export error:', error);
    return c.json({ error: 'Gagal export produk' }, 500);
  }
});

// Get product by barcode
products.get('/barcode/:barcode', authMiddleware, async (c) => {
  try {
    const barcode = c.req.param('barcode');
    
    const variant = await prisma.productVariant.findUnique({
      where: { sku: barcode },
      include: {
        product: {
          include: {
            category: true,
            variants: {
              include: {
                stocks: { include: { cabang: true } }
              }
            }
          }
        }
      }
    });
    
    if (!variant) {
      return c.json({ error: 'Produk tidak ditemukan' }, 404);
    }
    
    return c.json(variant.product);
  } catch (error) {
    console.error('Get product by barcode error:', error);
    return c.json({ error: 'Gagal mencari produk' }, 500);
  }
});

// Search by SKU
products.get('/search/sku/:sku', authMiddleware, async (c) => {
  try {
    const sku = c.req.param('sku');
    
    const variant = await prisma.productVariant.findUnique({
      where: { sku: sku.trim() },
      include: {
        product: { include: { category: true } },
        stocks: { include: { cabang: true } }
      }
    });
    
    if (!variant) {
      return c.json({ success: false, error: 'SKU tidak ditemukan' }, 404);
    }
    
    return c.json({
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
    return c.json({ success: false, error: 'Gagal mencari SKU' }, 500);
  }
});

// Get low stock alert
products.get('/alerts/low-stock', authMiddleware, async (c) => {
  try {
    const cabangId = c.req.query('cabangId');

    const minStockSetting = await prisma.settings.findUnique({
      where: { key: 'minStock' }
    });
    const minStock = parseInt(minStockSetting?.value || '5');

    const where: any = {
      quantity: { lte: minStock }
    };
    if (cabangId) where.cabangId = cabangId;

    const lowStocks = await prisma.stock.findMany({
      where,
      include: {
        cabang: true,
        productVariant: {
          include: {
            product: { include: { category: true } }
          }
        }
      },
      orderBy: { quantity: 'asc' }
    });

    return c.json(lowStocks);
  } catch (error) {
    console.error('Get low stock error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get all adjustments
products.get('/adjustments/all', authMiddleware, ownerOrManager, async (c) => {
  try {
    const cabangId = c.req.query('cabangId');
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');
    const reason = c.req.query('reason');
    const limit = parseInt(c.req.query('limit') || '100');

    const where: any = {};
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
        adjustedBy: { select: { id: true, name: true, email: true, role: true } },
        productVariant: {
          include: { product: { include: { category: true } } }
        },
        cabang: true
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    const stats = {
      totalAdjustments: adjustments.length,
      totalIncrease: adjustments.filter(a => a.difference > 0).reduce((sum, a) => sum + a.difference, 0),
      totalDecrease: adjustments.filter(a => a.difference < 0).reduce((sum, a) => sum + Math.abs(a.difference), 0),
      byReason: {} as Record<string, number>
    };

    adjustments.forEach(adj => {
      if (adj.reason) {
        stats.byReason[adj.reason] = (stats.byReason[adj.reason] || 0) + 1;
      }
    });

    return c.json({ data: adjustments, stats });
  } catch (error) {
    console.error('Get all adjustments error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get single product by ID
products.get('/:id', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        variants: {
          include: {
            stocks: { include: { cabang: true } }
          }
        }
      }
    });

    if (!product) {
      return c.json({ error: 'Product not found' }, 404);
    }

    return c.json(product);
  } catch (error) {
    console.error('Get product error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get stock by variant
products.get('/stock/:variantId', authMiddleware, async (c) => {
  try {
    const variantId = c.req.param('variantId');
    const cabangId = c.req.query('cabangId');

    const where: any = { productVariantId: variantId };
    if (cabangId) where.cabangId = cabangId;

    const stocks = await prisma.stock.findMany({
      where,
      include: {
        cabang: true,
        productVariant: { include: { product: true } }
      }
    });

    return c.json(stocks);
  } catch (error) {
    console.error('Get stock error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get stock adjustment history
products.get('/stock/:variantId/:cabangId/adjustments', authMiddleware, async (c) => {
  try {
    const variantId = c.req.param('variantId');
    const cabangId = c.req.param('cabangId');
    const limit = parseInt(c.req.query('limit') || '50');

    const adjustments = await prisma.stockAdjustment.findMany({
      where: { productVariantId: variantId, cabangId },
      include: {
        adjustedBy: { select: { id: true, name: true, email: true } },
        productVariant: { include: { product: true } },
        cabang: true
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return c.json(adjustments);
  } catch (error) {
    console.error('Get adjustments error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Create product (Owner/Manager only)
products.post('/', authMiddleware, ownerOrManager, async (c) => {
  try {
    const body = await c.req.json() as ProductBody;
    const { name, description, categoryId, productType, variants, sku, stocks } = body;

    if (!name || !categoryId || !productType) {
      return c.json({ error: 'Name, category, and product type are required' }, 400);
    }

    if (productType === 'SINGLE') {
      if (!sku) return c.json({ error: 'SKU is required for single product' }, 400);
      if (!stocks || stocks.length === 0) return c.json({ error: 'At least one cabang with price is required' }, 400);
    } else if (productType === 'VARIANT') {
      if (!variants || variants.length === 0) return c.json({ error: 'At least one variant is required for variant product' }, 400);
    }

    const product = await prisma.$transaction(async (tx) => {
      const newProduct = await tx.product.create({
        data: { name, description, categoryId, productType: productType as any }
      });

      if (productType === 'VARIANT' && variants && variants.length > 0) {
        for (const variant of variants) {
          const newVariant = await tx.productVariant.create({
            data: {
              productId: newProduct.id,
              variantName: variant.variantName,
              variantValue: variant.variantValue,
              sku: variant.sku || `${newProduct.id}-${variant.variantValue}`,
              weight: variant.weight || null,
              length: variant.length || null,
              width: variant.width || null,
              height: variant.height || null,
              imageUrl: variant.imageUrl || null
            }
          });

          if (variant.stocks && variant.stocks.length > 0) {
            for (const stock of variant.stocks) {
              await tx.stock.upsert({
                where: { productVariantId_cabangId: { productVariantId: newVariant.id, cabangId: stock.cabangId } },
                update: { quantity: parseInt(String(stock.quantity)) || 0, price: parseFloat(String(stock.price)) || 0 },
                create: { productVariantId: newVariant.id, cabangId: stock.cabangId, quantity: parseInt(String(stock.quantity)) || 0, price: parseFloat(String(stock.price)) || 0 }
              });
            }
          }
        }
      } else if (productType === 'SINGLE') {
        const newVariant = await tx.productVariant.create({
          data: {
            productId: newProduct.id,
            variantName: 'Default',
            variantValue: 'Standard',
            sku: sku || `${newProduct.id}-DEFAULT`,
            weight: body.weight || null,
            length: body.length || null,
            width: body.width || null,
            height: body.height || null,
            imageUrl: body.imageUrl || null
          }
        });

        if (stocks && stocks.length > 0) {
          for (const stock of stocks) {
            await tx.stock.upsert({
              where: { productVariantId_cabangId: { productVariantId: newVariant.id, cabangId: stock.cabangId } },
              update: { quantity: parseInt(String(stock.quantity)) || 0, price: parseFloat(String(stock.price)) || 0 },
              create: { productVariantId: newVariant.id, cabangId: stock.cabangId, quantity: parseInt(String(stock.quantity)) || 0, price: parseFloat(String(stock.price)) || 0 }
            });
          }
        }
      }

      return tx.product.findUnique({
        where: { id: newProduct.id },
        include: { category: true, variants: true }
      });
    });

    emitProductCreated(product);
    return c.json(product, 201);
  } catch (error: any) {
    console.error('Create product error:', error);
    if (error.code === 'P2002') return c.json({ error: 'SKU already exists' }, 400);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Update product (Owner/Manager only)
products.put('/:id', authMiddleware, ownerOrManager, async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json() as ProductBody;
    const { name, description, categoryId, productType, isActive, variants } = body;

    const product = await prisma.$transaction(async (tx) => {
      const updatedProduct = await tx.product.update({
        where: { id },
        data: { name, description, categoryId, productType: productType as any, isActive, updatedAt: new Date() }
      });

      if (productType === 'SINGLE' && variants && variants.length > 0) {
        const variant = variants[0];
        if (variant.id) {
          await tx.productVariant.update({
            where: { id: variant.id },
            data: {
              variantName: variant.variantName || 'Default',
              variantValue: variant.variantValue || 'Standard',
              sku: variant.sku,
              weight: variant.weight || null,
              length: variant.length || null,
              width: variant.width || null,
              height: variant.height || null,
              imageUrl: variant.imageUrl || null
            }
          });

          if (variant.stocks && variant.stocks.length > 0) {
            for (const stock of variant.stocks) {
              await tx.stock.upsert({
                where: { productVariantId_cabangId: { productVariantId: variant.id, cabangId: stock.cabangId } },
                update: { quantity: parseInt(String(stock.quantity)) || 0, price: stock.price !== undefined ? parseFloat(String(stock.price)) : 0 },
                create: { productVariantId: variant.id, cabangId: stock.cabangId, quantity: parseInt(String(stock.quantity)) || 0, price: stock.price !== undefined ? parseFloat(String(stock.price)) : 0 }
              });
            }
          }
        }
      } else if (productType === 'VARIANT' && variants && variants.length > 0) {
        const existingVariants = await tx.productVariant.findMany({
          where: { productId: id },
          select: { id: true }
        });
        const existingIds = existingVariants.map(v => v.id);
        const providedIds = variants.filter(v => v.id).map(v => v.id!);
        const idsToDelete = existingIds.filter(vid => !providedIds.includes(vid));
        
        if (idsToDelete.length > 0) {
          await tx.productVariant.deleteMany({ where: { id: { in: idsToDelete } } });
        }

        for (const variant of variants) {
          if (variant.id) {
            await tx.productVariant.update({
              where: { id: variant.id },
              data: {
                variantName: variant.variantName,
                variantValue: variant.variantValue,
                sku: variant.sku,
                weight: variant.weight || null,
                length: variant.length || null,
                width: variant.width || null,
                height: variant.height || null,
                imageUrl: variant.imageUrl || null
              }
            });

            if (variant.stocks && variant.stocks.length > 0) {
              for (const stock of variant.stocks) {
                await tx.stock.upsert({
                  where: { productVariantId_cabangId: { productVariantId: variant.id, cabangId: stock.cabangId } },
                  update: { quantity: parseInt(String(stock.quantity)) || 0, price: stock.price !== undefined ? parseFloat(String(stock.price)) : 0 },
                  create: { productVariantId: variant.id, cabangId: stock.cabangId, quantity: parseInt(String(stock.quantity)) || 0, price: stock.price !== undefined ? parseFloat(String(stock.price)) : 0 }
                });
              }
            }
          } else {
            const newVariant = await tx.productVariant.create({
              data: {
                productId: updatedProduct.id,
                variantName: variant.variantName,
                variantValue: variant.variantValue,
                sku: variant.sku || `${updatedProduct.id}-${variant.variantValue}`,
                weight: variant.weight || null,
                length: variant.length || null,
                width: variant.width || null,
                height: variant.height || null,
                imageUrl: variant.imageUrl || null
              }
            });

            if (variant.stocks && variant.stocks.length > 0) {
              for (const stock of variant.stocks) {
                await tx.stock.create({
                  data: {
                    productVariantId: newVariant.id,
                    cabangId: stock.cabangId,
                    quantity: parseInt(String(stock.quantity)) || 0,
                    price: stock.price !== undefined ? parseFloat(String(stock.price)) : 0
                  }
                });
              }
            }
          }
        }
      }

      return tx.product.findUnique({
        where: { id },
        include: {
          category: true,
          variants: { include: { stocks: { include: { cabang: true } } } }
        }
      });
    });

    emitProductUpdated(product);
    return c.json(product);
  } catch (error: any) {
    console.error('Update product error:', error);
    if (error.code === 'P2025') return c.json({ error: 'Product not found' }, 404);
    if (error.code === 'P2002') return c.json({ error: 'SKU already exists' }, 400);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Delete product (Owner/Manager only)
products.delete('/:id', authMiddleware, ownerOrManager, async (c) => {
  try {
    const id = c.req.param('id');
    
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        variants: {
          include: { transactionItems: { take: 1 } }
        }
      }
    });

    if (!product) {
      return c.json({ error: 'Product not found' }, 404);
    }

    const hasTransactions = product.variants.some(v => v.transactionItems.length > 0);

    if (hasTransactions) {
      const updatedProduct = await prisma.product.update({
        where: { id },
        data: { isActive: false }
      });

      emitProductUpdated(updatedProduct);
      return c.json({ 
        message: 'Product has transaction history. Product has been deactivated instead of deleted.',
        action: 'deactivated'
      });
    }

    await prisma.product.delete({ where: { id } });
    emitProductDeleted(id);

    return c.json({ message: 'Product deleted successfully', action: 'deleted' });
  } catch (error: any) {
    console.error('Delete product error:', error);
    if (error.code === 'P2025') return c.json({ error: 'Product not found' }, 404);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Update stock
products.put('/stock/:variantId/:cabangId', authMiddleware, ownerOrManager, async (c) => {
  try {
    const user = c.get('user');
    const variantId = c.req.param('variantId');
    const cabangId = c.req.param('cabangId');
    const body = await c.req.json();
    const { quantity, price, reason, notes } = body as { quantity?: number; price?: number; reason?: string; notes?: string };

    const currentStock = await prisma.stock.findUnique({
      where: { productVariantId_cabangId: { productVariantId: variantId, cabangId } }
    });

    const previousQty = currentStock?.quantity || 0;
    const newQty = quantity !== undefined ? parseInt(String(quantity)) : previousQty;

    const result = await prisma.$transaction(async (tx) => {
      const stock = await tx.stock.upsert({
        where: { productVariantId_cabangId: { productVariantId: variantId, cabangId } },
        update: {
          quantity: quantity !== undefined ? newQty : undefined,
          price: price !== undefined ? parseFloat(String(price)) : undefined
        },
        create: {
          productVariantId: variantId,
          cabangId,
          quantity: newQty || 0,
          price: parseFloat(String(price)) || 0
        },
        include: {
          cabang: true,
          productVariant: { include: { product: true } }
        }
      });

      if (quantity !== undefined && previousQty !== newQty) {
        const reasonMap: Record<string, string> = {
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
            cabangId,
            adjustedById: user.userId,
            previousQty,
            newQty,
            difference: newQty - previousQty,
            reason: reason ? (reasonMap[reason] as any) : null,
            notes: notes || null
          }
        });
        
        await tx.product.update({
          where: { id: stock.productVariant.productId },
          data: { updatedAt: new Date() }
        });
      }

      return stock;
    });

    emitStockUpdated({
      productVariantId: variantId,
      cabangId,
      quantity: newQty,
      previousQuantity: previousQty,
      operation: 'set'
    });

    return c.json(result);
  } catch (error: any) {
    console.error('Update stock error:', error);
    return c.json({ error: 'Internal server error', message: error.message }, 500);
  }
});

// Import Products from Excel - simplified version without file upload
// Note: Hono file uploads need different handling (body parsing)
products.post('/import', authMiddleware, ownerOrManager, async (c) => {
  try {
    // For now, return a message that import needs frontend multipart handling
    // Full implementation would use c.req.parseBody() for file uploads
    return c.json({ 
      error: 'Import endpoint needs multipart form-data. Use frontend to handle file upload.',
      note: 'Consider using @hono/node-server with multer middleware for file uploads'
    }, 501);
  } catch (error: any) {
    console.error('Import error:', error);
    return c.json({ error: 'Gagal import produk: ' + error.message }, 500);
  }
});

export default products;
