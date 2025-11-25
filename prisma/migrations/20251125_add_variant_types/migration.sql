-- CreateTable
CREATE TABLE "variant_types" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "variant_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variant_options" (
    "id" TEXT NOT NULL,
    "variant_type_id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "variant_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "variant_types_product_id_name_key" ON "variant_types"("product_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "variant_options_variant_type_id_value_key" ON "variant_options"("variant_type_id", "value");

-- AddForeignKey
ALTER TABLE "variant_types" ADD CONSTRAINT "variant_types_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_options" ADD CONSTRAINT "variant_options_variant_type_id_fkey" FOREIGN KEY ("variant_type_id") REFERENCES "variant_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
