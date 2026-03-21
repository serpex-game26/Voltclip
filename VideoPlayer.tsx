'use client'
// components/VideoPlayer.tsx

import { useRef, useEffect, useState } from 'react'
import { type Video } from '@/lib/supabase'

interface Props {
  video: Video
  index: number
  isActive: boolean
  onLike: (id: string, liked: boolean) => void
  onAuthRequired: () => void
  user: any
}

export default function VideoPlayer({ video, index, isActive, onLike, user }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [muted, setMuted] = useState(true)
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState(0)

  // Play/pause selon si la vidéo est visible
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (isActive) {
      el.play().catch(() => {})
    } else {
      el.pause()
      el.currentTime = 0
    }
  }, [isActive])

  // Barre de progression
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    const update = () => setProgress((el.currentTime / el.duration) * 100 || 0)
    el.addEventListener('timeupdate', update)
    return () => el.removeEventListener('timeupdate', update)
  }, [])

  const togglePlay = () => {
    const el = videoRef.current
    if (!el) return
    if (el.paused) { el.play(); setPaused(false) }
    else { el.pause(); setPaused(true) }
  }

  const formatCount = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
    return n.toString()
  }

  return (
    <div
      data-index={index}
      data-video-id={video.id}
      style={styles.container}
      onClick={togglePlay}
    >
      {/* Vidéo */}
      <video
        ref={videoRef}
        src={video.video_url}
        poster={video.thumbnail_url || undefined}
        loop
        muted={muted}
        playsInline
        preload="metadata"
        style={styles.video}
      />

      {/* Overlay dégradé bas */}
      <div style={styles.gradient} />

      {/* Icône pause */}
      {paused && (
        <div style={styles.pauseIcon}>▶</div>
      )}

      {/* Infos bas gauche */}
      <div style={styles.info}>
        <p style={styles.username}>@{video.profiles?.username}</p>
        {video.title && <p style={styles.title}>{video.title}</p>}
        {video.description && <p style={styles.description}>{video.description}</p>}
      </div>

      {/* Actions droite */}
      <div style={styles.actions} onClick={e => e.stopPropagation()}>
        {/* Like */}
        <button
          style={styles.actionBtn}
          onClick={() => onLike(video.id, !!video.liked_by_me)}
        >
          <span style={{ fontSize: 28, color: video.liked_by_me ? '#ff4757' : '#fff' }}>
            {video.liked_by_me ? '❤️' : '🤍'}
          </span>
          <span style={styles.actionCount}>{formatCount(video.likes_count)}</span>
        </button>

        {/* Vues */}
        <button style={styles.actionBtn}>
          <span style={{ fontSize: 28 }}>👁</span>
          <span style={styles.actionCount}>{formatCount(video.views_count)}</span>
        </button>

        {/* Son */}
        <button style={styles.actionBtn} onClick={() => setMuted(!muted)}>
          <span style={{ fontSize: 28 }}>{muted ? '🔇' : '🔊'}</span>
        </button>
      </div>

      {/* Barre de progression */}
      <div style={styles.progressBar}>
        <div style={{ ...styles.progressFill, width: `${progress}%` }} />
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    height: '100dvh',
    scrollSnapAlign: 'start',
    scrollSnapStop: 'always',
    background: '#000',
    overflow: 'hidden',
    cursor: 'pointer',
  },
  video: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
    background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
    pointerEvents: 'none',
  },
  pauseIcon: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    fontSize: 64,
    color: 'rgba(255,255,255,0.8)',
    pointerEvents: 'none',
  },
  info: {
    position: 'absolute',
    bottom: 70,
    left: 16,
    right: 80,
  },
  username: {
    margin: '0 0 4px',
    color: '#fff',
    fontWeight: 700,
    fontSize: 16,
  },
  title: {
    margin: '0 0 4px',
    color: '#fff',
    fontSize: 15,
    fontWeight: 600,
  },
  description: {
    margin: 0,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    lineHeight: 1.4,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  actions: {
    position: 'absolute',
    bottom: 80,
    right: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    alignItems: 'center',
  },
  actionBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    padding: 0,
  },
  actionCount: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
  },
  progressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    background: 'rgba(255,255,255,0.3)',
  },
  progressFill: {
    height: '100%',
    background: '#fff',
    transition: 'width 0.1s linear',
  },
}
