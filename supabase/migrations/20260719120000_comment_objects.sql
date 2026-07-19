-- Comments can refer to a specific element inside a section (not only the
-- whole section). object_id = the element's obj-<id> class (null = whole
-- section), object_label = human-readable element description for the panel.
alter table comments
  add column if not exists object_id text,
  add column if not exists object_label text;
