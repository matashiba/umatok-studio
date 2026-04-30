import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ChangeEvent,
  CSSProperties,
  DragEvent,
  MutableRefObject,
  PointerEvent,
  WheelEvent,
  SyntheticEvent,
} from 'react'
import './App.css'

type MediaKind = 'image' | 'video'

type MediaAsset = {
  url: string
  kind: MediaKind
  name?: string
  dataUrl?: string
  sourcePath?: string
}

type ClipAsset = MediaAsset & {
  id: string
  duration: number
  transition: 'none' | 'fade'
}

type Comment = {
  user: string
  body: string
}

type DragState = {
  pointerId: number
  startClientX: number
  startClientY: number
  startX: number
  startY: number
}

type AvatarDragState = {
  pointerId: number
  startClientX: number
  startClientY: number
  startX: number
  startY: number
}

type LayoutPart =
  | 'topBrand'
  | 'topTabs'
  | 'viewer'
  | 'creator'
  | 'railAvatar'
  | 'heartAction'
  | 'sparkAction'
  | 'shareAction'
  | 'heartEffect'
  | 'comments'

type LayoutSettings = {
  actionRailX: number
  actionRailY: number
  topBrandX: number
  topBrandY: number
  topTabsX: number
  topTabsY: number
  viewerX: number
  viewerY: number
  creatorX: number
  creatorY: number
  railAvatarX: number
  railAvatarY: number
  heartActionX: number
  heartActionY: number
  sparkActionX: number
  sparkActionY: number
  shareActionX: number
  shareActionY: number
  heartEffectX: number
  heartEffectY: number
  commentsX: number
  commentsY: number
}

type LayoutDragState = {
  pointerId: number
  part: LayoutPart
  startClientX: number
  startClientY: number
  startLayout: LayoutSettings
}

type SavedMediaAsset = {
  kind: MediaKind
  name?: string
  dataUrl?: string
  path?: string
  url?: string
  sourcePath?: string
  duration?: number
  transition?: 'none' | 'fade'
}

type ProjectData = {
  app: 'Umatok Studio'
  version: 1
  projectName?: string
  displayName: string
  handle: string
  title: string
  soundName: string
  viewerCount: string
  likeCount: string
  sparkCount: string
  heartEffect: boolean
  heartAmount: number
  heartSpeed: number
  heartSize: number
  heartColor: string
  exportWidth?: number
  exportHeight?: number
  mediaX: number
  mediaY: number
  mediaScale: number
  avatarX: number
  avatarY: number
  avatarScale: number
  layout?: LayoutSettings
  comments: Comment[]
  clips?: SavedMediaAsset[] | null
  insert?: SavedMediaAsset | null
  avatar?: SavedMediaAsset | null
  brandIcon?: SavedMediaAsset | null
  brandWordmark?: SavedMediaAsset | null
}

type ExportSize = {
  label: string
  width: number
  height: number
}

declare global {
  interface Window {
    umatok?: {
      saveBlob: (options: {
        title?: string
        defaultPath?: string
        filters?: Array<{ name: string; extensions: string[] }>
        data: string
      }) => Promise<{ canceled: boolean; filePath?: string }>
      getFilePath?: (file: File) => string
      saveProjectFolder?: (options: {
        project: ProjectData
        projectName?: string
        folderPath?: string
        assets: Array<{
          path: string
          sourcePath?: string
          dataUrl?: string
        }>
      }) => Promise<{ canceled: boolean; folderPath?: string }>
      openProjectFolder?: () => Promise<{ canceled: boolean; project?: ProjectData; folderPath?: string }>
    }
  }
}

const exportSizes: ExportSize[] = [
  { label: '1080 × 1920', width: 1080, height: 1920 },
  { label: '720 × 1280', width: 720, height: 1280 },
  { label: '540 × 960', width: 540, height: 960 },
]
const defaultExportSize = exportSizes[0]
const previewWidth = 368
const previewHeight = previewWidth * (16 / 9)
const previewFrameWidth = 390
const previewFrameHeight = previewHeight + 22
const commentIntervalMs = 2000
const commentFadeMs = 520
const maxEmbeddedProjectAssetSize = 25 * 1024 * 1024
const defaultLayout: LayoutSettings = {
  actionRailX: 0,
  actionRailY: 0,
  topBrandX: 0,
  topBrandY: 0,
  topTabsX: 0,
  topTabsY: 0,
  viewerX: 0,
  viewerY: 0,
  creatorX: 0,
  creatorY: 0,
  railAvatarX: 0,
  railAvatarY: 0,
  heartActionX: 0,
  heartActionY: 0,
  sparkActionX: 0,
  sparkActionY: 0,
  shareActionX: 0,
  shareActionY: 0,
  heartEffectX: 0,
  heartEffectY: 0,
  commentsX: 0,
  commentsY: 0,
}

const defaultComments: Comment[] = [
  { user: 'mika', body: 'この画角いい感じ' },
  { user: 'ren_works', body: '背景を少し暗くすると映えそう' },
  { user: 'sora', body: 'ハート増やしてほしい' },
]

const quickComments: Comment[] = [
  { user: 'mika', body: 'かわいい！' },
  { user: 'ren_works', body: '今のところもう一回見たい' },
  { user: 'sora', body: '編集うますぎ' },
  { user: 'yuki', body: '最高です！' },
  { user: 'kaito', body: '作業BGM何ですか？' },
  { user: 'nana', body: 'この雰囲気好き' },
]

const heartParticles = Array.from({ length: 18 }, (_, index) => ({
  id: index,
  xDrift: -18 - ((index * 13) % 48),
  wobble: 7 + (index % 5) * 4,
  delay: (index % 9) * 0.22,
  duration: 2.3 + (index % 5) * 0.16,
  scale: 0.82 + (index % 4) * 0.16,
}))

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeHandle(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`
}

function assetPath(path: string) {
  return `${import.meta.env.BASE_URL}${path}`
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

async function blobToBase64(blob: Blob) {
  const buffer = await blob.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return window.btoa(binary)
}

async function saveBlob(blob: Blob, fileName: string, filters: Array<{ name: string; extensions: string[] }>) {
  if (window.umatok?.saveBlob) {
    const data = await blobToBase64(blob)
    await window.umatok.saveBlob({
      defaultPath: fileName,
      filters,
      data,
    })
    return
  }
  downloadBlob(blob, fileName)
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function getProjectFilePath(file: File) {
  return window.umatok?.getFilePath?.(file) || undefined
}

function getSafeAssetName(prefix: string, asset: MediaAsset) {
  const extension = asset.name?.match(/\.[a-z0-9]+$/i)?.[0] || (asset.kind === 'video' ? '.mp4' : '.png')
  return `assets/${prefix}${extension.toLowerCase()}`
}

function createClipId() {
  return `clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function escapeCsvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}

function parseCsvRows(csv: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index]
    const nextChar = csv[index + 1]
    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') {
        inQuotes = false
      } else {
        cell += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (char !== '\r') {
      cell += char
    }
  }

  row.push(cell)
  if (row.some((value) => value.trim())) rows.push(row)
  return rows
}

function getMp4MimeType() {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4;codecs=h264',
    'video/mp4',
  ]
  return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || ''
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return '00:00'
  const minutes = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, radius)
}

function drawHeartPath(ctx: CanvasRenderingContext2D, size: number) {
  const scale = size / 32
  ctx.beginPath()
  ctx.moveTo(16 * scale, 28 * scale)
  ctx.bezierCurveTo(6 * scale, 20 * scale, 1.5 * scale, 14 * scale, 3 * scale, 8 * scale)
  ctx.bezierCurveTo(4.2 * scale, 3 * scale, 10.5 * scale, 1.4 * scale, 16 * scale, 7.4 * scale)
  ctx.bezierCurveTo(21.5 * scale, 1.4 * scale, 27.8 * scale, 3 * scale, 29 * scale, 8 * scale)
  ctx.bezierCurveTo(30.5 * scale, 14 * scale, 26 * scale, 20 * scale, 16 * scale, 28 * scale)
  ctx.closePath()
}

