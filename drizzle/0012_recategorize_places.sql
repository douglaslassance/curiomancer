-- Custom SQL migration file, put your code below! --
-- Recategorize places to the eat/drink/shop/visit taxonomy.
-- 'shop' is unchanged; 'restaurant' -> 'eat', 'bar' -> 'drink'.
UPDATE "place" SET "category" = 'eat' WHERE "category" = 'restaurant';
UPDATE "place" SET "category" = 'drink' WHERE "category" = 'bar';