'use client'
// components/StoriesBar.tsx

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'

interface Story {
  id: string
  user_id: string
  video_url: string
  thumbnail_url: string
  expires_at: string
  profiles: { username: string; avatar_url: string | null }
  viewed?: boolean
}

interface Props {
  user: any
  onAuthRequired: () => void
}

export default function StoriesBar({ user, onAuthRequired }: Props) {
  const [stories, setStories] = useState<Story[]>([])
  const [activeStory, setActiveStory] = useState<Story | null>(null)
  const [storyProgress, setStoryProgress] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const progressInterval = useRef<NodeJS.Timeout>()

  useEffect(() => {
    loadStories()
  }, [user])

  const loadStories = async () => {
    const { data } = await supabase
      .from('stories')
      .select(`*, profiles(username, avatar_url)`)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(20)

    if (!data) return

    // Marque les stories déjà vues
    if (user) {
      const { data: views } = await supabase
        .from('story_views')
        .select('story_id')
        .eq('viewer_id', user.id)
      const viewedIds = new Set(views?.map(v => v.story_id))
      setStories(data.map(s => ({ ...s, viewed: viewedIds.has(s.id) })))
    } else {
      setStories(data)
    }
  }

  const openStory = async (story: Story) => {
    setActiveStory(story)
    setStoryProgress(0)

    // Enregistre la vue
    if (user) {
      await supabase.from('story_views').upsert({
        story_id: story.id,
        viewer_id: user.id
      }, { onConflict: 'story_id,viewer_id' })

      // Met à jour localement
      setStories(prev => prev.map(s =>
        s.id === story.id ? { ...s, viewed: true } : s
      ))
    }
  }

  const closeStory = () => {
    setActiveStory(null)
    setStoryProgress(0)
    clearInterval(progressInterval.current)
  }

  // Progression de la story (10s)
  useEffect(() => {
    if (!activeStory) return
    clearInterval(progressInterval.current)
    progressInterval.current = setInterval(() => {
      setStoryProgress(p => {
        if (p >= 100) { closeStory(); return 0 }
        return p + 1
      })
    }, 100) // 100ms * 100 = 10 secondes

    return () => clearInterval(progressInterval.current)
  }, [activeStory])

  // Calcule le temps restant
  const getTimeLeft = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now()
    const hours = Math.floor(diff / 3600000)
    if (hours > 0) return `${hours}h`
    const mins = Math.floor(diff / 60000)
    return `${mins}m`
  }

  if (stories.length === 0) return null

  return (
    <>
      {/* Barre horizontale scrollable */}
      <div style={styles.bar}>
        {stories.map(story => (
          <button
            key={story.id}
            style={styles.storyBtn}
            onClick={() => openStory(story)}
          >
            {/* Ring coloré si pas vu */}
            <div style={{
              ...styles.ring,
              background: story.viewed
                ? 'rgba(255,255,255,0.3)'
                : 'linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)'
            }}>
              {story.thumbnail_url ? (
                <img src={story.thumbnail_url} style={styles.avatar} alt="" />
              ) : (
                <div style={{ ...styles.avatar, background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: '#fff', fontSize: 18 }}>
                    {story.profiles?.username?.[0]?.toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            <span style={styles.storyUsername}>
              {story.profiles?.username?.slice(0, 8)}
            </span>
            <span style={styles.storyTime}>
              {getTimeLeft(story.expires_at)}
            </span>
          </button>
        ))}
      </div>

      {/* Visionneuse plein écran */}
      {activeStory && (
        <div style={styles.viewer} onClick={closeStory}>
          {/* Barre de progression */}
          <div style={styles.progressContainer}>
            <div style={{ ...styles.progressFill, width: `${storyProgress}%` }} />
          </div>

          {/* Header */}
          <div style={styles.storyHeader} onClick={e => e.stopPropagation()}>
            <img
              src={activeStory.thumbnail_url || ''}
              style={styles.storyAvatar}
              alt=""
            />
            <span style={styles.storyUser}>
              @{activeStory.profiles?.username}
            </span>
            <span style={styles.storyTimeLeft}>
              Expire dans {getTimeLeft(activeStory.expires_at)}
            </span>
            <button style={styles.closeBtn} onClick={closeStory}>✕</button>
          </div>

          {/* Vidéo story */}
          <video
            ref={videoRef}
            src={activeStory.video_url}
            autoPlay
            muted={false}
            playsInline
            loop
            style={styles.storyVideo}
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    display: 'flex',
    gap: 12,
    padding: '12px 16px',
    overflowX: 'auto',
    background: 'linear-gradient(rgba(0,0,0,0.6), transparent)',
    scrollbarWidth: 'none',
  },
  storyBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
    padding: 0,
  },
  ring: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    padding: 2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: '50%',
    objectFit: 'cover',
    border: '2px solid #000',
  },
  storyUsername: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 500,
    maxWidth: 56,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  storyTime: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
  },
  viewer: {
    position: 'fixed',
    inset: 0,
    zIndex: 100,
    background: '#000',
  },
  progressContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    background: 'rgba(255,255,255,0.3)',
    zIndex: 101,
  },
  progressFill: {
    height: '100%',
    background: '#fff',
    transition: 'width 0.1s linear',
  },
  storyHeader: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    zIndex: 101,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  storyAvatar: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    objectFit: 'cover',
    border: '2px solid rgba(255,255,255,0.5)',
  },
  storyUser: {
    color: '#fff',
    fontWeight: 700,
    fontSize: 14,
    flex: 1,
  },
  storyTimeLeft: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
  },
  closeBtn: {
    background: 'rgba(255,255,255,0.2)',
    border: 'none',
    color: '#fff',
    width: 32,
    height: 32,
    borderRadius: '50%',
    cursor: 'pointer',
    fontSize: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyVideo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
}
