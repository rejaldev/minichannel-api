-- Step 1: Add price column to product_variants with default 0
ALTER TABLE "product_variants" ADD COLUMN "price" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Step 2: Copy price from products to all their variants
UPDATE "product_variants" pv
SET price = p.price
FROM "products" p
WHERE pv."productId" = p.id;

-- Step 3: Drop price column from products
ALTER TABLE "products" DROP COLUMN "price";
