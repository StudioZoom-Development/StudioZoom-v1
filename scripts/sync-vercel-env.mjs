// Parallel sync of local env files to Vercel
// Run: node scripts/sync-vercel-env.mjs

import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'

const PROJECT_DIR = '/Users/mk-air/Development/Studio Zoom/StudioZoom-V1/studio-zoom'

// Helper to parse env files
function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const content = fs.readFileSync(filePath, 'utf8')
  const result = {}
  content.split('\n').forEach(line => {
    line = line.trim()
    if (!line || line.startsWith('#')) return
    const match = line.match(/^([^=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      let value = match[2].trim()
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1)
      result[key] = value
    }
  })
  return result
}

// Promisified execution helper
function pushToVercel(key, value, envs, isSensitive = true) {
  return new Promise((resolve) => {
    const sensitiveFlag = isSensitive ? '' : ' --no-sensitive'
    const cmd = `npx -y vercel env add ${key} ${envs} --value "${value}" --yes --force${sensitiveFlag}`
    
    exec(cmd, { cwd: PROJECT_DIR }, (error, stdout, stderr) => {
      if (error) {
        console.error(`✗ Failed: ${key} to ${envs}`)
        resolve({ success: false, key, envs })
      } else {
        console.log(`✓ Synced: ${key} to ${envs}`)
        resolve({ success: true, key, envs })
      }
    })
  });
}

async function run() {
  const devEnvPath = path.join(PROJECT_DIR, '.env.development')
  const prodEnvPath = path.join(PROJECT_DIR, '.env.production')

  const devVars = parseEnvFile(devEnvPath)
  const prodVars = parseEnvFile(prodEnvPath)

  const promises = []

  console.log('🚀 Preparing environment variable sync queries in parallel...')

  for (const [key, val] of Object.entries(devVars)) {
    if (val) {
      promises.push(pushToVercel(key, val, 'preview', true))
      promises.push(pushToVercel(key, val, 'development', false))
    }
  }

  for (const [key, val] of Object.entries(prodVars)) {
    if (val) {
      promises.push(pushToVercel(key, val, 'production', true))
    }
  }

  console.log(`⚡ Sending ${promises.length} concurrent requests to Vercel...`)
  const start = Date.now()
  const results = await Promise.all(promises)
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)

  const succeeded = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length

  console.log(`\n🎉 Sync complete in ${elapsed}s!`)
  console.log(`✓ Succeeded: ${succeeded}`)
  console.log(`✗ Failed: ${failed}`)
}

run().catch(err => {
  console.error('Fatal Error:', err)
})