function App() {
  const dragState = useRef<DragState | null>(null)
  const avatarDragState = useRef<AvatarDragState | null>(null)
  const layoutDragState = useRef<LayoutDragState | null>(null)
  const animationStartRef = useRef(performance.now())
  const historyTimerRef = useRef<number | null>(null)
  const lastHistorySnapshotRef = useRef('')
  const skipNextHistoryRef = useRef(false)
  const projectFileInputRef = useRef<HTMLInputElement | null>(null)
  const commentCsvInputRef = useRef<HTMLInputElement | null>(null)
  const brandIconInputRef = useRef<HTMLInputElement | null>(null)
  const brandWordmarkInputRef = useRef<HTMLInputElement | null>(null)
  const previewPanelRef = useRef<HTMLElement | null>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const mainMediaRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null)
  const avatarImageRef = useRef<HTMLImageElement | null>(null)
  const brandIconRef = useRef<HTMLImageElement | null>(null)
  const customBrandIconRef = useRef<HTMLImageElement | null>(null)
  const brandWordmarkRef = useRef<HTMLImageElement | null>(null)
  const heartIconRef = useRef<HTMLImageElement | null>(null)
  const customBrandWordmarkRef = useRef<HTMLImageElement | null>(null)
  const heartParticleRef = useRef<HTMLImageElement | null>(null)
  const sparkIconRef = useRef<HTMLImageElement | null>(null)
  const shareIconRef = useRef<HTMLImageElement | null>(null)

  const [displayName, setDisplayName] = useState('studio_nami')
  const [handle, setHandle] = useState('@nami_live')
  const [title, setTitle] = useState('夜の作業配信クリップ')
  const [soundName, setSoundName] = useState('')
  const [viewerCount, setViewerCount] = useState('12.8K')
  const [likeCount, setLikeCount] = useState('24.1K')
  const [sparkCount, setSparkCount] = useState('1,208')
  const [heartEffect, setHeartEffect] = useState(true)
  const [heartAmount, setHeartAmount] = useState(10)
  const [heartSpeed, setHeartSpeed] = useState(1)
  const [heartSize, setHeartSize] = useState(1)
  const [heartColor, setHeartColor] = useState('#ff4778')
  const [insert, setInsert] = useState<MediaAsset | null>(null)
  const [clips, setClips] = useState<ClipAsset[]>([])
  const [avatar, setAvatar] = useState<MediaAsset | null>(null)
  const [customBrandIcon, setCustomBrandIcon] = useState<MediaAsset | null>(null)
  const [customBrandWordmark, setCustomBrandWordmark] = useState<MediaAsset | null>(null)
  const [mediaX, setMediaX] = useState(50)
  const [mediaY, setMediaY] = useState(50)
  const [mediaScale, setMediaScale] = useState(100)
  const [avatarX, setAvatarX] = useState(50)
  const [avatarY, setAvatarY] = useState(50)
  const [avatarScale, setAvatarScale] = useState(100)
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false)
  const [isBrandModalOpen, setIsBrandModalOpen] = useState(false)
  const [isCommentModalOpen, setIsCommentModalOpen] = useState(false)
  const [isCommentMenuOpen, setIsCommentMenuOpen] = useState(false)
  const [isHeartModalOpen, setIsHeartModalOpen] = useState(false)
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false)
  const [isNoticeModalOpen, setIsNoticeModalOpen] = useState(false)
  const [comments, setComments] = useState(defaultComments)
  const [isExporting, setIsExporting] = useState(false)
  const [previewTime, setPreviewTime] = useState(0)
  const [previewDuration, setPreviewDuration] = useState(0)
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false)
  const [previewScale, setPreviewScale] = useState(1)
  const [isLayoutEditMode, setIsLayoutEditMode] = useState(false)
  const [layout, setLayout] = useState<LayoutSettings>(defaultLayout)
  const [exportSize, setExportSize] = useState<ExportSize>(defaultExportSize)
  const [historyPast, setHistoryPast] = useState<string[]>([])
  const [historyFuture, setHistoryFuture] = useState<string[]>([])
  const [currentProjectFolder, setCurrentProjectFolder] = useState('')

  const exportWidth = exportSize.width
  const exportHeight = exportSize.height

  const activeClipInfo = useMemo(() => {
    return getClipInfoAt(previewTime)
  }, [clips, previewTime])
  const activeClip = activeClipInfo.clip

  function getClipInfoAt(time: number) {
    let cursor = 0
    for (const clip of clips) {
      const duration = Math.max(0.1, clip.duration)
      if (time < cursor + duration || clip === clips[clips.length - 1]) {
        return { clip, start: cursor, localTime: Math.max(0, time - cursor) }
      }
      cursor += duration
    }
    return { clip: null as ClipAsset | null, start: 0, localTime: 0 }
  }

  const timelineDuration = useMemo(() => {
    if (clips.length) return clips.reduce((total, clip) => total + Math.max(0.1, clip.duration), 0)
    if (insert?.kind === 'video' && previewDuration > 0) return previewDuration
    return Math.max(6, Math.min(15, comments.length * (commentIntervalMs / 1000) + 1.2))
  }, [clips, comments.length, insert?.kind, previewDuration])
  const commentText = useMemo(
    () => comments.map((comment) => `${comment.user}: ${comment.body}`).join('\n'),
    [comments],
  )
  const mediaScaleRatio = mediaScale / 100
  const mediaPanRange = Math.max(0, (mediaScaleRatio - 1) * 50)
  const mediaTranslateX = ((50 - mediaX) / 50) * mediaPanRange
  const mediaTranslateY = ((50 - mediaY) / 50) * mediaPanRange
  const insertMediaStyle = {
    objectPosition: `${mediaX}% ${mediaY}%`,
    transform: `translate(${mediaTranslateX}%, ${mediaTranslateY}%) scale(${mediaScaleRatio})`,
  } as CSSProperties
  const avatarScaleRatio = avatarScale / 100
  const avatarMaxPan = ((avatarScaleRatio - 1) / (2 * avatarScaleRatio)) * 100
  const avatarTranslateX = ((50 - avatarX) / 50) * avatarMaxPan
  const avatarTranslateY = ((50 - avatarY) / 50) * avatarMaxPan
  const avatarImageStyle = {
    objectPosition: `${avatarX}% ${avatarY}%`,
    transform: `scale(${avatarScaleRatio}) translate(${avatarTranslateX}%, ${avatarTranslateY}%)`,
  } as CSSProperties
  const normalizedHandle = normalizeHandle(handle)

  function applyProjectSnapshot(snapshot: string) {
    skipNextHistoryRef.current = true
    applyProject(JSON.parse(snapshot) as ProjectData)
  }

  function undoProject() {
    setHistoryPast((past) => {
      if (past.length < 2) return past
      const current = past[past.length - 1]
      const previous = past[past.length - 2]
      setHistoryFuture((future) => [current, ...future].slice(0, 50))
      applyProjectSnapshot(previous)
      lastHistorySnapshotRef.current = previous
      return past.slice(0, -1)
    })
  }

  function redoProject() {
    setHistoryFuture((future) => {
      const [next, ...rest] = future
      if (!next) return future
      setHistoryPast((past) => [...past, next].slice(-50))
      applyProjectSnapshot(next)
      lastHistorySnapshotRef.current = next
      return rest
    })
  }

  useEffect(() => {
    try {
      const hasSeenGuide = window.localStorage.getItem('umatok-guide-seen')
      if (!hasSeenGuide) {
        setIsGuideModalOpen(true)
        window.localStorage.setItem('umatok-guide-seen', '1')
      }
      const autosave = window.localStorage.getItem('umatok-autosave')
      if (autosave) {
        applyProjectSnapshot(autosave)
        lastHistorySnapshotRef.current = autosave
        setHistoryPast([autosave])
      }
    } catch {
      setIsGuideModalOpen(true)
    }
  }, [])

  useEffect(() => {
    const snapshot = JSON.stringify(createProjectData(false))
    window.localStorage.setItem('umatok-autosave', snapshot)
    if (skipNextHistoryRef.current) {
      skipNextHistoryRef.current = false
      return undefined
    }
    if (historyTimerRef.current) window.clearTimeout(historyTimerRef.current)
    historyTimerRef.current = window.setTimeout(() => {
      if (snapshot !== lastHistorySnapshotRef.current) {
        lastHistorySnapshotRef.current = snapshot
        setHistoryPast((past) => [...past, snapshot].slice(-50))
        setHistoryFuture([])
      }
    }, 450)
    return () => {
      if (historyTimerRef.current) window.clearTimeout(historyTimerRef.current)
    }
  }, [
    avatarScale,
    avatarX,
    avatarY,
    comments,
    displayName,
    exportHeight,
    exportWidth,
    handle,
    heartAmount,
    heartColor,
    heartEffect,
    heartSize,
    heartSpeed,
    layout,
    likeCount,
    mediaScale,
    mediaX,
    mediaY,
    soundName,
    sparkCount,
    title,
    viewerCount,
  ])

  useEffect(() => {
    const panel = previewPanelRef.current
    if (!panel) return undefined
    const currentPanel = panel
    function updatePreviewScale() {
      const bounds = currentPanel.getBoundingClientRect()
      const availableWidth = Math.max(320, bounds.width - 48)
      const availableHeight = Math.max(360, bounds.height - 132)
      setPreviewScale(clamp(Math.min(1, availableWidth / previewFrameWidth, availableHeight / previewFrameHeight), 0.52, 1))
    }
    updatePreviewScale()
    const observer = new ResizeObserver(updatePreviewScale)
    observer.observe(currentPanel)
    window.addEventListener('resize', updatePreviewScale)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updatePreviewScale)
    }
  }, [])

  function getPreviewMetrics() {
    return {
      width: previewWidth,
      height: previewHeight,
      scaleX: exportWidth / previewWidth,
      scaleY: exportHeight / previewHeight,
    }
  }

  function px(value: number) {
    return value * getPreviewMetrics().scaleX
  }

  function py(value: number) {
    return value * getPreviewMetrics().scaleY
  }

  function getActionPositions(currentLayout = layout) {
    const metrics = getPreviewMetrics()
    const railRight = 8
    const railBottom = 112
    const railGap = 14
    const railAvatarSize = 46
    const actionButtonHeight = 58
    const actionIconOffset = 15.5
    const railHeight = railAvatarSize + railGap * 3 + actionButtonHeight * 3
    const centerX = metrics.width - railRight - railAvatarSize / 2 + currentLayout.actionRailX
    const top = metrics.height - railBottom - railHeight + currentLayout.actionRailY
    return {
      railAvatar: {
        x: centerX + currentLayout.railAvatarX,
        y: top + railAvatarSize / 2 + currentLayout.railAvatarY,
      },
      plus: {
        x: centerX + currentLayout.railAvatarX,
        y: top + railAvatarSize + 0.5 + currentLayout.railAvatarY,
      },
      heartAction: {
        x: centerX + currentLayout.heartActionX,
        y: top + railAvatarSize + railGap + actionIconOffset + currentLayout.heartActionY,
      },
      sparkAction: {
        x: centerX + currentLayout.sparkActionX,
        y: top + railAvatarSize + railGap + actionIconOffset + actionButtonHeight + railGap + currentLayout.sparkActionY,
      },
      shareAction: {
        x: centerX + currentLayout.shareActionX,
        y: top + railAvatarSize + railGap + actionIconOffset + (actionButtonHeight + railGap) * 2 + currentLayout.shareActionY,
      },
    }
  }

  function getLayoutBounds(part: LayoutPart, currentLayout = layout) {
    const actionPositions = getActionPositions(currentLayout)
    const actionBounds = (center: { x: number; y: number }, height = 58) => ({
      x: center.x - 24,
      y: center.y - 18,
      width: 48,
      height,
    })
    switch (part) {
      case 'topBrand':
        return { x: 15 + currentLayout.topBrandX, y: 15 + currentLayout.topBrandY, width: 104, height: 24 }
      case 'topTabs':
        return { x: 120 + currentLayout.topTabsX, y: 12 + currentLayout.topTabsY, width: 150, height: 36 }
      case 'viewer':
        return { x: 300 + currentLayout.viewerX, y: 13 + currentLayout.viewerY, width: 55, height: 27 }
      case 'creator':
        return { x: 16 + currentLayout.creatorX, y: 56 + currentLayout.creatorY, width: 302, height: 104 }
      case 'railAvatar':
        return actionBounds(actionPositions.railAvatar, 58)
      case 'heartAction':
        return actionBounds(actionPositions.heartAction)
      case 'sparkAction':
        return actionBounds(actionPositions.sparkAction)
      case 'shareAction':
        return actionBounds(actionPositions.shareAction)
      case 'heartEffect':
        return {
          x: actionPositions.heartAction.x - 98 + currentLayout.heartEffectX,
          y: actionPositions.heartAction.y - 260 + currentLayout.heartEffectY,
          width: 112,
          height: 250,
        }
      case 'comments':
        return getCommentsBounds(currentLayout)
      default:
        return getCommentsBounds(currentLayout)
    }
  }

  function getCommentsBounds(currentLayout = layout) {
    const metrics = getPreviewMetrics()
    return {
      x: 16 + currentLayout.commentsX,
      y: metrics.height - 14 - 38 - 150 + currentLayout.commentsY,
      width: metrics.width - 16 - 72,
      height: 188,
    }
  }

  function getPointerInPreview(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * previewWidth,
      y: ((event.clientY - bounds.top) / bounds.height) * previewHeight,
    }
  }

  function hitTestLayoutPart(point: { x: number; y: number }): LayoutPart | null {
    const parts: LayoutPart[] = [
      'railAvatar',
      'heartAction',
      'sparkAction',
      'shareAction',
      'heartEffect',
      'comments',
      'creator',
      'viewer',
      'topTabs',
      'topBrand',
    ]
    for (const part of parts) {
      const bounds = getLayoutBounds(part)
      if (
        point.x >= bounds.x - 8 &&
        point.x <= bounds.x + bounds.width + 8 &&
        point.y >= bounds.y - 8 &&
        point.y <= bounds.y + bounds.height + 8
      ) {
        return part
      }
    }
    return null
  }

  function moveLayoutPart(baseLayout: LayoutSettings, part: LayoutPart, deltaX: number, deltaY: number) {
    const nextLayout = { ...baseLayout }
    const keys: Record<LayoutPart, [keyof LayoutSettings, keyof LayoutSettings]> = {
      topBrand: ['topBrandX', 'topBrandY'],
      topTabs: ['topTabsX', 'topTabsY'],
      viewer: ['viewerX', 'viewerY'],
      creator: ['creatorX', 'creatorY'],
      railAvatar: ['railAvatarX', 'railAvatarY'],
      heartAction: ['heartActionX', 'heartActionY'],
      sparkAction: ['sparkActionX', 'sparkActionY'],
      shareAction: ['shareActionX', 'shareActionY'],
      heartEffect: ['heartEffectX', 'heartEffectY'],
      comments: ['commentsX', 'commentsY'],
    }
    const [xKey, yKey] = keys[part]
    nextLayout[xKey] = clamp(Number(baseLayout[xKey]) + deltaX, -260, 260)
    nextLayout[yKey] = clamp(Number(baseLayout[yKey]) + deltaY, -360, 360)
    return nextLayout
  }

  async function updateMediaFromFile(
    file: File | undefined,
    setter: (asset: MediaAsset | null) => void,
    acceptsVideo: boolean,
  ) {
    if (!file) return
    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')
    if (!isImage && (!acceptsVideo || !isVideo)) return
    const dataUrl = file.size <= maxEmbeddedProjectAssetSize ? await readFileAsDataUrl(file) : undefined
    if (acceptsVideo) {
      setPreviewTime(0)
      setPreviewDuration(0)
      setIsPreviewPlaying(false)
    }
    setter({
      url: URL.createObjectURL(file),
      kind: isVideo ? 'video' : 'image',
      name: file.name,
      dataUrl,
      sourcePath: getProjectFilePath(file),
    })
  }

  async function createClipFromFile(file: File): Promise<ClipAsset | null> {
    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')
    if (!isImage && !isVideo) return null
    const dataUrl = file.size <= maxEmbeddedProjectAssetSize ? await readFileAsDataUrl(file) : undefined
    return {
      id: createClipId(),
      url: URL.createObjectURL(file),
      kind: isVideo ? 'video' : 'image',
      name: file.name,
      dataUrl,
      sourcePath: getProjectFilePath(file),
      duration: isVideo ? 6 : 3,
      transition: 'none',
    }
  }

  async function addClipFiles(files: FileList | File[]) {
    const nextClips = (await Promise.all(Array.from(files).map((file) => createClipFromFile(file)))).filter(
      Boolean,
    ) as ClipAsset[]
    if (!nextClips.length) return
    setClips((current) => [...current, ...nextClips])
    setInsert(nextClips[0])
    setPreviewTime(0)
    setPreviewDuration(0)
    setIsPreviewPlaying(false)
  }

  function updateMedia(
    event: ChangeEvent<HTMLInputElement>,
    setter: (asset: MediaAsset | null) => void,
    acceptsVideo = true,
  ) {
    updateMediaFromFile(event.target.files?.[0], setter, acceptsVideo)
    event.target.value = ''
  }

  async function updateBrandIcon(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !file.type.startsWith('image/')) return
    const dataUrl = await readFileAsDataUrl(file)
    setCustomBrandIcon({
      url: dataUrl,
      kind: 'image',
      name: file.name,
      dataUrl,
      sourcePath: getProjectFilePath(file),
    })
  }

  async function updateBrandWordmark(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !file.type.startsWith('image/')) return
    const dataUrl = await readFileAsDataUrl(file)
    setCustomBrandWordmark({
      url: dataUrl,
      kind: 'image',
      name: file.name,
      dataUrl,
      sourcePath: getProjectFilePath(file),
    })
  }

  function handleDrop(
    event: DragEvent<HTMLElement>,
    setter: (asset: MediaAsset | null) => void,
    acceptsVideo: boolean,
  ) {
    event.preventDefault()
    updateMediaFromFile(event.dataTransfer.files[0], setter, acceptsVideo)
  }

  function handleClipsDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    addClipFiles(event.dataTransfer.files)
  }

  function updateClips(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) addClipFiles(event.target.files)
    event.target.value = ''
  }

  function updateComment(index: number, key: keyof Comment, value: string) {
    setComments((currentComments) =>
      currentComments.map((comment, commentIndex) =>
        commentIndex === index ? { ...comment, [key]: value } : comment,
      ),
    )
  }

  function updateComments(value: string) {
    const nextComments = value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [user, ...body] = line.split(':')
        return {
          user: user.trim() || 'guest',
          body: body.join(':').trim() || line,
        }
      })
    setComments(nextComments)
  }

  function saveCommentsCsv() {
    const header = ['user', 'body'].map(escapeCsvCell).join(',')
    const rows = comments.map((comment) =>
      [comment.user, comment.body].map((value) => escapeCsvCell(value)).join(','),
    )
    downloadBlob(
      new Blob([`\uFEFF${[header, ...rows].join('\n')}`], { type: 'text/csv;charset=utf-8' }),
      'umatok-comments.csv',
    )
  }

  function loadCommentsCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const rows = parseCsvRows(String(reader.result).replace(/^\uFEFF/, ''))
      const hasHeader =
        rows[0]?.[0]?.trim().toLowerCase() === 'user' &&
        rows[0]?.[1]?.trim().toLowerCase() === 'body'
      const commentRows = (hasHeader ? rows.slice(1) : rows)
        .map(([user = '', body = '']) => ({
          user: user.trim() || 'guest',
          body: body.trim(),
        }))
        .filter((comment) => comment.body)
      if (!commentRows.length) {
        alert('読み込めるコメントがありませんでした。CSVは user,body の2列で作成してください。')
        return
      }
      setComments(commentRows)
      setPreviewTime(0)
    }
    reader.readAsText(file)
  }

  function createProjectData(includeAssets = false): ProjectData {
    const shouldEmbedAsset = (asset: MediaAsset | null) => includeAssets && asset?.kind === 'image'
    return {
      app: 'Umatok Studio',
      version: 1,
      projectName: title || displayName || 'Umatok Project',
      displayName,
      handle: normalizedHandle,
      title,
      soundName,
      viewerCount,
      likeCount,
      sparkCount,
      heartEffect,
      heartAmount,
      heartSpeed,
      heartSize,
      heartColor,
      exportWidth,
      exportHeight,
      mediaX,
      mediaY,
      mediaScale,
      avatarX,
      avatarY,
      avatarScale,
      layout,
      comments,
      clips: clips.map((clip) => ({
        kind: clip.kind,
        name: clip.name,
        duration: clip.duration,
        transition: clip.transition,
        dataUrl: shouldEmbedAsset(clip) ? clip.dataUrl : undefined,
      })),
      insert: insert
        ? {
            kind: insert.kind,
            name: insert.name,
            dataUrl: shouldEmbedAsset(insert) ? insert.dataUrl : undefined,
          }
        : null,
      avatar: avatar
        ? {
            kind: avatar.kind,
            name: avatar.name,
            dataUrl: shouldEmbedAsset(avatar) ? avatar.dataUrl : undefined,
          }
        : null,
      brandIcon: customBrandIcon
        ? {
            kind: customBrandIcon.kind,
            name: customBrandIcon.name,
            dataUrl: shouldEmbedAsset(customBrandIcon) ? customBrandIcon.dataUrl : undefined,
          }
        : null,
      brandWordmark: customBrandWordmark
        ? {
            kind: customBrandWordmark.kind,
            name: customBrandWordmark.name,
            dataUrl: shouldEmbedAsset(customBrandWordmark) ? customBrandWordmark.dataUrl : undefined,
          }
        : null,
    }
  }

  function createProjectFolderData() {
    const project = createProjectData(false)
    const assets: Array<{ path: string; sourcePath?: string; dataUrl?: string }> = []
    const attachAsset = (
      key: 'insert' | 'avatar' | 'brandIcon' | 'brandWordmark',
      asset: MediaAsset | null,
      prefix: string,
    ) => {
      if (!asset) return
      const assetPath = getSafeAssetName(prefix, asset)
      project[key] = {
        kind: asset.kind,
        name: asset.name,
        path: assetPath,
      }
      assets.push({
        path: assetPath,
        sourcePath: asset.sourcePath,
        dataUrl: asset.dataUrl,
      })
    }

    project.clips = clips.map((clip, index) => {
      const assetPath = getSafeAssetName(`${String(index + 1).padStart(2, '0')}-${clip.kind}`, clip)
      assets.push({
        path: assetPath,
        sourcePath: clip.sourcePath,
        dataUrl: clip.dataUrl,
      })
      return {
        kind: clip.kind,
        name: clip.name,
        path: assetPath,
        duration: clip.duration,
        transition: clip.transition,
      }
    })
    attachAsset('insert', clips[0] || insert, (clips[0] || insert)?.kind === 'video' ? 'main-video' : 'main-image')
    attachAsset('avatar', avatar, 'avatar')
    attachAsset('brandIcon', customBrandIcon, 'brand-icon')
    attachAsset('brandWordmark', customBrandWordmark, 'brand-wordmark')
    return { project, assets }
  }

  async function saveProject() {
    if (window.umatok?.saveProjectFolder) {
      const suggestedName = title.trim() || displayName.trim() || 'Umatok Project'
      const { project, assets } = createProjectFolderData()
      project.projectName = suggestedName
      const missingAssets = assets.filter((asset) => !asset.sourcePath && !asset.dataUrl)
      if (missingAssets.length) {
        alert('元ファイルの場所を確認できない素材があります。素材を選び直してから保存してください。')
        return
      }
      const result = await window.umatok.saveProjectFolder({
        project,
        projectName: project.projectName,
        folderPath: currentProjectFolder || undefined,
        assets,
      })
      if (!result.canceled && result.folderPath) {
        setCurrentProjectFolder(result.folderPath)
        alert(`プロジェクトを保存しました。\n${result.folderPath}`)
      }
      return
    }

    const project = createProjectData(true)
    downloadBlob(
      new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }),
      'umatok-project.json',
    )
  }

  function restoreMedia(asset: SavedMediaAsset | null | undefined): MediaAsset | null {
    if (!asset?.dataUrl && !asset?.url) return null
    return {
      url: asset.url || asset.dataUrl || '',
      kind: asset.kind,
      name: asset.name,
      dataUrl: asset.dataUrl,
      sourcePath: asset.sourcePath,
    }
  }

  function restoreClip(asset: SavedMediaAsset | null | undefined): ClipAsset | null {
    const media = restoreMedia(asset)
    if (!media) return null
    return {
      ...media,
      id: createClipId(),
      duration: clamp(Number(asset?.duration) || (media.kind === 'image' ? 3 : 6), 0.5, 600),
      transition: asset?.transition || 'none',
    }
  }

  function applyProject(project: ProjectData) {
    setDisplayName(project.displayName || 'studio_nami')
    setHandle(normalizeHandle(project.handle || '@nami_live'))
    setTitle(project.title || '')
    setSoundName(project.soundName || '')
    setViewerCount(project.viewerCount || '0')
    setLikeCount(project.likeCount || '0')
    setSparkCount(project.sparkCount || '0')
    setHeartEffect(Boolean(project.heartEffect))
    setHeartAmount(clamp(Number(project.heartAmount) || 10, 1, 18))
    setHeartSpeed(clamp(Number(project.heartSpeed) || 1, 0.3, 2.5))
    setHeartSize(clamp(Number(project.heartSize) || 1, 0.5, 1.8))
    setHeartColor(project.heartColor || '#ff4778')
    const nextExportSize =
      exportSizes.find((size) => size.width === project.exportWidth && size.height === project.exportHeight) ||
      defaultExportSize
    setExportSize(nextExportSize)
    setMediaX(clamp(Number(project.mediaX) || 50, 0, 100))
    setMediaY(clamp(Number(project.mediaY) || 50, 0, 100))
    setMediaScale(clamp(Number(project.mediaScale) || 100, 80, 220))
    setAvatarX(clamp(Number(project.avatarX) || 50, 0, 100))
    setAvatarY(clamp(Number(project.avatarY) || 50, 0, 100))
    setAvatarScale(clamp(Number(project.avatarScale) || 100, 100, 220))
    setLayout({
      ...defaultLayout,
      ...project.layout,
    })
    setComments(Array.isArray(project.comments) ? project.comments : [])
    const restoredClips = Array.isArray(project.clips)
      ? (project.clips.map(restoreClip).filter(Boolean) as ClipAsset[])
      : []
    const legacyInsert = restoreMedia(project.insert)
    setClips(restoredClips.length ? restoredClips : legacyInsert ? [{ ...legacyInsert, id: createClipId(), duration: legacyInsert.kind === 'image' ? 3 : 6, transition: 'none' }] : [])
    setInsert(restoredClips[0] || legacyInsert)
    setAvatar(restoreMedia(project.avatar))
    setCustomBrandIcon(restoreMedia(project.brandIcon))
    setCustomBrandWordmark(restoreMedia(project.brandWordmark))
    setPreviewTime(0)
    setPreviewDuration(0)
    setIsPreviewPlaying(false)
    mainMediaRef.current = null
    avatarImageRef.current = null
  }

  useEffect(() => {
    if (!isPreviewPlaying || (!activeClip && insert?.kind === 'video')) return undefined
    let frameId = 0
    let lastTime = performance.now()
    function tick(now: number) {
      const deltaSeconds = (now - lastTime) / 1000
      lastTime = now
      setPreviewTime((currentTime) => {
        const nextTime = currentTime + deltaSeconds
        if (nextTime >= timelineDuration) {
          setIsPreviewPlaying(false)
          return timelineDuration
        }
        return nextTime
      })
      frameId = requestAnimationFrame(tick)
    }
    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [activeClip, insert?.kind, isPreviewPlaying, timelineDuration])

  useEffect(() => {
    const mediaElement = mainMediaRef.current
    if (!activeClip || !(mediaElement instanceof HTMLVideoElement)) return
    if (Math.abs(mediaElement.currentTime - activeClipInfo.localTime) > 0.35) {
      mediaElement.currentTime = activeClipInfo.localTime
    }
    if (isPreviewPlaying) {
      mediaElement.play().catch(() => undefined)
      return
    }
    mediaElement.pause()
  }, [activeClip?.id, isPreviewPlaying])

  function loadProject(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const project = JSON.parse(String(reader.result)) as ProjectData
        if (project.app !== 'Umatok Studio' || project.version !== 1) {
          throw new Error('Unsupported project file')
        }
        applyProject(project)
        setCurrentProjectFolder('')
      } catch {
        alert('Umatok Studioのプロジェクトファイルを読み込めませんでした。')
      }
    }
    reader.readAsText(file)
  }

  async function openProject() {
    if (window.umatok?.openProjectFolder) {
      const result = await window.umatok.openProjectFolder()
      if (!result.canceled && result.project) {
        applyProject(result.project)
        setCurrentProjectFolder(result.folderPath || '')
      }
      return
    }
    projectFileInputRef.current?.click()
  }

  function addComment(comment = { user: 'guest', body: 'コメントを入力' }) {
    setComments((currentComments) => [...currentComments, comment])
  }

  function removeComment(index: number) {
    setComments((currentComments) => currentComments.filter((_, commentIndex) => commentIndex !== index))
  }

  function resetAvatar() {
    setAvatar(null)
    setAvatarX(50)
    setAvatarY(50)
    setAvatarScale(100)
    setIsAvatarModalOpen(false)
    avatarImageRef.current = null
  }

  function resetMainMedia() {
    setInsert(null)
    setClips([])
    setMediaX(50)
    setMediaY(50)
    setMediaScale(100)
    setPreviewTime(0)
    setPreviewDuration(0)
    setIsPreviewPlaying(false)
    mainMediaRef.current = null
  }

  function togglePreviewPlayback() {
    const mediaElement = mainMediaRef.current
    if (activeClip) {
      setPreviewTime((currentTime) => (currentTime >= timelineDuration ? 0 : currentTime))
      setIsPreviewPlaying((current) => !current)
      return
    }
    if (!(mediaElement instanceof HTMLVideoElement)) {
      setPreviewTime((currentTime) => (currentTime >= timelineDuration ? 0 : currentTime))
      setIsPreviewPlaying((current) => !current)
      return
    }
    if (mediaElement.paused) {
      mediaElement.play().catch(() => undefined)
      return
    }
    mediaElement.pause()
  }

  function seekPreview(value: string) {
    const nextTime = clamp(Number(value), 0, timelineDuration)
    const nextClipInfo = getClipInfoAt(nextTime)
    setPreviewTime(nextTime)
    const mediaElement = mainMediaRef.current
    if (mediaElement instanceof HTMLVideoElement) {
      mediaElement.currentTime = nextClipInfo.clip ? nextClipInfo.localTime : nextTime
    }
  }

  function beginMediaDrag(event: PointerEvent<HTMLDivElement>) {
    if (isLayoutEditMode) {
      const part = hitTestLayoutPart(getPointerInPreview(event))
      if (!part) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      layoutDragState.current = {
        pointerId: event.pointerId,
        part,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startLayout: layout,
      }
      return
    }
    if (!insert && !activeClip) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragState.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: mediaX,
      startY: mediaY,
    }
  }

  function moveMedia(event: PointerEvent<HTMLDivElement>) {
    const layoutDrag = layoutDragState.current
    if (layoutDrag && layoutDrag.pointerId === event.pointerId) {
      event.preventDefault()
      const bounds = event.currentTarget.getBoundingClientRect()
      const deltaX = ((event.clientX - layoutDrag.startClientX) / bounds.width) * previewWidth
      const deltaY = ((event.clientY - layoutDrag.startClientY) / bounds.height) * previewHeight
      setLayout(() => moveLayoutPart(layoutDrag.startLayout, layoutDrag.part, deltaX, deltaY))
      return
    }
    const drag = dragState.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    const bounds = event.currentTarget.getBoundingClientRect()
    const dragSensitivity = mediaScale > 100 ? 1.8 : 1
    const deltaX = ((event.clientX - drag.startClientX) / bounds.width) * 100 * dragSensitivity
    const deltaY = ((event.clientY - drag.startClientY) / bounds.height) * 100 * dragSensitivity
    setMediaX(Math.round(clamp(drag.startX - deltaX, 0, 100)))
    setMediaY(Math.round(clamp(drag.startY - deltaY, 0, 100)))
  }

  function endMediaDrag(event: PointerEvent<HTMLDivElement>) {
    if (layoutDragState.current?.pointerId === event.pointerId) {
      layoutDragState.current = null
    }
    if (dragState.current?.pointerId === event.pointerId) {
      dragState.current = null
    }
  }

  function zoomMedia(event: WheelEvent<HTMLDivElement>) {
    if (isLayoutEditMode) return
    if (!insert && !activeClip) return
    event.preventDefault()
    setMediaScale((currentScale) => clamp(currentScale + (event.deltaY > 0 ? -5 : 5), 80, 220))
  }

  function beginAvatarDrag(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    avatarDragState.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: avatarX,
      startY: avatarY,
    }
  }

  function moveAvatar(event: PointerEvent<HTMLDivElement>) {
    const drag = avatarDragState.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const dragSensitivity = 2.2
    const deltaX = ((event.clientX - drag.startClientX) / bounds.width) * 100 * dragSensitivity
    const deltaY = ((event.clientY - drag.startClientY) / bounds.height) * 100 * dragSensitivity
    setAvatarX(Math.round(clamp(drag.startX - deltaX, 0, 100)))
    setAvatarY(Math.round(clamp(drag.startY - deltaY, 0, 100)))
  }

  function endAvatarDrag(event: PointerEvent<HTMLDivElement>) {
    if (avatarDragState.current?.pointerId === event.pointerId) {
      avatarDragState.current = null
    }
  }

  function zoomAvatar(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault()
    setAvatarScale((currentScale) => clamp(currentScale + (event.deltaY > 0 ? -5 : 5), 100, 220))
  }

  function drawMedia(ctx: CanvasRenderingContext2D) {
    const mediaElement = mainMediaRef.current
    const canDrawMedia =
      mediaElement instanceof HTMLVideoElement
        ? mediaElement.readyState >= 2
        : mediaElement instanceof HTMLImageElement && mediaElement.complete

    if (!mediaElement || !canDrawMedia) {
      ctx.fillStyle = '#1f2730'
      ctx.fillRect(0, 0, exportWidth, exportHeight)
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.lineWidth = px(9)
      for (let x = -exportHeight; x < exportWidth + exportHeight; x += px(18)) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x + exportHeight, exportHeight)
        ctx.stroke()
      }
      ctx.fillStyle = 'rgba(255,255,255,0.58)'
      ctx.font = `900 ${px(11)}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('DROP MEDIA', exportWidth / 2, exportHeight / 2)
      return
    }

    const sourceWidth =
      mediaElement instanceof HTMLVideoElement ? mediaElement.videoWidth : mediaElement.naturalWidth
    const sourceHeight =
      mediaElement instanceof HTMLVideoElement ? mediaElement.videoHeight : mediaElement.naturalHeight
    const coverScale = Math.max(exportWidth / sourceWidth, exportHeight / sourceHeight)
    const width = sourceWidth * coverScale * (mediaScale / 100)
    const height = sourceHeight * coverScale * (mediaScale / 100)
    const x = (exportWidth - width) * (mediaX / 100)
    const y = (exportHeight - height) * (mediaY / 100)
    ctx.drawImage(mediaElement, x, y, width, height)
    if (activeClip?.transition === 'fade') {
      const fadeSeconds = Math.min(0.45, activeClip.duration / 3)
      const fadeIn = clamp(activeClipInfo.localTime / fadeSeconds, 0, 1)
      const fadeOut = clamp((activeClip.duration - activeClipInfo.localTime) / fadeSeconds, 0, 1)
      const alpha = Math.min(fadeIn, fadeOut)
      if (alpha < 1) {
        ctx.fillStyle = `rgba(0,0,0,${1 - alpha})`
        ctx.fillRect(0, 0, exportWidth, exportHeight)
      }
    }
  }

  function drawExportFrame(
    ctx: CanvasRenderingContext2D,
    elapsedMs = 0,
    heartElapsedMs = elapsedMs,
    showLayoutHandles = false,
  ) {
    ctx.clearRect(0, 0, exportWidth, exportHeight)
    drawMedia(ctx)
    drawVignette(ctx)
    drawTopBar(ctx)
    drawCreatorStrip(ctx)
    drawActionRail(ctx, heartElapsedMs)
    drawBottomInfo(ctx, elapsedMs)
    if (showLayoutHandles) drawLayoutHandles(ctx)
  }

  function drawVignette(ctx: CanvasRenderingContext2D) {
    const gradient = ctx.createLinearGradient(0, 0, 0, exportHeight)
    gradient.addColorStop(0, 'rgba(0,0,0,0.56)')
    gradient.addColorStop(0.28, 'rgba(0,0,0,0)')
    gradient.addColorStop(0.58, 'rgba(0,0,0,0)')
    gradient.addColorStop(1, 'rgba(0,0,0,0.78)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, exportWidth, exportHeight)
  }

  function drawTopBar(ctx: CanvasRenderingContext2D) {
    ctx.textBaseline = 'middle'
    const brandIcon = customBrandIconRef.current || brandIconRef.current
    const brandWordmark = customBrandWordmarkRef.current || brandWordmarkRef.current
    if (brandIcon?.complete) {
      ctx.drawImage(brandIcon, px(15 + layout.topBrandX), py(15 + layout.topBrandY), px(23), px(23))
    }
    if (brandWordmark?.complete) {
      ctx.drawImage(brandWordmark, px(41 + layout.topBrandX), py(16 + layout.topBrandY), px(78), px(21))
    }

    ctx.textAlign = 'center'
    ctx.font = `800 ${px(15)}px system-ui, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.66)'
    ctx.fillText('フォロー中', px(162 + layout.topTabsX), py(28 + layout.topTabsY))
    ctx.font = `900 ${px(15)}px system-ui, sans-serif`
    ctx.fillStyle = '#fff'
    ctx.fillText('おすすめ', px(234 + layout.topTabsX), py(28 + layout.topTabsY))
    ctx.fillRect(px(225 + layout.topTabsX), py(40 + layout.topTabsY), px(20), py(2))

    ctx.textAlign = 'right'
    drawRoundRect(ctx, px(300 + layout.viewerX), py(13 + layout.viewerY), px(55), py(27), px(13.5))
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.fill()
    ctx.fillStyle = '#48f2a3'
    ctx.beginPath()
    ctx.arc(px(315 + layout.viewerX), py(27 + layout.viewerY), px(3.2), 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = `900 ${px(11.5)}px system-ui, sans-serif`
    ctx.fillText(viewerCount, px(347 + layout.viewerX), py(27 + layout.viewerY))
  }

  function drawActionRail(ctx: CanvasRenderingContext2D, elapsedMs: number) {
    const railAvatarSize = 46
    const actionPositions = getActionPositions()

    drawAvatar(ctx, px(actionPositions.railAvatar.x), py(actionPositions.railAvatar.y), px(railAvatarSize))
    ctx.fillStyle = '#ff4f79'
    ctx.beginPath()
    ctx.arc(px(actionPositions.plus.x), py(actionPositions.plus.y), px(9.5), 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = `900 ${px(14)}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('+', px(actionPositions.plus.x), py(actionPositions.plus.y))

    drawAction(ctx, heartIconRef.current, '♥', likeCount, px(actionPositions.heartAction.x), py(actionPositions.heartAction.y))
    drawAction(ctx, sparkIconRef.current, '✦', sparkCount, px(actionPositions.sparkAction.x), py(actionPositions.sparkAction.y))
    drawAction(ctx, shareIconRef.current, '↗', '共有', px(actionPositions.shareAction.x), py(actionPositions.shareAction.y))

    if (!heartEffect || elapsedMs <= 0) return
    const particleSize = px(26)
    ctx.textBaseline = 'middle'
    heartParticles.slice(0, heartAmount).forEach((particle) => {
      const progress = (((elapsedMs / 1000) * heartSpeed + particle.delay) % particle.duration) / particle.duration
      const ease = 1 - Math.pow(1 - progress, 2)
      const particleX =
        px(actionPositions.heartAction.x - 18 + layout.heartEffectX) +
        px(particle.xDrift) * ease +
        Math.sin(progress * Math.PI * 2 + particle.id) * px(particle.wobble / 2)
      const particleY = py(actionPositions.heartAction.y - 12 + layout.heartEffectY) - py(245) * ease
      ctx.globalAlpha = Math.sin(progress * Math.PI)
      ctx.save()
      ctx.translate(particleX, particleY)
      ctx.rotate(Math.sin(progress * Math.PI * 2 + particle.id) * 0.22)
      ctx.scale(particle.scale * heartSize, particle.scale * heartSize)
      ctx.translate(-particleSize / 2, -particleSize / 2)
      drawHeartPath(ctx, particleSize)
      ctx.fillStyle = heartColor
      ctx.fill()
      ctx.restore()
    })
    ctx.globalAlpha = 1
  }

  function drawCreatorStrip(ctx: CanvasRenderingContext2D) {
    const creatorX = layout.creatorX
    const creatorY = layout.creatorY
    drawAvatar(ctx, px(39 + creatorX), py(79 + creatorY), px(46))
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#fff'
    ctx.font = `900 ${px(14)}px system-ui, sans-serif`
    ctx.fillText(displayName, px(72 + creatorX), py(71 + creatorY), px(152))
    ctx.fillStyle = 'rgba(255,255,255,0.74)'
    ctx.font = `700 ${px(12)}px system-ui, sans-serif`
    ctx.fillText(normalizedHandle, px(72 + creatorX), py(88 + creatorY), px(152))

    drawRoundRect(ctx, px(251 + creatorX), py(64 + creatorY), px(67), py(30), px(15))
    ctx.fillStyle = 'rgba(255,255,255,0.20)'
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = `900 ${px(12)}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText('フォロー', px(284.5 + creatorX), py(79 + creatorY))

    ctx.textAlign = 'left'
    ctx.fillStyle = '#fff'
    ctx.font = `900 ${px(14)}px system-ui, sans-serif`
    ctx.fillText(title, px(16 + creatorX), py(120 + creatorY), px(282))
    if (soundName.trim()) {
      ctx.fillStyle = 'rgba(255,255,255,0.84)'
      ctx.font = `800 ${px(12)}px system-ui, sans-serif`
      ctx.fillText(`♪ ${soundName.trim()}`, px(16 + creatorX), py(145 + creatorY), px(282))
    }
  }

  function drawBottomInfo(ctx: CanvasRenderingContext2D, elapsedMs: number) {
    const metrics = getPreviewMetrics()
    const left = px(16 + layout.commentsX)
    const rightRailPadding = px(72)
    const maxTextWidth = exportWidth - left - rightRailPadding
    const maxVisibleComments = 5
    const messageBarTop = metrics.height - 14 - 38 + layout.commentsY
    const commentFontSize = 12
    const commentLineHeight = commentFontSize * 1.35
    const commentPaddingX = 10
    const commentPaddingY = 7
    const commentBubbleHeight = commentLineHeight + commentPaddingY * 2
    const commentGap = 5
    const commentListGap = 12
    const activeCommentIndex =
      elapsedMs > 0
        ? Math.min(Math.floor(elapsedMs / commentIntervalMs), comments.length - 1)
        : comments.length - 1
    const firstVisibleIndex = Math.max(0, activeCommentIndex - maxVisibleComments + 1)
    const visibleComments = comments.slice(firstVisibleIndex, activeCommentIndex + 1)

    visibleComments.forEach((comment, index) => {
      const ageFromNewest = visibleComments.length - 1 - index
      const bubbleTop =
        messageBarTop - commentListGap - commentBubbleHeight - ageFromNewest * (commentBubbleHeight + commentGap)
      const textY = py(bubbleTop + commentPaddingY + commentLineHeight / 2)
      const absoluteIndex = firstVisibleIndex + index
      const revealProgress =
        elapsedMs > 0
          ? clamp((elapsedMs - absoluteIndex * commentIntervalMs) / commentFadeMs, 0, 1)
          : 1
      const ageOpacity = clamp(1 - ageFromNewest * 0.18, 0.32, 1)
      ctx.font = `800 ${px(commentFontSize)}px system-ui, sans-serif`
      const userWidth = ctx.measureText(comment.user).width
      const bodyGap = px(8)
      const bodyMaxWidth = Math.max(0, maxTextWidth - px(commentPaddingX * 2) - userWidth - bodyGap)
      ctx.font = `400 ${px(commentFontSize)}px system-ui, sans-serif`
      const bodyWidth = Math.min(ctx.measureText(comment.body).width, bodyMaxWidth)
      const bubbleWidth = Math.min(userWidth + bodyGap + bodyWidth + px(commentPaddingX * 2), maxTextWidth)
      ctx.save()
      ctx.globalAlpha = revealProgress * ageOpacity
      ctx.translate(0, (1 - revealProgress) * 22)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      drawRoundRect(ctx, left, py(bubbleTop), bubbleWidth, py(commentBubbleHeight), px(8))
      ctx.fillStyle = 'rgba(0,0,0,0.38)'
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = `800 ${px(commentFontSize)}px system-ui, sans-serif`
      ctx.fillText(comment.user, left + px(commentPaddingX), textY, userWidth)
      ctx.font = `400 ${px(commentFontSize)}px system-ui, sans-serif`
      ctx.fillStyle = 'rgba(255,255,255,0.93)'
      ctx.fillText(comment.body, left + px(commentPaddingX) + userWidth + bodyGap, textY, bodyMaxWidth)
      ctx.restore()
    })

    drawRoundRect(ctx, left, py(messageBarTop), maxTextWidth, py(38), py(19))
    ctx.fillStyle = 'rgba(255,255,255,0.14)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.74)'
    ctx.font = `800 ${px(13)}px system-ui, sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('コメントする', left + px(12), py(messageBarTop + 19))
  }

  function drawAvatar(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.48)'
    ctx.shadowBlur = Math.max(8, size * 0.18)
    ctx.shadowOffsetY = Math.max(2, size * 0.05)
    ctx.beginPath()
    ctx.arc(x, y, size / 2, 0, Math.PI * 2)
    ctx.clip()
    const avatarElement = avatarImageRef.current
    if (avatarElement?.complete) {
      const sourceSize =
        Math.min(avatarElement.naturalWidth, avatarElement.naturalHeight) * (100 / avatarScale)
      const maxSourceX = avatarElement.naturalWidth - sourceSize
      const maxSourceY = avatarElement.naturalHeight - sourceSize
      const sourceX = maxSourceX * (avatarX / 100)
      const sourceY = maxSourceY * (avatarY / 100)
      ctx.drawImage(
        avatarElement,
        sourceX,
        sourceY,
        sourceSize,
        sourceSize,
        x - size / 2,
        y - size / 2,
        size,
        size,
      )
    } else {
      const gradient = ctx.createLinearGradient(x - size / 2, y - size / 2, x + size / 2, y + size / 2)
      gradient.addColorStop(0, '#ff4f79')
      gradient.addColorStop(1, '#00bac7')
      ctx.fillStyle = gradient
      ctx.fillRect(x - size / 2, y - size / 2, size, size)
      ctx.fillStyle = '#fff'
      ctx.font = `900 ${Math.round(size * 0.48)}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(displayName.slice(0, 1).toUpperCase(), x, y)
    }
    ctx.restore()
    ctx.strokeStyle = 'rgba(0,0,0,0.42)'
    ctx.lineWidth = Math.max(6, size * 0.12)
    ctx.beginPath()
    ctx.arc(x, y, size / 2, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = Math.max(3, size * 0.06)
    ctx.beginPath()
    ctx.arc(x, y, size / 2, 0, Math.PI * 2)
    ctx.stroke()
  }

  function drawAction(
    ctx: CanvasRenderingContext2D,
    iconImage: HTMLImageElement | null,
    fallbackIcon: string,
    label: string,
    x: number,
    y: number,
  ) {
    const iconSize = px(31)
    ctx.save()
    const backingRadius = px(23)
    const backing = ctx.createRadialGradient(x, y, 0, x, y, backingRadius)
    backing.addColorStop(0, 'rgba(0,0,0,0.28)')
    backing.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = backing
    ctx.beginPath()
    ctx.arc(x, y, backingRadius, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowColor = 'rgba(0,0,0,0.74)'
    ctx.shadowBlur = px(8)
    ctx.shadowOffsetY = py(3)
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (iconImage?.complete) {
      ctx.drawImage(iconImage, x - iconSize / 2, y - iconSize / 2, iconSize, iconSize)
    } else {
      ctx.font = `900 ${px(31)}px system-ui, sans-serif`
      ctx.fillText(fallbackIcon, x, y)
    }
    ctx.shadowBlur = px(6)
    ctx.shadowOffsetY = py(2)
    ctx.font = `900 ${px(10)}px system-ui, sans-serif`
    ctx.fillText(label, x, y + py(28))
    ctx.restore()
  }

  function drawLayoutHandles(ctx: CanvasRenderingContext2D) {
    const handles: Array<{ label: string; part: LayoutPart }> = [
      { label: 'ロゴ', part: 'topBrand' },
      { label: 'タブ', part: 'topTabs' },
      { label: '視聴者数', part: 'viewer' },
      { label: '配信者情報', part: 'creator' },
      { label: '投稿者アイコン', part: 'railAvatar' },
      { label: 'いいね', part: 'heartAction' },
      { label: '星', part: 'sparkAction' },
      { label: '共有', part: 'shareAction' },
      { label: 'ハート演出', part: 'heartEffect' },
      { label: 'コメント欄', part: 'comments' },
    ]
    ctx.save()
    handles.forEach(({ label, part }) => {
      const bounds = getLayoutBounds(part)
      const x = px(bounds.x)
      const y = py(bounds.y)
      const width = px(bounds.width)
      const height = py(bounds.height)
      ctx.setLineDash([px(5), px(5)])
      ctx.lineWidth = px(1.5)
      ctx.strokeStyle = 'rgba(255,71,120,0.9)'
      drawRoundRect(ctx, x, y, width, height, px(8))
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(255,71,120,0.88)'
      drawRoundRect(ctx, x, y - py(22), px(label.length * 12 + 18), py(18), px(9))
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = `900 ${px(10)}px system-ui, sans-serif`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, x + px(8), y - py(13))
    })
    ctx.restore()
  }

  function createExportCanvas() {
    const canvas = document.createElement('canvas')
    canvas.width = exportWidth
    canvas.height = exportHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvasを作成できませんでした。')
    return { canvas, ctx }
  }

  async function saveImage() {
    const { canvas, ctx } = createExportCanvas()
    const mediaElement = mainMediaRef.current
    const elapsedMs =
      activeClip ? previewTime * 1000 : mediaElement instanceof HTMLVideoElement ? mediaElement.currentTime * 1000 : previewTime * 1000
    const heartElapsedMs = performance.now() - animationStartRef.current
    drawExportFrame(ctx, elapsedMs, heartElapsedMs)
    canvas.toBlob((blob) => {
      if (blob) {
        saveBlob(blob, 'umatok-collage.png', [{ name: 'PNG画像', extensions: ['png'] }])
      }
    }, 'image/png')
  }

  function updateClipDuration(id: string, value: string) {
    const duration = clamp(Number(value) || 0.5, 0.5, 600)
    setClips((current) => current.map((clip) => (clip.id === id ? { ...clip, duration } : clip)))
  }

  function toggleClipFade(id: string, enabled: boolean) {
    setClips((current) =>
      current.map((clip) => (clip.id === id ? { ...clip, transition: enabled ? 'fade' : 'none' } : clip)),
    )
  }

  function moveClip(index: number, direction: -1 | 1) {
    setClips((current) => {
      const targetIndex = index + direction
      if (targetIndex < 0 || targetIndex >= current.length) return current
      const next = [...current]
      const [clip] = next.splice(index, 1)
      next.splice(targetIndex, 0, clip)
      return next
    })
    setPreviewTime(0)
  }

  function removeClip(id: string) {
    setClips((current) => current.filter((clip) => clip.id !== id))
    setPreviewTime(0)
  }

  useEffect(() => {
    if (previewTime > timelineDuration) {
      setPreviewTime(timelineDuration)
    }
  }, [previewTime, timelineDuration])

  useEffect(() => {
    let frameId = 0
    function renderPreview() {
      const canvas = previewCanvasRef.current
      const ctx = canvas?.getContext('2d')
      if (canvas && ctx) {
        const mediaElement = mainMediaRef.current
        const waitingForVideoFrame =
          mediaElement instanceof HTMLVideoElement &&
          (mediaElement.seeking || mediaElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)
        const elapsedMs =
          activeClip
            ? previewTime * 1000
            : mediaElement instanceof HTMLVideoElement
              ? mediaElement.currentTime * 1000
              : previewTime * 1000
        if (!waitingForVideoFrame) {
          const heartElapsedMs = performance.now() - animationStartRef.current
          drawExportFrame(ctx, elapsedMs, heartElapsedMs, isLayoutEditMode)
        }
      }
      frameId = requestAnimationFrame(renderPreview)
    }
    renderPreview()
    return () => cancelAnimationFrame(frameId)
  }, [
    avatar,
    avatarScale,
    avatarX,
    avatarY,
    comments,
    customBrandIcon,
    customBrandWordmark,
    displayName,
    exportHeight,
    exportWidth,
    handle,
    heartAmount,
    heartEffect,
    heartColor,
    heartSize,
    heartSpeed,
    insert,
    activeClip,
    activeClipInfo.localTime,
    isLayoutEditMode,
    likeCount,
    layout,
    mediaScale,
    mediaX,
    mediaY,
    previewTime,
    soundName,
    sparkCount,
    title,
    viewerCount,
  ])

  async function saveVideo() {
    const mimeType = getMp4MimeType()
    if (!mimeType) {
      alert('このブラウザではMP4保存に対応していません。配布版アプリではMP4変換機能を同梱する必要があります。')
      return
    }
    const canvas = previewCanvasRef.current
    if (!canvas) return
    const stream = canvas.captureStream(30)
    const recorder = new MediaRecorder(stream, { mimeType })
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.onstop = () => {
      saveBlob(new Blob(chunks, { type: mimeType }), 'umatok-collage.mp4', [
        { name: 'MP4動画', extensions: ['mp4'] },
      ])
      setIsExporting(false)
    }

    setIsExporting(true)
    setPreviewTime(0)
    setIsPreviewPlaying(true)
    recorder.start()
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const startedAt = performance.now()
    const mediaElement = mainMediaRef.current
    const videoDuration =
      mediaElement instanceof HTMLVideoElement && Number.isFinite(mediaElement.duration)
        ? mediaElement.duration * 1000
        : 0
    const duration =
      clips.length > 0
        ? timelineDuration * 1000
        : videoDuration > 0
        ? Math.max(1000, videoDuration)
        : Math.max(6000, Math.min(15000, comments.length * commentIntervalMs + 1200))

    if (mediaElement instanceof HTMLVideoElement) {
      mediaElement.currentTime = 0
      await mediaElement.play().catch(() => undefined)
    }

    await new Promise<void>((resolve) => {
      function renderFrame(now: number) {
        if (now - startedAt < duration) {
          requestAnimationFrame(renderFrame)
          return
        }
        resolve()
      }
      requestAnimationFrame(renderFrame)
    })
    setIsPreviewPlaying(false)
    recorder.stop()
  }

  return (
    <main className="app-shell">
      <header className="app-topbar">
        <div className="app-brand">
          <img src={assetPath('assets/brand/umatok-icon.svg')} alt="" />
          <strong>Umatok Studio</strong>
        </div>
        <div className="topbar-actions">
          <button type="button" onClick={undoProject} disabled={historyPast.length < 2}>
            元に戻す
          </button>
          <button type="button" onClick={redoProject} disabled={historyFuture.length === 0}>
            やり直し
          </button>
          <button type="button" onClick={() => setIsGuideModalOpen(true)}>
            使い方
          </button>
          <button type="button" onClick={() => setIsNoticeModalOpen(true)}>
            注意
          </button>
          <button
            type="button"
            className={isLayoutEditMode ? 'is-active' : ''}
            onClick={() => setIsLayoutEditMode((current) => !current)}
          >
            配置編集
          </button>
          <button type="button" onClick={() => setIsBrandModalOpen(true)}>
            Umatokロゴ変更
          </button>
          <button type="button" onClick={() => setLayout(defaultLayout)}>
            初期配置
          </button>
          <button type="button" className="project-save-button" onClick={saveProject}>
            プロジェクトを保存
          </button>
          <button type="button" onClick={openProject}>
            読み込み
          </button>
          <input
            ref={projectFileInputRef}
            className="project-file-input"
            type="file"
            accept="application/json,.json"
            onChange={loadProject}
          />
          <input
            ref={brandIconInputRef}
            className="project-file-input"
            type="file"
            accept="image/*"
            onChange={updateBrandIcon}
          />
          <input
            ref={brandWordmarkInputRef}
            className="project-file-input"
            type="file"
            accept="image/*"
            onChange={updateBrandWordmark}
          />
        </div>
      </header>

      <div className="workspace">
        <aside className="left-panel">
          <section className="panel-section">
            <h2>素材</h2>
            <p>画像または動画をアップロード</p>
            <label
              className="upload-zone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleClipsDrop}
            >
              <span className="upload-icon">⇧</span>
              <strong>ファイルをドラッグ&ドロップ</strong>
              <em>または</em>
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={updateClips}
              />
              <b>ファイルを選択</b>
            </label>
            {clips.length > 0 && (
              <div className="clip-list">
                {clips.map((clip, index) => (
                  <div className="clip-row" key={clip.id}>
                    <span>{index + 1}</span>
                    <strong>{clip.name || (clip.kind === 'video' ? 'video' : 'image')}</strong>
                    <input
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={clip.duration}
                      onChange={(event) => updateClipDuration(clip.id, event.target.value)}
                      aria-label="clip duration"
                    />
                    <label className="clip-fade-toggle">
                      <input
                        type="checkbox"
                        checked={clip.transition === 'fade'}
                        onChange={(event) => toggleClipFade(clip.id, event.target.checked)}
                      />
                      <span>フェード</span>
                    </label>
                    <button type="button" onClick={() => moveClip(index, -1)} disabled={index === 0}>↑</button>
                    <button type="button" onClick={() => moveClip(index, 1)} disabled={index === clips.length - 1}>↓</button>
                    <button type="button" onClick={() => removeClip(clip.id)}>×</button>
                  </div>
                ))}
              </div>
            )}
            <button className="reset-button" type="button" onClick={resetMainMedia} disabled={!insert && !clips.length}>
              素材をリセット
            </button>
          </section>

          <section className="panel-section">
            <h2>配信者</h2>
            <label
              className="avatar-picker"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleDrop(event, setAvatar, false)}
            >
              <div className="avatar-preview">
                {avatar ? (
                  <img src={avatar.url} style={avatarImageStyle} alt="" />
                ) : (
                  displayName.slice(0, 1).toUpperCase()
                )}
              </div>
              <div>
                <strong>アイコン画像</strong>
                <span>クリックまたは画像をドロップ</span>
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={(event) => updateMedia(event, setAvatar, false)}
              />
            </label>
            <div className="button-row">
              <button type="button" disabled={!avatar} onClick={() => setIsAvatarModalOpen(true)}>
                アイコン位置調整
              </button>
              <button type="button" disabled={!avatar} onClick={resetAvatar}>
                リセット
              </button>
            </div>
            <label>
              表示名
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </label>
            <label>
              ユーザーID
              <input
                value={handle}
                onChange={(event) => setHandle(event.target.value)}
                onBlur={(event) => setHandle(normalizeHandle(event.target.value))}
                placeholder="@username"
              />
            </label>
            <label>
              タイトル
              <input value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label>
              音源
              <input
                value={soundName}
                onChange={(event) => setSoundName(event.target.value)}
                placeholder="空欄なら表示しません"
              />
            </label>
          </section>
        </aside>

        <section className="preview-panel" ref={previewPanelRef}>
          <div className="panel-title">プレビュー</div>
          <div
            className="phone-frame-shell"
            style={
              {
                width: `${previewFrameWidth * previewScale}px`,
                height: `${previewFrameHeight * previewScale}px`,
              } as CSSProperties
            }
          >
            <div
              className="phone-frame"
              style={
                {
                  transform: `scale(${previewScale})`,
                } as CSSProperties
              }
            >
              <div
                className={`live-screen canvas-live-screen ${activeClip || insert || isLayoutEditMode ? 'is-draggable' : ''}`}
                onPointerDown={beginMediaDrag}
                onPointerMove={moveMedia}
                onPointerUp={endMediaDrag}
                onPointerCancel={endMediaDrag}
                onWheel={zoomMedia}
                title={isLayoutEditMode ? '枠をドラッグして配置調整' : 'ドラッグで移動、ホイールで拡大縮小'}
              >
                <canvas
                  ref={previewCanvasRef}
                  className="preview-canvas"
                  width={exportWidth}
                  height={exportHeight}
                  aria-label="Umatokプレビュー"
                />
                <MediaLayer
                  asset={activeClip || insert}
                  className="media-source"
                  fallback="insert"
                  mediaRef={mainMediaRef}
                  style={insertMediaStyle}
                  onLoadedMetadata={(event) => {
                    const duration = event.currentTarget.duration || 0
                    if (activeClip && duration > 0) {
                      setClips((current) =>
                        current.map((clip) => (clip.id === activeClip.id ? { ...clip, duration } : clip)),
                      )
                      event.currentTarget.currentTime = activeClipInfo.localTime
                    }
                    setPreviewDuration(duration)
                  }}
                  onTimeUpdate={(event) => {
                    if (!activeClip) setPreviewTime(event.currentTarget.currentTime)
                  }}
                  onPlay={() => setIsPreviewPlaying(true)}
                  onPause={() => setIsPreviewPlaying(false)}
                  onEnded={() => setIsPreviewPlaying(false)}
                />
                {avatar && (
                  <img
                    ref={avatarImageRef}
                    className="media-source"
                    src={avatar.url}
                    style={avatarImageStyle}
                    alt=""
                    draggable={false}
                  />
                )}
                {(activeClip || insert) && <div className="drag-hint">ドラッグ / ホイール</div>}
              </div>
            </div>
          </div>
          <div className="preview-controls">
            <button
              className="preview-play-button"
              type="button"
              onClick={togglePreviewPlayback}
              disabled={!timelineDuration}
              aria-label={isPreviewPlaying ? '一時停止' : '再生'}
            >
              {isPreviewPlaying ? '⏸' : '▶'}
            </button>
            <input
              type="range"
              min="0"
              max={timelineDuration}
              step="0.01"
              value={Math.min(previewTime, timelineDuration)}
              onChange={(event) => seekPreview(event.target.value)}
              disabled={!timelineDuration}
              aria-label="コメントタイムライン"
            />
            <span>{formatTime(previewTime)} / {formatTime(timelineDuration)}</span>
          </div>
        </section>

        <aside className="right-panel">
          <section className="panel-section comment-section">
            <div className="section-heading">
              <div>
                <h2>コメント</h2>
                <span className="section-count">{comments.length}件</span>
              </div>
              <div>
                <button type="button" onClick={() => addComment()}>
                  ＋ コメントを追加
                </button>
                <div className="comment-menu">
                  <button
                    className="icon-menu-button"
                    type="button"
                    onClick={() => setIsCommentMenuOpen((isOpen) => !isOpen)}
                    aria-label="コメントメニュー"
                    aria-expanded={isCommentMenuOpen}
                  >
                    …
                  </button>
                  {isCommentMenuOpen && (
                    <div className="comment-menu-popover">
                      <button
                        type="button"
                        onClick={() => {
                          setIsCommentModalOpen(true)
                          setIsCommentMenuOpen(false)
                        }}
                      >
                        まとめて編集
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          commentCsvInputRef.current?.click()
                          setIsCommentMenuOpen(false)
                        }}
                      >
                        CSV読込
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          saveCommentsCsv()
                          setIsCommentMenuOpen(false)
                        }}
                      >
                        CSV保存
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setComments(quickComments)
                          setIsCommentMenuOpen(false)
                        }}
                      >
                        サンプル
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setComments([])
                          setPreviewTime(0)
                          setIsCommentMenuOpen(false)
                        }}
                      >
                        コメントなし
                      </button>
                    </div>
                  )}
                </div>
                <input
                  ref={commentCsvInputRef}
                  className="project-file-input"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={loadCommentsCsv}
                />
              </div>
            </div>
            <div className="comment-rows">
              {comments.length === 0 && <div className="empty-comments">コメントなし</div>}
              {comments.map((comment, index) => (
                <div className="comment-row" key={`${comment.user}-${index}`}>
                  <input
                    aria-label={`コメント${index + 1}のユーザー名`}
                    value={comment.user}
                    onChange={(event) => updateComment(index, 'user', event.target.value)}
                  />
                  <input
                    aria-label={`コメント${index + 1}の本文`}
                    value={comment.body}
                    onChange={(event) => updateComment(index, 'body', event.target.value)}
                  />
                  <button type="button" onClick={() => removeComment(index)} aria-label="削除">
                    🗑
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="panel-section compact">
            <div className="toggle-line">
              <h2>ハート演出</h2>
              <div className="inline-actions">
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={heartEffect}
                    onChange={(event) => setHeartEffect(event.target.checked)}
                  />
                  <span />
                </label>
                <button
                  className="icon-menu-button"
                  type="button"
                  onClick={() => setIsHeartModalOpen(true)}
                  aria-label="ハート演出設定"
                >
                  …
                </button>
              </div>
            </div>
            <label>
              いいね数
              <input value={likeCount} onChange={(event) => setLikeCount(event.target.value)} />
            </label>
            <label>
              ☆の数
              <input value={sparkCount} onChange={(event) => setSparkCount(event.target.value)} />
            </label>
            <label>
              視聴者数
              <input value={viewerCount} onChange={(event) => setViewerCount(event.target.value)} />
            </label>
          </section>

          <section className="panel-section export-card">
            <h2>保存設定</h2>
            <label>
              解像度
              <select
                value={`${exportSize.width}x${exportSize.height}`}
                onChange={(event) => {
                  const [width, height] = event.target.value.split('x').map(Number)
                  const nextSize = exportSizes.find((size) => size.width === width && size.height === height)
                  if (nextSize) setExportSize(nextSize)
                }}
              >
                {exportSizes.map((size) => (
                  <option key={size.label} value={`${size.width}x${size.height}`}>
                    {size.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="save-meta">
              <span>{exportSize.label}（縦型）</span>
              <span>30 fps</span>
            </div>
            <div className="export-row">
              <button type="button" onClick={saveImage} disabled={isExporting}>
                画像保存 PNG
              </button>
              <button type="button" onClick={saveVideo} disabled={isExporting}>
                {isExporting ? '動画保存中...' : '動画保存 MP4'}
              </button>
            </div>
          </section>
        </aside>
      </div>

      <div className="preload-assets" aria-hidden="true">
        <img ref={brandIconRef} src={assetPath('assets/brand/umatok-icon.svg')} alt="" />
        {customBrandIcon && <img ref={customBrandIconRef} src={customBrandIcon.url} alt="" />}
        <img ref={brandWordmarkRef} src={assetPath('assets/brand/umatok-wordmark.svg')} alt="" />
        {customBrandWordmark && <img ref={customBrandWordmarkRef} src={customBrandWordmark.url} alt="" />}
        <img ref={heartIconRef} src={assetPath('assets/ui/heart-action.svg')} alt="" />
        <img ref={heartParticleRef} src={assetPath('assets/ui/heart-particle.svg')} alt="" />
        <img ref={sparkIconRef} src={assetPath('assets/ui/spark-action.svg')} alt="" />
        <img ref={shareIconRef} src={assetPath('assets/ui/share-action.svg')} alt="" />
      </div>

      {isGuideModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="info-modal" role="dialog" aria-modal="true" aria-label="使い方">
            <div className="modal-heading">
              <div>
                <h2>使い方</h2>
                <span className="modal-subtitle">基本は4ステップです。</span>
              </div>
              <button type="button" onClick={() => setIsGuideModalOpen(false)} aria-label="閉じる">
                ×
              </button>
            </div>
            <ol className="guide-steps">
              <li>
                <strong>素材を入れる</strong>
                <span>左の素材欄に画像または動画をドラッグ&ドロップします。</span>
              </li>
              <li>
                <strong>見た目を整える</strong>
                <span>プレビュー上で素材をドラッグし、ホイールで拡大縮小できます。</span>
              </li>
              <li>
                <strong>コメントと数値を編集</strong>
                <span>右側でコメント、いいね数、視聴者数、ハート演出を設定します。</span>
              </li>
              <li>
                <strong>保存する</strong>
                <span>PNGまたはMP4で保存します。配置はプロジェクト保存で再利用できます。</span>
              </li>
            </ol>
            <div className="modal-actions">
              <button type="button" onClick={() => setIsGuideModalOpen(false)}>
                閉じる
              </button>
            </div>
          </section>
        </div>
      )}

      {isNoticeModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="info-modal" role="dialog" aria-modal="true" aria-label="利用上の注意">
            <div className="modal-heading">
              <div>
                <h2>利用上の注意</h2>
                <span className="modal-subtitle">作成した画像や動画を使う前に確認してください。</span>
              </div>
              <button type="button" onClick={() => setIsNoticeModalOpen(false)} aria-label="閉じる">
                ×
              </button>
            </div>
            <div className="notice-list">
              <p>Umatokは架空のUIテンプレートです。実在サービスの公式画面ではありません。</p>
              <p>第三者のロゴ、人物画像、動画、音源などを使う場合は、権利者の許可や利用条件を確認してください。</p>
              <p>大きい動画素材はプロジェクトJSONに埋め込まれない場合があります。</p>
            </div>
            <div className="modal-actions">
              <button type="button" onClick={() => setIsNoticeModalOpen(false)}>
                確認しました
              </button>
            </div>
          </section>
        </div>
      )}

      {isBrandModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="brand-modal" role="dialog" aria-modal="true" aria-label="Umatokロゴ変更">
            <div className="modal-heading">
              <div>
                <h2>Umatokロゴ変更</h2>
                <span className="modal-subtitle">アイコンと文字画像を確認しながら差し替えできます。</span>
              </div>
              <button type="button" onClick={() => setIsBrandModalOpen(false)} aria-label="閉じる">
                ×
              </button>
            </div>
            <div className="brand-preview-stage">
              <div className="brand-preview-phone">
                <div className="brand-preview-logo">
                  <img src={customBrandIcon?.url || assetPath('assets/brand/umatok-icon.svg')} alt="" />
                  <img src={customBrandWordmark?.url || assetPath('assets/brand/umatok-wordmark.svg')} alt="Umatok" />
                </div>
                <div className="brand-preview-guide">
                  <span>プレビュー左上にこのサイズ感で表示されます</span>
                </div>
              </div>
            </div>
            <div className="brand-modal-actions">
              <button type="button" onClick={() => brandIconInputRef.current?.click()}>
                アイコン画像を選択
              </button>
              <button type="button" onClick={() => brandWordmarkInputRef.current?.click()}>
                文字画像を選択
              </button>
              <button
                type="button"
                onClick={() => {
                  setCustomBrandIcon(null)
                  setCustomBrandWordmark(null)
                }}
              >
                標準に戻す
              </button>
              <button type="button" onClick={() => setIsBrandModalOpen(false)}>
                完了
              </button>
            </div>
          </section>
        </div>
      )}

      {isHeartModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="heart-modal" role="dialog" aria-modal="true" aria-label="ハート演出設定">
            <div className="modal-heading">
              <div>
                <h2>ハート演出設定</h2>
                <span className="modal-subtitle">量、速度、サイズ、色を調整できます。</span>
              </div>
              <button type="button" onClick={() => setIsHeartModalOpen(false)} aria-label="閉じる">
                ×
              </button>
            </div>
            <div className="heart-preview-stage">
              {Array.from({ length: Math.min(heartAmount, 8) }, (_, index) => (
                <span
                  key={index}
                  style={
                    {
                      '--heart-color': heartColor,
                      '--heart-size': heartSize,
                      animationDuration: `${2.6 / heartSpeed}s`,
                      animationDelay: `${index * 0.16}s`,
                      left: `${36 + (index % 4) * 13}%`,
                    } as CSSProperties
                  }
                />
              ))}
            </div>
            <div className="heart-settings-grid">
              <label>
                ハート量
                <input
                  type="range"
                  min="1"
                  max="18"
                  value={heartAmount}
                  onChange={(event) => setHeartAmount(Number(event.target.value))}
                />
              </label>
              <label>
                ハート速度
                <input
                  type="range"
                  min="0.3"
                  max="2.5"
                  step="0.1"
                  value={heartSpeed}
                  onChange={(event) => setHeartSpeed(Number(event.target.value))}
                />
              </label>
              <label>
                ハートサイズ
                <input
                  type="range"
                  min="0.5"
                  max="1.8"
                  step="0.1"
                  value={heartSize}
                  onChange={(event) => setHeartSize(Number(event.target.value))}
                />
              </label>
              <label>
                ハート色
                <input type="color" value={heartColor} onChange={(event) => setHeartColor(event.target.value)} />
              </label>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                onClick={() => {
                  setHeartAmount(10)
                  setHeartSpeed(1)
                  setHeartSize(1)
                  setHeartColor('#ff4778')
                }}
              >
                標準に戻す
              </button>
              <button type="button" onClick={() => setIsHeartModalOpen(false)}>
                完了
              </button>
            </div>
          </section>
        </div>
      )}

      {isAvatarModalOpen && avatar && (
        <div className="modal-backdrop" role="presentation">
          <section className="avatar-modal" role="dialog" aria-modal="true" aria-label="配信者アイコン調整">
            <div className="modal-heading">
              <h2>配信者アイコン調整</h2>
              <button type="button" onClick={() => setIsAvatarModalOpen(false)} aria-label="閉じる">
                ×
              </button>
            </div>
            <div className="avatar-adjust-preview">
              <div
                className="avatar-adjust-circle"
                onPointerDown={beginAvatarDrag}
                onPointerMove={moveAvatar}
                onPointerUp={endAvatarDrag}
                onPointerCancel={endAvatarDrag}
                onWheel={zoomAvatar}
                title="ドラッグで移動、ホイールで拡大縮小"
              >
                <img src={avatar.url} style={avatarImageStyle} draggable={false} alt="" />
              </div>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                onClick={() => {
                  setAvatarX(50)
                  setAvatarY(50)
                  setAvatarScale(100)
                }}
              >
                リセット
              </button>
              <button type="button" onClick={() => setIsAvatarModalOpen(false)}>
                完了
              </button>
            </div>
          </section>
        </div>
      )}

      {isCommentModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="comment-modal" role="dialog" aria-modal="true" aria-label="コメントまとめ編集">
            <div className="modal-heading">
              <div>
                <h2>コメントまとめ編集</h2>
                <span className="modal-subtitle">1行に「ユーザー名: コメント」で入力</span>
              </div>
              <button type="button" onClick={() => setIsCommentModalOpen(false)} aria-label="閉じる">
                ×
              </button>
            </div>
            <textarea
              className="bulk-comment-textarea"
              value={commentText}
              onChange={(event) => updateComments(event.target.value)}
              spellCheck={false}
            />
            <div className="modal-actions">
              <button type="button" onClick={() => addComment()}>
                コメントを追加
              </button>
              <button type="button" onClick={() => setIsCommentModalOpen(false)}>
                完了
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

function MediaLayer({
  asset,
  className,
  fallback,
  mediaRef,
  style,
  onLoadedMetadata,
  onTimeUpdate,
  onPlay,
  onPause,
  onEnded,
}: {
  asset: MediaAsset | null
  className: string
  fallback: 'bg' | 'insert'
  mediaRef?: MutableRefObject<HTMLImageElement | HTMLVideoElement | null>
  style?: CSSProperties
  onLoadedMetadata?: (event: SyntheticEvent<HTMLVideoElement>) => void
  onTimeUpdate?: (event: SyntheticEvent<HTMLVideoElement>) => void
  onPlay?: () => void
  onPause?: () => void
  onEnded?: () => void
}) {
  if (!asset) {
    return (
      <div className={`${className} fallback-${fallback}`} style={style}>
        <span>{fallback === 'bg' ? 'BACKGROUND' : 'DROP MEDIA'}</span>
      </div>
    )
  }

  if (asset.kind === 'video') {
    return (
      <video
        ref={(node) => {
          if (mediaRef) mediaRef.current = node
        }}
        className={className}
        src={asset.url}
        style={style}
        muted
        playsInline
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onPlay={onPlay}
        onPause={onPause}
        onEnded={onEnded}
      />
    )
  }

  return (
    <img
      ref={(node) => {
        if (mediaRef) mediaRef.current = node
      }}
      className={className}
      src={asset.url}
      style={style}
      alt=""
    />
  )
}

export default App
