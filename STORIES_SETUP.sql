-- ============================================
-- AJOUTE CE SQL à la suite du premier fichier
-- Supabase > SQL Editor
-- ============================================

-- Table stories (expire après 24h)
CREATE TABLE stories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  duration INT DEFAULT 10,
  views_count INT DEFAULT 0,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE stories ENABLE ROW LEVEL SECURITY;

-- Policies stories
CREATE POLICY "Stories visibles si pas expirées" ON stories
  FOR SELECT USING (expires_at > NOW());

CREATE POLICY "Publier sa story" ON stories
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Supprimer sa story" ON stories
  FOR DELETE USING (auth.uid() = user_id);

-- Vues stories
CREATE TABLE story_views (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id UUID REFERENCES stories(id) ON DELETE CASCADE NOT NULL,
  viewer_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(story_id, viewer_id)
);

ALTER TABLE story_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Vues visibles" ON story_views FOR SELECT USING (true);
CREATE POLICY "Enregistrer vue" ON story_views FOR INSERT WITH CHECK (auth.uid() = viewer_id);

-- ============================================
-- TRIGGER : Limite à 3 stories simultanées
-- ============================================

CREATE OR REPLACE FUNCTION check_story_limit()
RETURNS TRIGGER AS $$
DECLARE
  active_count INT;
BEGIN
  SELECT COUNT(*) INTO active_count
  FROM stories
  WHERE user_id = NEW.user_id AND expires_at > NOW();

  IF active_count >= 3 THEN
    RAISE EXCEPTION 'Tu as déjà 3 stories actives. Attends qu''une expire ou supprime-en une.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_story_limit
  BEFORE INSERT ON stories
  FOR EACH ROW EXECUTE FUNCTION check_story_limit();

-- ============================================
-- PG_CRON : Nettoyage automatique toutes les heures
-- Active pg_cron dans : Supabase > Extensions > pg_cron
-- ============================================

-- Supprime les stories expirées de la DB
SELECT cron.schedule(
  'cleanup-expired-stories',
  '0 * * * *',  -- Toutes les heures
  $$
    DELETE FROM stories WHERE expires_at < NOW();
  $$
);

-- Supprime aussi les fichiers du Storage (via fonction)
CREATE OR REPLACE FUNCTION delete_expired_story_files()
RETURNS void AS $$
DECLARE
  story RECORD;
BEGIN
  FOR story IN
    SELECT id, video_url, thumbnail_url
    FROM stories
    WHERE expires_at < NOW()
  LOOP
    -- Supprime le fichier vidéo du storage
    PERFORM storage.delete_object('videos', split_part(story.video_url, '/videos/', 2));

    -- Supprime la thumbnail si elle existe
    IF story.thumbnail_url IS NOT NULL THEN
      PERFORM storage.delete_object('thumbnails', split_part(story.thumbnail_url, '/thumbnails/', 2));
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cron qui nettoie aussi les fichiers storage
SELECT cron.schedule(
  'cleanup-story-storage',
  '30 * * * *',  -- 30 min après le cron DB
  $$SELECT delete_expired_story_files();$$
);

-- ============================================
-- BUCKET STORIES dans Storage
-- ============================================
INSERT INTO storage.buckets (id, name, public) VALUES ('stories', 'stories', true);

CREATE POLICY "Stories publiques" ON storage.objects FOR SELECT USING (bucket_id = 'stories');
CREATE POLICY "Upload story authentifié" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'stories' AND auth.role() = 'authenticated'
);
CREATE POLICY "Supprimer sa story storage" ON storage.objects FOR DELETE USING (
  bucket_id = 'stories' AND auth.uid()::text = (storage.foldername(name))[1]
);
