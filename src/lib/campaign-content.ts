export type CampaignBlock =
  | { id: string; type: 'text'; heading?: string; body: string }
  | { id: string; type: 'button'; label: string; url: string }
  | { id: string; type: 'image'; imageUrl: string; altText: string; linkUrl?: string; caption?: string }

const DEFAULT_EMAIL_HEADER_IMAGE_URL = 'https://f5612f3afb86ee00d6f9.cdn6.editmysite.com/uploads/b/f5612f3afb86ee00d6f94e869f6b02c5f39acd4f31bc0bfc033376e5652146dd/encuerado%20latin%20fetish%20weekend_1751482069.png?width=2400&optimize=medium'

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function safeWebsiteUrl(value: string) {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

export function parseCampaignContent(value: unknown): CampaignBlock[] | null {
  if (!Array.isArray(value)) return null

  const blocks: CampaignBlock[] = []

  for (const item of value) {
    if (!item || typeof item !== 'object') return null

    const block = item as Record<string, unknown>

    if (typeof block.id !== 'string' || typeof block.type !== 'string') return null

    if (
      block.type === 'text' &&
      typeof block.body === 'string' &&
      (typeof block.heading === 'string' || block.heading === undefined)
    ) {
      blocks.push({
        id: block.id,
        type: 'text',
        heading: block.heading as string | undefined,
        body: block.body,
      })
    }

    if (
      block.type === 'button' &&
      typeof block.label === 'string' &&
      typeof block.url === 'string'
    ) {
      blocks.push({
        id: block.id,
        type: 'button',
        label: block.label,
        url: block.url,
      })
    }

    if (
      block.type === 'image' &&
      typeof block.imageUrl === 'string' &&
      typeof block.altText === 'string' &&
      (typeof block.linkUrl === 'string' || block.linkUrl === undefined) &&
      (typeof block.caption === 'string' || block.caption === undefined)
    ) {
      blocks.push({
        id: block.id,
        type: 'image',
        imageUrl: block.imageUrl,
        altText: block.altText,
        linkUrl: block.linkUrl as string | undefined,
        caption: block.caption as string | undefined,
      })
    }
  }

  return blocks
}

export function validateCampaignContent(blocks: CampaignBlock[]) {
  if (!blocks.length) return 'Add at least one content block.'

  for (const block of blocks) {
    if (block.type === 'text' && !block.heading?.trim() && !block.body.trim()) {
      return 'Text blocks cannot be empty.'
    }

    if (block.type === 'button' && (!block.label.trim() || !safeWebsiteUrl(block.url))) {
      return 'Buttons need text and a valid http or https website URL.'
    }

    if (
      block.type === 'image' &&
      (!safeWebsiteUrl(block.imageUrl) ||
        !block.altText.trim() ||
        (block.linkUrl && !safeWebsiteUrl(block.linkUrl)))
    ) {
      return 'Pictures need alternative text and valid http or https URLs.'
    }
  }

  return null
}

function renderEmailShell(inner: string) {
  const headerImageUrl = safeWebsiteUrl(DEFAULT_EMAIL_HEADER_IMAGE_URL)

  const headerImage = headerImageUrl
    ? '<tr>' +
      '<td align="center" bgcolor="#000000" style="padding:0;background-color:#000000;background:#000000;background-image:linear-gradient(#000000,#000000);border-bottom:1px solid #2A0E10;">' +
      '<img src="' +
      headerImageUrl +
      '" alt="Encuerado Latin Fetish Weekend" width="640" style="display:block;width:100%;max-width:640px;height:auto;border:0;outline:none;text-decoration:none;" />' +
      '</td>' +
      '</tr>'
    : ''

  return (
    '<!doctype html>' +
    '<html>' +
    '<head>' +
    '<meta name="color-scheme" content="light only">' +
    '<meta name="supported-color-schemes" content="light only">' +
    '</head>' +
    '<body bgcolor="#000000" style="margin:0;padding:0;background-color:#000000;background:#000000;background-image:linear-gradient(#000000,#000000);color:#FFFFFF;-webkit-text-fill-color:#FFFFFF;">' +
    '<div style="display:none;max-height:0;overflow:hidden;color:#000000;font-size:1px;line-height:1px;">Encuerado Weekend update</div>' +

    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#000000" style="width:100%;margin:0;padding:0;background-color:#000000;background:#000000;background-image:linear-gradient(#000000,#000000);">' +
    '<tr>' +
    '<td align="center" bgcolor="#000000" style="padding:28px 12px;background-color:#000000;background:#000000;background-image:linear-gradient(#000000,#000000);">' +

    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0B0B0B" style="width:100%;max-width:640px;margin:0 auto;background-color:#0B0B0B;background:#0B0B0B;background-image:linear-gradient(#0B0B0B,#0B0B0B);border:1px solid #2A0E10;border-radius:16px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">' +

    headerImage +

    '<tr>' +
    '<td bgcolor="#0B0B0B" style="padding:28px 20px;background-color:#0B0B0B;background:#0B0B0B;background-image:linear-gradient(#0B0B0B,#0B0B0B);">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#111111" style="width:100%;background-color:#111111;background:#111111;background-image:linear-gradient(#111111,#111111);border:1px solid #2A0E10;border-radius:14px;">' +
    '<tr>' +
    '<td bgcolor="#111111" style="padding:30px 26px;background-color:#111111;background:#111111;background-image:linear-gradient(#111111,#111111);color:#FFFFFF;-webkit-text-fill-color:#FFFFFF;">' +
    inner +
    '<hr style="border:0;border-top:1px solid #2A0E10;margin:34px 0 18px;">' +
    '<p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#B7B7B7;-webkit-text-fill-color:#B7B7B7;">You are receiving this email from Encuerado Weekend.</p>' +
    '<p style="margin:0;font-size:12px;line-height:1.6;color:#B7B7B7;-webkit-text-fill-color:#B7B7B7;"><a href="{{unsubscribe_link}}" style="color:#FFFFFF;-webkit-text-fill-color:#FFFFFF;text-decoration:underline;">Unsubscribe</a></p>' +
    '</td>' +
    '</tr>' +
    '</table>' +
    '</td>' +
    '</tr>' +

    '</table>' +
    '</td>' +
    '</tr>' +
    '</table>' +
    '</body>' +
    '</html>'
  )
}

export function renderCampaignHtml(content: unknown, legacyBody: string) {
  const blocks = parseCampaignContent(content)

  if (!blocks) {
    return renderEmailShell(
      '<div style="font-size:16px;line-height:1.75;color:#FFFFFF;-webkit-text-fill-color:#FFFFFF;">' + legacyBody + '</div>'
    )
  }

  const inner = blocks
    .map((block) => {
      if (block.type === 'text') {
        return (
          '<section style="margin:0 0 30px;">' +
          (block.heading?.trim()
            ? '<h2 style="margin:0 0 16px;font-family:Impact,Arial Black,Helvetica,Arial,sans-serif;font-size:32px;line-height:1.1;letter-spacing:1px;color:#FFFFFF;-webkit-text-fill-color:#FFFFFF;text-transform:uppercase;border-left:6px solid #B11218;padding-left:14px;">' +
              escapeHtml(block.heading) +
              '</h2>'
            : '') +
          '<div style="font-size:17px;line-height:1.75;color:#FFFFFF;-webkit-text-fill-color:#FFFFFF;white-space:pre-line;">' +
          escapeHtml(block.body) +
          '</div>' +
          '</section>'
        )
      }

      if (block.type === 'button') {
        return (
          '<p style="margin:0 0 30px;text-align:left;">' +
          '<a href="' +
          safeWebsiteUrl(block.url) +
          '" style="display:inline-block;background-color:#B11218;background:#B11218;background-image:linear-gradient(#B11218,#B11218);color:#FFFFFF;-webkit-text-fill-color:#FFFFFF;padding:15px 24px;border-radius:8px;font-family:Impact,Arial Black,Helvetica,Arial,sans-serif;font-size:17px;font-weight:900;letter-spacing:1px;text-decoration:none;text-transform:uppercase;border:1px solid #6E0D12;">' +
          escapeHtml(block.label) +
          '</a>' +
          '</p>'
        )
      }

      const image =
        '<img src="' +
        safeWebsiteUrl(block.imageUrl) +
        '" alt="' +
        escapeHtml(block.altText) +
        '" style="display:block;width:100%;max-width:100%;height:auto;border:0;border-radius:10px;" />'

      return (
        '<figure style="margin:0 0 30px;">' +
        (block.linkUrl
          ? '<a href="' + safeWebsiteUrl(block.linkUrl) + '">' + image + '</a>'
          : image) +
        (block.caption?.trim()
          ? '<figcaption style="margin-top:10px;color:#B7B7B7;-webkit-text-fill-color:#B7B7B7;font-size:14px;line-height:1.5;">' +
            escapeHtml(block.caption) +
            '</figcaption>'
          : '') +
        '</figure>'
      )
    })
    .join('')

  return renderEmailShell(inner)
}