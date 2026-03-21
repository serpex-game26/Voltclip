'use client'
// components/UploadButton.tsx

import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'

interface Props {
  user: any
  onAuthRequired: () => void
  onUploaded: () => void
}

type UploadMode = 'video' | 'story'

export default function UploadButton({ user, onAuthRequired, onUploaded }: Props) {
  const [mode, setMode] = useState<UploadMode | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [form, setForm] = useState({ title: '', description: '' })
  const fileRef = useRef<HTMLInputElement>(null)

  const COMPRESS_URL = process.env.NEXT_PUBLIC_COMPRESS_SERVER_URL

  const handleOpen = (m: UploadMode) => {
    if (!user) { onAuthRequired(); return }
    setMode(m)
    setError('')
    setForm({ title: '', description: '' })
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !mode) return

    // Validation basique
    if (!file.type.startsWith('video/')) {
      setError('Seules les vidéos sont acceptées')
      return
    }
    if (file.size > 200 * 1024 * 1024) {
      setError('Fichier trop lourd (max 200 MB)')
      return
    }

    setUploading(true)
    setError('')
    setProgress('Compression en cours...')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Non connecté')

      // 1. Envoie au serveur de compression
      const formData = new FormData()
      formData.append('video', file)

      const endpoint = mode === 'story' ? '/compress/story' : '/compress/video'
      const res = await fetch(`${COMPRESS_URL}${endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Erreur serveur')

      setProgress('Enregistrement...')

      // 2. Enregistre dans la DB Supabase
      if (mode === 'video') {
        const { error: dbError } = await supabase.from('videos').insert({
          user_id: user.id,
          title: form.title || 'Sans titre',
          description: form.description,
          video_url: result.videoUrl,
          thumbnail_url: result.thumbUrl,
          duration: result.duration,
        })
        if (dbError) throw dbError
      } else {
        const { error: dbError } = await supabase.from('stories').insert({
          user_id: user.id,
          video_url: result.videoUrl,
          thumbnail_url: result.thumbUrl,
        })
        if (dbError) throw dbError
      }

      setMode(null)
      setProgress('')
      onUploaded()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <>
      {/* Boutons flottants */}
      <div style={styles.fab}>
        <button style={styles.storyFab} onClick={() => handleOpen('story')}>
          + Story
        </button>
        <button style={styles.videoFab} onClick={() => handleOpen('video')}>
          + Vidéo
        </button>
      </div>

      {/* Modal */}
      {mode && (
        <div style={styles.overlay} onClick={() => !uploading && setMode(null)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>
              {mode === 'story' ? '📸 Nouvelle Story (10s · expire 24h)' : '🎬 Nouvelle Vidéo (60s max)'}
            </h3>

            {mode === 'video' && (
              <>
                <input
                  style={styles.input}
                  placeholder="Titre *"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  disabled={uploading}
                />
                <textarea
                  style={{ ...styles.input, height: 80, resize: 'none' }}
                  placeholder="Description (optionnel)"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  disabled={uploading}
                />
              </>
            )}

            {mode === 'story' && (
              <p style={styles.hint}>
                Ta story sera visible 24h puis supprimée automatiquement. Max 3 stories actives simultanément.
              </p>
            )}

            {error && <p style={styles.error}>{error}</p>}

            {uploading ? (
              <div style={styles.uploadingState}>
                <div style={styles.spinner} />
                <p style={styles.progressText}>{progress}</p>
              </div>
            ) : (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="video/*"
                  style={{ display: 'none' }}
                  onChange={handleFileSelect}
                />
                <button
                  style={styles.selectBtn}
                  onClick={() => fileRef.current?.click()}
                >
                  Choisir une vidéo
                </button>
                <button style={styles.cancelBtn} onClick={() => setMode(null)}>
                  Annuler
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

const styles: Record<string, React.CSSProperties> = {
  fab: {
    position: 'fixed',
    bottom: 24,
    right: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    zIndex: 20,
  },
  storyFab: {
    background: 'rgba(255,255,255,0.15)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255,255,255,0.3)',
    color: '#fff',
    padding: '10px 18px',
    borderRadius: 24,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 14,
  },
  videoFab: {
    background: '#fe2c55',
    border: 'none',
    color: '#fff',
    padding: '12px 20px',
    borderRadius: 24,
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 15,
    boxShadow: '0 4px 20px rgba(254,44,85,0.5)',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'flex-end',
    zIndex: 50,
  },
  modal: {
    background: '#1a1a1a',
    width: '100%',
    borderRadius: '20px 20px 0 0',
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 700,
    margin: 0,
  },
  hint: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    margin: 0,
    lineHeight: 1.5,
  },
  input: {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 10,
    color: '#fff',
    padding: '12px 14px',
    fontSize: 15,
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
  },
  error: {
    color: '#ff4757',
    fontSize: 13,
    margin: 0,
    padding: '10px 14px',
    background: 'rgba(255,71,87,0.1)',
    borderRadius: 8,
    border: '1px solid rgba(255,71,87,0.3)',
  },
  uploadingState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    padding: '20px 0',
  },
  spinner: {
    width: 36,
    height: 36,
    border: '3px solid rgba(255,255,255,0.2)',
    borderTop: '3px solid #fe2c55',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  progressText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    margin: 0,
  },
  selectBtn: {
    background: '#fe2c55',
    border: 'none',
    color: '#fff',
    padding: '14px',
    borderRadius: 12,
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 15,
    width: '100%',
  },
  cancelBtn: {
    background: 'rgba(255,255,255,0.08)',
    border: 'none',
    color: 'rgba(255,255,255,0.6)',
    padding: '12px',
    borderRadius: 12,
    cursor: 'pointer',
    fontSize: 14,
    width: '100%',
  },
}
