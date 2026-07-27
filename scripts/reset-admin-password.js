const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')
const readline = require('readline')

const prisma = new PrismaClient()

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve))
}

async function main() {
  const email = String(await ask('Admin email to reset: ')).trim().toLowerCase()
  const password = String(await ask('New password: '))

  if (!email || !email.includes('@')) {
    throw new Error('Enter a valid email.')
  }

  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters.')
  }

  const admin = await prisma.adminUser.findFirst({
    where: {
      email: {
        equals: email,
        mode: 'insensitive',
      },
    },
  })

  if (!admin) {
    throw new Error('No admin found with that email.')
  }

  const passwordHash = await bcrypt.hash(password, 12)

  const updated = await prisma.adminUser.update({
    where: { id: admin.id },
    data: {
      passwordHash,
      isActive: true,
    },
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      updatedAt: true,
    },
  })

  console.log('\n✅ Admin password reset complete:')
  console.table([updated])
}

main()
  .catch((error) => {
    console.error('\n❌ Reset failed:', error.message)
    process.exit(1)
  })
  .finally(async () => {
    rl.close()
    await prisma.$disconnect()
  })
