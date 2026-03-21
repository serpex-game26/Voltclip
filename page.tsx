'use client'
// app/page.tsx - Feed principal style TikTok

import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase, type Video } from '@/lib/supabase'
import VideoPlayer from '@/components/VideoPlayer'
import StoriesBar from '@/components/StoriesBar'
import UploadButton from '@/components/UploadButton'
import AuthModal from '@/components/AuthModal'

export default function FeedPage() {
  const [videos, setVideos] = useState<Video[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showAuth, setShowAuth] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Auth state
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Charge les vidéos
  const loadVideos = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('videos')
      .select(`*, profiles(username, avatar_url)`)
      .order('created_at', { ascending: false })
      .limit(20)

    if (!error && data) {
      // Si connecté, vérifie les likes
      if (user) {
        const { data: likes } = await supabase
          .from('likes')
          .select('video_id')
          .eq('user_id', user.id)
        const likedIds = new Set(likes?.map(l => l.video_id))
        setVideos(data.map(v => ({ ...v, liked_by_me: likedIds.has(v.id) })))
      } else {
        setVideos(data)
      }
    }
    setLoading(false)
  }, [user])

  useEffect(() => { loadVideos() }, [loadVideos])

  // Scroll snap : détecte quelle vidéo est visible
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const idx = parseInt(entry.target.getAttribute('data-index') || '0')
          setCurrentIndex(idx)
          // Incrémente les vues
          const videoId = entry.target.getAttribute('data-video-id')
          if (videoId) {
            supabase.from('videos')
              .update({ views_count: supabase.rpc('increment', { row_id: videoId }) })
              .eq('id', videoId)
              .then(() => {})
          }
        }
      })
    }, { threshold: 0.7 })

    container.querySelectorAll('[data-video-id]').forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [videos])

  // Like / Unlike
  const handleLike = async (videoId: string, liked: boolean) => {
    if (!user) { setShowAuth(true); return }

    setVideos(prev => prev.map(v =>
      v.id === videoId
        ? { ...v, liked_by_me: !liked, likes_count: liked ? v.likes_count - 1 : v.likes_count + 1 }
        : v
    ))

    if (liked) {
      await supabase.from('likes').delete()
        .eq('user_id', user.id).eq('video_id', videoId)
      await supabase.from('videos')
        .update({ likes_count: supabase.rpc('decrement', { row_id: videoId }) })
        .eq('id', videoId)
    } else {
      await supabase.from('likes').insert({ user_id: user.id, video_id: videoId })
      await supabase.from('videos')
        .update({ likes_count: supabase.rpc('increment', { row_id: videoId }) })
        .eq('id', videoId)
    }
  }

  return (
    <main style={styles.main}>
      {/* Barre de stories en haut */}
      <StoriesBar user={user} onAuthRequired={() => setShowAuth(true)} />

      {/* Feed vidéos */}
      <div ref={containerRef} style={styles.feed}>
        {loading ? (
          <div style={styles.loader}>
            <div style={styles.spinner} />
          </div>
        ) : videos.length === 0 ? (
          <div style={styles.empty}>
            <p style={styles.emptyText}>Aucune vidéo pour l'instant</p>
            <p style={styles.emptySubtext}>Sois le premier à poster !</p>
          </div>
        ) : (
          videos.map((video, idx) => (
            <VideoPlayer
              key={video.id}
              video={video}
              index={idx}
              isActive={idx === currentIndex}
              onLike={handleLike}
              onAuthRequired={() => setShowAuth(true)}
              user={user}
            />
          ))
        )}
      </div>

      {/* Bouton upload */}
      <UploadButton
        user={user}
        onAuthRequired={() => setShowAuth(true)}
        onUploaded={loadVideos}
      />

      {/* Modal auth */}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </main>
  )
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    background: '#000',
    height: '100dvh',
    overflow: 'hidden',
    position: 'relative',
    maxWidth: '480px',
    margin: '0 auto',
  },
  feed: {
    height: '100dvh',
    overflowY: 'scroll',
    scrollSnapType: 'y mandatory',
    scrollBehavior: 'smooth',
    WebkitOverflowScrolling: 'touch',
  },
  loader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100dvh',
  },
  spinner: {
    width: 40,
    height: 40,
    border: '3px solid rgba(255,255,255,0.2)',
    borderTop: '3px solid #fff',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100dvh',
    gap: 8,
  },
  emptyText: { color: '#fff', fontSize: 18, fontWeight: 600, margin: 0 },
  emptySubtext: { color: 'rgba(255,255,255,0.5)', fontSize: 14, margin: 0 },
}
