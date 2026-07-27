'use client'

import { useState } from 'react'

const inputClass =
  'rounded-lg border border-[#3A1215] bg-[#151111] p-3 text-white placeholder:text-[#777777] focus:border-[#B11218] focus:outline-none'

export default function EventImageUrlField({
  defaultValue = '',
}: {
  defaultValue?: string | null
}) {
  const [value, setValue] = useState(defaultValue || '')

  const trimmed = value.trim()
  const canPreview =
    trimmed.startsWith('http://') || trimmed.startsWith('https://')

  return (
    <div className="grid gap-2 rounded-xl border border-[#2A0E10] bg-black p-4">
      <label className="grid gap-2">
        <span className="text-base font-bold text-white">Event Image URL</span>
        <input
          name="flyerImageUrl"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="https://example.com/event-flyer.jpg"
          className={inputClass}
        />
      </label>

      <p className="text-sm text-[#8F8F8F]">
        Paste an image URL from the Encuerado site, Weebly, or another hosted image.
      </p>

      {value && (
        <button
          type="button"
          onClick={() => setValue('')}
          className="w-fit rounded border border-[#6E0D12] px-3 py-2 text-sm font-bold text-white hover:bg-[#151111]"
        >
          Remove image
        </button>
      )}

      {canPreview && (
        <div className="mt-2 overflow-hidden rounded-lg border border-[#2A0E10] bg-[#0B0B0B]">
          <div className="border-b border-[#2A0E10] px-3 py-2 text-sm font-bold text-[#B7B7B7]">
            Preview
          </div>
          <img
            src={trimmed}
            alt="Event image preview"
            className="max-h-96 w-full object-contain"
          />
        </div>
      )}
    </div>
  )
}