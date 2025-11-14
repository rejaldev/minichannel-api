const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware, ownerOrManager } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

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
        { description: { contains: search, mode: 'insensitive' } }
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
    const { name, description, categoryId, productType, price, variants } = req.body;

    if (!name || !categoryId || !productType) {
      return res.status(400).json({ error: 'Name, category, and product type are required' });
    }

    // Validation based on product type
    if (productType === 'SINGLE') {
      if (!price && price !== 0) {
        return res.status(400).json({ error: 'Price is required for single product' });
      }
    } else if (productType === 'VARIANT') {
      if (!variants || variants.length === 0) {
        return res.status(400).json({ error: 'At least one variant is required for variant product' });
      }
      // Validate all variants have price
      for (const variant of variants) {
        if (!variant.price && variant.price !== 0) {
          return res.status(400).json({ error: 'All variants must have a price' });
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
          productType,
          price: productType === 'SINGLE' ? parseFloat(price) : null
        }
      });

      // Create variants if product type is VARIANT
      if (productType === 'VARIANT' && variants && variants.length > 0) {
        for (const variant of variants) {
          await tx.productVariant.create({
            data: {
              productId: newProduct.id,
              variantName: variant.variantName,
              variantValue: variant.variantValue,
              sku: variant.sku || `${newProduct.id}-${variant.variantValue}`,
              price: parseFloat(variant.price)
            }
          });
        }
      } else if (productType === 'SINGLE') {
        // Create default variant for SINGLE product
        await tx.productVariant.create({
          data: {
            productId: newProduct.id,
            variantName: 'Default',
            variantValue: 'Standard',
            sku: `${newProduct.id}-DEFAULT`,
            price: parseFloat(price)
          }
        });
      }

      return tx.product.findUnique({
        where: { id: newProduct.id },
        include: {
          category: true,
          variants: true
        }
      });
    });

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
    const { name, description, categoryId, productType, price, isActive, variants } = req.body;

    const product = await prisma.$transaction(async (tx) => {
      // Update product basic info
      const updatedProduct = await tx.product.update({
        where: { id: req.params.id },
        data: {
          name,
          description,
          categoryId,
          productType,
          price: productType === 'SINGLE' ? (price ? parseFloat(price) : undefined) : null,
          isActive
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
              sku: variant.sku,
              price: price ? parseFloat(price) : parseFloat(variant.price) // Use product price
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
                  minStock: parseInt(stock.minStock) || 5
                },
                create: {
                  productVariantId: variant.id,
                  cabangId: stock.cabangId,
                  quantity: parseInt(stock.quantity) || 0,
                  minStock: parseInt(stock.minStock) || 5
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
            // Update existing variant (including price)
            await tx.productVariant.update({
              where: { id: variant.id },
              data: {
                variantName: variant.variantName,
                variantValue: variant.variantValue,
                sku: variant.sku,
                price: variant.price !== undefined ? parseFloat(variant.price) : undefined
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
                    minStock: parseInt(stock.minStock) || 5
                  },
                  create: {
                    productVariantId: variant.id,
                    cabangId: stock.cabangId,
                    quantity: parseInt(stock.quantity) || 0,
                    minStock: parseInt(stock.minStock) || 5
                  }
                });
              }
            }
          } else {
            // Create new variant (with price)
            const newVariant = await tx.productVariant.create({
              data: {
                productId: updatedProduct.id,
                variantName: variant.variantName,
                variantValue: variant.variantValue,
                sku: variant.sku || `${updatedProduct.id}-${variant.variantValue}`,
                price: parseFloat(variant.price)
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
                    minStock: parseInt(stock.minStock) || 5
                  }
                });
              }
            }
          }
        }
      } else if (productType === 'SINGLE') {
        // For SINGLE product, ensure there's a default variant with same price
        const existingVariant = await tx.productVariant.findFirst({
          where: { productId: req.params.id }
        });
        
        if (existingVariant) {
          await tx.productVariant.update({
            where: { id: existingVariant.id },
            data: { price: parseFloat(price) }
          });
        } else {
          await tx.productVariant.create({
            data: {
              productId: updatedProduct.id,
              variantName: 'Default',
              variantValue: 'Standard',
              sku: `${updatedProduct.id}-DEFAULT`,
              price: parseFloat(price)
            }
          });
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
    await prisma.product.delete({
      where: { id: req.params.id }
    });

    res.json({ message: 'Product deleted successfully' });
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
    const { quantity, minStock } = req.body;
    const { variantId, cabangId } = req.params;

    const stock = await prisma.stock.upsert({
      where: {
        productVariantId_cabangId: {
          productVariantId: variantId,
          cabangId: cabangId
        }
      },
      update: {
        quantity: quantity !== undefined ? parseInt(quantity) : undefined,
        minStock: minStock !== undefined ? parseInt(minStock) : undefined
      },
      create: {
        productVariantId: variantId,
        cabangId: cabangId,
        quantity: parseInt(quantity) || 0,
        minStock: parseInt(minStock) || 5
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

    res.json(stock);
  } catch (error) {
    console.error('Update stock error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get low stock alert
router.get('/alerts/low-stock', authMiddleware, async (req, res) => {
  try {
    const { cabangId } = req.query;

    const where = {
      quantity: {
        lte: prisma.stock.fields.minStock
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


// Get product by barcode (uses SKU)
router.get('/barcode/:barcode', async (req, res) => {
  try {
    const { barcode } = req.params;
    
    // Search by SKU (barcode scanner will scan SKU)
    const variant = await prisma.productVariant.findUnique({
      where: { sku: barcode },
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
      return res.status(404).json({ error: 'Produk tidak ditemukan' });
    }
    
    res.json({ 
      success: true,
      data: {
        id: variant.product.id,
        name: variant.product.name,
        description: variant.product.description,
        category: variant.product.category,
        variant: {
          id: variant.id,
          sku: variant.sku,
          size: variant.size,
          color: variant.color,
          material: variant.material,
          price: variant.price
        },
        stocks: variant.stocks
      }
    });
  } catch (error) {
    console.error('Get product by barcode error:', error);
    res.status(500).json({ error: 'Gagal mencari produk' });
  }
});
    
    if (!variant) {
      return res.status(404).json({ error: 'Produk tidak ditemukan' });
    }
    
    res.json({ 
      success: true,
      data: {
        id: variant.product.id,
        name: variant.product.name,
        description: variant.product.description,
        category: variant.product.category,
        variant: {
          id: variant.id,
          sku: variant.sku,
          barcode: variant.barcode,
          size: variant.size,
          color: variant.color,
          material: variant.material,
          price: variant.price
        },
        stocks: variant.stocks
      }
    });
  } catch (error) {
    console.error('Get product by barcode error:', error);
    res.status(500).json({ error: 'Gagal mencari produk' });
  }
});

module.exports = router;

 
