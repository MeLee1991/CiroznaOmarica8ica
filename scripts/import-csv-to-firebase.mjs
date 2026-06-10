import { readFile } from 'node:fs/promises'
import { initializeApp } from 'firebase/app'
import {
  addDoc,
  collection,
  getDocs,
  getFirestore,
  query,
  where
} from 'firebase/firestore'

const ROOT = new URL('../', import.meta.url)
const DEFAULT_DRINKS = '/Users/tomi/Desktop/cirozna omarica/omarica_2026-06-05.csv'
const DEFAULT_USERS = '/Users/tomi/Desktop/cirozna omarica/zrtve_2026-06-05 - zrtve_2026-06-05.csv'

const envPath = new URL('.env.local', ROOT)

const parseEnv = (text) => {
  const env = {}
  text.split(/\r?\n/).forEach((line) => {
    const clean = line.trim()
    if (!clean || clean.startsWith('#')) return
    const index = clean.indexOf('=')
    if (index === -1) return
    env[clean.slice(0, index).trim()] = clean.slice(index + 1).trim().replace(/^["']|["']$/g, '')
  })
  return env
}

const parseCsv = (text) => {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  const clean = text.replace(/^\uFEFF/, '')

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i]
    const next = clean[i + 1]
    if (char === '"' && quoted && next === '"') {
      cell += '"'
      i++
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(cell)
      cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i++
      row.push(cell)
      if (row.some(value => value.trim() !== '')) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }
  row.push(cell)
  if (row.some(value => value.trim() !== '')) rows.push(row)
  return rows
}

const toNumber = (value, fallback = 0) => {
  const number = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(number) ? number : fallback
}

const loadFirebaseConfig = async () => {
  const env = parseEnv(await readFile(envPath, 'utf8'))
  const required = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID'
  ]
  const missing = required.filter(key => !env[key])
  if (missing.length) {
    throw new Error(`Missing Firebase config in .env.local: ${missing.join(', ')}`)
  }
  return {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID
  }
}

const existsByField = async (db, table, field, value) => {
  const snapshot = await getDocs(query(collection(db, table), where(field, '==', value)))
  return !snapshot.empty
}

const importUsers = async (db, file) => {
  const rows = parseCsv(await readFile(file, 'utf8')).slice(1)
  let inserted = 0
  let skipped = 0
  for (const [player, status] of rows) {
    const ime = player?.trim()
    if (!ime) continue
    if (await existsByField(db, 'users', 'ime', ime)) {
      skipped++
      continue
    }
    await addDoc(collection(db, 'users'), {
      id: Date.now() + Math.floor(Math.random() * 100000),
      ime,
      tip: String(status || '').trim().toUpperCase() === 'Č' ? 'član' : 'nečlan'
    })
    inserted++
  }
  return { inserted, skipped }
}

const importDrinks = async (db, file) => {
  const rows = parseCsv(await readFile(file, 'utf8')).slice(1)
  let inserted = 0
  let skipped = 0
  for (const [imeRaw, cenaRaw, cenaClanRaw, kategorijaRaw, zalogaRaw, vrstniRedRaw] of rows) {
    const ime = imeRaw?.trim()
    if (!ime) continue
    if (await existsByField(db, 'drinks', 'ime', ime)) {
      skipped++
      continue
    }
    await addDoc(collection(db, 'drinks'), {
      id: Date.now() + Math.floor(Math.random() * 100000),
      ime,
      cena: toNumber(cenaRaw),
      cena_clan: toNumber(cenaClanRaw) || null,
      kategorija: kategorijaRaw?.trim() || 'ostalo',
      zaloga: toNumber(zalogaRaw),
      min_zaloga: 5,
      vrstni_red: toNumber(vrstniRedRaw),
      active: true
    })
    inserted++
  }
  return { inserted, skipped }
}

const main = async () => {
  const drinksPath = process.argv[2] || DEFAULT_DRINKS
  const usersPath = process.argv[3] || DEFAULT_USERS
  const app = initializeApp(await loadFirebaseConfig())
  const db = getFirestore(app)

  console.log(`Importing users from: ${usersPath}`)
  const users = await importUsers(db, usersPath)
  console.log(`Users: ${users.inserted} inserted, ${users.skipped} skipped`)

  console.log(`Importing drinks from: ${drinksPath}`)
  const drinks = await importDrinks(db, drinksPath)
  console.log(`Drinks: ${drinks.inserted} inserted, ${drinks.skipped} skipped`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
