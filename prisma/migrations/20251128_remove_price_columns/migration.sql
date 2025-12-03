-- Remove price column from products table (price now only in stocks table)
ALTER TABLE "products" DROP COLUMN IF EXISTS "price";

-- Remove price column from product_variants table (price now only in stocks table)
ALTER TABLE "product_variants" DROP COLUMN IF EXISTS "price";
