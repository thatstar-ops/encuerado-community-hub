import { prisma } from '../src/lib/prisma'

async function promoteFirstAdmin() {
  const firstAdmin = await prisma.adminUser.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!firstAdmin) { console.log('No admin user found. Skipping promotion.'); return }
  await prisma.adminUser.update({ where: { id: firstAdmin.id }, data: { role: 'SUPER_ADMIN', isActive: true } })
  console.log(`✅ Promoted ${firstAdmin.email} to SUPER_ADMIN`)
}

promoteFirstAdmin().catch(console.error).finally(() => prisma.$disconnect())
