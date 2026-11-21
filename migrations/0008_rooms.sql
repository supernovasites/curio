CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  photo TEXT NOT NULL DEFAULT '',
  capacity INTEGER NOT NULL CHECK(capacity BETWEEN 1 AND 30),
  stock INTEGER NOT NULL CHECK(stock BETWEEN 0 AND 100),
  adult_cents INTEGER NOT NULL CHECK(adult_cents BETWEEN 0 AND 10000000),
  child_cents INTEGER CHECK(child_cents BETWEEN 0 AND 10000000)
);
ALTER TABLE reservations ADD COLUMN room_id TEXT REFERENCES rooms(id);
ALTER TABLE reservations ADD COLUMN quote TEXT;
DROP INDEX reservations_one_booking_per_day;
DROP INDEX reservations_one_active_request;
CREATE INDEX reservations_room_weekend ON reservations(day,room_id,status);
INSERT INTO rooms(id,name,description,photo,capacity,stock,adult_cents,child_cents) VALUES
('sede-3','Casa Sede 3 pax','Cama queen e cama de solteiro. Ar-condicionado, sacada e Wi-Fi. Todas as refeições incluídas. Pets não aceitos.','https://s3-cdn.hotellinksolutions.com/hbe/data/a0966616-995f-1748368822-4cab-adc8-88e27afe5e1a/gallery/room/thumbs/sm_thumb_photo-2024-12-29-15-05-00_1748529937.jpg',3,1,90000,NULL),
('anexo-3','Casa Anexo 3 pax','Cama queen e cama de solteiro. Ar-condicionado, sacada e banheiro com chuveiro. Todas as refeições incluídas. Pets não aceitos.','https://s3-cdn.hotellinksolutions.com/hbe/data/a0966616-995f-1748368822-4cab-adc8-88e27afe5e1a/gallery/room/thumbs/sm_thumb_file__15__1748371625.jpeg',3,1,90000,NULL),
('arvore','Casa da Árvore','Cama queen e cama de solteiro dobrável. Ar-condicionado, sacada e banheiro com chuveiro. Todas as refeições incluídas. Pets não aceitos.','https://s3-cdn.hotellinksolutions.com/hbe/data/a0966616-995f-1748368822-4cab-adc8-88e27afe5e1a/gallery/room/thumbs/sm_thumb_photo-2024-12-29-14-59-08_1749239783.jpg',2,1,110000,NULL),
('sede-4','Casa Sede 4 pax','Cama queen e duas camas de solteiro. Ar-condicionado e banheiro com chuveiro. Todas as refeições incluídas. Pets não aceitos.','https://s3-cdn.hotellinksolutions.com/hbe/data/a0966616-995f-1748368822-4cab-adc8-88e27afe5e1a/gallery/room/thumbs/sm_thumb_photo-2024-12-29-14-58-52_1748529541.jpg',4,1,90000,NULL),
('manga-rosa','Manga Rosa','Duas camas queen e duas de solteiro. Ar-condicionado e banheiro com chuveiro. Todas as refeições incluídas. Pets não aceitos.','https://s3-cdn.hotellinksolutions.com/hbe/data/a0966616-995f-1748368822-4cab-adc8-88e27afe5e1a/gallery/room/thumbs/sm_thumb_photo-2025-05-24-07-36-54_1748529555.jpg',6,1,90000,NULL),
('anexo-4','Casa Anexo 4 pax','Duas camas queen. Ar-condicionado, rede e banheiro com chuveiro. Todas as refeições incluídas. Pets não aceitos.','https://s3-cdn.hotellinksolutions.com/hbe/data/a0966616-995f-1748368822-4cab-adc8-88e27afe5e1a/gallery/room/thumbs/sm_thumb_photo-2024-12-29-14-45-12_1748529709.jpg',4,1,90000,NULL),
('anexo-5','Casa Anexo 5 pax','Duas camas queen e uma de solteiro. Ar-condicionado, sacada e banheiro com chuveiro. Todas as refeições incluídas. Pets não aceitos.','https://s3-cdn.hotellinksolutions.com/hbe/data/a0966616-995f-1748368822-4cab-adc8-88e27afe5e1a/gallery/room/thumbs/sm_thumb_photo-2024-12-29-14-45-12_1748529759.jpg',5,1,90000,NULL);
