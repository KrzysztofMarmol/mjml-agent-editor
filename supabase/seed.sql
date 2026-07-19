-- Publiczny bucket na obrazy generowane przez agenta
insert into storage.buckets (id, name, public)
values ('email-images', 'email-images', true)
on conflict (id) do nothing;
