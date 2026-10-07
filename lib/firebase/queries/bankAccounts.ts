import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { BankAccount } from '@/types'

function parseDate(val: unknown): Date {
  if (!val) return new Date()
  if (val instanceof Date) return val
  if (typeof val === 'object' && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate()
  }
  const parsed = new Date(String(val))
  return isNaN(parsed.getTime()) ? new Date() : parsed
}

/**
 * Subscribe to all bank accounts in real time.
 * Filters out soft-deleted accounts and sorts default first, then active.
 */
export function subscribeToBankAccounts(
  callback: (accounts: BankAccount[]) => void
): () => void {
  const colRef = collection(db, 'bankAccounts')

  return onSnapshot(
    colRef,
    (snapshot) => {
      const accounts: BankAccount[] = snapshot.docs
        .map((d) => {
          const data = d.data()
          return {
            bankAccountId: d.id,
            bankName: data.bankName || 'Bank',
            accountHolder: data.accountHolder || '',
            nickname: data.nickname || data.bankName || 'Account',
            accountNumberMasked: data.accountNumberMasked || '',
            upiId: data.upiId || '',
            ifsc: data.ifsc || '',
            isDefault: Boolean(data.isDefault),
            isActive: data.isActive !== false,
            openingBalance: Number(data.openingBalance) || 0,
            createdAt: parseDate(data.createdAt),
            updatedAt: parseDate(data.updatedAt),
            isDeleted: Boolean(data.isDeleted),
          }
        })
        .filter((acc) => !acc.isDeleted)

      // Sort: Default first, then Active, then by Nickname
      accounts.sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1
        if (!a.isDefault && b.isDefault) return 1
        if (a.isActive && !b.isActive) return -1
        if (!a.isActive && b.isActive) return 1
        return a.nickname.localeCompare(b.nickname)
      })

      callback(accounts)
    },
    (err) => {
      console.warn('[BankAccounts] Subscription warning:', err)
      callback([])
    }
  )
}

/**
 * Creates a new BankAccount document.
 * If set as default, removes default flag from other bank accounts.
 */
export async function createBankAccount(
  data: {
    bankName: string
    accountHolder: string
    nickname: string
    accountNumberMasked: string
    upiId?: string
    ifsc?: string
    isDefault?: boolean
    isActive?: boolean
    openingBalance?: number
  },
  createdBy: string
): Promise<string> {
  const colRef = collection(db, 'bankAccounts')
  const newDoc = doc(colRef)

  // If this account is default, unset others first
  if (data.isDefault) {
    try {
      const existingSnap = await getDocs(colRef)
      for (const d of existingSnap.docs) {
        if (d.data().isDefault) {
          await updateDoc(d.ref, { isDefault: false, updatedAt: serverTimestamp() })
        }
      }
    } catch (err) {
      console.warn('[BankAccounts] Could not unset previous default flags:', err)
    }
  }

  await setDoc(newDoc, {
    bankAccountId: newDoc.id,
    bankName: data.bankName.trim(),
    accountHolder: data.accountHolder.trim(),
    nickname: data.nickname.trim() || data.bankName.trim(),
    accountNumberMasked: data.accountNumberMasked.trim(),
    upiId: data.upiId?.trim() || '',
    ifsc: data.ifsc?.trim() || '',
    isDefault: Boolean(data.isDefault),
    isActive: data.isActive !== false,
    openingBalance: Number(data.openingBalance) || 0,
    createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return newDoc.id
}

/**
 * Updates an existing BankAccount.
 */
export async function updateBankAccount(
  bankAccountId: string,
  updates: Partial<Omit<BankAccount, 'bankAccountId' | 'createdAt'>>,
  updatedBy: string
): Promise<void> {
  const docRef = doc(db, 'bankAccounts', bankAccountId)

  if (updates.isDefault) {
    try {
      const colRef = collection(db, 'bankAccounts')
      const existingSnap = await getDocs(colRef)
      for (const d of existingSnap.docs) {
        if (d.id !== bankAccountId && d.data().isDefault) {
          await updateDoc(d.ref, { isDefault: false, updatedAt: serverTimestamp() })
        }
      }
    } catch (err) {
      console.warn('[BankAccounts] Could not unset previous default flags on update:', err)
    }
  }

  const payload: Record<string, unknown> = {
    ...updates,
    updatedBy,
    updatedAt: serverTimestamp(),
  }

  await updateDoc(docRef, payload)
}

/**
 * Soft deletes a bank account.
 */
export async function deleteBankAccount(
  bankAccountId: string,
  updatedBy: string
): Promise<void> {
  const docRef = doc(db, 'bankAccounts', bankAccountId)
  await updateDoc(docRef, {
    isDeleted: true,
    updatedBy,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Previously seeded mock bank accounts.
 * Disabled: Bank accounts must be explicitly created by users/admins and not seeded with mock data.
 */
export async function seedDefaultBankAccountsIfEmpty(_adminUid: string = 'system'): Promise<void> {
  // No-op: Do not auto-seed dummy bank accounts.
  return Promise.resolve()
}
