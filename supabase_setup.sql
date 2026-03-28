-- ============================================================
-- VIBELOOP — Supabase SQL Setup
-- Colle tout ça dans Supabase > SQL Editor > New Query
-- ============================================================

-- PROFILES
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  bio TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- VIDEOS
CREATE TABLE videos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  likes_count INT DEFAULT 0,
  views_count INT DEFAULT 0,
  status TEXT DEFAULT 'active', -- 'active' | 'flagged' | 'deleted'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- STORIES (expire auto après 24h)
CREATE TABLE stories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- LIKES
CREATE TABLE likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE NOT NULL,
  UNIQUE(user_id, video_id)
);

-- STORY VIEWS
CREATE TABLE story_views (
  story_id UUID REFERENCES stories(id) ON DELETE CASCADE NOT NULL,
  viewer_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  viewed_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY(story_id, viewer_id)
);

-- REPORTS
CREATE TABLE reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE NOT NULL,
  reporter_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  reason TEXT NOT NULL,
  lang TEXT DEFAULT 'en',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories     ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports     ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "profiles_read"   ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (auth.uid()=id);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid()=id);

-- Videos : seules les vidéos actives sont visibles publiquement
CREATE POLICY "videos_read"   ON videos FOR SELECT USING (status='active');
CREATE POLICY "videos_insert" ON videos FOR INSERT WITH CHECK (auth.uid()=user_id);
CREATE POLICY "videos_update" ON videos FOR UPDATE USING (auth.uid()=user_id);
CREATE POLICY "videos_delete" ON videos FOR DELETE USING (auth.uid()=user_id);
-- Permet la mise à jour du statut flagged (par le système)
CREATE POLICY "videos_flag"   ON videos FOR UPDATE USING (true) WITH CHECK (status IN ('active','flagged'));

-- Stories
CREATE POLICY "stories_read"   ON stories FOR SELECT USING (expires_at > NOW());
CREATE POLICY "stories_insert" ON stories FOR INSERT WITH CHECK (auth.uid()=user_id);
CREATE POLICY "stories_delete" ON stories FOR DELETE USING (auth.uid()=user_id);

-- Likes
CREATE POLICY "likes_read"   ON likes FOR SELECT USING (true);
CREATE POLICY "likes_insert" ON likes FOR INSERT WITH CHECK (auth.uid()=user_id);
CREATE POLICY "likes_delete" ON likes FOR DELETE USING (auth.uid()=user_id);

-- Story views
CREATE POLICY "sv_read"   ON story_views FOR SELECT USING (true);
CREATE POLICY "sv_insert" ON story_views FOR INSERT WITH CHECK (auth.uid()=viewer_id);

-- Reports
CREATE POLICY "reports_insert" ON reports FOR INSERT WITH CHECK (auth.uid()=reporter_id);

-- ============================================================
-- TRIGGERS : limites uploads
-- ============================================================

-- Max 5 vidéos par user
CREATE OR REPLACE FUNCTION check_video_limit() RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM videos WHERE user_id=NEW.user_id) >= 5 THEN
    RAISE EXCEPTION 'Video limit reached (5 max)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER video_limit BEFORE INSERT ON videos FOR EACH ROW EXECUTE FUNCTION check_video_limit();

-- Max 3 stories actives
CREATE OR REPLACE FUNCTION check_story_limit() RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM stories WHERE user_id=NEW.user_id AND expires_at>NOW()) >= 3 THEN
    RAISE EXCEPTION 'Story limit reached (3 active max)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER story_limit BEFORE INSERT ON stories FOR EACH ROW EXECUTE FUNCTION check_story_limit();

-- ============================================================
-- FONCTION : incrémenter les vues
-- ============================================================
CREATE OR REPLACE FUNCTION increment_views(vid_id UUID) RETURNS void AS $$
  UPDATE videos SET views_count = views_count + 1 WHERE id = vid_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- ============================================================
-- PG_CRON : nettoyage auto des stories expirées
-- Active d'abord pg_cron dans : Database > Extensions
-- ============================================================
SELECT cron.schedule('cleanup-stories','0 * * * *',$$
  DELETE FROM stories WHERE expires_at < NOW();
$$);

-- ============================================================
-- STORAGE BUCKETS
-- (ou crée-les manuellement dans Storage > New bucket)
-- ============================================================
INSERT INTO storage.buckets (id,name,public) VALUES ('videos','videos',true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id,name,public) VALUES ('stories','stories',true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id,name,public) VALUES ('thumbnails','thumbnails',true) ON CONFLICT DO NOTHING;

CREATE POLICY "pub_videos"   ON storage.objects FOR SELECT USING (bucket_id='videos');
CREATE POLICY "up_videos"    ON storage.objects FOR INSERT WITH CHECK (bucket_id='videos' AND auth.role()='authenticated');
CREATE POLICY "del_videos"   ON storage.objects FOR DELETE USING (bucket_id='videos' AND auth.uid()::text=(storage.foldername(name))[1]);

CREATE POLICY "pub_stories"  ON storage.objects FOR SELECT USING (bucket_id='stories');
CREATE POLICY "up_stories"   ON storage.objects FOR INSERT WITH CHECK (bucket_id='stories' AND auth.role()='authenticated');

CREATE POLICY "pub_thumbs"   ON storage.objects FOR SELECT USING (bucket_id='thumbnails');
CREATE POLICY "up_thumbs"    ON storage.objects FOR INSERT WITH CHECK (bucket_id='thumbnails' AND auth.role()='authenticated');
