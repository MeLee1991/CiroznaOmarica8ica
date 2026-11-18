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
  const url = `${FIRESTORE_BASE(env.VITE_FIREBASE_PROJECT_ID)}/${collectionName}?key=${env.VITE_FIREBASE_API_KEY}&pageSize=1000`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Firestore ${collectionName}: ${response.status}`)
  const payload = await response.json()
  return (payload.documents || []).map((doc) => ({
    id: doc.fields?.id ? fromFirestoreValue(doc.fields.id) : doc.name.split('/').pop(),
    _docName: doc.name,
    ...fromFirestoreFields(doc.fields || {})
  }))
}

const upsertScheduleDocument = async (scheduleDoc, valueData, env) => {
  const payload = {
    key: 'backupSchedule',
    value: valueData,
    updated_at: new Date().toISOString()
  }
  if (scheduleDoc?._docName) {
    const url = `https://firestore.googleapis.com/v1/${scheduleDoc._docName}?key=${env.VITE_FIREBASE_API_KEY}`
    const response = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: toFirestoreFields({ ...scheduleDoc, ...payload }) })
    })
    if (!response.ok) throw new Error(`Firestore patch: ${response.status}`)
  } else {
    const url = `${FIRESTORE_BASE(env.VITE_FIREBASE_PROJECT_ID)}/settings?key=${env.VITE_FIREBASE_API_KEY}`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: toFirestoreFields({ id: Date.now(), ...payload }) })
    })
    if (!response.ok) throw new Error(`Firestore insert: ${response.status}`)
  }
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

const DEFAULT_SCHEDULE = {
  enabled: true,
  email: 'deevyezh@gmail.com',
  frequency: 'daily',
  time: '01:00',
  weekday: 0,
  dayOfMonth: 1,
  intervalDays: 7,
  lastSentKey: '',
  weeklyEnabled: true,
  weeklyEmail: 'blaz.kolenc@gmail.com',
  weeklyWeekday: 0,
  weeklyTime: '01:00',
  lastWeeklySentKey: ''
}

const evaluatePrimaryRule = (schedule, parts) => {
  if (!schedule?.enabled || !schedule.email) return { run: false, reason: 'primary-disabled' }

  let periodKey = ''
  if (schedule.frequency === 'daily') periodKey = `daily:${parts.dateKey}`
  else if (schedule.frequency === 'weekly') {
    if (parts.weekday !== Number(schedule.weekday ?? 0)) return { run: false, reason: 'wrong-weekday' }
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

  if (schedule.lastSentKey === periodKey) return { run: false, reason: 'primary-already-sent' }
  return { run: true, periodKey, email: schedule.email.trim() }
}

const evaluateWeeklyRule = (schedule, parts) => {
  if (!schedule?.weeklyEnabled || !schedule.weeklyEmail) return { run: false, reason: 'weekly-disabled' }
  const targetWeekday = Number(schedule.weeklyWeekday ?? 0) // 0 = Sunday
  if (parts.weekday !== targetWeekday) return { run: false, reason: 'not-weekly-day' }
  const periodKey = `weekly-secondary:${parts.dateKey}`
  if (schedule.lastWeeklySentKey === periodKey) return { run: false, reason: 'weekly-already-sent' }
  return { run: true, periodKey, email: schedule.weeklyEmail.trim() }
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

    const forceSend = req.query?.force === '1' || req.url?.includes('force=1')
    const settingsDocs = await fetchCollection('settings', process.env)
    const scheduleDoc = settingsDocs.find(item => item.key === 'backupSchedule')
    const appSettingsDoc = settingsDocs.find(item => item.key === 'appSettingsBackup')
    const schedule = { ...DEFAULT_SCHEDULE, ...(scheduleDoc?.value || {}) }

    const parts = nowParts(process.env.BACKUP_TIMEZONE || 'Europe/Ljubljana')
    const primaryDecision = forceSend
      ? { run: Boolean(schedule.email), periodKey: `daily:${parts.dateKey}`, email: schedule.email }
      : evaluatePrimaryRule(schedule, parts)
    const weeklyDecision = forceSend
      ? { run: Boolean(schedule.weeklyEnabled && schedule.weeklyEmail), periodKey: `weekly-secondary:${parts.dateKey}`, email: schedule.weeklyEmail }
      : evaluateWeeklyRule(schedule, parts)

    if (!primaryDecision.run && !weeklyDecision.run) {
      return jsonResponse(res, 200, {
        ok: true,
        skipped: true,
        primary: primaryDecision.reason,
        weekly: weeklyDecision.reason
      })
    }

    const [users, drinks, tariffs, orders] = await Promise.all([
      fetchCollection('users', process.env),
      fetchCollection('drinks', process.env),
      fetchCollection('tariffs', process.env),
      fetchCollection('orders', process.env)
    ])

    const stripMeta = (rows) => rows.map(({ _docName, ...rest }) => rest)

    const structuredSettings = {
      ...(appSettingsDoc?.value || {}),
      backupSchedule: schedule,
      firestoreSettings: stripMeta(settingsDocs)
    }

    const backup = {
      version: 1,
      exported_at: new Date().toISOString(),
      users: stripMeta(users),
      drinks: stripMeta(drinks),
      tariffs: stripMeta(tariffs),
      orders: stripMeta(orders),
      settings: structuredSettings
    }

    const sentTo = []
    const nextSchedule = { ...schedule }

    if (primaryDecision.run && primaryDecision.email) {
      await sendEmail({
        to: primaryDecision.email,
        subject: `Cirozna Omarica — Dnevni Celotni Backup (${parts.dateKey})`,
        text: `V priponki je celotna varnostna kopija baze Cirozna Omarica (${parts.dateKey} ob 01:00).\nDatoteko lahko kadarkoli uvoziš v Admin -> Baza -> Uvozi Vse.`,
        attachmentName: `cirozna_backup_${parts.dateKey}.json`,
        attachmentJson: backup
      }, process.env)
      nextSchedule.lastSentKey = primaryDecision.periodKey
      nextSchedule.lastSentAt = new Date().toISOString()
      sentTo.push(primaryDecision.email)
    }

    if (weeklyDecision.run && weeklyDecision.email) {
      await sendEmail({
        to: weeklyDecision.email,
        subject: `Cirozna Omarica — Tedenski Celotni Backup (${parts.dateKey})`,
        text: `V priponki je tedenska celotna varnostna kopija baze Cirozna Omarica (${parts.dateKey} - Nedelja ob 01:00): igralci, artikli, tarife, zgodovina naročil in nastavitve.\nDatoteko lahko uvoziš v Admin -> Baza -> Uvozi Vse.`,
        attachmentName: `cirozna_weekly_backup_${parts.dateKey}.json`,
        attachmentJson: backup
      }, process.env)
      nextSchedule.lastWeeklySentKey = weeklyDecision.periodKey
      nextSchedule.lastWeeklySentAt = new Date().toISOString()
      sentTo.push(weeklyDecision.email)
    }

    await upsertScheduleDocument(scheduleDoc, nextSchedule, process.env)

    return jsonResponse(res, 200, { ok: true, sent: true, to: sentTo })
  } catch (error) {
    return jsonResponse(res, 500, { ok: false, error: error.message })
  }
}
