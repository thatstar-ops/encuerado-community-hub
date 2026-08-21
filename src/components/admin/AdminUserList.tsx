'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  createAdminUser,
  updateAdminUser,
  deactivateAdminUser,
  reactivateAdminUser,
} from '@/lib/admin-user-actions'

type AdminUser = {
  id: string
  name: string
  email: string
  role: 'SUPER_ADMIN' | 'ADMIN' | 'CHECK_IN' | 'VOTING'
  isActive: boolean
  createdAt: Date
  lastLoginAt: Date | null
}

export default function AdminUserList({
  admins,
  currentAdminId,
}: {
  admins: AdminUser[]
  currentAdminId: string
}) {
  const router = useRouter()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const activeSuperCount = admins.filter((a) => a.role === 'SUPER_ADMIN' && a.isActive).length

  const canDeactivate = (admin: AdminUser) => {
    if (admin.role !== 'SUPER_ADMIN') return true
    if (admin.id === currentAdminId && activeSuperCount === 1) return false
    return true
  }

  const handleAction = async (action: () => Promise<void>) => {
    setError(null); setSuccess(null)
    try {
      await action()
      setSuccess('Action completed successfully.')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }

  const inputClass = 'rounded-lg border border-[#3A1215] bg-[#151111] p-3 text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none'

  return (
    <div className="mt-8">
      {error && <div className="mb-4 rounded-lg border border-red-500 bg-red-900 p-4 text-red-100">{error}</div>}
      {success && <div className="mb-4 rounded-lg border border-green-500 bg-green-900 p-4 text-green-100">{success}</div>}

      <button onClick={() => setShowCreate(!showCreate)} className="mb-4 rounded-lg bg-[#B11218] px-4 py-2 font-bold text-white hover:bg-[#D11A22]">
        + Create Admin
      </button>

      {showCreate && (
        <div className="mb-6 rounded-xl border border-[#3A1215] bg-[#151111] p-6">
          <h2 className="text-xl font-bold text-white">Create New Admin</h2>
          <form action={async (formData) => { await handleAction(() => createAdminUser(formData)); setShowCreate(false) }} className="mt-4 grid gap-4">
            <input name="name" placeholder="Name" required className={inputClass} />
            <input name="email" type="email" placeholder="Email" required className={inputClass} />
            <input name="password" type="password" placeholder="Password (min 8 chars)" required minLength={8} className={inputClass} />
            <select name="role" className={inputClass}>
              <option value="ADMIN">Admin</option>
              <option value="SUPER_ADMIN">Super Admin</option>
              <option value="CHECK_IN">Check-in Admin</option>
              <option value="VOTING">Voting Booth</option>
            </select>
            <button type="submit" className="rounded-lg bg-[#B11218] px-4 py-2 font-bold text-white hover:bg-[#D11A22]">Create</button>
          </form>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-[#2A0E10]">
        <table className="w-full text-left">
          <thead className="bg-[#151111]">
            <tr>
              <th className="p-4 font-bold text-white">Name</th>
              <th className="p-4 font-bold text-white">Email</th>
              <th className="p-4 font-bold text-white">Role</th>
              <th className="p-4 font-bold text-white">Status</th>
              <th className="p-4 font-bold text-white">Actions</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((admin) => (
              <tr key={admin.id} className="border-t border-[#2A0E10]">
                <td className="p-4 text-white">{admin.name}</td>
                <td className="p-4 text-white">{admin.email}</td>
                <td className="p-4 text-white">{admin.role}</td>
                <td className="p-4">
                  <span className={`rounded-full px-2 py-1 text-xs font-bold ${admin.isActive ? 'bg-green-800 text-green-200' : 'bg-red-800 text-red-200'}`}>
                    {admin.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="p-4">
                  {editingId === admin.id ? (
                    <form action={async (formData) => { await handleAction(() => updateAdminUser(formData)); setEditingId(null) }} className="flex flex-wrap gap-2">
                      <input type="hidden" name="id" value={admin.id} />
                      <input name="name" defaultValue={admin.name} className="w-24 rounded border border-[#3A1215] bg-[#0B0B0B] p-1 text-xs text-white" />
                      <input name="email" defaultValue={admin.email} className="w-28 rounded border border-[#3A1215] bg-[#0B0B0B] p-1 text-xs text-white" />
                      <select name="role" defaultValue={admin.role} className="rounded border border-[#3A1215] bg-[#0B0B0B] p-1 text-xs text-white">
                        <option value="ADMIN">Admin</option>
                        <option value="SUPER_ADMIN">Super Admin</option>
                        <option value="CHECK_IN">Check-in Admin</option>
                        <option value="VOTING">Voting Booth</option>
                      </select>
                      <button type="submit" className="rounded bg-[#B11218] px-2 py-1 text-xs font-bold text-white hover:bg-[#D11A22]">Save</button>
                      <button type="button" onClick={() => setEditingId(null)} className="rounded bg-[#3A1215] px-2 py-1 text-xs text-white hover:bg-slate-500">Cancel</button>
                    </form>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => setEditingId(admin.id)} className="rounded border border-[#B11218] px-3 py-1 text-xs font-medium text-[#B11218] hover:bg-[#B11218] hover:text-white">Edit</button>
                      <Link
                        href={`/admin/admin-users/${admin.id}/reset-password`}
                        className="rounded border border-blue-400 px-3 py-1 text-xs font-medium text-blue-300 hover:bg-blue-400 hover:text-white"
                      >
                        Reset PW
                      </Link>
                      {admin.isActive ? (
                        <button
                          onClick={() => {
                            if (!canDeactivate(admin)) return
                            if (!confirm('Deactivate this admin? This will prevent login.')) return
                            handleAction(() => deactivateAdminUser(admin.id))
                          }}
                          disabled={!canDeactivate(admin)}
                          className={`rounded border border-[#B11218] px-3 py-1 text-xs font-medium ${canDeactivate(admin) ? 'text-[#FFB3B6] hover:bg-[#B11218] hover:text-white' : 'cursor-not-allowed text-red-700 opacity-50'}`}
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button onClick={() => handleAction(() => reactivateAdminUser(admin.id))} className="rounded border border-green-400 px-3 py-1 text-xs font-medium text-green-300 hover:bg-green-400 hover:text-white">Reactivate</button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
