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
          select: { 
            products: {
              where: { isActive: true } // Only count active products
            }
          }
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

// Update category (Owner/Manager only)
router.put('/categories/:id', authMiddleware, ownerOrManager, async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const category = await prisma.category.update({
      where: { id: req.params.id },
      data: { name, description }
    });

    // Emit WebSocket event
    emitCategoryUpdated(category);

    res.json(category);
  } catch (error) {
    console.error('Update category error:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Category name already exists' });
    }
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete category (Owner/Manager only)
router.delete('/categories/:id', authMiddleware, ownerOrManager, async (req, res) => {
  try {
    // Get all products in this category with their variants
    const products = await prisma.product.findMany({
      where: { categoryId: req.params.id },
      include: { variants: true }
    });

    if (products.length > 0) {
      // Get all variant IDs
      const variantIds = products.flatMap(p => p.variants.map(v => v.id));

      // Delete cascade: StockAdjustments -> Variants -> Products -> Category
      if (variantIds.length > 0) {
        // 1. Delete stock adjustments first
        await prisma.stockAdjustment.deleteMany({
          where: { productVariantId: { in: variantIds } }
        });

        // 2. Delete variants (will cascade delete stocks, transaction items, etc)
        await prisma.productVariant.deleteMany({
          where: { id: { in: variantIds } }
        });
      }

      // 3. Delete products
      await prisma.product.deleteMany({
        where: { categoryId: req.params.id }
      });
    }

    // 4. Now safe to delete category
    await prisma.category.delete({
      where: { id: req.params.id }
    });

    res.json({ 
      message: 'Category deleted successfully',
      productsDeleted: products.length
    });
  } catch (error) {
    console.error('Delete category error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Category not found' });
    }
    if (error.code === 'P2003') {
      return res.status(400).json({ error: 'Cannot delete category. It still has products.' });
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
    
    // Enhanced search with multiple keywords support
    if (search) {
      const searchTerm = search.trim();
      
      // Split by spaces for multi-keyword search
      const keywords = searchTerm.split(/\s+/).filter(k => k.length > 0);
      
      // Build OR conditions for each search field
      const searchConditions = [];
      
      // 1. Search by product name (full term and individual keywords)
      searchConditions.push({ name: { contains: searchTerm, mode: 'insensitive' } });
      keywords.forEach(keyword => {
        searchConditions.push({ name: { contains: keyword, mode: 'insensitive' } });
      });
      
      // 2. Search by product description (full term and individual keywords)
      searchConditions.push({ description: { contains: searchTerm, mode: 'insensitive' } });
      keywords.forEach(keyword => {
        searchConditions.push({ description: { contains: keyword, mode: 'insensitive' } });
      });
      
      // 3. Search by category name
      searchConditions.push({ 
        category: {
          name: { contains: searchTerm, mode: 'insensitive' }
        }
      });
      
      // 4. Search by variant SKU (exact and partial)
      searchConditions.push({ 
        variants: {
          some: {
            sku: { contains: searchTerm, mode: 'insensitive' }
          }
        }
      });
      
      // 5. Search by variant value (e.g., "Merah", "25", "XL")
      searchConditions.push({ 
        variants: {
          some: {
            variantValue: { contains: searchTerm, mode: 'insensitive' }
          }
        }
      });
      keywords.forEach(keyword => {
        searchConditions.push({ 
          variants: {
            some: {
              variantValue: { contains: keyword, mode: 'insensitive' }
            }
          }
        });
      });
      
      // 6. Search by variant name (e.g., "Warna", "Ukuran")
      searchConditions.push({ 
        variants: {
          some: {
            variantName: { contains: searchTerm, mode: 'insensitive' }
          }
        }
      });
      
      where.OR = searchConditions;
    }
    
    if (isActive !== undefined) where.isActive = isActive === 'true';

    let products = await prisma.product.findMany({
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

    // Enhanced relevance scoring for better search results
    if (search && products.length > 0) {
      const searchLower = search.toLowerCase().trim();
      const keywords = searchLower.split(/\s+/).filter(k => k.length > 0);
      
      // Extract numbers from search for better variant matching
      const numberKeywords = keywords.filter(k => /^\d+$/.test(k));
      const textKeywords = keywords.filter(k => !/^\d+$/.test(k));
      
      products = products.map(product => {
        let score = 0;
        const nameLower = product.name.toLowerCase();
        const descLower = (product.description || '').toLowerCase();
        const categoryLower = product.category.name.toLowerCase();
        
        // Exact match gets highest score
        if (nameLower === searchLower) score += 1000;
        if (descLower === searchLower) score += 500;
        
        // Starts with gets high score
        if (nameLower.startsWith(searchLower)) score += 500;
        if (descLower.startsWith(searchLower)) score += 250;
        
        // Contains full search term
        if (nameLower.includes(searchLower)) score += 100;
        if (descLower.includes(searchLower)) score += 50;
        if (categoryLower.includes(searchLower)) score += 30;
        
        // Text keyword matches (non-numbers)
        textKeywords.forEach(keyword => {
          if (nameLower.includes(keyword)) score += 20;
          if (descLower.includes(keyword)) score += 10;
        });
        
        // Check if product has variants matching the search
        let hasExactVariantMatch = false;
        let bestVariantScore = 0;
        
        product.variants?.forEach(variant => {
          let variantScore = 0;
          const skuLower = (variant.sku || '').toLowerCase();
          const variantValueLower = (variant.variantValue || '').toLowerCase();
          const variantNameLower = (variant.variantName || '').toLowerCase();
          
          // SKU exact match is very important
          if (skuLower === searchLower) {
            variantScore += 800;
            hasExactVariantMatch = true;
          }
          if (skuLower.startsWith(searchLower)) variantScore += 400;
          if (skuLower.includes(searchLower)) variantScore += 80;
          
          // Variant value exact match (very important for sizes/numbers)
          if (variantValueLower === searchLower) {
            variantScore += 600;
            hasExactVariantMatch = true;
          }
          
          // Number matching (e.g., "10", "8", "12" for sizes)
          numberKeywords.forEach(numKeyword => {
            // Exact number match in variant value (highest priority)
            if (variantValueLower === numKeyword) {
              variantScore += 500;
              hasExactVariantMatch = true;
            }
            // Number appears in variant value (e.g., "10-12 Tahun" contains "10")
            else if (variantValueLower.includes(numKeyword)) {
              variantScore += 200;
            }
            
            // Number in SKU
            if (skuLower.includes(numKeyword)) variantScore += 50;
          });
          
          // Text matching in variant value
          if (variantValueLower.includes(searchLower)) variantScore += 40;
          
          // Variant name match
          if (variantNameLower.includes(searchLower)) variantScore += 20;
          
          // Text keyword matches in variants
          textKeywords.forEach(keyword => {
            if (variantValueLower.includes(keyword)) variantScore += 15;
            if (skuLower.includes(keyword)) variantScore += 10;
            if (variantNameLower.includes(keyword)) variantScore += 8;
          });
          
          // Track best variant score
          if (variantScore > bestVariantScore) {
            bestVariantScore = variantScore;
          }
        });
        
        // Add best variant score to product score
        score += bestVariantScore;
        
        // Bonus: If searching with number + text (e.g., "Baju 10")
        // and product matches text keywords + has exact number variant
        if (numberKeywords.length > 0 && textKeywords.length > 0 && hasExactVariantMatch) {
          const textMatches = textKeywords.every(keyword => 
            nameLower.includes(keyword) || descLower.includes(keyword) || categoryLower.includes(keyword)
          );
          if (textMatches) {
            score += 300; // Bonus for combined text+number match
          }
        }
        
        return { ...product, _searchScore: score };
      });
      
      // Sort by relevance score (highest first), then by name
      products.sort((a, b) => {
        if (b._searchScore !== a._searchScore) {
          return b._searchScore - a._searchScore;
        }
        return a.name.localeCompare(b.name);
      });
      
      // Filter out low-relevance products (threshold-based filtering)
      // Only show products that have meaningful matches
      const maxScore = products.length > 0 ? products[0]._searchScore : 0;
      const minThreshold = 20; // Minimum score to be considered relevant (raised from 15)
      
      // Dynamic threshold: if top result has high score, be more selective
      let scoreThreshold = minThreshold;
      if (maxScore >= 500) {
        // Very strong match (exact or near-exact): only show products with at least 40% of top score
        scoreThreshold = Math.max(minThreshold, maxScore * 0.4);
      } else if (maxScore >= 200) {
        // Strong match: only show products with at least 30% of top score
        scoreThreshold = Math.max(minThreshold, maxScore * 0.3);
      } else if (maxScore >= 100) {
        // Medium matches: show products with at least 25% of top score
        scoreThreshold = Math.max(minThreshold, maxScore * 0.25);
      }
      
      products = products.filter(p => p._searchScore >= scoreThreshold);
      
      // Filter variants to show only relevant ones when searching
      // CRITICAL: If search has both text + number keywords (e.g., "Baju SD 7")
      // Product MUST match ALL text keywords AND have variants with the number
      const hasTextAndNumber = textKeywords.length > 0 && numberKeywords.length > 0;
      
      products = products.map(product => {
        const { _searchScore, ...productData } = product;
        
        // PRE-CHECK: If search has text keywords, check if product + variants match ALL keywords
        if (textKeywords.length > 0) {
          const productNameLower = productData.name.toLowerCase();
          const productDescLower = (productData.description || '').toLowerCase();
          const categoryNameLower = productData.category.name.toLowerCase();
          
          // Collect all variant texts
          const variantTexts = productData.variants?.map(v => 
            `${(v.variantName || '').toLowerCase()} ${(v.variantValue || '').toLowerCase()} ${(v.sku || '').toLowerCase()}`
          ).join(' ') || '';
          
          const combinedText = `${productNameLower} ${productDescLower} ${categoryNameLower} ${variantTexts}`;
          
          // Check if ALL text keywords are present in combined product + variant info
          const allTextMatch = textKeywords.every(keyword => 
            combinedText.includes(keyword)
          );
          
          // If not all text keywords match, skip this product entirely
          if (!allTextMatch) {
            productData.variants = []; // Mark for removal
            return productData;
          }
        }
        
        // If product has variants, filter to show only matching ones
        if (productData.variants && productData.variants.length > 0) {
          const scoredVariants = productData.variants.map(variant => {
            let variantScore = 0;
            const skuLower = (variant.sku || '').toLowerCase();
            const variantValueLower = (variant.variantValue || '').toLowerCase();
            const variantNameLower = (variant.variantName || '').toLowerCase();
            const variantCombined = `${variantValueLower} ${variantNameLower} ${skuLower}`;
            
            // Number matching - STRICT for specific numbers with word boundaries
            let hasNumberMatch = false;
            if (numberKeywords.length > 0) {
              numberKeywords.forEach(numKeyword => {
                const regex = new RegExp(`\\b${numKeyword}\\b`, 'i');
                if (regex.test(variantValueLower)) {
                  variantScore += 800;
                  hasNumberMatch = true;
                }
                if (regex.test(skuLower)) {
                  variantScore += 500;
                  hasNumberMatch = true;
                }
              });
            }
            
            // Text matching - check if text keywords match
            let hasTextMatch = false;
            if (textKeywords.length > 0) {
              let textMatchCount = 0;
              textKeywords.forEach(keyword => {
                if (variantValueLower.includes(keyword) || 
                    variantNameLower.includes(keyword) ||
                    skuLower.includes(keyword)) {
                  variantScore += 30;
                  textMatchCount++;
                }
              });
              hasTextMatch = textMatchCount > 0;
            }
            
            // CRITICAL: If search has BOTH text and number keywords
            // Variant MUST match BOTH, otherwise set score to 0
            if (hasTextAndNumber) {
              if (!hasNumberMatch) {
                variantScore = 0; // No number match = invalid
              }
              // Text match is optional for variants since product name might have the text
            }
            
            // If only numbers searched, must have number match
            if (numberKeywords.length > 0 && textKeywords.length === 0 && !hasNumberMatch) {
              variantScore = 0;
            }
            
            return { ...variant, _variantScore: variantScore, _hasNumberMatch: hasNumberMatch };
          });
          
          // STRICT FILTERING: Only show variants with score > 0
          let matchingVariants = scoredVariants.filter(v => v._variantScore > 0);
          
          // If we have number keywords, ONLY show variants that have the exact number
          if (numberKeywords.length > 0) {
            matchingVariants = matchingVariants.filter(v => v._hasNumberMatch);
          }
          
          // Apply filtered variants
          if (matchingVariants.length > 0) {
            productData.variants = matchingVariants
              .sort((a, b) => b._variantScore - a._variantScore)
              .map(({ _variantScore, _hasNumberMatch, ...v }) => v);
          } else {
            // No matching variants = empty array (will be filtered out later)
            productData.variants = [];
          }
        }
        
        return productData;
      });
      
      // FINAL FILTER: Remove products that have NO matching variants
      // This is CRITICAL - "Baju SD 7" should ONLY show products with SD 7 variant
      products = products.filter(product => {
        return product.variants && product.variants.length > 0;
      });
    } else {
      // Default sort by name if no search
      products.sort((a, b) => a.name.localeCompare(b.name));
    }

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
    // SHEET 1: DATA REFERENSI (Hidden)
    // ========================================
    const refData = [];
    
    // Header row with all columns
    refData.push(['KATEGORI', 'CABANG', 'TIPE_PRODUK']);
    
    // Find max rows needed
    const maxRows = Math.max(categories.length, cabangs.length, 2);
    
    // Fill data row by row (all columns together)
    for (let i = 0; i < maxRows; i++) {
      refData.push([
        categories[i]?.name || '',
        cabangs[i]?.name || '',
        i === 0 ? 'SINGLE' : (i === 1 ? 'VARIANT' : '')
      ]);
    }

    const refSheet = XLSX.utils.aoa_to_sheet(refData);
    refSheet['!cols'] = [{ wch: 30 }, { wch: 30 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(workbook, refSheet, 'Data');

    // ========================================
    // SHEET 2: PANDUAN & INFO
    // ========================================
    const infoData = [];
    
    infoData.push(['📋 PANDUAN IMPORT PRODUK']);
    infoData.push([]);
    infoData.push(['LANGKAH-LANGKAH:']);
    infoData.push(['1. Pindah ke Sheet "Template Import"']);
    infoData.push(['2. Gunakan DROPDOWN untuk pilih Kategori, Cabang, dan Tipe Produk']);
    infoData.push(['3. Isi data produk sesuai contoh di bawah']);
    infoData.push(['4. Simpan file dan upload ke sistem']);
    infoData.push([]);
    infoData.push(['CONTOH PENGISIAN:']);
    infoData.push([]);
    infoData.push(['SKU', 'Nama Produk', 'Deskripsi', 'Kategori', 'Tipe Produk', 'Type 1', 'Value 1', 'Type 2', 'Value 2', 'Type 3', 'Value 3', 'Harga', 'Stok', 'Cabang', 'Weight (g)', 'Length (cm)', 'Width (cm)', 'Height (cm)', 'Image URL']);
    infoData.push([
      'KAOS-001',
      'Kaos Polos Basic',
      'Kaos cotton combed',
      categories[0]?.name || '',
      'SINGLE',
      '',
      '',
      '',
      '',
      '',
      '',
      50000,
      20,
      cabangs[0]?.name || '',
      200,
      30,
      20,
      2,
      ''
    ]);
    infoData.push([
      'SEPATU-42-BLK',
      'Sepatu Sport Pro',
      'Sepatu running',
      categories[0]?.name || '',
      'VARIANT',
      'Warna',
      'Hitam',
      'Ukuran',
      '42',
      '',
      '',
      450000,
      5,
      cabangs[0]?.name || '',
      800,
      30,
      20,
      12,
      'https://example.com/sepatu-hitam.jpg'
    ]);
    infoData.push([
      'CELANA-25-MRH',
      'Celana Karet',
      'Celana panjang karet',
      categories[0]?.name || '',
      'VARIANT',
      'Warna',
      'Merah',
      'Ukuran',
      '25',
      'Bahan',
      'Polyester',
      150000,
      3,
      cabangs[0]?.name || '',
      300,
      40,
      30,
      3,
      ''
    ]);
    infoData.push([]);
    infoData.push(['PENJELASAN:']);
    infoData.push(['• SINGLE: Produk tanpa varian (Type & Value kosong semua)']);
    infoData.push(['• VARIANT: Produk dengan varian (SKU harus unik per varian)']);
    infoData.push(['• Type 1 & Value 1: Atribut pertama (contoh: Type=Warna, Value=Merah)']);
    infoData.push(['• Type 2 & Value 2: Atribut kedua (contoh: Type=Ukuran, Value=25)']);
    infoData.push(['• Type 3 & Value 3: Atribut ketiga (opsional, contoh: Type=Bahan, Value=Cotton)']);
    infoData.push(['• Weight: Berat dalam gram (untuk marketplace)']);
    infoData.push(['• Length/Width/Height: Dimensi dalam cm (untuk marketplace)']);
    infoData.push(['• Image URL: Link gambar produk (opsional, contoh: https://imgur.com/abc.jpg)']);
    infoData.push(['• Kosongkan yang tidak digunakan (max 3 atribut per produk)']);
    infoData.push([]);
    infoData.push([]);
    infoData.push(['REFERENSI KATEGORI:']);
    infoData.push(['Nama Kategori', 'Deskripsi']);
    categories.forEach(cat => {
      infoData.push([cat.name, cat.description || '-']);
    });
    infoData.push([]);
    infoData.push(['REFERENSI CABANG:']);
    infoData.push(['Nama Cabang', 'Alamat']);
    cabangs.forEach(cabang => {
      infoData.push([cabang.name, cabang.address || '-']);
    });

    const infoSheet = XLSX.utils.aoa_to_sheet(infoData);
    infoSheet['!cols'] = [
      { wch: 15 }, { wch: 25 }, { wch: 30 }, { wch: 15 }, 
      { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, 
      { wch: 8 }, { wch: 15 }
    ];
    XLSX.utils.book_append_sheet(workbook, infoSheet, 'Panduan');

    // ========================================
    // SHEET 3: TEMPLATE IMPORT (With Merged Headers)
    // ========================================
    const templateData = [];
    
    // Merged header row (grouping labels)
    templateData.push([
      'INFO PRODUK', '', '', '', '',  // 5 cols
      'VARIANT ATTRIBUTES', '', '', '', '', '',  // 6 cols
      'PRICING & STOCK', '', '',  // 3 cols
      'SPESIFIKASI MARKETPLACE', '', '', '', ''  // 5 cols
    ]);
    
    // Actual header row with field names
    templateData.push([
      'SKU*', 'Nama Produk*', 'Deskripsi', 'Kategori*', 'Tipe Produk*',
      'Type 1', 'Value 1', 'Type 2', 'Value 2', 'Type 3', 'Value 3',
      'Harga*', 'Stok*', 'Cabang*',
      'Berat (g)', 'Panjang (cm)', 'Lebar (cm)', 'Tinggi (cm)', 'Link Gambar'
    ]);
    
    // Add 100 empty rows for user input
    for (let i = 0; i < 100; i++) {
      templateData.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    }

    const templateSheet = XLSX.utils.aoa_to_sheet(templateData);
    
    // Merge cells for grouped headers (row 1)
    templateSheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },   // INFO PRODUK (A1:E1)
      { s: { r: 0, c: 5 }, e: { r: 0, c: 10 } },  // VARIANT ATTRIBUTES (F1:K1)
      { s: { r: 0, c: 11 }, e: { r: 0, c: 13 } }, // PRICING & STOCK (L1:N1)
      { s: { r: 0, c: 14 }, e: { r: 0, c: 18 } }  // SPESIFIKASI MARKETPLACE (O1:S1)
    ];
    
    // Set column widths
    templateSheet['!cols'] = [
      { wch: 15 }, // SKU
      { wch: 25 }, // Nama Produk
      { wch: 30 }, // Deskripsi
      { wch: 15 }, // Kategori
      { wch: 12 }, // Tipe Produk
      { wch: 12 }, // Type 1
      { wch: 12 }, // Value 1
      { wch: 12 }, // Type 2
      { wch: 12 }, // Value 2
      { wch: 12 }, // Type 3
      { wch: 12 }, // Value 3
      { wch: 12 }, // Harga
      { wch: 10 }, // Stok
      { wch: 15 }, // Cabang
      { wch: 10 }, // Berat
      { wch: 12 }, // Panjang
      { wch: 10 }, // Lebar
      { wch: 10 }, // Tinggi
      { wch: 35 }  // Link Gambar
    ];

    // Add data validation (dropdowns)
    if (!templateSheet['!dataValidation']) templateSheet['!dataValidation'] = [];
    
    // Dropdown for Kategori (Column D, rows 3-102 - skip merged header row)
    const categoryNames = categories.map(c => c.name).join(',');
    templateSheet['!dataValidation'].push({
      type: 'list',
      sqref: 'D3:D102',
      formulas: [categoryNames]
    });
    
    // Dropdown for Tipe Produk (Column E, rows 3-102)
    templateSheet['!dataValidation'].push({
      type: 'list',
      sqref: 'E3:E102',
      formulas: ['SINGLE,VARIANT']
    });
    
    // Dropdown for Cabang (Column N, rows 3-102)
    const cabangNames = cabangs.map(c => c.name).join(',');
    templateSheet['!dataValidation'].push({
      type: 'list',
      sqref: 'N3:N102',
      formulas: [cabangNames]
    });
    
    XLSX.utils.book_append_sheet(workbook, templateSheet, 'Template Import');

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

    // ===== FORMAT FIX: Export in import-compatible format =====
    const exportData = [];
    products.forEach(product => {
      product.variants.forEach(variant => {
        variant.stocks.forEach(stock => {
          // Parse variant name/value back to Type/Value pairs (supports up to 3 attributes)
          const variantNames = variant.variantName?.split(' | ') || [];
          const variantValues = variant.variantValue?.split(' | ') || [];
          
          exportData.push([
            variant.sku || '',              // SKU
            product.name,                   // Nama Produk
            product.description || '',      // Deskripsi
            product.category?.name || '',   // Kategori
            product.productType,            // Tipe Produk
            variantNames[0] || '',          // Type 1
            variantValues[0] || '',         // Value 1
            variantNames[1] || '',          // Type 2
            variantValues[1] || '',         // Value 2
            variantNames[2] || '',          // Type 3
            variantValues[2] || '',         // Value 3
            stock.price || 0,               // Harga
            stock.quantity || 0,            // Stok
            stock.cabang.name,              // Cabang
            variant.weight || '',           // Berat (g)
            variant.length || '',           // Panjang (cm)
            variant.width || '',            // Lebar (cm)
            variant.height || '',           // Tinggi (cm)
            variant.imageUrl || ''          // Link Gambar
          ]);
        });
      });
    });

    if (exportData.length === 0) {
      return res.status(404).json({ error: 'Tidak ada data produk untuk diexport' });
    }

    // Create workbook
    const workbook = XLSX.utils.book_new();
    
    // Merged header row (grouping labels)
    const mergedHeaderRow = [
      'INFO PRODUK', '', '', '', '',
      'VARIANT ATTRIBUTES', '', '', '', '', '',
      'PRICING & STOCK', '', '',
      'SPESIFIKASI MARKETPLACE', '', '', '', ''
    ];
    
    // Header matches import template format
    const header = [
      'SKU*',
      'Nama Produk*',
      'Deskripsi',
      'Kategori*',
      'Tipe Produk*',
      'Type 1',
      'Value 1',
      'Type 2',
      'Value 2',
      'Type 3',
      'Value 3',
      'Harga*',
      'Stok*',
      'Cabang*',
      'Berat (g)',
      'Panjang (cm)',
      'Lebar (cm)',
      'Tinggi (cm)',
      'Link Gambar'
    ];
    
    const worksheetData = [mergedHeaderRow, header, ...exportData];
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    
    // Merge cells for grouped headers (row 1)
    worksheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },   // INFO PRODUK
      { s: { r: 0, c: 5 }, e: { r: 0, c: 10 } },  // VARIANT ATTRIBUTES
      { s: { r: 0, c: 11 }, e: { r: 0, c: 13 } }, // PRICING & STOCK
      { s: { r: 0, c: 14 }, e: { r: 0, c: 18 } }  // SPESIFIKASI MARKETPLACE
    ];
    
    // Set column widths (same as template)
    worksheet['!cols'] = [
      { wch: 15 }, // SKU
      { wch: 25 }, // Nama Produk
      { wch: 30 }, // Deskripsi
      { wch: 15 }, // Kategori
      { wch: 12 }, // Tipe Produk
      { wch: 12 }, // Type 1
      { wch: 12 }, // Value 1
      { wch: 12 }, // Type 2
      { wch: 12 }, // Value 2
      { wch: 12 }, // Type 3
      { wch: 12 }, // Value 3
      { wch: 12 }, // Harga
      { wch: 10 }, // Stok
      { wch: 15 }, // Cabang
      { wch: 10 }, // Berat
      { wch: 12 }, // Panjang
      { wch: 10 }, // Lebar
      { wch: 10 }, // Tinggi
      { wch: 35 }  // Link Gambar
    ];
    
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template Import');
    
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
              sku: variant.sku || `${newProduct.id}-${variant.variantValue}`,
              weight: variant.weight || null,
              length: variant.length || null,
              width: variant.width || null,
              height: variant.height || null,
              imageUrl: variant.imageUrl || null
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
            sku: sku || `${newProduct.id}-DEFAULT`,
            weight: req.body.weight || null,
            length: req.body.length || null,
            width: req.body.width || null,
            height: req.body.height || null,
            imageUrl: req.body.imageUrl || null
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
              sku: variant.sku,
              weight: variant.weight || null,
              length: variant.length || null,
              width: variant.width || null,
              height: variant.height || null,
              imageUrl: variant.imageUrl || null
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
                sku: variant.sku,
                weight: variant.weight || null,
                length: variant.length || null,
                width: variant.width || null,
                height: variant.height || null,
                imageUrl: variant.imageUrl || null
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
                sku: variant.sku || `${updatedProduct.id}-${variant.variantValue}`,
                weight: variant.weight || null,
                length: variant.length || null,
                width: variant.width || null,
                height: variant.height || null,
                imageUrl: variant.imageUrl || null
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
    
    // Try to find the template sheet
    let sheetName = 'Template Import';
    if (!workbook.SheetNames.includes(sheetName)) {
      // Fallback to any sheet that might be the template
      sheetName = workbook.SheetNames.find(s => s.toLowerCase().includes('template')) || workbook.SheetNames[0];
    }
    
    const worksheet = workbook.Sheets[sheetName];
    
    // Parse with header row at index 1 (row 2 in Excel) - skip merged header row
    const products = XLSX.utils.sheet_to_json(worksheet, { 
      range: 1, // Start from row 2 (actual headers, skip merged header row 1)
      defval: '' // Default empty string for empty cells
    });

    if (products.length === 0) {
      return res.status(400).json({ error: 'File kosong atau format tidak valid. Pastikan Sheet "Template Import" berisi data dengan header di baris 2.' });
    }

    // Get all categories and cabangs
    const categories = await prisma.category.findMany();
    const cabangs = await prisma.cabang.findMany();

    const errors = [];
    const success = [];
    const productsToCreate = new Map(); // Group by product name

  // ===== UPSERT MODE: Batch fetch existing SKUs with full data =====
  // Collect all SKUs from Excel first
  const allSkus = products
    .map(row => row['SKU']?.toString().trim())
    .filter(Boolean); // Remove empty values

  // Fetch existing SKUs with product and stock data for upsert
  const existingVariants = await prisma.productVariant.findMany({
    where: { sku: { in: allSkus } },
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
  
  // Map SKU to variant data for quick lookup
  const existingVariantsMap = new Map(
    existingVariants.map(v => [v.sku, v])
  );

  // Group products by name (for variants)
  for (let i = 0; i < products.length; i++) {
    const row = products[i];
    const rowNum = i + 2; // Excel row number (1 = header)

    try {
      // Skip empty rows (all fields empty)
      const hasData = Object.values(row).some(val => val !== '' && val !== null && val !== undefined);
      if (!hasData) {
        continue; // Skip silently
      }

      // Validate required fields with new column names (with asterisks)
      const sku = row['SKU*']?.toString().trim();
      const productName = row['Nama Produk*']?.toString().trim();
      const categoryName = row['Kategori*']?.toString().trim();
      const productType = row['Tipe Produk*']?.toString().toUpperCase().trim();
      const price = parseInt(row['Harga*']);
      const stock = parseInt(row['Stok*']);
      const cabangName = row['Cabang*']?.toString().trim();

      if (!sku || !productName || !categoryName || !productType || isNaN(price) || isNaN(stock) || !cabangName) {
        errors.push({ row: rowNum, error: 'Data tidak lengkap. Pastikan SKU, Nama Produk, Kategori, Tipe Produk, Harga, Stok, dan Cabang diisi' });
        continue;
      }

      if (!['SINGLE', 'VARIANT'].includes(productType)) {
        errors.push({ row: rowNum, error: 'Tipe Produk harus SINGLE atau VARIANT' });
        continue;
      }

      // Check if category exists by NAME
      const category = categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
      if (!category) {
        errors.push({ row: rowNum, error: `Kategori "${categoryName}" tidak ditemukan. Pilih dari dropdown atau lihat sheet Panduan` });
        continue;
      }

      // Check if cabang exists by NAME
      const cabang = cabangs.find(c => c.name.toLowerCase() === cabangName.toLowerCase());
      if (!cabang) {
        errors.push({ row: rowNum, error: `Cabang "${cabangName}" tidak ditemukan. Pilih dari dropdown atau lihat sheet Panduan` });
        continue;
      }

      // ===== UPSERT LOGIC: Check if SKU exists =====
      const existingVariant = existingVariantsMap.get(sku);
      
      if (existingVariant) {
        // SKU exists - UPSERT mode
        const existingProduct = existingVariant.product;
        
        // Validate critical fields yang tidak boleh berubah
        if (existingProduct.productType !== productType) {
          errors.push({ 
            row: rowNum, 
            error: `SKU "${sku}" sudah terdaftar dengan tipe ${existingProduct.productType}. Tidak bisa diubah ke ${productType}` 
          });
          continue;
        }
        
        // Warning jika category berbeda (tapi tetap lanjut update)
        if (existingProduct.category.name.toLowerCase() !== categoryName.toLowerCase()) {
          errors.push({ 
            row: rowNum, 
            error: `Warning: SKU "${sku}" kategori berubah dari "${existingProduct.category.name}" ke "${categoryName}". Kategori tidak diupdate.`,
            type: 'warning'
          });
        }
        
        // Check if stock exists for this cabang
        const existingStock = existingVariant.stocks.find(s => s.cabangId === cabang.id);
        
        if (existingStock) {
          // Update existing stock
          try {
            await prisma.stock.update({
              where: { id: existingStock.id },
              data: {
                quantity: stock,
                price: price
              }
            });
            
            success.push({
              row: rowNum,
              sku,
              product: productName,
              action: 'updated',
              message: `Stock di ${cabangName} diupdate: ${stock} pcs @ Rp ${price.toLocaleString('id-ID')}`
            });
            
            // Emit stock update event
            emitStockUpdated({
              productId: existingProduct.id,
              variantId: existingVariant.id,
              cabangId: cabang.id,
              quantity: stock,
              price: price
            });
          } catch (error) {
            errors.push({ row: rowNum, error: `Gagal update stock: ${error.message}` });
          }
        } else {
          // Create new stock for different cabang
          try {
            await prisma.stock.create({
              data: {
                variantId: existingVariant.id,
                cabangId: cabang.id,
                quantity: stock,
                price: price
              }
            });
            
            success.push({
              row: rowNum,
              sku,
              product: productName,
              action: 'stock_added',
              message: `Stock baru ditambahkan di ${cabangName}: ${stock} pcs @ Rp ${price.toLocaleString('id-ID')}`
            });
            
            // Emit stock update event
            emitStockUpdated({
              productId: existingProduct.id,
              variantId: existingVariant.id,
              cabangId: cabang.id,
              quantity: stock,
              price: price
            });
          } catch (error) {
            errors.push({ row: rowNum, error: `Gagal tambah stock: ${error.message}` });
          }
        }
        
        continue; // Skip to next row
      }
      
      // SKU baru - CREATE mode (existing logic)
      // Get or create product in Map
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

      // Parse Type/Value pairs and generate variant name (supports up to 3 attributes)
      let variantName = 'Default';
      let variantValue = 'Default';
      
      if (productType === 'VARIANT') {
        const type1 = row['Type 1']?.toString().trim();
        const value1 = row['Value 1']?.toString().trim();
        const type2 = row['Type 2']?.toString().trim();
        const value2 = row['Value 2']?.toString().trim();
        const type3 = row['Type 3']?.toString().trim();
        const value3 = row['Value 3']?.toString().trim();
        
        // Collect non-empty types and values
        const types = [];
        const values = [];
        
        if (type1 && value1) {
          types.push(type1);
          values.push(value1);
        } else if (type1 || value1) {
          errors.push({ row: rowNum, error: 'Type 1 dan Value 1 harus diisi bersama-sama' });
          continue;
        }
        
        if (type2 && value2) {
          types.push(type2);
          values.push(value2);
        } else if (type2 || value2) {
          errors.push({ row: rowNum, error: 'Type 2 dan Value 2 harus diisi bersama-sama' });
          continue;
        }
        
        if (type3 && value3) {
          types.push(type3);
          values.push(value3);
        } else if (type3 || value3) {
          errors.push({ row: rowNum, error: 'Type 3 dan Value 3 harus diisi bersama-sama' });
          continue;
        }
        
        // Validate: VARIANT must have at least 1 type-value pair
        if (types.length === 0) {
          errors.push({ row: rowNum, error: 'Produk VARIANT harus memiliki minimal 1 pasang Type dan Value' });
          continue;
        }
        
        // Generate variant name (types) and value (values) with | separator
        variantName = types.join(' | ');
        variantValue = values.join(' | ');
      } else {
        // For SINGLE products, validate that all type/value fields are empty
        const type1 = row['Type 1']?.toString().trim();
        const value1 = row['Value 1']?.toString().trim();
        const type2 = row['Type 2']?.toString().trim();
        const value2 = row['Value 2']?.toString().trim();
        const type3 = row['Type 3']?.toString().trim();
        const value3 = row['Value 3']?.toString().trim();
        
        if (type1 || value1 || type2 || value2 || type3 || value3) {
          errors.push({ row: rowNum, error: 'Produk SINGLE tidak boleh memiliki Type dan Value. Kosongkan semua kolom atribut' });
          continue;
        }
      }

      // Parse marketplace fields (optional) - updated column names
      const weight = row['Berat (g)'] ? parseInt(row['Berat (g)']) : null;
      const length = row['Panjang (cm)'] ? parseInt(row['Panjang (cm)']) : null;
      const width = row['Lebar (cm)'] ? parseInt(row['Lebar (cm)']) : null;
      const height = row['Tinggi (cm)'] ? parseInt(row['Tinggi (cm)']) : null;
      const imageUrl = row['Link Gambar']?.toString().trim() || null;

      // Add variant
      const variantData = {
        sku,
        variantName,
        variantValue,
        weight,
        length,
        width,
        height,
        imageUrl,
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

  // ===== PREVIEW MODE: Return validation results without creating =====
  const isPreview = req.query.preview === 'true';
    
    if (isPreview) {
      // Clean up uploaded file
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      return res.json({
        preview: true,
        success: errors.length === 0,
        totalRows: products.length,
        validRows: productsToCreate.size,
        invalidRows: errors.length,
        productsToCreate: Array.from(productsToCreate.values()).map(p => ({
          name: p.name,
          type: p.productType,
          variants: p.variants.length,
          category: categories.find(c => c.id === p.categoryId)?.name
        })),
        errors
      });
    }

    // Create products in database
    for (const [productKey, productData] of productsToCreate) {
      try {
        // Check for duplicate variants before creating
        const variantValues = productData.variants.map(v => v.variantValue);
        const duplicates = variantValues.filter((val, idx) => variantValues.indexOf(val) !== idx);
        
        if (duplicates.length > 0) {
          errors.push({ 
            product: productData.name, 
            error: `Variant duplikat ditemukan: "${duplicates[0]}". Pastikan setiap variant berbeda (periksa Value 1, Value 2, dan Value 3).` 
          });
          continue;
        }

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
                weight: v.weight,
                length: v.length,
                width: v.width,
                height: v.height,
                imageUrl: v.imageUrl,
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
          action: 'created',
          message: `Berhasil import produk baru dengan ${product.variants.length} varian`
        });

        // Emit WebSocket event
        emitProductCreated(product);

      } catch (error) {
        // User-friendly error messages
        let errorMsg = 'Gagal membuat produk';
        
        if (error.code === 'P2002') {
          // Unique constraint violation
          if (error.meta?.target?.includes('sku')) {
            errorMsg = `SKU sudah terdaftar. Periksa SKU yang duplikat.`;
          } else if (error.meta?.target?.includes('variantName') || error.meta?.target?.includes('variantValue')) {
            errorMsg = `Variant duplikat. Setiap produk harus punya variant yang unik.`;
          } else {
            errorMsg = `Data duplikat terdeteksi: ${error.meta?.target?.join(', ') || 'unknown'}`;
          }
        } else if (error.code === 'P2003') {
          // Foreign key constraint
          errorMsg = `Referensi data tidak valid (kategori atau cabang tidak ditemukan)`;
        } else if (error.message) {
          errorMsg = error.message;
        }
        
        errors.push({ 
          product: productData.name, 
          error: errorMsg
        });
      }
    }

    // Clean up uploaded file
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Separate warnings from actual errors
    const warnings = errors.filter(e => e.type === 'warning');
    const actualErrors = errors.filter(e => e.type !== 'warning');

    res.json({
      success: success.length > 0,
      imported: success.length,
      failed: actualErrors.length,
      warnings: warnings.length,
      details: {
        success,
        errors: actualErrors,
        warnings
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

 
