import { initializeApp } from 'firebase/app'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  query,
  updateDoc,
  where
} from 'firebase/firestore'

const firebaseEnv = {
  VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID
}

const firebaseConfig = {
  apiKey: firebaseEnv.VITE_FIREBASE_API_KEY,
  authDomain: firebaseEnv.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: firebaseEnv.VITE_FIREBASE_PROJECT_ID,
  storageBucket: firebaseEnv.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: firebaseEnv.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: firebaseEnv.VITE_FIREBASE_APP_ID
}

const missingConfig = Object.entries(firebaseEnv)
  .filter(([, value]) => !value)
  .map(([key]) => key)

const app = missingConfig.length ? null : initializeApp(firebaseConfig)
const db = app ? getFirestore(app) : null

const makeError = (message, code = 'FIREBASE_CONFIG') => ({
  code,
  message,
  details: null,
  hint: missingConfig.length ? `Missing env vars: ${missingConfig.join(', ')}` : null
})

const normalizeDoc = (snapshot) => {
  const data = snapshot.data()
  return { id: data.id ?? snapshot.id, ...data }
}

const normalizeInsert = (record) => {
  const next = { ...record }
  if (!next.id) next.id = Date.now() + Math.floor(Math.random() * 1000)
  if ('placano' in next && !('timestamp' in next)) next.timestamp = new Date().toISOString()
  return next
}

class FirebaseQuery {
  constructor(table) {
    this.table = table
    this.filters = []
    this.mode = 'select'
    this.payload = null
  }

  select() {
    if (this.mode === 'insert') this.returnInserted = true
    return this
  }

  eq(field, value) {
    this.filters.push({ field, value })
    return this
  }

  insert(rows) {
    this.mode = 'insert'
    this.payload = Array.isArray(rows) ? rows : [rows]
    return this
  }

  update(values) {
    this.mode = 'update'
    this.payload = values
    return this
  }

  delete() {
    this.mode = 'delete'
    return this
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject)
  }

  async execute() {
    if (!db) {
      return {
        data: null,
        error: makeError('Firebase is not configured. Add your Firebase web app keys to .env.local.'),
        status: 500
      }
    }

    try {
      if (this.mode === 'insert') return await this.executeInsert()
      if (this.mode === 'update') return await this.executeUpdate()
      if (this.mode === 'delete') return await this.executeDelete()
      return await this.executeSelect()
    } catch (error) {
      return {
        data: null,
        error: {
          code: error.code || 'FIREBASE_ERROR',
          message: error.message || 'Firebase request failed',
          details: null,
          hint: null
        },
        status: 500
      }
    }
  }

  tableRef() {
    return collection(db, this.table)
  }

  buildQuery() {
    const constraints = this.filters.map(filter => where(filter.field, '==', filter.value))
    return constraints.length ? query(this.tableRef(), ...constraints) : this.tableRef()
  }

  async executeSelect() {
    const snapshot = await getDocs(this.buildQuery())
    return { data: snapshot.docs.map(normalizeDoc), error: null, status: 200 }
  }

  async executeInsert() {
    const inserted = []
    for (const row of this.payload) {
      const record = normalizeInsert(row)
      await addDoc(this.tableRef(), record)
      inserted.push(record)
    }
    return { data: inserted, error: null, status: 201 }
  }

  async matchingDocs() {
    const snapshot = await getDocs(this.buildQuery())
    return snapshot.docs
  }

  async executeUpdate() {
    const docs = await this.matchingDocs()
    for (const item of docs) {
      await updateDoc(doc(db, this.table, item.id), this.payload)
    }
    return { data: docs.map(normalizeDoc).map(row => ({ ...row, ...this.payload })), error: null, status: 200 }
  }

  async executeDelete() {
    const docs = await this.matchingDocs()
    for (const item of docs) {
      await deleteDoc(doc(db, this.table, item.id))
    }
    return { data: docs.map(normalizeDoc), error: null, status: 200 }
  }
}

export const supabase = {
  from(table) {
    return new FirebaseQuery(table)
  }
}
