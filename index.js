// compress-server/index.js
// Déploie ce fichier sur Render.com (service web gratuit)
// Build command: npm install
// Start command: node index.js

const express = require('express')
const multer = require('multer')
const ffmpeg = require('fluent-ffmpeg')
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg')
const { createClient } = require('@supabase/supabase-js')
const { v4: uuidv4 } = require('uuid')
const fs = require('fs')
const path = require('path')
const os = require('os')

ffmpeg.setFfmpegPath(ffmpegInstaller.path)

const app = express()
const upload = multer({ dest: os.tmpdir() })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Middleware CORS pour autoriser ton domaine Vercel
app.use((req, res, next) => {
  const allowed = process.env.ALLOWED_ORIGIN || '*'
  res.header('Access-Control-Allow-Origin', allowed)
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

// Vérifie que l'utilisateur est authentifié via Supabase
async function verifyUser(authHeader) {
  if (!authHeader) throw new Error('Non authentifié')
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) throw new Error('Token invalide')
  return user
}

// ============================================
// ROUTE : Upload + compression vidéo normale
// ============================================
app.post('/compress/video', upload.single('video'), async (req, res) => {
  const tmpInput = req.file?.path
  const tmpOutput = path.join(os.tmpdir(), `${uuidv4()}.mp4`)
  const thumbOutput = path.join(os.tmpdir(), `${uuidv4()}.jpg`)

  try {
    const user = await verifyUser(req.headers.authorization)
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' })

    // Vérifie la limite vidéos (5 max)
    const { count } = await supabase
      .from('videos')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if (count >= 5) {
      return res.status(403).json({
        error: 'Limite de 5 vidéos atteinte. Supprime une vidéo pour continuer.'
      })
    }

    // 1. Compresse la vidéo avec FFmpeg
    await new Promise((resolve, reject) => {
      ffmpeg(tmpInput)
        .outputOptions([
          '-t 60',           // Max 60 secondes
          '-vf scale=720:-2',// 720p max
          '-c:v libx264',
          '-crf 26',         // Compression qualité (23=haute, 28=basse)
          '-preset fast',
          '-c:a aac',
          '-b:a 128k',
          '-movflags +faststart', // Streaming optimisé
        ])
        .output(tmpOutput)
        .on('end', resolve)
        .on('error', reject)
        .run()
    })

    // 2. Génère une thumbnail (frame à 1 seconde)
    await new Promise((resolve, reject) => {
      ffmpeg(tmpOutput)
        .screenshots({
          timestamps: ['1'],
          filename: path.basename(thumbOutput),
          folder: os.tmpdir(),
          size: '480x?'
        })
        .on('end', resolve)
        .on('error', reject)
    })

    // 3. Upload sur Supabase Storage
    const videoId = uuidv4()
    const videoPath = `${user.id}/${videoId}.mp4`
    const thumbPath = `${user.id}/${videoId}.jpg`

    const videoFile = fs.readFileSync(tmpOutput)
    const thumbFile = fs.readFileSync(thumbOutput)

    const [videoUpload, thumbUpload] = await Promise.all([
      supabase.storage.from('videos').upload(videoPath, videoFile, {
        contentType: 'video/mp4',
        upsert: false
      }),
      supabase.storage.from('thumbnails').upload(thumbPath, thumbFile, {
        contentType: 'image/jpeg',
        upsert: false
      })
    ])

    if (videoUpload.error) throw videoUpload.error

    const { data: { publicUrl: videoUrl } } = supabase.storage
      .from('videos').getPublicUrl(videoPath)
    const { data: { publicUrl: thumbUrl } } = supabase.storage
      .from('thumbnails').getPublicUrl(thumbPath)

    // 4. Récupère la durée de la vidéo
    const duration = await new Promise((resolve) => {
      ffmpeg.ffprobe(tmpOutput, (err, metadata) => {
        resolve(Math.round(metadata?.format?.duration || 10))
      })
    })

    res.json({ videoUrl, thumbUrl, duration, videoId })

  } catch (error) {
    console.error('Erreur compression vidéo:', error)
    res.status(500).json({ error: error.message })
  } finally {
    ;[tmpInput, tmpOutput, thumbOutput].forEach(f => {
      if (f && fs.existsSync(f)) fs.unlinkSync(f)
    })
  }
})

// ============================================
// ROUTE : Upload + compression STORY (10s max)
// ============================================
app.post('/compress/story', upload.single('video'), async (req, res) => {
  const tmpInput = req.file?.path
  const tmpOutput = path.join(os.tmpdir(), `story_${uuidv4()}.mp4`)
  const thumbOutput = path.join(os.tmpdir(), `story_thumb_${uuidv4()}.jpg`)

  try {
    const user = await verifyUser(req.headers.authorization)
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' })

    // Vérifie la limite stories (3 actives max)
    const { count } = await supabase
      .from('stories')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gt('expires_at', new Date().toISOString())

    if (count >= 3) {
      return res.status(403).json({
        error: '3 stories actives maximum. Attends qu\'une expire ou supprime-en une.'
      })
    }

    // Compression story : 10 secondes max, plus agressive
    await new Promise((resolve, reject) => {
      ffmpeg(tmpInput)
        .outputOptions([
          '-t 10',            // 10 secondes MAX pour les stories
          '-vf scale=480:-2', // 480p (plus léger que vidéo normale)
          '-c:v libx264',
          '-crf 28',          // Plus compressé
          '-preset fast',
          '-c:a aac',
          '-b:a 96k',
          '-movflags +faststart',
        ])
        .output(tmpOutput)
        .on('end', resolve)
        .on('error', reject)
        .run()
    })

    // Thumbnail story
    await new Promise((resolve, reject) => {
      ffmpeg(tmpOutput)
        .screenshots({
          timestamps: ['0.5'],
          filename: path.basename(thumbOutput),
          folder: os.tmpdir(),
          size: '480x?'
        })
        .on('end', resolve)
        .on('error', reject)
    })

    // Upload Supabase
    const storyId = uuidv4()
    const videoPath = `${user.id}/${storyId}.mp4`
    const thumbPath = `${user.id}/${storyId}.jpg`

    const [videoUpload] = await Promise.all([
      supabase.storage.from('stories').upload(videoPath, fs.readFileSync(tmpOutput), {
        contentType: 'video/mp4'
      }),
      supabase.storage.from('thumbnails').upload(thumbPath, fs.readFileSync(thumbOutput), {
        contentType: 'image/jpeg'
      })
    ])

    if (videoUpload.error) throw videoUpload.error

    const { data: { publicUrl: videoUrl } } = supabase.storage
      .from('stories').getPublicUrl(videoPath)
    const { data: { publicUrl: thumbUrl } } = supabase.storage
      .from('thumbnails').getPublicUrl(thumbPath)

    res.json({ videoUrl, thumbUrl, storyId })

  } catch (error) {
    console.error('Erreur compression story:', error)
    res.status(500).json({ error: error.message })
  } finally {
    ;[tmpInput, tmpOutput, thumbOutput].forEach(f => {
      if (f && fs.existsSync(f)) fs.unlinkSync(f)
    })
  }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Compress server running on port ${PORT}`))
