const FIRESTORE_BASE = (projectId) =>
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`

const jsonResponse = (res, status, body) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

const fromFirestoreValue = (value) => {
  if (!value || typeof value !== 'object') return null
  if ('stringValue' in value) return value.stringValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return Number(value.doubleValue)
  if ('booleanValue' in value) return Boolean(value.booleanValue)
  if ('timestampValue' in value) return value.timestampValue
  if ('nullValue' in value) return null
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromFirestoreValue)
  if ('mapValue' in value) return fromFirestoreFields(value.mapValue.fields || {})
  return null
}

const toFirestoreValue = (value) => {
  if (value === null || value === undefined) return { nullValue: null }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  if (typeof value === 'string') return { stringValue: value }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } }
  return { mapValue: { fields: toFirestoreFields(value) } }
}

const fromFirestoreFields = (fields) => Object.fromEntries(
  Object.entries(fields).map(([key, value]) => [key, fromFirestoreValue(value)])
)

const toFirestoreFields = (data) => Object.fromEntries(
  Object.entries(data).map(([key, value]) => [key, toFirestoreValue(value)])
)

const fetchCollection = async (collectionName, env) => {
  const url = `${FIRESTORE_BASE(env.VITE_FIREBASE_PROJECT_ID)}/${collectionName}?key=${env.VITE_FIREBASE_API_KEY}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Firestore ${collectionName}: ${response.status}`)
  const payload = await response.json()
  return (payload.documents || []).map((doc) => ({
    id: doc.fields?.id ? fromFirestoreValue(doc.fields.id) : doc.name.split('/').pop(),
    _docName: doc.name,
    ...fromFirestoreFields(doc.fields || {})
  }))
}

const patchDocument = async (docName, data, env) => {
  const url = `https://firestore.googleapis.com/v1/${docName}?key=${env.VITE_FIREBASE_API_KEY}`
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFirestoreFields(data) })
  })
  if (!response.ok) throw new Error(`Firestore patch: ${response.status}`)
}

const nowParts = (timeZone) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false
  }).formatToParts(new Date())
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]))
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    weekday: weekdayMap[map.weekday],
    dateKey: `${map.year}-${map.month}-${map.day}`
  }
}

const shouldRun = (schedule, parts) => {
  if (!schedule?.enabled || !schedule.email) return { run: false, reason: 'disabled' }
  const [hour, minute] = String(schedule.time || '08:00').split(':').map(Number)
  if (parts.hour !== hour) return { run: false, reason: 'wrong-hour' }
  if (parts.minute > 20) return { run: false, reason: 'outside-window' }

  let periodKey = ''
  if (schedule.frequency === 'daily') periodKey = `daily:${parts.dateKey}`
  else if (schedule.frequency === 'weekly') {
    if (parts.weekday !== Number(schedule.weekday ?? 1)) return { run: false, reason: 'wrong-weekday' }
    periodKey = `weekly:${parts.dateKey}`
  } else if (schedule.frequency === 'monthly') {
    if (parts.day !== Number(schedule.dayOfMonth ?? 1)) return { run: false, reason: 'wrong-monthday' }
    periodKey = `monthly:${parts.year}-${parts.month}`
  } else {
    const intervalDays = Math.max(1, Number(schedule.intervalDays || 7))
    const current = Date.UTC(parts.year, parts.month - 1, parts.day)
    const epoch = Date.UTC(2026, 0, 1)
    if (Math.floor((current - epoch) / 86400000) % intervalDays !== 0) return { run: false, reason: 'wrong-custom-day' }
    periodKey = `custom:${intervalDays}:${parts.dateKey}`
  }

  if (schedule.lastSentKey === periodKey) return { run: false, reason: 'already-sent' }
  return { run: true, periodKey }
}

const sendEmail = async ({ to, subject, text, attachmentName, attachmentJson }, env) => {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: env.BACKUP_EMAIL_FROM,
      to,
      subject,
      text,
      attachments: [{
        filename: attachmentName,
        content: Buffer.from(JSON.stringify(attachmentJson, null, 2), 'utf8').toString('base64')
      }]
    })
  })
  if (!response.ok) throw new Error(`Resend: ${response.status} ${await response.text()}`)
}

export default async function handler(req, res) {
  try {
    if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return jsonResponse(res, 401, { ok: false, error: 'unauthorized' })
    }

    const required = ['VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_API_KEY', 'RESEND_API_KEY', 'BACKUP_EMAIL_FROM']
    const missing = required.filter(key => !process.env[key])
    if (missing.length) return jsonResponse(res, 500, { ok: false, error: `Missing env: ${missing.join(', ')}` })

    const settings = await fetchCollection('settings', process.env)
    const scheduleDoc = settings.find(item => item.key === 'backupSchedule')
    const schedule = scheduleDoc?.value
    const parts = nowParts(process.env.BACKUP_TIMEZONE || 'Europe/Ljubljana')
    const decision = shouldRun(schedule, parts)
    if (!decision.run) return jsonResponse(res, 200, { ok: true, skipped: decision.reason })

    const [users, drinks, tariffs, orders, allSettings] = await Promise.all([
      fetchCollection('users', process.env),
      fetchCollection('drinks', process.env),
      fetchCollection('tariffs', process.env),
      fetchCollection('orders', process.env),
      fetchCollection('settings', process.env)
    ])

    const backup = {
      version: 1,
      exported_at: new Date().toISOString(),
      users,
      drinks,
      tariffs,
      orders,
      settings: allSettings
    }

    await sendEmail({
      to: schedule.email,
      subject: `Cirozna Omarica backup ${parts.dateKey}`,
      text: 'V priponki je samodejni backup podatkov.',
      attachmentName: `cirozna_backup_${parts.dateKey}.json`,
      attachmentJson: backup
    }, process.env)

    await patchDocument(scheduleDoc._docName, {
      ...scheduleDoc,
      value: { ...schedule, lastSentKey: decision.periodKey, lastSentAt: new Date().toISOString() },
      updated_at: new Date().toISOString()
    }, process.env)

    return jsonResponse(res, 200, { ok: true, sent: true, to: schedule.email })
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, error: error.message })
  }
}
