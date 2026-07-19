-- Komentarze mogą dotyczyć konkretnego elementu wewnątrz sekcji (nie tylko
-- całej sekcji). object_id = klasa obj-<id> elementu (null = cała sekcja),
-- object_label = czytelny opis elementu do wyświetlenia w panelu.
alter table comments
  add column if not exists object_id text,
  add column if not exists object_label text;
