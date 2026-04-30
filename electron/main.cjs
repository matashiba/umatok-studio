const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const isDev = process.env.UMATOK_DEV_SERVER_URL

function getWritableProjectsDir() {
  const appRoot = isDev ? process.cwd() : path.dirname(app.getPath('exe'))
  const preferredDir = path.join(appRoot, 'Umatok Projects')
  try {
    fs.mkdirSync(preferredDir, { recursive: true })
    fs.accessSync(preferredDir, fs.constants.W_OK)
    return preferredDir
  } catch {
    const fallbackDir = path.join(app.getPath('documents'), 'Umatok Projects')
    fs.mkdirSync(fallbackDir, { recursive: true })
    return fallbackDir
  }
}

function sanitizeProjectName(name) {
  const cleaned = String(name || '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
  return cleaned || `Umatok Project ${new Date().toISOString().slice(0, 10)}`
}

function getUniqueProjectDir(baseDir, projectName) {
  const safeName = sanitizeProjectName(projectName)
  let candidate = path.join(baseDir, safeName)
  let suffix = 2
  while (fs.existsSync(candidate)) {
    candidate = path.join(baseDir, `${safeName} ${suffix}`)
    suffix += 1
  }
  return candidate
}

function dataUrlToBuffer(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/u.exec(dataUrl || '')
  if (!match) throw new Error('Invalid data URL')
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  }
}

function toFileUrl(filePath) {
  return pathToFileURL(filePath).toString()
}

function resolveProjectAsset(projectDir, asset) {
  if (!asset || !asset.path) return asset
  const assetPath = path.resolve(projectDir, asset.path)
  const relative = path.relative(projectDir, assetPath)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return asset
  if (!fs.existsSync(assetPath)) return asset
  return {
    ...asset,
    url: toFileUrl(assetPath),
    sourcePath: assetPath,
    name: asset.name || path.basename(assetPath),
  }
}

function writeLog(message) {
  try {
    const logPath = path.join(app.getPath('userData'), 'umatok-electron.log')
    fs.appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`, 'utf8')
  } catch {
    // Logging must never stop the app from opening.
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: '#11161d',
    title: 'Umatok Studio',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
    },
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    writeLog(`console level=${level} ${message} (${sourceId}:${line})`)
  })

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    writeLog(`did-fail-load code=${errorCode} description=${errorDescription} url=${validatedURL}`)
  })

  window.webContents.on('render-process-gone', (_event, details) => {
    writeLog(`render-process-gone reason=${details.reason} exitCode=${details.exitCode}`)
  })

  if (isDev) {
    window.loadURL(isDev)
  } else {
    window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

app.whenReady().then(() => {
  getWritableProjectsDir()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('save-blob', async (_event, options) => {
  const result = await dialog.showSaveDialog({
    title: options.title || 'Save',
    defaultPath: options.defaultPath,
    filters: options.filters || [],
  })
  if (result.canceled || !result.filePath) return { canceled: true }
  const buffer = Buffer.from(options.data, 'base64')
  fs.writeFileSync(result.filePath, buffer)
  return { canceled: false, filePath: result.filePath }
})

ipcMain.handle('save-project-folder', async (_event, options) => {
  const projectsDir = getWritableProjectsDir()
  const projectDir = options.folderPath || getUniqueProjectDir(projectsDir, options.projectName)
  const assetsDir = path.join(projectDir, 'assets')
  fs.mkdirSync(assetsDir, { recursive: true })

  for (const asset of options.assets || []) {
    const targetPath = path.join(projectDir, asset.path)
    const relative = path.relative(projectDir, targetPath)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Invalid asset path')
    }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true })
    if (asset.sourcePath && fs.existsSync(asset.sourcePath)) {
      if (path.resolve(asset.sourcePath) === path.resolve(targetPath)) continue
      fs.copyFileSync(asset.sourcePath, targetPath)
    } else if (asset.dataUrl) {
      fs.writeFileSync(targetPath, dataUrlToBuffer(asset.dataUrl).buffer)
    }
  }

  fs.writeFileSync(path.join(projectDir, 'project.json'), JSON.stringify(options.project, null, 2), 'utf8')
  return { canceled: false, folderPath: projectDir }
})

ipcMain.handle('open-project-folder', async () => {
  const projectsDir = getWritableProjectsDir()
  const result = await dialog.showOpenDialog({
    title: 'Open Umatok Project',
    defaultPath: projectsDir,
    filters: [{ name: 'Umatok Project', extensions: ['json'] }],
    properties: ['openFile', 'openDirectory'],
  })
  if (result.canceled || !result.filePaths[0]) return { canceled: true }

  const selectedPath = result.filePaths[0]
  const stats = fs.statSync(selectedPath)
  const filePath = stats.isDirectory() ? path.join(selectedPath, 'project.json') : selectedPath
  if (!fs.existsSync(filePath)) {
    throw new Error('project.json was not found')
  }
  const projectDir = path.dirname(filePath)
  const project = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  if (Array.isArray(project.clips)) {
    project.clips = project.clips.map((clip) => resolveProjectAsset(projectDir, clip))
  }
  project.insert = resolveProjectAsset(projectDir, project.insert)
  project.avatar = resolveProjectAsset(projectDir, project.avatar)
  project.brandIcon = resolveProjectAsset(projectDir, project.brandIcon)
  project.brandWordmark = resolveProjectAsset(projectDir, project.brandWordmark)
  return { canceled: false, project, folderPath: projectDir }
})
