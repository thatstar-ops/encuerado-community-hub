import type { ReactNode } from 'react'

type WebsiteSectionProps = {
  eyebrow?: string
  title: string
  description?: string
  children?: ReactNode
  className?: string
  contentClassName?: string
}

export default function WebsiteSection({
  eyebrow,
  title,
  description,
  children,
  className = '',
  contentClassName = '',
}: WebsiteSectionProps) {
  return (
    <section className={`px-6 py-14 ${className}`}>
      <div className={`mx-auto max-w-7xl ${contentClassName}`}>
        <div className="max-w-3xl">
          {eyebrow && (
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#B11218]">
              {eyebrow}
            </p>
          )}
          <h2 className="mt-3 text-3xl font-bold text-white md:text-4xl">
            {title}
          </h2>
          {description && (
            <p className="mt-4 text-lg leading-8 text-[#B7B7B7]">
              {description}
            </p>
          )}
        </div>

        {children ? <div className="mt-8">{children}</div> : null}
      </div>
    </section>
  )
}
